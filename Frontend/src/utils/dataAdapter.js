/**
 * Adapts API node data to the format expected by SceneManager
 */

/**
 * Convert API node format to SceneManager format
 * API format: { category, home_team, away_team, profit_score, risk_score, confidence, volume, Date, market_type, sportsbooks }
 * Scene format: { node_id, sport, live, metrics: { confidence, profit, risk, volume } }
 */
export function adaptNodeForScene(apiNode, index = 0) {
  const nodeId = `${apiNode.category.toUpperCase()}_${apiNode.home_team}_${apiNode.away_team}_${apiNode.market_type}_${index}`.replace(/\s/g, '_');
  
  return {
    node_id: nodeId,
    sport: apiNode.category,
    live: apiNode.profit_score > 0.8 && apiNode.risk_score < 0.4,
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
      date: apiNode.Date,
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
