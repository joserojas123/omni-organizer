import type { CSSProperties } from "react";

/**
 * Small outline icons used across Task designer. Line-only, discreet, no fills
 * except where a filled state matters (the favorite star). Sizes/strokes match
 * the Claude Design export.
 */

interface IconProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
}

export function ChevronRight({ size = 14, style, onClick, onMouseDown }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#8a8a83"
      strokeWidth={2}
      style={style}
      onClick={onClick}
      onMouseDown={onMouseDown}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function Star({
  size = 15,
  fill = "none",
  stroke = "#8a8a83",
  onClick,
}: IconProps & { fill?: string; stroke?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={stroke}
      strokeWidth={1.5}
      style={{ cursor: onClick ? "pointer" : undefined }}
      onClick={onClick}
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z" />
    </svg>
  );
}

export function Trash({ size = 15, stroke = "#8a8a83", onClick }: IconProps & { stroke?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={1.5}
      strokeLinecap="round"
      style={{ cursor: onClick ? "pointer" : undefined }}
      onClick={onClick}
    >
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
    </svg>
  );
}

export function Clock({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#b0b0aa" strokeWidth={1.5}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

export function Check({ size = 13, stroke = "#fff" }: IconProps & { stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={2}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function Plus({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#8a8a83" strokeWidth={1.5}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function ArrowRight({ size = 10 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
