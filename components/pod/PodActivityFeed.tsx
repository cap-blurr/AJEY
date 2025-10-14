"use client";

import { useEffect, useState } from "react";
import { getActivity } from "@/lib/services/vault";

export default function PodActivityFeed() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    const load = () => getActivity().then((d) => setItems(d.items || []));
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="rounded-xl border p-6 bg-background/60 backdrop-blur">
      <h2 className="text-xl font-semibold">Pod Activity</h2>
      <div className="mt-3 space-y-2 text-sm">
        {items.length === 0 ? (
          <div className="text-muted-foreground">No recent activity.</div>
        ) : (
          items.map((it) => (
            <div key={it.id} className="flex items-center justify-between">
              <div>{it.title}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(it.timestamp).toLocaleTimeString()} · {it.status}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}


