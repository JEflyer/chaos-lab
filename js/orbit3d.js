/* =========================================================================
   ORBIT3D — live WebGL orbit view for the 3D attractors (Three.js r149).
   Integrates the system's ODE into a point cloud, colours it through the
   active palette, and renders it with additive-blended glowing sprites,
   exponential depth fog, and a free orbit camera. Conforms to the same
   renderer interface the app loop drives (reset / step / onLive / stats).
   ========================================================================= */
(function (CL) {
  "use strict";

  // render controls shown only in 3D mode (swapped in for yaw/pitch/exposure/contrast)
  const ORBIT_CTRL = [
    { key: "points", label: "points ×1k", min: 30, max: 600, step: 5, value: 220 },
    { key: "psize",  label: "point size", min: 0.4, max: 6, step: 0.1, value: 1.8 },
    { key: "glow",   label: "glow",       min: 0.1, max: 1.5, step: 0.01, value: 0.8 },
    { key: "spin",   label: "auto-spin",  min: 0, max: 1, step: 0.01, value: 0.15 },
  ];

  function rk4(f, x, y, z, h, p) {
    const k1 = f(x, y, z, p);
    const k2 = f(x + 0.5*h*k1[0], y + 0.5*h*k1[1], z + 0.5*h*k1[2], p);
    const k3 = f(x + 0.5*h*k2[0], y + 0.5*h*k2[1], z + 0.5*h*k2[2], p);
    const k4 = f(x + h*k3[0], y + h*k3[1], z + h*k3[2], p);
    return [
      x + h/6*(k1[0] + 2*k2[0] + 2*k3[0] + k4[0]),
      y + h/6*(k1[1] + 2*k2[1] + 2*k3[1] + k4[1]),
      z + h/6*(k1[2] + 2*k2[2] + 2*k3[2] + k4[2]),
    ];
  }

  // soft radial sprite so points read as glowing dots, not squares
  function makeSprite() {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0.0, "rgba(255,255,255,1)");
    grd.addColorStop(0.3, "rgba(255,255,255,0.55)");
    grd.addColorStop(1.0, "rgba(255,255,255,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.Texture(c); tex.needsUpdate = true; return tex;
  }

  class OrbitRenderer {
    constructor(canvas, getParams, getLUT) {
      this.canvas = canvas; this.getParams = getParams; this.getLUT = getLUT;
      this.liveKeys = ["psize", "glow", "spin"];
      this.done = false; this.N = 0;
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(52, 1, 0.01, 100);
      this.group = new THREE.Group(); this.scene.add(this.group);
      this.material = new THREE.PointsMaterial({
        size: 1.8, map: makeSprite(), vertexColors: true, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false, // size in screen px
      });
      this.points = null;
      this.theta = 0.9; this.phi = 1.12; this.radius = 3.3;
      this._lastT = performance.now();
      this._setupPointer();
    }

    setSystem(sys) { this.sys = sys; }

    resize() {
      const w = this.canvas.clientWidth || this.canvas.width;
      const h = this.canvas.clientHeight || this.canvas.height;
      if (w && h) { this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    }

    reset() {
      this.resize();
      this._build();
      this._applyBackground();
      this._render();
    }

    _build() {
      const p = this.getParams(), sys = this.sys;
      const N = Math.max(10000, Math.round((p.points || 220) * 1000));
      const pos = new Float32Array(N * 3);
      const s = sys.init(); let x = s[0], y = s[1], z = s[2];
      const tr = sys.transient || 2000, dt = p.dt;
      for (let i = 0; i < tr; i++) { const n = rk4(sys.deriv, x, y, z, dt, p); x = n[0]; y = n[1]; z = n[2]; }
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < N; i++) {
        const n = rk4(sys.deriv, x, y, z, dt, p); x = n[0]; y = n[1]; z = n[2];
        if (!isFinite(x)) { const r = sys.init(); x = r[0]; y = r[1]; z = r[2]; }
        pos[i*3] = x; pos[i*3+1] = y; pos[i*3+2] = z;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      const cx = (minX+maxX)/2, cy = (minY+maxY)/2, cz = (minZ+maxZ)/2;
      const ext = Math.max(maxX-minX, maxY-minY, maxZ-minZ) || 1, sc = 2 / ext;
      for (let i = 0; i < N; i++) { pos[i*3] = (pos[i*3]-cx)*sc; pos[i*3+1] = (pos[i*3+1]-cy)*sc; pos[i*3+2] = (pos[i*3+2]-cz)*sc; }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const col = new Float32Array(N * 3); this._fillColors(col, N);
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));

      if (this.points) { this.group.remove(this.points); this.points.geometry.dispose(); }
      this.points = new THREE.Points(geo, this.material);
      this.group.add(this.points);
      this.N = N;
      this._applyMaterial();
    }

    _fillColors(col, N) {
      const lut = this.getLUT(), L = lut.length/3 - 1;
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);            // colour flows along the trajectory
        const j = (((0.14 + 0.86*t) * L) | 0) * 3;   // skip the darkest stops so points stay visible
        col[i*3] = lut[j]/255; col[i*3+1] = lut[j+1]/255; col[i*3+2] = lut[j+2]/255;
      }
    }

    _applyMaterial() { const p = this.getParams(); this.material.size = p.psize || 1.8; this.material.opacity = p.glow || 0.8; }
    _applyBackground() {
      const lut = this.getLUT(), c = new THREE.Color(lut[0]/255, lut[1]/255, lut[2]/255);
      this.scene.background = c;
      this.scene.fog = new THREE.FogExp2(c.getHex(), 0.14);
    }

    _updateCamera() {
      const r = this.radius, st = Math.sin(this.phi);
      this.camera.position.set(r*st*Math.sin(this.theta), r*Math.cos(this.phi), r*st*Math.cos(this.theta));
      this.camera.lookAt(0, 0, 0);
    }
    _render() { this._updateCamera(); this.renderer.render(this.scene, this.camera); }

    step() {
      const now = performance.now(), d = Math.min(0.05, (now - this._lastT) / 1000); this._lastT = now;
      this.theta += (this.getParams().spin || 0) * d * 0.6;
      this._render();
    }

    onLive(key) {
      if (key === "__palette__") {
        if (this.points) { this._fillColors(this.points.geometry.attributes.color.array, this.N); this.points.geometry.attributes.color.needsUpdate = true; }
        this._applyBackground();
      } else this._applyMaterial();
      this._render();
    }

    _setupPointer() {
      const el = this.canvas; let down = false, lx = 0, ly = 0;
      el.addEventListener("pointerdown", (e) => { down = true; lx = e.clientX; ly = e.clientY; el.setPointerCapture(e.pointerId); });
      el.addEventListener("pointermove", (e) => {
        if (!down) return;
        this.theta -= (e.clientX - lx) * 0.008; this.phi -= (e.clientY - ly) * 0.008;
        this.phi = Math.max(0.08, Math.min(Math.PI - 0.08, this.phi));
        lx = e.clientX; ly = e.clientY; this._render();
      });
      el.addEventListener("pointerup", () => { down = false; });
      el.addEventListener("wheel", (e) => {
        e.preventDefault();
        this.radius = Math.max(1.2, Math.min(12, this.radius * (1 + e.deltaY * 0.0012)));
        this._render();
      }, { passive: false });
    }

    stats() { return { text: (this.N/1000 | 0) + "k points · 3D orbit", done: false }; }
    hint() { return "drag to orbit · scroll to zoom"; }
  }

  CL.ORBIT_CTRL = ORBIT_CTRL;
  CL.createOrbit = function (canvas, getParams, getLUT) { return new OrbitRenderer(canvas, getParams, getLUT); };
})(window.CL = window.CL || {});
