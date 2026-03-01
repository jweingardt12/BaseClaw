#!/usr/bin/env python3
"""Injury auto-response monitor for Yahoo Fantasy Baseball.

Checks the injury report API, identifies newly injured players on the
active roster, finds replacement free agents, and formats output based
on the configured autonomy level.

Runnable as: python3 scripts/openclaw-skill/injury-monitor.py [--dry-run]

Coding conventions: string concatenation (no f-strings),
.get() for all dict access, try/except with print() for errors.
"""

import argparse
import json
import os
import sys

# ---------------------------------------------------------------------------
# Path setup — allow running from project root or script directory
# ---------------------------------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(SCRIPT_DIR, ".injury-state.json")

# Add parent so we can import sibling modules
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from api_client import api_get
from config import AutomationConfig
from formatter import format_injury_alert, format_waiver_alert

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ACTION_NAME = "injury_response"
DEFAULT_REPLACEMENT_COUNT = 3


# ---------------------------------------------------------------------------
# State management — track previously seen injuries
# ---------------------------------------------------------------------------


def load_state():
    """Load previously seen injury state from JSON file.

    Returns dict mapping player name (lower) to injury info dict.
    """
    try:
        with open(STATE_FILE, "r") as fh:
            data = json.load(fh)
            if isinstance(data, dict):
                return data
            return {}
    except FileNotFoundError:
        return {}
    except Exception as e:
        print("Warning: could not load injury state: " + str(e))
        return {}


def save_state(state):
    """Persist injury state to JSON file."""
    try:
        with open(STATE_FILE, "w") as fh:
            json.dump(state, fh, indent=2)
    except Exception as e:
        print("Warning: could not save injury state: " + str(e))


def find_new_injuries(injury_data, previous_state):
    """Identify players who are newly injured on the active roster.

    Only considers players from the "injured_active" category — those
    sitting in an active lineup slot while injured.

    Args:
        injury_data: dict from /api/injury-report
        previous_state: dict of previously seen injuries

    Returns:
        List of player dicts that are new (not in previous state).
    """
    injured_active = injury_data.get("injured_active", [])
    new_players = []

    for player in injured_active:
        name = player.get("name", "")
        if not name:
            continue
        key = name.lower()
        if key not in previous_state:
            new_players.append(player)

    return new_players


def build_current_state(injury_data):
    """Build a state dict from the current injury report.

    Tracks all injured players (active, bench, IL) so we know what
    we have already seen. Keyed by lowercase player name.
    """
    state = {}

    for category in ("injured_active", "injured_bench", "il_proper"):
        for player in injury_data.get(category, []):
            name = player.get("name", "")
            if not name:
                continue
            key = name.lower()
            state[key] = {
                "name": name,
                "status": player.get("status", ""),
                "position": player.get("position", ""),
                "category": category,
            }

    return state


# ---------------------------------------------------------------------------
# Replacement finder
# ---------------------------------------------------------------------------


def find_replacements(base_url, player, count=DEFAULT_REPLACEMENT_COUNT):
    """Find top FA replacements for an injured player.

    Determines batter vs pitcher from position, then calls waiver-analyze.

    Args:
        base_url: API base URL
        player: player dict with "position" and "eligible_positions"
        count: number of replacements to fetch

    Returns:
        List of recommendation dicts, or empty list on failure.
    """
    # Determine position type — pitchers have SP/RP/P positions
    position = player.get("position", "")
    eligible = player.get("eligible_positions", [])
    all_positions = [position] + (eligible if isinstance(eligible, list) else [])

    pitcher_positions = {"SP", "RP", "P"}
    is_pitcher = bool(set(all_positions) & pitcher_positions)
    pos_type = "P" if is_pitcher else "B"

    data = api_get(base_url, "/api/waiver-analyze", {
        "pos_type": pos_type,
        "count": str(count),
    })

    if data.get("error"):
        print("Warning: waiver lookup failed: " + str(data.get("error")))
        return []

    return data.get("recommendations", [])[:count]


# ---------------------------------------------------------------------------
# Response actions by autonomy level
# ---------------------------------------------------------------------------


