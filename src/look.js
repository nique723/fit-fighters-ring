// Pose-driven fighter. facing 1 = player (right), -1 = dummy (left).

export function drawFighter(g, pose, facing, tint) {
  g.clear();
  const f = facing;
  const skin = tint === 'dummy' ? 0x9aa3ad : 0xc68642;
  const shirt = tint === 'dummy' ? 0x4a5568 : 0x111111;
  const shorts = tint === 'dummy' ? 0x2d3748 : 0x0b0b0b;
  const glove = 0x7a1f24;
  const gloveHot = 0xc53030;
  const boot = tint === 'dummy' ? 0x1a202c : 0x5c1a1a;
  let lean = 0, leadX = 28, leadY = -18, rearX = -8, rearY = -6, headX = 8, headY = -62, crouch = 0;
  if (pose === 'jab') { leadX = 62; leadY = -22; headX = 12; }
  else if (pose === 'cross') { rearX = 58; rearY = -16; leadX = 18; leadY = -10; lean = 0.08; headX = 14; }
  else if (pose === 'body') { leadX = 48; leadY = 18; rearX = 6; rearY = 8; crouch = 10; headY = -50; }
  else if (pose === 'slip') { lean = -0.22; headX = -6; headY = -54; leadX = 16; leadY = -8; }
  else if (pose === 'startup') { leadX = 36; leadY = -16; }
  else if (pose === 'recovery') { leadX = 18; leadY = -4; crouch = 4; }
  else if (pose === 'telegraph') { leadX = 40; leadY = -20; }
  else if (pose === 'hit') { lean = 0.12; headX = -4; crouch = 6; }
  const gy = crouch;
  g.fillStyle(0x000000, 0.35);
  g.fillEllipse(0, 42, 54, 10);
  g.fillStyle(boot, 1);
  g.fillRoundedRect(-16 * f - 6, 18 + gy, 14, 22, 3);
  g.fillStyle(skin, 1);
  g.fillRoundedRect(-10 * f - 5, 4 + gy, 12, 18, 3);
  g.fillStyle(boot, 1);
  g.fillRoundedRect(10 * f - 6, 20 + gy, 14, 22, 3);
  g.fillStyle(skin, 1);
  g.fillRoundedRect(12 * f - 5, 6 + gy, 12, 18, 3);
  g.fillStyle(shirt, 1);
  g.fillRoundedRect(-16, -28 + gy, 34, 40, 6);
  g.fillStyle(shorts, 1);
  g.fillRoundedRect(-15, 6 + gy, 32, 16, 3);
  if (tint !== 'dummy') {
    g.fillStyle(0xffffff, 1);
    g.fillRect(4 * f, 10 + gy, 8, 3);
    g.fillRect(6 * f, 13 + gy, 3, 5);
  }
  g.fillStyle(skin, 1);
  g.fillCircle(headX * f, headY + gy, 13);
  g.fillStyle(0x1a1a1a, 1);
  g.fillRoundedRect((headX - 10) * f, headY - 14 + gy, 20, 8, 3);
  g.fillStyle(glove, 1);
  g.fillCircle(rearX * f, rearY + gy, 9);
  g.fillStyle(pose === 'jab' || pose === 'cross' || pose === 'body' ? gloveHot : glove, 1);
  g.fillCircle(leadX * f, leadY + gy, pose === 'cross' ? 11 : 10);
  g.rotation = lean * f;
}
