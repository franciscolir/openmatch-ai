/** Previews a user-selected video without uploading it anywhere. */
export class VideoFileController {
  #events;
  #preview;
  #objectUrl;

  constructor(events) { this.#events = events; }
  get isLoaded() { return Boolean(this.#objectUrl); }
  attachPreview(element) { this.#preview = element; }

  async load(file) {
    if (!file.type.startsWith("video/")) {
      this.#events.emit("video.error", { message: "Selecciona un archivo de video compatible." });
      return;
    }
    this.clear();
    this.#objectUrl = URL.createObjectURL(file);
    this.#preview.srcObject = null;
    this.#preview.src = this.#objectUrl;
    this.#preview.muted = true;
    try {
      await this.#preview.play();
      this.#events.emit("video.loaded", {
        file: { name: file.name, sizeLabel: this.#formatSize(file.size) },
        settings: { width: this.#preview.videoWidth, height: this.#preview.videoHeight, frameRate: 30 }
      });
    } catch (error) {
      this.#events.emit("video.error", { message: "No se pudo reproducir este video. Prueba otro formato compatible.", error });
    }
  }

  clear() {
    if (!this.#objectUrl) return;
    URL.revokeObjectURL(this.#objectUrl);
    this.#objectUrl = undefined;
    this.#preview.removeAttribute("src");
    this.#preview.load();
  }

  #formatSize(bytes) {
    if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
