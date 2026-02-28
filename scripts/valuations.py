#!/usr/bin/env python3
"""Fantasy Baseball Z-Score Valuation Engine"""

import sys
import json
import os
import csv
import io
import urllib.request
from datetime import date

import pandas as pd
import numpy as np
from mlb_id_cache import get_mlb_id
from shared import enrich_with_intel

DATA_DIR = os.environ.get("DATA_DIR", "/app/data")

# FanGraphs projections API
FANGRAPHS_PROJ_URL = "https://www.fangraphs.com/api/projections"
PROJ_MAX_AGE = 86400  # 24 hours


def _proj_csv_path(stats_type):
    """Get path for projection CSV (bat or pit)"""
    filename = "projections_hitters.csv" if stats_type == "bat" else "projections_pitchers.csv"
    return os.path.join(DATA_DIR, filename)


def _proj_csv_is_fresh(path):
    """Check if a projection CSV exists and is less than 24h old"""
    if not os.path.exists(path):
        return False
    try:
        import time as _time
        age = _time.time() - os.path.getmtime(path)
        return age < PROJ_MAX_AGE
    except Exception:
        return True


def fetch_fangraphs_projections(stats_type, proj_type="steamer"):
    """Fetch projections from FanGraphs JSON API.
    stats_type: 'bat' or 'pit'
    proj_type: 'steamer', 'zips', or 'depthcharts'
    Returns a pandas DataFrame or None on failure.
    """
    url = (
        FANGRAPHS_PROJ_URL
        + "?type=" + proj_type
        + "&stats=" + stats_type
        + "&pos=all&team=0&players=0"
    )
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "YahooFantasyBot/1.0",
            "Accept": "application/json",
        })
        with urllib.request.urlopen(req, timeout=30) as response:
            raw = json.loads(response.read().decode())
        if not raw or not isinstance(raw, list):
            print("Warning: FanGraphs projections returned empty for " + stats_type)
            return None

        # Map FanGraphs JSON field names to CSV-compatible column names
        rows = []
        for entry in raw:
            row = {}
            row["Name"] = entry.get("PlayerName", entry.get("playerName", ""))
            row["Team"] = entry.get("Team", entry.get("team", ""))
            if stats_type == "bat":
                row["PA"] = entry.get("PA", 0)
                row["AB"] = entry.get("AB", 0)
                row["H"] = entry.get("H", 0)
                row["HR"] = entry.get("HR", 0)
                row["R"] = entry.get("R", 0)
                row["RBI"] = entry.get("RBI", 0)
                row["SB"] = entry.get("SB", 0)
                row["CS"] = entry.get("CS", 0)
                row["BB"] = entry.get("BB", 0)
                row["SO"] = entry.get("SO", entry.get("K", 0))
                row["AVG"] = entry.get("AVG", 0)
                row["OBP"] = entry.get("OBP", 0)
                row["SLG"] = entry.get("SLG", 0)
                row["2B"] = entry.get("2B", 0)
                row["3B"] = entry.get("3B", 0)
            else:
                row["IP"] = entry.get("IP", 0)
                row["W"] = entry.get("W", 0)
                row["L"] = entry.get("L", 0)
                row["ERA"] = entry.get("ERA", 0)
                row["WHIP"] = entry.get("WHIP", 0)
                row["K"] = entry.get("SO", entry.get("K", 0))
                row["BB"] = entry.get("BB", 0)
                row["SV"] = entry.get("SV", 0)
                row["HLD"] = entry.get("HLD", 0)
                row["GS"] = entry.get("GS", 0)
                row["G"] = entry.get("G", 0)
                row["ER"] = entry.get("ER", 0)
                row["QS"] = entry.get("QS", 0)
            rows.append(row)

        df = pd.DataFrame(rows)
        return df
    except Exception as e:
        print("Warning: FanGraphs projections fetch failed for " + stats_type + ": " + str(e))
        return None


def ensure_projections(proj_type="steamer", force=False):
    """Ensure projection CSVs exist. Auto-fetch if missing or stale.
    Returns tuple (hitters_source, pitchers_source) describing what happened.
    """
    os.makedirs(DATA_DIR, exist_ok=True)
    results = {}

    for stats_type in ["bat", "pit"]:
        path = _proj_csv_path(stats_type)
        label = "hitters" if stats_type == "bat" else "pitchers"

        if not force and _proj_csv_is_fresh(path):
            results[label] = "cached"
            continue

        print("Fetching " + proj_type + " projections for " + label + "...")
        df = fetch_fangraphs_projections(stats_type, proj_type=proj_type)
        if df is not None and len(df) > 0:
            df.to_csv(path, index=False)
            results[label] = "fetched (" + str(len(df)) + " players)"
            print("Saved " + str(len(df)) + " " + label + " projections to " + path)
        else:
            results[label] = "failed"
            print("Could not fetch " + label + " projections")

    return results


