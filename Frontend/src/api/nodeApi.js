// API endpoints for node management

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

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
