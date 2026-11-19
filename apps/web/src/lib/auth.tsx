import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ApiError, api, getToken, onUnauthorized, setToken } from "./api.ts";
import { clearQueries } from "./query.ts";
import type { User } from "./types.ts";

/** `unreachable`: a stored session exists but the API could not be reached to validate it. */
type AuthStatus = "checking" | "authenticated" | "anonymous" | "unreachable";

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  /** Set when the session ended because the API rejected the token. */
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Re-validates the stored session (after `unreachable`). */
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>(() =>
    getToken() ? "checking" : "anonymous",
  );
  const [sessionExpired, setSessionExpired] = useState(false);

  const endSession = useCallback((expired: boolean) => {
    setToken(null);
    clearQueries();
    setUser(null);
    setStatus("anonymous");
    setSessionExpired(expired);
  }, []);

  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    if (!getToken()) return;
    setStatus("checking");
    setAttempt((n) => n + 1);
  }, []);

  // Validate a stored token on start-up (and on retry).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs the check on retry.
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    api.auth
      .me()
      .then(({ user }) => {
        if (cancelled) return;
        setUser(user);
        setStatus("authenticated");
      })
      .catch((err) => {
        if (cancelled) return;
        // Keep the token on network errors so a temporarily unreachable API does not log the user out.
        if (err instanceof ApiError && err.isNetwork) {
          setStatus("unreachable");
          return;
        }
        endSession(err instanceof ApiError && err.isAuth);
      });
    return () => {
      cancelled = true;
    };
  }, [endSession, attempt]);

  useEffect(() => onUnauthorized(() => endSession(true)), [endSession]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.auth.login({ email, password });
    setToken(res.token);
    clearQueries();
    setUser(res.user);
    setSessionExpired(false);
    setStatus("authenticated");
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await api.auth.register({ name, email, password });
      setToken(res.token);
      clearQueries();
      setUser(res.user);
      setSessionExpired(false);
      setStatus("authenticated");
    },
    [],
  );

  const logout = useCallback(() => endSession(false), [endSession]);

  const value = useMemo(
    () => ({ status, user, sessionExpired, login, register, logout, retry }),
    [status, user, sessionExpired, login, register, logout, retry],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