# Default league categories (fallback when API unavailable)
DEFAULT_BATTING_CATS = ["R", "H", "HR", "RBI", "TB", "AVG", "OBP", "XBH", "NSB"]
DEFAULT_BATTING_CATS_NEGATIVE = ["K"]
DEFAULT_PITCHING_CATS = ["IP", "W", "K", "HLD", "ERA", "WHIP", "QS", "NSV"]
DEFAULT_PITCHING_CATS_NEGATIVE = ["L", "ER"]

# Module-level aliases (used by existing code)
BATTING_CATS = DEFAULT_BATTING_CATS
BATTING_CATS_NEGATIVE = DEFAULT_BATTING_CATS_NEGATIVE
PITCHING_CATS = DEFAULT_PITCHING_CATS
PITCHING_CATS_NEGATIVE = DEFAULT_PITCHING_CATS_NEGATIVE

# Ratio stats that need playing-time weighting
RATIO_BATTING = ["AVG", "OBP"]
RATIO_PITCHING = ["ERA", "WHIP"]

# Positional scarcity bonuses
POS_BONUS = {"C": 1.5, "SS": 1.5, "2B": 0.5, "3B": 0.5, "RP": 0.5}

# Minimum thresholds (filter out tiny samples)
MIN_PA = 200
MIN_IP = 30

_cached_categories = None

def load_league_categories(lg=None):
    """Load scoring categories from Yahoo API, falling back to defaults"""
    global _cached_categories
    if _cached_categories:
        return _cached_categories
    if lg is None:
        _cached_categories = {
            "batting": list(DEFAULT_BATTING_CATS),
            "batting_negative": list(DEFAULT_BATTING_CATS_NEGATIVE),
            "pitching": list(DEFAULT_PITCHING_CATS),
            "pitching_negative": list(DEFAULT_PITCHING_CATS_NEGATIVE),
        }
        return _cached_categories
    try:
        cats = lg.stat_categories()
        batting = []
        batting_neg = []
        pitching = []
        pitching_neg = []
        for cat in cats:
            name = cat.get("display_name", "")
            pos_type = cat.get("position_type", "")
            is_negative = str(cat.get("is_only_display_stat", "0")) == "1"
            if not name:
                continue
            if pos_type == "B":
                if is_negative:
                    batting_neg.append(name)
                else:
                    batting.append(name)
            elif pos_type == "P":
                if is_negative:
                    pitching_neg.append(name)
                else:
                    pitching.append(name)
        if batting or pitching:
            _cached_categories = {
                "batting": batting,
                "batting_negative": batting_neg,
                "pitching": pitching,
                "pitching_negative": pitching_neg,
            }
        else:
            _cached_categories = {
                "batting": list(DEFAULT_BATTING_CATS),
                "batting_negative": list(DEFAULT_BATTING_CATS_NEGATIVE),
                "pitching": list(DEFAULT_PITCHING_CATS),
                "pitching_negative": list(DEFAULT_PITCHING_CATS_NEGATIVE),
            }
    except Exception:
        _cached_categories = {
            "batting": list(DEFAULT_BATTING_CATS),
            "batting_negative": list(DEFAULT_BATTING_CATS_NEGATIVE),
            "pitching": list(DEFAULT_PITCHING_CATS),
            "pitching_negative": list(DEFAULT_PITCHING_CATS_NEGATIVE),
        }
    return _cached_categories


def load_hitters_csv():
    """Load FanGraphs hitter projections CSV"""
    path = os.path.join(DATA_DIR, "projections_hitters.csv")
    if not os.path.exists(path):
        return None
    df = pd.read_csv(path)
    # Normalize column names (FanGraphs sometimes has spaces)
    df.columns = df.columns.str.strip()
    return df


def load_pitchers_csv():
    """Load FanGraphs pitcher projections CSV"""
    path = os.path.join(DATA_DIR, "projections_pitchers.csv")
    if not os.path.exists(path):
        return None
    df = pd.read_csv(path)
    df.columns = df.columns.str.strip()
    return df


def derive_hitter_stats(df):
    """Derive league-specific stats from FanGraphs columns"""
    out = pd.DataFrame()
    out["Name"] = df["Name"]
    out["Team"] = df.get("Team", "")
    out["PA"] = df.get("PA", 0)

    # Positional info - FanGraphs may not always have this
    if "Pos" in df.columns:
        out["Pos"] = df["Pos"]
    elif "POS" in df.columns:
        out["Pos"] = df["POS"]
    else:
        out["Pos"] = ""

    out["R"] = df.get("R", 0)
    out["H"] = df.get("H", 0)
    out["HR"] = df.get("HR", 0)
    out["RBI"] = df.get("RBI", 0)
    out["AVG"] = df.get("AVG", 0)
    out["OBP"] = df.get("OBP", 0)

    # K (negative - fewer is better for batters)
    if "SO" in df.columns:
        out["K"] = df["SO"]
    elif "K" in df.columns:
        out["K"] = df["K"]
    else:
        out["K"] = 0

    # TB = H + 2B + 2*3B + 3*HR
    doubles = df.get("2B", 0)
    triples = df.get("3B", 0)
    out["TB"] = df.get("H", 0) + doubles + 2 * triples + 3 * df.get("HR", 0)

    # XBH = 2B + 3B + HR
    out["XBH"] = doubles + triples + df.get("HR", 0)

    # NSB = SB - CS
    out["NSB"] = df.get("SB", 0) - df.get("CS", 0)

    return out


