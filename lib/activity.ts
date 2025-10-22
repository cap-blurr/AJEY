import { EventEmitter } from "events";
export type ActivityItem = {
  id: string;
  type: string;
  status: "queued" | "running" | "success" | "error";
  timestamp: number;
  title: string;
  details?: string;
  trace?: string[];
  usage?: { thoughtsTokenCount?: number; candidatesTokenCount?: number };
};

type ActivityStore = { items: ActivityItem[] };
const globalKey = "__ajeyActivityStore";
const store: ActivityStore = ((): ActivityStore => {
  const g = globalThis as any;
  if (!g[globalKey]) g[globalKey] = { items: [] } as ActivityStore;
  return g[globalKey] as ActivityStore;
})();

const emitterKey = "__ajeyActivityEmitter";
const emitter: EventEmitter = ((): EventEmitter => {
  const g = globalThis as any;
  if (!g[emitterKey]) g[emitterKey] = new EventEmitter();
  return g[emitterKey] as EventEmitter;
})();

export function addActivity(item: ActivityItem) { store.items.unshift(item); try { emitter.emit("activity:add", item); } catch {} }

export function listActivity(): ActivityItem[] {
  try {
    // eslint-disable-next-line no-console
    console.log("[activity:list]", { count: store.items.length });
  } catch {}
  return store.items.slice(0, 50);
}

export function appendActivityTrace(id: string, line: string) {
  try {
    const idx = store.items.findIndex((a) => a.id === id);
    if (idx === -1) {
      store.items.unshift({ id, type: "system", status: "running", timestamp: Date.now(), title: "Trace", trace: [line] });
      return;
    }
    const it = store.items[idx];
    const next = Array.isArray(it.trace) ? [...it.trace, line] : [line];
    const updated = { ...it, trace: next };
    store.items[idx] = updated;
    try {
      // eslint-disable-next-line no-console
      console.log("[activity:trace]", { id, len: updated.trace?.length });
      emitter.emit("activity:trace", { id, line, lines: updated.trace });
    } catch {}
  } catch {}
}

export function updateActivity(id: string, patch: Partial<ActivityItem>) {
  try {
    const idx = store.items.findIndex((a) => a.id === id);
    if (idx === -1) return;
    store.items[idx] = { ...store.items[idx], ...patch };
    try {
      // eslint-disable-next-line no-console
      console.log("[activity:update]", { id, status: store.items[idx]?.status });
      emitter.emit("activity:update", store.items[idx]);
    } catch {}
  } catch {}
}

export function latestTrace(): ActivityItem | undefined {
  return store.items.find((x) => x?.type === "allocate" && Array.isArray(x.trace) && x.trace.length > 0);
}

export function getActivityEmitter(): EventEmitter {
  return emitter;
}


