"use client";

import { useEffect, useRef } from "react";

/**
 * A particle-sphere orb for an agent — thousands of points distributed on a
 * real sphere, rotated in 3D and perspective-projected to 2D canvas.
 *
 * This is genuine 3D maths (rotation matrices + perspective divide), just
 * rasterised by hand instead of by WebGL. For a cloud of unlit points that is
 * all a shader would do anyway, so it buys the look without putting three.js
 * (~600KB) into a bundle the BDEs load on their phones in the field.
 *
 * Points are laid out with a Fibonacci lattice, which spaces them evenly —
 * naive lat/long spacing bunches them at the poles and reads as a wireframe
 * globe rather than a cloud.
 *
 * The animation is meaningful, not ornamental: `state` reflects what the agent
 * is actually doing, so a glance at the org chart shows who is working.
 */

export type OrbState = "idle" | "active" | "working" | "speaking";

interface NeuralOrbProps {
  /** Base hue — each department gets its own. */
  hue: number;
  size?: number;
  state?: OrbState;
  /** Stable per-agent seed so no two orbs rotate in lockstep. */
  seed?: number;
}

/**
 * Rotation speed (radians per frame at 60fps) and how far particles are pushed
 * off the shell. Seconds per revolution ≈ 2π / (spin × 60) — keep them in the
 * 3-18s range: slower than ~20s/rev and the eye reads the orb as a still image.
 */
const MOTION: Record<OrbState, { spin: number; turbulence: number; glow: number }> = {
  idle:     { spin: 0.0060, turbulence: 0.020, glow: 0.60 },  // ~17s/rev
  active:   { spin: 0.0140, turbulence: 0.040, glow: 0.85 },  // ~7s/rev
  working:  { spin: 0.0280, turbulence: 0.080, glow: 1.00 },  // ~4s/rev
  speaking: { spin: 0.0380, turbulence: 0.115, glow: 1.00 },  // ~3s/rev
};

/** Points scale with size — 27 orbs at full density would melt the main thread. */
function particleCount(size: number): number {
  if (size >= 56) return 1600;
  if (size >= 40) return 900;
  if (size >= 28) return 420;
  return 220;
}

interface P { x: number; y: number; z: number; r: number }

/** Deterministic pseudo-random in [0,1) — same cloud on every render. */
function rand(i: number, salt: number): number {
  const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Points on a unit sphere via a Fibonacci lattice, then jittered.
 *
 * The bare lattice is *too* even: viewed head-on its golden-angle spacing
 * produces visible spiral moiré arms, which read as a machined pattern rather
 * than a cloud. A little positional jitter plus a varied shell radius breaks
 * the interference and gives the ragged organic look.
 */
function buildSphere(n: number): P[] {
  const pts: P[] = [];
  const phi = Math.PI * (3 - Math.sqrt(5)); // golden angle
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = phi * i;

    const jx = (rand(i, 1) - 0.5) * 0.075;
    const jy = (rand(i, 2) - 0.5) * 0.075;
    const jz = (rand(i, 3) - 0.5) * 0.075;
    // Shell thickness — a perfectly thin shell looks like a wireframe.
    const shell = 0.88 + rand(i, 4) * 0.12;

    pts.push({
      x: (Math.cos(theta) * radius + jx) * shell,
      y: (y + jy) * shell,
      z: (Math.sin(theta) * radius + jz) * shell,
      r: i / n,
    });
  }
  return pts;
}

