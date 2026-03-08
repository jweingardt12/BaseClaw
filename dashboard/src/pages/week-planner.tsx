import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis } from "recharts";
import * as api from "@/lib/api";

export function WeekPlannerPage() {
  const planner = useQuery({ queryKey: ["weekPlanner"], queryFn: api.getWeekPlanner });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Week Planner</h1>

      {planner.isLoading ? (
        <div className="grid gap-2 grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : planner.error ? (
        <p className="text-sm text-destructive">Failed to load week planner</p>
      ) : (
        <>
          {/* Games per day chart */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Games Per Day</CardTitle></CardHeader>
            <CardContent>
              <ChartContainer config={{ games: { color: "var(--chart-1)" } }} className="h-32 w-full">
                <BarChart data={planner.data?.map((d) => ({ day: d.dayOfWeek.slice(0, 3), games: d.games }))}>
                  <XAxis dataKey="day" className="text-xs" />
                  <YAxis />
                  <Bar dataKey="games" fill="var(--color-games)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* 7-column grid */}
          <div className="grid gap-2 grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
            {planner.data?.map((day) => (
              <Card key={day.date} className="flex flex-col">
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-xs font-medium">{day.dayOfWeek}</CardTitle>
                  <p className="text-xs text-muted-foreground">{day.date}</p>
                </CardHeader>
                <CardContent className="p-3 pt-1 flex-1 space-y-1.5">
                  <Badge variant="outline" className="text-xs w-full justify-center">
                    {day.games} games
                  </Badge>
                  {day.starters.map((s) => (
                    <Badge
                      key={s.name}
                      variant={
                        s.quality === "good" ? "default" :
                        s.quality === "bad" ? "destructive" :
                        "secondary"
                      }
                      className="text-xs w-full justify-center truncate"
                    >
                      {s.name}
                    </Badge>
                  ))}
                  {day.recommendations.map((rec, i) => (
                    <p key={i} className="text-xs text-muted-foreground">{rec}</p>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
