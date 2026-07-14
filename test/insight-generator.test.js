import test from "node:test";
import assert from "node:assert/strict";
import { generateInsights } from "../src/modules/insights/insight-generator.js";

test("reports possession dominance and per-team distance", () => {
  const insights = generateInsights({ durationMs: 600000, distance: 4000, maxSpeed: 7.5, teamDistanceA: 2200, teamDistanceB: 1800, possession: 62 });
  assert.ok(insights.some((text) => text.includes("Equipo A dominó la posesión (62%")));
  assert.ok(insights.some((text) => text.includes("Recorrido por equipo — A: 2200 m, B: 1800 m")));
  assert.ok(insights.some((text) => text.includes("Velocidad máxima registrada: 7.5 m/s")));
});

test("handles balanced possession without a dominant team", () => {
  const insights = generateInsights({ durationMs: 120000, distance: 800, maxSpeed: 4, teamDistanceA: 400, teamDistanceB: 400, possession: 50 });
  assert.ok(insights.some((text) => text.includes("Posesión equilibrada (50% / 50%)")));
});

test("always appends a tactical suggestion", () => {
  const insights = generateInsights({ durationMs: 1000, distance: 0, maxSpeed: 0, teamDistanceA: 0, teamDistanceB: 0, possession: null });
  assert.ok(insights[insights.length - 1].startsWith("Sugerencia:"));
});
