import test from "node:test";
import assert from "node:assert/strict";
import { TrackManager } from "../src/modules/tracking/track-manager.js";
import { createHomography } from "../src/utils/homography.js";

class TestEvents {
  #listeners = new Map();
  on(type, listener) {
    const listeners = this.#listeners.get(type) || [];
    listeners.push(listener);
    this.#listeners.set(type, listeners);
  }
  emit(type, detail = {}) {
    for (const listener of this.#listeners.get(type) || []) listener({ detail });
  }
}

test("keeps a player ID across nearby detections and projects it after calibration", () => {
  const events = new TestEvents();
  const updates = [];
  events.on("tracking.updated", (event) => updates.push(event.detail));
  new TrackManager(events);
  events.emit("ai.detected", {
    timestamp: 0,
    detections: [{ label: "person", score: 0.9, box: { x: 0.2, y: 0.2, width: 0.1, height: 0.2 } }]
  });
  const homography = createHomography(
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
    [{ x: 0, y: 0 }, { x: 105, y: 0 }, { x: 105, y: 68 }, { x: 0, y: 68 }]
  );
  events.emit("field.calibrated", { homography, dimensions: { length: 105, width: 68 } });
  events.emit("ai.detected", {
    timestamp: 120,
    detections: [{ label: "person", score: 0.92, box: { x: 0.21, y: 0.2, width: 0.1, height: 0.2 } }]
  });
  const [first] = updates[0].tracks;
  const [second] = updates[1].tracks;
  assert.equal(first.id, "player-1");
  assert.equal(second.id, first.id);
  assert.ok(second.fieldPosition);
  assert.ok(second.fieldPosition.x > 0 && second.fieldPosition.y > 0);
});