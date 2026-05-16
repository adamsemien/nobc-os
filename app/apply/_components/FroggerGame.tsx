'use client';

import React, { useEffect, useRef, useCallback } from 'react';

interface FroggerGameProps {
  onClose: () => void;
}

const CELL = 32;

interface Vehicle {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  direction: 1 | -1; // 1 = right, -1 = left
  color: string;
  label?: string;
  type: 'tesla' | 'waymo' | 'foodtruck';
}

interface Lane {
  y: number;
  direction: 1 | -1;
  speed: number;
  color: string;
  label?: string;
  type: 'tesla' | 'waymo' | 'foodtruck';
  count: number;
}

export default function FroggerGame({ onClose }: FroggerGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameStateRef = useRef({
    frogX: 0,
    frogY: 0,
    vehicles: [] as Vehicle[],
    score: 0,
    lives: 5,
    status: 'playing' as 'playing' | 'dead' | 'won',
    messageTimer: 0,
    canvasWidth: 500,
    canvasHeight: 600,
    cellSize: CELL,
    lanes: [] as (Lane & { laneY: number })[],
    winZoneY: 0,
    startY: 0,
    animFrame: 0,
    lastMoveTime: 0,
  });

  const initGame = useCallback((canvas: HTMLCanvasElement) => {
    const w = Math.min(500, window.innerWidth - 40);
    const h = Math.round(w * 1.2);
    canvas.width = w;
    canvas.height = h;

    const state = gameStateRef.current;
    state.canvasWidth = w;
    state.canvasHeight = h;

    // Layout: topPad, winZone (1 cell), 9 lanes, startZone (1 cell), bottomPad
    const totalRows = 11; // win + 9 lanes + start
    const cellSize = Math.floor(h / (totalRows + 2));
    state.cellSize = cellSize;

    const topPad = cellSize;
    const winZoneY = topPad;
    const laneStartY = winZoneY + cellSize;
    const startY = laneStartY + 9 * cellSize;
    state.winZoneY = winZoneY;
    state.startY = startY;

    // Frog starting position
    state.frogX = Math.floor(w / 2 / cellSize) * cellSize;
    state.frogY = startY;

    // Lane definitions (top of lane = laneStartY + index * cellSize)
    // Speeds reduced by 40% for easier gameplay
    type LaneConfig = Omit<Lane, 'y'>;
    const laneConfigs: LaneConfig[] = [
      // Northbound upper (moving left, lanes 9-6 top to bottom in game = lanes closest to win zone)
      { direction: -1, speed: 1.5, color: '#CC3333', type: 'tesla', count: 2 },
      { direction: -1, speed: 0.9, color: '#FF8833', label: 'TACOS', type: 'foodtruck', count: 2 },
      // Safe zone 1 (index 2) - no vehicles
      { direction: -1, speed: 1.2, color: '#3366BB', label: 'WAYMO', type: 'waymo', count: 2 },
      // Median lane (index 4) - no vehicles, this is the main safe zone
      // Southbound lower (moving right)
      { direction: 1, speed: 1.2, color: '#3366BB', label: 'WAYMO', type: 'waymo', count: 2 },
      // Safe zone 2 (index 6) - no vehicles
      { direction: 1, speed: 0.9, color: '#FF8833', label: 'TACOS', type: 'foodtruck', count: 2 },
      { direction: 1, speed: 1.5, color: '#CC3333', type: 'tesla', count: 2 },
    ];

    // Build lanes array with y positions (skip safe zones at index 2, 4, 6)
    const lanes: (Lane & { laneY: number })[] = [];
    let laneIdx = 0;
    for (let i = 0; i < 9; i++) {
      const laneY = laneStartY + i * cellSize;
      if (i === 2 || i === 4 || i === 6) {
        // safe zones - no config
        continue;
      }
      const cfg = laneConfigs[laneIdx++];
      lanes.push({ ...cfg, y: laneY, laneY });
    }
    state.lanes = lanes;

    // Build vehicles
    const vehicles: Vehicle[] = [];
    const vehicleWidth = cellSize * 2;
    const vehicleHeight = Math.round(cellSize * 0.7);

    for (const lane of lanes) {
      const spacing = w / lane.count;
      for (let i = 0; i < lane.count; i++) {
        const startX = lane.direction === 1
          ? -vehicleWidth + i * spacing
          : w + i * spacing;
        vehicles.push({
          x: startX,
          y: lane.laneY + Math.round((cellSize - vehicleHeight) / 2),
          width: vehicleWidth,
          height: vehicleHeight,
          speed: lane.speed,
          direction: lane.direction,
          color: lane.color,
          label: lane.label,
          type: lane.type,
        });
      }
    }
    state.vehicles = vehicles;
    state.status = 'playing';
    state.messageTimer = 0;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;

    initGame(canvas);

    const state = gameStateRef.current;

    function drawRoundRect(
      ctx: CanvasRenderingContext2D,
      x: number, y: number,
      w: number, h: number,
      r: number
    ) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    }

    function drawVehicle(ctx: CanvasRenderingContext2D, v: Vehicle) {
      const r = 6;
      ctx.fillStyle = v.color;
      drawRoundRect(ctx, v.x, v.y, v.width, v.height, r);
      ctx.fill();

      // Add glow effect
      ctx.shadowBlur = 8;
      ctx.shadowColor = v.color;

      if (v.type === 'tesla') {
        // T logo
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(v.height * 0.6)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('T', v.x + v.width / 2, v.y + v.height / 2);
        ctx.shadowBlur = 0;
      } else if (v.type === 'waymo') {
        // WAYMO text in small white
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(v.height * 0.35)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('WAYMO', v.x + v.width / 2, v.y + v.height / 2);
        ctx.shadowBlur = 0;
      } else if (v.type === 'foodtruck') {
        // Taco emoji
        ctx.font = `${Math.round(v.height * 0.6)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🌮', v.x + v.width / 2, v.y + v.height / 2);
        ctx.shadowBlur = 0;
      }
      ctx.shadowBlur = 0;
    }

    function drawFrog(ctx: CanvasRenderingContext2D, now: number) {
      const cs = state.cellSize;
      const cx = state.frogX + cs / 2;
      const cy = state.frogY + cs / 2;

      // Hop animation — scale 1.0 to 1.15 and back over 100ms after move
      const elapsed = now - state.lastMoveTime;
      let scale = 1.0;
      if (elapsed < 100) {
        const t = elapsed / 100;
        scale = 1.0 + 0.15 * Math.sin(t * Math.PI);
      }

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#00ff66';
      ctx.font = `${Math.round(cs * 0.8)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\u{1F438}', 0, 0);
      ctx.restore();
    }

    function draw() {
      const { canvasWidth: W, canvasHeight: H, cellSize: cs } = state;
      ctx.clearRect(0, 0, W, H);

      // Background - Austin night sky gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, H);
      gradient.addColorStop(0, '#1a0a2e');
      gradient.addColorStop(0.3, '#16213e');
      gradient.addColorStop(1, '#0f1419');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, W, H);

      // Win zone
      ctx.fillStyle = 'rgba(255, 107, 138, 0.15)';
      ctx.fillRect(0, state.winZoneY, W, cs);

      // "I love you so much" mural with glow
      ctx.save();
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#ff6b8a';
      ctx.fillStyle = '#ff6b8a';
      ctx.font = `bold ${Math.round(cs * 0.55)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('I love you so much', W / 2, state.winZoneY + cs / 2);
      ctx.restore();

      // Lane stripes
      const laneStartY = state.winZoneY + cs;
      for (let i = 0; i < 9; i++) {
        const laneY = laneStartY + i * cs;
        if (i === 2 || i === 4 || i === 6) {
          // Safe zones with green tint
          ctx.fillStyle = 'rgba(100,255,150,0.08)';
          ctx.fillRect(0, laneY, W, cs);
          if (i === 4) {
            ctx.fillStyle = '#cccc88';
            ctx.font = `${Math.round(cs * 0.38)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('S Congress Ave', W / 2, laneY + cs / 2);
          }
        } else {
          ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.1)';
          ctx.fillRect(0, laneY, W, cs);
          // Dashed lane markers
          ctx.setLineDash([cs * 0.3, cs * 0.3]);
          ctx.strokeStyle = 'rgba(255,255,255,0.08)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, laneY + cs);
          ctx.lineTo(W, laneY + cs);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Start zone
      ctx.fillStyle = 'rgba(100, 200, 100, 0.08)';
      ctx.fillRect(0, state.startY, W, cs);

      // Vehicles
      for (const v of state.vehicles) {
        drawVehicle(ctx, v);
      }

      // Frog
      drawFrog(ctx, performance.now());

      // Lives display (top left)
      ctx.fillStyle = '#ffffff';
      ctx.font = `${Math.round(cs * 0.5)}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const heartsDisplay = '\u{1F438}'.repeat(state.lives);
      ctx.fillText(heartsDisplay, 8, 8);

      // Score (below lives)
      ctx.font = `${Math.round(cs * 0.35)}px monospace`;
      ctx.fillText(`score: ${state.score}`, 8, 8 + cs * 0.6);

      // Scanline overlay
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      for (let y = 0; y < H; y += 4) {
        ctx.fillRect(0, y, W, 2);
      }

      // Status messages
      if (state.status === 'dead' || state.status === 'won') {
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, W, H);

        // Italic serif font for cinematic feel
        ctx.fillStyle = '#ffffff';
        ctx.font = `italic ${Math.round(cs * 0.65)}px Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const msg = state.status === 'dead'
          ? 'got got on soco. try again?'
          : 'you made it. welcome home. \u{1F438}';
        // Wrap text
        const maxW = W * 0.85;
        const words = msg.split(' ');
        const lines: string[] = [];
        let line = '';
        for (const word of words) {
          const test = line ? `${line} ${word}` : word;
          if (ctx.measureText(test).width > maxW && line) {
            lines.push(line);
            line = word;
          } else {
            line = test;
          }
        }
        if (line) lines.push(line);

        const lineH = cs * 0.75;
        const totalH = lines.length * lineH;
        lines.forEach((l, i) => {
          ctx.fillText(l, W / 2, H / 2 - totalH / 2 + i * lineH + lineH / 2);
        });
      }
    }

    function checkCollision() {
      const cs = state.cellSize;
      const fx = state.frogX + 4;
      const fy = state.frogY + 4;
      const fw = cs - 8;
      const fh = cs - 8;

      for (const v of state.vehicles) {
        if (
          fx < v.x + v.width &&
          fx + fw > v.x &&
          fy < v.y + v.height &&
          fy + fh > v.y
        ) {
          return true;
        }
      }
      return false;
    }

    function resetFrog() {
      const cs = state.cellSize;
      state.frogX = Math.floor(state.canvasWidth / 2 / cs) * cs;
      state.frogY = state.startY;
    }

    let lastTime = 0;

    function gameLoop(ts: number) {
      const dt = ts - lastTime;
      lastTime = ts;

      if (state.status === 'playing') {
        // Move vehicles
        for (const v of state.vehicles) {
          v.x += v.speed * v.direction;
          // Wrap around
          if (v.direction === 1 && v.x > state.canvasWidth) {
            v.x = -v.width;
          } else if (v.direction === -1 && v.x + v.width < 0) {
            v.x = state.canvasWidth;
          }
        }

        // Check collision - lose a life
        if (checkCollision()) {
          state.lives -= 1;
          if (state.lives <= 0) {
            state.status = 'dead';
            state.messageTimer = ts;
          } else {
            // Reset frog position but keep playing
            resetFrog();
          }
        }

        // Check win
        if (state.frogY <= state.winZoneY) {
          state.status = 'won';
          state.score += 1;
          state.messageTimer = ts;
        }
      } else {
        // After 2s, reset frog to start but keep message shown
        // Actually: show message, then reset. Per spec: show message, don't auto-restart.
        // We just keep showing the message. Player must press a key or button to continue.
        // Reset happens on next key press (handled in keydown).
        void dt;
      }

      draw();
      state.animFrame = requestAnimationFrame(gameLoop);
    }

    state.animFrame = requestAnimationFrame(gameLoop);

    function handleKey(e: KeyboardEvent) {
      const cs = state.cellSize;
      const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (!arrowKeys.includes(e.key)) return;
      e.preventDefault();

      if (state.status !== 'playing') {
        // Reset on key press after death/win
        state.status = 'playing';
        state.lives = 5;
        resetFrog();
        return;
      }

      const laneStartY = state.winZoneY + cs;
      const bottomBound = state.startY;
      const topBound = state.winZoneY;

      switch (e.key) {
        case 'ArrowUp':
          state.frogY = Math.max(topBound, state.frogY - cs);
          break;
        case 'ArrowDown':
          state.frogY = Math.min(bottomBound, state.frogY + cs);
          break;
        case 'ArrowLeft':
          state.frogX = Math.max(0, state.frogX - cs);
          break;
        case 'ArrowRight':
          state.frogX = Math.min(state.canvasWidth - cs, state.frogX + cs);
          break;
      }
      state.lastMoveTime = performance.now();
      void laneStartY;
    }

    window.addEventListener('keydown', handleKey);

    return () => {
      cancelAnimationFrame(state.animFrame);
      window.removeEventListener('keydown', handleKey);
    };
  }, [initGame]);

  // Mobile controls
  function moveFrog(dir: 'up' | 'down' | 'left' | 'right') {
    const state = gameStateRef.current;
    const cs = state.cellSize;

    if (state.status !== 'playing') {
      state.status = 'playing';
      state.lives = 5;
      state.frogX = Math.floor(state.canvasWidth / 2 / cs) * cs;
      state.frogY = state.startY;
      return;
    }

    switch (dir) {
      case 'up':
        state.frogY = Math.max(state.winZoneY, state.frogY - cs);
        break;
      case 'down':
        state.frogY = Math.min(state.startY, state.frogY + cs);
        break;
      case 'left':
        state.frogX = Math.max(0, state.frogX - cs);
        break;
      case 'right':
        state.frogX = Math.min(state.canvasWidth - cs, state.frogX + cs);
        break;
    }
    state.lastMoveTime = performance.now();
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.95)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      {/* Header */}
      <div
        style={{
          width: '100%',
          maxWidth: 540,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px 8px',
        }}
      >
        <span style={{ color: '#ffffff', fontFamily: 'monospace', fontSize: 18, fontWeight: 'bold' }}>
          South Congress Frogger
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#ffffff',
            fontSize: 28,
            cursor: 'pointer',
            lineHeight: 1,
            padding: '0 4px',
          }}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{ display: 'block', borderRadius: 8 }}
      />

      {/* Mobile controls */}
      <div
        style={{
          marginTop: 16,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 48px)',
          gridTemplateRows: 'repeat(3, 48px)',
          gap: 4,
        }}
      >
        {/* Up */}
        <div style={{ gridColumn: 2, gridRow: 1 }}>
          <MobileBtn label="▲" onClick={() => moveFrog('up')} />
        </div>
        {/* Left */}
        <div style={{ gridColumn: 1, gridRow: 2 }}>
          <MobileBtn label="◀" onClick={() => moveFrog('left')} />
        </div>
        {/* Down */}
        <div style={{ gridColumn: 2, gridRow: 2 }}>
          <MobileBtn label="▼" onClick={() => moveFrog('down')} />
        </div>
        {/* Right */}
        <div style={{ gridColumn: 3, gridRow: 2 }}>
          <MobileBtn label="▶" onClick={() => moveFrog('right')} />
        </div>
      </div>
    </div>
  );
}

function MobileBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); onClick(); }}
      style={{
        width: 48,
        height: 48,
        background: 'rgba(255,255,255,0.12)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 8,
        color: '#ffffff',
        fontSize: 20,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      aria-label={label}
    >
      {label}
    </button>
  );
}
