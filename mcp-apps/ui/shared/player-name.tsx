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

  var callTool = ctx?.callTool;
  var handleClick = callTool && navigate ? async function () {
    if (loading) return;
    setLoading(true);
    try {
      try {
        var result = await callTool("yahoo_player_intel", { player: name });
        if (result && result.structuredContent) {
          navigate(result.structuredContent);
          return;
        }
      } catch (_e) { /* tool may not be in active toolset */ }
      if (app && app.sendMessage) {
        app.sendMessage("Tell me about " + name + " — stats, news, and fantasy outlook");
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
