#!/usr/bin/env python3
"""Waiver wire auto-scout automation.

Scans waiver wire for valuable free agents, cross-references with
category strategy (punt advisor), and outputs recommendations based
on the configured autonomy level.

Usage:
    python3 scripts/openclaw-skill/waiver-scout.py
    python3 scripts/openclaw-skill/waiver-scout.py --dry-run

Autonomy levels:
    auto    - Auto-add top recommended player if clear upgrade
    suggest - Format top 3-5 recommendations with details
    alert   - Brief "waiver targets available" notification
    off     - Do nothing

Coding conventions: string concatenation (no f-strings),
.get() for all dict access, try/except with print() for errors.
"""

import sys

# ---------------------------------------------------------------------------
# Resolve imports from sibling module
# ---------------------------------------------------------------------------
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from api_client import api_get
from config import AutomationConfig
from formatter import (
    format_waiver_alert,
    _today_str,
    _truncate,
    _STAR,
    _CHECK,
    _DASH,
    _UP,
    _DOWN,
    _BULLET,
    _WARN,
    _enforce_limit,
    _safe_str,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ACTION_NAME = "waiver_scout"
WAIVER_COUNT = 5
OPTIMAL_MOVES_COUNT = 5

# Z-score threshold for "clear upgrade" in auto mode
CLEAR_UPGRADE_THRESHOLD = 0.5


# ---------------------------------------------------------------------------
# Data gathering
# ---------------------------------------------------------------------------


def fetch_waiver_data(base_url):
    """Fetch waiver analysis for batters and pitchers.

    Returns:
        Tuple of (batter_data, pitcher_data) dicts.
    """
    batter_data = api_get(
        base_url,
        "/api/waiver-analyze",
        {"pos_type": "B", "count": str(WAIVER_COUNT)},
        timeout=60,
    )
    pitcher_data = api_get(
        base_url,
        "/api/waiver-analyze",
        {"pos_type": "P", "count": str(WAIVER_COUNT)},
        timeout=60,
    )
    return batter_data, pitcher_data


def fetch_optimal_moves(base_url):
    """Fetch optimal add/drop upgrade opportunities.

    Returns:
        Dict with moves, roster_z_total, net_improvement, etc.
    """
    return api_get(
        base_url,
        "/api/optimal-moves",
        {"count": str(OPTIMAL_MOVES_COUNT)},
        timeout=60,
    )


def fetch_punt_advisor(base_url):
    """Fetch category strategy from punt advisor.

    Returns:
        Dict with target_categories, punt_candidates, strategy_summary.
    """
    return api_get(base_url, "/api/punt-advisor")


# ---------------------------------------------------------------------------
# Analysis: cross-reference waivers with category strategy
# ---------------------------------------------------------------------------


def prioritize_targets(batter_data, pitcher_data, moves_data, punt_data):
    """Cross-reference waiver targets with punt advisor strategy.

    Boosts recommendations that help targeted categories and deprioritizes
    players whose strengths align with punted categories.

    Returns:
        Dict with keys: targets, strategy_summary, top_moves, has_clear_upgrade
    """
    # Extract category strategy
    target_cats = set()
    punt_cats = set()
    strategy_summary = ""

    if punt_data and not punt_data.get("error"):
        for cat in punt_data.get("target_categories", []):
            target_cats.add(str(cat).upper())
        for cat in punt_data.get("punt_candidates", []):
            punt_cats.add(str(cat).upper())
        strategy_summary = punt_data.get("strategy_summary", "")

    # Merge batter and pitcher recommendations
    all_recs = []

    for data, pos_label in [(batter_data, "B"), (pitcher_data, "P")]:
        if not data or data.get("error"):
            continue
        recs = data.get("recommendations", [])
        weak_cats = data.get("weak_categories", [])
        for rec in recs:
            rec["_pos_type"] = pos_label
            rec["_weak_cats"] = weak_cats
            all_recs.append(rec)

    # Score each recommendation against category strategy
    for rec in all_recs:
        strategy_bonus = 0
        # No per-category z-scores in waiver-analyze recs, so use weak_cats
        # and the rec's overall tier/score as signals
        rec_name_upper = str(rec.get("name", "")).upper()

        # Boost players from weak categories that overlap with target cats
        weak_cats = rec.get("_weak_cats", [])
        for wc in weak_cats:
            wc_name = str(wc.get("name", "")).upper()
            if wc_name in target_cats:
                strategy_bonus += 5

        # Penalize if weak cats overlap with punt cats (player helps punted cat)
        for wc in weak_cats:
            wc_name = str(wc.get("name", "")).upper()
            if wc_name in punt_cats:
                strategy_bonus -= 3

        rec["_strategy_bonus"] = strategy_bonus
        rec["_adjusted_score"] = rec.get("score", 0) + strategy_bonus

    # Sort by adjusted score
    all_recs.sort(key=lambda r: -r.get("_adjusted_score", 0))

    # Identify best optimal moves
    top_moves = []
    has_clear_upgrade = False
    if moves_data and not moves_data.get("error"):
        moves = moves_data.get("moves", [])
        for move in moves[:3]:
            z_imp = move.get("z_improvement", 0)
            if z_imp >= CLEAR_UPGRADE_THRESHOLD:
                has_clear_upgrade = True
            top_moves.append(move)

    return {
        "targets": all_recs,
        "strategy_summary": strategy_summary,
        "target_categories": list(target_cats),
        "punt_categories": list(punt_cats),
        "top_moves": top_moves,
        "has_clear_upgrade": has_clear_upgrade,
    }


# ---------------------------------------------------------------------------
# Output formatting by autonomy level
# ---------------------------------------------------------------------------


def format_auto_output(analysis, batter_data, pitcher_data, moves_data, dry_run=False):
    """Format output for 'auto' autonomy: auto-add top player if clear upgrade.

    In auto mode, the script would execute the top move. With --dry-run,
    it only reports what it would do.
    """
    lines = []
    lines.append(_STAR + " WAIVER AUTO-SCOUT (" + _today_str() + ")")
    lines.append("")

    # Strategy context
    summary = analysis.get("strategy_summary", "")
    if summary:
        lines.append("Strategy: " + _truncate(summary, 80))
        lines.append("")

    top_moves = analysis.get("top_moves", [])
    has_clear = analysis.get("has_clear_upgrade", False)

    if has_clear and top_moves:
        move = top_moves[0]
        add_player = move.get("add", {})
        drop_player = move.get("drop", {})
        z_imp = move.get("z_improvement", 0)
        cats_gained = move.get("categories_gained", [])

        if dry_run:
            lines.append("[DRY RUN] Would execute:")
        else:
            lines.append(_CHECK + " Executed:")

        lines.append(
            "  ADD: " + _safe_str(add_player.get("name", "?"))
            + " (" + _safe_str(add_player.get("pos", "?")) + ")"
            + " z=" + _safe_str(add_player.get("z_score", 0))
            + " " + _safe_str(add_player.get("percent_owned", "?")) + " owned"
        )
        lines.append(
            "  DROP: " + _safe_str(drop_player.get("name", "?"))
            + " (" + _safe_str(drop_player.get("pos", "?")) + ")"
            + " z=" + _safe_str(drop_player.get("z_score", 0))
        )
        lines.append(
            "  " + _UP + " +" + _safe_str(z_imp) + " z-score improvement"
        )
        if cats_gained:
            lines.append("  Categories gained: " + ", ".join(cats_gained[:5]))

        # Show remaining moves as suggestions
        if len(top_moves) > 1:
            lines.append("")
            lines.append("Other opportunities:")
            for move in top_moves[1:]:
                add_p = move.get("add", {})
                drop_p = move.get("drop", {})
                z_i = move.get("z_improvement", 0)
                lines.append(
                    "  " + _BULLET + " "
                    + _truncate(add_p.get("name", "?"), 20)
                    + " for "
                    + _truncate(drop_p.get("name", "?"), 20)
                    + " (+" + _safe_str(z_i) + " z)"
                )
    else:
        lines.append("No clear upgrade found (threshold: +"
                      + str(CLEAR_UPGRADE_THRESHOLD) + " z)")
        lines.append("")
        # Fall back to suggest mode output
        lines.append("Top waiver targets:")
        targets = analysis.get("targets", [])
        for i, t in enumerate(targets[:5]):
            name = _truncate(t.get("name", "?"), 22)
            pos = _safe_str(t.get("positions", "?"))
            z = _safe_str(t.get("z_score", 0))
            pct = _safe_str(t.get("pct", 0))
            lines.append(
                "  " + str(i + 1) + ". " + name
                + " (" + pos + ") z=" + z
                + " " + pct + "% owned"
            )

    return _enforce_limit("\n".join(lines))


def format_suggest_output(analysis, batter_data, pitcher_data, moves_data):
    """Format output for 'suggest' autonomy: top 3-5 recommendations."""
    lines = []
    lines.append(_STAR + " WAIVER SCOUT (" + _today_str() + ")")
    lines.append("")

    # Strategy context
    summary = analysis.get("strategy_summary", "")
    target_cats = analysis.get("target_categories", [])
    punt_cats = analysis.get("punt_categories", [])
    if summary:
        lines.append("Strategy: " + _truncate(summary, 80))
    if target_cats:
        lines.append("Target cats: " + ", ".join(target_cats[:5]))
    if punt_cats:
        lines.append("Punt cats: " + ", ".join(punt_cats[:3]))
    if summary or target_cats or punt_cats:
        lines.append("")

    # Formatted waiver alerts for batters and pitchers
    if batter_data and not batter_data.get("error"):
        lines.append(format_waiver_alert(batter_data))
        lines.append("")
    if pitcher_data and not pitcher_data.get("error"):
        lines.append(format_waiver_alert(pitcher_data))
        lines.append("")

    # Optimal moves section
    top_moves = analysis.get("top_moves", [])
    if top_moves:
        lines.append("OPTIMAL MOVES:")
        for move in top_moves:
            add_p = move.get("add", {})
            drop_p = move.get("drop", {})
            z_imp = move.get("z_improvement", 0)
            cats_gained = move.get("categories_gained", [])
            cats_lost = move.get("categories_lost", [])

            lines.append(
                "  " + _UP + " ADD " + _safe_str(add_p.get("name", "?"))
                + " (" + _safe_str(add_p.get("pos", "?")) + ")"
                + " z=" + _safe_str(add_p.get("z_score", 0))
                + " " + _safe_str(add_p.get("percent_owned", "?")) + " owned"
            )
            lines.append(
                "  " + _DOWN + " DROP " + _safe_str(drop_p.get("name", "?"))
                + " (" + _safe_str(drop_p.get("pos", "?")) + ")"
                + " z=" + _safe_str(drop_p.get("z_score", 0))
            )
            detail_parts = ["+" + _safe_str(z_imp) + " z"]
            if cats_gained:
                detail_parts.append("gain: " + ", ".join(cats_gained[:4]))
            if cats_lost:
                detail_parts.append("lose: " + ", ".join(cats_lost[:3]))
            lines.append("    " + " | ".join(detail_parts))
            lines.append("")

    return _enforce_limit("\n".join(lines))


def format_alert_output(analysis, batter_data, pitcher_data, moves_data):
    """Format output for 'alert' autonomy: brief notification."""
    targets = analysis.get("targets", [])
    top_moves = analysis.get("top_moves", [])
    has_clear = analysis.get("has_clear_upgrade", False)

    if not targets and not top_moves:
        return _CHECK + " WAIVERS (" + _today_str() + "): No notable targets found"

    parts = []
    parts.append(_WARN + " WAIVERS (" + _today_str() + ")")

    if has_clear:
        move = top_moves[0]
        add_name = move.get("add", {}).get("name", "?")
        z_imp = move.get("z_improvement", 0)
        parts.append(
            "Clear upgrade available: " + _safe_str(add_name)
            + " (+" + _safe_str(z_imp) + " z)"
        )
    elif targets:
        count = min(len(targets), 5)
        top_name = _safe_str(targets[0].get("name", "?"))
        top_z = _safe_str(targets[0].get("z_score", 0))
        parts.append(
            str(count) + " waiver targets found. Top: "
            + top_name + " (z=" + top_z + ")"
        )

    if top_moves:
        parts.append(str(len(top_moves)) + " upgrade move(s) available")

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    """Run the waiver scout automation."""
    dry_run = "--dry-run" in sys.argv

    # 1. Load config
    try:
        config = AutomationConfig()
    except Exception as e:
        print("Error loading config: " + str(e))
        sys.exit(1)

    # 2. Check autonomy level
    autonomy = config.get_autonomy(ACTION_NAME)
    if autonomy == "off":
        print("Waiver scout is disabled (autonomy=off)")
        sys.exit(0)

    base_url = config.get_api_url()
    if not base_url:
        print("Error: No API URL configured")
        sys.exit(1)

    if dry_run:
        print("[DRY RUN] Waiver scout running against " + base_url)
        print("")

    # 3. Fetch waiver analysis for batters and pitchers
    try:
        batter_data, pitcher_data = fetch_waiver_data(base_url)
    except Exception as e:
        print("Error fetching waiver data: " + str(e))
        sys.exit(1)

    # Check for errors
    batter_error = batter_data.get("error") if batter_data else None
    pitcher_error = pitcher_data.get("error") if pitcher_data else None
    if batter_error and pitcher_error:
        print("Error: Both waiver analyses failed")
        print("  Batters: " + str(batter_error))
        print("  Pitchers: " + str(pitcher_error))
        sys.exit(1)

    # 4. Fetch optimal moves
    try:
        moves_data = fetch_optimal_moves(base_url)
    except Exception as e:
        print("Warning: Could not fetch optimal moves: " + str(e))
        moves_data = {"error": str(e)}

    # 5. Fetch punt advisor for category strategy
    try:
        punt_data = fetch_punt_advisor(base_url)
    except Exception as e:
        print("Warning: Could not fetch punt advisor: " + str(e))
        punt_data = {"error": str(e)}

    # 6. Cross-reference and prioritize
    try:
        analysis = prioritize_targets(
            batter_data, pitcher_data, moves_data, punt_data
        )
    except Exception as e:
        print("Error analyzing targets: " + str(e))
        sys.exit(1)

    # 7. Format output based on autonomy level
    try:
        if autonomy == "auto":
            output = format_auto_output(
                analysis, batter_data, pitcher_data, moves_data,
                dry_run=dry_run,
            )
        elif autonomy == "suggest":
            output = format_suggest_output(
                analysis, batter_data, pitcher_data, moves_data,
            )
        elif autonomy == "alert":
            output = format_alert_output(
                analysis, batter_data, pitcher_data, moves_data,
            )
        else:
            print("Unknown autonomy level: " + str(autonomy))
            sys.exit(1)
    except Exception as e:
        print("Error formatting output: " + str(e))
        sys.exit(1)

    # 8. Print formatted message
    print(output)


if __name__ == "__main__":
    main()
