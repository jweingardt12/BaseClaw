#!/usr/bin/env python3
"""Yahoo Fantasy Baseball CLI for OpenClaw - Docker Version"""

import sys
import json
import os
import yahoo_fantasy_api as yfa
from mlb_id_cache import get_mlb_id
from shared import (
    get_connection, get_league, get_league_context,
    LEAGUE_ID, TEAM_ID, GAME_KEY,
    enrich_with_intel, enrich_with_trends,
)


def cmd_roster(args, as_json=False):
    """Show current roster"""
    sc, gm, lg, team = get_league_context()
    roster = team.roster()

    if not roster:
        if as_json:
            return {"players": []}
        print("Roster is empty (predraft)")
        return

    if as_json:
        players = []
        for p in roster:
            players.append(
                {
                    "name": p.get("name", "Unknown"),
                    "player_id": p.get("player_id", ""),
                    "position": p.get("selected_position", {}).get("position", "?"),
                    "eligible_positions": p.get("eligible_positions", []),
                    "status": p.get("status", ""),
                    "mlb_id": get_mlb_id(p.get("name", "")),
                }
            )
        enrich_with_intel(players)
        return {"players": players}

    print("Current Roster:")
    for p in roster:
        pos = p.get("selected_position", {}).get("position", "?")
        name = p.get("name", "Unknown")
        status = p.get("status", "")
        elig = ",".join(p.get("eligible_positions", []))
        line = "  " + pos.ljust(4) + " " + name.ljust(25) + " " + elig
        if status:
            line += " [" + status + "]"
        print(line)


def cmd_free_agents(args, as_json=False):
    """List free agents (B=batters, P=pitchers)"""
    pos_type = args[0] if args else "B"
    count = int(args[1]) if len(args) > 1 else 20
    sc, gm, lg = get_league()

    fa = lg.free_agents(pos_type)[:count]

    if as_json:
        players = []
        for p in fa:
            players.append(
                {
                    "name": p.get("name", "Unknown"),
                    "player_id": p.get("player_id", "?"),
                    "positions": p.get("eligible_positions", ["?"]),
                    "percent_owned": p.get("percent_owned", 0),
                    "status": p.get("status", ""),
                    "mlb_id": get_mlb_id(p.get("name", "")),
                }
            )
        enrich_with_intel(players)
        enrich_with_trends(players)
        return {"pos_type": pos_type, "count": count, "players": players}

    label = "Batters" if pos_type == "B" else "Pitchers"
    print("Top " + str(count) + " Free Agent " + label + ":")
    for p in fa:
        name = p.get("name", "Unknown")
        positions = ",".join(p.get("eligible_positions", ["?"]))
        pct = p.get("percent_owned", 0)
        pid = p.get("player_id", "?")
        status = p.get("status", "")
        if status:
            status = " [" + status + "]"
        line = (
            "  "
            + name.ljust(25)
            + " "
            + positions.ljust(12)
            + " "
            + str(pct).rjust(3)
            + "% owned  (id:"
            + str(pid)
            + ")"
            + status
        )
        print(line)


def cmd_standings(args, as_json=False):
    """Show league standings"""
    sc, gm, lg = get_league()
    standings = lg.standings()

    if as_json:
        # Fetch teams for logo/avatar data
        team_meta = {}
        try:
            teams = lg.teams()
            for tk, td in teams.items():
                tname = td.get("name", "")
                logo_url, mgr_image = _extract_team_meta(td)
                team_meta[tname] = {"team_logo": logo_url, "manager_image": mgr_image}
        except Exception:
            pass
        result = []
        for i, team in enumerate(standings, 1):
            name = team.get("name", "Unknown")
            meta = team_meta.get(name, {})
            result.append(
                {
                    "rank": i,
                    "name": name,
                    "wins": team.get("outcome_totals", {}).get("wins", 0),
                    "losses": team.get("outcome_totals", {}).get("losses", 0),
                    "points_for": team.get("points_for", ""),
                    "team_logo": meta.get("team_logo", ""),
                    "manager_image": meta.get("manager_image", ""),
                }
            )
        return {"standings": result}

    print("League Standings:")
    for i, team in enumerate(standings, 1):
        name = team.get("name", "Unknown")
        wins = team.get("outcome_totals", {}).get("wins", 0)
        losses = team.get("outcome_totals", {}).get("losses", 0)
        pts = team.get("points_for", "")
        line = (
            "  "
            + str(i).rjust(2)
            + ". "
            + name.ljust(30)
            + " "
            + str(wins)
            + "-"
            + str(losses)
        )
        if pts:
            line += " (" + str(pts) + " pts)"
        print(line)


