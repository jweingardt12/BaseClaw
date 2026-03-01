import { cn } from "../lib/utils";

var VARIANT_GRADIENT: Record<string, string> = {
  winning: "gradient-banner-success",
  losing: "gradient-banner-risk",
  tied: "gradient-banner-warning",
  alert: "gradient-banner-risk",
  info: "gradient-banner-info",
  success: "gradient-banner-success",
  gold: "gradient-banner-gold",
  neutral: "gradient-banner-neutral",
};

interface StatusBannerProps {
  text: string;
  subtitle?: string;
  variant?: "winning" | "losing" | "tied" | "alert" | "info" | "success" | "gold" | "neutral";
  className?: string;
}

export function StatusBanner({ text, subtitle, variant = "info", className }: StatusBannerProps) {
  return (
    <div className={cn("gradient-banner", VARIANT_GRADIENT[variant] || VARIANT_GRADIENT.info, className)}>
      <div className="text-2xl-app tracking-wide" style={{ color: "#fff" }}>{text}</div>
      {subtitle && <div className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.82)" }}>{subtitle}</div>}
    </div>
  );
}
