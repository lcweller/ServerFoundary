import type { SVGProps } from "react";

/**
 * Hexmesh icon set — stroke-based, 16/18/20px. Consistent 1.6 stroke, round
 * caps / joins. Ported from the serverdashboard/Hexmesh.html reference so
 * the visual language across the app matches the spec exactly.
 */
function makeIcon(name: string, body: React.ReactNode) {
  const Comp = ({
    size = 16,
    className,
    ...rest
  }: { size?: number } & SVGProps<SVGSVGElement>) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: "block", flexShrink: 0 }}
      {...rest}
    >
      {body}
    </svg>
  );
  Comp.displayName = `HxIcon.${name}`;
  return Comp;
}

export const HxIcon = {
  dashboard: makeIcon("dashboard", 
    <>
      <rect x="3" y="3" width="7" height="9" />
      <rect x="14" y="3" width="7" height="5" />
      <rect x="14" y="12" width="7" height="9" />
      <rect x="3" y="16" width="7" height="5" />
    </>,
  ),
  hosts: makeIcon("hosts", 
    <>
      <rect x="3" y="4" width="18" height="6" rx="1" />
      <rect x="3" y="14" width="18" height="6" rx="1" />
      <circle cx="7" cy="7" r="0.5" fill="currentColor" />
      <circle cx="7" cy="17" r="0.5" fill="currentColor" />
    </>,
  ),
  servers: makeIcon("servers", 
    <>
      <path d="M6 3h12l3 5v13H3V8l3-5z" />
      <path d="M3 8h18" />
      <path d="M8 12h.01M12 12h4" />
    </>,
  ),
  deploy: makeIcon("deploy", 
    <>
      <path d="M12 2l4 8h-3v8h-2v-8H8l4-8z" />
      <path d="M5 20h14" />
    </>,
  ),
  logs: makeIcon("logs", <path d="M4 6h16M4 12h16M4 18h10" />),
  terminal: makeIcon("terminal", 
    <>
      <path d="M4 6l4 4-4 4M10 16h10" />
      <rect x="2" y="3" width="20" height="18" rx="2" />
    </>,
  ),
  backups: makeIcon("backups", 
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </>,
  ),
  bell: makeIcon("bell", 
    <>
      <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 01-3.4 0" />
    </>,
  ),
  settings: makeIcon("settings", 
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51h0a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </>,
  ),
  cpu: makeIcon("cpu", 
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
    </>,
  ),
  memory: makeIcon("memory", 
    <>
      <rect x="2" y="6" width="20" height="12" rx="1" />
      <path d="M6 10v4M10 10v4M14 10v4M18 10v4" />
    </>,
  ),
  disk: makeIcon("disk", 
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="3" />
    </>,
  ),
  net: makeIcon("net", <path d="M5 12h14M5 12l4-4M5 12l4 4M19 12l-4-4M19 12l-4 4" />),
  temp: makeIcon("temp", <path d="M14 14.76V3.5a2.5 2.5 0 00-5 0v11.26a4 4 0 105 0z" />),
  chevron: makeIcon("chevron", <path d="M9 18l6-6-6-6" />),
  chevronDown: makeIcon("chevronDown", <path d="M6 9l6 6 6-6" />),
  check: makeIcon("check", <path d="M20 6L9 17l-5-5" />),
  x: makeIcon("x", <path d="M18 6L6 18M6 6l12 12" />),
  plus: makeIcon("plus", <path d="M12 5v14M5 12h14" />),
  search: makeIcon("search", 
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </>,
  ),
  copy: makeIcon("copy", 
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </>,
  ),
  play: makeIcon("play", <path d="M8 5l12 7-12 7V5z" fill="currentColor" />),
  pause: makeIcon("pause", 
    <>
      <rect x="6" y="5" width="4" height="14" />
      <rect x="14" y="5" width="4" height="14" />
    </>,
  ),
  stop: makeIcon("stop", <rect x="5" y="5" width="14" height="14" rx="1" />),
  restart: makeIcon("restart", 
    <>
      <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </>,
  ),
  trash: makeIcon("trash", 
    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />,
  ),
  arrowRight: makeIcon("arrowRight", <path d="M5 12h14M13 5l7 7-7 7" />),
  arrowLeft: makeIcon("arrowLeft", <path d="M19 12H5M12 19l-7-7 7-7" />),
  download: makeIcon("download", 
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />,
  ),
  shield: makeIcon("shield", <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />),
  zap: makeIcon("zap", <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />),
  menu: makeIcon("menu", <path d="M3 12h18M3 6h18M3 18h18" />),
  user: makeIcon("user", 
    <>
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>,
  ),
  logout: makeIcon("logout", 
    <>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </>,
  ),
  globe: makeIcon("globe", 
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
    </>,
  ),
};

export type HxIconName = keyof typeof HxIcon;
