import { parseQuery, route } from "@/server/http/route";
import { feedbackQuerySchema } from "@/server/modules/admin/admin.schemas";
import { listFeedback } from "@/server/modules/admin/admin.service";
import { adminOnly } from "../_shared";

export const GET = route(adminOnly, ({ req }) => listFeedback(parseQuery(req, feedbackQuerySchema)));
