#!/usr/bin/env python3
"""Yahoo Fantasy Baseball In-Season Manager"""

import sys
import json
import os
import sqlite3
import importlib
import urllib.request
from datetime import datetime, date, timedelta

import yahoo_fantasy_api as yfa

try:
    import statsapi
except ImportError:
    statsapi = None

from mlb_id_cache import get_mlb_id
from shared import (
    get_connection, get_league_context, get_league,
    LEAGUE_ID, TEAM_ID, GAME_KEY, DATA_DIR,
    MLB_API, mlb_fetch, TEAM_ALIASES, normalize_team_name,
    get_trend_lookup, enrich_with_intel, enrich_with_trends,
)

from yahoo_browser import is_scope_error as _is_scope_error, write_method as _write_method


def get_db():
    """Get SQLite connection with tables initialized"""
    db_path = os.path.join(DATA_DIR, "season.db")
    db = sqlite3.connect(db_path)
    db.execute("""CREATE TABLE IF NOT EXISTS ownership_history
                  (player_id TEXT, date TEXT, pct_owned REAL,
                   PRIMARY KEY (player_id, date))""")
    db.execute("""CREATE TABLE IF NOT EXISTS category_history
                  (week INTEGER, category TEXT, value REAL, rank INTEGER,
                   PRIMARY KEY (week, category))""")
    db.commit()
    return db


def get_todays_schedule():
    """Get today's MLB schedule"""
    today = date.today().isoformat()
    if statsapi:
        try:
            return statsapi.schedule(date=today)
        except Exception as e:
            print("  Warning: statsapi schedule failed, falling back to urllib: " + str(e))
    # Fallback to urllib
    try:
        data = mlb_fetch("/schedule?sportId=1&date=" + today)
        games = []
        for date_data in data.get("dates", []):
            for game in date_data.get("games", []):
                away = game.get("teams", {}).get("away", {}).get("team", {}).get("name", "")
                home = game.get("teams", {}).get("home", {}).get("team", {}).get("name", "")
                games.append({
                    "away_name": away,
                    "home_name": home,
                    "game_date": date_data.get("date", ""),
                    "status": game.get("status", {}).get("detailedState", ""),
                })
        return games
    except Exception as e:
        print("  Warning: schedule fetch failed: " + str(e))
        return []


def get_schedule_for_range(start_date, end_date):
    """Get MLB schedule for a date range"""
    if statsapi:
        try:
            return statsapi.schedule(start_date=start_date, end_date=end_date)
        except Exception as e:
            print("  Warning: statsapi range schedule failed: " + str(e))
    # Fallback
    try:
        data = mlb_fetch("/schedule?sportId=1&startDate=" + start_date + "&endDate=" + end_date)
        games = []
        for date_data in data.get("dates", []):
            for game in date_data.get("games", []):
                away = game.get("teams", {}).get("away", {}).get("team", {}).get("name", "")
                home = game.get("teams", {}).get("home", {}).get("team", {}).get("name", "")
                games.append({
                    "away_name": away,
                    "home_name": home,
                    "game_date": date_data.get("date", ""),
                    "status": game.get("status", {}).get("detailedState", ""),
                })
        return games
    except Exception as e:
        print("  Warning: range schedule fetch failed: " + str(e))
        return []


def team_plays_today(team_name, schedule):
    """Check if an MLB team has a game in the given schedule"""
    if not team_name or not schedule:
        return False
    norm = normalize_team_name(team_name)
    # Also check aliases
    full_name = TEAM_ALIASES.get(team_name, team_name)
    norm_full = normalize_team_name(full_name)
    for game in schedule:
        away = normalize_team_name(game.get("away_name", ""))
        home = normalize_team_name(game.get("home_name", ""))
        if norm in away or norm in home or norm_full in away or norm_full in home:
            return True
    return False


def get_player_team(player):
    """Extract MLB team name from a Yahoo roster player dict"""
    # Yahoo roster entries may have editorial_team_full_name or editorial_team_abbr
    team_name = player.get("editorial_team_full_name", "")
    if not team_name:
        team_name = player.get("editorial_team_abbr", "")
    if not team_name:
        # Try name field patterns
        team_name = player.get("team", "")
    return team_name


def get_player_position(player):
    """Get the selected position for a roster player"""
    return player.get("selected_position", {}).get("position", "?")


def is_bench(player):
    """Check if player is on the bench"""
    pos = get_player_position(player)
    return pos in ("BN", "Bench")


def is_il(player):
    """Check if player is on injured list slot"""
    pos = get_player_position(player)
    return pos in ("IL", "IL+", "DL", "DL+")


def is_active_slot(player):
    """Check if player is in an active (non-bench, non-IL) slot"""
    return not is_bench(player) and not is_il(player)


def _player_info(p):
    """Build a player info dict for JSON responses"""
    return {
        "name": p.get("name", "Unknown"),
        "position": get_player_position(p),
        "team": get_player_team(p),
        "eligible_positions": p.get("eligible_positions", []),
        "status": p.get("status", ""),
        "mlb_id": get_mlb_id(p.get("name", "")),
    }


# ---------- Commands ----------


def cmd_lineup_optimize(args, as_json=False):
    """Cross-reference roster with MLB schedule to find off-day players"""
    apply_changes = "--apply" in args

    if not as_json:
        print("Lineup Optimizer")
        print("=" * 50)

    sc, gm, lg, team = get_league_context()

    try:
        roster = team.roster()
    except Exception as e:
        if as_json:
            return {"error": "Error fetching roster: " + str(e)}
        print("Error fetching roster: " + str(e))
        return

    if not roster:
        if as_json:
            return {"games_today": 0, "active_off_day": [], "bench_playing": [], "il_players": [], "suggested_swaps": [], "applied": False}
        print("Roster is empty (predraft or preseason)")
        return

    if not as_json:
        print("Fetching today's MLB schedule...")
    schedule = get_todays_schedule()
    if not schedule:
        if as_json:
            return {"games_today": 0, "active_off_day": [], "bench_playing": [], "il_players": [], "suggested_swaps": [], "applied": False}
        print("No games scheduled today (off day or could not fetch schedule)")
        return

    if not as_json:
        print("Games today: " + str(len(schedule)))
        print("")

    active_off_day = []   # Players in lineup whose team is OFF
    bench_playing = []    # Bench players whose team IS playing
    il_players = []       # Players on IL
    active_playing = []   # Active players who are playing (good)
    bench_off_day = []    # Bench players on off day (fine)

    for p in roster:
        name = p.get("name", "Unknown")
        team_name = get_player_team(p)
        status = p.get("status", "")
        pos = get_player_position(p)
        playing = team_plays_today(team_name, schedule)

        if is_il(p):
            il_players.append(p)
        elif is_bench(p):
            if playing:
                bench_playing.append(p)
            else:
                bench_off_day.append(p)
        else:
            # Active slot
            if playing:
                active_playing.append(p)
            else:
                active_off_day.append(p)

    # Build swap suggestions
    swaps = []
    if active_off_day and bench_playing:
        bench_avail = list(bench_playing)
        for off_player in active_off_day:
            off_pos = get_player_position(off_player)
            off_name = off_player.get("name", "Unknown")
            # Find a bench player eligible for that position
            match = None
            for bp in bench_avail:
                bp_elig = bp.get("eligible_positions", [])
                if off_pos in bp_elig or "Util" == off_pos:
                    match = bp
                    break
            if match:
                bench_avail.remove(match)
                swaps.append((off_player, match))

    if as_json:
        swap_list = []
        for off_p, bench_p in swaps:
            swap_list.append({
                "bench_player": off_p.get("name", "Unknown"),
                "start_player": bench_p.get("name", "Unknown"),
                "position": get_player_position(off_p),
            })
        active_off_day_info = [_player_info(p) for p in active_off_day]
        bench_playing_info = [_player_info(p) for p in bench_playing]
        il_players_info = [_player_info(p) for p in il_players]
        all_players = active_off_day_info + bench_playing_info + il_players_info
        enrich_with_intel(all_players)
        return {
            "games_today": len(schedule),
            "active_off_day": active_off_day_info,
            "bench_playing": bench_playing_info,
            "il_players": il_players_info,
            "suggested_swaps": swap_list,
            "applied": apply_changes,
        }

    # Report
    if active_off_day:
        print("PROBLEM: Active players on OFF DAY:")
        for p in active_off_day:
            name = p.get("name", "Unknown")
            pos = get_player_position(p)
            team_name = get_player_team(p)
            print("  " + pos.ljust(4) + " " + name.ljust(25) + " (" + team_name + ") - NO GAME")
    else:
        print("All active players have games today.")

    print("")

    if bench_playing:
        print("OPPORTUNITY: Bench players WITH games today:")
        for p in bench_playing:
            name = p.get("name", "Unknown")
            elig = ",".join(p.get("eligible_positions", []))
            team_name = get_player_team(p)
            print("  BN   " + name.ljust(25) + " (" + team_name + ") - eligible: " + elig)
    else:
        print("No bench players with games today.")

    print("")

    if il_players:
        print("IL Players:")
        for p in il_players:
            name = p.get("name", "Unknown")
            status = p.get("status", "")
            pos = get_player_position(p)
            print("  " + pos.ljust(4) + " " + name.ljust(25) + " [" + status + "]")
        print("")

    # Suggest swaps
    if swaps:
        print("Suggested Swaps:")
        for off_player, match in swaps:
            off_name = off_player.get("name", "Unknown")
            off_pos = get_player_position(off_player)
            match_name = match.get("name", "Unknown")
            print("  Bench " + off_name + " (" + off_pos + "), Start " + match_name)
        print("")

    if not swaps:
        print("No swaps needed - lineup looks good!")
        return

    if apply_changes:
        print("Applying roster changes...")
        try:
            # Build the new roster positions
            changes = []
            for off_player, bench_player in swaps:
                off_pos = get_player_position(off_player)
                off_key = off_player.get("player_id", "")
                bench_key = bench_player.get("player_id", "")
                # Swap: move bench player to active slot, move off-day player to bench
                changes.append({
                    "player_id": bench_key,
                    "selected_position": off_pos,
                })
                changes.append({
                    "player_id": off_key,
                    "selected_position": "BN",
                })
            # Apply via roster changes
            today_str = date.today().isoformat()
            for change in changes:
                pid = change.get("player_id", "")
                new_pos = change.get("selected_position", "")
                try:
                    team.change_positions(date.today(), [{"player_id": pid, "selected_position": new_pos}])
                except Exception as e:
                    print("  Error moving player " + str(pid) + " to " + new_pos + ": " + str(e))
            print("Roster changes applied!")
        except Exception as e:
            print("Error applying changes: " + str(e))
    else:
        print("Use --apply to execute these changes")


def cmd_category_check(args, as_json=False):
    """Show where you rank in each stat category vs the league"""
    if not as_json:
        print("Category Check")
        print("=" * 50)

    sc, gm, lg = get_league()

    try:
        scoreboard = lg.scoreboard()
    except Exception as e:
        if as_json:
            return {"error": "Error fetching scoreboard: " + str(e)}
        print("Error fetching scoreboard: " + str(e))
        return

    if not scoreboard:
        if as_json:
            return {"week": 0, "categories": [], "strongest": [], "weakest": []}
        print("No scoreboard data available (season may not have started)")
        return

    # Try to extract category data from scoreboard
    my_cats = {}
    all_teams_cats = {}

    try:
        if isinstance(scoreboard, list):
            for matchup in scoreboard:
                teams = []
                if isinstance(matchup, dict):
                    teams = matchup.get("teams", [])
                for t in teams:
                    team_key = t.get("team_key", "")
                    stats = t.get("stats", {})
                    if not stats and isinstance(t, dict):
                        for k, v in t.items():
                            if isinstance(v, dict) and "value" in v:
                                stats[k] = v.get("value", 0)
                    if team_key:
                        all_teams_cats[team_key] = stats
                    if TEAM_ID in str(team_key):
                        my_cats = stats
        elif isinstance(scoreboard, dict):
            for key, val in scoreboard.items():
                if isinstance(val, dict):
                    all_teams_cats[key] = val
    except Exception as e:
        if not as_json:
            print("Error parsing scoreboard: " + str(e))

    if not my_cats:
        if as_json:
            return {"week": 0, "categories": [], "strongest": [], "weakest": []}
        print("Could not parse category data. Raw scoreboard:")
        print("  " + str(scoreboard)[:500])
        return

    # Calculate ranks
    cat_ranks = {}
    for cat, my_val in my_cats.items():
        try:
            my_num = float(my_val)
        except (ValueError, TypeError):
            continue
        values = []
        for team_key, stats in all_teams_cats.items():
            try:
                values.append(float(stats.get(cat, 0)))
            except (ValueError, TypeError):
                pass
        lower_is_better = cat.upper() in ("ERA", "WHIP", "BB", "L")
        if lower_is_better:
            values.sort()
        else:
            values.sort(reverse=True)
        rank = 1
        for v in values:
            if lower_is_better:
                if my_num <= v:
                    break
            else:
                if my_num >= v:
                    break
            rank += 1
        cat_ranks[cat] = {"value": my_val, "rank": rank, "total": len(values)}

    if not cat_ranks:
        if as_json:
            return {"week": 0, "categories": [], "strongest": [], "weakest": []}
        print("No category rankings could be calculated")
        return

    sorted_cats = sorted(cat_ranks.items(), key=lambda x: x[1]["rank"])
    num_teams = max(c["total"] for c in cat_ranks.values()) if cat_ranks else 0
    week = lg.current_week()

    strong = [c for c, i in sorted_cats if i["rank"] <= 3]
    weak = [c for c, i in sorted_cats if i["rank"] >= (i["total"] - 2) and i["total"] > 3]

    if as_json:
        categories = []
        for cat, info in sorted_cats:
            strength = ""
            if info["rank"] <= 3:
                strength = "strong"
            elif info["rank"] >= info["total"] - 2 and info["total"] > 3:
                strength = "weak"
            categories.append({
                "name": cat,
                "value": info["value"],
                "rank": info["rank"],
                "total": info["total"],
                "strength": strength,
            })
        return {
            "week": week,
            "categories": categories,
            "strongest": strong,
            "weakest": weak,
        }

    print("Your Category Rankings (week " + str(week) + "):")
    print("")
    print("  " + "Category".ljust(12) + "Value".rjust(10) + "  Rank")
    print("  " + "-" * 35)

    for cat, info in sorted_cats:
        rank = info["rank"]
        val = info["value"]
        total = info["total"]
        marker = ""
        if rank <= 3:
            marker = " << STRONG"
        elif rank >= total - 2 and total > 3:
            marker = " << WEAK"
        line = "  " + cat.ljust(12) + str(val).rjust(10) + "  " + str(rank) + "/" + str(total) + marker
        print(line)

    # Store in DB
    try:
        db = get_db()
        for cat, info in cat_ranks.items():
            try:
                db.execute(
                    "INSERT OR REPLACE INTO category_history (week, category, value, rank) VALUES (?, ?, ?, ?)",
                    (week, cat, float(info["value"]), info["rank"])
                )
            except (ValueError, TypeError):
                pass
        db.commit()
        db.close()
    except Exception as e:
        print("  Warning: could not save category history: " + str(e))

    print("")

    if strong:
        print("Strongest: " + ", ".join(strong))
    if weak:
        print("Weakest:   " + ", ".join(weak))


