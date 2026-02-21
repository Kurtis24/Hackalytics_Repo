// API endpoints for node management

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

/**
 * Fetch all nodes from the backend
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
 * Add a new node
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
