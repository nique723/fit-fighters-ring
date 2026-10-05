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

  arena: {
    floorY: 468,
    leftBound: 70,
    rightBound: 890,
    minGap: 150
  },

  player: {
    startX: 280,
    width: 46,
    height: 92,
    moveSpeed: 210,
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
    startX: 620,
    width: 50,
    height: 100,
    maxHealth: 100,
    color: 0x4a5568,
    telegraphColor: 0xed8936,
    jabColor: 0xe53e3e,
    // Dummy jab is a timing tool, not a full fighter.
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
    tiredSlowdown: 0.4 // 40% slower startups + recoveries
  },

  // Active windows were missing from the original spec.
  // Instant hits feel thin. These are the frames the glove can connect.
  punches: {
    jab: {
      startup: 100,
      active: 140,
      recovery: 150,
      reach: 245, minReach: 175, // end of the arm
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
      reach: 205, minReach: 140, // have to step in
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
      reach: 165, minReach: 100, // inside only
      damage: 5,
      staminaCost: 12,
      staminaDrain: 12,
      hitstop: 90,
      knockback: 8,
      bend: 0.28,
      shake: 0.007
    }
  },

  slip: {
    duration: 250,
    staminaCost: 8,
    counterWindow: 800,
    counterDamageMul: 1.5
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
  }
};
