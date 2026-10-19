import { parseBody, parseParams, route } from "@/server/http/route";
import { idParamSchema, updateUserSchema } from "@/server/modules/admin/admin.schemas";
import { deleteUser, setUserDisabled } from "@/server/modules/admin/admin.service";
import { adminOnly } from "../../_shared";

type Params = { id: string };

/** Block / unblock. */
export const PUT = route<Params>(adminOnly, async ({ req, params, user }) => {
  const { id } = parseParams(params, idParamSchema);
  const { disabled } = await parseBody(req, updateUserSchema);
  return setUserDisabled(user.id, id, disabled);
});

export const DELETE = route<Params>(adminOnly, ({ params, user }) =>
  deleteUser(user.id, parseParams(params, idParamSchema).id),
);
