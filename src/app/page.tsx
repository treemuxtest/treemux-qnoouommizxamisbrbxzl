"use client";

import { useEffect, useRef, useState } from "react";

type Particle = {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  radius: number;
  hue: number;
  life: number;
  maxLife: number;
  seed: number;
  energy: number;
};

type Pulse = {
  x: number;
  y: number;
  radius: number;
  speed: number;
  life: number;
  maxLife: number;
  hue: number;
  force: number;
};

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  hue: number;
  life: number;
};

type PointerState = {
  x: number;
  y: number;
  down: boolean;
  movedAt: number;
  polarity: 1 | -1;
  turbo: boolean;
};

const MAX_PARTICLES = 900;
const BASE_PARTICLES = 260;
const TWO_PI = Math.PI * 2;

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>(0);
  const pointerRef = useRef<PointerState>({
    x: 0,
    y: 0,
    down: false,
    movedAt: 0,
    polarity: 1,
    turbo: false,
  });
  const particlesRef = useRef<Particle[]>([]);
  const pulsesRef = useRef<Pulse[]>([]);
  const sparksRef = useRef<Spark[]>([]);
  const lastTimeRef = useRef(0);
  const autoPulseRef = useRef(0);
  const hudRefreshRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastSoundRef = useRef(0);

  const [hud, setHud] = useState({
    particles: BASE_PARTICLES,
    mode: "Attract",
    turbo: false,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    pointerRef.current.x = width * 0.5;
    pointerRef.current.y = height * 0.5;
    pointerRef.current.movedAt = performance.now();

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const ensureAudio = () => {
      if (audioContextRef.current) return audioContextRef.current;
      const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      audioContextRef.current = new Ctx();
      return audioContextRef.current;
    };

    const playPulseSound = (force: number, hue: number) => {
      const audio = ensureAudio();
      if (!audio) return;
      const nowMs = performance.now();
      if (nowMs - lastSoundRef.current < 34) return;
      lastSoundRef.current = nowMs;

      if (audio.state === "suspended") {
        void audio.resume();
      }

      const now = audio.currentTime;
      const gain = audio.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12 * Math.min(force, 2.3), now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      gain.connect(audio.destination);

      const osc = audio.createOscillator();
      osc.type = "triangle";
      const base = 120 + (hue % 60) * 4;
      osc.frequency.setValueAtTime(base, now);
      osc.frequency.exponentialRampToValueAtTime(base * (1.8 + force * 0.12), now + 0.09);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.3);

      const click = audio.createOscillator();
      click.type = "square";
      click.frequency.setValueAtTime(base * 1.6, now);
      const clickGain = audio.createGain();
      clickGain.gain.setValueAtTime(0.024, now);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      click.connect(clickGain);
      clickGain.connect(audio.destination);
      click.start(now);
      click.stop(now + 0.09);
    };

    const addSpark = (x: number, y: number, hue: number, speed = 1) => {
      sparksRef.current.push({
        x,
        y,
        vx: randomBetween(-2.2, 2.2) * speed,
        vy: randomBetween(-2.2, 2.2) * speed,
        size: randomBetween(1, 2.3),
        hue,
        life: randomBetween(0.35, 1),
      });
      if (sparksRef.current.length > 420) {
        sparksRef.current.splice(0, sparksRef.current.length - 420);
      }
    };

    const addParticle = (x: number, y: number, spread = 1) => {
      if (particlesRef.current.length >= MAX_PARTICLES) return;
      const angle = Math.random() * TWO_PI;
      const speed = randomBetween(0.25, 2.8) * spread;
      particlesRef.current.push({
        x,
        y,
        px: x,
        py: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: randomBetween(0.8, 2.4),
        hue: randomBetween(160, 355),
        life: randomBetween(0.4, 1),
        maxLife: randomBetween(8, 16),
        seed: Math.random() * 999,
        energy: randomBetween(0.5, 1.5),
      });
    };

    const burst = (x: number, y: number, count: number, hue = randomBetween(180, 355)) => {
      for (let i = 0; i < count; i += 1) {
        addParticle(x + randomBetween(-16, 16), y + randomBetween(-16, 16), randomBetween(0.7, 1.8) * randomBetween(0.9, 1.4));
        if (Math.random() > 0.55) {
          addSpark(x, y, hue, 1.3);
        }
      }
    };

    const spawnPulse = (x: number, y: number, force = 1, playSound = false) => {
      const hue = randomBetween(180, 355);
      pulsesRef.current.push({
        x,
        y,
        radius: 0,
        speed: randomBetween(280, 400),
        life: 1,
        maxLife: 1,
        hue,
        force,
      });
      if (pulsesRef.current.length > 22) {
        pulsesRef.current.shift();
      }
      for (let i = 0; i < 8; i += 1) {
        addSpark(x, y, hue, force * 0.8);
      }
      if (playSound) {
        playPulseSound(force, hue);
      }
    };

    const seedWorld = () => {
      particlesRef.current.length = 0;
      pulsesRef.current.length = 0;
      sparksRef.current.length = 0;
      for (let i = 0; i < BASE_PARTICLES; i += 1) {
        const angle = (i / BASE_PARTICLES) * TWO_PI;
        const orbit = randomBetween(30, Math.min(width, height) * 0.35);
        addParticle(width * 0.5 + Math.cos(angle) * orbit, height * 0.5 + Math.sin(angle) * orbit, 0.45);
      }
      spawnPulse(width * 0.5, height * 0.5, 1.2);
    };

    const clearPointer = () => {
      pointerRef.current.down = false;
    };

    const onPointerMove = (event: PointerEvent) => {
      pointerRef.current.x = event.clientX;
      pointerRef.current.y = event.clientY;
      pointerRef.current.movedAt = performance.now();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      pointerRef.current.down = true;
      pointerRef.current.x = event.clientX;
      pointerRef.current.y = event.clientY;
      pointerRef.current.movedAt = performance.now();
      void ensureAudio()?.resume();
      spawnPulse(event.clientX, event.clientY, 1.8, true);
      burst(event.clientX, event.clientY, 32);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !event.repeat) {
        event.preventDefault();
        pointerRef.current.polarity = pointerRef.current.polarity === 1 ? -1 : 1;
        spawnPulse(pointerRef.current.x, pointerRef.current.y, 1.2, true);
        setHud((prev) => ({
          ...prev,
          mode: pointerRef.current.polarity === 1 ? "Attract" : "Repel",
        }));
      }

      if (event.key.toLowerCase() === "e") {
        spawnPulse(pointerRef.current.x, pointerRef.current.y, 2.8, true);
        burst(pointerRef.current.x, pointerRef.current.y, 90);
      }

      if (event.key.toLowerCase() === "r") {
        seedWorld();
      }

      if (event.key === "Shift") {
        pointerRef.current.turbo = true;
        setHud((prev) => ({ ...prev, turbo: true }));
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        pointerRef.current.turbo = false;
        setHud((prev) => ({ ...prev, turbo: false }));
      }
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    const render = (time: number) => {
      const dt = Math.min((time - (lastTimeRef.current || time)) / 1000, 0.032);
      lastTimeRef.current = time;
      const pointer = pointerRef.current;
      const particles = particlesRef.current;
      const pulses = pulsesRef.current;
      const sparks = sparksRef.current;

      const idleSeconds = (time - pointer.movedAt) / 1000;
      const idle = idleSeconds > 1.3;
      const targetX = idle ? width * 0.5 + Math.sin(time * 0.001) * (width * 0.2) : pointer.x;
      const targetY = idle ? height * 0.5 + Math.cos(time * 0.0013) * (height * 0.2) : pointer.y;

      if (time - autoPulseRef.current > 1700) {
        autoPulseRef.current = time;
        spawnPulse(targetX, targetY, 1.05, false);
      }

      if (pointer.down) {
        const spawnCount = pointer.turbo ? 14 : 7;
        for (let i = 0; i < spawnCount; i += 1) {
          addParticle(pointer.x + randomBetween(-16, 16), pointer.y + randomBetween(-16, 16), randomBetween(1.2, 2.4));
          if (Math.random() > 0.6) {
            addSpark(pointer.x, pointer.y, randomBetween(180, 355), pointer.turbo ? 2.2 : 1.3);
          }
        }
        if (pointer.turbo && Math.random() > 0.92) {
          spawnPulse(pointer.x, pointer.y, 1.1, false);
        }
      }

      if (particles.length < BASE_PARTICLES) {
        addParticle(randomBetween(0, width), randomBetween(0, height), 0.9);
      }

      ctx.fillStyle = "rgba(5, 8, 20, 0.14)";
      ctx.fillRect(0, 0, width, height);

      const bgGlow = ctx.createRadialGradient(targetX, targetY, 20, targetX, targetY, Math.max(width, height) * 0.55);
      bgGlow.addColorStop(0, "rgba(110, 185, 255, 0.14)");
      bgGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = bgGlow;
      ctx.fillRect(0, 0, width, height);

      for (let pulseIndex = pulses.length - 1; pulseIndex >= 0; pulseIndex -= 1) {
        const pulse = pulses[pulseIndex];
        pulse.radius += pulse.speed * dt;
        pulse.life -= dt * 0.62;

        if (pulse.life <= 0) {
          pulses.splice(pulseIndex, 1);
          continue;
        }

        const alpha = (pulse.life / pulse.maxLife) * 0.6;
        ctx.beginPath();
        ctx.strokeStyle = `hsla(${pulse.hue}, 95%, 72%, ${alpha})`;
        ctx.lineWidth = 1.2 + pulse.life * 2.3;
        ctx.arc(pulse.x, pulse.y, pulse.radius, 0, TWO_PI);
        ctx.stroke();
      }

      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        p.px = p.x;
        p.py = p.y;

        const dx = targetX - p.x;
        const dy = targetY - p.y;
        const distSq = dx * dx + dy * dy + 10;
        const dist = Math.sqrt(distSq);

        const gravity = (pointer.polarity * 620 * p.energy) / distSq;
        const swirl = pointer.down ? 0.05 : 0.017;
        const nudgeX = Math.sin((p.y + time * 0.07 + p.seed) * 0.014) * 0.1;
        const nudgeY = Math.cos((p.x - time * 0.05 + p.seed) * 0.012) * 0.1;
        const drift = Math.sin((time * 0.0008 + p.seed) * 2) * 0.04;

        p.vx += ((dx / dist) * gravity - (dy / dist) * swirl + nudgeX + drift) * dt * 60;
        p.vy += ((dy / dist) * gravity + (dx / dist) * swirl + nudgeY - drift) * dt * 60;

        for (let pulseIndex = 0; pulseIndex < pulses.length; pulseIndex += 1) {
          const pulse = pulses[pulseIndex];
          const pdx = p.x - pulse.x;
          const pdy = p.y - pulse.y;
          const pd = Math.sqrt(pdx * pdx + pdy * pdy) + 1;
          const waveDistance = Math.abs(pd - pulse.radius);
          if (waveDistance < 36) {
            const wavePush = (1 - waveDistance / 36) * 0.22 * pulse.force;
            p.vx += (pdx / pd) * wavePush;
            p.vy += (pdy / pd) * wavePush;
          }
        }

        const damping = pointer.down ? 0.986 : 0.992;
        p.vx *= damping;
        p.vy *= damping;
        p.x += p.vx * dt * 60;
        p.y += p.vy * dt * 60;

        if (p.x < 0 || p.x > width) {
          p.vx *= -0.86;
          p.x = p.x < 0 ? 0 : width;
        }
        if (p.y < 0 || p.y > height) {
          p.vy *= -0.86;
          p.y = p.y < 0 ? 0 : height;
        }

        p.life -= dt * (0.07 + p.radius * 0.01);
        if (p.life <= 0) {
          if (Math.random() > 0.5) {
            addSpark(p.x, p.y, p.hue, 0.8);
          }
          particles.splice(i, 1);
          continue;
        }

        const lifeRatio = Math.min(p.life / p.maxLife, 1);

        ctx.beginPath();
        ctx.strokeStyle = `hsla(${p.hue}, 88%, 64%, ${lifeRatio * 0.3})`;
        ctx.lineWidth = p.radius * 0.9;
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();

        const glow = 6 + lifeRatio * 8;
        ctx.beginPath();
        ctx.fillStyle = `hsla(${p.hue + Math.sin(time * 0.0008 + p.seed) * 24}, 95%, 66%, ${lifeRatio * 0.85})`;
        ctx.arc(p.x, p.y, p.radius + glow * 0.1, 0, TWO_PI);
        ctx.fill();
      }

      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const spark = sparks[i];
        spark.life -= dt * 1.9;
        if (spark.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        spark.vx *= 0.98;
        spark.vy *= 0.98;
        spark.x += spark.vx * dt * 60;
        spark.y += spark.vy * dt * 60;
        ctx.beginPath();
        ctx.fillStyle = `hsla(${spark.hue}, 95%, 70%, ${spark.life * 0.65})`;
        ctx.arc(spark.x, spark.y, spark.size * spark.life, 0, TWO_PI);
        ctx.fill();
      }

      ctx.restore();

      ctx.beginPath();
      ctx.strokeStyle = pointer.down ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.45)";
      ctx.lineWidth = pointer.down ? 1.8 : 1.1;
      ctx.arc(pointer.x, pointer.y, pointer.down ? 20 : 14, 0, TWO_PI);
      ctx.stroke();

      ctx.beginPath();
      ctx.fillStyle = pointer.polarity === 1 ? "rgba(120, 215, 255, 0.9)" : "rgba(255, 120, 150, 0.9)";
      ctx.arc(pointer.x, pointer.y, pointer.turbo ? 3.4 : 2.4, 0, TWO_PI);
      ctx.fill();

      if (time - hudRefreshRef.current > 120) {
        hudRefreshRef.current = time;
        setHud((prev) => ({
          ...prev,
          particles: particles.length,
        }));
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    resize();
    seedWorld();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", clearPointer);
    window.addEventListener("pointercancel", clearPointer);
    window.addEventListener("blur", clearPointer);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("contextmenu", onContextMenu);

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", clearPointer);
      window.removeEventListener("pointercancel", clearPointer);
      window.removeEventListener("blur", clearPointer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("contextmenu", onContextMenu);
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        void audioContextRef.current.close();
      }
    };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#050814] text-white select-none">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full cursor-none" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(80,140,255,0.15),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(255,90,150,0.12),transparent_38%)]" />

      <section className="pointer-events-none absolute left-4 top-4 rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-[11px] uppercase tracking-[0.22em] backdrop-blur-md">
        <p className="text-white/70">Particles {hud.particles}</p>
        <p className="text-white/70">Mode {hud.mode}</p>
        <p className="text-white/70">Turbo {hud.turbo ? "On" : "Off"}</p>
      </section>

      <section className="pointer-events-none absolute bottom-4 left-4 text-[10px] uppercase tracking-[0.24em] text-white/35">
        Hold click to paint • Space polarity • Shift turbo • E burst • R reset
      </section>
    </main>
  );
}
