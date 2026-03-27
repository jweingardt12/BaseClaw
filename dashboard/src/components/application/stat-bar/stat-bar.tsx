import { cx } from "@/utils/cx";

interface StatBarProps {
  label: string;
  leftValue: string;
  rightValue: string;
  result: "win" | "loss" | "tie";
}

export const StatBar = ({ label, leftValue, rightValue, result }: StatBarProps) => {
  const leftNum = parseFloat(leftValue) || 0;
  const rightNum = parseFloat(rightValue) || 0;
  const total = leftNum + rightNum;
  const leftPct = total > 0 ? (leftNum / total) * 100 : 50;

  return (
    <div className="flex items-center gap-3">
      {/* Left value */}
      <span className={cx(
        "w-14 text-right text-sm tabular-nums",
        result === "win" ? "font-semibold text-success-primary" : result === "loss" ? "text-error-primary" : "text-secondary",
      )}>
        {leftValue || "—"}
      </span>

      {/* Bar */}
      <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-tertiary">
        <div
          className={cx(
            "h-full rounded-l-full transition-all duration-300",
            result === "win"
              ? "bg-success-solid"
              : result === "loss"
                ? "bg-error-solid"
                : "bg-border-brand",
          )}
          style={{ width: `${Math.max(leftPct, 2)}%` }}
        />
      </div>

      {/* Category label */}
      <span className="w-10 text-center text-xs font-medium text-tertiary">{label}</span>

      {/* Bar (right side) */}
      <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-tertiary">
        <div
          className={cx(
            "ml-auto h-full rounded-r-full transition-all duration-300",
            result === "loss"
              ? "bg-success-solid"
              : result === "win"
                ? "bg-error-solid"
                : "bg-border-brand",
          )}
          style={{ width: `${Math.max(100 - leftPct, 2)}%` }}
        />
      </div>

      {/* Right value */}
      <span className={cx(
        "w-14 text-left text-sm tabular-nums",
        result === "loss" ? "font-semibold text-success-primary" : result === "win" ? "text-error-primary" : "text-secondary",
      )}>
        {rightValue || "—"}
      </span>
    </div>
  );
};
