import { cx } from "@/utils/cx";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: "brand" | "success" | "error";
  className?: string;
}

export const Sparkline = ({ data, width = 80, height = 24, color = "brand", className }: SparklineProps) => {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });

  const colorClasses = {
    brand: "text-fg-brand-primary",
    success: "text-fg-success-primary",
    error: "text-fg-error-primary",
  };

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cx(colorClasses[color], className)}
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(" ")}
      />
    </svg>
  );
};
