import * as React from "react";
import { useState } from "react";
import { Loader2 } from "@/shared/icons";
import { mlbHeadshotUrl } from "./mlb-images";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAppContextSafe } from "./app-context";

interface PlayerNameProps {
  name: string;
  playerId?: string;
  mlbId?: number;
  app?: any;
  navigate?: (data: any) => void;
  context?: string;
  showHeadshot?: boolean;
}

export function PlayerName({ name, playerId, mlbId, app: appProp, navigate: navProp, context, showHeadshot }: PlayerNameProps) {
  var [loading, setLoading] = useState(false);
  var ctx = useAppContextSafe();
  var app = ctx?.app || appProp;
  var navigate = ctx?.navigate || navProp;

  var headshot = mlbId && showHeadshot !== false
    ? <Avatar className="size-7"><AvatarImage src={mlbHeadshotUrl(mlbId)} /><AvatarFallback>{name.charAt(0)}</AvatarFallback></Avatar>
    : null;

  // Only make clickable if we have both app AND navigate
  var handleClick = app && navigate ? async function () {
    if (loading) return;
    setLoading(true);
    try {
      // Call yahoo_player_intel — now in core toolset
      var result = await app.callServerTool({ name: "yahoo_player_intel", arguments: { player: name } });
      if (result && result.structuredContent) {
        navigate(result.structuredContent);
      }
    } catch (_e) {
      // Tool call failed — open FanGraphs as fallback
      var slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      if (app.openLink) {
        app.openLink("https://www.fangraphs.com/players/" + slug);
      }
    } finally {
      setLoading(false);
    }
  } : undefined;

  var isClickable = !!handleClick;

  return (
    <span
      className={"inline-flex items-center gap-1.5 min-w-0" + (isClickable ? " cursor-pointer hover:opacity-80 active:opacity-60" : "")}
      onClick={handleClick}
    >
      {headshot}
      <span className={"truncate" + (isClickable ? " border-b border-dashed border-muted-foreground/50" : "")}>
        {loading && <Loader2 className="inline h-3 w-3 animate-spin mr-0.5" />}
        {name}
      </span>
    </span>
  );
}