def cmd_info(args, as_json=False):
    """Show league and team info"""
    sc, gm, lg = get_league()
    settings = lg.settings()
    team = lg.to_team(TEAM_ID)
    team_name = (
        team.team_data.get("name", "Unknown")
        if hasattr(team, "team_data")
        else "Unknown"
    )

    if as_json:
        return {
            "name": settings.get("name", "Unknown"),
            "draft_status": settings.get("draft_status", "unknown"),
            "season": settings.get("season", "?"),
            "start_date": settings.get("start_date", "?"),
            "end_date": settings.get("end_date", "?"),
            "current_week": lg.current_week(),
            "num_teams": settings.get("num_teams", "?"),
            "playoff_teams": settings.get("num_playoff_teams", "?"),
            "max_weekly_adds": settings.get("max_weekly_adds", "?"),
            "team_name": team_name,
            "team_id": TEAM_ID,
        }

    print("League Info:")
    print("  Name: " + settings.get("name", "Unknown"))
    print("  Draft Status: " + settings.get("draft_status", "unknown"))
    print("  Season: " + settings.get("season", "?"))
    print("  Start: " + settings.get("start_date", "?"))
    print("  End: " + settings.get("end_date", "?"))
    print("  Current Week: " + str(lg.current_week()))
    print("  Teams: " + str(settings.get("num_teams", "?")))
    print("  Playoff Teams: " + str(settings.get("num_playoff_teams", "?")))
    print("  Max Weekly Adds: " + str(settings.get("max_weekly_adds", "?")))
    print("  Your Team: " + team_name + " (" + TEAM_ID + ")")


def cmd_search(args, as_json=False):
    """Search for a player by name"""
    if not args:
        if as_json:
            return {"query": "", "results": []}
        print("Usage: search PLAYER_NAME")
        return
    name = " ".join(args)
    sc, gm, lg = get_league()

    results = []
    for pos_type in ["B", "P"]:
        fa = lg.free_agents(pos_type)
        for p in fa:
            if name.lower() in p.get("name", "").lower():
                results.append(p)

    if as_json:
        players = []
        for p in results[:10]:
            players.append(
                {
                    "name": p.get("name", "Unknown"),
                    "player_id": p.get("player_id", "?"),
                    "positions": p.get("eligible_positions", ["?"]),
                    "percent_owned": p.get("percent_owned", 0),
                    "mlb_id": get_mlb_id(p.get("name", "")),
                }
            )
        enrich_with_intel(players)
        return {"query": name, "results": players}

    if not results:
        print("No free agents found matching: " + name)
        return

    print("Free agents matching: " + name)
    for p in results[:10]:
        pname = p.get("name", "Unknown")
        positions = ",".join(p.get("eligible_positions", ["?"]))
        pct = p.get("percent_owned", 0)
        pid = p.get("player_id", "?")
        line = (
            "  "
            + pname.ljust(25)
            + " "
            + positions.ljust(12)
            + " "
            + str(pct).rjust(3)
            + "% owned  (id:"
            + str(pid)
            + ")"
        )
        print(line)


from yahoo_browser import (
    is_scope_error as _is_scope_error,
    write_method as _write_method,
)


def cmd_add(args, as_json=False):
    """Add a player by player_id"""
    if not args:
        if as_json:
            return {"success": False, "player_key": "", "message": "Missing player_id"}
        print("Usage: add PLAYER_ID")
        return
    player_id = args[0]
    player_key = GAME_KEY + ".p." + str(player_id)
    method = _write_method()

    # Try API first (unless browser-only mode)
    if method != "browser":
        try:
            sc, gm, lg, team = get_league_context()
            team.add_player(player_key)
            if as_json:
                return {
                    "success": True,
                    "player_key": player_key,
                    "message": "Added player " + player_key,
                }
            print("Added player " + player_key)
            return
        except Exception as e:
            if method == "api" or not _is_scope_error(e):
                if as_json:
                    return {
                        "success": False,
                        "player_key": player_key,
                        "message": "Error adding player: " + str(e),
                    }
                print("Error adding player: " + str(e))
                return
            # Fall through to browser

    # Browser fallback
    try:
        from yahoo_browser import add_player

        result = add_player(player_id)
        if as_json:
            result["player_key"] = player_key
            return result
        if result.get("success"):
            print(result.get("message", "Added player " + player_key + " via browser"))
        else:
            print(result.get("message", "Browser add failed"))
    except Exception as e:
        if as_json:
            return {
                "success": False,
                "player_key": player_key,
                "message": "Browser fallback error: " + str(e),
            }
        print("Browser fallback error: " + str(e))


def cmd_drop(args, as_json=False):
    """Drop a player by player_id"""
    if not args:
        if as_json:
            return {"success": False, "player_key": "", "message": "Missing player_id"}
        print("Usage: drop PLAYER_ID")
        return
    player_id = args[0]
    player_key = GAME_KEY + ".p." + str(player_id)
    method = _write_method()

    if method != "browser":
        try:
            sc, gm, lg, team = get_league_context()
            team.drop_player(player_key)
            if as_json:
                return {
                    "success": True,
                    "player_key": player_key,
                    "message": "Dropped player " + player_key,
                }
            print("Dropped player " + player_key)
            return
        except Exception as e:
            if method == "api" or not _is_scope_error(e):
                if as_json:
                    return {
                        "success": False,
                        "player_key": player_key,
                        "message": "Error dropping player: " + str(e),
                    }
                print("Error dropping player: " + str(e))
                return

    try:
        from yahoo_browser import drop_player

        result = drop_player(player_id)
        if as_json:
            result["player_key"] = player_key
            return result
        if result.get("success"):
            print(
                result.get("message", "Dropped player " + player_key + " via browser")
            )
        else:
            print(result.get("message", "Browser drop failed"))
    except Exception as e:
        if as_json:
            return {
                "success": False,
                "player_key": player_key,
                "message": "Browser fallback error: " + str(e),
            }
        print("Browser fallback error: " + str(e))


