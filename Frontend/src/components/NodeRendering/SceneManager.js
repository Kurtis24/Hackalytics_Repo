import * as THREE from 'three';
import { CameraController }      from './CameraController.js';
import { NodeRenderer }          from './NodeRenderer.js';
import { EdgeRenderer }          from './EdgeRenderer.js';
import { InteractionController } from './InteractionController.js';

export class SceneManager {
  /** 
   * @param {HTMLCanvasElement} canvas 
   * @param {Function} onNodeSelect
   */
  constructor(canvas, onNodeSelect = null) {
    this.canvas = canvas;

    // Store bound handler so we can remove it later
    this._onResize = this._onResize.bind(this);

    // ── Renderer ──────────────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias:        true,
      powerPreference:  'high-performance',
      alpha:            true,
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    // Cap DPR at 2 — do NOT render at DPR 3 on Retina displays
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const w = canvas.clientWidth  || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    // false = don't override canvas CSS size; renderer sets the pixel buffer
    this.renderer.setSize(w, h, false);

    // ── Scene ─────────────────────────────────────────────────────────────
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07070f);
    this.scene.fog = new THREE.Fog(0x07070f, 2000, 5000);

    // ── Camera ────────────────────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(60, w / h, 1, 40000);
    this.camera.position.set(0, 800, 1500);