def cmd_injury_report(args, as_json=False):
    """Check roster for injured/IL-eligible players"""
    if not as_json:
        print("Injury Report")
        print("=" * 50)

    sc, gm, lg, team = get_league_context()

    try:
        roster = team.roster()
    except Exception as e:
        if as_json:
            return {"error": "Error fetching roster: " + str(e)}
        print("Error fetching roster: " + str(e))
        return

    if not roster:
        if as_json:
            return {"injured_active": [], "healthy_il": [], "injured_bench": [], "il_proper": []}
        print("Roster is empty")
        return

    # Get MLB injuries
    mlb_injuries = {}
    try:
        data = mlb_fetch("/injuries")
        for inj in data.get("injuries", []):
            player_name = inj.get("player", {}).get("fullName", "")
            if player_name:
                mlb_injuries[player_name.lower()] = {
                    "description": inj.get("description", "Unknown"),
                    "date": inj.get("date", ""),
                    "status": inj.get("status", ""),
                }
    except Exception as e:
        if not as_json:
            print("  Warning: could not fetch MLB injuries: " + str(e))

    injured_active = []   # Injured but in active roster slot (bad)
    healthy_il = []       # On IL slot but no injury status (inefficient)
    il_proper = []        # Injured and on IL (correct)
    injured_bench = []    # Injured on bench (could go to IL)

    for p in roster:
        name = p.get("name", "Unknown")
        status = p.get("status", "")
        pos = get_player_position(p)
        has_yahoo_injury = status and status not in ("", "Healthy")
        mlb_inj = mlb_injuries.get(name.lower())

        if is_il(p):
            if has_yahoo_injury or mlb_inj:
                il_proper.append(p)
            else:
                healthy_il.append(p)
        elif is_bench(p):
            if has_yahoo_injury or mlb_inj:
                injured_bench.append(p)
        else:
            # Active slot
            if has_yahoo_injury or mlb_inj:
                injured_active.append(p)

    if as_json:
        def injury_info(p):
            info = _player_info(p)
            mlb_inj = mlb_injuries.get(p.get("name", "").lower())
            if mlb_inj:
                info["injury_description"] = mlb_inj.get("description", "")
            return info

        injured_active_info = [injury_info(p) for p in injured_active]
        healthy_il_info = [injury_info(p) for p in healthy_il]
        injured_bench_info = [injury_info(p) for p in injured_bench]
        il_proper_info = [injury_info(p) for p in il_proper]
        all_players = injured_active_info + healthy_il_info + injured_bench_info + il_proper_info
        enrich_with_intel(all_players)
        return {
            "injured_active": injured_active_info,
            "healthy_il": healthy_il_info,
            "injured_bench": injured_bench_info,
            "il_proper": il_proper_info,
        }

    # Report
    if injured_active:
        print("")
        print("PROBLEM: Injured players in ACTIVE lineup:")
        for p in injured_active:
            name = p.get("name", "Unknown")
            status = p.get("status", "")
            pos = get_player_position(p)
            mlb_inj = mlb_injuries.get(name.lower())
            desc = ""
            if mlb_inj:
                desc = " - " + mlb_inj.get("description", "")
            print("  " + pos.ljust(4) + " " + name.ljust(25) + " [" + status + "]" + desc)
        print("  -> Suggest: Move to IL or bench, replace with healthy player")
    else:
        print("No injured players in active lineup.")

    if healthy_il:
        print("")
        print("INEFFICIENCY: Players on IL with no injury status:")
        for p in healthy_il:
            name = p.get("name", "Unknown")
            pos = get_player_position(p)
            print("  " + pos.ljust(4) + " " + name.ljust(25) + " - may be activatable")
        print("  -> Suggest: Activate and move to lineup/bench")

    if injured_bench:
        print("")
        print("NOTE: Injured players on bench (could free a bench spot via IL):")
        for p in injured_bench:
            name = p.get("name", "Unknown")
            status = p.get("status", "")
            mlb_inj = mlb_injuries.get(name.lower())
            desc = ""
            if mlb_inj:
                desc = " - " + mlb_inj.get("description", "")
            print("  BN   " + name.ljust(25) + " [" + status + "]" + desc)
        print("  -> Suggest: Move to IL to open a bench/roster spot")

    if il_proper:
        print("")
        print("Correctly placed on IL:")
        for p in il_proper:
            name = p.get("name", "Unknown")
            status = p.get("status", "")
            pos = get_player_position(p)
            print("  " + pos.ljust(4) + " " + name.ljust(25) + " [" + status + "]")

    if not injured_active and not healthy_il and not injured_bench:
        print("Roster looks healthy and correctly configured!")


def cmd_waiver_analyze(args, as_json=False):
    """Score free agents by how much they'd improve your weakest categories"""
    pos_type = args[0] if args else "B"
    count = int(args[1]) if len(args) > 1 else 15

    if not as_json:
        print("Waiver Wire Analysis (" + ("Batters" if pos_type == "B" else "Pitchers") + ")")
        print("=" * 50)

    sc, gm, lg = get_league()

    # First, get our weak categories from the scoreboard
    try:
        scoreboard = lg.scoreboard()
    except Exception as e:
        if as_json:
            return {"error": "Error fetching scoreboard: " + str(e)}
        print("Error fetching scoreboard: " + str(e))
        return

    # Try to identify weak categories
    my_cats = {}
    all_teams_cats = {}

    try:
        if isinstance(scoreboard, list):
            for matchup in scoreboard:
                if not isinstance(matchup, dict):
                    continue
                teams = matchup.get("teams", [])
                for t in teams:
                    team_key = t.get("team_key", "")
                    stats = t.get("stats", {})
                    if team_key:
                        all_teams_cats[team_key] = stats
                    if TEAM_ID in str(team_key):
                        my_cats = stats
    except Exception:
        pass

    # Calculate weak categories
    weak_cats = []
    if my_cats and all_teams_cats:
        for cat, my_val in my_cats.items():
            try:
                my_num = float(my_val)
            except (ValueError, TypeError):
                continue
            values = []
            for team_key, stats in all_teams_cats.items():
                try:
                    values.append(float(stats.get(cat, 0)))
                except (ValueError, TypeError):
                    pass
            lower_is_better = cat.upper() in ("ERA", "WHIP", "BB", "L")
            if lower_is_better:
                values.sort()
            else:
                values.sort(reverse=True)
            rank = 1
            for v in values:
                if lower_is_better:
                    if my_num <= v:
                        break
                else:
                    if my_num >= v:
                        break
                rank += 1
            weak_cats.append((cat, rank, len(values)))

        weak_cats.sort(key=lambda x: -x[1])  # Worst rank first
        weak_cats = weak_cats[:3]

    if not as_json:
        if weak_cats:
            print("Your weakest categories:")
            for cat, rank, total in weak_cats:
                print("  " + cat.ljust(12) + " rank " + str(rank) + "/" + str(total))
            print("")
        else:
            print("Could not determine weak categories (using general analysis)")
            print("")

    # Fetch free agents
    try:
        fa = lg.free_agents(pos_type)[:count * 2]  # Fetch extra to filter
    except Exception as e:
        if as_json:
            return {"error": "Error fetching free agents: " + str(e)}
        print("Error fetching free agents: " + str(e))
        return

    if not fa:
        if as_json:
            return {"pos_type": pos_type, "weak_categories": [], "recommendations": []}
        print("No free agents found")
        return

    # Score each free agent
    scored = []
    weak_cat_names = [c[0] for c in weak_cats] if weak_cats else []
    db = None
    try:
        db = get_db()
    except Exception:
        pass

    for p in fa:
        name = p.get("name", "Unknown")
        pid = p.get("player_id", "?")
        pct = p.get("percent_owned", 0)
        positions = ",".join(p.get("eligible_positions", ["?"]))
        status = p.get("status", "")

        # Track ownership
        if db and pid != "?":
            try:
                db.execute(
                    "INSERT OR REPLACE INTO ownership_history (player_id, date, pct_owned) VALUES (?, ?, ?)",
                    (str(pid), date.today().isoformat(), float(pct) if pct else 0)
                )
            except Exception:
                pass

        # Score: use percent_owned as a proxy for value, boost if player helps weak categories
        score = float(pct) if pct else 0

        # Bonus for trending up (check ownership history)
        if db and pid != "?":
            try:
                cursor = db.execute(
                    "SELECT pct_owned FROM ownership_history WHERE player_id = ? ORDER BY date DESC LIMIT 2",
                    (str(pid),)
                )
                rows = cursor.fetchall()
                if len(rows) >= 2:
                    trend = rows[0][0] - rows[1][0]
                    if trend > 0:
                        score += trend * 0.5  # Bonus for trending up
            except Exception:
                pass

        # Skip injured players unless specifically looking
        if status and status not in ("", "Healthy"):
            score *= 0.5

        scored.append({
            "name": name,
            "pid": pid,
            "pct": pct,
            "positions": positions,
            "status": status,
            "score": score,
        })

    if db:
        try:
            db.commit()
            db.close()
        except Exception:
            pass

    # Sort by score
    scored.sort(key=lambda x: -x["score"])

    if as_json:
        enrich_with_intel(scored, count, boost_scores=True)
        enrich_with_trends(scored, count)
        scored.sort(key=lambda x: -x.get("score", 0))
        weak_list = []
        for cat, rank, total in weak_cats:
            weak_list.append({"name": cat, "rank": rank, "total": total})
        recs = []
        for p in scored[:count]:
            recs.append({
                "name": p["name"],
                "pid": p["pid"],
                "pct": p["pct"],
                "positions": p["positions"],
                "status": p["status"],
                "score": round(p["score"], 1),
                "intel": p.get("intel"),
                "trend": p.get("trend"),
                "mlb_id": get_mlb_id(p.get("name", "")),
            })
        return {
            "pos_type": pos_type,
            "weak_categories": weak_list,
            "recommendations": recs,
        }

    print("Top " + str(count) + " Waiver Recommendations:")
    print("")
    print("  " + "Player".ljust(25) + "Pos".ljust(12) + "Own%".rjust(5) + "  Score  Status")
    print("  " + "-" * 60)

    for p in scored[:count]:
        status_str = ""
        if p["status"]:
            status_str = " [" + p["status"] + "]"
        line = ("  " + p["name"].ljust(25) + p["positions"].ljust(12)
                + str(p["pct"]).rjust(5) + "  " + str(round(p["score"], 1)).rjust(5)
                + status_str + "  (id:" + str(p["pid"]) + ")")
        print(line)

    if weak_cat_names:
        print("")
        print("Focus: Target players strong in " + ", ".join(weak_cat_names))


def cmd_streaming(args, as_json=False):
    """Recommend streaming pitchers for a given week"""
    if not as_json:
        print("Streaming Pitcher Recommendations")
        print("=" * 50)

    sc, gm, lg = get_league()

    # Determine the week
    target_week = int(args[0]) if args else lg.current_week()
    if not as_json:
        print("Analyzing week " + str(target_week) + "...")

    # Get the week date range
    try:
        settings = lg.settings()
        start_date_str = settings.get("start_date", "")
        if start_date_str:
            season_start = datetime.strptime(start_date_str, "%Y-%m-%d").date()
            # Each week is 7 days (approximate)
            week_start = season_start + timedelta(days=(target_week - 1) * 7)
            week_end = week_start + timedelta(days=6)
        else:
            today = date.today()
            week_start = today - timedelta(days=today.weekday())
            week_end = week_start + timedelta(days=6)
    except Exception:
        today = date.today()
        week_start = today - timedelta(days=today.weekday())
        week_end = week_start + timedelta(days=6)

    if not as_json:
        print("Week dates: " + week_start.isoformat() + " to " + week_end.isoformat())
        print("")

    # Get schedule for the week
    schedule = get_schedule_for_range(week_start.isoformat(), week_end.isoformat())
    if not schedule:
        if as_json:
            return {"week": target_week, "team_games": [], "recommendations": []}
        print("No schedule data available for this week")
        return

    # Count games per team this week
    team_games = {}
    for game in schedule:
        away = game.get("away_name", "")
        home = game.get("home_name", "")
        if away:
            team_games[away] = team_games.get(away, 0) + 1
        if home:
            team_games[home] = team_games.get(home, 0) + 1

    if not as_json:
        # Show teams with most games (two-start pitcher candidates)
        print("Teams with most games this week:")
        sorted_teams = sorted(team_games.items(), key=lambda x: -x[1])
        for team_name, games in sorted_teams[:10]:
            marker = " ** TWO-START LIKELY" if games >= 7 else ""
            print("  " + team_name.ljust(28) + str(games) + " games" + marker)
        print("")

    # Get free agent pitchers
    try:
        fa_pitchers = lg.free_agents("P")[:40]
    except Exception as e:
        if as_json:
            return {"error": "Error fetching free agent pitchers: " + str(e)}
        print("Error fetching free agent pitchers: " + str(e))
        return

    if not fa_pitchers:
        if as_json:
            return {"week": target_week, "team_games": [], "recommendations": []}
        print("No free agent pitchers found")
        return

    # Score pitchers
    scored = []
    for p in fa_pitchers:
        name = p.get("name", "Unknown")
        pid = p.get("player_id", "?")
        pct = p.get("percent_owned", 0)
        positions = ",".join(p.get("eligible_positions", ["?"]))
        team_name = get_player_team(p)
        status = p.get("status", "")

        # Skip injured pitchers
        if status and status not in ("", "Healthy"):
            continue

        # Only want starting pitchers
        elig = p.get("eligible_positions", [])
        if "SP" not in elig:
            continue

        # Score based on: team games (two-start potential) + ownership %
        games = 0
        for tn, gc in team_games.items():
            if normalize_team_name(team_name) in normalize_team_name(tn):
                games = gc
                break
            full = TEAM_ALIASES.get(team_name, team_name)
            if normalize_team_name(full) in normalize_team_name(tn):
                games = gc
                break

        score = float(pct) if pct else 0
        # Bonus for teams with more games (two-start potential)
        if games >= 7:
            score += 20  # Strong two-start bonus
        elif games >= 6:
            score += 10

        scored.append({
            "name": name,
            "pid": pid,
            "pct": pct,
            "team": team_name,
            "games": games,
            "positions": positions,
            "score": score,
        })

    scored.sort(key=lambda x: -x["score"])

    if as_json:
        enrich_with_intel(scored, 15, boost_scores=True)
        enrich_with_trends(scored, 15)
        scored.sort(key=lambda x: -x.get("score", 0))
        tg_list = []
        sorted_teams = sorted(team_games.items(), key=lambda x: -x[1])
        for tn, gc in sorted_teams[:10]:
            tg_list.append({"team": tn, "games": gc})
        recs = []
        for p in scored[:15]:
            recs.append({
                "name": p["name"],
                "pid": p["pid"],
                "pct": p["pct"],
                "team": p["team"],
                "games": p["games"],
                "score": round(p["score"], 1),
                "intel": p.get("intel"),
                "trend": p.get("trend"),
                "mlb_id": get_mlb_id(p.get("name", "")),
            })
        return {
            "week": target_week,
            "team_games": tg_list,
            "recommendations": recs,
        }

    print("Top Streaming Pitcher Recommendations:")
    print("")
    print("  " + "Pitcher".ljust(25) + "Team".ljust(15) + "Games".rjust(5) + "  Own%".rjust(6) + "  Score")
    print("  " + "-" * 65)

    for p in scored[:15]:
        two_start = " *2S*" if p["games"] >= 7 else ""
        line = ("  " + p["name"].ljust(25) + p["team"].ljust(15)
                + str(p["games"]).rjust(5) + str(p["pct"]).rjust(6)
                + "  " + str(round(p["score"], 1)).rjust(5)
                + two_start + "  (id:" + str(p["pid"]) + ")")
        print(line)

    print("")
    print("*2S* = Likely two-start pitcher (7+ team games this week)")


