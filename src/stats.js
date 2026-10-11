/**
 * Session stats. Later this feeds a coach grade screen.
 * Never reset on dummy knockdown — only on full session reset.
 */
import { CONFIG } from './config.js';

/** { jab: 0, cross: 0, ... } for every punch in CONFIG.punchOrder. */
export function zeroPunches() {
  return Object.fromEntries(CONFIG.punchOrder.map((p) => [p, 0]));
}

/** Total across all punch types. */
export function sumPunches(counts) {
  return CONFIG.punchOrder.reduce((n, p) => n + (counts[p] || 0), 0);
}

export function createStats() {
  return {
    thrown: zeroPunches(),
    landed: zeroPunches(),
    whiffs: zeroPunches(),
    slipsAttempted: 0,
    slipsSuccessful: 0,
    countersLanded: 0,
    dummyJabsThrown: 0,
    dummyJabsLanded: 0,
    dummyKnockdowns: 0,
    points: 0,
    level: 1,
    round: 1,
    roundMs: 30000,
    running: false,
    finished: false,
    camera: {
      confidence: 0,
      missedFrames: 0,
      processed: 0,
      lastAction: '—',
      visible: true
    }
  };
}

export function formatStats(stats, extras) {
  const pct = (land, throwN) => (throwN === 0 ? '—' : `${Math.round((land / throwN) * 100)}%`);
  return [
    `STATE     ${extras.state}${extras.tired ? ' + TIRED' : ''}`,
    `STAMINA   ${extras.stamina.toFixed(1)} / ${extras.maxStamina}`,
    `COUNTER   ${extras.counterReady ? 'OPEN' : '—'}`,
    `FROZEN    ${extras.frozen ? 'HITSTOP' : 'no'}`,
    ``,
    ...CONFIG.punchOrder.map((p) =>
      `${p.toUpperCase().padEnd(10)}T${stats.thrown[p]}  L${stats.landed[p]}  W${stats.whiffs[p]}  ${pct(stats.landed[p], stats.thrown[p])}`),
    ``,
    `SLIPS     ${stats.slipsSuccessful} / ${stats.slipsAttempted}`,
    `COUNTERS  ${stats.countersLanded}`,
    `DUMMY     thrown ${stats.dummyJabsThrown}  hit you ${stats.dummyJabsLanded}  KD ${stats.dummyKnockdowns}`,
    ``,
    `CAM       conf ${(stats.camera.confidence * 100).toFixed(0)}%  ok ${stats.camera.processed}  miss ${stats.camera.missedFrames}`,
    `CAM LAST  ${stats.camera.lastAction || '—'}`
  ].join('\n');
}
