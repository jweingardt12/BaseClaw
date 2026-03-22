#!/usr/bin/env python3
"""Prospect Intelligence Module

Provides call-up probability tracking, MiLB stat evaluation, stash
recommendations, and prospect buzz for Yahoo Fantasy Baseball.

Data sources:
- MLB Stats API (prospect info, MiLB stats, rosters, transactions)
- Reddit r/fantasybaseball, r/baseball (buzz, call-up chatter)
- Local prospect_rankings.json / SQLite (curated rankings)
"""

import sys
import os
import json
import time
import importlib
import sqlite3
import urllib.parse
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from shared import mlb_fetch, reddit_get, DATA_DIR, normalize_player_name
from shared import cache_get, cache_set
from mlb_id_cache import get_mlb_id


# ============================================================
# Constants
# ============================================================

YEAR = date.today().year

# TTL values (seconds)
TTL_PROSPECT = 3600       # 1 hour
TTL_ROSTER = 1800         # 30 minutes
TTL_RANKINGS = 86400      # 24 hours
TTL_BUZZ = 900            # 15 minutes

# In-memory cache
_cache = {}

# MiLB level benchmarks (league-average stats for context)
LEVEL_BENCHMARKS = {
    "AAA": {"avg": .268, "obp": .345, "slg": .434, "era": 4.65, "k_per_9": 8.5, "bb_per_9": 3.8},
    "AA": {"avg": .254, "obp": .332, "slg": .410, "era": 4.15, "k_per_9": 9.0, "bb_per_9": 3.5},
    "High-A": {"avg": .258, "obp": .338, "slg": .415, "era": 4.35, "k_per_9": 9.5, "bb_per_9": 4.0},
    "Low-A": {"avg": .250, "obp": .330, "slg": .400, "era": 4.50, "k_per_9": 10.0, "bb_per_9": 4.5},
}

# Readiness thresholds
MLB_READY_THRESHOLDS = {
    "hitter": {"min_readiness": 60, "elite_readiness": 80},
    "pitcher": {"min_readiness": 55, "elite_readiness": 75},
}

# FanGraphs FV scale interpretation
FV_SCALE = {
    80: "Generational",
    70: "Perennial All-Star",
    60: "All-Star upside",
    55: "Above-average regular",
    50: "Average regular",
    45: "Platoon / role player",
    40: "Fringe MLB",
}

# Service time key dates for 2026
SEASON_DATES = {
    "opening_day": "2026-03-26",
    "super_two": "2026-06-15",
    "mid_april_manipulation": "2026-04-15",
    "trade_deadline": "2026-07-31",
    "september_expansion": "2026-09-01",
    "season_end": "2026-09-27",
}

# MiLB sport IDs for MLB API
MILB_SPORT_IDS = {
    "AAA": 11,
    "AA": 12,
    "High-A": 13,
    "Low-A": 14,
}

# Positions classified as pitcher
PITCHER_POSITIONS = {"P", "SP", "RP", "RHP", "LHP"}


# ============================================================
# Helper Functions
# ============================================================

def _safe_float(val):
    """Safe float conversion."""
    try:
        return float(val)
    except (TypeError, ValueError):
        return 0.0


def _get_days_into_season():
    """Compute days since opening day."""
    try:
        opening = datetime.strptime(
            SEASON_DATES.get("opening_day", "2026-03-26"), "%Y-%m-%d"
        ).date()
        today = date.today()
        if today < opening:
            return 0
        return (today - opening).days
    except Exception:
        return 0


def _normalize_level(level_name):
    """Normalize MLB API level name to standard key (AAA, AA, High-A, Low-A)."""
    if not level_name:
        return "AAA"
    lower = level_name.lower()
    if "triple" in lower or "aaa" in lower:
        return "AAA"
    if "double" in lower or lower == "aa":
        return "AA"
    if "high" in lower:
        return "High-A"
    if "low" in lower or "single" in lower:
        return "Low-A"
    return "AAA"


def _resolve_prospect_level(ranking_entry, api_level, has_meaningful_stats):
    """Resolve a prospect's actual level, handling spring training contamination.

    During spring training, the API assigns camp levels (usually AAA) to everyone.
    Use ranking data as the authoritative source when stats are unavailable.
    Fall back to ETA-based inference when ranking has no level.
    """
    # If we have real stats AND a real API level, trust it.
    # But during spring training (pre-opening-day), the API level is often
    # empty or misleading — prefer ranking data even with stats.
    is_preseason = _get_days_into_season() == 0
    if has_meaningful_stats and api_level and not is_preseason:
        return api_level
    # If ranking data has a specific level (not ST), use it
    if ranking_entry:
        rk_level = ranking_entry.get("current_level", "")
        if rk_level and rk_level not in ("ST", ""):
            return rk_level
        # If level is ST or missing, infer from ETA + age
        eta = ranking_entry.get("eta", "")
        if eta:
            try:
                eta_year = int(eta)
                years_away = eta_year - YEAR
                if years_away <= 0:
                    return "AAA"
                elif years_away == 1:
                    return "AA"
                elif years_away == 2:
                    return "High-A"
                else:
                    return "Low-A"
            except (ValueError, TypeError):
                pass
    return api_level or "AAA"


# ============================================================
# SQLite Database
# ============================================================

def _get_prospect_db():
    """Get SQLite connection for prospect data (reuses season.db).

    Creates a fresh connection each call (thread-safe for Flask).
    """
    db_path = os.path.join(DATA_DIR, "season.db")
    db = sqlite3.connect(db_path)
    db.execute(
        "CREATE TABLE IF NOT EXISTS prospect_rankings "
        "(mlb_id INTEGER PRIMARY KEY, name TEXT, position TEXT, "
        "organization TEXT, fv_grade INTEGER, overall_rank INTEGER, "
        "eta TEXT, current_level TEXT, on_40_man INTEGER, "
        "last_updated TEXT, raw_data TEXT)"
    )
    db.execute(
        "CREATE TABLE IF NOT EXISTS prospect_alerts "
        "(id INTEGER PRIMARY KEY AUTOINCREMENT, player_id INTEGER, "
        "player_name TEXT, alert_type TEXT, description TEXT, "
        "date TEXT, processed INTEGER DEFAULT 0, created_at TEXT, "
        "UNIQUE(player_id, alert_type, date))"
    )
    db.execute(
        "CREATE TABLE IF NOT EXISTS prospect_watchlist "
        "(mlb_id INTEGER PRIMARY KEY, name TEXT, added_date TEXT, "
        "last_probability REAL, notes TEXT)"
    )
    db.execute(
        "CREATE TABLE IF NOT EXISTS prospect_stat_snapshots "
        "(id INTEGER PRIMARY KEY AUTOINCREMENT, mlb_id INTEGER, "
        "snapshot_date TEXT, level TEXT, stats_json TEXT, "
        "readiness_score REAL, callup_probability REAL, "
        "UNIQUE(mlb_id, snapshot_date))"
    )
    db.commit()
    return db


# ============================================================
# MLB Stats API Functions
# ============================================================

def search_player_by_name(name):
    """Search MLB API for a player by name."""
    cache_key = "search:" + str(name)
    cached = cache_get(_cache, cache_key, TTL_PROSPECT)
    if cached is not None:
        return cached
    try:
        # Include MiLB sport IDs (11=AAA, 12=AA, 13=High-A, 14=Low-A)
        # so the search returns minor leaguers, not just MLB players
        encoded_name = urllib.parse.quote(str(name))
        endpoint = "/people/search?names=" + encoded_name + "&sportIds=1,11,12,13,14"
        data = mlb_fetch(endpoint)
        results = []
        for row in data.get("people", []):
            results.append({
                "id": row.get("id"),
                "fullName": row.get("fullName", ""),
                "primaryPosition": row.get("primaryPosition", {}).get("abbreviation", ""),
                "currentTeam": row.get("currentTeam", {}).get("name", ""),
                "birthDate": row.get("birthDate", ""),
                "active": row.get("active", False),
            })
        cache_set(_cache, cache_key, results)
        return results
    except Exception as e:
        print("Warning: search_player_by_name failed for " + str(name) + ": " + str(e))
        return []


def fetch_player_info(player_id):
    """Fetch detailed player info including draft data."""
    cache_key = "info:" + str(player_id)
    cached = cache_get(_cache, cache_key, TTL_PROSPECT)
    if cached is not None:
        return cached
    try:
        endpoint = "/people/" + str(player_id) + "?hydrate=currentTeam,draft"
        data = mlb_fetch(endpoint)
        people = data.get("people", [])
        if not people:
            return {}
        info = people[0]
        result = {
            "id": info.get("id"),
            "fullName": info.get("fullName", ""),
            "primaryPosition": info.get("primaryPosition", {}).get("abbreviation", ""),
            "batSide": info.get("batSide", {}).get("code", ""),
            "pitchHand": info.get("pitchHand", {}).get("code", ""),
            "birthDate": info.get("birthDate", ""),
            "height": info.get("height", ""),
            "weight": info.get("weight", 0),
            "currentTeam": info.get("currentTeam", {}).get("name", ""),
            "currentTeamId": info.get("currentTeam", {}).get("id"),
            "active": info.get("active", False),
            "mlbDebutDate": info.get("mlbDebutDate", ""),
            "draftYear": info.get("draftYear"),
        }
        cache_set(_cache, cache_key, result)
        return result
    except Exception as e:
        print("Warning: fetch_player_info failed for " + str(player_id) + ": " + str(e))
        return {}


