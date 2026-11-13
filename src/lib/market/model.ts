export const START_EQUITY = 100_000;
export const CANDLE_MS = 60_000;
export const SESSION_OPEN = Date.UTC(2026, 10, 13, 7, 0, 0);
export const WARMUP = 36;
export const HISTORY = 168;

export type PairId = "BTC" | "ETH" | "SOL" | "BNB" | "AVAX" | "XAU";
export type StrategyId = "pulse" | "revert" | "breakout" | "anchor";
export type ViewId = "desk" | "marche" | "cortex" | "robot" | "livre";
export type Side = "long" | "short";
export type ExitReason = "tp" | "sl" | "signal" | "temps";

export type Pair = {
  id: PairId;
  name: string;
  start: number;
  vol: number;
  digits: number;
  seed: number;
};

export type Candle = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export type Position = {
  id: string;
  pair: PairId;
  side: Side;
  qty: number;
  entry: number;
  sl: number;
  tp: number;
  openedAt: number;
  strategy: StrategyId;
  bars: number;
};

export type ClosedTrade = Position & {
  exit: number;
  closedAt: number;
  pnl: number;
  reason: ExitReason;
  r: number;
};

export type LogLine = {
  t: number;
  tone: "info" | "long" | "short" | "win" | "loss" | "warn";
  text: string;
};

export type Print = {
  id: string;
  pair: PairId;
  price: number;
  qty: number;
  side: "buy" | "sell";
  t: number;
};

export type Book = {
  candles: Candle[];
  forming: Candle;
};

export type DeskState = {
  books: Record<PairId, Book>;
  regime: Record<PairId, number>;
  cash: number;
  positions: Position[];
  trades: ClosedTrade[];
  equityCurve: { t: number; equity: number }[];
  logs: LogLine[];
  tape: Print[];
  tick: number;
  running: boolean;
  strategy: StrategyId;
  riskPct: number;
  enabled: Record<PairId, boolean>;
  focus: PairId;
  view: ViewId;
  tf: 1 | 5 | 15;
  halted: boolean;
};

export const PAIRS: Pair[] = [
  { id: "BTC", name: "Bitcoin", start: 97420, vol: 0.00155, digits: 1, seed: 11 },
  { id: "ETH", name: "Ethereum", start: 3618, vol: 0.00205, digits: 2, seed: 23 },
  { id: "SOL", name: "Solana", start: 186.4, vol: 0.0031, digits: 2, seed: 37 },
  { id: "BNB", name: "BNB", start: 614.2, vol: 0.00175, digits: 2, seed: 41 },
  { id: "AVAX", name: "Avalanche", start: 38.64, vol: 0.0033, digits: 2, seed: 53 },
  { id: "XAU", name: "Or", start: 2684, vol: 0.00072, digits: 2, seed: 67 },
];

export const STRATEGIES: {
  id: StrategyId;
  name: string;
  line: string;
  detail: string;
}[] = [
  {
    id: "pulse",
    name: "Pulse",
    line: "Momentum filtré",
    detail:
      "Long quand l’EMA 9 est au-dessus de l’EMA 21 et que le RSI tient entre 51 et 72. Short dans le miroir. Aucune entrée en zone extrême.",
  },
  {
    id: "revert",
    name: "Reversion",
    line: "Retour à la moyenne",
    detail:
      "Achete la faiblesse sous RSI 34, vend la force au-dessus de 66. Le stop reste calé sur l’ATR : le retour se mérite, il ne se devine pas.",
  },
  {
    id: "breakout",
    name: "Rupture",
    line: "Cassure de range",
    detail:
      "Entre à la clôture au-delà du plus haut ou du plus bas des 20 dernières bougies. Le range est le silence. La cassure est la phrase.",
  },
  {
    id: "anchor",
    name: "Ancre",
    line: "Grille autour de l’EMA",
    detail:
      "Vend l’extension au-dessus de l’EMA 21, achète le décrochage. Une ancre, pas une opinion : le prix revient plus souvent qu’il ne s’échappe.",
  },
];