def cmd_trade_eval(args, as_json=False):
    """Evaluate a potential trade"""
    if len(args) < 2:
        if as_json:
            return {"error": "Usage: trade-eval <give_ids> <get_ids>"}
        print("Usage: trade-eval <give_ids> <get_ids>")
        print("  IDs are comma-separated player IDs")
        print("  Example: trade-eval 12345,12346 12347,12348")
        return

    give_ids = args[0].split(",")
    get_ids = args[1].split(",")

    if not as_json:
        print("Trade Evaluation")
        print("=" * 50)

    sc, gm, lg, team = get_league_context()

    # Fetch roster to find players we're giving
    try:
        roster = team.roster()
    except Exception as e:
        if as_json:
            return {"error": "Error fetching roster: " + str(e)}
        print("Error fetching roster: " + str(e))
        return

    # Get stat categories
    try:
        categories = lg.stat_categories()
    except Exception:
        categories = []

    # Look up players by ID
    give_players = []
    get_players = []

    # Find give players in our roster
    for pid in give_ids:
        pid = pid.strip()
        found = False
        for p in roster:
            roster_pid = str(p.get("player_id", ""))
            if roster_pid == pid:
                give_players.append(p)
                found = True
                break
        if not found:
            if not as_json:
                print("Warning: player " + pid + " not found on your roster")

    # For get players, search the league
    for pid in get_ids:
        pid = pid.strip()
        player_key = GAME_KEY + ".p." + pid
        try:
            get_players.append({
                "player_id": pid,
                "player_key": player_key,
                "name": "Player " + pid,
            })
        except Exception:
            get_players.append({
                "player_id": pid,
                "name": "Player " + pid,
            })

    give_value = 0
    for p in give_players:
        pct = p.get("percent_owned", 0)
        value = float(pct) if pct else 50
        give_value += value

    get_value = 0
    for p in get_players:
        pct = p.get("percent_owned", 0)
        value = float(pct) if pct else 50
        get_value += value

    diff = get_value - give_value

    # Grade the trade
    if diff > 30:
        grade = "Strong Accept"
    elif diff > 10:
        grade = "Accept"
    elif diff > -10:
        grade = "Fair Trade"
    elif diff > -30:
        grade = "Decline"
    else:
        grade = "Strong Decline"

    # Position impact
    give_positions = set()
    get_positions = set()
    for p in give_players:
        for pos in p.get("eligible_positions", []):
            give_positions.add(pos)
    for p in get_players:
        for pos in p.get("eligible_positions", []):
            get_positions.add(pos)
    losing = give_positions - get_positions
    gaining = get_positions - give_positions

    if as_json:
        give_list = []
        for p in give_players:
            give_list.append({
                "name": p.get("name", "Unknown"),
                "player_id": str(p.get("player_id", "")),
                "positions": p.get("eligible_positions", []),
                "value": round(float(p.get("percent_owned", 0)) if p.get("percent_owned", 0) else 50, 1),
                "mlb_id": get_mlb_id(p.get("name", "")),
            })
        get_list = []
        for p in get_players:
            get_list.append({
                "name": p.get("name", "Unknown"),
                "player_id": str(p.get("player_id", "")),
                "positions": p.get("eligible_positions", []),
                "value": round(float(p.get("percent_owned", 0)) if p.get("percent_owned", 0) else 50, 1),
                "mlb_id": get_mlb_id(p.get("name", "")),
            })
        enrich_with_intel(give_list + get_list)
        return {
            "give_players": give_list,
            "get_players": get_list,
            "give_value": round(give_value, 1),
            "get_value": round(get_value, 1),
            "net_value": round(diff, 1),
            "grade": grade,
            "position_impact": {
                "losing": list(losing),
                "gaining": list(gaining),
            },
        }

    print("GIVING:")
    for p in give_players:
        name = p.get("name", "Unknown")
        pct = p.get("percent_owned", 0)
        positions = ",".join(p.get("eligible_positions", ["?"]))
        value = float(pct) if pct else 50
        print("  " + name.ljust(25) + " " + positions.ljust(12) + " value: " + str(round(value, 1)))

    print("")
    print("GETTING:")
    for p in get_players:
        name = p.get("name", "Unknown")
        pct = p.get("percent_owned", 0)
        positions = ",".join(p.get("eligible_positions", ["?"]))
        value = float(pct) if pct else 50
        print("  " + name.ljust(25) + " " + positions.ljust(12) + " value: " + str(round(value, 1)))

    print("")
    print("Total Value Given:    " + str(round(give_value, 1)))
    print("Total Value Received: " + str(round(get_value, 1)))
    print("Net Value:            " + str(round(diff, 1)))

    print("")
    print("Trade Grade: " + grade)

    print("")
    print("Position Impact:")
    if losing:
        print("  Losing coverage at: " + ", ".join(losing))
    if gaining:
        print("  Gaining coverage at: " + ", ".join(gaining))
    if not losing and not gaining:
        print("  Position coverage unchanged")


def cmd_daily_update(args, as_json=False):
    """Run all daily checks in sequence"""
    if as_json:
        result = {}
        try:
            result["lineup"] = cmd_lineup_optimize([], as_json=True)
        except Exception as e:
            result["lineup"] = {"error": str(e)}
        try:
            result["injuries"] = cmd_injury_report([], as_json=True)
        except Exception as e:
            result["injuries"] = {"error": str(e)}
        return result

    print("=" * 50)
    print("DAILY UPDATE - " + date.today().isoformat())
    print("=" * 50)
    print("")

    actions = []

    # 1. Lineup optimize (report only)
    print("[1/2] Checking lineup...")
    print("-" * 40)
    try:
        cmd_lineup_optimize([])  # No --apply
    except Exception as e:
        print("  Error in lineup check: " + str(e))
    print("")

    # 2. Injury report
    print("[2/2] Checking injuries...")
    print("-" * 40)
    try:
        cmd_injury_report([])
    except Exception as e:
        print("  Error in injury check: " + str(e))
    print("")

    print("=" * 50)
    print("Daily update complete. Review above for recommended actions.")
    print("Use individual commands to take action:")
    print("  lineup-optimize --apply    Apply lineup changes")
    print("  waiver-analyze B           Check waiver wire (batters)")
    print("  waiver-analyze P           Check waiver wire (pitchers)")
    print("  streaming                  Get streaming pitcher picks")


def cmd_category_simulate(args, as_json=False):
    """Simulate category impact of adding/dropping a player"""
    if not args:
        if as_json:
            return {"error": "Usage: category-simulate <add_name> [drop_name]"}
        print("Usage: category-simulate <add_name> [drop_name]")
        return

    add_name = args[0]
    drop_name = args[1] if len(args) > 1 else ""

    if not as_json:
        print("Category Simulator")
        print("=" * 50)
        print("Simulating: Add " + add_name)
        if drop_name:
            print("            Drop " + drop_name)
        print("")

    sc, gm, lg, team = get_league_context()

    # 1. Get current category ranks (reuse category-check logic)
    try:
        scoreboard = lg.scoreboard()
    except Exception as e:
        if as_json:
            return {"error": "Error fetching scoreboard: " + str(e)}
        print("Error fetching scoreboard: " + str(e))
        return

    my_cats = {}
    all_teams_cats = {}

    try:
        if isinstance(scoreboard, list):
            for matchup in scoreboard:
                if not isinstance(matchup, dict):
                    continue
                teams_list = matchup.get("teams", [])
                for t in teams_list:
                    team_key = t.get("team_key", "")
                    stats = t.get("stats", {})
                    if not stats and isinstance(t, dict):
                        for k, v in t.items():
                            if isinstance(v, dict) and "value" in v:
                                stats[k] = v.get("value", 0)
                    if team_key:
                        all_teams_cats[team_key] = stats
                    if TEAM_ID in str(team_key):
                        my_cats = stats
        elif isinstance(scoreboard, dict):
            for key, val in scoreboard.items():
                if isinstance(val, dict):
                    all_teams_cats[key] = val
    except Exception as e:
        if not as_json:
            print("Error parsing scoreboard: " + str(e))

    # Calculate current ranks
    cat_ranks = {}
    num_teams = 0
    for cat, my_val in my_cats.items():
        try:
            my_num = float(my_val)
        except (ValueError, TypeError):
            continue
        values = []
        for tk, stats in all_teams_cats.items():
            try:
                values.append(float(stats.get(cat, 0)))
            except (ValueError, TypeError):
                pass
        lower_is_better = cat.upper() in ("ERA", "WHIP", "BB", "L")
        if lower_is_better:
            values.sort()
        else:
            values.sort(reverse=True)
        rank = 1
        for v in values:
            if lower_is_better:
                if my_num <= v:
                    break
            else:
                if my_num >= v:
                    break
            rank += 1
        cat_ranks[cat] = {"rank": rank, "total": len(values)}
        if len(values) > num_teams:
            num_teams = len(values)

    # 2. Search for the player being added
    add_player_info = None
    try:
        # Search free agents for the player
        for pos_type in ["B", "P"]:
            try:
                fa = lg.free_agents(pos_type)
                for p in fa:
                    if add_name.lower() in p.get("name", "").lower():
                        add_player_info = p
                        break
            except Exception:
                pass
            if add_player_info:
                break
    except Exception as e:
        if not as_json:
            print("Warning: could not search free agents: " + str(e))

    if not add_player_info:
        # Build a minimal player info from the name
        add_player_info = {"name": add_name, "eligible_positions": [], "percent_owned": 0}

    add_positions = add_player_info.get("eligible_positions", [])
    add_pct = add_player_info.get("percent_owned", 0)
    add_team = get_player_team(add_player_info)
    add_mlb_id = get_mlb_id(add_player_info.get("name", ""))

    # Determine if batter or pitcher
    pitcher_positions = {"SP", "RP", "P"}
    is_pitcher = bool(set(add_positions) & pitcher_positions)
    is_batter = not is_pitcher or bool(set(add_positions) - pitcher_positions - {"BN", "UTIL", "IL", "IL+", "DL", "DL+"})

    # Batting categories that a batter impacts
    from valuations import DEFAULT_BATTING_CATS, DEFAULT_BATTING_CATS_NEGATIVE, DEFAULT_PITCHING_CATS, DEFAULT_PITCHING_CATS_NEGATIVE
    bat_cats = set(DEFAULT_BATTING_CATS + DEFAULT_BATTING_CATS_NEGATIVE)
    # Pitching categories that a pitcher impacts
    pitch_cats = set(DEFAULT_PITCHING_CATS + DEFAULT_PITCHING_CATS_NEGATIVE)

    affected_cats = set()
    if is_batter:
        affected_cats |= bat_cats
    if is_pitcher:
        affected_cats |= pitch_cats

    # 3. Look up drop player if specified
    drop_player_info = None
    if drop_name:
        try:
            roster = team.roster()
            for p in roster:
                if drop_name.lower() in p.get("name", "").lower():
                    drop_player_info = p
                    break
        except Exception as e:
            if not as_json:
                print("Warning: could not search roster: " + str(e))

    # 4. Simulate rank changes
    # Use ownership % as a proxy for player quality
    # Higher ownership = better player = more likely to improve ranks
    # Scale: 90%+ owned = strong impact, 50-90% = moderate, <50% = marginal
    pct_val = float(add_pct) if add_pct else 0
    if pct_val >= 90:
        impact_factor = 2
    elif pct_val >= 70:
        impact_factor = 1
    elif pct_val >= 40:
        impact_factor = 0
    else:
        impact_factor = -1

    current_ranks = []
    simulated_ranks = []
    improvements = []
    regressions = []

    for cat, info in cat_ranks.items():
        rank = info.get("rank", 0)
        total = info.get("total", 0)
        current_ranks.append({"name": cat, "rank": rank, "total": total})

        change = 0
        if cat.upper() in affected_cats:
            # Estimate change based on ownership % and current rank
            # If we're weak in a category and adding a good player, bigger improvement
            if rank > total * 0.6:
                # Weak category - more room to improve
                change = max(0, impact_factor + 1)
            elif rank > total * 0.4:
                # Mid category - moderate improvement possible
                change = max(0, impact_factor)
            else:
                # Already strong - minimal improvement, could even regress rate stats
                if cat.upper() in ("AVG", "OBP", "ERA", "WHIP"):
                    # Rate stats can regress even with a good add
                    change = -1 if impact_factor < 2 else 0
                else:
                    change = 0

        simulated_ranks.append({
            "name": cat,
            "rank": max(1, rank - change),
            "total": total,
            "change": change,
        })

        if change > 0:
            improvements.append(cat + " (+" + str(change) + ")")
        elif change < 0:
            regressions.append(cat + " (" + str(change) + ")")

    # 5. Build summary
    summary_parts = []
    if improvements:
        summary_parts.append("Adding " + add_player_info.get("name", add_name) + " projects to improve " + ", ".join(improvements))
    if regressions:
        if summary_parts:
            summary_parts.append("but may hurt " + ", ".join(regressions))
        else:
            summary_parts.append("Adding " + add_player_info.get("name", add_name) + " may hurt " + ", ".join(regressions))

    net_change = sum(s.get("change", 0) for s in simulated_ranks)
    if net_change > 0:
        summary_parts.append("Net: +" + str(net_change) + " rank improvement across categories.")
    elif net_change < 0:
        summary_parts.append("Net: " + str(net_change) + " rank regression across categories.")
    else:
        if not summary_parts:
            summary_parts.append("Adding " + add_player_info.get("name", add_name) + " is projected to have minimal category impact.")
        else:
            summary_parts.append("Net: neutral impact.")

    summary = " ".join(summary_parts)

    # Build result
    add_result = {
        "name": add_player_info.get("name", add_name),
        "team": add_team or "",
        "positions": ",".join(add_positions) if add_positions else "Unknown",
        "mlb_id": add_mlb_id,
    }

    drop_result = None
    if drop_player_info:
        drop_positions = drop_player_info.get("eligible_positions", [])
        drop_result = {
            "name": drop_player_info.get("name", drop_name),
            "team": get_player_team(drop_player_info) or "",
            "positions": ",".join(drop_positions) if drop_positions else "Unknown",
        }

    enrich_with_intel([add_result])

    result = {
        "add_player": add_result,
        "drop_player": drop_result,
        "current_ranks": current_ranks,
        "simulated_ranks": simulated_ranks,
        "summary": summary,
    }

    if as_json:
        return result

    # Print results
    print("Player to Add: " + add_result.get("name", "") + " (" + add_result.get("team", "") + ") - " + add_result.get("positions", ""))
    if drop_result:
        print("Player to Drop: " + drop_result.get("name", "") + " (" + drop_result.get("team", "") + ") - " + drop_result.get("positions", ""))
    print("")

    print("  " + "Category".ljust(12) + "Current".rjust(8) + "  Simulated".rjust(10) + "  Change")
    print("  " + "-" * 42)

    for i, cr in enumerate(current_ranks):
        sr = simulated_ranks[i]
        cat = cr.get("name", "")
        cur = str(cr.get("rank", 0)) + "/" + str(cr.get("total", 0))
        sim = str(sr.get("rank", 0)) + "/" + str(sr.get("total", 0))
        ch = sr.get("change", 0)
        ch_str = ""
        if ch > 0:
            ch_str = " +" + str(ch) + " UP"
        elif ch < 0:
            ch_str = " " + str(ch) + " DOWN"
        print("  " + cat.ljust(12) + cur.rjust(8) + "  " + sim.rjust(10) + ch_str)

    print("")
    print(summary)


