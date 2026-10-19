import { rateLimits } from "@/server/http/rate-limit";
import { json, parseBody, route } from "@/server/http/route";
import { registerSchema } from "@/server/modules/auth/auth.schemas";
import { register } from "@/server/modules/auth/auth.service";

export const POST = route({ rateLimit: rateLimits.auth }, async ({ req }) => {
  const user = await register(await parseBody(req, registerSchema));
  return json({ message: "User created successfully", user }, 201);
});
