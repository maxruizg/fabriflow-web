import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useFetcher } from "@remix-run/react";

export type Theme = "light" | "dark";
export type Accent = "warm" | "cool" | "olive";
export type Density = "comfortable" | "compact";

export interface ThemePrefs {
  theme: Theme;
  accent: Accent;
  density: Density;
  dottedBg: boolean;
}

interface ThemeContextType {
  prefs: ThemePrefs;
  setTheme: (theme: Theme) => void;
  setAccent: (accent: Accent) => void;
  setDensity: (density: Density) => void;
  setDottedBg: (dottedBg: boolean) => void;
  setPrefs: (next: Partial<ThemePrefs>) => void;
  /** Backwards-compat — returns current theme. */
  theme: Theme;
}

const DEFAULT_PREFS: ThemePrefs = {
  theme: "light",
  accent: "warm",
  density: "comfortable",
  dottedBg: true,
};

const ThemeContext = createContext<ThemeContextType | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
  defaultPrefs?: ThemePrefs;
  /** Backwards-compat — older callers pass `defaultTheme`. */
  defaultTheme?: Theme;
}

export function ThemeProvider({
  children,
  defaultPrefs,
  defaultTheme,
}: ThemeProviderProps) {
  const initial: ThemePrefs = defaultPrefs ?? {
    ...DEFAULT_PREFS,
    theme: defaultTheme ?? DEFAULT_PREFS.theme,
  };

  const [prefs, setPrefsState] = useState<ThemePrefs>(initial);
  const fetcher = useFetcher();

  // Apply prefs to the DOM whenever they change client-side.
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    root.classList.remove("light", "dark");
    root.classList.add(prefs.theme);
    root.setAttribute("data-theme", prefs.theme);
    root.setAttribute("data-accent", prefs.accent);
    root.setAttribute("data-density", prefs.density);
    root.setAttribute("data-dotted-bg", prefs.dottedBg ? "true" : "false");

    if (body) {
      body.classList.toggle("density-compact", prefs.density === "compact");
      body.classList.toggle("theme-cool", prefs.accent === "cool");
      body.classList.toggle("theme-olive", prefs.accent === "olive");
      body.classList.toggle("no-dot-bg", !prefs.dottedBg);
    }
  }, [prefs]);

  const persist = useCallback(
    (next: ThemePrefs) => {
      const fd = new FormData();
      fd.append("theme", next.theme);
      fd.append("accent", next.accent);
      fd.append("density", next.density);
      fd.append("dottedBg", next.dottedBg ? "true" : "false");
      fetcher.submit(fd, { method: "post", action: "/" });
    },
    [fetcher],
  );

  const setPrefs = useCallback(
    (patch: Partial<ThemePrefs>) => {
      setPrefsState((prev) => {
        const next = { ...prev, ...patch };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const value: ThemeContextType = {
    prefs,
    theme: prefs.theme,
    setTheme: (theme) => setPrefs({ theme }),
    setAccent: (accent) => setPrefs({ accent }),
    setDensity: (density) => setPrefs({ density }),
    setDottedBg: (dottedBg) => setPrefs({ dottedBg }),
    setPrefs,
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