def cmd_scout_opponent(args, as_json=False):
    """Scout the current week's opponent - analyze their strengths and weaknesses"""
    if not as_json:
        print("Opponent Scout Report")
        print("=" * 50)

    sc, gm, lg = get_league()

    # Get stat categories for category names
    try:
        stat_cats = lg.stat_categories()
        stat_id_to_name = {}
        for cat in stat_cats:
            sid = str(cat.get("stat_id", ""))
            display = cat.get("display_name", cat.get("name", "Stat " + sid))
            stat_id_to_name[sid] = display
    except Exception as e:
        stat_cats = []
        stat_id_to_name = {}
        if not as_json:
            print("  Warning: could not fetch stat categories: " + str(e))

    # Get raw matchup data (same approach as yahoo-fantasy.py's matchup detail)
    try:
        raw = lg.matchups()
    except Exception as e:
        if as_json:
            return {"error": "Error fetching matchup data: " + str(e)}
        print("Error fetching matchup data: " + str(e))
        return

    if not raw:
        if as_json:
            return {"error": "No matchup data available"}
        print("No matchup data available")
        return

    try:
        league_data = raw.get("fantasy_content", {}).get("league", [])
        if len(league_data) < 2:
            if as_json:
                return {"error": "No matchup data in response"}
            print("No matchup data in response")
            return

        sb_data = league_data[1].get("scoreboard", {})
        week = sb_data.get("week", "?")
        matchup_block = sb_data.get("0", {}).get("matchups", {})
        count = int(matchup_block.get("count", 0))

        for i in range(count):
            matchup = matchup_block.get(str(i), {}).get("matchup", {})
            teams_data = matchup.get("0", {}).get("teams", {})
            team1_data = teams_data.get("0", {})
            team2_data = teams_data.get("1", {})

            # Extract team names from nested Yahoo structure
            def _get_name(tdata):
                if isinstance(tdata, dict):
                    team_info = tdata.get("team", [])
                    if isinstance(team_info, list) and len(team_info) > 0:
                        for item in team_info[0] if isinstance(team_info[0], list) else team_info:
                            if isinstance(item, dict) and "name" in item:
                                return item.get("name", "?")
                return "?"

            def _get_key(tdata):
                if isinstance(tdata, dict):
                    team_info = tdata.get("team", [])
                    if isinstance(team_info, list) and len(team_info) > 0:
                        for item in team_info[0] if isinstance(team_info[0], list) else team_info:
                            if isinstance(item, dict) and "team_key" in item:
                                return item.get("team_key", "")
                return ""

            name1 = _get_name(team1_data)
            name2 = _get_name(team2_data)
            key1 = _get_key(team1_data)
            key2 = _get_key(team2_data)

            if TEAM_ID not in key1 and TEAM_ID not in key2:
                continue

            # Found our matchup
            if TEAM_ID in key1:
                my_data = team1_data
                opp_data = team2_data
                opp_name = name2
            else:
                my_data = team2_data
                opp_data = team1_data
                opp_name = name1

            my_key = _get_key(my_data)

            # Extract stats
            def _get_stats(tdata):
                stats = {}
                team_info = tdata.get("team", [])
                if isinstance(team_info, list):
                    for block in team_info:
                        if isinstance(block, dict) and "team_stats" in block:
                            raw_stats = block.get("team_stats", {}).get("stats", [])
                            for s in raw_stats:
                                stat = s.get("stat", {})
                                sid = str(stat.get("stat_id", ""))
                                val = stat.get("value", "0")
                                stats[sid] = val
                return stats

            my_stats = _get_stats(my_data)
            opp_stats = _get_stats(opp_data)

            # Extract stat winners
            stat_winners = matchup.get("stat_winners", [])
            cat_results = {}
            for sw in stat_winners:
                w = sw.get("stat_winner", {})
                sid = str(w.get("stat_id", ""))
                if w.get("is_tied"):
                    cat_results[sid] = "tie"
                else:
                    winner_key = w.get("winner_team_key", "")
                    if winner_key == my_key:
                        cat_results[sid] = "win"
                    else:
                        cat_results[sid] = "loss"

            # Build categories with margin analysis
            categories = []
            wins = 0
            losses = 0
            ties = 0

            # Determine which categories have lower-is-better sort order
            lower_is_better_sids = set()
            for cat in stat_cats:
                sid = str(cat.get("stat_id", ""))
                sort_order = cat.get("sort_order", "1")
                if str(sort_order) == "0":
                    lower_is_better_sids.add(sid)

            for sid in sorted(cat_results.keys(), key=lambda x: int(x) if x.isdigit() else 0):
                cat_name = stat_id_to_name.get(sid, "Stat " + sid)
                my_val = my_stats.get(sid, "-")
                opp_val = opp_stats.get(sid, "-")
                result = cat_results.get(sid, "tie")

                if result == "win":
                    wins += 1
                elif result == "loss":
                    losses += 1
                else:
                    ties += 1

                # Determine margin
                margin = "comfortable"
                try:
                    my_num = float(my_val)
                    opp_num = float(opp_val)
                    diff = abs(my_num - opp_num)
                    avg = (abs(my_num) + abs(opp_num)) / 2.0
                    if avg > 0:
                        pct_diff = diff / avg
                        if pct_diff < 0.10:
                            margin = "close"
                        elif pct_diff > 0.30:
                            margin = "dominant"
                    else:
                        margin = "close"
                except (ValueError, TypeError):
                    margin = "close"

                categories.append({
                    "name": cat_name,
                    "my_value": str(my_val),
                    "opp_value": str(opp_val),
                    "result": result,
                    "margin": margin,
                })

            # Get league-wide scoreboard data for opponent strengths/weaknesses
            opp_strengths = []
            opp_weaknesses = []

            try:
                scoreboard = lg.scoreboard()
                all_teams_cats = {}
                if isinstance(scoreboard, list):
                    for m in scoreboard:
                        if isinstance(m, dict):
                            for t in m.get("teams", []):
                                tk = t.get("team_key", "")
                                st = t.get("stats", {})
                                if tk:
                                    all_teams_cats[tk] = st

                opp_key = _get_key(opp_data)
                opp_league_stats = all_teams_cats.get(opp_key, {})

                if opp_league_stats and all_teams_cats:
                    opp_cat_ranks = {}
                    for cat_stat, opp_val in opp_league_stats.items():
                        try:
                            opp_num = float(opp_val)
                        except (ValueError, TypeError):
                            continue
                        values = []
                        for tk, st in all_teams_cats.items():
                            try:
                                values.append(float(st.get(cat_stat, 0)))
                            except (ValueError, TypeError):
                                pass
                        is_lower = cat_stat.upper() in ("ERA", "WHIP", "BB", "L")
                        if is_lower:
                            values.sort()
                        else:
                            values.sort(reverse=True)
                        rank = 1
                        for v in values:
                            if is_lower:
                                if opp_num <= v:
                                    break
                            else:
                                if opp_num >= v:
                                    break
                            rank += 1
                        opp_cat_ranks[cat_stat] = rank

                    total_teams = len(all_teams_cats)
                    for cat_stat, rank in opp_cat_ranks.items():
                        if rank <= 3:
                            opp_strengths.append(cat_stat)
                        elif total_teams > 3 and rank >= (total_teams - 2):
                            opp_weaknesses.append(cat_stat)
            except Exception as e:
                if not as_json:
                    print("  Warning: could not analyze league-wide ranks: " + str(e))

            # Generate strategy suggestions
            strategy = []

            # Find close losses to target
            close_losses = [c for c in categories if c.get("result") == "loss" and c.get("margin") == "close"]
            if close_losses:
                names = [c.get("name", "?") for c in close_losses]
                strategy.append("Target close categories: " + ", ".join(names) + " are all within reach")

            # Protect close wins
            close_wins = [c for c in categories if c.get("result") == "win" and c.get("margin") == "close"]
            if close_wins:
                names = [c.get("name", "?") for c in close_wins]
                strategy.append("Protect your leads: " + ", ".join(names) + " are close - don't get complacent")

            # Opponent dominant categories - suggest conceding
            dominant_losses = [c for c in categories if c.get("result") == "loss" and c.get("margin") == "dominant"]
            if dominant_losses:
                names = [c.get("name", "?") for c in dominant_losses]
                strategy.append("Opponent is dominant in " + ", ".join(names) + " - consider conceding and focusing elsewhere")

            # Leverage strengths where opponent is weak
            if opp_weaknesses:
                strategy.append("Opponent is weak in " + ", ".join(opp_weaknesses) + " - leverage your advantage there")

            # Opponent strengths warning
            if opp_strengths:
                strategy.append("Opponent is strong league-wide in " + ", ".join(opp_strengths) + " - hard to overcome, focus on other categories")

            if not strategy:
                strategy.append("Matchup is evenly contested - stay the course and avoid unnecessary roster moves")

            result_data = {
                "week": week,
                "opponent": opp_name,
                "score": {"wins": wins, "losses": losses, "ties": ties},
                "categories": categories,
                "opp_strengths": opp_strengths,
                "opp_weaknesses": opp_weaknesses,
                "strategy": strategy,
            }

            if as_json:
                return result_data

            print("Week " + str(week) + " Scout Report vs " + opp_name)
            print("Score: " + str(wins) + "-" + str(losses) + "-" + str(ties))
            print("")
            for cat in categories:
                marker = "W" if cat.get("result") == "win" else ("L" if cat.get("result") == "loss" else "T")
                m = " *" if cat.get("margin") == "close" else ""
                print("  [" + marker + "] " + cat.get("name", "?").ljust(12) + str(cat.get("my_value", "")).rjust(8) + " vs " + str(cat.get("opp_value", "")).rjust(8) + m)
            print("")
            if opp_strengths:
                print("Opponent Strengths: " + ", ".join(opp_strengths))
            if opp_weaknesses:
                print("Opponent Weaknesses: " + ", ".join(opp_weaknesses))
            print("")
            print("Strategy:")
            for idx, s in enumerate(strategy):
                print("  " + str(idx + 1) + ". " + s)
            return

        # No matchup found
        if as_json:
            return {"error": "Could not find your matchup"}
        print("Could not find your matchup")
    except Exception as e:
        if as_json:
            return {"error": "Error parsing matchup data: " + str(e)}
        print("Error parsing matchup data: " + str(e))


def _match_team_games(team_name, team_games):
    """Match a Yahoo team name to schedule team games count"""
    if not team_name or not team_games:
        return 0
    norm = normalize_team_name(team_name)
    full = TEAM_ALIASES.get(team_name, team_name)
    norm_full = normalize_team_name(full)
    for tn, gc in team_games.items():
        if norm in normalize_team_name(tn) or norm_full in normalize_team_name(tn):
            return gc
    return 0


def _count_roster_games(roster, team_games):
    """Count remaining games for a fantasy roster given MLB team game counts"""
    batter_games = 0
    pitcher_games = 0
    for p in roster:
        if is_il(p):
            continue
        team_name = get_player_team(p)
        games = _match_team_games(team_name, team_games)
        elig = p.get("eligible_positions", [])
        if set(elig) & {"SP", "RP", "P"}:
            pitcher_games += games
        else:
            batter_games += games
    return {"batter_games": batter_games, "pitcher_games": pitcher_games}


