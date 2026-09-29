import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = ({ size = 18, ...rest }: P) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...rest,
});

export const PlayIcon = (p: P) => (
  <svg {...base(p)} stroke="none" fill="currentColor">
    <path d="M7 4.8v14.4c0 .8.9 1.3 1.6.9l11.3-7.2c.6-.4.6-1.4 0-1.8L8.6 3.9C7.9 3.5 7 4 7 4.8Z" />
  </svg>
);

export const PauseIcon = (p: P) => (
  <svg {...base(p)} stroke="none" fill="currentColor">
    <rect x="6" y="4" width="4.2" height="16" rx="1.3" />
    <rect x="13.8" y="4" width="4.2" height="16" rx="1.3" />
  </svg>
);

export const RewindIcon = (p: P) => (
  <svg {...base(p)} stroke="none" fill="currentColor">
    <path d="M11.5 6.3v11.4c0 .7-.8 1.1-1.4.7L2.6 12.7a.9.9 0 0 1 0-1.4l7.5-5.7c.6-.4 1.4 0 1.4.7Z" />
    <path d="M21.5 6.3v11.4c0 .7-.8 1.1-1.4.7l-7.5-5.7a.9.9 0 0 1 0-1.4l7.5-5.7c.6-.4 1.4 0 1.4.7Z" />
  </svg>
);

export const ForwardIcon = (p: P) => (
  <svg {...base(p)} stroke="none" fill="currentColor">
    <path d="M12.5 6.3v11.4c0 .7.8 1.1 1.4.7l7.5-5.7a.9.9 0 0 0 0-1.4l-7.5-5.7c-.6-.4-1.4 0-1.4.7Z" />
    <path d="M2.5 6.3v11.4c0 .7.8 1.1 1.4.7l7.5-5.7a.9.9 0 0 0 0-1.4L3.9 5.6c-.6-.4-1.4 0-1.4.7Z" />
  </svg>
);

export const CloseIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const SearchIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </svg>
);

export const SproutIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 21v-8" />
    <path d="M12 13c0-4 2.7-6.5 7-6.5 0 4.2-2.8 6.5-7 6.5Z" />
    <path d="M12 15c0-3.3-2.3-5.3-6-5.3 0 3.4 2.4 5.3 6 5.3Z" />
  </svg>
);

export const ShuffleIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 7h3.5c2 0 3.2 1 4.2 2.6l2.6 4.8c.9 1.6 2.2 2.6 4.2 2.6H21" />
    <path d="M3 17h3.5c1.4 0 2.4-.5 3.2-1.3M13.8 8.3C14.6 7.5 15.6 7 17 7h4" />
    <path d="m18.5 4.5 2.5 2.5-2.5 2.5M18.5 14.5l2.5 2.5-2.5 2.5" />
  </svg>
);

export const SwapIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 9h13l-3.5-3.5M20 15H7l3.5 3.5" />
  </svg>
);

export const MinusIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 12h12" />
  </svg>
);

export const GripIcon = (p: P) => (
  <svg {...base(p)} stroke="none" fill="currentColor">
    {[7, 12, 17].map((y) => (
      <g key={y}>
        <circle cx="9" cy={y} r="1.4" />
        <circle cx="15" cy={y} r="1.4" />
      </g>
    ))}
  </svg>
);

export const CopyIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
    <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
  </svg>
);

export const DownloadIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14" />
  </svg>
);

export const ExternalIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M14 5h5v5M19 5l-8 8M17 14v4a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 5 18V8.5A1.5 1.5 0 0 1 6.5 7H10" />
  </svg>
);

export const CheckIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

export const ArrowLeftIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M19 12H5m0 0 6-6m-6 6 6 6" />
  </svg>
);

export const SettingsIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="8" cy="17" r="2" />
  </svg>
);

export const CrossfadeIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 17c4 0 5-10 9-10s5 10 9 10" />
    <path d="M3 7c4 0 5 10 9 10s5-10 9-10" opacity=".45" />
  </svg>
);

/** Brand marks for the export destinations (used only to label where a playlist goes). */
export const SpotifyMark = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="12" r="12" fill="#1ED760" />
    <path d="M6.2 9.3c4-1.2 8.5-.8 11.9 1.2M6.9 12.4c3.3-.9 6.9-.6 9.8 1.1M7.5 15.3c2.6-.7 5.3-.4 7.6.9" stroke="#000" strokeWidth="1.6" strokeLinecap="round" fill="none" />
  </svg>
);

export const YouTubeMusicMark = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="12" r="12" fill="#FF0033" />
    <circle cx="12" cy="12" r="6.4" fill="none" stroke="#fff" strokeWidth="1.3" />
    <path d="M10.3 9.4v5.2c0 .3.3.5.6.3l4-2.6c.2-.2.2-.5 0-.6l-4-2.6c-.3-.2-.6 0-.6.3Z" fill="#fff" />
  </svg>
);

export function ArcGlyph({ arc, size = 30 }: { arc: "steady" | "build" | "journey" | "unwind"; size?: number }) {
  const d = {
    steady: "M3 13 C 10 12, 20 14, 27 13",
    build: "M3 18 C 12 18, 18 8, 27 6",
    journey: "M3 16 C 10 15, 14 5, 19 6 S 25 12, 27 12",
    unwind: "M3 6 C 12 6, 18 17, 27 18",
  }[arc];
  return (
    <svg width={size} height={(size * 22) / 30} viewBox="0 0 30 22" aria-hidden fill="none">
      <path d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
