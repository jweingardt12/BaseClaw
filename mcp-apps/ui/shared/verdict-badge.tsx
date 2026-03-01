import { cn } from "../lib/utils";

var VARIANT_COLORS: Record<string, string> = {
  success: "bg-sem-success badge-glow text-sem-success",
  warning: "bg-sem-warning badge-glow text-sem-warning",
  risk: "bg-sem-risk badge-glow text-sem-risk",
  info: "bg-sem-info badge-glow text-sem-info",
  neutral: "bg-sem-neutral badge-glow text-sem-neutral",
  gold: "bg-primary badge-glow text-primary",
};

var SIZE_MAP: Record<string, string> = {
  sm: "text-xs px-2 py-0.5 min-w-[32px]",
  md: "text-sm px-3 py-1 min-w-[44px]",
  lg: "text-lg px-4 py-1.5 min-w-[56px] font-black",
};

interface VerdictBadgeProps {
  grade: string;
  variant?: "success" | "warning" | "risk" | "info" | "neutral" | "gold";
  size?: "sm" | "md" | "lg";
  className?: string;
}

function gradeToVariant(grade: string): string {
  var g = grade.toUpperCase();
  if (g === "A+" || g === "A" || g === "ELITE" || g === "BUY") return "success";
  if (g === "B+" || g === "B" || g === "GOOD") return "info";
  if (g === "C+" || g === "C" || g === "HOLD" || g === "FAIR") return "warning";
  if (g === "D" || g === "F" || g === "SELL" || g === "BUST" || g === "POOR") return "risk";
  return "neutral";
}

export function VerdictBadge({ grade, variant, size = "md", className }: VerdictBadgeProps) {
  var v = variant || gradeToVariant(grade);
  var colors = VARIANT_COLORS[v] || VARIANT_COLORS.neutral;
  /* Use subtle bg (12% tint) + full text color */
  var bgParts = colors.split(" ");
  var bgClass = bgParts[0] + "-subtle";
  var textClass = bgParts[2] || "text-foreground";

  return (
    <span className={cn(
      "inline-flex items-center justify-center rounded-full font-bold tracking-wide text-center",
      bgClass,
      textClass,
      SIZE_MAP[size] || SIZE_MAP.md,
      className,
    )}>
      {grade}
    </span>
  );
}
