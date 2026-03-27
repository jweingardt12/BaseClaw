import { createContext, useContext } from "react";
import type { LeagueContext } from "@/types/fantasy";

export const LeagueCtx = createContext<LeagueContext | null>(null);

export function useLeague(): LeagueContext | null {
  return useContext(LeagueCtx);
}
