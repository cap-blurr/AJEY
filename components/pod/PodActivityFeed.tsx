"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

type Item = { id: string; title: string; status: string; timestamp: number; details?: string };

export default function PodActivityFeed({ pod }: { pod?: `0x${string}` }) {
  const [items, setItems] = useState<Item[]>([]);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!pod) { setItems([]); return; }
    let es: EventSource | null = null;
    let stopped = false;
    const safeAdd = (it: Item) => {
      const key = it.details || it.id;
      if (key && seen.current.has(key)) return;
      if (key) seen.current.add(key);
      setItems((prev) => {
        const next = [it, ...prev];
        next.sort((a, b) => b.timestamp - a.timestamp);
        return next.slice(0, 50);
      });
    };
    try {
      es = new EventSource(`/api/pods/${pod}/activity/stream`);
      const onSnapshot = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          const list: Item[] = (data?.items || []) as Item[];
          list.sort((a, b) => b.timestamp - a.timestamp);
          if (!stopped) {
            setItems(list);
            for (const it of list) {
              const key = it.details || it.id;
              if (key) seen.current.add(key);
            }
          }
        } catch {}
      };
      const onAdd = (e: MessageEvent) => {
        try {
          const it = JSON.parse(e.data) as Item;
          if (!it?.id) return;
          if (!stopped) safeAdd(it);
        } catch {}
      };
      es.addEventListener("snapshot", onSnapshot as any);
      es.addEventListener("pod-activity:add", onAdd as any);
    } catch {}
    return () => { stopped = true; if (es) try { es.close(); } catch {} };
  }, [pod]);

  return (
    <div className="rounded-xl border p-6 bg-background/60 backdrop-blur">
      <h2 className="text-xl font-semibold">Pod Activity</h2>
      <div className="mt-3 text-sm">
        {(!pod || items.length === 0) ? (
          <div className="text-muted-foreground">{pod ? "No recent activity." : "Select a pod to view activity."}</div>
        ) : (
          <div className="w-full items-stretch flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {items.slice(0, 6).map((it, idx) => (
                <motion.div
                  key={it.id}
                  layout
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 420, damping: 40, mass: 0.7, delay: Math.min(idx * 0.02, 0.2) }}
                  className="flex items-center justify-between rounded-md border bg-white/5 px-3 py-2"
                >
                  <div className="truncate pr-4">
                    <div className="truncate">{it.title}</div>
                    {it.details && (
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        <a className="underline-offset-2 hover:underline" href={`https://sepolia.basescan.org/tx/${it.details}`} target="_blank" rel="noreferrer">
                          {it.details}
                        </a>
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(it.timestamp).toLocaleTimeString()} · {it.status}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

