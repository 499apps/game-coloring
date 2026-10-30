/**
 * Coloring scaffold scene: a glossy 3D flower on a canvas board and a row of paint pots.
 * Tap a pot to pick a paint, tap a part of the flower to paint it. G3 replaces this with the
 * full game (region masks and flood fill live in src/game/flood.ts).
 */
import * as THREE from 'three';
import { ParticleSystem } from './kit/particles';
import type { Rng } from './kit/prng';
import type { KitRenderer } from './kit/renderer';
import {
  addStudioLights,
  candyMaterial,
  damp,
  makeRoom,
  roundedBox,
} from './kit/scene-helpers';
import { funColors, mixHex, palette } from './kit/theme';
import { PAINTS, REGIONS, UNPAINTED, type PaintState } from './game/paint';

const UNPAINTED_COLOR = '#ece6dc';

export type PickResult = { kind: 'region'; index: number } | { kind: 'paint'; index: number } | null;

interface RegionRig {
  mesh: THREE.Mesh;
  mat: THREE.MeshPhysicalMaterial;
  target: THREE.Color;
  pop: number;
  baseScale: THREE.Vector3;
}

interface PotRig {
  group: THREE.Group;
  lift: number;
}

export interface ColoringSceneOptions {
  reducedMotion: boolean;
}

export class ColoringScene {
  private readonly kit: KitRenderer;
  private readonly rng: Rng;
  private readonly reduced: boolean;
  private readonly regions: RegionRig[] = [];
  private readonly pots: PotRig[] = [];
  private readonly flower = new THREE.Group();
  private readonly ring: THREE.Mesh;
  private readonly brush = new THREE.Group();
  private readonly brushTip: THREE.MeshPhysicalMaterial;
  private readonly particles: ParticleSystem;
  private readonly raycaster = new THREE.Raycaster();
  private readonly lookTarget = new THREE.Vector3(0, 0, 0.5);
  private state: PaintState;
  private dip = 0;

  constructor(kit: KitRenderer, rng: Rng, initial: PaintState, o: ColoringSceneOptions) {
    this.kit = kit;
    this.rng = rng;
    this.reduced = o.reducedMotion;
    this.state = initial;
    const scene = kit.scene;

    const lights = addStudioLights(scene, { shadowArea: 8, shadowMapSize: kit.settings.shadowMapSize });
    lights.key.castShadow = kit.settings.shadows;
    kit.shadowLights.push(lights.key);
    const room = makeRoom(scene, {
      floorColor: mixHex(palette.plum, palette.night, 0.2),
      wallColor: mixHex(palette.night, palette.plum, 0.4),
      rugColor: mixHex(palette.sky, palette.plum, 0.55),
    });
    room.position.set(0, -0.4, 6);

    const board = new THREE.Mesh(
      roundedBox(7.2, 0.3, 6.6, 0.2, 4),
      candyMaterial(palette.cream, { roughness: 0.6, clearcoat: 0.3 }),
    );
    board.position.set(0, -0.15, -0.2);
    board.receiveShadow = true;
    scene.add(board);
    const frame = new THREE.Mesh(
      roundedBox(7.6, 0.24, 7.0, 0.2, 4),
      candyMaterial(mixHex(palette.tangerine, palette.coral, 0.4)),
    );
    frame.position.set(0, -0.3, -0.2);
    frame.receiveShadow = true;
    scene.add(frame);

    this.buildFlower();
    scene.add(this.flower);
    this.buildPots();

    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.05, 12, 48),
      new THREE.MeshPhysicalMaterial({
        color: palette.lemon,
        emissive: new THREE.Color(palette.lemon),
        emissiveIntensity: 1.2,
        roughness: 0.2,
        clearcoat: 1,
      }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    scene.add(this.ring);

    this.brushTip = candyMaterial(PAINTS[this.state.paint] as string, {
      emissive: PAINTS[this.state.paint] as string,
      emissiveIntensity: 0.2,
    });
    this.buildBrush();
    scene.add(this.brush);

    this.particles = new ParticleSystem(rng, { max: 160, particleScale: kit.settings.particleScale, gravity: 7 });
    scene.add(this.particles.mesh);
    this.applyState(true);
  }

