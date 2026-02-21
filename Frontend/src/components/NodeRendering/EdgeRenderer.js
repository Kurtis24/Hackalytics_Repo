import * as THREE from 'three';

export class EdgeRenderer {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene  = scene;
    this._mesh  = null;

    // Kept for focus-edge rebuilds
    this._connections   = [];
    this._nodeRenderer  = null;

    // Solid bright overlay for focused edges
    this._focusMesh = null;
  }

  /**
   * Build a single LineSegments object from the connection list.
   * Reads positions directly from NodeRenderer's flat buffer via buildEdgeBuffer().
   *
   * @param {Array<{source: string, target: string, cluster?: string}>} connections
   * @param {import('./NodeRenderer').NodeRenderer} nodeRenderer
   */
  initialize(connections, nodeRenderer) {
    this._connections  = connections ?? [];
    this._nodeRenderer = nodeRenderer;
    this._clear();
    this._clearFocusMesh();
    if (!connections?.length) return;

    const posBuffer = nodeRenderer.buildEdgeBuffer(connections);
    if (!posBuffer.length) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(posBuffer, 3));

    // LineDashedMaterial requires computeLineDistances() to work
    const material = new THREE.LineDashedMaterial({
      color:       0x888888,
      dashSize:    12,
      gapSize:     20,
      opacity:     0.35,
      transparent: true,
    });

    this._mesh = new THREE.LineSegments(geometry, material);
    this._mesh.computeLineDistances(); // required for dashing
    this._mesh.renderOrder = -1;
    this.scene.add(this._mesh);
  }

  /**
   * Highlight edges connected to focusedNodeId as solid bright lines.
   * @param {string|null} nodeId
   * @param {import('./NodeRenderer').NodeRenderer} nodeRenderer
   */
  setFocusEdges(nodeId, nodeRenderer) {
    this._clearFocusMesh();
    if (!nodeId || !this._connections.length) return;

    const focused = this._connections.filter(
      ({ source, target }) => source === nodeId || target === nodeId,
    );
    if (!focused.length) return;

    const posBuffer = nodeRenderer.buildEdgeBuffer(focused);
    if (!posBuffer.length) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(posBuffer, 3));

    const material = new THREE.LineBasicMaterial({
      color:       0x00e5ff,
      opacity:     0.95,
      transparent: true,
      linewidth:   1, // WebGL ignores linewidth > 1 on most GPUs; kept for spec
    });

    this._focusMesh = new THREE.LineSegments(geometry, material);
    this._focusMesh.renderOrder = 1;
    this.scene.add(this._focusMesh);
  }

  clearFocusEdges() {
    this._clearFocusMesh();
  }

  dispose() {
    this._clear();
    this._clearFocusMesh();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  _clear() {
    if (this._mesh) {
      this.scene.remove(this._mesh);
      this._mesh.geometry.dispose();
      this._mesh.material.dispose();
      this._mesh = null;
    }
  }

  _clearFocusMesh() {
    if (this._focusMesh) {
      this.scene.remove(this._focusMesh);
      this._focusMesh.geometry.dispose();
      this._focusMesh.material.dispose();
      this._focusMesh = null;
    }
  }
}
