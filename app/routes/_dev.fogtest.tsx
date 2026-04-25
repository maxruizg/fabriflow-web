import type { MetaFunction } from "@remix-run/cloudflare";

/**
 * Diagnostic page. Renders three side-by-side panels with NO Tailwind
 * classes, NO CSS variables, just inline `background:` declarations.
 *   - Pure white (#ffffff)
 *   - Near-white cream (oklch 0.99 0.006 75)
 *   - Slightly darker cream (oklch 0.97 0.008 75)
 * If any of these read as "foggy" or have a translucent gray film, the
 * cause is NOT in our application CSS — it's display-side (color profile,
 * Night Shift, browser dark-mode adapt) or a browser extension.
 */
export const meta: MetaFunction = () => [
  { title: "FogTest — FabriFlow" },
  { name: "robots", content: "noindex" },
];

export default function FogTest() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        fontFamily: "system-ui, sans-serif",
        color: "#000",
      }}
    >
      <div
        style={{
          background: "#ffffff",
          padding: 32,
          borderRight: "1px solid #ccc",
        }}
      >
        <h1 style={{ fontSize: 24, margin: 0 }}>Pure white #fff</h1>
        <p style={{ fontSize: 14, marginTop: 12 }}>
          Inline background:#ffffff. No Tailwind, no CSS variables, no
          color-scheme. If this looks foggy or gray, the cause is NOT our code.
        </p>
        <div
          style={{
            marginTop: 16,
            padding: 12,
            background: "#000",
            color: "#fff",
          }}
        >
          Black box on white — read?
        </div>
      </div>

      <div
        style={{
          background: "oklch(0.99 0.006 75)",
          padding: 32,
          borderRight: "1px solid #ccc",
        }}
      >
        <h1 style={{ fontSize: 24, margin: 0 }}>oklch 0.99 / 0.006</h1>
        <p style={{ fontSize: 14, marginTop: 12 }}>
          Same value as our current `--paper` token, set inline (bypasses
          Tailwind). Should look identical to the white panel left of it,
          with a barely-perceptible warm tint.
        </p>
      </div>

      <div
        style={{
          background: "oklch(0.97 0.008 75)",
          padding: 32,
        }}
      >
        <h1 style={{ fontSize: 24, margin: 0 }}>oklch 0.97 / 0.008</h1>
        <p style={{ fontSize: 14, marginTop: 12 }}>
          One step down — our `--paper-2`. Slightly more visible cream.
        </p>
        <div
          style={{
            marginTop: 16,
            padding: 12,
            background: "oklch(0.6 0.18 40)",
            color: "#fff",
          }}
        >
          Clay swatch (oklch 0.6 / 0.18 / 40°) — does this read as terracotta
          or muddy brown?
        </div>
      </div>
    </div>
  );
}
