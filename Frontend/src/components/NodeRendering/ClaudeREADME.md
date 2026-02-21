# NodeRendering — Claude Context README

**Last updated:** Session covering sport-based colouring, live rings, solid connectors, scale tuning.
Read this before touching anything in this directory.

---

## What This Is

A high-performance **3D arbitrage opportunity visualiser** built with Three.js (WebGL2).
Each node is a sports betting arbitrage opportunity plotted in 3D space by confidence, profit, and risk.
Currently runs on mock data (`mockData.js`). Backend integration is not yet wired.

---

## File Map

| File | Role |
|---|---|
| `SceneManager.js` | Top-level: owns renderer, scene, camera, lights, axes. Composes all sub-systems. |
| `NodeRenderer.js` | All node geometry (InstancedMesh), colours, live rings, hover/focus glow, search. |
| `EdgeRenderer.js` | Solid `LineSegments` connections between nodes. |
| `CameraController.js` | Orbit + smooth focus-fly camera. |
| `InteractionController.js` | Raycasting, hover, click → focus. |
| `mockData.js` | Generates 1000 synthetic arbitrage nodes across 4 sports. |
| `NodeRender.jsx` | React component: mounts canvas, wires SceneManager, renders search panel + legend UI. |

---

## Node Data Model

Each node has **6 fields** (5 meaningful properties + id):

```js
{
  node_id:  string,   // e.g. "AFB_KC_BUF_DraftKings_42"
  sport:    string,   // "baseball" | "football" | "basketball" | "hockey"  → colour
  live:     boolean,  // currently-active opportunity → white ring overlay
  metrics: {
    confidence: number,  // [0, 1]  → X axis
    profit:     number,  // float % → Y axis (can be negative)
    risk:       number,  // [0, 1]  → Z axis
    volume:     number,  // dollars → node SIZE
  }
}
```

**Three axes = three metrics. Volume = size. Sport = colour. Live = ring.**

---

## World-Space Axis Mapping

Defined at the top of `NodeRenderer.js`:

```js
const CONF_SCALE   = 1000;  // X = confidence * 1000 - 500  → X ∈ [-500, 500]
const CONF_OFFSET  = -500;
const PROFIT_SCALE = 40;    // Y = profit * 40              → ~-250 to +400 world units
const RISK_SCALE   = 1000;  // Z = risk * 1000 - 500        → Z ∈ [-500, 500]
const RISK_OFFSET  = -500;
```

**If you change these, also update the axis extents in `SceneManager._buildAxes()`.**

---

## Node Size (Volume)

```js
scale = 1 + Math.pow(vol / 500000, 0.5) * 6
```

- `vol ≈ 3 000` (min, hockey) → scale ≈ 1.2
- `vol ≈ 500 000` (max, football) → scale ≈ 7.0
- ~6× size ratio across the data range.

`vol_max` reference is `500 000` (football max from `mockData.js`). If you change mock data volume ranges, update the denominator in both `initialize()` and `updateNode()`.

---

## Colour Scheme

Nodes are coloured by **sport**. Live status is shown by a **ring**, not a colour change.

| Sport / State | Colour |
|---|---|
| Baseball | `#ff7043` deep orange |
| Football | `#42a5f5` sky blue |
| Basketball | `#ffca28` amber |
| Hockey | `#26c6da` ice cyan |
| Hover | white glow overlay mesh (1.35× scale) |
| Clicked / focused | gold `#ffd700` glow (1.6× scale) |
| Neighbours of focused | cyan `#00e5ff` glow (1.45× scale) |
| Search result (multi) | neon green `#39ff14` glow (1.5× scale) |

---

## Live Node Rings

Live nodes get a **white horizontal torus ring** (`_liveRingMesh`) — a flat halo in the XZ plane.

```js
TorusGeometry(1, 0.045, 6, 48)   // radius 1 (scaled per-instance), thin tube
MeshBasicMaterial({ color: 0xffffff })  // zero lighting cost
```

