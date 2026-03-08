import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChartContainer } from "@/components/ui/chart";
import { LineChart, Line } from "recharts";
import { Loader2, AlertTriangle, CheckCircle, Info } from "lucide-react";
import * as api from "@/lib/api";

export function HomePage() {
  const status = useQuery({ queryKey: ["status"], queryFn: api.getSystemStatus });
  const briefing = useQuery({ queryKey: ["briefing"], queryFn: api.getMorningBriefing });
  const roster = useQuery({ queryKey: ["roster"], queryFn: api.getRoster });
  const categories = useQuery({ queryKey: ["categories"], queryFn: api.getCategoryCheck });
  const matchup = useQuery({ queryKey: ["matchup"], queryFn: api.getMatchup });
  const autonomy = useQuery({ queryKey: ["autonomy"], queryFn: api.getAutonomyConfig });

  const isWriteEnabled = autonomy.data?.mode !== "off";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <div className="flex items-center gap-2">
          {status.data && (
            <Badge variant={status.data.status === "healthy" ? "default" : "destructive"}>
              {status.data.status === "healthy" ? (
                <CheckCircle className="mr-1 size-3" />
              ) : (
                <AlertTriangle className="mr-1 size-3" />
              )}
              {status.data.status}
            </Badge>
          )}
          <Separator orientation="vertical" className="h-6" />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="sm"
                  onClick={() => api.autoOptimizeLineup()}
                  disabled={!isWriteEnabled}
                >
                  <Loader2 className="mr-2 size-3.5" />
                  Auto-Optimize
                </Button>
              }
            />
            {!isWriteEnabled && (
              <TooltipContent>Write operations disabled. Enable in Settings.</TooltipContent>
            )}
          </Tooltip>
        </div>
      </div>

      {/* Morning Briefing */}
      <Card>
        <CardHeader>
          <CardTitle>Morning Briefing</CardTitle>
          <CardDescription>{briefing.data?.date ?? "Today"}</CardDescription>
        </CardHeader>
        <CardContent>
          {briefing.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : briefing.error ? (
            <p className="text-sm text-destructive">Failed to load briefing</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">{briefing.data?.summary}</p>
              {briefing.data?.alerts && briefing.data.alerts.length > 0 && (
                <div className="space-y-1.5">
                  {briefing.data.alerts.map((alert, i) => (
                    <Badge
                      key={i}
                      variant={alert.type === "critical" ? "destructive" : alert.type === "warning" ? "secondary" : "outline"}
                    >
                      {alert.type === "critical" ? <AlertTriangle className="mr-1 size-3" /> : <Info className="mr-1 size-3" />}
                      {alert.message}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lineup Grid */}
      <Card>
        <CardHeader>
          <CardTitle>Today's Lineup</CardTitle>
        </CardHeader>
        <CardContent>
          {roster.isLoading ? (
            <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : roster.error ? (
            <p className="text-sm text-destructive">Failed to load roster</p>
          ) : (
            <div className="grid gap-2 grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
              {roster.data?.map((player) => (
                <div key={player.name} className="flex items-center gap-2 rounded-md border p-2">
                  <Badge
                    variant={
                      player.status === "active" ? "default" :
                      player.status === "IL" ? "destructive" :
                      "secondary"
                    }
                    className="text-xs shrink-0"
                  >
                    {player.slot}
                  </Badge>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{player.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{player.team} · {player.position}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Category Sparklines */}
        <Card>
          <CardHeader>
            <CardTitle>Category Check</CardTitle>
          </CardHeader>
          <CardContent>
            {categories.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : categories.error ? (
              <p className="text-sm text-destructive">Failed to load categories</p>
            ) : (
              <div className="space-y-3">
                {categories.data?.map((cat) => (
                  <div key={cat.category} className="flex items-center gap-3">
                    <div className="w-16 text-sm font-medium">{cat.category}</div>
                    <div className="flex-1">
                      <ChartContainer config={{ value: { color: "var(--chart-1)" } }} className="h-8 w-full">
                        <LineChart data={cat.trend}>
                          <Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={1.5} dot={false} />
                        </LineChart>
                      </ChartContainer>
                    </div>
                    <Badge variant="outline" className="text-xs">{cat.rank}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Matchup */}
        <Card>
          <CardHeader>
            <CardTitle>Current Matchup</CardTitle>
            <CardDescription>{matchup.data ? `vs ${matchup.data.opponent}` : ""}</CardDescription>
          </CardHeader>
          <CardContent>
            {matchup.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : matchup.error ? (
              <p className="text-sm text-destructive">Failed to load matchup</p>
            ) : matchup.data ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-lg font-bold">
                  <span className="text-green-500">{matchup.data.score.wins}</span>
                  <span className="text-muted-foreground">-</span>
                  <span className="text-red-500">{matchup.data.score.losses}</span>
                  <span className="text-muted-foreground">-</span>
                  <span>{matchup.data.score.ties}</span>
                </div>
                <div className="space-y-2">
                  {matchup.data.categories.map((cat) => (
                    <div key={cat.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span>{cat.yours}</span>
                        <span className="font-medium">{cat.name}</span>
                        <span>{cat.theirs}</span>
                      </div>
                      <Progress
                        value={cat.yours + cat.theirs > 0 ? (cat.yours / (cat.yours + cat.theirs)) * 100 : 50}
                        className="h-1.5"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
