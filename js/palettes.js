/* =========================================================================
   PALETTES — each is a list of [position 0..1, [r,g,b]] stops.
   Compiled to a 1024-entry RGB lookup table for fast tone-mapping.
   ========================================================================= */
(function (CL) {
  "use strict";

  const PALETTES = [
    { id: "ember", name: "Ember", stops: [
      [0.00, [4, 3, 6]], [0.18, [38, 7, 4]], [0.42, [122, 22, 6]],
      [0.66, [224, 83, 26]], [0.86, [255, 176, 32]], [1.00, [255, 246, 214]] ] },

    { id: "ice", name: "Ice", stops: [
      [0.00, [3, 5, 10]], [0.25, [4, 32, 63]], [0.55, [10, 107, 191]],
      [0.80, [63, 200, 255]], [1.00, [232, 251, 255]] ] },

    { id: "aurora", name: "Aurora", stops: [
      [0.00, [3, 6, 9]], [0.22, [4, 43, 31]], [0.48, [11, 143, 90]],
      [0.70, [70, 224, 162]], [0.86, [182, 245, 224]], [1.00, [240, 210, 250]] ] },

    { id: "magma", name: "Magma", stops: [
      [0.00, [2, 1, 4]], [0.20, [28, 16, 68]], [0.42, [114, 31, 129]],
      [0.62, [205, 64, 113]], [0.78, [241, 96, 93]], [0.90, [254, 174, 119]],
      [1.00, [252, 253, 191]] ] },

    { id: "viridis", name: "Viridis", stops: [
      [0.00, [4, 5, 18]], [0.20, [68, 1, 84]], [0.42, [59, 82, 139]],
      [0.62, [33, 145, 140]], [0.82, [94, 201, 98]], [1.00, [253, 231, 37]] ] },

    { id: "gold", name: "Gold Leaf", stops: [
      [0.00, [5, 4, 2]], [0.22, [42, 26, 2]], [0.48, [122, 77, 10]],
      [0.72, [217, 154, 31]], [0.88, [245, 207, 107]], [1.00, [255, 246, 218]] ] },

    { id: "ultraviolet", name: "Ultraviolet", stops: [
      [0.00, [4, 2, 8]], [0.24, [22, 0, 51]], [0.50, [75, 13, 143]],
      [0.72, [138, 43, 226]], [0.88, [213, 107, 255]], [1.00, [243, 214, 255]] ] },

    { id: "spectral", name: "Spectral", stops: [
      [0.00, [5, 7, 14]], [0.16, [20, 40, 110]], [0.36, [16, 130, 160]],
      [0.52, [40, 170, 110]], [0.66, [205, 200, 70]], [0.80, [225, 130, 50]],
      [0.92, [200, 50, 70]], [1.00, [230, 120, 160]] ] },

    { id: "bone", name: "Bone", stops: [
      [0.00, [4, 4, 6]], [0.30, [46, 48, 58]], [0.62, [120, 124, 138]],
      [0.85, [196, 198, 206]], [1.00, [248, 248, 252]] ] },

    { id: "rubedo", name: "Rubedo", stops: [
      [0.00, [6, 2, 3]], [0.30, [60, 6, 14]], [0.55, [150, 18, 28]],
      [0.74, [214, 58, 46]], [0.88, [240, 132, 76]], [1.00, [252, 232, 196]] ] },
  ];

  function lerp(a, b, t) { return a + (b - a) * t; }

  // build a flat Float lookup table of `size` RGB triplets (values 0..255)
  function makeLUT(palette, size) {
    size = size || 1024;
    const lut = new Uint8ClampedArray(size * 3);
    const stops = palette.stops;
    for (let i = 0; i < size; i++) {
      const t = i / (size - 1);
      // find bracketing stops
      let s = 0;
      while (s < stops.length - 2 && t > stops[s + 1][0]) s++;
      const [p0, c0] = stops[s];
      const [p1, c1] = stops[s + 1];
      const span = (p1 - p0) || 1;
      const f = Math.min(1, Math.max(0, (t - p0) / span));
      lut[i * 3]     = lerp(c0[0], c1[0], f);
      lut[i * 3 + 1] = lerp(c0[1], c1[1], f);
      lut[i * 3 + 2] = lerp(c0[2], c1[2], f);
    }
    return lut;
  }

  const cache = {};
  function getLUT(id) {
    if (cache[id]) return cache[id];
    const p = PALETTES.find((x) => x.id === id) || PALETTES[0];
    return (cache[id] = makeLUT(p, 1024));
  }

  // CSS gradient string for swatches
  function cssGradient(palette) {
    const parts = palette.stops.map(
      ([p, c]) => `rgb(${c[0]},${c[1]},${c[2]}) ${(p * 100).toFixed(0)}%`
    );
    return `linear-gradient(90deg, ${parts.join(", ")})`;
  }

  CL.PALETTES = PALETTES;
  CL.getLUT = getLUT;
  CL.cssGradient = cssGradient;
})(window.CL = window.CL || {});
