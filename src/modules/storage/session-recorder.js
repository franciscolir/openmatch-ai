export class SessionRecorder {
  #events;
  #store;
  #current = null;
  #possession = { a: 0, b: 0 };
  #fieldLength = 105;
  #maxSpeed = 0;
  #distance = 0;

  constructor(events, store) {
    this.#events = events;
    this.#store = store;
    events.on("analysis.ready", (event) => this.#start(event.detail.mode));
    events.on("field.calibrated", (event) => {
      this.#fieldLength = event.detail.dimensions.length;
      if (this.#current) this.#current.field = event.detail.dimensions;
    });
    events.on("metrics.updated", (event) => this.#updateMetrics(event.detail));
    events.on("tracking.updated", (event) => this.#updatePossession(event.detail));
    events.on("analysis.stopped", () => this.#stop());
  }

  #start(mode) {
    this.#current = { id: `session-${Date.now()}`, startedAt: Date.now(), mode, field: null };
    this.#maxSpeed = 0;
    this.#distance = 0;
    this.#possession = { a: 0, b: 0 };
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
    const distances = { a: Infinity, b: Infinity };
    const mid = this.#fieldLength / 2;
    for (const player of players) {
      const team = player.fieldPosition.x < mid ? "a" : "b";
      const distance = Math.hypot(player.fieldPosition.x - ball.fieldPosition.x, player.fieldPosition.y - ball.fieldPosition.y);
      if (distance < distances[team]) distances[team] = distance;
    }
    this.#possession[distances.a <= distances.b ? "a" : "b"] += 1;
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
      possession: total ? Math.round((this.#possession.a / total) * 100) : null
    };
    this.#current = null;
    await this.#store.saveSession(session);
    this.#events.emit("session.saved", session);
  }
}
