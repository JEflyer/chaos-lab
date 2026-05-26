# Chaos Lab

*An atlas of deterministic disorder — generative art from mathematical chaos.*

An interactive, dependency-free web app for exploring chaotic and complex systems
as visual art. Twenty-one systems across six families, rendered live with
parameter faders, ten colour palettes, deep-zoom fractals, and one-click PNG
export. The seven 3-D attractors can be explored two ways — as painterly
**2-D density fields** or as **live WebGL point clouds you orbit in real time**.
The maths is deterministic; the beauty is emergent.

![families: attractors · fractals · reaction–diffusion · automata · oscillators](.)

---

**▶ Live demo:** https://jeflyer.github.io/chaos-lab/

## Running it

No build step, no server, no dependencies. Just open the file:

```
open index.html          # macOS
xdg-open index.html      # Linux
```

…or double-click `index.html`. (Display fonts load from Google Fonts when online;
it degrades gracefully to serif/mono offline.)

If your browser blocks `file://` for any reason, serve the folder:

```
python3 -m http.server 8000   # then visit http://localhost:8000
```

---

## The atlas

| Family | Systems |
|---|---|
| **2D Strange Attractors** | Clifford · De Jong · Svensson · Bedhead · Hopalong |
| **3D Strange Attractors** ↻ | Lorenz · Rössler · Aizawa · Thomas · Halvorsen · Chen · Dadras |
| **Iterated Function Systems** | Barnsley Fern |
| **Escape-Time Fractals** | Mandelbrot · Julia · Burning Ship |
| **Reaction–Diffusion** | Gray–Scott |
| **Cellular Automata** | Game of Life · Elementary CA (Wolfram) |
| **Chaotic Oscillators** | Double Pendulum · Logistic Map (bifurcation) |

↻ = offers both a **2-D density field** and a **live 3-D orbit** view (toggle top-right).

---

## Controls

- **Pick a system** — click it in the left index, or use **↑ / ↓** to cycle.
- **Parameters** — the faders on the right are specific to each system. The
  attractor maths (a, b, c, …) reshapes the figure; **exposure** and **contrast**
  re-develop the existing image instantly without recomputing.
- **Palette** — ten gradients. Switching is instant on the rendered figure.
- **Randomize** — throws new shape parameters. Most attractors yield a different
  fingerprint every time; some configurations collapse — that is part of it.
- **Pause / Reset / Export PNG** — or keys **Space**, **R**, **E**.

### Per-system interaction
- **Fractals** — scroll to zoom toward the cursor, drag to pan. Raise *iterations*
  as you go deeper. For Julia, drift *cᵣ / cᵢ* to morph the universe.
- **3D attractors** — a **2D Field / 3D Orbit** toggle appears top-right (or press
  **2** / **3**). In *2D Field* you adjust the projection (yaw / pitch) and develop
  a density still; in *3D Orbit* you **drag to spin the point cloud and scroll to
  zoom**, with controls for point size, glow, and auto-spin.
- **Gray–Scott** — click anywhere to drop a new seed into the reaction.

### Deep links
The URL hash tracks the current system, e.g. `index.html#aizawa` — bookmarkable
and shareable. Add `?view=2d` or `?view=3d` to open a 3-D attractor in a chosen
view, e.g. `index.html?view=3d#lorenz`.

### Batch stills (headless)
Append `?steps=N` to render *N* frames synchronously on load, before the live
loop starts — handy for scripting high-density exports from a headless browser:

```
chrome --headless --screenshot=lorenz.png --window-size=1500,950 \
       --virtual-time-budget=2000 "file://…/index.html?steps=240#lorenz"
```

---

## How it's built

Vanilla JavaScript + Canvas 2D for the density/fractal/grid renderers, with a
single vendored copy of **Three.js** (r149, classic global build) driving the 3-D
orbit view. No frameworks, no bundler, no build step — and it still runs offline
by opening the file (Three.js loads as a plain `<script>`, not an ES module).

```
index.html        structure + font links + canvases
css/styles.css    the instrument / gallery aesthetic
js/palettes.js    colour gradients → 1024-entry lookup tables
js/systems.js     THE ATLAS — every system's maths, equation, params, blurb
js/engine.js      2-D renderers (one per "kind"); the math drivers
js/three.min.js   vendored Three.js r149 (global build, ~600 KB)
js/orbit3d.js     WebGL orbit renderer for the 3-D attractors
js/app.js         DOM wiring, render loop, 2D/3D mode switch, export
```

The attractors use a **density-accumulation** renderer: millions of orbit points
are binned into a per-pixel hit-count buffer, then tone-mapped through the palette
with logarithmic scaling. That is what gives them their smoky, painterly depth
rather than a flat scatter of dots.

The **3-D orbit view** integrates the same ODE with **RK4**, normalises the
trajectory into a `BufferGeometry`, and renders it as additive-blended glowing
sprites with exponential depth fog and a free orbit camera — colour flows along
the trajectory through the active palette. (The 2-D mode integrates the identical
system and projects it orthographically into the density field.)

### Adding a new system

Everything lives in `js/systems.js`. Append an entry and it appears in the index
automatically — the engine already knows how to drive each `kind`. A 2D map needs
only an `init` and a `map`:

```js
{
  id: "tinkerbell", name: "Tinkerbell", family: "2D Strange Attractors",
  kind: "density2d", palette: "ice",
  eq: "xₙ₊₁ = xₙ² − yₙ² + a·xₙ + b·yₙ\nyₙ₊₁ = 2xₙyₙ + c·xₙ + d·yₙ",
  blurb: "…",
  params: [P("a","a",-1,1,0.001,0.9), /* …, */ ...DENSITY_CTRL],
  init: () => [-0.72, -0.64],
  map: (x, y, p) => [x*x - y*y + p.a*x + p.b*y, 2*x*y + p.c*x + p.d*y],
}
```

A 3D system supplies `init`, `deriv`, a `dt` param and `...VIEW3D`. The other
kinds (`escape`, `grid`, `ca`, `physics`, `plot`) have their renderers in
`engine.js`.

---

## License

[MIT](LICENSE) — free to use, modify, and distribute.
