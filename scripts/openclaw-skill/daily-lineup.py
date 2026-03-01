#!/usr/bin/env python3
"""Daily lineup optimization automation.

Checks the lineup optimizer API, then applies, suggests, or alerts
based on the configured autonomy level for the 'daily_lineup' action.

Usage:
    python3 scripts/openclaw-skill/daily-lineup.py
    python3 scripts/openclaw-skill/daily-lineup.py --dry-run
"""

import sys

# Local imports (same package)
sys.path.insert(0, __import__("os").path.dirname(__file__))
from api_client import api_get, api_post
from config import AutomationConfig
from formatter import format_lineup_summary


ACTION_NAME = "daily_lineup"


def _build_moves(swaps):
    """Convert suggested_swaps list into POST /api/set-lineup moves array."""
    moves = []
    try:
        for swap in swaps:
            player_id = swap.get("start_player_id") or swap.get("player_id", "")
            position = swap.get("position", "")
            if player_id and position:
                moves.append({"player_id": str(player_id), "position": str(position)})
    except Exception as e:
        print("Error building moves: " + str(e))
    return moves


def run(dry_run=False):
    """Main routine: check config, call API, format output."""
    # Load config
    try:
        config = AutomationConfig()
    except Exception as e:
        print("LINEUP ERROR: Failed to load config: " + str(e))
        return 1

    # Check autonomy level
    autonomy = config.get_autonomy(ACTION_NAME)
    if autonomy == "off":
        print("daily_lineup action is disabled (autonomy=off)")
        return 0

    api_url = config.get_api_url()

    # Step 1: Get lineup optimization data
    optimize_data = api_get(api_url, "/api/lineup-optimize")

    if optimize_data.get("error"):
        msg = format_lineup_summary(optimize_data)
        print(msg)
        return 1

    swaps = optimize_data.get("suggested_swaps", [])
    needs_changes = len(swaps) > 0

    # Step 2: Handle based on autonomy level
    if autonomy == "auto" and needs_changes and not dry_run:
        # Build moves from swaps and apply
        moves = _build_moves(swaps)
        if moves:
            set_result = api_post(api_url, "/api/set-lineup", {"moves": moves})
            if set_result.get("error"):
                # Show the error but still display optimization data
                print("Failed to apply lineup: " + str(set_result.get("error")))
                optimize_data["applied"] = False
            else:
                optimize_data["applied"] = True
        else:
            print("No valid moves to apply")
            optimize_data["applied"] = False

        msg = format_lineup_summary(optimize_data)
        print(msg)

    elif autonomy == "auto" and needs_changes and dry_run:
        # Dry run: show what would be applied
        optimize_data["applied"] = False
        msg = format_lineup_summary(optimize_data)
        print("[DRY RUN] Would apply lineup changes:")
        print(msg)

    elif autonomy == "suggest":
        # Show recommendations without applying
        optimize_data["applied"] = False
        msg = format_lineup_summary(optimize_data)
        print(msg)

    elif autonomy == "alert":
        # Brief notification only
        if needs_changes:
            off_day = optimize_data.get("active_off_day", [])
            bench_playing = optimize_data.get("bench_playing", [])
            parts = []
            if off_day:
                parts.append(str(len(off_day)) + " off-day starter(s)")
            if bench_playing:
                parts.append(str(len(bench_playing)) + " bench player(s) with games")
            if swaps:
                parts.append(str(len(swaps)) + " swap(s) available")
            detail = ", ".join(parts) if parts else "changes available"
            print("LINEUP ALERT: Your lineup needs attention " + chr(0x2014) + " " + detail)
        else:
            print("LINEUP: All starters have games today " + chr(0x2714) + " No changes needed")

    else:
        # autonomy == "auto" but no changes needed
        optimize_data["applied"] = False
        msg = format_lineup_summary(optimize_data)
        print(msg)

    return 0


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    try:
        exit_code = run(dry_run=dry_run)
    except Exception as e:
        print("LINEUP ERROR: " + str(e))
        exit_code = 1
    sys.exit(exit_code)
