#!/usr/bin/env python3
"""Fantasy Baseball Intelligence Module

Provides Statcast data, trends, Reddit buzz, and advanced analytics
for every player surface in the app.

Data sources:
- Baseball Savant CSV leaderboards (expected stats, statcast, sprint speed)
- FanGraphs via pybaseball (plate discipline)
- Reddit r/fantasybaseball (buzz, sentiment)
- MLB Stats API (transactions, game logs)
"""

import sys
import os
import json
import time
import csv
import io
import urllib.request
import urllib.parse
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mlb_id_cache import get_mlb_id
from shared import MLB_API, mlb_fetch as _mlb_fetch, USER_AGENT

# Current year for all API calls
YEAR = date.today().year

# TTL values in seconds
TTL_SAVANT = 21600       # 6 hours
TTL_PYBASEBALL = 3600    # 1 hour
TTL_FANGRAPHS = 21600    # 6 hours
TTL_REDDIT = 900          # 15 minutes
TTL_MLB = 1800            # 30 minutes


# ============================================================
# 1. TTL Cache System
# ============================================================

_cache = {}


def _cache_get(key, ttl_seconds):
    """Get cached value if not expired"""
    entry = _cache.get(key)
    if entry is None:
        return None
    data, fetch_time = entry
    if time.time() - fetch_time > ttl_seconds:
        del _cache[key]
        return None
    return data


def _cache_set(key, data):
    """Store value in cache with current timestamp"""
    _cache[key] = (data, time.time())


# ============================================================
# 2. Baseball Savant CSV Fetchers
# ============================================================

def _fetch_csv(url):
    """Fetch a CSV from a URL and return list of dicts"""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=30) as response:
            raw = response.read().decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(raw))
        return list(reader)
    except Exception as e:
        print("Warning: CSV fetch failed for " + url + ": " + str(e))
        return []


def _index_savant_rows(rows):
    """Build dict keyed by 'last_name, first_name' AND by player_id"""
    result = {}
    for row in rows:
        # Savant uses various column names for the player name
        name_key = (
            row.get("last_name, first_name", "")
            or row.get("player_name", "")
            or row.get("name", "")
        )
        if name_key:
            result[name_key] = row
        pid = row.get("player_id", "")
        if pid:
            result["id:" + str(pid)] = row
    return result


def _savant_with_fallback(url_template, cache_prefix, player_type):
    """Fetch Savant data with pre-season fallback to prior year.
    Returns (indexed_rows, data_season) tuple.
    """
    year = YEAR
    cache_key = (cache_prefix, player_type, year)
    cached = _cache_get(cache_key, TTL_SAVANT)
    if cached is not None:
        return cached

    url = url_template.replace("{YEAR}", str(year))
    rows = _fetch_csv(url)
    result = _index_savant_rows(rows)

    # Pre-season fallback: if empty and before May, try last year
    if not result and date.today().month < 5:
        year = YEAR - 1
        fallback_key = (cache_prefix, player_type, year)
        cached_fb = _cache_get(fallback_key, TTL_SAVANT)
        if cached_fb is not None:
            return cached_fb
        url = url_template.replace("{YEAR}", str(year))
        rows = _fetch_csv(url)
        result = _index_savant_rows(rows)
        if result:
            result["__data_season"] = year
            _cache_set(fallback_key, result)
            _cache_set(cache_key, result)
            return result

    if result:
        result["__data_season"] = year
    _cache_set(cache_key, result)
    return result


def _fetch_savant_expected(player_type):
    """Fetch Baseball Savant expected stats leaderboard.
    player_type: 'batter' or 'pitcher'
    """
    url_template = (
        "https://baseballsavant.mlb.com/leaderboard/expected_statistics"
        "?type=" + player_type
        + "&year={YEAR}"
        + "&position=&team=&min=25&csv=true"
    )
    return _savant_with_fallback(url_template, "savant_expected", player_type)


def _fetch_savant_statcast(player_type):
    """Fetch Baseball Savant statcast leaderboard.
    player_type: 'batter' or 'pitcher'
    """
    url_template = (
        "https://baseballsavant.mlb.com/leaderboard/statcast"
        "?type=" + player_type
        + "&year={YEAR}"
        + "&position=&team=&min=25&csv=true"
    )
    return _savant_with_fallback(url_template, "savant_statcast", player_type)


def _fetch_savant_sprint_speed(player_type):
    """Fetch Baseball Savant sprint speed leaderboard.
    player_type: 'batter' or 'pitcher' (only batters have meaningful data)
    """
    url_template = (
        "https://baseballsavant.mlb.com/leaderboard/sprint_speed"
        "?type=" + player_type
        + "&year={YEAR}"
        + "&position=&team=&min=10&csv=true"
    )
    return _savant_with_fallback(url_template, "savant_sprint", player_type)


def _fetch_savant_pitch_arsenal(player_type="pitcher"):
    """Fetch Baseball Savant pitch arsenal stats.
    Shows pitch mix, velocity, spin rate, whiff rate per pitch type.
    """
    url_template = (
        "https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats"
        "?type=" + player_type
        + "&pitchType=&year={YEAR}"
        + "&team=&min=10&csv=true"
    )
    return _savant_with_fallback(url_template, "savant_pitch_arsenal", player_type)


def _fetch_savant_percentile_rankings(player_type):
    """Fetch Baseball Savant percentile rankings.
    The famous Savant percentile cards: xwOBA, xBA, exit velo, barrel%,
    hard hit%, k%, bb%, sprint speed — all as percentiles.
    """
    url_template = (
        "https://baseballsavant.mlb.com/leaderboard/percentile-rankings"
        "?type=" + player_type
        + "&year={YEAR}"
        + "&position=&team=&csv=true"
    )
    return _savant_with_fallback(url_template, "savant_percentiles", player_type)


# ============================================================
# 3. FanGraphs via pybaseball
# ============================================================

