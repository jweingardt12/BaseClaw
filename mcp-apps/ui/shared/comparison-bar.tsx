interface ComparisonBarProps {
  label: string;
  leftValue: string;
  rightValue: string;
  result: "win" | "loss" | "tie";
  leftLabel?: string;
  rightLabel?: string;
}

export function ComparisonBar({ label, leftValue, rightValue, result }: ComparisonBarProps) {
  return (
    <div className="flex items-center gap-1.5 py-1 border-b border-border/30 last:border-0">
      <span className={"text-xs tabular-nums min-w-[40px] text-right " + (result === "win" ? "font-semibold text-sem-success" : result === "loss" ? "text-sem-risk" : "text-muted-foreground")}>{leftValue}</span>
      <span className="flex-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={"text-xs tabular-nums min-w-[40px] " + (result === "loss" ? "font-semibold text-sem-success" : result === "win" ? "text-sem-risk" : "text-muted-foreground")}>{rightValue}</span>
    </div>
  );
}

interface CategoryTableProps {
  categories: Array<{
    name: string;
    my_value: string;
    opp_value: string;
    result: "win" | "loss" | "tie";
  }>;
  myTeam?: string;
  opponent?: string;
  myLogo?: string;
  oppLogo?: string;
}

function pct(mine: string, theirs: string): number {
  var a = Math.abs(parseFloat(mine) || 0);
  var b = Math.abs(parseFloat(theirs) || 0);
  var total = a + b;
  if (total === 0) return 50;
  return Math.max(8, Math.min(92, (a / total) * 100));
}

function CatRow({ cat }: { cat: { name: string; my_value: string; opp_value: string; result: string } }) {
  var myPct = pct(cat.my_value, cat.opp_value);
  var isWin = cat.result === "win";
  var isLoss = cat.result === "loss";
  var isTie = cat.result === "tie";

  return (
    <div className="py-1.5 border-b border-border/20 last:border-0">
      <div className="flex items-center gap-2">
        <span className={"text-xs font-mono tabular-nums w-[52px] text-right shrink-0 " + (isWin ? "font-bold text-foreground" : "text-muted-foreground")}>{cat.my_value}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground w-8 text-center shrink-0">{cat.name}</span>
        <span className={"text-xs font-mono tabular-nums w-[52px] shrink-0 " + (isLoss ? "font-bold text-foreground" : "text-muted-foreground")}>{cat.opp_value}</span>
      </div>
      {/* Split bar */}
      <div className="flex h-1 rounded-full overflow-hidden mt-1">
        <div
          className={"rounded-l-full " + (isWin ? "bg-sem-success" : isTie ? "bg-sem-warning" : "bg-sem-risk/40")}
          style={{ width: myPct + "%" }}
        />
        <div
          className={"rounded-r-full flex-1 " + (isLoss ? "bg-sem-risk" : isTie ? "bg-sem-warning" : "bg-sem-success/40")}
        />
      </div>
    </div>
  );
}

export function CategoryTable({ categories, myTeam, opponent, myLogo, oppLogo }: CategoryTableProps) {
  if (!categories || categories.length === 0) return null;

  var winning = categories.filter(function (c) { return c.result === "win"; });
  var losing = categories.filter(function (c) { return c.result === "loss"; });
  var tied = categories.filter(function (c) { return c.result === "tie"; });

  var myShort = myTeam && myTeam.length > 10 ? myTeam.substring(0, 10) : (myTeam || "You");
  var oppShort = opponent && opponent.length > 10 ? opponent.substring(0, 10) : (opponent || "Opp");

  function GroupHeader({ label, count, color }: { label: string; count: number; color: string }) {
    return (
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className={"w-2 h-2 rounded-full shrink-0 " + color} />
          <span className={"text-[10px] font-bold uppercase tracking-wide " + color.replace("bg-", "text-")}>{label + " " + count}</span>
        </div>
        <div className="flex items-center gap-6 text-[9px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            {myLogo && <img src={myLogo} alt="" className="w-3 h-3 rounded-sm" />}
            {myShort}
          </span>
          <span className="inline-flex items-center gap-1">
            {oppLogo && <img src={oppLogo} alt="" className="w-3 h-3 rounded-sm" />}
            {oppShort}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Winning */}
      {winning.length > 0 && (
        <div>
          <GroupHeader label="Winning" count={winning.length} color="bg-sem-success" />
          {winning.map(function (c) { return <CatRow key={c.name} cat={c} />; })}
        </div>
      )}

      {/* Losing */}
      {losing.length > 0 && (
        <div>
          <GroupHeader label="Losing" count={losing.length} color="bg-sem-risk" />
          {losing.map(function (c) { return <CatRow key={c.name} cat={c} />; })}
        </div>
      )}

      {/* Tied */}
      {tied.length > 0 && (
        <div>
          <GroupHeader label="Tied" count={tied.length} color="bg-sem-warning" />
          {tied.map(function (c) { return <CatRow key={c.name} cat={c} />; })}
        </div>
      )}
    </div>
  );
}