def cmd_matchup_strategy(args, as_json=False):
    """Analyze your matchup and build a category-by-category game plan to maximize wins"""
    if not as_json:
        print("Matchup Strategy")
        print("=" * 50)

    sc, gm, lg = get_league()

    # ── 1. Matchup + category comparison (reuse scout-opponent parsing) ──
    try:
        stat_cats = lg.stat_categories()
        stat_id_to_name = {}
        for cat in stat_cats:
            sid = str(cat.get("stat_id", ""))
            display = cat.get("display_name", cat.get("name", "Stat " + sid))
            stat_id_to_name[sid] = display
    except Exception as e:
        stat_cats = []
        stat_id_to_name = {}
        if not as_json:
            print("  Warning: could not fetch stat categories: " + str(e))

    # Determine lower-is-better stat IDs
    lower_is_better_sids = set()
    for cat in stat_cats:
        sid = str(cat.get("stat_id", ""))
        sort_order = cat.get("sort_order", "1")
        if str(sort_order) == "0":
            lower_is_better_sids.add(sid)

    # Rate stat names (margin matters more than volume for these)
    RATE_STATS = {"AVG", "OBP", "ERA", "WHIP"}

    try:
        raw = lg.matchups()
    except Exception as e:
        if as_json:
            return {"error": "Error fetching matchup data: " + str(e)}
        print("Error fetching matchup data: " + str(e))
        return

    if not raw:
        if as_json:
            return {"error": "No matchup data available"}
        print("No matchup data available")
        return

    try:
        league_data = raw.get("fantasy_content", {}).get("league", [])
        if len(league_data) < 2:
            if as_json:
                return {"error": "No matchup data in response"}
            print("No matchup data in response")
            return

        sb_data = league_data[1].get("scoreboard", {})
        week = sb_data.get("week", "?")
        matchup_block = sb_data.get("0", {}).get("matchups", {})
        count = int(matchup_block.get("count", 0))

        opp_name = None
        opp_data = None
        my_data = None
        categories = []
        wins = 0
        losses = 0
        ties = 0

        for i in range(count):
            matchup = matchup_block.get(str(i), {}).get("matchup", {})
            teams_data = matchup.get("0", {}).get("teams", {})
            team1_data = teams_data.get("0", {})
            team2_data = teams_data.get("1", {})

            def _get_name(tdata):
                if isinstance(tdata, dict):
                    team_info = tdata.get("team", [])
                    if isinstance(team_info, list) and len(team_info) > 0:
                        for item in team_info[0] if isinstance(team_info[0], list) else team_info:
                            if isinstance(item, dict) and "name" in item:
                                return item.get("name", "?")
                return "?"

            def _get_key(tdata):
                if isinstance(tdata, dict):
                    team_info = tdata.get("team", [])
                    if isinstance(team_info, list) and len(team_info) > 0:
                        for item in team_info[0] if isinstance(team_info[0], list) else team_info:
                            if isinstance(item, dict) and "team_key" in item:
                                return item.get("team_key", "")
                return ""

            name1 = _get_name(team1_data)
            name2 = _get_name(team2_data)
            key1 = _get_key(team1_data)
            key2 = _get_key(team2_data)

            if TEAM_ID not in key1 and TEAM_ID not in key2:
                continue

            # Found our matchup
            if TEAM_ID in key1:
                my_data = team1_data
                opp_data = team2_data
                opp_name = name2
            else:
                my_data = team2_data
                opp_data = team1_data
                opp_name = name1

            my_key = _get_key(my_data)
            opp_key = _get_key(opp_data)

            def _get_stats(tdata):
                stats = {}
                team_info = tdata.get("team", [])
                if isinstance(team_info, list):
                    for block in team_info:
                        if isinstance(block, dict) and "team_stats" in block:
                            raw_stats = block.get("team_stats", {}).get("stats", [])
                            for s in raw_stats:
                                stat = s.get("stat", {})
                                sid = str(stat.get("stat_id", ""))
                                val = stat.get("value", "0")
                                stats[sid] = val
                return stats

            my_stats = _get_stats(my_data)
            opp_stats = _get_stats(opp_data)

            # Extract stat winners
            stat_winners = matchup.get("stat_winners", [])
            cat_results = {}
            for sw in stat_winners:
                w = sw.get("stat_winner", {})
                sid = str(w.get("stat_id", ""))
                if w.get("is_tied"):
                    cat_results[sid] = "tie"
                else:
                    winner_key = w.get("winner_team_key", "")
                    if winner_key == my_key:
                        cat_results[sid] = "win"
                    else:
                        cat_results[sid] = "loss"

            # Build categories with margin
            for sid in sorted(cat_results.keys(), key=lambda x: int(x) if x.isdigit() else 0):
                cat_name = stat_id_to_name.get(sid, "Stat " + sid)
                my_val = my_stats.get(sid, "-")
                opp_val = opp_stats.get(sid, "-")
                result = cat_results.get(sid, "tie")

                if result == "win":
                    wins += 1
                elif result == "loss":
                    losses += 1
                else:
                    ties += 1

                margin = "comfortable"
                try:
                    my_num = float(my_val)
                    opp_num = float(opp_val)
                    diff = abs(my_num - opp_num)
                    avg = (abs(my_num) + abs(opp_num)) / 2.0
                    if avg > 0:
                        pct_diff = diff / avg
                        if pct_diff < 0.10:
                            margin = "close"
                        elif pct_diff > 0.30:
                            margin = "dominant"
                    else:
                        margin = "close"
                except (ValueError, TypeError):
                    margin = "close"

                categories.append({
                    "name": cat_name,
                    "my_value": str(my_val),
                    "opp_value": str(opp_val),
                    "result": result,
                    "margin": margin,
                })

            break  # Found our matchup, stop

        if not opp_name:
            if as_json:
                return {"error": "Could not find your matchup"}
            print("Could not find your matchup")
            return

        # ── 2. Schedule analysis — remaining games this week ──
        try:
            settings = lg.settings()
            start_date_str = settings.get("start_date", "")
            current_week = lg.current_week()
            target_week = int(week) if str(week).isdigit() else current_week
            if start_date_str:
                season_start = datetime.strptime(start_date_str, "%Y-%m-%d").date()
                week_start = season_start + timedelta(days=(target_week - 1) * 7)
                week_end = week_start + timedelta(days=6)
            else:
                today = date.today()
                week_start = today - timedelta(days=today.weekday())
                week_end = week_start + timedelta(days=6)
        except Exception:
            today = date.today()
            week_start = today - timedelta(days=today.weekday())
            week_end = week_start + timedelta(days=6)

        today = date.today()
        remaining_start = max(today, week_start)
        remaining_end = week_end

        schedule_data = {
            "my_batter_games": 0, "my_pitcher_games": 0,
            "opp_batter_games": 0, "opp_pitcher_games": 0,
            "advantage": "neutral",
        }

        team_games = {}
        if remaining_start <= remaining_end:
            schedule = get_schedule_for_range(remaining_start.isoformat(), remaining_end.isoformat())
            for game in schedule:
                away = game.get("away_name", "")
                home = game.get("home_name", "")
                if away:
                    team_games[away] = team_games.get(away, 0) + 1
                if home:
                    team_games[home] = team_games.get(home, 0) + 1

            # Count games for each roster
            try:
                my_team = lg.to_team(TEAM_ID)
                my_roster = my_team.roster()
                my_games = _count_roster_games(my_roster, team_games)
                schedule_data["my_batter_games"] = my_games.get("batter_games", 0)
                schedule_data["my_pitcher_games"] = my_games.get("pitcher_games", 0)
            except Exception as e:
                if not as_json:
                    print("  Warning: could not count my roster games: " + str(e))

            try:
                opp_team = lg.to_team(opp_key)
                opp_roster = opp_team.roster()
                opp_games = _count_roster_games(opp_roster, team_games)
                schedule_data["opp_batter_games"] = opp_games.get("batter_games", 0)
                schedule_data["opp_pitcher_games"] = opp_games.get("pitcher_games", 0)
            except Exception as e:
                if not as_json:
                    print("  Warning: could not count opponent roster games: " + str(e))

            my_total = schedule_data.get("my_batter_games", 0) + schedule_data.get("my_pitcher_games", 0)
            opp_total = schedule_data.get("opp_batter_games", 0) + schedule_data.get("opp_pitcher_games", 0)
            if my_total > opp_total + 5:
                schedule_data["advantage"] = "you"
            elif opp_total > my_total + 5:
                schedule_data["advantage"] = "opponent"

        # ── 3. Opponent transactions ──
        opp_transactions = []
        for tx_type in ["add", "drop"]:
            try:
                raw_tx = lg.transactions(tx_type, 15)
                if not raw_tx:
                    continue
                for tx in raw_tx:
                    if not isinstance(tx, dict):
                        continue
                    tx_team = tx.get("team", "")
                    tx_team_key = tx.get("team_key", "")
                    if opp_key and (opp_key in str(tx_team_key) or opp_name in str(tx_team)):
                        opp_transactions.append({
                            "type": tx_type,
                            "player": tx.get("player", tx.get("name", "Unknown")),
                            "date": tx.get("date", tx.get("timestamp", "")),
                        })
            except Exception:
                pass

        # ── 4. Strategy classification ──
        strategy_map = {"target": [], "protect": [], "concede": [], "lock": []}
        bat_edge = schedule_data.get("my_batter_games", 0) - schedule_data.get("opp_batter_games", 0)
        pitch_edge = schedule_data.get("my_pitcher_games", 0) - schedule_data.get("opp_pitcher_games", 0)

        # Determine batting vs pitching categories by stat_id position type
        pitching_cat_names = set()
        for cat in stat_cats:
            if cat.get("position_type", "") == "P":
                display = cat.get("display_name", cat.get("name", ""))
                if display:
                    pitching_cat_names.add(display)

        for c in categories:
            name = c.get("name", "")
            result = c.get("result", "tie")
            margin = c.get("margin", "comfortable")
            is_pitching = name in pitching_cat_names
            is_rate = name.upper() in RATE_STATS
            edge = pitch_edge if is_pitching else bat_edge

            classification = "lock"
            reason = ""

            if result == "loss":
                if margin == "close":
                    if not is_rate and edge > 3:
                        classification = "target"
                        reason = "Close and you have +" + str(edge) + " " + ("pitcher" if is_pitching else "batter") + " games"
                    else:
                        classification = "target"
                        reason = "Close — winnable with " + ("quality starts" if is_pitching else "waiver moves")
                elif margin == "comfortable":
                    if not is_rate and edge > 8:
                        classification = "target"
                        reason = "Comfortable gap but large schedule edge (+" + str(edge) + " games)"
                    else:
                        classification = "concede"
                        reason = "Comfortable opponent lead — focus elsewhere"
                else:  # dominant
                    classification = "concede"
                    reason = "Opponent is dominant — not worth chasing"
            elif result == "win":
                if margin == "close":
                    if not is_rate and edge < -3:
                        classification = "protect"
                        reason = "Close lead but opponent has more games remaining"
                    else:
                        classification = "protect"
                        reason = "Close — stay alert and don't sacrifice this lead"
                elif margin == "comfortable":
                    classification = "lock"
                    reason = "Comfortable lead — maintain"
                else:  # dominant
                    classification = "lock"
                    reason = "Dominant lead — locked in"
            else:  # tie
                if not is_rate and edge > 2:
                    classification = "target"
                    reason = "Tied with schedule advantage (+" + str(edge) + " games)"
                elif not is_rate and edge < -2:
                    classification = "protect"
                    reason = "Tied but opponent has more games"
                else:
                    classification = "target"
                    reason = "Tied — winnable with the right moves"

            c["classification"] = classification
            c["reason"] = reason
            strategy_map[classification].append(name)

        # ── 5. Waiver recommendations for target categories ──
        def _score_free_agents(pos_type, target_cat_names):
            """Score free agents for target categories, return top 5"""
            results = []
            try:
                fa = lg.free_agents(pos_type)[:25]
            except Exception:
                return results
            for p in fa:
                status = p.get("status", "")
                if status and status not in ("", "Healthy"):
                    continue
                pname = p.get("name", "Unknown")
                team_name = get_player_team(p)
                games = _match_team_games(team_name, team_games)
                results.append({
                    "name": pname,
                    "pid": p.get("player_id", "?"),
                    "pct": p.get("percent_owned", 0),
                    "categories": target_cat_names,
                    "team": team_name,
                    "games": games,
                    "mlb_id": get_mlb_id(pname),
                })
            results.sort(key=lambda x: -(float(x.get("pct", 0)) + (10 if x.get("games", 0) >= 5 else 0)))
            return results[:5]

        waiver_targets = []
        target_cats = strategy_map.get("target", [])
        target_batting = [c for c in target_cats if c not in pitching_cat_names]
        target_pitching = [c for c in target_cats if c in pitching_cat_names]

        try:
            if target_batting:
                waiver_targets.extend(_score_free_agents("B", target_batting))
            if target_pitching:
                waiver_targets.extend(_score_free_agents("P", target_pitching))
        except Exception as e:
            if not as_json:
                print("  Warning: could not fetch waiver targets: " + str(e))

        # ── 6. Summary ──
        score_str = str(wins) + "-" + str(losses) + "-" + str(ties)
        if wins > losses:
            status_str = "Winning " + score_str
        elif losses > wins:
            status_str = "Losing " + score_str
        else:
            status_str = "Tied " + score_str

        parts = [status_str]
        adv = schedule_data.get("advantage", "neutral")
        if adv == "you":
            bat_diff = schedule_data.get("my_batter_games", 0) - schedule_data.get("opp_batter_games", 0)
            parts.append("with a schedule edge (+" + str(bat_diff) + " batter games)")
        elif adv == "opponent":
            bat_diff = schedule_data.get("opp_batter_games", 0) - schedule_data.get("my_batter_games", 0)
            parts.append("but opponent has schedule edge (+" + str(bat_diff) + " batter games)")

        if strategy_map.get("target"):
            parts.append("Target " + ", ".join(strategy_map.get("target", [])[:3]) + " — all within reach")
        if strategy_map.get("protect"):
            parts.append("Protect " + ", ".join(strategy_map.get("protect", [])[:3]))
        if strategy_map.get("concede"):
            parts.append("Concede " + ", ".join(strategy_map.get("concede", [])[:2]) + " where opponent is dominant")

        summary = ". ".join(parts) + "."

        result_data = {
            "week": week,
            "opponent": opp_name,
            "score": {"wins": wins, "losses": losses, "ties": ties},
            "schedule": schedule_data,
            "categories": categories,
            "opp_transactions": opp_transactions,
            "strategy": strategy_map,
            "waiver_targets": waiver_targets,
            "summary": summary,
        }

        if as_json:
            return result_data

        # CLI output
        print("Week " + str(week) + " Strategy vs " + opp_name)
        print("Score: " + score_str)
        print("")
        print("Schedule Remaining:")
        print("  You:  " + str(schedule_data.get("my_batter_games", 0)) + " batter / " + str(schedule_data.get("my_pitcher_games", 0)) + " pitcher games")
        print("  Opp:  " + str(schedule_data.get("opp_batter_games", 0)) + " batter / " + str(schedule_data.get("opp_pitcher_games", 0)) + " pitcher games")
        print("")
        for c in categories:
            marker = "W" if c.get("result") == "win" else ("L" if c.get("result") == "loss" else "T")
            cls = c.get("classification", "?").upper()[:4]
            print("  [" + marker + "] " + c.get("name", "?").ljust(12) + str(c.get("my_value", "")).rjust(8) + " vs " + str(c.get("opp_value", "")).rjust(8) + "  " + cls.ljust(6) + c.get("reason", ""))
        print("")
        if opp_transactions:
            print("Opponent Recent Moves:")
            for tx in opp_transactions:
                print("  " + tx.get("type", "?").ljust(6) + " " + tx.get("player", "?"))
            print("")
        if waiver_targets:
            print("Waiver Targets:")
            for wt in waiver_targets:
                print("  " + wt.get("name", "?").ljust(25) + wt.get("team", "?").ljust(12) + str(wt.get("games", 0)) + " games  " + str(wt.get("pct", 0)) + "% owned")
        print("")
        print("Summary: " + summary)

    except Exception as e:
        if as_json:
            return {"error": "Error building matchup strategy: " + str(e)}
        print("Error building matchup strategy: " + str(e))


