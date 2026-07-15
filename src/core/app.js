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
      this.#renderHome();
      return;
    }
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
      <nav class="fixed top-0 w-full z-50 flex justify-between items-center px-8 h-16 bg-surface border-b border-outline-variant" style="background:#051426">
        <div class="flex items-center gap-4">
          <span class="text-headline-md font-bold" style="color:#aff73f;font-family:Inter;font-size:20px;line-height:28px">OpenMatch AI</span>
        </div>
        <div class="flex items-center gap-6">
          <span class="text-label-caps tracking-widest hidden md:block" style="color:#c2cab0">Procesamiento 100% local</span>
        </div>
      </nav>
      <main class="relative z-10 pt-32 pb-24 px-8 max-w-7xl mx-auto">
        <section class="mb-16 md:mb-24 flex flex-col items-start gap-6 max-w-3xl">
          <h1 class="text-5xl md:text-6xl leading-tight font-bold tracking-tight" style="color:#aff73f;font-family:Inter">Tu partido, entendido desde la cancha.</h1>
          <p class="text-xl" style="color:#c2cab0;font-family:Inter">Análisis táctico profesional con privacidad total. Todo el procesamiento ocurre en tu navegador sin enviar datos a la nube.</p>
        </section>
        <div class="grid grid-cols-1 md:grid-cols-12 gap-5">
          <div id="home-card-match" class="md:col-span-8 relative overflow-hidden rounded-[18px] cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] p-6 flex flex-col justify-between min-h-[340px]" style="background:#122033;border:1px solid rgba(175,247,63,.3);box-shadow:0 0 20px rgba(175,247,63,.15)">
            <div class="absolute top-0 right-0 p-8 opacity-20">
              <span class="text-[120px]" style="color:#aff73f;font-family:'Material Symbols Outlined'">videocam</span>
            </div>
            <div class="relative z-20">
              <div class="w-12 h-12 rounded-lg flex items-center justify-center mb-6" style="background:#aff73f">
                <span class="font-bold text-xl" style="color:#051426">+</span>
              </div>
              <h2 class="text-3xl font-semibold mb-2" style="color:#ffffff;font-family:Inter">Nuevo Partido</h2>
              <p class="text-base max-w-md" style="color:#c2cab0;font-family:Inter">Inicia un análisis en vivo mediante cámara conectada o carga un video grabado para procesamiento automático de trayectorias.</p>
            </div>
            <div class="relative z-20 mt-auto">
              <button id="home-btn-match" class="font-bold px-8 py-3 rounded-lg flex items-center gap-2 transition-colors" style="background:#aff73f;color:#213600">Comenzar Sesión <span style="font-family:'Material Symbols Outlined'">arrow_forward</span></button>
            </div>
          </div>
          <div id="home-card-history" class="md:col-span-4 relative rounded-[18px] p-6 flex flex-col justify-between cursor-pointer min-h-[340px]" style="background:rgba(16,24,39,.8);border:1px solid #263148;backdrop-filter:blur(12px)">
            <div>
              <div class="w-10 h-10 rounded-lg flex items-center justify-center mb-6" style="background:#3f4758">
                <span style="font-family:'Material Symbols Outlined';color:#ffffff">history</span>
              </div>
              <h2 class="text-xl font-semibold mb-2" style="color:#ffffff;font-family:Inter">Historial</h2>
              <p class="text-sm" style="color:#c2cab0;font-family:Inter">Revisa tus sesiones guardadas, estadísticas de posesión, mapas de calor e insights tácticos generados anteriormente.</p>
            </div>
            <div class="mt-8 pt-4 flex items-center justify-between" style="border-top:1px solid #424935">
              <span class="text-xs font-bold tracking-widest" style="color:#c2cab0">SESIONES</span>
              <span style="font-family:'Material Symbols Outlined';color:#ffffff">chevron_right</span>
            </div>
          </div>
          <div id="home-card-practice" class="md:col-span-12 relative rounded-[18px] p-6 flex flex-col md:flex-row gap-8 items-center cursor-pointer" style="background:rgba(16,24,39,.8);border:1px solid #263148;backdrop-filter:blur(12px)">
            <div class="w-full md:w-1/3 aspect-video rounded-xl overflow-hidden relative flex items-center justify-center" style="background:#051426">
              <span style="font-family:'Material Symbols Outlined';color:#aff73f;font-size:3rem">edit_note</span>
            </div>
            <div class="flex-1">
              <h2 class="text-xl font-semibold mb-2" style="color:#ffffff;font-family:Inter">Práctica Táctica</h2>
              <p class="text-base mb-6" style="color:#c2cab0;font-family:Inter">Herramientas de dibujo profesional sobre video. Crea clips educativos, explica conceptos de presión o transiciones con nuestra pizarra digital interactiva.</p>
              <div class="flex gap-4">
                <span class="px-3 py-1 rounded text-xs font-bold tracking-widest" style="background:#283549;color:#d5e3fd">Pizarra Pro</span>
                <span class="px-3 py-1 rounded text-xs font-bold tracking-widest" style="background:#283549;color:#d5e3fd">Exportar</span>
              </div>
            </div>
            <div class="hidden md:block">
              <span style="font-family:'Material Symbols Outlined';color:#aff73f;font-size:2rem">brush</span>
            </div>
          </div>
        </div>
      </main>
      <footer class="w-full py-4 px-8 flex flex-col md:flex-row justify-between items-center border-t text-sm gap-4" style="background:#010e21;border-color:#424935;color:#c2cab0;font-family:Inter">
        <div class="flex items-center gap-4">
          <span class="font-bold text-xs tracking-widest" style="color:#aff73f">OpenMatch AI</span>
          <span>© 2024. Análisis táctico privado.</span>
        </div>
      </footer>
      <div class="fixed inset-0 z-50 hidden" id="setup-modal">
        <div class="absolute inset-0 transition-opacity" style="background:rgba(5,20,38,.9);backdrop-filter:blur(12px)"></div>
        <div class="absolute inset-0 flex items-center justify-center p-4">
          <div class="rounded-[18px] border w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col shadow-2xl custom-scrollbar" style="background:#122033;border-color:#424935">
            <div class="p-6 border-b flex justify-between items-center" style="border-color:#424935;background:#1d2b3e">
              <h3 class="text-2xl font-semibold" style="color:#ffffff;font-family:Inter">Configuración del Encuentro</h3>
              <button id="modal-close" style="font-family:'Material Symbols Outlined';color:#c2cab0;cursor:pointer">close</button>
            </div>
            <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div class="space-y-6">
                <div>
                  <label class="text-xs font-bold tracking-widest" style="color:#c2cab0">Equipo Local</label>
                  <div class="flex gap-2 mt-2">
                    <input id="hl-team-a-name" class="flex-1 rounded-lg px-4 py-2 border" placeholder="Nombre Local" style="background:#051426;border-color:#424935;color:#ffffff" />
                    <input id="hl-team-a-color" type="color" value="#3da5ff" class="w-12 h-10 rounded-lg cursor-pointer" style="background:transparent;border:none" />
                  </div>
                </div>
                <div>
                  <label class="text-xs font-bold tracking-widest" style="color:#c2cab0">Equipo Visitante</label>
                  <div class="flex gap-2 mt-2">
                    <input id="hl-team-b-name" class="flex-1 rounded-lg px-4 py-2 border" placeholder="Nombre Visitante" style="background:#051426;border-color:#424935;color:#ffffff" />
                    <input id="hl-team-b-color" type="color" value="#ff6b6b" class="w-12 h-10 rounded-lg cursor-pointer" style="background:transparent;border:none" />
                  </div>
                </div>
                <div>
                  <label class="text-xs font-bold tracking-widest" style="color:#c2cab0">Color del Balón</label>
                  <div class="flex items-center gap-4 mt-2">
                    <input id="hl-ball-color" type="color" value="#f5c518" class="w-12 h-10 rounded-lg cursor-pointer" style="background:transparent;border:none" />
                    <span class="text-sm italic" style="color:#c2cab0">Se recomienda color contrastante al césped.</span>
                  </div>
                </div>
              </div>
              <div class="space-y-6">
                <div>
                  <label class="text-xs font-bold tracking-widest" style="color:#c2cab0">Tipo de Juego / Dimensiones (m)</label>
                  <div class="grid grid-cols-2 gap-4 mt-2">
                    <select id="hl-field-type" class="rounded-lg px-4 py-2 border" style="background:#051426;border-color:#424935;color:#ffffff">
                      <option value="football11">Fútbol 11</option>
                      <option value="football7">Fútbol 7</option>
                      <option value="baby">Baby Fútbol</option>
                      <option value="futsal">Futsal</option>
                    </select>
                    <div class="flex gap-2">
                      <input id="hl-field-length" type="number" value="105" class="w-full rounded-lg px-4 py-2 border text-center" style="background:#051426;border-color:#424935;color:#ffffff" />
                      <input id="hl-field-width" type="number" value="68" class="w-full rounded-lg px-4 py-2 border text-center" style="background:#051426;border-color:#424935;color:#ffffff" />
                    </div>
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="text-xs font-bold tracking-widest" style="color:#c2cab0">Duración (min)</label>
                    <input id="hl-duration" type="number" min="20" max="120" value="90" class="w-full rounded-lg px-4 py-2 border mt-2" style="background:#051426;border-color:#424935;color:#ffffff" />
                  </div>
                  <div>
                    <label class="text-xs font-bold tracking-widest" style="color:#c2cab0">Jugadores p/e</label>
                    <input id="hl-players" type="number" min="5" max="11" value="11" class="w-full rounded-lg px-4 py-2 border mt-2" style="background:#051426;border-color:#424935;color:#ffffff" />
                  </div>
                </div>
                <div>
                  <label class="text-xs font-bold tracking-widest" style="color:#c2cab0">Modo de Análisis</label>
                  <div class="grid grid-cols-2 gap-2 mt-2">
                    <button class="hl-mode active p-3 rounded-lg border text-sm font-bold" data-mode="balanced" style="border-color:#aff73f;background:rgba(175,247,63,.1);color:#aff73f">Balanceado</button>
                    <button class="hl-mode p-3 rounded-lg border text-sm" data-mode="performance" style="border-color:#424935;color:#c2cab0">Rendimiento</button>
                    <button class="hl-mode p-3 rounded-lg border text-sm" data-mode="precision" style="border-color:#424935;color:#c2cab0">Precisión</button>
                    <button class="hl-mode p-3 rounded-lg border text-sm" data-mode="saver" style="border-color:#424935;color:#c2cab0">Ahorro</button>
                  </div>
                </div>
              </div>
            </div>
            <div class="p-6 border-t flex flex-col md:flex-row items-center justify-between gap-4" style="border-color:#424935;background:#1d2b3e">
              <div class="flex items-center gap-3">
                <span style="font-family:'Material Symbols Outlined';color:#aff73f">info</span>
                <p class="text-sm" style="color:#c2cab0">El motor de IA cargará en tu memoria local.</p>
              </div>
              <button id="hl-start-btn" class="w-full md:w-auto px-12 py-3 rounded-lg font-bold flex items-center justify-center gap-2" style="background:#283549;color:#c2cab0;cursor:not-allowed" disabled>
                Comenzar
                <span style="font-family:'Material Symbols Outlined'">play_circle</span>
              </button>
            </div>
          </div>
        </div>
      </div>`;
    this.#setupHomeListeners();
  }

  #setupHomeListeners() {
    this.#root.querySelector("#home-btn-match")?.addEventListener("click", () => this.#toggleModal(true));
    this.#root.querySelector("#home-card-match")?.addEventListener("click", () => this.#toggleModal(true));
    this.#root.querySelector("#home-card-history")?.addEventListener("click", () => this.#navigate("history"));
    this.#root.querySelector("#home-card-practice")?.addEventListener("click", () => this.#navigate("practice"));
    this.#root.querySelector("#modal-close")?.addEventListener("click", () => this.#toggleModal(false));
    const validateHome = () => {
      const aName = this.#root.querySelector("#hl-team-a-name")?.value.trim();
      const bName = this.#root.querySelector("#hl-team-b-name")?.value.trim();
      const btn = this.#root.querySelector("#hl-start-btn");
      if (btn) btn.disabled = !aName || !bName;
    };
    this.#root.querySelectorAll("#hl-team-a-name, #hl-team-b-name, #hl-duration, #hl-players").forEach((el) => el?.addEventListener("input", validateHome));
    this.#root.querySelectorAll(".hl-mode").forEach((btn) => btn.addEventListener("click", () => {
      this.#root.querySelectorAll(".hl-mode").forEach((b) => { b.style.borderColor = "#424935"; b.style.color = "#c2cab0"; b.style.background = "transparent"; });
      btn.style.borderColor = "#aff73f"; btn.style.color = "#aff73f"; btn.style.background = "rgba(175,247,63,.1)";
      validateHome();
    }));
    this.#root.querySelector("#hl-start-btn")?.addEventListener("click", () => {
      if (this.#root.querySelector("#hl-start-btn").disabled) return;
      this.#syncHomeSetup();
      this.#toggleModal(false);
      this.#navigate("match");
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") this.#toggleModal(false); });
    validateHome();
  }

  #toggleModal(show) {
    const modal = this.#root.querySelector("#setup-modal");
    if (!modal) return;
    modal.classList.toggle("hidden", !show);
    document.body.style.overflow = show ? "hidden" : "auto";
  }

  #syncHomeSetup() {
    const get = (id) => this.#root.querySelector(id);
    const mode = this.#root.querySelector(".hl-mode.active")?.dataset.mode || "balanced";
    const config = {
      mode,
      fieldType: get("#hl-field-type")?.value || "football11",
      length: Number(get("#hl-field-length")?.value) || 105,
      width: Number(get("#hl-field-width")?.value) || 68,
      teamA: { name: get("#hl-team-a-name")?.value.trim() || "", color: get("#hl-team-a-color")?.value || "#3da5ff" },
      teamB: { name: get("#hl-team-b-name")?.value.trim() || "", color: get("#hl-team-b-color")?.value || "#ff6b6b" },
      ballColor: get("#hl-ball-color")?.value || "#f5c518",
      duration: Number(get("#hl-duration")?.value) || 90,
      players: Number(get("#hl-players")?.value) || 11,
    };
    this.#events.emit("settings.teamColors", { teamA: config.teamA.color, teamB: config.teamB.color, ball: config.ballColor });
    this.#events.emit("settings.modeChanged", { mode });
    this.#store.saveSetting("matchConfig", config).catch(() => {});
  }

  #workspaceHTML() {
    return `
      <header class="topbar">
        <a class="brand" href="#" id="home-link" aria-label="Volver al inicio"><span class="brand-mark">←</span>Inicio</a>
        <div class="privacy"><span></span> Local</div>
      </header>
      <main class="workspace">
        <div class="match-bar" id="match-bar" hidden>
          <div class="bar-timer"><span id="timer-display">00:00</span></div>
          <div class="bar-possession" id="possession-bar"><span class="pos-label pos-a" id="pos-a">A 50%</span><div class="pos-track"><div class="pos-fill pos-fill-a" id="pos-fill-a" style="width:50%"></div></div><span class="pos-label pos-b" id="pos-b">50% B</span></div>
          <div class="bar-events" id="event-timeline"><div class="timeline-track" id="timeline-track"></div></div>
        </div>
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
              <button id="main-action" class="primary" disabled>📷 Iniciar cámara</button>
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
          <aside class="sidebar">
            <div class="event-marker" id="event-marker" hidden>
              <button class="event-btn goal" data-event="goal">⚽ Gol</button>
              <button class="event-btn fault" data-event="fault">🚩 Falta</button>
              <button class="event-btn offside" data-event="offside">🚦 Offside</button>
              <button class="event-btn chance" data-event="chance">🎯 Ocasión</button>
              <button class="event-btn card" data-event="yellow">🟨 Tarjeta</button>
              <div class="event-feedback" id="event-feedback" hidden><ol class="event-feedback-list" id="event-list"></ol></div>
            </div>
            <div id="dashboard"></div><div id="history"></div><div id="insights"></div>
          </aside>
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
      <div class="bottom-bar" id="bottom-bar">
        <div class="bottom-left">
          <button id="btn-flip" class="bottom-btn" title="Cambiar cámara">🔄</button>
          <select id="bottom-quality" class="bottom-select"><option value="1080">1080p</option><option value="720" selected>720p</option><option value="480">480p</option></select>
        </div>
        <div class="bottom-right">
          <button id="btn-settings" class="bottom-btn" title="Configuración">⚙️</button>
        </div>
      </div>
      <footer>OpenMatch AI · MVP local-first · <span id="pwa-state">Comprobando modo offline…</span></footer>`;
  }

  #bindControls() {
    const select = this.#root.querySelector("#camera-select");
    const quality = this.#root.querySelector("#quality-select");
    const fileInput = this.#root.querySelector("#video-file");
    const sourceStatus = this.#root.querySelector("#source-status");
    const cameraControls = this.#root.querySelector(".camera-controls");
    const fileControls = this.#root.querySelector("#file-controls");
    const preview = this.#root.querySelector("#camera-preview");
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
    let mainState = "idle";
    const mainBtn = this.#root.querySelector("#main-action");
    const cameraSelect = this.#root.querySelector("#camera-select");
    const qualSelect = this.#root.querySelector("#quality-select");
    const updateMain = () => {
      const texts = {
        idle: "📷 Iniciar cámara",
        calibrate: "📐 Calibrar cancha",
        ready: "▶️ Iniciar análisis",
        running: "⏸️ Pausar",
        paused: "▶️ Reanudar",
        finalize: "⏹️ Finalizar",
      };
      mainBtn.textContent = texts[mainState] || texts.idle;
      mainBtn.disabled = mainState === "idle" && !this.#camera.isRunning && !this.#videoFile.isLoaded;
    };
    mainBtn.addEventListener("click", () => {
      if (mainState === "idle") { this.#camera.start({ deviceId: cameraSelect.value, height: Number(qualSelect.value) }).catch(() => {}); }
      else if (mainState === "calibrate") {
        const dims = { length: Number(this.#root.querySelector("#field-length").value), width: Number(this.#root.querySelector("#field-width").value) };
        this.#fieldCalibration.start(dims);
        mainState = "ready"; updateMain();
      }
      else if (mainState === "ready") {
        this.#analysis.start(this.#root.querySelector(".mode.active")?.dataset.mode || "balanced").catch(() => {});
        mainState = "running"; updateMain();
      }
      else if (mainState === "running") { this.#analysis.stop(); mainState = "paused"; updateMain(); }
      else if (mainState === "paused") {
        this.#analysis.start(this.#root.querySelector(".mode.active")?.dataset.mode || "balanced").catch(() => {});
        mainState = "finalize"; updateMain();
      }
      else if (mainState === "finalize") { this.#analysis.stop(); }
    });
    let timerSeconds = 0, timerInterval = null;
    const timerDisplay = this.#root.querySelector("#timer-display");
    const startTimer = () => { if (timerInterval) return; timerInterval = setInterval(() => { timerSeconds++; timerDisplay.textContent = `${String(Math.floor(timerSeconds / 60)).padStart(2, "0")}:${String(timerSeconds % 60).padStart(2, "0")}`; }, 1000); };
    const stopTimer = () => { if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } };
    const resetTimer = () => { stopTimer(); timerSeconds = 0; timerDisplay.textContent = "00:00"; };
    const posFillA = this.#root.querySelector("#pos-fill-a");
    let possessionCount = { a: 0, b: 0 }, lastPossTs = 0;
    this.#events.on("camera.ready", () => { mainState = "calibrate"; updateMain(); });
    this.#events.on("video.loaded", () => { mainState = "calibrate"; updateMain(); });
    this.#events.on("field.calibrated", () => { mainState = "ready"; updateMain(); });
    this.#events.on("analysis.ready", () => {
      mainState = "running"; updateMain(); startTimer();
      this.#root.querySelector("#match-bar").hidden = false;
    });
    this.#events.on("analysis.stopped", () => {
      mainState = "finalize"; updateMain(); stopTimer();
    });
    this.#events.on("field.calibrationStarted", resetTimer);
    this.#events.on("tracking.updated", (ev) => {
      const ball = (ev.detail.tracks || []).find((t) => t.label === "sports ball" && t.fieldPosition);
      const players = (ev.detail.tracks || []).filter((t) => t.label === "person" && t.fieldPosition);
      if (ball && players.length) {
        const mid = this.#root.querySelector("#field-length")?.value || 105;
        const teamA = players.filter((p) => p.fieldPosition.x < mid / 2).length;
        const teamB = players.filter((p) => p.fieldPosition.x >= mid / 2).length;
        const total = teamA + teamB || 1;
        const pctA = Math.round((teamA / total) * 100);
        posFillA.style.width = pctA + "%";
        this.#root.querySelector("#pos-a").textContent = "A " + pctA + "%";
        this.#root.querySelector("#pos-b").textContent = (100 - pctA) + "% B";
      }
    });
    updateMain();
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
    fileInput.addEventListener("change", async () => {
      const [file] = fileInput.files;
      if (!file) return;
      this.#camera.stop();
      this.#analysis.stop();
      await this.#videoFile.load(file);
    });
    this.#unsubscribers.push(this.#events.on("camera.ready", () => {
      mainBtn.disabled = false;
      fieldToggle.disabled = false;
      drawToggle.disabled = false;
      sourceStatus.textContent = "En directo";
      sourceStatus.classList.add("live");
      this.#root.querySelector("#video-empty").hidden = true;
      this.#root.querySelector("#camera-message").textContent = "Captura activa: el procesamiento se realizará localmente.";
    }));
    this.#unsubscribers.push(this.#events.on("camera.stopped", () => {
      mainBtn.disabled = true;
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
      mainBtn.disabled = false;
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
    const eventMarker = this.#root.querySelector("#event-marker");
    this.#unsubscribers.push(this.#events.on("analysis.ready", () => {
      eventMarker.hidden = false;
      this.#root.querySelector("#camera-message").textContent = "Análisis local activo.";
    }));
    this.#unsubscribers.push(this.#events.on("analysis.stopped", () => { eventMarker.hidden = true; }));
    this.#unsubscribers.push(this.#events.on("session.saved", (event) => {
      this.#setPhase("summary");
      this.#renderSummary(event.detail);
    }));
    this.#unsubscribers.push(this.#events.on("analysis.error", (event) => {
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
    const bottomQuality = this.#root.querySelector("#bottom-quality");
    const mainQuality = this.#root.querySelector("#quality-select");
    if (bottomQuality && mainQuality) {
      bottomQuality.addEventListener("change", () => { mainQuality.value = bottomQuality.value; });
      mainQuality.addEventListener("change", () => { bottomQuality.value = mainQuality.value; });
    }
    this.#root.querySelector("#btn-flip")?.addEventListener("click", () => {
      const sel = this.#root.querySelector("#camera-select");
      const idx = sel?.selectedIndex ?? 0;
      if (sel && sel.options.length > 1) { sel.selectedIndex = (idx + 1) % sel.options.length; this.#camera.start({ deviceId: sel.value }).catch(() => {}); }
    });
    this.#root.querySelector("#btn-settings")?.addEventListener("click", () => this.#setPhase("setup"));
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
        this.#renderTemplateList();
      }
    });
    const eventList = this.#root.querySelector("#event-list");
    const eventFeedback = this.#root.querySelector("#event-feedback");
    const timelineTrack = this.#root.querySelector("#timeline-track");
    this.#root.querySelectorAll(".event-btn").forEach((btn) => btn.addEventListener("click", () => {
      const label = btn.textContent.trim();
      this.#recorder.markEvent(btn.dataset.event, label);
      showToast(`✓ ${label}`);
      const elapsed = (Date.now() - (this.#recorder.sessionStartedAt || Date.now())) / 1000;
      const m = Math.floor(elapsed / 60);
      const s = Math.floor(elapsed % 60);
      const li = document.createElement("li");
      li.innerHTML = `<time>${m}:${String(s).padStart(2, "0")}</time> ${label}`;
      eventList.appendChild(li);
      eventFeedback.hidden = false;
      eventList.scrollTop = eventList.scrollHeight;
      if (timelineTrack) {
        const dot = document.createElement("span");
        dot.className = "timeline-event";
        const pct = Math.min(95, (elapsed / Math.max(1, timerSeconds)) * 100);
        dot.style.left = pct + "%";
        dot.title = m + ":" + String(s).padStart(2, "0") + " " + label;
        dot.textContent = label.charAt(0);
        timelineTrack.appendChild(dot);
      }
    }));
    this.#unsubscribers.push(this.#events.on("analysis.stopped", () => { eventFeedback.hidden = true; eventList.innerHTML = ""; }));
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
    const players = session.playerStats || [];
    if (players.length) {
      const bestDist = players.reduce((m, p) => Math.max(m, p.distance), 0);
      const bestSpeed = players.reduce((m, p) => Math.max(m, p.maxSpeed), 0);
      let html = `<h4>Jugadores (${players.length})</h4><table class="player-table"><thead><tr><th>#</th><th>Distancia</th><th>Vel. media</th><th>Vel. máx</th></tr></thead><tbody>`;
      players.sort((a, b) => b.distance - a.distance).forEach((p, i) => {
        const isBestDist = p.distance === bestDist;
        const isBestSpeed = p.maxSpeed === bestSpeed;
        html += `<tr${isBestDist ? ' class="best-dist"' : ""}${isBestSpeed ? ' class="best-speed"' : ""}><td>${i + 1}</td><td>${p.distance}m${isBestDist ? " 🏆" : ""}</td><td>${p.avgSpeed} m/s</td><td>${p.maxSpeed} m/s${isBestSpeed ? " 🏆" : ""}</td></tr>`;
      });
      html += "</tbody></table>";
      const target = this.#root.querySelector("#summary-events");
      if (target) target.insertAdjacentHTML("afterend", `<div id="summary-players">${html}</div>`);
    }
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