- Ring scale = `node_scale × 1.5`
- Rotated `Math.PI / 2` around X so it lies flat (horizontal halo effect)
- Built once in `_buildLiveRings()` after `initialize()` — **never updated per frame**
- Stored as `this._liveRingMesh` + `this._liveRingGeometry`, disposed in `_clearLiveRings()`

---

## Axes

Three plain white lines drawn in `SceneManager._buildAxes()`:

```
X: (-550, 0, 0)  → (550, 0, 0)   — Confidence
Y: (0, -250, 0)  → (0, 400, 0)   — Profit
Z: (0, 0, -550)  → (0, 0, 550)   — Risk
```

Material: `LineBasicMaterial({ color: 0xffffff, opacity: 0.25, transparent: true })`
No tick marks. WebGL caps `linewidth` at 1 on all GPUs — opacity is the only lever for apparent thickness.
Stored in `this._axisLines[]`, disposed cleanly.

---

## Edge (Connection) Lines

`EdgeRenderer.js` — solid `LineSegments`:

```js
LineBasicMaterial({ color: 0x2a2a3a })  // very dark, no transparency
```

No transparency (performance). Dark colour keeps them visually recessive.
When a node is focused, its connected edges get a solid cyan overlay (`#00e5ff`, `LineBasicMaterial`).

---

## Mock Data (`mockData.js`)

Generates `n` nodes (default 1000) with seeded LCG RNG — layout is fully reproducible.
Each node includes a `sport` field used for colouring.

| Sport | Confidence | Profit | Risk | Volume |
|---|---|---|---|---|
| Baseball | 0.40–0.82 | 0.1–5.5% | 0.35–0.80 | $5k–$200k |
| Football | 0.38–0.85 | 0.15–7.0% | 0.30–0.82 | $8k–$500k |
| Basketball | 0.42–0.88 | 0.10–5.0% | 0.28–0.75 | $6k–$350k |
| Hockey | 0.35–0.80 | 0.20–6.5% | 0.38–0.85 | $3k–$150k |

~8% of nodes are `live`. ~8% have negative profit.

---

## Camera

Start position: `(0, 2000, 4000)`. FOV 60. Near=1, Far=40 000.
Orbit controls in `CameraController.js`. Focus-fly uses lerp animation.

---

## React Entry Point

`NodeRender.jsx` mounts `SceneManager` on a `<canvas>` via `useEffect`.
Also renders:
- **Search panel** — top-right, filters by text / live / profit / confidence / risk
- **Legend** — bottom-left, shows axis labels (white) + sport colour swatches + hollow ring for Live

---

## Performance Rules (Don't Break These)

- **Never** create one `Mesh` per node — everything goes through `InstancedMesh`.
- **Never** update instance matrices inside the animation loop — only on data change.
- Animation loop does exactly two things: `cameraController.update()` + `renderer.render()`.
- `IcosahedronGeometry(1, 0)` — 20-triangle icosphere, shared across all node meshes.
- One flat `InstancedMesh` for all nodes. `instanceId === nodeIndex` directly.
- DPR capped at 2.

---

## Known Constraints / Gotchas

- `linewidth > 1` is silently ignored by WebGL on virtually all GPUs. Opacity is the only effective lever for making lines appear thinner.
- `LineDashedMaterial` requires `mesh.computeLineDistances()` — connectors are now `LineBasicMaterial` (solid), so this is no longer needed.
- Focus glow meshes pre-allocated: `_focusCenterMesh` max=1, `_focusNeighborMesh` max=200.
- Search result glow mesh allocated at `n` instances (full node count).
- Live ring mesh allocated at `liveCount` instances — rebuilt on each `initialize()` call.
- `SPORT_INDEX` map lives at the top of `NodeRenderer.js` — maps sport string → Uint8 index (0–3).