def derive_pitcher_stats(df):
    """Derive league-specific stats from FanGraphs columns"""
    out = pd.DataFrame()
    out["Name"] = df["Name"]
    out["Team"] = df.get("Team", "")
    out["IP"] = df.get("IP", 0)

    if "Pos" in df.columns:
        out["Pos"] = df["Pos"]
    elif "POS" in df.columns:
        out["Pos"] = df["POS"]
    else:
        # Guess SP vs RP from GS
        gs = df.get("GS", 0)
        g = df.get("G", 1)
        out["Pos"] = np.where(gs > g * 0.5, "SP", "RP")

    out["W"] = df.get("W", 0)
    out["K"] = df.get("K", df.get("SO", 0))
    out["HLD"] = df.get("HLD", 0)
    out["ERA"] = df.get("ERA", 0)
    out["WHIP"] = df.get("WHIP", 0)
    out["QS"] = df.get("QS", 0)
    out["NSV"] = df.get("SV", 0)

    # L (negative)
    out["L"] = df.get("L", 0)

    # ER (negative) - derive from ERA if not present
    if "ER" in df.columns:
        out["ER"] = df["ER"]
    else:
        out["ER"] = (df.get("ERA", 0) * df.get("IP", 0) / 9.0).round(0)

    return out


def calc_zscore(series, negative=False):
    """Calculate z-scores for a stat series"""
    mean = series.mean()
    std = series.std()
    if std == 0 or pd.isna(std):
        return pd.Series(0, index=series.index)
    z = (series - mean) / std
    if negative:
        z = z * -1
    return z


def calc_ratio_zscore(stat_series, weight_series, negative=False):
    """Z-score for ratio stats weighted by playing time"""
    # Weighted mean: sum(stat * weight) / sum(weight)
    total_weight = weight_series.sum()
    if total_weight == 0:
        return pd.Series(0, index=stat_series.index)
    weighted_mean = (stat_series * weight_series).sum() / total_weight
    # Weighted std
    variance = ((stat_series - weighted_mean) ** 2 * weight_series).sum() / total_weight
    std = np.sqrt(variance)
    if std == 0 or pd.isna(std):
        return pd.Series(0, index=stat_series.index)
    z = (stat_series - weighted_mean) / std
    if negative:
        z = z * -1
    # Scale by playing time relative to average
    avg_weight = weight_series.mean()
    if avg_weight > 0:
        z = z * (weight_series / avg_weight)
    return z


def compute_hitter_zscores(df):
    """Compute z-scores for all hitter categories"""
    # Filter by minimum PA
    mask = df["PA"] >= MIN_PA
    working = df[mask].copy()
    if len(working) == 0:
        return df.assign(Z_Total=0)

    z_cols = []

    # Counting stats
    for cat in BATTING_CATS:
        if cat in RATIO_BATTING:
            continue
        if cat not in working.columns:
            continue
        col = "Z_" + cat
        neg = cat in BATTING_CATS_NEGATIVE
        working[col] = calc_zscore(working[cat], negative=neg)
        z_cols.append(col)

    # Negative category
    for cat in BATTING_CATS_NEGATIVE:
        if cat not in working.columns:
            continue
        col = "Z_" + cat
        working[col] = calc_zscore(working[cat], negative=True)
        z_cols.append(col)

    # Ratio stats (weighted by PA)
    for cat in RATIO_BATTING:
        if cat not in working.columns:
            continue
        col = "Z_" + cat
        working[col] = calc_ratio_zscore(working[cat], working["PA"])
        z_cols.append(col)

    # Deduplicate z_cols (K appears in both BATTING_CATS_NEGATIVE processing)
    z_cols = list(dict.fromkeys(z_cols))

    # Sum z-scores
    working["Z_Total"] = working[z_cols].sum(axis=1)

    # Positional scarcity
    working["Z_PosAdj"] = working["Pos"].apply(get_pos_bonus)
    working["Z_Final"] = working["Z_Total"] + working["Z_PosAdj"]

    return working


