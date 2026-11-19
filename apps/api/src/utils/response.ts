import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Success envelope: { success: true, data } */
export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json({ success: true as const, data }, status);
}

/** Error envelope: { success: false, error: { code, message, details? } } */
export function fail(
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  details?: unknown,
) {
  return c.json(
    {
      success: false as const,
      error: { code, message, ...(details === undefined ? {} : { details }) },
    },
    status,
  );
}
