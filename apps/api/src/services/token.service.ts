import { sign, verify } from "hono/jwt";
import { env } from "../config/env.ts";
import type { JwtClaims } from "../types/index.ts";
import { Errors } from "../utils/errors.ts";

const ALG = "HS256";

export const tokenService = {
  issue(userId: string): Promise<string> {
    const iat = Math.floor(Date.now() / 1000);
    return sign(
      { sub: userId, iat, exp: iat + env.JWT_EXPIRES_IN },
      env.JWT_SECRET,
      ALG,
    );
  },

  /** Returns the user id, or throws 401 for any invalid/expired token. */
  async verify(token: string): Promise<string> {
    try {
      const payload = (await verify(
        token,
        env.JWT_SECRET,
        ALG,
      )) as Partial<JwtClaims>;
      if (typeof payload.sub !== "string" || !payload.sub)
        throw new Error("missing sub");
      return payload.sub;
    } catch {
      throw Errors.unauthorized("Invalid or expired token");
    }
  },
};
