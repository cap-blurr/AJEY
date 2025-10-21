"use client";

import { useEffect, useState } from "react";
import { getActivity } from "@/lib/services/vault";
import { AnimatedList } from "@/components/magicui/animated-list";

type Item = {
  id: string;
  title: string;
  status: string;
  timestamp: number;
};

export default function ActivityFeed() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let t: any;
    let stopped = false;
    const load = async () => {
      try {
        const d = await getActivity();
        if (!stopped) setItems(d.items || []);
      } catch {}
      finally {
        // backoff to reduce calls
        t = setTimeout(load, 15000);
      }
    };
    load();
    return () => { stopped = true; clearTimeout(t); };
  }, []);

  return (
    <div className="rounded-xl border p-6 bg-background/60 backdrop-blur">
      <h2 className="text-xl font-semibold">Activity</h2>
      <div className="mt-3 text-sm">
        {items.length === 0 ? (
          <div className="text-muted-foreground">No recent activity.</div>
        ) : (
          <AnimatedList className="w-full items-stretch" delay={1200}>
            {items.slice(0, 6).map((it) => (
              <div key={it.id} className="flex items-center justify-between rounded-md border bg-white/5 px-3 py-2">
                <div className="truncate pr-4">{it.title}</div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(it.timestamp).toLocaleTimeString()} · {it.status}
                </div>
              </div>
            ))}
          </AnimatedList>
        )}
      </div>
    </div>
  );
}


