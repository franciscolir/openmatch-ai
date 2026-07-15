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
    this.#root.innerHTML = "";
    document.body.style.overflow = "auto";
    if (view === "match") this.#initMatchView();
    else if (view === "history") this.#initHistoryView();
    else if (view === "practice") this.#initPracticeView();
  }

  #setPhase(phase) {
    const setup = this.#root.querySelector("#setup-overlay");
    const summary = this.#root.querySelector("#summary-overlay");
    if (setup) setup.hidden = phase !== "setup";
    if (summary) summary.hidden = phase !== "summary";
  }

  #initMatchView() {
    const ws = document.createElement("div");
    ws.className = "workspace-screen";
    ws.innerHTML = this.#workspaceHTML();
    this.#root.appendChild(ws);
    const homeLink = this.#root.querySelector("#home-link");
    if (homeLink) homeLink.addEventListener("click", (e) => { e.preventDefault(); this.#navigate("home"); });
    this.#recorder = new SessionRecorder(this.#events, this.#store);
    this.#bindControls();
    this.#restoreSettings();
    this.#root.querySelector("#summary-new")?.addEventListener("click", () => { this.#navigate("home"); this.#navigate("match"); });
    this.#root.querySelector("#summary-home")?.addEventListener("click", () => this.#navigate("home"));
  }

  #initHistoryView() {
    const ws = document.createElement("div");
    ws.className = "workspace-screen";
    ws.innerHTML = `
      <header class="fixed top-0 w-full z-50 flex justify-between items-center px-8 h-16" style="background:#051426;border-bottom:1px solid #263148">
        <div class="flex items-center gap-4">
          <button id="hist-back" class="flex items-center gap-2 transition-colors" style="color:#c2cab0;cursor:pointer">
            <span class="material-symbols-outlined">arrow_back</span>
            <span style="font-size:1.25rem;font-weight:600;color:#ffffff">Inicio</span>
          </button>
        </div>
        <span class="px-3 py-1 rounded-full text-xs font-bold tracking-widest" style="background:#122033;border:1px solid #263148;color:#c2cab0">Procesamiento 100% local</span>
      </header>
      <main style="padding-top:80px;padding-bottom:40px;padding-left:24px;padding-right:24px;max-width:1200px;margin:0 auto" class="md:ml-[240px]">
        <header class="mb-6">
          <h2 style="font-size:1.8rem;font-weight:600;color:#ffffff">Historial de Sesiones</h2>
          <p style="color:#c2cab0;font-size:1rem">Analiza tus sesiones pasadas y el progreso táctico del equipo.</p>
        </header>
        <div id="history" class="space-y-4"></div>
        <div class="mt-8 h-32 border-2 border-dashed rounded-xl flex flex-col items-center justify-center" style="border-color:#263148;color:#c2cab0">
          <span class="material-symbols-outlined mb-2" style="font-size:2rem">cloud_sync</span>
          <p style="font-size:.85rem">Todas las sesiones están sincronizadas localmente.</p>
        </div>
      </main>
      <footer class="w-full py-4 px-8 flex flex-col md:flex-row justify-between items-center border-t gap-4" style="background:#010e21;border-color:#263148;color:#c2cab0;font-size:.82rem" class="md:ml-[240px]">
        <span>© 2024 OpenMatch AI. Análisis táctico privado.</span>
        <div class="flex gap-6">
          <a style="color:#c2cab0;text-decoration:none" href="#">Privacy Policy</a>
          <a style="color:#c2cab0;text-decoration:none" href="#">Terms</a>
        </div>
      </footer>`;
    this.#root.appendChild(ws);
    this.#root.querySelector("#hist-back")?.addEventListener("click", () => this.#navigate("home"));
    this.#history = new HistoryPanel(this.#root, this.#events, this.#store);
  }

  #initPracticeView() {
    const ws = document.createElement("div");
    ws.className = "workspace-screen";
    ws.innerHTML = `
      <header class="fixed top-0 w-full z-50 flex justify-between items-center px-8 h-16" style="background:#051426;border-bottom:1px solid #424935">
        <div class="flex items-center gap-4">
          <button id="pp-home" class="material-symbols-outlined" style="color:#aff73f;cursor:pointer;font-size:24px">arrow_back</button>
          <span style="color:#ffffff;font-family:Inter;font-size:20px;font-weight:600">OpenMatch AI</span>
          <span class="px-2 py-0.5 rounded text-[10px] font-bold tracking-widest" style="background:#aff73f;color:#213600">PRO</span>
        </div>
        <span class="text-sm hidden md:block" style="color:#c2cab0">Procesamiento 100% local</span>
      </header>
      <main style="padding-top:80px;padding-bottom:48px;padding-left:24px;padding-right:24px;max-width:1200px;margin:0 auto" class="md:pl-[272px]">
        <div class="space-y-6">
          <div class="relative w-full rounded-xl overflow-hidden border" style="aspect-ratio:16/9;border-color:#424935;background:#010e21">
            <video id="pp-video" autoplay playsinline muted class="absolute inset-0 w-full h-full" style="object-fit:contain"></video>
            <canvas id="pp-canvas" class="absolute inset-0 w-full h-full" style="cursor:crosshair;z-index:10"></canvas>
            <div class="absolute inset-0 flex items-center justify-center" id="pp-empty">
              <div class="text-center" style="color:#c2cab0"><span class="material-symbols-outlined" style="color:#aff73f;font-size:4rem">sports_soccer</span><p class="mt-2">Conecta una cámara o selecciona un video</p></div>
            </div>
            <div class="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex gap-1 p-1 rounded-full shadow-2xl" style="background:rgba(16,24,39,.8);backdrop-filter:blur(12px);border:1px solid #263148">
              <button class="pp-tool p-2 rounded-full transition-all" data-tool="arrow" style="color:#c2cab0"><span class="material-symbols-outlined">trending_flat</span></button>
              <button class="pp-tool p-2 rounded-full transition-all" data-tool="line" style="color:#c2cab0"><span class="material-symbols-outlined">horizontal_rule</span></button>
              <button class="pp-tool p-2 rounded-full transition-all active" data-tool="circle" style="color:#aff73f;background:#283549"><span class="material-symbols-outlined">radio_button_unchecked</span></button>
              <button class="pp-tool p-2 rounded-full transition-all" data-tool="text" style="color:#c2cab0"><span class="material-symbols-outlined">title</span></button>
              <button class="pp-tool p-2 rounded-full transition-all" data-tool="free" style="color:#c2cab0"><span class="material-symbols-outlined">edit</span></button>
              <div style="width:1px;height:32px;background:#424935;margin:0 4px"></div>
              <label class="p-2 rounded-full transition-all cursor-pointer" title="Color"><input id="pp-color" type="color" value="#aff73f" style="width:24px;height:24px;padding:0;border:2px solid rgba(255,255,255,.2);border-radius:50%;cursor:pointer;display:block" /></label>
              <div style="width:1px;height:32px;background:#424935;margin:0 4px"></div>
              <button id="pp-undo" class="p-2 rounded-full transition-all" style="color:#c2cab0"><span class="material-symbols-outlined">undo</span></button>
              <button id="pp-clear" class="p-2 rounded-full transition-all" style="color:#c2cab0"><span class="material-symbols-outlined">delete_sweep</span></button>
            </div>
            <div class="absolute bottom-0 w-full p-4 flex items-center gap-4" style="background:linear-gradient(to top,rgba(0,0,0,.8),transparent)">
              <button id="pp-freeze" class="material-symbols-outlined transition-colors" style="color:#ffffff;font-variation-settings:'FILL'1">play_arrow</button>
              <div class="flex-grow h-1 rounded-full relative" style="background:rgba(255,255,255,.2)">
                <div id="pp-progress" class="absolute left-0 top-0 h-full rounded-full" style="width:33%;background:#aff73f"></div>
                <div class="absolute left-1/3 -top-1.5 w-4 h-4 rounded-full shadow-lg border-2 border-white" style="background:#aff73f"></div>
              </div>
              <span id="pp-time" class="text-white" style="font-family:monospace;font-size:.8rem">00:00 / 00:00</span>
            </div>
          </div>
          <div class="flex flex-wrap justify-between items-center gap-4">
            <div class="flex gap-4">
              <button id="pp-freeze-btn" class="flex items-center gap-2 px-6 py-3 rounded-lg border transition-all" style="background:#283549;border-color:#424935;color:#d5e3fd"><span class="material-symbols-outlined" style="color:#aff73f">pause_circle</span> Congelar video</button>
              <button id="pp-save-btn" class="flex items-center gap-2 px-6 py-3 rounded-lg transition-all" style="background:#aff73f;color:#213600;font-weight:600"><span class="material-symbols-outlined">save</span> Guardar plantilla</button>
            </div>
            <div class="flex items-center gap-3 p-3 rounded-xl" style="background:rgba(16,24,39,.8);border:1px solid #263148">
              <span class="material-symbols-outlined" style="color:#c2cab0">speed</span>
              <label style="color:#c2cab0;font-size:.85rem"><input id="pp-template-name" type="text" placeholder="Nombre de la jugada" style="background:transparent;border:1px solid #424935;border-radius:6px;padding:6px 10px;color:#ffffff;font-size:.85rem;min-width:150px" /></label>
            </div>
          </div>
          <div style="padding-top:24px;border-top:1px solid #424935">
            <div class="flex items-center justify-between mb-4">
              <h2 style="color:#ffffff;font-size:1.3rem;font-weight:600">Plantillas Guardadas</h2>
            </div>
            <div id="pp-templates" class="grid grid-cols-2 md:grid-cols-4 gap-4"></div>
          </div>
        </div>
      </main>
      <footer class="w-full py-4 px-8 flex flex-col md:flex-row justify-between items-center border-t" style="background:#010e21;border-color:#424935;color:#c2cab0;font-size:.82rem">
        <span>© 2024 OpenMatch AI. Análisis táctico privado.</span>
      </footer>`;
    this.#root.appendChild(ws);
    this.#root.querySelector("#pp-home")?.addEventListener("click", () => this.#navigate("home"));
    const video = ws.querySelector("#pp-video");
    const canvas = ws.querySelector("#pp-canvas");
    const empty = ws.querySelector("#pp-empty");
    const fit = () => { const r = video.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1; if (r.width && r.height) { canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); } };
    new ResizeObserver(fit).observe(video.parentElement);
    const tool = new DrawTool(canvas, () => {});
    this.#camera.attachPreview(video);
    this.#camera.refreshDevices().then((devices) => {
      const sel = ws.querySelector("#pp-camera-select") || document.createElement("select"); // hidden fallback
    });
    ws.querySelectorAll(".pp-tool").forEach((b) => b.addEventListener("click", () => {
      ws.querySelectorAll(".pp-tool").forEach((x) => { x.style.color = "#c2cab0"; x.style.background = "transparent"; });
      b.style.color = "#aff73f"; b.style.background = "#283549"; tool.setTool(b.dataset.tool);
    }));
    ws.querySelector("#pp-color")?.addEventListener("input", (e) => tool.setColor(e.target.value));
    ws.querySelector("#pp-undo")?.addEventListener("click", () => tool.undo());
    ws.querySelector("#pp-clear")?.addEventListener("click", () => tool.clear());
    const freezeBtn = ws.querySelector("#pp-freeze");
    const freezeBtn2 = ws.querySelector("#pp-freeze-btn");
    const toggleFreeze = () => { video.pause(); freezeBtn.textContent = "play_arrow"; };
    freezeBtn?.addEventListener("click", toggleFreeze);
    freezeBtn2?.addEventListener("click", toggleFreeze);
    ws.querySelector("#pp-save-btn")?.addEventListener("click", () => {
      const name = ws.querySelector("#pp-template-name")?.value?.trim();
      if (name) { tool.saveTemplate(name); ws.querySelector("#pp-template-name").value = ""; tool.saveTemplate(name); }
    });
    const renderTemplates = () => {
      const container = ws.querySelector("#pp-templates");
      const templates = tool.getTemplates();
      container.innerHTML = templates.map((t) =>
        `<div class="group cursor-pointer">
          <div class="aspect-video rounded-lg overflow-hidden border flex items-center justify-center mb-1" style="border-color:#424935;background:#122033">
            <div class="flex items-center justify-center w-full h-full hover:scale-105 transition-transform" style="cursor:pointer">
              <span class="material-symbols-outlined" style="color:#aff73f;font-size:2rem">edit_note</span>
            </div>
          </div>
          <p style="color:#ffffff;font-size:.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.name}</p>
          <p style="color:#c2cab0;font-size:.75rem">${new Date(t.createdAt).toLocaleDateString()}</p>
        </div>`
      ).join("");
    };
    renderTemplates();
    // Re-render on save (the save button triggers after saveTemplate)
    const origSave = tool.saveTemplate.bind(tool);
    tool.saveTemplate = (name) => { const r = origSave(name); renderTemplates(); return r; };
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
              <button id="hl-start-btn" class="w-full md:w-auto px-12 py-3 rounded-lg font-bold flex items-center justify-center gap-2" style="background:#aff73f;color:#213600">
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
    const startBtn = this.#root.querySelector("#hl-start-btn");
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.addEventListener("click", () => {
        this.#syncHomeSetup();
        this.#toggleModal(false);
        this.#navigate("match");
      });
    }
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
      <nav class="fixed top-0 w-full z-50 flex justify-between items-center px-8 h-16" style="background:#051426;border-bottom:1px solid #424935">
        <div class="flex items-center gap-4">
          <button id="home-link" class="material-symbols-outlined" style="color:#aff73f;font-variation-settings:'FILL'1;cursor:pointer;font-size:24px">arrow_back</button>
          <span style="color:#ffffff;font-family:Inter;font-size:20px;font-weight:600">OpenMatch AI</span>
        </div>
        <div class="px-3 py-1 rounded border text-xs font-bold tracking-widest" style="background:#283549;border-color:#424935;color:#c2cab0">Procesamiento 100% local</div>
      </nav>
      <main style="margin-top:64px;height:calc(100vh - 64px);display:flex;flex-direction:column;overflow:hidden;background:#051426">
        <div class="h-14 flex items-center px-8 gap-8" style="background:#0e1c2f;border-bottom:1px solid #424935">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined" style="color:#94da1d;font-size:18px">timer</span>
            <span class="tabular-nums font-bold text-xl" id="timer-display" style="color:#aff73f;font-family:'JetBrains Mono',monospace">00:00</span>
          </div>
          <div class="flex-1" style="max-width:400px">
            <div class="flex justify-between text-[10px] uppercase font-bold mb-1 px-1">
              <span id="pos-a" style="color:#3da5ff">A 50%</span>
              <span id="pos-b" style="color:#ff6b6b">50% B</span>
            </div>
            <div class="h-1.5 w-full rounded-full flex overflow-hidden" style="background:#283549">
              <div class="h-full" id="pos-fill-a" style="width:50%;background:#3da5ff"></div>
              <div class="h-full" id="pos-fill-b" style="width:50%;background:#ff6b6b"></div>
            </div>
          </div>
          <div class="flex-1 flex items-center relative h-10 px-4" style="max-width:400px">
            <div class="absolute w-full h-px top-1/2 -translate-y-1/2" style="background:#424935"></div>
            <div class="flex w-full justify-around relative" id="timeline-track"></div>
          </div>
        </div>
        <div class="flex-1 flex overflow-hidden">
          <div class="flex-[7] flex flex-col p-4 gap-4 overflow-hidden">
            <div class="relative flex-1 rounded-xl overflow-hidden" style="background:rgba(16,24,39,.8);border:1px solid #263148">
              <video id="camera-preview" autoplay playsinline muted class="absolute inset-0 w-full h-full" style="object-fit:contain"></video>
              <canvas id="analysis-overlay" class="absolute inset-0 w-full h-full" style="pointer-events:none"></canvas>
              <canvas id="field-overlay" class="absolute inset-0 w-full h-full" style="z-index:2"></canvas>
              <canvas id="draw-overlay" class="absolute inset-0 w-full h-full" hidden style="z-index:3;cursor:crosshair"></canvas>
              <div class="absolute inset-0 flex items-center justify-center" id="video-empty">
                <div class="text-center" style="color:#c2cab0"><span class="material-symbols-outlined" style="color:#aff73f;font-size:4rem">videocam</span><p class="mt-2 text-sm">Conecta una cámara o selecciona un video</p></div>
              </div>
            </div>
            <div class="h-48 flex gap-4">
              <div class="flex-1 rounded-xl p-4 flex flex-col gap-3" style="background:rgba(16,24,39,.8);border:1px solid #263148">
                <span class="text-xs font-bold tracking-widest uppercase" style="color:#c2cab0">Herramientas de campo</span>
                <div class="grid grid-cols-2 gap-2">
                  <button id="field-toggle" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors" style="background:#283549;color:#d5e3fd"><span class="material-symbols-outlined" style="font-size:18px">straighten</span> Calibrar cancha</button>
                  <button id="draw-toggle" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors" style="background:#283549;color:#d5e3fd"><span class="material-symbols-outlined" style="font-size:18px">gesture</span> Dibujo táctico</button>
                </div>
                <div class="flex items-center gap-3 mt-1">
                  <div class="flex-1"><label class="text-[10px] block mb-1" style="color:#c2cab0">Ancho (m)</label><input id="field-width" class="w-full rounded px-2 py-1 text-sm" style="background:#051426;border:1px solid #424935;color:#aff73f;font-family:monospace" value="68.0" /></div>
                  <div class="flex-1"><label class="text-[10px] block mb-1" style="color:#c2cab0">Largo (m)</label><input id="field-length" class="w-full rounded px-2 py-1 text-sm" style="background:#051426;border:1px solid #424935;color:#aff73f;font-family:monospace" value="105.0" /></div>
                </div>
                <div class="draw-controls" id="draw-controls" hidden>
                  <div class="flex gap-1 flex-wrap"><button class="draw-tool active px-2 py-1 rounded text-xs" data-tool="arrow" style="background:#283549">→</button><button class="draw-tool px-2 py-1 rounded text-xs" data-tool="line" style="background:#283549">╱</button><button class="draw-tool px-2 py-1 rounded text-xs" data-tool="circle" style="background:#283549">○</button><button class="draw-tool px-2 py-1 rounded text-xs" data-tool="text" style="background:#283549">T</button><button class="draw-tool px-2 py-1 rounded text-xs" data-tool="free" style="background:#283549">✎</button><input id="draw-color" type="color" value="#ffffff" style="width:28px;height:28px;padding:0;border:none;cursor:pointer" /></div>
                  <div class="flex gap-2 mt-2 flex-wrap"><button id="draw-undo" class="px-2 py-1 rounded text-xs" style="background:#283549">↩</button><button id="draw-clear" class="px-2 py-1 rounded text-xs" style="background:#283549">✕</button><button id="draw-freeze" class="px-2 py-1 rounded text-xs" style="background:#283549">⏸</button><input id="draw-template-name" class="flex-1 rounded px-2 py-1 text-xs" placeholder="Nombre" style="min-width:80px;background:#051426;border:1px solid #424935;color:#d5e3fd" /><button id="draw-save-btn" class="px-2 py-1 rounded text-xs" style="background:#283549">Guardar</button></div>
                  <div id="draw-templates" class="flex gap-1 flex-wrap mt-1"></div>
                </div>
              </div>
              <div class="w-80 rounded-xl overflow-hidden flex flex-col" style="background:rgba(16,24,39,.8);border:1px solid #263148">
                <div class="px-3 py-1.5 border-b flex justify-between items-center" style="background:#1d2b3e;border-color:#424935">
                  <span class="text-[10px] font-bold uppercase" style="color:#c2cab0">Vista táctica</span>
                  <span class="w-2 h-2 rounded-full" style="background:#aff73f"></span>
                </div>
                <div class="flex-1 relative" style="background:radial-gradient(circle at center,#162235 0%,#101827 100%)">
                  <canvas id="tactical-field" class="absolute inset-0 w-full h-full"></canvas>
                  <canvas id="heatmap-field" class="absolute inset-0 w-full h-full" hidden></canvas>
                </div>
              </div>
            </div>
          </div>
          <div class="flex-[3] flex flex-col p-4 pl-0 gap-4 overflow-hidden">
            <div class="rounded-xl p-4 grid grid-cols-2 gap-4" style="background:rgba(16,24,39,.8);border:1px solid #263148">
              <div class="flex flex-col"><span class="text-[10px] font-bold uppercase" style="color:#c2cab0">Res. Input</span><span id="dash-resolution" class="text-sm" style="font-family:monospace;color:#d5e3fd">—</span></div>
              <div class="flex flex-col"><span class="text-[10px] font-bold uppercase" style="color:#c2cab0">Frame Rate</span><span id="dash-fps" class="text-sm" style="font-family:monospace;color:#d5e3fd">—</span></div>
              <div class="flex flex-col"><span class="text-[10px] font-bold uppercase" style="color:#c2cab0">Tracks</span><span id="dash-tracks" class="text-sm" style="font-family:monospace;color:#d5e3fd">—</span></div>
              <div class="flex flex-col"><span class="text-[10px] font-bold uppercase" style="color:#c2cab0">Max Speed</span><span id="dash-speed" class="text-sm" style="font-family:monospace;color:#d5e3fd">—</span></div>
            </div>
            <div class="grid grid-cols-1 gap-2 event-marker" id="event-marker" hidden>
              <button class="event-btn goal flex items-center justify-between px-4 py-3 rounded-xl transition-all" data-event="goal" style="background:rgba(250,204,21,.1);border:1px solid rgba(250,204,21,.2)"><div class="flex items-center gap-3"><span class="text-xl">⚽</span><span class="text-sm font-semibold" style="color:#facc15">Gol</span></div></button>
              <button class="event-btn fault flex items-center justify-between px-4 py-3 rounded-xl transition-all" data-event="fault" style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2)"><div class="flex items-center gap-3"><span class="text-xl">🚩</span><span class="text-sm font-semibold" style="color:#ef4444">Falta</span></div></button>
              <button class="event-btn offside flex items-center justify-between px-4 py-3 rounded-xl transition-all" data-event="offside" style="background:rgba(249,115,22,.1);border:1px solid rgba(249,115,22,.2)"><div class="flex items-center gap-3"><span class="text-xl">🚦</span><span class="text-sm font-semibold" style="color:#f97316">Offside</span></div></button>
              <button class="event-btn chance flex items-center justify-between px-4 py-3 rounded-xl transition-all" data-event="chance" style="background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.2)"><div class="flex items-center gap-3"><span class="text-xl">🎯</span><span class="text-sm font-semibold" style="color:#3b82f6">Ocasión</span></div></button>
              <button class="event-btn card flex items-center justify-between px-4 py-3 rounded-xl transition-all" data-event="yellow" style="background:rgba(234,179,8,.1);border:1px solid rgba(234,179,8,.2)"><div class="flex items-center gap-3"><span class="text-xl">🟨</span><span class="text-sm font-semibold" style="color:#eab308">Tarjeta</span></div></button>
            </div>
            <div class="flex-1 rounded-xl flex flex-col overflow-hidden" style="background:rgba(16,24,39,.8);border:1px solid #263148">
              <div class="px-4 py-3 border-b flex items-center justify-between" style="background:#122033;border-color:#424935">
                <span class="text-xs font-bold tracking-widest uppercase" style="color:#c2cab0">Registro de Eventos</span>
                <span class="text-[10px]" style="color:#c2cab0">Live</span>
              </div>
              <div class="flex-1 overflow-y-auto p-4 space-y-3 event-feedback" id="event-feedback">
                <ol class="event-feedback-list" id="event-list" style="list-style:none;margin:0;padding:0"></ol>
              </div>
            </div>
          </div>
        </div>
        <footer class="h-16 flex items-center justify-between px-8 border-t relative" style="background:#010e21;border-color:#424935">
          <div class="flex items-center gap-8">
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-bold uppercase" style="color:#c2cab0">Cámara</span>
              <select id="camera-select" class="rounded-lg px-3 py-1 text-sm" style="background:#051426;border:1px solid #424935;color:#d5e3fd"><option>Buscando dispositivos...</option></select>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-bold uppercase" style="color:#c2cab0">Calidad</span>
              <div class="flex rounded-lg overflow-hidden" style="background:#051426;border:1px solid #424935">
                <button class="qual-btn px-3 py-1 text-[10px] font-bold" data-q="1080" style="background:#aff73f;color:#213600">1080p</button>
                <button class="qual-btn px-3 py-1 text-[10px] font-bold" data-q="720" style="color:#c2cab0">720p</button>
                <button class="qual-btn px-3 py-1 text-[10px] font-bold" data-q="480" style="color:#c2cab0">480p</button>
              </div>
            </div>
          </div>
          <div class="absolute left-1/2 -translate-x-1/2 -top-10">
            <button id="main-action" class="h-16 px-8 rounded-full flex items-center gap-3 shadow-2xl transition-transform active:scale-95" style="background:#aff73f;color:#213600;box-shadow:0 0 20px rgba(175,247,63,.3)">
              <span class="material-symbols-outlined" style="font-size:32px;font-variation-settings:'FILL'1">play_circle</span>
              <span class="text-xl font-semibold" id="action-text">Iniciar análisis</span>
            </button>
          </div>
          <div class="flex items-center gap-4">
            <button id="btn-flip" class="material-symbols-outlined p-2 rounded-full transition-colors" style="color:#c2cab0">flip_camera_ios</button>
            <button id="btn-settings" class="material-symbols-outlined p-2 rounded-full transition-colors" style="color:#c2cab0">settings</button>
          </div>
        </footer>
      </main>
      <aside class="summary-overlay" id="summary-overlay" hidden style="position:fixed;inset:0;z-index:100;display:grid;place-items:center;background:rgba(5,20,38,.9);backdrop-filter:blur(12px);padding:20px">
        <div style="max-width:580px;width:100%;max-height:80vh;overflow-y:auto;padding:28px;border-radius:18px;background:#122033;border:1px solid #424935">
          <p class="text-xs font-bold tracking-widest" style="color:#aff73f">RESUMEN</p>
          <h3 style="margin:6px 0 12px;font-size:1.3rem;font-weight:600;color:#ffffff">Partido finalizado</h3>
          <div id="summary-stats"></div>
          <div id="summary-events"></div>
          <div id="summary-insights"></div>
          <div style="display:flex;gap:10px;margin-top:16px">
            <button id="summary-new" class="flex-1 px-4 py-3 rounded-lg font-bold" style="background:#aff73f;color:#213600">Nuevo partido</button>
            <button id="summary-home" class="flex-1 px-4 py-3 rounded-lg font-bold" style="background:#283549;color:#d5e3fd">Inicio</button>
          </div>
        </div>
      </aside>`;
  }

  #bindControls() {
    const select = this.#root.querySelector("#camera-select");
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
    const updateTelemetry = () => {
      const v = this.#root.querySelector("#camera-preview");
      if (v?.videoWidth) {
        this.#root.querySelector("#dash-resolution").textContent = v.videoWidth + "x" + v.videoHeight;
        this.#root.querySelector("#dash-fps").textContent = (v.dataset?.fps || "") || "—";
      }
    };
    this.#events.on("analysis.ready", () => {
      mainState = "running"; updateMain(); startTimer();
      this.#root.querySelector("#match-bar") && (this.#root.querySelector("#match-bar").hidden = false);
      updateTelemetry();
    });
    this.#events.on("analysis.stopped", () => {
      mainState = "finalize"; updateMain(); stopTimer();
    });
    this.#events.on("field.calibrationStarted", resetTimer);
    this.#events.on("tracking.updated", (ev) => {
      const tracks = ev.detail.tracks || [];
      this.#root.querySelector("#dash-tracks") && (this.#root.querySelector("#dash-tracks").textContent = tracks.filter((t) => t.label === "person").length + " P");
      this.#root.querySelector("#dash-speed") && (this.#root.querySelector("#dash-speed").textContent = (ev.detail.metrics?.maxSpeed || "").toFixed(1) + " m/s" || "—");
      const ball = tracks.find((t) => t.label === "sports ball" && t.fieldPosition);
      const players = tracks.filter((t) => t.label === "person" && t.fieldPosition);
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
    this.#root.querySelector("#btn-settings")?.addEventListener("click", () => this.#navigate("home"));
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
      const aInput = this.#root.querySelector("#color-team-a");
      const bInput = this.#root.querySelector("#color-team-b");
      const ballInput = this.#root.querySelector("#color-ball");
      if (!aInput || !bInput) return;
      const colors = { teamA: aInput.value, teamB: bInput.value, ball: ballInput?.value || "#f5c518" };
      this.#events.emit("settings.teamColors", colors);
      const dotA = this.#root.querySelector(".dot.team-a");
      const dotB = this.#root.querySelector(".dot.team-b");
      const dotBall = this.#root.querySelector(".dot.ball");
      if (dotA) dotA.style.background = colors.teamA;
      if (dotB) dotB.style.background = colors.teamB;
      if (dotBall) dotBall.style.background = colors.ball;
      this.#store.saveSetting("teamColors", colors).catch(() => {});
    };
    const cA = this.#root.querySelector("#color-team-a");
    const cB = this.#root.querySelector("#color-team-b");
    const cBall = this.#root.querySelector("#color-ball");
    if (cA) cA.addEventListener("input", emitTeamColors);
    if (cB) cB.addEventListener("input", emitTeamColors);
    if (cBall) cBall.addEventListener("input", emitTeamColors);
    const drawToggle = this.#root.querySelector("#draw-toggle");
    const drawControls = this.#root.querySelector("#draw-controls");
    if (drawToggle && drawControls) {
      drawToggle.addEventListener("click", () => {
        const isVisible = !drawControls.hidden;
        drawControls.hidden = isVisible;
        if (drawOverlay) drawOverlay.hidden = isVisible;
        drawToggle.textContent = isVisible ? "✎ Dibujo táctico" : "✕ Cerrar dibujo";
      });
    }
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
      const teamColors = await this.#store.loadSetting("teamColors") || {};
      const colors = {
        teamA: teamColors.teamA || "#3da5ff",
        teamB: teamColors.teamB || "#ff6b6b",
        ball: teamColors.ball || "#f5c518",
      };
      const aInput = this.#root.querySelector("#color-team-a");
      const bInput = this.#root.querySelector("#color-team-b");
      const ballInput = this.#root.querySelector("#color-ball");
      if (aInput) aInput.value = colors.teamA;
      if (bInput) bInput.value = colors.teamB;
      if (ballInput) ballInput.value = colors.ball;
      this.#events.emit("settings.teamColors", colors);
      const aDot = this.#root.querySelector(".dot.team-a");
      const bDot = this.#root.querySelector(".dot.team-b");
      const ballDot = this.#root.querySelector(".dot.ball");
      if (aDot) aDot.style.background = colors.teamA;
      if (bDot) bDot.style.background = colors.teamB;
      if (ballDot) ballDot.style.background = colors.ball;
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
    if (!state) return;
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
