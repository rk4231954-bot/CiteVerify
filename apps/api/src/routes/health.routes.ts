import { Hono } from "hono";
import * as health from "../controllers/health.controller.ts";

export const healthRoutes = new Hono().get("/", ...health.getHealth);
