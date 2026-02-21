# NodeRendering — Claude Context README

**Last updated:** Session where axes, edge colours, and node scaling were tuned.
Read this before touching anything in this directory.

---

## What This Is

A high-performance **3D arbitrage opportunity visualiser** built with Three.js (WebGL2).
It renders nodes in 3D space where each node is a sports betting arbitrage opportunity.
Currently runs on mock data (`mockData.js`). Backend integration is not yet wired.

---

## File Map

| File | Role |
|---|---|
| `SceneManager.js` | Top-level: owns renderer, scene, camera, lights, axes. Composes all sub-systems. |
| `NodeRenderer.js` | Manages all node geometry (InstancedMesh), colours, hover/focus glow, search. |
| `EdgeRenderer.js` | Draws connection lines (dashed LineSegments) between nodes. |
| `CameraController.js` | Orbit + smooth focus-fly camera. |
| `InteractionController.js` | Raycasting, hover, click → focus. |
| `mockData.js` | Generates 1000 synthetic arbitrage nodes across 4 sports. |
| `NodeRender.jsx` | React component: mounts canvas, wires SceneManager, renders search panel + legend UI. |

---

## Node Data Model

Each node has **5 properties**:

```js
{
  node_id: string,   // e.g. "AFB_KC_BUF_DraftKings_42"
  live: boolean,     // currently-active opportunity
  metrics: {
    confidence: number,  // [0, 1]   → X axis
    profit:     number,  // float %  → Y axis  (can be negative)
    risk:       number,  // [0, 1]   → Z axis
    volume:     number,  // dollars  → node SIZE
  }
}
```

**Three axes = three metrics. Volume = size. Live = colour override.**

---

## World-Space Axis Mapping

Defined at the top of `NodeRenderer.js`:

```js
const CONF_SCALE  = 2000;   // X = confidence * 2000 - 1000  → X ∈ [-1000, 1000]
const CONF_OFFSET = -1000;
const PROFIT_SCALE = 80;    // Y = profit * 80               → ~-400 to +800 world units
const RISK_SCALE  = 2000;   // Z = risk * 2000 - 1000        → Z ∈ [-1000, 1000]
const RISK_OFFSET = -1000;
```

If you change these, also update the axis extents in `SceneManager._buildAxes()`.

---

## Node Size (Volume)

```js
scale = 0.15 + Math.pow(vol / 50000, 0.5) * 2.8
```

- `vol = 400` (min) → scale ≈ 0.30  (tiny)
- `vol = 50000` (max) → scale ≈ 2.95 (large)
- ~7–10× size ratio across the data range — intentionally dramatic.

`vol_max` reference is 50 000 (football max from `mockData.js`). If you change the mock data ranges, update the `50000` denominator here.

---

## Colour Scheme

| Condition | Colour |
|---|---|
| `live === true` | `#ff3333` bright red — overrides everything |
| `profit >= 3%` | `#39ff14` neon green |
| `profit 0–3%` | lerp teal `#4ecdc4` → neon green |
| `profit < 0%` | lerp dark blue `#2d3561` → teal (at -5% it's fully dark blue) |
| Hover | white glow overlay mesh (1.35× scale) |
| Clicked / focused | gold `#ffd700` glow (1.6× scale) |
| Neighbours of focused | cyan `#00e5ff` glow (1.45× scale) |
| Search result (multi) | neon green `#39ff14` glow (1.5× scale) |

---

## Axes

Three plain white lines drawn in `SceneManager._buildAxes()`:

```
X: (-1100, 0, 0) → (1100, 0, 0)   — Confidence
Y: (0, -400, 0)  → (0, 800, 0)    — Profit
Z: (0, 0, -1100) → (0, 0, 1100)   — Risk
```

Material: `LineBasicMaterial({ color: 0xffffff, opacity: 0.25, transparent: true })`
No tick marks. WebGL caps `linewidth` at 1 on all GPUs — opacity is the only way to appear thinner.

Axis lines are stored in `this._axisLines` and disposed cleanly.

---

## Edge (Connection) Lines

`EdgeRenderer.js` — dashed `LineSegments`:

```js
LineDashedMaterial({ color: 0x888888, dashSize: 12, gapSize: 20, opacity: 0.35 })
```

Light grey, semi-transparent. When a node is focused, its connected edges get a solid cyan overlay (`#00e5ff`).

---

## Search

`NodeRenderer.search(criteria)` filters nodes by any combination of:
- `text` — substring match on `node_id`
- `live` — boolean filter
- `minProfit / maxProfit`
- `minConf / maxConf`
- `minRisk / maxRisk`

Returns flat `nodeIndex[]`. If 1 result → camera flies to it. If multiple → neon green glow on all matches.

---

## Performance Rules (Don't Break These)

- **Never** create one `Mesh` per node — everything goes through `InstancedMesh`.
- **Never** update instance matrices inside the animation loop — only on data change.
- Animation loop does exactly two things: `cameraController.update()` + `renderer.render()`.
- `IcosahedronGeometry(1, 0)` — 20-triangle icosphere, shared across all meshes.
- One flat `InstancedMesh` for all nodes (not per-cluster). `instanceId === nodeIndex` directly.
- DPR capped at 2.

---

## Mock Data (`mockData.js`)

Generates `n` nodes (default 1000) with seeded LCG RNG (reproducible layout).
Four sports: baseball, football, basketball, hockey — each with different metric distributions.
~8% of nodes are `live`. ~8% have negative profit.
Volume range: `$400` (hockey min) to `$50 000` (football max).

---

## Camera

Start position: `(0, 2000, 4000)`. FOV 60. Near=1, Far=40 000.
Orbit controls live in `CameraController.js`. Focus-fly uses lerp animation.

---

## React Entry Point

`NodeRender.jsx` mounts `SceneManager` on a `<canvas>` via `useEffect`.
It also renders:
- **Search panel** (top-right, absolute positioned)
- **Legend** (bottom-left, shows axis labels + colour key)

The legend already labels X=Confidence, Y=Profit, Z=Risk with white text.

---

## Known Constraints / Gotchas

- `linewidth > 1` is ignored by WebGL on virtually all GPUs (Three.js limitation). Use opacity instead.
- `LineDashedMaterial` requires `mesh.computeLineDistances()` to be called or dashes won't render.
- Focus glow meshes (`_focusCenterMesh`, `_focusNeighborMesh`) are pre-allocated at `max=1` and `max=200` respectively — capped at 200 neighbours.
- Search result glow mesh is allocated at `n` instances (same count as node count).
