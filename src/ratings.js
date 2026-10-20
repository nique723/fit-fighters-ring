import { CONFIG } from './config.js';

/**
 * Fighter ratings -> combat multipliers.
 * Each rating is 1-10. 5 = the baseline in CONFIG (multiplier 1). Every fighter spends the
 * same budget (CONFIG.ratings.budget), so speed is paid for with something else.
 *
 *   handSpeed  punch startup + recovery time          (player and AI)
 *   footwork   move speed, in/out speed               (player and AI)
 *   power      damage + knockback dealt               (player); push on the player when AI lands
 *   reach      punch reach                            (player and AI)
 *   chin       damage taken + stamina lost when hit   (player and AI)
 *   engine     stamina regen (player and AI) + stamina cost per action (player)
 *   guard      blocks head shots while not punching   (player and AI); body + uppercut go through
 *   experience counter window (player), hit stun (both), wind-up tell (AI)
 */
export const RATING_KEYS = ['handSpeed', 'footwork', 'power', 'reach', 'chin', 'engine', 'guard', 'experience'];
export const RATING_LABELS = {
  handSpeed: 'Hand speed', footwork: 'Footwork', power: 'Power', reach: 'Reach', chin: 'Chin', engine: 'Engine',
  guard: 'Guard', experience: 'Experience'
};

export function fighter(id) {
  return CONFIG.roster.find((r) => r.id === id) || { id, name: String(id).toUpperCase(), stats: {} };
}

export function modsFor(id) {
  const s = fighter(id).stats || {};
  const r = (k) => (s[k] ?? 5) - 5;
  const step = CONFIG.ratings.step;
  return {
    speed: 1 - step.handSpeed * r('handSpeed'),   // multiply times by this (lower = faster)
    move: 1 + step.footwork * r('footwork'),
    power: 1 + step.power * r('power'),
    reach: 1 + step.reach * r('reach'),
    taken: 1 - step.chin * r('chin'),             // multiply damage taken by this
    drain: 1 - step.chinDrain * r('chin'),        // multiply stamina lost when hit by this
    regen: 1 + step.engine * r('engine'),
    cost: 1 - step.engineCost * r('engine'),
    block: Math.max(0, step.guard * r('guard')),              // chance a head shot is blocked
    headTaken: 1 + step.guardOpen * Math.max(0, -r('guard')), // low guard: head shots hurt more
    counter: 1 + step.experience * r('experience'),           // counter window
    stun: 1 - step.expStun * r('experience'),                 // hit pose length
    tell: 1 - step.expTell * r('experience')                  // AI wind-up length
  };
}

/** Does this head shot get blocked? Only while the defender isn't punching. */
export function blocks(mods, kind, defenderBusy) {
  if (defenderBusy || CONFIG.ratings.unblockable.includes(kind)) return false;
  return Math.random() < mods.block;
}

/** Warn in the console if a fighter's ratings break the rules, so balance stays honest. */
export function checkRoster() {
  const { budget, min, max } = CONFIG.ratings;
  for (const f of CONFIG.roster) {
    const s = f.stats || {};
    const total = RATING_KEYS.reduce((a, k) => a + (s[k] ?? 5), 0);
    if (total !== budget) console.warn(`[ratings] ${f.name}: total ${total}, budget is ${budget}`);
    for (const k of RATING_KEYS) {
      if ((s[k] ?? 5) < min || (s[k] ?? 5) > max) console.warn(`[ratings] ${f.name}: ${k} out of ${min}-${max}`);
    }
  }
}