def fetch_player_milb_stats(player_id, season=None):
    """Fetch MiLB season stats for a player (hitting and pitching)."""
    if season is None:
        season = YEAR
    cache_key = "milb_stats:" + str(player_id) + ":" + str(season)
    cached = cache_get(_cache, cache_key, TTL_PROSPECT)
    if cached is not None:
        return cached
    try:
        result = {"hitting": [], "pitching": []}
        # Stats endpoint requires individual sportId per call (no comma-separated).
        # Try AAA first; stop once we find data at any level.
        for sid in [11, 12, 13, 14]:  # AAA, AA, High-A, Low-A
            if result.get("hitting") or result.get("pitching"):
                break  # Found stats at a higher level, skip lower levels
            for group in ["hitting", "pitching"]:
                endpoint = (
                    "/people/" + str(player_id)
                    + "/stats?stats=season&group=" + group
                    + "&sportId=" + str(sid)
                    + "&season=" + str(season)
                )
                data = mlb_fetch(endpoint)
                for stat_group in data.get("stats", []):
                    for split in stat_group.get("splits", []):
                        team_info = split.get("team", {})
                        sport = split.get("sport", {})
                        sport_name = sport.get("name", "")
                        stat = split.get("stat", {})
                        entry = {
                            "team": team_info.get("name", ""),
                            "teamId": team_info.get("id"),
                            "level": sport_name,
                            "sportId": sport.get("id"),
                            "stats": stat,
                        }
                        result.get(group, []).append(entry)
        # Fallback: also check previous season if current is empty
        if not result.get("hitting") and not result.get("pitching") and season == YEAR:
            prev = fetch_player_milb_stats(player_id, season=YEAR - 1)
            if prev.get("hitting") or prev.get("pitching"):
                result = prev
                result["fallback_season"] = YEAR - 1
        cache_set(_cache, cache_key, result)
        return result
    except Exception as e:
        print("Warning: fetch_player_milb_stats failed for " + str(player_id) + ": " + str(e))
        return {"hitting": [], "pitching": []}


def fetch_40_man_roster(team_id):
    """Fetch 40-man roster for a team."""
    cache_key = "40man:" + str(team_id)
    cached = cache_get(_cache, cache_key, TTL_ROSTER)
    if cached is not None:
        return cached
    try:
        endpoint = "/teams/" + str(team_id) + "/roster/40Man"
        data = mlb_fetch(endpoint)
        roster = []
        for entry in data.get("roster", []):
            person = entry.get("person", {})
            roster.append({
                "id": person.get("id"),
                "fullName": person.get("fullName", ""),
                "position": entry.get("position", {}).get("abbreviation", ""),
                "status": entry.get("status", {}).get("description", ""),
            })
        cache_set(_cache, cache_key, roster)
        return roster
    except Exception as e:
        print("Warning: fetch_40_man_roster failed for team " + str(team_id) + ": " + str(e))
        return []


def fetch_milb_roster(team_id, level):
    """Fetch MiLB roster for a team at a specific level."""
    sport_id = MILB_SPORT_IDS.get(level, 11)
    cache_key = "milb_roster:" + str(team_id) + ":" + str(level)
    cached = cache_get(_cache, cache_key, TTL_ROSTER)
    if cached is not None:
        return cached
    try:
        endpoint = (
            "/teams/" + str(team_id)
            + "/roster?rosterType=fullSeason&sportId=" + str(sport_id)
        )
        data = mlb_fetch(endpoint)
        roster = []
        for entry in data.get("roster", []):
            person = entry.get("person", {})
            roster.append({
                "id": person.get("id"),
                "fullName": person.get("fullName", ""),
                "position": entry.get("position", {}).get("abbreviation", ""),
                "status": entry.get("status", {}).get("description", ""),
            })
        cache_set(_cache, cache_key, roster)
        return roster
    except Exception as e:
        print("Warning: fetch_milb_roster failed for team " + str(team_id)
              + " level " + str(level) + ": " + str(e))
        return []


# ============================================================
# Evaluation Engine
# ============================================================

def _compute_age(birth_date_str):
    """Compute current age from birth date string (YYYY-MM-DD)."""
    try:
        bd = datetime.strptime(birth_date_str, "%Y-%m-%d").date()
        today = date.today()
        age = today.year - bd.year
        if (today.month, today.day) < (bd.month, bd.day):
            age -= 1
        return age
    except Exception:
        return 25  # default assumption


def evaluate_hitter_prospect(stats, age, level):
    """Evaluate a hitter prospect with weighted composite scoring.

    Weights: K% (25), ISO (25), Age-context (25), OPS (25)
    Returns dict with readiness_score, strengths, concerns, grade.
    """
    bench = LEVEL_BENCHMARKS.get(level, LEVEL_BENCHMARKS.get("AAA"))

    # Detect zero/missing stats (preseason)
    ab = _safe_float(stats.get("atBats", 0))
    gp = _safe_float(stats.get("gamesPlayed", 0))
    if ab < 10 or gp < 3:
        # No meaningful stats — use scouting-based evaluation (age + level only)
        level_age_targets = {"AAA": 24, "AA": 22, "High-A": 21, "Low-A": 20}
        target_age = level_age_targets.get(level, 23)
        age_diff = target_age - age
        age_score = max(0, min(100, 50 + age_diff * 15))
        strengths = []
        concerns = ["Awaiting regular season stats"]
        if age <= target_age - 2:
            strengths.append("Young for level (age " + str(age) + " at " + level + ")")
        elif age >= target_age + 2:
            concerns.append("Old for level (age " + str(age) + " at " + level + ")")
        # Base readiness on age context alone — 50% weight
        readiness = age_score * 0.50 + 25  # baseline 25 + up to 50 from age
        readiness = max(10, min(90, readiness))
        grade = "B" if readiness >= 50 else "C+" if readiness >= 40 else "C"
        return {
            "readiness_score": round(readiness, 1),
            "strengths": strengths,
            "concerns": concerns,
            "grade": grade,
            "stats_status": "no_data",
            "components": {"age_score": round(age_score, 1)},
        }

    strengths = []
    concerns = []

    # -- K% score (lower is better) --
    so = _safe_float(stats.get("strikeOuts", 0))
    k_pct = (so / ab * 100) if ab > 0 else 25.0
    k_score = max(0, min(100, 100 - (k_pct - 15) * 3))
    if k_pct < 18:
        strengths.append("Elite contact (" + str(round(k_pct, 1)) + "% K)")
    elif k_pct > 28:
        concerns.append("High strikeout rate (" + str(round(k_pct, 1)) + "% K)")

    # -- ISO score (power indicator = SLG - AVG) --
    avg = _safe_float(stats.get("avg", 0))
    slg = _safe_float(stats.get("slg", 0))
    iso = slg - avg
    iso_score = max(0, min(100, iso * 500))
    if iso > .200:
        strengths.append("Plus power (ISO " + str(round(iso, 3)) + ")")
    elif iso < .100:
        concerns.append("Limited power (ISO " + str(round(iso, 3)) + ")")

    # -- Age-context score (younger at higher level = better) --
    level_age_targets = {"AAA": 24, "AA": 22, "High-A": 21, "Low-A": 20}
    target_age = level_age_targets.get(level, 23)
    age_diff = target_age - age
    age_score = max(0, min(100, 50 + age_diff * 15))
    if age <= target_age - 2:
        strengths.append("Young for level (age " + str(age) + " at " + level + ")")
    elif age >= target_age + 2:
        concerns.append("Old for level (age " + str(age) + " at " + level + ")")

    # -- OPS score --
    obp = _safe_float(stats.get("obp", 0))
    ops = obp + slg
    bench_ops = bench.get("obp", .340) + bench.get("slg", .420)
    ops_ratio = ops / bench_ops if bench_ops > 0 else 1.0
    ops_score = max(0, min(100, ops_ratio * 60 + 20))
    if ops > .900:
        strengths.append("Elite OPS (" + str(round(ops, 3)) + ")")
    elif ops < .650:
        concerns.append("Below-average OPS (" + str(round(ops, 3)) + ")")

    # -- Weighted composite --
    readiness = (k_score * 0.25 + iso_score * 0.25
                 + age_score * 0.25 + ops_score * 0.25)
    readiness = max(0, min(100, readiness))

    # Grade assignment
    if readiness >= 80:
        grade = "A"
    elif readiness >= 70:
        grade = "A-"
    elif readiness >= 60:
        grade = "B+"
    elif readiness >= 50:
        grade = "B"
    elif readiness >= 40:
        grade = "B-"
    elif readiness >= 30:
        grade = "C+"
    elif readiness >= 20:
        grade = "C"
    else:
        grade = "D"

    return {
        "readiness_score": round(readiness, 1),
        "strengths": strengths,
        "concerns": concerns,
        "grade": grade,
        "components": {
            "k_pct_score": round(k_score, 1),
            "iso_score": round(iso_score, 1),
            "age_score": round(age_score, 1),
            "ops_score": round(ops_score, 1),
        },
    }