def _fetch_fangraphs(stat_func, cache_label):
    """Common FanGraphs fetch logic with pre-season fallback.

    Args:
        stat_func: callable — pybaseball.batting_stats or pitching_stats
        cache_label: string key for the cache (e.g. "fangraphs_batting")
    """
    cache_key = (cache_label, YEAR)
    cached = _cache_get(cache_key, TTL_FANGRAPHS)
    if cached is not None:
        return cached

    def _parse_df(df, season):
        result = {}
        if df is not None:
            for _, row in df.iterrows():
                name = row.get("Name", "")
                if name:
                    result[name.lower()] = {
                        "bb_rate": row.get("BB%", None),
                        "k_rate": row.get("K%", None),
                        "o_swing_pct": row.get("O-Swing%", None),
                        "z_contact_pct": row.get("Z-Contact%", None),
                        "swstr_pct": row.get("SwStr%", None),
                        "data_season": season,
                    }
        return result

    try:
        year = YEAR
        df = stat_func(year, qual=25)
        # Pre-season fallback: if empty and before May, try last year
        if (df is None or len(df) == 0) and date.today().month < 5:
            year = YEAR - 1
            df = stat_func(year, qual=25)
        result = _parse_df(df, year)
        _cache_set(cache_key, result)
        return result
    except Exception as e:
        print("Warning: FanGraphs " + cache_label + " fetch failed: " + str(e))
        if date.today().month < 5:
            try:
                df = stat_func(YEAR - 1, qual=25)
                result = _parse_df(df, YEAR - 1)
                _cache_set(cache_key, result)
                return result
            except Exception:
                pass
        return {}


def _fetch_fangraphs_batting():
    """Fetch FanGraphs batting stats for plate discipline."""
    from pybaseball import batting_stats
    return _fetch_fangraphs(batting_stats, "fangraphs_batting")


def _fetch_fangraphs_pitching():
    """Fetch FanGraphs pitching stats for plate discipline."""
    from pybaseball import pitching_stats
    return _fetch_fangraphs(pitching_stats, "fangraphs_pitching")


# ============================================================
# 4. Reddit JSON API Fetcher
# ============================================================

def _fetch_reddit_hot():
    """Fetch hot posts from r/fantasybaseball"""
    cache_key = ("reddit_hot",)
    cached = _cache_get(cache_key, TTL_REDDIT)
    if cached is not None:
        return cached
    try:
        url = "https://www.reddit.com/r/fantasybaseball/hot.json?limit=50"
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode())
        posts = []
        for child in data.get("data", {}).get("children", []):
            post = child.get("data", {})
            posts.append({
                "title": post.get("title", ""),
                "score": post.get("score", 0),
                "num_comments": post.get("num_comments", 0),
                "url": post.get("url", ""),
                "created_utc": post.get("created_utc", 0),
                "flair": post.get("link_flair_text", ""),
            })
        _cache_set(cache_key, posts)
        return posts
    except Exception as e:
        print("Warning: Reddit fetch failed: " + str(e))
        return []


def _search_reddit_player(player_name):
    """Search r/fantasybaseball for a specific player"""
    cache_key = ("reddit_search", player_name.lower())
    cached = _cache_get(cache_key, TTL_REDDIT)
    if cached is not None:
        return cached
    try:
        query = urllib.parse.quote(player_name)
        url = (
            "https://www.reddit.com/r/fantasybaseball/search.json"
            "?q=" + query
            + "&sort=new&restrict_sr=on&limit=10"
        )
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode())
        posts = []
        for child in data.get("data", {}).get("children", []):
            post = child.get("data", {})
            posts.append({
                "title": post.get("title", ""),
                "score": post.get("score", 0),
                "num_comments": post.get("num_comments", 0),
                "created_utc": post.get("created_utc", 0),
            })
        _cache_set(cache_key, posts)
        return posts
    except Exception as e:
        print("Warning: Reddit search failed: " + str(e))
        return []


# ============================================================
# 5. MLB Stats API Fetchers
# ============================================================

def _fetch_mlb_transactions(days=7):
    """Fetch recent MLB transactions"""
    cache_key = ("mlb_transactions", days)
    cached = _cache_get(cache_key, TTL_MLB)
    if cached is not None:
        return cached
    try:
        end_date = date.today()
        start_date = end_date - timedelta(days=days)
        endpoint = (
            "/transactions?startDate=" + start_date.strftime("%m/%d/%Y")
            + "&endDate=" + end_date.strftime("%m/%d/%Y")
        )
        data = _mlb_fetch(endpoint)
        transactions = []
        for tx in data.get("transactions", []):
            tx_type = tx.get("typeDesc", "")
            tx_date = tx.get("date", "")
            desc = tx.get("description", "")
            player_info = tx.get("player", {})
            player_name = player_info.get("fullName", "")
            team_info = tx.get("toTeam", tx.get("fromTeam", {}))
            team_name = team_info.get("name", "") if team_info else ""
            transactions.append({
                "type": tx_type,
                "date": tx_date,
                "description": desc,
                "player_name": player_name,
                "team": team_name,
            })
        _cache_set(cache_key, transactions)
        return transactions
    except Exception as e:
        print("Warning: MLB transactions fetch failed: " + str(e))
        return []


def _fetch_mlb_game_log(mlb_id, stat_group="hitting", days=30):
    """Fetch recent game log for a player"""
    if not mlb_id:
        return []
    cache_key = ("mlb_gamelog", mlb_id, stat_group, days)
    cached = _cache_get(cache_key, TTL_MLB)
    if cached is not None:
        return cached
    try:
        end_date = date.today()
        start_date = end_date - timedelta(days=days)
        endpoint = (
            "/people/" + str(mlb_id)
            + "/stats?stats=gameLog&group=" + stat_group
            + "&season=" + str(YEAR)
            + "&startDate=" + start_date.strftime("%m/%d/%Y")
            + "&endDate=" + end_date.strftime("%m/%d/%Y")
        )
        data = _mlb_fetch(endpoint)
        games = []
        for split_group in data.get("stats", []):
            for split in split_group.get("splits", []):
                stat = split.get("stat", {})
                game_date = split.get("date", "")
                opponent = split.get("opponent", {}).get("name", "")
                entry = {"date": game_date, "opponent": opponent}
                entry.update(stat)
                games.append(entry)
        _cache_set(cache_key, games)
        return games
    except Exception as e:
        print("Warning: MLB game log fetch failed for " + str(mlb_id) + ": " + str(e))
        return []


