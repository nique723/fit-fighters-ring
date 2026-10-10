/**
 * Fit Fighters — all combat tunables live here.
 * Change numbers. Do not change logic files to feel out punches.
 */
export const CONFIG = {
  game: {
    width: 960,
    height: 540,
    background: 0x12161c
  },

  // Pre-rendered sprite frames (Blender, 480x504, feet anchor). See tools/sprites.
  sprite: {
    pxPerM: 240,
    anchorX: 0.4,
    anchorY: 0.9716,
    frames: ['idle0', 'idle1', 'idle2', 'idle3', 'walk0', 'walk1', 'walk2', 'walk3',
      'jab0', 'jab1', 'cross0', 'cross1', 'body0', 'body1', 'upper0', 'upper1',
      'slip', 'duck', 'hithead', 'hitbody', 'kneel']
  },

  // Broadcast camera (zoom 1 = whole arena visible).
  camera: {
    maxZoom: 1.45,
    minZoom: 1.08,
    closeDist: 230,   // screen px between fighters before the camera starts pulling out
    zoomOutPer: 650,
    lookAbove: 120,   // frame centre sits this far above the fighters' feet
    follow: 0.08
  },

  arena: {
    leftBound: 70,
    rightBound: 890,
    minGap: 125,          // x gap kept when fighters share a lane
    laneTolerance: 0.14,  // |dz| a punch can still land across (0..1 depth, ~0.5 m)
    blockDepth: 0.22,     // |dz| under which fighters can't pass through each other
    depthMin: 0,
    depthMax: 1
  },

  player: {
    startX: 300,
    startZ: 0.4,
    depthSpeed: 0.65,
    width: 46,
    height: 92,
    moveSpeed: 260,
    slipX: -22,
    slipY: 16,
    colors: {
      idle: 0x2b6cb0,
      moving: 0x3182ce,
      startup: 0xd69e2e,
      active: 0xe53e3e,
      recovery: 0x718096,
      slipping: 0x38b2ac,
      tired: 0x744210
    }
  },

  dummy: {
    startX: 640,
    startZ: 0.4,
    depthSpeed: 0.32,
    width: 50,
    height: 100,
    maxHealth: 100,
    color: 0x4a5568,
    telegraphColor: 0xed8936,
    jabColor: 0xe53e3e,
    jabInterval: 1600,
    jabStartup: 420,
    jabActive: 160,
    jabRecovery: 200,
    jabReach: 230
  },

  stamina: {
    max: 100,
    regenPerSec: 12,
    regenDelay: 600,
    tiredThreshold: 20,
    tiredSlowdown: 0.4,
    comboLink: 0.4
  },

  punches: {
    jab: {
      startup: 100,
      active: 140,
      recovery: 150,
      reach: 215, minReach: 125,
      damage: 3,
      staminaCost: 5,
      hitstop: 60,
      knockback: 10,
      shake: 0.004
    },
    cross: {
      startup: 200,
      active: 180,
      recovery: 300,
      reach: 210, minReach: 120,
      damage: 8,
      staminaCost: 15,
      hitstop: 110,
      knockback: 25,
      shake: 0.011
    },
    body: {
      startup: 180,
      active: 160,
      recovery: 280,
      reach: 185, minReach: 110,
      damage: 5,
      staminaCost: 12,
      staminaDrain: 12,
      hitstop: 90,
      knockback: 8,
      bend: 0.28,
      shake: 0.007
    },
    upper: {
      startup: 170,
      active: 150,
      recovery: 260,
      reach: 165, minReach: 100,
      damage: 7,
      staminaCost: 14,
      hitstop: 100,
      knockback: 14,
      bend: -0.2,
      shake: 0.012
    }
  },

  slip: {
    duration: 250,
    staminaCost: 8,
    counterWindow: 800,
    counterDamageMul: 1.5
  },

  duck: {
    duration: 280,
    staminaCost: 6
  },

  styles: [
    { id: 'jabber', name: 'JABBER', weight: { jab: 0.7, cross: 0.2, body: 0.1 }, step: 80 },
    { id: 'pressure', name: 'PRESSURE', weight: { jab: 0.25, cross: 0.35, body: 0.4 }, step: 140 },
    { id: 'counter', name: 'COUNTER', weight: { jab: 0.2, cross: 0.6, body: 0.2 }, step: 50 }
  ],

  feel: {
    counterPopupMs: 700,
    dummyResetHold: 600,
    playerHitFlash: 80,
    hitPoseMs: 340
  },

  score: {
    roundMs: 30000,
    rounds: 3,
    points: { jab: 10, cross: 20, body: 15, upper: 25, counter: 15, knockdown: 50, hit: -5 }
  }
};
