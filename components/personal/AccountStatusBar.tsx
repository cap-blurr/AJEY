"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";

export default function AccountStatusBar() {
  const { user } = usePrivy();
  const [address, setAddress] = useState<string>("");

  useEffect(() => {
    const a = (user as any)?.wallet?.address || "";
    setAddress(a);
  }, [user]);

  return (
    <div className="rounded-xl border p-4 bg-background/60 backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Network</div>
        <div className="text-sm">Base Sepolia</div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Address</div>
        <div className="text-sm font-mono truncate max-w-[240px]">{address || "—"}</div>
      </div>
    </div>
  );
}


