// Round control on the glass layer. 48px hit target (HIG minimum is 44),
// a visible pressed state, and an explicit accessible name because the
// icon alone says nothing to a screen reader.

import type { ButtonHTMLAttributes, ReactNode } from "react";

interface GlassButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string;
  pressed?: boolean;
  tone?: "default" | "danger";
  children: ReactNode;
}

export function GlassButton({
  label,
  pressed,
  tone = "default",
  className = "",
  children,
  ...rest
}: GlassButtonProps) {
  const toneClass =
    tone === "danger"
      ? "bg-[#ff453a]/90 text-white border-transparent"
      : pressed
        ? "bg-white text-black"
        : "glass";
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={`grid size-12 shrink-0 place-items-center rounded-full border transition-transform duration-150 active:scale-90 disabled:opacity-40 ${toneClass} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
