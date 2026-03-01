import { Sparkles } from "@/shared/icons";

interface AiInsightProps {
  recommendation: string | null | undefined;
}

export function AiInsight({ recommendation }: AiInsightProps) {
  if (!recommendation) return null;

  return (
    <div className="glass-card gradient-banner-insight p-3 border-l-4 border-l-primary">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Sparkles size={14} className="text-primary" />
        <span className="app-kicker text-primary" style={{ color: "var(--color-primary)" }}>AI Insight</span>
      </div>
      <p className="text-sm font-semibold" style={{ color: "#fff" }}>{recommendation}</p>
    </div>
  );
}
