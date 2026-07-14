const POSE_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [12, 14], [14, 16],
  [16, 18], [16, 20], [16, 22], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27],
  [27, 29], [29, 31], [24, 26], [26, 28], [28, 30], [30, 32]
];

/** Renders normalized vision output without depending on the inference engine. */
export class OverlayRenderer {
  #canvas;
  #context;
  #video;
  #resizeObserver;

  constructor(canvas, video) {
    this.#canvas = canvas;
    this.#context = canvas.getContext("2d");
    this.#video = video;
    this.#resizeObserver = new ResizeObserver(() => this.#resize());
    this.#resizeObserver.observe(video);
  }

  render(result, tracks = []) {
    const { width, height } = this.#canvas;
    this.#context.clearRect(0, 0, width, height);
    if (!result) return;
    for (const detection of result.detections) this.#drawDetection(detection, width, height, tracks);
    for (const pose of result.poses) this.#drawPose(pose, width, height);
  }

  clear() { this.#context.clearRect(0, 0, this.#canvas.width, this.#canvas.height); }

  destroy() { this.#resizeObserver.disconnect(); }

  #resize() {
    const rect = this.#video.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(rect.width * ratio);
    const height = Math.round(rect.height * ratio);
    if (this.#canvas.width === width && this.#canvas.height === height) return;
    this.#canvas.width = width;
    this.#canvas.height = height;
    this.#canvas.style.width = `${rect.width}px`;
    this.#canvas.style.height = `${rect.height}px`;
  }

  #drawDetection(detection, width, height, tracks) {
    const { x, y, width: boxWidth, height: boxHeight } = detection.box;
    const left = x * width;
    const top = y * height;
    const boxW = boxWidth * width;
    const boxH = boxHeight * height;
    const color = detection.label === "sports ball" ? "#ffca5c" : "#b6ff46";
    this.#context.strokeStyle = color;
    this.#context.lineWidth = Math.max(2, width / 500);
    this.#context.strokeRect(left, top, boxW, boxH);
    this.#context.fillStyle = color;
    this.#context.font = `${Math.max(11, width / 55)}px ui-sans-serif, system-ui`;
    const track = tracks.find((item) => item.label === detection.label && sameBox(item.box, detection.box));
    const name = track ? track.id : detection.label;
    this.#context.fillText(`${name} ${Math.round(detection.score * 100)}%`, left + 4, Math.max(14, top - 5));
  }

  #drawPose(pose, width, height) {
    this.#context.strokeStyle = "#78bbff";
    this.#context.fillStyle = "#dcecff";
    this.#context.lineWidth = Math.max(1.5, width / 650);
    for (const [from, to] of POSE_CONNECTIONS) {
      const start = pose.landmarks[from];
      const end = pose.landmarks[to];
      if (!start || !end || start.visibility < 0.5 || end.visibility < 0.5) continue;
      this.#context.beginPath();
      this.#context.moveTo(start.x * width, start.y * height);
      this.#context.lineTo(end.x * width, end.y * height);
      this.#context.stroke();
    }
    for (const landmark of pose.landmarks) {
      if (landmark.visibility < 0.5) continue;
      this.#context.beginPath();
      this.#context.arc(landmark.x * width, landmark.y * height, Math.max(2, width / 250), 0, Math.PI * 2);
      this.#context.fill();
    }
  }
}

function sameBox(first, second) {
  return Math.abs(first.x - second.x) < 0.001 && Math.abs(first.y - second.y) < 0.001 &&
    Math.abs(first.width - second.width) < 0.001 && Math.abs(first.height - second.height) < 0.001;
}
