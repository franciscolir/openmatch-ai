import test from "node:test";
import assert from "node:assert/strict";
import { MetricsCalculator, qualityFromScore } from "../src/modules/metrics/metrics-calculator.js";

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

test("quality buckets follow the confidence thresholds", () => {
  assert.equal(qualityFromScore(0.9), "high");
  assert.equal(qualityFromScore(0.7), "high");
  assert.equal(qualityFromScore(0.6), "medium");
  assert.equal(qualityFromScore(0.5), "medium");
  assert.equal(qualityFromScore(0.3), "low");
  assert.equal(qualityFromScore(0), "low");
});

test("accumulates distance, speed and average position from field coordinates", () => {
  const events = new TestEvents();
  let latest;
  events.on("metrics.updated", (event) => { latest = event.detail; });
  new MetricsCalculator(events);
  events.emit("tracking.updated", {
    timestamp: 0,
    tracks: [{ id: "player-1", label: "person", state: "active", fieldPosition: { x: 0, y: 0 }, positionQuality: 0.9 }]
  });
  events.emit("tracking.updated", {
    timestamp: 1000,
    tracks: [{ id: "player-1", label: "person", state: "active", fieldPosition: { x: 10, y: 0 }, positionQuality: 0.6 }]
  });
  const metric = latest.metrics.find((m) => m.id === "player-1");
  assert.equal(metric.distance, 10);
  assert.ok(Math.abs(metric.speed - 10) < 1e-6);
  assert.equal(metric.avgPosition.x, 5);
  assert.equal(metric.avgPosition.y, 0);
  assert.equal(metric.quality, "medium");
});

test("skips distance when projection is missing and reports low quality", () => {
  const events = new TestEvents();
  let latest;
  events.on("metrics.updated", (event) => { latest = event.detail; });
  new MetricsCalculator(events);
  events.emit("tracking.updated", {
    timestamp: 0,
    tracks: [{ id: "player-1", label: "person", state: "lost", fieldPosition: null, positionQuality: 0 }]
  });
  const metric = latest.metrics.find((m) => m.id === "player-1");
  assert.equal(metric.distance, 0);
  assert.equal(metric.speed, 0);
  assert.equal(metric.avgPosition, null);
  assert.equal(metric.confidence, 0);
  assert.equal(metric.quality, "low");
});
