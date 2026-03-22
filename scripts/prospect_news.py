#!/usr/bin/env python3
"""BaseClaw Prospect News Intelligence Layer

Ingests prospect-specific news from multiple sources, extracts call-up signals,
scores sentiment, and computes a news-adjusted call-up probability modifier
that blends with the existing stat-based probability engine.

Pipeline: Collect -> Deduplicate -> Extract Player -> Classify Signal -> Score -> Decay -> Blend

Data sources (via news.py's 16-source aggregator + MLB Stats API):
- news.get_player_news(): ESPN, FanGraphs, CBS, Yahoo, MLB.com, RotoWire,
  Pitcher List, Razzball, Google News, Reddit, Bluesky analyst feeds
- MLB Stats API /transactions endpoint (official roster moves, Tier 1)
"""

import sys
import os
import hashlib
import json
import math
import re
import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from shared import DATA_DIR, mlb_fetch, normalize_player_name
from shared import cache_get, cache_set

# ============================================================
# CONFIGURATION
# ============================================================

# Cache settings
NEWS_CACHE_TTL = 900          # 15 minutes for transaction cache
SIGNAL_RETENTION_DAYS = 30    # Keep signals for 30 days
MAX_NEWS_DELTA_PP = 30.0      # Cap total news delta at +/-30 percentage points

DB_PATH = os.path.join(DATA_DIR, "season.db")

# In-memory cache
_cache = {}


# ============================================================
# SIGNAL CLASSIFICATION LEXICON
# ============================================================

# Bullish Critical: +0.8 to +1.0 -- near-certain call-up indicators
BULLISH_CRITICAL = [
    (re.compile(r"(?:has been |was |got |gets )called up|call[- ]up confirmed", re.I), "confirmed", 1.0, "Confirmed call-up"),
    (re.compile(r"contract (selected|purchased)", re.I), "confirmed", 1.0, "Contract selected/purchased"),
    (re.compile(r"will (make|get) his (MLB|major league|big league) debut", re.I), "confirmed", 0.95, "Debut announced"),
    (re.compile(r"(recalled|promoted) from (AAA|Triple-?A|minors)", re.I), "confirmed", 0.95, "Recalled from minors"),
    (re.compile(r"added to (the )?(25|26|28)[- ]man (roster|active)", re.I), "confirmed", 0.95, "Added to active roster"),
    (re.compile(r"scratched from (his )?minor league start", re.I), "imminent", 0.85, "Scratched from MiLB start"),
]

# Bullish High: +0.5 to +0.7 -- strong indicators
BULLISH_HIGH = [
    (re.compile(r"expected to (be called up|join|make)", re.I), "imminent", 0.70, "Expected call-up"),
    (re.compile(r"set to (be called up|join|make his debut)", re.I), "imminent", 0.70, "Set to be called up"),
    (re.compile(r"(when|matter of when),? not if", re.I), "imminent", 0.65, "'When not if' language"),
    (re.compile(r"will be (called up|promoted|recalled)", re.I), "imminent", 0.70, "Will be called up"),
    (re.compile(r"out of options|no more options|must keep", re.I), "likely", 0.60, "Out of minor league options"),
    (re.compile(r"strong consideration|seriously considering", re.I), "likely", 0.55, "Strong consideration for promotion"),
    (re.compile(r"next (man|one) up", re.I), "likely", 0.55, "Next man up"),
    (re.compile(r"fast[- ]track", re.I), "likely", 0.50, "Fast-tracked to majors"),
    (re.compile(r"MLB[- ]ready", re.I), "likely", 0.50, "Described as MLB-ready"),
    (re.compile(r"added to (the )?40[- ]man", re.I), "likely", 0.50, "Added to 40-man roster"),
    (re.compile(r"likely.{0,15}(opening day|start|roster)", re.I), "likely", 0.55, "Likely for Opening Day roster"),
]