# ============================================================
# 6. Name Matching Utilities
# ============================================================

def _normalize_name(name):
    """Normalize player name for matching across sources"""
    if not name:
        return ""
    name = name.strip().lower()
    # Handle "Last, First" format from Savant
    if "," in name:
        parts = name.split(",", 1)
        name = parts[1].strip() + " " + parts[0].strip()
    # Remove Jr., Sr., III, etc.
    for suffix in [" jr.", " sr.", " iii", " ii", " iv"]:
        name = name.replace(suffix, "")
    return name.strip()


def _find_in_savant(player_name, savant_data):
    """Find a player in Baseball Savant data by name matching"""
    if not savant_data:
        return None
    norm = _normalize_name(player_name)
    # Try direct match on normalized names
    for key, row in savant_data.items():
        if key.startswith("id:"):
            continue
        if _normalize_name(key) == norm:
            return row
        # Also try the player_name field if it exists
        if _normalize_name(row.get("player_name", "")) == norm:
            return row
        if _normalize_name(row.get("last_name, first_name", "")) == norm:
            return row
    # Fuzzy: check if all parts of the search name appear
    parts = norm.split()
    if parts:
        for key, row in savant_data.items():
            if key.startswith("id:"):
                continue
            row_norm = _normalize_name(key)
            if all(p in row_norm for p in parts):
                return row
    return None


def _find_in_fangraphs(player_name, fg_data):
    """Find a player in FanGraphs data by name matching"""
    if not fg_data:
        return None
    norm = _normalize_name(player_name)
    # Direct match
    result = fg_data.get(norm)
    if result:
        return result
    # Try partial matching
    parts = norm.split()
    if parts:
        for key, row in fg_data.items():
            if all(p in key for p in parts):
                return row
    return None


# ============================================================
# 7. Percentile Rank Calculator
# ============================================================

def _percentile_rank(value, all_values, higher_is_better=True):
    """Calculate percentile rank (0-100) for a value within a distribution"""
    if not all_values or value is None:
        return None
    try:
        val = float(value)
        sorted_vals = sorted([float(v) for v in all_values if v is not None])
        if not sorted_vals:
            return None
        count_below = sum(1 for v in sorted_vals if v < val)
        pct = int(round(count_below / len(sorted_vals) * 100))
        if not higher_is_better:
            pct = 100 - pct
        return max(0, min(100, pct))
    except (ValueError, TypeError):
        return None


def _collect_column_values(savant_data, column):
    """Collect all non-empty values for a column from Savant data"""
    values = []
    for key, row in savant_data.items():
        if key.startswith("id:"):
            continue
        val = row.get(column, "")
        if val != "" and val is not None:
            try:
                values.append(float(val))
            except (ValueError, TypeError):
                pass
    return values


# ============================================================
# 8. Quality Tier Assignment
# ============================================================

def _quality_tier(pct_rank):
    """Assign quality tier based on percentile rank"""
    if pct_rank is None:
        return None
    if pct_rank >= 90:
        return "elite"
    if pct_rank >= 70:
        return "strong"
    if pct_rank >= 40:
        return "average"
    if pct_rank >= 20:
        return "below"
    return "poor"


# ============================================================
# 9. Hot/Cold Determination
# ============================================================

def _hot_cold(game_log_stats):
    """Determine hot/cold status from recent game log stats"""
    if not game_log_stats:
        return "neutral"
    # For batters: look at last 14 days OPS
    ops = game_log_stats.get("ops_14d")
    if ops is not None:
        try:
            ops_val = float(ops)
            if ops_val >= .900:
                return "hot"
            if ops_val >= .780:
                return "warm"
            if ops_val >= .650:
                return "neutral"
            if ops_val >= .500:
                return "cold"
            return "ice"
        except (ValueError, TypeError):
            pass
    # For pitchers: look at last 14 days ERA
    era = game_log_stats.get("era_14d")
    if era is not None:
        try:
            era_val = float(era)
            if era_val <= 2.50:
                return "hot"
            if era_val <= 3.50:
                return "warm"
            if era_val <= 4.50:
                return "neutral"
            if era_val <= 5.50:
                return "cold"
            return "ice"
        except (ValueError, TypeError):
            pass
    return "neutral"


# ============================================================
# 10. Build Functions for player_intel()
# ============================================================

def _safe_float(val, default=None):
    """Safely convert a value to float"""
    if val is None or val == "":
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def _detect_player_type(name, mlb_id):
    """Detect whether a player is a batter or pitcher.
    Checks Savant expected stats for both types.
    """
    # Check batter data first
    batter_data = _fetch_savant_expected("batter")
    if _find_in_savant(name, batter_data):
        return "batter"
    # Check pitcher data
    pitcher_data = _fetch_savant_expected("pitcher")
    if _find_in_savant(name, pitcher_data):
        return "pitcher"
    # Fallback: try MLB API
    if mlb_id:
        try:
            data = _mlb_fetch("/people/" + str(mlb_id))
            people = data.get("people", [])
            if people:
                pos = people[0].get("primaryPosition", {}).get("abbreviation", "")
                if pos in ("P", "SP", "RP"):
                    return "pitcher"
                return "batter"
        except Exception:
            pass
    return "batter"  # default