def _extract_team_name(team_data):
    """Extract team name from Yahoo's nested team structure"""
    if isinstance(team_data, dict):
        team_info = team_data.get("team", [])
        if isinstance(team_info, list) and len(team_info) > 0:
            for item in team_info[0] if isinstance(team_info[0], list) else team_info:
                if isinstance(item, dict) and "name" in item:
                    return item["name"]
    return "?"


def _extract_team_key(team_data):
    """Extract team key from Yahoo's nested team structure"""
    if isinstance(team_data, dict):
        team_info = team_data.get("team", [])
        if isinstance(team_info, list) and len(team_info) > 0:
            for item in team_info[0] if isinstance(team_info[0], list) else team_info:
                if isinstance(item, dict) and "team_key" in item:
                    return item.get("team_key", "")
    return ""


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


def cmd_matchups(args, as_json=False):
    """Show weekly H2H matchup preview and scores"""
    sc, gm, lg = get_league()

    try:
        if args:
            week = int(args[0])
            raw = lg.matchups(week=week)
        else:
            raw = lg.matchups()
    except Exception as e:
        if as_json:
            return {"error": "Error fetching matchups: " + str(e)}
        print("Error fetching matchups: " + str(e))
        return

    if not raw:
        if as_json:
            return {"week": "", "matchups": []}
        print("No matchups available")
        return

    week_label = args[0] if args else "current"

    # Parse Yahoo's nested format: fantasy_content -> league[1] -> scoreboard -> 0 -> matchups
    try:
        league_data = raw.get("fantasy_content", {}).get("league", [])
        if len(league_data) < 2:
            if as_json:
                return {"week": week_label, "matchups": []}
            print("No matchup data in response")
            return
        sb = league_data[1].get("scoreboard", {})
        matchup_block = sb.get("0", {}).get("matchups", {})
        count = int(matchup_block.get("count", 0))

        # Fetch team logos
        team_meta = {}
        try:
            all_teams = lg.teams()
            for tk, td in all_teams.items():
                tname = td.get("name", "")
                logo_url, mgr_image = _extract_team_meta(td)
                team_meta[tname] = {"team_logo": logo_url, "manager_image": mgr_image}
        except Exception:
            pass

        matchup_list = []
        for i in range(count):
            matchup = matchup_block.get(str(i), {}).get("matchup", {})
            teams_data = matchup.get("0", {}).get("teams", {})
            team1 = teams_data.get("0", {})
            team2 = teams_data.get("1", {})
            name1 = _extract_team_name(team1)
            name2 = _extract_team_name(team2)
            status = matchup.get("status", "")
            m1_meta = team_meta.get(name1, {})
            m2_meta = team_meta.get(name2, {})
            matchup_list.append(
                {
                    "team1": name1,
                    "team2": name2,
                    "status": status,
                    "team1_logo": m1_meta.get("team_logo", ""),
                    "team2_logo": m2_meta.get("team_logo", ""),
                }
            )

        if as_json:
            return {"week": week_label, "matchups": matchup_list}

        print("Matchups (week " + str(week_label) + "):")
        for m in matchup_list:
            line = "  " + m["team1"].ljust(28) + " vs  " + m["team2"]
            if m["status"]:
                line += "  (" + m["status"] + ")"
            print(line)
    except Exception as e:
        if as_json:
            return {"error": "Error parsing matchups: " + str(e)}
        print("Error parsing matchups: " + str(e))


def cmd_scoreboard(args, as_json=False):
    """Show live scoring overview for current week (uses matchups data)"""
    sc, gm, lg = get_league()

    try:
        raw = lg.matchups()
    except Exception as e:
        if as_json:
            return {"error": "Error fetching scoreboard: " + str(e)}
        print("Error fetching scoreboard: " + str(e))
        return

    if not raw:
        if as_json:
            return {"week": "", "matchups": []}
        print("No scoreboard data available")
        return

    # Parse Yahoo's nested format (scoreboard comes from matchups endpoint)
    try:
        league_data = raw.get("fantasy_content", {}).get("league", [])
        if len(league_data) < 2:
            if as_json:
                return {"week": "?", "matchups": []}
            print("No scoreboard data in response")
            return
        sb = league_data[1].get("scoreboard", {})
        week = sb.get("week", "?")

        matchup_block = sb.get("0", {}).get("matchups", {})
        count = int(matchup_block.get("count", 0))

        # Fetch team logos
        team_meta = {}
        try:
            all_teams = lg.teams()
            for tk, td in all_teams.items():
                tname = td.get("name", "")
                logo_url, mgr_image = _extract_team_meta(td)
                team_meta[tname] = {"team_logo": logo_url, "manager_image": mgr_image}
        except Exception:
            pass

        matchup_list = []
        for i in range(count):
            matchup = matchup_block.get(str(i), {}).get("matchup", {})
            teams_data = matchup.get("0", {}).get("teams", {})
            team1 = teams_data.get("0", {})
            team2 = teams_data.get("1", {})
            name1 = _extract_team_name(team1)
            name2 = _extract_team_name(team2)

            # Extract win/loss/tie counts from stat_winners
            stat_winners = matchup.get("stat_winners", [])
            wins1 = 0
            wins2 = 0
            ties = 0
            for sw in stat_winners:
                w = sw.get("stat_winner", {})
                if w.get("is_tied"):
                    ties += 1
                elif w.get("winner_team_key", ""):
                    # Count wins per team
                    wins1 += 1  # simplified pre-season

            status = matchup.get("status", "")
            m1_meta = team_meta.get(name1, {})
            m2_meta = team_meta.get(name2, {})
            matchup_list.append(
                {
                    "team1": name1,
                    "team2": name2,
                    "status": status,
                    "team1_logo": m1_meta.get("team_logo", ""),
                    "team2_logo": m2_meta.get("team_logo", ""),
                }
            )

        if as_json:
            return {"week": week, "matchups": matchup_list}

        print("Scoreboard - Week " + str(week) + ":")
        print("")
        for m in matchup_list:
            line = (
                "  "
                + m["team1"].ljust(28)
                + " vs  "
                + m["team2"].ljust(28)
                + m["status"]
            )
            print(line)
    except Exception as e:
        if as_json:
            return {"error": "Error parsing scoreboard: " + str(e)}
        print("Error parsing scoreboard: " + str(e))