# Bullish Moderate: +0.2 to +0.4 -- moderate indicators
BULLISH_MODERATE = [
    (re.compile(r"impressive (spring|camp|performance|showing)", re.I), "speculation", 0.35, "Impressive spring/camp"),
    (re.compile(r"nothing left to prove", re.I), "speculation", 0.35, "Nothing left to prove"),
    (re.compile(r"dominating (AAA|Triple-?A|the minors)", re.I), "speculation", 0.35, "Dominating at level"),
    (re.compile(r"on the (doorstep|cusp|verge)", re.I), "speculation", 0.30, "On the doorstep"),
    (re.compile(r"making a (strong )?case", re.I), "speculation", 0.25, "Making a case"),
    (re.compile(r"knocking on the door", re.I), "speculation", 0.30, "Knocking on the door"),
    (re.compile(r"could (get|earn|force) (the |a )?(call|promotion|call-up)", re.I), "speculation", 0.25, "Could earn call-up"),
    (re.compile(r"top prospect .{0,30}(turning heads|impressing)", re.I), "speculation", 0.20, "Prospect impressing"),
]

# Bearish Strong: -0.6 to -1.0 -- strong negative indicators
BEARISH_STRONG = [
    (re.compile(r"optioned (to|back)", re.I), "negative", -0.80, "Optioned to minors"),
    (re.compile(r"sent (down|back) to (AAA|Triple-?A|minors|minor league)", re.I), "negative", -0.80, "Sent down"),
    (re.compile(r"returned to minor league camp", re.I), "negative", -0.70, "Returned to MiLB camp"),
    (re.compile(r"(?:re)?assigned to .{0,30}minor league", re.I), "negative", -0.65, "Assigned to minors"),
    (re.compile(r"(DFA|designated for assignment)", re.I), "negative", -0.90, "DFA'd"),
    (re.compile(r"(?:has been |was |is |being )shut down|shutdown .{0,15}(?:for|with|due)", re.I), "negative", -0.85, "Shut down (injury)"),
    (re.compile(r"tommy john|UCL (tear|surgery|reconstruction)", re.I), "negative", -1.0, "Tommy John surgery"),
    (re.compile(r"(ACL|MCL) (tear|surgery)", re.I), "negative", -0.95, "Major knee injury"),
    (re.compile(r"out (for|the) (the )?(season|year)", re.I), "negative", -1.0, "Out for season"),
    (re.compile(r"placed on (the )?(60|IL\b|injured list)", re.I), "negative", -0.60, "Placed on IL"),
    (re.compile(r"open(?:s|ing)? .{0,15}(?:on|the) (?:IL|injured list)", re.I), "negative", -0.55, "Opening on IL"),
    (re.compile(r"(shoulder|elbow|knee) .{0,20}(impingement|inflammation|surgery|injury)", re.I), "negative", -0.50, "Significant injury"),
]

# Bearish Moderate: -0.2 to -0.5 -- moderate negative indicators
BEARISH_MODERATE = [
    (re.compile(r"needs more (time|seasoning|development|reps)", re.I), "negative", -0.35, "Needs more seasoning"),
    (re.compile(r"not (quite )?ready", re.I), "negative", -0.40, "Not ready"),
    (re.compile(r"blocked (at|by)", re.I), "negative", -0.30, "Blocked at position"),
    (re.compile(r"inconsistent .{0,20}(performance|numbers|results|bat|command|control|mechanics)", re.I), "negative", -0.20, "Inconsistent performance"),
    (re.compile(r"mechanical (issues|problems|concerns)", re.I), "negative", -0.30, "Mechanical issues"),
    (re.compile(r"work in progress", re.I), "negative", -0.25, "Work in progress"),
    (re.compile(r"(bright|long) .{0,15}(future|career) ahead", re.I), "negative", -0.20, "Consolation language (bearish)"),
    (re.compile(r"(?:will |to )(start|open|begin) .{0,15}(?:season|year|202\d) .{0,10}(?:at|in|with) .{0,5}(?:AAA|Triple-?A|AA)", re.I), "negative", -0.25, "Starting season in minors"),
]

# Incumbent injury patterns -- BULLISH for prospect at that position
INCUMBENT_INJURY_PATTERNS = [
    (re.compile(r"placed on .{0,10}(10|15|60)[- ]day (IL|injured list)", re.I), "incumbent_injury", 0.60),
    (re.compile(r"(headed|going|moved) to (the )?(IL|injured list|DL)", re.I), "incumbent_injury", 0.55),
    (re.compile(r"(out|miss) .{0,20}(weeks?|months?|extended)", re.I), "incumbent_injury", 0.50),
]


