import { FilesetResolver, ObjectDetector, PoseLandmarker } from "@mediapipe/tasks-vision";

let detector;
let poseLandmarker;
let mode;

async function initialize(settings) {
  mode = settings;
  const vision = await FilesetResolver.forVisionTasks("/wasm");
  const detectorModel = "/models/efficientdet_lite0.tflite";
  const poseModel = "/models/pose_landmarker_lite.task";
  detector = await ObjectDetector.createFromOptions(vision, {
    baseOptions: { modelAssetPath: detectorModel },
    runningMode: "VIDEO",
    scoreThreshold: mode.detectionThreshold,
    categoryAllowlist: ["person", "sports ball"],
    maxResults: 32
  });
  if (mode.poseEnabled) {
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: poseModel },
      runningMode: "VIDEO",
      numPoses: 8,
      minPoseDetectionConfidence: mode.detectionThreshold,
      minPosePresenceConfidence: mode.detectionThreshold,
      minTrackingConfidence: mode.detectionThreshold
    });
  }
}

function normalizeDetections(result, sourceWidth, sourceHeight) {
  return result.detections.map((detection) => {
    const category = detection.categories[0];
    const box = detection.boundingBox;
    return {
      label: category.categoryName,
      score: category.score,
      box: {
        x: box.originX / sourceWidth,
        y: box.originY / sourceHeight,
        width: box.width / sourceWidth,
        height: box.height / sourceHeight
      }
    };
  });
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "initialize") {
      await initialize(data.mode);
      self.postMessage({ type: "ready" });
      return;
    }
    if (data.type === "stop") {
      detector?.close();
      poseLandmarker?.close();
      detector = undefined;
      poseLandmarker = undefined;
      return;
    }
    if (data.type !== "frame" || !detector) return;
    const startedAt = performance.now();
    const detections = detector.detectForVideo(data.frame, data.timestamp);
    let poses = [];
    if (poseLandmarker) {
      const poseResult = poseLandmarker.detectForVideo(data.frame, data.timestamp);
      poses = (poseResult.landmarks || []).map((landmarks) => ({ landmarks }));
    }
    data.frame.close();
    self.postMessage({
      type: "result",
      result: {
        timestamp: data.timestamp,
        detections: normalizeDetections(detections, data.width, data.height),
        poses,
        inferenceMs: performance.now() - startedAt
      }
    });
  } catch (error) {
    data.frame?.close();
    console.error("Vision worker frame error:", error);
    self.postMessage({ type: "error", stage: data.type, message: "No se pudo analizar el frame localmente.", detail: String(error?.message || error) });
  }
};
