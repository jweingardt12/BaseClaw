import { Avatar } from "@/components/base/avatar/avatar";
import { Badge } from "@/components/base/badges/badges";
import { cx } from "@/utils/cx";

interface MatchupCardProps {
  team1: string;
  team2: string;
  team1Logo?: string;
  team2Logo?: string;
  team1Score?: number;
  team2Score?: number;
  ties?: number;
  status: string;
  isSelected?: boolean;
  onClick?: () => void;
}

export const MatchupCard = ({
  team1,
  team2,
  team1Logo,
  team2Logo,
  team1Score,
  team2Score,
  ties,
  status,
  isSelected,
  onClick,
}: MatchupCardProps) => {
  const hasScores = team1Score !== undefined && team2Score !== undefined;
  const team1Winning = hasScores && team1Score > team2Score;
  const team2Winning = hasScores && team2Score > team1Score;

  const statusColor = status === "postevent"
    ? "gray"
    : status === "midevent"
      ? "success"
      : "brand";

  const statusLabel = status === "postevent"
    ? "Final"
    : status === "midevent"
      ? "Live"
      : "Upcoming";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex w-full flex-col gap-3 rounded-xl bg-primary p-4 text-left shadow-xs ring-1 ring-inset transition duration-100 ease-linear",
        isSelected
          ? "ring-2 ring-border-brand"
          : "ring-secondary hover:ring-border-brand",
      )}
    >
      {/* Status badge */}
      <div className="flex items-center justify-between">
        <Badge size="sm" color={statusColor}>{statusLabel}</Badge>
        {hasScores && ties !== undefined && ties > 0 && (
          <span className="text-xs text-tertiary">{ties} tied</span>
        )}
      </div>

      {/* Team 1 */}
      <div className="flex items-center gap-3">
        <Avatar src={team1Logo} alt={team1} size="sm" initials={team1.slice(0, 2).toUpperCase()} />
        <span className={cx(
          "flex-1 truncate text-sm font-medium",
          team1Winning ? "text-primary" : "text-secondary",
        )}>
          {team1}
        </span>
        {hasScores && (
          <span className={cx(
            "text-sm font-semibold tabular-nums",
            team1Winning ? "text-brand-secondary" : "text-tertiary",
          )}>
            {team1Score}
          </span>
        )}
      </div>

      {/* Divider */}
      <div className="h-px w-full bg-border-secondary" />

      {/* Team 2 */}
      <div className="flex items-center gap-3">
        <Avatar src={team2Logo} alt={team2} size="sm" initials={team2.slice(0, 2).toUpperCase()} />
        <span className={cx(
          "flex-1 truncate text-sm font-medium",
          team2Winning ? "text-primary" : "text-secondary",
        )}>
          {team2}
        </span>
        {hasScores && (
          <span className={cx(
            "text-sm font-semibold tabular-nums",
            team2Winning ? "text-brand-secondary" : "text-tertiary",
          )}>
            {team2Score}
          </span>
        )}
      </div>
    </button>
  );
};