# ============================================================
# SIGNAL HALF-LIVES (hours) -- controls time decay
# ============================================================

SIGNAL_HALF_LIVES = {
    "confirmed": 6,           # Already happened
    "imminent": 72,           # 3-day half-life
    "likely": 168,            # 7-day half-life
    "speculation": 336,       # 14-day half-life
    "incumbent_injury": 48,   # 2-day half-life
    "negative": 240,          # 10-day half-life
    "neutral": 168,           # 7-day half-life
}


# ============================================================
# NEWS INGESTION
# ============================================================

# Source tier mapping for news.py sources
_NEWS_PY_TIERS = {
    "RotoWire MLB": 3, "ESPN MLB": 4, "FanGraphs": 3,
    "CBS Sports MLB": 4, "Yahoo MLB": 4, "MLB.com": 2,
    "Pitcher List": 3, "Razzball": 3, "Google News MLB": 4,
    "Reddit r/fantasybaseball": 5, "RotoBaller": 4,
    "MLB Trade Rumors": 2,
}


def _fetch_news_py_articles(prospect_name):
    """Fetch player-specific articles from news.py's 16-source aggregator.

    Converts news.py entry format to prospect_news article format.
    """
    try:
        import news as news_mod
        entries = news_mod.get_player_news(prospect_name, limit=15)
        articles = []
        for e in entries:
            source_name = e.get("source", "")
            title = e.get("raw_title", e.get("headline", ""))
            body = e.get("summary", "")
            link = e.get("link", "")
            articles.append({
                "title": title,
                "body": body[:500],
                "url": link,
                "url_hash": hashlib.md5(
                    (link or title).encode()).hexdigest(),
                "source_id": "news_py",
                "source_name": source_name,
                "source_tier": _NEWS_PY_TIERS.get(source_name, 4),
                "published_at": e.get("timestamp", ""),
                "fetched_at": datetime.utcnow().isoformat(),
            })
        return articles
    except Exception as e:
        print("[prospect_news] Error fetching from news.py: " + str(e))
        return []


def fetch_mlb_transactions_news(days=7):
    """Fetch transactions from MLB Stats API and format as news items.

    Most reliable source -- official, structured data (Tier 1).
    """
    cache_key = "mlb_txn_news_" + str(days)
    cached = cache_get(_cache, cache_key, NEWS_CACHE_TTL)
    if cached is not None:
        return cached

    end_date = datetime.now().strftime("%m/%d/%Y")
    start_date = (datetime.now() - timedelta(days=days)).strftime("%m/%d/%Y")

    try:
        endpoint = ("/transactions?startDate=" + start_date
                    + "&endDate=" + end_date)
        data = mlb_fetch(endpoint)
        if not data:
            return []

        articles = []

        for txn in data.get("transactions", []):
            desc = txn.get("description", "")
            # MLB API uses "person" not "player"
            player = txn.get("person", txn.get("player", {}))
            team = txn.get("toTeam", txn.get("fromTeam", txn.get("team", {})))

            if not desc or not player.get("fullName"):
                continue

            team_name = team.get("name", "Team") if team else "Team"
            articles.append({
                "title": team_name + ": " + desc,
                "body": desc,
                "url": "https://statsapi.mlb.com/transactions/"
                       + str(txn.get("id", "")),
                "url_hash": hashlib.md5(desc.encode()).hexdigest(),
                "source_id": "mlb_stats_api",
                "source_name": "MLB Official",
                "source_tier": 1,
                "published_at": txn.get("date",
                                        datetime.utcnow().isoformat()),
                "fetched_at": datetime.utcnow().isoformat(),
                "player_name": player.get("fullName", ""),
                "player_id": player.get("id"),
                "team_name": team_name,
            })

        cache_set(_cache, cache_key, articles)
        return articles

    except Exception as e:
        print("[prospect_news] Error fetching MLB transactions: " + str(e))
        return []


# ============================================================
# PLAYER NAME EXTRACTION
# ============================================================

