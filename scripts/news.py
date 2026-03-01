#!/usr/bin/env python3
"""Fantasy Baseball News Feed - RotoWire RSS Integration

Parses RotoWire MLB RSS feed for player news, injuries, and updates.
Supports player name matching to link news to roster players.

Data source:
- RotoWire MLB RSS (https://www.rotowire.com/rss/news.htm?sport=MLB)
"""

import sys
import os
import time
import json
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from shared import USER_AGENT, cache_get, cache_set, normalize_player_name

# RSS URL
ROTOWIRE_RSS_URL = "https://www.rotowire.com/rss/news.htm?sport=MLB"

# Cache
_cache = {}
TTL_NEWS = 900  # 15 minutes

# Injury keywords to detect in titles and descriptions
INJURY_KEYWORDS = [
    "injury", "injured", "il", "disabled list", "day-to-day", "dtd",
    "out for", "miss", "surgery", "rehab", "strain", "sprain", "fracture",
    "torn", "inflammation", "concussion", "oblique", "hamstring", "shoulder",
    "elbow", "knee", "ankle", "back", "wrist", "tommy john", "ucl",
    "setback", "shut down", "shelved", "sidelined",
]


def _cache_get(key, ttl_seconds):
    """Get cached value if not expired"""
    return cache_get(_cache, key, ttl_seconds)


def _cache_set(key, data):
    """Store value in cache with current timestamp"""
    cache_set(_cache, key, data)


def _normalize_name(name):
    """Normalize player name for matching across sources"""
    return normalize_player_name(name)


def _names_match(name_a, name_b):
    """Check if two player names match (fuzzy)"""
    norm_a = _normalize_name(name_a)
    norm_b = _normalize_name(name_b)
    if not norm_a or not norm_b:
        return False
    # Exact match
    if norm_a == norm_b:
        return True
    # One name contains the other (handles partial matches)
    if norm_a in norm_b or norm_b in norm_a:
        return True
    # Last name + first initial match
    parts_a = norm_a.split()
    parts_b = norm_b.split()
    if len(parts_a) >= 2 and len(parts_b) >= 2:
        # Same last name and first initial
        if parts_a[-1] == parts_b[-1] and parts_a[0][0] == parts_b[0][0]:
            return True
    return False


# ============================================================
# 3. RSS Feed Parsing
# ============================================================

def _extract_player_name(title):
    """Try to extract player name from RSS title.

    RotoWire titles typically follow the format:
    "Player Name - Some headline about the player"
    or "Player Name: headline"
    """
    if not title:
        return ""
    # Try dash separator (most common RotoWire format)
    if " - " in title:
        candidate = title.split(" - ", 1)[0].strip()
        # Validate: player names are typically 2-4 words, no numbers
        words = candidate.split()
        if 1 <= len(words) <= 4 and not any(c.isdigit() for c in candidate):
            return candidate
    # Try colon separator
    if ": " in title:
        candidate = title.split(": ", 1)[0].strip()
        words = candidate.split()
        if 1 <= len(words) <= 4 and not any(c.isdigit() for c in candidate):
            return candidate
    return ""


def _detect_injury(title, description):
    """Check if the news item is injury-related"""
    text = ((title or "") + " " + (description or "")).lower()
    for keyword in INJURY_KEYWORDS:
        if keyword in text:
            return True
    return False