def _build_statcast(name, mlb_id):
    """Build statcast section of player intel"""
    try:
        player_type = _detect_player_type(name, mlb_id)
        savant_type = player_type

        # Fetch all three Savant datasets
        expected_data = _fetch_savant_expected(savant_type)
        statcast_data = _fetch_savant_statcast(savant_type)
        sprint_data = _fetch_savant_sprint_speed(savant_type) if player_type == "batter" else {}

        expected_row = _find_in_savant(name, expected_data)
        statcast_row = _find_in_savant(name, statcast_data)
        sprint_row = _find_in_savant(name, sprint_data)

        # Determine data season (may be prior year in pre-season)
        data_season = expected_data.get("__data_season", YEAR) if expected_data else YEAR

        result = {"player_type": player_type, "data_season": data_season}

        # Expected stats with percentile ranks
        if expected_row:
            xwoba = _safe_float(expected_row.get("est_woba"))
            woba = _safe_float(expected_row.get("woba"))
            xba = _safe_float(expected_row.get("est_ba"))
            ba = _safe_float(expected_row.get("ba"))
            xslg = _safe_float(expected_row.get("est_slg"))
            slg = _safe_float(expected_row.get("slg"))
            pa = _safe_float(expected_row.get("pa"))

            all_xwoba = _collect_column_values(expected_data, "est_woba")
            all_xba = _collect_column_values(expected_data, "est_ba")
            all_xslg = _collect_column_values(expected_data, "est_slg")

            xwoba_pct = _percentile_rank(xwoba, all_xwoba)
            xba_pct = _percentile_rank(xba, all_xba)
            xslg_pct = _percentile_rank(xslg, all_xslg)

            result["expected"] = {
                "xwoba": xwoba,
                "woba": woba,
                "xwoba_diff": round(xwoba - woba, 3) if xwoba is not None and woba is not None else None,
                "xwoba_pct": xwoba_pct,
                "xwoba_tier": _quality_tier(xwoba_pct),
                "xba": xba,
                "ba": ba,
                "xba_pct": xba_pct,
                "xslg": xslg,
                "slg": slg,
                "xslg_pct": xslg_pct,
                "pa": int(pa) if pa is not None else None,
            }

        # Statcast data (exit velo, barrel rate, etc.)
        if statcast_row:
            avg_ev = _safe_float(statcast_row.get("avg_hit_speed", statcast_row.get("exit_velocity_avg")))
            max_ev = _safe_float(statcast_row.get("max_hit_speed", statcast_row.get("exit_velocity_max")))
            barrel_pct = _safe_float(statcast_row.get("brl_percent", statcast_row.get("barrel_batted_rate")))
            hard_hit_pct = _safe_float(statcast_row.get("hard_hit_percent", statcast_row.get("hard_hit_rate")))
            la = _safe_float(statcast_row.get("avg_launch_angle", statcast_row.get("launch_angle_avg")))

            all_ev = _collect_column_values(statcast_data, "avg_hit_speed") or _collect_column_values(statcast_data, "exit_velocity_avg")
            all_barrel = _collect_column_values(statcast_data, "brl_percent") or _collect_column_values(statcast_data, "barrel_batted_rate")
            all_hard = _collect_column_values(statcast_data, "hard_hit_percent") or _collect_column_values(statcast_data, "hard_hit_rate")

            ev_pct = _percentile_rank(avg_ev, all_ev)
            barrel_pct_rank = _percentile_rank(barrel_pct, all_barrel)
            hard_pct_rank = _percentile_rank(hard_hit_pct, all_hard)

            result["batted_ball"] = {
                "avg_exit_velo": avg_ev,
                "max_exit_velo": max_ev,
                "barrel_pct": barrel_pct,
                "hard_hit_pct": hard_hit_pct,
                "launch_angle": la,
                "ev_pct": ev_pct,
                "ev_tier": _quality_tier(ev_pct),
                "barrel_pct_rank": barrel_pct_rank,
                "barrel_tier": _quality_tier(barrel_pct_rank),
                "hard_hit_pct_rank": hard_pct_rank,
            }

        # Sprint speed (batters only)
        if sprint_row:
            sprint_speed = _safe_float(sprint_row.get("hp_to_1b", sprint_row.get("sprint_speed")))
            all_sprint = (
                _collect_column_values(sprint_data, "hp_to_1b")
                or _collect_column_values(sprint_data, "sprint_speed")
            )
            sprint_pct = _percentile_rank(sprint_speed, all_sprint)
            result["speed"] = {
                "sprint_speed": sprint_speed,
                "sprint_pct": sprint_pct,
                "speed_tier": _quality_tier(sprint_pct),
            }

        # Pitch arsenal (pitchers only)
        if player_type == "pitcher":
            try:
                arsenal_data = _fetch_savant_pitch_arsenal("pitcher")
                arsenal_row = _find_in_savant(name, arsenal_data)
                if arsenal_row:
                    result["pitch_arsenal"] = {
                        "pitch_type": arsenal_row.get("pitch_type", ""),
                        "pitch_name": arsenal_row.get("pitch_name", ""),
                        "pitch_usage": _safe_float(arsenal_row.get("pitch_usage")),
                        "velocity": _safe_float(arsenal_row.get("pitch_velocity", arsenal_row.get("velocity"))),
                        "spin_rate": _safe_float(arsenal_row.get("spin_rate")),
                        "whiff_pct": _safe_float(arsenal_row.get("whiff_percent", arsenal_row.get("whiff_pct"))),
                        "put_away_pct": _safe_float(arsenal_row.get("put_away_percent", arsenal_row.get("put_away"))),
                        "run_value": _safe_float(arsenal_row.get("run_value")),
                    }
            except Exception as e:
                print("Warning: pitch arsenal failed for " + str(name) + ": " + str(e))

        if not expected_row and not statcast_row and not sprint_row:
            result["note"] = "Player not found in Savant leaderboards (may not meet minimum PA/IP threshold)"

        return result
    except Exception as e:
        print("Warning: _build_statcast failed for " + str(name) + ": " + str(e))
        return {"error": str(e)}


