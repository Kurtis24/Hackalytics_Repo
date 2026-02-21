import * as THREE from 'three';

export class InteractionController {
  /**
   * @param {THREE.Camera}                                   camera
   * @param {import('./NodeRenderer').NodeRenderer}          nodeRenderer
   * @param {import('./CameraController').CameraController}  cameraController
   * @param {HTMLElement}                                    domElement
   */
  constructor(camera, nodeRenderer, cameraController, domElement) {
    this.camera           = camera;
    this.nodeRenderer     = nodeRenderer;
    this.cameraController = cameraController;
    this.domElement       = domElement;

    this._raycaster     = new THREE.Raycaster();
    this._mouse         = new THREE.Vector2();
    this._clusterMeshes = [];

    this._tooltip = this._createTooltip();

    // Bind once so removeEventListener can match the same reference
    this._onMouseMove  = this._onMouseMove.bind(this);
    this._onClick      = this._onClick.bind(this);
    this._onMouseLeave = this._onMouseLeave.bind(this);

    domElement.addEventListener('mousemove',  this._onMouseMove);
    domElement.addEventListener('click',      this._onClick);
    domElement.addEventListener('mouseleave', this._onMouseLeave);
  }

  /**
   * Sync cluster mesh list after NodeRenderer.initialize().
   * Must be called whenever the node set changes.
   */
  refresh() {
    this._clusterMeshes = this.nodeRenderer.getClusterMeshes();
  }

  dispose() {
    this.domElement.removeEventListener('mousemove',  this._onMouseMove);
    this.domElement.removeEventListener('click',      this._onClick);
    this.domElement.removeEventListener('mouseleave', this._onMouseLeave);
    if (this._tooltip?.parentNode) {
      document.body.removeChild(this._tooltip);
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  _createTooltip() {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position:       'fixed',
      background:     'rgba(8, 8, 20, 0.92)',
      border:         '1px solid rgba(255,255,255,0.12)',
      color:          '#e8e8f0',
      padding:        '8px 12px',
      borderRadius:   '6px',
      fontSize:       '11px',
      fontFamily:     'monospace, "Courier New"',
      pointerEvents:  'none',
      display:        'none',
      zIndex:         '9999',
      maxWidth:       '210px',
      lineHeight:     '1.7',
      boxShadow:      '0 4px 20px rgba(0,0,0,0.55)',
    });
    document.body.appendChild(el);
    return el;
  }

  _updateMouse(event) {
    const rect    = this.domElement.getBoundingClientRect();
    this._mouse.x = ((event.clientX - rect.left) / rect.width)  *  2 - 1;
    this._mouse.y = ((event.clientY - rect.top)  / rect.height) * -2 + 1;
  }

  _raycast() {
    if (!this._clusterMeshes.length) return null;
    this._raycaster.setFromCamera(this._mouse, this.camera);
    const hits = this._raycaster.intersectObjects(this._clusterMeshes, false);
    if (!hits.length) return null;
    const hit = hits[0];
    return this.nodeRenderer.resolveHit(hit.object, hit.instanceId);
  }

  _onMouseMove(event) {
    this._updateMouse(event);
    const nodeIndex = this._raycast();

    if (nodeIndex === null) {
      this.nodeRenderer.clearHover();
      this._tooltip.style.display = 'none';
      return;
    }

    this.nodeRenderer.setHover(nodeIndex);

    const d          = this.nodeRenderer.getNodeData(nodeIndex);
    const profitSign = d.profit >= 0 ? '+' : '';
    const profitCol  = d.profit >= 0 ? '#4ecdc4' : '#ff6b6b';

    this._tooltip.innerHTML =
      `<b style="color:#fff;font-size:12px">${d.nodeId}</b><br>` +
      `Cluster: <b>${d.cluster}</b><br>` +
      `Profit: <span style="color:${profitCol}">${profitSign}${d.profit.toFixed(2)}%</span><br>` +
      `Scale: ${d.scale.toFixed(2)}`;

    this._tooltip.style.display = 'block';
    this._tooltip.style.left    = `${event.clientX + 16}px`;
    this._tooltip.style.top     = `${event.clientY - 8}px`;
  }

  _onClick(event) {
    this._updateMouse(event);
    const nodeIndex = this._raycast();
    if (nodeIndex === null) {
      // Click on empty space — clear any active focus glow
      this.nodeRenderer.clearFocus();
      return;
    }
    const { nodeId } = this.nodeRenderer.getNodeData(nodeIndex);
    this.nodeRenderer.focusNode(nodeId);
  }

  _onMouseLeave() {
    this.nodeRenderer.clearHover();
    this._tooltip.style.display = 'none';
  }
}
