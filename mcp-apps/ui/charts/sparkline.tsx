import * as React from "react";

/* ── Types ───────────────────────────────────────────── */

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

/* ── Component ───────────────────────────────────────── */

export function Sparkline(props: SparklineProps) {
  var data = props.data || [];
  if (data.length < 2) return null;

  var w = props.width || 100;
  var h = props.height || 30;
  var color = props.color || "var(--color-primary, #3b82f6)";
  var pad = 2;

  var min = Math.min.apply(null, data);
  var max = Math.max.apply(null, data);
  var range = max - min || 1;

  var coords = data.map(function (v, i) {
    var x = pad + (i / (data.length - 1)) * (w - pad * 2);
    var y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return { x: x, y: y };
  });

  var linePoints = coords.map(function (p) { return p.x + "," + p.y; }).join(" ");

  var areaD = "M " + coords[0].x + " " + coords[0].y +
    coords.map(function (p) { return " L " + p.x + " " + p.y; }).join("") +
    " L " + coords[coords.length - 1].x + " " + (h - pad) +
    " L " + coords[0].x + " " + (h - pad) +
    " Z";

  var gradId = "spark-" + w + "-" + h;

  return (
    <svg
      viewBox={"0 0 " + w + " " + h}
      className={props.className}
      style={{ width: w + "px", height: h + "px" }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={"url(#" + gradId + ")"} />
      <polyline
        points={linePoints}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
