"use client";

import { useEffect, useState, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getActivity } from "@/lib/services/vault";
import { ajeyVault } from "@/lib/services/vault";
import { browserPublicClient, browserWsPublicClient, formatEth } from "@/lib/chain";
import { AjeyVaultAbi } from "@/abi/AjeyVault";

type Item = {
  id: string;
  title: string;
  status: string;
  timestamp: number;
  details?: string;
};

export default function ActivityFeed() {
  const [items, setItems] = useState<Item[]>([]);
  const seen = useRef<Set<string>>(new Set());
 

  useEffect(() => {
    let t: any;
    let unwatchers: Array<() => void> = [];
    let es: EventSource | null = null;
    let stopped = false;
    const loadOnce = async () => {
      try {
        const d = await getActivity();
        const list: Item[] = (d.items || []) as Item[];
        // newest-first by timestamp
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
    loadOnce();
    // Server-Sent Events: receive activity:add/update & trace snapshots
    try {
      es = new EventSource("/api/activity/stream");
      const onSnapshot = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          const list: Item[] = ((data?.items || []) as Item[])
            // exclude agent reasoning traces
            .filter((it) => !["allocate"].includes((it as any)?.type || ""));
          list.sort((a, b) => b.timestamp - a.timestamp);
          if (!stopped) {
            setItems(list);
            for (const it of list) {
              const key = it.details || it.id;
              if (key) seen.current.add(key);
            }
          }
          // eslint-disable-next-line no-console
          console.log("[activity:sse] snapshot", { count: list.length });
        } catch {}
      };
      const onAdd = (e: MessageEvent) => {
        try {
          const it = JSON.parse(e.data) as Item;
          // exclude agent reasoning
          if ((it as any)?.type === "allocate") return;
          const key = it?.details || it?.id;
          if (!it || !key) return;
          if (seen.current.has(key)) return;
          seen.current.add(key);
          if (!stopped) setItems((prev) => {
            const next = [it, ...prev];
            next.sort((a, b) => b.timestamp - a.timestamp);
            return next.slice(0, 50);
          });
          // eslint-disable-next-line no-console
          console.log("[activity:sse] add", { title: it?.title });
        } catch {}
      };
      const onUpdate = (e: MessageEvent) => {
        try {
          const it = JSON.parse(e.data) as Item;
          if (!it?.id) return;
          if (!stopped) setItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, ...it } : p)));
          // eslint-disable-next-line no-console
          console.log("[activity:sse] update", { id: it?.id, status: (it as any)?.status });
        } catch {}
      };
      es.addEventListener("snapshot", onSnapshot as any);
      es.addEventListener("activity:add", onAdd as any);
      es.addEventListener("activity:update", onUpdate as any);
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error("[activity:sse] failed", e?.message || e);
    }

    // Client-side event watchers (independent of SSE)
    try {
      const client: any = browserWsPublicClient || browserPublicClient;
      if (client && ajeyVault) {
        const base = (eventName: any, map: (log: any) => Item | null) =>
          client.watchContractEvent({ ...(ajeyVault as any), abi: AjeyVaultAbi as any, eventName, onLogs: (logs: any[]) => {
            // eslint-disable-next-line no-console
            console.log("[activity] onLogs", { eventName, count: logs.length });
            const last = logs[logs.length - 1];
            const it = map(last);
            if (it && !stopped) {
              const key = it.details || it.id;
              if (key && seen.current.has(key)) return;
              if (key) seen.current.add(key);
              setItems((prev) => {
                const next = [it, ...prev];
                next.sort((a, b) => b.timestamp - a.timestamp);
                return next.slice(0, 50);
              });
            }
          } });

        // ERC-4626 Deposit(owner, receiver, assets, shares)
        unwatchers.push(base("Deposit", (log) => {
          const assets: bigint | undefined = (log?.args?.assets as any);
          const tx: string | undefined = log?.transactionHash;
          if (!assets) return null;
          return { id: `dep_${Date.now()}`, title: `Deposit ${formatEth(assets)} ETH`, status: "success", timestamp: Date.now(), details: tx };
        }));

        // ERC-4626 Withdraw(owner, receiver, assets, shares)
        unwatchers.push(base("Withdraw", (log) => {
          const assets: bigint | undefined = (log?.args?.assets as any);
          const tx: string | undefined = log?.transactionHash;
          if (!assets) return null;
          return { id: `wd_${Date.now()}`, title: `Withdraw ${formatEth(assets)} ETH`, status: "success", timestamp: Date.now(), details: tx };
        }));

        // Custom: SuppliedToAave(amount)
        unwatchers.push(base("SuppliedToAave", (log) => {
          const amount: bigint | undefined = (log?.args?.amount as any) || (log?.args?.assets as any);
          const tx: string | undefined = log?.transactionHash;
          return { id: `ainv_${Date.now()}`, title: `Agent invested ${amount ? formatEth(amount) : "?"} WETH → Aave`, status: "success", timestamp: Date.now(), details: tx };
        }));

        // Custom: WithdrawnFromAave(amount)
        unwatchers.push(base("WithdrawnFromAave", (log) => {
          const amount: bigint | undefined = (log?.args?.amount as any) || (log?.args?.assets as any);
          const tx: string | undefined = log?.transactionHash;
          return { id: `arealloc_${Date.now()}`, title: `Agent reallocated: withdrew ${amount ? formatEth(amount) : "?"} WETH from Aave`, status: "success", timestamp: Date.now(), details: tx };
        }));
      } else {
        // eslint-disable-next-line no-console
        console.log("[activity] client not available for watchers");
      }
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error("[activity] watchers setup failed", e?.message || e);
    }
    return () => { stopped = true; try { unwatchers.forEach((u) => u && u()); } catch {}; if (es) try { es.close(); } catch {}; if (t) clearTimeout(t); };
  }, []);

  return (
    <div className="relative rounded-2xl border border-white/20 p-6 bg-black/10 dark:bg-black/50 backdrop-blur-xl shadow-[0_0_1px_rgba(255,255,255,0.25),0_10px_40px_-10px_rgba(124,58,237,0.35)]">
      {/* liquid glass overlays */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/10" />
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(120%_80%_at_50%_-10%,rgba(255,255,255,0.24),transparent_60%)] opacity-30" />
      <div className="pointer-events-none absolute -inset-x-20 -top-1/2 h-[220%] bg-[linear-gradient(120deg,rgba(255,255,255,0)_35%,rgba(255,255,255,0.18),rgba(255,255,255,0)_65%)] opacity-40 animate-[sheenSweep_9s_linear_infinite]" />
      <h2 className="text-xl font-semibold">Activity</h2>
      <div className="mt-3 text-sm">
        {items.length === 0 ? (
          <div className="text-muted-foreground">No recent activity.</div>
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
      <style>{`@keyframes sheenSweep{0%{transform:translateX(-55%)}100%{transform:translateX(55%)}}`}</style>
    </div>
  );
}


