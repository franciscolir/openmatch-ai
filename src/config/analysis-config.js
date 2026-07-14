export const ANALYSIS_MODES = {
  saver: { inferenceFps: 4, maxDimension: 480, detectionThreshold: 0.55, poseEnabled: false },
  balanced: { inferenceFps: 8, maxDimension: 640, detectionThreshold: 0.5, poseEnabled: true },
  performance: { inferenceFps: 12, maxDimension: 720, detectionThreshold: 0.45, poseEnabled: true },
  precision: { inferenceFps: 10, maxDimension: 960, detectionThreshold: 0.35, poseEnabled: true }
};

export function getAnalysisMode(mode) {
  return ANALYSIS_MODES[mode] || ANALYSIS_MODES.balanced;
}