def cmd_matchup_detail(args, as_json=False):
    """Show detailed H2H matchup with per-category comparison"""
    sc, gm, lg = get_league()

    try:
        raw = lg.matchups()
    except Exception as e:
        if as_json:
            return {"error": "Error fetching matchup detail: " + str(e)}
        print("Error fetching matchup detail: " + str(e))
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

        sb = league_data[1].get("scoreboard", {})
        week = sb.get("week", "?")
        matchup_block = sb.get("0", {}).get("matchups", {})
        count = int(matchup_block.get("count", 0))

        # Also fetch stat categories for category names
        stat_cats = lg.stat_categories()
        stat_id_to_name = {}
        for cat in stat_cats:
            sid = str(cat.get("stat_id", ""))
            display = cat.get("display_name", cat.get("name", "Stat " + sid))
            stat_id_to_name[sid] = display

        # Fetch team logos
        team_meta = {}
        try:
            all_teams = lg.teams()
            for tk, td in all_teams.items():
                tname = td.get("name", "")
                logo_url, mgr_image = _extract_team_meta(td)
                team_meta[tname] = {"team_logo": logo_url, "manager_image": mgr_image}
        except Exception:
            pass

        # Find user's matchup
        for i in range(count):
            matchup = matchup_block.get(str(i), {}).get("matchup", {})
            teams_data = matchup.get("0", {}).get("teams", {})
            team1_data = teams_data.get("0", {})
            team2_data = teams_data.get("1", {})
            name1 = _extract_team_name(team1_data)
            name2 = _extract_team_name(team2_data)
            key1 = _extract_team_key(team1_data)
            key2 = _extract_team_key(team2_data)

            # Check if this is our matchup
            if TEAM_ID not in key1 and TEAM_ID not in key2:
                continue

            # Found our matchup - determine which team is ours
            if TEAM_ID in key1:
                my_data = team1_data
                opp_data = team2_data
                my_name = name1
                opp_name = name2
            else:
                my_data = team2_data
                opp_data = team1_data
                my_name = name2
                opp_name = name1

            # Extract team stats - Yahoo nests stats in team -> team_stats -> stats
            def _extract_team_stats(tdata):
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

            my_stats = _extract_team_stats(my_data)
            opp_stats = _extract_team_stats(opp_data)

            # Extract stat_winners for per-category results
            stat_winners = matchup.get("stat_winners", [])
            cat_results = {}
            my_key = _extract_team_key(my_data)
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

            # Build categories list
            categories = []
            wins = 0
            losses = 0
            ties = 0

            for sid in sorted(
                cat_results.keys(), key=lambda x: int(x) if x.isdigit() else 0
            ):
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
                categories.append(
                    {
                        "name": cat_name,
                        "my_value": str(my_val),
                        "opp_value": str(opp_val),
                        "result": result,
                    }
                )

            my_meta = team_meta.get(my_name, {})
            opp_meta = team_meta.get(opp_name, {})
            result_data = {
                "week": week,
                "my_team": my_name,
                "opponent": opp_name,
                "my_team_logo": my_meta.get("team_logo", ""),
                "my_manager_image": my_meta.get("manager_image", ""),
                "opp_team_logo": opp_meta.get("team_logo", ""),
                "opp_manager_image": opp_meta.get("manager_image", ""),
                "score": {"wins": wins, "losses": losses, "ties": ties},
                "categories": categories,
            }

            if as_json:
                return result_data

            print("Week " + str(week) + " Matchup: " + my_name + " vs " + opp_name)
            print("Score: " + str(wins) + "-" + str(losses) + "-" + str(ties))
            for cat in categories:
                marker = (
                    "W"
                    if cat["result"] == "win"
                    else ("L" if cat["result"] == "loss" else "T")
                )
                print(
                    "  ["
                    + marker
                    + "] "
                    + cat["name"].ljust(10)
                    + " "
                    + cat["my_value"].rjust(8)
                    + " vs "
                    + cat["opp_value"].rjust(8)
                )
            return

        # No matchup found
        if as_json:
            return {"error": "Could not find your matchup"}
        print("Could not find your matchup")
    except Exception as e:
        if as_json:
            return {"error": "Error parsing matchup detail: " + str(e)}
        print("Error parsing matchup detail: " + str(e))


