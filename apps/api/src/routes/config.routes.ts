import { Hono } from "hono";
import * as config from "../controllers/config.controller.ts";

export const configRoutes = new Hono().get("/", ...config.getConfig);
