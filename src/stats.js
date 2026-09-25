/**
 * Session stats. Later this feeds a coach grade screen.
 * Never reset on dummy knockdown — only on full session reset.
 */
export function createStats() {
  return {
    thrown: { jab: 0, cross: 0, body: 0 },
    landed: { jab: 0, cross: 0, body: 0 },
    whiffs: { jab: 0, cross: 0, body: 0 },
    slipsAttempted: 0,
    slipsSuccessful: 0,
    countersLanded: 0,
    dummyJabsThrown: 0,
    dummyJabsLanded: 0,
    dummyKnockdowns: 0,
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
    `JAB       T${stats.thrown.jab}  L${stats.landed.jab}  W${stats.whiffs.jab}  ${pct(stats.landed.jab, stats.thrown.jab)}`,
    `CROSS     T${stats.thrown.cross}  L${stats.landed.cross}  W${stats.whiffs.cross}  ${pct(stats.landed.cross, stats.thrown.cross)}`,
    `BODY      T${stats.thrown.body}  L${stats.landed.body}  W${stats.whiffs.body}  ${pct(stats.landed.body, stats.thrown.body)}`,
    ``,
    `SLIPS     ${stats.slipsSuccessful} / ${stats.slipsAttempted}`,
    `COUNTERS  ${stats.countersLanded}`,
    `DUMMY     thrown ${stats.dummyJabsThrown}  hit you ${stats.dummyJabsLanded}  KD ${stats.dummyKnockdowns}`,
    ``,
    `CAM       conf ${(stats.camera.confidence * 100).toFixed(0)}%  ok ${stats.camera.processed}  miss ${stats.camera.missedFrames}`,
    `CAM LAST  ${stats.camera.lastAction || '—'}`
  ].join('\n');
}
