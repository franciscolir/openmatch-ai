const STORAGE_KEY = "openmatch-tactics";

function loadTemplates() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}
function saveTemplates(t) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(t)); } catch {}
}

export class DrawTool {
  #canvas;
  #ctx;
  #elements = [];
  #tool = "arrow";
  #color = "#ffffff";
  #lineWidth = 3;
  #drawing = false;
  #start = null;
  #current = null;
  #freePoints = [];
  #onChange;

  constructor(canvas, onChange) {
    this.#canvas = canvas;
    this.#ctx = canvas.getContext("2d");
    this.#onChange = onChange;
    const bind = (el, evt, fn) => el.addEventListener(evt, fn.bind(this));
    bind(canvas, "mousedown", this.#down);
    bind(canvas, "mousemove", this.#move);
    bind(canvas, "mouseup", this.#up);
    bind(canvas, "mouseleave", this.#cancel);
  }

  setTool(t) { this.#tool = t; }
  getColor() { return this.#color; }
  setColor(c) { this.#color = c; }

  clear() { this.#elements = []; this.#render(); this.#emit(); }
  undo() { if (this.#elements.length) { this.#elements.pop(); this.#render(); this.#emit(); } }

  loadElements(el) { this.#elements = el.slice(); this.#render(); }

  saveTemplate(name) {
    if (!name) return false;
    const t = loadTemplates();
    t.push({ name, elements: this.#elements.slice(), createdAt: Date.now() });
    saveTemplates(t);
    return true;
  }
  getTemplates() { return loadTemplates(); }
  loadTemplate(name) {
    const t = loadTemplates().find((t) => t.name === name);
    if (t) { this.loadElements(t.elements); return true; }
    return false;
  }
  deleteTemplate(name) { saveTemplates(loadTemplates().filter((t) => t.name !== name)); }

  #pos(e) {
    const r = this.#canvas.getBoundingClientRect();
    const dpr = this.#canvas.width / this.#canvas.clientWidth || 1;
    return { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr };
  }

  #down(e) {
    if (this.#tool === "text") {
      const p = this.#pos(e);
      const text = prompt("Texto:");
      if (text) {
        this.#elements.push({ type: "text", x: p.x, y: p.y, text, color: this.#color, size: Math.max(14, this.#canvas.width / 50) });
        this.#render();
        this.#emit();
      }
      return;
    }
    this.#start = this.#pos(e);
    this.#current = { ...this.#start };
    this.#freePoints = [this.#start];
    this.#drawing = true;
  }

  #move(e) {
    if (!this.#drawing) return;
    this.#current = this.#pos(e);
    if (this.#tool === "free") {
      this.#freePoints.push(this.#current);
      this.#drawElement({ type: "free", points: this.#freePoints, color: this.#color, lineWidth: this.#lineWidth });
      return;
    }
    this.#render();
    this.#drawElement(this.#buildPreview());
  }

  #up() {
    if (!this.#drawing) return;
    this.#drawing = false;
    if (this.#tool === "free") {
      if (this.#freePoints.length > 1) {
        this.#elements.push({ type: "free", points: this.#freePoints.slice(), color: this.#color, lineWidth: this.#lineWidth });
      }
    } else {
      const el = this.#buildElement();
      if (el) this.#elements.push(el);
    }
    this.#render();
    this.#emit();
  }

  #cancel() { if (this.#drawing) this.#up(); }

  #buildPreview() {
    const s = this.#start, c = this.#current;
    if (!s || !c) return null;
    if (this.#tool === "arrow") return { type: "arrow", x1: s.x, y1: s.y, x2: c.x, y2: c.y, color: this.#color, lineWidth: this.#lineWidth };
    if (this.#tool === "line") return { type: "line", x1: s.x, y1: s.y, x2: c.x, y2: c.y, color: this.#color, lineWidth: this.#lineWidth };
    if (this.#tool === "circle") {
      const dx = c.x - s.x, dy = c.y - s.y;
      return { type: "circle", x: s.x, y: s.y, r: Math.sqrt(dx * dx + dy * dy), color: this.#color, lineWidth: this.#lineWidth };
    }
    return null;
  }

  #buildElement() { return this.#buildPreview(); }

  #drawElement(el) {
    if (!el) return;
    const ctx = this.#ctx;
    ctx.strokeStyle = el.color || "#fff";
    ctx.fillStyle = el.color || "#fff";
    ctx.lineWidth = el.lineWidth || 3;
    ctx.lineCap = "round";
    ctx.font = `bold ${el.size || 16}px ui-sans-serif, system-ui`;
    if (el.type === "arrow") this.#drawArrow(el);
    else if (el.type === "line") { ctx.beginPath(); ctx.moveTo(el.x1, el.y1); ctx.lineTo(el.x2, el.y2); ctx.stroke(); }
    else if (el.type === "circle") { ctx.beginPath(); ctx.arc(el.x, el.y, el.r, 0, Math.PI * 2); ctx.stroke(); }
    else if (el.type === "text") { ctx.fillText(el.text, el.x, el.y); }
    else if (el.type === "free") {
      if (el.points.length < 2) return;
      ctx.beginPath(); ctx.moveTo(el.points[0].x, el.points[0].y);
      for (let i = 1; i < el.points.length; i++) ctx.lineTo(el.points[i].x, el.points[i].y);
      ctx.stroke();
    }
  }

  #drawArrow(el) {
    const ctx = this.#ctx;
    const dx = el.x2 - el.x1, dy = el.y2 - el.y1;
    const angle = Math.atan2(dy, dx);
    const hl = Math.max(8, Math.min(20, Math.sqrt(dx * dx + dy * dy) * 0.25));
    ctx.beginPath(); ctx.moveTo(el.x1, el.y1); ctx.lineTo(el.x2, el.y2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(el.x2, el.y2);
    ctx.lineTo(el.x2 - hl * Math.cos(angle - Math.PI / 6), el.y2 - hl * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(el.x2 - hl * Math.cos(angle + Math.PI / 6), el.y2 - hl * Math.sin(angle + Math.PI / 6));
    ctx.closePath(); ctx.fill();
  }

  #render() {
    this.#ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
    for (const el of this.#elements) this.#drawElement(el);
  }

  #emit() { this.#onChange?.(this.#elements); }
}