def compute_pitcher_zscores(df):
    """Compute z-scores for all pitcher categories"""
    mask = df["IP"] >= MIN_IP
    working = df[mask].copy()
    if len(working) == 0:
        return df.assign(Z_Total=0)

    z_cols = []

    # Counting stats
    for cat in PITCHING_CATS:
        if cat in RATIO_PITCHING:
            continue
        if cat not in working.columns:
            continue
        col = "Z_" + cat
        working[col] = calc_zscore(working[cat])
        z_cols.append(col)

    # Negative categories
    for cat in PITCHING_CATS_NEGATIVE:
        if cat not in working.columns:
            continue
        col = "Z_" + cat
        working[col] = calc_zscore(working[cat], negative=True)
        z_cols.append(col)

    # Ratio stats (lower is better for ERA/WHIP, weighted by IP)
    for cat in RATIO_PITCHING:
        if cat not in working.columns:
            continue
        col = "Z_" + cat
        working[col] = calc_ratio_zscore(working[cat], working["IP"], negative=True)
        z_cols.append(col)

    z_cols = list(dict.fromkeys(z_cols))
    working["Z_Total"] = working[z_cols].sum(axis=1)

    # Positional scarcity
    working["Z_PosAdj"] = working["Pos"].apply(get_pos_bonus)
    working["Z_Final"] = working["Z_Total"] + working["Z_PosAdj"]

    return working


def get_pos_bonus(pos_str):
    """Get positional scarcity bonus from position string"""
    if not pos_str or pd.isna(pos_str):
        return 0
    pos_str = str(pos_str)
    best = 0
    for pos, bonus in POS_BONUS.items():
        if pos in pos_str:
            best = max(best, bonus)
    return best


# --- Live stats blending ---

def load_live_stats():
    """Load current-season live stats via pybaseball.
    Returns (hitters_df, pitchers_df) or (None, None) if unavailable.
    """
    try:
        from pybaseball import batting_stats, pitching_stats
        current_year = date.today().year
        h_df = batting_stats(current_year, qual=1)
        p_df = pitching_stats(current_year, qual=1)
        if h_df is not None and len(h_df) > 0:
            h_df.columns = h_df.columns.str.strip()
        else:
            h_df = None
        if p_df is not None and len(p_df) > 0:
            p_df.columns = p_df.columns.str.strip()
        else:
            p_df = None
        return h_df, p_df
    except Exception as e:
        print("Warning: live stats fetch failed: " + str(e))
        return None, None


def blend_projections_and_actual(proj_df, actual_df, stat_type="bat"):
    """Blend projection data with actual in-season stats.
    Weight: actual_weight = min(games_played / 80, 0.7)
    Counting stats: weighted rate-based blending
    Ratio stats: weighted by PA/IP
    """
    if proj_df is None or actual_df is None or len(actual_df) == 0:
        return proj_df

    # Build lookup from actual stats by name
    actual_by_name = {}
    for _, row in actual_df.iterrows():
        name = str(row.get("Name", "")).strip()
        if name:
            actual_by_name[name.lower()] = row

    blended_rows = []
    for _, proj_row in proj_df.iterrows():
        proj_name = str(proj_row.get("Name", "")).strip().lower()
        actual_row = actual_by_name.get(proj_name)

        if actual_row is None:
            blended_rows.append(proj_row)
            continue

        blended = proj_row.copy()

        if stat_type == "bat":
            games = float(actual_row.get("G", 0))
            actual_weight = min(games / 80.0, 0.7)
            proj_weight = 1.0 - actual_weight

            actual_pa = float(actual_row.get("PA", 0))
            proj_pa = float(proj_row.get("PA", 0))

            if actual_pa > 0 and proj_pa > 0:
                # Counting stats: blend per-PA rates then scale to projected PA
                counting = ["R", "H", "HR", "RBI", "SB", "CS", "2B", "3B"]
                for stat in counting:
                    a_val = float(actual_row.get(stat, actual_row.get("SO" if stat == "K" else stat, 0)))
                    p_val = float(proj_row.get(stat, 0))
                    a_rate = a_val / actual_pa if actual_pa > 0 else 0
                    p_rate = p_val / proj_pa if proj_pa > 0 else 0
                    blended_rate = (a_rate * actual_weight) + (p_rate * proj_weight)
                    blended[stat] = round(blended_rate * proj_pa)

                # SO/K
                a_so = float(actual_row.get("SO", actual_row.get("K", 0)))
                p_so = float(proj_row.get("SO", proj_row.get("K", 0)))
                a_rate = a_so / actual_pa if actual_pa > 0 else 0
                p_rate = p_so / proj_pa if proj_pa > 0 else 0
                blended_rate = (a_rate * actual_weight) + (p_rate * proj_weight)
                if "SO" in proj_row.index:
                    blended["SO"] = round(blended_rate * proj_pa)
                if "K" in proj_row.index:
                    blended["K"] = round(blended_rate * proj_pa)

                # Ratio stats: weighted by PA
                for stat in ["AVG", "OBP", "SLG"]:
                    a_val = float(actual_row.get(stat, 0))
                    p_val = float(proj_row.get(stat, 0))
                    total_pa = actual_pa + proj_pa
                    if total_pa > 0:
                        blended[stat] = round(
                            (a_val * actual_pa * actual_weight + p_val * proj_pa * proj_weight)
                            / (actual_pa * actual_weight + proj_pa * proj_weight), 3
                        )

                # BB
                a_bb = float(actual_row.get("BB", 0))
                p_bb = float(proj_row.get("BB", 0))
                a_rate = a_bb / actual_pa if actual_pa > 0 else 0
                p_rate = p_bb / proj_pa if proj_pa > 0 else 0
                blended_rate = (a_rate * actual_weight) + (p_rate * proj_weight)
                blended["BB"] = round(blended_rate * proj_pa)

        else:
            # Pitching
            games = float(actual_row.get("G", 0))
            actual_weight = min(games / 80.0, 0.7)
            proj_weight = 1.0 - actual_weight

            actual_ip = float(actual_row.get("IP", 0))
            proj_ip = float(proj_row.get("IP", 0))

            if actual_ip > 0 and proj_ip > 0:
                # Counting stats per IP
                counting = ["W", "L", "K", "BB", "SV", "HLD", "ER", "QS"]
                for stat in counting:
                    a_val = float(actual_row.get(stat, actual_row.get("SO" if stat == "K" else stat, 0)))
                    p_val = float(proj_row.get(stat, 0))
                    a_rate = a_val / actual_ip if actual_ip > 0 else 0
                    p_rate = p_val / proj_ip if proj_ip > 0 else 0
                    blended_rate = (a_rate * actual_weight) + (p_rate * proj_weight)
                    blended[stat] = round(blended_rate * proj_ip)

                # Ratio stats: weighted by IP
                for stat in ["ERA", "WHIP"]:
                    a_val = float(actual_row.get(stat, 0))
                    p_val = float(proj_row.get(stat, 0))
                    total_ip = actual_ip + proj_ip
                    if total_ip > 0:
                        blended[stat] = round(
                            (a_val * actual_ip * actual_weight + p_val * proj_ip * proj_weight)
                            / (actual_ip * actual_weight + proj_ip * proj_weight), 3
                        )

        blended_rows.append(blended)

    return pd.DataFrame(blended_rows)