def extract_player_names(text, prospect_db):
    """Extract prospect names mentioned in article text.

    Uses the prospect rankings database as a gazetteer --
    checks if any known prospect name appears in the text.
    """
    text_norm = normalize_player_name(text)
    matches = []
    seen_ids = set()

    for prospect in prospect_db:
        name = prospect.get("name", "")
        if not name:
            continue

        # Check full name (normalized for accent-safe matching)
        if normalize_player_name(name) in text_norm:
            mid = prospect.get("mlb_id")
            if mid not in seen_ids:
                matches.append({
                    "name": name,
                    "mlb_id": mid,
                    "position": prospect.get("position", ""),
                    "fv_grade": prospect.get("fv_grade", 0),
                    "organization": prospect.get("organization", ""),
                })
                seen_ids.add(mid)
            continue

        # Check last name only (6+ chars to avoid false positives)
        parts = name.split()
        if len(parts) >= 2:
            last_name = parts[-1]
            if len(last_name) >= 6 and normalize_player_name(last_name) in text_norm:
                mid = prospect.get("mlb_id")
                if mid not in seen_ids:
                    matches.append({
                        "name": name,
                        "mlb_id": mid,
                        "position": prospect.get("position", ""),
                        "fv_grade": prospect.get("fv_grade", 0),
                        "organization": prospect.get("organization", ""),
                    })
                    seen_ids.add(mid)

    return matches


# ============================================================
# SIGNAL CLASSIFICATION ENGINE
# ============================================================

def classify_article_signals(article):
    """Run an article through the keyword lexicon to extract call-up signals.

    Returns a list of signals, one per matched pattern, with:
    - signal_type: confirmed/imminent/likely/speculation/negative/neutral
    - base_weight: -1.0 to +1.0
    - pattern_description: what was matched

    An article can produce MULTIPLE signals.
    """
    text = (article.get("title", "") + " " + article.get("body", ""))
    signals = []

    all_patterns = (
        BULLISH_CRITICAL
        + BULLISH_HIGH
        + BULLISH_MODERATE
        + BEARISH_STRONG
        + BEARISH_MODERATE
    )

    for pattern, signal_type, base_weight, description in all_patterns:
        if pattern.search(text):
            signals.append({
                "signal_type": signal_type,
                "base_weight": base_weight,
                "description": description,
                "source_tier": article.get("source_tier", 4),
                "source_name": article.get("source_name", "Unknown"),
                "published_at": article.get("published_at", ""),
                "article_title": article.get("title", "")[:100],
                "article_url": article.get("url", ""),
            })

    # Check incumbent injury patterns -- but suppress if article already
    # has a bearish IL signal (meaning the prospect themselves is injured,
    # not an incumbent opening a path for the prospect)
    has_bearish_il = any(
        s.get("description", "") in ("Placed on IL", "Shut down (injury)",
                                     "Out for season", "Opening on IL",
                                     "Significant injury")
        for s in signals
    )
    if not has_bearish_il:
        for pattern, signal_type, base_weight in INCUMBENT_INJURY_PATTERNS:
            if pattern.search(text):
                signals.append({
                    "signal_type": signal_type,
                    "base_weight": base_weight,
                    "description": "Incumbent injury -- opens path for prospect",
                    "source_tier": article.get("source_tier", 4),
                    "source_name": article.get("source_name", "Unknown"),
                    "published_at": article.get("published_at", ""),
                    "article_title": article.get("title", "")[:100],
                    "article_url": article.get("url", ""),
                })

    # If no patterns matched, classify as neutral
    if not signals:
        signals.append({
            "signal_type": "neutral",
            "base_weight": 0.0,
            "description": "No specific call-up signal detected",
            "source_tier": article.get("source_tier", 4),
            "source_name": article.get("source_name", "Unknown"),
            "published_at": article.get("published_at", ""),
            "article_title": article.get("title", "")[:100],
            "article_url": article.get("url", ""),
        })

    return signals


def _deduplicate_signals(signals):
    """Deduplicate signals from the same event reported by multiple sources.

    When multiple articles report the same event (e.g., "Assigned to minors"),
    keep only the signal from the highest-tier (lowest number) source.
    This prevents compounding from 5 articles about the same reassignment.
    """
    # Group by description (the pattern that matched)
    by_description = {}
    for s in signals:
        desc = s.get("description", "")
        if desc not in by_description:
            by_description[desc] = []
        by_description[desc].append(s)

    deduped = []
    for desc, group in by_description.items():
        # Keep the one from the highest-tier source (lowest tier number)
        best = min(group, key=lambda s: s.get("source_tier", 4))
        deduped.append(best)

    return deduped