    // ── Enhanced lighting for 3D depth ────────────────────────────────────
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
    keyLight.position.set(5, 10, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x4080ff, 0.8);
    fillLight.position.set(-5, 3, -5);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xff8040, 0.6);
    rimLight.position.set(0, -5, -10);
    this.scene.add(rimLight);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.3));

    // ── Sub-systems ───────────────────────────────────────────────────────
    this.cameraController      = new CameraController(this.camera, canvas);
    this.nodeRenderer          = new NodeRenderer(this.scene, this.cameraController);
    this.edgeRenderer          = new EdgeRenderer(this.scene);
    this.interactionController = new InteractionController(
      this.camera,
      this.nodeRenderer,
      this.cameraController,
      canvas,
      onNodeSelect,
    );

    // ── Axes ──────────────────────────────────────────────────────────────
    this._axisLines = [];
    this._axisLabels = [];
    this._buildAxes();

    this._animationId   = null;
    this._allConnections = [];
    window.addEventListener('resize', this._onResize);
  }

  /**
   * Feed nodes into the renderer.
   * Call this once (or again to replace the dataset).
   */
  loadNodes(nodes, connections = []) {
    this._allConnections = connections;
    this.nodeRenderer.initialize(nodes);
    this.nodeRenderer.loadConnections(connections);
    this.edgeRenderer.initialize(connections, this.nodeRenderer);
    this.interactionController.refresh();

    // Wire focus callback: when a node is focused, update the edge overlay
    this.nodeRenderer._onFocusCallback = (nodeId) => {
      this.edgeRenderer.setFocusEdges(nodeId, this.nodeRenderer);
    };

    // Frame all nodes on initial load
    if (nodes.length > 0) {
      const positions = [];
      for (let i = 0; i < nodes.length; i++) {
        const x = this.nodeRenderer.positions[i * 3];
        const y = this.nodeRenderer.positions[i * 3 + 1];
        const z = this.nodeRenderer.positions[i * 3 + 2];
        positions.push(new THREE.Vector3(x, y, z));
      }
      this.cameraController.framePositions(positions);
    }
  }

  /**
   * Apply search: hide non-matching nodes and rebuild edges for visible nodes only.
   * @param {number[]} indices — nodeIndex[] from NodeRenderer.search()
   * @param {boolean} reframeCamera — whether to reposition camera to frame the results
   * @returns {number} match count
   */
  applySearch(indices, reframeCamera = false) {
    const count = this.nodeRenderer.applySearchResults(indices);
    const visibleConns = this.nodeRenderer.filterConnectionsByVisibility(this._allConnections);
    this.edgeRenderer.initialize(visibleConns, this.nodeRenderer);

    // Reframe camera to show filtered results
    if (reframeCamera && indices.length > 1) {
      const positions = indices.map(i => {
        const x = this.nodeRenderer.positions[i * 3];
        const y = this.nodeRenderer.positions[i * 3 + 1];
        const z = this.nodeRenderer.positions[i * 3 + 2];
        return new THREE.Vector3(x, y, z);
      });
      this.cameraController.framePositions(positions);
    }

    return count;
  }

  /** Restore all nodes and edges. */
  clearSearch() {
    this.nodeRenderer.clearSearchResults();
    this.nodeRenderer.clearFocus();
    this.edgeRenderer.initialize(this._allConnections, this.nodeRenderer);
  }

  /** Start the render loop. */
  start() {
    const loop = () => {
      this._animationId = requestAnimationFrame(loop);
      // Animation loop ONLY does:
      //   1. update camera / controls
      //   2. render
      // No node iteration, no matrix recomputation, no layout work.
      this.cameraController.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  dispose() {
    if (this._animationId !== null) {
      cancelAnimationFrame(this._animationId);
      this._animationId = null;
    }
    window.removeEventListener('resize', this._onResize);
    this.interactionController.dispose();
    this.edgeRenderer.dispose();
    this.nodeRenderer.dispose();
    this.cameraController.dispose();
    this._axisLines.forEach(({ line, geo, mat }) => {
      this.scene.remove(line);
      geo.dispose();
      mat.dispose();
    });
    this._axisLabels.forEach((sprite) => {
      this.scene.remove(sprite);
      sprite.material.map.dispose();
      sprite.material.dispose();
    });
    this.renderer.dispose();
  }

  // ── Private ──────────────────────────────────────────────────────────────

  /**
   * Draw white X / Y / Z axes spanning the full node space, with tick marks.
   *
   * World-space mapping (from NodeRenderer constants):
   *   confidence ∈ [0,1]  → X ∈ [-2000, 2000]   (CONF_SCALE=4000, CONF_OFFSET=-2000)
   *   profit (%)          → Y  (200 world-units per %)
   *   risk       ∈ [0,1]  → Z ∈ [-2000, 2000]
   */
  _buildAxes() {
    const mat = new THREE.LineBasicMaterial({
      color:       0xffffff,
      opacity:     0.25,
      transparent: true,
    });

    // Axis extents — match NodeRenderer scale (CONF/RISK: ±500, profit: 40/%)
    const X_MIN = -550, X_MAX = 550;   // confidence axis
    const Y_MIN = -250, Y_MAX = 400;   // profit axis  (≈ -6% to +10%)
    const Z_MIN = -550, Z_MAX = 550;   // risk axis

    const axes = [
      [new THREE.Vector3(X_MIN, 0, 0), new THREE.Vector3(X_MAX, 0, 0)],
      [new THREE.Vector3(0, Y_MIN, 0), new THREE.Vector3(0, Y_MAX, 0)],
      [new THREE.Vector3(0, 0, Z_MIN), new THREE.Vector3(0, 0, Z_MAX)],
    ];

    axes.forEach(([start, end]) => {
      const geo  = new THREE.BufferGeometry().setFromPoints([start, end]);
      const line = new THREE.Line(geo, mat);
      this.scene.add(line);
      this._axisLines.push({ line, geo, mat });
    });

    // Add axis labels
    const labels = [
      { text: 'Confidence', position: new THREE.Vector3(X_MAX + 80, 0, 0), color: 0xffffff },
      { text: 'Profit', position: new THREE.Vector3(0, Y_MAX + 80, 0), color: 0xffffff },
      { text: 'Risk', position: new THREE.Vector3(0, 0, Z_MAX + 80), color: 0xffffff },
    ];

    labels.forEach(({ text, position, color }) => {
      const sprite = this._createTextSprite(text, color);
      sprite.position.copy(position);
      sprite.scale.set(100, 50, 1);
      this.scene.add(sprite);
      this._axisLabels.push(sprite);
    });
  }

  _createTextSprite(text, color) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 256;

    context.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    context.font = 'bold 80px monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, 256, 128);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.8,
    });

    return new THREE.Sprite(material);
  }

  _onResize() {
    const w = this.canvas.clientWidth  || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.edgeRenderer.onResize(w, h);
  }
}
