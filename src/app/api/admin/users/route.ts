import { json, parseBody, parseQuery, route } from "@/server/http/route";
import { createUserSchema, listUsersQuerySchema } from "@/server/modules/admin/admin.schemas";
import { createUser, listUsers } from "@/server/modules/admin/admin.service";
import { adminOnly } from "../_shared";

export const GET = route(adminOnly, ({ req, user }) => listUsers(user.id, parseQuery(req, listUsersQuerySchema)));

export const POST = route(adminOnly, async ({ req }) => json(await createUser(await parseBody(req, createUserSchema)), 201));