def evaluate_pitcher_prospect(stats, age, level):
    """Evaluate a pitcher prospect with weighted composite scoring.

    Weights: K-BB% (30), K/9 (25), BB/9 (20), Age (15), ERA (10)
    Returns dict with readiness_score, strengths, concerns, grade.
    """
    bench = LEVEL_BENCHMARKS.get(level, LEVEL_BENCHMARKS.get("AAA"))

    ip = _safe_float(stats.get("inningsPitched", 0))
    gp = _safe_float(stats.get("gamesPlayed", 0))
    if ip < 3 or gp < 2:
        # No meaningful stats — use scouting-based evaluation
        level_age_targets = {"AAA": 25, "AA": 23, "High-A": 22, "Low-A": 21}
        target_age = level_age_targets.get(level, 24)
        age_diff = target_age - age
        age_score = max(0, min(100, 50 + age_diff * 12))
        strengths = []
        concerns = ["Awaiting regular season stats"]
        if age <= target_age - 2:
            strengths.append("Young for level (age " + str(age) + " at " + level + ")")
        elif age >= target_age + 2:
            concerns.append("Old for level (age " + str(age) + " at " + level + ")")
        readiness = age_score * 0.50 + 25
        readiness = max(10, min(90, readiness))
        grade = "B" if readiness >= 50 else "C+" if readiness >= 40 else "C"
        return {
            "readiness_score": round(readiness, 1),
            "strengths": strengths,
            "concerns": concerns,
            "grade": grade,
            "stats_status": "no_data",
            "components": {"age_score": round(age_score, 1)},
        }

    strengths = []
    concerns = []

    # Handle innings pitched as string like "45.2"
    if isinstance(stats.get("inningsPitched"), str) and "." in str(stats.get("inningsPitched", "")):
        parts = str(stats.get("inningsPitched", "0")).split(".")
        ip = _safe_float(parts[0]) + _safe_float(parts[1]) / 3.0

    so = _safe_float(stats.get("strikeOuts", 0))
    bb = _safe_float(stats.get("baseOnBalls", 0))
    era = _safe_float(stats.get("era", 0))

    innings_factor = ip if ip > 0 else 1.0

    # -- K-BB% score (30%) --
    k_per_9 = (so / innings_factor) * 9
    bb_per_9 = (bb / innings_factor) * 9
    k_bb_pct = k_per_9 - bb_per_9
    k_bb_score = max(0, min(100, k_bb_pct * 10 + 20))
    if k_bb_pct > 6:
        strengths.append("Elite K-BB differential (" + str(round(k_bb_pct, 1)) + ")")
    elif k_bb_pct < 2:
        concerns.append("Poor K-BB differential (" + str(round(k_bb_pct, 1)) + ")")

    # -- K/9 score (25%) --
    bench_k9 = bench.get("k_per_9", 9.0)
    k9_ratio = k_per_9 / bench_k9 if bench_k9 > 0 else 1.0
    k9_score = max(0, min(100, k9_ratio * 55 + 10))
    if k_per_9 > 11:
        strengths.append("High strikeout rate (" + str(round(k_per_9, 1)) + " K/9)")
    elif k_per_9 < 6:
        concerns.append("Low strikeout rate (" + str(round(k_per_9, 1)) + " K/9)")

    # -- BB/9 score (20%, lower is better) --
    bench_bb9 = bench.get("bb_per_9", 3.8)
    bb9_ratio = bench_bb9 / bb_per_9 if bb_per_9 > 0 else 1.5
    bb9_score = max(0, min(100, bb9_ratio * 45 + 10))
    if bb_per_9 < 2.5:
        strengths.append("Elite command (" + str(round(bb_per_9, 1)) + " BB/9)")
    elif bb_per_9 > 5.0:
        concerns.append("Control issues (" + str(round(bb_per_9, 1)) + " BB/9)")

    # -- Age score (15%) --
    level_age_targets = {"AAA": 25, "AA": 23, "High-A": 22, "Low-A": 21}
    target_age = level_age_targets.get(level, 24)
    age_diff = target_age - age
    age_score = max(0, min(100, 50 + age_diff * 12))
    if age <= target_age - 2:
        strengths.append("Young for level (age " + str(age) + " at " + level + ")")
    elif age >= target_age + 2:
        concerns.append("Old for level (age " + str(age) + " at " + level + ")")

    # -- ERA score (10%) --
    bench_era = bench.get("era", 4.50)
    era_ratio = bench_era / era if era > 0 else 1.5
    era_score = max(0, min(100, era_ratio * 50 + 10))
    if era < 3.00:
        strengths.append("Dominant ERA (" + str(round(era, 2)) + ")")
    elif era > 5.50:
        concerns.append("Elevated ERA (" + str(round(era, 2)) + ")")

    # -- Weighted composite --
    readiness = (k_bb_score * 0.30 + k9_score * 0.25 + bb9_score * 0.20
                 + age_score * 0.15 + era_score * 0.10)
    readiness = max(0, min(100, readiness))

    # Grade assignment
    if readiness >= 75:
        grade = "A"
    elif readiness >= 65:
        grade = "A-"
    elif readiness >= 55:
        grade = "B+"
    elif readiness >= 45:
        grade = "B"
    elif readiness >= 35:
        grade = "B-"
    elif readiness >= 25:
        grade = "C+"
    elif readiness >= 15:
        grade = "C"
    else:
        grade = "D"

    return {
        "readiness_score": round(readiness, 1),
        "strengths": strengths,
        "concerns": concerns,
        "grade": grade,
        "components": {
            "k_bb_score": round(k_bb_score, 1),
            "k9_score": round(k9_score, 1),
            "bb9_score": round(bb9_score, 1),
            "age_score": round(age_score, 1),
            "era_score": round(era_score, 1),
        },
    }


# ============================================================
# Call-up Probability Engine
# ============================================================

def compute_callup_probability(evaluation, is_on_40_man,
                               team_contending=True, days_into_season=0,
                               fv_grade=None, current_level=None,
                               prospect_name=""):
    """Compute call-up probability (0-100) with classification.

    Factors:
    - Statistical readiness (25%)
    - 40-man status (20%)
    - Service time window (20%)
    - Org need / contention (20%)
    - Days into season (15%)

    Returns dict with probability, classification, factors list.
    """
    factors = []

    # -- Statistical readiness (25%) --
    readiness = evaluation.get("readiness_score", 0)
    stat_score = readiness
    factors.append("Readiness: " + str(round(readiness, 1)) + "/100")

    # FV grade bonus — differentiates when stats are unavailable
    fv_bonus = 0
    if fv_grade:
        if fv_grade >= 70:
            fv_bonus = 20
        elif fv_grade >= 60:
            fv_bonus = 12
        elif fv_grade >= 55:
            fv_bonus = 6
        elif fv_grade >= 50:
            fv_bonus = 2
        stat_score = min(100, stat_score + fv_bonus)
        factors.append("FV " + str(fv_grade) + " (+" + str(fv_bonus) + " bonus)")

    # Level proximity bonus — AAA prospects are closer to the show
    level_bonus = 0
    if current_level:
        level_bonuses = {"AAA": 15, "AA": 8, "High-A": 3, "Low-A": 0, "ST": 0, "MLB": 20}
        level_bonus = level_bonuses.get(current_level, 0)
        if level_bonus != 0:
            stat_score = max(0, min(100, stat_score + level_bonus))
            factors.append("Level: " + current_level + " (+" + str(level_bonus) + ")")

    # -- 40-man status (20%) --
    if is_on_40_man:
        man40_score = 85
        factors.append("On 40-man roster (high)")
    else:
        man40_score = 25
        factors.append("Not on 40-man (barrier)")

    # -- Service time window (20%) --
    today = date.today()
    svc_score = 40  # default mid-range
    try:
        manipulation_date = datetime.strptime(
            SEASON_DATES.get("mid_april_manipulation", "2026-04-15"), "%Y-%m-%d"
        ).date()
        super_two = datetime.strptime(
            SEASON_DATES.get("super_two", "2026-06-15"), "%Y-%m-%d"
        ).date()
        sept_date = datetime.strptime(
            SEASON_DATES.get("september_expansion", "2026-09-01"), "%Y-%m-%d"
        ).date()

        if today >= sept_date:
            svc_score = 90
            factors.append("September expansion window")
        elif today >= super_two:
            svc_score = 65
            factors.append("Past Super Two cutoff")
        elif today >= manipulation_date:
            svc_score = 55
            factors.append("Past service time manipulation date")
        elif days_into_season == 0:
            svc_score = 35
            factors.append("Pre-season (Opening Day roster possible)")
        else:
            svc_score = 20
            factors.append("Service time manipulation window (low)")
    except Exception:
        factors.append("Service time: unable to compute")

    # -- Org need / contention (20%) --
    if team_contending:
        need_score = 70
        factors.append("Team contending (urgency)")
    else:
        need_score = 40
        factors.append("Team rebuilding (less urgency)")

    # -- Days into season (15%) --
    if days_into_season == 0:
        season_score = 30
    elif days_into_season < 30:
        season_score = 40
    elif days_into_season < 90:
        season_score = 60
    elif days_into_season < 150:
        season_score = 75
    else:
        season_score = 90  # September
    factors.append("Day " + str(days_into_season) + " of season")

    # -- Weighted probability --
    probability = (stat_score * 0.25 + man40_score * 0.20 + svc_score * 0.20
                   + need_score * 0.20 + season_score * 0.15)
    probability = max(0, min(100, probability))

    # -- News sentiment overlay --
    try:
        from prospect_news import get_stored_signals, compute_ensemble_callup_probability

        if prospect_name:
            news_signals = get_stored_signals(prospect_name, days=14)
            if news_signals:
                ensemble = compute_ensemble_callup_probability(
                    stat_based_probability=probability,
                    news_signals=news_signals,
                )
                probability = ensemble.get("ensemble_probability", probability)
                news_delta = ensemble.get("news_delta", 0)
                if news_delta >= 2:
                    factors.append("News sentiment BULLISH (+" + str(round(news_delta, 1)) + "pp, " + str(ensemble.get("signal_count", 0)) + " signals)")
                elif news_delta <= -2:
                    factors.append("News sentiment BEARISH (" + str(round(news_delta, 1)) + "pp, " + str(ensemble.get("signal_count", 0)) + " signals)")
                if ensemble.get("has_strong_signal"):
                    factors.append("STRONG NEWS: confirmed/imminent call-up report detected")
    except ImportError:
        pass  # prospect_news module not yet available
    except Exception as e:
        print("[prospects] News overlay error: " + str(e))

    # Classification
    if probability >= 75:
        classification = "IMMINENT"
    elif probability >= 55:
        classification = "LIKELY"
    elif probability >= 35:
        classification = "POSSIBLE"
    else:
        classification = "UNLIKELY"

    return {
        "probability": round(probability, 1),
        "classification": classification,
        "factors": factors,
    }


