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

    this._animationId = null;
    window.addEventListener('resize', this._onResize);
  }

  /**
   * Feed nodes into the renderer.
   * Call this once (or again to replace the dataset).
   */
  loadNodes(nodes, connections = []) {
    this.nodeRenderer.initialize(nodes);
    this.edgeRenderer.initialize(connections, this.nodeRenderer);
    this.interactionController.refresh();
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
    this.renderer.dispose();
  }

  // ── Private ──────────────────────────────────────────────────────────────

  _onResize() {
    const w = this.canvas.clientWidth  || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }
}
