import { useEffect, useRef, useState, type ReactNode } from "react";
import * as Slider from "@radix-ui/react-slider";
import {
  BookOpen,
  Brain,
  CandlestickChart,
  Cpu,
  LayoutDashboard,
} from "lucide-react";
import {
  PAIRS,
  STRATEGIES,
  heatTrack,
  ladder,
  metrics,
  pairById,
  snapshot,
  unrealized,
  aggregate,
  type Bias,
  type DeskState,
  type PairId,
  type ViewId,
} from "@/lib/market/model";
import { useDesk } from "@/lib/market/store";
import { CandleChart, EquityChart, Spark } from "./chart";
import { clock, cx, money, pnlClass, px, qty, signedMoney, signedPct } from "./format";

const NAV: { id: ViewId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "desk", label: "Desk", icon: LayoutDashboard },
  { id: "marche", label: "Marché", icon: CandlestickChart },
  { id: "cortex", label: "Cortex", icon: Brain },
  { id: "robot", label: "Robot", icon: Cpu },
  { id: "livre", label: "Livre", icon: BookOpen },
];

const REASON = { tp: "Cible", sl: "Stop", signal: "Signal", temps: "Temps" } as const;

function biasLabel(b: Bias) {
  if (b === "long") return "Long";
  if (b === "short") return "Short";
  return "Attente";
}

function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path
        d="M5 23.5 16 7l11 16.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M10.5 23.5h11" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="16" cy="15.2" r="1.5" fill="currentColor" />
    </svg>
  );
}

function Panel({
  title,
  extra,
  children,
  className,
  bodyClass,
}: {
  title?: string;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <section className={cx("rounded-lg border border-line bg-panel", className)}>
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-line-soft px-3 py-2">
          <h2 className="text-xs font-medium tracking-wide text-muted uppercase">{title}</h2>
          {extra}
        </header>
      ) : null}
      <div className={cx("p-3", bodyClass)}>{children}</div>
    </section>
  );
}

function Flash({
  value,
  text,
  className,
  tone = "text-ivory",
}: {
  value: number;
  text: string;
  className?: string;
  tone?: string;
}) {
  const prev = useRef(value);
  const [dir, setDir] = useState<"up" | "down" | "">("");
  useEffect(() => {
    if (value > prev.current) setDir("up");
    else if (value < prev.current) setDir("down");
    prev.current = value;
    const id = window.setTimeout(() => setDir(""), 380);
    return () => window.clearTimeout(id);
  }, [value]);
  const color = dir === "up" ? "text-jade" : dir === "down" ? "text-rose" : tone;
  return <span className={cx("num transition-colors duration-200", className, color)}>{text}</span>;
}

export function DeskApp() {
  const boot = useDesk((s) => s.boot);
  const shutdown = useDesk((s) => s.shutdown);
  const view = useDesk((s) => s.view);
  useEffect(() => {
    boot();
    return () => shutdown();
  }, [boot, shutdown]);

  return (
    <div className="flex h-dvh overflow-hidden bg-ink text-ivory">
      <Rail />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <Ticker />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div key={view} className="rise xl:h-full">
            {view === "desk" && <DeskView />}
            {view === "marche" && <MarketView />}
            {view === "cortex" && <CortexView />}
            {view === "robot" && <RobotView />}
            {view === "livre" && <JournalView />}
          </div>
          <div className="h-20 md:hidden" />
        </main>
      </div>
      <MobileNav />
    </div>
  );
}

