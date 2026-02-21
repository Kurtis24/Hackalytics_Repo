import * as THREE from 'three';

// ─── Cluster configuration ────────────────────────────────────────────────────
const CLUSTERS = {
  sports:      { color: 0xff6b6b, center: [-1000,  0,     0] },
  quant:       { color: 0x4ecdc4, center: [  1400,  0,     0] },
  crypto:      { color: 0xf7d794, center: [     0,  0,  1200] },
  football:    { color: 0x55efc4, center: [     0,  0, -1200] },
  forex:       { color: 0xfd79a8, center: [ -1200,  0,  -900] },
  commodities: { color: 0xe17055, center: [  1000,  0,  -900] },
};
const CLUSTER_NAMES  = Object.keys(CLUSTERS);
const SCATTER_RADIUS = 800; // node distance

// ─── Seeded LCG RNG for deterministic scatter ─────────────────────────────────
function lcgRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// Box-Muller transform — returns a pair of independent standard normals.
// Produces a natural star-field density: dense core, sparse wispy edges.
function boxMuller(rng) {
  const u1 = Math.max(rng(), 1e-10); // guard against log(0)
  const u2 = rng();
  const mag = Math.sqrt(-2 * Math.log(u1));
  return [mag * Math.cos(2 * Math.PI * u2), mag * Math.sin(2 * Math.PI * u2)];
}

