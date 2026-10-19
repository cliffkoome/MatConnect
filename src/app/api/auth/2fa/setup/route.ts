import { rateLimits } from "@/server/http/rate-limit";
import { route } from "@/server/http/route";
import { beginTwoFactorSetup } from "@/server/modules/auth/auth.service";

export const POST = route({ auth: "any", rateLimit: rateLimits.auth }, ({ user }) => beginTwoFactorSetup(user.id));
