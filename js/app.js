/* =========================================================================
   APP — wires the atlas to the DOM and drives the render loop.
   ========================================================================= */
(function (CL) {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const canvas = $("canvas");
  const glCanvas = $("gl");

  const app = {
    sys: null,
    params: {},
    paletteId: "ember",
    lut: null,
    mode: "3d",        // preferred view for 3D-capable systems: "2d" | "3d"
    supports3d: false,
    renderer: null,    // active 2D canvas renderer
    orbit: null,       // lazily-created 3D WebGL renderer (reused)
    active: null,      // whichever renderer the loop currently drives
    playing: true,
    sliders: {},       // key -> { input, valEl }
  };

  const getParams = () => app.params;
  const getLUT = () => app.lut;
  const onParamSet = (key, val) => {
    app.params[key] = val;
    const s = app.sliders[key];
    if (s) { s.input.value = val; s.valEl.textContent = fmt(val, s.step); }
  };

  function fmt(v, step) {
    if (step >= 1) return Math.round(v).toString();
    const dec = Math.min(5, Math.max(0, Math.ceil(-Math.log10(step))));
    return Number(v).toFixed(dec);
  }

  /* ---------- canvas sizing ---------- */
  function fitCanvas() {
    const vp = $("viewport").getBoundingClientRect();
    const side = Math.min(vp.width, vp.height);
    const ratio = Math.min(window.devicePixelRatio || 1, 1.6);
    const size = Math.max(360, Math.min(1000, Math.round(side * ratio)));
    canvas.width = size; canvas.height = size;
  }

  /* ---------- build the system index ---------- */
  function buildSystemList() {
    const nav = $("systemList");
    nav.innerHTML = "";
    let n = 0;
    CL.groupedSystems().forEach((group) => {
      const lab = document.createElement("div");
      lab.className = "fam-label";
      lab.textContent = group.family;
      nav.appendChild(lab);
      group.items.forEach((sys) => {
        n++;
        const item = document.createElement("div");
        item.className = "sys-item";
        item.dataset.id = sys.id;
        item.innerHTML = `<span class="idx">${String(n).padStart(2, "0")}</span><span class="name">${sys.name}</span>`;
        item.addEventListener("click", () => selectSystem(sys.id));
        nav.appendChild(item);
      });
    });
    $("sysCount").textContent = CL.SYSTEMS.length + " systems";
  }

  /* ---------- build palette swatches ---------- */
  function buildPalettes() {
    const wrap = $("paletteList");
    wrap.innerHTML = "";
    CL.PALETTES.forEach((p) => {
      const el = document.createElement("div");
      el.className = "pal";
      el.dataset.id = p.id;
      el.style.background = CL.cssGradient(p);
      el.innerHTML = `<span>${p.name}</span>`;
      el.addEventListener("click", () => setPalette(p.id));
      wrap.appendChild(el);
    });
  }

  function setPalette(id) {
    app.paletteId = id;
    app.lut = CL.getLUT(id);
    document.querySelectorAll(".pal").forEach((el) => el.classList.toggle("active", el.dataset.id === id));
    if (app.active) app.active.onLive("__palette__");
  }

  /* ---------- build parameter controls ----------
     In 3D mode the 2D-only controls (yaw/pitch/exposure/contrast) are swapped
     out for the orbit controls. Values are read from app.params so edits and
     mode switches preserve state. */
  function buildParams(use3d) {
    const sys = app.sys, panel = $("paramPanel");
    panel.innerHTML = "";
    app.sliders = {};
    let list;
    if (use3d) {
      const shape = sys.params.filter((p) => ["yaw", "pitch", "exposure", "contrast"].indexOf(p.key) < 0);
      list = shape.concat(CL.ORBIT_CTRL);
    } else {
      list = sys.params;
    }
    if (!list.length) {
      panel.innerHTML = `<div class="param-name" style="opacity:.5;padding-bottom:8px">no free parameters — this one is canonical</div>`;
      return;
    }
    list.forEach((pr) => {
      const cur = app.params[pr.key] != null ? app.params[pr.key] : pr.value;
      const wrap = document.createElement("div");
      wrap.className = "param";
      const top = document.createElement("div");
      top.className = "param-top";
      const isSingle = pr.label.length <= 2;
      top.innerHTML = `<span class="param-name">${isSingle ? `<em>${pr.label}</em>` : pr.label}</span><span class="param-val"></span>`;
      const input = document.createElement("input");
      input.type = "range";
      input.min = pr.min; input.max = pr.max; input.step = pr.step; input.value = cur;
      const valEl = top.querySelector(".param-val");
      valEl.textContent = fmt(cur, pr.step);
      input.addEventListener("input", () => {
        const v = parseFloat(input.value);
        app.params[pr.key] = v;
        valEl.textContent = fmt(v, pr.step);
        const r = app.active;
        if (r && r.liveKeys && r.liveKeys.indexOf(pr.key) >= 0) r.onLive(pr.key);
        else if (r) r.reset();
      });
      app.sliders[pr.key] = { input, valEl, step: pr.step };
      wrap.appendChild(top); wrap.appendChild(input);
      panel.appendChild(wrap);
    });
  }

  /* ---------- select a system ---------- */
  function selectSystem(id) {
    const sys = CL.SYSTEMS.find((s) => s.id === id);
    if (!sys) return;
    app.sys = sys;

    // params — seed the full union of keys (2D controls + orbit controls)
    app.params = {};
    sys.params.forEach((p) => (app.params[p.key] = p.value));
    if (sys.kind === "density3d") CL.ORBIT_CTRL.forEach((p) => (app.params[p.key] = p.value));

    // placard
    $("sysFamily").textContent = sys.family;
    $("sysName").textContent = sys.name;
    $("sysSub").textContent = sys.sub || "";
    $("sysEquation").textContent = sys.eq;
    $("sysBlurb").textContent = sys.blurb;

    // palette (lut for the renderer about to be built)
    app.paletteId = sys.palette;
    app.lut = CL.getLUT(sys.palette);
    document.querySelectorAll(".pal").forEach((el) => el.classList.toggle("active", el.dataset.id === sys.palette));

    // active item + deep link
    document.querySelectorAll(".sys-item").forEach((el) => {
      const on = el.dataset.id === id;
      el.classList.toggle("active", on);
      if (on) el.scrollIntoView({ block: "nearest" });
    });
    if (location.hash.slice(1) !== id) history.replaceState(null, "", "#" + id);

    applyMode();
  }

  /* ---------- apply the 2D/3D view mode + build the active renderer ---------- */
  function applyMode() {
    const sys = app.sys;
    app.supports3d = sys.kind === "density3d";
    const use3d = app.supports3d && app.mode === "3d";

    const vt = $("viewToggle");
    vt.style.display = app.supports3d ? "grid" : "none";
    vt.querySelectorAll(".vt-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.mode === (use3d ? "3d" : "2d")));

    buildParams(use3d);

    canvas.style.display = use3d ? "none" : "block";
    glCanvas.style.display = use3d ? "block" : "none";

    if (use3d) {
      if (!app.orbit) app.orbit = CL.createOrbit(glCanvas, getParams, getLUT);
      app.orbit.setSystem(sys);
      app.orbit.reset();
      app.active = app.orbit;
    } else {
      fitCanvas();
      app.renderer = CL.createRenderer(sys, canvas, getParams, getLUT, onParamSet);
      app.renderer.reset();
      app.active = app.renderer;
    }
    $("hint").textContent = app.active.hint ? app.active.hint() : "";
    app.playing = true;
    updatePlayBtn();
  }

  /* ---------- render loop ---------- */
  let frame = 0;
  function loop() {
    if (app.playing && app.active) app.active.step();
    frame++;
    if (frame % 5 === 0 && app.active) {
      const st = app.active.stats();
      $("pointCounter").textContent = st.text;
      const status = $("status"), txt = $("statusText");
      status.classList.remove("done", "paused");
      if (!app.playing) { status.classList.add("paused"); txt.textContent = "PAUSED"; }
      else if (st.done) { status.classList.add("done"); txt.textContent = "DEVELOPED"; }
      else { txt.textContent = "DEVELOPING"; }
    }
    requestAnimationFrame(loop);
  }

  /* ---------- controls ---------- */
  function updatePlayBtn() { $("btnPlay").textContent = app.playing ? "PAUSE" : "RESUME"; }

  function randomize() {
    if (!app.sys) return;
    const skip = ["exposure", "contrast", "yaw", "pitch", "cycle", "dt", "maxIter", "speed", "count", "fade", "damping"];
    app.sys.params.forEach((pr) => {
      if (skip.indexOf(pr.key) >= 0) return;
      const steps = Math.round((pr.max - pr.min) / pr.step);
      const v = pr.min + Math.round(Math.random() * steps) * pr.step;
      onParamSet(pr.key, v);
    });
    if (app.active) app.active.reset();
  }

  function exportPNG() {
    const c = app.active === app.orbit ? glCanvas : canvas;
    const a = document.createElement("a");
    const mode = app.active === app.orbit ? "3d" : "2d";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    a.download = `chaoslab-${app.sys.id}-${mode}-${stamp}.png`;
    a.href = c.toDataURL("image/png");
    a.click();
  }

  function cycleSystem(dir) {
    const idx = CL.SYSTEMS.findIndex((s) => s.id === app.sys.id);
    const next = (idx + dir + CL.SYSTEMS.length) % CL.SYSTEMS.length;
    selectSystem(CL.SYSTEMS[next].id);
  }

  /* ---------- pointer interaction ---------- */
  function setupPointer() {
    let down = false, moved = 0, lastX = 0, lastY = 0;
    const toCanvas = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height), sx: canvas.width / r.width, sy: canvas.height / r.height };
    };
    canvas.addEventListener("pointerdown", (e) => { down = true; moved = 0; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", (e) => {
      if (!down || !app.active || !app.active.onDrag) return;
      const r = canvas.getBoundingClientRect(), sx = canvas.width / r.width, sy = canvas.height / r.height;
      const dx = (e.clientX - lastX) * sx, dy = (e.clientY - lastY) * sy;
      moved += Math.abs(dx) + Math.abs(dy);
      lastX = e.clientX; lastY = e.clientY;
      app.active.onDrag(dx, dy);
    });
    canvas.addEventListener("pointerup", (e) => {
      down = false;
      if (moved < 4 && app.active && app.active.onClick) { const c = toCanvas(e); app.active.onClick(c.x, c.y); }
    });
    canvas.addEventListener("wheel", (e) => {
      if (!app.active || !app.active.onWheel) return;
      e.preventDefault();
      const c = toCanvas(e);
      app.active.onWheel(c.x, c.y, e.deltaY);
    }, { passive: false });
  }

  /* ---------- boot ---------- */
  function boot() {
    buildSystemList();
    buildPalettes();
    setupPointer();

    $("btnPlay").addEventListener("click", () => { app.playing = !app.playing; updatePlayBtn(); });
    $("btnReset").addEventListener("click", () => app.active && app.active.reset());
    $("btnRandom").addEventListener("click", randomize);
    $("btnExport").addEventListener("click", exportPNG);

    // 2D / 3D view toggle
    $("viewToggle").querySelectorAll(".vt-btn").forEach((b) =>
      b.addEventListener("click", () => {
        if (b.dataset.mode === app.mode || !app.supports3d) return;
        app.mode = b.dataset.mode;
        applyMode();
      }));

    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT") return;
      if (e.key === "ArrowDown") { e.preventDefault(); cycleSystem(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); cycleSystem(-1); }
      else if (e.key === " ") { e.preventDefault(); app.playing = !app.playing; updatePlayBtn(); }
      else if (e.key === "r") { app.active && app.active.reset(); }
      else if (e.key === "e") { exportPNG(); }
      else if ((e.key === "3" || e.key === "2") && app.supports3d) { app.mode = e.key === "3" ? "3d" : "2d"; applyMode(); }
    });

    let rt;
    window.addEventListener("resize", () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        if (!app.active) return;
        if (app.active === app.orbit) app.orbit.resize();
        else { fitCanvas(); app.active.reset(); }
      }, 200);
    });

    const qs = new URLSearchParams(location.search);
    const wantView = qs.get("view");
    if (wantView === "2d" || wantView === "3d") app.mode = wantView;
    const fromHash = location.hash.slice(1);
    selectSystem(CL.SYSTEMS.some((s) => s.id === fromHash) ? fromHash : "lorenz");
    const steps = parseInt(qs.get("steps"), 10);
    if (steps > 0 && app.active) for (let i = 0; i < steps; i++) app.active.step();
    window.addEventListener("hashchange", () => {
      const id = location.hash.slice(1);
      if (id && id !== app.sys.id && CL.SYSTEMS.some((s) => s.id === id)) selectSystem(id);
    });
    requestAnimationFrame(loop);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(window.CL = window.CL || {});
