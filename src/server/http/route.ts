import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { authenticate } from "@/server/auth/guard";
import type { AccessClaims } from "@/server/auth/tokens";
import { HttpError, badRequest } from "./errors";
import { clientKeyFrom, rateLimiter, type RateLimitRule } from "./rate-limit";

/**
 * Thin adapter between Next.js route handlers and the feature services.
 *
 *   export const GET = route({ auth: "Admin", rateLimit: rateLimits.admin }, async ({ user }) => …)
 *
 * It applies rate limits, authenticates/authorises, awaits dynamic params, serialises the result
 * as JSON, and maps thrown errors (HttpError, Zod, Prisma) to consistent JSON error responses:
 *   { message: string, errors?: { field, message }[] }
 */

type Params = Record<string, string | string[]>;

export type RouteContext<P extends Params = Params> = {
  req: NextRequest;
  params: P;
  ip: string;
};
export type AuthedRouteContext<P extends Params = Params> = RouteContext<P> & { user: AccessClaims };

type Options = { rateLimit?: RateLimitRule | readonly RateLimitRule[] };
type AuthOptions = Options & { auth: Role | "any" };

type NextHandler<P extends Params> = (req: NextRequest, context: { params: Promise<P> }) => Promise<Response>;

export function route<P extends Params = Params>(
  options: AuthOptions,
  handler: (ctx: AuthedRouteContext<P>) => Promise<unknown>,
): NextHandler<P>;
export function route<P extends Params = Params>(
  options: Options,
  handler: (ctx: RouteContext<P>) => Promise<unknown>,
): NextHandler<P>;
export function route<P extends Params>(
  options: Options & { auth?: Role | "any" },
  handler: (ctx: AuthedRouteContext<P>) => Promise<unknown>,
): NextHandler<P> {
  const rules = options.rateLimit ? ([] as RateLimitRule[]).concat(options.rateLimit) : [];

  return async (req, context) => {
    try {
      const ip = clientKeyFrom(req.headers);
      for (const rule of rules) rateLimiter.hit(rule, ip);

      const params = ((await context?.params) ?? {}) as P;
      const user = options.auth
        ? await authenticate(req.headers, options.auth === "any" ? undefined : options.auth)
        : (null as unknown as AccessClaims);

      const result = await handler({ req, params, ip, user });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function json<T>(data: T, status = 200, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, status });
}

export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown = {};
  const text = await req.text();
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw badRequest("Malformed JSON in request body");
    }
  }
  return schema.parse(raw);
}

export function parseQuery<S extends z.ZodType>(req: NextRequest, schema: S): z.infer<S> {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams));
}

export function parseParams<S extends z.ZodType>(params: unknown, schema: S): z.infer<S> {
  return schema.parse(params);
}

const camel = (snake: string) => snake.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/**
 * Field names from a Prisma unique-constraint error. Handles the classic `meta.target` shape and the
 * driver-adapter shape, where only the index name is known (e.g. `vehicles_car_id_key` → `carId`).
 */
export function uniqueFields(error: Prisma.PrismaClientKnownRequestError): string[] {
  const meta = error.meta as Record<string, unknown> | undefined;
  const target = meta?.target;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === "string") return [target];

  const cause = (meta?.driverAdapterError as { cause?: Record<string, unknown> } | undefined)?.cause;
  const constraint = cause?.constraint as { fields?: unknown; index?: unknown } | undefined;
  if (Array.isArray(constraint?.fields)) return constraint.fields.map((f) => camel(String(f).replaceAll('"', "")));
  if (typeof constraint?.index === "string") {
    const table = typeof cause?.table === "string" ? cause.table : "";
    const column = constraint.index.replace(new RegExp(`^${table}_`), "").replace(/_key$/, "");
    return column ? [camel(column)] : [];
  }
  return [];
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return NextResponse.json(
      { message: error.message, ...(error.errors ? { errors: error.errors } : {}) },
      { status: error.status, headers: error.headers },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        message: "Validation failed",
        errors: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
      },
      { status: 400 },
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002": {
        const fields = uniqueFields(error);
        return NextResponse.json(
          {
            message: fields.length
              ? `A record with this ${fields.join(", ")} already exists.`
              : "A record with these details already exists.",
            errors: fields.map((field) => ({ field, message: `${field} must be unique` })),
          },
          { status: 409 },
        );
      }
      case "P2025":
        return NextResponse.json({ message: "Not found" }, { status: 404 });
      case "P2003":
        return NextResponse.json({ message: "A related record does not exist." }, { status: 400 });
    }
  }

  console.error("[api] unhandled error", error);
  return NextResponse.json({ message: "An unexpected internal server error occurred." }, { status: 500 });
}