def _parse_pub_date(date_str):
    """Parse RSS pubDate string to ISO format timestamp"""
    if not date_str:
        return ""
    # RFC 822 format: "Mon, 01 Jan 2026 12:00:00 GMT"
    formats = [
        "%a, %d %b %Y %H:%M:%S %Z",
        "%a, %d %b %Y %H:%M:%S %z",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%SZ",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(date_str.strip(), fmt)
            return dt.strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue
    # Fallback: return the raw string
    return date_str.strip()


def fetch_news():
    """Fetch and parse RotoWire RSS feed. Returns list of news entries."""
    cached = _cache_get("rss_feed", TTL_NEWS)
    if cached is not None:
        return cached

    try:
        req = urllib.request.Request(
            ROTOWIRE_RSS_URL,
            headers={"User-Agent": USER_AGENT}
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            raw_xml = response.read().decode("utf-8")
    except Exception as e:
        print("Error fetching RotoWire RSS: " + str(e))
        return []

    try:
        root = ET.fromstring(raw_xml)
    except ET.ParseError as e:
        print("Error parsing RSS XML: " + str(e))
        return []

    entries = []
    # RSS 2.0 structure: rss > channel > item
    channel = root.find("channel")
    if channel is None:
        # Try items directly under root
        items = root.findall(".//item")
    else:
        items = channel.findall("item")

    for item in items:
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        description = (item.findtext("description") or "").strip()
        pub_date = (item.findtext("pubDate") or "").strip()

        player = _extract_player_name(title)
        # Build headline: everything after the player name separator
        headline = title
        if player and " - " in title:
            headline = title.split(" - ", 1)[1].strip()
        elif player and ": " in title:
            headline = title.split(": ", 1)[1].strip()

        entry = {
            "player": player,
            "headline": headline,
            "summary": description,
            "timestamp": _parse_pub_date(pub_date),
            "injury_flag": _detect_injury(title, description),
            "link": link,
            "raw_title": title,
        }
        entries.append(entry)

    _cache_set("rss_feed", entries)
    return entries


# ============================================================
# 4. Player News Filtering
# ============================================================

def get_player_news(player_name, limit=5):
    """Get news for a specific player by name matching."""
    all_news = fetch_news()
    if not all_news:
        return []

    matches = []
    for entry in all_news:
        entry_player = entry.get("player", "")
        if not entry_player:
            continue
        if _names_match(player_name, entry_player):
            matches.append(entry)

    return matches[:limit]


# ============================================================
# 5. CLI Commands
# ============================================================

def cmd_news(args, as_json=False):
    """Show recent fantasy baseball news"""
    limit = 20
    if args:
        try:
            limit = int(args[0])
        except ValueError:
            limit = 20

    entries = fetch_news()
    if not entries:
        if as_json:
            return {"news": [], "note": "No news fetched from RotoWire"}
        print("No news fetched from RotoWire RSS feed")
        return

    entries = entries[:limit]

    if as_json:
        return {"news": entries, "count": len(entries)}

    print("RotoWire MLB News")
    print("=" * 70)
    for entry in entries:
        player = entry.get("player", "")
        headline = entry.get("headline", "")
        timestamp = entry.get("timestamp", "")
        injury = entry.get("injury_flag", False)

        injury_tag = " [INJURY]" if injury else ""
        if player:
            print("")
            print("  " + player + injury_tag)
            print("  " + headline)
        else:
            print("")
            print("  " + entry.get("raw_title", "") + injury_tag)

        if timestamp:
            print("  " + timestamp)

        summary = entry.get("summary", "")
        if summary:
            # Truncate long summaries for terminal display
            if len(summary) > 200:
                summary = summary[:197] + "..."
            print("  " + summary)


def cmd_news_player(args, as_json=False):
    """Show news for a specific player"""
    if not args:
        if as_json:
            return {"error": "Player name required"}
        print("Usage: news.py news-player <player_name>")
        return

    player_name = " ".join(args)
    limit = 5

    matches = get_player_news(player_name, limit=limit)
    if not matches:
        if as_json:
            return {"news": [], "player": player_name, "note": "No news found for " + player_name}
        print("No news found for: " + player_name)
        return

    if as_json:
        return {"news": matches, "player": player_name, "count": len(matches)}

    print("News for: " + player_name)
    print("=" * 70)
    for entry in matches:
        headline = entry.get("headline", "")
        timestamp = entry.get("timestamp", "")
        injury = entry.get("injury_flag", False)

        injury_tag = " [INJURY]" if injury else ""
        print("")
        print("  " + headline + injury_tag)
        if timestamp:
            print("  " + timestamp)
        summary = entry.get("summary", "")
        if summary:
            if len(summary) > 200:
                summary = summary[:197] + "..."
            print("  " + summary)


# ============================================================
# 6. Command Dispatch
# ============================================================

COMMANDS = {
    "news": cmd_news,
    "news-player": cmd_news_player,
}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Fantasy Baseball News Feed - RotoWire RSS")
        print("Usage: news.py <command> [args]")
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
