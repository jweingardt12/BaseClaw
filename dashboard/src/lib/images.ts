/**
 * MLB headshot URL from mlb_id. Returns empty string if no mlbId.
 */
export function mlbHeadshotUrl(mlbId: number | string | undefined | null): string {
  if (!mlbId) return "";
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_80,q_auto:best/v1/people/${mlbId}/headshot/67/current`;
}

const TEAM_IDS: Record<string, number> = {
  ARI: 109, ATL: 144, BAL: 110, BOS: 111, CHC: 112,
  CIN: 113, CLE: 114, COL: 115, CWS: 145, DET: 116,
  HOU: 117, KC: 118, LAA: 108, LAD: 119, MIA: 146,
  MIL: 158, MIN: 142, NYM: 121, NYY: 147, OAK: 133,
  PHI: 143, PIT: 134, SD: 135, SEA: 136, SF: 137,
  STL: 138, TB: 139, TEX: 140, TOR: 141, WSH: 120,
};

/**
 * MLB team logo SVG from 3-letter abbreviation.
 */
export function teamLogoFromAbbrev(abbrev: string): string | null {
  const id = TEAM_IDS[abbrev?.toUpperCase()];
  if (!id) return null;
  return `https://www.mlbstatic.com/team-logos/${id}.svg`;
}

/**
 * Get initials from a display name (e.g. "Aaron Judge" -> "AJ")
 */
export function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .slice(0, 2)
    .join("");
}
