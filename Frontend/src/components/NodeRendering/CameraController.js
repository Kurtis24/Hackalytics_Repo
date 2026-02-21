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
    // Put camera 25 units away from node in the outward direction, 8 up
    const dir = nodePosition.clone().normalize();
    if (dir.lengthSq() < 0.0001) dir.set(0, 0, 1);
    this._targetPos
      .copy(nodePosition)
      .addScaledVector(dir, 25)
      .add(new THREE.Vector3(0, 8, 0));
    this._targetLook.copy(nodePosition);
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
