/**
 * Camera-mode tunables only.
 * Combat files stay untouched. When camera is live we swap
 * CONFIG.slip duration / counter window for the wider values here,
 * then restore on close.
 */
export const CAMERA_CONFIG = {
  fps: 30,
  runningMode: 'VIDEO',
  delegate: 'GPU',
  numPoses: 1,

  wasmBase: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm',
  modelUrl:
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',

  video: {
    width: 640,
    height: 480,
    facingMode: 'user'
  },

  preview: {
    width: 240,
    height: 180
  },

  // Landmark indices (MediaPipe Pose)
  nose: 0,
  lShoulder: 11,
  rShoulder: 12,
  lElbow: 13,
  rElbow: 14,
  lWrist: 15,
  rWrist: 16,

  minVisibility: 0.45,
  frameMargin: 0.07,

  calibration: {
    guardHoldMs: 2000,
    guardMaxSpeed: 0.35, // norm units / sec
    jabMinReach: 0.55 // fraction of live arm estimate
  },

  punch: {
    elbowStraightDeg: 150,
    // wrist speed away from shoulder, normalized widths per second
    extendSpeed: 1.15,
    minReach: 0.62, // vs calibrated arm length
    retractReset: 0.48
  },

  slip: {
    // spec is 15% / 500ms — camera runs wider to eat pose latency
    sideways: 0.2,
    returnMs: 650,
    minAwayMs: 60
  },

  cooldownMs: {
    lead: 280,
    rear: 320,
    slip: 420
  },

  // Applied onto CONFIG.slip while camera is armed
  combat: {
    slipDuration: 320,
    counterWindow: 1100
  }
};