def cmd_transactions(args, as_json=False):
    """Show recent league transaction activity"""
    sc, gm, lg = get_league()

    trans_type = args[0] if args else None
    count = int(args[1]) if len(args) > 1 else 25

    try:
        if trans_type:
            transactions = lg.transactions(trans_type, count)
        else:
            transactions = []
            for t in ["add", "drop", "trade"]:
                try:
                    results = lg.transactions(t, 10)
                    if results:
                        transactions.extend(results)
                except Exception:
                    pass
    except Exception as e:
        if as_json:
            return {"error": "Error fetching transactions: " + str(e)}
        print("Error fetching transactions: " + str(e))
        return

    label = trans_type if trans_type else "all"

    if as_json:
        trans_list = []
        for t in transactions:
            if isinstance(t, dict):
                trans_list.append(
                    {
                        "type": t.get("type", "?"),
                        "player": t.get("player", t.get("name", "Unknown")),
                        "team": t.get("team", ""),
                    }
                )
            else:
                trans_list.append({"raw": str(t)})
        return {"type": label, "transactions": trans_list}

    if not transactions:
        print("No recent transactions found")
        return

    print("Recent transactions (" + label + "):")
    for t in transactions:
        if isinstance(t, dict):
            ttype = t.get("type", "?")
            player = t.get("player", t.get("name", "Unknown"))
            team = t.get("team", "")
            line = "  " + str(ttype).ljust(8) + " " + str(player).ljust(25)
            if team:
                line += " -> " + str(team)
            print(line)
        else:
            print("  " + str(t))


def cmd_stat_categories(args, as_json=False):
    """Show league scoring categories"""
    sc, gm, lg = get_league()

    try:
        categories = lg.stat_categories()
    except Exception as e:
        if as_json:
            return {"error": "Error fetching stat categories: " + str(e)}
        print("Error fetching stat categories: " + str(e))
        return

    if not categories:
        if as_json:
            return {"categories": []}
        print("No stat categories found")
        return

    if as_json:
        cat_list = []
        if isinstance(categories, list):
            for cat in categories:
                if isinstance(cat, dict):
                    cat_list.append(
                        {
                            "name": cat.get("display_name", cat.get("name", "?")),
                            "position_type": cat.get("position_type", ""),
                        }
                    )
        elif isinstance(categories, dict):
            for key, val in categories.items():
                cat_list.append({"name": str(key), "position_type": str(val)})
        return {"categories": cat_list}

    print("Stat Categories:")
    if isinstance(categories, list):
        for cat in categories:
            if isinstance(cat, dict):
                name = cat.get("display_name", cat.get("name", "?"))
                pos_type = cat.get("position_type", "")
                label = ""
                if pos_type:
                    label = " (" + pos_type + ")"
                print("  " + str(name) + label)
            else:
                print("  " + str(cat))
    elif isinstance(categories, dict):
        for key, val in categories.items():
            print("  " + str(key) + ": " + str(val))
    else:
        print("  " + str(categories))


def _parse_trend_players(raw_json):
    """Parse Yahoo's nested player response from sort=AR/DR endpoints"""
    players = []
    try:
        fc = raw_json.get("fantasy_content", {})
        game_data = fc.get("game", [])
        if len(game_data) < 2:
            return players
        players_block = game_data[1].get("players", {})
        count = int(players_block.get("count", 0))
        for i in range(count):
            p_data = players_block.get(str(i), {}).get("player", [])
            if not p_data or len(p_data) < 2:
                continue
            # First element is a list of info dicts
            info_list = p_data[0] if isinstance(p_data[0], list) else []
            name = ""
            player_id = ""
            team_abbrev = ""
            position = ""
            for item in info_list:
                if isinstance(item, dict):
                    if "name" in item:
                        name = item.get("name", {}).get("full", "")
                    if "player_id" in item:
                        player_id = str(item.get("player_id", ""))
                    if "editorial_team_abbr" in item:
                        team_abbrev = item.get("editorial_team_abbr", "")
                    if "display_position" in item:
                        position = item.get("display_position", "")
            # Second element has percent_owned
            pct_owned = 0
            delta = ""
            ownership = p_data[1] if len(p_data) > 1 else {}
            if isinstance(ownership, dict):
                po = ownership.get("percent_owned", [])
                if isinstance(po, list):
                    for po_item in po:
                        if isinstance(po_item, dict):
                            if "value" in po_item:
                                try:
                                    pct_owned = float(po_item.get("value", 0))
                                except (ValueError, TypeError):
                                    pct_owned = 0
                            if "delta" in po_item:
                                raw_delta = po_item.get("delta", "0")
                                try:
                                    d = float(raw_delta)
                                    delta = ("+" if d > 0 else "") + str(d)
                                except (ValueError, TypeError):
                                    delta = str(raw_delta)
                elif isinstance(po, dict):
                    try:
                        pct_owned = float(po.get("value", 0))
                    except (ValueError, TypeError):
                        pct_owned = 0
                    raw_delta = po.get("delta", "0")
                    try:
                        d = float(raw_delta)
                        delta = ("+" if d > 0 else "") + str(d)
                    except (ValueError, TypeError):
                        delta = str(raw_delta)
            entry = {
                "name": name,
                "player_id": player_id,
                "team": team_abbrev.upper(),
                "position": position,
                "percent_owned": pct_owned,
                "delta": delta,
            }
            mlb_id = get_mlb_id(name)
            if mlb_id:
                entry["mlb_id"] = mlb_id
            players.append(entry)
    except Exception as e:
        print("Warning: error parsing trend players: " + str(e))
    return players