const FEE = 0.0004;
const MAX_POS = 3;

export function pairById(id: PairId): Pair {
  return PAIRS.find((p) => p.id === id) ?? PAIRS[0];
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** One desk-minute of price. Trend persists; noise grows when the regime fades. */
function stepPrice(price: number, regime: number, vol: number, rnd: () => number, tempo = 1) {
  const nextRegime = clamp(
    regime * (1 - 0.01 * tempo) + (rnd() - 0.478) * 0.05 * tempo,
    -1,
    1,
  );
  const noise = vol * tempo * (0.32 + (1 - Math.abs(nextRegime)) * 0.38);
  const drift = nextRegime * vol * tempo * 1.05;
  const c = Math.max(1e-6, price * (1 + drift + (rnd() - 0.5) * noise * 2));
  return { price: c, regime: nextRegime };
}

function buildSeries(pair: Pair, n: number): { candles: Candle[]; regime: number } {
  const rnd = mulberry32(pair.seed);
  let price = pair.start;
  let regime = ((pair.seed % 5) - 2) * 0.4;
  const candles: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const o = price;
    const stepped = stepPrice(price, regime, pair.vol, rnd, 1);
    price = stepped.price;
    regime = stepped.regime;
    const c = price;
    const span = Math.abs(c - o) * (0.18 + rnd() * 0.45);
    const h = Math.max(o, c) + span * rnd();
    const l = Math.min(o, c) - span * (1 - rnd()) * 0.85;
    const v = (40 + rnd() * 160) * (1 + Math.abs(regime));
    candles.push({ t: SESSION_OPEN + i * CANDLE_MS, o, h, l, c, v });
  }
  return { candles, regime };
}

