import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * The two Pulse themes in use (decided 4 Oct 2026):
 *   `hybrid` — our LIGHT mode (paper cards, glass in the sidebar and hero). Default.
 *   `dark`   — our DARK mode (glass everywhere over lit navy).
 * The kit's `light` (C′) theme still exists in tokens.css but the app never selects it.
 * Dark is not tied to `prefers-color-scheme` yet: test it on real phones in class first.
 */
export type PulseTheme = "hybrid" | "dark";

const STORAGE_KEY = "pulse-theme";
const THEMES: PulseTheme[] = ["hybrid", "dark"];

function readStored(): PulseTheme | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v && (THEMES as string[]).includes(v) ? (v as PulseTheme) : null;
  } catch {
    return null; // private mode / blocked storage: fall back to the default
  }
}

type Ctx = { theme: PulseTheme; setTheme: (t: PulseTheme) => void; toggleTheme: () => void };
const ThemeContext = createContext<Ctx>({ theme: "hybrid", setTheme: () => {}, toggleTheme: () => {} });

/** Sets <html data-theme> and remembers the viewer's choice (a per-viewer convenience only). */
export function ThemeProvider({ children, initial = "hybrid" }: { children: ReactNode; initial?: PulseTheme }) {
  const [theme, setThemeState] = useState<PulseTheme>(() => (typeof window === "undefined" ? initial : readStored() ?? initial));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = useCallback((t: PulseTheme) => {
    setThemeState(t);
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((t) => {
      const next: PulseTheme = t === "dark" ? "hybrid" : "dark";
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
