"use client";

import { useState } from "react";

export default function PodSwitcher() {
  const [pods] = useState<Array<{ id: string; name: string }>>([
    { id: "pod-1", name: "My Pod" },
  ]);
  const [active, setActive] = useState<string>(pods[0]?.id || "");

  return (
    <div className="rounded-xl border p-4 bg-background/60 backdrop-blur">
      <div className="text-sm mb-2">Select Pod</div>
      <div className="flex gap-2">
        {pods.map((p) => (
          <button
            key={p.id}
            onClick={() => setActive(p.id)}
            className={`rounded-md px-3 py-1 text-sm ${active === p.id ? "bg-white/10 border" : "bg-white/5"}`}
          >
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}