def cmd_set_lineup(args, as_json=False):
    """Move specific player(s) to specific position(s)"""
    # Args format: player_id:position pairs (e.g. "12345:SS 67890:BN")
    if not args:
        if as_json:
            return {"success": False, "message": "Usage: set-lineup PLAYER_ID:POSITION [PLAYER_ID:POSITION ...]"}
        print("Usage: set-lineup PLAYER_ID:POSITION [PLAYER_ID:POSITION ...]")
        print("  Example: set-lineup 12345:SS 67890:BN")
        return
    moves = []
    for arg in args:
        parts = arg.split(":")
        if len(parts) != 2:
            msg = "Invalid move format: " + arg + " (expected PLAYER_ID:POSITION)"
            if as_json:
                return {"success": False, "message": msg}
            print(msg)
            return
        moves.append({"player_id": parts[0], "selected_position": parts[1]})
    method = _write_method()

    if method != "browser":
        try:
            sc, gm, lg, team = get_league_context()
            results = []
            for move in moves:
                pid = move.get("player_id", "")
                new_pos = move.get("selected_position", "")
                try:
                    team.change_positions(date.today(), [{"player_id": pid, "selected_position": new_pos}])
                    results.append({"player_id": pid, "position": new_pos, "success": True})
                except Exception as e:
                    results.append({"player_id": pid, "position": new_pos, "success": False, "error": str(e)})
            all_success = all(r.get("success") for r in results)
            # Check if any failures are scope errors
            scope_errors = [r for r in results if not r.get("success") and _is_scope_error(r.get("error", ""))]
            if not scope_errors or method == "api":
                if as_json:
                    return {"success": all_success, "moves": results, "message": "Applied " + str(len(results)) + " lineup change(s)"}
                for r in results:
                    if r.get("success"):
                        print("Moved player " + r.get("player_id", "") + " to " + r.get("position", ""))
                    else:
                        print("Error moving player " + r.get("player_id", "") + ": " + r.get("error", ""))
                return
            # Fall through to browser for scope errors
        except Exception as e:
            if method == "api" or not _is_scope_error(e):
                if as_json:
                    return {"success": False, "moves": [], "message": "Error: " + str(e)}
                print("Error setting lineup: " + str(e))
                return

    try:
        from yahoo_browser import set_lineup
        result = set_lineup(moves)
        if as_json:
            return result
        if result.get("success"):
            print(result.get("message", "Lineup changes applied via browser"))
        else:
            print(result.get("message", "Browser set-lineup failed"))
    except Exception as e:
        if as_json:
            return {"success": False, "moves": [], "message": "Browser fallback error: " + str(e)}
        print("Browser fallback error: " + str(e))


def cmd_pending_trades(args, as_json=False):
    """View all pending trade proposals"""
    sc, gm, lg, team = get_league_context()
    try:
        trades = team.proposed_trades()
        if not trades:
            if as_json:
                return {"trades": []}
            print("No pending trade proposals")
            return
        trade_list = []
        for t in trades:
            trade_list.append({
                "transaction_key": t.get("transaction_key", ""),
                "status": t.get("status", ""),
                "trader_team_key": t.get("trader_team_key", ""),
                "trader_team_name": t.get("trader_team_name", ""),
                "tradee_team_key": t.get("tradee_team_key", ""),
                "tradee_team_name": t.get("tradee_team_name", ""),
                "trader_players": t.get("trader_players", []),
                "tradee_players": t.get("tradee_players", []),
                "trade_note": t.get("trade_note", ""),
            })
        if as_json:
            return {"trades": trade_list}
        print("Pending Trade Proposals:")
        for t in trade_list:
            print("  Key: " + t.get("transaction_key", "?"))
            print("  Status: " + t.get("status", "?"))
            print("  From: " + t.get("trader_team_name", t.get("trader_team_key", "?")))
            print("  To: " + t.get("tradee_team_name", t.get("tradee_team_key", "?")))
            trader_names = [p.get("name", "?") for p in t.get("trader_players", [])]
            tradee_names = [p.get("name", "?") for p in t.get("tradee_players", [])]
            print("  Trader gives: " + ", ".join(trader_names))
            print("  Tradee gives: " + ", ".join(tradee_names))
            if t.get("trade_note"):
                print("  Note: " + t.get("trade_note", ""))
            print("")
    except Exception as e:
        if as_json:
            return {"error": "Error fetching pending trades: " + str(e)}
        print("Error fetching pending trades: " + str(e))


def cmd_propose_trade(args, as_json=False):
    """Propose a trade to another team
    Args: their_team_key your_player_ids their_player_ids [note]
    Player IDs are comma-separated"""
    if len(args) < 3:
        msg = "Usage: propose-trade THEIR_TEAM_KEY YOUR_IDS THEIR_IDS [NOTE]"
        if as_json:
            return {"success": False, "message": msg}
        print(msg)
        return
    tradee_team_key = args[0]
    your_ids = [pid.strip() for pid in args[1].split(",")]
    their_ids = [pid.strip() for pid in args[2].split(",")]
    trade_note = " ".join(args[3:]) if len(args) > 3 else ""
    your_player_keys = [GAME_KEY + ".p." + pid for pid in your_ids]
    their_player_keys = [GAME_KEY + ".p." + pid for pid in their_ids]
    method = _write_method()

    if method != "browser":
        try:
            sc, gm, lg, team = get_league_context()
            xml = team._construct_trade_proposal_xml(
                tradee_team_key,
                your_player_keys=your_player_keys,
                their_player_keys=their_player_keys,
                trade_note=trade_note,
            )
            team.yhandler.post_transactions(team.league_id, xml)
            msg = "Trade proposed to " + tradee_team_key
            if as_json:
                return {
                    "success": True,
                    "tradee_team_key": tradee_team_key,
                    "your_player_keys": your_player_keys,
                    "their_player_keys": their_player_keys,
                    "message": msg,
                }
            print(msg)
            return
        except Exception as e:
            if method == "api" or not _is_scope_error(e):
                msg = "Error proposing trade: " + str(e)
                if as_json:
                    return {"success": False, "message": msg}
                print(msg)
                return

    try:
        from yahoo_browser import propose_trade
        result = propose_trade(tradee_team_key, your_ids, their_ids, trade_note)
        if as_json:
            result["your_player_keys"] = your_player_keys
            result["their_player_keys"] = their_player_keys
            return result
        if result.get("success"):
            print(result.get("message", "Trade proposed via browser"))
        else:
            print(result.get("message", "Browser propose trade failed"))
    except Exception as e:
        msg = "Browser fallback error: " + str(e)
        if as_json:
            return {"success": False, "message": msg}
        print(msg)


def cmd_accept_trade(args, as_json=False):
    """Accept a pending trade by transaction key"""
    if not args:
        msg = "Usage: accept-trade TRANSACTION_KEY [NOTE]"
        if as_json:
            return {"success": False, "message": msg}
        print(msg)
        return
    transaction_key = args[0]
    trade_note = " ".join(args[1:]) if len(args) > 1 else ""
    method = _write_method()

    if method != "browser":
        try:
            sc, gm, lg, team = get_league_context()
            team.accept_trade(transaction_key, trade_note=trade_note)
            msg = "Trade accepted: " + transaction_key
            if as_json:
                return {"success": True, "transaction_key": transaction_key, "message": msg}
            print(msg)
            return
        except Exception as e:
            if method == "api" or not _is_scope_error(e):
                msg = "Error accepting trade: " + str(e)
                if as_json:
                    return {"success": False, "transaction_key": transaction_key, "message": msg}
                print(msg)
                return

    try:
        from yahoo_browser import accept_trade
        result = accept_trade(transaction_key, trade_note)
        if as_json:
            return result
        if result.get("success"):
            print(result.get("message", "Trade accepted via browser"))
        else:
            print(result.get("message", "Browser accept trade failed"))
    except Exception as e:
        msg = "Browser fallback error: " + str(e)
        if as_json:
            return {"success": False, "transaction_key": transaction_key, "message": msg}
        print(msg)


def cmd_reject_trade(args, as_json=False):
    """Reject a pending trade by transaction key"""
    if not args:
        msg = "Usage: reject-trade TRANSACTION_KEY [NOTE]"
        if as_json:
            return {"success": False, "message": msg}
        print(msg)
        return
    transaction_key = args[0]
    trade_note = " ".join(args[1:]) if len(args) > 1 else ""
    method = _write_method()

    if method != "browser":
        try:
            sc, gm, lg, team = get_league_context()
            team.reject_trade(transaction_key, trade_note=trade_note)
            msg = "Trade rejected: " + transaction_key
            if as_json:
                return {"success": True, "transaction_key": transaction_key, "message": msg}
            print(msg)
            return
        except Exception as e:
            if method == "api" or not _is_scope_error(e):
                msg = "Error rejecting trade: " + str(e)
                if as_json:
                    return {"success": False, "transaction_key": transaction_key, "message": msg}
                print(msg)
                return

    try:
        from yahoo_browser import reject_trade
        result = reject_trade(transaction_key, trade_note)
        if as_json:
            return result
        if result.get("success"):
            print(result.get("message", "Trade rejected via browser"))
        else:
            print(result.get("message", "Browser reject trade failed"))
    except Exception as e:
        msg = "Browser fallback error: " + str(e)
        if as_json:
            return {"success": False, "transaction_key": transaction_key, "message": msg}
        print(msg)


def cmd_whats_new(args, as_json=False):
    """Single digest: injuries, pending trades, opponent moves, trending pickups, prospect call-ups"""
    sc, gm, lg, team = get_league_context()

    db = get_db()
    now = datetime.now().isoformat()

    # Track last check time
    db.execute("""CREATE TABLE IF NOT EXISTS digest_state
                  (key TEXT PRIMARY KEY, value TEXT)""")
    db.commit()
    row = db.execute("SELECT value FROM digest_state WHERE key='last_check'").fetchone()
    last_check = row[0] if row else ""

    result = {
        "last_check": last_check,
        "check_time": now,
        "injuries": [],
        "pending_trades": [],
        "league_activity": [],
        "trending": [],
        "prospects": [],
    }

    # 1. Injury updates
    try:
        injury_data = cmd_injury_report([], as_json=True)
        injured = []
        for p in injury_data.get("injured_active", []):
            injured.append({
                "name": p.get("name", ""),
                "status": p.get("status", ""),
                "position": p.get("position", ""),
                "section": "active_injured",
            })
        for p in injury_data.get("healthy_il", []):
            injured.append({
                "name": p.get("name", ""),
                "status": "healthy_on_IL",
                "position": p.get("position", ""),
                "section": "healthy_il",
            })
        result["injuries"] = injured
    except Exception as e:
        print("Warning: injury check failed: " + str(e))

    # 2. Pending trades
    try:
        trade_data = cmd_pending_trades([], as_json=True)
        result["pending_trades"] = trade_data.get("trades", [])
    except Exception as e:
        print("Warning: pending trades check failed: " + str(e))

    # 3. Recent league activity (filter out our own transactions)
    try:
        yf_mod = importlib.import_module("yahoo-fantasy")
        tx_data = yf_mod.cmd_transactions([], as_json=True)
        transactions = tx_data.get("transactions", [])
        my_team_name = team.team_data.get("name", "") if hasattr(team, "team_data") else ""
        activity = []
        for tx in transactions[:15]:
            tx_team = tx.get("team", "")
            if tx_team and tx_team != my_team_name:
                activity.append({
                    "type": tx.get("type", "?"),
                    "player": tx.get("player", "?"),
                    "team": tx_team,
                })
        result["league_activity"] = activity
    except Exception as e:
        print("Warning: league activity check failed: " + str(e))

    # 4. Trending players (high ownership delta)
    try:
        trend_lookup = get_trend_lookup()
        trending = []
        for name, info in sorted(trend_lookup.items(), key=lambda x: x[1].get("rank", 99)):
            if info.get("direction") == "added" and info.get("rank", 99) <= 10:
                trending.append({
                    "name": name,
                    "direction": "added",
                    "delta": info.get("delta", ""),
                    "percent_owned": info.get("percent_owned", 0),
                })
        result["trending"] = trending[:10]
    except Exception as e:
        print("Warning: trending check failed: " + str(e))

    # 5. Prospect call-ups
    try:
        intel_mod = importlib.import_module("intel")
        prospect_data = intel_mod.cmd_prospect_watch([], as_json=True)
        prospects = []
        for tx in prospect_data.get("transactions", [])[:5]:
            prospects.append({
                "player": tx.get("player", "?"),
                "type": tx.get("type", "?"),
                "team": tx.get("team", ""),
                "description": tx.get("description", ""),
            })
        result["prospects"] = prospects
    except Exception as e:
        print("Warning: prospect check failed: " + str(e))

    # Update last check time
    try:
        db.execute("INSERT OR REPLACE INTO digest_state (key, value) VALUES ('last_check', ?)", (now,))
        db.commit()
    except Exception:
        pass

    if as_json:
        return result

    print("What's New Digest - " + now[:10])
    print("=" * 50)
    if last_check:
        print("Last checked: " + last_check[:19])
    print("")

    if result.get("injuries"):
        print("INJURIES (" + str(len(result.get("injuries", []))) + "):")
        for p in result.get("injuries", []):
            print("  " + p.get("name", "?").ljust(25) + " [" + p.get("status", "?") + "]")
        print("")

    if result.get("pending_trades"):
        print("PENDING TRADES (" + str(len(result.get("pending_trades", []))) + "):")
        for t in result.get("pending_trades", []):
            trader = t.get("trader_team_name", t.get("trader_team_key", "?"))
            print("  From: " + trader + " - " + t.get("status", "?"))
        print("")

    if result.get("league_activity"):
        print("LEAGUE ACTIVITY (" + str(len(result.get("league_activity", []))) + "):")
        for a in result.get("league_activity", []):
            print("  " + a.get("type", "?").ljust(6) + " " + a.get("player", "?").ljust(25) + " -> " + a.get("team", "?"))
        print("")

    if result.get("trending"):
        print("TRENDING PICKUPS:")
        for t in result.get("trending", []):
            print("  " + t.get("name", "?").ljust(25) + " " + str(t.get("percent_owned", 0)) + "% (" + t.get("delta", "") + ")")
        print("")

    if result.get("prospects"):
        print("PROSPECT CALL-UPS:")
        for p in result.get("prospects", []):
            print("  " + p.get("player", "?").ljust(25) + " " + p.get("type", "?") + " " + p.get("team", ""))
        print("")