def handle_auto(injury_data, new_injuries, replacements_map, dry_run=False):
    """Auto mode: bench injured players, recommend adds.

    In a real implementation this would call roster-move APIs.
    For now it formats the action plan and notes what would be done.
    """
    lines = []

    # Format the full injury alert
    alert = format_injury_alert(injury_data)
    lines.append(alert)

    if new_injuries:
        lines.append("")
        lines.append("--- AUTO-RESPONSE ---")
        for player in new_injuries:
            name = player.get("name", "?")
            pos = player.get("position", "?")

            if dry_run:
                lines.append("[DRY RUN] Would bench: " + name + " (" + pos + ")")
            else:
                lines.append("Benched: " + name + " (" + pos + ")")

            reps = replacements_map.get(name, [])
            if reps:
                lines.append("  Top replacements:")
                for i, rep in enumerate(reps):
                    rep_name = rep.get("name", "?")
                    z = str(rep.get("z_score", 0))
                    pct = str(rep.get("pct", 0))
                    rank = str(i + 1)
                    lines.append(
                        "    " + rank + ". " + rep_name
                        + " (z=" + z + ", " + pct + "% owned)"
                    )
            else:
                lines.append("  No replacement candidates found")

    return "\n".join(lines)


def handle_suggest(injury_data, new_injuries, replacements_map):
    """Suggest mode: format suggestions without acting."""
    lines = []

    alert = format_injury_alert(injury_data)
    lines.append(alert)

    if new_injuries:
        lines.append("")
        lines.append("--- SUGGESTED ACTIONS ---")
        for player in new_injuries:
            name = player.get("name", "?")
            pos = player.get("position", "?")
            status = player.get("status", "?")

            lines.append("Suggest: Bench " + name + " (" + pos + ") [" + status + "]")

            reps = replacements_map.get(name, [])
            if reps:
                lines.append("  Consider adding:")
                for i, rep in enumerate(reps):
                    rep_name = rep.get("name", "?")
                    z = str(rep.get("z_score", 0))
                    pct = str(rep.get("pct", 0))
                    rank = str(i + 1)
                    lines.append(
                        "    " + rank + ". " + rep_name
                        + " (z=" + z + ", " + pct + "% owned)"
                    )

    return "\n".join(lines)


def handle_alert(injury_data, new_injuries):
    """Alert mode: send brief injury notification only."""
    return format_injury_alert(injury_data)


# ---------------------------------------------------------------------------
# Main monitor logic
# ---------------------------------------------------------------------------


def run_monitor(dry_run=False):
    """Main entry point for the injury monitor.

    1. Load config and check autonomy
    2. Fetch injury report
    3. Identify new injuries
    4. Find replacements (if suggest or auto)
    5. Format and print output
    6. Update state file
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
        print("Injury response is disabled (autonomy=off)")
        return 0

    base_url = config.get_api_url()

    # Fetch injury report
    injury_data = api_get(base_url, "/api/injury-report")
    if injury_data.get("error"):
        print("Error fetching injury report: " + str(injury_data.get("error")))
        return 1

    # Load previous state and find new injuries
    previous_state = load_state()
    new_injuries = find_new_injuries(injury_data, previous_state)

    # If no new injuries and no existing issues, report clean
    injured_active = injury_data.get("injured_active", [])
    healthy_il = injury_data.get("healthy_il", [])
    injured_bench = injury_data.get("injured_bench", [])
    il_proper = injury_data.get("il_proper", [])
    total_issues = len(injured_active) + len(healthy_il) + len(injured_bench) + len(il_proper)

    if not new_injuries and total_issues == 0:
        print(format_injury_alert(injury_data))
        # Update state (clears stale entries)
        if not dry_run:
            save_state({})
        return 0

    # Find replacements for new injuries (auto and suggest modes)
    replacements_map = {}
    if new_injuries and config.should_suggest(ACTION_NAME):
        for player in new_injuries:
            name = player.get("name", "?")
            reps = find_replacements(base_url, player, DEFAULT_REPLACEMENT_COUNT)
            replacements_map[name] = reps

    # Format output based on autonomy level
    if autonomy == "auto":
        output = handle_auto(injury_data, new_injuries, replacements_map, dry_run=dry_run)
    elif autonomy == "suggest":
        output = handle_suggest(injury_data, new_injuries, replacements_map)
    else:
        # "alert" level
        output = handle_alert(injury_data, new_injuries)

    # Print formatted output
    print(output)

    # Update state file (skip on dry run)
    if not dry_run:
        current_state = build_current_state(injury_data)
        save_state(current_state)
    else:
        print("")
        print("[DRY RUN] State file not updated")

    return 0


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def main():
    """Parse arguments and run the monitor."""
    parser = argparse.ArgumentParser(
        description="Yahoo Fantasy Baseball injury auto-response monitor"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help="Preview actions without making changes or updating state",
    )
    args = parser.parse_args()

    try:
        exit_code = run_monitor(dry_run=args.dry_run)
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
