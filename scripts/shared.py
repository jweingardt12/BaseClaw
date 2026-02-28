#!/usr/bin/env python3
"""Shared utilities for Yahoo Fantasy Baseball scripts.

Consolidates duplicated code that was copy-pasted across
yahoo-fantasy.py, season-manager.py, history.py, intel.py, and mlb-data.py.
"""

import os
import json
import time
import urllib.request

from yahoo_oauth import OAuth2
import yahoo_fantasy_api as yfa

# ---------------------------------------------------------------------------
# Environment / config
# ---------------------------------------------------------------------------
OAUTH_FILE = os.environ.get("OAUTH_FILE", "/app/config/yahoo_oauth.json")
LEAGUE_ID = os.environ.get("LEAGUE_ID", "")
TEAM_ID = os.environ.get("TEAM_ID", "")
GAME_KEY = LEAGUE_ID.split(".")[0] if LEAGUE_ID else ""
DATA_DIR = os.environ.get("DATA_DIR", "/app/data")

# ---------------------------------------------------------------------------
# MLB Stats API
# ---------------------------------------------------------------------------
MLB_API = "https://statsapi.mlb.com/api/v1"

USER_AGENT = "YahooFantasyBot/1.0"


def mlb_fetch(endpoint):
    """Fetch JSON from MLB Stats API with User-Agent header."""
    url = MLB_API + endpoint
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=15) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        print("Warning: MLB API fetch failed for " + endpoint + ": " + str(e))
        return {}


# ---------------------------------------------------------------------------
# Yahoo OAuth connection
# ---------------------------------------------------------------------------
def get_connection():
    """Get authenticated Yahoo OAuth connection."""
    if not LEAGUE_ID or not TEAM_ID:
        raise RuntimeError("LEAGUE_ID and TEAM_ID environment variables are required")
    sc = OAuth2(None, None, from_file=OAUTH_FILE)
    if not sc.token_is_valid():
        sc.refresh_access_token()
    return sc


def get_league():
    """Get (sc, gm, lg) — connection, game, and league objects."""
    sc = get_connection()
    gm = yfa.Game(sc, "mlb")
    lg = gm.to_league(LEAGUE_ID)
    return sc, gm, lg


def get_league_context():
    """Get (sc, gm, lg, team) — connection, game, league, and team objects."""
    sc, gm, lg = get_league()
    team = lg.to_team(TEAM_ID)
    return sc, gm, lg, team


# ---------------------------------------------------------------------------
# Team name normalization
# ---------------------------------------------------------------------------
TEAM_ALIASES = {
    "D-backs": "Arizona Diamondbacks",
    "Diamondbacks": "Arizona Diamondbacks",
    "Braves": "Atlanta Braves",
    "Orioles": "Baltimore Orioles",
    "Red Sox": "Boston Red Sox",
    "Cubs": "Chicago Cubs",
    "White Sox": "Chicago White Sox",
    "Reds": "Cincinnati Reds",
    "Guardians": "Cleveland Guardians",
    "Rockies": "Colorado Rockies",
    "Tigers": "Detroit Tigers",
    "Astros": "Houston Astros",
    "Royals": "Kansas City Royals",
    "Angels": "Los Angeles Angels",
    "Dodgers": "Los Angeles Dodgers",
    "Marlins": "Miami Marlins",
    "Brewers": "Milwaukee Brewers",
    "Twins": "Minnesota Twins",
    "Mets": "New York Mets",
    "Yankees": "New York Yankees",
    "Athletics": "Oakland Athletics",
    "Phillies": "Philadelphia Phillies",
    "Pirates": "Pittsburgh Pirates",
    "Padres": "San Diego Padres",
    "Giants": "San Francisco Giants",
    "Mariners": "Seattle Mariners",
    "Cardinals": "St. Louis Cardinals",
    "Rays": "Tampa Bay Rays",
    "Rangers": "Texas Rangers",
    "Blue Jays": "Toronto Blue Jays",
    "Nationals": "Washington Nationals",
}


def normalize_team_name(name):
    """Normalize a team name for matching."""
    if not name:
        return ""
    return name.strip().lower()


# ---------------------------------------------------------------------------
# Transaction trend cache
# ---------------------------------------------------------------------------
_trend_cache = {"data": None, "time": 0}


def get_trend_lookup():
    """Get a name->trend dict from transaction trends, cached 30 min."""
    import importlib
    now = time.time()
    if _trend_cache.get("data") and now - _trend_cache.get("time", 0) < 1800:
        return _trend_cache.get("data", {})
    try:
        yf_mod = importlib.import_module("yahoo-fantasy")
        raw = yf_mod.cmd_transaction_trends([], as_json=True)
        lookup = {}
        for i, p in enumerate(raw.get("most_added", [])):
            lookup[p.get("name", "")] = {
                "direction": "added",
                "delta": p.get("delta", ""),
                "rank": i + 1,
                "percent_owned": p.get("percent_owned", 0),
            }
        for i, p in enumerate(raw.get("most_dropped", [])):
            name = p.get("name", "")
            if name not in lookup:  # added takes priority
                lookup[name] = {
                    "direction": "dropped",
                    "delta": p.get("delta", ""),
                    "rank": i + 1,
                    "percent_owned": p.get("percent_owned", 0),
                }
        _trend_cache["data"] = lookup
        _trend_cache["time"] = now
        return lookup
    except Exception:
        return {}


# ---------------------------------------------------------------------------
# Player enrichment helpers
# ---------------------------------------------------------------------------
def enrich_with_intel(players, count=None, boost_scores=False):
    """Add intel data to a list of player dicts.

    Args:
        players: list of player dicts (must have "name" key)
        count: if set, only enrich the first N players
        boost_scores: if True, adjust player "score" key based on quality tier
    """
    from intel import batch_intel
    try:
        subset = players[:count] if count else players
        names = [p.get("name", "") for p in subset]
        intel_data = batch_intel(names, include=["statcast", "trends"])
        for p in subset:
            pi = intel_data.get(p.get("name", ""))
            p["intel"] = pi
            if boost_scores and pi:
                sc = pi.get("statcast", {})
                quality = sc.get("quality_tier", "")
                if quality == "elite":
                    p["score"] = p.get("score", 0) + 15
                elif quality == "strong":
                    p["score"] = p.get("score", 0) + 10
                elif quality == "average":
                    p["score"] = p.get("score", 0) + 5
                # Hot streak bonus
                if pi.get("trends", {}).get("hot_cold") == "hot":
                    p["score"] = p.get("score", 0) + 8
                elif pi.get("trends", {}).get("hot_cold") == "warm":
                    p["score"] = p.get("score", 0) + 4
    except Exception as e:
        print("Warning: intel enrichment failed: " + str(e))


def enrich_with_trends(players, count=None):
    """Add trend data and boost scores based on add/drop momentum."""
    try:
        trend_lookup = get_trend_lookup()
        subset = players[:count] if count else players
        for p in subset:
            trend = trend_lookup.get(p.get("name", ""))
            if trend:
                p["trend"] = trend
                if trend.get("direction") == "added":
                    rank = trend.get("rank", 25)
                    p["score"] = p.get("score", 0) + max(0, 12 - rank * 0.4)
                elif trend.get("direction") == "dropped":
                    p["score"] = p.get("score", 0) - 3
    except Exception:
        pass
