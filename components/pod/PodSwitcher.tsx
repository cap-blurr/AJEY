"use client";

import { useEffect, useMemo, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, BaseError, ContractFunctionRevertedError } from "viem";
import { baseSepolia } from "viem/chains";
import { browserWsPublicClient } from "@/lib/chain";
import { ajeyVault, VAULT_ADDRESS } from "@/lib/services/vault";
import { podManager, readMyPods, isAddressLike } from "@/lib/services/pods";

export default function PodSwitcher({ selected, onSelect }: { selected?: `0x${string}`; onSelect?: (addr: `0x${string}`) => void }) {
  const { user } = usePrivy();
  const { wallets } = useWallets();

  const [pods, setPods] = useState<`0x${string}`[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [inviteInput, setInviteInput] = useState("");
  const [invites, setInvites] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const primaryWallet = wallets && wallets.length > 0 ? wallets[0] : undefined;
  const account = (primaryWallet?.address as `0x${string}`) || ((user as any)?.wallet?.address as `0x${string}` | undefined);

  // Load pods for connected user
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!account) { setPods([]); return; }
      setLoading(true);
      try {
        const list = await readMyPods(account);
        if (!cancelled) setPods(list);
      } catch {
        if (!cancelled) setPods([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    // Watch PodCreated events to refresh automatically
    let unwatch: any;
    try {
      if (browserWsPublicClient && podManager) {
        unwatch = (browserWsPublicClient as any).watchContractEvent({
          ...(podManager as any),
          eventName: "PodCreated",
          onLogs: (logs: any[]) => {
            // refresh if this user is the creator
            if (!account) return;
            for (const log of logs) {
              try {
                const creator = (log?.args?.creator || log?.args?.[1]) as `0x${string}` | undefined;
                if (creator && creator.toLowerCase() === account.toLowerCase()) {
                  load();
                  break;
                }
              } catch {}
            }
          },
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
  }, [account]);

  const validInvite = useMemo(() => (inviteInput ? isAddressLike(inviteInput) : false), [inviteInput]);

  async function handleCreatePod() {
    try {
      setError(null);
      if (!podManager) throw new Error("Pod manager not configured");
      if (!ajeyVault) throw new Error("Vault not configured");
      if (!account) throw new Error("No connected address");
      const provider = primaryWallet ? await primaryWallet.getEthereumProvider() : (typeof window !== "undefined" ? (window as any).ethereum : undefined);
      if (!provider) throw new Error("No EVM provider");

      // Ensure Base Sepolia
      try { if ((primaryWallet as any)?.switchChain) await (primaryWallet as any).switchChain(baseSepolia.id); } catch { throw new Error("Please switch your wallet to Base Sepolia"); }

      // Filter & normalize invites
      const uniqueInvites = Array.from(new Set(invites.map((s) => s.trim().toLowerCase()))).filter(isAddressLike) as `0x${string}`[];

      setCreating(true);
      const client = createWalletClient({ chain: baseSepolia, transport: custom(provider) });
      const { publicClient } = await import("@/lib/chain");
      const sim = await publicClient.simulateContract({
        ...(podManager as any),
        functionName: "createPod",
        args: [ajeyVault.address, uniqueInvites],
        account,
      } as any);
      const req: any = sim.request;
      await client.writeContract(req);
      setShowModal(false);
      setInvites([]);
      setInviteInput("");
    } catch (err: any) {
      let reason: string | undefined;
      if (err instanceof BaseError) {
        const r = err.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | undefined;
        reason = r?.data?.errorName;
      }
      setError(reason || err?.message || "Failed to create pod");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="rounded-xl border p-4 bg-background/60 backdrop-blur">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm">My Pods</div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          disabled={!podManager || !VAULT_ADDRESS}
          className="rounded-md border px-3 py-1 text-sm flex items-center gap-2"
        >
          <span className="text-lg leading-none">+</span>
          <span>Create a pod</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : pods.length === 0 ? (
          <div className="text-sm text-muted-foreground">No pods yet.</div>
        ) : (
          pods.map((addr) => (
            <button
              key={addr}
              onClick={() => onSelect && onSelect(addr)}
              className={`rounded-md px-3 py-1 text-sm border ${selected && selected.toLowerCase() === addr.toLowerCase() ? "bg-white/10" : "bg-white/5 hover:bg-white/10"}`}
              title={addr}
            >
              {shortAddr(addr)}
            </button>
          ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-lg border bg-background p-4 w-full max-w-md">
            <div className="flex items-center justify-between">
              <div className="text-base font-medium">Create Pod</div>
              <button onClick={() => setShowModal(false)} className="text-sm px-2 py-1 rounded-md border">Close</button>
            </div>
            <div className="mt-3 text-xs text-muted-foreground">Vault will be set automatically.</div>
            <div className="mt-3">
              <div className="text-sm mb-1">Invite addresses</div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value)}
                  placeholder="0x… address"
                  className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={!inviteInput || !validInvite}
                  onClick={() => {
                    if (inviteInput && isAddressLike(inviteInput)) {
                      setInvites((arr) => Array.from(new Set([...arr, inviteInput])));
                      setInviteInput("");
                    }
                  }}
                  className="rounded-md border px-3 py-2 text-sm"
                >Add</button>
              </div>
              {inviteInput && !validInvite && (
                <div className="mt-1 text-xs text-red-500">Enter a valid EVM address.</div>
              )}
              {invites.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {invites.map((a) => (
                    <div key={a} className="text-xs border rounded-md px-2 py-1 flex items-center gap-2">
                      <span>{shortAddr(a as `0x${string}`)}</span>
                      <button
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => setInvites((arr) => arr.filter((x) => x !== a))}
                        aria-label="Remove"
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && <div className="mt-3 text-xs text-red-500">{error}</div>}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="rounded-md border px-3 py-2 text-sm">Cancel</button>
              <button
                onClick={handleCreatePod}
                disabled={creating || !podManager || !ajeyVault}
                className="rounded-md border px-3 py-2 text-sm"
              >{creating ? "Creating…" : "Create Pod"}</button>
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