# --- Fallback: load from JSON rankings ---

def load_from_json():
    """Load player data from hand-entered JSON rankings as fallback"""
    path = os.path.join(DATA_DIR, "player-rankings-2026.json")
    if not os.path.exists(path):
        return None, None

    with open(path, "r") as f:
        data = json.load(f)

    hitters = []
    for tier_key, tier_list in data.get("hitters_by_tier", {}).items():
        if not isinstance(tier_list, list):
            continue
        for p in tier_list:
            if "name" not in p or "value" not in p:
                continue
            hitters.append({
                "Name": p["name"],
                "Team": p.get("team", ""),
                "Pos": "",
                "Value": p["value"],
                "OBP": p.get("obp", 0),
                "K_pct": p.get("k_pct", 0),
            })

    pitchers = []
    for tier_key, tier_list in data.get("pitchers_by_tier", {}).items():
        if not isinstance(tier_list, list):
            continue
        for p in tier_list:
            if "name" not in p:
                continue
            pos = "RP" if tier_key in ("holds_specialists", "closers") else "SP"
            pitchers.append({
                "Name": p["name"],
                "Team": p.get("team", ""),
                "Pos": pos,
                "Value": p.get("value", 50),
                "ERA": p.get("era", 0),
                "WHIP": p.get("whip", 0),
                "QS": p.get("qs_proj", 0),
                "HLD": p.get("hld_proj", 0),
                "SV": p.get("sv_proj", 0),
            })

    h_df = pd.DataFrame(hitters) if hitters else None
    p_df = pd.DataFrame(pitchers) if pitchers else None

    # For JSON fallback, use the hand-entered "value" as a pseudo z-score
    if h_df is not None and len(h_df) > 0:
        mean_val = h_df["Value"].mean()
        std_val = h_df["Value"].std()
        if std_val > 0:
            h_df["Z_Total"] = (h_df["Value"] - mean_val) / std_val
        else:
            h_df["Z_Total"] = 0
        h_df["Z_PosAdj"] = h_df["Pos"].apply(get_pos_bonus)
        h_df["Z_Final"] = h_df["Z_Total"] + h_df["Z_PosAdj"]

    if p_df is not None and len(p_df) > 0:
        mean_val = p_df["Value"].mean()
        std_val = p_df["Value"].std()
        if std_val > 0:
            p_df["Z_Total"] = (p_df["Value"] - mean_val) / std_val
        else:
            p_df["Z_Total"] = 0
        p_df["Z_PosAdj"] = p_df["Pos"].apply(get_pos_bonus)
        p_df["Z_Final"] = p_df["Z_Total"] + p_df["Z_PosAdj"]

    return h_df, p_df


