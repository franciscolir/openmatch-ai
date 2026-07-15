import { EventBus } from "./event-bus.js";
import { CameraController } from "../modules/camera/camera-controller.js";
import { VideoFileController } from "../modules/camera/video-file-controller.js";
import { Dashboard } from "../modules/dashboard/dashboard.js";
import { getDeviceProfile } from "../modules/settings/device-diagnostics.js";
import { AnalysisController } from "../modules/detection/analysis-controller.js";
import { OverlayRenderer } from "../modules/detection/overlay-renderer.js";
import { TrackManager } from "../modules/tracking/track-manager.js";
import { FieldCalibration } from "../modules/field/field-calibration.js";
import { TacticalField } from "../modules/field/tactical-field.js";
import { Heatmap } from "../modules/metrics/heatmap.js";
import { MetricsCalculator } from "../modules/metrics/metrics-calculator.js";
import { SessionStore, IndexedDBBackend } from "../modules/storage/session-store.js";
import { SessionRecorder } from "../modules/storage/session-recorder.js";
import { HistoryPanel } from "../modules/storage/history-panel.js";
import { InsightPanel } from "../modules/insights/insight-panel.js";
import { DrawTool } from "../modules/tactics/draw-tool.js";
import { showToast } from "../utils/toast.js";

export class App {
  #root;
  #events = new EventBus();
  #camera = new CameraController(this.#events);
  #videoFile = new VideoFileController(this.#events);
  #dashboard;
  #analysis;
  #overlay;
  #tracking;
  #fieldCalibration;
  #metrics;
  #tactical;
  #heatmap;
  #store;
  #recorder;
  #history;
  #insights;
  #drawTool;
  #tracks = [];
  #unsubscribers = [];
  #isFrozen = false;

  #view = "home";

  constructor(root) {
    this.#root = root;
  }

  async start() {
    if (location.protocol === "file:") {
      this.#renderHome();
      return;
    }
    if (!import.meta.env) {
      this.#renderHome();
      return;
    }
    this.#destroy();
    this.#renderHome();
    this.#store = new SessionStore(new IndexedDBBackend());
    this.#registerServiceWorker();
  }

  #navigate(view) {
    if (view === this.#view) return;
    this.#view = view;
    this.#camera?.stop();
    this.#analysis?.stop();
    this.#root.querySelector(".workspace-screen")?.remove();
    this.#destroyModules();
    if (view === "home") {
      this.#root.querySelector(".home-screen").hidden = false;
      return;
    }
    this.#root.querySelector(".home-screen").hidden = true;
    if (view === "match") this.#initMatchView();
    else if (view === "history") this.#initHistoryView();
    else if (view === "practice") this.#initPracticeView();
  }

