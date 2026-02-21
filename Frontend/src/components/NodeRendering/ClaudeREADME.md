# 3D Arbitrage Node Graph Renderer
## Unified Mac-Optimized Implementation Specification (For Claude / Cursor)

---


# Objective

Build a **high-performance 3D node graph visualization system** using **Three.js (WebGL2)** optimized specifically for **macOS (Apple Silicon: M1/M2/M3 GPUs)**.

This renderer must:

- Render **20,000+ nodes at 60 FPS**
- Be architected to scale significantly beyond that
- Use GPU instancing properly
- Avoid CPU bottlenecks
- Maintain strict separation between data and rendering
- Be structured so future spatial partitioning / partial loading can be added without rewriting the renderer

This system renders **generic arbitrage nodes only**.  
It does NOT compute arbitrage logic.

---

# Target Environment

- macOS
- Apple Silicon GPU
- Chrome / Safari
- WebGL2 (required)
- Three.js

Performance expectation:

| Node Count | Target |
|------------|--------|
| 10k        | Effortless |
| 20k        | Stable 60 FPS |
| 50k        | Usable |
| 100k+      | Future scalability with filtering |

---

# Core Rendering Strategy (CRITICAL)

### MUST USE
- `THREE.InstancedMesh`
- WebGL2
- Very low poly geometry
- One material per cluster
- Batched matrix updates

### MUST NOT
- Create one Mesh per node
- Use high-segment spheres
- Use per-node materials
- Enable shadows
- Use transparency
- Recompute instance matrices every frame
- Store heavy data in mesh.userData

---

# Data Model

```ts
export interface ArbNode {
  node_id: string;

  cluster: string;          // "sports", "quant", etc.
  subcategory?: string;

  position: {
    x: number;
    y: number;
    z: number;
  };

  metrics: {
    score?: number;
    profit_percent?: number;
    event_count: number;
  };

  tags?: string[];

  event_preview?: {
    event_type: string;
    exchange?: string;
    price?: number;
  }[];
}

Important:

Do NOT attach full event arrays to meshes.

Rendering layer must not depend on nested data structures.

Internal Memory Layout (Apple Silicon Optimized)

Avoid nested object-heavy storage.

Maintain flat buffers internally:

positions: Float32Array
scales: Float32Array
profit: Float32Array
clusterIndex: Uint16Array
nodeIds: string[]

Reasons:

Contiguous memory improves CPU cache performance

Reduces garbage collection pressure

Enables future GPU buffer streaming

Predictable update performance

Keep metadata separate from rendering buffers.

Geometry

Use low-poly geometry only:

const geometry = new THREE.IcosahedronGeometry(1, 0);

Do NOT use high-segment spheres.

Reason:

Lower vertex count

Faster instancing

Better scaling behavior

Cluster-Based Instanced Mesh Structure

Each cluster gets its own InstancedMesh.

Example clusters:

sports

quant

crypto

misc

Scene structure:

Scene
 ├── NodeGroup
 │     ├── sportsMesh (InstancedMesh)
 │     ├── quantMesh
 │     ├── cryptoMesh
 │     ├── miscMesh
 │
 ├── HighlightMesh (single instance mesh)
 └── Lights

One draw call per cluster.

Node Size Encoding

Scale derived from event_count.

Use logarithmic scaling:

const baseSize = 0.5;
const scale = baseSize + Math.log2(event_count + 1) * 0.25;

Rules:

Compute once during node initialization/update.

Do NOT recompute every frame.

Profitability Encoding

If profit_percent exists:

Option A:

Adjust emissive intensity

Option B:

Use instanceColor attribute

Do NOT create dynamic materials per node.

Materials must be reused per cluster.

Material Setup

Use simple lighting:

const material = new THREE.MeshStandardMaterial({
  color,
  roughness: 0.8,
  metalness: 0.1
});

Lighting rules:

One directional light only

No shadows

No HDR environments

No physically correct lighting

No transparency

No additive blending

Transparency destroys performance at scale.

Instance Matrix Updates

Instance matrices must be updated:

During initialization

When node data changes

After batch update:

instancedMesh.instanceMatrix.needsUpdate = true;

Never update matrices inside animation loop.

Apple Silicon GPUs are fast. CPU-side per-frame updates are the bottleneck.

Interaction Model
Hover

Use raycasting against InstancedMesh.

Retrieve instanceId.

Map instance to node_id.

Show DOM-based tooltip (not 3D text).

Do NOT create per-node 3D labels.

Hover Highlight Optimization

Do NOT modify all instance buffers.

Instead:

Maintain separate HighlightMesh with count = 1.

Copy hovered node transform.

Slightly scale it.

Apply emissive highlight.

Avoid rewriting instance buffers for highlight.

Click → Focus

Implement:

focusNode(nodeId: string)

Camera movement:

camera.position.lerp(targetPosition, 0.1);
camera.lookAt(nodePosition);

Stop when within epsilon distance.

Do NOT rebuild scene during focus.

Raycasting Strategy

For 20k nodes:

Direct InstancedMesh raycasting is acceptable.

Architecture must allow:

Filtering raycast candidates in the future

Spatial subdivision layer insertion later

Do not hardcode assumptions that entire dataset is always visible.

Layout Strategy

If position exists:

Use it directly.

If no position:

Cluster centers:

sports: (-50, 0, 0)
quant:  (50, 0, 0)
crypto: (0, 0, 50)
misc:   (0, 0, -50)

Scatter nodes within radius using seeded RNG for determinism.

Do NOT implement force-directed layout.

Animation Loop Rules

Animation loop must only:

Update camera

Update controls

Render scene

Do NOT:

Loop over all nodes

Recalculate matrices

Recompute layouts

Rebuild buffers

Retina / DPR Handling (Important on Mac)

Limit device pixel ratio:

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

Do not render at DPR 3 on Retina displays.

Memory Budget

Each instance matrix:

16 floats

64 bytes

20k nodes ≈ 1.3MB
50k nodes ≈ 3.2MB

Acceptable on Mac.

Avoid duplicating buffers.

Class Structure Requirements

Implement:

SceneManager.ts

NodeRenderer.ts

InteractionController.ts

CameraController.ts

NodeRenderer must expose:

class NodeRenderer {
  initialize(nodes: ArbNode[]): void;
  updateNode(node: ArbNode): void;
  focusNode(nodeId: string): void;
}

Rendering layer must remain independent of full dataset assumptions.

Demo Requirements

The implementation must include:

Generation of 20,000 synthetic nodes

3 clusters

Random metrics

Hover tooltip (DOM overlay)

Click to focus

Smooth camera animation

Stable 60 FPS on M1 Mac

Performance Killers (Do Not Implement)

Mesh per node

Shadow maps

Transparent materials

High-poly spheres

Per-frame buffer rebuild

Large object storage inside meshes

Heavy per-frame raycasting loops

Continuous layout recomputation

Scalability Architecture Requirements

The system must be structured so that:

Rendering layer does not assume entire dataset is permanently loaded

Cluster meshes can be resized independently

Node subsets can be activated/deactivated

Spatial indexing can be inserted later without renderer rewrite

Edge rendering can be added as a separate instanced system

Rendering, data, and interaction layers must remain cleanly separated.

Final Directive

Build a Mac-optimized Three.js instanced node renderer targeting 20k nodes at 60 FPS using:

IcosahedronGeometry(1,0)

Cluster-based InstancedMesh

Flat memory buffers

Minimal lighting

No shadows

No transparency

DPR capped at 2

Zero per-frame instance updates