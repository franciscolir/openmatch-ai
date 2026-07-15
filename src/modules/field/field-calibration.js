import { createHomography } from "../../utils/homography.js";

const POINT_NAMES = ["esquina superior izquierda", "esquina superior derecha", "esquina inferior derecha", "esquina inferior izquierda"];

const DEFAULT_DIMENSIONS = {
  football11: { length: 105, width: 68 },
  football7: { length: 50, width: 30 },
  futsal: { length: 40, width: 20 },
};

export class FieldCalibration {
  #events;
  #canvas;
  #context;
  #video;
  #points = [];
  #active = false;
  #resizeObserver;
  #dimensions;
  #fieldType = "football11";
  #onClick;
  #onMouseDown;
  #onMouseMove;
  #onMouseUp;
  #dragIndex = -1;
  #unsubscribers = [];

  constructor(events, canvas, video) {
    this.#events = events;
    this.#canvas = canvas;
    this.#context = canvas.getContext("2d");
    this.#video = video;
    this.#resizeObserver = new ResizeObserver(() => this.#draw());
    this.#resizeObserver.observe(video);
    this.#onClick = (event) => this.#addPoint(event);
    this.#onMouseDown = (event) => this.#startDrag(event);
    this.#onMouseMove = (event) => this.#moveDrag(event);
    this.#onMouseUp = () => this.#endDrag();
    canvas.addEventListener("click", this.#onClick);
    canvas.addEventListener("mousedown", this.#onMouseDown);
    canvas.addEventListener("mousemove", this.#onMouseMove);
    canvas.addEventListener("mouseup", this.#onMouseUp);
  }

  destroy() {
    this.#resizeObserver.disconnect();
    this.#canvas.removeEventListener("click", this.#onClick);
    this.#canvas.removeEventListener("mousedown", this.#onMouseDown);
    this.#canvas.removeEventListener("mousemove", this.#onMouseMove);
    this.#canvas.removeEventListener("mouseup", this.#onMouseUp);
    for (const unsub of this.#unsubscribers) unsub();
    this.#unsubscribers = [];
  }

  get isActive() { return this.#active; }
  get fieldType() { return this.#fieldType; }

  setFieldType(type) {
    this.#fieldType = type;
    if (DEFAULT_DIMENSIONS[type]) {
      this.#dimensions = { ...DEFAULT_DIMENSIONS[type] };
    }
    if (this.#points.length === 4 && !this.#active) {
      this.#recalibrate();
    }
  }

  start(dimensions) {
    this.#points = [];
    this.#active = true;
    this.#canvas.classList.add("calibration-active");
    this.#events.emit("field.calibrationStarted", {
      message: `Marca la ${POINT_NAMES[0]} de la cancha.`,
      fieldType: this.#fieldType,
    });
    this.#dimensions = dimensions;
    this.#draw();
  }

  cancel() {
    this.#active = false;
    this.#points = [];
    this.#dragIndex = -1;
    this.#canvas.classList.remove("calibration-active");
    this.#events.emit("field.calibrationCancelled");
    this.#draw();
  }

  #addPoint(event) {
    if (!this.#active) return;
    this.#points.push(this.#videoPoint(event));
    if (this.#points.length < 4) {
      this.#events.emit("field.calibrationProgress", {
        count: this.#points.length,
        message: `Marca la ${POINT_NAMES[this.#points.length]} de la cancha.`,
      });
      this.#draw();
      return;
    }
    this.#active = false;
    this.#canvas.classList.remove("calibration-active");
    this.#computeAndEmit();
  }

  #startDrag(event) {
    if (this.#active || this.#points.length !== 4) return;
    const point = this.#videoPoint(event);
    const hit = 0.03;
    for (let i = 0; i < this.#points.length; i++) {
      if (Math.abs(this.#points[i].x - point.x) < hit && Math.abs(this.#points[i].y - point.y) < hit) {
        this.#dragIndex = i;
        this.#canvas.style.cursor = "grabbing";
        return;
      }
    }
  }

  #moveDrag(event) {
    if (this.#dragIndex < 0) return;
    const point = this.#videoPoint(event);
    this.#points[this.#dragIndex] = point;
    this.#draw();
  }

  #endDrag() {
    if (this.#dragIndex < 0) return;
    this.#dragIndex = -1;
    this.#canvas.style.cursor = "";
    this.#recalibrate();
  }

  #recalibrate() {
    try {
      this.#computeAndEmit();
    } catch {
    }
  }

  #computeAndEmit() {
    const target = [
      { x: 0, y: 0 },
      { x: this.#dimensions.length, y: 0 },
      { x: this.#dimensions.length, y: this.#dimensions.width },
      { x: 0, y: this.#dimensions.width },
    ];
    const homography = createHomography(this.#points, target);
    this.#canvas.classList.remove("calibration-active");
    this.#events.emit("field.calibrated", {
      points: this.#points,
      dimensions: this.#dimensions,
      homography,
      fieldType: this.#fieldType,
    });
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
      y: contentHeight > 0 ? Math.min(1, Math.max(0, clickY / contentHeight)) : 0,
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
    if (!this.#points.length) return;
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
      this.#context.arc(canvas.x, canvas.y, Math.max(6, width / 80), 0, Math.PI * 2);
      this.#context.fill();
      this.#context.fillStyle = "#0a1020";
      this.#context.textAlign = "center";
      this.#context.textBaseline = "middle";
      this.#context.font = `bold ${Math.max(10, width / 70)}px ui-sans-serif, system-ui`;
      this.#context.fillText(String(index + 1), canvas.x, canvas.y + 1);
      this.#context.fillStyle = "#ffca5c";
    });
    if (this.#points.length > 1) {
      this.#context.beginPath();
      const first = toCanvas(this.#points[0]);
      this.#context.moveTo(first.x, first.y);
      for (const point of this.#points.slice(1)) {
        const canvas = toCanvas(point);
        this.#context.lineTo(canvas.x, canvas.y);
      }
      this.#context.closePath();
      this.#context.stroke();
    }
    if (this.#points.length === 4 && !this.#active) {
      this.#context.fillStyle = "rgba(255,202,92,.2)";
      this.#context.fill();
      this.#context.fillStyle = "rgba(255,255,255,.4)";
      this.#context.font = `${Math.max(9, width / 65)}px ui-sans-serif, system-ui`;
      this.#context.textAlign = "center";
      this.#context.fillText("Arrastra los puntos para ajustar", width / 2 / dpr, height / dpr - 12);
    }
  }
}
