"use client";

import { useEffect, useMemo, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { formatEther } from "viem";
import { readPodCoreState, PodCoreState } from "@/lib/services/pods";
import { browserWsPublicClient } from "@/lib/chain";
import { AjeyInvestmentPodAbi } from "@/abi/AjeyInvestmentPod";

export default function PodOverview({ pod }: { pod?: `0x${string}` }) {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const primaryWallet = wallets && wallets.length > 0 ? wallets[0] : undefined;
  const account = (primaryWallet?.address as `0x${string}`) || ((user as any)?.wallet?.address as `0x${string}` | undefined);

  const [state, setState] = useState<PodCoreState | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!pod) { setState(undefined); return; }
      setLoading(true);
      try {
        const s = await readPodCoreState(pod, account);
        if (!cancelled) setState(s);
      } catch {
        if (!cancelled) setState(undefined);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    // Subscribe to key pod events to refresh
    let unwatch: any;
    try {
      if (browserWsPublicClient && pod) {
        unwatch = (browserWsPublicClient as any).watchContractEvent({
          address: pod,
          abi: AjeyInvestmentPodAbi as any,
          eventName: undefined as any, // all events
          onLogs: () => load(),
        });
      } else {
        const t = setInterval(load, 20000);
        unwatch = () => clearInterval(t);
      }
    } catch {
      const t = setInterval(load, 20000);
      unwatch = () => clearInterval(t);
    }
    return () => { cancelled = true; try { if (unwatch) unwatch(); } catch {} };
  }, [pod, account]);

  const membersCount = state?.members?.length || 0;
  const totalPending = state?.totalPendingAssets || BigInt(0);
  const idle = state?.idleAssets || BigInt(0);
  const userUnits = state?.unitsOfUser || BigInt(0);
  const userPending = state?.pendingOfUser || BigInt(0);
  const previewAssets = state?.previewUserAssets || BigInt(0);

  return (
    <div className="rounded-xl border p-6 bg-background/60 backdrop-blur">
      <h2 className="text-xl font-semibold">Pod Overview</h2>

      {!pod ? (
        <div className="mt-2 text-sm text-muted-foreground">Select or create a pod to view details.</div>
      ) : loading ? (
        <div className="mt-2 text-sm text-muted-foreground">Loading…</div>
      ) : !state ? (
        <div className="mt-2 text-sm text-muted-foreground">Unable to load pod data.</div>
      ) : (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">Vault</div>
            <div>{shortAddr(state.vault)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Asset</div>
            <div>{shortAddr(state.asset)} · {state.assetDecimals} decimals</div>
          </div>
          <div>
            <div className="text-muted-foreground">Members</div>
            <div>{membersCount}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Total Units</div>
            <div>{formatEtherSafe(state.totalUnits)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Pod Shares</div>
            <div>{formatEtherSafe(state.podShareBalance)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Total Pending</div>
            <div>{formatEtherSafe(totalPending)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Idle Assets</div>
            <div>{formatEtherSafe(idle)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Your Units</div>
            <div>{formatEtherSafe(userUnits)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Your Pending</div>
            <div>{formatEtherSafe(userPending)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Your Assets (preview)</div>
            <div>{formatEtherSafe(previewAssets)}</div>
          </div>
          <div className="md:col-span-3">
            <div className="text-muted-foreground">Auto-Pull</div>
            <div className="text-xs">
              {state.autoPull?.enabled
                ? `Enabled · amount/member: ${formatEtherSafe(state.autoPull.amountPerMember)} · period: ${Number(state.autoPull.period)}s · next: ${new Date(Number(state.autoPull.nextRunAt) * 1000).toLocaleString()}`
                : "Disabled"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function shortAddr(a: `0x${string}`) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

function formatEtherSafe(v?: bigint) {
  try { return v !== undefined ? formatEther(v) : "0"; } catch { return v?.toString?.() || "0"; }
}