# ============================================================
# Stash Advisor
# ============================================================

def recommend_stash_action(prospect_eval, callup_prob, na_slots_available=0):
    """Recommend fantasy stash action for a prospect.

    Returns dict with action, confidence, reasons list.
    Actions: STASH_NOW, STASH_NA, WATCHLIST, PASS
    """
    readiness = prospect_eval.get("readiness_score", 0)
    prob = callup_prob.get("probability", 0)
    classification = callup_prob.get("classification", "UNLIKELY")
    grade = prospect_eval.get("grade", "C")
    reasons = []

    # High-priority stash: imminent call-up + ready
    if classification == "IMMINENT" and readiness >= 60:
        action = "STASH_NOW"
        confidence = min(95, prob + 10)
        reasons.append("Call-up classified as IMMINENT")
        reasons.append("Readiness score " + str(round(readiness, 1)) + " exceeds threshold")

    # NA-eligible stash if slots available
    elif classification in ("IMMINENT", "LIKELY") and na_slots_available > 0:
        action = "STASH_NA"
        confidence = min(85, prob + 5)
        reasons.append("NA slot available — low roster cost")
        reasons.append("Call-up classified as " + classification)

    # Likely call-up but no NA slots
    elif classification == "LIKELY" and readiness >= 50:
        action = "STASH_NOW"
        confidence = min(80, prob)
        reasons.append("Call-up classified as LIKELY")
        reasons.append("Grade " + grade + " — fantasy-relevant upside")

    # Watchlist: possible call-up or good prospect but not imminent
    elif classification == "POSSIBLE" or readiness >= 45:
        action = "WATCHLIST"
        confidence = min(60, prob)
        reasons.append("Call-up POSSIBLE but not imminent")
        if readiness >= 45:
            reasons.append("Readiness " + str(round(readiness, 1)) + " — approaching threshold")
        else:
            reasons.append("Monitor for breakout or org changes")

    # Pass on everything else
    else:
        action = "PASS"
        confidence = max(10, 100 - prob)
        reasons.append("Call-up unlikely in near term")
        if readiness < 40:
            reasons.append("Readiness " + str(round(readiness, 1)) + " — needs more development")

    return {
        "action": action,
        "confidence": round(confidence, 1),
        "reasons": reasons,
    }


# ============================================================
# Reddit Prospect Buzz
# ============================================================

def fetch_prospect_buzz():
    """Fetch recent prospect-related posts from Reddit."""
    cache_key = "prospect_buzz"
    cached = cache_get(_cache, cache_key, TTL_BUZZ)
    if cached is not None:
        return cached

    results = []
    search_terms = ["prospect", "call-up", "callup", "promotion", "minors"]

    for subreddit in ["fantasybaseball", "baseball"]:
        for term in search_terms[:2]:  # limit queries to avoid rate limiting
            try:
                path = ("/r/" + subreddit
                        + "/search.json?q=" + term
                        + "&sort=new&restrict_sr=on&limit=10&t=week")
                data = reddit_get(path)
                if data is None:
                    continue
                posts = data.get("data", {}).get("children", [])
                for post in posts:
                    pdata = post.get("data", {})
                    title = pdata.get("title", "")
                    title_lower = title.lower()
                    # Only include posts with prospect/callup keywords
                    if any(kw in title_lower for kw in search_terms):
                        results.append({
                            "title": title,
                            "score": pdata.get("score", 0),
                            "num_comments": pdata.get("num_comments", 0),
                            "url": "https://reddit.com" + pdata.get("permalink", ""),
                            "subreddit": subreddit,
                            "created": pdata.get("created_utc", 0),
                        })
            except Exception as e:
                print("Warning: Reddit search failed for " + subreddit
                      + "/" + term + ": " + str(e))

    # Deduplicate by URL
    seen_urls = set()
    deduped = []
    for post in results:
        url = post.get("url", "")
        if url not in seen_urls:
            seen_urls.add(url)
            deduped.append(post)

    # Sort by score descending
    deduped.sort(key=lambda p: p.get("score", 0), reverse=True)
    cache_set(_cache, cache_key, deduped)
    return deduped


# ============================================================
# Rankings Loader
# ============================================================

def _load_prospect_rankings():
    """Load prospect rankings from JSON file or SQLite fallback."""
    cache_key = "prospect_rankings_loaded"
    cached = cache_get(_cache, cache_key, TTL_RANKINGS)
    if cached is not None:
        return cached

    # Try JSON file first
    json_path = os.path.join(DATA_DIR, "prospect_rankings.json")
    try:
        if os.path.exists(json_path):
            with open(json_path, "r") as fh:
                raw = json.load(fh)
            # Support both formats: list or {"prospects": [...]}
            if isinstance(raw, list):
                rankings = raw
            elif isinstance(raw, dict):
                rankings = raw.get("prospects", [])
            else:
                rankings = []
            if isinstance(rankings, list) and len(rankings) > 0:
                cache_set(_cache, cache_key, rankings)
                return rankings
    except Exception as e:
        print("Warning: could not load prospect_rankings.json: " + str(e))

    # Fallback to SQLite
    try:
        db = _get_prospect_db()
        cursor = db.execute(
            "SELECT mlb_id, name, position, organization, fv_grade, "
            "overall_rank, eta, current_level, on_40_man, raw_data "
            "FROM prospect_rankings ORDER BY overall_rank ASC"
        )
        rankings = []
        for row in cursor.fetchall():
            entry = {
                "mlb_id": row[0],
                "name": row[1],
                "position": row[2],
                "organization": row[3],
                "fv_grade": row[4],
                "overall_rank": row[5],
                "eta": row[6],
                "current_level": row[7],
                "on_40_man": bool(row[8]),
            }
            # Merge raw_data if present
            if row[9]:
                try:
                    extra = json.loads(row[9])
                    for k, v in extra.items():
                        if k not in entry:
                            entry[k] = v
                except Exception:
                    pass
            rankings.append(entry)
        if rankings:
            cache_set(_cache, cache_key, rankings)
            return rankings
    except Exception as e:
        print("Warning: could not load prospect rankings from SQLite: " + str(e))

    return []


def _get_rank_lookup():
    """Get normalized name -> ranking entry lookup dict."""
    cache_key = "rank_lookup"
    cached = cache_get(_cache, cache_key, TTL_RANKINGS)
    if cached is not None:
        return cached
    rankings = _load_prospect_rankings()
    lookup = {}
    for rk in rankings:
        norm = normalize_player_name(rk.get("name", ""))
        if norm:
            lookup[norm] = rk
    cache_set(_cache, cache_key, lookup)
    return lookup


