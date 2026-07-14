export class Dashboard {
  #root;
  constructor(root, events) {
    this.#root = root.querySelector("#dashboard");
    this.#render();
    events.on("device.ready", (event) => this.#updateDevice(event.detail));
    events.on("camera.ready", (event) => this.#updateCamera(event.detail.settings));
    events.on("video.loaded", (event) => this.#updateCamera(event.detail.settings));
    events.on("camera.stopped", () => this.#resetCapture());
    events.on("analysis.ready", (event) => this.#setAnalysis(`Activo · ${event.detail.mode}`));
    events.on("analysis.stopped", () => this.#setAnalysis("En espera"));
    events.on("analysis.error", () => this.#setAnalysis("Error"));
    events.on("ai.detected", (event) => this.#updateVision(event.detail));
    events.on("tracking.updated", (event) => this.#updateTracking(event.detail));
    events.on("field.calibrated", (event) => this.#setField(`${event.detail.dimensions.length} x ${event.detail.dimensions.width} m`));
    events.on("field.calibrationStarted", () => this.#setField("En calibracion"));
  }
  #render() {
    this.#root.innerHTML = `<section class="dashboard panel"><p class="eyebrow">AUTODIAGNÓSTICO</p><h2>Estado del dispositivo</h2><dl><div><dt>Motor IA</dt><dd id="engine">Detectando…</dd></div><div><dt>Procesadores</dt><dd id="cores">Detectando…</dd></div><div><dt>Memoria</dt><dd id="memory">No disponible</dd></div><div><dt>Batería</dt><dd id="battery">No disponible</dd></div></dl></section><section class="dashboard panel metrics"><p class="eyebrow">CAPTURA</p><h2>Telemetría</h2><dl><div><dt>Resolución</dt><dd id="resolution">—</dd></div><div><dt>FPS objetivo</dt><dd id="fps">—</dd></div><div><dt>Visión</dt><dd id="analysis">En espera</dd></div><div><dt>Tracks</dt><dd id="tracks">—</dd></div><div><dt>Balón</dt><dd id="ball">—</dd></div><div><dt>Cancha</dt><dd id="field">Sin calibrar</dd></div><div><dt>Inferencia</dt><dd id="inference">—</dd></div></dl></section>`;
  }
  #updateDevice(profile) {
    this.#root.querySelector("#engine").textContent = profile.webGpu ? "WebGPU" : profile.webGl ? "WebGL" : "CPU";
    this.#root.querySelector("#cores").textContent = profile.cores ? `${profile.cores} lógicos` : "No disponible";
    this.#root.querySelector("#memory").textContent = profile.memoryGb ? `${profile.memoryGb} GB aprox.` : "No disponible";
    this.#root.querySelector("#battery").textContent = profile.batteryLevel === null ? "No disponible" : `${profile.batteryLevel}%`;
  }
  #updateCamera(settings) { this.#root.querySelector("#resolution").textContent = `${settings.width} × ${settings.height}`; this.#root.querySelector("#fps").textContent = `${Math.round(settings.frameRate || 30)} FPS`; }
  #resetCapture() { this.#root.querySelector("#resolution").textContent = "—"; this.#root.querySelector("#fps").textContent = "—"; }
  #setAnalysis(value) { this.#root.querySelector("#analysis").textContent = value; }
  #updateVision(result) {
    this.#root.querySelector("#ball").textContent = result.detections.some((item) => item.label === "sports ball") ? "Detectado" : "—";
    this.#root.querySelector("#inference").textContent = `${Math.round(result.inferenceMs)} ms`;
  }
  #updateTracking(result) { this.#root.querySelector("#tracks").textContent = result.tracks.filter((track) => track.label === "person" && track.state === "active").length; }
  #setField(value) { this.#root.querySelector("#field").textContent = value; }
}
