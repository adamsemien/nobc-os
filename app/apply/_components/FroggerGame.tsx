'use client';

import React, { useEffect, useRef, useCallback } from 'react';

interface FroggerGameProps {
  onClose: () => void;
}

const CELL = 32;

/** The SoCo-at-dusk diorama palette. Fixed scene art for a self-contained
 *  easter-egg overlay (this file's established idiom) - not themeable UI. */
const P = {
  skyTop: '#0d0a24',
  skyMid: '#2b1a4a',
  skyLow: '#57284a',
  star: 'rgba(255,244,214,0.9)',
  moon: '#f4ecd8',
  skyline: '#151129',
  windowLit: 'rgba(255,208,120,0.85)',
  wall: '#0f7d4b',
  wallDark: '#0a5c37',
  wallLight: '#169159',
  script: '#e6413c',
  sidewalk: '#7d766a',
  sidewalkLight: '#8d8578',
  joint: 'rgba(0,0,0,0.22)',
  asphalt: '#26262c',
  asphaltLight: '#313138',
  lanePaint: 'rgba(240,235,220,0.5)',
  centerPaint: '#d9a422',
  tire: '#131318',
  hub: '#9aa0a8',
  glass: '#8fb8e0',
  glassDeep: '#3d5f8a',
  glassHi: 'rgba(255,255,255,0.55)',
  teslaPaint: '#c22f3a',
  teslaDark: '#701822',
  waymoPaint: '#eef1f4',
  waymoDark: '#b9c0c9',
  waymoTeal: '#19b5a5',
  truckPaint: '#e8862f',
  truckDark: '#9a5314',
  truckPanel: '#f4e9d6',
  headlight: 'rgba(255,236,170,0.95)',
  headBeam: 'rgba(255,236,170,0.16)',
  tail: '#ff5148',
  frog: '#46b254',
  frogDark: '#2c8038',
  frogBelly: '#c8ecac',
  frogSpot: '#256b30',
  eyeWhite: '#f5f8ef',
  pupil: '#101510',
  shadow: 'rgba(0,0,0,0.38)',
} as const;

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

    function paintGrad(top: string, bottom: string, y: number, h: number) {
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, top);
      g.addColorStop(0.45, top);
      g.addColorStop(1, bottom);
      return g;
    }

    function wheel(cx: number, cy: number, r: number) {
      ctx.fillStyle = P.tire;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = P.hub;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.52, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = P.tire;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }

    /** Side-view vehicles with paint, glass, wheels, and working lights.
     *  Drawn as if moving right, mirrored for leftbound traffic; the
     *  collision box (v.x/y/width/height) is untouched. */
    function drawVehicle(ctx: CanvasRenderingContext2D, v: Vehicle) {
      const { x, y, width: w, height: h } = v;
      const cx = x + w / 2;
      ctx.save();
      if (v.direction === -1) {
        ctx.translate(cx, 0);
        ctx.scale(-1, 1);
        ctx.translate(-cx, 0);
      }

      // Ground shadow
      ctx.fillStyle = P.shadow;
      ctx.beginPath();
      ctx.ellipse(cx, y + h + 2, w * 0.48, h * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();

      const wheelR = h * 0.3;
      const bodyBottom = y + h - wheelR * 0.45;

      if (v.type === 'tesla') {
        // Sleek sedan: cabin arc, then the lower body over it.
        ctx.fillStyle = paintGrad(P.teslaPaint, P.teslaDark, y, h);
        ctx.beginPath();
        ctx.moveTo(x + w * 0.16, y + h * 0.5);
        ctx.quadraticCurveTo(x + w * 0.26, y + h * 0.06, x + w * 0.5, y + h * 0.05);
        ctx.quadraticCurveTo(x + w * 0.7, y + h * 0.06, x + w * 0.82, y + h * 0.5);
        ctx.closePath();
        ctx.fill();
        // glass
        ctx.fillStyle = paintGrad(P.glass, P.glassDeep, y + h * 0.1, h * 0.35);
        ctx.beginPath();
        ctx.moveTo(x + w * 0.23, y + h * 0.45);
        ctx.quadraticCurveTo(x + w * 0.3, y + h * 0.13, x + w * 0.49, y + h * 0.12);
        ctx.lineTo(x + w * 0.49, y + h * 0.45);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + w * 0.53, y + h * 0.12);
        ctx.quadraticCurveTo(x + w * 0.68, y + h * 0.13, x + w * 0.76, y + h * 0.45);
        ctx.lineTo(x + w * 0.53, y + h * 0.45);
        ctx.closePath();
        ctx.fill();
        // lower body
        ctx.fillStyle = paintGrad(P.teslaPaint, P.teslaDark, y + h * 0.4, h * 0.6);
        drawRoundRect(ctx, x + w * 0.02, y + h * 0.42, w * 0.96, bodyBottom - (y + h * 0.42), h * 0.14);
        ctx.fill();
        // door seam + handle + reflection line
        ctx.strokeStyle = 'rgba(0,0,0,0.28)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.51, y + h * 0.46);
        ctx.lineTo(x + w * 0.51, bodyBottom - 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(x + w * 0.44, y + h * 0.52, w * 0.06, 1.5);
        ctx.fillRect(x + w * 0.56, y + h * 0.52, w * 0.06, 1.5);
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fillRect(x + w * 0.05, y + h * 0.6, w * 0.9, 1.5);
        wheel(x + w * 0.24, y + h - wheelR * 0.4, wheelR);
        wheel(x + w * 0.76, y + h - wheelR * 0.4, wheelR);
      } else if (v.type === 'waymo') {
        // Boxy white crossover with the roof sensor rig.
        ctx.fillStyle = paintGrad(P.waymoPaint, P.waymoDark, y, h);
        ctx.beginPath();
        ctx.moveTo(x + w * 0.1, y + h * 0.48);
        ctx.quadraticCurveTo(x + w * 0.15, y + h * 0.1, x + w * 0.32, y + h * 0.08);
        ctx.lineTo(x + w * 0.72, y + h * 0.08);
        ctx.quadraticCurveTo(x + w * 0.84, y + h * 0.12, x + w * 0.88, y + h * 0.48);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = paintGrad(P.glass, P.glassDeep, y + h * 0.12, h * 0.35);
        ctx.beginPath();
        ctx.moveTo(x + w * 0.2, y + h * 0.45);
        ctx.quadraticCurveTo(x + w * 0.23, y + h * 0.16, x + w * 0.34, y + h * 0.15);
        ctx.lineTo(x + w * 0.68, y + h * 0.15);
        ctx.quadraticCurveTo(x + w * 0.76, y + h * 0.18, x + w * 0.8, y + h * 0.45);
        ctx.closePath();
        ctx.fill();
        // pillars
        ctx.strokeStyle = P.waymoPaint;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.51, y + h * 0.15);
        ctx.lineTo(x + w * 0.51, y + h * 0.45);
        ctx.stroke();
        ctx.fillStyle = paintGrad(P.waymoPaint, P.waymoDark, y + h * 0.4, h * 0.6);
        drawRoundRect(ctx, x + w * 0.03, y + h * 0.42, w * 0.92, bodyBottom - (y + h * 0.42), h * 0.12);
        ctx.fill();
        // roof lidar dome + spinning ring
        ctx.fillStyle = P.waymoPaint;
        drawRoundRect(ctx, cx - w * 0.08, y - h * 0.14, w * 0.16, h * 0.16, 3);
        ctx.fill();
        ctx.fillStyle = P.waymoTeal;
        ctx.beginPath();
        ctx.arc(cx, y - h * 0.13, h * 0.07, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(cx + Math.cos(performance.now() / 180) * h * 0.05, y - h * 0.13, 1.4, 0, Math.PI * 2);
        ctx.fill();
        // bumper sensors
        ctx.fillStyle = P.waymoTeal;
        ctx.fillRect(x + w * 0.9, y + h * 0.55, 3, 3);
        ctx.fillRect(x + w * 0.07, y + h * 0.55, 3, 3);
        wheel(x + w * 0.25, y + h - wheelR * 0.4, wheelR);
        wheel(x + w * 0.75, y + h - wheelR * 0.4, wheelR);
      } else {
        // Taco truck: step van, service window, awning, string lights.
        ctx.fillStyle = paintGrad(P.truckPaint, P.truckDark, y - h * 0.12, h * 1.1);
        drawRoundRect(ctx, x + w * 0.02, y - h * 0.12, w * 0.76, bodyBottom - (y - h * 0.12), 4);
        ctx.fill();
        // cab
        ctx.fillStyle = paintGrad(P.truckPaint, P.truckDark, y + h * 0.08, h * 0.9);
        ctx.beginPath();
        ctx.moveTo(x + w * 0.78, y + h * 0.08);
        ctx.lineTo(x + w * 0.9, y + h * 0.12);
        ctx.quadraticCurveTo(x + w * 0.98, y + h * 0.3, x + w * 0.98, y + h * 0.55);
        ctx.lineTo(x + w * 0.98, bodyBottom);
        ctx.lineTo(x + w * 0.78, bodyBottom);
        ctx.closePath();
        ctx.fill();
        // windshield
        ctx.fillStyle = paintGrad(P.glass, P.glassDeep, y + h * 0.14, h * 0.3);
        ctx.beginPath();
        ctx.moveTo(x + w * 0.8, y + h * 0.14);
        ctx.lineTo(x + w * 0.88, y + h * 0.17);
        ctx.quadraticCurveTo(x + w * 0.94, y + h * 0.3, x + w * 0.94, y + h * 0.44);
        ctx.lineTo(x + w * 0.8, y + h * 0.44);
        ctx.closePath();
        ctx.fill();
        // service panel + window + striped awning
        ctx.fillStyle = P.truckPanel;
        drawRoundRect(ctx, x + w * 0.08, y + h * 0.02, w * 0.62, h * 0.62, 3);
        ctx.fill();
        ctx.fillStyle = P.glassDeep;
        ctx.fillRect(x + w * 0.14, y + h * 0.1, w * 0.34, h * 0.34);
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = i % 2 === 0 ? P.script : P.truckPanel;
          ctx.beginPath();
          const ax = x + w * 0.12 + i * w * 0.1;
          ctx.moveTo(ax, y + h * 0.02);
          ctx.lineTo(ax + w * 0.1, y + h * 0.02);
          ctx.lineTo(ax + w * 0.09, y + h * 0.14);
          ctx.lineTo(ax + w * 0.01, y + h * 0.14);
          ctx.closePath();
          ctx.fill();
        }
        // string lights along the roofline
        for (let i = 0; i < 6; i++) {
          const lx = x + w * 0.06 + i * w * 0.12;
          const ly = y - h * 0.13 + Math.sin(i * 1.4) * 1.6 + 2;
          ctx.fillStyle = P.headlight;
          ctx.beginPath();
          ctx.arc(lx, ly, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
        wheel(x + w * 0.2, y + h - wheelR * 0.4, wheelR * 0.95);
        wheel(x + w * 0.38, y + h - wheelR * 0.4, wheelR * 0.95);
        wheel(x + w * 0.86, y + h - wheelR * 0.4, wheelR * 0.95);
      }

      // Working lights: headlight beam ahead, taillight behind.
      const noseX = x + w * 0.985;
      const lampY = y + h * 0.52;
      ctx.fillStyle = P.headBeam;
      ctx.beginPath();
      ctx.moveTo(noseX, lampY - h * 0.1);
      ctx.lineTo(noseX + w * 0.5, lampY - h * 0.34);
      ctx.lineTo(noseX + w * 0.5, lampY + h * 0.34);
      ctx.lineTo(noseX, lampY + h * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.shadowBlur = 6;
      ctx.shadowColor = P.headlight;
      ctx.fillStyle = P.headlight;
      ctx.beginPath();
      ctx.arc(noseX, lampY, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = P.tail;
      ctx.fillStyle = P.tail;
      drawRoundRect(ctx, x + w * 0.01, y + h * 0.46, 3, h * 0.16, 1.5);
      ctx.fill();
      ctx.restore();

      ctx.restore();

      // Livery text drawn unmirrored so it always reads correctly.
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (v.type === 'waymo') {
        ctx.fillStyle = 'rgba(90,100,112,0.9)';
        ctx.font = `700 ${Math.max(7, Math.round(h * 0.22))}px ui-sans-serif, system-ui`;
        ctx.fillText('WAYMO', v.direction === 1 ? x + w * 0.34 : x + w * 0.66, y + h * 0.62);
      } else if (v.type === 'foodtruck') {
        ctx.fillStyle = P.script;
        ctx.font = `italic 700 ${Math.max(9, Math.round(h * 0.3))}px Georgia, serif`;
        ctx.fillText('TACOS', v.direction === 1 ? x + w * 0.39 : x + w * 0.61, y + h * 0.52);
      }
    }

    function drawFrog(ctx: CanvasRenderingContext2D, now: number) {
      const cs = state.cellSize;
      const cx = state.frogX + cs / 2;
      const cy = state.frogY + cs / 2;
      const R = cs * 0.34;

      // Hop: squash-and-stretch plus extended back legs, 130ms per hop.
      const elapsed = now - state.lastMoveTime;
      const hop = elapsed < 130 ? Math.sin((elapsed / 130) * Math.PI) : 0;

      // Ground shadow (tightens mid-hop).
      ctx.fillStyle = P.shadow;
      ctx.beginPath();
      ctx.ellipse(cx, cy + R * 0.9, R * 0.85 * (1 - hop * 0.3), R * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(cx, cy - hop * R * 0.5);
      ctx.scale(1 + hop * 0.12, 1 - hop * 0.08);

      // Back haunches / extended legs.
      for (const side of [-1, 1] as const) {
        ctx.fillStyle = P.frogDark;
        ctx.beginPath();
        if (hop > 0.15) {
          // legs kicked out behind
          ctx.ellipse(side * R * (0.9 + hop * 0.35), R * (0.45 + hop * 0.45), R * 0.5, R * 0.22, side * 0.9, 0, Math.PI * 2);
        } else {
          ctx.ellipse(side * R * 0.85, R * 0.3, R * 0.52, R * 0.38, side * 0.5, 0, Math.PI * 2);
        }
        ctx.fill();
        // webbed toes
        ctx.strokeStyle = P.frogDark;
        ctx.lineWidth = Math.max(1.5, R * 0.09);
        ctx.lineCap = 'round';
        const footX = side * R * (1.15 + hop * 0.35);
        const footY = R * (0.62 + hop * 0.5);
        for (const t of [-0.3, 0, 0.3]) {
          ctx.beginPath();
          ctx.moveTo(footX - side * R * 0.15, footY);
          ctx.lineTo(footX + side * R * 0.18 + t * R * 0.2 * side, footY + R * 0.16 + Math.abs(t) * R * 0.05);
          ctx.stroke();
        }
      }

      // Body.
      const bodyGrad = ctx.createLinearGradient(0, -R, 0, R);
      bodyGrad.addColorStop(0, P.frog);
      bodyGrad.addColorStop(1, P.frogDark);
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.ellipse(0, 0, R * 0.8, R * 0.88, 0, 0, Math.PI * 2);
      ctx.fill();
      // Belly.
      ctx.fillStyle = P.frogBelly;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.ellipse(0, R * 0.3, R * 0.5, R * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // Spots.
      ctx.fillStyle = P.frogSpot;
      for (const [sx, sy] of [[-0.38, -0.2], [0.32, -0.36], [0.06, 0.02], [-0.15, -0.5]] as const) {
        ctx.beginPath();
        ctx.arc(sx * R, sy * R, R * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }

      // Front feet.
      ctx.strokeStyle = P.frogDark;
      ctx.lineWidth = Math.max(1.5, R * 0.1);
      for (const side of [-1, 1] as const) {
        ctx.beginPath();
        ctx.moveTo(side * R * 0.34, R * 0.5);
        ctx.lineTo(side * R * 0.42, R * 0.82);
        ctx.stroke();
        for (const t of [-1, 0, 1]) {
          ctx.beginPath();
          ctx.moveTo(side * R * 0.42, R * 0.82);
          ctx.lineTo(side * R * 0.42 + t * R * 0.12, R * 0.94);
          ctx.stroke();
        }
      }

      // Eye turrets.
      for (const side of [-1, 1] as const) {
        const ex = side * R * 0.42;
        const ey = -R * 0.72;
        ctx.fillStyle = P.frog;
        ctx.beginPath();
        ctx.arc(ex, ey, R * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = P.frogDark;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = P.eyeWhite;
        ctx.beginPath();
        ctx.arc(ex, ey - R * 0.04, R * 0.19, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = P.pupil;
        ctx.beginPath();
        ctx.ellipse(ex, ey - R * 0.05, R * 0.07, R * 0.11, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(ex + R * 0.05, ey - R * 0.12, R * 0.04, 0, Math.PI * 2);
        ctx.fill();
      }

      // Mouth + nostrils.
      ctx.strokeStyle = P.frogSpot;
      ctx.lineWidth = Math.max(1, R * 0.06);
      ctx.beginPath();
      ctx.moveTo(-R * 0.4, -R * 0.3);
      ctx.quadraticCurveTo(0, -R * 0.12, R * 0.4, -R * 0.3);
      ctx.stroke();
      ctx.fillStyle = P.frogSpot;
      for (const side of [-1, 1] as const) {
        ctx.beginPath();
        ctx.arc(side * R * 0.1, -R * 0.52, R * 0.035, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    function draw() {
      const { canvasWidth: W, canvasHeight: H, cellSize: cs } = state;
      ctx.clearRect(0, 0, W, H);

      const h01 = (n: number) => (((n * 2654435761) >>> 0) % 1000) / 1000;

      // Dusk sky over South Congress.
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, P.skyTop);
      sky.addColorStop(0.5, P.skyMid);
      sky.addColorStop(1, P.skyLow);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // Stars + moon in the strip above the mural wall.
      for (let i = 0; i < 26; i++) {
        const sx = h01(i + 7) * W;
        const sy = h01(i * 3 + 1) * state.winZoneY * 0.8;
        ctx.globalAlpha = 0.35 + h01(i * 5) * 0.6;
        ctx.fillStyle = P.star;
        ctx.fillRect(sx, sy, i % 6 === 0 ? 2 : 1, i % 6 === 0 ? 2 : 1);
      }
      ctx.globalAlpha = 1;
      const moonX = W * 0.86;
      const moonY = state.winZoneY * 0.42;
      const moonR = cs * 0.34;
      const moonGlow = ctx.createRadialGradient(moonX, moonY, 1, moonX, moonY, moonR * 3);
      moonGlow.addColorStop(0, 'rgba(244,236,216,0.35)');
      moonGlow.addColorStop(1, 'rgba(244,236,216,0)');
      ctx.fillStyle = moonGlow;
      ctx.fillRect(moonX - moonR * 3, moonY - moonR * 3, moonR * 6, moonR * 6);
      ctx.fillStyle = P.moon;
      ctx.beginPath();
      ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      for (const [mx, my, mr] of [[-0.3, -0.15, 0.22], [0.25, 0.2, 0.16], [0.05, -0.4, 0.12]] as const) {
        ctx.beginPath();
        ctx.arc(moonX + mx * moonR, moonY + my * moonR, mr * moonR, 0, Math.PI * 2);
        ctx.fill();
      }

      // Downtown silhouette rising behind the wall.
      ctx.fillStyle = P.skyline;
      let bx = 0;
      let bi = 0;
      while (bx < W) {
        const bw = cs * (0.7 + h01(bi * 11) * 1.1);
        const bh = state.winZoneY * (0.35 + h01(bi * 17 + 3) * 0.6);
        ctx.fillRect(bx, state.winZoneY - bh, bw, bh + 2);
        // a few lit windows
        for (let wI = 0; wI < 3; wI++) {
          if (h01(bi * 29 + wI * 7) > 0.55) {
            ctx.fillStyle = P.windowLit;
            ctx.fillRect(bx + 3 + wI * (bw / 3.4), state.winZoneY - bh + 4 + h01(bi + wI) * (bh * 0.5), 2, 3);
            ctx.fillStyle = P.skyline;
          }
        }
        bx += bw + 2;
        bi += 1;
      }
      // one tower with a beacon (hello, Austin)
      const towerX = W * 0.12;
      ctx.fillStyle = P.skyline;
      ctx.fillRect(towerX, state.winZoneY * 0.18, cs * 0.5, state.winZoneY * 0.85);
      ctx.strokeStyle = P.skyline;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(towerX + cs * 0.25, state.winZoneY * 0.18);
      ctx.lineTo(towerX + cs * 0.25, state.winZoneY * 0.02);
      ctx.stroke();
      ctx.fillStyle = P.tail;
      ctx.beginPath();
      ctx.arc(towerX + cs * 0.25, state.winZoneY * 0.02 + 1, 1.6, 0, Math.PI * 2);
      ctx.fill();

      // THE WALL - Jo's green wall with the hand-painted script.
      const wallGrad = ctx.createLinearGradient(0, state.winZoneY, 0, state.winZoneY + cs);
      wallGrad.addColorStop(0, P.wallLight);
      wallGrad.addColorStop(0.55, P.wall);
      wallGrad.addColorStop(1, P.wallDark);
      ctx.fillStyle = wallGrad;
      ctx.fillRect(0, state.winZoneY, W, cs * 0.86);
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = `rgba(0,0,0,${0.03 + h01(i * 13) * 0.05})`;
        ctx.fillRect(h01(i * 19 + 5) * W, state.winZoneY, 2 + h01(i) * 3, cs * 0.86);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(0, state.winZoneY, W, 2);
      // sidewalk apron in front of the wall (where the frog lands)
      ctx.fillStyle = P.sidewalk;
      ctx.fillRect(0, state.winZoneY + cs * 0.86, W, cs * 0.14);
      // the script itself
      ctx.save();
      ctx.font = `italic 700 ${Math.round(cs * 0.58)}px "Brush Script MT", "Snell Roundhand", "Segoe Script", Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillText('i love you so much', W / 2 + 2, state.winZoneY + cs * 0.44 + 2);
      ctx.fillStyle = P.script;
      ctx.fillText('i love you so much', W / 2, state.winZoneY + cs * 0.44);
      ctx.restore();

      // The road: nine rows of Congress Avenue asphalt.
      const laneStartY = state.winZoneY + cs;
      const road = ctx.createLinearGradient(0, laneStartY, 0, laneStartY + 9 * cs);
      road.addColorStop(0, P.asphalt);
      road.addColorStop(0.5, P.asphaltLight);
      road.addColorStop(1, P.asphalt);
      ctx.fillStyle = road;
      ctx.fillRect(0, laneStartY, W, 9 * cs);
      // asphalt wear speckle
      for (let i = 0; i < 70; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.015 + h01(i * 7) * 0.03})`;
        ctx.fillRect(h01(i * 3) * W, laneStartY + h01(i * 5 + 2) * 9 * cs, 1 + h01(i) * 2, 1);
      }

      for (let i = 0; i < 9; i++) {
        const laneY = laneStartY + i * cs;
        if (i === 2 || i === 6) {
          // crosswalk: zebra bars the frog can breathe on
          ctx.fillStyle = 'rgba(240,235,220,0.32)';
          const barW = cs * 0.52;
          for (let x = cs * 0.25; x < W; x += barW * 1.8) {
            ctx.fillRect(x, laneY + 3, barW, cs - 6);
          }
        } else if (i === 4) {
          // the median island
          ctx.fillStyle = P.sidewalk;
          ctx.fillRect(0, laneY + 2, W, cs - 4);
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.fillRect(0, laneY + 2, W, 2);
          ctx.fillRect(0, laneY + cs - 4, W, 2);
          for (let x = cs; x < W; x += cs * 1.4) {
            ctx.fillStyle = P.joint;
            ctx.fillRect(x, laneY + 4, 1, cs - 8);
          }
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.font = `700 ${Math.round(cs * 0.32)}px ui-monospace, monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('S  C O N G R E S S  A V E', W / 2, laneY + cs / 2);
        } else if (i === 0 || i === 7) {
          // dashed separator between the paired driving lanes (0-1, 7-8)
          ctx.setLineDash([cs * 0.55, cs * 0.5]);
          ctx.strokeStyle = P.lanePaint;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, laneY + cs);
          ctx.lineTo(W, laneY + cs);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      // double-yellow on both sides of the median
      ctx.fillStyle = P.centerPaint;
      const medTop = laneStartY + 4 * cs;
      const medBot = laneStartY + 5 * cs;
      for (const yy of [medTop - 7, medTop - 3, medBot + 1, medBot + 5]) {
        ctx.fillRect(0, yy, W, 2);
      }

      // Start-side sidewalk, down to the bottom edge.
      ctx.fillStyle = P.sidewalkLight;
      ctx.fillRect(0, state.startY, W, H - state.startY);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(0, state.startY, W, 2);
      for (let x = cs * 0.7; x < W; x += cs * 1.3) {
        ctx.fillStyle = P.joint;
        ctx.fillRect(x, state.startY + 3, 1, H - state.startY - 6);
      }

      // Vehicles
      for (const v of state.vehicles) {
        drawVehicle(ctx, v);
      }

      // Frog
      drawFrog(ctx, performance.now());

      // HUD: mini-frog lives + score plate.
      for (let i = 0; i < state.lives; i++) {
        const lx = 16 + i * 22;
        const ly = 15;
        ctx.fillStyle = P.frog;
        ctx.beginPath();
        ctx.ellipse(lx, ly, 8, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = P.eyeWhite;
        ctx.beginPath();
        ctx.arc(lx - 3, ly - 5, 2.4, 0, Math.PI * 2);
        ctx.arc(lx + 3, ly - 5, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = P.pupil;
        ctx.beginPath();
        ctx.arc(lx - 3, ly - 5, 1, 0, Math.PI * 2);
        ctx.arc(lx + 3, ly - 5, 1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = `700 15px ui-monospace, monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const scoreLabel = `SCORE ${state.score}`;
      const scoreW = ctx.measureText(scoreLabel).width;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      drawRoundRect(ctx, 8, 28, scoreW + 18, 24, 12);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(scoreLabel, 17, 41);

      // Faint scanlines keep the arcade-cabinet feel.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
      for (let y = 0; y < H; y += 4) {
        ctx.fillRect(0, y, W, 1);
      }

      // Status messages
      if (state.status === 'dead' || state.status === 'won') {
        ctx.fillStyle = 'rgba(0,0,0,0.88)';
        ctx.fillRect(0, 0, W, H);

        // Italic serif font for cinematic feel
        ctx.fillStyle = '#ffffff';
        ctx.font = `italic ${Math.round(cs * 0.85)}px Georgia, serif`;
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

        const lineH = cs * 0.95;
        const totalH = lines.length * lineH;
        lines.forEach((l, i) => {
          ctx.fillText(l, W / 2, H / 2 - totalH / 2 + i * lineH + lineH / 2);
        });
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.font = `${Math.round(cs * 0.42)}px ui-sans-serif, system-ui`;
        ctx.fillText('press any arrow to run it back', W / 2, H / 2 + totalH / 2 + cs * 0.9);
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