def _evaluate_prospect_by_id(player_id, ranking_entry=None, skip_news=False):
    """Full prospect evaluation for a player ID. Returns dict with info, evaluation, callup, is_on_40_man, level, stats."""
    info = fetch_player_info(player_id)
    if not info:
        return None
    pos = info.get("primaryPosition", "")
    age = _compute_age(info.get("birthDate", ""))
    is_pitcher = pos in PITCHER_POSITIONS
    milb_stats = fetch_player_milb_stats(player_id)
    stat_entries = milb_stats.get("pitching", []) if is_pitcher else milb_stats.get("hitting", [])
    stats = {}
    api_level = "AAA"
    has_meaningful_stats = False
    if stat_entries:
        best = stat_entries[0]
        for entry in stat_entries:
            sid = entry.get("sportId", 999)
            if sid and sid < best.get("sportId", 999):
                best = entry
        stats = best.get("stats", {})
        api_level = _normalize_level(best.get("level", "AAA"))
        # Check if stats are meaningful
        gp = _safe_float(stats.get("gamesPlayed", 0))
        ab = _safe_float(stats.get("atBats", 0))
        ip_raw = _safe_float(stats.get("inningsPitched", 0))
        has_meaningful_stats = (gp >= 3 and (ab >= 10 or ip_raw >= 3))
    level = _resolve_prospect_level(ranking_entry, api_level, has_meaningful_stats)
    if is_pitcher:
        evaluation = evaluate_pitcher_prospect(stats, age, level)
    else:
        evaluation = evaluate_hitter_prospect(stats, age, level)
    is_on_40_man = False
    if ranking_entry:
        is_on_40_man = bool(ranking_entry.get("on_40_man", False))
    else:
        team_id = info.get("currentTeamId")
        if team_id:
            roster_40 = fetch_40_man_roster(team_id)
            is_on_40_man = any(p.get("id") == player_id for p in roster_40)
    days = _get_days_into_season()
    fv = ranking_entry.get("fv_grade") if ranking_entry else None
    level_from_ranking = ranking_entry.get("current_level") if ranking_entry else None
    pname = "" if skip_news else info.get("fullName", "")
    callup = compute_callup_probability(
        evaluation, is_on_40_man, days_into_season=days,
        fv_grade=fv, current_level=level_from_ranking or level,
        prospect_name=pname
    )
    return {
        "info": info,
        "pos": pos,
        "age": age,
        "level": level,
        "stats": stats,
        "evaluation": evaluation,
        "callup": callup,
        "is_on_40_man": is_on_40_man,
    }


# ============================================================
# Command Handlers
# ============================================================

def cmd_prospect_report(args, as_json=False):
    """Full prospect evaluation report for a single player"""
    if not args:
        if as_json:
            return {"error": "Player name required"}
        print("Usage: prospect-report <player name>")
        return
    name = " ".join(args)
    try:
        # Resolve player ID
        player_id = get_mlb_id(name)
        if not player_id:
            results = search_player_by_name(name)
            if results:
                player_id = results[0].get("id")
        if not player_id:
            if as_json:
                return {"error": "Player not found: " + name}
            print("Player not found: " + name)
            return

        # Get player info
        info = fetch_player_info(player_id)
        if not info:
            if as_json:
                return {"error": "Could not fetch info for player ID " + str(player_id)}
            print("Could not fetch info for player ID " + str(player_id))
            return

        # Get MiLB stats
        milb_stats = fetch_player_milb_stats(player_id)

        # Determine position type and evaluate
        pos = info.get("primaryPosition", "")
        age = _compute_age(info.get("birthDate", ""))
        is_pitcher = pos in PITCHER_POSITIONS

        # Check prospect rankings for additional context (before level resolution)
        fv_grade = None
        overall_rank = None
        eta = None
        rank_lookup = _get_rank_lookup()
        norm_name = normalize_player_name(name)
        rk_match = rank_lookup.get(norm_name)
        if rk_match:
            fv_grade = rk_match.get("fv_grade")
            overall_rank = rk_match.get("overall_rank")
            eta = rk_match.get("eta")

        # Find highest-level stats with spring training level protection
        stat_entries = milb_stats.get("pitching", []) if is_pitcher else milb_stats.get("hitting", [])
        api_level = "AAA"
        has_meaningful_stats = False
        stats = {}
        if stat_entries:
            best = stat_entries[0]
            for entry in stat_entries:
                sid = entry.get("sportId", 999)
                if sid and sid < best.get("sportId", 999):
                    best = entry
            stats = best.get("stats", {})
            api_level = _normalize_level(best.get("level", "AAA"))
            gp = _safe_float(stats.get("gamesPlayed", 0))
            ab = _safe_float(stats.get("atBats", 0))
            ip_raw = _safe_float(stats.get("inningsPitched", 0))
            has_meaningful_stats = (gp >= 3 and (ab >= 10 or ip_raw >= 3))
        level = _resolve_prospect_level(rk_match, api_level, has_meaningful_stats)

        if is_pitcher:
            evaluation = evaluate_pitcher_prospect(stats, age, level)
        else:
            evaluation = evaluate_hitter_prospect(stats, age, level)

        # Check 40-man status — prefer ranking data over API check
        is_on_40_man = False
        if rk_match and "on_40_man" in rk_match:
            is_on_40_man = bool(rk_match.get("on_40_man", False))
        else:
            team_id = info.get("currentTeamId")
            if team_id:
                roster_40 = fetch_40_man_roster(team_id)
                is_on_40_man = any(p.get("id") == player_id for p in roster_40)

        # Call-up probability
        days = _get_days_into_season()
        callup = compute_callup_probability(
            evaluation, is_on_40_man, days_into_season=days,
            fv_grade=fv_grade, current_level=level,
            prospect_name=info.get("fullName", name)
        )

        # Stash recommendation
        stash = recommend_stash_action(evaluation, callup)

        report = {
            "name": info.get("fullName", name),
            "player_id": player_id,
            "position": pos,
            "age": age,
            "organization": info.get("currentTeam", ""),
            "current_level": level,
            "on_40_man": is_on_40_man,
            "fv_grade": fv_grade,
            "fv_label": FV_SCALE.get(fv_grade, "") if fv_grade else None,
            "overall_rank": overall_rank,
            "eta": eta,
            "evaluation": evaluation,
            "callup_probability": callup,
            "stash_recommendation": stash,
            "stats_summary": stats,
        }

        if as_json:
            return report

        # CLI output
        print("Prospect Report: " + info.get("fullName", name))
        print("=" * 60)
        print("  Position: " + pos + "  |  Age: " + str(age)
              + "  |  Level: " + level)
        print("  Team: " + info.get("currentTeam", "Unknown"))
        print("  40-Man: " + ("Yes" if is_on_40_man else "No"))
        if fv_grade:
            print("  FV Grade: " + str(fv_grade) + " ("
                  + FV_SCALE.get(fv_grade, "") + ")")
        if overall_rank:
            print("  Overall Rank: #" + str(overall_rank))
        print("")
        print("Evaluation: " + evaluation.get("grade", "?")
              + " (Readiness: " + str(evaluation.get("readiness_score", 0)) + "/100)")
        if evaluation.get("strengths"):
            print("  Strengths: " + ", ".join(evaluation.get("strengths", [])))
        if evaluation.get("concerns"):
            print("  Concerns: " + ", ".join(evaluation.get("concerns", [])))
        print("")
        print("Call-up: " + callup.get("classification", "?")
              + " (" + str(callup.get("probability", 0)) + "%)")
        for factor in callup.get("factors", []):
            print("  - " + factor)
        print("")
        print("Stash: " + stash.get("action", "?")
              + " (confidence " + str(stash.get("confidence", 0)) + "%)")
        for reason in stash.get("reasons", []):
            print("  - " + reason)

    except Exception as e:
        if as_json:
            return {"error": "Prospect report failed: " + str(e)}
        print("Error generating prospect report: " + str(e))


POSITION_GROUPS = {
    "OF": {"LF", "CF", "RF", "OF"},
    "IF": {"1B", "2B", "3B", "SS"},
    "MI": {"2B", "SS"},
    "CI": {"1B", "3B"},
}


def cmd_prospect_rankings(args, as_json=False):
    """Browse prospect rankings with optional filters"""
    # Parse args
    position_filter = None
    level_filter = None
    team_filter = None
    count = 20

    for arg in (args or []):
        if arg.startswith("--position="):
            position_filter = arg.split("=", 1)[1]
        elif arg.startswith("--level="):
            level_filter = arg.split("=", 1)[1]
        elif arg.startswith("--team="):
            team_filter = arg.split("=", 1)[1].lower()
        elif arg.startswith("--count="):
            try:
                count = int(arg.split("=", 1)[1])
            except ValueError:
                count = 20

    try:
        rankings = _load_prospect_rankings()
        if not rankings:
            if as_json:
                return {"prospects": [], "note": "No prospect rankings available"}
            print("No prospect rankings available. Place prospect_rankings.json in data/")
            return

        # Apply filters
        filtered = []
        for rk in rankings:
            if position_filter:
                pos = rk.get("position", "")
                pos_parts = [p.strip() for p in pos.split("/")]
                pf_upper = position_filter.upper()
                # Exact match against any position component
                matched = pf_upper in [p.upper() for p in pos_parts]
                # Group match (OF, IF, MI, CI)
                if not matched and pf_upper in POSITION_GROUPS:
                    matched = any(p.upper() in POSITION_GROUPS.get(pf_upper, set()) for p in pos_parts)
                if not matched:
                    continue
            if level_filter:
                lvl = rk.get("current_level", "")
                if level_filter.lower() not in lvl.lower():
                    continue
            if team_filter:
                org = rk.get("organization", "")
                if team_filter not in org.lower():
                    continue
            filtered.append(rk)

        # Enrich with real-time callup probability where possible
        enriched = []
        for rk in filtered[:count]:
            entry = dict(rk)
            mlb_id = rk.get("mlb_id")
            if mlb_id:
                try:
                    result = _evaluate_prospect_by_id(mlb_id, rk)
                    if result:
                        entry["callup_probability"] = result.get("callup", {}).get("probability", 0)
                        entry["callup_classification"] = result.get("callup", {}).get("classification", "")
                        entry["readiness_score"] = result.get("evaluation", {}).get("readiness_score", 0)
                except Exception:
                    entry["callup_probability"] = None
            enriched.append(entry)

        # Sort by composite: rank + callup probability
        def _sort_key(e):
            rank = e.get("overall_rank", 999)
            prob = e.get("callup_probability") or 0
            return rank - (prob * 0.5)
        enriched.sort(key=_sort_key)

        if as_json:
            return {"prospects": enriched, "count": len(enriched)}

        # CLI output
        print("Prospect Rankings")
        if position_filter or level_filter or team_filter:
            filters = []
            if position_filter:
                filters.append("pos=" + position_filter)
            if level_filter:
                filters.append("level=" + level_filter)
            if team_filter:
                filters.append("team=" + team_filter)
            print("  Filters: " + ", ".join(filters))
        print("=" * 70)
        print("  " + "#".rjust(4) + "  " + "Name".ljust(25) + "Pos".ljust(5)
              + "Org".ljust(15) + "FV".ljust(5) + "Level".ljust(8) + "P(call)")
        print("  " + "-" * 66)
        for rk in enriched:
            rank_str = str(rk.get("overall_rank", "?")).rjust(4)
            name_str = str(rk.get("name", "?")).ljust(25)[:25]
            pos_str = str(rk.get("position", "?")).ljust(5)
            org_str = str(rk.get("organization", "?")).ljust(15)[:15]
            fv_str = str(rk.get("fv_grade", "?")).ljust(5)
            lvl_str = str(rk.get("current_level", "?")).ljust(8)
            prob = rk.get("callup_probability")
            prob_str = (str(round(prob)) + "%") if prob is not None else "—"
            print("  " + rank_str + "  " + name_str + pos_str
                  + org_str + fv_str + lvl_str + prob_str)

    except Exception as e:
        if as_json:
            return {"error": "Prospect rankings failed: " + str(e)}
        print("Error loading prospect rankings: " + str(e))


