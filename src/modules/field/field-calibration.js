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
    const rect = this.#canvas.getBoundingClientRect();
    const point = {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    };
    this.#points.push(point);
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
    this.#context.strokeStyle = "#ffca5c";
    this.#context.fillStyle = "#ffca5c";
    this.#context.lineWidth = Math.max(2, width / 500);
    this.#context.font = `${Math.max(12, width / 52)}px ui-sans-serif, system-ui`;
    this.#points.forEach((point, index) => {
      const x = point.x * width;
      const y = point.y * height;
      this.#context.beginPath();
      this.#context.arc(x, y, Math.max(5, width / 90), 0, Math.PI * 2);
      this.#context.fill();
      this.#context.fillText(String(index + 1), x + 9, y - 9);
    });
    if (this.#points.length > 1) {
      this.#context.beginPath();
      this.#context.moveTo(this.#points[0].x * width, this.#points[0].y * height);
      for (const point of this.#points.slice(1)) this.#context.lineTo(point.x * width, point.y * height);
      this.#context.stroke();
    }
  }
}