def _compute_game_log_splits(games, stat_group):
    """Compute rolling splits from game log entries"""
    if not games:
        return {}
    result = {}
    now = datetime.now()

    # Split into 14-day and 30-day windows
    games_14d = []
    games_30d = []
    for g in games:
        game_date_str = g.get("date", "")
        if not game_date_str:
            games_30d.append(g)
            games_14d.append(g)
            continue
        try:
            game_date = datetime.strptime(game_date_str, "%Y-%m-%d")
            days_ago = (now - game_date).days
            if days_ago <= 30:
                games_30d.append(g)
            if days_ago <= 14:
                games_14d.append(g)
        except (ValueError, TypeError):
            games_30d.append(g)

    if stat_group == "hitting":
        for label, subset in [("14d", games_14d), ("30d", games_30d)]:
            if not subset:
                continue
            total_ab = sum(_safe_float(g.get("atBats", 0), 0) for g in subset)
            total_h = sum(_safe_float(g.get("hits", 0), 0) for g in subset)
            total_hr = sum(_safe_float(g.get("homeRuns", 0), 0) for g in subset)
            total_rbi = sum(_safe_float(g.get("rbi", 0), 0) for g in subset)
            total_bb = sum(_safe_float(g.get("baseOnBalls", 0), 0) for g in subset)
            total_k = sum(_safe_float(g.get("strikeOuts", 0), 0) for g in subset)
            total_sb = sum(_safe_float(g.get("stolenBases", 0), 0) for g in subset)

            avg = round(total_h / total_ab, 3) if total_ab > 0 else 0.0
            obp_denom = total_ab + total_bb
            obp = round((total_h + total_bb) / obp_denom, 3) if obp_denom > 0 else 0.0
            # Simple SLG approximation from available stats
            total_2b = sum(_safe_float(g.get("doubles", 0), 0) for g in subset)
            total_3b = sum(_safe_float(g.get("triples", 0), 0) for g in subset)
            total_1b = total_h - total_2b - total_3b - total_hr
            tb = total_1b + (2 * total_2b) + (3 * total_3b) + (4 * total_hr)
            slg = round(tb / total_ab, 3) if total_ab > 0 else 0.0
            ops = round(obp + slg, 3)

            result["avg_" + label] = avg
            result["ops_" + label] = ops
            result["hr_" + label] = int(total_hr)
            result["rbi_" + label] = int(total_rbi)
            result["sb_" + label] = int(total_sb)
            result["k_" + label] = int(total_k)
            result["bb_" + label] = int(total_bb)
            result["games_" + label] = len(subset)
    else:
        # Pitching splits
        for label, subset in [("14d", games_14d), ("30d", games_30d)]:
            if not subset:
                continue
            total_ip = sum(_safe_float(g.get("inningsPitched", 0), 0) for g in subset)
            total_er = sum(_safe_float(g.get("earnedRuns", 0), 0) for g in subset)
            total_k = sum(_safe_float(g.get("strikeOuts", 0), 0) for g in subset)
            total_bb = sum(_safe_float(g.get("baseOnBalls", 0), 0) for g in subset)
            total_h = sum(_safe_float(g.get("hits", 0), 0) for g in subset)
            total_w = sum(_safe_float(g.get("wins", 0), 0) for g in subset)

            era = round(total_er * 9 / total_ip, 2) if total_ip > 0 else 0.0
            whip = round((total_bb + total_h) / total_ip, 2) if total_ip > 0 else 0.0

            result["era_" + label] = era
            result["whip_" + label] = whip
            result["k_" + label] = int(total_k)
            result["bb_" + label] = int(total_bb)
            result["ip_" + label] = round(total_ip, 1)
            result["w_" + label] = int(total_w)
            result["games_" + label] = len(subset)

    return result


def _build_trends(name, mlb_id):
    """Build trends section: recent game log splits + hot/cold status"""
    try:
        player_type = _detect_player_type(name, mlb_id)
        stat_group = "pitching" if player_type == "pitcher" else "hitting"

        games = _fetch_mlb_game_log(mlb_id, stat_group=stat_group, days=30)
        if not games:
            return {
                "status": "neutral",
                "note": "No recent game log data available",
                "player_type": player_type,
            }

        splits = _compute_game_log_splits(games, stat_group)
        status = _hot_cold(splits)

        result = {
            "status": status,
            "player_type": player_type,
            "splits": splits,
            "games_total": len(games),
        }
        return result
    except Exception as e:
        print("Warning: _build_trends failed for " + str(name) + ": " + str(e))
        return {"error": str(e)}


def _build_context(name):
    """Build context section: Reddit buzz + headlines"""
    try:
        posts = _search_reddit_player(name)
        mention_count = len(posts)
        if mention_count == 0:
            return {
                "mentions": 0,
                "sentiment": "unknown",
                "headlines": [],
            }

        avg_score = sum(p.get("score", 0) for p in posts) / mention_count
        if avg_score > 5:
            sentiment = "positive"
        elif avg_score < 1:
            sentiment = "negative"
        else:
            sentiment = "neutral"

        headlines = [p.get("title", "") for p in posts[:5]]

        return {
            "mentions": mention_count,
            "sentiment": sentiment,
            "avg_score": round(avg_score, 1),
            "headlines": headlines,
        }
    except Exception as e:
        print("Warning: _build_context failed for " + str(name) + ": " + str(e))
        return {"error": str(e)}


def _build_percentiles(name, mlb_id):
    """Build percentile rankings section from Baseball Savant.
    The famous Savant percentile card data.
    """
    try:
        player_type = _detect_player_type(name, mlb_id)
        pct_data = _fetch_savant_percentile_rankings(player_type)
        if not pct_data:
            return {"note": "Percentile data not available"}

        row = _find_in_savant(name, pct_data)
        if not row:
            return {"note": "Player not found in percentile rankings"}

        data_season = pct_data.get("__data_season", YEAR)

        # Extract available percentile columns
        result = {"data_season": data_season, "player_type": player_type}

        # Common percentile fields from Savant
        pct_fields = {
            "xwoba": ["xwoba_percent", "xwoba"],
            "xba": ["xba_percent", "xba"],
            "exit_velocity": ["exit_velocity_percent", "exit_velocity"],
            "barrel_pct": ["barrel_pct_percent", "barrel_batted_rate"],
            "hard_hit_pct": ["hard_hit_percent", "hard_hit_pct"],
            "k_pct": ["k_percent", "k_pct"],
            "bb_pct": ["bb_percent", "bb_pct"],
            "whiff_pct": ["whiff_percent", "whiff_pct"],
            "chase_rate": ["oz_swing_percent", "chase_rate"],
            "sprint_speed": ["sprint_speed_percent", "sprint_speed"],
        }

        metrics = {}
        for label, candidates in pct_fields.items():
            for col in candidates:
                val = _safe_float(row.get(col))
                if val is not None:
                    metrics[label] = val
                    break

        result["metrics"] = metrics
        return result
    except Exception as e:
        print("Warning: _build_percentiles failed for " + str(name) + ": " + str(e))
        return {"error": str(e)}