def cmd_callup_wire(args, as_json=False):
    """Recent call-ups and roster moves with fantasy impact"""
    days = 14
    if args:
        try:
            days = int(args[0])
        except ValueError:
            pass

    try:
        # Import intel module for transaction fetching
        intel_mod = importlib.import_module("intel")
        transactions = intel_mod._fetch_mlb_transactions(days=days)
    except Exception as e:
        print("Warning: Could not import intel transactions: " + str(e))
        transactions = []

    if not transactions:
        if as_json:
            return {"transactions": [], "note": "No recent transactions found"}
        print("No recent transactions found")
        return

    # Filter for call-up related moves
    callup_keywords = [
        "recalled", "selected", "contract purchased",
        "promoted", "reinstated", "activated",
    ]
    callups = []
    for tx in transactions:
        desc_lower = tx.get("description", "").lower()
        tx_type = tx.get("type", "").lower()
        is_callup = any(kw in desc_lower or kw in tx_type for kw in callup_keywords)
        if is_callup:
            callups.append(tx)

    # Cross-reference with prospect rankings
    rank_lookup = _get_rank_lookup()

    enriched = []
    for tx in callups:
        entry = dict(tx)
        player_name = tx.get("player_name", "")
        norm = normalize_player_name(player_name)
        ranking_info = rank_lookup.get(norm)
        relevance = 1
        relevance_reasons = []
        if ranking_info:
            entry["prospect_rank"] = ranking_info.get("overall_rank")
            entry["fv_grade"] = ranking_info.get("fv_grade")
            fv = ranking_info.get("fv_grade", 0)
            rank = ranking_info.get("overall_rank", 999)
            if fv >= 65:
                relevance += 4
                relevance_reasons.append("Elite prospect (FV " + str(fv) + ")")
            elif fv >= 55:
                relevance += 3
                relevance_reasons.append("Strong prospect (FV " + str(fv) + ")")
            elif fv >= 50:
                relevance += 2
                relevance_reasons.append("Notable prospect (FV " + str(fv) + ")")
            if rank <= 10:
                relevance += 2
                relevance_reasons.append("Top 10 (#" + str(rank) + ")")
            elif rank <= 25:
                relevance += 1
                relevance_reasons.append("Top 25 (#" + str(rank) + ")")
        # Transaction type bonus
        desc_lower = tx.get("description", "").lower()
        if "selected the contract" in desc_lower or "recalled" in desc_lower:
            relevance += 1
            relevance_reasons.append("Call-up transaction")
        elif "purchased" in desc_lower:
            relevance += 1
        entry["fantasy_relevance"] = min(10, max(1, relevance))
        entry["relevance_reasons"] = relevance_reasons

        # Flag positions that opened up
        desc = tx.get("description", "").lower()
        if "optioned" in desc or "designated" in desc:
            entry["creates_opportunity"] = ["Roster spot opened"]
        else:
            entry["creates_opportunity"] = []

        enriched.append(entry)

    # Deduplicate by player_name + date
    seen = set()
    deduped = []
    for entry in enriched:
        key = entry.get("player_name", "") + "|" + entry.get("date", "")
        if key and key not in seen:
            seen.add(key)
            deduped.append(entry)
    enriched = deduped

    # Sort: ranked prospects first, then by date
    enriched.sort(key=lambda x: (
        0 if x.get("prospect_rank") else 1,
        x.get("prospect_rank", 999),
    ))

    if as_json:
        return {"transactions": enriched, "count": len(enriched), "days": days}

    # CLI output
    print("Call-Up Wire (last " + str(days) + " days)")
    print("=" * 65)
    if not enriched:
        print("  No call-up transactions found")
        return
    for tx in enriched[:25]:
        player = tx.get("player_name", "Unknown")
        team = tx.get("team", "")
        tx_date = tx.get("date", "")
        relevance = tx.get("fantasy_relevance", 0)
        rank = tx.get("prospect_rank")
        rank_label = " [#" + str(rank) + "]" if rank else ""
        print("  " + tx_date + "  " + player.ljust(25) + team.ljust(15)
              + str(relevance) + rank_label)
        desc = tx.get("description", "")
        if desc:
            print("    " + desc[:80])


def cmd_stash_advisor(args, as_json=False):
    """Top prospects to stash with call-up probability"""
    count = 5
    if args:
        try:
            count = int(args[0])
        except ValueError:
            pass

    try:
        rankings = _load_prospect_rankings()
        if not rankings:
            if as_json:
                return {"recommendations": [], "note": "No prospect rankings available"}
            print("No prospect rankings available")
            return

        recommendations = []

        for rk in rankings[:count * 3]:  # evaluate more than needed, then filter
            try:
                mlb_id = rk.get("mlb_id")
                if not mlb_id:
                    continue
                result = _evaluate_prospect_by_id(mlb_id, rk)
                if not result:
                    continue
                evaluation = result.get("evaluation", {})
                callup = result.get("callup", {})
                stash = recommend_stash_action(evaluation, callup)

                recommendations.append({
                    "name": rk.get("name", ""),
                    "position": rk.get("position", result.get("pos", "")),
                    "organization": rk.get("organization", ""),
                    "overall_rank": rk.get("overall_rank"),
                    "fv_grade": rk.get("fv_grade"),
                    "level": result.get("level", "AAA"),
                    "readiness_score": evaluation.get("readiness_score", 0),
                    "grade": evaluation.get("grade", "?"),
                    "callup_probability": callup.get("probability", 0),
                    "classification": callup.get("classification", ""),
                    "action": stash.get("action", "PASS"),
                    "confidence": stash.get("confidence", 0),
                    "reasons": stash.get("reasons", []),
                })
            except Exception as e:
                print("Warning: could not evaluate " + str(rk.get("name", "")) + ": " + str(e))
                continue

        # Sort: STASH_NOW first, then STASH_NA, then WATCHLIST, then PASS
        action_order = {"STASH_NOW": 0, "STASH_NA": 1, "WATCHLIST": 2, "PASS": 3}
        recommendations.sort(key=lambda r: (
            action_order.get(r.get("action", "PASS"), 4),
            -r.get("callup_probability", 0),
        ))

        recommendations = recommendations[:count]

        if as_json:
            return {"recommendations": recommendations, "count": len(recommendations)}

        # CLI output
        print("Stash Advisor — Top " + str(count) + " Recommendations")
        print("=" * 65)
        for i, rec in enumerate(recommendations):
            idx = str(i + 1) + "."
            print("  " + idx.ljust(4) + rec.get("name", "?").ljust(25)
                  + rec.get("position", "?").ljust(5)
                  + rec.get("organization", "?").ljust(15))
            print("       Action: " + rec.get("action", "?")
                  + "  |  Confidence: " + str(rec.get("confidence", 0)) + "%")
            print("       Readiness: " + str(rec.get("readiness_score", 0))
                  + "  |  Call-up: " + str(rec.get("callup_probability", 0))
                  + "% (" + rec.get("classification", "") + ")")
            for reason in rec.get("reasons", []):
                print("       - " + reason)
            print("")

    except Exception as e:
        if as_json:
            return {"error": "Stash advisor failed: " + str(e)}
        print("Error running stash advisor: " + str(e))


