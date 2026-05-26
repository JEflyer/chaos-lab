/* =========================================================================
   SYSTEMS — the atlas.
   Each entry declares: family, kind (which renderer drives it), the governing
   equation (for the placard), a blurb, default palette, parameters, and the
   math itself (a map/derivative/mode the engine knows how to run).

   kinds:
     density2d  — iterated 2D map, rendered as an accumulating density field
     density3d  — 3D ODE integrated (RK4) and projected to a density field
     escape     — escape-time fractal (per-pixel)
     grid       — reaction–diffusion PDE on a grid
     ca         — cellular automaton (life | eca)
     physics    — direct canvas simulation (double pendulum)
     plot       — bifurcation / phase plot (density of a 1D map over a param)
   ========================================================================= */
(function (CL) {
  "use strict";

  // param helper: P(key, label, min, max, step, value)
  const P = (key, label, min, max, step, value) => ({ key, label, min, max, step, value });

  // common render controls appended to families
  const DENSITY_CTRL = [
    P("exposure", "exposure", 0.2, 4.0, 0.01, 1.0),
    P("contrast", "contrast", 0.4, 2.4, 0.01, 1.0),
  ];
  const VIEW3D = [
    P("yaw", "yaw", -3.1416, 3.1416, 0.001, 0.6),
    P("pitch", "pitch", -1.5, 1.5, 0.001, 0.45),
  ];

  const sgn = Math.sign;

  const SYSTEMS = [

    /* ---------------- 2D STRANGE ATTRACTORS ---------------- */
    {
      id: "clifford", name: "Clifford", family: "2D Strange Attractors", kind: "density2d",
      sub: "Pickover map", palette: "aurora",
      eq: "xₙ₊₁ = sin(a·yₙ) + c·cos(a·xₙ)\nyₙ₊₁ = sin(b·xₙ) + d·cos(b·yₙ)",
      blurb: "Four numbers fold the plane onto itself forever; what survives is a smoke of every place the point has ever been.",
      params: [P("a","a",-3,3,0.001,-1.4), P("b","b",-3,3,0.001,1.6), P("c","c",-3,3,0.001,1.0), P("d","d",-3,3,0.001,0.7), ...DENSITY_CTRL],
      init: () => [0.1, 0.1],
      map: (x, y, p) => [Math.sin(p.a*y)+p.c*Math.cos(p.a*x), Math.sin(p.b*x)+p.d*Math.cos(p.b*y)],
    },
    {
      id: "dejong", name: "De Jong", family: "2D Strange Attractors", kind: "density2d",
      sub: "Peter de Jong map", palette: "ice",
      eq: "xₙ₊₁ = sin(a·yₙ) − cos(b·xₙ)\nyₙ₊₁ = sin(c·xₙ) − cos(d·yₙ)",
      blurb: "The most generous of the attractors — almost any four numbers yield a different fingerprint of order.",
      params: [P("a","a",-3,3,0.001,1.4), P("b","b",-3,3,0.001,-2.3), P("c","c",-3,3,0.001,2.4), P("d","d",-3,3,0.001,-2.1), ...DENSITY_CTRL],
      init: () => [0.1, 0.1],
      map: (x, y, p) => [Math.sin(p.a*y)-Math.cos(p.b*x), Math.sin(p.c*x)-Math.cos(p.d*y)],
    },
    {
      id: "svensson", name: "Svensson", family: "2D Strange Attractors", kind: "density2d",
      sub: "Johnny Svensson map", palette: "ultraviolet",
      eq: "xₙ₊₁ = d·sin(a·xₙ) − sin(b·yₙ)\nyₙ₊₁ = c·cos(a·xₙ) + cos(b·yₙ)",
      blurb: "Tighter and more crystalline than its cousins — lattices and rose-windows emerge from the interference of two sines.",
      params: [P("a","a",-3,3,0.001,1.5), P("b","b",-3,3,0.001,-1.8), P("c","c",-3,3,0.001,1.6), P("d","d",-3,3,0.001,0.9), ...DENSITY_CTRL],
      init: () => [0.1, 0.1],
      map: (x, y, p) => [p.d*Math.sin(p.a*x)-Math.sin(p.b*y), p.c*Math.cos(p.a*x)+Math.cos(p.b*y)],
    },
    {
      id: "bedhead", name: "Bedhead", family: "2D Strange Attractors", kind: "density2d",
      sub: "Bedhead map", palette: "gold",
      eq: "xₙ₊₁ = yₙ·sin(xₙyₙ ⁄ b) + cos(a·xₙ − yₙ)\nyₙ₊₁ = xₙ + sin(yₙ) ⁄ b",
      blurb: "A coupling of a point to its own product — restless, asymmetric, never quite settling into the symmetry it keeps gesturing toward.",
      params: [P("a","a",-1,1,0.001,-0.81), P("b","b",-1.5,1.5,0.001,-0.92), ...DENSITY_CTRL],
      init: () => [1, 1],
      map: (x, y, p) => { const b = Math.abs(p.b) < 1e-4 ? 1e-4 : p.b; return [y*Math.sin(x*y/b)+Math.cos(p.a*x-y), x+Math.sin(y)/b]; },
    },
    {
      id: "hopalong", name: "Hopalong", family: "2D Strange Attractors", kind: "density2d",
      sub: "Barry Martin map", palette: "ember",
      eq: "xₙ₊₁ = yₙ − sgn(xₙ)·√|b·xₙ − c|\nyₙ₊₁ = a − xₙ",
      blurb: "Barry Martin's 'orbit that hops about' — a square root and a sign carve nested galaxies out of a single wandering dot.",
      params: [P("a","a",-5,5,0.001,0.4), P("b","b",-5,5,0.001,1.0), P("c","c",-5,5,0.001,0.0), ...DENSITY_CTRL],
      init: () => [0, 0],
      map: (x, y, p) => [y - sgn(x)*Math.sqrt(Math.abs(p.b*x - p.c)), p.a - x],
    },

    /* ---------------- 3D STRANGE ATTRACTORS ---------------- */
    {
      id: "lorenz", name: "Lorenz", family: "3D Strange Attractors", kind: "density3d",
      sub: "1963 · convection", palette: "ember",
      eq: "ẋ = σ(y − x)\nẏ = x(ρ − z) − y\nż = xy − βz",
      blurb: "The butterfly itself. Edward Lorenz's truncated weather model, whose two wings a trajectory crosses between forever without repeating.",
      params: [P("sigma","σ",1,20,0.01,10), P("rho","ρ",1,60,0.01,28), P("beta","β",0.5,5,0.001,2.667), P("dt","dt",0.001,0.012,0.0001,0.006), ...VIEW3D, ...DENSITY_CTRL],
      init: () => [0.1, 0, 0], transient: 2000,
      deriv: (x, y, z, p) => [p.sigma*(y-x), x*(p.rho-z)-y, x*y - p.beta*z],
    },
    {
      id: "rossler", name: "Rössler", family: "3D Strange Attractors", kind: "density3d",
      sub: "1976 · single scroll", palette: "viridis",
      eq: "ẋ = −y − z\nẏ = x + a·y\nż = b + z(x − c)",
      blurb: "Simpler than Lorenz by design — a flat spiral that periodically lifts a thread up out of the plane and folds it back in.",
      params: [P("a","a",0.05,0.4,0.001,0.2), P("b","b",0.05,2,0.001,0.2), P("c","c",2,18,0.01,5.7), P("dt","dt",0.005,0.04,0.0005,0.02), ...VIEW3D, ...DENSITY_CTRL],
      init: () => [0.1, 0, 0], transient: 3000,
      deriv: (x, y, z, p) => [-y - z, x + p.a*y, p.b + z*(x - p.c)],
    },
    {
      id: "aizawa", name: "Aizawa", family: "3D Strange Attractors", kind: "density3d",
      sub: "spherical shell", palette: "aurora",
      eq: "ẋ = (z − b)x − d·y\nẏ = d·x + (z − b)y\nż = c + a·z − z³⁄3\n      − (x²+y²)(1 + e·z) + f·z·x³",
      blurb: "A trajectory wrapped onto a sphere with a hole bored through its poles — among the most sculptural objects in the whole atlas.",
      params: [P("a","a",0.5,1.2,0.001,0.95), P("b","b",0.4,1,0.001,0.7), P("c","c",0.3,1,0.001,0.6), P("d","d",2,5,0.01,3.5), P("dt","dt",0.004,0.02,0.0005,0.01), ...VIEW3D, ...DENSITY_CTRL],
      init: () => [0.1, 0, 0], transient: 2000,
      deriv: (x, y, z, p) => { const e=0.25, f=0.1;
        return [(z-p.b)*x - p.d*y, p.d*x + (z-p.b)*y, p.c + p.a*z - z*z*z/3 - (x*x+y*y)*(1+e*z) + f*z*x*x*x]; },
    },
    {
      id: "thomas", name: "Thomas", family: "3D Strange Attractors", kind: "density3d",
      sub: "cyclically symmetric", palette: "spectral",
      eq: "ẋ = sin(y) − b·x\nẏ = sin(z) − b·y\nż = sin(x) − b·z",
      blurb: "Perfectly symmetric under cycling x→y→z→x: a particle diffusing through a lattice of its own making, slowing as b rises.",
      params: [P("b","b",0.05,0.33,0.0005,0.1998), P("dt","dt",0.02,0.1,0.001,0.05), ...VIEW3D, ...DENSITY_CTRL],
      init: () => [1.1, 1.1, -0.01], transient: 3000,
      deriv: (x, y, z, p) => [Math.sin(y)-p.b*x, Math.sin(z)-p.b*y, Math.sin(x)-p.b*z],
    },
    {
      id: "halvorsen", name: "Halvorsen", family: "3D Strange Attractors", kind: "density3d",
      sub: "cyclically symmetric", palette: "ultraviolet",
      eq: "ẋ = −a·x − 4y − 4z − y²\nẏ = −a·y − 4z − 4x − z²\nż = −a·z − 4x − 4y − x²",
      blurb: "Three interlocking scrolls braided at 120°, a knot of curve that never closes.",
      params: [P("a","a",1.0,1.9,0.001,1.4), P("dt","dt",0.002,0.01,0.0002,0.005), ...VIEW3D, ...DENSITY_CTRL],
      init: () => [-1.48, -1.51, 2.04], transient: 2000,
      deriv: (x, y, z, p) => [-p.a*x-4*y-4*z-y*y, -p.a*y-4*z-4*x-z*z, -p.a*z-4*x-4*y-x*x],
    },
    {
      id: "chen", name: "Chen", family: "3D Strange Attractors", kind: "density3d",
      sub: "1999 · double scroll", palette: "ice",
      eq: "ẋ = a(y − x)\nẏ = (c − a)x − xz + c·y\nż = xy − b·z",
      blurb: "A cousin of Lorenz with a denser, more turbulent double scroll — its wings packed with finer and finer sheets.",
      params: [P("a","a",30,40,0.01,35), P("b","b",1,5,0.01,3), P("c","c",20,30,0.01,28), P("dt","dt",0.0015,0.005,0.0001,0.0025), ...VIEW3D, ...DENSITY_CTRL],
      init: () => [-0.1, 0.5, -0.6], transient: 3000,
      deriv: (x, y, z, p) => [p.a*(y-x), (p.c-p.a)*x - x*z + p.c*y, x*y - p.b*z],
    },
    {
      id: "dadras", name: "Dadras", family: "3D Strange Attractors", kind: "density3d",
      sub: "four-wing", palette: "magma",
      eq: "ẋ = y − a·x + b·y·z\nẏ = c·y − x·z + z\nż = d·x·y − e·z",
      blurb: "A four-winged attractor: the trajectory escapes one lobe only to be captured by another, four times over.",
      params: [P("a","a",2,4,0.01,3), P("b","b",2,3.5,0.01,2.7), P("c","c",1,2.5,0.01,1.7), P("dt","dt",0.003,0.01,0.0002,0.006), ...VIEW3D, ...DENSITY_CTRL],
      init: () => [1.1, 2.1, -2], transient: 2000,
      deriv: (x, y, z, p) => { const d=2, e=9; return [y - p.a*x + p.b*y*z, p.c*y - x*z + z, d*x*y - e*z]; },
    },

    /* ---------------- ITERATED FUNCTION SYSTEMS ---------------- */
    {
      id: "fern", name: "Barnsley Fern", family: "Iterated Function Systems", kind: "density2d",
      sub: "chaos game", palette: "aurora",
      eq: "[xₙ₊₁,yₙ₊₁] = Aᵢ·[xₙ,yₙ] + bᵢ\nchosen at random with probability pᵢ\n(4 affine maps)",
      blurb: "Four affine maps, picked by weighted coin-flips, and a frond unfurls — self-similar to its smallest visible leaflet.",
      params: [...DENSITY_CTRL],
      init: () => [0, 0],
      map: (x, y) => {
        const r = Math.random();
        if (r < 0.01) return [0, 0.16*y];
        if (r < 0.86) return [0.85*x + 0.04*y, -0.04*x + 0.85*y + 1.6];
        if (r < 0.93) return [0.20*x - 0.26*y, 0.23*x + 0.22*y + 1.6];
        return [-0.15*x + 0.28*y, 0.26*x + 0.24*y + 0.44];
      },
    },

    /* ---------------- ESCAPE-TIME FRACTALS ---------------- */
    {
      id: "mandelbrot", name: "Mandelbrot", family: "Escape-Time Fractals", kind: "escape",
      sub: "scroll to zoom · drag to pan", palette: "magma", mode: "mandelbrot",
      view: { cx: -0.6, cy: 0, span: 3.2 },
      eq: "zₙ₊₁ = zₙ² + c ,   z₀ = 0\nc = pixel ;  bounded ⇔ in set",
      blurb: "The set of complex c for which the orbit never escapes. Its boundary is infinitely intricate — zoom forever and never reach the bottom.",
      params: [P("maxIter","iterations",60,2000,1,260), P("cycle","color cycle",4,120,1,28)],
    },
    {
      id: "julia", name: "Julia", family: "Escape-Time Fractals", kind: "escape",
      sub: "drift cᵣ, cᵢ to morph", palette: "ultraviolet", mode: "julia",
      view: { cx: 0, cy: 0, span: 3.2 },
      eq: "zₙ₊₁ = zₙ² + c ,   z₀ = pixel\nc = cᵣ + cᵢ·i   (fixed)",
      blurb: "Freeze c and ask instead which starting points stay bounded. Each c is a different universe — connected dust or filigree, depending on where it sits in the Mandelbrot set.",
      params: [P("cre","cᵣ",-1.2,1.2,0.0005,-0.8), P("cim","cᵢ",-1.2,1.2,0.0005,0.156), P("maxIter","iterations",60,2000,1,260), P("cycle","color cycle",4,120,1,28)],
    },
    {
      id: "burningship", name: "Burning Ship", family: "Escape-Time Fractals", kind: "escape",
      sub: "scroll to zoom · drag to pan", palette: "ember", mode: "burningship",
      view: { cx: -0.5, cy: -0.5, span: 3.4 },
      eq: "zₙ₊₁ = (|Re zₙ| + i·|Im zₙ|)² + c",
      blurb: "Mandelbrot's iteration with an absolute value folded in. The distortion conjures a smouldering armada — zoom the masts for the famous ship.",
      params: [P("maxIter","iterations",60,2000,1,300), P("cycle","color cycle",4,120,1,30)],
    },

    /* ---------------- REACTION–DIFFUSION ---------------- */
    {
      id: "grayscott", name: "Gray–Scott", family: "Reaction–Diffusion", kind: "grid",
      sub: "click to seed", palette: "bone",
      eq: "u̇ = Dᵤ∇²u − uv² + F(1 − u)\nv̇ = D_v∇²v + uv² − (F + k)v",
      blurb: "Two virtual chemicals, one feeding while the other is removed. From a single drop: spots that divide like cells, coral, fingerprints, restless mazes.",
      params: [P("feed","feed F",0.01,0.08,0.0001,0.037), P("kill","kill k",0.04,0.07,0.0001,0.06), P("du","Dᵤ",0.1,0.3,0.001,0.16), P("dv","D_v",0.02,0.14,0.001,0.08), P("speed","steps/frame",2,24,1,12)],
    },

    /* ---------------- CELLULAR AUTOMATA ---------------- */
    {
      id: "life", name: "Game of Life", family: "Cellular Automata", kind: "ca", mode: "life",
      sub: "Conway · B3/S23", palette: "viridis",
      eq: "survive  ⇔  2 or 3 live neighbours\nborn     ⇔  exactly 3 live neighbours",
      blurb: "Four rules on a grid, and out of noise come gliders, oscillators, and structures that compute. Cells here are tinted by how long they've stayed alive.",
      params: [P("fill","seed density",0.05,0.6,0.01,0.32), P("speed","gens/frame",1,8,1,2)],
    },
    {
      id: "eca", name: "Elementary CA", family: "Cellular Automata", kind: "ca", mode: "eca",
      sub: "Wolfram · 1D", palette: "gold",
      eq: "sₙ(i) = R[ sₙ₋₁(i−1), sₙ₋₁(i), sₙ₋₁(i+1) ]\nR ∈ {0 … 255}",
      blurb: "A line of cells, each reborn from its three parents above. Rule 30 makes pseudo-randomness from a single seed; rule 110 is Turing-complete.",
      params: [P("rule","rule",0,255,1,30), P("seed","seed (0 dot · 1 noise)",0,1,1,0)],
    },

    /* ---------------- CHAOTIC OSCILLATORS ---------------- */
    {
      id: "pendulum", name: "Double Pendulum", family: "Chaotic Oscillators", kind: "physics",
      sub: "sensitive dependence", palette: "spectral",
      eq: "θ̈₁ = f₁(θ₁, θ₂, θ̇₁, θ̇₂)\nθ̈₂ = f₂(θ₁, θ₂, θ̇₁, θ̇₂)\n(coupled · nonlinear)",
      blurb: "A pendulum hung from a pendulum. Hundreds released from imperceptibly different angles trace one line — until chaos pulls them irreversibly apart.",
      params: [P("count","pendulums",1,700,1,300), P("gravity","gravity",2,40,0.1,16), P("spread","∆θ spread",0.00001,0.02,0.00001,0.002), P("fade","trail persistence",0,0.25,0.005,0.11), P("damping","damping",0,0.004,0.0001,0)],
    },
    {
      id: "logistic", name: "Logistic Map", family: "Chaotic Oscillators", kind: "plot",
      sub: "bifurcation diagram", palette: "ice",
      eq: "xₙ₊₁ = r·xₙ(1 − xₙ)",
      blurb: "The road to chaos in one picture. As r grows the population settles, then splits, splits again, faster and faster — until order shatters into a dust threaded with sudden windows of calm.",
      params: [P("rmin","r min",2.4,3.9,0.001,2.5), P("rmax","r max",3.5,4.0,0.001,4.0), P("exposure","exposure",0.3,3,0.01,1.0)],
    },
  ];

  // group preserving declaration order
  function grouped() {
    const order = [], map = {};
    for (const s of SYSTEMS) {
      if (!map[s.family]) { map[s.family] = []; order.push(s.family); }
      map[s.family].push(s);
    }
    return order.map((fam) => ({ family: fam, items: map[fam] }));
  }

  CL.SYSTEMS = SYSTEMS;
  CL.groupedSystems = grouped;
})(window.CL = window.CL || {});
