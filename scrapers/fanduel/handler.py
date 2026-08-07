"""
Lambda handler — scrapes FanDuel NBA odds via Playwright.

Navigates the FanDuel sportsbook navigation page, extracts all available NBA
games and their odds across moneyline, spread, and totals markets.

FanDuel's /navigation/nba page bypasses geo-verification (unlike /basketball/nba).
Game events are found via links matching /basketball/nba/{away}-@-{home}-{id}.
Each game row has 6 odds buttons in order:
  away_spread, away_ml, over_total, home_spread, home_ml, under_total

Spread buttons contain: "line\nprice" (e.g. "+2.5\n-102")
ML buttons contain: "price" (e.g. "+162")
Total buttons contain: "O/U line\nprice" (e.g. "O 230.5\n-125")
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from playwright.sync_api import sync_playwright, Page, TimeoutError as PwTimeout

from shared.schema import OddsRow, american_to_stake, validate_row, rows_to_csv
from shared.s3_upload import upload_csv

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# /navigation/nba works without IP-based geo-verification
FANDUEL_NBA_URL = "https://sportsbook.fanduel.com/navigation/nba"
BOOKMAKER = "fanduel"
LEAGUE = "NBA"


def _parse_american_odds(text: str) -> int | None:
    """Parse American odds string like '+150' or '-110' to int."""
    text = text.strip().replace("\u2212", "-")
    match = re.match(r"^([+-]?\d+)$", text)
    if match:
        return int(match.group(1))
    return None


def _teams_from_href(href: str) -> tuple[str, str] | None:
    """Extract (away_team, home_team) from FanDuel event href.

    Example: /basketball/nba/milwaukee-bucks-@-chicago-bulls-35314293
    Returns: ("Milwaukee Bucks", "Chicago Bulls")
    """
    m = re.search(r"/basketball/nba/(.+)-@-(.+)-\d+$", href)
    if not m:
        return None
    away = m.group(1).replace("-", " ").title()
    home = m.group(2).replace("-", " ").title()
    return away, home


def _parse_spread_button(text: str) -> tuple[float, int] | None:
    """Parse spread button text like '+2.5\\n-102' into (line, price)."""
    lines = text.strip().split("\n")
    if len(lines) < 2:
        return None
    line_match = re.match(r"^([+-]?[\d.]+)$", lines[0].strip().replace("\u2212", "-"))
    price = _parse_american_odds(lines[1])
    if line_match and price is not None:
        return float(line_match.group(1)), price
    return None


def _parse_total_button(text: str) -> tuple[str, float, int] | None:
    """Parse total button text like 'O 230.5\\n-125' into (side, line, price)."""
    lines = text.strip().split("\n")
    if len(lines) < 2:
        return None
    m = re.match(r"^([OU])\s*([\d.]+)$", lines[0].strip())
    price = _parse_american_odds(lines[1])
    if m and price is not None:
        side = "over" if m.group(1) == "O" else "under"
        return side, float(m.group(2)), price
    return None


def _scrape_nba_odds(page: Page) -> list[OddsRow]:
    """Extract odds from FanDuel NBA page."""
    rows: list[OddsRow] = []
    now = datetime.now(timezone.utc).isoformat()

    page.goto(FANDUEL_NBA_URL, wait_until="domcontentloaded", timeout=60_000)
    page.wait_for_timeout(10000)

    # Find unique game event links
    event_links = page.query_selector_all("a[href*='/basketball/nba/']")
    seen_hrefs: set[str] = set()
    unique_links = []
    for link in event_links:
        href = link.get_attribute("href") or ""
        if href not in seen_hrefs and "-@-" in href:
            seen_hrefs.add(href)
            unique_links.append(link)

    logger.info("Found %d unique game links on FanDuel", len(unique_links))

    for link in unique_links:
        try:
            href = link.get_attribute("href") or ""
            teams = _teams_from_href(href)
            if not teams:
                continue
            team_a, team_b = teams  # away, home

            # Walk up to the game row container that has odds buttons
            row_el = link.evaluate_handle("""el => {
                let node = el.parentElement;
                while (node && !node.querySelector('[role="button"], button')) {
                    node = node.parentElement;
                }
                return node;
            }""")
            if not row_el:
                continue

            # Get all button texts from the row
            button_texts = row_el.evaluate("""el => {
                const buttons = el.querySelectorAll('[role="button"], button');
                return Array.from(buttons).map(b => b.innerText.trim());
            }""")

            if not button_texts or len(button_texts) < 6:
                logger.warning("Expected 6 buttons for %s @ %s, got %d",
                               team_a, team_b, len(button_texts) if button_texts else 0)
                continue

            # Button order: away_spread, away_ml, over_total,
            #               home_spread, home_ml, under_total
            away_spread = _parse_spread_button(button_texts[0])
            away_ml = _parse_american_odds(button_texts[1])
            over_total = _parse_total_button(button_texts[2])
            home_spread = _parse_spread_button(button_texts[3])
            home_ml = _parse_american_odds(button_texts[4])
            under_total = _parse_total_button(button_texts[5])

            spread_val = abs(away_spread[0]) if away_spread else 0.0
            total_val = over_total[1] if over_total else 0.0

            # Build spread rows
            if away_spread and home_spread:
                for side, (line, price) in [("away", away_spread), ("home", home_spread)]:
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

            # Build total rows
            if over_total and under_total:
                for t_side, t_line, t_price in [over_total, under_total]:
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
                        side=t_side,
                        price_current=american_to_stake(t_price),
                    )
                    errors = validate_row(row)
                    if not errors:
                        rows.append(row)

            # Build moneyline rows
            if away_ml is not None and home_ml is not None:
                for side, price in [("away", away_ml), ("home", home_ml)]:
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

            logger.info(
                "Parsed %s @ %s: spread=%s, total=%s, ML=%s",
                team_a, team_b,
                "yes" if away_spread and home_spread else "no",
                "yes" if over_total and under_total else "no",
                "yes" if away_ml is not None and home_ml is not None else "no",
            )

        except Exception as e:
            logger.warning("Failed to parse event: %s", e)
            continue

    return rows


def handler(event=None, context=None):
    """Lambda entry point."""
    logger.info("Starting FanDuel NBA scraper")

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
            logger.error("Timed out loading FanDuel")
            rows = []
        finally:
            browser.close()

    if not rows:
        logger.warning("No odds scraped from FanDuel")
        return {"statusCode": 200, "body": "No odds found"}

    csv_content = rows_to_csv(rows)
    key = upload_csv(csv_content, BOOKMAKER, LEAGUE)

    return {
        "statusCode": 200,
        "body": f"Uploaded {len(rows)} rows to {key}",
    }


if __name__ == '__main__':
    handler()