def _build_discipline(name):
    """Build plate discipline section from FanGraphs data"""
    try:
        player_type = _detect_player_type(name, None)
        if player_type == "pitcher":
            fg_data = _fetch_fangraphs_pitching()
        else:
            fg_data = _fetch_fangraphs_batting()

        row = _find_in_fangraphs(name, fg_data)
        if not row:
            return {"note": "Player not found in FanGraphs data"}

        return {
            "bb_rate": row.get("bb_rate"),
            "k_rate": row.get("k_rate"),
            "o_swing_pct": row.get("o_swing_pct"),
            "z_contact_pct": row.get("z_contact_pct"),
            "swstr_pct": row.get("swstr_pct"),
        }
    except Exception as e:
        print("Warning: _build_discipline failed for " + str(name) + ": " + str(e))
        return {"error": str(e)}


# ============================================================
# 10. Main Functions: player_intel() and batch_intel()
# ============================================================

def player_intel(name, include=None):
    """
    Get comprehensive intelligence packet for a player.

    include: list of sections to fetch. None = all.
    Valid sections: 'statcast', 'trends', 'context', 'discipline', 'percentiles'
    """
    if include is None:
        include = ["statcast", "trends", "context", "discipline", "percentiles"]

    result = {"name": name}

    mlb_id = get_mlb_id(name)
    result["mlb_id"] = mlb_id

    if "statcast" in include:
        result["statcast"] = _build_statcast(name, mlb_id)

    if "trends" in include:
        result["trends"] = _build_trends(name, mlb_id)

    if "context" in include:
        result["context"] = _build_context(name)

    if "discipline" in include:
        result["discipline"] = _build_discipline(name)

    if "percentiles" in include:
        result["percentiles"] = _build_percentiles(name, mlb_id)

    return result


def batch_intel(names, include=None):
    """
    Get intel for multiple players efficiently.
    Uses cached bulk leaderboard data -- one fetch covers all ~400 qualifying players.
    """
    if include is None:
        include = ["statcast"]  # Default to just statcast for batch (efficiency)

    result = {}
    for name in names:
        if not name:
            continue
        try:
            result[name] = player_intel(name, include=include)
        except Exception as e:
            print("Warning: intel failed for " + str(name) + ": " + str(e))
            result[name] = {"name": name, "error": str(e)}
    return result


# ============================================================
# 11. Standalone Commands
# ============================================================

def cmd_player_report(args, as_json=False):
    """Deep-dive single player report"""
    if not args:
        if as_json:
            return {"error": "Usage: player <player_name>"}
        print("Usage: intel.py player <player_name>")
        return
    name = " ".join(args)
    intel_data = player_intel(name)
    if as_json:
        return intel_data
    # Pretty print
    print("Player Intelligence Report: " + name)
    print("=" * 50)

    statcast = intel_data.get("statcast", {})
    if statcast and not statcast.get("error"):
        data_season = statcast.get("data_season", "")
        season_label = ""
        if data_season and data_season != YEAR:
            season_label = " [Pre-season: " + str(data_season) + " data]"
        print("")
        print("STATCAST (" + statcast.get("player_type", "unknown") + ")" + season_label)
        print("-" * 30)
        expected = statcast.get("expected", {})
        if expected:
            print("  xwOBA: " + str(expected.get("xwoba", "N/A"))
                  + " (actual: " + str(expected.get("woba", "N/A"))
                  + ", diff: " + str(expected.get("xwoba_diff", "N/A")) + ")")
            print("  xwOBA percentile: " + str(expected.get("xwoba_pct", "N/A"))
                  + " (" + str(expected.get("xwoba_tier", "N/A")) + ")")
            print("  xBA: " + str(expected.get("xba", "N/A"))
                  + " | xSLG: " + str(expected.get("xslg", "N/A")))
        bb = statcast.get("batted_ball", {})
        if bb:
            print("  Exit Velo: " + str(bb.get("avg_exit_velo", "N/A"))
                  + " mph (pct: " + str(bb.get("ev_pct", "N/A"))
                  + ", " + str(bb.get("ev_tier", "N/A")) + ")")
            print("  Barrel%: " + str(bb.get("barrel_pct", "N/A"))
                  + " | Hard Hit%: " + str(bb.get("hard_hit_pct", "N/A")))
        speed = statcast.get("speed", {})
        if speed:
            print("  Sprint Speed: " + str(speed.get("sprint_speed", "N/A"))
                  + " (pct: " + str(speed.get("sprint_pct", "N/A"))
                  + ", " + str(speed.get("speed_tier", "N/A")) + ")")
        arsenal = statcast.get("pitch_arsenal", {})
        if arsenal:
            print("  Pitch Arsenal:")
            print("    Type: " + str(arsenal.get("pitch_name", "N/A"))
                  + " | Usage: " + str(arsenal.get("pitch_usage", "N/A"))
                  + " | Velo: " + str(arsenal.get("velocity", "N/A"))
                  + " | Spin: " + str(arsenal.get("spin_rate", "N/A")))
            print("    Whiff%: " + str(arsenal.get("whiff_pct", "N/A"))
                  + " | Put Away%: " + str(arsenal.get("put_away_pct", "N/A")))
        if statcast.get("note"):
            print("  Note: " + statcast.get("note", ""))

    trends = intel_data.get("trends", {})
    if trends and not trends.get("error"):
        print("")
        print("TRENDS (status: " + trends.get("status", "unknown") + ")")
        print("-" * 30)
        splits = trends.get("splits", {})
        if splits:
            # Print 14-day and 30-day splits
            for window in ["14d", "30d"]:
                games_key = "games_" + window
                if splits.get(games_key):
                    print("  Last " + window + " (" + str(splits.get(games_key, 0)) + " games):")
                    if splits.get("avg_" + window) is not None:
                        print("    AVG: " + str(splits.get("avg_" + window, "N/A"))
                              + " | OPS: " + str(splits.get("ops_" + window, "N/A"))
                              + " | HR: " + str(splits.get("hr_" + window, "N/A"))
                              + " | RBI: " + str(splits.get("rbi_" + window, "N/A")))
                    if splits.get("era_" + window) is not None:
                        print("    ERA: " + str(splits.get("era_" + window, "N/A"))
                              + " | WHIP: " + str(splits.get("whip_" + window, "N/A"))
                              + " | K: " + str(splits.get("k_" + window, "N/A"))
                              + " | IP: " + str(splits.get("ip_" + window, "N/A")))

    context = intel_data.get("context", {})
    if context and not context.get("error"):
        print("")
        print("REDDIT BUZZ")
        print("-" * 30)
        print("  Mentions: " + str(context.get("mentions", 0))
              + " | Sentiment: " + str(context.get("sentiment", "unknown"))
              + " | Avg Score: " + str(context.get("avg_score", "N/A")))
        for headline in context.get("headlines", []):
            print("  - " + headline)

    discipline = intel_data.get("discipline", {})
    if discipline and not discipline.get("error") and not discipline.get("note"):
        print("")
        print("PLATE DISCIPLINE")
        print("-" * 30)
        print("  BB%: " + str(discipline.get("bb_rate", "N/A"))
              + " | K%: " + str(discipline.get("k_rate", "N/A")))
        print("  O-Swing%: " + str(discipline.get("o_swing_pct", "N/A"))
              + " | Z-Contact%: " + str(discipline.get("z_contact_pct", "N/A")))
        print("  SwStr%: " + str(discipline.get("swstr_pct", "N/A")))
    elif discipline and discipline.get("note"):
        print("")
        print("PLATE DISCIPLINE")
        print("-" * 30)
        print("  " + discipline.get("note", ""))

    percentiles = intel_data.get("percentiles", {})
    if percentiles and not percentiles.get("error") and not percentiles.get("note"):
        pct_season = percentiles.get("data_season", "")
        pct_label = ""
        if pct_season and pct_season != YEAR:
            pct_label = " [" + str(pct_season) + " data]"
        print("")
        print("SAVANT PERCENTILES" + pct_label)
        print("-" * 30)
        metrics = percentiles.get("metrics", {})
        for key, val in metrics.items():
            print("  " + key.ljust(15) + str(val))
    elif percentiles and percentiles.get("note"):
        print("")
        print("SAVANT PERCENTILES")
        print("-" * 30)
        print("  " + percentiles.get("note", ""))