# ============================================================
# BAYESIAN PROBABILITY UPDATER
# ============================================================

def compute_time_decay(signal):
    """Compute the time-decay factor for a signal using exponential decay.

    Formula: decay = exp(-ln(2) / half_life * age_hours)
    Returns: float between 0.01 (fully decayed) and 1.0 (fresh)
    """
    signal_type = signal.get("signal_type", "neutral")
    half_life = SIGNAL_HALF_LIVES.get(signal_type, 168)

    published_str = signal.get("published_at", "")
    try:
        if "T" in str(published_str):
            published = datetime.fromisoformat(
                published_str.replace("Z", "").split("+")[0])
        else:
            published = datetime.strptime(
                str(published_str)[:10], "%Y-%m-%d")
    except (ValueError, TypeError):
        published = datetime.utcnow()

    age_hours = max(
        0, (datetime.utcnow() - published).total_seconds() / 3600)

    decay = math.exp((-math.log(2) / half_life) * age_hours)
    return max(0.01, decay)


def bayesian_update(prior, signals):
    """Apply Bayesian updating to modify a prior probability with news signals.

    Each signal adjusts the prior using a likelihood ratio,
    weighted by source tier and time decay. Updates are sequential.

    Returns dict with posterior, delta, signal contributions.
    """
    if not signals:
        return {
            "posterior": prior,
            "delta": 0.0,
            "signal_contributions": [],
            "num_signals": 0,
        }

    LIKELIHOOD_RATIOS = {
        "confirmed": 50.0,
        "imminent": 8.0,
        "likely": 3.0,
        "speculation": 1.5,
        "incumbent_injury": 4.0,
        "negative": 0.15,
        "neutral": 1.0,
    }

    TIER_MULTIPLIERS = {
        1: 1.0,
        2: 0.95,
        3: 0.85,
        4: 0.60,
        5: 0.30,
    }

    current_prob = max(0.01, min(0.99, prior))
    contributions = []

    for signal in signals:
        signal_type = signal.get("signal_type", "neutral")
        tier = signal.get("source_tier", 4)

        base_lr = LIKELIHOOD_RATIOS.get(signal_type, 1.0)
        tier_mult = TIER_MULTIPLIERS.get(tier, 0.5)
        adjusted_lr = 1.0 + (base_lr - 1.0) * tier_mult

        decay = compute_time_decay(signal)
        decayed_lr = 1.0 + (adjusted_lr - 1.0) * decay

        prior_odds = current_prob / (1.0 - current_prob)
        posterior_odds = prior_odds * decayed_lr
        new_prob = posterior_odds / (1.0 + posterior_odds)
        new_prob = max(0.01, min(0.99, new_prob))

        delta = new_prob - current_prob
        contributions.append({
            "signal_type": signal_type,
            "description": signal.get("description", ""),
            "source": signal.get("source_name", ""),
            "decay_factor": round(decay, 2),
            "probability_delta": round(delta * 100, 1),
        })

        current_prob = new_prob

    return {
        "posterior": round(current_prob, 4),
        "delta": round((current_prob - prior) * 100, 1),
        "signal_contributions": contributions,
        "num_signals": len(signals),
    }


# ============================================================
# ENSEMBLE SCORING -- BLEND NEWS + STATS
# ============================================================