export function NeuralOrb({ hue, size = 40, state = "idle", seed = 0 }: NeuralOrbProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ hue, state, seed });
  useEffect(() => { live.current = { hue, state, seed }; });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const pts = buildSphere(particleCount(size));
    const c = size / 2;
    const R = size * 0.36;
    const dot = Math.max(0.5, size / 90); // particle radius in px

    let raf = 0;
    let t = live.current.seed * 12.9898;

    const draw = () => {
      const { hue: h, state: s } = live.current;
      const m = MOTION[s];
      t += 1;

      ctx.clearRect(0, 0, size, size);

      // Reduced motion calms the orb rather than freezing it. A frozen orb
      // isn't just dull — it destroys meaning, because the animation is how
      // you see which agent is working. A small, slow, steady rotation carries
      // that without the darting movement the preference exists to prevent.
      const spin = reduced ? m.spin * 0.3 : m.spin;
      const turbulence = reduced ? 0 : m.turbulence;

      const spinY = t * spin;
      const spinX = reduced ? 0.2 : Math.sin(t * spin * 0.35) * 0.45; // gentle wobble
      const cosY = Math.cos(spinY), sinY = Math.sin(spinY);
      const cosX = Math.cos(spinX), sinX = Math.sin(spinX);

      // A faint halo only — the cloud itself must carry the image. A strong
      // core bloom fills the middle and the sphere reads as a solid ball
      // instead of a shell of particles.
      const halo = ctx.createRadialGradient(c, c, R * 0.75, c, c, R * 1.35);
      halo.addColorStop(0, `hsla(${h + 60}, 90%, 55%, ${0.10 * m.glow})`);
      halo.addColorStop(1, `hsla(${h}, 90%, 50%, 0)`);
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, size, size);

      for (const p of pts) {
        // Breathe each particle off the shell — the reference image's cloud is
        // ragged, not a clean shell.
        const wob = 1 + Math.sin(t * 0.03 + p.r * 28) * turbulence;

        // Rotate Y then X.
        const x1 = p.x * cosY - p.z * sinY;
        const z1 = p.x * sinY + p.z * cosY;
        const y2 = p.y * cosX - z1 * sinX;
        const z2 = p.y * sinX + z1 * cosX;

        // Perspective divide — near particles spread out and grow.
        const persp = 1.9 / (1.9 + z2);
        const sx = c + x1 * R * wob * persp;
        const sy = c + y2 * R * wob * persp;

        // Depth 0 (back) → 1 (front)
        const depth = (z2 + 1) / 2;

        // Hue sweeps top→bottom over ~160°: cool at the crown, hot at the base.
        // A narrow sweep just looks tinted; this is what makes it read as the
        // blue→violet→magenta→amber gradient of the reference.
        // NOTE: canvas y grows downward, so normY is 0 at the TOP of the
        // screen — the base hue belongs there and the sweep runs down.
        const normY = (y2 + 1) / 2;
        const ph = h + normY * 160;

        // Limb brightening: particles near the silhouette edge are the ones
        // whose normal is side-on, and they bunch up in projection — that is
        // what gives a real particle sphere its bright rim and hollow core.
        const rim = Math.sqrt(x1 * x1 + y2 * y2); // 0 centre → 1 edge
        const edge = 0.25 + Math.pow(rim, 2.2) * 1.15;

        // Back hemisphere falls away steeply rather than linearly, so the far
        // side reads as depth instead of fog.
        const front = Math.pow(depth, 1.7);
        const alpha = Math.min(1, (0.10 + front * 1.05) * edge * m.glow);
        const lightness = 50 + front * 30;

        ctx.fillStyle = `hsla(${ph}, 95%, ${lightness}%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(sx, sy, dot * (0.5 + front * 0.8), 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return <canvas ref={ref} width={size} height={size} style={{ width: size, height: size }} aria-hidden />;
}

/** One hue per department, so the org chart reads at a glance. */
export const DEPT_HUE: Record<string, number> = {
  growth: 150,     // green
  delivery: 205,   // blue
  marketing: 285,  // violet
  support: 25,     // amber
  finance: 170,    // teal
  ops: 235,        // indigo
  hr: 330,         // pink
  // Each hue is the crown colour; the +160° top-to-bottom sweep carries it
  // through the rest. Cortex starts at blue so it lands on amber at the base.
  manager: 205,
};