  private addRegion(geo: THREE.BufferGeometry, index: number, place: (m: THREE.Mesh) => void): void {
    const mat = candyMaterial(UNPAINTED_COLOR, { roughness: 0.3 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData['region'] = index;
    place(mesh);
    this.flower.add(mesh);
    this.regions[index] = {
      mesh,
      mat,
      target: new THREE.Color(UNPAINTED_COLOR),
      pop: 0,
      baseScale: mesh.scale.clone(),
    };
  }

  private buildFlower(): void {
    const petalGeo = new THREE.SphereGeometry(0.6, 32, 20);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 2;
      this.addRegion(petalGeo, REGIONS.indexOf(`petal-${k}` as (typeof REGIONS)[number]), (m) => {
        m.scale.set(1, 0.32, 0.56);
        m.position.set(Math.cos(a) * 0.98, 0.3, -Math.sin(a) * 0.98);
        m.rotation.y = a;
      });
    }
    this.addRegion(new THREE.SphereGeometry(0.55, 32, 22), REGIONS.indexOf('center'), (m) => {
      m.scale.set(1, 0.55, 1);
      m.position.set(0, 0.42, 0);
    });
    const leafGeo = new THREE.SphereGeometry(0.5, 28, 16);
    this.addRegion(leafGeo, REGIONS.indexOf('leaf-left'), (m) => {
      m.scale.set(1, 0.22, 0.45);
      m.position.set(-0.62, 0.12, 2.05);
      m.rotation.y = 0.5;
    });
    this.addRegion(leafGeo, REGIONS.indexOf('leaf-right'), (m) => {
      m.scale.set(1, 0.22, 0.45);
      m.position.set(0.62, 0.12, 1.65);
      m.rotation.y = -0.5;
    });
    this.addRegion(new THREE.CylinderGeometry(0.12, 0.14, 1.9, 20), REGIONS.indexOf('stem'), (m) => {
      m.rotation.x = Math.PI / 2;
      m.position.set(0, 0.12, 2.0);
    });
    this.flower.position.set(0, 0, -1.35);
    this.flower.scale.setScalar(0.92);
  }

  private buildPots(): void {
    const cupGeo = new THREE.CylinderGeometry(0.3, 0.26, 0.34, 28);
    const paintGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.06, 28);
    const cupMat = candyMaterial(palette.white, { roughness: 0.25 });
    const n = PAINTS.length;
    for (let i = 0; i < n; i++) {
      const group = new THREE.Group();
      group.userData['paint'] = i;
      const cup = new THREE.Mesh(cupGeo, cupMat);
      cup.castShadow = true;
      cup.userData['paint'] = i;
      const color = PAINTS[i] as string;
      const paint = new THREE.Mesh(
        paintGeo,
        candyMaterial(color, { emissive: color, emissiveIntensity: 0.15, roughness: 0.15 }),
      );
      paint.position.y = 0.17;
      paint.userData['paint'] = i;
      group.add(cup, paint);
      const t = n === 1 ? 0.5 : i / (n - 1);
      group.position.set((t - 0.5) * 5.8, 0.17, 2.75 - Math.sin(t * Math.PI) * 0.35);
      this.kit.scene.add(group);
      this.pots.push({ group, lift: 0 });
    }
  }

