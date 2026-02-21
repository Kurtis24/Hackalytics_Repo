import * as THREE from 'three';

// ─── Cluster configuration ────────────────────────────────────────────────────
const CLUSTERS = {
  sports: { color: 0xff6b6b, center: [-1000,  0,     0] },
  quant:  { color: 0x4ecdc4, center: [ 1400,  0,     0] },
  crypto: { color: 0xf7d794, center: [    0,  0,  1200] },
  // basketball:   { color: 0xa29bfe, center: [    0,  0, -1000] },
  // soccer:   { color: 0xa29bfe, center: [    0,  0, -1000] },
  // F1:   { color: 0xa29bfe, center: [    0,  0, -1000] },
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
    this.positions    = null; // Float32Array  [x,y,z per node]
    this.scales       = null; // Float32Array  [scale per node]
    this.profit       = null; // Float32Array  [profit_percent per node]
    this.clusterIndex = null; // Uint16Array   [clusterIdx per node]
    this.nodeIds      = [];   // string[]

    // ── Lookup maps ───────────────────────────────────────────────────────
    this._nodeIndexMap     = new Map(); // nodeId → flat index
    this._clusterNodeLists = new Map(); // clusterName → nodeIndex[]
    this._instanceInfo     = new Map(); // nodeIndex → { mesh, instanceIndex, clusterName }

    // ── Per-cluster InstancedMeshes ───────────────────────────────────────
    this._clusterMeshes = new Map(); // clusterName → InstancedMesh

    // ── Highlight (single-instance overlay mesh) ──────────────────────────
    this._highlightMesh  = null;
    this._hoveredIndex   = -1;

    // Reusable Object3D for matrix writes (never added to scene)
    this._dummy = new THREE.Object3D();

    this._buildHighlight();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Build all InstancedMeshes from the node array.
   * Must be called once before rendering; call again to replace data.
   * @param {import('./ClaudeREADME.md').ArbNode[]} nodes
   */
  initialize(nodes) {
    this._clearClusterMeshes();
    this._nodeIndexMap.clear();
    this._clusterNodeLists.clear();
    this._instanceInfo.clear();
    this._hoveredIndex = -1;
    this._highlightMesh.visible = false;

    const n = nodes.length;
    this.positions    = new Float32Array(n * 3);
    this.scales       = new Float32Array(n);
    this.profit       = new Float32Array(n);
    this.clusterIndex = new Uint16Array(n);
    this.nodeIds      = new Array(n);

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

      this.nodeIds[i] = node.node_id;
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
      if (!this._clusterNodeLists.has(clName)) {
        this._clusterNodeLists.set(clName, []);
      }
      this._clusterNodeLists.get(clName).push(i);
    }

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
   * Animate camera to focus on a node by its ID.
   */
  focusNode(nodeId) {
    const i = this._nodeIndexMap.get(nodeId);
    if (i === undefined) return;
    this.cameraController.focusNode(this._nodePosition(i));
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

  dispose() {
    this._clearClusterMeshes();
    this.scene.remove(this._nodeGroup);
    if (this._highlightMesh) {
      this.scene.remove(this._highlightMesh);
      this._highlightMesh.material.dispose();
    }
    this._geometry.dispose();
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

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
