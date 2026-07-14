import { QUALITY_HIGH, QUALITY_MEDIUM } from "../../config/analysis-config.js";

export function qualityFromScore(score) {
  if (score >= QUALITY_HIGH) return "high";
  if (score >= QUALITY_MEDIUM) return "medium";
  return "low";
}

/**
 * Derives per-track movement metrics from `tracking.updated` events.
 * Distances use the projected `fieldPosition` in meters; speeds use the
 * timestamp delta between consecutive updates. Every estimate is labeled
 * with a `confidence` (detection score while on the field) and a `quality`
 * bucket so the UI can communicate estimation reliability.
 */
export class MetricsCalculator {
  #events;
  #history = new Map();
  #unsubscribers = [];

  constructor(events) {
    this.#events = events;
    this.#unsubscribers.push(events.on("tracking.updated", (event) => this.#update(event.detail)));
    this.#unsubscribers.push(events.on("analysis.stopped", () => this.#reset()));
    this.#unsubscribers.push(events.on("field.calibrationStarted", () => this.#reset()));
  }

  destroy() {
    for (const unsub of this.#unsubscribers) unsub();
    this.#unsubscribers = [];
  }

  #update(result) {
    const metrics = [];
    for (const track of result.tracks) {
      let entry = this.#history.get(track.id);
      if (!entry) {
        entry = { lastPosition: null, lastTimestamp: null, distance: 0, avgX: 0, avgY: 0, samples: 0 };
        this.#history.set(track.id, entry);
      }
      metrics.push(this.#computeTrack(track, entry, result.timestamp));
    }
    this.#events.emit("metrics.updated", { timestamp: result.timestamp, metrics });
  }

  #computeTrack(track, entry, timestamp) {
    const position = track.fieldPosition;
    let distanceDelta = 0;
    let speed = 0;
    if (position && entry.lastPosition && entry.lastTimestamp != null) {
      const dx = position.x - entry.lastPosition.x;
      const dy = position.y - entry.lastPosition.y;
      distanceDelta = Math.hypot(dx, dy);
      const dt = (timestamp - entry.lastTimestamp) / 1000;
      if (dt > 0) speed = distanceDelta / dt;
      entry.distance += distanceDelta;
    }
    if (position) {
      entry.avgX = (entry.avgX * entry.samples + position.x) / (entry.samples + 1);
      entry.avgY = (entry.avgY * entry.samples + position.y) / (entry.samples + 1);
      entry.samples += 1;
      entry.lastPosition = position;
      entry.lastTimestamp = timestamp;
    }
    const confidence = position ? track.positionQuality : 0;
    return {
      id: track.id,
      label: track.label,
      state: track.state,
      distance: entry.distance,
      speed,
      avgPosition: entry.samples ? { x: entry.avgX, y: entry.avgY } : null,
      confidence,
      quality: qualityFromScore(confidence)
    };
  }

  #reset() {
    this.#history.clear();
  }
}