def cmd_trade_finder(args, as_json=False):
    """Scan league for complementary trade partners and suggest packages"""
    sc, gm, lg, team = get_league_context()

    try:
        # 1. Get our category rankings to find weak/strong areas
        cat_data = cmd_category_check([], as_json=True)
        if cat_data.get("error"):
            if as_json:
                return {"error": cat_data.get("error")}
            print("Error: " + cat_data.get("error", ""))
            return

        weak_cats = cat_data.get("weakest", [])
        strong_cats = cat_data.get("strongest", [])

        # 2. Get all teams and their rosters
        all_teams = lg.teams()
        my_roster = team.roster()
        my_players = {}
        for p in my_roster:
            pid = str(p.get("player_id", ""))
            my_players[pid] = p

        # 3. For each other team, analyze complementary needs
        partners = []
        for team_key, team_data in all_teams.items():
            if TEAM_ID in str(team_key):
                continue
            team_name = team_data.get("name", "Unknown")
            try:
                other_team = lg.to_team(team_key)
                other_roster = other_team.roster()
            except Exception:
                continue

            # Build simple value assessment based on positions and status
            their_hitters = []
            their_pitchers = []
            for p in other_roster:
                positions = p.get("eligible_positions", [])
                name = p.get("name", "Unknown")
                pid = str(p.get("player_id", ""))
                status = p.get("status", "")
                is_pitcher = any(pos in ["SP", "RP", "P"] for pos in positions)
                entry = {
                    "name": name,
                    "player_id": pid,
                    "positions": positions,
                    "status": status,
                }
                if is_pitcher:
                    their_pitchers.append(entry)
                else:
                    their_hitters.append(entry)

            # Determine complementary needs based on category analysis
            # If we're weak in batting cats, look for teams strong in batting
            # If we're strong in pitching cats, offer pitching
            complementary_score = 0
            complementary_cats = []

            # Simple heuristic: teams with many hitters when we need batting help
            from valuations import DEFAULT_BATTING_CATS, DEFAULT_PITCHING_CATS
            batting_cats = list(DEFAULT_BATTING_CATS)
            pitching_cats = list(DEFAULT_PITCHING_CATS)

            weak_batting = [c for c in weak_cats if c in batting_cats]
            weak_pitching = [c for c in weak_cats if c in pitching_cats]
            strong_batting = [c for c in strong_cats if c in batting_cats]
            strong_pitching = [c for c in strong_cats if c in pitching_cats]

            if weak_batting and len(their_hitters) > 8:
                complementary_score += len(weak_batting)
                complementary_cats.extend(weak_batting)
            if weak_pitching and len(their_pitchers) > 5:
                complementary_score += len(weak_pitching)
                complementary_cats.extend(weak_pitching)

            if complementary_score > 0:
                partners.append({
                    "team_key": team_key,
                    "team_name": team_name,
                    "score": complementary_score,
                    "complementary_categories": complementary_cats,
                    "their_hitters": their_hitters[:5],
                    "their_pitchers": their_pitchers[:5],
                })

        # Sort by complementary score
        partners.sort(key=lambda p: p.get("score", 0), reverse=True)
        partners = partners[:5]

        # Build suggested packages
        suggestions = []
        my_hitters = []
        my_pitchers = []
        for p in my_roster:
            positions = p.get("eligible_positions", [])
            is_pitcher = any(pos in ["SP", "RP", "P"] for pos in positions)
            entry = {
                "name": p.get("name", "Unknown"),
                "player_id": str(p.get("player_id", "")),
                "positions": positions,
            }
            if is_pitcher:
                my_pitchers.append(entry)
            else:
                my_hitters.append(entry)

        for partner in partners:
            packages = []
            # If we're strong in pitching, offer a pitcher for a hitter
            if strong_pitching and partner.get("their_hitters"):
                for my_p in my_pitchers[:3]:
                    for their_p in partner.get("their_hitters", [])[:3]:
                        if their_p.get("status") in ["IL", "IL+"]:
                            continue
                        packages.append({
                            "give": [my_p],
                            "get": [their_p],
                            "rationale": "Offer pitching strength for batting help",
                        })
                        if len(packages) >= 2:
                            break
                    if len(packages) >= 2:
                        break
            # If we're strong in batting, offer a hitter for a pitcher
            if strong_batting and partner.get("their_pitchers"):
                for my_p in my_hitters[:3]:
                    for their_p in partner.get("their_pitchers", [])[:3]:
                        if their_p.get("status") in ["IL", "IL+"]:
                            continue
                        packages.append({
                            "give": [my_p],
                            "get": [their_p],
                            "rationale": "Offer batting strength for pitching help",
                        })
                        if len(packages) >= 3:
                            break
                    if len(packages) >= 3:
                        break
            partner["packages"] = packages[:3]
            suggestions.append(partner)

        if as_json:
            return {
                "weak_categories": weak_cats,
                "strong_categories": strong_cats,
                "partners": suggestions,
            }

        print("Trade Finder")
        print("=" * 50)
        print("Your weak categories: " + ", ".join(weak_cats))
        print("Your strong categories: " + ", ".join(strong_cats))
        print("")
        if not suggestions:
            print("No complementary trade partners found")
            return
        for partner in suggestions:
            print("Trade Partner: " + partner.get("team_name", "?"))
            print("  Complementary in: " + ", ".join(partner.get("complementary_categories", [])))
            for pkg in partner.get("packages", []):
                give_names = ", ".join([p.get("name", "?") for p in pkg.get("give", [])])
                get_names = ", ".join([p.get("name", "?") for p in pkg.get("get", [])])
                print("  Package: Give " + give_names + " <-> Get " + get_names)
                print("    Rationale: " + pkg.get("rationale", ""))
            print("")

    except Exception as e:
        if as_json:
            return {"error": "Error running trade finder: " + str(e)}
        print("Error running trade finder: " + str(e))


def _extract_team_meta(team_data):
    """Extract team_logo URL and manager image from lg.teams() entry"""
    logos = team_data.get("team_logos", [])
    logo_url = ""
    if logos:
        logo_url = logos[0].get("team_logo", {}).get("url", "")
    mgr_image = ""
    managers = team_data.get("managers", [])
    if managers:
        m = managers[0].get("manager", managers[0])
        mgr_image = m.get("image_url", "")
    return logo_url, mgr_image


def cmd_power_rankings(args, as_json=False):
    """Rank all teams by estimated roster strength"""
    sc, gm, lg = get_league()
    try:
        all_teams = lg.teams()
        rankings = []
        for team_key, team_data in all_teams.items():
            team_name = team_data.get("name", "Unknown")
            logo_url, mgr_image = _extract_team_meta(team_data)
            try:
                t = lg.to_team(team_key)
                roster = t.roster()
            except Exception:
                continue
            hitting_count = 0
            pitching_count = 0
            total_owned_pct = 0
            for p in roster:
                positions = p.get("eligible_positions", [])
                is_pitcher = any(pos in ["SP", "RP", "P"] for pos in positions)
                pct = p.get("percent_owned", 0)
                if isinstance(pct, (int, float)):
                    total_owned_pct += float(pct)
                if is_pitcher:
                    pitching_count += 1
                else:
                    hitting_count += 1
            # Use aggregate ownership % as a proxy for team strength
            roster_size = len(roster) if roster else 1
            avg_owned = total_owned_pct / roster_size if roster_size > 0 else 0
            rankings.append({
                "team_key": team_key,
                "name": team_name,
                "hitting_count": hitting_count,
                "pitching_count": pitching_count,
                "roster_size": roster_size,
                "avg_owned_pct": round(avg_owned, 1),
                "total_score": round(total_owned_pct, 1),
                "is_my_team": TEAM_ID in str(team_key),
                "team_logo": logo_url,
                "manager_image": mgr_image,
            })
        rankings.sort(key=lambda r: r.get("total_score", 0), reverse=True)
        for i, r in enumerate(rankings):
            r["rank"] = i + 1
        if as_json:
            return {"rankings": rankings}
        print("Power Rankings:")
        print("  " + "#".rjust(3) + "  " + "Team".ljust(30) + "Avg Own%".rjust(9) + "  H/P".rjust(6))
        print("  " + "-" * 52)
        for r in rankings:
            marker = " <-- YOU" if r.get("is_my_team") else ""
            print("  " + str(r.get("rank", "?")).rjust(3) + "  " + r.get("name", "?").ljust(30)
                  + str(r.get("avg_owned_pct", 0)).rjust(8) + "%"
                  + "  " + str(r.get("hitting_count", 0)) + "/" + str(r.get("pitching_count", 0))
                  + marker)
    except Exception as e:
        if as_json:
            return {"error": "Error building power rankings: " + str(e)}
        print("Error building power rankings: " + str(e))


def cmd_week_planner(args, as_json=False):
    """Show games-per-day grid for your roster this week"""
    sc, gm, lg, team = get_league_context()
    try:
        # Get week date range
        current_week = lg.current_week()
        week_num = int(args[0]) if args else current_week
        try:
            week_range = lg.week_date_range(week_num)
            start_date = str(week_range[0])
            end_date = str(week_range[1])
        except Exception:
            # Fallback: current week Mon-Sun
            today = date.today()
            start_of_week = today - timedelta(days=today.weekday())
            end_of_week = start_of_week + timedelta(days=6)
            start_date = start_of_week.isoformat()
            end_date = end_of_week.isoformat()

        # Get schedule for the week
        schedule = get_schedule_for_range(start_date, end_date)

        # Build team -> dates with games mapping
        team_game_dates = {}
        for game in schedule:
            game_date = game.get("game_date", "")
            for side in ["away_name", "home_name"]:
                team_name = game.get(side, "")
                if team_name:
                    norm = normalize_team_name(team_name)
                    if norm not in team_game_dates:
                        team_game_dates[norm] = set()
                    team_game_dates[norm].add(game_date)

        # Get roster and match players to their MLB teams
        roster = team.roster()
        # Build date list for the week
        s = datetime.strptime(start_date, "%Y-%m-%d").date()
        e = datetime.strptime(end_date, "%Y-%m-%d").date()
        dates = []
        d = s
        while d <= e:
            dates.append(d.isoformat())
            d += timedelta(days=1)

        player_schedule = []
        daily_totals = {dt: 0 for dt in dates}
        for p in roster:
            name = p.get("name", "Unknown")
            positions = p.get("eligible_positions", [])
            pos = p.get("selected_position", {}).get("position", "?")
            player_team = get_player_team(p)
            player_team_norm = normalize_team_name(player_team)
            # Also resolve alias to full name for matching
            player_team_full = normalize_team_name(TEAM_ALIASES.get(player_team, player_team))
            games_by_date = {}
            total_games = 0
            for dt in dates:
                has_game = False
                for norm_team, game_dates in team_game_dates.items():
                    if dt in game_dates and (player_team_norm in norm_team or player_team_full in norm_team
                                             or norm_team in player_team_norm or norm_team in player_team_full):
                        has_game = True
                        break
                games_by_date[dt] = has_game
                if has_game:
                    total_games += 1
                    if pos not in ["BN", "IL", "IL+", "NA"]:
                        daily_totals[dt] = daily_totals.get(dt, 0) + 1

            player_schedule.append({
                "name": name,
                "position": pos,
                "positions": positions,
                "mlb_team": player_team,
                "total_games": total_games,
                "games_by_date": games_by_date,
            })

        if as_json:
            return {
                "week": week_num,
                "start_date": start_date,
                "end_date": end_date,
                "dates": dates,
                "players": player_schedule,
                "daily_totals": daily_totals,
            }

        print("Week " + str(week_num) + " Planner (" + start_date + " to " + end_date + ")")
        print("=" * 50)
        # Simplified CLI output
        date_headers = [dt[-5:] for dt in dates]  # MM-DD
        print("  " + "Player".ljust(20) + "Pos".ljust(5) + "  ".join(date_headers))
        print("  " + "-" * (25 + len(dates) * 7))
        for ps in player_schedule:
            day_marks = []
            for dt in dates:
                if ps.get("games_by_date", {}).get(dt):
                    day_marks.append("  *  ")
                else:
                    day_marks.append("  -  ")
            print("  " + ps.get("name", "?")[:20].ljust(20) + ps.get("position", "?").ljust(5) + "".join(day_marks))

    except Exception as e:
        if as_json:
            return {"error": "Error building week planner: " + str(e)}
        print("Error building week planner: " + str(e))


def cmd_season_pace(args, as_json=False):
    """Project season pace, playoff odds, and magic number"""
    sc, gm, lg = get_league()
    try:
        standings = lg.standings()
        settings = lg.settings()
        current_week = lg.current_week()
        end_week = settings.get("end_week", 22)
        if not end_week:
            end_week = 22
        end_week = int(end_week)
        playoff_teams = int(settings.get("num_playoff_teams", 6))

        # Fetch teams for logo/avatar data
        team_meta = {}
        try:
            all_teams = lg.teams()
            for tk, td in all_teams.items():
                tname = td.get("name", "")
                logo_url, mgr_image = _extract_team_meta(td)
                team_meta[tname] = {"team_logo": logo_url, "manager_image": mgr_image}
        except Exception:
            pass

        team_paces = []
        for i, t in enumerate(standings, 1):
            name = t.get("name", "Unknown")
            wins = int(t.get("outcome_totals", {}).get("wins", 0))
            losses = int(t.get("outcome_totals", {}).get("losses", 0))
            ties = int(t.get("outcome_totals", {}).get("ties", 0))
            weeks_played = wins + losses + ties
            if weeks_played == 0:
                weeks_played = max(1, current_week - 1)
            remaining_weeks = end_week - current_week + 1
            if remaining_weeks < 0:
                remaining_weeks = 0
            total_weeks = end_week
            win_pct = float(wins) / weeks_played if weeks_played > 0 else 0
            projected_wins = round(win_pct * total_weeks, 1)
            projected_losses = round((1 - win_pct) * total_weeks, 1)
            is_my_team = TEAM_ID in str(t.get("team_key", ""))
            meta = team_meta.get(name, {})

            team_paces.append({
                "rank": i,
                "name": name,
                "wins": wins,
                "losses": losses,
                "ties": ties,
                "weeks_played": weeks_played,
                "remaining_weeks": remaining_weeks,
                "win_pct": round(win_pct, 3),
                "projected_wins": projected_wins,
                "projected_losses": projected_losses,
                "is_my_team": is_my_team,
                "team_logo": meta.get("team_logo", ""),
                "manager_image": meta.get("manager_image", ""),
            })

        # Calculate magic number for playoff spot
        # Magic number = wins needed - current wins
        # wins_needed = projected wins of team in last playoff spot + 1
        if len(team_paces) >= playoff_teams:
            cutoff_team = team_paces[playoff_teams - 1]
            cutoff_projected = cutoff_team.get("projected_wins", 0)
        else:
            cutoff_projected = 0

        for t in team_paces:
            if t.get("projected_wins", 0) > cutoff_projected:
                t["playoff_status"] = "in"
            elif t.get("projected_wins", 0) == cutoff_projected:
                t["playoff_status"] = "bubble"
            else:
                t["playoff_status"] = "out"
            magic = max(0, round(cutoff_projected - t.get("wins", 0) + 1, 1))
            t["magic_number"] = magic

        if as_json:
            return {
                "current_week": current_week,
                "end_week": end_week,
                "playoff_teams": playoff_teams,
                "teams": team_paces,
            }

        print("Season Pace & Projections (Week " + str(current_week) + "/" + str(end_week) + ")")
        print("Playoff spots: " + str(playoff_teams))
        print("=" * 60)
        print("  " + "#".rjust(3) + "  " + "Team".ljust(28) + "Record".rjust(8) + "  Pace".rjust(6) + "  Magic#".rjust(8) + "  Status")
        print("  " + "-" * 70)
        for t in team_paces:
            record = str(t.get("wins", 0)) + "-" + str(t.get("losses", 0))
            if t.get("ties", 0):
                record += "-" + str(t.get("ties", 0))
            pace = str(t.get("projected_wins", 0))
            magic = str(t.get("magic_number", "?"))
            status = t.get("playoff_status", "?")
            marker = " <-- YOU" if t.get("is_my_team") else ""
            print("  " + str(t.get("rank", "?")).rjust(3) + "  " + t.get("name", "?").ljust(28)
                  + record.rjust(8) + "  " + pace.rjust(5) + "  " + magic.rjust(7) + "  " + status + marker)

    except Exception as e:
        if as_json:
            return {"error": "Error calculating season pace: " + str(e)}
        print("Error calculating season pace: " + str(e))


