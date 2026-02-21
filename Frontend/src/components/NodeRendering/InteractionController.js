import * as THREE from 'three';
import { calculateArbitrageMetrics } from '../../utils/arbitrageCalculations.js';

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

    // Track mouse down/up positions to detect drag vs click
    this._mouseDownPos = null;
    this._dragThreshold = 5;

    // Bind once so removeEventListener can match the same reference
    this._onMouseMove  = this._onMouseMove.bind(this);
    this._onMouseDown  = this._onMouseDown.bind(this);
    this._onMouseUp    = this._onMouseUp.bind(this);
    this._onMouseLeave = this._onMouseLeave.bind(this);

    domElement.addEventListener('mousemove',  this._onMouseMove);
    domElement.addEventListener('mousedown',  this._onMouseDown);
    domElement.addEventListener('mouseup',    this._onMouseUp);
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
    this.domElement.removeEventListener('mousedown',  this._onMouseDown);
    this.domElement.removeEventListener('mouseup',    this._onMouseUp);
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
      background:     'rgba(8, 8, 20, 0.95)',
      border:         '1px solid rgba(255,255,255,0.15)',
      color:          '#e8e8f0',
      padding:        '12px 14px',
      borderRadius:   '8px',
      fontSize:       '11px',
      fontFamily:     'monospace, "Courier New"',
      pointerEvents:  'none',
      display:        'none',
      zIndex:         '9999',
      minWidth:       '280px',
      maxWidth:       '320px',
      lineHeight:     '1.6',
      boxShadow:      '0 6px 24px rgba(0,0,0,0.65)',
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
    const profitCol  = d.profit >= 0 ? '#39ff14' : '#ff6b6b';
    const liveTag    = d.live
      ? `<span style="color:#ff3333;font-weight:bold;margin-left:6px">● LIVE</span>`
      : '';

    const sportColors = {
      baseball: '#ff7043',
      football: '#42a5f5',
      basketball: '#ffca28',
      hockey: '#26c6da',
    };
    const sportColor = sportColors[d.sport] || '#ffffff';
    const sportCapitalized = d.sport ? d.sport.charAt(0).toUpperCase() + d.sport.slice(1) : 'Unknown';

    const formatDate = (dateStr) => {
      if (!dateStr) return 'N/A';
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + 
             ' ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    };

    const formatVolume = (vol) => {
      if (!vol) return 'N/A';
      return '$' + vol.toLocaleString();
    };

    const sportsbooksHTML = d.sportsbooks && d.sportsbooks.length > 0
      ? d.sportsbooks.map(sb => 
          `<div style="margin-left:8px;color:#aaa">• ${sb.name}: ${sb.odds > 0 ? '+' : ''}${sb.odds}</div>`
        ).join('')
      : '<div style="margin-left:8px;color:#666">None</div>';

    const arbMetrics = calculateArbitrageMetrics({
      sportsbooks: d.sportsbooks,
      marketType: d.marketType,
    });

    this._tooltip.innerHTML =
      `<div style="border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:8px;margin-bottom:8px">` +
        `<div style="font-size:13px;font-weight:bold;color:#fff">${d.homeTeam || 'Unknown'} vs ${d.awayTeam || 'Unknown'}</div>` +
        `<div style="margin-top:4px;color:#aaa;font-size:10px">` +
          `<span style="color:${sportColor}">${sportCapitalized}</span> · ${d.marketType || 'N/A'}${liveTag}` +
        `</div>` +
      `</div>` +
      `<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin-bottom:8px">` +
        `<span style="color:#888">Profit:</span><span style="color:${profitCol};font-weight:bold">${profitSign}${d.profit.toFixed(2)}%</span>` +
        `<span style="color:#888">Confidence:</span><span>${(d.confidence * 100).toFixed(0)}%</span>` +
        `<span style="color:#888">Risk:</span><span>${(d.risk * 100).toFixed(0)}%</span>` +
        `<span style="color:#888">Volume:</span><span>${formatVolume(d.volume)}</span>` +
        `<span style="color:#888">Date:</span><span style="font-size:10px">${formatDate(d.date)}</span>` +
      `</div>` +
      `<div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:8px;margin-bottom:8px">` +
        `<div style="color:#fff;font-size:10px;font-weight:bold;margin-bottom:4px">Volume Analysis</div>` +
        `<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:10px">` +
          `<span style="color:#888">Kelly Stake:</span><span style="color:#42a5f5">${arbMetrics.kellyStake}</span>` +
          `<span style="color:#888">Market Ceiling:</span><span style="color:#ffca28">${arbMetrics.marketCeiling}</span>` +
          `<span style="color:#888">Final Volume:</span><span style="color:#39ff14;font-weight:bold">${arbMetrics.finalVolume}</span>` +
          `<span style="color:#888">Line Movement:</span><span style="color:#ff7043">${arbMetrics.lineMovement}</span>` +
        `</div>` +
      `</div>` +
      `<div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:8px">` +
        `<div style="color:#888;font-size:10px;margin-bottom:4px">Sportsbooks:</div>` +
        sportsbooksHTML +
      `</div>`;

    this._tooltip.style.display = 'block';
    this._tooltip.style.left    = `${event.clientX + 16}px`;
    this._tooltip.style.top     = `${event.clientY - 8}px`;
  }

  _onMouseDown(event) {
    this._mouseDownPos = { x: event.clientX, y: event.clientY };
  }

  _onMouseUp(event) {
    if (!this._mouseDownPos) return;

    const dx = event.clientX - this._mouseDownPos.x;
    const dy = event.clientY - this._mouseDownPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < this._dragThreshold) {
      this._updateMouse(event);
      const nodeIndex = this._raycast();
      if (nodeIndex === null) {
        this.nodeRenderer.clearFocus();
      } else {
        const { nodeId } = this.nodeRenderer.getNodeData(nodeIndex);
        this.nodeRenderer.focusNode(nodeId);
      }
    }

    this._mouseDownPos = null;
  }

  _onMouseLeave() {
    this.nodeRenderer.clearHover();
    this._tooltip.style.display = 'none';
  }
}