def cmd_breakouts(args, as_json=False):
    """Players where xwOBA >> wOBA (unlucky, due for positive regression)"""
    pos_type = args[0] if args else "B"
    count = 15
    if len(args) > 1:
        try:
            count = int(args[1])
        except (ValueError, TypeError):
            pass
    savant_type = "batter" if pos_type == "B" else "pitcher"
    expected = _fetch_savant_expected(savant_type)
    if not expected:
        if as_json:
            return {"error": "Could not fetch Savant data"}
        print("Could not fetch Savant data")
        return
    # Find players with biggest positive xwOBA - wOBA diff
    candidates = []
    for key, row in expected.items():
        if key.startswith("id:"):
            continue
        try:
            xwoba = float(row.get("est_woba", 0))
            woba = float(row.get("woba", 0))
            diff = xwoba - woba
            if diff > 0.020:
                candidates.append({
                    "name": row.get("player_name", key),
                    "woba": round(woba, 3),
                    "xwoba": round(xwoba, 3),
                    "diff": round(diff, 3),
                    "pa": int(float(row.get("pa", 0))),
                })
        except (ValueError, TypeError):
            pass
    candidates.sort(key=lambda x: -x.get("diff", 0))
    candidates = candidates[:count]
    if as_json:
        return {"pos_type": pos_type, "candidates": candidates}
    # Pretty print
    label = "Batters" if pos_type == "B" else "Pitchers"
    print("Breakout Candidates (" + label + ") - xwOBA >> wOBA")
    print("=" * 60)
    print("  " + "Name".ljust(25) + "wOBA".rjust(7) + "xwOBA".rjust(7) + "Diff".rjust(7) + "PA".rjust(6))
    print("  " + "-" * 52)
    for c in candidates:
        print("  " + str(c.get("name", "")).ljust(25)
              + str(c.get("woba", "")).rjust(7)
              + str(c.get("xwoba", "")).rjust(7)
              + ("+" + str(c.get("diff", ""))).rjust(7)
              + str(c.get("pa", "")).rjust(6))


def cmd_busts(args, as_json=False):
    """Players where wOBA >> xwOBA (lucky, due for negative regression)"""
    pos_type = args[0] if args else "B"
    count = 15
    if len(args) > 1:
        try:
            count = int(args[1])
        except (ValueError, TypeError):
            pass
    savant_type = "batter" if pos_type == "B" else "pitcher"
    expected = _fetch_savant_expected(savant_type)
    if not expected:
        if as_json:
            return {"error": "Could not fetch Savant data"}
        print("Could not fetch Savant data")
        return
    # Find players with biggest negative xwOBA - wOBA diff (wOBA >> xwOBA)
    candidates = []
    for key, row in expected.items():
        if key.startswith("id:"):
            continue
        try:
            xwoba = float(row.get("est_woba", 0))
            woba = float(row.get("woba", 0))
            diff = woba - xwoba
            if diff > 0.020:
                candidates.append({
                    "name": row.get("player_name", key),
                    "woba": round(woba, 3),
                    "xwoba": round(xwoba, 3),
                    "diff": round(diff, 3),
                    "pa": int(float(row.get("pa", 0))),
                })
        except (ValueError, TypeError):
            pass
    candidates.sort(key=lambda x: -x.get("diff", 0))
    candidates = candidates[:count]
    if as_json:
        return {"pos_type": pos_type, "candidates": candidates}
    # Pretty print
    label = "Batters" if pos_type == "B" else "Pitchers"
    print("Regression Risks (" + label + ") - wOBA >> xwOBA")
    print("=" * 60)
    print("  " + "Name".ljust(25) + "wOBA".rjust(7) + "xwOBA".rjust(7) + "Diff".rjust(7) + "PA".rjust(6))
    print("  " + "-" * 52)
    for c in candidates:
        print("  " + str(c.get("name", "")).ljust(25)
              + str(c.get("woba", "")).rjust(7)
              + str(c.get("xwoba", "")).rjust(7)
              + ("-" + str(c.get("diff", ""))).rjust(7)
              + str(c.get("pa", "")).rjust(6))


