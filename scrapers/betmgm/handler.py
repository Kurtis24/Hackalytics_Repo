"""
Lambda handler — scrapes BetMGM NBA odds via Playwright.

Navigates the BetMGM AZ sports betting page, extracts all available NBA games
and their odds across moneyline, spread, and totals markets.

BetMGM uses state-specific subdomains (az.betmgm.com) and an Angular SPA.
Game events are found via links matching /en/sports/events/{away}-at-{home}-{id}.
Odds are in sibling divs of the link, with text nodes in order:
  Spread: line_a, price_a, line_b, price_b
  Total:  raw_total, "O total", price_over, "U total", price_under
  Money:  price_home, price_away
"""

from __future__ import annotations

import pdb
import logging
import re
from datetime import datetime, timezone

from playwright.sync_api import sync_playwright, Page, TimeoutError as PwTimeout

from shared.schema import OddsRow, american_to_stake, validate_row, rows_to_csv
from shared.s3_upload import upload_csv

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# AZ state-specific subdomain — sports.betmgm.com redirects to a state picker
BETMGM_NBA_URL = "https://www.az.betmgm.com/en/sports/basketball-7/betting/usa-9/nba-6004"
BOOKMAKER = "betmgm"
LEAGUE = "NBA"


def _parse_american_odds(text: str) -> int | None:
    """Parse American odds string like '+150', '-110', '260' to int."""
    text = text.strip().replace("\u2212", "-")
    m = re.match(r"^([+-]?\d+)$", text)
    if m:
        return int(m.group(1))
    return None


def _teams_from_href(href: str) -> tuple[str, str] | None:
    """Extract (away_team, home_team) full names from event href.

    Example: /en/sports/events/milwaukee-bucks-at-chicago-bulls-19025815
    Returns: ("Milwaukee Bucks", "Chicago Bulls")
    """
    m = re.search(r"/events/(.+)-at-(.+)-\d+$", href)
    if not m:
        return None
    away = m.group(1).replace("-", " ").title()
    home = m.group(2).replace("-", " ").title()
    return away, home


