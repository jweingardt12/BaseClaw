export function mlbHeadshotUrl(mlbId: number): string {
  return "https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_80,q_auto:best/v1/people/" + mlbId + "/headshot/67/current";
}

export function teamLogoUrl(teamId: number): string {
  return "https://www.mlbstatic.com/team-logos/" + teamId + ".svg";
}

const TEAM_IDS: Record<string, number> = {
  ARI: 109, ATL: 144, BAL: 110, BOS: 111, CHC: 112,
  CIN: 113, CLE: 114, COL: 115, CWS: 145, DET: 116,
  HOU: 117, KC: 118, LAA: 108, LAD: 119, MIA: 146,
  MIL: 158, MIN: 142, NYM: 121, NYY: 147, OAK: 133,
  PHI: 143, PIT: 134, SD: 135, SEA: 136, SF: 137,
  STL: 138, TB: 139, TEX: 140, TOR: 141, WSH: 120,
};

export function teamLogoFromAbbrev(abbrev: string): string | null {
  const id = TEAM_IDS[abbrev];
  if (!id) return null;
  return teamLogoUrl(id);
}

const TEAM_NAME_TO_ID: Record<string, number> = {
  "Arizona Diamondbacks": 109, "Atlanta Braves": 144, "Baltimore Orioles": 110,
  "Boston Red Sox": 111, "Chicago Cubs": 112, "Chicago White Sox": 145,
  "Cincinnati Reds": 113, "Cleveland Guardians": 114, "Colorado Rockies": 115,
  "Detroit Tigers": 116, "Houston Astros": 117, "Kansas City Royals": 118,
  "Los Angeles Angels": 108, "Los Angeles Dodgers": 119, "Miami Marlins": 146,
  "Milwaukee Brewers": 158, "Minnesota Twins": 142, "New York Mets": 121,
  "New York Yankees": 147, "Oakland Athletics": 133, "Philadelphia Phillies": 143,
  "Pittsburgh Pirates": 134, "San Diego Padres": 135, "Seattle Mariners": 136,
  "San Francisco Giants": 137, "St. Louis Cardinals": 138, "Tampa Bay Rays": 139,
  "Texas Rangers": 140, "Toronto Blue Jays": 141, "Washington Nationals": 120,
};

export function teamLogoFromName(name: string): string | null {
  const id = TEAM_NAME_TO_ID[name];
  if (!id) return null;
  return teamLogoUrl(id);
}

const TEAM_NAME_TO_ABBREV: Record<string, string> = {
  "Arizona Diamondbacks": "ARI", "Atlanta Braves": "ATL", "Baltimore Orioles": "BAL",
  "Boston Red Sox": "BOS", "Chicago Cubs": "CHC", "Chicago White Sox": "CWS",
  "Cincinnati Reds": "CIN", "Cleveland Guardians": "CLE", "Colorado Rockies": "COL",
  "Detroit Tigers": "DET", "Houston Astros": "HOU", "Kansas City Royals": "KC",
  "Los Angeles Angels": "LAA", "Los Angeles Dodgers": "LAD", "Miami Marlins": "MIA",
  "Milwaukee Brewers": "MIL", "Minnesota Twins": "MIN", "New York Mets": "NYM",
  "New York Yankees": "NYY", "Oakland Athletics": "OAK", "Philadelphia Phillies": "PHI",
  "Pittsburgh Pirates": "PIT", "San Diego Padres": "SD", "Seattle Mariners": "SEA",
  "San Francisco Giants": "SF", "St. Louis Cardinals": "STL", "Tampa Bay Rays": "TB",
  "Texas Rangers": "TEX", "Toronto Blue Jays": "TOR", "Washington Nationals": "WSH",
};

export function teamAbbrevFromName(name: string): string | null {
  return TEAM_NAME_TO_ABBREV[name] || null;
}