def load_all():
    """Load and compute valuations from best available data source.
    Priority: manual CSV (if fresh) -> auto-fetched projections -> JSON fallback
    """
    h_csv = load_hitters_csv()
    p_csv = load_pitchers_csv()

    # Auto-fetch projections if CSVs missing
    if h_csv is None or p_csv is None:
        try:
            ensure_projections()
            if h_csv is None:
                h_csv = load_hitters_csv()
            if p_csv is None:
                p_csv = load_pitchers_csv()
        except Exception as e:
            print("Warning: auto-fetch projections failed: " + str(e))

    hitters = None
    pitchers = None
    source = "json"

    # In-season blending: blend projections with live stats (April+)
    if h_csv is not None and date.today().month >= 4:
        try:
            live_h, live_p = load_live_stats()
            if live_h is not None and len(live_h) > 0:
                h_csv = blend_projections_and_actual(h_csv, live_h, stat_type="bat")
                source = "blended"
            if p_csv is not None and live_p is not None and len(live_p) > 0:
                p_csv = blend_projections_and_actual(p_csv, live_p, stat_type="pit")
                source = "blended"
        except Exception as e:
            print("Warning: live stats blending failed: " + str(e))

    if h_csv is not None:
        h_derived = derive_hitter_stats(h_csv)
        hitters = compute_hitter_zscores(h_derived)
        if source != "blended":
            source = "csv"

    if p_csv is not None:
        p_derived = derive_pitcher_stats(p_csv)
        pitchers = compute_pitcher_zscores(p_derived)
        if source != "blended":
            source = "csv"

    # Fallback to JSON for whichever is missing
    if hitters is None or pitchers is None:
        h_json, p_json = load_from_json()
        if hitters is None:
            hitters = h_json
            if pitchers is not None:
                source = "mixed"
        if pitchers is None:
            pitchers = p_json
            if hitters is not None and source == "csv":
                source = "mixed"

    return hitters, pitchers, source


def get_player_by_name(name, hitters, pitchers):
    """Find a player by partial name match"""
    name_lower = name.lower()
    results = []

    if hitters is not None:
        for _, row in hitters.iterrows():
            if name_lower in str(row.get("Name", "")).lower():
                r = row.to_dict()
                r["_type"] = "B"
                results.append(r)

    if pitchers is not None:
        for _, row in pitchers.iterrows():
            if name_lower in str(row.get("Name", "")).lower():
                r = row.to_dict()
                r["_type"] = "P"
                results.append(r)

    return results


def _safe_float(val):
    """Safely convert a value to float, handling NaN"""
    if pd.isna(val):
        return 0
    return float(val)


# --- CLI Commands ---

def cmd_rankings(args, as_json=False):
    """Show top N players by z-score value"""
    pos_type = args[0].upper() if args else "B"
    count = int(args[1]) if len(args) > 1 else 25

    hitters, pitchers, source = load_all()

    if pos_type == "B":
        if hitters is None or len(hitters) == 0:
            if as_json:
                return {"source": source, "pos_type": pos_type, "players": []}
            print("Data source: " + source)
            print("No hitter data available")
            return
        df = hitters.sort_values("Z_Final", ascending=False).head(count)
    else:
        if pitchers is None or len(pitchers) == 0:
            if as_json:
                return {"source": source, "pos_type": pos_type, "players": []}
            print("Data source: " + source)
            print("No pitcher data available")
            return
        df = pitchers.sort_values("Z_Final", ascending=False).head(count)

    if as_json:
        players = []
        for i, (_, row) in enumerate(df.iterrows(), 1):
            z = _safe_float(row.get("Z_Final", 0))
            players.append({
                "rank": i,
                "name": str(row.get("Name", "?")),
                "team": str(row.get("Team", "")),
                "pos": str(row.get("Pos", "")),
                "z_score": round(z, 2),
                "mlb_id": get_mlb_id(str(row.get("Name", ""))),
            })
        enrich_with_intel(players)
        return {"source": source, "pos_type": pos_type, "players": players}

    print("Data source: " + source)

    if pos_type == "B":
        print("\nTop " + str(count) + " Hitters by Z-Score:")
        print("-" * 65)
        print("  #  " + "Name".ljust(25) + "Team".ljust(6) + "Pos".ljust(8) + "Z-Score")
        print("-" * 65)
        for i, (_, row) in enumerate(df.iterrows(), 1):
            name = str(row.get("Name", "?"))
            team = str(row.get("Team", ""))
            pos = str(row.get("Pos", ""))
            z = row.get("Z_Final", 0)
            print("  " + str(i).rjust(2) + ". " + name.ljust(25) + team.ljust(6) + pos.ljust(8) + "{:.2f}".format(z))
    else:
        print("\nTop " + str(count) + " Pitchers by Z-Score:")
        print("-" * 65)
        print("  #  " + "Name".ljust(25) + "Team".ljust(6) + "Pos".ljust(8) + "Z-Score")
        print("-" * 65)
        for i, (_, row) in enumerate(df.iterrows(), 1):
            name = str(row.get("Name", "?"))
            team = str(row.get("Team", ""))
            pos = str(row.get("Pos", ""))
            z = row.get("Z_Final", 0)
            print("  " + str(i).rjust(2) + ". " + name.ljust(25) + team.ljust(6) + pos.ljust(8) + "{:.2f}".format(z))