def cmd_transaction_trends(args, as_json=False):
    """Show most added and most dropped players across all Yahoo leagues"""
    sc = get_connection()
    gm = yfa.Game(sc, "mlb")

    count = 25
    try:
        added_raw = gm.yhandler.get(
            "game/mlb/players;sort=AR;count=" + str(count) + "/percent_owned"
        )
        dropped_raw = gm.yhandler.get(
            "game/mlb/players;sort=DR;count=" + str(count) + "/percent_owned"
        )
    except Exception as e:
        if as_json:
            return {"error": "Error fetching transaction trends: " + str(e)}
        print("Error fetching transaction trends: " + str(e))
        return

    most_added = _parse_trend_players(added_raw) if added_raw else []
    most_dropped = _parse_trend_players(dropped_raw) if dropped_raw else []

    if as_json:
        return {"most_added": most_added, "most_dropped": most_dropped}

    print("Most Added Players (across all Yahoo leagues):")
    for i, p in enumerate(most_added, 1):
        line = "  " + str(i).rjust(2) + ". " + p.get("name", "?").ljust(25)
        line += " " + p.get("team", "?").ljust(4)
        line += " " + p.get("position", "?").ljust(8)
        line += " " + str(p.get("percent_owned", 0)).rjust(5) + "%"
        line += " (" + p.get("delta", "?") + ")"
        print(line)

    print("")
    print("Most Dropped Players (across all Yahoo leagues):")
    for i, p in enumerate(most_dropped, 1):
        line = "  " + str(i).rjust(2) + ". " + p.get("name", "?").ljust(25)
        line += " " + p.get("team", "?").ljust(4)
        line += " " + p.get("position", "?").ljust(8)
        line += " " + str(p.get("percent_owned", 0)).rjust(5) + "%"
        line += " (" + p.get("delta", "?") + ")"
        print(line)


def cmd_swap(args, as_json=False):
    """Atomic add+drop (swap players)"""
    if len(args) < 2:
        if as_json:
            return {
                "success": False,
                "add_key": "",
                "drop_key": "",
                "message": "Usage: swap ADD_ID DROP_ID",
            }
        print("Usage: swap ADD_ID DROP_ID")
        return
    add_id = args[0]
    drop_id = args[1]
    add_key = GAME_KEY + ".p." + str(add_id)
    drop_key = GAME_KEY + ".p." + str(drop_id)
    method = _write_method()

    if method != "browser":
        try:
            sc, gm, lg, team = get_league_context()
            team.add_and_drop_players(add_key, drop_key)
            msg = "Swapped: added " + add_key + ", dropped " + drop_key
            if as_json:
                return {
                    "success": True,
                    "add_key": add_key,
                    "drop_key": drop_key,
                    "message": msg,
                }
            print(msg)
            return
        except Exception as e:
            if method == "api" or not _is_scope_error(e):
                msg = "Error swapping players: " + str(e)
                if as_json:
                    return {
                        "success": False,
                        "add_key": add_key,
                        "drop_key": drop_key,
                        "message": msg,
                    }
                print(msg)
                return

    try:
        from yahoo_browser import swap_players

        result = swap_players(add_id, drop_id)
        if as_json:
            result["add_key"] = add_key
            result["drop_key"] = drop_key
            return result
        if result.get("success"):
            print(result.get("message", "Swap completed via browser"))
        else:
            print(result.get("message", "Browser swap failed"))
    except Exception as e:
        msg = "Browser fallback error: " + str(e)
        if as_json:
            return {
                "success": False,
                "add_key": add_key,
                "drop_key": drop_key,
                "message": msg,
            }
        print(msg)


def cmd_waiver_claim(args, as_json=False):
    """Submit a waiver claim with optional FAAB bid"""
    if not args:
        if as_json:
            return {"success": False, "message": "Missing player_id"}
        print("Usage: waiver-claim PLAYER_ID [FAAB_BID]")
        return
    player_id = args[0]
    player_key = GAME_KEY + ".p." + str(player_id)
    faab = None
    if len(args) > 1:
        try:
            faab = int(args[1])
        except (ValueError, TypeError):
            if as_json:
                return {
                    "success": False,
                    "message": "Invalid FAAB bid: " + str(args[1]),
                }
            print("Invalid FAAB bid: " + str(args[1]))
            return
    method = _write_method()

    if method != "browser":
        try:
            sc, gm, lg, team = get_league_context()
            if faab is not None:
                team.claim_player(player_key, faab=faab)
                msg = (
                    "Waiver claim submitted for "
                    + player_key
                    + " with $"
                    + str(faab)
                    + " FAAB bid"
                )
            else:
                team.claim_player(player_key)
                msg = "Waiver claim submitted for " + player_key
            if as_json:
                return {
                    "success": True,
                    "player_key": player_key,
                    "faab": faab,
                    "message": msg,
                }
            print(msg)
            return
        except Exception as e:
            if method == "api" or not _is_scope_error(e):
                msg = "Error submitting waiver claim: " + str(e)
                if as_json:
                    return {
                        "success": False,
                        "player_key": player_key,
                        "faab": faab,
                        "message": msg,
                    }
                print(msg)
                return

    try:
        from yahoo_browser import waiver_claim

        result = waiver_claim(player_id, faab=faab)
        if as_json:
            result["player_key"] = player_key
            result["faab"] = faab
            return result
        if result.get("success"):
            print(result.get("message", "Waiver claim submitted via browser"))
        else:
            print(result.get("message", "Browser waiver claim failed"))
    except Exception as e:
        msg = "Browser fallback error: " + str(e)
        if as_json:
            return {
                "success": False,
                "player_key": player_key,
                "faab": faab,
                "message": msg,
            }
        print(msg)


