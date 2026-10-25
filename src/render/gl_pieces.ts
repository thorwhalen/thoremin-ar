/**
 * The drawn pieces in 3-D: a drum is a domed membrane with a rim, a string a tube, lit so they read as
 * objects and translucent so the hands stay visible. three.js renders into its own WebGL canvas, which the
 * pure overlay element (`../nodes/overlay/pieces.ts`) copies onto thoremin's 2-D overlay canvas, so
 * thoremin's overlay contract is unchanged and three.js stays in this extension's lazy UI chunk. A hit
 * ripples the membrane from the contact point, a pluck makes the string vibrate, a touch glows. Installed
 * through `../lib/render_slot.ts` when the lazy UI half mounts.
 */
import * as THREE from 'three';
import type { Piece } from '../schema';
import type { DrawnScene } from '../nodes/drawn_hands';
import type { PieceRenderer, Pulse } from '../lib/render_slot';
import { centroid, type Vec2 } from '../lib/geometry';
import { outlineOf } from '../lib/scene';
import { hueOf, LOOK } from '../nodes/overlay/look';

interface Gl {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  meshes: Map<string, { key: string; group: THREE.Group; membrane?: THREE.Mesh; base?: Float32Array; rippling?: boolean }>;
  W: number;
  H: number;
}

function makeGl(W: number, H: number): Gl | null {
  try {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(W, H, false);
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(-0.6, 0.8, 1.2);
    scene.add(key);
    const camera = new THREE.OrthographicCamera(0, W, 0, -H, -5000, 5000);
    camera.position.z = 1000;
    return { renderer, scene, camera, meshes: new Map(), W, H };
  } catch {
    return null;
  }
}

/** World coordinates are pixels, y up: display fraction (x, y) is (x W, -y H). */
const px = (p: Vec2, W: number, H: number) => new THREE.Vector3(p[0] * W, -p[1] * H, 0);

