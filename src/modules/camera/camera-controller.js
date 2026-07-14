/** Owns camera access and exposes only camera lifecycle events. */
export class CameraController {
  #events;
  #stream;
  #preview;
  constructor(events) { this.#events = events; }
  get isRunning() { return Boolean(this.#stream); }
  attachPreview(element) { this.#preview = element; }
  async refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === "videoinput");
    } catch (error) {
      this.#events.emit("camera.error", { message: "No se pudieron enumerar las cámaras disponibles.", error });
      return [];
    }
  }
  async start({ deviceId, height }) {
    try {
      this.stop();
      this.#stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: deviceId ? { exact: deviceId } : undefined, height: { ideal: height }, frameRate: { ideal: 30, max: 60 } }, audio: false });
      this.#preview.srcObject = this.#stream;
      await this.#preview.play();
      this.#events.emit("camera.ready", { settings: this.#stream.getVideoTracks()[0].getSettings() });
    } catch (error) {
      this.#stream?.getTracks().forEach((track) => track.stop());
      this.#stream = undefined;
      const message = error.name === "NotAllowedError" ? "El acceso a la cámara fue bloqueado. Revísalo en los permisos del navegador." : "No se pudo iniciar la cámara. Comprueba que no esté siendo usada por otra aplicación.";
      this.#events.emit("camera.error", { message, error });
    }
  }
  stop() {
    if (!this.#stream) return;
    this.#stream.getTracks().forEach((track) => track.stop());
    this.#stream = undefined;
    this.#preview.srcObject = null;
    this.#events.emit("camera.stopped");
  }
}
