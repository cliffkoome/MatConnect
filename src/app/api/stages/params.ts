import { z } from "zod";
import { id } from "@/server/validation/common";

export const stageParamsSchema = z.object({ stageId: id("Stage ID") });
export type StageParams = { stageId: string };