function membraneGeometry(outline: readonly Vec2[], W: number, H: number): THREE.BufferGeometry {
  const c = centroid(outline);
  const n = outline.length;
  const K = LOOK.rings;
  const size = Math.max(...outline.map((p) => Math.hypot((p[0] - c[0]) * W, (p[1] - c[1]) * H)));
  const pos: number[] = [];
  for (let r = 0; r <= K; r++) {
    const s = 1 - r / K;
    const z = LOOK.domeOverSize * size * (1 - s * s);
    for (let i = 0; i < n; i++) {
      const p = outline[i]!;
      pos.push((c[0] + (p[0] - c[0]) * s) * W, -(c[1] + (p[1] - c[1]) * s) * H, z);
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < K; r++) {
    for (let i = 0; i < n; i++) {
      const a = r * n + i;
      const b = r * n + ((i + 1) % n);
      const a2 = a + n;
      const b2 = b + n;
      idx.push(a, b, a2, b, b2, a2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function tube(outline: readonly Vec2[], closed: boolean, radius: number, W: number, H: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(outline.map((p) => px(p, W, H)), closed, 'centripetal');
  return new THREE.TubeGeometry(curve, Math.max(16, outline.length), radius, 8, closed);
}

function material(piece: Piece, glow: boolean): THREE.MeshStandardMaterial {
  const color = new THREE.Color(`hsl(${hueOf(piece.id)}, 65%, ${glow ? 70 : 55}%)`);
  const metal = piece.sound === 'metal' || piece.sound === 'glass';
  return new THREE.MeshStandardMaterial({ color, roughness: metal ? 0.25 : 0.6, metalness: metal ? 0.6 : 0.05, transparent: true, opacity: LOOK.opacity, side: THREE.DoubleSide });
}

function pieceKey(piece: Piece, glow: boolean, W: number, H: number): string {
  return `${piece.kind}|${piece.shape}|${piece.x}|${piece.y}|${piece.scale}|${piece.rot}|${piece.sound}|${glow}|${W}x${H}|${piece.stroke.length}|${piece.stroke[0]}|${piece.stroke[1]}`;
}

function disposeGroup(g: THREE.Group) {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    (m.material as THREE.Material | undefined)?.dispose?.();
  });
}

function vibrated(outline: readonly Vec2[], pulse: Pulse, now: number, W: number, H: number): Vec2[] {
  const age = now - pulse.t;
  const amp = (LOOK.vibrateAmpPx * (0.4 + pulse.speed) * Math.exp(-age * 4)) * Math.sin(2 * Math.PI * LOOK.vibrateHz * age);
  const n = outline.length;
  return outline.map((p, i) => {
    const a = outline[Math.max(0, i - 1)]!;
    const b = outline[Math.min(n - 1, i + 1)]!;
    const tx = (b[0] - a[0]) * W;
    const ty = (b[1] - a[1]) * H;
    const len = Math.hypot(tx, ty) || 1;
    const shape = Math.sin((Math.PI * i) / (n - 1));
    return [p[0] + ((-ty / len) * amp * shape) / W, p[1] + ((tx / len) * amp * shape) / H] as Vec2;
  });
}

function drawGl(gl: Gl, scene: DrawnScene, pulses: ReadonlyMap<string, Pulse>, now: number) {
  const { W, H } = gl;
  const alive = new Set<string>();
  for (const piece of scene.pieces) {
    alive.add(piece.id);
    const glow = scene.touching.includes(piece.id);
    const pulse = pulses.get(piece.id);
    const vibrating = piece.kind === 'string' && pulse && now - pulse.t < LOOK.vibrateSeconds;
    const key = pieceKey(piece, glow, W, H) + (vibrating ? `|v${now}` : '');
    let entry = gl.meshes.get(piece.id);
    if (!entry || entry.key !== key) {
      if (entry) {
        gl.scene.remove(entry.group);
        disposeGroup(entry.group);
      }
      const group = new THREE.Group();
      const outline = outlineOf(piece);
      const mat = material(piece, glow);
      let membrane: THREE.Mesh | undefined;
      if (piece.kind === 'drum') {
        membrane = new THREE.Mesh(membraneGeometry(outline, W, H), mat);
        group.add(membrane);
        group.add(new THREE.Mesh(tube(outline, true, LOOK.rimRadiusPx, W, H), mat.clone()));
      } else {
        const line = vibrating ? vibrated(outline, pulse!, now, W, H) : outline;
        group.add(new THREE.Mesh(tube(line, false, LOOK.stringRadiusPx, W, H), mat));
      }
      // Nearer pieces in front.
      group.position.z = (1 - piece.depth) * 100;
      gl.scene.add(group);
      const base = membrane ? Float32Array.from((membrane.geometry.getAttribute('position') as THREE.BufferAttribute).array) : undefined;
      entry = { key, group, membrane, base };
      gl.meshes.set(piece.id, entry);
    }
    // A hit's ripple: a damped ring wave from the contact point, on the membrane's base heights.
    if (entry.membrane && entry.base) {
      const attr = entry.membrane.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      const age = pulse ? now - pulse.t : Infinity;
      if (pulse && pulse.kind === 'hit' && age < LOOK.rippleSeconds) {
        const cx = pulse.x * W;
        const cy = -pulse.y * H;
        const outline = outlineOf(piece);
        const size = Math.max(W, H) * Math.max(0.02, Math.max(...outline.map((p) => Math.abs(p[0] - piece.x))) * 2);
        const amp = LOOK.rippleAmpOverSize * size * (0.3 + pulse.speed) * (1 - age / LOOK.rippleSeconds);
        const k = (2 * Math.PI * LOOK.rippleWavesPerSize) / size;
        for (let i = 0; i < arr.length; i += 3) {
          const d = Math.hypot(entry.base[i]! - cx, entry.base[i + 1]! - cy);
          const front = age * size * 2;
          const env = Math.exp(-Math.abs(d - front) / (size * 0.25));
          arr[i + 2] = entry.base[i + 2]! + amp * env * Math.sin(k * d - age * 30);
        }
        attr.needsUpdate = true;
        entry.membrane.geometry.computeVertexNormals();
        entry.rippling = true;
      } else if (entry.rippling) {
        arr.set(entry.base);
        attr.needsUpdate = true;
        entry.membrane.geometry.computeVertexNormals();
        entry.rippling = false;
      }
    }
  }
  for (const [id, entry] of gl.meshes) {
    if (alive.has(id)) continue;
    gl.scene.remove(entry.group);
    disposeGroup(entry.group);
    gl.meshes.delete(id);
  }
  gl.renderer.render(gl.scene, gl.camera);
}

/** A three.js piece renderer; null from the factory never, but each call returns null without WebGL. */
export function createGlPieceRenderer(): PieceRenderer {
  let gl: Gl | null | undefined;
  return ({ W, H, scene, pulses, now }) => {
    if (gl === undefined || (gl && (gl.W !== W || gl.H !== H))) {
      gl?.renderer.dispose();
      gl = makeGl(W, H);
    }
    if (!gl) return null;
    drawGl(gl, scene, pulses, now);
    return gl.renderer.domElement;
  };
}
