/**
 * Mock node data for development and testing
 * This data can be used locally or synced with the API
 */

export const mockNodes = [
  {
    category: "basketball",
    home_team: "Houston Rockets",
    away_team: "New York Knicks",
    profit_score: 0.82,
    risk_score: 0.34,
    confidence: 0.65,
    volume: 124000,
    Date: "2025-10-20T13:00:00",
    market_type: "spread",
    sportsbooks: [
      { name: "DraftKings", odds: 140 },
      { name: "ESPNBet", odds: 135 }
    ]
  },
  {
    category: "football",
    home_team: "Kansas City Chiefs",
    away_team: "Buffalo Bills",
    profit_score: 0.75,
    risk_score: 0.42,
    confidence: 0.71,
    volume: 250000,
    Date: "2025-10-21T18:00:00",
    market_type: "moneyline",
    sportsbooks: [
      { name: "FanDuel", odds: -110 },
      { name: "BetMGM", odds: -105 }
    ]
  },
  {
    category: "baseball",
    home_team: "New York Yankees",
    away_team: "Boston Red Sox",
    profit_score: 0.68,
    risk_score: 0.28,
    confidence: 0.78,
    volume: 180000,
    Date: "2025-10-22T19:00:00",
    market_type: "over/under",
    sportsbooks: [
      { name: "DraftKings", odds: -115 },
      { name: "Caesars", odds: -108 }
    ]
  },
  {
    category: "hockey",
    home_team: "Edmonton Oilers",
    away_team: "Calgary Flames",
    profit_score: 0.55,
    risk_score: 0.51,
    confidence: 0.62,
    volume: 95000,
    Date: "2025-10-23T20:00:00",
    market_type: "spread",
    sportsbooks: [
      { name: "PointsBet", odds: 125 },
      { name: "Bet365", odds: 130 }
    ]
  },
  {
    category: "basketball",
    home_team: "Los Angeles Lakers",
    away_team: "Golden State Warriors",
    profit_score: 0.91,
    risk_score: 0.22,
    confidence: 0.84,
    volume: 420000,
    Date: "2025-10-24T22:00:00",
    market_type: "moneyline",
    sportsbooks: [
      { name: "DraftKings", odds: 155 },
      { name: "FanDuel", odds: 148 }
    ]
  },
  {
    category: "football",
    home_team: "Dallas Cowboys",
    away_team: "Philadelphia Eagles",
    profit_score: 0.45,
    risk_score: 0.58,
    confidence: 0.59,
    volume: 310000,
    Date: "2025-10-25T16:30:00",
    market_type: "spread",
    sportsbooks: [
      { name: "BetMGM", odds: -120 },
      { name: "Caesars", odds: -115 }
    ]
  },
  {
    category: "baseball",
    home_team: "Los Angeles Dodgers",
    away_team: "San Francisco Giants",
    profit_score: 0.72,
    risk_score: 0.31,
    confidence: 0.75,
    volume: 205000,
    Date: "2025-10-26T21:00:00",
    market_type: "moneyline",
    sportsbooks: [
      { name: "FanDuel", odds: 128 },
      { name: "ESPNBet", odds: 132 }
    ]
  },
  {
    category: "hockey",
    home_team: "Toronto Maple Leafs",
    away_team: "Montreal Canadiens",
    profit_score: 0.63,
    risk_score: 0.45,
    confidence: 0.68,
    volume: 142000,
    Date: "2025-10-27T19:00:00",
    market_type: "over/under",
    sportsbooks: [
      { name: "Bet365", odds: -112 },
      { name: "BetRivers", odds: -108 }
    ]
  }
];

export default mockNodes;
