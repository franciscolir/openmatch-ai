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
    if (view === "home") {
      this.#root.querySelector(".home-screen").hidden = false;
      this.#root.querySelector(".workspace-screen")?.remove();
      this.#destroyModules();
    } else {
      this.#root.querySelector(".home-screen").hidden = true;
      this.#initWorkspace();
    }
  }

  #setPhase(phase) {
    this.#root.querySelector("#setup-overlay").hidden = phase !== "setup";
    this.#root.querySelector("#summary-overlay").hidden = phase !== "summary";
    const content = this.#root.querySelector("#workspace-content");
    content.style.opacity = phase === "setup" ? "0.15" : "1";
    content.style.pointerEvents = phase === "setup" ? "none" : "auto";
  }

  #initWorkspace() {
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
    getDeviceProfile().then((profile) => {
      const sel = this.#root.querySelector("#setup-overlay");
      sel.querySelectorAll(".mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === profile.recommendedMode));
      this.#syncSetup();
    });
    const setupOverlay = this.#root.querySelector("#setup-overlay");
    setupOverlay.querySelectorAll(".mode").forEach((btn) => btn.addEventListener("click", () => {
      setupOverlay.querySelectorAll(".mode").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      this.#syncSetup();
    }));
    setupOverlay.querySelectorAll(".field-type").forEach((btn) => btn.addEventListener("click", () => {
      setupOverlay.querySelectorAll(".field-type").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      this.#syncSetup();
    }));
    const syncField = () => this.#syncSetup();
    setupOverlay.querySelector("#sl-field-length").addEventListener("input", syncField);
    setupOverlay.querySelector("#sl-field-width").addEventListener("input", syncField);
    setupOverlay.querySelector("#setup-start").addEventListener("click", () => {
      this.#syncSetup();
      this.#setPhase("analysis");
    });
    this.#root.querySelector("#summary-new").addEventListener("click", () => { this.#navigate("home"); this.#navigate("workspace"); });
    this.#root.querySelector("#summary-home").addEventListener("click", () => this.#navigate("home"));
  }

  #syncSetup() {
    const overlay = this.#root.querySelector("#setup-overlay");
    const mode = overlay.querySelector(".mode.active")?.dataset.mode || "balanced";
    const ftype = overlay.querySelector(".field-type.active")?.dataset.type || "football11";
    const length = Number(overlay.querySelector("#sl-field-length").value) || 105;
    const width = Number(overlay.querySelector("#sl-field-width").value) || 68;
    const colors = {
      teamA: overlay.querySelector("#sl-color-a").value,
      teamB: overlay.querySelector("#sl-color-b").value,
      ball: overlay.querySelector("#sl-color-ball").value,
    };
    const ws = this.#root.querySelector("#workspace-content");
    ws.querySelectorAll(".mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    ws.querySelectorAll(".field-type").forEach((b) => b.classList.toggle("active", b.dataset.type === ftype));
    ws.querySelector("#field-length").value = length;
    ws.querySelector("#field-width").value = width;
    ws.querySelector("#color-team-a").value = colors.teamA;
    ws.querySelector("#color-team-b").value = colors.teamB;
    ws.querySelector("#color-ball").value = colors.ball;
    this.#events.emit("settings.teamColors", colors);
    this.#events.emit("settings.modeChanged", { mode });
    this.#tactical?.refreshFieldType(ftype, { length, width });
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
          <button class="home-card" data-nav="workspace">
            <span class="home-card-icon">🎥</span>
            <strong>Nuevo Partido</strong>
            <span>Análisis en vivo o video grabado con detección de jugadores, posesión y mapa táctico.</span>
          </button>
          <button class="home-card" data-nav="workspace">
            <span class="home-card-icon">📋</span>
            <strong>Historial</strong>
            <span>Sesiones guardadas con estadísticas, eventos e insights tácticos.</span>
          </button>
          <button class="home-card" data-nav="workspace">
            <span class="home-card-icon">✎</span>
            <strong>Práctica Táctica</strong>
            <span>Dibujo de jugadas sobre video congelado. Crea y guarda plantillas tácticas.</span>
          </button>
        </div>
      </main>
      <footer>OpenMatch AI · MVP local-first · <span id="pwa-state">Comprobando modo offline…</span></footer>`;
    this.#root.querySelectorAll("[data-nav]").forEach((btn) => btn.addEventListener("click", () => this.#navigate("workspace")));
  }

  #workspaceHTML() {
    return `
      <header class="topbar">
        <a class="brand" href="#" id="home-link" aria-label="Volver al inicio"><span class="brand-mark">←</span>Inicio</a>
        <div class="phase-bar">
          <button class="phase-step active" data-phase="setup"><span class="phase-num">1</span> Configuración</button>
          <button class="phase-step" data-phase="analysis" disabled><span class="phase-num">2</span> Análisis</button>
          <button class="phase-step" data-phase="summary" disabled><span class="phase-num">3</span> Resumen</button>
        </div>
        <div class="privacy"><span></span> Local</div>
      </header>
      <main class="workspace">
        <div class="workspace-content" id="workspace-content">
          <section class="hero panel">
            <p class="eyebrow">ANÁLISIS</p>
            <h1>Tu partido, entendido<br />desde la cancha.</h1>
            <p class="lead">Procesamiento 100% local.</p>
          </section>
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
        </div>
        <aside class="setup-overlay" id="setup-overlay">
          <div class="setup-card">
            <p class="eyebrow">BIENVENIDO</p>
            <h3 style="margin:6px 0 4px">Configuración del partido</h3>
            <p style="color:var(--muted);font-size:.78rem;margin:0 0 18px">Ajusta los parámetros antes de empezar.</p>
            <div class="mode-picker" role="group" aria-label="Modo">
              <button class="mode active" data-mode="balanced">Balanceado</button>
              <button class="mode" data-mode="performance">Rendimiento</button>
              <button class="mode" data-mode="precision">Precisión</button>
              <button class="mode" data-mode="saver">Ahorro</button>
            </div>
            <div class="field-type-picker" role="group" style="margin-top:12px">
              <button class="field-type active" data-type="football11">F11</button>
              <button class="field-type" data-type="football7">F7</button>
              <button class="field-type" data-type="baby">Baby</button>
              <button class="field-type" data-type="futsal">Futsal</button>
            </div>
            <div style="display:flex;gap:10px;margin-top:12px">
              <label class="select-wrap"><small>Largo</small><input id="sl-field-length" type="number" value="105" /></label>
              <label class="select-wrap"><small>Ancho</small><input id="sl-field-width" type="number" value="68" /></label>
            </div>
            <details style="margin-top:10px;font-size:.78rem;color:var(--muted)">
              <summary>Colores de equipos</summary>
              <div class="team-config" style="margin-top:6px"><label>A <input id="sl-color-a" type="color" value="#3da5ff" /></label><label>B <input id="sl-color-b" type="color" value="#ff6b6b" /></label><label>Balón <input id="sl-color-ball" type="color" value="#f5c518" /></label></div>
            </details>
            <button id="setup-start" class="primary" style="width:100%;margin-top:16px" disabled>Comenzar</button>
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
    this.#unsubscribers.push(this.#events.on("session.saved", () => { eventFeedback.hidden = true; eventList.innerHTML = ""; }));
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
