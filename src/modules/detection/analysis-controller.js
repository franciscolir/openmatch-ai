import { getAnalysisMode } from "../../config/analysis-config.js";

/** Schedules video frames and keeps at most one inference request in flight. */
export class AnalysisController {
  #events;
  #video;
  #worker;
  #running = false;
  #busy = false;
  #lastFrameAt = 0;
  #mode = "balanced";
  #droppedFrames = 0;
  #frameCanvas;

  constructor(events, video) {
    this.#events = events;
    this.#video = video;
  }

  get isRunning() { return this.#running; }

  async start(mode = this.#mode) {
    if (!this.#video.videoWidth || !this.#video.videoHeight) throw new Error("La fuente de video todavía no está lista.");
    this.stop();
    this.#mode = mode;
    try {
      this.#worker = new Worker(new URL("../../workers/vision-worker.js", import.meta.url), { type: "module" });
    } catch (error) {
      this.#events.emit("analysis.error", { message: `No se pudo crear el worker de visión: ${error?.message || error}` });
      return;
    }
    this.#worker.onmessage = (event) => this.#handleWorkerMessage(event.data);
    this.#worker.onerror = (event) => {
      this.#running = false;
      this.#worker?.terminate();
      this.#worker = undefined;
      const detail = [event.message, event.filename && `(${event.filename}:${event.lineno})`].filter(Boolean).join(" ");
      this.#events.emit("analysis.error", { message: `El worker de visión no pudo iniciarse. ${detail}` });
    };
    this.#worker.onmessageerror = () => {
      this.#events.emit("analysis.error", { message: "El worker de visión recibió un mensaje ilegible." });
    };
    this.#events.emit("analysis.loading", { stage: "modelo", message: "Cargando modelo de visión…" });
    this.#worker.postMessage({ type: "initialize", mode: getAnalysisMode(mode) });
    this.#running = true;
  }

  stop() {
    this.#running = false;
    this.#busy = false;
    this.#worker?.postMessage({ type: "stop" });
    this.#worker?.terminate();
    this.#worker = undefined;
    this.#events.emit("analysis.stopped");
  }

  #handleWorkerMessage(message) {
    if (message.type === "ready") {
      this.#events.emit("analysis.ready", { mode: this.#mode });
      this.#schedule();
      return;
    }
    if (message.type === "error") {
      this.#busy = false;
      this.#events.emit("analysis.error", message);
      if (message.stage === "initialize") {
        this.#running = false;
        this.#worker?.terminate();
        this.#worker = undefined;
        return;
      }
      this.#schedule();
      return;
    }
    if (message.type === "result") {
      this.#busy = false;
      this.#events.emit("ai.detected", { ...message.result, droppedFrames: this.#droppedFrames });
      this.#schedule();
    }
  }

  #schedule() {
    if (!this.#running) return;
    if (typeof this.#video.requestVideoFrameCallback === "function") {
      this.#video.requestVideoFrameCallback((_, metadata) => this.#capture(metadata.mediaTime * 1000));
      return;
    }
    requestAnimationFrame(() => this.#capture(this.#video.currentTime * 1000));
  }

  #capture(timestamp) {
    if (!this.#running) return;
    const interval = 1000 / getAnalysisMode(this.#mode).inferenceFps;
    if (this.#busy || timestamp - this.#lastFrameAt < interval) {
      this.#droppedFrames += 1;
      this.#schedule();
      return;
    }
    this.#busy = true;
    this.#lastFrameAt = timestamp;
    this.#createFrame().then(({ frame, width, height }) => {
      if (!this.#running) { frame.close(); return; }
      this.#worker.postMessage({ type: "frame", frame, timestamp, width, height }, [frame]);
    }).catch(() => {
      this.#busy = false;
      this.#events.emit("analysis.error", { message: "No se pudo preparar un frame de video." });
      this.#schedule();
    });
  }

  async #createFrame() {
    const sourceWidth = this.#video.videoWidth;
    const sourceHeight = this.#video.videoHeight;
    const maxDimension = getAnalysisMode(this.#mode).maxDimension;
    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const width = Math.round(sourceWidth * scale);
    const height = Math.round(sourceHeight * scale);
    if (typeof OffscreenCanvas === "undefined") {
      return { frame: await createImageBitmap(this.#video), width: sourceWidth, height: sourceHeight };
    }
    if (!this.#frameCanvas || this.#frameCanvas.width !== width || this.#frameCanvas.height !== height) {
      this.#frameCanvas = new OffscreenCanvas(width, height);
    }
    this.#frameCanvas.getContext("2d").drawImage(this.#video, 0, 0, width, height);
    return { frame: this.#frameCanvas.transferToImageBitmap(), width, height };
  }
}