def cmd_compare(args, as_json=False):
    """Compare two players side by side"""
    if len(args) < 2:
        if as_json:
            return {"error": "Need two player names"}
        print("Usage: valuations.py compare <name1> <name2>")
        print("  Use quotes for multi-word names: compare \"Juan Soto\" \"Aaron Judge\"")
        return

    hitters, pitchers, source = load_all()

    p1 = get_player_by_name(args[0], hitters, pitchers)
    p2 = get_player_by_name(args[1], hitters, pitchers)

    if not p1:
        if as_json:
            return {"error": "Player not found: " + args[0]}
        print("Player not found: " + args[0])
        return
    if not p2:
        if as_json:
            return {"error": "Player not found: " + args[1]}
        print("Player not found: " + args[1])
        return

    a = p1[0]
    b = p2[0]

    if as_json:
        z_keys = sorted([k for k in set(list(a.keys()) + list(b.keys())) if k.startswith("Z_")])
        z_scores = {}
        for key in z_keys:
            label = key.replace("Z_", "")
            z_scores[label] = {
                "player1": round(_safe_float(a.get(key, 0)), 2),
                "player2": round(_safe_float(b.get(key, 0)), 2),
            }
        p1_info = {
            "name": str(a.get("Name", "?")),
            "type": str(a.get("_type", "?")),
            "team": str(a.get("Team", "")),
            "pos": str(a.get("Pos", "")),
        }
        p2_info = {
            "name": str(b.get("Name", "?")),
            "type": str(b.get("_type", "?")),
            "team": str(b.get("Team", "")),
            "pos": str(b.get("Pos", "")),
        }
        enrich_with_intel([p1_info, p2_info])
        return {
            "player1": p1_info,
            "player2": p2_info,
            "z_scores": z_scores,
        }

    print("\n" + "=" * 55)
    print("PLAYER COMPARISON")
    print("=" * 55)
    print("  " + "".ljust(18) + str(a.get("Name", "?")).ljust(20) + str(b.get("Name", "?")))
    print("-" * 55)
    print("  " + "Type".ljust(18) + str(a.get("_type", "?")).ljust(20) + str(b.get("_type", "?")))
    print("  " + "Team".ljust(18) + str(a.get("Team", "")).ljust(20) + str(b.get("Team", "")))
    print("  " + "Position".ljust(18) + str(a.get("Pos", "")).ljust(20) + str(b.get("Pos", "")))

    # Show z-score columns
    z_keys = sorted([k for k in set(list(a.keys()) + list(b.keys())) if k.startswith("Z_")])
    for key in z_keys:
        label = key.replace("Z_", "")
        val_a = a.get(key, 0)
        val_b = b.get(key, 0)
        if pd.isna(val_a):
            val_a = 0
        if pd.isna(val_b):
            val_b = 0
        line = "  " + label.ljust(18) + "{:.2f}".format(val_a).ljust(20) + "{:.2f}".format(val_b)
        print(line)

    print("=" * 55)


def cmd_value(args, as_json=False):
    """Show a player's z-score breakdown"""
    if not args:
        if as_json:
            return {"players": []}
        print("Usage: valuations.py value <player_name>")
        return

    name = " ".join(args)
    hitters, pitchers, source = load_all()
    results = get_player_by_name(name, hitters, pitchers)

    if not results:
        if as_json:
            return {"players": []}
        print("Player not found: " + name)
        return

    if as_json:
        players = []
        for p in results:
            skip = {"Name", "Team", "Pos", "_type"}
            raw_stats = {}
            z_scores = {}
            for k in p.keys():
                if k in skip:
                    continue
                val = p[k]
                if pd.isna(val):
                    val = 0
                if k.startswith("Z_"):
                    label = k.replace("Z_", "")
                    z_scores[label] = round(float(val), 2) if isinstance(val, (int, float)) else val
                else:
                    raw_stats[k] = round(float(val), 3) if isinstance(val, float) else val
            players.append({
                "name": str(p.get("Name", "?")),
                "type": str(p.get("_type", "?")),
                "team": str(p.get("Team", "")),
                "pos": str(p.get("Pos", "")),
                "raw_stats": raw_stats,
                "z_scores": z_scores,
            })
        enrich_with_intel(players)
        return {"players": players}

    for p in results:
        print("\n" + "=" * 45)
        print(str(p.get("Name", "?")) + " (" + str(p.get("_type", "?")) + ")")
        print("Team: " + str(p.get("Team", "")) + "  Pos: " + str(p.get("Pos", "")))
        print("=" * 45)

        # Show raw stats
        skip = {"Name", "Team", "Pos", "_type"}
        z_keys = []
        raw_keys = []
        for k in p.keys():
            if k in skip:
                continue
            if k.startswith("Z_"):
                z_keys.append(k)
            else:
                raw_keys.append(k)

        if raw_keys:
            print("\nRaw Stats:")
            for k in raw_keys:
                val = p[k]
                if pd.isna(val):
                    val = 0
                if isinstance(val, float):
                    print("  " + k.ljust(12) + "{:.3f}".format(val))
                else:
                    print("  " + k.ljust(12) + str(val))

        if z_keys:
            print("\nZ-Scores:")
            z_keys_sorted = sorted(z_keys)
            for k in z_keys_sorted:
                val = p[k]
                if pd.isna(val):
                    val = 0
                label = k.replace("Z_", "")
                print("  " + label.ljust(12) + "{:.2f}".format(val))

        print("-" * 45)


