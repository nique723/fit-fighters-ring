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
      'jab0', 'jab1', 'jab2', 'jab3', 'cross0', 'cross1', 'cross2', 'cross3',
      'body0', 'body1', 'body2', 'body3', 'upper0', 'upper1', 'upper2', 'upper3',
      'hook0', 'hook1', 'hook2', 'hook3', 'slip', 'duck', 'hithead', 'hitbody', 'kneel'],
    // Extra frames rendered from mocap (tools/sprites/render_mocap.py). Only fighters with
    // `mocap: true` load these; everyone else falls back (fighter-view.js FALLBACK).
    mocapFrames: ['hitlight0', 'hitlight1', 'hitlight2', 'hithead0', 'hithead1', 'hithead2',
      'hitbig0', 'hitbig1', 'hitbig2', 'hitbody0', 'hitbody1', 'hitbody2', 'hitrib0', 'hitrib1', 'hitrib2',
      'down0', 'down1', 'down2', 'down3', 'rise0', 'rise1', 'rise2', 'rise3',
      'victory0', 'victory1', 'victory2', 'victory3', 'block0', 'block1']
  },

  // Fighters. Sprites live in public/fighters/<id>/. Order = the fighter picker's cycle order.
  // Pick on the page (FIGHTER button before the bell) or by URL: ?p=kamarian&o=o
  // stats: 8 ratings, 1-10 each, 5 = baseline. Totals must equal ratings.budget (console warns if not).
  // height: metres (card + portrait framing). canvas/anchor: only for sprites rendered on a taller
  //   canvas (render_mocap.py sizes it to the fighter); copy w/h and anchorX/Y from anchor.json.
  // ai: how this fighter fights as the opponent — punch preference multipliers on top of the
  //     difficulty style, circle (sideways movement x), range (px; negative = stands closer).
  roster: [
    { id: 'p', name: 'CRIMSON GUARD', trait: 'Balanced', height: 1.85,
      stats: { handSpeed: 5, footwork: 5, power: 5, reach: 5, chin: 5, engine: 5, guard: 5, experience: 5 } },
    { id: 'o', name: 'WHITE LIGHTNING', trait: 'Balanced', height: 1.83,
      stats: { handSpeed: 5, footwork: 5, power: 5, reach: 5, chin: 5, engine: 5, guard: 5, experience: 5 } },
    // Small, fast, deep gas tank. The cost: light shots, short reach, and every punch he
    // eats drains his stamina hard (chin 2), so getting hit is how you beat him.
    { id: 'kamarian', name: 'KAMARIAN', trait: 'Fast hands · quick feet · big engine', mocap: true,
      height: 1.68, canvas: [480, 544], anchor: [0.4, 0.9733],
      stats: { handSpeed: 8, footwork: 7, power: 3, reach: 2, chin: 2, engine: 8, guard: 5, experience: 5 },
      // as the opponent: volume jabs and body work, keeps circling off the line
      ai: { punches: { jab: 1.6, cross: 0.9, hook: 0.6, body: 1.3 }, circle: 1.7, range: 0 } },
    // Guard never comes down (40% of head shots blocked), heavy hands, ring IQ. The cost: slow
    // feet, slow hands, short gas tank. Beat him with movement, body shots and uppercuts
    // (both go through the guard), and by making him work.
    { id: 'lamar', name: 'LAMAR', trait: 'Guard always up · power · experience', mocap: true,
      height: 1.80, canvas: [480, 576], anchor: [0.4, 0.9745],
      stats: { handSpeed: 2, footwork: 3, power: 8, reach: 4, chin: 3, engine: 4, guard: 9, experience: 7 },
      // as the opponent: walks you down behind the guard, sits in range for the cross and hook
      ai: { punches: { jab: 0.6, cross: 1.5, hook: 1.6, body: 0.9 }, circle: 0.4, range: -25 } },
    // Strong and built like it: heavy hands and a high guard. The cost: new to boxing (stays stunned
    // longer, small counter window, telegraphs his shots), slow feet. Make him miss and counter.
    { id: 'joe', name: 'JOE', trait: 'Power · high guard · new to boxing', mocap: true,
      height: 1.78, canvas: [480, 576], anchor: [0.4, 0.9745],
      stats: { handSpeed: 4, footwork: 3, power: 8, reach: 5, chin: 6, engine: 4, guard: 8, experience: 2 },
      // as the opponent: loads up on hooks and right hands, comes forward, rarely jabs
      ai: { punches: { jab: 0.5, cross: 1.4, hook: 1.7, body: 1.0 }, circle: 0.6, range: -15 } },
    // Heavyweight: longest arms and heaviest hands on the roster. The cost: slow feet and hands,
    // a short gas tank. He wants you at the end of his jab; get inside and make him move.
    { id: 'malachi', name: 'MALACHI', trait: 'Heavyweight · long reach · power', mocap: true,
      height: 1.88, canvas: [480, 600], anchor: [0.4, 0.9753],
      stats: { handSpeed: 3, footwork: 2, power: 9, reach: 9, chin: 6, engine: 3, guard: 4, experience: 4 },
      // as the opponent: long jab and the right hand behind it, keeps you at range
      ai: { punches: { jab: 1.5, cross: 1.4, hook: 0.7, body: 0.8 }, circle: 0.5, range: 20 } }
  ],
  // What one rating point is worth. handSpeed 9 = punches 24% quicker; power 3 = 16% less damage.
  ratings: {
    budget: 40, min: 1, max: 10,
    // chinDrain: stamina lost when hit. chin 2 = 36% more drained per punch taken.
    step: { handSpeed: 0.06, footwork: 0.06, power: 0.08, reach: 0.03, chin: 0.06, chinDrain: 0.12,
      engine: 0.08, engineCost: 0.04,
      // guard: block chance on head shots per point above 5 (9 = 40%); below 5, head shots hurt more.
      guard: 0.1, guardOpen: 0.05,
      // experience: longer counter window, shakes off hits faster, (AI) gives away less on the wind-up
      experience: 0.1, expStun: 0.06, expTell: 0.04 },
    blockDamage: 0.25,              // a blocked shot still does a quarter
    unblockable: ['body', 'upper']  // these go around / through a high guard
  },
  defaultPlayer: 'p',
  defaultOpponent: 'o',

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
    laneTolerance: 0.14,  // |dz| a punch can still land across (0..1 depth, ~0.5 m). A punch can override with `lane`.
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
    // stamina lost when a punch lands on you (x attacker power x your chin)
    hitDrain: { jab: 3, cross: 7, hook: 7, body: 9, upper: 7 },
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
    // Lead hook: the round punch. Short reach, but it sweeps a lane twice as wide,
    // so it catches an opponent who has stepped off the line. Duck under it.
    hook: {
      startup: 190,
      active: 150,
      recovery: 290,
      reach: 170, minReach: 100,
      lane: 0.28,
      damage: 8,
      staminaCost: 14,
      hitstop: 105,
      knockback: 16,
      shake: 0.011
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

  // Every punch a fighter can throw, in input priority order. Stats and UI read this list.
  punchOrder: ['jab', 'cross', 'hook', 'body', 'upper'],

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
    { id: 'jabber', name: 'JABBER', weight: { jab: 0.65, cross: 0.2, hook: 0.05, body: 0.1 }, step: 80 },
    { id: 'pressure', name: 'PRESSURE', weight: { jab: 0.2, cross: 0.25, hook: 0.25, body: 0.3 }, step: 140 },
    { id: 'counter', name: 'COUNTER', weight: { jab: 0.2, cross: 0.45, hook: 0.2, body: 0.15 }, step: 50 }
  ],

  feel: {
    counterPopupMs: 700,
    dummyResetHold: 600,
    playerHitFlash: 80,
    hitPoseMs: 340,
    knockdownMs: 2200,
    blockPoseMs: 260,    // shell-block pose when a shot lands on the gloves   // fall 0-20%, flat to 55%, getting up after
    hitSeq: { jab: 'hitlight', cross: 'hithead', hook: 'hithead', upper: 'hitbig', body: 'hitbody', rib: 'hitrib' }
  },

  score: {
    roundMs: 30000,
    rounds: 3,
    points: { jab: 10, cross: 20, hook: 25, body: 15, upper: 25, counter: 15, knockdown: 50, hit: -5 }
  }
};
