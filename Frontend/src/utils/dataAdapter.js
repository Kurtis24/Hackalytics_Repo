/**
 * Adapts API node data to the format expected by SceneManager
 */

/**
 * Convert backend ArbitrageOpportunity to frontend node format
 * Backend format: { category, home_team, away_team, profit_score, risk_score, confidence, optimal_volume, date, market_type, sportsbooks }
 * Frontend format: { category, home_team, away_team, profit_score, risk_score, confidence, volume, Date, market_type, sportsbooks }
 */
export function adaptBackendOpportunity(opportunity) {
  return {
    category: opportunity.category,
    home_team: opportunity.home_team,
    away_team: opportunity.away_team,
    profit_score: opportunity.profit_score,
    risk_score: opportunity.risk_score,
    confidence: opportunity.confidence,
    volume: opportunity.optimal_volume,
    Date: opportunity.date,
    market_type: opportunity.market_type,
    sportsbooks: opportunity.sportsbooks,
  };
}

/**
 * Convert array of backend ArbitrageOpportunity to frontend node format
 */
export function adaptBackendOpportunities(opportunities) {
  return opportunities.map(opp => adaptBackendOpportunity(opp));
}

/**
 * Convert API node format to SceneManager format
 * API format: { category, home_team, away_team, profit_score, risk_score, confidence, volume, Date, market_type, sportsbooks }
 * Scene format: { node_id, sport, live, metrics: { confidence, profit, risk, volume } }
 */
export function adaptNodeForScene(apiNode, index = 0) {
  const nodeId = `${apiNode.category.toUpperCase()}_${apiNode.home_team}_${apiNode.away_team}_${apiNode.market_type}_${index}`.replace(/\s/g, '_');
  
  const now = new Date();
  const nodeDate = new Date(apiNode.Date || apiNode.date);
  const isToday = nodeDate.toDateString() === now.toDateString();
  
  return {
    node_id: nodeId,
    sport: apiNode.category,
    live: isToday && apiNode.profit_score > 0.5,
    metrics: {
      confidence: apiNode.confidence,
      profit: apiNode.profit_score * 10,
      risk: apiNode.risk_score,
      volume: apiNode.volume,
    },
    rawData: {
      home_team: apiNode.home_team,
      away_team: apiNode.away_team,
      market_type: apiNode.market_type,
      date: apiNode.Date || apiNode.date,
      sportsbooks: apiNode.sportsbooks,
      volume: apiNode.volume,
    },
  };
}

/**
 * Convert array of API nodes to SceneManager format
 */
export function adaptNodesForScene(apiNodes) {
  return apiNodes.map((node, index) => adaptNodeForScene(node, index));
}

/**
 * Generate connections between nodes that share team names
 * Connects nodes if they share either home_team or away_team
 */
export function generateConnections(nodes) {
  const connections = [];
  const n = nodes.length;
  
  for (let i = 0; i < n; i++) {
    const nodeA = nodes[i];
    const homeA = nodeA.rawData?.home_team;
    const awayA = nodeA.rawData?.away_team;
    
    if (!homeA || !awayA) continue;
    
    for (let j = i + 1; j < n; j++) {
      const nodeB = nodes[j];
      const homeB = nodeB.rawData?.home_team;
      const awayB = nodeB.rawData?.away_team;
      
      if (!homeB || !awayB) continue;
      
      const sharesTeam = homeA === homeB || homeA === awayB || 
                         awayA === homeB || awayA === awayB;
      
      if (sharesTeam) {
        connections.push({
          source: nodeA.node_id,
          target: nodeB.node_id,
        });
      }
    }
  }
  
  return connections;
}
