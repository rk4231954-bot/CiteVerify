import type { ValidationTargets } from "hono";
import { validator } from "hono/validator";
import type { z } from "zod";
import { Errors } from "../utils/errors.ts";

/** Zod-backed request validation; failures become a 400 VALIDATION_ERROR. */
export const validate = <
  Target extends keyof ValidationTargets,
  Schema extends z.ZodType,
>(
  target: Target,
  schema: Schema,
) =>
  validator(target, (value): z.output<Schema> => {
    const result = schema.safeParse(value);
    if (!result.success) {
      throw Errors.validation(
        result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      );
    }
    return result.data;
  });
