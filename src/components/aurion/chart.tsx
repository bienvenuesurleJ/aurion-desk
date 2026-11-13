import { useEffect, useRef, useState } from "react";
import { ema, type Candle } from "@/lib/market/model";
import { clock, px } from "./format";

const UP = "#3dcc9a";
const DOWN = "#ef6b7b";
const GOLD = "#e0b15a";
const STEEL = "#8ea0b5";
const GRID = "rgba(244,240,230,0.06)";
const MUTED = "#9a9488";
const INK = "#07080c";

function axis(v: number, digits: number) {
  return v.toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function CandleChart({ candles, digits }: { candles: Candle[]; digits: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<() => void>(() => {});
  const [tip, setTip] = useState<{ i: number; x: number } | null>(null);
  const tipRef = useRef(tip);
  tipRef.current = tip;

  drawRef.current = () => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = wrap.clientWidth;
    const height = wrap.clientHeight;
    const data = candles;
    if (width < 8 || height < 8 || data.length < 2) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const view = data.slice(-72);
    const padR = 72;
    const padB = 20;
    const padT = 12;
    const volH = Math.max(26, (height - padT - padB) * 0.16);
    const plotH = height - padT - padB - volH - 8;
    const plotW = width - padR;
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of view) {
      lo = Math.min(lo, c.l);
      hi = Math.max(hi, c.h);
    }
    const span = hi - lo || hi * 0.002 || 1;
    lo -= span * 0.08;
    hi += span * 0.08;
    const yOf = (v: number) => padT + ((hi - v) / (hi - lo)) * plotH;
    const slot = plotW / view.length;
    const xOf = (i: number) => (i + 0.5) * slot;

    ctx.font = "11px 'IBM Plex Mono', ui-monospace, monospace";
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.fillStyle = MUTED;
    ctx.textAlign = "left";
    for (let g = 0; g < 4; g++) {
      const v = lo + ((hi - lo) * g) / 3;
      const y = yOf(v);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(plotW, y);
      ctx.stroke();
      ctx.fillText(axis(v, digits), plotW + 8, y + 4);
    }

    const closes = data.map((c) => c.c);
    const e9 = ema(closes, 9).slice(-view.length);
    const e21 = ema(closes, 21).slice(-view.length);

    let maxV = 1;
    for (const c of view) maxV = Math.max(maxV, c.v);
    view.forEach((c, i) => {
      const x = xOf(i);
      const up = c.c >= c.o;
      const color = up ? UP : DOWN;
      const bodyW = Math.max(1.5, Math.min(9, slot * 0.62));
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, yOf(c.h));
      ctx.lineTo(x, yOf(c.l));
      ctx.stroke();
      const top = yOf(Math.max(c.o, c.c));
      const bot = yOf(Math.min(c.o, c.c));
      ctx.fillStyle = color;
      ctx.fillRect(x - bodyW / 2, top, bodyW, Math.max(1, bot - top));
      const vh = (c.v / maxV) * volH;
      ctx.globalAlpha = 0.4;
      ctx.fillRect(x - bodyW / 2, height - padB - vh, bodyW, vh);
      ctx.globalAlpha = 1;
    });

    const line = (series: number[], color: string) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.3;
      series.forEach((v, i) => {
        const x = xOf(i);
        const y = yOf(v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };
    line(e21, STEEL);
    line(e9, GOLD);

    const last = view[view.length - 1];
    const ly = yOf(last.c);
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = last.c >= last.o ? UP : DOWN;
    ctx.beginPath();
    ctx.moveTo(0, ly);
    ctx.lineTo(plotW, ly);
    ctx.stroke();
    ctx.setLineDash([]);
    const tag = axis(last.c, digits);
    const tw = ctx.measureText(tag).width + 12;
    ctx.fillStyle = last.c >= last.o ? UP : DOWN;
    ctx.fillRect(plotW + 4, ly - 9, tw, 18);
    ctx.fillStyle = INK;
    ctx.fillText(tag, plotW + 10, ly + 4);

    ctx.fillStyle = MUTED;
    ctx.textAlign = "center";
    const step = Math.max(1, Math.floor(view.length / 4));
    for (let i = 0; i < view.length; i += step) {
      ctx.fillText(clock(view[i].t), xOf(i), height - 5);
    }

    const active = tipRef.current;
    if (active && view[active.i]) {
      const x = xOf(active.i);
      ctx.strokeStyle = "rgba(244,240,230,0.28)";
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, height - padB);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ro = new ResizeObserver(() => drawRef.current());
    ro.observe(wrap);
    const onMove = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const viewN = Math.min(72, candles.length);
      const plotW = rect.width - 72;
      const slot = plotW / Math.max(1, viewN);
      const i = Math.floor((ev.clientX - rect.left) / slot);
      if (i >= 0 && i < viewN) setTip({ i, x: (i + 0.5) * slot });
      else setTip(null);
    };
    const onLeave = () => setTip(null);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    return () => {
      ro.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, [candles.length]);

  useEffect(() => {
    drawRef.current();
  });

  const view = candles.slice(-72);
  const hovered = tip ? view[tip.i] : null;

  return (
    <div ref={wrapRef} className="relative h-full min-h-64 w-full">
      <canvas ref={canvasRef} className="h-full w-full touch-none" />
      {hovered && tip ? (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-md border border-line bg-ink-2/95 px-2 py-1 text-xs"
          style={{ left: Math.min(tip.x, Math.max(8, (wrapRef.current?.clientWidth ?? 240) - 150)) }}
        >
          <div className="num text-muted">{clock(hovered.t)}</div>
          <div className="num text-ivory">
            O {px(hovered.o, digits)} · H {px(hovered.h, digits)}
          </div>
          <div className="num text-ivory">
            B {px(hovered.l, digits)} · C {px(hovered.c, digits)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function EquityChart({
  curve,
  up,
}: {
  curve: { t: number; equity: number }[];
  up: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setBox((prev) =>
        prev.w === el.clientWidth && prev.h === el.clientHeight
          ? prev
          : { w: el.clientWidth, h: el.clientHeight },
      );
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const values = curve.map((c) => c.equity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.18 || max * 0.002;
  const lo = min - pad;
  const hi = max + pad;
  const w = Math.max(1, box.w);
  const h = Math.max(1, box.h);
  const coords = values.map((v, i) => {
    const x = values.length <= 1 ? 0 : (i / (values.length - 1)) * w;
    const y = h - ((v - lo) / (hi - lo || 1)) * h;
    return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const line = coords.join(" ");
  const fill = `${line} L${w.toFixed(2)},${h.toFixed(2)} L0,${h.toFixed(2)} Z`;
  const color = up ? "var(--color-jade)" : "var(--color-rose)";

  return (
    <div ref={ref} className="h-full w-full">
      {box.w > 0 ? (
        <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" preserveAspectRatio="none" role="img" aria-label="Courbe de capital">
          <path d={fill} fill={color} opacity="0.2" />
          <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      ) : null}
    </div>
  );
}

export function Spark({ values, up }: { values: number[]; up: boolean }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const d = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 28 - ((v - min) / (max - min || 1)) * 24;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 32" className="h-8 w-24" aria-hidden>
      <path
        d={d}
        fill="none"
        stroke={up ? "var(--color-jade)" : "var(--color-rose)"}
        strokeWidth="1.7"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