def cmd_prospect_compare(args, as_json=False):
    """Side-by-side comparison of two prospects"""
    if len(args) < 2:
        if as_json:
            return {"error": "Two player names required (use quotes for multi-word names)"}
        print("Usage: prospect-compare <player1> <player2>")
        return

    try:
        report_a = cmd_prospect_report([args[0]], as_json=True)
        report_b = cmd_prospect_report([args[1]], as_json=True)

        if not report_a or report_a.get("error"):
            if as_json:
                return {"error": "Could not get report for " + args[0]
                        + ": " + str(report_a.get("error", "unknown"))}
            print("Could not get report for " + args[0])
            return
        if not report_b or report_b.get("error"):
            if as_json:
                return {"error": "Could not get report for " + args[1]
                        + ": " + str(report_b.get("error", "unknown"))}
            print("Could not get report for " + args[1])
            return

        comparison = {
            "player1": report_a,
            "player2": report_b,
            "advantage": {},
        }

        # Determine advantages
        eval_a = report_a.get("evaluation", {})
        eval_b = report_b.get("evaluation", {})
        r_a = eval_a.get("readiness_score", 0)
        r_b = eval_b.get("readiness_score", 0)
        if r_a > r_b:
            comparison["advantage"]["readiness"] = report_a.get("name", "A")
        elif r_b > r_a:
            comparison["advantage"]["readiness"] = report_b.get("name", "B")
        else:
            comparison["advantage"]["readiness"] = "Even"

        cp_a = report_a.get("callup_probability", {}).get("probability", 0)
        cp_b = report_b.get("callup_probability", {}).get("probability", 0)
        if cp_a > cp_b:
            comparison["advantage"]["callup"] = report_a.get("name", "A")
        elif cp_b > cp_a:
            comparison["advantage"]["callup"] = report_b.get("name", "B")
        else:
            comparison["advantage"]["callup"] = "Even"

        if as_json:
            return comparison

        # CLI output
        name_a = report_a.get("name", args[0])
        name_b = report_b.get("name", args[1])
        print("Prospect Comparison")
        print("=" * 60)
        print("  " + "".ljust(20) + name_a.ljust(20) + name_b.ljust(20))
        print("  " + "-" * 58)
        print("  " + "Position".ljust(20)
              + str(report_a.get("position", "?")).ljust(20)
              + str(report_b.get("position", "?")).ljust(20))
        print("  " + "Age".ljust(20)
              + str(report_a.get("age", "?")).ljust(20)
              + str(report_b.get("age", "?")).ljust(20))
        print("  " + "Level".ljust(20)
              + str(report_a.get("current_level", "?")).ljust(20)
              + str(report_b.get("current_level", "?")).ljust(20))
        print("  " + "Grade".ljust(20)
              + str(eval_a.get("grade", "?")).ljust(20)
              + str(eval_b.get("grade", "?")).ljust(20))
        print("  " + "Readiness".ljust(20)
              + str(r_a).ljust(20)
              + str(r_b).ljust(20))
        print("  " + "Call-up %".ljust(20)
              + (str(cp_a) + "%").ljust(20)
              + (str(cp_b) + "%").ljust(20))
        print("  " + "40-Man".ljust(20)
              + ("Yes" if report_a.get("on_40_man") else "No").ljust(20)
              + ("Yes" if report_b.get("on_40_man") else "No").ljust(20))
        stash_a = report_a.get("stash_recommendation", {}).get("action", "?")
        stash_b = report_b.get("stash_recommendation", {}).get("action", "?")
        print("  " + "Stash".ljust(20) + stash_a.ljust(20) + stash_b.ljust(20))

    except Exception as e:
        if as_json:
            return {"error": "Prospect comparison failed: " + str(e)}
        print("Error comparing prospects: " + str(e))


def cmd_prospect_buzz(args, as_json=False):
    """Reddit prospect buzz with ranking cross-reference"""
    try:
        posts = fetch_prospect_buzz()
        if not posts:
            if as_json:
                return {"posts": [], "note": "No recent prospect buzz found"}
            print("No recent prospect buzz found on Reddit")
            return

        # Cross-reference mentioned players against rankings
        rank_lookup = _get_rank_lookup()

        enriched_posts = []
        for post in posts[:20]:
            entry = dict(post)
            title = post.get("title", "")
            # Try to find prospect names mentioned in title
            matched_prospects = []
            for norm_name, rk_data in rank_lookup.items():
                prospect_name = rk_data.get("name", "")
                # Check if prospect's last name appears in title
                name_parts = prospect_name.split()
                if name_parts:
                    last_name = name_parts[-1]
                    if len(last_name) > 3 and last_name.lower() in title.lower():
                        matched_prospects.append({
                            "name": prospect_name,
                            "rank": rk_data.get("overall_rank"),
                            "fv": rk_data.get("fv_grade"),
                        })
            entry["matched_prospects"] = matched_prospects
            enriched_posts.append(entry)

        if as_json:
            return {"posts": enriched_posts, "count": len(enriched_posts)}

        # CLI output
        print("Prospect Buzz (Reddit)")
        print("=" * 65)
        for post in enriched_posts:
            score = post.get("score", 0)
            comments = post.get("num_comments", 0)
            sub = post.get("subreddit", "")
            title = post.get("title", "")
            print("  [" + str(score) + " pts, " + str(comments) + " comments] r/" + sub)
            print("    " + title[:75])
            matched = post.get("matched_prospects", [])
            if matched:
                names = []
                for m in matched:
                    label = m.get("name", "") + " (#" + str(m.get("rank", "?")) + ")"
                    names.append(label)
                print("    Prospects: " + ", ".join(names))
            print("")

    except Exception as e:
        if as_json:
            return {"error": "Prospect buzz failed: " + str(e)}
        print("Error fetching prospect buzz: " + str(e))


def cmd_eta_tracker(args, as_json=False):
    """Track call-up probability changes for watchlist prospects"""
    try:
        db = _get_prospect_db()

        # Auto-populate: check user's roster for NA-slot prospects
        rank_lookup = _get_rank_lookup()
        auto_prospects = []
        try:
            from shared import get_league_context
            sc, gm, lg, team = get_league_context()
            roster = team.roster()
            for player in roster:
                selected = player.get("selected_position", "")
                pname = player.get("name", "")
                norm = normalize_player_name(pname)
                rk = rank_lookup.get(norm)
                if selected == "NA" or rk:
                    mlb_id = None
                    if rk:
                        mlb_id = rk.get("mlb_id")
                    if not mlb_id:
                        mlb_id = get_mlb_id(pname)
                    if mlb_id:
                        auto_prospects.append({
                            "mlb_id": mlb_id,
                            "name": pname,
                            "source": "roster",
                            "ranking": rk,
                        })
        except Exception:
            pass  # Yahoo not available, skip auto-populate

        # Get manually added watchlist from SQLite
        cursor = db.execute(
            "SELECT mlb_id, name, last_probability, notes FROM prospect_watchlist"
        )
        watchlist = cursor.fetchall()

        # Merge: combine auto + manual, deduplicate by mlb_id
        seen_ids = set()
        combined = []
        for row in watchlist:
            seen_ids.add(row[0])
            combined.append({"mlb_id": row[0], "name": row[1], "prev_prob": row[2] or 0, "notes": row[3] or "", "source": "watchlist"})
        for ap in auto_prospects:
            if ap.get("mlb_id") not in seen_ids:
                seen_ids.add(ap.get("mlb_id"))
                combined.append({"mlb_id": ap.get("mlb_id"), "name": ap.get("name"), "prev_prob": 0, "notes": "", "source": "roster", "ranking": ap.get("ranking")})

        if not combined:
            if as_json:
                return {"prospects": [], "count": 0, "note": "No prospects on watchlist or NA slots."}
            print("No prospects on watchlist or NA slots.")
            return

        days = _get_days_into_season()
        results = []

        for item in combined:
            mlb_id = item.get("mlb_id")
            name = item.get("name", "?")
            prev_prob = item.get("prev_prob", 0)
            notes = item.get("notes", "")
            rk_entry = item.get("ranking")

            try:
                result = _evaluate_prospect_by_id(mlb_id, ranking_entry=rk_entry)
                if not result:
                    results.append({
                        "name": name, "mlb_id": mlb_id,
                        "error": "Could not fetch player info",
                    })
                    continue

                evaluation = result.get("evaluation", {})
                callup = result.get("callup", {})
                level = result.get("level", "AAA")
                stats = result.get("stats", {})
                new_prob = callup.get("probability", 0)
                change = new_prob - prev_prob
                flagged = abs(change) >= 15

                # Update stored probability
                db.execute(
                    "UPDATE prospect_watchlist SET last_probability = ? WHERE mlb_id = ?",
                    (new_prob, mlb_id)
                )

                # Save stat snapshot
                today_str = date.today().isoformat()
                try:
                    db.execute(
                        "INSERT OR REPLACE INTO prospect_stat_snapshots "
                        "(mlb_id, snapshot_date, level, stats_json, readiness_score, callup_probability) "
                        "VALUES (?, ?, ?, ?, ?, ?)",
                        (mlb_id, today_str, level, json.dumps(stats),
                         evaluation.get("readiness_score", 0), new_prob)
                    )
                except Exception:
                    pass

                results.append({
                    "name": name,
                    "mlb_id": mlb_id,
                    "previous_probability": round(prev_prob, 1),
                    "current_probability": round(new_prob, 1),
                    "change": round(change, 1),
                    "flagged": flagged,
                    "classification": callup.get("classification", ""),
                    "readiness": evaluation.get("readiness_score", 0),
                    "grade": evaluation.get("grade", "?"),
                    "notes": notes,
                })
            except Exception as e:
                results.append({
                    "name": name, "mlb_id": mlb_id,
                    "error": "Evaluation failed: " + str(e),
                })

        db.commit()

        # Sort: flagged changes first, then by change magnitude
        results.sort(key=lambda r: (
            0 if r.get("flagged") else 1,
            -abs(r.get("change", 0)),
        ))

        if as_json:
            return {"prospects": results, "count": len(results)}

        # CLI output
        print("ETA Tracker — Watchlist Updates")
        print("=" * 65)
        for r in results:
            if r.get("error"):
                print("  " + r.get("name", "?") + ": " + r.get("error", ""))
                continue
            change = r.get("change", 0)
            arrow = "+" if change > 0 else ""
            flag = " *** ALERT ***" if r.get("flagged") else ""
            print("  " + r.get("name", "?").ljust(25)
                  + str(r.get("current_probability", 0)) + "% ("
                  + arrow + str(round(change, 1)) + ")"
                  + "  " + r.get("classification", "") + flag)
            print("    Grade: " + r.get("grade", "?")
                  + "  |  Readiness: " + str(r.get("readiness", 0)))

    except Exception as e:
        if as_json:
            return {"error": "ETA tracker failed: " + str(e)}
        print("Error running ETA tracker: " + str(e))


