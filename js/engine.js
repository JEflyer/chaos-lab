/* =========================================================================
   ENGINE — the renderers.
   Each renderer shares an interface the app drives:
     reset()        rebuild buffers for the current canvas size / system
     step()         advance one frame of work and paint the canvas
     onLive(key)    respond to a "live" param (no structural reset)
     stats()        -> { text, done }  for the readout + status light
     liveKeys       params that route to onLive instead of reset()
   Optional pointer hooks: onWheel, onDragStart/onDrag/onDragEnd, onClick
   ========================================================================= */
(function (CL) {
  "use strict";

  /* ---- integrators ---- */
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

  class Renderer {
    constructor(canvas, sys, getParams, getLUT, onParamSet) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha: false });
      this.sys = sys;
      this.getParams = getParams;
      this.getLUT = getLUT;
      this.onParamSet = onParamSet || function () {};
      this.w = canvas.width; this.h = canvas.height;
      this.liveKeys = [];
      this.done = false;
      this.pointsDrawn = 0;
    }
    reset() {}
    step() {}
    onLive() { this.draw && this.draw(); }
    stats() { return { text: "", done: this.done }; }
    hint() { return ""; }
  }

  /* ======================================================================
     DENSITY — 2D maps + 3D ODE attractors, accumulating density field
     ====================================================================== */
  class DensityRenderer extends Renderer {
    reset() {
      this.w = this.canvas.width; this.h = this.canvas.height;
      const n = this.w * this.h;
      this.density = new Float32Array(n);
      this.maxD = 0;
      this.pointsDrawn = 0;
      this.done = false;
      this.is3d = this.sys.kind === "density3d";
      this.liveKeys = ["exposure", "contrast"];
      this.img = this.ctx.createImageData(this.w, this.h);
      this.iters = this.is3d ? 14000 : 38000;
      this.budget = this.is3d ? 6.0e6 : 9.0e6;
      this._initWalker();
      this._computeBounds();
      this.draw();
    }

    _initWalker() {
      const p = this.getParams(), s = this.sys.init();
      if (this.is3d) {
        let x = s[0], y = s[1], z = s[2];
        const tr = this.sys.transient || 2000;
        for (let i = 0; i < tr; i++) { const n = rk4(this.sys.deriv, x, y, z, p.dt, p); x = n[0]; y = n[1]; z = n[2]; }
        this.x = x; this.y = y; this.z = z;
      } else {
        let x = s[0], y = s[1];
        for (let i = 0; i < 1000; i++) { const n = this.sys.map(x, y, p); x = n[0]; y = n[1]; if (!isFinite(x) || !isFinite(y)) { x = Math.random(); y = Math.random(); } }
        this.x = x; this.y = y;
      }
    }

    _computeBounds() {
      const p = this.getParams();
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      const N = 140000, s = this.sys.init();
      if (this.is3d) {
        let x = s[0], y = s[1], z = s[2];
        const tr = this.sys.transient || 2000;
        for (let i = 0; i < tr; i++) { const n = rk4(this.sys.deriv, x, y, z, p.dt, p); x = n[0]; y = n[1]; z = n[2]; }
        const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw), cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
        for (let i = 0; i < N; i++) {
          const n = rk4(this.sys.deriv, x, y, z, p.dt, p); x = n[0]; y = n[1]; z = n[2];
          if (!isFinite(x)) break;
          const X = x*cy + z*sy, Z = -x*sy + z*cy, Y = y*cp - Z*sp;
          if (X < minX) minX = X; if (X > maxX) maxX = X; if (Y < minY) minY = Y; if (Y > maxY) maxY = Y;
        }
        this.cy = cy; this.sy = sy; this.cp = cp; this.sp = sp;
      } else {
        let x = s[0], y = s[1];
        for (let i = 0; i < 1000; i++) { const n = this.sys.map(x, y, p); x = n[0]; y = n[1]; }
        for (let i = 0; i < N; i++) {
          const n = this.sys.map(x, y, p); x = n[0]; y = n[1];
          if (!isFinite(x)) { x = Math.random(); y = Math.random(); continue; }
          if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
      if (!isFinite(minX) || minX === maxX) { minX = -1; maxX = 1; minY = -1; maxY = 1; }
      const padX = (maxX - minX) * 0.05 || 0.1, padY = (maxY - minY) * 0.05 || 0.1;
      minX -= padX; maxX += padX; minY -= padY; maxY += padY;
      const spanX = maxX - minX, spanY = maxY - minY;
      this.scale = 0.97 * Math.min(this.w / spanX, this.h / spanY);
      this.ox = this.w/2 - this.scale*(minX + maxX)/2;
      this.oy = this.h/2 + this.scale*(minY + maxY)/2;
    }

    step() {
      if (this.done) return;
      const p = this.getParams(), w = this.w, h = this.h, d = this.density;
      const scale = this.scale, ox = this.ox, oy = this.oy, N = this.iters;
      let maxD = this.maxD, added = 0;
      if (this.is3d) {
        let x = this.x, y = this.y, z = this.z;
        const cy = this.cy, sy = this.sy, cp = this.cp, sp = this.sp, dt = p.dt;
        for (let i = 0; i < N; i++) {
          const n = rk4(this.sys.deriv, x, y, z, dt, p); x = n[0]; y = n[1]; z = n[2];
          if (!isFinite(x)) { const s = this.sys.init(); x = s[0]; y = s[1]; z = s[2]; continue; }
          const X = x*cy + z*sy, Z = -x*sy + z*cy, Y = y*cp - Z*sp;
          const px = (ox + scale*X) | 0, py = (oy - scale*Y) | 0;
          if (px >= 0 && px < w && py >= 0 && py < h) { const v = ++d[py*w + px]; if (v > maxD) maxD = v; }
          added++;
        }
        this.x = x; this.y = y; this.z = z;
      } else {
        let x = this.x, y = this.y;
        for (let i = 0; i < N; i++) {
          const n = this.sys.map(x, y, p); x = n[0]; y = n[1];
          if (!isFinite(x)) { const s = this.sys.init(); x = s[0] + Math.random()*0.01; y = s[1]; continue; }
          const px = (ox + scale*x) | 0, py = (oy - scale*y) | 0;
          if (px >= 0 && px < w && py >= 0 && py < h) { const v = ++d[py*w + px]; if (v > maxD) maxD = v; }
          added++;
        }
        this.x = x; this.y = y;
      }
      this.maxD = maxD; this.pointsDrawn += added;
      if (this.pointsDrawn >= this.budget) this.done = true;
      this.draw();
    }

    draw() {
      const w = this.w, h = this.h, d = this.density, data = this.img.data, lut = this.getLUT(), p = this.getParams();
      const lmax = Math.log(1 + this.maxD) || 1;
      const expo = p.exposure != null ? p.exposure : 1, gamma = p.contrast != null ? p.contrast : 1;
      const L = lut.length/3 - 1, n = w*h;
      for (let i = 0; i < n; i++) {
        let t = 0; const dv = d[i];
        if (dv > 0) { t = Math.log(1 + dv) / lmax; t = Math.pow(Math.min(1, t*expo), gamma); }
        const j = ((t*L) | 0) * 3, k = i*4;
        data[k] = lut[j]; data[k+1] = lut[j+1]; data[k+2] = lut[j+2]; data[k+3] = 255;
      }
      this.ctx.putImageData(this.img, 0, 0);
    }

    // 3D: drag to rotate
    onDrag(dx, dy) {
      if (!this.is3d) return;
      const p = this.getParams();
      let yaw = p.yaw - dx * 0.006;
      let pitch = Math.max(-1.5, Math.min(1.5, p.pitch + dy * 0.006));
      while (yaw > Math.PI) yaw -= 2*Math.PI; while (yaw < -Math.PI) yaw += 2*Math.PI;
      this.onParamSet("yaw", yaw); this.onParamSet("pitch", pitch);
      this.reset();
    }

    stats() {
      return { text: (this.pointsDrawn/1e6).toFixed(2) + "M points" + (this.done ? " · developed" : ""), done: this.done };
    }
    hint() { return this.is3d ? "drag to rotate" : ""; }
  }

  /* ======================================================================
     ESCAPE-TIME — Mandelbrot / Julia / Burning Ship
     ====================================================================== */
  class EscapeRenderer extends Renderer {
    constructor() { super(...arguments); this.view = Object.assign({}, this.sys.view); }
    reset() {
      this.w = this.canvas.width; this.h = this.canvas.height;
      const n = this.w * this.h;
      if (!this.iterBuf || this.iterBuf.length !== n) {
        this.iterBuf = new Float32Array(n);
        this.img = this.ctx.createImageData(this.w, this.h);
      }
      this.mode = this.sys.mode;
      this.liveKeys = ["cycle"];
      this.restart();
    }
    restart() {
      this.row = 0; this.done = false;
      this.strip = Math.max(2, Math.floor(this.h / 48));
      const d = this.img.data; for (let i = 0; i < d.length; i += 4) { d[i]=0; d[i+1]=0; d[i+2]=0; d[i+3]=255; }
      this.ctx.putImageData(this.img, 0, 0);
    }
    step() {
      if (this.done) return;
      const p = this.getParams(), w = this.w, h = this.h, mode = this.mode, v = this.view;
      const spanX = v.span, spanY = v.span * (h/w);
      const x0 = v.cx - spanX/2, y0 = v.cy - spanY/2, dx = spanX/w, dy = spanY/h;
      const maxIter = p.maxIter | 0, bail = 1 << 16, lut = this.getLUT(), L = lut.length/3 - 1, cyc = p.cycle || 28;
      const data = this.img.data, buf = this.iterBuf;
      const cre = mode === "julia" ? p.cre : 0, cim = mode === "julia" ? p.cim : 0;
      const end = Math.min(h, this.row + this.strip);
      for (let py = this.row; py < end; py++) {
        const yi = y0 + py*dy;
        for (let px = 0; px < w; px++) {
          const xi = x0 + px*dx;
          let zr, zi, cr, ci;
          if (mode === "julia") { zr = xi; zi = yi; cr = cre; ci = cim; }
          else { zr = 0; zi = 0; cr = xi; ci = yi; }
          let it = 0, zr2 = zr*zr, zi2 = zi*zi;
          if (mode === "burningship") {
            while (it < maxIter && zr2 + zi2 < bail) {
              zi = 2*Math.abs(zr*zi) + ci; zr = zr2 - zi2 + cr;
              zr2 = zr*zr; zi2 = zi*zi; it++;
            }
          } else {
            while (it < maxIter && zr2 + zi2 < bail) {
              zi = 2*zr*zi + ci; zr = zr2 - zi2 + cr;
              zr2 = zr*zr; zi2 = zi*zi; it++;
            }
          }
          let val;
          if (it >= maxIter) val = -1;
          else { const lz = Math.log(zr2 + zi2) / 2; val = it + 1 - Math.log(lz / Math.log(2)) / Math.log(2); }
          const idx = py*w + px; buf[idx] = val;
          let li = 0;
          if (val >= 0) { let t = (val / cyc) % 1; if (t < 0) t += 1; li = (t*L) | 0; }
          const k = idx*4, j = li*3;
          data[k] = lut[j]; data[k+1] = lut[j+1]; data[k+2] = lut[j+2]; data[k+3] = 255;
        }
      }
      this.row = end;
      this.ctx.putImageData(this.img, 0, 0);
      if (this.row >= h) this.done = true;
    }
    onLive() {
      const w = this.w, h = this.h, data = this.img.data, lut = this.getLUT(), L = lut.length/3 - 1;
      const p = this.getParams(), cyc = p.cycle || 28, buf = this.iterBuf, n = w*h;
      for (let i = 0; i < n; i++) {
        const val = buf[i]; let li = 0;
        if (val >= 0) { let t = (val / cyc) % 1; if (t < 0) t += 1; li = (t*L) | 0; }
        const k = i*4, j = li*3;
        data[k] = lut[j]; data[k+1] = lut[j+1]; data[k+2] = lut[j+2]; data[k+3] = 255;
      }
      this.ctx.putImageData(this.img, 0, 0);
    }
    onWheel(mx, my, deltaY) {
      const v = this.view, w = this.w, h = this.h, factor = deltaY < 0 ? 0.78 : 1.28;
      const spanX = v.span, spanY = v.span*(h/w);
      const wx = v.cx - spanX/2 + (mx/w)*spanX, wy = v.cy - spanY/2 + (my/h)*spanY;
      v.span *= factor;
      const nX = v.span, nY = v.span*(h/w);
      v.cx = wx - (mx/w - 0.5)*nX; v.cy = wy - (my/h - 0.5)*nY;
      this.restart();
    }
    onDrag(dx, dy) {
      const v = this.view, w = this.w, h = this.h;
      v.cx -= dx/w * v.span; v.cy -= dy/h * (v.span*(h/w));
      this.restart();
    }
    stats() {
      const zoom = (this.sys.view.span / this.view.span);
      const z = zoom >= 1000 ? zoom.toExponential(1) : zoom.toFixed(1);
      return { text: (this.done ? "rendered" : Math.round(this.row/this.h*100) + "%") + " · zoom ×" + z, done: this.done };
    }
    hint() { return "scroll zoom · drag pan"; }
  }

  /* ======================================================================
     GRID — Gray-Scott reaction-diffusion
     ====================================================================== */
  class GridRenderer extends Renderer {
    reset() {
      this.gw = 210; this.gh = 210;
      const n = this.gw*this.gh;
      this.U = new Float32Array(n); this.V = new Float32Array(n);
      this.Un = new Float32Array(n); this.Vn = new Float32Array(n);
      this.U.fill(1);
      this._seedRandom(24);
      this.off = document.createElement("canvas"); this.off.width = this.gw; this.off.height = this.gh;
      this.offctx = this.off.getContext("2d");
      this.offimg = this.offctx.createImageData(this.gw, this.gh);
      this.liveKeys = ["feed", "kill", "du", "dv", "speed"];
      this.ctx.imageSmoothingEnabled = true;
      this.gen = 0; this.done = false;
    }
    _seedRandom(k) {
      const gw = this.gw, gh = this.gh;
      for (let s = 0; s < k; s++) {
        const cx = (Math.random()*gw) | 0, cy = (Math.random()*gh) | 0, r = 3 + (Math.random()*5 | 0);
        this._seed(cx, cy, r);
      }
    }
    _seed(cx, cy, r) {
      const gw = this.gw, gh = this.gh;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx*dx + dy*dy > r*r) continue;
        const x = (cx+dx+gw)%gw, y = (cy+dy+gh)%gh, i = y*gw + x;
        this.V[i] = 1; this.U[i] = 0;
      }
    }
    step() {
      const p = this.getParams(), gw = this.gw, gh = this.gh;
      let U = this.U, V = this.V, Un = this.Un, Vn = this.Vn;
      const F = p.feed, k = p.kill, du = p.du, dv = p.dv, steps = p.speed | 0;
      for (let s = 0; s < steps; s++) {
        for (let y = 0; y < gh; y++) {
          const yu = ((y-1+gh)%gh)*gw, yd = ((y+1)%gh)*gw, yc = y*gw;
          for (let x = 0; x < gw; x++) {
            const xl = (x-1+gw)%gw, xr = (x+1)%gw, c = yc + x;
            const u = U[c], v = V[c];
            const lapU = U[yc+xl]*0.2 + U[yc+xr]*0.2 + U[yu+x]*0.2 + U[yd+x]*0.2
                       + U[yu+xl]*0.05 + U[yu+xr]*0.05 + U[yd+xl]*0.05 + U[yd+xr]*0.05 - u;
            const lapV = V[yc+xl]*0.2 + V[yc+xr]*0.2 + V[yu+x]*0.2 + V[yd+x]*0.2
                       + V[yu+xl]*0.05 + V[yu+xr]*0.05 + V[yd+xl]*0.05 + V[yd+xr]*0.05 - v;
            const uvv = u*v*v;
            const nu = u + (du*lapU - uvv + F*(1-u)), nv = v + (dv*lapV + uvv - (F+k)*v);
            Un[c] = nu < 0 ? 0 : nu > 1 ? 1 : nu; Vn[c] = nv < 0 ? 0 : nv > 1 ? 1 : nv;
          }
        }
        let t = U; U = Un; Un = t; t = V; V = Vn; Vn = t; // swap working buffers
      }
      this.U = U; this.V = V; this.Un = Un; this.Vn = Vn;
      this.gen += steps;
      this.draw();
    }
    draw() {
      const gw = this.gw, gh = this.gh, V = this.V, data = this.offimg.data, lut = this.getLUT(), L = lut.length/3 - 1, n = gw*gh;
      for (let i = 0; i < n; i++) {
        let t = V[i] * 2.6; if (t > 1) t = 1;
        const j = ((t*L) | 0)*3, k = i*4;
        data[k] = lut[j]; data[k+1] = lut[j+1]; data[k+2] = lut[j+2]; data[k+3] = 255;
      }
      this.offctx.putImageData(this.offimg, 0, 0);
      this.ctx.drawImage(this.off, 0, 0, this.w, this.h);
    }
    onClick(mx, my) {
      const gx = (mx/this.w*this.gw) | 0, gy = (my/this.h*this.gh) | 0;
      this._seed(gx, gy, 6);
    }
    stats() { return { text: "generation " + this.gen, done: false }; }
    hint() { return "click to seed"; }
  }

  /* ======================================================================
     CA — Game of Life / Elementary CA
     ====================================================================== */
  class CARenderer extends Renderer {
    reset() {
      this.w = this.canvas.width; this.h = this.canvas.height;
      this.mode = this.sys.mode;
      if (this.mode === "life") this._resetLife(); else this._resetECA();
    }
    /* --- Conway --- */
    _resetLife() {
      const cell = 4;
      this.gw = Math.max(8, Math.floor(this.w / cell));
      this.gh = Math.max(8, Math.floor(this.h / cell));
      const n = this.gw*this.gh;
      this.g = new Uint8Array(n); this.gn = new Uint8Array(n); this.age = new Float32Array(n);
      const p = this.getParams(), fill = p.fill;
      for (let i = 0; i < n; i++) { if (Math.random() < fill) { this.g[i] = 1; this.age[i] = 1; } }
      this.off = document.createElement("canvas"); this.off.width = this.gw; this.off.height = this.gh;
      this.offctx = this.off.getContext("2d"); this.offimg = this.offctx.createImageData(this.gw, this.gh);
      this.ctx.imageSmoothingEnabled = false;
      this.liveKeys = ["speed"]; this.gen = 0; this.done = false;
      this._drawLife();
    }
    _stepLife() {
      const gw = this.gw, gh = this.gh, g = this.g, gn = this.gn, age = this.age;
      for (let y = 0; y < gh; y++) {
        const yu = ((y-1+gh)%gh)*gw, yd = ((y+1)%gh)*gw, yc = y*gw;
        for (let x = 0; x < gw; x++) {
          const xl = (x-1+gw)%gw, xr = (x+1)%gw;
          const nb = g[yu+xl]+g[yu+x]+g[yu+xr]+g[yc+xl]+g[yc+xr]+g[yd+xl]+g[yd+x]+g[yd+xr];
          const c = yc + x, alive = g[c];
          const next = alive ? (nb === 2 || nb === 3 ? 1 : 0) : (nb === 3 ? 1 : 0);
          gn[c] = next;
          age[c] = next ? (alive ? age[c] + 1 : 1) : 0;
        }
      }
      const t = this.g; this.g = this.gn; this.gn = t;
    }
    _drawLife() {
      const n = this.gw*this.gh, g = this.g, age = this.age, data = this.offimg.data, lut = this.getLUT(), L = lut.length/3 - 1;
      for (let i = 0; i < n; i++) {
        let li = 0;
        if (g[i]) { let t = age[i] / 16; if (t > 1) t = 1; li = ((0.4 + 0.6*t) * L) | 0; }
        const k = i*4, j = li*3;
        data[k] = lut[j]; data[k+1] = lut[j+1]; data[k+2] = lut[j+2]; data[k+3] = 255;
      }
      this.offctx.putImageData(this.offimg, 0, 0);
      this.ctx.drawImage(this.off, 0, 0, this.w, this.h);
    }
    /* --- Elementary --- */
    _resetECA() {
      const p = this.getParams();
      this.eW = this.w;
      this.state = new Uint8Array(this.eW);
      if (p.seed >= 1) { for (let i = 0; i < this.eW; i++) this.state[i] = Math.random() < 0.5 ? 1 : 0; }
      else { this.state[this.eW >> 1] = 1; }
      this.rule = p.rule | 0;
      this.ruleTab = []; for (let i = 0; i < 8; i++) this.ruleTab[i] = (this.rule >> i) & 1;
      this.img = this.ctx.createImageData(this.w, this.h);
      const d = this.img.data; for (let i = 0; i < d.length; i += 4) { d[i]=0; d[i+1]=0; d[i+2]=0; d[i+3]=255; }
      this.curRow = 0; this.liveKeys = []; this.done = false;
    }
    _stepECA(rows) {
      const w = this.eW, st = this.state, tab = this.ruleTab, data = this.img.data, lut = this.getLUT(), L = lut.length/3 - 1, H = this.h;
      for (let r = 0; r < rows; r++) {
        if (this.curRow >= H) { this.done = true; break; }
        const li = ((0.25 + 0.7*(this.curRow / H)) * L) | 0, j = li*3;
        const base = this.curRow * w * 4;
        for (let x = 0; x < w; x++) {
          if (st[x]) { const k = base + x*4; data[k] = lut[j]; data[k+1] = lut[j+1]; data[k+2] = lut[j+2]; }
        }
        // next row
        const nxt = new Uint8Array(w);
        for (let x = 0; x < w; x++) {
          const l = st[(x-1+w)%w], c = st[x], rt = st[(x+1)%w];
          nxt[x] = tab[(l<<2)|(c<<1)|rt];
        }
        this.state = nxt; this.curRow++;
      }
      this.ctx.putImageData(this.img, 0, 0);
    }
    step() {
      if (this.mode === "life") { const sp = this.getParams().speed | 0; for (let i = 0; i < sp; i++) this._stepLife(); this.gen += sp; this._drawLife(); }
      else { if (!this.done) this._stepECA(3); }
    }
    onLive() { if (this.mode === "life") this._drawLife(); }
    stats() {
      if (this.mode === "life") return { text: "generation " + this.gen, done: false };
      return { text: (this.done ? "complete" : Math.round(this.curRow/this.h*100) + "%"), done: this.done };
    }
    hint() { return this.mode === "eca" ? "try rules 30 · 90 · 110 · 184" : ""; }
  }

  /* ======================================================================
     PHYSICS — fan of double pendulums
     ====================================================================== */
  class PhysicsRenderer extends Renderer {
    reset() {
      this.w = this.canvas.width; this.h = this.canvas.height;
      const p = this.getParams();
      this.N = p.count | 0;
      this.s = new Float64Array(this.N * 4); // a1,a2,w1,w2 per pendulum
      const base = Math.PI * 0.62;
      for (let i = 0; i < this.N; i++) {
        this.s[i*4] = base + i*p.spread; this.s[i*4+1] = base; this.s[i*4+2] = 0; this.s[i*4+3] = 0;
      }
      this.liveKeys = ["gravity", "fade", "damping"];
      const lut = this.getLUT();
      this.ctx.fillStyle = `rgb(${lut[0]},${lut[1]},${lut[2]})`;
      this.ctx.fillRect(0, 0, this.w, this.h);
      this.done = false;
    }
    _accel(a1, a2, w1, w2, g) {
      const d = a1 - a2, c = Math.cos(d), s = Math.sin(d), den = 3 - Math.cos(2*d);
      const a1dd = (-3*g*Math.sin(a1) - g*Math.sin(a1 - 2*a2) - 2*s*(w2*w2 + w1*w1*c)) / den;
      const a2dd = (2*s*(2*w1*w1 + 2*g*Math.cos(a1) + w2*w2*c)) / den;
      return [a1dd, a2dd];
    }
    _stepPend(i, g, dt, damp) {
      const s = this.s, b = i*4;
      let a1 = s[b], a2 = s[b+1], w1 = s[b+2], w2 = s[b+3];
      // RK4 on (a1,a2,w1,w2)
      const f = (A1, A2, W1, W2) => { const ac = this._accel(A1, A2, W1, W2, g); return [W1, W2, ac[0] - damp*W1, ac[1] - damp*W2]; };
      const k1 = f(a1, a2, w1, w2);
      const k2 = f(a1+0.5*dt*k1[0], a2+0.5*dt*k1[1], w1+0.5*dt*k1[2], w2+0.5*dt*k1[3]);
      const k3 = f(a1+0.5*dt*k2[0], a2+0.5*dt*k2[1], w1+0.5*dt*k2[2], w2+0.5*dt*k2[3]);
      const k4 = f(a1+dt*k3[0], a2+dt*k3[1], w1+dt*k3[2], w2+dt*k3[3]);
      s[b]   = a1 + dt/6*(k1[0]+2*k2[0]+2*k3[0]+k4[0]);
      s[b+1] = a2 + dt/6*(k1[1]+2*k2[1]+2*k3[1]+k4[1]);
      s[b+2] = w1 + dt/6*(k1[2]+2*k2[2]+2*k3[2]+k4[2]);
      s[b+3] = w2 + dt/6*(k1[3]+2*k2[3]+2*k3[3]+k4[3]);
    }
    step() {
      const p = this.getParams(), ctx = this.ctx, w = this.w, h = this.h, lut = this.getLUT(), L = lut.length/3 - 1;
      const g = p.gravity, damp = p.damping, dt = 0.0026, sub = 7;
      // fade
      const clearA = Math.max(0.025, 1 - p.fade*4);
      ctx.fillStyle = `rgba(${lut[0]},${lut[1]},${lut[2]},${clearA})`;
      ctx.fillRect(0, 0, w, h);
      for (let s = 0; s < sub; s++) for (let i = 0; i < this.N; i++) this._stepPend(i, g, dt, damp);
      const ox = w/2, oy = h*0.36, len = h*0.21;
      const single = this.N <= 3;
      for (let i = 0; i < this.N; i++) {
        const b = i*4, a1 = this.s[b], a2 = this.s[b+1];
        const x1 = ox + len*Math.sin(a1), y1 = oy + len*Math.cos(a1);
        const x2 = x1 + len*Math.sin(a2), y2 = y1 + len*Math.cos(a2);
        const li = (this.N === 1 ? L : (i/(this.N-1))*L) | 0, j = li*3;
        const col = `rgb(${lut[j]},${lut[j+1]},${lut[j+2]})`;
        if (single) {
          ctx.strokeStyle = `rgba(${lut[j]},${lut[j+1]},${lut[j+2]},0.5)`; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x1, y1, 3, 0, 6.283); ctx.fill();
          ctx.beginPath(); ctx.arc(x2, y2, 4, 0, 6.283); ctx.fill();
        } else {
          ctx.fillStyle = col; ctx.fillRect(x2 - 1.1, y2 - 1.1, 2.2, 2.2);
        }
      }
    }
    stats() { return { text: this.N + (this.N === 1 ? " pendulum" : " pendulums"), done: false }; }
    hint() { return "raise count, watch them diverge"; }
  }

  /* ======================================================================
     PLOT — logistic-map bifurcation diagram
     ====================================================================== */
  class PlotRenderer extends Renderer {
    reset() {
      this.w = this.canvas.width; this.h = this.canvas.height;
      this.density = new Float32Array(this.w*this.h); this.maxD = 0;
      this.col = 0; this.done = false;
      this.img = this.ctx.createImageData(this.w, this.h);
      this.liveKeys = ["exposure"];
      this.draw();
    }
    step() {
      if (this.done) return;
      const p = this.getParams(), w = this.w, h = this.h, d = this.density;
      let rmin = Math.min(p.rmin, p.rmax - 0.001), rmax = Math.max(p.rmax, rmin + 0.001);
      const batch = Math.max(2, (w/45) | 0), end = Math.min(w, this.col + batch);
      let maxD = this.maxD;
      for (let px = this.col; px < end; px++) {
        const r = rmin + (rmax - rmin) * px / (w - 1);
        let x = 0.5;
        for (let i = 0; i < 320; i++) x = r*x*(1-x);
        for (let i = 0; i < 360; i++) {
          x = r*x*(1-x);
          const py = ((1 - x) * (h - 1)) | 0;
          if (py >= 0 && py < h) { const v = ++d[py*w + px]; if (v > maxD) maxD = v; }
        }
      }
      this.maxD = maxD; this.col = end;
      if (this.col >= w) this.done = true;
      this.draw();
    }
    draw() {
      const w = this.w, h = this.h, d = this.density, data = this.img.data, lut = this.getLUT(), L = lut.length/3 - 1;
      const p = this.getParams(), expo = p.exposure != null ? p.exposure : 1, lmax = Math.log(1 + this.maxD) || 1, n = w*h;
      for (let i = 0; i < n; i++) {
        let t = 0; const dv = d[i];
        if (dv > 0) { t = Math.min(1, Math.log(1 + dv)/lmax * expo); }
        const j = ((t*L) | 0)*3, k = i*4;
        data[k] = lut[j]; data[k+1] = lut[j+1]; data[k+2] = lut[j+2]; data[k+3] = 255;
      }
      this.ctx.putImageData(this.img, 0, 0);
    }
    stats() { return { text: (this.done ? "rendered" : Math.round(this.col/this.w*100) + "%"), done: this.done }; }
    hint() { return "r ∈ [rmin, rmax] across the width"; }
  }

  const REG = {
    density2d: DensityRenderer, density3d: DensityRenderer,
    escape: EscapeRenderer, grid: GridRenderer, ca: CARenderer,
    physics: PhysicsRenderer, plot: PlotRenderer,
  };

  CL.createRenderer = function (sys, canvas, getParams, getLUT, onParamSet) {
    const C = REG[sys.kind];
    return new C(canvas, sys, getParams, getLUT, onParamSet);
  };
})(window.CL = window.CL || {});
