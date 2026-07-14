import { EventBus } from "./event-bus.js";
import { CameraController } from "../modules/camera/camera-controller.js";
import { VideoFileController } from "../modules/camera/video-file-controller.js";
import { Dashboard } from "../modules/dashboard/dashboard.js";
import { getDeviceProfile } from "../modules/settings/device-diagnostics.js";
import { AnalysisController } from "../modules/detection/analysis-controller.js";
import { OverlayRenderer } from "../modules/detection/overlay-renderer.js";
import { TrackManager } from "../modules/tracking/track-manager.js";
import { FieldCalibration } from "../modules/field/field-calibration.js";
import { MetricsCalculator } from "../modules/metrics/metrics-calculator.js";

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
  #tracks = [];

  constructor(root) {
    this.#root = root;
  }

  async start() {
    this.#render();
    this.#dashboard = new Dashboard(this.#root, this.#events);
    this.#bindControls();
    const profile = await getDeviceProfile();
    const recommendedMode = this.#root.querySelector(`[data-mode="${profile.recommendedMode}"]`);
    if (recommendedMode) {
      this.#root.querySelector(".mode.active").classList.remove("active");
      recommendedMode.classList.add("active");
    }
    this.#events.emit("device.ready", profile);
    this.#events.emit("settings.modeChanged", { mode: profile.recommendedMode });
    this.#registerServiceWorker();
  }

  #render() {
    this.#root.innerHTML = `
      <header class="topbar">
        <a class="brand" href="./" aria-label="OpenMatch AI, inicio"><span class="brand-mark">O</span>OpenMatch <b>AI</b></a>
        <div class="privacy"><span></span> Procesamiento 100% local</div>
      </header>
      <main class="workspace">
        <section class="hero panel">
          <p class="eyebrow">PLATAFORMA TÁCTICA · FASE 3</p>
          <h1>Tu partido, entendido<br />desde la cancha.</h1>
          <p class="lead">Configura la captura. El video nunca sale de este dispositivo.</p>
          <div class="mode-picker" role="group" aria-label="Modo de procesamiento">
            <button class="mode active" data-mode="balanced">Balanceado <small>Recomendado</small></button>
            <button class="mode" data-mode="saver">Ahorro</button>
            <button class="mode" data-mode="performance">Rendimiento</button>
            <button class="mode" data-mode="precision">Precisión</button>
          </div>
        </section>
        <section class="capture panel">
          <div class="section-heading"><div><p class="eyebrow">NUEVO PARTIDO</p><h2>Fuente de video</h2></div><span id="source-status" class="status">Sin conectar</span></div>
          <div class="source-picker" role="group" aria-label="Origen del video">
            <button class="source active" data-source="camera">Cámara en directo</button>
            <button class="source" data-source="file">Video grabado</button>
          </div>
          <div class="video-stage" id="video-stage">
            <video id="camera-preview" autoplay playsinline muted></video>
            <canvas id="analysis-overlay" aria-label="Detecciones locales de visión artificial"></canvas>
            <canvas id="field-overlay" aria-label="Calibración manual de cancha"></canvas>
            <div class="video-empty" id="video-empty"><span class="camera-icon">⌁</span><strong>La cámara está lista cuando tú lo estés</strong><p>Conecta una cámara del dispositivo o una webcam USB.</p></div>
            <div class="overlay-label">LIVE <span></span> LOCAL</div>
          </div>
          <div class="camera-controls">
            <label class="select-wrap">Cámara <select id="camera-select" disabled><option>Buscando dispositivos…</option></select></label>
            <label class="select-wrap">Calidad <select id="quality-select"><option value="720">720p · 30 FPS</option><option value="1080">1080p · 30 FPS</option><option value="480">480p · Ahorro</option></select></label>
            <button id="camera-toggle" class="primary">Iniciar cámara</button>
            <button id="analysis-toggle" class="secondary" disabled>Iniciar análisis</button>
          </div>
          <div class="field-controls">
            <label class="select-wrap">Largo de cancha (m)<input id="field-length" type="number" min="40" max="130" value="105" /></label>
            <label class="select-wrap">Ancho de cancha (m)<input id="field-width" type="number" min="20" max="100" value="68" /></label>
            <button id="field-toggle" class="secondary" disabled>Calibrar cancha</button>
          </div>
          <div id="file-controls" class="file-controls" hidden>
            <label class="file-picker" for="video-file"><span>Seleccionar video</span><input id="video-file" type="file" accept="video/*" /></label>
            <p id="file-name" class="file-name">Formatos compatibles con tu navegador. El archivo permanece en este dispositivo.</p>
          </div>
          <p id="camera-message" class="message" aria-live="polite">Permite el acceso a la cámara para empezar.</p>
        </section>
        <aside class="sidebar"><div id="dashboard"></div></aside>
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
    this.#fieldCalibration = new FieldCalibration(this.#events, this.#root.querySelector("#field-overlay"), preview);
    this.#metrics = new MetricsCalculator(this.#events);
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
    this.#events.on("camera.ready", () => {
      toggle.textContent = "Detener cámara";
      analysisToggle.disabled = false;
      fieldToggle.disabled = false;
      sourceStatus.textContent = "En directo";
      sourceStatus.classList.add("live");
      this.#root.querySelector("#video-empty").hidden = true;
      this.#root.querySelector("#camera-message").textContent = "Captura activa: el procesamiento se realizará localmente.";
    });
    this.#events.on("camera.stopped", () => {
      toggle.textContent = "Iniciar cámara";
      analysisToggle.disabled = true;
      this.#analysis.stop();
      this.#fieldCalibration.cancel();
      this.#overlay.clear();
      sourceStatus.textContent = "Sin conectar";
      sourceStatus.classList.remove("live");
      this.#root.querySelector("#video-empty").hidden = false;
    });
    this.#events.on("camera.error", (event) => {
      this.#root.querySelector("#camera-message").textContent = event.detail.message;
    });
    this.#events.on("video.loaded", (event) => {
      sourceStatus.textContent = "Video cargado";
      analysisToggle.disabled = false;
      fieldToggle.disabled = false;
      sourceStatus.classList.add("live");
      this.#root.querySelector("#video-empty").hidden = true;
      this.#root.querySelector("#file-name").textContent = `${event.detail.file.name} · ${event.detail.file.sizeLabel}`;
      this.#root.querySelector("#camera-message").textContent = "Video listo para análisis local. La reproducción no envía el archivo a internet.";
    });
    this.#events.on("video.error", (event) => {
      this.#root.querySelector("#camera-message").textContent = event.detail.message;
    });
    this.#events.on("analysis.ready", () => {
      analysisToggle.textContent = "Detener análisis";
      this.#root.querySelector("#camera-message").textContent = "Análisis local activo: personas, balón y pose se procesan en este dispositivo.";
    });
    this.#events.on("analysis.stopped", () => { analysisToggle.textContent = "Iniciar análisis"; });
    this.#events.on("analysis.error", (event) => {
      analysisToggle.textContent = "Iniciar análisis";
      this.#root.querySelector("#camera-message").textContent = event.detail.message;
    });
    this.#events.on("tracking.updated", (event) => { this.#tracks = event.detail.tracks; });
    this.#events.on("ai.detected", (event) => this.#overlay.render(event.detail, this.#tracks));
    this.#events.on("field.calibrationStarted", (event) => {
      fieldToggle.textContent = "Cancelar calibración";
      this.#root.querySelector("#camera-message").textContent = event.detail.message;
    });
    this.#events.on("field.calibrationProgress", (event) => {
      this.#root.querySelector("#camera-message").textContent = event.detail.message;
    });
    this.#events.on("field.calibrated", (event) => {
      fieldToggle.textContent = "Recalibrar cancha";
      this.#root.querySelector("#camera-message").textContent = `Cancha calibrada: ${event.detail.dimensions.length} x ${event.detail.dimensions.width} m.`;
    });
    this.#events.on("field.calibrationError", (event) => {
      this.#root.querySelector("#camera-message").textContent = event.detail.message;
    });
    analysisToggle.addEventListener("click", async () => {
      if (this.#analysis.isRunning) {
        this.#analysis.stop();
        this.#overlay.clear();
        return;
      }
      try { await this.#analysis.start(this.#root.querySelector(".mode.active").dataset.mode); }
      catch (error) { this.#events.emit("analysis.error", { message: error.message }); }
    });
    fieldToggle.addEventListener("click", () => {
      if (this.#fieldCalibration.isActive) {
        this.#fieldCalibration.cancel();
        fieldToggle.textContent = "Calibrar cancha";
        return;
      }
      const dimensions = {
        length: Number(this.#root.querySelector("#field-length").value),
        width: Number(this.#root.querySelector("#field-width").value)
      };
      if (!Number.isFinite(dimensions.length) || !Number.isFinite(dimensions.width)) {
        this.#events.emit("field.calibrationError", { message: "Introduce dimensiones validas de cancha." });
        return;
      }
      this.#fieldCalibration.start(dimensions);
    });
    this.#root.querySelectorAll(".mode").forEach((button) => button.addEventListener("click", () => {
      this.#root.querySelector(".mode.active").classList.remove("active");
      button.classList.add("active");
      this.#events.emit("settings.modeChanged", { mode: button.dataset.mode });
      if (this.#analysis.isRunning) {
        this.#analysis.stop();
        this.#analysis.start(button.dataset.mode).catch((error) => this.#events.emit("analysis.error", { message: error.message }));
      }
    }));
    this.#root.querySelectorAll(".source").forEach((button) => button.addEventListener("click", () => {
      this.#root.querySelector(".source.active").classList.remove("active");
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
        sourceStatus.textContent = "Sin conectar";
        sourceStatus.classList.remove("live");
        this.#root.querySelector("#video-empty").hidden = false;
        analysisToggle.disabled = true;
        fieldToggle.disabled = true;
      }
    }));
  }

  async #registerServiceWorker() {
    const state = this.#root.querySelector("#pwa-state");
    if (!("serviceWorker" in navigator)) { state.textContent = "Tu navegador no admite modo offline"; return; }
    try { await navigator.serviceWorker.register("./service-worker.js"); state.textContent = "Preparado para uso offline"; }
    catch { state.textContent = "Modo offline no disponible en este origen"; }
  }
}
