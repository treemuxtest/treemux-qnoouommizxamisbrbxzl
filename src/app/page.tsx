"use client";

import { useEffect, useRef } from "react";

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  drift: number;
};

type Seeker = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  speed: number;
  stun: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
  alpha: number;
};

type Ripple = {
  x: number;
  y: number;
  r: number;
  maxR: number;
  life: number;
  maxLife: number;
  hue: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const random = (min: number, max: number) => min + Math.random() * (max - min);

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const bestRef = useRef<HTMLSpanElement>(null);
  const comboRef = useRef<HTMLSpanElement>(null);
  const livesRef = useRef<HTMLSpanElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const burstFillRef = useRef<HTMLDivElement>(null);
  const scoreValueRef = useRef<HTMLSpanElement>(null);
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      return;
    }

    const keys = new Set<string>();
    const sparks: Spark[] = [];
    const seekers: Seeker[] = [];
    const particles: Particle[] = [];
    const ripples: Ripple[] = [];
    const trail: Array<{ x: number; y: number }> = [];

    const pointer = {
      x: 0,
      y: 0,
      active: false,
      movedAt: 0,
    };

    const player = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      r: 14,
      invuln: 0,
    };

    let width = 0;
    let height = 0;
    let raf = 0;
    let lastTime = 0;
    let sparkSpawn = 0;
    let seekerSpawn = 0;
    let shake = 0;
    let energy = 0.2;
    let burstCooldown = 0;
    let runOverTimer = 0;

    let score = 0;
    let combo = 0;
    let lives = 3;
    let best = 0;

    try {
      const saved = window.localStorage.getItem("neon-drift-best");
      if (saved) {
        best = Number(saved) || 0;
      }
    } catch {
      // ignore storage read errors
    }

    const setText = (ref: React.RefObject<HTMLElement | null>, value: string) => {
      if (ref.current) {
        ref.current.textContent = value;
      }
    };

    const refreshHud = () => {
      setText(scoreRef, score.toString());
      setText(bestRef, best.toString());
      setText(comboRef, `${combo}x`);
      setText(livesRef, lives.toString());
      if (burstFillRef.current) {
        const pct = clamp(1 - burstCooldown / 2, 0, 1) * 100;
        burstFillRef.current.style.width = `${pct}%`;
      }
    };

    const bumpScore = () => {
      if (scoreValueRef.current) {
        scoreValueRef.current.animate(
          [
            { transform: "scale(1)", filter: "brightness(1)" },
            { transform: "scale(1.26)", filter: "brightness(1.3)" },
            { transform: "scale(1)", filter: "brightness(1)" },
          ],
          {
            duration: 220,
            easing: "cubic-bezier(0.2, 0.9, 0.2, 1)",
          },
        );
      }
    };

    const updateStatus = (text: string) => {
      setText(statusRef, text);
    };

    const unlockAudio = () => {
      if (audioRef.current) {
        return;
      }
      const Ctor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        return;
      }
      audioRef.current = new Ctor();
    };

    const tone = (freq: number, duration: number, type: OscillatorType, gain: number) => {
      const audio = audioRef.current;
      if (!audio) {
        return;
      }

      if (audio.state === "suspended") {
        void audio.resume();
      }

      const osc = audio.createOscillator();
      const amp = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audio.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(50, freq * 1.02),
        audio.currentTime + duration,
      );

      amp.gain.setValueAtTime(gain, audio.currentTime);
      amp.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);

      osc.connect(amp);
      amp.connect(audio.destination);
      osc.start();
      osc.stop(audio.currentTime + duration);
    };

    const emitParticles = (
      x: number,
      y: number,
      count: number,
      speed: number,
      hue: number,
      size = 5,
    ) => {
      for (let i = 0; i < count; i += 1) {
        const ang = random(0, Math.PI * 2);
        const vel = random(speed * 0.3, speed);
        particles.push({
          x,
          y,
          vx: Math.cos(ang) * vel,
          vy: Math.sin(ang) * vel,
          life: random(0.25, 0.65),
          maxLife: random(0.25, 0.65),
          size: random(size * 0.35, size),
          hue: hue + random(-10, 10),
          alpha: random(0.45, 1),
        });
      }
    };

    const addRipple = (x: number, y: number, maxR: number, hue: number) => {
      ripples.push({
        x,
        y,
        r: 8,
        maxR,
        life: 0.3,
        maxLife: 0.3,
        hue,
      });
    };

    const addShake = (amount: number) => {
      shake = clamp(shake + amount, 0, 28);
    };

    const spawnSpark = () => {
      sparks.push({
        x: random(24, width - 24),
        y: random(24, height - 24),
        vx: random(-40, 40),
        vy: random(-40, 40),
        r: random(4, 7),
        drift: random(0, Math.PI * 2),
      });
    };

    const spawnSeeker = () => {
      const side = Math.floor(random(0, 4));
      let x = 0;
      let y = 0;

      if (side === 0) {
        x = random(0, width);
        y = -30;
      } else if (side === 1) {
        x = width + 30;
        y = random(0, height);
      } else if (side === 2) {
        x = random(0, width);
        y = height + 30;
      } else {
        x = -30;
        y = random(0, height);
      }

      seekers.push({
        x,
        y,
        vx: random(-30, 30),
        vy: random(-30, 30),
        r: random(12, 18),
        speed: random(120, 170) + score * 0.6,
        stun: 0,
      });

      addRipple(x, y, 62, 355);
      tone(95, 0.1, "triangle", 0.02);
    };

    const collectSpark = (index: number, burstCollect = false) => {
      const spark = sparks[index];
      if (!spark) {
        return;
      }

      const gain = burstCollect ? 2 : 1;
      score += gain;
      combo += 1;
      energy += 0.08;
      addShake(burstCollect ? 5 : 2.2);
      emitParticles(spark.x, spark.y, burstCollect ? 18 : 10, burstCollect ? 240 : 170, 44, 7);
      addRipple(spark.x, spark.y, burstCollect ? 90 : 54, 42);
      sparks.splice(index, 1);

      if (score > best) {
        best = score;
        try {
          window.localStorage.setItem("neon-drift-best", String(best));
        } catch {
          // ignore storage write errors
        }
      }

      tone(random(520, 760), burstCollect ? 0.08 : 0.05, "square", burstCollect ? 0.04 : 0.03);
      refreshHud();
      bumpScore();
    };

    const resetRun = () => {
      score = 0;
      combo = 0;
      lives = 3;
      runOverTimer = 0;
      player.invuln = 1.1;
      player.x = width * 0.5;
      player.y = height * 0.5;
      player.vx = 0;
      player.vy = 0;
      sparks.length = 0;
      seekers.length = 0;
      particles.length = 0;
      ripples.length = 0;

      for (let i = 0; i < 22; i += 1) {
        spawnSpark();
      }

      refreshHud();
      updateStatus("Mouse to steer | WASD/Arrows also work | Click or Space = Pulse");
    };

    const doPulse = () => {
      if (burstCooldown > 0 || runOverTimer > 0) {
        return;
      }

      burstCooldown = 2;
      addShake(9);
      energy += 0.2;
      addRipple(player.x, player.y, 260, 194);
      emitParticles(player.x, player.y, 26, 280, 200, 8);
      tone(170, 0.12, "sawtooth", 0.04);

      for (let i = seekers.length - 1; i >= 0; i -= 1) {
        const s = seekers[i];
        const dx = s.x - player.x;
        const dy = s.y - player.y;
        const d2 = dx * dx + dy * dy;
        const radius = 235;

        if (d2 < radius * radius) {
          const d = Math.max(1, Math.sqrt(d2));
          const push = (1 - d / radius) * 520;
          s.vx += (dx / d) * push;
          s.vy += (dy / d) * push;
          s.stun = 0.25;
        }
      }

      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const spark = sparks[i];
        const dx = spark.x - player.x;
        const dy = spark.y - player.y;
        if (dx * dx + dy * dy < 180 * 180) {
          collectSpark(i, true);
        }
      }

      refreshHud();
      updateStatus("Pulse cooldown...");
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      player.x = clamp(player.x || width * 0.5, 16, width - 16);
      player.y = clamp(player.y || height * 0.5, 16, height - 16);
    };

    const update = (dt: number, now: number) => {
      energy = clamp(energy - dt * 0.1, 0.15, 1.2);
      shake = Math.max(0, shake - dt * 22);

      if (burstCooldown > 0) {
        burstCooldown = Math.max(0, burstCooldown - dt);
        if (burstCooldown === 0) {
          updateStatus("Pulse ready!");
          tone(300, 0.07, "triangle", 0.03);
        }
      }

      sparkSpawn -= dt;
      seekerSpawn -= dt;

      const sparkRate = clamp(0.13 - score * 0.0008, 0.045, 0.13);
      if (sparkSpawn <= 0) {
        sparkSpawn = sparkRate;
        if (sparks.length < 110) {
          spawnSpark();
        }
      }

      const seekerRate = clamp(2 - score * 0.012, 0.65, 2);
      if (seekerSpawn <= 0 && runOverTimer <= 0) {
        seekerSpawn = seekerRate;
        spawnSeeker();
      }

      const up = keys.has("arrowup") || keys.has("w");
      const down = keys.has("arrowdown") || keys.has("s");
      const left = keys.has("arrowleft") || keys.has("a");
      const right = keys.has("arrowright") || keys.has("d");
      const hasKeyboardIntent = up || down || left || right;

      if (hasKeyboardIntent) {
        const accel = 1300;
        const drag = 7;
        const ax = (Number(right) - Number(left)) * accel - player.vx * drag;
        const ay = (Number(down) - Number(up)) * accel - player.vy * drag;
        player.vx += ax * dt;
        player.vy += ay * dt;
      } else if (pointer.active && now - pointer.movedAt < 1200) {
        const dx = pointer.x - player.x;
        const dy = pointer.y - player.y;
        player.vx += (dx * 11 - player.vx * 7) * dt;
        player.vy += (dy * 11 - player.vy * 7) * dt;
      } else {
        player.vx *= 1 - dt * 5;
        player.vy *= 1 - dt * 5;
      }

      const maxSpeed = 430;
      const speed = Math.hypot(player.vx, player.vy);
      if (speed > maxSpeed) {
        const scale = maxSpeed / speed;
        player.vx *= scale;
        player.vy *= scale;
      }

      player.x = clamp(player.x + player.vx * dt, player.r, width - player.r);
      player.y = clamp(player.y + player.vy * dt, player.r, height - player.r);
      player.invuln = Math.max(0, player.invuln - dt);

      trail.push({ x: player.x, y: player.y });
      if (trail.length > 16) {
        trail.shift();
      }

      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const spark = sparks[i];
        spark.drift += dt * 7;
        spark.vx += Math.sin(spark.drift) * 30 * dt;
        spark.vy += Math.cos(spark.drift * 1.1) * 30 * dt;
        spark.vx *= 1 - dt * 1.8;
        spark.vy *= 1 - dt * 1.8;
        spark.x += spark.vx * dt;
        spark.y += spark.vy * dt;

        if (spark.x < spark.r || spark.x > width - spark.r) {
          spark.vx *= -0.85;
          spark.x = clamp(spark.x, spark.r, width - spark.r);
          emitParticles(spark.x, spark.y, 3, 85, 48, 4);
        }

        if (spark.y < spark.r || spark.y > height - spark.r) {
          spark.vy *= -0.85;
          spark.y = clamp(spark.y, spark.r, height - spark.r);
          emitParticles(spark.x, spark.y, 3, 85, 48, 4);
        }

        const dx = spark.x - player.x;
        const dy = spark.y - player.y;
        const rr = player.r + spark.r + 2;
        if (dx * dx + dy * dy <= rr * rr) {
          collectSpark(i, false);
        }
      }

      for (let i = seekers.length - 1; i >= 0; i -= 1) {
        const s = seekers[i];
        const dx = player.x - s.x;
        const dy = player.y - s.y;
        const d = Math.max(1, Math.hypot(dx, dy));

        if (s.stun > 0) {
          s.stun -= dt;
          s.vx *= 1 - dt * 4.2;
          s.vy *= 1 - dt * 4.2;
        } else {
          const steer = s.speed * dt;
          s.vx += (dx / d) * steer;
          s.vy += (dy / d) * steer;
        }

        s.vx *= 1 - dt * 1.6;
        s.vy *= 1 - dt * 1.6;
        s.x += s.vx * dt;
        s.y += s.vy * dt;

        if (s.x < -80 || s.x > width + 80 || s.y < -80 || s.y > height + 80) {
          seekers.splice(i, 1);
          continue;
        }

        const hitRadius = s.r + player.r - 2;
        if (player.invuln <= 0 && dx * dx + dy * dy < hitRadius * hitRadius) {
          lives -= 1;
          combo = 0;
          player.invuln = 1.15;
          addShake(18);
          emitParticles(player.x, player.y, 30, 320, 8, 9);
          addRipple(player.x, player.y, 150, 10);
          tone(84, 0.2, "sawtooth", 0.05);
          refreshHud();

          if (lives <= 0) {
            runOverTimer = 1.1;
            updateStatus("System crash! Rebooting...");
            tone(55, 0.35, "triangle", 0.045);
          }
        }
      }

      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        p.vx *= 1 - dt * 2.4;
        p.vy *= 1 - dt * 2.4;
        p.vy += 10 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      for (let i = ripples.length - 1; i >= 0; i -= 1) {
        const ripple = ripples[i];
        ripple.life -= dt;
        if (ripple.life <= 0) {
          ripples.splice(i, 1);
          continue;
        }

        const t = 1 - ripple.life / ripple.maxLife;
        ripple.r = 8 + ripple.maxR * t;
      }

      if (runOverTimer > 0) {
        runOverTimer -= dt;
        if (runOverTimer <= 0) {
          resetRun();
        }
      }

      refreshHud();
    };

    const draw = (now: number) => {
      const time = now * 0.001;
      const hazard = clamp(seekers.length / 15, 0, 1);

      const bg = ctx.createRadialGradient(
        width * 0.5 + Math.sin(time * 0.75) * width * 0.15,
        height * 0.5 + Math.cos(time * 0.58) * height * 0.15,
        60,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.85,
      );

      bg.addColorStop(0, `hsl(${196 + energy * 34} 76% ${11 + energy * 10}%)`);
      bg.addColorStop(1, `hsl(${228 + hazard * 22} 45% 6%)`);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      ctx.globalAlpha = 0.18 + energy * 0.2;
      ctx.strokeStyle = `hsl(${188 + hazard * 30} 65% 58%)`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 24; i += 1) {
        const y = (i / 23) * height + Math.sin(time * 1.1 + i * 0.58) * (8 + energy * 18);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y + Math.cos(time * 0.9 + i) * (8 + hazard * 14));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      const shakeX = shake > 0.2 ? random(-shake, shake) : 0;
      const shakeY = shake > 0.2 ? random(-shake, shake) : 0;
      ctx.save();
      ctx.translate(shakeX, shakeY);

      for (const ripple of ripples) {
        const alpha = clamp(ripple.life / ripple.maxLife, 0, 1);
        ctx.strokeStyle = `hsla(${ripple.hue} 90% 70% / ${alpha * 0.85})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ripple.x, ripple.y, ripple.r, 0, Math.PI * 2);
        ctx.stroke();
      }

      for (const spark of sparks) {
        ctx.fillStyle = "hsl(47 100% 64%)";
        ctx.shadowColor = "hsl(49 100% 67%)";
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(spark.x, spark.y, spark.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      for (const s of seekers) {
        const speedGlow = clamp(Math.hypot(s.vx, s.vy) / 210, 0, 1);
        ctx.fillStyle = `hsl(${350 + speedGlow * 10} 82% ${53 + speedGlow * 8}%)`;
        ctx.shadowColor = "hsl(357 90% 58%)";
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.beginPath();
        ctx.arc(s.x + s.r * 0.2, s.y - s.r * 0.2, s.r * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      for (const p of particles) {
        const alpha = (p.life / p.maxLife) * p.alpha;
        ctx.fillStyle = `hsla(${p.hue} 95% 64% / ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.45 + alpha), 0, Math.PI * 2);
        ctx.fill();
      }

      for (let i = 0; i < trail.length; i += 1) {
        const t = i / Math.max(1, trail.length - 1);
        const node = trail[i];
        ctx.fillStyle = `hsla(191 95% 70% / ${t * 0.4})`;
        ctx.beginPath();
        ctx.arc(node.x, node.y, player.r * (0.2 + t * 0.45), 0, Math.PI * 2);
        ctx.fill();
      }

      const blink = player.invuln > 0 && Math.sin(time * 42) > 0.25;
      if (!blink) {
        ctx.fillStyle = "hsl(188 100% 62%)";
        ctx.shadowColor = "hsl(187 100% 65%)";
        ctx.shadowBlur = 24;
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.arc(player.x - player.r * 0.22, player.y - player.r * 0.22, player.r * 0.24, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.shadowBlur = 0;
      ctx.restore();
    };

    const frame = (now: number) => {
      if (!lastTime) {
        lastTime = now;
      }

      const dt = clamp((now - lastTime) / 1000, 0, 0.033);
      lastTime = now;

      update(dt, now);
      draw(now);
      raf = window.requestAnimationFrame(frame);
    };

    const onMove = (event: MouseEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
      pointer.movedAt = performance.now();
    };

    const onLeave = () => {
      pointer.active = false;
    };

    const onMouseDown = () => {
      unlockAudio();
      doPulse();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      keys.add(key);
      unlockAudio();

      if (key === " ") {
        event.preventDefault();
        doPulse();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keys.delete(event.key.toLowerCase());
    };

    resize();
    resetRun();
    refreshHud();

    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    raf = window.requestAnimationFrame(frame);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      if (audioRef.current && audioRef.current.state !== "closed") {
        void audioRef.current.close();
      }
    };
  }, []);

  return (
    <main className="game-root">
      <canvas ref={canvasRef} className="game-canvas" aria-label="Neon Drift game canvas" />

      <div className="hud-top">
        <div className="hud-chip score-chip">
          <span className="hud-label">Score</span>
          <span ref={scoreValueRef} className="hud-value">
            <span ref={scoreRef}>0</span>
          </span>
        </div>
        <div className="hud-chip">
          <span className="hud-label">Best</span>
          <span ref={bestRef} className="hud-value">
            0
          </span>
        </div>
        <div className="hud-chip">
          <span className="hud-label">Combo</span>
          <span ref={comboRef} className="hud-value">
            0x
          </span>
        </div>
        <div className="hud-chip danger">
          <span className="hud-label">Lives</span>
          <span ref={livesRef} className="hud-value">
            3
          </span>
        </div>
      </div>

      <div className="hud-bottom">
        <div className="pulse-wrap">
          <div className="pulse-track">
            <div ref={burstFillRef} className="pulse-fill" />
          </div>
          <span ref={statusRef} className="status-text">
            Mouse to steer | WASD/Arrows also work | Click or Space = Pulse
          </span>
        </div>
      </div>
    </main>
  );
}
