import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import * as api from "@/lib/api";

export function LeagueHistoryPage() {
  const history = useQuery({ queryKey: ["leagueHistory"], queryFn: api.getLeagueHistory });
  const [tab, setTab] = useState("overview");
  const [selectedSeason, setSelectedSeason] = useState<string>("");

  const seasons = history.data?.map((h) => String(h.season)) ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">League History</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="seasons">Seasons</TabsTrigger>
          <TabsTrigger value="h2h">Head-to-Head</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          {history.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : history.error ? (
            <p className="text-sm text-destructive">Failed to load history</p>
          ) : (
            <Card>
              <CardHeader><CardTitle className="text-sm">Career W-L by Season</CardTitle></CardHeader>
              <CardContent>
                <ChartContainer config={{ wins: { color: "var(--chart-positive)" }, losses: { color: "var(--chart-negative)" } }} className="h-64 w-full">
                  <BarChart data={history.data} layout="vertical">
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="season" width={60} className="text-xs" />
                    <Bar dataKey="wins" fill="var(--color-wins)" stackId="a" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="losses" fill="var(--color-losses)" stackId="a" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="seasons" className="mt-4 space-y-4">
          <Select value={selectedSeason} onValueChange={(v) => setSelectedSeason(v ?? "")}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Season" />
            </SelectTrigger>
            <SelectContent>
              {seasons.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {history.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Season</TableHead>
                      <TableHead className="text-center">W</TableHead>
                      <TableHead className="text-center">L</TableHead>
                      <TableHead className="text-center">Rank</TableHead>
                      <TableHead>Champion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.data
                      ?.filter((h) => !selectedSeason || String(h.season) === selectedSeason)
                      .map((h) => (
                        <TableRow key={h.season}>
                          <TableCell className="font-medium">{h.season}</TableCell>
                          <TableCell className="text-center">{h.wins}</TableCell>
                          <TableCell className="text-center">{h.losses}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={h.rank === 1 ? "default" : "outline"}>{h.rank}</Badge>
                          </TableCell>
                          <TableCell>{h.champion}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="h2h" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground text-center py-8">
                Head-to-head records will appear here when data is available.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
