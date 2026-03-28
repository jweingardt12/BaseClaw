import { Badge } from "@/components/ui/badge";

interface PhaseBarProps {
  phase?: string;
  week?: number;
  weeks_remaining?: number;
  phase_note?: string;
  urgency?: string;
}

var PHASE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  observation: { bg: "bg-sem-info-subtle border-sem-info-border", text: "text-sem-info", label: "Observation" },
  adjustment: { bg: "bg-sem-success-subtle border-sem-success-border", text: "text-sem-success", label: "Buy-Low Window" },
  midseason: { bg: "bg-muted", text: "text-muted-foreground", label: "Midseason" },
  stretch: { bg: "bg-sem-warning-subtle border-sem-warning-border", text: "text-sem-warning", label: "Stretch Run" },
};

export function PhaseBar({ phase, week, weeks_remaining, phase_note, urgency }: PhaseBarProps) {
  if (!phase) return null;
  var style = PHASE_STYLES[phase] || PHASE_STYLES.midseason;

  return (
    <div className={"rounded-md border px-3 py-2 " + style.bg}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge className={"text-[10px] font-bold border " + style.bg + " " + style.text}>{style.label}</Badge>
          {week && <span className="text-[10px] text-muted-foreground">{"Wk " + week}</span>}
        </div>
        {weeks_remaining != null && (
          <span className={"text-[10px] font-semibold " + (urgency === "high" ? "text-sem-risk" : "text-muted-foreground")}>
            {weeks_remaining + " wk left"}
          </span>
        )}
      </div>
      {phase_note && (
        <p className="text-[11px] text-muted-foreground leading-snug mt-1">{phase_note}</p>
      )}
    </div>
  );
}
