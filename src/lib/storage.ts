import type { StateStorage } from "zustand/middleware";

/**
 * localStorage access that is safe during SSR. Persisted stores only rehydrate
 * after mount (skipHydration), so the server and first client render always
 * agree.
 */
export const safeLocalStorage: StateStorage = {
  getItem: (name) =>
    typeof window === "undefined" ? null : window.localStorage.getItem(name),
  setItem: (name, value) => {
    if (typeof window !== "undefined") window.localStorage.setItem(name, value);
  },
  removeItem: (name) => {
    if (typeof window !== "undefined") window.localStorage.removeItem(name);
  },
};
