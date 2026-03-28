import type { ReactNode } from "react";

var ACCENT_COLOR: Record<string, string> = {
  primary: "border-l-emerald-500",
  secondary: "border-l-slate-400",
  success: "border-l-green-500",
  danger: "border-l-red-500",
  warning: "border-l-amber-500",
  info: "border-l-blue-500",
  discovery: "border-l-purple-500",
  caution: "border-l-orange-500",
};

interface StatCardProps {
  label: string;
  value: string | number;
  variant?: "accent" | "default";
  accentColor?: string;
  trend?: { value: number; label: string };
  className?: string;
  children?: ReactNode;
}

export function StatCard({
  label,
  value,
  variant = "default",
  accentColor = "primary",
  trend,
  className,
}: StatCardProps) {
  var borderCls = variant === "accent"
    ? "border-l-2 " + (ACCENT_COLOR[accentColor] || ACCENT_COLOR.primary)
    : "";

  return (
    <div
      className={
        "rounded-lg border border-border bg-card px-3 py-2.5 min-w-0 " + borderCls +
        (className ? " " + className : "")
      }
    >
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold leading-tight tabular-nums mt-0.5">
        {value}
      </div>
      {trend && (
        <div className={
          "text-xs font-medium mt-1 " +
          (trend.value > 0 ? "text-sem-success" : trend.value < 0 ? "text-sem-risk" : "text-muted-foreground")
        }>
          {trend.value > 0 ? "\u2191" : trend.value < 0 ? "\u2193" : ""} {trend.label}
        </div>
      )}
    </div>
  );
}