def cmd_waiver_claim_swap(args, as_json=False):
    """Submit a waiver claim + drop with optional FAAB bid"""
    if len(args) < 2:
        if as_json:
            return {
                "success": False,
                "message": "Usage: waiver-claim-swap ADD_ID DROP_ID [FAAB_BID]",
            }
        print("Usage: waiver-claim-swap ADD_ID DROP_ID [FAAB_BID]")
        return
    add_id = args[0]
    drop_id = args[1]
    add_key = GAME_KEY + ".p." + str(add_id)
    drop_key = GAME_KEY + ".p." + str(drop_id)
    faab = None
    if len(args) > 2:
        try:
            faab = int(args[2])
        except (ValueError, TypeError):
            if as_json:
                return {
                    "success": False,
                    "message": "Invalid FAAB bid: " + str(args[2]),
                }
            print("Invalid FAAB bid: " + str(args[2]))
            return
    method = _write_method()

    if method != "browser":
        try:
            sc, gm, lg, team = get_league_context()
            if faab is not None:
                team.claim_and_drop_players(add_key, drop_key, faab=faab)
                msg = (
                    "Waiver claim+drop submitted: add "
                    + add_key
                    + ", drop "
                    + drop_key
                    + " with $"
                    + str(faab)
                    + " FAAB"
                )
            else:
                team.claim_and_drop_players(add_key, drop_key)
                msg = (
                    "Waiver claim+drop submitted: add " + add_key + ", drop " + drop_key
                )
            if as_json:
                return {
                    "success": True,
                    "add_key": add_key,
                    "drop_key": drop_key,
                    "faab": faab,
                    "message": msg,
                }
            print(msg)
            return
        except Exception as e:
            if method == "api" or not _is_scope_error(e):
                msg = "Error submitting waiver claim+drop: " + str(e)
                if as_json:
                    return {
                        "success": False,
                        "add_key": add_key,
                        "drop_key": drop_key,
                        "faab": faab,
                        "message": msg,
                    }
                print(msg)
                return

    try:
        from yahoo_browser import waiver_claim_swap

        result = waiver_claim_swap(add_id, drop_id, faab=faab)
        if as_json:
            result["add_key"] = add_key
            result["drop_key"] = drop_key
            result["faab"] = faab
            return result
        if result.get("success"):
            print(result.get("message", "Waiver claim+drop submitted via browser"))
        else:
            print(result.get("message", "Browser waiver claim+drop failed"))
    except Exception as e:
        msg = "Browser fallback error: " + str(e)
        if as_json:
            return {
                "success": False,
                "add_key": add_key,
                "drop_key": drop_key,
                "faab": faab,
                "message": msg,
            }
        print(msg)


def cmd_who_owns(args, as_json=False):
    """Check who owns a player by player_id"""
    if not args:
        if as_json:
            return {"error": "Missing player_id"}
        print("Usage: who-owns PLAYER_ID")
        return
    player_id = args[0]
    player_key = GAME_KEY + ".p." + str(player_id)
    sc, gm, lg = get_league()
    try:
        ownership = lg.ownership([player_key])
        if not ownership:
            if as_json:
                return {
                    "player_key": player_key,
                    "ownership_type": "unknown",
                    "owner": "",
                }
            print("No ownership info for " + player_key)
            return
        info = ownership.get(player_key, ownership.get(player_id, {}))
        if not info and len(ownership) == 1:
            info = list(ownership.values())[0]
        own_type = info.get("ownership_type", "unknown")
        owner_name = info.get("owner_team_name", "")
        if as_json:
            return {
                "player_key": player_key,
                "ownership_type": own_type,
                "owner": owner_name,
            }
        if own_type == "team":
            print(player_key + " is owned by: " + owner_name)
        elif own_type == "freeagents":
            print(player_key + " is a free agent")
        elif own_type == "waivers":
            print(player_key + " is on waivers")
        else:
            print(player_key + " ownership: " + own_type)
    except Exception as e:
        if as_json:
            return {"error": "Error checking ownership: " + str(e)}
        print("Error checking ownership: " + str(e))


