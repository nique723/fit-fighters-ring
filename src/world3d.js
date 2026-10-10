import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CONFIG } from './config.js';

/**
 * Live 3D layer: arena backdrop + skinned fighters, drawn under the Phaser HUD canvas.
 * The 3D camera is the same camera that rendered the arena in Blender; Phaser's
 * zoom/follow camera is reproduced with setViewOffset so feet stay locked to the canvas.
 */
const W = 960, H = 540;
const FRONT_PPM = 146.244;      // px per meter on the front lane (see stage.js)
const DEPTH_Y0 = -2.4, DEPTH_SPAN = 3.6;

export function toWorld(x, z) {
  // logic (x px, z 0..1) -> three.js meters. Blender Y (depth) maps to -Z.
  return new THREE.Vector3((x - W / 2) / FRONT_PPM, 0, -(DEPTH_Y0 + z * DEPTH_SPAN));
}

export class World3D {
  constructor(stage, phaserCanvasGetter) {
    this.getPhaserCanvas = phaserCanvasGetter;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = false;
    const el = this.renderer.domElement;
    el.id = 'world3d';
    el.style.position = 'absolute';
    stage.insertBefore(el, stage.firstChild);

    // backdrop (pre-rendered arena), cropped to match Phaser's camera
    this.bgScene = new THREE.Scene();
    this.bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.bgTex = new THREE.TextureLoader().load(CONFIG.world3d.arena);
    this.bgTex.colorSpace = THREE.SRGBColorSpace;
    this.bgTex.minFilter = THREE.LinearMipmapLinearFilter;
    this.bgTex.anisotropy = 4;
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: this.bgTex, toneMapped: false, depthWrite: false }));
    this.bgScene.add(bg);

    // scene + camera matching the Blender arena camera
    this.scene = new THREE.Scene();
    const c = CONFIG.world3d.camera;
    const vfov = 2 * Math.atan(Math.tan(Math.atan(18 / c.focal)) * (H / W)) * 180 / Math.PI;
    this.camera = new THREE.PerspectiveCamera(vfov, W / H, 0.1, 100);
    this.camera.position.set(0, c.h, -c.y);
    this.camera.rotation.set(-c.pitch * Math.PI / 180, 0, 0);

    this.scene.add(new THREE.HemisphereLight(0x9aa8d8, 0x2a1d16, 0.9));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.6);
    key.position.set(-1.5, 8, 2.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -4.5, right: 4.5, top: 4.5, bottom: -4.5, near: 1, far: 20 });
    key.shadow.bias = -0.0006;
    key.shadow.radius = 4;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffa860, 1.6);
    rim.position.set(3, 3, -4);
    this.scene.add(rim);
    const fill = new THREE.DirectionalLight(0x8fb4ff, 0.7);
    fill.position.set(-4, 2, 3);
    this.scene.add(fill);
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.ShadowMaterial({ opacity: 0.42 }));
    catcher.rotation.x = -Math.PI / 2;
    catcher.position.y = 0.002;
    catcher.receiveShadow = true;
    this.scene.add(catcher);

    this.fighters = [];
    this.loader = new GLTFLoader();

    // crowd flashbulbs live in the backdrop pass so fighters stay in front of them
    const c2 = document.createElement('canvas');
    c2.width = c2.height = 64;
    const g = c2.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.12, 'rgba(255,255,255,0.9)');
    grd.addColorStop(0.35, 'rgba(200,225,255,0.25)');
    grd.addColorStop(1, 'rgba(200,225,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    this.bulbTex = new THREE.CanvasTexture(c2);
    this.bulbs = [];
  }

  flash(x, y, r) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: this.bulbTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.userData = { x, y, r: r * 9, life: 110 };
    this.bgScene.add(m);
    this.bulbs.push(m);
  }

  updateBulbs(dt, view, x0, y0) {
    for (let i = this.bulbs.length - 1; i >= 0; i--) {
      const b = this.bulbs[i];
      b.userData.life -= dt;
      if (b.userData.life <= 0) {
        this.bgScene.remove(b); b.geometry.dispose(); b.material.dispose();
        this.bulbs.splice(i, 1);
        continue;
      }
      const u = b.userData;
      b.position.set(((u.x - x0) / view.width) * 2 - 1, 1 - ((u.y - y0) / view.height) * 2, 0);
      b.scale.set((u.r / view.width) * 2, (u.r / view.height) * 2, 1);
      b.material.opacity = Math.min(1, u.life / 60);
    }
  }

  addFighter(spec) {
    const f = new Fighter3D(spec);
    this.scene.add(f.root);
    this.loader.load(spec.url, (gltf) => f.attach(gltf), undefined, (e) => console.error('fighter load failed', spec.url, e));
    this.fighters.push(f);
    return f;
  }

  syncSize() {
    const pc = this.getPhaserCanvas();
    if (!pc) return;
    const el = this.renderer.domElement;
    const r = pc.getBoundingClientRect();
    const sr = el.parentElement.getBoundingClientRect();
    const key = [r.left - sr.left, r.top - sr.top, r.width, r.height].map(Math.round).join(',');
    if (key === this.sizeKey) return;
    this.sizeKey = key;
    el.style.left = Math.round(r.left - sr.left) + 'px';
    el.style.top = Math.round(r.top - sr.top) + 'px';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(Math.round(r.width), Math.round(r.height), true);
  }

  /** view = Phaser camera worldView {x,y,width,height} in 960x540 units. */
  render(dt, view, shakeX = 0, shakeY = 0) {
    this.syncSize();
    for (const f of this.fighters) f.update(dt);
    const x = view.x - shakeX, y = view.y - shakeY;
    this.bgTex.repeat.set(view.width / W, view.height / H);
    this.bgTex.offset.set(x / W, 1 - (y + view.height) / H);
    this.camera.setViewOffset(W, H, x, y, view.width, view.height);
    this.updateBulbs(dt || 16, view, x, y);
    this.renderer.clear();
    this.renderer.render(this.bgScene, this.bgCam);
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.camera);
  }
}

