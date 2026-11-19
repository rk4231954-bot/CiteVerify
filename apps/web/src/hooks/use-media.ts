import { useSyncExternalStore } from "react";

function useMedia(query: string, fallback = false): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => fallback,
  );
}

export const useReducedMotion = () =>
  useMedia("(prefers-reduced-motion: reduce)");
export const useIsDesktop = () => useMedia("(min-width: 1024px)", true);