def cmd_closer_monitor(args, as_json=False):
    """Monitor closer situations across MLB - saves leaders, committees, at-risk closers"""
    sc, gm, lg = get_league()
    try:
        # Get saves leaders from free agents (high-ownership RPs)
        fa_pitchers = lg.free_agents("P")[:50]
        rp_closers = []
        for p in fa_pitchers:
            positions = p.get("eligible_positions", [])
            if "RP" in positions:
                pct = p.get("percent_owned", 0)
                if isinstance(pct, (int, float)) and float(pct) > 20:
                    rp_closers.append({
                        "name": p.get("name", "Unknown"),
                        "player_id": str(p.get("player_id", "")),
                        "positions": positions,
                        "percent_owned": float(pct),
                        "status": p.get("status", ""),
                        "mlb_id": get_mlb_id(p.get("name", "")),
                        "ownership": "free_agent",
                    })

        # Get our roster RPs for context
        team = lg.to_team(TEAM_ID)
        roster = team.roster()
        my_closers = []
        for p in roster:
            positions = p.get("eligible_positions", [])
            if "RP" in positions:
                my_closers.append({
                    "name": p.get("name", "Unknown"),
                    "player_id": str(p.get("player_id", "")),
                    "positions": positions,
                    "percent_owned": p.get("percent_owned", 0),
                    "status": p.get("status", ""),
                    "mlb_id": get_mlb_id(p.get("name", "")),
                    "ownership": "my_team",
                })

        # Sort available closers by ownership %
        rp_closers.sort(key=lambda x: x.get("percent_owned", 0), reverse=True)

        # Try to get saves leaders from MLB Stats API
        saves_leaders = []
        try:
            if statsapi:
                leaders_data = statsapi.league_leaders("saves", limit=30)
                if isinstance(leaders_data, str):
                    # Parse the text output
                    for line in leaders_data.strip().split("\n")[1:]:
                        parts = line.strip().split()
                        if len(parts) >= 3:
                            saves_leaders.append({
                                "name": " ".join(parts[1:-1]),
                                "saves": parts[-1],
                            })
        except Exception:
            pass

        if as_json:
            return {
                "my_closers": my_closers,
                "available_closers": rp_closers[:15],
                "saves_leaders": saves_leaders[:15],
            }

        print("Closer Monitor")
        print("=" * 50)
        if my_closers:
            print("Your Closers/RPs:")
            for p in my_closers:
                status = " [" + p.get("status", "") + "]" if p.get("status") else ""
                print("  " + p.get("name", "?").ljust(25) + " " + str(p.get("percent_owned", 0)) + "% owned" + status)
            print("")
        print("Available Closers (by ownership %):")
        for p in rp_closers[:15]:
            status = " [" + p.get("status", "") + "]" if p.get("status") else ""
            print("  " + p.get("name", "?").ljust(25) + " " + str(p.get("percent_owned", 0)) + "% owned" + status
                  + "  (id:" + p.get("player_id", "?") + ")")
        if saves_leaders:
            print("")
            print("MLB Saves Leaders:")
            for i, p in enumerate(saves_leaders[:10], 1):
                print("  " + str(i).rjust(2) + ". " + p.get("name", "?").ljust(25) + " " + str(p.get("saves", 0)) + " saves")

    except Exception as e:
        if as_json:
            return {"error": "Error building closer monitor: " + str(e)}
        print("Error building closer monitor: " + str(e))


def cmd_pitcher_matchup(args, as_json=False):
    """Show pitcher matchup quality for rostered SPs based on opponent team batting stats"""
    sc, gm, lg, team = get_league_context()
    try:
        # Get week date range
        current_week = lg.current_week()
        week_num = int(args[0]) if args else current_week
        try:
            week_range = lg.week_date_range(week_num)
            start_date = str(week_range[0])
            end_date = str(week_range[1])
        except Exception:
            today = date.today()
            start_of_week = today - timedelta(days=today.weekday())
            end_of_week = start_of_week + timedelta(days=6)
            start_date = start_of_week.isoformat()
            end_date = end_of_week.isoformat()

        # Get roster SPs
        roster = team.roster()
        pitchers = []
        for p in roster:
            positions = p.get("eligible_positions", [])
            if "SP" in positions:
                pitchers.append(p)

        if not pitchers:
            result = {
                "week": week_num,
                "start_date": start_date,
                "end_date": end_date,
                "pitchers": [],
            }
            if as_json:
                return result
            print("No starting pitchers on roster")
            return

        # Get schedule for the week to find probable pitchers
        schedule = get_schedule_for_range(start_date, end_date)

        # Try to get probable pitchers via statsapi hydrate
        probable_map = {}  # pitcher_name_norm -> [game_info, ...]
        try:
            if statsapi:
                prob_sched = statsapi.schedule(start_date=start_date, end_date=end_date, hydrate="probablePitcher")
                for game in prob_sched:
                    game_date = game.get("game_date", "")
                    for side in ["away_probable_pitcher", "home_probable_pitcher"]:
                        pitcher_name = game.get(side, "")
                        if pitcher_name:
                            norm = pitcher_name.strip().lower()
                            if norm not in probable_map:
                                probable_map[norm] = []
                            opp_side = "home_name" if "away" in side else "away_name"
                            ha = "away" if "away" in side else "home"
                            probable_map[norm].append({
                                "date": game_date,
                                "opponent": game.get(opp_side, ""),
                                "home_away": ha,
                            })
        except Exception as e:
            print("  Warning: probable pitcher fetch failed: " + str(e))

        # Build team batting stats lookup (opponent quality)
        team_batting = {}
        try:
            from pybaseball import team_batting as pb_team_batting
            season = date.today().year
            tb = pb_team_batting(season)
            if tb is not None and len(tb) > 0:
                for _, row in tb.iterrows():
                    team_name = str(row.get("Team", ""))
                    k_val = row.get("SO%") or row.get("K%") or 0
                    team_batting[normalize_team_name(team_name)] = {
                        "avg": float(row.get("AVG") or 0),
                        "obp": float(row.get("OBP") or 0),
                        "k_pct": float(k_val) / 100 if k_val else 0,
                        "woba": float(row.get("wOBA") or 0),
                    }
        except Exception as e:
            print("  Warning: pybaseball team batting failed: " + str(e))

        # Match each SP to their upcoming starts
        pitcher_matchups = []
        for p in pitchers:
            name = p.get("name", "Unknown")
            player_id = str(p.get("player_id", ""))
            player_team = get_player_team(p)
            name_norm = name.strip().lower()

            # Find starts from probable pitcher data
            starts = probable_map.get(name_norm, [])

            if not starts:
                # Fallback: find games for their team this week
                team_norm = normalize_team_name(player_team)
                team_full = normalize_team_name(TEAM_ALIASES.get(player_team, player_team))
                for game in schedule:
                    away = normalize_team_name(game.get("away_name", ""))
                    home = normalize_team_name(game.get("home_name", ""))
                    if team_norm in away or team_full in away:
                        starts.append({
                            "date": game.get("game_date", ""),
                            "opponent": game.get("home_name", ""),
                            "home_away": "away",
                        })
                    elif team_norm in home or team_full in home:
                        starts.append({
                            "date": game.get("game_date", ""),
                            "opponent": game.get("away_name", ""),
                            "home_away": "home",
                        })
                # If fallback, only show first 2 at most
                starts = starts[:2]

            is_two_start = len(starts) >= 2

            for s in starts:
                opp_name = s.get("opponent", "Unknown")
                opp_norm = normalize_team_name(opp_name)

                # Find team batting stats
                opp_stats = None
                for tk, tv in team_batting.items():
                    if opp_norm in tk or tk in opp_norm:
                        opp_stats = tv
                        break

                opp_avg = opp_stats.get("avg", 0) if opp_stats else 0
                opp_obp = opp_stats.get("obp", 0) if opp_stats else 0
                opp_k_pct = opp_stats.get("k_pct", 0) if opp_stats else 0
                opp_woba = opp_stats.get("woba", 0) if opp_stats else 0

                # Grade the matchup (lower opponent batting = better for pitcher)
                grade = "C"
                if opp_stats:
                    score = 0
                    # Lower AVG is good for pitcher
                    if opp_avg < .235:
                        score += 2
                    elif opp_avg < .250:
                        score += 1
                    elif opp_avg > .270:
                        score -= 1
                    # Lower OBP is good
                    if opp_obp < .310:
                        score += 2
                    elif opp_obp < .325:
                        score += 1
                    elif opp_obp > .345:
                        score -= 1
                    # Higher K% is good for pitcher
                    if opp_k_pct > .25:
                        score += 2
                    elif opp_k_pct > .22:
                        score += 1
                    elif opp_k_pct < .18:
                        score -= 1
                    # Lower wOBA is good
                    if opp_woba < .300:
                        score += 2
                    elif opp_woba < .315:
                        score += 1
                    elif opp_woba > .340:
                        score -= 1

                    if score >= 5:
                        grade = "A"
                    elif score >= 3:
                        grade = "B"
                    elif score >= 1:
                        grade = "C"
                    elif score >= -1:
                        grade = "D"
                    else:
                        grade = "F"

                pitcher_matchups.append({
                    "name": name,
                    "player_id": player_id,
                    "mlb_team": player_team,
                    "next_start_date": s.get("date", ""),
                    "opponent": opp_name,
                    "home_away": s.get("home_away", ""),
                    "opp_avg": round(opp_avg, 3),
                    "opp_obp": round(opp_obp, 3),
                    "opp_k_pct": round(opp_k_pct, 3),
                    "opp_woba": round(opp_woba, 3),
                    "matchup_grade": grade,
                    "two_start": is_two_start,
                })

        if as_json:
            return {
                "week": week_num,
                "start_date": start_date,
                "end_date": end_date,
                "pitchers": pitcher_matchups,
            }

        print("Pitcher Matchups - Week " + str(week_num) + " (" + start_date + " to " + end_date + ")")
        print("=" * 60)
        print("  " + "Pitcher".ljust(22) + "Start".ljust(12) + "Opponent".ljust(15) + "H/A".ljust(6) + "Grade")
        print("  " + "-" * 55)
        for pm in pitcher_matchups:
            ha = "vs" if pm.get("home_away") == "home" else "@"
            ts = " [2S]" if pm.get("two_start") else ""
            print("  " + pm.get("name", "?")[:22].ljust(22) + pm.get("next_start_date", "")[:10].ljust(12)
                  + (ha + " " + pm.get("opponent", "?"))[:15].ljust(15) + pm.get("home_away", "").ljust(6)
                  + pm.get("matchup_grade", "?") + ts)

    except Exception as e:
        if as_json:
            return {"error": "Error building pitcher matchups: " + str(e)}
        print("Error building pitcher matchups: " + str(e))


COMMANDS = {
    "lineup-optimize": cmd_lineup_optimize,
    "category-check": cmd_category_check,
    "injury-report": cmd_injury_report,
    "waiver-analyze": cmd_waiver_analyze,
    "streaming": cmd_streaming,
    "trade-eval": cmd_trade_eval,
    "daily-update": cmd_daily_update,
    "category-simulate": cmd_category_simulate,
    "scout-opponent": cmd_scout_opponent,
    "matchup-strategy": cmd_matchup_strategy,
    "set-lineup": cmd_set_lineup,
    "pending-trades": cmd_pending_trades,
    "propose-trade": cmd_propose_trade,
    "accept-trade": cmd_accept_trade,
    "reject-trade": cmd_reject_trade,
    "whats-new": cmd_whats_new,
    "trade-finder": cmd_trade_finder,
    "power-rankings": cmd_power_rankings,
    "week-planner": cmd_week_planner,
    "season-pace": cmd_season_pace,
    "closer-monitor": cmd_closer_monitor,
    "pitcher-matchup": cmd_pitcher_matchup,
}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Yahoo Fantasy Baseball In-Season Manager")
        print("Usage: season-manager.py <command> [args]")
        print("")
        print("Commands:")
        print("  lineup-optimize [--apply]   Optimize daily lineup (bench off-day players)")
        print("  category-check              Show category rankings vs league")
        print("  injury-report               Check roster for injury issues")
        print("  waiver-analyze [B|P] [N]    Score free agents for weak categories")
        print("  streaming [week]            Recommend streaming pitchers")
        print("  trade-eval <give> <get>     Evaluate a trade (comma-separated IDs)")
        print("  daily-update                Run all daily checks")
        print("  scout-opponent              Scout your current matchup opponent")
        print("  matchup-strategy           Build category-by-category game plan")
        sys.exit(1)

    cmd = sys.argv[1]
    args = sys.argv[2:]

    if cmd in COMMANDS:
        COMMANDS[cmd](args)
    else:
        print("Unknown command: " + cmd)
        print("Available: " + ", ".join(COMMANDS.keys()))
        sys.exit(1)
