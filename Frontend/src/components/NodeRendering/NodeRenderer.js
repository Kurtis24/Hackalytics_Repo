import * as THREE from 'three';

// ─── Axis → world-space mapping ───────────────────────────────────────────────
// confidence ∈ [0, 1]  → X  ∈ [-500, 500]
// profit (%)           → Y  (40 world-units per %)
// risk       ∈ [0, 1]  → Z  ∈ [-500, 500]
const CONF_SCALE  = 1000;   // world units across full confidence range
const CONF_OFFSET = -500;   // confidence=0 starts here
const PROFIT_SCALE = 40;    // world units per % profit
const RISK_SCALE  = 1000;
const RISK_OFFSET = -500;

// ─── Sport index ──────────────────────────────────────────────────────────────
const SPORT_INDEX = { baseball: 0, football: 1, basketball: 2, hockey: 3 };

// ─── NodeRenderer ─────────────────────────────────────────────────────────────
export class NodeRenderer {
  /**
   * @param {THREE.Scene}          scene
   * @param {import('./CameraController').CameraController} cameraController
   */
  constructor(scene, cameraController) {
    this.scene            = scene;
    this.cameraController = cameraController;

    // Shared sphere geometry
    this._geometry = new THREE.SphereGeometry(1, 16, 16);

    // ── Flat buffers (allocated in initialize) ────────────────────────────
    this.positions   = null; // Float32Array  [x,y,z per node]
    this.scales      = null; // Float32Array  [scale per node]
    this.profit      = null; // Float32Array  [profit_percent per node]
    this.confidence  = null; // Float32Array  [0-1 per node]
    this.sports      = null; // Uint8Array    [sport index 0-3 per node]
    this.risk        = null; // Float32Array  [0-1 per node]
    this.live        = null; // Uint8Array    [0/1 per node]
    this.nodeIds     = [];   // string[]
    this.rawData     = [];   // raw node data for extended search

    // ── Lookup maps ───────────────────────────────────────────────────────
    this._nodeIndexMap = new Map(); // nodeId → flat index
    this._liveIndices  = [];       // nodeIndex[] of live nodes (for fast live filter)

    // ── Single InstancedMesh (all nodes, per-instance color) ──────────────
    this._nodeMesh = null;

    // ── Highlight (single-instance overlay mesh) ──────────────────────────
    this._highlightMesh = null;
    this._hoveredIndex  = -1;

    // ── Focus glow meshes ─────────────────────────────────────────────────
    this._focusCenterMesh   = null; // 1 instance  — clicked node (gold)
    this._focusNeighborMesh = null; // up to 200   — immediate neighbors (cyan)
    this._focusedNodeId     = null;

    // ── Search visibility ─────────────────────────────────────────────────
    // null = all nodes visible; Set<number> = only these nodeIndices visible
    this._searchVisibleSet = null;

    // ── Live ring mesh (horizontal torus around each live node) ───────────
    this._liveRingMesh     = null;
    this._liveRingGeometry = null;

    // ── Adjacency map ─────────────────────────────────────────────────────
    this._adjacency = new Map(); // nodeId → Set<nodeId>

    // ── Focus callback (wired by SceneManager) ────────────────────────────
    this._onFocusCallback = null; // (nodeId: string|null) => void

    // Reusable objects (never added to scene)
    this._dummy  = new THREE.Object3D();
    this._colorA = new THREE.Color();
    this._colorB = new THREE.Color();

    this._buildHighlight();
    this._buildFocusMeshes();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Build the InstancedMesh from the node array.
   * Positions nodes on the (confidence, profit, risk) axes.
   * @param {{ node_id: string, sport: string, live: boolean, metrics: { confidence, profit, risk, volume } }[]} nodes
   */
  initialize(nodes) {
    this._clearNodeMesh();
    this._clearLiveRings();
    this._searchVisibleSet = null;
    this._nodeIndexMap.clear();
    this._liveIndices = [];
    this._hoveredIndex = -1;
    this._highlightMesh.visible     = false;
    this._focusCenterMesh.visible   = false;
    this._focusNeighborMesh.visible = false;

    const n = nodes.length;
    if (n === 0) {
      this.positions  = new Float32Array(0);
      this.scales     = new Float32Array(0);
      this.profit     = new Float32Array(0);
      this.confidence = new Float32Array(0);
      this.risk       = new Float32Array(0);
      this.live       = new Uint8Array(0);
      this.sports     = new Uint8Array(0);
      this.nodeIds    = [];
      this.rawData    = [];
      return;
    }
    this.positions  = new Float32Array(n * 3);
    this.scales     = new Float32Array(n);
    this.profit     = new Float32Array(n);
    this.confidence = new Float32Array(n);
    this.risk       = new Float32Array(n);
    this.live       = new Uint8Array(n);
    this.sports     = new Uint8Array(n);
    this.nodeIds    = new Array(n);
    this.rawData    = new Array(n);

    // ── Pass 1: fill flat buffers & build indices ─────────────────────────
    for (let i = 0; i < n; i++) {
      const node = nodes[i];
      const m    = node.metrics ?? {};

      this.nodeIds[i]    = node.node_id;
      this.rawData[i]    = node.rawData || {};
      this._nodeIndexMap.set(node.node_id, i);

      const conf   = Math.min(0.99, Math.max(0, m.confidence ?? 0.5));
      const prof   = m.profit    ?? 0;
      const rsk    = Math.min(0.99, Math.max(0, m.risk       ?? 0.5));
      const vol    = m.volume    ?? 50000;
      const isLive = !!node.live;

      this.confidence[i] = conf;
      this.profit[i]     = prof;
      this.risk[i]       = rsk;
      this.live[i]       = isLive ? 1 : 0;
      this.sports[i]     = SPORT_INDEX[node.sport] ?? 0;

      // Position on 3D axes
      this.positions[i * 3]     = conf * CONF_SCALE  + CONF_OFFSET;
      this.positions[i * 3 + 1] = prof * PROFIT_SCALE;
      this.positions[i * 3 + 2] = rsk  * RISK_SCALE  + RISK_OFFSET;

      // Scale from volume — more dramatic size spread
      // vol range: ~50 000 – 500 000  →  scale range: ~2 – 12
      this.scales[i] = 2 + Math.pow(vol / 500000, 0.4) * 10;

      if (isLive) this._liveIndices.push(i);
    }

    // ── Pass 2: build single InstancedMesh with per-instance color ────────
    const mat = new THREE.MeshStandardMaterial({
      color:     0xffffff,
      roughness: 0.4,
      metalness: 0.3,
      emissive:  0x000000,
      emissiveIntensity: 0.2,
    });
    this._nodeMesh = new THREE.InstancedMesh(this._geometry, mat, n);
    this._nodeMesh.castShadow = true;
    this._nodeMesh.receiveShadow = true;
    this._nodeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const color = new THREE.Color();
    for (let i = 0; i < n; i++) {
      this._writeDummy(i);
      this._nodeMesh.setMatrixAt(i, this._dummy.matrix);
      this._getNodeColor(i, color);
      this._nodeMesh.setColorAt(i, color);
    }
    if (this._nodeMesh) {
      this._nodeMesh.instanceMatrix.needsUpdate = true;
      if (this._nodeMesh.instanceColor) this._nodeMesh.instanceColor.needsUpdate = true;
    }
    this.scene.add(this._nodeMesh);

    this._buildLiveRings();
  }

  /**
   * Update a single node's data in-place.
   */
  updateNode(node) {
    const i = this._nodeIndexMap.get(node.node_id);
    if (i === undefined) return;

    const m    = node.metrics ?? {};
    const conf = Math.min(0.99, Math.max(0, m.confidence ?? this.confidence[i]));
    const prof = m.profit ?? this.profit[i];
    const rsk  = Math.min(0.99, Math.max(0, m.risk       ?? this.risk[i]));
    const vol  = m.volume ?? 1000;

    this.confidence[i] = conf;
    this.profit[i]     = prof;
    this.risk[i]       = rsk;
    this.live[i]       = node.live ? 1 : 0;
    this.scales[i]     = 2 + Math.pow(vol / 500000, 0.4) * 10;

    this.positions[i * 3]     = conf * CONF_SCALE  + CONF_OFFSET;
    this.positions[i * 3 + 1] = prof * PROFIT_SCALE;
    this.positions[i * 3 + 2] = rsk  * RISK_SCALE  + RISK_OFFSET;

    this._writeDummy(i);
    if (this._nodeMesh) {
      this._nodeMesh.setMatrixAt(i, this._dummy.matrix);
      this._nodeMesh.instanceMatrix.needsUpdate = true;
      const color = new THREE.Color();
      this._getNodeColor(i, color);
      this._nodeMesh.setColorAt(i, color);
      if (this._nodeMesh.instanceColor) this._nodeMesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * Build the adjacency map from a connections array.
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
   * Animate camera to focus on a node. Applies focus glow and fires callback.
   */
  focusNode(nodeId) {
    const i = this._nodeIndexMap.get(nodeId);
    if (i === undefined) return;
    this.cameraController.focusNode(this._nodePosition(i));
    this._applyFocusGlow(nodeId);
    if (this._onFocusCallback) this._onFocusCallback(nodeId);
  }

  clearFocus() {
    this._focusedNodeId             = null;
    this._focusCenterMesh.visible   = false;
    this._focusNeighborMesh.visible = false;
    if (this._onFocusCallback) this._onFocusCallback(null);
  }

  // ── Search API ──────────────────────────────────────────────────────────────

  /**
   * Search nodes by multiple criteria. Returns matching nodeIndices.
   */
  search(criteria = {}) {
    const { text, live, minProfit, maxProfit, minConf, maxConf, minRisk, maxRisk, 
            sport, homeTeam, awayTeam, marketType, sportsbook, minVolume, maxVolume, dateFrom, dateTo } = criteria;
    const textLC     = text?.trim().toLowerCase();
    const hasProfMin = minProfit !== undefined && minProfit !== '';
    const hasProfMax = maxProfit !== undefined && maxProfit !== '';
    const hasConfMin = minConf   !== undefined && minConf   !== '';
    const hasConfMax = maxConf   !== undefined && maxConf   !== '';
    const hasRiskMin = minRisk   !== undefined && minRisk   !== '';
    const hasRiskMax = maxRisk   !== undefined && maxRisk   !== '';
    const hasVolMin  = minVolume !== undefined && minVolume !== '';
    const hasVolMax  = maxVolume !== undefined && maxVolume !== '';

    const candidates = (live === true) ? this._liveIndices : null;
    const results = [];
    const n       = this.nodeIds.length;

    const check = (i) => {
      if (live === true  && !this.live[i]) return;
      if (live === false &&  this.live[i]) return;
      if (hasProfMin && this.profit[i]     < +minProfit) return;
      if (hasProfMax && this.profit[i]     > +maxProfit) return;
      if (hasConfMin && this.confidence[i] < +minConf)   return;
      if (hasConfMax && this.confidence[i] > +maxConf)   return;
      if (hasRiskMin && this.risk[i]       < +minRisk)   return;
      if (hasRiskMax && this.risk[i]       > +maxRisk)   return;
      if (textLC && !this.nodeIds[i].toLowerCase().includes(textLC)) return;

      const raw = this.rawData[i] || {};
      const sportIndex = this.sports[i];
      const sportName = ['baseball', 'football', 'basketball', 'hockey'][sportIndex];
      
      if (sport && sport !== sportName) return;
      if (homeTeam && !raw.home_team?.toLowerCase().includes(homeTeam.toLowerCase())) return;
      if (awayTeam && !raw.away_team?.toLowerCase().includes(awayTeam.toLowerCase())) return;
      if (marketType && raw.market_type !== marketType) return;
      if (sportsbook && !raw.sportsbooks?.some(sb => sb.name.toLowerCase().includes(sportsbook.toLowerCase()))) return;
      
      const nodeVolume = raw.volume || this.scales[i];
      if (hasVolMin && nodeVolume < +minVolume) return;
      if (hasVolMax && nodeVolume > +maxVolume) return;
      
      if (dateFrom || dateTo) {
        const nodeDate = raw.date ? new Date(raw.date) : null;
        if (!nodeDate) return;
        if (dateFrom && nodeDate < new Date(dateFrom)) return;
        if (dateTo && nodeDate > new Date(dateTo)) return;
      }

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
   * Show only the matching nodes; hide everything else.
   * Single result → also fly-to + focus glow.
   * @returns {number} match count
   */
  applySearchResults(indices) {
    this.clearSearchResults();
    this.clearFocus();
    if (!indices.length) return 0;

    this._searchVisibleSet = new Set(indices);
    this._setNodeVisibility(this._searchVisibleSet);

    if (indices.length === 1) {
      this.focusNode(this.nodeIds[indices[0]]);
    }

    return indices.length;
  }

  /** Restore all nodes to visible. */
  clearSearchResults() {
    if (!this._searchVisibleSet) return;
    this._searchVisibleSet = null;
    this._setNodeVisibility(null);
  }

  /**
   * Filter a connections array to only those where both endpoints are visible.
   * Returns the full array when no search is active.
   * @param {Array<{source: string, target: string}>} connections
   */
  filterConnectionsByVisibility(connections) {
    if (!this._searchVisibleSet) return connections;
    return connections.filter(({ source, target }) => {
      const si = this._nodeIndexMap.get(source);
      const ti = this._nodeIndexMap.get(target);
      return si !== undefined && ti !== undefined &&
             this._searchVisibleSet.has(si) && this._searchVisibleSet.has(ti);
    });
  }

  // ── Hover ────────────────────────────────────────────────────────────────────

  setHover(nodeIndex) {
    if (nodeIndex === this._hoveredIndex) return;
    this._hoveredIndex = nodeIndex;
    if (nodeIndex < 0) { this._highlightMesh.visible = false; return; }
    if (!this._nodeMesh || !this.nodeIds.length || nodeIndex >= this.nodeIds.length) return;

    const s = this.scales[nodeIndex] * 1.35;
    this._dummy.position.copy(this._nodePosition(nodeIndex));
    this._dummy.scale.set(s, s, s);
    this._dummy.rotation.set(0, 0, 0);
    this._dummy.updateMatrix();
    this._highlightMesh.setMatrixAt(0, this._dummy.matrix);
    if (this._highlightMesh.instanceMatrix) this._highlightMesh.instanceMatrix.needsUpdate = true;
    this._highlightMesh.visible = true;
  }

  clearHover() { this.setHover(-1); }

  // ── Raycasting ───────────────────────────────────────────────────────────────

  getClusterMeshes() {
    return this._nodeMesh ? [this._nodeMesh] : [];
  }

  resolveHit(mesh, instanceId) {
    if (instanceId === undefined || instanceId === null) return null;
    return instanceId < this.nodeIds.length ? instanceId : null;
  }

  getNodeData(nodeIndex) {
    const raw = this.rawData[nodeIndex] || {};
    const sportIndex = this.sports[nodeIndex];
    const sportName = ['baseball', 'football', 'basketball', 'hockey'][sportIndex];
    
    return {
      nodeId:     this.nodeIds[nodeIndex],
      profit:     this.profit[nodeIndex],
      confidence: this.confidence[nodeIndex],
      risk:       this.risk[nodeIndex],
      scale:      this.scales[nodeIndex],
      live:       !!this.live[nodeIndex],
      sport:      sportName,
      homeTeam:   raw.home_team,
      awayTeam:   raw.away_team,
      marketType: raw.market_type,
      date:       raw.date,
      volume:     raw.volume,
      sportsbooks: raw.sportsbooks || [],
    };
  }

  /**
   * Build a flat Float32Array of [x1,y1,z1, x2,y2,z2, ...] pairs for edges.
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

  dispose() {
    this._clearNodeMesh();
    this._clearLiveRings();
    if (this._highlightMesh)     { this.scene.remove(this._highlightMesh);     this._highlightMesh.material.dispose(); }
    if (this._focusCenterMesh)   { this.scene.remove(this._focusCenterMesh);   this._focusCenterMesh.material.dispose(); }
    if (this._focusNeighborMesh) { this.scene.remove(this._focusNeighborMesh); this._focusNeighborMesh.material.dispose(); }
    this._geometry.dispose();
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  /**
   * Color scheme (sport-based — live nodes use sport color + ring overlay):
   *   baseball   → deep orange  #ff7043
   *   football   → sky blue     #42a5f5
   *   basketball → amber        #ffca28
   *   hockey     → ice cyan     #26c6da
   */
  _getNodeColor(i, out) {
    switch (this.sports[i]) {
      case 0: out.setHex(0xff7043); break; // baseball   — deep orange
      case 1: out.setHex(0x42a5f5); break; // football   — sky blue
      case 2: out.setHex(0xffca28); break; // basketball — amber
      case 3: out.setHex(0x26c6da); break; // hockey     — ice cyan
      default: out.setHex(0xffffff);
    }
  }

  /**
   * Show/hide nodes by scaling instance matrices.
   * visibleSet = null → all visible; Set<number> → only those indices visible.
   * Also syncs live ring visibility.
   */
  _setNodeVisibility(visibleSet) {
    if (!this._nodeMesh) return;
    const n = this.nodeIds.length;
    for (let i = 0; i < n; i++) {
      this._dummy.position.set(
        this.positions[i * 3],
        this.positions[i * 3 + 1],
        this.positions[i * 3 + 2],
      );
      const show = !visibleSet || visibleSet.has(i);
      const s    = show ? this.scales[i] : 0;
      this._dummy.scale.set(s, s, s);
      this._dummy.rotation.set(0, 0, 0);
      this._dummy.updateMatrix();
      this._nodeMesh.setMatrixAt(i, this._dummy.matrix);
    }
    this._nodeMesh.instanceMatrix.needsUpdate = true;

    // Sync live ring visibility
    if (this._liveRingMesh && this._liveRingMesh.instanceMatrix) {
      for (let j = 0; j < this._liveIndices.length; j++) {
        const i    = this._liveIndices[j];
        const show = !visibleSet || visibleSet.has(i);
        const s    = show ? this.scales[i] * 1.5 : 0;
        this._dummy.position.copy(this._nodePosition(i));
        this._dummy.scale.set(s, s, s);
        this._dummy.rotation.set(Math.PI / 2, 0, 0);
        this._dummy.updateMatrix();
        this._liveRingMesh.setMatrixAt(j, this._dummy.matrix);
      }
      this._liveRingMesh.instanceMatrix.needsUpdate = true;
    }
  }

  _applyFocusGlow(nodeId) {
    this._focusedNodeId = nodeId;

    const ci = this._nodeIndexMap.get(nodeId);
    if (ci !== undefined) {
      const s = this.scales[ci] * 1.6;
      this._dummy.position.copy(this._nodePosition(ci));
      this._dummy.scale.set(s, s, s);
      this._dummy.rotation.set(0, 0, 0);
      this._dummy.updateMatrix();
      this._focusCenterMesh.setMatrixAt(0, this._dummy.matrix);
      if (this._focusCenterMesh.instanceMatrix) this._focusCenterMesh.instanceMatrix.needsUpdate = true;
      this._focusCenterMesh.count   = 1;
      this._focusCenterMesh.visible = true;
    }

    const neighbors   = this._adjacency.get(nodeId) ?? new Set();
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
      this._focusNeighborMesh.setMatrixAt(instIdx++, this._dummy.matrix);
    });
    this._focusNeighborMesh.count   = instIdx;
    if (this._focusNeighborMesh.instanceMatrix) this._focusNeighborMesh.instanceMatrix.needsUpdate = true;
    this._focusNeighborMesh.visible = instIdx > 0;
  }

  _nodePosition(i) {
    return new THREE.Vector3(
      this.positions[i * 3],
      this.positions[i * 3 + 1],
      this.positions[i * 3 + 2],
    );
  }

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

  _clearNodeMesh() {
    if (this._nodeMesh) {
      this.scene.remove(this._nodeMesh);
      this._nodeMesh.material.dispose();
      this._nodeMesh = null;
    }
  }

  /**
   * Build a horizontal torus ring (XZ plane) around every live node.
   */
  _buildLiveRings() {
    const liveCount = this._liveIndices.length;
    if (!liveCount) return;

    this._liveRingGeometry = new THREE.TorusGeometry(1, 0.045, 6, 48);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });

    this._liveRingMesh = new THREE.InstancedMesh(this._liveRingGeometry, mat, liveCount);

    for (let j = 0; j < liveCount; j++) {
      const i = this._liveIndices[j];
      const s = this.scales[i] * 1.5;
      this._dummy.position.copy(this._nodePosition(i));
      this._dummy.scale.set(s, s, s);
      this._dummy.rotation.set(Math.PI / 2, 0, 0);
      this._dummy.updateMatrix();
      this._liveRingMesh.setMatrixAt(j, this._dummy.matrix);
    }
    if (this._liveRingMesh.instanceMatrix) this._liveRingMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this._liveRingMesh);
  }