def cmd_reddit_buzz(args, as_json=False):
    """Hot posts from r/fantasybaseball"""
    posts = _fetch_reddit_hot()
    if not posts:
        if as_json:
            return {"posts": [], "note": "No posts fetched"}
        print("No posts fetched from Reddit")
        return

    # Categorize by flair
    categories = {}
    for post in posts:
        flair = post.get("flair") or "General"
        if flair not in categories:
            categories[flair] = []
        categories[flair].append(post)

    if as_json:
        return {"posts": posts, "categories": categories}

    print("Reddit r/fantasybaseball - Hot Posts")
    print("=" * 60)
    for flair, cat_posts in sorted(categories.items()):
        print("")
        print("[" + flair + "]")
        for post in cat_posts[:5]:
            score_str = str(post.get("score", 0))
            comments_str = str(post.get("num_comments", 0))
            print("  [" + score_str + " pts, " + comments_str + " comments] " + post.get("title", ""))


def cmd_trending(args, as_json=False):
    """Players with rising buzz on Reddit"""
    posts = _fetch_reddit_hot()
    if not posts:
        if as_json:
            return {"trending": [], "note": "No posts fetched"}
        print("No posts fetched from Reddit")
        return

    # Extract player names mentioned in high-engagement posts
    # Look for posts with above-average engagement
    avg_score = sum(p.get("score", 0) for p in posts) / len(posts) if posts else 0
    trending_posts = [p for p in posts if p.get("score", 0) > avg_score]

    # Also look at flairs that indicate player-specific discussion
    player_flairs = ["Hype", "Prospect", "Injury", "Player Discussion", "Breaking News"]
    highlighted = []
    for post in posts:
        flair = post.get("flair", "")
        if flair in player_flairs or post.get("score", 0) > avg_score * 1.5:
            highlighted.append({
                "title": post.get("title", ""),
                "score": post.get("score", 0),
                "num_comments": post.get("num_comments", 0),
                "flair": flair,
            })

    highlighted.sort(key=lambda x: -(x.get("score", 0) + x.get("num_comments", 0)))

    if as_json:
        return {"trending": highlighted[:20], "avg_score": round(avg_score, 1)}

    print("Trending Players / Topics")
    print("=" * 60)
    for item in highlighted[:20]:
        flair_str = " [" + item.get("flair", "") + "]" if item.get("flair") else ""
        print("  " + str(item.get("score", 0)).rjust(4) + " pts  "
              + str(item.get("num_comments", 0)).rjust(3) + " cmts"
              + flair_str + "  " + item.get("title", ""))


def cmd_prospect_watch(args, as_json=False):
    """Top prospects by ETA and recent transactions (call-ups)"""
    transactions = _fetch_mlb_transactions(days=14)
    if not transactions:
        if as_json:
            return {"prospects": [], "note": "No recent transactions found"}
        print("No recent transactions found")
        return

    # Filter for call-ups, option recalls, selections
    callup_keywords = ["recalled", "selected", "contract purchased", "optioned", "promoted"]
    callups = []
    for tx in transactions:
        desc_lower = tx.get("description", "").lower()
        tx_type = tx.get("type", "").lower()
        if any(kw in desc_lower or kw in tx_type for kw in callup_keywords):
            callups.append(tx)

    if as_json:
        return {"prospects": callups}

    print("Recent Call-Ups & Roster Moves")
    print("=" * 60)
    if not callups:
        print("  No recent call-ups found")
        return
    for tx in callups[:20]:
        player = tx.get("player_name", "Unknown")
        team = tx.get("team", "")
        tx_date = tx.get("date", "")
        desc = tx.get("description", "")
        print("  " + tx_date + "  " + player.ljust(25) + team)
        if desc:
            print("    " + desc[:80])


def cmd_transactions(args, as_json=False):
    """Recent fantasy-relevant MLB transactions"""
    days = 7
    if args:
        try:
            days = int(args[0])
        except (ValueError, TypeError):
            pass

    transactions = _fetch_mlb_transactions(days=days)
    if not transactions:
        if as_json:
            return {"transactions": [], "note": "No transactions found"}
        print("No transactions found in last " + str(days) + " days")
        return

    # Filter for fantasy-relevant transactions
    relevant_keywords = [
        "injured list", "disabled list", "recalled", "optioned",
        "designated for assignment", "released", "traded", "signed",
        "selected", "contract purchased", "activated", "transferred",
    ]
    relevant = []
    for tx in transactions:
        desc_lower = tx.get("description", "").lower()
        tx_type_lower = tx.get("type", "").lower()
        if any(kw in desc_lower or kw in tx_type_lower for kw in relevant_keywords):
            relevant.append(tx)

    if not relevant:
        relevant = transactions  # Show all if filter is too restrictive

    if as_json:
        return {"transactions": relevant, "days": days}

    print("Fantasy-Relevant MLB Transactions (last " + str(days) + " days)")
    print("=" * 60)
    for tx in relevant[:30]:
        player = tx.get("player_name", "")
        team = tx.get("team", "")
        tx_date = tx.get("date", "")
        tx_type = tx.get("type", "")
        desc = tx.get("description", "")
        header = tx_date
        if player:
            header = header + "  " + player
        if team:
            header = header + " (" + team + ")"
        if tx_type:
            header = header + " - " + tx_type
        print("  " + header)
        if desc:
            print("    " + desc[:100])


# ============================================================
# 12. COMMANDS dict + CLI dispatch
# ============================================================

COMMANDS = {
    "player": cmd_player_report,
    "breakouts": cmd_breakouts,
    "busts": cmd_busts,
    "reddit": cmd_reddit_buzz,
    "trending": cmd_trending,
    "prospects": cmd_prospect_watch,
    "transactions": cmd_transactions,
}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Fantasy Baseball Intelligence Module")
        print("Usage: intel.py <command> [args]")
        print("")
        print("Commands:")
        for name in COMMANDS:
            doc = COMMANDS[name].__doc__ or ""
            print("  " + name.ljust(15) + doc.strip())
        sys.exit(1)
    cmd = sys.argv[1]
    args = sys.argv[2:]
    if cmd in COMMANDS:
        COMMANDS[cmd](args)
    else:
        print("Unknown command: " + cmd)
        sys.exit(1)
