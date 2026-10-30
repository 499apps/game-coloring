/**
 * The 3D view: a glossy easel in a cozy playroom. The picture is a canvas texture on a plane;
 * painting raycasts the pointer to picture coordinates. The camera can orbit and zoom a little
 * and always snaps back home with one button.
 */
import * as THREE from 'three';
import { ParticleSystem } from './kit/particles';
import { createRng, type Rng } from './kit/prng';
import type { KitRenderer } from './kit/renderer';
import {
  addStudioLights,
  candyMaterial,
  clamp,
  easeOutBack,
  easeOutCubic,
  makeRoom,
  roundedBox,
} from './kit/scene-helpers';
import { funColors, mixHex, palette } from './kit/theme';
import type { ArtPoint, ArtView, CursorMode, ViewInsets } from './view';
import { fitDistance, freeArea, type FitPoint } from './game/fit';

/** Picture size in world units. */
const ART = 4;
const FRAME = ART + 0.5;
/** The board leans back a little, like a real easel. */
const TILT = 0.1;
const CENTER = new THREE.Vector3(0, 2.95, 0);
const ART_Z = 0.085;
const RIGHT = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, Math.cos(TILT), -Math.sin(TILT));
const NORMAL = new THREE.Vector3(0, Math.sin(TILT), Math.cos(TILT));
/** The ledge is only a little wider than the frame, so the easel stays compact on phones. */
const LEDGE_W = FRAME + 0.36;
/** Space kept around the easel outline when the camera frames it (world units). */
const FIT_MARGIN = 0.1;

/**
 * Picture lighting. A low diffuse part plus a self-lit part keeps white paper just under the
 * bloom threshold, so the art reads clearly on every screen and paints keep their colour.
 */
export const CANVAS_DIFFUSE = 0.34;
export const CANVAS_GLOW = 0.26;
/** Bloom for this game: high threshold so only the fairy lights and sparkles glow. */
export const COLORING_BLOOM = { strength: 0.45, radius: 0.5, threshold: 1.25 };

const YAW_MAX = 0.42;
const PITCH_MIN = -0.12;
const PITCH_MAX = 0.32;
const ZOOM_MAX = 3;

interface CameraState {
  yaw: number;
  pitch: number;
  zoom: number;
  panX: number;
  panY: number;
}

interface Ripple {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  t: number;
}

function rod(a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material): THREE.Mesh {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.85, radius, len, 18), mat);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Outline of the easel (frame, clamp, ledge, pot) in the home camera basis: x right, y up,
 * z toward the camera, relative to the camera target. The camera fits all of it in the free area.
 */
function easelOutline(): FitPoint[] {
  const out: FitPoint[] = [];
  const target = CENTER.clone().addScaledVector(NORMAL, ART_Z);
  const r = new THREE.Vector3();
  // Board space maps straight onto the camera basis (the board leans with the camera).
  const board = (x: number, y: number, z: number) => out.push({ x, y, z: z - ART_Z });
  const world = (x: number, y: number, z: number) => {
    r.set(x, y, z).sub(target);
    out.push({ x: r.dot(RIGHT), y: r.dot(UP), z: r.dot(NORMAL) });
  };
  const f = (FRAME + 0.22) / 2;
  for (const sx of [-1, 1]) {
    board(sx * f, f, 0.02);
    board(sx * f, -f, 0.02);
    board(sx * 0.45, FRAME / 2 + 0.35, 0.19);
    world((sx * LEDGE_W) / 2, 0.42, 0.75);
    world((sx * LEDGE_W) / 2, 0.7, 0.76);
  }
  world(1.85 + 0.27, 0.95, 0.42 + 0.27);
  return out;
}

const OUTLINE = easelOutline();

function makeSkyTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 168;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, '#272766');
    grad.addColorStop(0.62, '#5d4c9c');
    grad.addColorStop(1, '#f2a7c9');
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    const rng = createRng('playroom-sky');
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 26; i++) {
      const s = rng.chance(0.2) ? 2 : 1;
      g.fillRect(rng.int(4, 124), rng.int(4, 100), s, s);
    }
    g.fillStyle = '#fff3c4';
    g.beginPath();
    g.arc(90, 42, 14, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#272766';
    g.beginPath();
    g.arc(97, 37, 12, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface EaselOptions {
  reducedMotion: boolean;
}

export class EaselView implements ArtView {
  readonly element: HTMLElement;
  private readonly kit: KitRenderer;
  private readonly rng: Rng;
  private readonly reduced: boolean;
  private readonly board = new THREE.Group();
  private readonly art: THREE.Mesh;
  private readonly artTex: THREE.CanvasTexture;
  private readonly raycaster = new THREE.Raycaster();
  private readonly particles: ParticleSystem;
  private readonly ripples: Ripple[] = [];
  private readonly brush = new THREE.Group();
  private readonly brushTip: THREE.MeshPhysicalMaterial;
  private readonly focusRing: THREE.Mesh;
  private readonly pot = new THREE.Group();
  private readonly potPaint: THREE.MeshPhysicalMaterial;
  private readonly fairyMat: THREE.MeshBasicMaterial;
  private readonly goal: CameraState = { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0 };
  private readonly cur: CameraState = { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0 };
  private readonly target = new THREE.Vector3();
  private insets: ViewInsets = { left: 0, right: 0, top: 0, bottom: 0 };
  private fitDist = 10;
  private w = 1;
  private h = 1;
  private cursorMode: CursorMode = 'hidden';
  private readonly cursorGoal = new THREE.Vector3();
  private cursorSnap = true;
  private flipT = 1;
  private potBounce = 0;
  private celebrateT = 0;
  private time = 0;
  private rainbowTip = false;
  private paintHex = '';

  constructor(kit: KitRenderer, element: HTMLElement, rng: Rng, artCanvas: HTMLCanvasElement, o: EaselOptions) {
    this.kit = kit;
    this.element = element;
    this.rng = rng;
    this.reduced = o.reducedMotion;
    const scene = kit.scene;

    const lights = addStudioLights(scene, { shadowArea: 7, shadowMapSize: kit.settings.shadowMapSize });
    lights.key.castShadow = kit.settings.shadows;
    kit.shadowLights.push(lights.key);
    makeRoom(scene, {
      floorColor: mixHex(palette.plum, palette.tangerine, 0.28),
      wallColor: mixHex(palette.night, palette.lavender, 0.3),
      rugColor: mixHex(palette.mint, palette.plum, 0.45),
      size: 40,
    });

    this.buildRoomDetails(scene);
    this.buildEasel(scene);

    // The picture.
    this.artTex = new THREE.CanvasTexture(artCanvas);
    this.artTex.colorSpace = THREE.SRGBColorSpace;
    this.artTex.anisotropy = Math.min(8, kit.renderer.capabilities.getMaxAnisotropy());
    const artMat = new THREE.MeshPhysicalMaterial({
      map: this.artTex,
      emissiveMap: this.artTex,
      emissive: new THREE.Color(1, 1, 1),
      emissiveIntensity: CANVAS_GLOW,
      color: new THREE.Color(CANVAS_DIFFUSE, CANVAS_DIFFUSE, CANVAS_DIFFUSE),
      roughness: 0.62,
      metalness: 0,
      clearcoat: 0.25,
      clearcoatRoughness: 0.4,
      envMapIntensity: 0.15,
    });
    this.art = new THREE.Mesh(new THREE.PlaneGeometry(ART, ART), artMat);
    this.art.position.z = ART_Z;
    this.art.receiveShadow = true;
    this.board.add(this.art);

    // Ripples for fills.
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), mat);
      mesh.visible = false;
      mesh.position.z = ART_Z + 0.012;
      this.board.add(mesh);
      this.ripples.push({ mesh, mat, t: 1 });
    }

    // Brush cursor: the tip sits at the group origin.
    this.brushTip = candyMaterial(palette.coral, { emissive: palette.coral, emissiveIntensity: 0.25, roughness: 0.4 });
    const model = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 1.1, 16), candyMaterial(palette.sky));
    handle.position.y = 0.95;
    handle.castShadow = true;
    const ferrule = new THREE.Mesh(
      new THREE.CylinderGeometry(0.066, 0.06, 0.2, 16),
      new THREE.MeshPhysicalMaterial({ color: '#d9d9e3', metalness: 1, roughness: 0.25 }),
    );
    ferrule.position.y = 0.33;
    ferrule.castShadow = true;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.066, 0.24, 16), this.brushTip);
    tip.rotation.x = Math.PI;
    tip.position.y = 0.12;
    tip.castShadow = true;
    model.add(handle, ferrule, tip);
    model.rotation.set(0.95, 0, -0.35);
    this.brush.add(model);
    this.brush.visible = false;
    this.board.add(this.brush);

    this.focusRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.032, 10, 40),
      candyMaterial(palette.lemon, { emissive: palette.lemon, emissiveIntensity: 1.3 }),
    );
    this.focusRing.visible = false;
    this.focusRing.position.z = ART_Z + 0.04;
    this.board.add(this.focusRing);

    this.board.position.copy(CENTER);
    this.board.rotation.x = -TILT;
    scene.add(this.board);

    // Paint pot on the ledge shows the current paint.
    this.potPaint = candyMaterial(palette.coral, { emissive: palette.coral, emissiveIntensity: 0.12, roughness: 0.15 });
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.22, 0.34, 28), candyMaterial(palette.white, { roughness: 0.25 }));
    cup.castShadow = true;
    const paintTop = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.05, 28), this.potPaint);
    paintTop.position.y = 0.15;
    this.pot.add(cup, paintTop);
    this.pot.position.set(1.85, 0.75, 0.42);
    scene.add(this.pot);

    this.fairyMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.2) });
    this.buildFairyLights(scene);

    this.particles = new ParticleSystem(rng, { max: 220, particleScale: kit.settings.particleScale, gravity: 6 });
    scene.add(this.particles.mesh);
    this.applyCamera();
  }

  private buildEasel(scene: THREE.Scene): void {
    const wood = candyMaterial(mixHex(palette.tangerine, '#b8703a', 0.45), { roughness: 0.42, clearcoat: 0.7 });
    for (const side of [-1, 1]) {
      const foot = new THREE.Vector3(2.05 * side, 0, -0.05);
      const top = new THREE.Vector3(1.35 * side, 5.75, -0.62);
      scene.add(rod(foot, top, 0.1, wood));
      for (const p of [foot, top]) {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), wood);
        cap.position.copy(p);
        cap.castShadow = true;
        scene.add(cap);
      }
    }
    scene.add(rod(new THREE.Vector3(0, 0, -1.9), new THREE.Vector3(0, 5.6, -0.72), 0.09, wood));
    const bar = new THREE.Mesh(roundedBox(2.9, 0.2, 0.2, 0.08), wood);
    bar.position.set(0, 5.55, -0.62);
    bar.castShadow = true;
    scene.add(bar);

    // Board: a coloured outer frame, a warm inner frame and the picture. The frame stays under
    // the bloom threshold (no halo over the paper edge): a warm mid-tone instead of near-white
    // cream, softer clearcoat and weaker reflections. It also gives the white paper a crisp edge.
    const outerMat = candyMaterial(mixHex(palette.coral, palette.bubblegum, 0.4), {
      roughness: 0.4,
      clearcoat: 0.7,
      clearcoatRoughness: 0.28,
    });
    outerMat.envMapIntensity = 0.5;
    const outer = new THREE.Mesh(roundedBox(FRAME + 0.22, FRAME + 0.22, 0.16, 0.12), outerMat);
    outer.position.z = -0.06;
    outer.castShadow = true;
    outer.receiveShadow = true;
    const innerMat = candyMaterial(mixHex(palette.cream, palette.tangerine, 0.5), {
      roughness: 0.5,
      clearcoat: 0.4,
      clearcoatRoughness: 0.35,
      sheen: 0,
    });
    innerMat.envMapIntensity = 0.45;
    const inner = new THREE.Mesh(roundedBox(FRAME, FRAME, 0.14, 0.1), innerMat);
    inner.receiveShadow = true;
    const clampBlock = new THREE.Mesh(roundedBox(0.9, 0.26, 0.34, 0.09), wood);
    clampBlock.position.set(0, FRAME / 2 + 0.22, 0.02);
    clampBlock.castShadow = true;
    this.board.add(outer, inner, clampBlock);

    const ledge = new THREE.Mesh(roundedBox(LEDGE_W, 0.16, 0.66, 0.06), wood);
    ledge.position.set(0, 0.5, 0.42);
    ledge.castShadow = true;
    ledge.receiveShadow = true;
    const lip = new THREE.Mesh(roundedBox(LEDGE_W, 0.16, 0.08, 0.035), wood);
    lip.position.set(0, 0.62, 0.72);
    lip.castShadow = true;
    scene.add(ledge, lip);

    // Two little jars and a resting crayon on the ledge.
    [palette.sky, palette.lime].forEach((c, i) => {
      const jar = new THREE.Group();
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.26, 24), candyMaterial(palette.white, { roughness: 0.2 }));
      glass.castShadow = true;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.04, 24), candyMaterial(c, { emissive: c, emissiveIntensity: 0.1 }));
      top.position.y = 0.12;
      jar.add(glass, top);
      jar.position.set(-1.98 + i * 0.4, 0.71, 0.45);
      scene.add(jar);
    });
    const crayon = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.8, 18), candyMaterial(palette.lavender));
    const nib = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 18), candyMaterial(palette.lavender));
    nib.position.y = 0.49;
    crayon.add(body, nib);
    crayon.rotation.set(0, 0.25, Math.PI / 2);
    crayon.position.set(0.6, 0.65, 0.5);
    body.castShadow = true;
    scene.add(crayon);
  }

  private buildRoomDetails(scene: THREE.Scene): void {
    // A night window on the back wall.
    const frame = new THREE.Mesh(roundedBox(3.7, 4.7, 0.24, 0.14), candyMaterial(palette.cream, { roughness: 0.4 }));
    frame.position.set(-6.4, 6.4, -9.95);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4.2), new THREE.MeshBasicMaterial({ map: makeSkyTexture() }));
    glass.position.set(-6.4, 6.4, -9.8);
    const barMat = candyMaterial(palette.cream, { roughness: 0.4 });
    const vbar = new THREE.Mesh(roundedBox(0.12, 4.2, 0.1, 0.04), barMat);
    vbar.position.set(-6.4, 6.4, -9.74);
    const hbar = new THREE.Mesh(roundedBox(3.2, 0.12, 0.1, 0.04), barMat);
    hbar.position.set(-6.4, 6.6, -9.74);
    scene.add(frame, glass, vbar, hbar);

    // Toys on the floor.
    const block = (x: number, y: number, z: number, s: number, color: string, rot: number) => {
      const m = new THREE.Mesh(roundedBox(s, s, s, s * 0.14), candyMaterial(color));
      m.position.set(x, y + s / 2, z);
      m.rotation.y = rot;
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
    };
    block(-3.6, 0, 1.3, 0.85, palette.sky, 0.35);
    block(-3.55, 0.85, 1.3, 0.6, palette.lemon, -0.25);
    block(-2.6, 0, 2.3, 0.6, palette.coral, 0.8);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.55, 36, 26), candyMaterial(palette.mint));
    ball.position.set(3.4, 0.55, 1.6);
    ball.castShadow = true;
    scene.add(ball);
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.555, 0.05, 10, 40), candyMaterial(palette.white));
    stripe.position.copy(ball.position);
    stripe.rotation.set(0.6, 0.3, 0);
    scene.add(stripe);
  }

  private buildFairyLights(scene: THREE.Scene): void {
    const n = 22;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const x = -9.5 + (i * 19) / (n - 1);
      const sag = Math.abs(Math.sin((i / (n - 1)) * Math.PI * 3)) * 0.75;
      pts.push(new THREE.Vector3(x, 9.2 - sag, -9.78));
    }
    const wire = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.025, 6),
      new THREE.MeshStandardMaterial({ color: '#2a2440', roughness: 0.8 }),
    );
    scene.add(wire);
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 12, 10), this.fairyMat, n);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    pts.forEach((p, i) => {
      m.makeTranslation(p.x, p.y - 0.14, p.z + 0.06);
      bulbs.setMatrixAt(i, m);
      bulbs.setColorAt(i, c.set(funColors[i % funColors.length] as string));
    });
    bulbs.instanceMatrix.needsUpdate = true;
    if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
    scene.add(bulbs);
  }

  get centered(): boolean {
    const g = this.goal;
    return g.zoom === 1 && g.yaw === 0 && g.pitch === 0 && g.panX === 0 && g.panY === 0;
  }

  get zoom(): number {
    return this.cur.zoom;
  }

  private applyCamera(): void {
    const cam = this.kit.camera;
    const c = this.cur;
    const pitch = TILT + c.pitch;
    const dir = new THREE.Vector3(
      Math.sin(c.yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(c.yaw) * Math.cos(pitch),
    );
    this.target.copy(CENTER).addScaledVector(NORMAL, ART_Z).addScaledVector(RIGHT, c.panX).addScaledVector(UP, c.panY);
    cam.position.copy(this.target).addScaledVector(dir, this.fitDist / c.zoom);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.target);
    cam.updateMatrixWorld();
  }

  setInsets(insets: ViewInsets): void {
    this.insets = { ...insets };
    if (this.w > 1 && this.h > 1) this.resize(this.w, this.h);
  }

  resize(width: number, height: number): void {
    this.w = Math.max(1, width);
    this.h = Math.max(1, height);
    const cam = this.kit.camera;
    // Fit the whole easel (not only the picture) right of the tray and inside the safe areas.
    const area = { width: this.w, height: this.h, insets: this.insets, fov: cam.fov };
    this.fitDist = fitDistance(OUTLINE, area, FIT_MARGIN);
    const { dx, dy } = freeArea(area);
    cam.setViewOffset(this.w, this.h, -dx, -dy, this.w, this.h);
    cam.updateProjectionMatrix();
    this.applyCamera();
  }

  hit(x: number, y: number): ArtPoint | null {
    const ndc = new THREE.Vector2((x / this.w) * 2 - 1, -(y / this.h) * 2 + 1);
    this.board.updateMatrixWorld(true);
    this.raycaster.setFromCamera(ndc, this.kit.camera);
    const uv = this.raycaster.intersectObject(this.art, false)[0]?.uv;
    if (!uv) return null;
    return { u: clamp(uv.x, 0, 1), v: clamp(1 - uv.y, 0, 1) };
  }

  private artLocal(p: ArtPoint, z = 0): THREE.Vector3 {
    return new THREE.Vector3((p.u - 0.5) * ART, (0.5 - p.v) * ART, z);
  }

  project(p: ArtPoint): { x: number; y: number } | null {
    this.board.updateMatrixWorld(true);
    const v = this.art.localToWorld(this.artLocal(p)).project(this.kit.camera);
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) return null;
    return { x: ((v.x + 1) / 2) * this.w, y: ((1 - v.y) / 2) * this.h };
  }

  orbitBy(dx: number, dy: number): void {
    this.goal.yaw = clamp(this.goal.yaw - dx * 0.005, -YAW_MAX, YAW_MAX);
    this.goal.pitch = clamp(this.goal.pitch + dy * 0.004, PITCH_MIN, PITCH_MAX);
  }

  private clampPan(): void {
    const lim = (ART / 2) * (1 - 1 / this.goal.zoom);
    this.goal.panX = clamp(this.goal.panX, -lim, lim);
    this.goal.panY = clamp(this.goal.panY, -lim, lim);
  }

  panBy(dx: number, dy: number): void {
    if (this.goal.zoom <= 1.001) {
      this.orbitBy(dx, dy);
      return;
    }
    const t = Math.tan(THREE.MathUtils.degToRad(this.kit.camera.fov) / 2);
    const upp = (2 * (this.fitDist / this.cur.zoom) * t) / this.h;
    this.goal.panX -= dx * upp;
    this.goal.panY += dy * upp;
    this.clampPan();
  }

  zoomAt(factor: number, x: number, y: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const old = this.goal.zoom;
    const next = clamp(old * factor, 1, ZOOM_MAX);
    if (next === old) return;
    const p = this.hit(x, y);
    if (p) {
      const px = (p.u - 0.5) * ART;
      const py = (0.5 - p.v) * ART;
      this.goal.panX = px - (px - this.goal.panX) * (old / next);
      this.goal.panY = py - (py - this.goal.panY) * (old / next);
    }
    this.goal.zoom = next;
    if (next === 1) {
      this.goal.panX = 0;
      this.goal.panY = 0;
    }
    this.clampPan();
  }

  recenter(): void {
    this.goal.yaw = 0;
    this.goal.pitch = 0;
    this.goal.zoom = 1;
    this.goal.panX = 0;
    this.goal.panY = 0;
  }

  cursor(p: ArtPoint | null, mode: CursorMode): void {
    if (!p || mode === 'hidden') {
      this.cursorMode = 'hidden';
      this.brush.visible = false;
      this.cursorSnap = true;
      return;
    }
    this.cursorMode = mode;
    this.cursorGoal.copy(this.artLocal(p, ART_Z + (mode === 'hover' ? 0.16 : 0.015)));
    if (this.cursorSnap) {
      this.brush.position.copy(this.cursorGoal);
      this.cursorSnap = false;
    }
    this.brush.visible = true;
  }

  setFocus(p: ArtPoint | null): void {
    if (!p) {
      this.focusRing.visible = false;
      return;
    }
    const v = this.artLocal(p, ART_Z + 0.04);
    this.focusRing.position.copy(v);
    this.focusRing.visible = true;
  }

  setPaint(hex: string, tool: string): void {
    const tip = tool === 'eraser' ? '#ffc2dc' : hex;
    this.brushTip.color.set(tip);
    this.brushTip.emissive.set(tip);
    this.brushTip.emissiveIntensity = tool === 'sparkle' ? 0.9 : 0.25;
    this.rainbowTip = tool === 'rainbow';
    if (hex !== this.paintHex) {
      if (this.paintHex !== '') this.potBounce = 1;
      this.paintHex = hex;
      this.potPaint.color.set(hex);
      this.potPaint.emissive.set(hex);
    }
  }

  splat(p: ArtPoint, hex: string): void {
    const world = this.art.localToWorld(this.artLocal(p, 0.06));
    this.particles.burst({ position: world, color: hex, count: this.reduced ? 6 : 22, speed: 2.2, life: 0.6, size: 0.05 });
    if (this.reduced) return;
    const r = this.ripples.find((x) => x.t >= 1) ?? this.ripples[0];
    if (!r) return;
    r.t = 0;
    r.mat.color.set(hex);
    r.mesh.position.x = (p.u - 0.5) * ART;
    r.mesh.position.y = (0.5 - p.v) * ART;
    r.mesh.scale.setScalar(0.02);
    r.mesh.visible = true;
  }

  celebrate(): void {
    for (let k = 0; k < 5; k++) {
      const pos = this.art.localToWorld(new THREE.Vector3(-1.6 + k * 0.8, 1.7, 0.3));
      this.particles.burst({
        position: pos,
        color: this.rng.pick(funColors),
        count: this.reduced ? 4 : 18,
        speed: 3.6,
        life: 1.1,
        size: 0.06,
      });
    }
    if (!this.reduced) this.celebrateT = 1;
  }

  flip(): void {
    if (!this.reduced) this.flipT = 0;
  }

  artChanged(): void {
    this.artTex.needsUpdate = true;
  }

  update(dt: number, _elapsed: number): void {
    this.time += dt;
    const motion = this.reduced ? 0 : 1;
    // dt = 0: first frame or a frozen test frame. Show the end state at once.
    const k = this.reduced || dt === 0 ? 1 : 1 - Math.exp(-9 * dt);
    const c = this.cur;
    const g = this.goal;
    c.yaw += (g.yaw - c.yaw) * k;
    c.pitch += (g.pitch - c.pitch) * k;
    c.zoom += (g.zoom - c.zoom) * k;
    c.panX += (g.panX - c.panX) * k;
    c.panY += (g.panY - c.panY) * k;
    this.applyCamera();

    if (dt === 0) this.flipT = 1;
    if (this.flipT < 1) {
      this.flipT = Math.min(1, this.flipT + dt / 0.6);
      const e = easeOutBack(this.flipT);
      this.board.rotation.y = (1 - e) * 1.2;
      this.board.scale.setScalar(0.86 + 0.14 * Math.min(1.05, e));
    } else {
      this.board.rotation.y = 0;
      this.board.scale.setScalar(1);
    }
    this.celebrateT = Math.max(0, this.celebrateT - dt * 1.4);
    this.board.rotation.z = Math.sin(this.celebrateT * 20) * 0.025 * this.celebrateT;

    for (const r of this.ripples) {
      if (r.t >= 1) continue;
      r.t = Math.min(1, r.t + dt * 2.2);
      r.mesh.scale.setScalar(0.02 + easeOutCubic(r.t) * 0.55);
      r.mat.opacity = 0.6 * (1 - r.t);
      if (r.t >= 1) r.mesh.visible = false;
    }

    if (this.brush.visible) {
      const kb = dt === 0 ? 1 : 1 - Math.exp(-28 * dt);
      this.brush.position.lerp(this.cursorGoal, kb);
      if (this.cursorMode === 'hover') this.brush.position.z += Math.sin(this.time * 3) * 0.012 * motion;
    }
    if (this.rainbowTip && motion) this.brushTip.color.setHSL((this.time * 0.35) % 1, 0.85, 0.6);

    if (this.focusRing.visible) {
      this.focusRing.scale.setScalar(1 + Math.sin(this.time * 4) * 0.1 * motion);
      this.focusRing.rotation.z += dt * motion;
    }

    this.potBounce = Math.max(0, this.potBounce - dt * 2.5);
    const sq = Math.sin(this.potBounce * Math.PI * 2) * 0.2 * this.potBounce * motion;
    this.pot.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    this.pot.position.y = 0.75 + Math.max(0, sq) * 0.2;

    this.fairyMat.color.setScalar(2 + Math.sin(this.time * 1.7) * 0.45 * motion);
    this.particles.update(dt);
  }
}
