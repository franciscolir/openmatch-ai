import { projectPoint } from "../../utils/homography.js";

const MAX_LOST_MS = 1500;
const MIN_IOU = 0.08;
const MAX_CENTER_DISTANCE = 0.14;

/** Associates normalized detections over time and exposes stable session IDs. */
export class TrackManager {
  #events;
  #tracks = new Map();
  #nextId = 1;
  #homography;
  #dimensions;

  constructor(events) {
    this.#events = events;
    events.on("ai.detected", (event) => this.#update(event.detail));
    events.on("field.calibrated", (event) => {
      this.#homography = event.detail.homography;
      this.#dimensions = event.detail.dimensions;
    });
    events.on("field.calibrationStarted", () => {
      this.#homography = undefined;
      this.#dimensions = undefined;
    });
    events.on("analysis.stopped", () => this.#reset());
  }

  #update(result) {
    const candidates = result.detections.filter((detection) => detection.label === "person" || detection.label === "sports ball");
    const available = new Set(this.#tracks.keys());
    for (const detection of candidates) {
      const track = this.#findBestTrack(detection, available);
      if (track) {
        available.delete(track.id);
        track.box = detection.box;
        track.score = detection.score;
        track.lastSeenAt = result.timestamp;
        track.state = "active";
        track.missedFrames = 0;
      } else {
        const created = this.#createTrack(detection, result.timestamp);
        this.#tracks.set(created.id, created);
      }
    }
    for (const id of available) {
      const track = this.#tracks.get(id);
      track.missedFrames += 1;
      track.state = result.timestamp - track.lastSeenAt > MAX_LOST_MS ? "removed" : "lost";
      if (track.state === "removed") this.#tracks.delete(id);
    }
    const tracks = [...this.#tracks.values()].map((track) => this.#serialize(track));
    this.#events.emit("tracking.updated", { timestamp: result.timestamp, tracks });
  }

  #findBestTrack(detection, available) {
    let best;
    let bestScore = -Infinity;
    for (const id of available) {
      const track = this.#tracks.get(id);
      if (track.label !== detection.label) continue;
      const overlap = iou(track.box, detection.box);
      const distance = centerDistance(track.box, detection.box);
      if (overlap < MIN_IOU && distance > MAX_CENTER_DISTANCE) continue;
      const score = overlap - distance * 0.5;
      if (score > bestScore) {
        best = track;
        bestScore = score;
      }
    }
    return best;
  }

  #createTrack(detection, timestamp) {
    const prefix = detection.label === "person" ? "player" : "ball";
    return {
      id: `${prefix}-${this.#nextId++}`,
      label: detection.label,
      box: detection.box,
      score: detection.score,
      lastSeenAt: timestamp,
      state: "active",
      missedFrames: 0
    };
  }

  #serialize(track) {
    const footPoint = { x: track.box.x + track.box.width / 2, y: track.box.y + track.box.height };
    const projected = this.#homography ? projectPoint(this.#homography, footPoint) : null;
    const inField = projected && projected.x >= 0 && projected.x <= this.#dimensions.length && projected.y >= 0 && projected.y <= this.#dimensions.width;
    return {
      ...track,
      footPoint,
      fieldPosition: inField ? projected : null,
      positionQuality: inField ? track.score : 0
    };
  }

  #reset() {
    this.#tracks.clear();
    this.#nextId = 1;
  }
}

function iou(first, second) {
  const left = Math.max(first.x, second.x);
  const top = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = first.width * first.height + second.width * second.height - intersection;
  return union ? intersection / union : 0;
}

function centerDistance(first, second) {
  const firstX = first.x + first.width / 2;
  const firstY = first.y + first.height / 2;
  const secondX = second.x + second.width / 2;
  const secondY = second.y + second.height / 2;
  return Math.hypot(firstX - secondX, firstY - secondY);
}
