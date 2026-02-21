import * as THREE from 'three';
import { LineSegments2 }       from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial }         from 'three/addons/lines/LineMaterial.js';

export class EdgeRenderer {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this._mesh = null;

    // Kept for focus-edge rebuilds
    this._connections  = [];
    this._nodeRenderer = null;

    // Thick overlay for focused edges
    this._focusMesh = null;

    // Resolution needed by LineMaterial (updated on canvas resize)
    this._resolution = new THREE.Vector2(
      window.innerWidth,
      window.innerHeight,
    );
  }

  /**
   * Build a single LineSegments2 object from the connection list.
   * Reads positions directly from NodeRenderer's flat buffer via buildEdgeBuffer().
   *
   * @param {Array<{source: string, target: string}>} connections
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

    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(posBuffer);

    const material = new LineMaterial({
      color:      0x3a3a4a,
      linewidth:  0.8,          // CSS pixels — thin base connectors
      resolution: this._resolution,
    });

    this._mesh = new LineSegments2(geometry, material);
    this._mesh.renderOrder = -1;
    this.scene.add(this._mesh);
  }

  /**
   * Replace base connectors with thick cyan lines for the focused node's edges.
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

    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(posBuffer);

    const material = new LineMaterial({
      color:      0x00e5ff,
      linewidth:  3,            // CSS pixels — clearly thicker on focus
      resolution: this._resolution,
    });

    this._focusMesh = new LineSegments2(geometry, material);
    this._focusMesh.renderOrder = 1;
    this.scene.add(this._focusMesh);
  }

  /** Called by SceneManager on canvas resize so LineMaterial stays correct. */
  onResize(w, h) {
    this._resolution.set(w, h);
    if (this._mesh)      this._mesh.material.resolution.set(w, h);
    if (this._focusMesh) this._focusMesh.material.resolution.set(w, h);
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
