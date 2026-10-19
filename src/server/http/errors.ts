export type FieldError = { field: string; message: string };

/** An error that maps directly to an HTTP response. Thrown from services, caught by `route()`. */
export class HttpError extends Error {
  readonly status: number;
  readonly errors?: FieldError[];
  readonly headers?: Record<string, string>;

  constructor(
    status: number,
    message: string,
    options: { errors?: FieldError[]; headers?: Record<string, string> } = {},
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.errors = options.errors;
    this.headers = options.headers;
  }
}

export const badRequest = (message: string, errors?: FieldError[]) =>
  new HttpError(400, message, { errors });
export const unauthorized = (message = "Not authenticated") => new HttpError(401, message);
export const forbidden = (message = "Forbidden: Insufficient permissions") =>
  new HttpError(403, message);
export const notFound = (message = "Not found") => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);
export const tooManyRequests = (message: string, retryAfterSeconds: number) =>
  new HttpError(429, message, { headers: { "Retry-After": String(retryAfterSeconds) } });
