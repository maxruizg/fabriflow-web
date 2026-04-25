import type { Config } from "tailwindcss";
import animatePlugin from "tailwindcss-animate";

/**
 * shadcn-style color helper that wraps a CSS variable with `oklch(... / <alpha>)`.
 * Variables are stored as space-separated oklch components so Tailwind's
 * opacity modifier syntax (e.g. `bg-primary/90`) keeps working.
 */
const oklchVar = (cssVar: string) => `oklch(var(${cssVar}) / <alpha-value>)`;

export default {
  content: [
    "./app/**/{**,.client,.server}/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./lib/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1440px" },
    },
    extend: {
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        sans: [
          "IBM Plex Sans",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
          "Apple Color Emoji",
          "Segoe UI Emoji",
          "Segoe UI Symbol",
          "Noto Color Emoji",
        ],
        mono: [
          "IBM Plex Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      fontSize: {
        // mono caps used for stat labels and table headers
        "mono-caps": ["10.5px", { letterSpacing: "0.08em", lineHeight: "1.3" }],
      },
      colors: {
        // shadcn surface tokens
        border: oklchVar("--border"),
        input: oklchVar("--input"),
        ring: oklchVar("--ring"),
        background: oklchVar("--background"),
        foreground: oklchVar("--foreground"),
        primary: {
          DEFAULT: oklchVar("--primary"),
          foreground: oklchVar("--primary-foreground"),
        },
        secondary: {
          DEFAULT: oklchVar("--secondary"),
          foreground: oklchVar("--secondary-foreground"),
        },
        destructive: {
          DEFAULT: oklchVar("--destructive"),
          foreground: oklchVar("--destructive-foreground"),
        },
        muted: {
          DEFAULT: oklchVar("--muted"),
          foreground: oklchVar("--muted-foreground"),
        },
        accent: {
          DEFAULT: oklchVar("--accent"),
          foreground: oklchVar("--accent-foreground"),
        },
        popover: {
          DEFAULT: oklchVar("--popover"),
          foreground: oklchVar("--popover-foreground"),
        },
        card: {
          DEFAULT: oklchVar("--card"),
          foreground: oklchVar("--card-foreground"),
        },

        // FabriFlow design system — semantic tones
        paper: {
          DEFAULT: "var(--paper)",
          2: "var(--paper-2)",
          3: "var(--paper-3)",
          4: "var(--paper-4)",
        },
        line: {
          DEFAULT: "var(--line)",
          2: "var(--line-2)",
        },
        ink: {
          DEFAULT: "var(--ink)",
          2: "var(--ink-2)",
          3: "var(--ink-3)",
          4: "var(--ink-4)",
          bg: "var(--ink-bg)",
        },
        clay: {
          DEFAULT: "var(--clay)",
          soft: "var(--clay-soft)",
          deep: "var(--clay-deep)",
        },
        moss: {
          DEFAULT: "var(--moss)",
          soft: "var(--moss-soft)",
          deep: "var(--moss-deep)",
        },
        rust: {
          DEFAULT: "var(--rust)",
          soft: "var(--rust-soft)",
          deep: "var(--rust-deep)",
        },
        wine: {
          DEFAULT: "var(--wine)",
          soft: "var(--wine-soft)",
        },
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "10px",
        xl: "12px",
      },
      boxShadow: {
        "ff-sm": "var(--shadow-sm)",
        ff: "var(--shadow)",
        "ff-lg": "var(--shadow-lg)",
      },
      backgroundImage: {
        "ff-dots": "var(--dot-grid)",
        "ff-stripes":
          "repeating-linear-gradient(45deg, transparent 0 8px, oklch(0.94 0.012 72) 8px 9px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "ff-fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "ff-fade-in": "ff-fade-in 0.18s ease-out",
      },
    },
  },
  plugins: [animatePlugin],
} satisfies Config;
