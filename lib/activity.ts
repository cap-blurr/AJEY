import { EventEmitter } from "events";
import { getRedis } from "@/lib/redis";
export type ActivityItem = {
  id: string;
  type: string;
  status: "queued" | "running" | "success" | "error";
  timestamp: number;
  title: string;
  details?: string;
  address?: string;
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
    if (!id || typeof id !== "string") return; // ignore invalid ids to avoid phantom traces
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

// ------------------ Redis persistence layer ------------------

const IDS_KEY = "activity:ids";
const MAX_ITEMS = 200;
let hydrated = false;

function upsertInMemory(item: ActivityItem) {
  const idx = store.items.findIndex((a) => a.id === item.id);
  if (idx === -1) store.items.unshift(item);
  else store.items[idx] = { ...store.items[idx], ...item };
  // cap
  if (store.items.length > MAX_ITEMS) store.items.length = MAX_ITEMS;
}

async function redisSetItem(item: ActivityItem) {
  const r = await getRedis();
  if (!r) return;
  await r.set(`activity:item:${item.id}`, JSON.stringify(item));
}

async function redisAddId(id: string) {
  const r = await getRedis();
  if (!r) return;
  // remove existing occurrences then add to head
  try { await r.lRem(IDS_KEY, 0, id); } catch {}
  await r.lPush(IDS_KEY, id);
  await r.lTrim(IDS_KEY, 0, MAX_ITEMS - 1);
}

async function redisGetItems(): Promise<ActivityItem[]> {
  const r = await getRedis();
  if (!r) return [];
  const ids = (await r.lRange(IDS_KEY, 0, MAX_ITEMS - 1)) as string[];
  if (!ids || ids.length === 0) return [];
  const keys = ids.map((id: string) => `activity:item:${id}`);
  const vals = (await r.mGet(keys)) as (string | null)[];
  const items: ActivityItem[] = [];
  for (const v of vals) {
    if (!v) continue;
    try { items.push(JSON.parse(v as string)); } catch {}
  }
  // ensure newest first by timestamp
  items.sort((a, b) => b.timestamp - a.timestamp);
  return items;
}

export async function hydrateActivityStore() {
  if (hydrated) return;
  try {
    const items = await redisGetItems();
    if (items.length > 0) {
      const seen = new Set<string>();
      const merged: ActivityItem[] = [];
      for (const it of [...items, ...store.items]) {
        if (seen.has(it.id)) continue;
        seen.add(it.id);
        merged.push(it);
      }
      store.items = merged.sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_ITEMS);
    }
  } catch {}
  hydrated = true;
}

// Wrap mutators to also persist
const _origAdd = addActivity;
export function addActivityPersisted(item: ActivityItem) {
  _origAdd(item);
  upsertInMemory(item);
  redisSetItem(item).catch(() => {});
  redisAddId(item.id).catch(() => {});
}

const _origAppend = appendActivityTrace;
export function appendActivityTracePersisted(id: string, line: string) {
  _origAppend(id, line);
  try {
    const idx = store.items.findIndex((a) => a.id === id);
    if (idx !== -1) {
      const item = store.items[idx];
      redisSetItem(item).catch(() => {});
      try {
        getActivityEmitter().emit("activity:trace", { id, line, lines: item.trace, address: item.address });
      } catch {}
    }
  } catch {}
}

const _origUpdate = updateActivity;
export function updateActivityPersisted(id: string, patch: Partial<ActivityItem>) {
  _origUpdate(id, patch);
  try {
    const idx = store.items.findIndex((a) => a.id === id);
    if (idx !== -1) redisSetItem(store.items[idx]).catch(() => {});
  } catch {}
}


