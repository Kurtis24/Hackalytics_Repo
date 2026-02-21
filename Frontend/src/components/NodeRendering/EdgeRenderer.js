import * as THREE from 'three';

// Dim cluster-tinted colors for intra-cluster edges
const CLUSTER_EDGE_COLORS = {
  sports: 0x5a2020,
  quant:  0x1a4040,
  crypto: 0x4a4010,
  misc:   0x2a1a5a,
  cross:  0x1e2a3a, // cross-cluster edges
};

export class EdgeRenderer {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene  = scene;
    this._mesh  = null;
  }

  /**
   * Build a single LineSegments object from the connection list.
   * Reads positions directly from NodeRenderer's flat buffer via buildEdgeBuffer().
   *
   * @param {Array<{source: string, target: string, cluster?: string}>} connections
   * @param {import('./NodeRenderer').NodeRenderer} nodeRenderer
   */
  initialize(connections, nodeRenderer) {
    this._clear();
    if (!connections?.length) return;

    const posBuffer = nodeRenderer.buildEdgeBuffer(connections);
    if (!posBuffer.length) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(posBuffer, 3));

    // LineDashedMaterial requires computeLineDistances() to work
    const material = new THREE.LineDashedMaterial({
      color:       0x2a5a7a,
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

  dispose() {
    this._clear();
  }

  _clear() {
    if (this._mesh) {
      this.scene.remove(this._mesh);
      this._mesh.geometry.dispose();
      this._mesh.material.dispose();
      this._mesh = null;
    }
  }
}
