import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { CAMERA_CONFIG as C } from './camera-config.js';
import { CONFIG } from './config.js';

const LM = {
  nose: C.nose,
  lShoulder: C.lShoulder,
  rShoulder: C.rShoulder,
  lElbow: C.lElbow,
  rElbow: C.rElbow,
  lWrist: C.lWrist,
  rWrist: C.rWrist
};

function vis(lm) {
  return lm && (lm.visibility ?? 1) >= C.minVisibility;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function elbowDeg(shoulder, elbow, wrist) {
  const abx = shoulder.x - elbow.x;
  const aby = shoulder.y - elbow.y;
  const cbx = wrist.x - elbow.x;
  const cby = wrist.y - elbow.y;
  const den = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (den < 1e-6) return 0;
  const cos = Math.min(1, Math.max(-1, (abx * cbx + aby * cby) / den));
  return (Math.acos(cos) * 180) / Math.PI;
}

function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export class CameraMode {
  constructor(input, stats) {
    this.input = input;
    this.stats = stats;
    this.active = false;
    this.ready = false;
    this.stance = 'orthodox';
    this.showOverlay = true;
    this.phase = 'off';
    this.warning = '';
    this.status = 'Camera off';
    this.landmarker = null;
    this.stream = null;
    this.raf = 0;
    this.lastInfer = 0;
    this.lastTs = 0;
    this.prev = null;
    this.calib = null;
    this.guardStarted = 0;
    this.slipAwayAt = 0;
    this.slipLatched = false;
    this.cool = { lead: 0, rear: 0, slip: 0 };
    this.armOut = { lead: false, rear: false };
    this.origSlip = {
      duration: CONFIG.slip.duration,
      counterWindow: CONFIG.slip.counterWindow
    };
    this.els = {};
    this.bindUi();
  }

  bindUi() {
    const $ = (id) => document.getElementById(id);
    this.els = {
      toggle: $('camera-toggle'),
      panel: $('camera-panel'),
      video: $('camera-video'),
      canvas: $('camera-skel'),
      stance: $('camera-stance'),
      overlayBtn: $('camera-overlay'),
      close: $('camera-close'),
      status: $('camera-status'),
      warn: $('camera-warn'),
      cal: $('camera-cal')
    };
    this.els.toggle?.addEventListener('click', () => {
      if (this.active) this.stop();
      else this.start();
    });
    this.els.close?.addEventListener('click', () => this.stop());
    this.els.stance?.addEventListener('click', () => {
      this.stance = this.stance === 'orthodox' ? 'southpaw' : 'orthodox';
      this.els.stance.textContent = this.stance === 'orthodox' ? 'Orthodox' : 'Southpaw';
    });
    this.els.overlayBtn?.addEventListener('click', () => {
      this.showOverlay = !this.showOverlay;
      this.els.overlayBtn.textContent = this.showOverlay ? 'Overlay on' : 'Overlay off';
      if (!this.showOverlay) this.clearCanvas();
    });
  }

  armCombatWindows(on) {
    if (on) {
      CONFIG.slip.duration = C.combat.slipDuration;
      CONFIG.slip.counterWindow = C.combat.counterWindow;
    } else {
      CONFIG.slip.duration = this.origSlip.duration;
      CONFIG.slip.counterWindow = this.origSlip.counterWindow;
    }
  }

  async start() {
    if (this.active) return;
    this.active = true;
    this.phase = 'boot';
    this.status = 'Starting camera…';
    this.paintHud();
    this.els.panel?.classList.add('open');
    this.els.toggle?.classList.add('on');
    this.els.cal?.classList.add('show');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: C.video.facingMode,
          width: { ideal: C.video.width },
          height: { ideal: C.video.height }
        }
      });
    } catch (err) {
      this.status = 'Camera blocked';
      this.warning = String(err.message || err);
      this.paintHud();
      return;
    }
    const video = this.els.video;
    video.srcObject = this.stream;
    video.muted = true;
    video.playsInline = true;
    await video.play().catch(() => {});
    try {
      if (!this.landmarker) {
        this.status = 'Loading pose model…';
        this.paintHud();
        const files = await FilesetResolver.forVisionTasks(C.wasmBase);
        const options = (delegate) => ({
          baseOptions: { modelAssetPath: C.modelUrl, delegate },
          runningMode: C.runningMode,
          numPoses: C.numPoses
        });
        try {
          this.landmarker = await PoseLandmarker.createFromOptions(files, options(C.delegate));
        } catch {
          this.landmarker = await PoseLandmarker.createFromOptions(files, options('CPU'));
        }
      }
    } catch (err) {
      this.status = 'Pose model failed';
      this.warning = String(err.message || err);
      this.paintHud();
      return;
    }
    this.ready = true;
    this.phase = 'guard';
    this.guardStarted = 0;
    this.calib = { samples: [] };
    this.status = 'Hold guard — 2 seconds';
    this.armCombatWindows(true);
    this.paintHud();
    this.loop();
  }

  stop() {
    this.active = false;
    this.ready = false;
    this.phase = 'off';
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.els.video) this.els.video.srcObject = null;
    this.clearCanvas();
    this.armCombatWindows(false);
    this.els.panel?.classList.remove('open');
    this.els.toggle?.classList.remove('on');
    this.els.cal?.classList.remove('show');
    this.status = 'Camera off';
    this.warning = '';
    this.paintHud();
  }

  loop = () => {
    if (!this.active) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    if (now - this.lastInfer < 1000 / C.fps) return;
    this.lastInfer = now;
    const video = this.els.video;
    if (!video || video.readyState < 2) {
      this.stats.camera.missedFrames += 1;
      return;
    }
    let result = null;
    try {
      result = this.landmarker.detectForVideo(video, now);
      this.stats.camera.processed += 1;
    } catch {
      this.stats.camera.missedFrames += 1;
      return;
    }
    const pose = result?.landmarks?.[0];
    if (!pose) {
      this.stats.camera.missedFrames += 1;
      this.stats.camera.confidence = 0;
      this.warning = "Can't see you — step back";
      this.paintHud();
      this.clearCanvas();
      return;
    }
    const pack = this.readPose(pose);
    this.stats.camera.confidence = pack.confidence;
    this.warning = pack.shouldersIn ? '' : "Can't see you — step back";
    const dt = this.lastTs ? (now - this.lastTs) / 1000 : 1 / C.fps;
    this.lastTs = now;
    if (this.phase === 'guard') this.tickGuard(pack, dt, now);
    else if (this.phase === 'jab') this.tickCalibJab(pack, dt, now);
    else if (this.phase === 'live') this.tickLive(pack, dt, now);
    if (this.showOverlay) this.draw(pose, pack);
    this.paintHud();
    this.prev = pack;
  };

  readPose(pose) {
    const n = pose[LM.nose];
    const ls = pose[LM.lShoulder];
    const rs = pose[LM.rShoulder];
    const le = pose[LM.lElbow];
    const re = pose[LM.rElbow];
    const lw = pose[LM.lWrist];
    const rw = pose[LM.rWrist];
    const used = [n, ls, rs, le, re, lw, rw];
    const confidence = used.filter(vis).length / used.length;
    const shouldersIn =
      vis(ls) && vis(rs) &&
      ls.x > C.frameMargin && rs.x > C.frameMargin &&
      ls.x < 1 - C.frameMargin && rs.x < 1 - C.frameMargin;
    return {
      n, ls, rs, le, re, lw, rw,
      confidence,
      shouldersIn,
      shoulderW: vis(ls) && vis(rs) ? dist(ls, rs) : 0,
      midS: vis(ls) && vis(rs) ? mid(ls, rs) : null,
      left: vis(ls) && vis(le) && vis(lw) ? { s: ls, e: le, w: lw } : null,
      right: vis(rs) && vis(re) && vis(rw) ? { s: rs, e: re, w: rw } : null
    };
  }

  arms(pack) {
    if (this.stance === 'orthodox') return { lead: pack.left, rear: pack.right };
    return { lead: pack.right, rear: pack.left };
  }

  tickGuard(pack, dt, now) {
    this.status = 'Hold guard — 2 seconds';
    if (!pack.shouldersIn || !pack.left || !pack.right || !vis(pack.n)) {
      this.guardStarted = 0;
      this.calib.samples = [];
      return;
    }
    if (this.motion(pack) > C.calibration.guardMaxSpeed) {
      this.guardStarted = 0;
      this.calib.samples = [];
      this.status = 'Too much movement — freeze in guard';
      return;
    }
    if (!this.guardStarted) this.guardStarted = now;
    this.calib.samples.push({
      sw: pack.shoulderW,
      arm: (dist(pack.left.s, pack.left.w) + dist(pack.right.s, pack.right.w)) / 2,
      nose: { x: pack.n.x, y: pack.n.y }
    });
    const held = now - this.guardStarted;
    this.status = `Hold guard… ${Math.max(0, (C.calibration.guardHoldMs - held) / 1000).toFixed(1)}s`;
    if (held >= C.calibration.guardHoldMs && this.calib.samples.length > 8) this.finishGuard();
  }

  finishGuard() {
    const s = this.calib.samples;
    const avg = (key) => s.reduce((a, r) => a + (typeof r[key] === 'number' ? r[key] : 0), 0) / s.length;
    this.calib.shoulderWidth = avg('sw');
    this.calib.armLength = avg('arm');
    this.calib.nose = {
      x: s.reduce((a, r) => a + r.nose.x, 0) / s.length,
      y: s.reduce((a, r) => a + r.nose.y, 0) / s.length
    };
    this.phase = 'jab';
    this.status = 'Throw one jab';
  }

  tickCalibJab(pack, dt, now) {
    this.status = 'Throw one jab with your lead hand';
    const { lead } = this.arms(pack);
    if (!lead) return;
    const hit = this.punchSignal(lead, 'lead', dt, now);
    if (hit) {
      this.calib.armLength = Math.max(this.calib.armLength, dist(lead.s, lead.w));
      this.phase = 'live';
      this.els.cal?.classList.remove('show');
      this.status = 'Live — jab / cross / body / slip';
      this.input.press('jab');
      this.stats.camera.lastAction = 'jab';
    }
  }

  tickLive(pack, dt, now) {
    this.status = this.stance === 'orthodox' ? 'Live · Orthodox' : 'Live · Southpaw';
    if (!this.calib) return;
    this.detectSlip(pack, now);
    const { lead, rear } = this.arms(pack);
    if (lead) {
      const kind = this.punchSignal(lead, 'lead', dt, now);
      if (kind) {
        this.input.press(kind === 'body' ? 'body' : 'jab');
        this.stats.camera.lastAction = kind === 'body' ? 'body' : 'jab';
      }
    }
    if (rear) {
      const kind = this.punchSignal(rear, 'rear', dt, now);
      if (kind) {
        this.input.press(kind === 'body' ? 'body' : 'cross');
        this.stats.camera.lastAction = kind === 'body' ? 'body' : 'cross';
      }
    }
  }

  punchSignal(arm, which, dt, now) {
    if (now < this.cool[which]) return null;
    const reach = dist(arm.s, arm.w);
    const armLen = this.calib?.armLength || 0.35;
    const reachN = reach / Math.max(armLen, 0.05);
    const angle = elbowDeg(arm.s, arm.e, arm.w);
    let extendVel = 0;
    if (this.prev) {
      const prevArm = which === 'lead'
        ? (this.stance === 'orthodox' ? this.prev.left : this.prev.right)
        : (this.stance === 'orthodox' ? this.prev.right : this.prev.left);
      if (prevArm) extendVel = (reach - dist(prevArm.s, prevArm.w)) / Math.max(dt, 1 / 60);
    }
    if (reachN < C.punch.retractReset) this.armOut[which] = false;
    if (this.armOut[which]) return null;
    const firing =
      extendVel > C.punch.extendSpeed &&
      angle >= C.punch.elbowStraightDeg &&
      reachN >= C.punch.minReach;
    if (!firing) return null;
    this.armOut[which] = true;
    this.cool[which] = now + C.cooldownMs[which];
    return arm.w.y > arm.s.y + 0.02 ? 'body' : 'punch';
  }

  detectSlip(pack, now) {
    if (!vis(pack.n) || !this.calib?.nose || !this.calib.shoulderWidth) return;
    if (now < this.cool.slip) return;
    const dx = Math.abs(pack.n.x - this.calib.nose.x);
    const away = dx > this.calib.shoulderWidth * C.slip.sideways;
    if (away && !this.slipLatched) {
      this.slipLatched = true;
      this.slipAwayAt = now;
    }
    if (this.slipLatched && !away) {
      const held = now - this.slipAwayAt;
      this.slipLatched = false;
      if (held >= C.slip.minAwayMs && held <= C.slip.returnMs) {
        this.cool.slip = now + C.cooldownMs.slip;
        this.input.press('slip');
        this.stats.camera.lastAction = 'slip';
      }
    }
    if (this.slipLatched && now - this.slipAwayAt > C.slip.returnMs) this.slipLatched = false;
  }

  motion(pack) {
    if (!this.prev || !pack.midS || !this.prev.midS) return 0;
    return dist(pack.midS, this.prev.midS) / (1 / C.fps);
  }

  draw(pose, pack) {
    const canvas = this.els.canvas;
    if (!canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    const pt = (i) => ({ x: pose[i].x * w, y: pose[i].y * h });
    const line = (a, b, color) => {
      if (!vis(pose[a]) || !vis(pose[b])) return;
      const p = pt(a);
      const q = pt(b);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    };
    line(LM.lShoulder, LM.rShoulder, '#f6e05e');
    line(LM.lShoulder, LM.lElbow, '#63b3ed');
    line(LM.lElbow, LM.lWrist, '#63b3ed');
    line(LM.rShoulder, LM.rElbow, '#fc8181');
    line(LM.rElbow, LM.rWrist, '#fc8181');
    line(LM.lShoulder, LM.nose, '#c6f6d5');
    line(LM.rShoulder, LM.nose, '#c6f6d5');
    [LM.nose, LM.lShoulder, LM.rShoulder, LM.lElbow, LM.rElbow, LM.lWrist, LM.rWrist].forEach((i) => {
      if (!vis(pose[i])) return;
      const p = pt(i);
      ctx.fillStyle = pack.shouldersIn ? '#f7fafc' : '#e53e3e';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  clearCanvas() {
    const canvas = this.els.canvas;
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }

  paintHud() {
    if (this.els.status) this.els.status.textContent = this.status;
    if (this.els.cal) this.els.cal.textContent = this.status;
    if (this.els.warn) {
      this.els.warn.textContent = this.warning;
      this.els.warn.classList.toggle('show', Boolean(this.warning));
    }
  }
}
