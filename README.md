# Chaos Lab

*An atlas of deterministic disorder — generative art from mathematical chaos.*

An interactive, dependency-free web app for exploring chaotic and complex systems
as visual art. Twenty-one systems across six families, each rendered live with
parameter faders, ten colour palettes, deep-zoom interaction, and one-click PNG
export. The maths is deterministic; the beauty is emergent.

![families: attractors · fractals · reaction–diffusion · automata · oscillators](.)

---

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
| **3D Strange Attractors** | Lorenz · Rössler · Aizawa · Thomas · Halvorsen · Chen · Dadras |
| **Iterated Function Systems** | Barnsley Fern |
| **Escape-Time Fractals** | Mandelbrot · Julia · Burning Ship |
| **Reaction–Diffusion** | Gray–Scott |
| **Cellular Automata** | Game of Life · Elementary CA (Wolfram) |
| **Chaotic Oscillators** | Double Pendulum · Logistic Map (bifurcation) |

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
- **3D attractors** — drag the canvas to rotate the projection (yaw / pitch).
- **Gray–Scott** — click anywhere to drop a new seed into the reaction.

### Deep links
The URL hash tracks the current system, e.g. `index.html#aizawa` — bookmarkable
and shareable.

### Batch stills (headless)
Append `?steps=N` to render *N* frames synchronously on load, before the live
loop starts — handy for scripting high-density exports from a headless browser:

```
chrome --headless --screenshot=lorenz.png --window-size=1500,950 \
       --virtual-time-budget=2000 "file://…/index.html?steps=240#lorenz"
```

---

## How it's built

Vanilla JavaScript + Canvas 2D. No frameworks, no bundler.

```
index.html        structure + font links
css/styles.css    the instrument / gallery aesthetic
js/palettes.js    colour gradients → 1024-entry lookup tables
js/systems.js     THE ATLAS — every system's maths, equation, params, blurb
js/engine.js      renderers (one per "kind"); the math drivers
js/app.js         DOM wiring, render loop, sizing, interaction, export
```

The attractors use a **density-accumulation** renderer: millions of orbit points
are binned into a per-pixel hit-count buffer, then tone-mapped through the palette
with logarithmic scaling. That is what gives them their smoky, painterly depth
rather than a flat scatter of dots. 3D systems are integrated with **RK4** and
projected orthographically; the view is auto-fit to the attractor's bounds.

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