def compute_ensemble_callup_probability(stat_based_probability,
                                        news_signals,
                                        news_weight=0.35):
    """Compute the final ensemble call-up probability.

    Blends stat-based probability with news-adjusted probability.
    Default weights: 65% stat-based, 35% news-adjusted.
    When confirmed/imminent signals exist, news weight increases to 50%.
    Total news delta is capped at +/-MAX_NEWS_DELTA_PP to prevent extreme swings.
    """
    # Deduplicate signals from same event across multiple sources
    deduped_signals = _deduplicate_signals(news_signals)

    news_update = bayesian_update(
        stat_based_probability / 100.0, deduped_signals)
    news_adjusted_prob = news_update.get("posterior", 0)

    has_strong_signal = any(
        s.get("signal_type") in ("confirmed", "imminent")
        for s in deduped_signals
    )

    if has_strong_signal:
        effective_news_weight = min(0.50, news_weight + 0.15)
    else:
        effective_news_weight = news_weight

    stat_weight = 1.0 - effective_news_weight

    ensemble_prob = (
        stat_weight * (stat_based_probability / 100.0)
        + effective_news_weight * news_adjusted_prob
    )

    ensemble_pct = round(ensemble_prob * 100, 1)

    # Cap the total delta
    raw_delta = ensemble_pct - stat_based_probability
    if abs(raw_delta) > MAX_NEWS_DELTA_PP:
        capped_delta = MAX_NEWS_DELTA_PP if raw_delta > 0 else -MAX_NEWS_DELTA_PP
        ensemble_pct = round(stat_based_probability + capped_delta, 1)

    return {
        "ensemble_probability": ensemble_pct,
        "stat_based_probability": stat_based_probability,
        "news_adjusted_probability": round(news_adjusted_prob * 100, 1),
        "news_delta": round(ensemble_pct - stat_based_probability, 1),
        "news_weight_used": round(effective_news_weight, 2),
        "signal_count": news_update.get("num_signals", 0),
        "signal_contributions": news_update.get("signal_contributions", []),
        "has_strong_signal": has_strong_signal,
    }


# ============================================================
# MAIN PIPELINE -- PROSPECT NEWS AGGREGATOR
# ============================================================

def get_prospect_news(prospect_name, prospect_db, days=7):
    """Full pipeline: fetch news -> filter -> classify signals -> score.

    Main entry point called by the MCP tool handler.
    Returns a complete news intelligence report for a single prospect.
    """
    # Fetch from news.py (16 sources) and MLB transactions in parallel
    with ThreadPoolExecutor(max_workers=2) as pool:
        news_future = pool.submit(_fetch_news_py_articles, prospect_name)
        txn_future = pool.submit(fetch_mlb_transactions_news, days)

    all_articles = []
    for future in [news_future, txn_future]:
        try:
            all_articles.extend(future.result(timeout=30))
        except Exception as e:
            print("[prospect_news] Source fetch error: " + str(e))

    # news.py already filters by player name, but transactions need filtering
    relevant_articles = []
    name_norm = normalize_player_name(prospect_name)

    for article in all_articles:
        # Articles from news.py are already player-filtered
        if article.get("source_id") == "news_py":
            relevant_articles.append(article)
            continue

        # MLB transactions: check if pre-tagged with player name
        tagged = article.get("player_name", "")
        if tagged and normalize_player_name(tagged) == name_norm:
            relevant_articles.append(article)
            continue

        # Fallback: check if name appears in text
        text = (article.get("title", "") + " "
                + article.get("body", ""))
        if name_norm in normalize_player_name(text):
            relevant_articles.append(article)

    # Classify signals from each relevant article
    all_signals = []
    article_summaries = []

    for article in relevant_articles[:15]:
        signals = classify_article_signals(article)
        all_signals.extend(signals)

        notable_signals = [
            s for s in signals if s.get("signal_type") != "neutral"
        ]

        article_summaries.append({
            "title": article.get("title", "")[:120],
            "source": article.get("source_name", ""),
            "date": article.get("published_at", "")[:10],
            "url": article.get("url", ""),
            "signals": [
                (s.get("description", "")
                 + " ("
                 + ("+" if s.get("base_weight", 0) > 0 else "")
                 + str(round(s.get("base_weight", 0), 1))
                 + ")")
                for s in notable_signals
            ],
            "sentiment": (
                "BULLISH" if any(
                    s.get("base_weight", 0) > 0.3 for s in signals
                ) else
                "BEARISH" if any(
                    s.get("base_weight", 0) < -0.3 for s in signals
                ) else
                "NEUTRAL"
            ),
        })

    # Filter to non-neutral signals for probability update
    active_signals = [
        s for s in all_signals
        if s.get("signal_type") != "neutral"
    ]

    return {
        "prospect_name": prospect_name,
        "articles_found": len(relevant_articles),
        "signals_extracted": len(active_signals),
        "article_summaries": article_summaries,
        "active_signals": active_signals,
        "overall_sentiment": _compute_overall_sentiment(active_signals),
    }


