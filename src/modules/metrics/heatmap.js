const GRID_COLS = 48;
const GRID_ROWS = 31;
const DECAY_CELL_COUNT = 200;

const COLOR_STOPS = [
  [0.0, [18, 52, 110]],
  [0.3, [26, 150, 160]],
  [0.55, [90, 200, 90]],
  [0.8, [240, 205, 60]],
  [1.0, [225, 55, 40]]
];

/**
 * Accumulates player positions into a pitch-aligned density grid and renders a
 * heatmap. Ball positions are ignored; only `fieldPosition` projections count.
 */
export class Heatmap {
  #events;
  #canvas;
  #ctx;
  #dimensions = { length: 105, width: 68 };
  #grid = [];
  #max = 0;
  #totalPoints = 0;
  #unsubscribers = [];
  #onResize;

  constructor(events, canvas) {
    this.#events = events;
    this.#canvas = canvas;
    this.#ctx = canvas.getContext("2d");
    this.#resetGrid();
    this.#unsubscribers.push(events.on("field.calibrated", (event) => {
      this.#dimensions = event.detail.dimensions;
      this.#resize();
    }));
    this.#unsubscribers.push(events.on("tracking.updated", (event) => this.#accumulate(event.detail)));
    this.#unsubscribers.push(events.on("field.calibrationStarted", () => { this.#resetGrid(); this.#render(); }));
    this.#unsubscribers.push(events.on("analysis.stopped", () => { this.#resetGrid(); this.#render(); }));
    this.#resize();
    this.#onResize = () => this.#resize();
    window.addEventListener("resize", this.#onResize);
  }

  destroy() {
    for (const unsub of this.#unsubscribers) unsub();
    this.#unsubscribers = [];
    if (this.#onResize) window.removeEventListener("resize", this.#onResize);
  }

  refresh() {
    this.#resize();
  }

  #resetGrid() {
    this.#grid = Array.from({ length: GRID_COLS }, () => new Array(GRID_ROWS).fill(0));
    this.#max = 0;
    this.#totalPoints = 0;
  }

  #accumulate({ tracks }) {
    let changed = false;
    for (const track of tracks) {
      if (!track.fieldPosition || track.label === "sports ball") continue;
      const col = Math.min(GRID_COLS - 1, Math.floor((track.fieldPosition.x / this.#dimensions.length) * GRID_COLS));
      const row = Math.min(GRID_ROWS - 1, Math.floor((track.fieldPosition.y / this.#dimensions.width) * GRID_ROWS));
      this.#grid[col][row] += 1;
      if (this.#grid[col][row] > this.#max) this.#max = this.#grid[col][row];
      this.#totalPoints += 1;
      changed = true;
    }
    if (this.#totalPoints > DECAY_CELL_COUNT) {
      for (let c = 0; c < GRID_COLS; c++) {
        for (let r = 0; r < GRID_ROWS; r++) {
          this.#grid[c][r] = Math.floor(this.#grid[c][r] * 0.5);
        }
      }
      this.#totalPoints = 0;
      this.#max = 0;
      for (let c = 0; c < GRID_COLS; c++) {
        for (let r = 0; r < GRID_ROWS; r++) {
          if (this.#grid[c][r] > this.#max) this.#max = this.#grid[c][r];
        }
      }
      changed = true;
    }
    if (changed) this.#render();
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

  #render() {
    const ctx = this.#ctx;
    const w = this.#canvas.clientWidth;
    const ratio = this.#dimensions.width / this.#dimensions.length;
    const h = w * ratio;
    const cw = w / GRID_COLS;
    const ch = h / GRID_ROWS;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0b3d1f";
    ctx.fillRect(0, 0, w, h);
    for (let col = 0; col < GRID_COLS; col++) {
      for (let row = 0; row < GRID_ROWS; row++) {
        const value = this.#grid[col][row];
        if (!value) continue;
        const t = this.#max ? value / this.#max : 0;
        const [r, g, b] = this.#colorFor(t);
        ctx.fillStyle = `rgba(${r},${g},${b},${0.15 + t * 0.7})`;
        ctx.fillRect(col * cw, row * ch, cw + 0.5, ch + 0.5);
      }
    }
    ctx.strokeStyle = "rgba(255,255,255,.6)";
    ctx.lineWidth = Math.max(1, w / 700);
    ctx.strokeRect(0, 0, w, h);
  }

  #colorFor(t) {
    for (let i = 1; i < COLOR_STOPS.length; i++) {
      if (t <= COLOR_STOPS[i][0]) {
        const [t0, c0] = COLOR_STOPS[i - 1];
        const [t1, c1] = COLOR_STOPS[i];
        const f = (t - t0) / (t1 - t0);
        return c0.map((value, k) => Math.round(value + (c1[k] - value) * f));
      }
    }
    return COLOR_STOPS[COLOR_STOPS.length - 1][1];
  }
}