function Rail() {
  const view = useDesk((s) => s.view);
  const setView = useDesk((s) => s.setView);
  return (
    <nav className="hidden w-16 shrink-0 flex-col items-center gap-1 border-r border-line bg-ink-2 py-3 md:flex">
      <Mark className="mb-3 size-7 text-gold" />
      {NAV.map((item) => {
        const Icon = item.icon;
        const on = view === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setView(item.id)}
            aria-current={on ? "page" : undefined}
            className={cx(
              "flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-md text-xs transition-colors duration-200 active:scale-[0.96]",
              on ? "bg-panel text-gold" : "text-muted hover:text-ivory",
            )}
          >
            <Icon className="size-5" strokeWidth={1.6} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

function MobileNav() {
  const view = useDesk((s) => s.view);
  const setView = useDesk((s) => s.setView);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-ink/95 backdrop-blur-md md:hidden">
      {NAV.map((item) => {
        const Icon = item.icon;
        const on = view === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setView(item.id)}
            aria-current={on ? "page" : undefined}
            className={cx(
              "flex h-16 flex-1 flex-col items-center justify-center gap-1 text-xs active:scale-[0.96]",
              on ? "text-gold" : "text-muted",
            )}
          >
            <Icon className="size-5" strokeWidth={1.6} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

function TopBar() {
  const s = useDesk();
  const m = metrics(s);
  const snap = snapshot(s);
  const pair = pairById(s.focus);
  return (
    <header className="flex items-center gap-3 border-b border-line px-3 py-2 md:px-4">
      <div className="flex items-center gap-2 md:hidden">
        <Mark className="size-6 text-gold" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
        <span className="text-sm font-semibold tracking-widest text-ivory">AURION</span>
          <Status />
        </div>
        <p className="truncate text-xs text-faint">
          {pair.id}/USDT · {biasLabel(snap.bias)} · compte papier
        </p>
      </div>
      <div className="ml-auto text-right">
        <Flash
          value={m.equity}
          text={money(m.equity, 2)}
          className="text-base md:text-lg"
        />
        <div className={cx("num text-xs", pnlClass(m.pnl))}>
          {signedMoney(m.pnl)} · {signedPct(m.pnlPct)}
        </div>
      </div>
    </header>
  );
}

function Status() {
  const running = useDesk((s) => s.running);
  const halted = useDesk((s) => s.halted);
  const label = halted ? "Circuit" : running ? "En ligne" : "Veille";
  const tone = halted ? "text-gold" : running ? "text-jade" : "text-muted";
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-xs", tone)}>
      <span className={cx("size-1.5 rounded-full bg-current", running && !halted && "live-dot")} />
      {label}
    </span>
  );
}

function Ticker() {
  const books = useDesk((s) => s.books);
  const setFocus = useDesk((s) => s.setFocus);
  const setView = useDesk((s) => s.setView);
  const items = PAIRS.map((p) => {
    const c = books[p.id].forming.c;
    const prev = books[p.id].candles.at(-30)?.c ?? c;
    const chg = prev ? (c - prev) / prev : 0;
    return { p, c, chg };
  });
  const row = [...items, ...items];
  return (
    <div className="overflow-hidden border-b border-line-soft bg-ink-2">
      <div className="ticker-track">
        {row.map((item, i) => (
          <button
            key={`${item.p.id}-${i}`}
            type="button"
            onClick={() => {
              setFocus(item.p.id);
              setView("marche");
            }}
            className="flex h-9 items-center gap-2 border-r border-line-soft px-3 text-xs active:scale-[0.96]"
          >
            <span className="text-ivory">{item.p.id}</span>
            <span className="num text-muted">{px(item.c, item.p.digits)}</span>
            <span className={cx("num", pnlClass(item.chg))}>{signedPct(item.chg)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={cx("num mt-1 text-lg text-ivory", tone)}>{value}</div>
    </div>
  );
}

function DeskView() {
  const s = useDesk();
  const m = metrics(s);
  const snap = snapshot(s);
  const setView = useDesk((st) => st.setView);
  const setFocus = useDesk((st) => st.setFocus);
  return (
    <div className="flex flex-col gap-3 p-3 md:p-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Résultat session" value={signedMoney(m.pnl)} tone={pnlClass(m.pnl)} />
        <Kpi label="Taux de réussite" value={signedPct(m.winRate).replace("+", "")} />
        <Kpi label="Facteur de profit" value={m.profitFactor.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} />
        <Kpi
          label="Drawdown max"
          value={(m.maxDd * 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " %"}
          tone="text-rose"
        />
      </div>
      <div className="grid gap-3 xl:grid-cols-12">
        <Panel
          title="Capital"
          className="xl:col-span-8"
          extra={<span className="num text-xs text-faint">100 000 USDT au départ</span>}
        >
          <div className="h-48 md:h-64">
            <EquityChart curve={s.equityCurve} up={m.pnl >= 0} />
          </div>
        </Panel>
        <Panel
          title="Cortex"
          className="xl:col-span-4"
          extra={
            <button
              type="button"
              onClick={() => setView("cortex")}
              className="text-xs text-gold active:scale-[0.96]"
            >
              Ouvrir
            </button>
          }
        >
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-xs text-muted">Biais {pairById(s.focus).id}</div>
              <div className="text-2xl font-semibold text-ivory">{biasLabel(snap.bias)}</div>
            </div>
            <div className="text-right">
              <div className="num text-3xl text-gold">{snap.confidence}</div>
              <div className="text-xs text-faint">confiance</div>
            </div>
          </div>
          <p className="mt-3 text-sm text-muted">{snap.note}</p>
          <p className="mt-3 border-t border-line-soft pt-3 text-xs text-faint">
            {s.logs[0]?.text ?? "Scan en cours"}
          </p>
        </Panel>
      </div>
      <div className="grid gap-3 lg:grid-cols-12">
        <Panel title="Expositions" className="lg:col-span-7" bodyClass="p-0">
          <Positions s={s} />
        </Panel>
        <Panel title="Univers" className="lg:col-span-5" bodyClass="p-0">
          <ul>
            {PAIRS.map((p) => {
              const book = s.books[p.id];
              const c = book.forming.c;
              const prev = book.candles.at(-60)?.c ?? c;
              const chg = (c - prev) / prev;
              const closes = book.candles.slice(-28).map((x) => x.c);
              return (
                <li key={p.id} className="border-b border-line-soft last:border-0">
                  <button
                    type="button"
                    onClick={() => {
                      setFocus(p.id);
                      setView("marche");
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left active:scale-[0.96]"
                  >
                    <div className="w-14">
                      <div className="text-sm text-ivory">{p.id}</div>
                      <div className="text-xs text-faint">{p.name}</div>
                    </div>
                    <Spark values={closes} up={chg >= 0} />
                    <div className="ml-auto text-right">
                      <div className="num text-sm text-ivory">{px(c, p.digits)}</div>
                      <div className={cx("num text-xs", pnlClass(chg))}>{signedPct(chg)}</div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function Positions({ s }: { s: DeskState }) {
  if (!s.positions.length) {
    return (
      <p className="px-3 py-8 text-center text-sm text-muted">
        Aucune exposition. Le cortex scanne le prochain régime.
      </p>
    );
  }
  return (
    <ul>
      {s.positions.map((pos) => {
        const u = unrealized(s, pos);
        const pair = pairById(pos.pair);
        return (
          <li
            key={pos.id}
            className="flex items-center gap-3 border-b border-line-soft px-3 py-3 last:border-0"
          >
            <div>
              <div className="text-sm text-ivory">
                {pos.pair}
                <span className={cx("ml-2 text-xs", pos.side === "long" ? "text-jade" : "text-rose")}>
                  {pos.side === "long" ? "Long" : "Short"}
                </span>
              </div>
              <div className="num text-xs text-faint">
                {qty(pos.qty)} @ {px(pos.entry, pair.digits)}
              </div>
            </div>
            <div className="ml-auto text-right">
              <div className={cx("num text-sm", pnlClass(u))}>{signedMoney(u)}</div>
              <div className="num text-xs text-faint">
                stop {px(pos.sl, pair.digits)} · cible {px(pos.tp, pair.digits)}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function MarketView() {
  const s = useDesk();
  const setFocus = useDesk((st) => st.setFocus);
  const setTf = useDesk((st) => st.setTf);
  const pair = pairById(s.focus);
  const book = s.books[s.focus];
  const candles = aggregate([...book.candles, book.forming], s.tf);
  const snap = snapshot(s);
  const bookSide = ladder(snap.price, s.tick + pair.seed);
  const bestAsk = bookSide.asks[bookSide.asks.length - 1];
  const bestBid = bookSide.bids[0];
  return (
    <div className="flex flex-col gap-3 p-3 md:p-4 xl:h-full">
      <div className="flex gap-2 overflow-x-auto">
        {PAIRS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setFocus(p.id)}
            className={cx(
              "h-11 shrink-0 rounded-md border px-3 text-sm active:scale-[0.96]",
              p.id === s.focus
                ? "border-gold bg-panel text-gold"
                : "border-line bg-panel text-muted",
            )}
          >
            {p.id}/USDT
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs text-muted">
            {pair.name} · {pair.id}/USDT
          </div>
          <Flash
            value={snap.price}
            text={px(snap.price, pair.digits)}
            className="text-3xl md:text-4xl"
          />
          <div className={cx("num text-sm", pnlClass(snap.changePct))}>{signedPct(snap.changePct)}</div>
        </div>
        <div className="num text-right text-xs text-muted">
          <div>Bid {px(bestBid.price, pair.digits)}</div>
          <div>Ask {px(bestAsk.price, pair.digits)}</div>
          <div>
            Jour {px(snap.dayLow, pair.digits)} – {px(snap.dayHigh, pair.digits)}
          </div>
        </div>
      </div>
      <div className="grid gap-3 xl:min-h-0 xl:flex-1 xl:grid-cols-12">
        <Panel
          title="Graphique"
          className="flex min-h-80 flex-col xl:col-span-8 xl:min-h-0"
          bodyClass="flex min-h-0 flex-1 flex-col p-0"
          extra={
            <div className="flex gap-1">
              {([1, 5, 15] as const).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setTf(tf)}
                  className={cx(
                    "h-8 rounded-md px-2 text-xs active:scale-[0.96]",
                    s.tf === tf ? "bg-gold text-ink" : "text-muted",
                  )}
                >
                  {tf}m
                </button>
              ))}
            </div>
          }
        >
          <div className="h-80 min-h-0 flex-1 xl:h-auto">
            <CandleChart candles={candles} digits={pair.digits} />
          </div>
          <div className="flex gap-4 border-t border-line-soft px-3 py-2 text-xs text-faint">
            <span className="text-gold">EMA 9</span>
            <span className="text-muted">EMA 21</span>
            <span>Flux accéléré · session papier</span>
          </div>
        </Panel>
        <div className="grid gap-3 xl:col-span-4 xl:min-h-0 xl:grid-rows-2">
          <Panel title="Carnet" bodyClass="p-0" className="min-h-0">
            <BookView mid={snap.price} digits={pair.digits} seed={s.tick + pair.seed} />
          </Panel>
          <Panel title="Tape" bodyClass="p-0" className="min-h-0">
            <Tape />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function BookView({ mid, digits, seed }: { mid: number; digits: number; seed: number }) {
  const { asks, bids } = ladder(mid, seed);
  const max = Math.max(...asks.map((l) => l.size), ...bids.map((l) => l.size));
  return (
    <div className="num text-xs">
      {asks.map((lvl) => (
        <div key={`a-${lvl.price}`} className="relative">
          <div
            className="absolute inset-y-0 right-0 bg-rose/15"
            style={{ width: `${(lvl.size / max) * 100}%` }}
          />
          <div className="relative flex justify-between px-3 py-0.5 text-rose">
            <span>{px(lvl.price, digits)}</span>
            <span className="text-muted">{lvl.size.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</span>
          </div>
        </div>
      ))}
      <div className="border-y border-line-soft px-3 py-1 text-center text-ivory">{px(mid, digits)}</div>
      {bids.map((lvl) => (
        <div key={`b-${lvl.price}`} className="relative">
          <div
            className="absolute inset-y-0 right-0 bg-jade/15"
            style={{ width: `${(lvl.size / max) * 100}%` }}
          />
          <div className="relative flex justify-between px-3 py-0.5 text-jade">
            <span>{px(lvl.price, digits)}</span>
            <span className="text-muted">{lvl.size.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Tape() {
  const tape = useDesk((s) => s.tape);
  const focus = useDesk((s) => s.focus);
  const rows = tape.filter((t) => t.pair === focus).slice(0, 14);
  if (!rows.length) {
    return <p className="px-3 py-6 text-sm text-muted">En attente des premiers prints.</p>;
  }
  return (
    <ul className="num text-xs">
      {rows.map((row) => (
        <li key={row.id} className="flex justify-between px-3 py-1">
          <span className={row.side === "buy" ? "text-jade" : "text-rose"}>
            {px(row.price, pairById(row.pair).digits)}
          </span>
          <span className="text-muted">{row.qty.toLocaleString("fr-FR", { maximumFractionDigits: 3 })}</span>
          <span className="text-faint">{row.side === "buy" ? "achat" : "vente"}</span>
        </li>
      ))}
    </ul>
  );
}

function CortexView() {
  const s = useDesk();
  const snap = snapshot(s);
  const pair = pairById(s.focus);
  const pos = s.positions.find((p) => p.pair === s.focus);
  return (
    <div className="grid gap-3 p-3 md:p-4 xl:grid-cols-12">
      <Panel title="Lecture" className="xl:col-span-5">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
          <div
            className="grid size-40 place-items-center rounded-full"
            style={{
              background: `conic-gradient(var(--color-gold) ${snap.confidence * 3.6}deg, var(--color-line) 0deg)`,
            }}
          >
            <div className="grid size-32 place-items-center rounded-full bg-ink text-center">
              <div>
                <div className="num text-3xl text-gold">{snap.confidence}</div>
                <div className="text-xs text-faint">confiance</div>
              </div>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted">{pair.name}</div>
            <div className="text-3xl font-semibold text-ivory">{biasLabel(snap.bias)}</div>
            <p className="mt-2 text-sm text-muted">{snap.note}</p>
            {pos ? (
              <p className="mt-2 text-sm text-ivory">
                Exposition ouverte : {pos.side === "long" ? "long" : "short"} depuis {clock(pos.openedAt)}.
              </p>
            ) : (
              <p className="mt-2 text-sm text-faint">Pas d’exposition sur cette paire.</p>
            )}
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <Stat k="RSI" v={snap.rsi.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} />
          <Stat k="ATR" v={px(snap.atr, pair.digits)} />
          <Stat k="EMA 9" v={px(snap.ema9, pair.digits)} />
          <Stat k="EMA 21" v={px(snap.ema21, pair.digits)} />
        </dl>
      </Panel>
      <Panel title="Facteurs" className="xl:col-span-3">
        <ul className="space-y-3">
          {snap.factors.map((f) => (
            <li key={f.id}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-muted">{f.label}</span>
                <span className="num text-ivory">{f.value}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-gold transition-[width] duration-300"
                  style={{ width: `${f.value}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-faint">
          MACD {snap.macd >= 0 ? "+" : "−"}
          {Math.abs(snap.macd).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} · signal{" "}
          {snap.macdSignal.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}
        </p>
      </Panel>
      <Panel title="Journal du cortex" className="xl:col-span-4" bodyClass="p-0">
        <ul className="max-h-96 overflow-y-auto">
          {s.logs.map((line, i) => (
            <li key={`${line.t}-${i}`} className="border-b border-line-soft px-3 py-2 last:border-0">
              <div className="num text-xs text-faint">{clock(line.t)}</div>
              <div
                className={cx(
                  "text-sm",
                  line.tone === "win" || line.tone === "long"
                    ? "text-jade"
                    : line.tone === "loss" || line.tone === "short"
                      ? "text-rose"
                      : line.tone === "warn"
                        ? "text-gold"
                        : "text-ivory",
                )}
              >
                {line.text}
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md bg-ink-2 px-2 py-2">
      <dt className="text-xs text-faint">{k}</dt>
      <dd className="num text-ivory">{v}</dd>
    </div>
  );
}

function RobotView() {
  const s = useDesk();
  const setStrategy = useDesk((st) => st.setStrategy);
  const setRisk = useDesk((st) => st.setRisk);
  const toggleEnabled = useDesk((st) => st.toggleEnabled);
  const toggleRunning = useDesk((st) => st.toggleRunning);
  const reset = useDesk((st) => st.reset);
  const m = metrics(s);
  return (
    <div className="grid gap-3 p-3 md:p-4 xl:grid-cols-12">
      <div className="flex flex-col gap-3 xl:col-span-7">
        <Panel title="Doctrine">
          <div className="grid gap-2 sm:grid-cols-2">
            {STRATEGIES.map((strat) => {
              const on = s.strategy === strat.id;
              return (
                <button
                  key={strat.id}
                  type="button"
                  onClick={() => setStrategy(strat.id)}
                  className={cx(
                    "rounded-lg border p-3 text-left transition-colors duration-200 active:scale-[0.96]",
                    on ? "border-gold bg-ink-2" : "border-line bg-ink hover:border-muted",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-ivory">{strat.name}</span>
                    <span className="text-xs text-gold">{strat.line}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted">{strat.detail}</p>
                </button>
              );
            })}
          </div>
        </Panel>
        <Panel title="Risque">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-sm text-ivory">Risque par trade</div>
              <p className="text-xs text-faint">Stop sur 1,6 ATR · cible à 2,15 R · 3 expositions max</p>
            </div>
            <div className="num text-2xl text-gold">
              {(s.riskPct * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
            </div>
          </div>
          <Slider.Root
            className="relative mt-4 flex h-11 w-full touch-none items-center"
            min={0.4}
            max={2}
            step={0.1}
            value={[Math.round(s.riskPct * 1000) / 10]}
            onValueChange={(vals) => setRisk((vals[0] ?? 1.2) / 100)}
          >
            <Slider.Track className="relative h-1 grow rounded-full bg-line">
              <Slider.Range className="absolute h-full rounded-full bg-gold" />
            </Slider.Track>
            <Slider.Thumb
              className="block size-5 rounded-full border-2 border-gold bg-ink"
              aria-label="Risque par trade"
            />
          </Slider.Root>
          <div className="mt-4 flex flex-wrap gap-2">
            {PAIRS.map((p) => {
              const on = s.enabled[p.id];
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleEnabled(p.id)}
                  className={cx(
                    "h-11 rounded-md border px-3 text-sm active:scale-[0.96]",
                    on ? "border-gold text-gold" : "border-line text-faint",
                  )}
                >
                  {p.id}
                </button>
              );
            })}
          </div>
        </Panel>
      </div>
      <div className="flex flex-col gap-3 xl:col-span-5">
        <Panel title="Moteur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm text-ivory">
                {s.halted ? "Coupe-circuit" : s.running ? "Robot armé" : "Robot en veille"}
              </div>
              <p className="text-xs text-faint">
                {s.halted
                  ? "Perte du jour au-delà de 1,50 %. Les stops ont été soldés."
                  : "Les positions ouvertes restent gérées, même en veille."}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleRunning}
              className={cx(
                "h-12 shrink-0 rounded-md px-4 text-sm font-semibold active:scale-[0.96]",
                s.running ? "bg-panel-2 text-ivory border border-line" : "bg-gold text-ink",
              )}
            >
              {s.halted ? "Réarmer" : s.running ? "Mettre en veille" : "Armer"}
            </button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Stat k="Session" v={signedPct(m.pnlPct)} />
            <Stat k="Trades" v={String(m.trades)} />
            <Stat k="R moyen" v={m.avgR.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} />
          </div>
          <button
            type="button"
            onClick={reset}
            className="mt-4 text-xs text-faint underline-offset-2 hover:text-ivory hover:underline"
          >
            Nouvelle session papier
          </button>
        </Panel>
        <Panel title="Exécutions" bodyClass="p-0">
          <div className={cx("h-1", s.running && "scan")} />
          <ul className="max-h-80 overflow-y-auto">
            {s.logs.slice(0, 12).map((line, i) => (
              <li key={`${line.t}-${i}`} className="border-b border-line-soft px-3 py-2 text-sm text-ivory last:border-0">
                <span className="num mr-2 text-xs text-faint">{clock(line.t)}</span>
                {line.text}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function JournalView() {
  const s = useDesk();
  const m = metrics(s);
  const heat = heatTrack();
  const today = Math.round(m.pnlPct * 10000) / 100;
  const cells = [...heat, today];
  return (
    <div className="flex flex-col gap-3 p-3 md:p-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Sharpe session" value={m.sharpe.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} />
        <Kpi label="R moyen" value={m.avgR.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} />
        <Kpi label="Trades clos" value={String(m.trades)} />
        <Kpi label="Profit factor" value={m.profitFactor.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} />
      </div>
      <Panel title="Empreinte">
        <div className="grid w-fit grid-flow-col grid-rows-7 gap-1">
          {cells.map((v, i) => (
            <div
              key={i}
              title={`${v.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`}
              className={cx("size-3.5 rounded-sm md:size-4", heatClass(v))}
            />
          ))}
        </div>
        <p className="mt-3 max-w-xl text-xs text-faint">
          Huit semaines illustrées, pour la silhouette d’un track record. La dernière case est la session
          papier en cours, elle est calculée.
        </p>
      </Panel>
      <Panel title="Livre d’ordres clos" bodyClass="p-0">
        {s.trades.length === 0 ? (
          <p className="px-3 py-8 text-sm text-muted">Aucun trade clos pour l’instant.</p>
        ) : (
          <ul>
            {s.trades.map((t) => {
              const pair = pairById(t.pair);
              return (
                <li
                  key={t.id + t.closedAt}
                  className="grid grid-cols-2 gap-1 border-b border-line-soft px-3 py-3 text-sm last:border-0 md:grid-cols-6 md:items-center"
                >
                  <div className="text-ivory">
                    {t.pair}
                    <span className={cx("ml-2 text-xs", t.side === "long" ? "text-jade" : "text-rose")}>
                      {t.side === "long" ? "Long" : "Short"}
                    </span>
                  </div>
                  <div className="num text-right text-muted md:text-left">
                    {px(t.entry, pair.digits)} → {px(t.exit, pair.digits)}
                  </div>
                  <div className="text-xs text-faint">{REASON[t.reason]}</div>
                  <div className="num text-xs text-faint">{clock(t.closedAt)}</div>
                  <div className="num text-muted">{t.r.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} R</div>
                  <div className={cx("num text-right", pnlClass(t.pnl))}>{signedMoney(t.pnl)}</div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function heatClass(v: number) {
  if (v > 0.6) return "bg-jade";
  if (v > 0.2) return "bg-jade/60";
  if (v > 0) return "bg-jade/30";
  if (v > -0.25) return "bg-rose/30";
  return "bg-rose/70";
}