  private buildBrush(): void {
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, 1.3, 20),
      candyMaterial(palette.tangerine),
    );
    handle.position.y = 0.85;
    handle.castShadow = true;
    const ferrule = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.085, 0.2, 20),
      new THREE.MeshPhysicalMaterial({ color: '#d9d9e3', metalness: 1, roughness: 0.25 }),
    );
    ferrule.position.y = 0.12;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.32, 20), this.brushTip);
    tip.rotation.x = Math.PI;
    tip.position.y = -0.12;
    this.brush.add(handle, ferrule, tip);
    this.brush.rotation.z = 0.35;
  }

  /** Show a new paint state; animates every region that changed colour. */
  setState(next: PaintState, painted: number | null): void {
    this.state = next;
    if (painted !== null) {
      const rig = this.regions[painted];
      if (rig) {
        rig.pop = 1;
        const pos = new THREE.Vector3();
        rig.mesh.getWorldPosition(pos);
        pos.y += 0.3;
        const color = PAINTS[next.paint] as string;
        this.particles.burst({ position: pos, color, count: this.reduced ? 8 : 26, speed: 2.6, life: 0.7, size: 0.06 });
        this.dip = 1;
      }
    }
    this.applyState(false);
  }

  /** Confetti when every region is painted. */
  celebrate(): void {
    const pos = new THREE.Vector3(0, 0.8, -1.2);
    for (let k = 0; k < 4; k++) {
      this.particles.burst({
        position: pos,
        color: this.rng.pick(funColors),
        count: this.reduced ? 6 : 22,
        speed: 4.2,
        life: 1.1,
        size: 0.07,
      });
    }
  }

  private applyState(instant: boolean): void {
    this.state.colors.forEach((c, i) => {
      const rig = this.regions[i];
      if (!rig) return;
      rig.target.set(c === UNPAINTED ? UNPAINTED_COLOR : (PAINTS[c] as string));
      if (instant) rig.mat.color.copy(rig.target);
    });
    const tipColor = PAINTS[this.state.paint] as string;
    this.brushTip.color.set(tipColor);
    this.brushTip.emissive.set(tipColor);
  }

  pick(ndcX: number, ndcY: number): PickResult {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.kit.camera);
    const targets: THREE.Object3D[] = [...this.regions.map((r) => r.mesh), ...this.pots.map((p) => p.group)];
    const hits = this.raycaster.intersectObjects(targets, true);
    for (const hit of hits) {
      const region = hit.object.userData['region'];
      if (typeof region === 'number') return { kind: 'region', index: region };
      const paint = hit.object.userData['paint'];
      if (typeof paint === 'number') return { kind: 'paint', index: paint };
    }
    return null;
  }

  resize(width: number, height: number): void {
    const aspect = width / Math.max(1, height);
    const cam = this.kit.camera;
    const span = 8.4;
    const depth = 7.2;
    const vFov = (cam.fov * Math.PI) / 180;
    const fitW = span / 2 / (Math.tan(vFov / 2) * aspect);
    const fitH = depth / 2 / Math.tan(vFov / 2);
    const dist = Math.max(fitW, fitH) * (aspect < 1 ? 1.05 : 0.98);
    cam.position.set(0, dist * 0.8, dist * 0.62 + 0.4);
    cam.lookAt(this.lookTarget);
  }

  update(dt: number, t: number): void {
    const motion = this.reduced ? 0 : 1;
    // dt = 0 happens on the first frame and with the frozen test clock: show the colour at once.
    const k = dt === 0 ? 1 : 1 - Math.exp(-10 * dt);
    for (const rig of this.regions) {
      if (!rig) continue;
      rig.mat.color.lerp(rig.target, k);
      rig.pop = Math.max(0, rig.pop - dt * 3);
      const p = Math.sin(rig.pop * Math.PI) * 0.18;
      rig.mesh.scale.set(rig.baseScale.x * (1 + p), rig.baseScale.y * (1 + p * 1.6), rig.baseScale.z * (1 + p));
    }

    this.pots.forEach((pot, i) => {
      const target = i === this.state.paint ? 1 : 0;
      pot.lift = damp(pot.lift, target, 12, dt || 1);
      pot.group.position.y = 0.17 + pot.lift * 0.28 + Math.sin(t * 2 + i) * 0.02 * motion;
      pot.group.scale.setScalar(1 + pot.lift * 0.12);
    });

    const focus = this.regions[this.state.focus];
    if (focus) {
      const pos = new THREE.Vector3();
      focus.mesh.getWorldPosition(pos);
      this.ring.position.set(pos.x, pos.y + 0.32 + Math.sin(t * 3) * 0.04 * motion, pos.z);
      this.ring.rotation.z += dt * 1.5 * motion;
      this.dip = Math.max(0, this.dip - dt * 3);
      const dipY = Math.sin(this.dip * Math.PI) * -0.35;
      this.brush.position.set(pos.x + 0.45, pos.y + 0.55 + dipY + Math.sin(t * 2.2) * 0.05 * motion, pos.z + 0.15);
    }

    this.particles.update(dt);
  }
}
