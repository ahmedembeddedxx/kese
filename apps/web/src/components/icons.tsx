// A small, consistent line-icon set (24px grid, 1.8 stroke, round caps).
// Inline SVG so there is no icon font to load and every glyph inherits
// `currentColor`. Decorative: the parent button carries the accessible name.

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 24, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const FlipCameraIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.2-1.6A1.5 1.5 0 0 1 10.4 4h3.2a1.5 1.5 0 0 1 1.2.4L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
    <path d="M9.5 12.5a2.7 2.7 0 0 1 4.6-1.4M14.5 12.5a2.7 2.7 0 0 1-4.6 1.4" />
    <path d="M14.2 9.6v1.6h-1.6M9.8 15.4v-1.6h1.6" />
  </Icon>
);

export const ScreenShareIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4.5" width="18" height="12" rx="2.2" />
    <path d="M8 20h8M12 16.5V20" />
    <path d="M12 13.5V8.8M9.8 10.9 12 8.7l2.2 2.2" />
  </Icon>
);

export const TorchIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Icon {...p}>
    <path d="M7 3h10l-1.6 5H8.6z" fill={filled ? "currentColor" : "none"} />
    <path d="M9 8h6v11.5a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 19.5z" />
    <path d="M12 12v3" />
  </Icon>
);

export const MicIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
  </Icon>
);

export const MicOffIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 9V6a3 3 0 0 1 5.6-1.5M15 10v1a3 3 0 0 1-4.6 2.5" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 10.2 5.3M18.5 11.5a6.4 6.4 0 0 1-.5 2.4M12 18v3" />
    <path d="m4 4 16 16" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);

export const ChevronIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);

export const BoltIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 3 5 13.5h6L10 21l8-10.5h-6z" />
  </Icon>
);

export const SnowflakeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" />
    <path d="m9.5 4.8 2.5 2 2.5-2M9.5 19.2l2.5-2 2.5 2" />
  </Icon>
);

export const CarIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 16.5V13l1.6-4.2A2 2 0 0 1 8.5 7.5h7a2 2 0 0 1 1.9 1.3L19 13v3.5" />
    <path d="M3.5 13h17M5 16.5v2a1 1 0 0 0 1 1h1.5a1 1 0 0 0 1-1v-2M15.5 16.5v2a1 1 0 0 0 1 1H18a1 1 0 0 0 1-1v-2" />
    <circle cx="8" cy="13" r=".6" fill="currentColor" />
    <circle cx="16" cy="13" r=".6" fill="currentColor" />
  </Icon>
);

export const SparkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.1 10.2 12.6 4.5 10.8 10.2 9z" />
    <path d="M18.5 3.5v3M17 5h3" />
  </Icon>
);

export const ThumbUpIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.5 10.5V20H5a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1zM7.5 10.5l3.2-6.2a1.6 1.6 0 0 1 3 .9l-.6 3.8h5a1.8 1.8 0 0 1 1.8 2.1l-1.1 6.6a2 2 0 0 1-2 1.7H7.5" />
  </Icon>
);

export const ThumbDownIcon = (p: IconProps) => (
  <Icon {...p} style={{ transform: "scaleY(-1)", ...p.style }}>
    <path d="M7.5 10.5V20H5a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1zM7.5 10.5l3.2-6.2a1.6 1.6 0 0 1 3 .9l-.6 3.8h5a1.8 1.8 0 0 1 1.8 2.1l-1.1 6.6a2 2 0 0 1-2 1.7H7.5" />
  </Icon>
);

export const ShieldIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5 5 6v5.5c0 4.2 2.8 7.4 7 9 4.2-1.6 7-4.8 7-9V6z" />
    <path d="m9 12 2.2 2.2L15.2 10" />
  </Icon>
);

export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2.2" />
    <circle cx="9" cy="17" r="2.2" />
  </Icon>
);

export const PlayIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
  </Icon>
);
