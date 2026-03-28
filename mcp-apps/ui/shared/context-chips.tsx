import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "@/shared/icons";
import { useAppContextSafe } from "./app-context";

interface ContextChipsProps {
  warning?: string;
  context_flags?: Array<{ type: string; message: string; detail?: string }>;
  context_line?: string;
  news?: Array<{ title: string; link?: string; source?: string }>;
  trend?: { direction?: string; delta?: string; percent_owned?: number };
  role_change?: { role_changed?: boolean; description?: string };
  compact?: boolean;
}

export function ContextChips({ warning, context_flags, context_line, news, trend, role_change, compact }: ContextChipsProps) {
  var ctx = useAppContextSafe();
  var app = ctx?.app;

  var hasContent = warning || (context_flags && context_flags.length > 0) || context_line
    || (news && news.length > 0) || (trend && trend.direction && trend.direction !== "none")
    || (role_change && role_change.role_changed);
  if (!hasContent) return null;

  function openLink(url: string) {
    if (app && app.openLink) app.openLink(url);
  }

  return (
    <div className={"flex flex-wrap items-center gap-1.5 " + (compact ? "" : "mt-1")}>
      {/* Dealbreaker / Warning flags */}
      {context_flags && context_flags.map(function (f, i) {
        if (f.type === "DEALBREAKER") {
          return <Badge key={i} className="bg-sem-risk text-white text-[10px]">{f.message}</Badge>;
        }
        if (f.type === "WARNING") {
          return <Badge key={i} className="bg-sem-warning text-white text-[10px]">{f.message}</Badge>;
        }
        return null;
      })}

      {/* Warning text */}
      {warning && !context_flags?.some(function (f) { return f.message === warning; }) && (
        <Badge className="bg-sem-warning-subtle border border-sem-warning-border text-sem-warning text-[10px]">{warning}</Badge>
      )}

      {/* Role change */}
      {role_change && role_change.role_changed && role_change.description && (
        <Badge className="bg-sem-info-subtle border border-sem-info-border text-sem-info text-[10px]">{role_change.description}</Badge>
      )}

      {/* Trend */}
      {trend && trend.direction && trend.direction !== "none" && (
        <span className={"text-[10px] font-semibold " + (trend.direction === "added" ? "text-sem-success" : "text-sem-risk")}>
          {trend.direction === "added" ? "\u2191" : "\u2193"}
          {trend.delta ? " " + trend.delta : ""}
          {trend.percent_owned != null ? " \u00B7 " + Math.round(Number(trend.percent_owned)) + "%" : ""}
        </span>
      )}

      {/* Context line (only if no flags already shown) */}
      {context_line && !warning && (!context_flags || context_flags.length === 0) && (
        <span className="text-[10px] text-muted-foreground">{context_line}</span>
      )}

      {/* News headline (first one only in compact mode) */}
      {news && news.length > 0 && !compact && (
        <div className="w-full mt-0.5">
          {news.slice(0, 1).map(function (n, i) {
            var hasLink = n.link && n.link.length > 0;
            return (
              <div key={i} className="flex items-start gap-1">
                {hasLink ? (
                  <button type="button" onClick={function () { openLink(n.link!); }} className="text-left text-[11px] text-muted-foreground hover:text-foreground transition-colors leading-tight group">
                    <span className="group-hover:underline">{n.title}</span>
                    <ExternalLink className="inline h-2.5 w-2.5 ml-0.5 opacity-40 group-hover:opacity-70" />
                  </button>
                ) : (
                  <span className="text-[11px] text-muted-foreground leading-tight">{n.title}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
