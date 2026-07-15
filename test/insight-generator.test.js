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

test("includes event-based insights for goals and chances", () => {
  const insights = generateInsights({
    durationMs: 300000, distance: 2000, maxSpeed: 6,
    teamDistanceA: 1100, teamDistanceB: 900, possession: 55,
    events: [
      { type: "goal", label: "⚽ Gol", timestamp: 60000 },
      { type: "goal", label: "⚽ Gol", timestamp: 180000 },
      { type: "chance", label: "🎯 Ocasión", timestamp: 30000 },
      { type: "chance", label: "🎯 Ocasión", timestamp: 120000 },
      { type: "chance", label: "🎯 Ocasión", timestamp: 240000 },
      { type: "fault", label: "🚩 Falta", timestamp: 10000 },
      { type: "fault", label: "🚩 Falta", timestamp: 50000 },
      { type: "fault", label: "🚩 Falta", timestamp: 90000 },
      { type: "fault", label: "🚩 Falta", timestamp: 150000 },
    ],
  });
  assert.ok(insights.some((text) => text.includes("Goles registrados: 2")));
  assert.ok(insights.some((text) => text.includes("Ocasiones de gol: 3")));
  assert.ok(insights.some((text) => text.includes("revisar disciplina defensiva")));
});

test("reports chances without goals", () => {
  const insights = generateInsights({
    durationMs: 300000, distance: 2000, maxSpeed: 6,
    teamDistanceA: 1000, teamDistanceB: 1000, possession: 50,
    events: [
      { type: "chance", label: "🎯 Ocasión", timestamp: 30000 },
      { type: "chance", label: "🎯 Ocasión", timestamp: 120000 },
    ],
  });
  assert.ok(insights.some((text) => text.includes("sin gol")));
});
