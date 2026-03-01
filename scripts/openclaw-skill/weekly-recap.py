#!/usr/bin/env python3
"""Weekly recap auto-generation for Yahoo Fantasy Baseball.

Collects data from multiple API endpoints (matchup detail, standings,
transactions, category trends) and generates a narrative-style weekly
recap formatted for chat delivery.

Usage:
    python3 scripts/openclaw-skill/weekly-recap.py
    python3 scripts/openclaw-skill/weekly-recap.py --dry-run

Coding conventions: string concatenation (no f-strings),
.get() for all dict access, try/except with print() for errors.
"""

import argparse
import os
import sys

# ---------------------------------------------------------------------------
# Path setup -- allow running from project root or script directory
# ---------------------------------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from api_client import api_get
from config import AutomationConfig
from formatter import format_weekly_recap

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ACTION_NAME = "weekly_recap"


# ---------------------------------------------------------------------------
# Data collection helpers
# ---------------------------------------------------------------------------


def fetch_matchup(base_url):
    """Fetch the current matchup detail with per-category breakdown.

    Returns dict with keys: week, my_team, opponent, score, categories.
    """
    data = api_get(base_url, "/api/matchup-detail")
    if data.get("error"):
        print("Warning: could not fetch matchup detail: " + str(data.get("error")))
        return None
    return data


def fetch_standings(base_url, my_team_name):
    """Fetch league standings and extract our rank/record.

    Args:
        base_url: API base URL
        my_team_name: our team name to search for in standings

    Returns:
        Dict with rank, record, or None on failure.
    """
    data = api_get(base_url, "/api/standings")
    if data.get("error"):
        print("Warning: could not fetch standings: " + str(data.get("error")))
        return None

    standings_list = data.get("standings", [])
    if not standings_list:
        return None

    for entry in standings_list:
        name = entry.get("name", "")
        if name and my_team_name and name.lower() == my_team_name.lower():
            wins = entry.get("wins", 0)
            losses = entry.get("losses", 0)
            record = str(wins) + "-" + str(losses)
            return {
                "rank": entry.get("rank", "?"),
                "record": record,
                "wins": wins,
                "losses": losses,
            }

    # If exact match failed, try substring match
    my_lower = my_team_name.lower() if my_team_name else ""
    for entry in standings_list:
        name = entry.get("name", "")
        if my_lower and my_lower in name.lower():
            wins = entry.get("wins", 0)
            losses = entry.get("losses", 0)
            record = str(wins) + "-" + str(losses)
            return {
                "rank": entry.get("rank", "?"),
                "record": record,
                "wins": wins,
                "losses": losses,
            }

    return None


def fetch_transactions(base_url):
    """Fetch recent transactions and return our team's moves.

    Returns list of transaction dicts with type and player keys.
    """
    data = api_get(base_url, "/api/transactions")
    if data.get("error"):
        print("Warning: could not fetch transactions: " + str(data.get("error")))
        return []

    transactions = data.get("transactions", [])
    if not transactions:
        return []

    # Return the raw transaction list -- the formatter handles display
    return transactions


def fetch_category_trends(base_url):
    """Fetch category rank trends and identify improving/declining cats.

    Returns dict with "improving" and "declining" lists, plus "mvp_category".
    """
    data = api_get(base_url, "/api/category-trends")
    if data.get("error"):
        print("Warning: could not fetch category trends: " + str(data.get("error")))
        return None

    categories = data.get("categories", [])
    if not categories:
        return None

    improving = []
    declining = []
    best_rank = 99
    mvp_cat = None

    for cat in categories:
        name = cat.get("name", "?")
        trend = cat.get("trend", "stable")
        current_rank = cat.get("current_rank", 99)

        if trend == "improving":
            improving.append({
                "name": name,
                "current_rank": current_rank,
                "best_rank": cat.get("best_rank", "?"),
            })
        elif trend == "declining":
            declining.append({
                "name": name,
                "current_rank": current_rank,
                "worst_rank": cat.get("worst_rank", "?"),
            })

        # Track MVP category (best current rank)
        try:
            rank_num = int(current_rank)
            if rank_num < best_rank:
                best_rank = rank_num
                # Get the most recent value from history
                history = cat.get("history", [])
                latest_value = ""
                if history:
                    latest_value = history[-1].get("value", "")
                mvp_cat = {
                    "name": name,
                    "rank": rank_num,
                    "value": latest_value,
                }
        except (TypeError, ValueError):
            pass

    return {
        "improving": improving,
        "declining": declining,
        "mvp_category": mvp_cat,
    }


# ---------------------------------------------------------------------------
# Narrative builder
# ---------------------------------------------------------------------------