def _compute_overall_sentiment(signals):
    """Compute aggregate sentiment from all signals."""
    if not signals:
        return {"label": "NO NEWS", "emoji": "---", "score": 0.0}

    total_weight = 0.0
    weighted_sum = 0.0

    for s in signals:
        decay = compute_time_decay(s)
        weight = abs(s.get("base_weight", 0)) * decay
        total_weight += weight
        weighted_sum += s.get("base_weight", 0) * decay

    if total_weight == 0:
        avg = 0.0
    else:
        avg = weighted_sum / total_weight

    if avg >= 0.5:
        return {"label": "VERY BULLISH", "emoji": "++", "score": round(avg, 2)}
    elif avg >= 0.2:
        return {"label": "BULLISH", "emoji": "+", "score": round(avg, 2)}
    elif avg > -0.2:
        return {"label": "NEUTRAL", "emoji": "~", "score": round(avg, 2)}
    elif avg > -0.5:
        return {"label": "BEARISH", "emoji": "-", "score": round(avg, 2)}
    else:
        return {"label": "VERY BEARISH", "emoji": "--", "score": round(avg, 2)}


# ============================================================
# DATABASE OPERATIONS
# ============================================================

def _get_db():
    """Get a fresh SQLite connection (thread-safe for Flask)."""
    return sqlite3.connect(DB_PATH)


def init_news_tables():
    """Create the news-related tables in season.db if they don't exist."""
    db = _get_db()
    db.executescript("""
        CREATE TABLE IF NOT EXISTS prospect_news_articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url_hash TEXT UNIQUE,
            title TEXT,
            body TEXT,
            source_id TEXT,
            source_name TEXT,
            source_tier INTEGER,
            published_at TEXT,
            fetched_at TEXT
        );

        CREATE TABLE IF NOT EXISTS prospect_news_signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            article_id INTEGER,
            player_name TEXT,
            player_mlb_id INTEGER,
            signal_type TEXT,
            base_weight REAL,
            description TEXT,
            source_tier INTEGER,
            published_at TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (article_id) REFERENCES prospect_news_articles(id)
        );

        CREATE INDEX IF NOT EXISTS idx_signals_player
            ON prospect_news_signals(player_name);
        CREATE INDEX IF NOT EXISTS idx_signals_type
            ON prospect_news_signals(signal_type);
    """)
    db.close()


def store_signals(prospect_name, signals, articles):
    """Persist signals and articles to SQLite for historical tracking."""
    db = _get_db()

    for article in articles:
        try:
            url = article.get("url", "")
            db.execute("""
                INSERT OR IGNORE INTO prospect_news_articles
                (url_hash, title, body, source_id, source_name,
                 source_tier, published_at, fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                article.get("url_hash",
                            hashlib.md5(url.encode()).hexdigest()),
                article.get("title", "")[:200],
                article.get("body", "")[:500],
                article.get("source_id", ""),
                article.get("source_name", article.get("source", "")),
                article.get("source_tier", 4),
                article.get("published_at", article.get("date", "")),
                article.get("fetched_at", ""),
            ))
        except Exception:
            continue

    for signal in signals:
        try:
            db.execute("""
                INSERT INTO prospect_news_signals
                (player_name, signal_type, base_weight, description,
                 source_tier, published_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                prospect_name,
                signal.get("signal_type", "neutral"),
                signal.get("base_weight", 0.0),
                signal.get("description", ""),
                signal.get("source_tier", 4),
                signal.get("published_at", ""),
            ))
        except Exception:
            continue

    db.commit()
    db.close()


def get_stored_signals(prospect_name, days=14):
    """Retrieve stored signals for a prospect from the database."""
    db = _get_db()
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()

    try:
        rows = db.execute("""
            SELECT signal_type, base_weight, description,
                   source_tier, published_at
            FROM prospect_news_signals
            WHERE player_name = ? AND published_at > ?
            ORDER BY published_at DESC
        """, (prospect_name, cutoff)).fetchall()
    except Exception:
        rows = []

    db.close()

    return [
        {
            "signal_type": row[0],
            "base_weight": row[1],
            "description": row[2],
            "source_tier": row[3],
            "published_at": row[4],
        }
        for row in rows
    ]
