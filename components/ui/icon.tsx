import * as React from "react";

import { cn } from "~/lib/utils";

/**
 * The curated FabriFlow icon set. Every icon is drawn at 24x24 with
 * `strokeWidth={1.6}`, `stroke="currentColor"`, `fill="none"` so they
 * inherit the parent's color and scale crisply at any size.
 */
export type IconName =
  | "dash"
  | "orders"
  | "vendors"
  | "pay"
  | "reports"
  | "docs"
  | "settings"
  | "bell"
  | "search"
  | "plus"
  | "upload"
  | "download"
  | "filter"
  | "chev"
  | "chevd"
  | "chevu"
  | "chevl"
  | "check"
  | "x"
  | "arrow"
  | "arrow-up"
  | "arrow-down"
  | "clock"
  | "warn"
  | "file"
  | "eye"
  | "dots"
  | "calendar"
  | "coin"
  | "book"
  | "tag"
  | "split"
  | "globe"
  | "paper"
  | "logout"
  | "menu";

const PATHS: Record<IconName, React.ReactNode> = {
  dash: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </>
  ),
  orders: (
    <>
      <path d="M4 4h12l4 4v12H4z" />
      <path d="M16 4v4h4" />
      <path d="M8 12h8M8 16h5" />
    </>
  ),
  vendors: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="10" r="2.5" />
      <path d="M14 19c0-2.5 1.8-4.5 4-4.5s4 2 4 4.5" />
    </>
  ),
  pay: (
    <>
      <rect x="2" y="6" width="20" height="13" rx="2" />
      <path d="M2 11h20" />
      <path d="M6 15h3" />
    </>
  ),
  reports: (
    <>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 16V10" />
      <path d="M12 16V6" />
      <path d="M16 16v-8" />
    </>
  ),
  docs: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  bell: (
    <>
      <path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  upload: (
    <>
      <path d="M12 16V4M6 10l6-6 6 6" />
      <path d="M4 20h16" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v12M6 10l6 6 6-6" />
      <path d="M4 20h16" />
    </>
  ),
  filter: <path d="M4 5h16M7 12h10M10 19h4" />,
  chev: <path d="M9 6l6 6-6 6" />,
  chevd: <path d="M6 9l6 6 6-6" />,
  chevu: <path d="M6 15l6-6 6 6" />,
  chevl: <path d="M15 6l-6 6 6 6" />,
  check: <path d="M4 12l5 5L20 6" />,
  x: <path d="M6 6l12 12M6 18L18 6" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  "arrow-up": <path d="M12 19V5M5 12l7-7 7 7" />,
  "arrow-down": <path d="M12 5v14M19 12l-7 7-7-7" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  warn: (
    <>
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v5M12 18v0.5" />
    </>
  ),
  file: (
    <>
      <path d="M7 3h8l4 4v14H7z" />
      <path d="M15 3v4h4" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  dots: (
    <>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 15c0 1.5 1.3 2 3 2s3-0.5 3-2-1.5-2-3-2.5S9 12 9 10.5 10.3 8 12 8s3 0.5 3 2" />
      <path d="M12 6v2M12 17v2" />
    </>
  ),
  book: (
    <>
      <path d="M4 4v16l8-3 8 3V4L12 7 4 4z" />
      <path d="M12 7v13" />
    </>
  ),
  tag: (
    <>
      <path d="M2 12V4h8l12 12-8 8z" />
      <circle cx="7" cy="8" r="1.5" />
    </>
  ),
  split: (
    <>
      <path d="M6 4v6a6 6 0 0 0 6 6h6" />
      <path d="M16 12l4 4-4 4" />
      <path d="M18 4v3a3 3 0 0 1-3 3" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
    </>
  ),
  paper: (
    <>
      <path d="M5 3h14v18l-3.5-2-3.5 2-3.5-2L5 21z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>
  ),
  logout: (
    <>
      <path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
};

export interface IconProps extends React.SVGAttributes<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 16, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn("flex-shrink-0", className)}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