def cmd_prospect_trade_targets(args, as_json=False):
    """Find prospect trade targets in your fantasy league"""
    try:
        from shared import get_league_context
        sc, gm, lg, team = get_league_context()
    except Exception as e:
        if as_json:
            return {"error": "Yahoo connection required: " + str(e)}
        print("Error: Yahoo Fantasy connection required for trade targets")
        print("  " + str(e))
        return

    try:
        rank_lookup = _get_rank_lookup()
        if not rank_lookup:
            if as_json:
                return {"targets": [], "note": "No prospect rankings available"}
            print("No prospect rankings available")
            return

        # Scan league rosters
        targets = []
        try:
            teams = lg.teams()
        except Exception as e:
            if as_json:
                return {"error": "Could not fetch league teams: " + str(e)}
            print("Error fetching league teams: " + str(e))
            return

        my_team_key = ""
        try:
            from shared import get_team_key
            my_team_key = get_team_key(lg)
        except Exception:
            pass

        for team_key, team_data in teams.items():
            if team_key == my_team_key:
                continue  # skip own team
            team_name = team_data.get("name", "Unknown")
            try:
                tm = lg.to_team(team_key)
                roster = tm.roster()
                for player in roster:
                    player_name = player.get("name", "")
                    norm = normalize_player_name(player_name)
                    ranking_info = rank_lookup.get(norm)
                    if ranking_info:
                        selected_pos = player.get("selected_position", "")
                        eligible = player.get("eligible_positions", [])
                        is_na = "NA" in eligible or selected_pos == "NA"
                        # Compute call-up probability for trade urgency
                        callup_prob = 0
                        callup_class = ""
                        try:
                            rk_data = ranking_info
                            eval_result = _evaluate_prospect_by_id(
                                rk_data.get("mlb_id"), ranking_entry=rk_data
                            )
                            if eval_result:
                                callup_prob = eval_result.get("callup", {}).get("probability", 0)
                                callup_class = eval_result.get("callup", {}).get("classification", "")
                        except Exception:
                            pass
                        # Urgency classification
                        eta_val = ranking_info.get("eta", "")
                        if callup_prob >= 55:
                            urgency = "HIGH"
                        elif callup_prob >= 40 or eta_val == str(YEAR):
                            urgency = "MEDIUM"
                        else:
                            urgency = "LOW"
                        targets.append({
                            "name": player_name,
                            "owner": team_name,
                            "owner_team_key": team_key,
                            "prospect_rank": ranking_info.get("overall_rank"),
                            "fv_grade": ranking_info.get("fv_grade"),
                            "organization": ranking_info.get("organization", ""),
                            "position": ranking_info.get("position", ""),
                            "current_level": ranking_info.get("current_level", ""),
                            "is_na_slot": is_na,
                            "eta": eta_val,
                            "callup_probability": round(callup_prob, 1),
                            "callup_classification": callup_class,
                            "urgency": urgency,
                        })
            except Exception as e:
                print("Warning: could not scan roster for " + team_name + ": " + str(e))
                continue

        # Sort by callup probability (highest urgency first), then rank
        targets.sort(key=lambda t: (-t.get("callup_probability", 0), t.get("prospect_rank", 999)))

        if as_json:
            return {"targets": targets, "count": len(targets)}

        # CLI output
        print("Prospect Trade Targets")
        print("=" * 70)
        if not targets:
            print("  No ranked prospects found on other league rosters")
            return
        print("  " + "#".rjust(4) + "  " + "Name".ljust(22) + "Pos".ljust(5)
              + "Owner".ljust(18) + "Org".ljust(12) + "FV".ljust(5) + "NA?")
        print("  " + "-" * 66)
        for t in targets:
            rank_str = str(t.get("prospect_rank", "?")).rjust(4)
            name_str = str(t.get("name", "?")).ljust(22)[:22]
            pos_str = str(t.get("position", "?")).ljust(5)
            owner_str = str(t.get("owner", "?")).ljust(18)[:18]
            org_str = str(t.get("organization", "?")).ljust(12)[:12]
            fv_str = str(t.get("fv_grade", "?")).ljust(5)
            na_str = "Yes" if t.get("is_na_slot") else "No"
            print("  " + rank_str + "  " + name_str + pos_str
                  + owner_str + org_str + fv_str + na_str)
            prob_str = str(round(t.get("callup_probability", 0), 1)) + "%"
            urg = t.get("urgency", "")
            if prob_str != "0.0%":
                print("    Callup: " + prob_str + "  Urgency: " + urg)

    except Exception as e:
        if as_json:
            return {"error": "Trade targets failed: " + str(e)}
        print("Error finding trade targets: " + str(e))


def cmd_prospect_watch_add(args, as_json=False):
    """Add or remove a prospect from the ETA watchlist"""
    if not args:
        if as_json:
            return {"error": "Player name required. Usage: prospect-watch-add <name> [remove]"}
        print("Usage: prospect-watch-add <name> [remove]")
        return

    action = "add"
    name_parts = []
    for arg in args:
        if arg.lower() == "remove":
            action = "remove"
        else:
            name_parts.append(arg)
    name = " ".join(name_parts)

    db = _get_prospect_db()

    if action == "remove":
        db.execute("DELETE FROM prospect_watchlist WHERE name LIKE ?",
                   ("%" + name + "%",))
        db.commit()
        if as_json:
            return {"success": True, "action": "removed", "name": name}
        print("Removed " + name + " from watchlist")
        return

    # Look up prospect
    rank_lookup = _get_rank_lookup()
    norm = normalize_player_name(name)
    rk = rank_lookup.get(norm)

    mlb_id = None
    if rk:
        mlb_id = rk.get("mlb_id")
    if not mlb_id:
        mlb_id = get_mlb_id(name)
    if not mlb_id:
        results = search_player_by_name(name)
        if results:
            mlb_id = results[0].get("id")

    if not mlb_id:
        if as_json:
            return {"error": "Player not found: " + name}
        print("Player not found: " + name)
        return

    # Compute current probability
    current_prob = 0
    try:
        eval_result = _evaluate_prospect_by_id(mlb_id, ranking_entry=rk)
        if eval_result:
            current_prob = eval_result.get("callup", {}).get("probability", 0)
    except Exception:
        pass

    resolved_name = name
    if rk:
        resolved_name = rk.get("name", name)

    db.execute(
        "INSERT OR REPLACE INTO prospect_watchlist "
        "(mlb_id, name, added_date, last_probability, notes) "
        "VALUES (?, ?, ?, ?, ?)",
        (mlb_id, resolved_name, date.today().isoformat(), current_prob, "")
    )
    db.commit()

    if as_json:
        return {
            "success": True,
            "action": "added",
            "name": resolved_name,
            "mlb_id": mlb_id,
            "current_probability": round(current_prob, 1),
        }
    print("Added " + resolved_name + " to watchlist (callup: " + str(round(current_prob, 1)) + "%)")


# ============================================================
# CLI Dispatch
# ============================================================

COMMANDS = {
    "prospect-report": cmd_prospect_report,
    "prospect-rankings": cmd_prospect_rankings,
    "callup-wire": cmd_callup_wire,
    "stash-advisor": cmd_stash_advisor,
    "prospect-compare": cmd_prospect_compare,
    "prospect-buzz": cmd_prospect_buzz,
    "eta-tracker": cmd_eta_tracker,
    "prospect-trade-targets": cmd_prospect_trade_targets,
    "prospect-watch-add": cmd_prospect_watch_add,
}

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    handler = COMMANDS.get(cmd)
    if handler:
        handler(sys.argv[2:])
    else:
        print("Prospect Intelligence Module")
        print("Usage: prospects.py <command> [args]")
        print("")
        print("Commands:")
        for name in sorted(COMMANDS.keys()):
            doc = COMMANDS.get(name).__doc__ or ""
            print("  " + name.ljust(25) + doc.strip())
