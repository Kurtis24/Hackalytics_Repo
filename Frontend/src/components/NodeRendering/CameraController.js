import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class CameraController {
  constructor(camera, domElement) {
    this.camera = camera;

    this.controls = new OrbitControls(camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 20000;
    this.controls.screenSpacePanning = false;

    this._isFocusing  = false;
    this._targetPos   = new THREE.Vector3();
    this._targetLook  = new THREE.Vector3();
    this._epsilon     = 0.5;
  }

  /**
   * Animate camera to a position near nodePosition and look at it.
   * Disables OrbitControls during animation, re-enables when done.
   */
  focusNode(nodePosition) {
    // Put camera 150 units away from node in the outward direction, 50 up
    const dir = nodePosition.clone().normalize();
    if (dir.lengthSq() < 0.0001) dir.set(0, 0, 1);
    this._targetPos
      .copy(nodePosition)
      .addScaledVector(dir, 150)
      .add(new THREE.Vector3(0, 50, 0));
    this._targetLook.copy(nodePosition);
    this._isFocusing = true;
    this.controls.enabled = false;
  }

  /**
   * Frame the camera to show all positions in the array.
   * @param {THREE.Vector3[]} positions - Array of positions to frame
   */
  framePositions(positions) {
    if (!positions || positions.length === 0) return;

    // Calculate bounding box
    const box = new THREE.Box3();
    positions.forEach(pos => box.expandByPoint(pos));

    // Get center and size
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Calculate camera distance based on bounding box size
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    const distance = Math.abs(maxDim / Math.sin(fov / 2)) * 1.2; // 1.2 = padding factor

    // Position camera at distance from center
    const dir = new THREE.Vector3(1, 0.8, 1).normalize();
    this._targetPos.copy(center).addScaledVector(dir, distance);
    this._targetLook.copy(center);
    this._isFocusing = true;
    this.controls.enabled = false;
  }

  /** Called every frame from the animation loop. */
  update() {
    if (this._isFocusing) {
      this.camera.position.lerp(this._targetPos, 0.08);
      this.controls.target.lerp(this._targetLook, 0.08);

      if (this.camera.position.distanceTo(this._targetPos) < this._epsilon) {
        this.camera.position.copy(this._targetPos);
        this.controls.target.copy(this._targetLook);
        this._isFocusing = false;
        this.controls.enabled = true;
      }
    }
    this.controls.update();
  }

  dispose() {
    this.controls.dispose();
  }
}