export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0] ?? 0;
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function rsi(values: number[], period = 14): number[] {
  const out = new Array<number>(values.length).fill(50);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function atr(candles: Candle[], period = 14): number[] {
  const tr = candles.map((c, i) => {
    if (i === 0) return c.h - c.l;
    const prev = candles[i - 1].c;
    return Math.max(c.h - c.l, Math.abs(c.h - prev), Math.abs(c.l - prev));
  });
  const out = new Array<number>(tr.length).fill(tr[0] ?? 0);
  if (tr.length <= period) return out;
  let acc = 0;
  for (let i = 0; i < period; i++) acc += tr[i];
  out[period - 1] = acc / period;
  for (let i = period; i < tr.length; i++) {
    out[i] = (out[i - 1] * (period - 1) + tr[i]) / period;
  }
  return out;
}

function macd(values: number[]): { macd: number; signal: number } {
  const e12 = ema(values, 12);
  const e26 = ema(values, 26);
  const line = values.map((_, i) => e12[i] - e26[i]);
  const sig = ema(line, 9);
  return { macd: line[line.length - 1] ?? 0, signal: sig[sig.length - 1] ?? 0 };
}

export type Bias = "long" | "short" | "flat";

export function signalAt(candles: Candle[], strategy: StrategyId): Bias {
  if (candles.length < 30) return "flat";
  const closes = candles.map((c) => c.c);
  const i = closes.length - 1;
  const e9 = ema(closes, 9);
  const e21 = ema(closes, 21);
  const r = rsi(closes, 14)[i];
  const a = atr(candles, 14)[i];
  const price = closes[i];
  if (strategy === "pulse") {
    const gap = (e9[i] - e21[i]) / Math.max(a, price * 0.0004);
    if (gap > 0.22 && r > 48 && r < 75) return "long";
    if (gap < -0.22 && r < 52 && r > 25) return "short";
    return "flat";
  }
  if (strategy === "revert") {
    if (r < 34) return "long";
    if (r > 66) return "short";
    return "flat";
  }
  if (strategy === "breakout") {
    const window = candles.slice(Math.max(0, i - 20), i);
    if (window.length < 10) return "flat";
    const hi = Math.max(...window.map((c) => c.h));
    const lo = Math.min(...window.map((c) => c.l));
    if (price > hi) return "long";
    if (price < lo) return "short";
    return "flat";
  }
  const dist = price - e21[i];
  const band = Math.max(a * 1.25, price * 0.0012);
  if (dist < -band) return "long";
  if (dist > band) return "short";
  return "flat";
}

type Core = {
  cash: number;
  positions: Position[];
  trades: ClosedTrade[];
  logs: LogLine[];
  equityCurve: { t: number; equity: number }[];
  running: boolean;
  strategy: StrategyId;
  riskPct: number;
  enabled: Record<PairId, boolean>;
  halted: boolean;
};

function lastPrice(series: Record<PairId, Candle[]>, id: PairId): number {
  const arr = series[id];
  return arr[arr.length - 1]?.c ?? 0;
}

function equityOf(core: Core, series: Record<PairId, Candle[]>): number {
  let u = 0;
  for (const p of core.positions) {
    const px = lastPrice(series, p.pair);
    u += p.side === "long" ? (px - p.entry) * p.qty : (p.entry - px) * p.qty;
  }
  return core.cash + u;
}

function pushLog(core: Core, line: LogLine, verbose: boolean) {
  if (!verbose) return;
  core.logs = [line, ...core.logs].slice(0, 48);
}

function closePos(
  core: Core,
  pos: Position,
  exit: number,
  t: number,
  reason: ExitReason,
  verbose: boolean,
) {
  const raw =
    pos.side === "long" ? (exit - pos.entry) * pos.qty : (pos.entry - exit) * pos.qty;
  const fees = (pos.entry + exit) * pos.qty * FEE;
  const pnl = raw - fees;
  const risk = Math.max(1e-9, Math.abs(pos.entry - pos.sl) * pos.qty);
  core.cash += raw - pos.entry * pos.qty * FEE - exit * pos.qty * FEE;
  // open fee was already taken from cash at entry, so only add raw - exit fee,
  // and the line above double-counts the open fee. Correct it:
  core.cash += pos.entry * pos.qty * FEE;
  const trade: ClosedTrade = {
    ...pos,
    exit,
    closedAt: t,
    pnl,
    reason,
    r: pnl / risk,
  };
  core.trades = [trade, ...core.trades].slice(0, 80);
  const verb =
    reason === "tp" ? "cible" : reason === "sl" ? "stop" : reason === "temps" ? "temps" : "signal";
  pushLog(
    core,
    {
      t,
      tone: pnl >= 0 ? "win" : "loss",
      text: `${pos.pair} · sortie ${verb} ${pnl >= 0 ? "+" : "−"}${Math.abs(pnl).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`,
    },
    verbose,
  );
}

function openPos(
  core: Core,
  pair: Pair,
  candles: Candle[],
  side: Side,
  verbose: boolean,
) {
  const bar = candles[candles.length - 1];
  const price = bar.c;
  const a = atr(candles, 14).at(-1) ?? price * 0.002;
  const slDist = Math.max(a * 1.6, price * 0.002);
  const eq = Math.max(1000, core.cash);
  let qty = (eq * core.riskPct) / slDist;
  qty = Math.min(qty, (eq * 0.22) / price);
  if (!Number.isFinite(qty) || qty * price < 20) return;
  const used = core.positions.reduce((acc, p) => acc + p.qty * p.entry, 0);
  if (used + qty * price > eq * 0.75) return;
  const sl = side === "long" ? price - slDist : price + slDist;
  const tp = side === "long" ? price + slDist * 2.15 : price - slDist * 2.15;
  const pos: Position = {
    id: `${pair.id}-${bar.t}`,
    pair: pair.id,
    side,
    qty,
    entry: price,
    sl,
    tp,
    openedAt: bar.t,
    strategy: core.strategy,
    bars: 0,
  };
  core.cash -= price * qty * FEE;
  core.positions = [...core.positions, pos];
  pushLog(
    core,
    {
      t: bar.t,
      tone: side === "long" ? "long" : "short",
      text: `${pair.id} · ${side} ${qty.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} @ ${price.toLocaleString("fr-FR", { maximumFractionDigits: pair.digits })}`,
    },
    verbose,
  );
}

function onBar(core: Core, series: Record<PairId, Candle[]>, verbose: boolean) {
  const kept: Position[] = [];
  for (const pos of core.positions) {
    const candles = series[pos.pair];
    const bar = candles[candles.length - 1];
    const held = { ...pos, bars: pos.bars + 1 };
    const hitSl = held.side === "long" ? bar.l <= held.sl : bar.h >= held.sl;
    const hitTp = held.side === "long" ? bar.h >= held.tp : bar.l <= held.tp;
    if (hitSl || hitTp) {
      closePos(core, held, hitSl ? held.sl : held.tp, bar.t, hitSl ? "sl" : "tp", verbose);
      continue;
    }
    const bias = signalAt(candles, core.strategy);
    if ((held.side === "long" && bias === "short") || (held.side === "short" && bias === "long")) {
      closePos(core, held, bar.c, bar.t, "signal", verbose);
      continue;
    }
    const rawNow =
      held.side === "long" ? (bar.c - held.entry) * held.qty : (held.entry - bar.c) * held.qty;
    if (held.bars >= 24 && rawNow < 0) {
      closePos(core, held, bar.c, bar.t, "temps", verbose);
      continue;
    }
    kept.push(held);
  }
  core.positions = kept;
  if (!core.running || core.halted) return;
  for (const pair of PAIRS) {
    if (!core.enabled[pair.id]) continue;
    if (core.positions.some((p) => p.pair === pair.id)) continue;
    if (core.positions.length >= MAX_POS) break;
    const candles = series[pair.id];
    const bias = signalAt(candles, core.strategy);
    if (bias === "flat") continue;
    openPos(core, pair, candles, bias, verbose);
  }
}

function emptyEnabled(): Record<PairId, boolean> {
  return { BTC: true, ETH: true, SOL: true, BNB: true, AVAX: true, XAU: true };
}

export function createInitial(): DeskState {
  const full: Record<PairId, Candle[]> = {
    BTC: [],
    ETH: [],
    SOL: [],
    BNB: [],
    AVAX: [],
    XAU: [],
  };
  const regime = {} as Record<PairId, number>;
  for (const pair of PAIRS) {
    const built = buildSeries(pair, HISTORY);
    full[pair.id] = built.candles;
    regime[pair.id] = built.regime;
  }
  const core: Core = {
    cash: START_EQUITY,
    positions: [],
    trades: [],
    logs: [],
    equityCurve: [],
    running: true,
    strategy: "pulse",
    riskPct: 0.012,
    enabled: emptyEnabled(),
    halted: false,
  };
  for (let i = WARMUP; i < HISTORY; i++) {
    const series = {} as Record<PairId, Candle[]>;
    for (const pair of PAIRS) series[pair.id] = full[pair.id].slice(0, i + 1);
    onBar(core, series, i > HISTORY - 18);
    const t = full.BTC[i].t;
    core.equityCurve.push({ t, equity: equityOf(core, series) });
  }
  const books = {} as Record<PairId, Book>;
  for (const pair of PAIRS) {
    const candles = full[pair.id];
    const last = candles[candles.length - 1];
    books[pair.id] = {
      candles,
      forming: {
        t: last.t + CANDLE_MS,
        o: last.c,
        h: last.c,
        l: last.c,
        c: last.c,
        v: 0,
      },
    };
  }
  if (core.logs.length === 0) {
    core.logs = [
      {
        t: full.BTC[HISTORY - 1].t,
        tone: "info",
        text: "Cortex en ligne · univers actif · Pulse armé",
      },
    ];
  }
  return {
    books,
    regime,
    cash: core.cash,
    positions: core.positions,
    trades: core.trades,
    equityCurve: core.equityCurve,
    logs: core.logs,
    tape: [],
    tick: 0,
    running: true,
    strategy: "pulse",
    riskPct: 0.012,
    enabled: emptyEnabled(),
    focus: "BTC",
    view: "desk",
    tf: 1,
    halted: false,
  };
}

function seriesFromBooks(books: Record<PairId, Book>, includeForming: boolean): Record<PairId, Candle[]> {
  const series = {} as Record<PairId, Candle[]>;
  for (const pair of PAIRS) {
    const b = books[pair.id];
    series[pair.id] = includeForming ? [...b.candles, b.forming] : b.candles;
  }
  return series;
}

export function markEquity(s: Pick<DeskState, "cash" | "positions" | "books">): number {
  let u = 0;
  for (const p of s.positions) {
    const px = s.books[p.pair].forming.c;
    u += p.side === "long" ? (px - p.entry) * p.qty : (p.entry - px) * p.qty;
  }
  return s.cash + u;
}

export function stepLive(s: DeskState): DeskState {
  const tick = s.tick + 1;
  const books = { ...s.books };
  const regime = { ...s.regime };
  let tape = s.tape;
  for (const pair of PAIRS) {
    const rnd = mulberry32((pair.seed * 997 + tick * 13) >>> 0);
    const book = books[pair.id];
    const forming = { ...book.forming };
    const stepped = stepPrice(forming.c, regime[pair.id], pair.vol, rnd, 0.18);
    regime[pair.id] = stepped.regime;
    const c = stepped.price;
    forming.c = c;
    forming.h = Math.max(forming.h, c);
    forming.l = Math.min(forming.l, c);
    forming.v += 6 + rnd() * 28;
    books[pair.id] = { candles: book.candles, forming };
    if (pair.id === s.focus || rnd() > 0.82) {
      const print: Print = {
        id: `${pair.id}-${tick}`,
        pair: pair.id,
        price: c,
        qty: Number((rnd() * (pair.id === "BTC" ? 0.42 : 3.2) + 0.01).toFixed(3)),
        side: c >= forming.o ? "buy" : "sell",
        t: forming.t,
      };
      tape = [print, ...tape].slice(0, 32);
    }
  }
  let next: DeskState = { ...s, books, regime, tape, tick };
  if (tick % 8 === 0) next = commitBar(next);
  return next;
}

function commitBar(s: DeskState): DeskState {
  const books = { ...s.books };
  for (const pair of PAIRS) {
    const b = books[pair.id];
    const done = { ...b.forming };
    const candles = [...b.candles, done].slice(-240);
    const last = done.c;
    books[pair.id] = {
      candles,
      forming: { t: done.t + CANDLE_MS, o: last, h: last, l: last, c: last, v: 0 },
    };
  }
  const core: Core = {
    cash: s.cash,
    positions: s.positions,
    trades: s.trades,
    logs: s.logs,
    equityCurve: s.equityCurve,
    running: s.running,
    strategy: s.strategy,
    riskPct: s.riskPct,
    enabled: s.enabled,
    halted: s.halted,
  };
  const series = seriesFromBooks(books, false);
  onBar(core, series, true);
  const t = books.BTC.candles[books.BTC.candles.length - 1].t;
  const equity = equityOf(core, series);
  const dayPnl = (equity - START_EQUITY) / START_EQUITY;
  if (!core.halted && dayPnl <= -0.015) {
    core.halted = true;
    core.running = false;
    const still = [...core.positions];
    core.positions = [];
    for (const pos of still) {
      closePos(core, pos, lastPrice(series, pos.pair), t, "signal", true);
    }
    const warn: LogLine = {
      t,
      tone: "warn",
      text: "Coupe-circuit · perte du jour −1,50 % · robot désarmé",
    };
    core.logs = [warn, ...core.logs].slice(0, 48);
  }
  core.equityCurve = [...core.equityCurve, { t, equity: equityOf(core, series) }].slice(-220);
  return {
    ...s,
    books,
    cash: core.cash,
    positions: core.positions,
    trades: core.trades,
    logs: core.logs,
    equityCurve: core.equityCurve,
    running: core.running,
    halted: core.halted,
  };
}

export type Metrics = {
  equity: number;
  pnl: number;
  pnlPct: number;
  winRate: number;
  profitFactor: number;
  trades: number;
  maxDd: number;
  sharpe: number;
  avgR: number;
};

export function metrics(s: Pick<DeskState, "cash" | "positions" | "books" | "trades" | "equityCurve">): Metrics {
  const equity = markEquity(s);
  const pnl = equity - START_EQUITY;
  const wins = s.trades.filter((t) => t.pnl > 0);
  const losses = s.trades.filter((t) => t.pnl <= 0);
  const grossW = wins.reduce((a, t) => a + t.pnl, 0);
  const grossL = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
  let peak = START_EQUITY;
  let maxDd = 0;
  for (const pt of s.equityCurve) {
    peak = Math.max(peak, pt.equity);
    maxDd = Math.max(maxDd, peak > 0 ? (peak - pt.equity) / peak : 0);
  }
  const rets: number[] = [];
  for (let i = 1; i < s.equityCurve.length; i++) {
    const prev = s.equityCurve[i - 1].equity;
    if (prev > 0) rets.push((s.equityCurve[i].equity - prev) / prev);
  }
  const mean = rets.reduce((a, r) => a + r, 0) / Math.max(1, rets.length);
  const variance =
    rets.reduce((a, r) => a + (r - mean) * (r - mean), 0) / Math.max(1, rets.length);
  const sd = Math.sqrt(variance);
  const sharpe = sd === 0 ? 0 : (mean / sd) * Math.sqrt(rets.length);
  const avgR = s.trades.length
    ? s.trades.reduce((a, t) => a + t.r, 0) / s.trades.length
    : 0;
  return {
    equity,
    pnl,
    pnlPct: pnl / START_EQUITY,
    winRate: s.trades.length ? wins.length / s.trades.length : 0,
    profitFactor: grossL === 0 ? (grossW > 0 ? 9.99 : 0) : grossW / grossL,
    trades: s.trades.length,
    maxDd,
    sharpe,
    avgR,
  };
}

export type Factor = { id: string; label: string; value: number };

export type Snapshot = {
  price: number;
  changePct: number;
  ema9: number;
  ema21: number;
  rsi: number;
  atr: number;
  macd: number;
  macdSignal: number;
  bias: Bias;
  confidence: number;
  factors: Factor[];
  note: string;
  dayHigh: number;
  dayLow: number;
};

export function snapshot(s: DeskState, id: PairId = s.focus): Snapshot {
  const pair = pairById(id);
  const candles = [...s.books[id].candles, s.books[id].forming];
  const closes = candles.map((c) => c.c);
  const i = closes.length - 1;
  const e9 = ema(closes, 9);
  const e21 = ema(closes, 21);
  const r = rsi(closes, 14)[i] ?? 50;
  const a = atr(candles, 14)[i] ?? 0;
  const m = macd(closes);
  const price = closes[i] ?? 0;
  const back = closes[Math.max(0, i - 60)] ?? price;
  const changePct = back ? (price - back) / back : 0;
  const bias = signalAt(candles, s.strategy);
  const trend = a > 0 ? clamp((e9[i] - e21[i]) / a, -2, 2) : 0;
  const mom = clamp((r - 50) / 18, -1.6, 1.6);
  const dir = bias === "long" ? 1 : bias === "short" ? -1 : 0;
  const align =
    dir === 0 ? 0.15 : (Math.sign(trend) === dir ? 0.55 : 0) + (Math.sign(mom) === dir ? 0.3 : 0);
  const confidence = Math.round(clamp(36 + Math.abs(trend) * 16 + Math.abs(mom) * 10 + align * 24, 8, 93));
  const vols = candles.slice(-20).map((c) => c.v);
  const volAvg = vols.reduce((x, v) => x + v, 0) / Math.max(1, vols.length);
  const volRatio = volAvg ? candles[i].v / volAvg : 1;
  const slope = e21[i] - (e21[Math.max(0, i - 6)] ?? e21[i]);
  const factors: Factor[] = [
    { id: "trend", label: "Tendance", value: Math.round(clamp(50 + trend * 22, 4, 96)) },
    { id: "mom", label: "Momentum", value: Math.round(clamp(r, 4, 96)) },
    {
      id: "vol",
      label: "Volatilité",
      value: Math.round(clamp((a / Math.max(price, 1e-6)) * 8000, 8, 96)),
    },
    { id: "flow", label: "Flux", value: Math.round(clamp(volRatio * 48, 8, 96)) },
    {
      id: "struct",
      label: "Structure",
      value: Math.round(clamp(50 + (slope / Math.max(price, 1)) * 12000, 6, 94)),
    },
  ];
  const sideWord = bias === "long" ? "le long" : bias === "short" ? "le short" : "l’attente";
  const rsiWord = r >= 70 ? "tendu" : r <= 32 ? "lavé" : "tenu";
  const where = e9[i] >= e21[i] ? "au-dessus" : "sous";
  const strat = STRATEGIES.find((x) => x.id === s.strategy)?.name ?? "Pulse";
  const note = `${pair.name} traite ${where} l’EMA 21. Le RSI est ${rsiWord} (${r.toFixed(0)}). ${strat} privilégie ${sideWord}, confiance ${confidence}.`;
  let dayHigh = price;
  let dayLow = price;
  for (const c of candles) {
    dayHigh = Math.max(dayHigh, c.h);
    dayLow = Math.min(dayLow, c.l);
  }
  return {
    price,
    changePct,
    ema9: e9[i] ?? price,
    ema21: e21[i] ?? price,
    rsi: r,
    atr: a,
    macd: m.macd,
    macdSignal: m.signal,
    bias,
    confidence,
    factors,
    note,
    dayHigh,
    dayLow,
  };
}

export function aggregate(candles: Candle[], n: number): Candle[] {
  if (n <= 1) return candles;
  const out: Candle[] = [];
  for (let i = 0; i < candles.length; i += n) {
    const slice = candles.slice(i, i + n);
    if (!slice.length) continue;
    out.push({
      t: slice[0].t,
      o: slice[0].o,
      h: Math.max(...slice.map((c) => c.h)),
      l: Math.min(...slice.map((c) => c.l)),
      c: slice[slice.length - 1].c,
      v: slice.reduce((a, c) => a + c.v, 0),
    });
  }
  return out;
}

export function heatTrack(): number[] {
  const rnd = mulberry32(20261113);
  const days: number[] = [];
  for (let i = 0; i < 55; i++) {
    const v = (rnd() - 0.4) * 1.35 + 0.08;
    days.push(Math.round(v * 100) / 100);
  }
  return days;
}

export function ladder(mid: number, seed: number) {
  const step = mid * 0.00018;
  const asks: { price: number; size: number }[] = [];
  const bids: { price: number; size: number }[] = [];
  for (let i = 12; i >= 1; i--) {
    const wobble = 0.55 + Math.abs(Math.sin(seed * 0.17 + mid * 0.01 + i)) * (0.6 + i * 0.18);
    asks.push({ price: mid + step * i, size: wobble });
  }
  for (let i = 1; i <= 12; i++) {
    const wobble = 0.55 + Math.abs(Math.cos(seed * 0.13 + mid * 0.01 + i)) * (0.6 + i * 0.18);
    bids.push({ price: mid - step * i, size: wobble });
  }
  return { asks, bids };
}

export function unrealized(s: DeskState, pos: Position): number {
  const px = s.books[pos.pair].forming.c;
  const raw = pos.side === "long" ? (px - pos.entry) * pos.qty : (pos.entry - px) * pos.qty;
  return raw - (pos.entry + px) * pos.qty * FEE;
}