def _scrape_nba_odds(page: Page) -> list[OddsRow]:
    """Extract odds from BetMGM NBA page."""
    rows: list[OddsRow] = []
    now = datetime.now(timezone.utc).isoformat()

    page.goto(BETMGM_NBA_URL, wait_until="domcontentloaded", timeout=60_000)
    page.wait_for_timeout(20000)

    # BetMGM wraps each game in a div.grid-event-wrapper containing:
    #   - <a> link (team names, scores)
    #   - sibling divs with odds cells
    event_links = page.query_selector_all("a[href*='/en/sports/events/']")
    logger.info("Found %d event links on BetMGM", len(event_links))

    for link in event_links:
        try:
            href = link.get_attribute("href") or ""
            teams = _teams_from_href(href)
            if not teams:
                continue
            team_a, team_b = teams  # away, home

            # Get the parent .grid-event-wrapper
            parent = link.evaluate_handle("el => el.parentElement")
            if not parent:
                continue

            # Extract all text nodes from non-link children (the odds grid)
            all_texts = parent.evaluate("""el => {
                const texts = [];
                const walk = (node) => {
                    if (node.nodeType === 3) {
                        const t = node.textContent.trim();
                        if (t) texts.push(t);
                    }
                    for (const child of node.childNodes) walk(child);
                };
                for (const child of el.children) {
                    if (child.tagName !== 'A') walk(child);
                }
                return texts;
            }""")

            if not all_texts:
                continue

            # Parse the ordered text nodes into markets.
            # Observed patterns:
            #
            # Full (spread + total + ML), 11 values:
            #   ['-5.5', '-125', '+5.5', '-102', '231.5', 'O 231.5', '-115', 'U 231.5', '-115', '-350', '+260']
            #    spr_ln  spr_p   spr_ln  spr_p   (raw)    tot_ln     tot_p   tot_ln     tot_p   ml_p    ml_p
            #
            # Partial (spread + ML, no total), 6 values:
            #   ['-7.5', '-125', '+7.5', '-105', '-300', '+225']
            #
            # Strategy: parse in 3 phases. Spread lines come first (small
            # numbers paired with a price). Then totals (O/U prefixed).
            # Everything numeric remaining after those two phases is ML.

            spread_entries = []  # (line_value, american_price)
            total_entries = []   # ("over"/"under", total_line, american_price)
            consumed = set()     # indices already consumed

            # Phase 1: Find spread pairs — first consecutive (line, price) pairs
            # where the line is a small number (|val| < 50)
            i = 0
            while i < len(all_texts) and len(spread_entries) < 2:
                t = all_texts[i].replace('"', '').strip()
                m_line = re.match(r"^([+-]?[\d.]+)$", t)
                if m_line:
                    val = float(m_line.group(1))
                    if abs(val) < 50 and i + 1 < len(all_texts):
                        price = _parse_american_odds(all_texts[i + 1])
                        if price is not None:
                            spread_entries.append((val, price))
                            consumed.add(i)
                            consumed.add(i + 1)
                            i += 2
                            continue
                i += 1

            # Phase 2: Find total pairs — "O xxx" / "U xxx" followed by price
            for i in range(len(all_texts)):
                if i in consumed:
                    continue
                t = all_texts[i].replace('"', '').strip()
                m_total = re.match(r"^([OU])\s*([\d.]+)$", t)
                if m_total and len(total_entries) < 2:
                    side = "over" if m_total.group(1) == "O" else "under"
                    line = float(m_total.group(2))
                    if i + 1 < len(all_texts) and (i + 1) not in consumed:
                        price = _parse_american_odds(all_texts[i + 1])
                        if price is not None:
                            total_entries.append((side, line, price))
                            consumed.add(i)
                            consumed.add(i + 1)

            # Also consume any raw total value that appears before O/U lines
            # (e.g., "231.5" standalone)
            for i in range(len(all_texts)):
                if i in consumed:
                    continue
                t = all_texts[i].replace('"', '').strip()
                m = re.match(r"^[\d.]+$", t)
                if m and float(t) > 100:
                    consumed.add(i)

            # Phase 3: Remaining numeric values are moneyline odds
            ml_entries = []
            for i in range(len(all_texts)):
                if i in consumed:
                    continue
                t = all_texts[i].replace('"', '').strip()
                odds = _parse_american_odds(t)
                if odds is not None:
                    ml_entries.append(odds)

            # Build OddsRow entries
            spread_val = abs(spread_entries[0][0]) if spread_entries else 0.0
            total_val = total_entries[0][1] if total_entries else 0.0

            # Spread
            if len(spread_entries) >= 2:
                for idx, (line, price) in enumerate(spread_entries[:2]):
                    side = "away" if idx == 0 else "home"
                    row = OddsRow(
                        datetime=now,
                        game_start=now,
                        league=LEAGUE,
                        team_a=team_a,
                        team_b=team_b,
                        current_points_spread=spread_val,
                        current_points_total=total_val,
                        game_duration=0.0,
                        bookmaker=BOOKMAKER,
                        market_type="POINTS_SPREAD",
                        thresh=spread_val,
                        side=side,
                        price_current=american_to_stake(price),
                    )
                    errors = validate_row(row)
                    if not errors:
                        rows.append(row)

            # Total
            if len(total_entries) >= 2:
                for side, line, price in total_entries[:2]:
                    row = OddsRow(
                        datetime=now,
                        game_start=now,
                        league=LEAGUE,
                        team_a=team_a,
                        team_b=team_b,
                        current_points_spread=spread_val,
                        current_points_total=total_val,
                        game_duration=0.0,
                        bookmaker=BOOKMAKER,
                        market_type="POINTS_TOTAL",
                        thresh=total_val,
                        side=side,
                        price_current=american_to_stake(price),
                    )
                    errors = validate_row(row)
                    if not errors:
                        rows.append(row)

            # Moneyline
            if len(ml_entries) >= 2:
                for idx, price in enumerate(ml_entries[:2]):
                    side = "away" if idx == 0 else "home"
                    row = OddsRow(
                        datetime=now,
                        game_start=now,
                        league=LEAGUE,
                        team_a=team_a,
                        team_b=team_b,
                        current_points_spread=spread_val,
                        current_points_total=total_val,
                        game_duration=0.0,
                        bookmaker=BOOKMAKER,
                        market_type="MONEYLINE",
                        thresh=0.0,
                        side=side,
                        price_current=american_to_stake(price),
                    )
                    errors = validate_row(row)
                    if not errors:
                        rows.append(row)

            n_markets = (min(len(spread_entries), 2) + min(len(total_entries), 2)
                         + min(len(ml_entries), 2))
            logger.info(
                "Parsed %s @ %s: %d spread, %d total, %d ML",
                team_a, team_b,
                min(len(spread_entries), 2),
                min(len(total_entries), 2),
                min(len(ml_entries), 2),
            )

        except Exception as e:
            logger.warning("Failed to parse event: %s", e)
            continue

    return rows


def handler(event=None, context=None):
    """Lambda entry point."""
    logger.info("Starting BetMGM NBA scraper")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=False)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            geolocation={"latitude": 33.4484, "longitude": -112.0740},
            permissions=["geolocation"],
            locale="en-US",
            timezone_id="America/Phoenix",
        )
        page = context.new_page()

        try:
            rows = _scrape_nba_odds(page)
        except PwTimeout:
            logger.error("Timed out loading BetMGM")
            rows = []
        finally:
            browser.close()

    if not rows:
        logger.warning("No odds scraped from BetMGM")
        return {"statusCode": 200, "body": "No odds found"}

    csv_content = rows_to_csv(rows)
    key = upload_csv(csv_content, BOOKMAKER, LEAGUE)

    return {
        "statusCode": 200,
        "body": f"Uploaded {len(rows)} rows to {key}",
    }


if __name__ == '__main__':

    handler()
