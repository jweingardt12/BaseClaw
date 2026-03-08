import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, AreaChart, Area, CartesianGrid } from "recharts";
import * as api from "@/lib/api";

export function StandingsPage() {
  const standings = useQuery({ queryKey: ["standings"], queryFn: api.getStandings });

  const allCategories = standings.data?.[0] ? Object.keys(standings.data[0].categories) : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Standings</h1>

      {standings.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : standings.error ? (
        <p className="text-sm text-destructive">Failed to load standings</p>
      ) : (
        <>
          {/* Main standings table */}
          <Card>
            <CardHeader><CardTitle>League Standings</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead className="text-center">W</TableHead>
                    <TableHead className="text-center">L</TableHead>
                    <TableHead className="text-center hidden sm:table-cell">T</TableHead>
                    <TableHead className="text-center hidden sm:table-cell">GB</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Playoff %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {standings.data?.map((team) => (
                    <TableRow key={team.team}>
                      <TableCell className="font-medium">{team.rank}</TableCell>
                      <TableCell className="font-medium">{team.team}</TableCell>
                      <TableCell className="text-center">{team.wins}</TableCell>
                      <TableCell className="text-center">{team.losses}</TableCell>
                      <TableCell className="text-center hidden sm:table-cell">{team.ties}</TableCell>
                      <TableCell className="text-center hidden sm:table-cell">{team.gb}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex items-center gap-2 justify-end">
                          <Progress value={team.playoffPct} className="w-16 h-1.5" />
                          <span className="text-xs w-10 text-right">{team.playoffPct}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Category Heatmap */}
          <Card>
            <CardHeader><CardTitle>Category Heatmap</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Team</TableHead>
                    {allCategories.map((cat) => (
                      <TableHead key={cat} className="text-center text-xs">{cat}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {standings.data?.map((team) => (
                    <TableRow key={team.team}>
                      <TableCell className="font-medium text-sm">{team.team}</TableCell>
                      {allCategories.map((cat) => {
                        const { rank } = team.categories[cat];
                        const total = standings.data!.length;
                        const pct = 1 - (rank - 1) / (total - 1);
                        return (
                          <TableCell
                            key={cat}
                            className="text-center text-xs"
                            style={{
                              backgroundColor: `oklch(${0.45 + pct * 0.35} ${0.05 + pct * 0.12} ${25 + pct * 120})`,
                              color: pct > 0.5 ? "black" : "white",
                            }}
                          >
                            {rank}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Power Rankings */}
            <Card>
              <CardHeader><CardTitle>Power Rankings</CardTitle></CardHeader>
              <CardContent>
                <ChartContainer config={{ powerRank: { label: "Power Rank", color: "hsl(var(--chart-1))" } }} className="h-64 w-full">
                  <BarChart accessibilityLayer
                    data={standings.data?.map((t) => ({ team: t.team, powerRank: t.powerRank })).sort((a, b) => b.powerRank - a.powerRank)}
                    layout="vertical"
                  >
                    <XAxis type="number" tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="team" width={110} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                    <Bar dataKey="powerRank" fill="var(--color-powerRank)" radius={[0, 4, 4, 0]} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* W-L Trend */}
            <Card>
              <CardHeader><CardTitle>Win Trend (Your Team)</CardTitle></CardHeader>
              <CardContent>
                {standings.data?.[0]?.trend && (
                  <ChartContainer
                    config={{
                      wins: { label: "Wins", color: "var(--chart-positive)" },
                      losses: { label: "Losses", color: "var(--chart-negative)" },
                    }}
                    className="h-64 w-full"
                  >
                    <AreaChart accessibilityLayer data={standings.data[0].trend}>
                      <XAxis dataKey="week" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={30} />
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <Area type="monotone" dataKey="wins" fill="var(--color-wins)" fillOpacity={0.2} stroke="var(--color-wins)" strokeWidth={2} />
                      <Area type="monotone" dataKey="losses" fill="var(--color-losses)" fillOpacity={0.2} stroke="var(--color-losses)" strokeWidth={2} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} />
                    </AreaChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
