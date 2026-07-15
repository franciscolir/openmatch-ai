const FIELD_TYPES = {
  football11: {
    label: "Fútbol 11",
    defaultLength: 105,
    defaultWidth: 68,
    markings: {
      centerCircle: 9.15,
      penaltyAreaDepth: 16.5,
      penaltyAreaWidth: 40.32,
      goalAreaDepth: 5.5,
      goalAreaWidth: 18.32,
      penaltySpot: 11,
      penaltyArcRadius: 9.15,
    },
  },
  football7: {
    label: "Fútbol 7",
    defaultLength: 50,
    defaultWidth: 30,
    markings: {
      centerCircle: 6,
      areaDepth: 8,
    },
  },
  baby: {
    label: "Baby Fútbol",
    defaultLength: 36,
    defaultWidth: 18,
    markings: {
      areaLineDist: 7,
    },
  },
  futsal: {
    label: "Futsal",
    defaultLength: 40,
    defaultWidth: 20,
    markings: {
      centerCircle: 3,
      penaltyArcRadius: 6,
      penaltySpot: 6,
      secondPenaltySpot: 10,
    },
  },
};

export class TacticalField {
  #events;
  #canvas;
  #ctx;
  #dimensions = { length: 105, width: 68 };
  #fieldType = "football11";
  #tracks = [];
  #unsubscribers = [];
  #onResize;

  constructor(events, canvas) {
    this.#events = events;
    this.#canvas = canvas;
    this.#ctx = canvas.getContext("2d");
    this.#unsubscribers.push(events.on("field.calibrated", (event) => {
      this.#dimensions = event.detail.dimensions;
      this.#fieldType = event.detail.fieldType || "football11";
      this.#resize();
    }));
    this.#unsubscribers.push(events.on("tracking.updated", (event) => {
      this.#tracks = event.detail.tracks;
      this.#render();
    }));
    this.#unsubscribers.push(events.on("field.calibrationStarted", () => {
      this.#tracks = [];
    }));
    this.#unsubscribers.push(events.on("analysis.stopped", () => {
      this.#tracks = [];
    }));
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

  #toMeters(m) {
    const w = this.#canvas.clientWidth;
    return (m / this.#dimensions.length) * w;
  }

  #toCanvas(x, y) {
    const w = this.#canvas.clientWidth;
    const h = w * (this.#dimensions.width / this.#dimensions.length);
    return {
      x: (x / this.#dimensions.length) * w,
      y: (y / this.#dimensions.width) * h,
    };
  }

  #render() {
    const ctx = this.#ctx;
    const w = this.#canvas.clientWidth;
    const ratio = this.#dimensions.width / this.#dimensions.length;
    const h = w * ratio;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0b3d1f";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    this.#drawMarkings(ctx, w, h);
    ctx.restore();
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

  #drawMarkings(ctx, w, h) {
    const m = this.#toMeters.bind(this);
    ctx.strokeStyle = "rgba(255,255,255,.7)";
    ctx.lineWidth = Math.max(1, w / 800);
    ctx.strokeRect(0, 0, w, h);
    const halfW = w / 2;
    const halfH = h / 2;
    ctx.beginPath();
    ctx.moveTo(halfW, 0);
    ctx.lineTo(halfW, h);
    ctx.stroke();
    const hasCircle = (this.#fieldType === "football11" || this.#fieldType === "football7" || this.#fieldType === "futsal");
    const hasPoint = (this.#fieldType === "baby");
    if (hasCircle) {
      const cr = FIELD_TYPES[this.#fieldType]?.markings?.centerCircle || FIELD_TYPES.football11.markings.centerCircle;
      ctx.beginPath();
      ctx.arc(halfW, halfH, m(cr), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.beginPath();
      ctx.arc(halfW, halfH, m(0.3), 0, Math.PI * 2);
      ctx.fill();
    }
    if (hasPoint) {
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.beginPath();
      ctx.arc(halfW, halfH, m(0.3), 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.#fieldType === "football11") {
      const p = FIELD_TYPES.football11.markings;
      this.#drawRectArea(ctx, 0, p.penaltyAreaDepth, p.penaltyAreaWidth, w, h);
      this.#drawRectArea(ctx, w, p.penaltyAreaDepth, p.penaltyAreaWidth, w, h);
      this.#drawRectArea(ctx, 0, p.goalAreaDepth, p.goalAreaWidth, w, h);
      this.#drawRectArea(ctx, w, p.goalAreaDepth, p.goalAreaWidth, w, h);
      ctx.fillStyle = "rgba(255,255,255,.7)";
      const spotY = halfH;
      const penaltySpotX = m(p.penaltySpot);
      ctx.beginPath();
      ctx.arc(penaltySpotX, spotY, m(0.15), 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(w - penaltySpotX, spotY, m(0.15), 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(penaltySpotX, spotY, m(p.penaltyArcRadius), -Math.PI / 6, Math.PI / 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(w - penaltySpotX, spotY, m(p.penaltyArcRadius), Math.PI - Math.PI / 6, Math.PI + Math.PI / 6);
      ctx.stroke();
    }
    if (this.#fieldType === "football7") {
      const d = m(FIELD_TYPES.football7.markings.areaDepth);
      ctx.strokeRect(0, 0, d, h);
      ctx.strokeRect(w - d, 0, d, h);
    }
    if (this.#fieldType === "baby") {
      const d = m(FIELD_TYPES.baby.markings.areaLineDist);
      ctx.beginPath();
      ctx.moveTo(d, 0);
      ctx.lineTo(d, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w - d, 0);
      ctx.lineTo(w - d, h);
      ctx.stroke();
    }
    if (this.#fieldType === "futsal") {
      const p = FIELD_TYPES.futsal.markings;
      const arcR = m(p.penaltyArcRadius);
      const penaltyY = m(this.#dimensions.width / 2);
      ctx.beginPath();
      ctx.arc(0, penaltyY, arcR, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(w, penaltyY, arcR, Math.PI / 2, Math.PI * 1.5);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.7)";
      const spotX = m(p.penaltySpot);
      ctx.beginPath();
      ctx.arc(spotX, penaltyY, m(0.1), 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(w - spotX, penaltyY, m(0.1), 0, Math.PI * 2);
      ctx.fill();
      if (p.secondPenaltySpot) {
        ctx.beginPath();
        ctx.arc(m(p.secondPenaltySpot), penaltyY, m(0.08), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(w - m(p.secondPenaltySpot), penaltyY, m(0.08), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  #drawRectArea(ctx, fromEdge, depth, areaWidth, fullW, fullH) {
    const m = this.#toMeters.bind(this);
    const depthPx = m(depth);
    const areaH = (areaWidth / this.#dimensions.width) * fullH;
    const y = (fullH - areaH) / 2;
    if (fromEdge === 0) {
      ctx.strokeRect(0, y, depthPx, areaH);
    } else {
      ctx.strokeRect(fullW - depthPx, y, depthPx, areaH);
    }
  }

  refreshFieldType(type, dimensions) {
    this.#fieldType = type;
    if (dimensions) this.#dimensions = dimensions;
    this.#resize();
  }
}
