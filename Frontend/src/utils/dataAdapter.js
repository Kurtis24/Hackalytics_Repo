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
  };
}

/**
 * Convert array of API nodes to SceneManager format
 */
export function adaptNodesForScene(apiNodes) {
  return apiNodes.map((node, index) => adaptNodeForScene(node, index));
}

/**
 * Generate simple connections between nodes (sparse graph)
 */
export function generateConnections(nodes) {
  const connections = [];
  const n = nodes.length;
  
  for (let i = 0; i < n; i++) {
    const connectionCount = Math.min(2, Math.floor(Math.random() * 3));
    
    for (let j = 0; j < connectionCount; j++) {
      const targetIndex = Math.floor(Math.random() * n);
      if (targetIndex !== i) {
        connections.push({
          source: nodes[i].node_id,
          target: nodes[targetIndex].node_id,
        });
      }
    }
  }
  
  return connections;
}
