import { createFactory } from "hono/factory";
import { requireAuth } from "../middleware/auth.ts";
import { validate } from "../middleware/validate.ts";
import { authService } from "../services/auth.service.ts";
import type { AppEnv } from "../types/index.ts";
import { ok } from "../utils/response.ts";
import { loginSchema, registerSchema } from "../validators/auth.validator.ts";

const factory = createFactory<AppEnv>();

export const register = factory.createHandlers(
  validate("json", registerSchema),
  async (c) => ok(c, await authService.register(c.req.valid("json")), 201),
);

export const login = factory.createHandlers(
  validate("json", loginSchema),
  async (c) => ok(c, await authService.login(c.req.valid("json"))),
);

export const me = factory.createHandlers(requireAuth, async (c) =>
  ok(c, { user: await authService.me(c.get("userId")) }),
);
