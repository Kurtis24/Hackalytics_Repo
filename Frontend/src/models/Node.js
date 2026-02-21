/**
 * Node class representing a sports betting arbitrage opportunity
 */
export class Node {
  constructor(data) {
    this.category = data.category;
    this.home_team = data.home_team;
    this.away_team = data.away_team;
    this.profit_score = data.profit_score;
    this.risk_score = data.risk_score;
    this.confidence = data.confidence;
    this.volume = data.volume;
    this.date = data.Date || data.date;
    this.market_type = data.market_type;
    this.sportsbooks = data.sportsbooks || [];
  }

  getId() {
    return `${this.category}_${this.home_team}_${this.away_team}_${this.market_type}`.replace(/\s/g, '_');
  }

  toJSON() {
    return {
      category: this.category,
      home_team: this.home_team,
      away_team: this.away_team,
      profit_score: this.profit_score,
      risk_score: this.risk_score,
      confidence: this.confidence,
      volume: this.volume,
      Date: this.date,
      market_type: this.market_type,
      sportsbooks: this.sportsbooks,
    };
  }
}

/**
 * NodeCollection - manages an array of Node objects
 */
export class NodeCollection {
  constructor(nodes = []) {
    this.nodes = nodes.map(node => node instanceof Node ? node : new Node(node));
  }

  add(nodeData) {
    const node = new Node(nodeData);
    this.nodes.push(node);
    return node;
  }

  remove(nodeId) {
    const index = this.nodes.findIndex(node => node.getId() === nodeId);
    if (index !== -1) {
      return this.nodes.splice(index, 1)[0];
    }
    return null;
  }

  update(nodeId, updates) {
    const node = this.nodes.find(node => node.getId() === nodeId);
    if (node) {
      Object.assign(node, updates);
      return node;
    }
    return null;
  }

  findById(nodeId) {
    return this.nodes.find(node => node.getId() === nodeId);
  }

  filterByCategory(category) {
    return this.nodes.filter(node => node.category === category);
  }

  getAll() {
    return this.nodes;
  }

  toJSON() {
    return this.nodes.map(node => node.toJSON());
  }
}

// Sample nodes based on the provided schema
export const sampleNodes = [
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
  }
];

export default new NodeCollection(sampleNodes);
