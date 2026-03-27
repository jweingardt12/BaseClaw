import { useState } from "react";
import { ArrowDown, ArrowUp, CheckDone01, SwitchHorizontal01 } from "@untitledui/icons";
import { motion } from "motion/react";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge } from "@/components/base/badges/badges";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { useApi } from "@/hooks/use-api";
import { getTransactions } from "@/lib/api";
import { mlbHeadshotUrl, teamLogoFromAbbrev, getInitials } from "@/lib/images";
import { cx } from "@/utils/cx";
import type { TransactionPlayer } from "@/types/fantasy";

type TransactionFilter = "" | "add/drop" | "trade";

function relativeTime(timestamp: string): string {
  const now = Date.now();
  const then = Number(timestamp) * 1000;
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return mins + "m ago";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + "h ago";
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return days + "d ago";
  return new Date(then).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const ACTION_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  add: { bg: "bg-success-secondary", text: "text-success-primary", label: "Added by" },
  drop: { bg: "bg-error-secondary", text: "text-error-primary", label: "Dropped by" },
  trade: { bg: "bg-brand-secondary", text: "text-brand-primary", label: "Traded to" },
};

const ActionIcon = ({ action }: { action: string }) => {
  if (action === "add") return <ArrowUp className="size-3.5 text-fg-success-secondary" />;
  if (action === "drop") return <ArrowDown className="size-3.5 text-fg-error-secondary" />;
  return <SwitchHorizontal01 className="size-3.5 text-fg-brand-secondary" />;
};

const PlayerActionRow = ({ player, timestamp, isFirstInGroup }: { player: TransactionPlayer; timestamp?: string; isFirstInGroup: boolean }) => {
  const headshot = mlbHeadshotUrl(player.mlb_id);
  const teamLogo = teamLogoFromAbbrev(player.mlb_team);

  const style = ACTION_STYLES[player.action] || ACTION_STYLES.trade;

  return (
    <div className={cx(
      "flex items-center gap-3 px-4 py-2 transition duration-100 ease-linear hover:bg-primary_hover md:px-5",
      !isFirstInGroup && "border-t border-dotted border-secondary",
    )}>
      {/* Action icon */}
      <div className={cx("flex size-6 shrink-0 items-center justify-center rounded-full", style.bg)}>
        <ActionIcon action={player.action} />
      </div>

      {/* Player avatar */}
      <Avatar
        src={headshot || undefined}
        alt={player.name}
        size="xs"
        initials={getInitials(player.name)}
        contrastBorder
      />

      {/* Player name + position */}
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-sm font-medium text-primary">{player.name}</span>
        <span className="text-xs text-quaternary">{player.position}</span>
      </div>

      {/* MLB team */}
      <div className="flex items-center gap-1">
        {teamLogo && <img src={teamLogo} alt={player.mlb_team} className="size-3.5" />}
        <span className="text-xs text-tertiary">{player.mlb_team}</span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Fantasy team */}
      <span className="truncate text-xs text-secondary">{player.fantasy_team}</span>

      {/* Timestamp — only on first row of group */}
      <div className="w-16 shrink-0 text-right">
        {isFirstInGroup && timestamp && (
          <span className="text-xs text-quaternary">{relativeTime(timestamp)}</span>
        )}
      </div>
    </div>
  );
};

export const TransactionsPage = () => {
  const [txType, setTxType] = useState<TransactionFilter>("");

  const { data: transactions, loading, error, refetch } = useApi(
    () => getTransactions(txType || undefined, "50"),
    [txType],
  );

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex flex-col gap-6 px-4 lg:px-8">
      {error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <p className="text-sm text-error-primary">Failed to load transactions</p>
          <button onClick={refetch} className="text-sm font-semibold text-brand-secondary underline">Retry</button>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16">
          <LoadingIndicator size="md" label="Loading transactions..." />
        </div>
      ) : !transactions || transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <FeaturedIcon icon={CheckDone01} color="gray" theme="light" size="xl" />
          <h3 className="text-lg font-semibold text-primary">No Transactions Yet</h3>
          <p className="text-sm text-tertiary">Transactions will appear here once the season starts</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
          {/* Card header with filters */}
          <div className="flex items-center justify-between border-b border-secondary px-4 py-3 md:px-5">
            <div className="flex items-center gap-3">
              <h2 className="text-md font-semibold text-primary">Recent Transactions</h2>
              <Badge color="gray" size="sm">{transactions.length}</Badge>
            </div>
            <ButtonGroup
              size="sm"
              defaultSelectedKeys={[""]}
              onSelectionChange={(keys) => {
                const selected = [...keys][0] as TransactionFilter;
                setTxType(selected);
              }}
            >
              <ButtonGroupItem id="">All</ButtonGroupItem>
              <ButtonGroupItem id="add/drop">Add/Drop</ButtonGroupItem>
              <ButtonGroupItem id="trade">Trades</ButtonGroupItem>
            </ButtonGroup>
          </div>

          {/* Transaction rows */}
          <div>
            {transactions.map((tx, txIdx) => (
              <div key={txIdx} className={cx(txIdx > 0 && "border-t border-secondary")}>
                {tx.players.map((p, pIdx) => (
                  <PlayerActionRow
                    key={pIdx}
                    player={p}
                    timestamp={tx.timestamp}
                    isFirstInGroup={pIdx === 0}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
};