def build_narrative(matchup, standings, transactions, trends):
    """Build the narrative sections that supplement the formatter output.

    Returns a list of narrative lines to append after the main recap.
    """
    lines = []

    # MVP Category highlight
    if trends:
        mvp = trends.get("mvp_category")
        if mvp:
            mvp_line = "MVP Category: " + str(mvp.get("name", "?"))
            mvp_value = mvp.get("value", "")
            if mvp_value:
                mvp_line += " (" + str(mvp_value) + ")"
            mvp_line += ", #" + str(mvp.get("rank", "?")) + " in league"
            lines.append(mvp_line)

    # Standings movement
    if standings:
        rank = standings.get("rank", "?")
        lines.append("Overall: #" + str(rank) + " (" + str(standings.get("record", "?")) + ")")

    # Trending categories
    if trends:
        improving = trends.get("improving", [])
        declining = trends.get("declining", [])
        if improving:
            names = []
            for cat in improving[:3]:
                names.append(
                    str(cat.get("name", "?"))
                    + " #" + str(cat.get("current_rank", "?"))
                )
            lines.append("Rising: " + ", ".join(names))
        if declining:
            names = []
            for cat in declining[:3]:
                names.append(
                    str(cat.get("name", "?"))
                    + " #" + str(cat.get("current_rank", "?"))
                )
            lines.append("Slipping: " + ", ".join(names))

    return lines


# ---------------------------------------------------------------------------
# Main recap logic
# ---------------------------------------------------------------------------


def run_recap(dry_run=False):
    """Main entry point for the weekly recap.

    1. Load config and check autonomy
    2. Fetch matchup detail (required)
    3. Fetch supplemental data (standings, transactions, trends)
    4. Assemble the recap payload
    5. Format and print output
    """
    # Load config
    try:
        config = AutomationConfig()
    except Exception as e:
        print("Error loading config: " + str(e))
        return 1

    # Check autonomy level
    autonomy = config.get_autonomy(ACTION_NAME)
    if autonomy == "off":
        print("Weekly recap is disabled (autonomy=off)")
        return 0

    base_url = config.get_api_url()

    # Step 1: Fetch matchup detail (required for recap)
    matchup = fetch_matchup(base_url)
    if not matchup:
        print("WEEKLY RECAP: Could not load matchup data")
        return 1

    my_team_name = matchup.get("my_team", "")

    # Step 2: Fetch supplemental data (each is optional / best-effort)
    standings = fetch_standings(base_url, my_team_name)
    transactions = fetch_transactions(base_url)
    trends = fetch_category_trends(base_url)

    # Step 3: Assemble payload for the formatter
    recap_data = {
        "matchup": {
            "week": matchup.get("week", "?"),
            "my_team": my_team_name,
            "opponent": matchup.get("opponent", "?"),
            "score": matchup.get("score", {}),
            "categories": matchup.get("categories", []),
        },
    }

    if standings:
        recap_data["standings"] = standings

    if transactions:
        recap_data["transactions"] = transactions

    # Step 4: Format using the standard formatter
    output = format_weekly_recap(recap_data)

    # Step 5: Append narrative extras (trends, MVP) below the main recap
    narrative = build_narrative(matchup, standings, transactions, trends)
    if narrative:
        output = output + "\n\n" + "\n".join(narrative)

    # Step 6: Output based on autonomy level
    if dry_run:
        print("[DRY RUN] Weekly recap preview:")
        print("")
        print(output)
    elif autonomy == "auto":
        print(output)
    elif autonomy == "suggest":
        print(output)
    elif autonomy == "alert":
        # Brief alert: just the headline
        score = matchup.get("score", {})
        wins = score.get("wins", 0)
        losses = score.get("losses", 0)
        ties = score.get("ties", 0)
        week = matchup.get("week", "?")
        opponent = matchup.get("opponent", "?")
        headline = (
            "RECAP ALERT: Week " + str(week) + " "
            + str(wins) + "-" + str(losses) + "-" + str(ties)
            + " vs " + str(opponent)
        )
        if standings:
            headline += " | #" + str(standings.get("rank", "?")) + " overall"
        print(headline)

    return 0


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def main():
    """Parse arguments and run the weekly recap."""
    parser = argparse.ArgumentParser(
        description="Yahoo Fantasy Baseball weekly recap auto-generation"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help="Preview recap without side effects",
    )
    args = parser.parse_args()

    try:
        exit_code = run_recap(dry_run=args.dry_run)
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("")
        print("Interrupted")
        sys.exit(130)
    except Exception as e:
        print("Fatal error: " + str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