/**
 * Mocap clips (Meshy/Mixamo) often travel: the hips walk off across the floor.
 * Game logic owns position, so lock the hips' horizontal travel to its first frame.
 * Small in-place shifts (a lean into a punch) are kept.
 */
function inPlace(clip) {
  for (const t of clip.tracks) {
    if (!/(hips|pelvis|root)[^.]*\.position$/i.test(t.name)) continue;
    const v = t.values;
    const n = v.length / 3;
    if (n < 2) continue;
    const dx = v[(n - 1) * 3] - v[0], dz = v[(n - 1) * 3 + 2] - v[2];
    if (Math.hypot(dx, dz) < 0.25) continue;
    for (let i = 0; i < n; i++) { v[i * 3] = v[0]; v[i * 3 + 2] = v[2]; }
  }
}

const ONCE = new Set(['jab', 'cross', 'body', 'upper', 'slip', 'duck', 'hithead', 'hitbody', 'knockdown']);

export class Fighter3D {
  constructor(spec) {
    this.spec = spec;
    this.root = new THREE.Group();
    this.yaw = spec.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.current = null;
    this.actions = {};
    this.mixer = null;
    this.flash = 0;
  }

  attach(gltf) {
    const model = gltf.scene;
    model.scale.setScalar(this.spec.scale || 1);
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
        if (o.material) o.material.envMapIntensity = 1;
      }
    });
    this.root.add(model);
    this.model = model;
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) {
      inPlace(clip);
      this.actions[clip.name] = this.mixer.clipAction(clip);
    }
    const pending = this.current;
    this.current = null;
    this.play(pending ? pending.name : 'idle', pending ? pending.opts : {});
  }

  has(name) { return !!this.actions[name]; }

  play(name, opts = {}) {
    if (!this.mixer) { this.current = { name, opts }; return; }
    const next = this.actions[name] || this.actions.idle;
    if (!next) return;
    const prev = this.current && this.current.action;
    if (prev === next && !opts.restart) {
      if (opts.timeScale !== undefined) next.timeScale = opts.timeScale;
      return;
    }
    next.reset();
    next.enabled = true;
    next.setLoop(ONCE.has(name) ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = ONCE.has(name);
    next.timeScale = opts.timeScale ?? 1;
    next.setEffectiveWeight(1);
    if (prev) next.crossFadeFrom(prev, opts.fade ?? 0.12, false);
    next.play();
    this.current = { name, action: next, opts };
  }

  clipDuration(name) { return this.actions[name] ? this.actions[name].getClip().duration : 0.4; }

  place(pos, facing) {
    this.root.position.copy(pos);
    const target = (facing > 0 ? Math.PI / 2 : -Math.PI / 2) + (facing > 0 ? -1 : 1) * (this.spec.yawToCamera || 0);
    let d = target - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * 0.25;
    this.root.rotation.y = this.yaw;
  }

  update(dt) { if (this.mixer) this.mixer.update(dt / 1000); }
}
