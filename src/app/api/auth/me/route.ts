import { rateLimits } from "@/server/http/rate-limit";
import { parseBody, route } from "@/server/http/route";
import { updateProfileSchema } from "@/server/modules/auth/auth.schemas";
import { getProfile, updateProfile } from "@/server/modules/auth/auth.service";

/** Current user's profile (any role). */
export const GET = route({ auth: "any", rateLimit: rateLimits.auth }, ({ user }) => getProfile(user.id));

export const PUT = route({ auth: "any", rateLimit: rateLimits.auth }, async ({ req, user }) => {
  await updateProfile(user.id, await parseBody(req, updateProfileSchema));
  return { message: "Profile updated successfully" };
});
