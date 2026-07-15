import test from "node:test";
import assert from "node:assert/strict";

const storage = {};
global.localStorage = {
  getItem: (k) => storage[k] ?? null,
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; },
};

class MockCanvas {
  constructor() {
    this.width = 800;
    this.height = 600;
    this.ctx = {
      clearRect: () => {},
      strokeStyle: null,
      fillStyle: null,
      lineWidth: null,
      lineCap: null,
      font: null,
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      stroke: () => {},
      fill: () => {},
      fillText: () => {},
      closePath: () => {},
    };
    this.listeners = {};
    this.clientWidth = 800;
    this.clientHeight = 600;
  }
  getContext() { return this.ctx; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; }
  addEventListener(evt, fn) { if (!this.listeners[evt]) this.listeners[evt] = []; this.listeners[evt].push(fn); }
  dispatchEvent(evt) {
    (this.listeners[evt.type] || []).forEach((fn) => fn(evt));
  }
}

test("DrawTool element management", async () => {
  const { DrawTool } = await import("../src/modules/tactics/draw-tool.js");
  const canvas = new MockCanvas();
  let lastElements = null;
  const onChange = (els) => { lastElements = els; };
  const tool = new DrawTool(canvas, onChange);

  tool.setTool("arrow");
  tool.setColor("#ff0000");
  assert.equal(tool.getColor(), "#ff0000");

  tool.clear();
  assert.deepEqual(lastElements, []);

  const mousedown = { type: "mousedown", clientX: 100, clientY: 100 };
  const mousemove = { type: "mousemove", clientX: 300, clientY: 200 };
  const mouseup = { type: "mouseup", clientX: 300, clientY: 200 };

  canvas.dispatchEvent(mousedown);
  canvas.dispatchEvent(mousemove);
  canvas.dispatchEvent(mouseup);

  assert.ok(lastElements.length > 0);
  assert.equal(lastElements[0].type, "arrow");

  tool.undo();
  assert.deepEqual(lastElements, []);

  tool.setTool("circle");
  const cd = { type: "mousedown", clientX: 400, clientY: 300 };
  const cm = { type: "mousemove", clientX: 450, clientY: 350 };
  const cu = { type: "mouseup", clientX: 450, clientY: 350 };
  canvas.dispatchEvent(cd);
  canvas.dispatchEvent(cm);
  canvas.dispatchEvent(cu);
  assert.equal(lastElements[0].type, "circle");
  assert.equal(lastElements[0].x, 400);
  assert.equal(lastElements[0].y, 300);
  assert.ok(lastElements[0].r > 0);

  tool.saveTemplate("test-play");
  const templates = tool.getTemplates();
  assert.ok(templates.some((t) => t.name === "test-play"));

  assert.ok(tool.loadTemplate("test-play"));
  assert.equal(lastElements.length, 1);

  tool.deleteTemplate("test-play");
  assert.ok(!tool.getTemplates().some((t) => t.name === "test-play"));
});
