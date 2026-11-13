import { create } from "zustand";
import {
  createInitial,
  stepLive,
  type DeskState,
  type PairId,
  type StrategyId,
  type ViewId,
} from "./model";

type Actions = {
  boot: () => void;
  shutdown: () => void;
  setView: (view: ViewId) => void;
  setFocus: (focus: PairId) => void;
  setStrategy: (strategy: StrategyId) => void;
  setRisk: (riskPct: number) => void;
  toggleEnabled: (id: PairId) => void;
  toggleRunning: () => void;
  setTf: (tf: 1 | 5 | 15) => void;
  reset: () => void;
};

let timer: ReturnType<typeof setInterval> | null = null;

export const useDesk = create<DeskState & Actions>((set, get) => ({
  ...createInitial(),
  boot: () => {
    if (typeof window === "undefined") return;
    if (timer != null) return;
    timer = setInterval(() => {
      set(stepLive(get()));
    }, 520);
  },
  shutdown: () => {
    if (timer != null) clearInterval(timer);
    timer = null;
  },
  setView: (view) => set({ view }),
  setFocus: (focus) => set({ focus }),
  setStrategy: (strategy) => set({ strategy }),
  setRisk: (riskPct) => set({ riskPct: Math.min(0.02, Math.max(0.004, riskPct)) }),
  toggleEnabled: (id) => {
    const enabled = { ...get().enabled, [id]: !get().enabled[id] };
    if (!Object.values(enabled).some(Boolean)) return;
    set({ enabled });
  },
  toggleRunning: () => {
    const s = get();
    if (s.halted && !s.running) set({ halted: false, running: true });
    else set({ running: !s.running });
  },
  setTf: (tf) => set({ tf }),
  reset: () => {
    const view = get().view;
    const focus = get().focus;
    set({ ...createInitial(), view, focus });
  },
}));