def cmd_import_csv(args):
    """Import FanGraphs CSV projections into the data directory"""
    if not args:
        print("Usage: valuations.py import-csv <filepath>")
        print("  The file will be auto-detected as hitters or pitchers")
        print("  based on column names (PA = hitters, IP = pitchers)")
        return

    filepath = args[0]
    if not os.path.exists(filepath):
        print("File not found: " + filepath)
        return

    # Read and detect type
    df = pd.read_csv(filepath)
    df.columns = df.columns.str.strip()

    if "PA" in df.columns and "AB" in df.columns:
        dest = os.path.join(DATA_DIR, "projections_hitters.csv")
        label = "hitters"
    elif "IP" in df.columns and ("ERA" in df.columns or "W" in df.columns):
        dest = os.path.join(DATA_DIR, "projections_pitchers.csv")
        label = "pitchers"
    else:
        print("Could not detect file type. Expected FanGraphs hitter or pitcher projections.")
        print("Columns found: " + ", ".join(df.columns[:15].tolist()))
        return

    # Ensure data dir exists
    os.makedirs(DATA_DIR, exist_ok=True)
    df.to_csv(dest, index=False)
    print("Imported " + str(len(df)) + " " + label + " to " + dest)


def cmd_generate(args):
    """Generate rankings from imported projections"""
    hitters, pitchers, source = load_all()

    if source == "json":
        print("WARNING: No CSV projections found, using JSON fallback data.")
        print("Import FanGraphs projections with: valuations.py import-csv <file>")

    print("Source: " + source)

    results = {"hitters": [], "pitchers": []}

    if hitters is not None and len(hitters) > 0:
        h_sorted = hitters.sort_values("Z_Final", ascending=False)
        print("Generated rankings for " + str(len(h_sorted)) + " hitters")
        for _, row in h_sorted.iterrows():
            results["hitters"].append({
                "name": str(row.get("Name", "")),
                "team": str(row.get("Team", "")),
                "pos": str(row.get("Pos", "")),
                "z_total": round(float(row.get("Z_Total", 0)), 2),
                "z_pos_adj": round(float(row.get("Z_PosAdj", 0)), 2),
                "z_final": round(float(row.get("Z_Final", 0)), 2),
            })

    if pitchers is not None and len(pitchers) > 0:
        p_sorted = pitchers.sort_values("Z_Final", ascending=False)
        print("Generated rankings for " + str(len(p_sorted)) + " pitchers")
        for _, row in p_sorted.iterrows():
            results["pitchers"].append({
                "name": str(row.get("Name", "")),
                "team": str(row.get("Team", "")),
                "pos": str(row.get("Pos", "")),
                "z_total": round(float(row.get("Z_Total", 0)), 2),
                "z_pos_adj": round(float(row.get("Z_PosAdj", 0)), 2),
                "z_final": round(float(row.get("Z_Final", 0)), 2),
            })

    # Save generated rankings
    out_path = os.path.join(DATA_DIR, "generated_rankings.json")
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
    print("Saved to " + out_path)


COMMANDS = {
    "rankings": cmd_rankings,
    "compare": cmd_compare,
    "value": cmd_value,
    "import-csv": cmd_import_csv,
    "generate": cmd_generate,
}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Fantasy Baseball Z-Score Valuation Engine")
        print("Usage: valuations.py <command> [args]")
        print("\nCommands:")
        print("  rankings [B|P] [count]      - Top players by z-score")
        print("  compare <name1> <name2>     - Compare two players")
        print("  value <name>                - Player z-score breakdown")
        print("  import-csv <filepath>       - Import FanGraphs CSV projections")
        print("  generate                    - Generate rankings from projections")
        print("\nData: looks for projections_hitters.csv / projections_pitchers.csv in " + DATA_DIR)
        print("Fallback: uses player-rankings-2026.json for basic valuations")
        sys.exit(1)

    cmd = sys.argv[1]
    args = sys.argv[2:]

    if cmd in COMMANDS:
        COMMANDS[cmd](args)
    else:
        print("Unknown command: " + cmd)
