import { Hono } from "hono";
import * as auth from "../controllers/auth.controller.ts";
import type { AppEnv } from "../types/index.ts";

export const authRoutes = new Hono<AppEnv>()
  .post("/register", ...auth.register)
  .post("/login", ...auth.login)
  .get("/me", ...auth.me);
