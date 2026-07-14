/**
 * Renders a top-down tactical view of the pitch. Listens to `tracking.updated`
 * for projected positions and `field.calibrated` for the real dimensions.
 * Team colors are a heuristic split by which half of the pitch a player is on;
 * the ball is drawn in amber.
 */
export class TacticalField {
  #events;
  #canvas;
  #ctx;
  #dimensions = { length: 105, width: 68 };
  #tracks = [];

  constructor(events, canvas) {
    this.#events = events;
    this.#canvas = canvas;
    this.#ctx = canvas.getContext("2d");
    events.on("field.calibrated", (event) => {
      this.#dimensions = event.detail.dimensions;
      this.#resize();
    });
    events.on("tracking.updated", (event) => {
      this.#tracks = event.detail.tracks;
      this.#render();
    });
    events.on("field.calibrationStarted", () => {
      this.#tracks = [];
      this.#render();
    });
    events.on("analysis.stopped", () => {
      this.#tracks = [];
      this.#render();
    });
    this.#resize();
    window.addEventListener("resize", () => this.#resize());
  }

  refresh() {
    this.#resize();
  }

  #resize() {
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = this.#canvas.clientWidth || 420;
    const ratio = this.#dimensions.width / this.#dimensions.length;
    const cssHeight = cssWidth * ratio;
    this.#canvas.width = Math.round(cssWidth * dpr);
    this.#canvas.height = Math.round(cssHeight * dpr);
    this.#canvas.style.height = `${cssHeight}px`;
    this.#ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.#render();
  }

  #toCanvas(x, y) {
    const w = this.#canvas.clientWidth;
    const ratio = this.#dimensions.width / this.#dimensions.length;
    const h = w * ratio;
    return { x: (x / this.#dimensions.length) * w, y: (y / this.#dimensions.width) * h };
  }

  #render() {
    const ctx = this.#ctx;
    const w = this.#canvas.clientWidth;
    const ratio = this.#dimensions.width / this.#dimensions.length;
    const h = w * ratio;
    const m = (meters) => (meters / this.#dimensions.length) * w;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0b3d1f";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,.75)";
    ctx.lineWidth = Math.max(1, w / 600);
    ctx.strokeRect(0, 0, w, h);
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, m(9.15), 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, m(0.3), 0, Math.PI * 2);
    ctx.fill();
    const boxW = m(16.5);
    const boxH = (40.32 / this.#dimensions.width) * h;
    ctx.strokeRect(0, (h - boxH) / 2, boxW, boxH);
    ctx.strokeRect(w - boxW, (h - boxH) / 2, boxW, boxH);
    const goalW = m(5.5);
    const goalH = (18.32 / this.#dimensions.width) * h;
    ctx.strokeRect(0, (h - goalH) / 2, goalW, goalH);
    ctx.strokeRect(w - goalW, (h - goalH) / 2, goalW, goalH);
    for (const track of this.#tracks) {
      if (!track.fieldPosition) continue;
      const point = this.#toCanvas(track.fieldPosition.x, track.fieldPosition.y);
      const isBall = track.label === "sports ball";
      ctx.fillStyle = isBall ? "#f5c518" : (track.fieldPosition.x < this.#dimensions.length / 2 ? "#3da5ff" : "#ff6b6b");
      ctx.beginPath();
      ctx.arc(point.x, point.y, isBall ? 3.5 : 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