  #setPhase(phase) {
    this.#root.querySelector("#setup-overlay").hidden = phase !== "setup";
    this.#root.querySelector("#summary-overlay").hidden = phase !== "summary";
  }

  #initMatchView() {
    const ws = document.createElement("div");
    ws.className = "workspace-screen";
    ws.innerHTML = this.#workspaceHTML();
    this.#root.appendChild(ws);
    const homeLink = this.#root.querySelector("#home-link");
    if (homeLink) homeLink.addEventListener("click", (e) => { e.preventDefault(); this.#navigate("home"); });
    this.#dashboard = new Dashboard(this.#root, this.#events);
    this.#recorder = new SessionRecorder(this.#events, this.#store);
    this.#history = new HistoryPanel(this.#root, this.#events, this.#store);
    this.#insights = new InsightPanel(this.#root, this.#events, this.#store);
    this.#bindControls();
    this.#restoreSettings();
    this.#setPhase("setup");
    const setupOverlay = this.#root.querySelector("#setup-overlay");
    const validateForm = () => {
      const teamA = setupOverlay.querySelector("#sl-team-a-name").value.trim();
      const teamB = setupOverlay.querySelector("#sl-team-b-name").value.trim();
      const dur = Number(setupOverlay.querySelector("#sl-duration").value);
      const players = Number(setupOverlay.querySelector("#sl-players").value);
      setupOverlay.querySelector("#setup-start").disabled = !teamA || !teamB || !dur || !players || dur < 20 || dur > 120 || players < 5 || players > 11;
    };
    getDeviceProfile().then((profile) => {
      setupOverlay.querySelectorAll(".mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === profile.recommendedMode));
    });
    (async () => {
      const saved = await this.#store.loadSetting("matchConfig");
      if (saved) {
        setupOverlay.querySelector("#sl-team-a-name").value = saved.teamA?.name || "";
        setupOverlay.querySelector("#sl-team-b-name").value = saved.teamB?.name || "";
        setupOverlay.querySelector("#sl-team-a-color").value = saved.teamA?.color || "#3da5ff";
        setupOverlay.querySelector("#sl-team-b-color").value = saved.teamB?.color || "#ff6b6b";
        setupOverlay.querySelector("#sl-ball-color").value = saved.ballColor || "#f5c518";
        setupOverlay.querySelector("#sl-duration").value = saved.duration || 90;
        setupOverlay.querySelector("#sl-players").value = saved.players || 11;
        if (saved.mode) setupOverlay.querySelectorAll(".mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === saved.mode));
        if (saved.fieldType) setupOverlay.querySelectorAll(".field-type").forEach((b) => b.classList.toggle("active", b.dataset.type === saved.fieldType));
        if (saved.length) setupOverlay.querySelector("#sl-field-length").value = saved.length;
        if (saved.width) setupOverlay.querySelector("#sl-field-width").value = saved.width;
      }
      this.#syncSetup();
      validateForm();
    })();
    setupOverlay.querySelectorAll(".mode, .field-type").forEach((btn) => {
      btn.addEventListener("click", () => {
        const parent = btn.closest(".mode-picker, .field-type-picker");
        if (parent) { parent.querySelectorAll(".mode, .field-type").forEach((b) => b.classList.remove("active")); btn.classList.add("active"); }
        this.#syncSetup();
        validateForm();
      });
    });
    setupOverlay.querySelectorAll("input").forEach((el) => el.addEventListener("input", () => { this.#syncSetup(); validateForm(); }));
    setupOverlay.querySelector("#setup-start").addEventListener("click", () => {
      if (setupOverlay.querySelector("#setup-start").disabled) return;
      this.#syncSetup();
      this.#setPhase("analysis");
    });
    this.#root.querySelector("#summary-new").addEventListener("click", () => { this.#navigate("home"); this.#navigate("match"); });
    this.#root.querySelector("#summary-home").addEventListener("click", () => this.#navigate("home"));
  }

  #initHistoryView() {
    const ws = document.createElement("div");
    ws.className = "workspace-screen";
    ws.innerHTML = `<header class="topbar"><a class="brand" href="#" id="home-link"><span class="brand-mark">←</span>Inicio</a><div class="privacy">Historial</div></header><main class="workspace"><aside class="sidebar" style="grid-column:1/-1;max-width:600px;margin:0 auto"><div id="history"></div></aside></main><footer></footer>`;
    this.#root.appendChild(ws);
    this.#root.querySelector("#home-link")?.addEventListener("click", (e) => { e.preventDefault(); this.#navigate("home"); });
    this.#history = new HistoryPanel(this.#root, this.#events, this.#store);
  }

  #initPracticeView() {
    const ws = document.createElement("div");
    ws.className = "workspace-screen";
    ws.innerHTML = `<header class="topbar"><a class="brand" href="#" id="home-link"><span class="brand-mark">←</span>Inicio</a><div class="privacy">Práctica Táctica</div></header><main class="workspace" style="grid-template-columns:1fr"><section class="capture panel"><div class="section-heading"><h2>Dibujo táctico</h2></div><div class="video-stage" id="video-stage"><video id="camera-preview" autoplay playsinline muted></video><canvas id="draw-overlay" hidden></canvas><div class="video-empty"><span class="camera-icon">⌁</span><strong>Conecta una cámara o selecciona un video</strong></div></div><div class="camera-controls"><label class="select-wrap">Cámara <select id="camera-select"><option>Seleccionar cámara</option></select></label><button id="camera-toggle" class="primary">Iniciar cámara</button></div><div id="file-controls" class="file-controls"><label class="file-picker" for="pf-video-file"><span>Seleccionar video</span><input id="pf-video-file" type="file" accept="video/*" /></label></div><div class="draw-toolbar" style="margin-top:12px"><button class="draw-tool active" data-tool="arrow">→</button><button class="draw-tool" data-tool="line">╱</button><button class="draw-tool" data-tool="circle">○</button><button class="draw-tool" data-tool="text">T</button><button class="draw-tool" data-tool="free">✎</button><label><input id="pf-draw-color" type="color" value="#ffffff" /></label><button id="pf-undo">↩</button><button id="pf-clear">✕</button><button id="pf-freeze" class="secondary">⏸</button></div><div class="draw-actions" style="margin-top:8px"><label>Guardar: <input id="pf-template-name" type="text" placeholder="Nombre" /><button id="pf-save" class="secondary">Guardar</button></label></div><div id="pf-templates"></div></section></main><footer></footer>`;
    this.#root.appendChild(ws);
    this.#root.querySelector("#home-link")?.addEventListener("click", (e) => { e.preventDefault(); this.#navigate("home"); });
    const preview = ws.querySelector("#camera-preview");
    const drawOverlay = ws.querySelector("#draw-overlay");
    const fitCanvas = () => { const r = preview.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1; drawOverlay.width = Math.round(r.width * dpr); drawOverlay.height = Math.round(r.height * dpr); drawOverlay.style.width = r.width + "px"; drawOverlay.style.height = r.height + "px"; };
    new ResizeObserver(fitCanvas).observe(preview);
    const tool = new DrawTool(drawOverlay);
    this.#camera.attachPreview(preview);
    ws.querySelector("#camera-toggle").addEventListener("click", () => {
      if (this.#camera.isRunning) { this.#camera.stop(); drawOverlay.hidden = true; return; }
      this.#camera.start({});
    });
    this.#events.on("camera.ready", () => { drawOverlay.hidden = false; fitCanvas(); });
    ws.querySelector("#pf-video-file").addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      if (f) { this.#camera.stop(); preview.src = URL.createObjectURL(f); preview.play(); drawOverlay.hidden = false; setTimeout(fitCanvas, 100); }
    });
    ws.querySelectorAll(".draw-tool").forEach((b) => b.addEventListener("click", () => { ws.querySelectorAll(".draw-tool").forEach((x) => x.classList.remove("active")); b.classList.add("active"); tool.setTool(b.dataset.tool); }));
    ws.querySelector("#pf-draw-color").addEventListener("input", (e) => tool.setColor(e.target.value));
    ws.querySelector("#pf-undo").addEventListener("click", () => tool.undo());
    ws.querySelector("#pf-clear").addEventListener("click", () => tool.clear());
    ws.querySelector("#pf-freeze").addEventListener("click", () => { preview.pause(); });
    ws.querySelector("#pf-save").addEventListener("click", () => { const name = ws.querySelector("#pf-template-name").value.trim(); if (name) { tool.saveTemplate(name); ws.querySelector("#pf-template-name").value = ""; } });
  }

  #syncSetup() {
    const overlay = this.#root.querySelector("#setup-overlay");
    const mode = overlay.querySelector(".mode.active")?.dataset.mode || "balanced";
    const ftype = overlay.querySelector(".field-type.active")?.dataset.type || "football11";
    const length = Number(overlay.querySelector("#sl-field-length").value) || 105;
    const width = Number(overlay.querySelector("#sl-field-width").value) || 68;
    const config = {
      mode,
      fieldType: ftype,
      length,
      width,
      teamA: { name: overlay.querySelector("#sl-team-a-name").value.trim(), color: overlay.querySelector("#sl-team-a-color").value },
      teamB: { name: overlay.querySelector("#sl-team-b-name").value.trim(), color: overlay.querySelector("#sl-team-b-color").value },
      ballColor: overlay.querySelector("#sl-ball-color").value,
      duration: Number(overlay.querySelector("#sl-duration").value),
      players: Number(overlay.querySelector("#sl-players").value),
    };
    this.#events.emit("settings.teamColors", { teamA: config.teamA.color, teamB: config.teamB.color, ball: config.ballColor });
    this.#events.emit("settings.modeChanged", { mode });
    this.#tactical?.refreshFieldType(ftype, { length, width });
    this.#store.saveSetting("matchConfig", config).catch(() => {});
  }

  #renderHome() {
    this.#root.innerHTML = `
      <header class="topbar">
        <a class="brand" href="./" aria-label="OpenMatch AI, inicio"><span class="brand-mark">O</span>OpenMatch <b>AI</b></a>
        <div class="privacy"><span></span> Procesamiento 100% local</div>
      </header>
      <main class="home-screen">
        <section class="hero panel" style="text-align:center;padding:48px 32px">
          <p class="eyebrow">PLATAFORMA TÁCTICA · ANÁLISIS LOCAL</p>
          <h1 style="max-width:600px;margin:0 auto">Tu partido, entendido<br />desde la cancha.</h1>
          <p class="lead" style="max-width:500px;margin:1em auto">Procesamiento 100% local. El video nunca sale de este dispositivo.</p>
        </section>
        <div class="home-cards">
          <button class="home-card" data-view="match">
            <span class="home-card-icon">🎥</span>
            <strong>Nuevo Partido</strong>
            <span>Análisis en vivo o video grabado con detección, posesión y mapa táctico.</span>
          </button>
          <button class="home-card" data-view="history">
            <span class="home-card-icon">📋</span>
            <strong>Historial</strong>
            <span>Sesiones guardadas con estadísticas, eventos e insights tácticos.</span>
          </button>
          <button class="home-card" data-view="practice">
            <span class="home-card-icon">✎</span>
            <strong>Práctica Táctica</strong>
            <span>Dibujo de jugadas sobre video congelado. Crea y guarda plantillas tácticas.</span>
          </button>
        </div>
      </main>
      <footer>OpenMatch AI · MVP local-first · <span id="pwa-state">Comprobando modo offline…</span></footer>`;
    this.#root.querySelectorAll("[data-view]").forEach((btn) => btn.addEventListener("click", () => this.#navigate(btn.dataset.view)));
  }

  #workspaceHTML() {
    return `
      <header class="topbar">
        <a class="brand" href="#" id="home-link" aria-label="Volver al inicio"><span class="brand-mark">←</span>Inicio</a>
        <div class="privacy"><span></span> Local</div>
      </header>
      <main class="workspace">
        <section class="capture panel">
            <div class="section-heading"><div><p class="eyebrow">NUEVO PARTIDO</p><h2>Fuente de video</h2></div><span id="source-status" class="status">Sin conectar</span></div>
            <div class="source-picker" role="group" aria-label="Origen del video">
              <button class="source active" data-source="camera">Cámara en directo</button>
              <button class="source" data-source="file">Video grabado</button>
            </div>
            <div class="video-stage" id="video-stage">
              <video id="camera-preview" autoplay playsinline muted></video>
              <canvas id="analysis-overlay" aria-label="Detecciones"></canvas>
              <canvas id="field-overlay" aria-label="Calibración"></canvas>
              <canvas id="draw-overlay" aria-label="Dibujo" hidden></canvas>
              <div class="video-empty" id="video-empty"><span class="camera-icon">⌁</span><strong>Conecta una cámara o selecciona un video</strong></div>
              <div class="overlay-label">LOCAL</div>
            </div>
            <div class="camera-controls">
              <label class="select-wrap">Cámara <select id="camera-select" disabled><option>Buscando dispositivos…</option></select></label>
              <label class="select-wrap">Calidad <select id="quality-select"><option value="720">720p</option><option value="1080">1080p</option><option value="480">480p</option></select></label>
              <button id="camera-toggle" class="primary">Iniciar cámara</button>
              <button id="analysis-toggle" class="secondary" disabled>Iniciar análisis</button>
            </div>
            <div class="event-marker" id="event-marker" hidden>
              <button class="event-btn goal" data-event="goal">⚽ Gol</button>
              <button class="event-btn fault" data-event="fault">🚩 Falta</button>
              <button class="event-btn offside" data-event="offside">🚦 Offside</button>
              <button class="event-btn chance" data-event="chance">🎯 Ocasión</button>
              <button class="event-btn card" data-event="yellow">🟨 Tarjeta</button>
              <div class="event-feedback" id="event-feedback" hidden><ol class="event-feedback-list" id="event-list"></ol></div>
            </div>
            <div class="field-controls">
              <div class="field-type-picker" role="group" aria-label="Tipo de cancha">
                <button class="field-type active" data-type="football11">Fútbol 11</button>
                <button class="field-type" data-type="football7">Fútbol 7</button>
                <button class="field-type" data-type="baby">Baby</button>
                <button class="field-type" data-type="futsal">Futsal</button>
              </div>
              <label class="select-wrap">Largo (m)<input id="field-length" type="number" min="20" max="130" value="105" /></label>
              <label class="select-wrap">Ancho (m)<input id="field-width" type="number" min="15" max="100" value="68" /></label>
              <button id="field-toggle" class="secondary">Calibrar cancha</button>
              <button id="draw-toggle" class="secondary">✎ Dibujo</button>
            </div>
            <div class="draw-controls" id="draw-controls" hidden>
              <div class="draw-toolbar"><button class="draw-tool active" data-tool="arrow">→</button><button class="draw-tool" data-tool="line">╱</button><button class="draw-tool" data-tool="circle">○</button><button class="draw-tool" data-tool="text">T</button><button class="draw-tool" data-tool="free">✎</button><label class="draw-color"><input id="draw-color" type="color" value="#ffffff" /></label><button id="draw-undo">↩</button><button id="draw-clear">✕</button></div>
              <div class="draw-actions"><button id="draw-freeze" class="secondary">⏸</button><label class="draw-save"><input id="draw-template-name" type="text" placeholder="Nombre" /><button id="draw-save-btn" class="secondary">Guardar</button></label></div>
              <div id="draw-templates"></div>
            </div>
            <details class="training-settings">
              <summary>Equipos</summary>
              <div class="team-config"><label>A <input id="color-team-a" type="color" value="#3da5ff" /></label><label>B <input id="color-team-b" type="color" value="#ff6b6b" /></label><label>Balón <input id="color-ball" type="color" value="#f5c518" /></label></div>
            </details>
            <div id="file-controls" class="file-controls" hidden>
              <label class="file-picker" for="video-file"><span>Seleccionar video</span><input id="video-file" type="file" accept="video/*" /></label>
              <p id="file-name" class="file-name">El archivo permanece en el dispositivo.</p>
            </div>
            <p id="camera-message" class="message" aria-live="polite">Conecta una cámara o selecciona un video.</p>
          </section>
          <section class="tactical panel">
            <div class="section-heading"><div><p class="eyebrow">VISTA TÁCTICA</p><h2>Cancha en vivo</h2></div><div class="heading-actions"><span id="field-status" class="status">Sin calibrar</span><div class="view-toggle"><button class="view active" data-view="tactical">Táctica</button><button class="view" data-view="heatmap">Calor</button></div></div></div>
            <div id="tactical-stage" class="tactical-stage">
              <canvas id="tactical-field"></canvas>
              <canvas id="heatmap-field"></canvas>
            </div>
            <div class="tactical-legend">
              <span><i class="dot team-a"></i>A</span>
              <span><i class="dot team-b"></i>B</span>
              <span><i class="dot ball"></i>Balón</span>
            </div>
          </section>
          <aside class="sidebar"><div id="dashboard"></div><div id="history"></div><div id="insights"></div></aside>
        <aside class="setup-overlay" id="setup-overlay">
          <div class="setup-card">
            <p class="eyebrow">NUEVO PARTIDO</p>
            <h3>Configuración</h3>
            <p style="color:var(--muted);font-size:.78rem;margin:0 0 18px">Completa todos los campos para comenzar.</p>
            <div class="team-row">
              <label>🏠 Equipo local
                <div><input type="text" id="sl-team-a-name" placeholder="Ej: Real Madrid" /><input type="color" id="sl-team-a-color" value="#3da5ff" /></div></label>
              <label>✈️ Equipo visitante
                <div><input type="text" id="sl-team-b-name" placeholder="Ej: Barcelona" /><input type="color" id="sl-team-b-color" value="#ff6b6b" /></div></label>
            </div>
            <div class="field-row" style="margin-top:16px">
              <label class="select-wrap">⚽ Deporte
                <div class="field-type-picker" style="margin-top:4px">
                  <button class="field-type active" data-type="football11">F11</button>
                  <button class="field-type" data-type="football7">F7</button>
                  <button class="field-type" data-type="baby">Baby</button>
                  <button class="field-type" data-type="futsal">Futsal</button>
                </div></label>
              <label class="select-wrap" style="flex:0 0 80px">Largo <input id="sl-field-length" type="number" value="105" /></label>
              <label class="select-wrap" style="flex:0 0 80px">Ancho <input id="sl-field-width" type="number" value="68" /></label>
            </div>
            <div class="field-row" style="margin-top:12px">
              <label class="select-wrap">⏱️ Duración (min) <input id="sl-duration" type="number" min="20" max="120" value="90" /></label>
              <label class="select-wrap">👥 Jugadores por equipo <input id="sl-players" type="number" min="5" max="11" value="11" /></label>
            </div>
            <div class="field-row" style="margin-top:12px">
              <label class="select-wrap">⚡ Modo
                <div class="mode-picker" style="margin-top:4px">
                  <button class="mode active" data-mode="balanced">Balanceado</button>
                  <button class="mode" data-mode="performance">Rendimiento</button>
                  <button class="mode" data-mode="precision">Precisión</button>
                  <button class="mode" data-mode="saver">Ahorro</button>
                </div></label>
              <label class="select-wrap">🎨 Balón <input id="sl-ball-color" type="color" value="#f5c518" style="width:60px;height:36px;padding:1px;border:1px solid var(--line);border-radius:5px;background:transparent;cursor:pointer" /></label>
            </div>
            <div style="display:flex;gap:10px;margin-top:20px">
              <button id="setup-start" class="primary" style="flex:1;font-size:.9rem;padding:12px" disabled>Comenzar</button>
            </div>
          </div>
        </aside>
        <aside class="summary-overlay" id="summary-overlay" hidden>
          <div class="summary-card">
            <p class="eyebrow">RESUMEN</p>
            <h3 style="margin:6px 0 12px">Partido finalizado</h3>
            <div id="summary-stats"></div>
            <div id="summary-events"></div>
            <div id="summary-insights"></div>
            <div style="display:flex;gap:10px;margin-top:16px">
              <button id="summary-new" class="primary" style="flex:1">Nuevo partido</button>
              <button id="summary-home" class="secondary" style="flex:1">Inicio</button>
            </div>
          </div>
        </aside>
      </main>
      <footer>OpenMatch AI · MVP local-first · <span id="pwa-state">Comprobando modo offline…</span></footer>`;
  }

  #bindControls() {
    const toggle = this.#root.querySelector("#camera-toggle");
    const select = this.#root.querySelector("#camera-select");
    const quality = this.#root.querySelector("#quality-select");
    const fileInput = this.#root.querySelector("#video-file");
    const sourceStatus = this.#root.querySelector("#source-status");
    const cameraControls = this.#root.querySelector(".camera-controls");
    const fileControls = this.#root.querySelector("#file-controls");
    const preview = this.#root.querySelector("#camera-preview");
    const analysisToggle = this.#root.querySelector("#analysis-toggle");
    const fieldToggle = this.#root.querySelector("#field-toggle");
    this.#camera.attachPreview(preview);
    this.#videoFile.attachPreview(preview);
    this.#overlay = new OverlayRenderer(this.#root.querySelector("#analysis-overlay"), preview);
    this.#analysis = new AnalysisController(this.#events, preview);
    this.#tracking = new TrackManager(this.#events);
    const drawOverlay = this.#root.querySelector("#draw-overlay");
    const fitDrawCanvas = () => {
      const rect = preview.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      drawOverlay.width = Math.round(rect.width * dpr);
      drawOverlay.height = Math.round(rect.height * dpr);
      drawOverlay.style.width = rect.width + "px";
      drawOverlay.style.height = rect.height + "px";
    };
    fitDrawCanvas();
    const drawResizeObserver = new ResizeObserver(fitDrawCanvas);
    drawResizeObserver.observe(preview);
    this.#drawTool = new DrawTool(drawOverlay);
    this.#fieldCalibration = new FieldCalibration(this.#events, this.#root.querySelector("#field-overlay"), preview);
    this.#metrics = new MetricsCalculator(this.#events);
    this.#tactical = new TacticalField(this.#events, this.#root.querySelector("#tactical-field"));
    this.#heatmap = new Heatmap(this.#events, this.#root.querySelector("#heatmap-field"));
    const stage = this.#root.querySelector("#tactical-stage");
    this.#root.querySelectorAll(".view-toggle .view").forEach((button) => button.addEventListener("click", () => {
      this.#root.querySelector(".view-toggle .view.active")?.classList.remove("active");
      button.classList.add("active");
      const showHeatmap = button.dataset.view === "heatmap";
      stage.classList.toggle("show-heatmap", showHeatmap);
      if (showHeatmap) this.#heatmap.refresh(); else this.#tactical.refresh();
    }));
    this.#camera.refreshDevices().then((devices) => {
      select.innerHTML = devices.length ? devices.map((device, index) => `<option value="${device.deviceId}">${device.label || `Cámara ${index + 1}`}</option>`).join("") : "<option>No se encontraron cámaras</option>";
      select.disabled = !devices.length;
    });
    toggle.addEventListener("click", async () => {
      if (this.#camera.isRunning) {
        this.#analysis.stop();
        this.#camera.stop();
        return;
      }
      await this.#camera.start({ deviceId: select.value, height: Number(quality.value) });
    });
    fileInput.addEventListener("change", async () => {
      const [file] = fileInput.files;
      if (!file) return;
      this.#camera.stop();
      this.#analysis.stop();
      await this.#videoFile.load(file);
    });
    this.#unsubscribers.push(this.#events.on("camera.ready", () => {
      toggle.textContent = "Detener cámara";
      analysisToggle.disabled = false;
      fieldToggle.disabled = false;
      drawToggle.disabled = false;
      sourceStatus.textContent = "En directo";
      sourceStatus.classList.add("live");
      this.#root.querySelector("#video-empty").hidden = true;
      this.#root.querySelector("#camera-message").textContent = "Captura activa: el procesamiento se realizará localmente.";
    }));
    this.#unsubscribers.push(this.#events.on("camera.stopped", () => {
      toggle.textContent = "Iniciar cámara";
      analysisToggle.disabled = true;
      drawToggle.disabled = true;
      this.#analysis.stop();
      this.#fieldCalibration.cancel();
      this.#overlay.clear();
      sourceStatus.textContent = "Sin conectar";
      sourceStatus.classList.remove("live");
      this.#root.querySelector("#video-empty").hidden = false;
    }));
    this.#unsubscribers.push(this.#events.on("camera.error", (event) => {
      this.#root.querySelector("#camera-message").textContent = event.detail.message;
    }));
    this.#unsubscribers.push(this.#events.on("video.loaded", (event) => {
      sourceStatus.textContent = "Video cargado";
      analysisToggle.disabled = false;
      fieldToggle.disabled = false;
      drawToggle.disabled = false;
      sourceStatus.classList.add("live");
      this.#root.querySelector("#video-empty").hidden = true;
      this.#root.querySelector("#file-name").textContent = `${event.detail.file.name} · ${event.detail.file.sizeLabel}`;
      this.#root.querySelector("#camera-message").textContent = "Video listo para análisis local. La reproducción no envía el archivo a internet.";
    }));
    this.#unsubscribers.push(this.#events.on("video.error", (event) => {
      this.#root.querySelector("#camera-message").textContent = event.detail.message;
    }));
    this.#unsubscribers.push(this.#events.on("analysis.loading", (event) => {
      analysisToggle.textContent = "Cargando…";
      this.#root.querySelector("#camera-message").textContent = event.detail.message;
    }));
    const eventMarker = this.#root.querySelector("#event-marker");
    this.#unsubscribers.push(this.#events.on("analysis.ready", () => {
      analysisToggle.textContent = "Detener análisis";
      analysisToggle.disabled = false;
      eventMarker.hidden = false;
      this.#root.querySelector("#camera-message").textContent = "Análisis local activo: personas, balón y pose se procesan en este dispositivo.";
    }));
    this.#unsubscribers.push(this.#events.on("analysis.stopped", () => {
      analysisToggle.textContent = "Iniciar análisis";
      eventMarker.hidden = true;
    }));
    this.#unsubscribers.push(this.#events.on("session.saved", (event) => {
      this.#setPhase("summary");
      this.#renderSummary(event.detail);
    }));
    this.#unsubscribers.push(this.#events.on("analysis.error", (event) => {
      analysisToggle.textContent = "Iniciar análisis";
      const detail = event.detail.detail ? ` (${event.detail.detail})` : "";
      this.#root.querySelector("#camera-message").textContent = `${event.detail.message}${detail}`;
    }));
    this.#unsubscribers.push(this.#events.on("tracking.updated", (event) => { this.#tracks = event.detail.tracks; }));
    this.#unsubscribers.push(this.#events.on("ai.detected", (event) => this.#overlay.render(event.detail, this.#tracks)));
    this.#unsubscribers.push(this.#events.on("field.calibrationStarted", (event) => {
      fieldToggle.textContent = "Cancelar calibración";
      this.#root.querySelector("#camera-message").textContent = event.detail.message;
      this.#root.querySelector("#field-status").textContent = "Calibrando…";
      this.#root.querySelector("#field-status").classList.remove("live");
    }));
    this.#unsubscribers.push(this.#events.on("field.calibrationProgress", (event) => {
      this.#root.querySelector("#camera-message").textContent = event.detail.message;
    }));
    this.#unsubscribers.push(this.#events.on("field.calibrated", (event) => {
      fieldToggle.textContent = "Recalibrar cancha";
      this.#root.querySelector("#camera-message").textContent = `Cancha calibrada: ${event.detail.dimensions.length} x ${event.detail.dimensions.width} m.`;
      this.#root.querySelector("#field-status").textContent = `Calibrada ${event.detail.dimensions.length}x${event.detail.dimensions.width} m`;
      this.#root.querySelector("#field-status").classList.add("live");
    }));
    this.#unsubscribers.push(this.#events.on("field.calibrationError", (event) => {
      this.#root.querySelector("#camera-message").textContent = event.detail.message;
    }));
    this.#unsubscribers.push(this.#events.on("settings.modeChanged", (event) => { this.#store.saveSetting("mode", event.detail.mode).catch(() => {}); }));
    this.#unsubscribers.push(this.#events.on("field.calibrated", (event) => { this.#store.saveSetting("field", event.detail.dimensions).catch(() => {}); }));
    analysisToggle.addEventListener("click", async () => {
      if (this.#analysis.isRunning) {
        this.#analysis.stop();
        this.#overlay.clear();
        return;
      }
      try { await this.#analysis.start(this.#root.querySelector(".mode.active").dataset.mode); }
      catch (error) { this.#events.emit("analysis.error", { message: error.message }); }
    });
    const fieldTypeButtons = this.#root.querySelectorAll(".field-type");
    const updateFieldType = (type) => {
      this.#fieldCalibration.setFieldType(type);
      const defaults = { football11: { length: 105, width: 68 }, football7: { length: 50, width: 30 }, baby: { length: 36, width: 18 }, futsal: { length: 40, width: 20 } };
      const dims = defaults[type] || defaults.football11;
      this.#root.querySelector("#field-length").value = dims.length;
      this.#root.querySelector("#field-width").value = dims.width;
      if (!this.#fieldCalibration.isActive) {
        this.#tactical.refreshFieldType(type, dims);
      }
    };
    fieldTypeButtons.forEach((btn) => btn.addEventListener("click", () => {
      fieldTypeButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      updateFieldType(btn.dataset.type);
    }));
    fieldToggle.addEventListener("click", () => {
      if (this.#fieldCalibration.isActive) {
        this.#fieldCalibration.cancel();
        fieldToggle.textContent = "Calibrar cancha";
        return;
      }
      const activeType = this.#root.querySelector(".field-type.active")?.dataset.type || "football11";
      const dimensions = {
        length: Number(this.#root.querySelector("#field-length").value),
        width: Number(this.#root.querySelector("#field-width").value)
      };
      if (!Number.isFinite(dimensions.length) || !Number.isFinite(dimensions.width)) {
        this.#events.emit("field.calibrationError", { message: "Introduce dimensiones validas de cancha." });
        return;
      }
      this.#fieldCalibration.setFieldType(activeType);
      this.#fieldCalibration.start(dimensions);
    });
    const emitTeamColors = () => {
      const colors = {
        teamA: this.#root.querySelector("#color-team-a").value,
        teamB: this.#root.querySelector("#color-team-b").value,
        ball: this.#root.querySelector("#color-ball").value,
      };
      this.#events.emit("settings.teamColors", colors);
      this.#root.querySelector(".dot.team-a").style.background = colors.teamA;
      this.#root.querySelector(".dot.team-b").style.background = colors.teamB;
      this.#root.querySelector(".dot.ball").style.background = colors.ball;
      this.#store.saveSetting("teamColors", colors).catch(() => {});
    };
    this.#root.querySelector("#color-team-a").addEventListener("input", emitTeamColors);
    this.#root.querySelector("#color-team-b").addEventListener("input", emitTeamColors);
    this.#root.querySelector("#color-ball").addEventListener("input", emitTeamColors);
    const drawToggle = this.#root.querySelector("#draw-toggle");
    const drawControls = this.#root.querySelector("#draw-controls");
    drawToggle.addEventListener("click", () => {
      const isVisible = !drawControls.hidden;
      drawControls.hidden = isVisible;
      drawOverlay.hidden = isVisible;
      drawToggle.textContent = isVisible ? "✎ Dibujo táctico" : "✕ Cerrar dibujo";
    });
    this.#root.querySelectorAll(".draw-tool").forEach((btn) => btn.addEventListener("click", () => {
      this.#root.querySelectorAll(".draw-tool").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      this.#drawTool.setTool(btn.dataset.tool);
    }));
    this.#root.querySelector("#draw-color").addEventListener("input", (e) => this.#drawTool.setColor(e.target.value));
    this.#root.querySelector("#draw-undo").addEventListener("click", () => this.#drawTool.undo());
    this.#root.querySelector("#draw-clear").addEventListener("click", () => this.#drawTool.clear());
    const freezeBtn = this.#root.querySelector("#draw-freeze");
    freezeBtn.addEventListener("click", () => {
      this.#isFrozen = !this.#isFrozen;
      this.#root.querySelector("#camera-preview").pause();
      freezeBtn.textContent = this.#isFrozen ? "▶ Reanudar video" : "⏸ Congelar video";
    });
    this.#root.querySelector("#draw-save-btn").addEventListener("click", () => {
      const name = this.#root.querySelector("#draw-template-name").value.trim();
      if (name && this.#drawTool.saveTemplate(name)) {
        this.#root.querySelector("#draw-template-name").value = "";
    const eventList = this.#root.querySelector("#event-list");
    const eventFeedback = this.#root.querySelector("#event-feedback");
    this.#root.querySelectorAll(".event-btn").forEach((btn) => btn.addEventListener("click", () => {
      const label = btn.textContent.trim();
      this.#recorder.markEvent(btn.dataset.event, label);
      showToast(`✓ ${label}`);
      const li = document.createElement("li");
      const elapsed = (Date.now() - this.#recorder.sessionStartedAt) / 1000;
      const m = Math.floor(elapsed / 60);
      const s = Math.floor(elapsed % 60);
      li.innerHTML = `<time>${m}:${String(s).padStart(2, "0")}</time> ${label}`;
      eventList.appendChild(li);
      eventFeedback.hidden = false;
      eventList.scrollTop = eventList.scrollHeight;
    }));
    this.#unsubscribers.push(this.#events.on("analysis.stopped", () => { eventFeedback.hidden = true; eventList.innerHTML = ""; }));
    this.#renderTemplateList();
      }
    });
    this.#renderTemplateList();
    this.#root.querySelectorAll(".mode").forEach((button) => button.addEventListener("click", () => {
      this.#root.querySelector(".mode.active")?.classList.remove("active");
      button.classList.add("active");
      this.#events.emit("settings.modeChanged", { mode: button.dataset.mode });
      if (this.#analysis.isRunning) {
        this.#analysis.stop();
        this.#analysis.start(button.dataset.mode).catch((error) => this.#events.emit("analysis.error", { message: error.message }));
      }
    }));
    this.#root.querySelectorAll(".source").forEach((button) => button.addEventListener("click", () => {
      this.#root.querySelector(".source.active")?.classList.remove("active");
      button.classList.add("active");
      const useFile = button.dataset.source === "file";
      cameraControls.hidden = useFile;
      fileControls.hidden = !useFile;
      if (useFile) {
        this.#analysis.stop();
        this.#fieldCalibration.cancel();
        this.#camera.stop();
        sourceStatus.textContent = this.#videoFile.isLoaded ? "Video cargado" : "Selecciona un archivo";
      } else {
        this.#analysis.stop();
        this.#fieldCalibration.cancel();
        this.#videoFile.clear();
        this.#overlay.clear();
        sourceStatus.textContent = "Sin conectar";
        sourceStatus.classList.remove("live");
        this.#root.querySelector("#video-empty").hidden = false;
        analysisToggle.disabled = true;
        fieldToggle.disabled = true;
      }
    }));
  }

  async #restoreSettings() {
    try {
      const mode = await this.#store.loadSetting("mode");
      if (mode && this.#root.querySelector(`[data-mode="${mode}"]`)) {
        this.#root.querySelector(".mode.active")?.classList.remove("active");
        this.#root.querySelector(`[data-mode="${mode}"]`).classList.add("active");
        this.#events.emit("settings.modeChanged", { mode });
      }
      const field = await this.#store.loadSetting("field");
      if (field) {
        const lengthEl = this.#root.querySelector("#field-length");
        const widthEl = this.#root.querySelector("#field-width");
        if (lengthEl) lengthEl.value = field.length;
        if (widthEl) widthEl.value = field.width;
      }
      const teamColors = await this.#store.loadSetting("teamColors");
      if (teamColors) {
        const aInput = this.#root.querySelector("#color-team-a");
        const bInput = this.#root.querySelector("#color-team-b");
        const ballInput = this.#root.querySelector("#color-ball");
        if (teamColors.teamA && aInput) aInput.value = teamColors.teamA;
        if (teamColors.teamB && bInput) bInput.value = teamColors.teamB;
        if (teamColors.ball && ballInput) ballInput.value = teamColors.ball;
      }
      const colors = {
        teamA: this.#root.querySelector("#color-team-a")?.value || "#3da5ff",
        teamB: this.#root.querySelector("#color-team-b")?.value || "#ff6b6b",
        ball: this.#root.querySelector("#color-ball")?.value || "#f5c518",
      };
      this.#events.emit("settings.teamColors", colors);
      this.#root.querySelector(".dot.team-a").style.background = colors.teamA;
      this.#root.querySelector(".dot.team-b").style.background = colors.teamB;
      this.#root.querySelector(".dot.ball").style.background = colors.ball;
    } catch (error) { console.warn("No se pudieron restaurar los ajustes:", error?.message || error); }
  }

  #destroyModules() {
    for (const unsub of this.#unsubscribers) unsub();
    this.#unsubscribers = [];
    this.#dashboard?.destroy?.();
    this.#dashboard = undefined;
    this.#tracking?.destroy?.();
    this.#tracking = undefined;
    this.#fieldCalibration?.destroy?.();
    this.#fieldCalibration = undefined;
    this.#metrics?.destroy?.();
    this.#metrics = undefined;
    this.#tactical?.destroy?.();
    this.#tactical = undefined;
    this.#heatmap?.destroy?.();
    this.#heatmap = undefined;
    this.#recorder?.destroy?.();
    this.#recorder = undefined;
    this.#history?.destroy?.();
    this.#history = undefined;
    this.#insights?.destroy?.();
    this.#insights = undefined;
    this.#overlay?.destroy?.();
    this.#overlay = undefined;
    this.#analysis?.stop();
    this.#analysis = undefined;
  }

  #destroy() {
    this.#destroyModules();
  }

  #renderSummary(session) {
    const stats = this.#root.querySelector("#summary-stats");
    const events = this.#root.querySelector("#summary-events");
    const insights = this.#root.querySelector("#summary-insights");
    const dur = Math.round(session.durationMs / 1000);
    const mins = Math.floor(dur / 60);
    const secs = dur % 60;
    stats.innerHTML = `<dl class="session-stats">
      <div><dt>Duración</dt><dd>${mins}m ${secs}s</dd></div>
      <div><dt>Modo</dt><dd>${session.mode}</dd></div>
      <div><dt>Distancia</dt><dd>${session.distance.toFixed(0)} m</dd></div>
      <div><dt>Vel. máxima</dt><dd>${session.maxSpeed.toFixed(1)} m/s</dd></div>
      ${session.possession != null ? `<div><dt>Posesión A</dt><dd>${session.possession}%</dd></div>` : ""}
      ${session.teamDistanceA != null ? `<div><dt>Dist. A</dt><dd>${session.teamDistanceA.toFixed(0)} m</dd></div>` : ""}
      ${session.teamDistanceB != null ? `<div><dt>Dist. B</dt><dd>${session.teamDistanceB.toFixed(0)} m</dd></div>` : ""}
    </dl>`;
    const evs = session.events || [];
    events.innerHTML = evs.length ? `<h4>Eventos (${evs.length})</h4><ol class="event-list">${evs.map((ev) => {
      const sec = Math.round(ev.timestamp / 1000);
      return `<li><time>${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}</time> ${ev.label}</li>`;
    }).join("")}</ol>` : "";
    const ins = session.insights || [];
    insights.innerHTML = ins.length ? `<h4>Insights</h4><ul class="insight-list">${ins.map((t) => `<li>${t}</li>`).join("")}</ul>` : "";
  }

  #renderTemplateList() {
    const container = this.#root.querySelector("#draw-templates");
    const templates = this.#drawTool.getTemplates();
    container.innerHTML = templates.length ? templates.map((t) =>
      `<button class="template-load" data-name="${t.name.replace(/"/g, "&quot;")}">${t.name}</button>`
    ).join("") : "";
    container.querySelectorAll(".template-load").forEach((btn) => btn.addEventListener("click", () => {
      if (confirm(`Cargar plantilla "${btn.dataset.name}"? Se perderá el dibujo actual.`)) {
        this.#drawTool.loadTemplate(btn.dataset.name);
      }
    }));
  }

  async #registerServiceWorker() {
    const state = this.#root.querySelector("#pwa-state");
    if (!import.meta.env || import.meta.env.DEV) {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => registrations.forEach((registration) => registration.unregister())).catch(() => {});
      }
      state.textContent = "Modo offline solo en compilación de producción";
      return;
    }
    if (!("serviceWorker" in navigator)) { state.textContent = "Tu navegador no admite modo offline"; return; }
    try { await navigator.serviceWorker.register("./service-worker.js"); state.textContent = "Preparado para uso offline"; }
    catch { state.textContent = "Modo offline no disponible en este origen"; }
  }
}