  _clearLiveRings() {
    if (this._liveRingMesh) {
      this.scene.remove(this._liveRingMesh);
      this._liveRingMesh.material.dispose();
      this._liveRingMesh = null;
    }
    if (this._liveRingGeometry) {
      this._liveRingGeometry.dispose();
      this._liveRingGeometry = null;
    }
  }

  _buildFocusMeshes() {
    // Focused center node — gold
    this._focusCenterMesh = new THREE.InstancedMesh(this._geometry, new THREE.MeshStandardMaterial({
      color: 0xffd700, emissive: 0xffd700, emissiveIntensity: 1.8, roughness: 0.2, metalness: 0.4,
    }), 1);
    this._focusCenterMesh.visible     = false;
    this._focusCenterMesh.renderOrder = 2;
    this.scene.add(this._focusCenterMesh);

    // Neighbor glow — cyan
    this._focusNeighborMesh = new THREE.InstancedMesh(this._geometry, new THREE.MeshStandardMaterial({
      color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.2,
    }), 200);
    this._focusNeighborMesh.visible     = false;
    this._focusNeighborMesh.renderOrder = 2;
    this.scene.add(this._focusNeighborMesh);
  }

  _buildHighlight() {
    this._highlightMesh = new THREE.InstancedMesh(this._geometry, new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.1,
    }), 1);
    this._highlightMesh.visible     = false;
    this._highlightMesh.renderOrder = 1;
    this.scene.add(this._highlightMesh);
  }
}
