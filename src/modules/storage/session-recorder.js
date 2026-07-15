import { resolvePossessionFrame } from "../../utils/possession.js";
import { generateInsights } from "../insights/insight-generator.js";

export class SessionRecorder {
  #events;
  #store;
  #current = null;
  #possession = { a: 0, b: 0 };
  #lastPossessionTs = 0;
  #fieldLength = 105;
  #maxSpeed = 0;
  #distance = 0;
  #teamDistance = { a: 0, b: 0 };
  #lastPositions = new Map();
  #unsubscribers = [];

  constructor(events, store) {
    this.#events = events;
    this.#store = store;
    this.#unsubscribers.push(events.on("analysis.ready", (event) => this.#start(event.detail.mode)));
    this.#unsubscribers.push(events.on("field.calibrated", (event) => {
      this.#fieldLength = event.detail.dimensions.length;
      if (this.#current) this.#current.field = event.detail.dimensions;
    }));
    this.#unsubscribers.push(events.on("metrics.updated", (event) => this.#updateMetrics(event.detail)));
    this.#unsubscribers.push(events.on("tracking.updated", (event) => { this.#updatePossession(event.detail); this.#updateTeamDistance(event.detail.tracks); }));
    this.#unsubscribers.push(events.on("analysis.stopped", () => this.#stop()));
  }

  destroy() {
    for (const unsub of this.#unsubscribers) unsub();
    this.#unsubscribers = [];
  }

  #start(mode) {
    this.#current = { id: `session-${crypto.randomUUID()}`, startedAt: Date.now(), mode, field: null, events: [] };
    this.#maxSpeed = 0;
    this.#distance = 0;
    this.#possession = { a: 0, b: 0 };
    this.#lastPossessionTs = 0;
    this.#teamDistance = { a: 0, b: 0 };
    this.#lastPositions.clear();
  }

  markEvent(type, label) {
    if (!this.#current) return;
    this.#current.events.push({ type, label, timestamp: Date.now() - this.#current.startedAt });
  }

  #updateMetrics(detail) {
    if (!this.#current) return;
    const players = detail.metrics.filter((metric) => metric.label === "person");
    this.#distance = players.reduce((sum, metric) => sum + metric.distance, 0);
    this.#maxSpeed = players.reduce((max, metric) => Math.max(max, metric.speed), this.#maxSpeed);
  }

  #updatePossession(detail) {
    if (!this.#current) return;
    const ball = detail.tracks.find((track) => track.label === "sports ball" && track.fieldPosition);
    if (!ball) return;
    const players = detail.tracks.filter((track) => track.label === "person" && track.fieldPosition);
    if (!players.length) return;
    const winner = resolvePossessionFrame(ball, players, this.#fieldLength);
    if (!winner) return;
    const dt = detail.timestamp - this.#lastPossessionTs;
    if (dt > 0) this.#possession[winner] += dt;
    this.#lastPossessionTs = detail.timestamp;
  }

  #updateTeamDistance(tracks) {
    if (!this.#current) return;
    const mid = this.#fieldLength / 2;
    for (const track of tracks) {
      if (track.label !== "person" || !track.fieldPosition) continue;
      const last = this.#lastPositions.get(track.id);
      if (last) {
        const delta = Math.hypot(track.fieldPosition.x - last.x, track.fieldPosition.y - last.y);
        this.#teamDistance[last.x < mid ? "a" : "b"] += delta;
      }
      this.#lastPositions.set(track.id, track.fieldPosition);
    }
  }

  async #stop() {
    if (!this.#current) return;
    const total = this.#possession.a + this.#possession.b;
    const session = {
      ...this.#current,
      endedAt: Date.now(),
      durationMs: Date.now() - this.#current.startedAt,
      distance: this.#distance,
      maxSpeed: this.#maxSpeed,
      teamDistanceA: this.#teamDistance.a,
      teamDistanceB: this.#teamDistance.b,
      possession: total ? Math.round((this.#possession.a / total) * 100) : null,
      insights: []
    };
    try {
      session.insights = generateInsights(session);
    } catch { }
    this.#current = null;
    try {
      await this.#store.saveSession(session);
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        await this.#store.saveSession(session);
      } catch (retryError) {
        this.#events.emit("analysis.error", { message: `No se pudo guardar la sesión: ${retryError?.message || retryError}` });
        return;
      }
    }
    this.#events.emit("session.saved", session);
  }
}
