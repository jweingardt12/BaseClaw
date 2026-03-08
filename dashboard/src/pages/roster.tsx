import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChartContainer } from "@/components/ui/chart";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, LineChart, Line, XAxis, YAxis } from "recharts";
import * as api from "@/lib/api";
import type { RosterPlayer } from "@/lib/api";

const positionGroups = {
  All: null,
  Hitters: ["C", "1B", "2B", "3B", "SS", "OF", "DH", "UTIL"],
  Pitchers: ["SP", "RP", "P"],
  Bench: ["BN"],
  IL: ["IL", "IL+", "NA"],
};

export function RosterPage() {
  const roster = useQuery({ queryKey: ["roster"], queryFn: api.getRoster });
  const autonomy = useQuery({ queryKey: ["autonomy"], queryFn: api.getAutonomyConfig });
  const [selectedPlayer, setSelectedPlayer] = useState<RosterPlayer | null>(null);
  const [tab, setTab] = useState("All");
  const isWriteEnabled = autonomy.data?.mode !== "off";

  const filtered = roster.data?.filter((p) => {
    const group = positionGroups[tab as keyof typeof positionGroups];
    if (!group) return true;
    return group.includes(p.slot);
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Roster</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {Object.keys(positionGroups).map((key) => (
            <TabsTrigger key={key} value={key}>{key}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {roster.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : roster.error ? (
            <p className="text-sm text-destructive">Failed to load roster</p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Slot</TableHead>
                      <TableHead>Player</TableHead>
                      <TableHead className="hidden lg:table-cell">Team</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered?.map((player) => (
                      <TableRow key={player.name} className="cursor-pointer" onClick={() => setSelectedPlayer(player)}>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{player.slot}</Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{player.name}</p>
                            <p className="text-xs text-muted-foreground">{player.position}</p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">{player.team}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              player.status === "active" ? "default" :
                              player.status === "IL" ? "destructive" :
                              "secondary"
                            }
                          >
                            {player.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button size="sm" variant="ghost" disabled={!isWriteEnabled} onClick={(e) => { e.stopPropagation(); api.dropPlayer(player.name); }}>
                                  Drop
                                </Button>
                              }
                            />
                            {!isWriteEnabled && (
                              <TooltipContent>Write operations disabled</TooltipContent>
                            )}
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile card stack */}
              <div className="md:hidden space-y-2">
                {filtered?.map((player) => (
                  <Card key={player.name} className="cursor-pointer" onClick={() => setSelectedPlayer(player)}>
                    <CardContent className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{player.slot}</Badge>
                        <div>
                          <p className="font-medium text-sm">{player.name}</p>
                          <p className="text-xs text-muted-foreground">{player.team} · {player.position}</p>
                        </div>
                      </div>
                      <Badge
                        variant={
                          player.status === "active" ? "default" :
                          player.status === "IL" ? "destructive" :
                          "secondary"
                        }
                      >
                        {player.status}
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Player Detail Sheet */}
      <Sheet open={!!selectedPlayer} onOpenChange={(v) => !v && setSelectedPlayer(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedPlayer?.name}</SheetTitle>
          </SheetHeader>
          {selectedPlayer && (
            <div className="space-y-6 pt-4">
              <div className="flex gap-2">
                <Badge>{selectedPlayer.position}</Badge>
                <Badge variant="outline">{selectedPlayer.team}</Badge>
                <Badge variant={selectedPlayer.status === "active" ? "default" : "destructive"}>
                  {selectedPlayer.status}
                </Badge>
              </div>

              {/* Statcast Radar */}
              {selectedPlayer.statcast && (
                <Card>
                  <CardHeader><CardTitle className="text-sm">Statcast Profile</CardTitle></CardHeader>
                  <CardContent>
                    <ChartContainer config={{ value: { color: "var(--chart-1)" } }} className="h-56 w-full">
                      <RadarChart data={Object.entries(selectedPlayer.statcast).map(([key, value]) => ({ metric: key, value }))}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="metric" className="text-xs" />
                        <Radar dataKey="value" fill="var(--color-value)" fillOpacity={0.3} stroke="var(--color-value)" />
                      </RadarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              )}

              {/* Trends */}
              {selectedPlayer.trends && selectedPlayer.trends.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-sm">Performance Trend</CardTitle></CardHeader>
                  <CardContent>
                    <ChartContainer config={{ value: { color: "var(--chart-2)" } }} className="h-40 w-full">
                      <LineChart data={selectedPlayer.trends}>
                        <XAxis dataKey="date" className="text-xs" />
                        <YAxis />
                        <Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              )}

              {/* Splits */}
              {selectedPlayer.splits && selectedPlayer.splits.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-sm">Splits</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Split</TableHead>
                          {Object.keys(selectedPlayer.splits[0].stats).map((k) => (
                            <TableHead key={k} className="text-right">{k}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedPlayer.splits.map((split) => (
                          <TableRow key={split.split}>
                            <TableCell className="font-medium">{split.split}</TableCell>
                            {Object.values(split.stats).map((v, i) => (
                              <TableCell key={i} className="text-right">{typeof v === "number" ? v.toFixed(3) : v}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