def cmd_league_pulse(args, as_json=False):
    """Show league activity - moves and trades per team"""
    sc, gm, lg = get_league()
    try:
        teams = lg.teams()
        team_list = []
        for team_key, team_data in teams.items():
            logo_url, mgr_image = _extract_team_meta(team_data)
            team_list.append(
                {
                    "team_key": team_key,
                    "name": team_data.get("name", "Unknown"),
                    "moves": team_data.get("number_of_moves", 0),
                    "trades": team_data.get("number_of_trades", 0),
                    "total": team_data.get("number_of_moves", 0)
                    + team_data.get("number_of_trades", 0),
                    "team_logo": logo_url,
                    "manager_image": mgr_image,
                }
            )
        team_list.sort(key=lambda t: t.get("total", 0), reverse=True)
        if as_json:
            return {"teams": team_list}
        print("League Activity Pulse:")
        print(
            "  "
            + "Team".ljust(30)
            + "Moves".rjust(6)
            + "Trades".rjust(7)
            + "Total".rjust(6)
        )
        print("  " + "-" * 49)
        for t in team_list:
            print(
                "  "
                + t.get("name", "?").ljust(30)
                + str(t.get("moves", 0)).rjust(6)
                + str(t.get("trades", 0)).rjust(7)
                + str(t.get("total", 0)).rjust(6)
            )
    except Exception as e:
        if as_json:
            return {"error": "Error fetching league pulse: " + str(e)}
        print("Error fetching league pulse: " + str(e))


def cmd_discover(args, as_json=False):
    """Discover your Yahoo Fantasy leagues and teams for the current season.
    Does not require LEAGUE_ID or TEAM_ID to be set."""
    sc = OAuth2(None, None, from_file=OAUTH_FILE)
    if not sc.token_is_valid():
        sc.refresh_access_token()
    gm = yfa.Game(sc, "mlb")
    game_id = str(gm.game_id())
    all_ids = gm.league_ids()
    current_ids = [lid for lid in all_ids if lid.startswith(game_id + ".")]

    if not current_ids:
        msg = "No MLB leagues found for the " + game_id + " season."
        if as_json:
            return {"game_id": game_id, "leagues": [], "message": msg}
        print(msg)
        print("Make sure you've joined a Yahoo Fantasy Baseball league for this year.")
        return

    leagues = []
    for lid in current_ids:
        try:
            lg = gm.to_league(lid)
            settings = lg.settings()
            league_name = settings.get("name", "Unknown")
            season = settings.get("season", "?")
            num_teams = settings.get("num_teams", "?")
            teams = lg.teams()
            my_team_key = ""
            my_team_name = ""
            for tk, td in teams.items():
                if td.get("is_owned_by_current_login"):
                    my_team_key = tk
                    my_team_name = td.get("name", "Unknown")
                    break
            leagues.append(
                {
                    "league_id": lid,
                    "league_name": league_name,
                    "season": season,
                    "num_teams": num_teams,
                    "team_id": my_team_key,
                    "team_name": my_team_name,
                }
            )
        except Exception as e:
            leagues.append(
                {
                    "league_id": lid,
                    "league_name": "Error: " + str(e),
                    "season": "?",
                    "num_teams": "?",
                    "team_id": "",
                    "team_name": "",
                }
            )

    if as_json:
        return {"game_id": game_id, "leagues": leagues}

    print("")
    print("Your " + game_id + " MLB Fantasy Leagues:")
    print("")
    for i, lg_info in enumerate(leagues, 1):
        print("  " + str(i) + ". " + lg_info["league_name"])
        print(
            "     Season: "
            + str(lg_info["season"])
            + "  |  Teams: "
            + str(lg_info["num_teams"])
        )
        print("     LEAGUE_ID=" + lg_info["league_id"])
        if lg_info["team_id"]:
            print(
                "     TEAM_ID="
                + lg_info["team_id"]
                + "  ("
                + lg_info["team_name"]
                + ")"
            )
        else:
            print("     (could not identify your team)")
        print("")

    if len(leagues) == 1 and leagues[0]["team_id"]:
        lg_info = leagues[0]
        print("Add these to your .env file:")
        print("")
        print("  LEAGUE_ID=" + lg_info["league_id"])
        print("  TEAM_ID=" + lg_info["team_id"])
        print("")


COMMANDS = {
    "discover": cmd_discover,
    "roster": cmd_roster,
    "free-agents": cmd_free_agents,
    "standings": cmd_standings,
    "info": cmd_info,
    "search": cmd_search,
    "add": cmd_add,
    "drop": cmd_drop,
    "matchups": cmd_matchups,
    "scoreboard": cmd_scoreboard,
    "matchup-detail": cmd_matchup_detail,
    "transactions": cmd_transactions,
    "stat-categories": cmd_stat_categories,
    "swap": cmd_swap,
    "transaction-trends": cmd_transaction_trends,
    "waiver-claim": cmd_waiver_claim,
    "waiver-claim-swap": cmd_waiver_claim_swap,
    "who-owns": cmd_who_owns,
    "league-pulse": cmd_league_pulse,
}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Yahoo Fantasy Baseball CLI (Docker)")
        print("Usage: yahoo-fantasy.py <command> [args]")
        print("\nCommands: " + ", ".join(COMMANDS.keys()))
        sys.exit(1)

    cmd = sys.argv[1]
    args = sys.argv[2:]

    if cmd in COMMANDS:
        COMMANDS[cmd](args)
    else:
        print("Unknown command: " + cmd)