// ─── NodeRenderer ─────────────────────────────────────────────────────────────
export class NodeRenderer {
  /**
   * @param {THREE.Scene}          scene
   * @param {import('./CameraController').CameraController} cameraController
   */
  constructor(scene, cameraController) {
    this.scene            = scene;
    this.cameraController = cameraController;

    // Shared low-poly geometry (IcosahedronGeometry detail=0 → 20 tris)
    this._geometry  = new THREE.IcosahedronGeometry(1, 0);
    this._nodeGroup = new THREE.Group();
    scene.add(this._nodeGroup);

    // ── Flat buffers (allocated in initialize) ────────────────────────────
    this.positions     = null; // Float32Array  [x,y,z per node]
    this.scales        = null; // Float32Array  [scale per node]
    this.profit        = null; // Float32Array  [profit_percent per node]
    this.clusterIndex  = null; // Uint16Array   [clusterIdx per node]
    this.nodeIds       = [];   // string[]
    this.subcategories = [];   // string[]  — e.g. "NBA", "BTC", "STAT_ARB"

    // ── Lookup maps ───────────────────────────────────────────────────────
    this._nodeIndexMap      = new Map(); // nodeId      → flat index
    this._clusterNodeLists  = new Map(); // clusterName → nodeIndex[]
    this._subcategoryIndex  = new Map(); // subcategory → nodeIndex[]
    this._instanceInfo      = new Map(); // nodeIndex   → { mesh, instanceIndex, clusterName }

    // ── Per-cluster InstancedMeshes ───────────────────────────────────────
    this._clusterMeshes = new Map(); // clusterName → InstancedMesh

    // ── Highlight (single-instance overlay mesh) ──────────────────────────
    this._highlightMesh  = null;
    this._hoveredIndex   = -1;

    // ── Focus glow meshes ─────────────────────────────────────────────────
    this._focusCenterMesh   = null; // 1 instance  — the clicked node
    this._focusNeighborMesh = null; // up to 200 instances — immediate neighbors
    this._focusedNodeId     = null;

    // ── Search result glow mesh ───────────────────────────────────────────
    this._searchResultMesh     = null; // up to n instances — search hits
    this._searchResultMaxCount = 0;   // tracks the buffer size (count is 0 when hidden)

    // ── Adjacency map ─────────────────────────────────────────────────────
    this._adjacency = new Map(); // nodeId → Set<nodeId>

    // ── Focus callback (wired by SceneManager) ────────────────────────────
    this._onFocusCallback = null; // (nodeId: string) => void

    // Reusable Object3D for matrix writes (never added to scene)
    this._dummy = new THREE.Object3D();

    this._buildHighlight();
    this._buildFocusMeshes();
    // _buildSearchMesh() is deferred to initialize() when node count is known
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Build all InstancedMeshes from the node array.
   * Must be called once before rendering; call again to replace data.
   * @param {import('./ClaudeREADME.md').ArbNode[]} nodes
   */
  initialize(nodes) {
    this._clearClusterMeshes();
    this._clearSearchMesh();
    this._nodeIndexMap.clear();
    this._clusterNodeLists.clear();
    this._subcategoryIndex.clear();
    this._instanceInfo.clear();
    this._hoveredIndex = -1;
    this._highlightMesh.visible = false;
    this._focusCenterMesh.visible   = false;
    this._focusNeighborMesh.visible = false;

    const n = nodes.length;
    this.positions     = new Float32Array(n * 3);
    this.scales        = new Float32Array(n);
    this.profit        = new Float32Array(n);
    this.clusterIndex  = new Uint16Array(n);
    this.nodeIds       = new Array(n);
    this.subcategories = new Array(n);

    // One seeded RNG per cluster for deterministic, stable layout
    const rngs = {};
    CLUSTER_NAMES.forEach((name, i) => {
      rngs[name] = lcgRandom(i * 999983 + 1234567);
    });

    // ── Pass 1: fill flat buffers ─────────────────────────────────────────
    for (let i = 0; i < n; i++) {
      const node    = nodes[i];
      const clName  = CLUSTERS[node.cluster] ? node.cluster : CLUSTER_NAMES[0];
      const clIdx   = CLUSTER_NAMES.indexOf(clName);

      this.nodeIds[i]       = node.node_id;
      this.subcategories[i] = node.subcategory ?? '';
      this._nodeIndexMap.set(node.node_id, i);
      this.clusterIndex[i] = clIdx;

      // Position
      if (node.position) {
        this.positions[i * 3]     = node.position.x;
        this.positions[i * 3 + 1] = node.position.y;
        this.positions[i * 3 + 2] = node.position.z;
      } else {
        const rng          = rngs[clName];
        const [cx, cy, cz] = CLUSTERS[clName].center;
        const std          = SCATTER_RADIUS / 2.5; // 3σ covers most of SCATTER_RADIUS
        const stdY         = std / 3;              // flatter on Y — galactic disk feel
        const [nx, nz]     = boxMuller(rng);
        const [ny]         = boxMuller(rng);
        this.positions[i * 3]     = cx + nx * std;
        this.positions[i * 3 + 1] = cy + ny * stdY;
        this.positions[i * 3 + 2] = cz + nz * std;
      }

      // Scale derived from event_count (logarithmic, computed once)
      const ec      = node.metrics?.event_count ?? 1;
      this.scales[i] = 0.5 + Math.log2(ec + 1) * 0.25;

      // Profit
      this.profit[i] = node.metrics?.profit_percent ?? 0;

      // Cluster bucket
      if (!this._clusterNodeLists.has(clName)) this._clusterNodeLists.set(clName, []);
      this._clusterNodeLists.get(clName).push(i);

      // Subcategory index
      const sub = this.subcategories[i];
      if (sub) {
        if (!this._subcategoryIndex.has(sub)) this._subcategoryIndex.set(sub, []);
        this._subcategoryIndex.get(sub).push(i);
      }
    }

    // Build search mesh now that n is known
    this._buildSearchMesh(n);

    // ── Pass 2: build one InstancedMesh per cluster ───────────────────────
    CLUSTER_NAMES.forEach((clName) => {
      const list = this._clusterNodeLists.get(clName);
      if (!list?.length) return;

      const mat  = new THREE.MeshStandardMaterial({
        color:     CLUSTERS[clName].color,
        roughness: 0.8,
        metalness: 0.1,
      });
      const mesh = new THREE.InstancedMesh(this._geometry, mat, list.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData.clusterName = clName;
      mesh.userData.nodeList    = list; // instanceIndex → nodeIndex

      list.forEach((nodeIdx, instIdx) => {
        this._instanceInfo.set(nodeIdx, { mesh, instanceIndex: instIdx, clusterName: clName });
        this._writeDummy(nodeIdx);
        mesh.setMatrixAt(instIdx, this._dummy.matrix);
      });

      mesh.instanceMatrix.needsUpdate = true;
      this._nodeGroup.add(mesh);
      this._clusterMeshes.set(clName, mesh);
    });
  }

  /**
   * Update a single node's position, scale, and profit in-place.
   * Triggers a minimal instanceMatrix update on the owning mesh only.
   */
  updateNode(node) {
    const i = this._nodeIndexMap.get(node.node_id);
    if (i === undefined) return;

    if (node.position) {
      this.positions[i * 3]     = node.position.x;
      this.positions[i * 3 + 1] = node.position.y;
      this.positions[i * 3 + 2] = node.position.z;
    }
    const ec      = node.metrics?.event_count ?? 1;
    this.scales[i] = 0.5 + Math.log2(ec + 1) * 0.25;
    this.profit[i] = node.metrics?.profit_percent ?? 0;

    const info = this._instanceInfo.get(i);
    if (!info) return;
    this._writeDummy(i);
    info.mesh.setMatrixAt(info.instanceIndex, this._dummy.matrix);
    info.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Build the adjacency map from a connections array.
   * Call after initialize() so nodeIds are populated.
   * @param {Array<{source: string, target: string}>} connections
   */
  loadConnections(connections) {
    this._adjacency.clear();
    connections.forEach(({ source, target }) => {
      if (!this._adjacency.has(source)) this._adjacency.set(source, new Set());
      if (!this._adjacency.has(target)) this._adjacency.set(target, new Set());
      this._adjacency.get(source).add(target);
      this._adjacency.get(target).add(source);
    });
  }

  /**
   * Animate camera to focus on a node by its ID.
   * Also applies the focus glow and fires _onFocusCallback.
   */
  focusNode(nodeId) {
    const i = this._nodeIndexMap.get(nodeId);
    if (i === undefined) return;
    this.cameraController.focusNode(this._nodePosition(i));
    this._applyFocusGlow(nodeId);
    if (this._onFocusCallback) this._onFocusCallback(nodeId);
  }

  /**
   * Light up the focused node and its immediate neighbors.
   */
  _applyFocusGlow(nodeId) {
    this._focusedNodeId = nodeId;

    // ── Center node glow ──────────────────────────────────────────────────
    const ci = this._nodeIndexMap.get(nodeId);
    if (ci !== undefined) {
      const s = this.scales[ci] * 1.6;
      this._dummy.position.copy(this._nodePosition(ci));
      this._dummy.scale.set(s, s, s);
      this._dummy.rotation.set(0, 0, 0);
      this._dummy.updateMatrix();
      this._focusCenterMesh.setMatrixAt(0, this._dummy.matrix);
      this._focusCenterMesh.instanceMatrix.needsUpdate = true;
      this._focusCenterMesh.count   = 1;
      this._focusCenterMesh.visible = true;
    }

    // ── Neighbor glow ─────────────────────────────────────────────────────
    const neighbors = this._adjacency.get(nodeId) ?? new Set();
    const neighborArr = [...neighbors].slice(0, 200);
    let instIdx = 0;
    neighborArr.forEach((nid) => {
      const ni = this._nodeIndexMap.get(nid);
      if (ni === undefined) return;
      const s = this.scales[ni] * 1.45;
      this._dummy.position.copy(this._nodePosition(ni));
      this._dummy.scale.set(s, s, s);
      this._dummy.rotation.set(0, 0, 0);
      this._dummy.updateMatrix();
      this._focusNeighborMesh.setMatrixAt(instIdx, this._dummy.matrix);
      instIdx++;
    });
    this._focusNeighborMesh.count   = instIdx;
    this._focusNeighborMesh.instanceMatrix.needsUpdate = true;
    this._focusNeighborMesh.visible = instIdx > 0;
  }

  /**
   * Remove focus glow from all nodes.
   */
  clearFocus() {
    this._focusedNodeId             = null;
    this._focusCenterMesh.visible   = false;
    this._focusNeighborMesh.visible = false;
    if (this._onFocusCallback) this._onFocusCallback(null);
  }

  // ── Search API ──────────────────────────────────────────────────────────────

  /**
   * Search nodes by multiple criteria. Returns a flat array of matching nodeIndices.
   *
   * @param {{
   *   text?:        string,   // substring match against nodeId (case-insensitive)
   *   cluster?:     string,   // exact cluster name
   *   subcategory?: string,   // exact subcategory match (e.g. "NBA", "BTC")
   *   minProfit?:   number,   // profit_percent ≥ minProfit
   *   maxProfit?:   number,   // profit_percent ≤ maxProfit
   * }} criteria
   * @returns {number[]} nodeIndices
   */
  search(criteria = {}) {
    const { text, cluster, subcategory, minProfit, maxProfit } = criteria;
    const textLC = text?.trim().toLowerCase();
    const hasProfMin = minProfit !== undefined && minProfit !== '';
    const hasProfMax = maxProfit !== undefined && maxProfit !== '';

    // ── Pick the smallest candidate set via available indices ─────────────
    // Priority: subcategory > cluster > full scan
    let candidates = null;
    if (subcategory && this._subcategoryIndex.has(subcategory)) {
      candidates = this._subcategoryIndex.get(subcategory);
      // If cluster also specified, keep only those in the right cluster
      if (cluster) {
        const clIdx = CLUSTER_NAMES.indexOf(cluster);
        candidates = candidates.filter(i => this.clusterIndex[i] === clIdx);
      }
    } else if (cluster && this._clusterNodeLists.has(cluster)) {
      candidates = this._clusterNodeLists.get(cluster);
    }

    // ── Filter candidates (or full range) ────────────────────────────────
    const results = [];
    const n = this.nodeIds.length;

    const check = (i) => {
      if (hasProfMin && this.profit[i] < +minProfit) return;
      if (hasProfMax && this.profit[i] > +maxProfit) return;
      if (textLC && !this.nodeIds[i].toLowerCase().includes(textLC)) return;
      results.push(i);
    };

    if (candidates) {
      for (let j = 0; j < candidates.length; j++) check(candidates[j]);
    } else {
      for (let i = 0; i < n; i++) check(i);
    }

    return results;
  }

  /**
   * Apply search results:
   *   - 0 matches  → clear, return 0
   *   - 1 match    → focus (camera + glow) + return 1
   *   - N matches  → light up all with search-result mesh + return N
   * @param {number[]} indices
   * @returns {number} match count
   */
  applySearchResults(indices) {
    this.clearSearchResults();
    this.clearFocus();

    if (!indices.length) return 0;

    if (indices.length === 1) {
      this.focusNode(this.nodeIds[indices[0]]);
      return 1;
    }

    // Multiple — glow all
    const cap = Math.min(indices.length, this._searchResultMaxCount);
    for (let j = 0; j < cap; j++) {
      const ni = indices[j];
      const s = this.scales[ni] * 1.5;
      this._dummy.position.copy(this._nodePosition(ni));
      this._dummy.scale.set(s, s, s);
      this._dummy.rotation.set(0, 0, 0);
      this._dummy.updateMatrix();
      this._searchResultMesh.setMatrixAt(j, this._dummy.matrix);
    }
    this._searchResultMesh.count = cap;
    this._searchResultMesh.instanceMatrix.needsUpdate = true;
    this._searchResultMesh.visible = true;

    return indices.length;
  }

  /** Hide the search result glow mesh. */
  clearSearchResults() {
    if (this._searchResultMesh) {
      this._searchResultMesh.visible = false;
      this._searchResultMesh.count   = 0;
    }
  }

  /**
   * Show the highlight mesh on top of the hovered node.
   * Skips work if the index hasn't changed.
   */
  setHover(nodeIndex) {
    if (nodeIndex === this._hoveredIndex) return;
    this._hoveredIndex = nodeIndex;

    if (nodeIndex < 0) {
      this._highlightMesh.visible = false;
      return;
    }

    const s = this.scales[nodeIndex] * 1.35;
    this._dummy.position.copy(this._nodePosition(nodeIndex));
    this._dummy.scale.set(s, s, s);
    this._dummy.rotation.set(0, 0, 0);
    this._dummy.updateMatrix();
    this._highlightMesh.setMatrixAt(0, this._dummy.matrix);
    this._highlightMesh.instanceMatrix.needsUpdate = true;
    this._highlightMesh.visible = true;
  }

  clearHover() {
    this.setHover(-1);
  }

  /**
   * Resolve an InstancedMesh raycast hit to a flat nodeIndex.
   * Returns null when the hit is invalid.
   */
  resolveHit(mesh, instanceId) {
    const list      = mesh.userData.nodeList;
    const nodeIndex = list?.[instanceId];
    return nodeIndex !== undefined ? nodeIndex : null;
  }

  /**
   * Return a plain object with display data for a node index.
   * Keeps the interaction layer free of direct buffer access.
   */
  getNodeData(nodeIndex) {
    return {
      nodeId:  this.nodeIds[nodeIndex],
      profit:  this.profit[nodeIndex],
      scale:   this.scales[nodeIndex],
      cluster: CLUSTER_NAMES[this.clusterIndex[nodeIndex]] ?? 'misc',
    };
  }

  /**
   * Build a flat Float32Array of [x1,y1,z1, x2,y2,z2, ...] pairs for edges.
   * Used by EdgeRenderer to construct its BufferGeometry in one pass.
   */
  buildEdgeBuffer(connections) {
    const out = [];
    connections.forEach(({ source, target }) => {
      const si = this._nodeIndexMap.get(source);
      const ti = this._nodeIndexMap.get(target);
      if (si === undefined || ti === undefined) return;
      out.push(
        this.positions[si * 3],     this.positions[si * 3 + 1], this.positions[si * 3 + 2],
        this.positions[ti * 3],     this.positions[ti * 3 + 1], this.positions[ti * 3 + 2],
      );
    });
    return new Float32Array(out);
  }

  /** Array of all cluster InstancedMeshes, used by the raycaster. */
  getClusterMeshes() {
    return [...this._clusterMeshes.values()];
  }

  /** Sorted list of all known cluster names. */
  getClusterNames() {
    return CLUSTER_NAMES;
  }

  /** Sorted list of all known subcategories. */
  getSubcategories() {
    return [...this._subcategoryIndex.keys()].sort();
  }

  dispose() {
    this._clearClusterMeshes();
    this.scene.remove(this._nodeGroup);
    if (this._highlightMesh) {
      this.scene.remove(this._highlightMesh);
      this._highlightMesh.material.dispose();
    }
    if (this._focusCenterMesh) {
      this.scene.remove(this._focusCenterMesh);
      this._focusCenterMesh.material.dispose();
    }
    if (this._focusNeighborMesh) {
      this.scene.remove(this._focusNeighborMesh);
      this._focusNeighborMesh.material.dispose();
    }
    this._clearSearchMesh();
    this._geometry.dispose();
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  _buildSearchMesh(n) {
    this._clearSearchMesh();
    const mat = new THREE.MeshStandardMaterial({
      color:             0x39ff14, // neon green — unmistakable search highlight
      emissive:          0x39ff14,
      emissiveIntensity: 1.4,
      roughness:         0.25,
      metalness:         0.3,
    });
    this._searchResultMesh = new THREE.InstancedMesh(this._geometry, mat, n);
    this._searchResultMesh.count       = 0;
    this._searchResultMesh.visible     = false;
    this._searchResultMesh.renderOrder = 3;
    this._searchResultMaxCount         = n;
    this.scene.add(this._searchResultMesh);
  }

  _clearSearchMesh() {
    if (this._searchResultMesh) {
      this.scene.remove(this._searchResultMesh);
      this._searchResultMesh.material.dispose();
      this._searchResultMesh     = null;
      this._searchResultMaxCount = 0;
    }
  }

  _buildFocusMeshes() {
    // Focused center node — very bright white-gold emissive
    const centerMat = new THREE.MeshStandardMaterial({
      color:             0xffd700,
      emissive:          0xffd700,
      emissiveIntensity: 1.8,
      roughness:         0.2,
      metalness:         0.4,
    });
    this._focusCenterMesh = new THREE.InstancedMesh(this._geometry, centerMat, 1);
    this._focusCenterMesh.visible     = false;
    this._focusCenterMesh.renderOrder = 2;
    this.scene.add(this._focusCenterMesh);

    // Neighbor glow — softer cyan emissive, up to 200 instances
    const neighborMat = new THREE.MeshStandardMaterial({
      color:             0x00e5ff,
      emissive:          0x00e5ff,
      emissiveIntensity: 0.9,
      roughness:         0.4,
      metalness:         0.2,
    });
    this._focusNeighborMesh = new THREE.InstancedMesh(this._geometry, neighborMat, 200);
    this._focusNeighborMesh.visible     = false;
    this._focusNeighborMesh.renderOrder = 2;
    this.scene.add(this._focusNeighborMesh);
  }

  _buildHighlight() {
    const mat = new THREE.MeshStandardMaterial({
      color:            0xffffff,
      emissive:         0xffffff,
      emissiveIntensity: 0.6,
      roughness:        0.4,
      metalness:        0.1,
    });
    this._highlightMesh = new THREE.InstancedMesh(this._geometry, mat, 1);
    this._highlightMesh.visible     = false;
    this._highlightMesh.renderOrder = 1;
    this.scene.add(this._highlightMesh);
  }

  _nodePosition(i) {
    return new THREE.Vector3(
      this.positions[i * 3],
      this.positions[i * 3 + 1],
      this.positions[i * 3 + 2],
    );
  }

  /** Write this._dummy's matrix for nodeIndex i (no rotation). */
  _writeDummy(i) {
    this._dummy.position.set(
      this.positions[i * 3],
      this.positions[i * 3 + 1],
      this.positions[i * 3 + 2],
    );
    const s = this.scales[i];
    this._dummy.scale.set(s, s, s);
    this._dummy.rotation.set(0, 0, 0);
    this._dummy.updateMatrix();
  }

  _clearClusterMeshes() {
    this._clusterMeshes.forEach((mesh) => {
      this._nodeGroup.remove(mesh);
      mesh.material.dispose();
    });
    this._clusterMeshes.clear();
  }
}
