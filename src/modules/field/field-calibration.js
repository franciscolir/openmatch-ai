import { createHomography } from "../../utils/homography.js";

const POINT_NAMES = ["esquina superior izquierda", "esquina superior derecha", "esquina inferior derecha", "esquina inferior izquierda"];

/** Collects four user-selected field corners and emits a pixel-to-meter transform. */
export class FieldCalibration {
  #events;
  #canvas;
  #context;
  #video;
  #points = [];
  #active = false;
  #resizeObserver;
  #dimensions;

  constructor(events, canvas, video) {
    this.#events = events;
    this.#canvas = canvas;
    this.#context = canvas.getContext("2d");
    this.#video = video;
    this.#resizeObserver = new ResizeObserver(() => this.#draw());
    this.#resizeObserver.observe(video);
    canvas.addEventListener("click", (event) => this.#addPoint(event));
  }

  get isActive() { return this.#active; }

  start(dimensions) {
    this.#points = [];
    this.#active = true;
    this.#canvas.classList.add("calibration-active");
    this.#events.emit("field.calibrationStarted", {
      message: `Marca la ${POINT_NAMES[0]} de la cancha.`
    });
    this.#dimensions = dimensions;
    this.#draw();
  }

  cancel() {
    this.#active = false;
    this.#points = [];
    this.#canvas.classList.remove("calibration-active");
    this.#draw();
  }

  #addPoint(event) {
    if (!this.#active) return;
    this.#points.push(this.#videoPoint(event));
    if (this.#points.length < 4) {
      this.#events.emit("field.calibrationProgress", {
        count: this.#points.length,
        message: `Marca la ${POINT_NAMES[this.#points.length]} de la cancha.`
      });
      this.#draw();
      return;
    }
    try {
      const target = [
        { x: 0, y: 0 },
        { x: this.#dimensions.length, y: 0 },
        { x: this.#dimensions.length, y: this.#dimensions.width },
        { x: 0, y: this.#dimensions.width }
      ];
      const homography = createHomography(this.#points, target);
      this.#active = false;
      this.#canvas.classList.remove("calibration-active");
      this.#events.emit("field.calibrated", { points: this.#points, dimensions: this.#dimensions, homography });
    } catch (error) {
      this.#events.emit("field.calibrationError", { message: error.message });
      this.#points = [];
    }
    this.#draw();
  }

  #videoPoint(event) {
    const videoRect = this.#video.getBoundingClientRect();
    if (!this.#video.videoWidth || !this.#video.videoHeight) {
      return { x: 0, y: 0 };
    }
    const videoAspect = this.#video.videoWidth / this.#video.videoHeight;
    const boxAspect = videoRect.width / videoRect.height;
    let contentWidth, contentHeight, offsetX, offsetY;
    if (boxAspect > videoAspect) {
      contentHeight = videoRect.height;
      contentWidth = videoRect.height * videoAspect;
      offsetX = (videoRect.width - contentWidth) / 2;
      offsetY = 0;
    } else {
      contentWidth = videoRect.width;
      contentHeight = videoRect.width / videoAspect;
      offsetX = 0;
      offsetY = (videoRect.height - contentHeight) / 2;
    }
    const clickX = event.clientX - videoRect.left - offsetX;
    const clickY = event.clientY - videoRect.top - offsetY;
    return {
      x: contentWidth > 0 ? Math.min(1, Math.max(0, clickX / contentWidth)) : 0,
      y: contentHeight > 0 ? Math.min(1, Math.max(0, clickY / contentHeight)) : 0
    };
  }

  #draw() {
    const rect = this.#video.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(rect.width * ratio);
    const height = Math.round(rect.height * ratio);
    if (!width || !height) return;
    if (this.#canvas.width !== width || this.#canvas.height !== height) {
      this.#canvas.width = width;
      this.#canvas.height = height;
      this.#canvas.style.width = `${rect.width}px`;
      this.#canvas.style.height = `${rect.height}px`;
    }
    this.#context.clearRect(0, 0, width, height);
    if (!this.#active && !this.#points.length) return;
    const hasVideo = this.#video.videoWidth > 0 && this.#video.videoHeight > 0;
    const dpr = window.devicePixelRatio || 1;
    const cssW = rect.width;
    const cssH = rect.height;
    const toCanvas = hasVideo ? (point) => {
      const videoAspect = this.#video.videoWidth / this.#video.videoHeight;
      const boxAspect = cssW / cssH;
      let cw, ch, ox, oy;
      if (boxAspect > videoAspect) {
        ch = cssH; cw = cssH * videoAspect;
        ox = (cssW - cw) / 2; oy = 0;
      } else {
        cw = cssW; ch = cssW / videoAspect;
        ox = 0; oy = (cssH - ch) / 2;
      }
      return { x: (ox + point.x * cw) * dpr, y: (oy + point.y * ch) * dpr };
    } : (point) => ({ x: point.x * width, y: point.y * height });
    this.#context.strokeStyle = "#ffca5c";
    this.#context.fillStyle = "#ffca5c";
    this.#context.lineWidth = Math.max(2, width / 500);
    this.#context.font = `${Math.max(12, width / 52)}px ui-sans-serif, system-ui`;
    this.#points.forEach((point, index) => {
      const canvas = toCanvas(point);
      this.#context.beginPath();
      this.#context.arc(canvas.x, canvas.y, Math.max(5, width / 90), 0, Math.PI * 2);
      this.#context.fill();
      this.#context.fillText(String(index + 1), canvas.x + 9, canvas.y - 9);
    });
    if (this.#points.length > 1) {
      this.#context.beginPath();
      const first = toCanvas(this.#points[0]);
      this.#context.moveTo(first.x, first.y);
      for (const point of this.#points.slice(1)) {
        const canvas = toCanvas(point);
        this.#context.lineTo(canvas.x, canvas.y);
      }
      this.#context.stroke();
    }
  }
}
