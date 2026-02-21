import * as THREE from 'three';
import { CameraController }      from './CameraController.js';
import { NodeRenderer }          from './NodeRenderer.js';
import { EdgeRenderer }          from './EdgeRenderer.js';
import { InteractionController } from './InteractionController.js';

export class SceneManager {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;

    // Store bound handler so we can remove it later
    this._onResize = this._onResize.bind(this);

    // ── Renderer ──────────────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias:        true,
      powerPreference:  'high-performance',
    });
    // Cap DPR at 2 — do NOT render at DPR 3 on Retina displays
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const w = canvas.clientWidth  || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    // false = don't override canvas CSS size; renderer sets the pixel buffer
    this.renderer.setSize(w, h, false);

    // ── Scene ─────────────────────────────────────────────────────────────
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07070f);

    // ── Camera ────────────────────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(60, w / h, 1, 40000);
    this.camera.position.set(0, 2000, 4000);

    // ── Lights (minimal per spec) ─────────────────────────────────────────
    // One directional light only — no shadows, no HDR, no additive blending
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(1, 2, 3);
    this.scene.add(dirLight);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    // ── Sub-systems ───────────────────────────────────────────────────────
    this.cameraController      = new CameraController(this.camera, canvas);
    this.nodeRenderer          = new NodeRenderer(this.scene, this.cameraController);
    this.edgeRenderer          = new EdgeRenderer(this.scene);
    this.interactionController = new InteractionController(
      this.camera,
      this.nodeRenderer,
      this.cameraController,
      canvas,
    );

    // ── Axes ──────────────────────────────────────────────────────────────
    this._axisLines = [];
    this._buildAxes();

    this._animationId = null;
    window.addEventListener('resize', this._onResize);
  }

  /**
   * Feed nodes into the renderer.
   * Call this once (or again to replace the dataset).
   */
  loadNodes(nodes, connections = []) {
    this.nodeRenderer.initialize(nodes);
    this.nodeRenderer.loadConnections(connections);
    this.edgeRenderer.initialize(connections, this.nodeRenderer);
    this.interactionController.refresh();

    // Wire focus callback: when a node is focused, update the edge overlay
    this.nodeRenderer._onFocusCallback = (nodeId) => {
      this.edgeRenderer.setFocusEdges(nodeId, this.nodeRenderer);
    };
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

    // Axis extents — match NodeRenderer scale (CONF/RISK: ±1000, profit: 80/%)
    const X_MIN = -1100, X_MAX = 1100;  // confidence axis
    const Y_MIN = -400,  Y_MAX = 800;   // profit axis  (≈ -5% to +10%)
    const Z_MIN = -1100, Z_MAX = 1100;  // risk axis

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
  }

  _onResize() {
    const w = this.canvas.clientWidth  || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }
}
