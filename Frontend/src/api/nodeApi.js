// API endpoints for node management, games, and ML pipeline
//
// Usage from the front end:
//   • Games: fetchAllGames(), fetchLiveGames() — GET /games/all, /games/live
//   • ML:    runMlPipeline(store?) — POST /ml/run (games → Databricks → nodes; store=true appends to GET /nodes)
//   • Nodes: fetchNodes(), addNode(), addBulkNodes(nodes) — GET /nodes, POST /nodes, POST /nodes/bulk
//   • Run ML and show in app: runMlPipeline(true) then adaptMlNodes(nodes) then updateArbitrageData(nodes) — see ExecuteButton / Execute page

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

// ---------------------------------------------------------------------------
// Games (live + not live)
// ---------------------------------------------------------------------------

/**
 * Fetch all games (upcoming + live) from the backend.
 * @returns {Promise<Array<{ category, live, home_team, away_team, start_time }>>}
 */
export async function fetchAllGames() {
  const response = await fetch(`${API_BASE_URL}/games/all`);
  if (!response.ok) throw new Error(`Failed to fetch games: ${response.statusText}`);
  return response.json();
}

/**
 * Fetch only currently live (in-progress) games.
 */
export async function fetchLiveGames() {
  const response = await fetch(`${API_BASE_URL}/games/live`);
  if (!response.ok) throw new Error(`Failed to fetch live games: ${response.statusText}`);
  return response.json();
}

// ---------------------------------------------------------------------------
// ML pipeline (games → Databricks → nodes)
// ---------------------------------------------------------------------------

/**
 * Run the ML pipeline: backend fetches games (live + not live), sends them
 * to the Databricks client, returns node-shaped results.
 * @param {boolean} [store=true] - If true, backend also appends nodes to the nodes store (GET /nodes).
 * @returns {Promise<Array>} List of nodes (same shape as Node model).
 */
export async function runMlPipeline(store = true) {
  const url = `${API_BASE_URL}/ml/run${store ? '?store=true' : '?store=false'}`;
  const response = await fetch(url, { method: 'POST' });
  if (!response.ok) throw new Error(`ML pipeline failed: ${response.statusText}`);
  return response.json();
}

// ---------------------------------------------------------------------------
// Nodes (single + bulk)
// ---------------------------------------------------------------------------

/**
 * Fetch all nodes from the backend (includes any stored from ML pipeline or bulk upload).
 */
export async function fetchNodes() {
  try {
    const response = await fetch(`${API_BASE_URL}/nodes`);
    if (!response.ok) {
      throw new Error(`Failed to fetch nodes: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching nodes:', error);
    throw error;
  }
}

/**
 * Add a new node (single).
 */
export async function addNode(nodeData) {
  try {
    const response = await fetch(`${API_BASE_URL}/nodes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(nodeData),
    });
    if (!response.ok) {
      throw new Error(`Failed to add node: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error adding node:', error);
    throw error;
  }
}

/**
 * Accept bulk nodes at a time (e.g. outputs from Databricks / ML pipeline).
 * @param {Array<object>} nodes - Array of node objects (category, home_team, away_team, profit_score, risk_score, confidence, volume, date/Date, market_type, sportsbooks).
 * @returns {Promise<{ accepted: number, total: number }>}
 */
export async function addBulkNodes(nodes) {
  const response = await fetch(`${API_BASE_URL}/nodes/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(nodes),
  });
  if (!response.ok) throw new Error(`Failed to add bulk nodes: ${response.statusText}`);
  return response.json();
}

/**
 * Update an existing node
 */
export async function updateNode(nodeId, nodeData) {
  try {
    const response = await fetch(`${API_BASE_URL}/nodes/${nodeId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(nodeData),
    });
    if (!response.ok) {
      throw new Error(`Failed to update node: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error updating node:', error);
    throw error;
  }
}

/**
 * Delete a node
 */
export async function deleteNode(nodeId) {
  try {
    const response = await fetch(`${API_BASE_URL}/nodes/${nodeId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`Failed to delete node: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error deleting node:', error);
    throw error;
  }
}

/**
 * Check all nodes and update their live status based on today's date
 * Marks nodes as live if their date matches today's date
 * Returns the updated nodes with live status
 */
export async function updateLiveStatus() {
  try {
    const response = await fetch(`${API_BASE_URL}/nodes/live/update`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error(`Failed to update live status: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error updating live status:', error);
    throw error;
  }
}

/**
 * Delete all nodes whose date is in the past
 * Returns the count of deleted nodes
 */
export async function deletePastNodes() {
  try {
    const response = await fetch(`${API_BASE_URL}/nodes/past`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`Failed to delete past nodes: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error deleting past nodes:', error);
    throw error;
  }
}

/**
 * Fetch arbitrage opportunities from the backend
 * Calls the ML model and arbitrage service to get real-time opportunities
 */
export async function fetchArbitrageOpportunities() {
  try {
    const response = await fetch(`${API_BASE_URL}/arbitrage/opportunities`);
    if (!response.ok) {
      throw new Error(`Failed to fetch arbitrage opportunities: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching arbitrage opportunities:', error);
    throw error;
  }
}
