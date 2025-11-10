"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type VaultSummary, getAssetAddress, ERC20_MIN_ABI, ajeyVault } from "@/lib/services/vault";
import { usePrivy, useWallets, useBaseAccountSdk } from "@privy-io/react-auth";
import { createWalletClient, custom, encodeFunctionData, parseUnits, toHex, BaseError, ContractFunctionRevertedError, formatEther, maxUint256 } from "viem";
import { baseSepolia } from "viem/chains";
import { browserWsPublicClient, browserPublicClient } from "@/lib/chain";
import { AjeyVaultAbi } from "@/abi/AjeyVault";
import { simulateApproveReallocatorMax, readShareAllowance } from "@/lib/services/reallocator";

export default function OctantDonationProductCard() {
  const [data, setData] = useState<VaultSummary | null>(null);
  const [userShare, setUserShare] = useState<string | null>(null);
  const [userInvested, setUserInvested] = useState<string | null>(null);
  const [withdrawableNow, setWithdrawableNow] = useState<string | null>(null);
  const [feePct, setFeePct] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<string>("");
  const [withdrawAmount, setWithdrawAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [needReallocApproval, setNeedReallocApproval] = useState<boolean | null>(null);
  const [enablingRealloc, setEnablingRealloc] = useState(false);
  const [needsOrchestratorApproval, setNeedsOrchestratorApproval] = useState<boolean>(false);
  const [checkingOrchestratorApproval, setCheckingOrchestratorApproval] = useState<boolean>(false);
  const [approvingOrchestrator, setApprovingOrchestrator] = useState<boolean>(false);
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const reallocPromptedRef = useRef(false);
  const [activeAddress, setActiveAddress] = useState<`0x${string}` | null>(null);

  // Donation strategies (single prominent dropdown)
  type StrategyKey = "crypto_maxi" | "balanced" | "humanitarian_maxi";
  type DonationMixAddressItem = { address: `0x${string}`; pct: number; label: string };
  const WEB3AFRIKA: `0x${string}` = "0x4BaF3334dF86FB791A6DF6Cf4210C685ab6A1766";
  const SAVE_THE_CHILDREN: `0x${string}` = "0x82657beC713AbA72A68D3cD903BE5930CC45dec3";
  const WATER_PROJECT: `0x${string}` = "0xA0B0Bf2D837E87d2f4338bFa579bFACd1133cFBd";
  const [strategy, setStrategy] = useState<StrategyKey | "">("");
  const [strategySaved, setStrategySaved] = useState<boolean>(false);
  const strategyValid = !!strategy;
  function computeStrategyMix(key: StrategyKey | ""): DonationMixAddressItem[] {
    if (key === "crypto_maxi") {
      return [
        { address: WEB3AFRIKA, pct: 60, label: "Crypto Public Goods" },
        { address: SAVE_THE_CHILDREN, pct: 20, label: "Humanitarian" },
        { address: WATER_PROJECT, pct: 20, label: "Hygiene" },
      ];
    }
    if (key === "balanced") {
      return [
        { address: WEB3AFRIKA, pct: 40, label: "Crypto Public Goods" },
        { address: SAVE_THE_CHILDREN, pct: 30, label: "Humanitarian" },
        { address: WATER_PROJECT, pct: 30, label: "Hygiene" },
      ];
    }
    if (key === "humanitarian_maxi") {
      return [
        { address: SAVE_THE_CHILDREN, pct: 40, label: "Humanitarian" },
        { address: WATER_PROJECT, pct: 40, label: "Hygiene" },
        { address: WEB3AFRIKA, pct: 20, label: "Crypto Public Goods" },
      ];
    }
    return [];
  }
  function strategyBreakdown(key: StrategyKey | ""): string {
    if (key === "crypto_maxi") return "60% Crypto · 20% Humanitarian · 20% Hygiene";
    if (key === "balanced") return "40% Crypto · 30% Humanitarian · 30% Hygiene";
    if (key === "humanitarian_maxi") return "40% Humanitarian · 40% Hygiene · 20% Crypto";
    return "";
  }

  const evmProvider = useMemo(() => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      return (window as any).ethereum;
    }
    return null;
  }, []);

  const { baseAccountSdk } = useBaseAccountSdk();

  async function getBaseProviderIfConnected(): Promise<{ provider: any; address: `0x${string}` } | null> {
    try {
      const provider = baseAccountSdk?.getProvider?.();
      if (!provider) return null;
      const addresses = await provider.request({ method: "eth_accounts" });
      const addr = Array.isArray(addresses) && addresses[0];
      if (!addr) return null;
      return { provider, address: addr as `0x${string}` };
    } catch {
      return null;
    }
  }

  async function getActiveSigner(): Promise<{ provider: any; address: `0x${string}` | undefined }> {
    const base = await getBaseProviderIfConnected();
    if (base) return base;
    const primaryWallet = wallets && wallets.length > 0 ? wallets[0] : undefined;
    const addr = (primaryWallet?.address as `0x${string}`) || ((user as any)?.wallet?.address as `0x${string}` | undefined);
    const provider = primaryWallet ? await primaryWallet.getEthereumProvider() : (evmProvider as any);
    return { provider, address: addr };
  }

  async function ensureBaseChain(provider: any) {
    try {
      await provider?.request?.({ method: "wallet_switchEthereumChain", params: [{ chainId: toHex(baseSepolia.id) }] });
    } catch {}
  }

  useEffect(() => {
    (async () => {
      try {
        const { address } = await getActiveSigner();
        setActiveAddress(address || null);
      } catch {}
    })();
  }, [wallets, user]);

  // Load saved strategy (if any)
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const savedKey = window.localStorage.getItem("octant_donation_strategy");
      if (savedKey === "crypto_maxi" || savedKey === "balanced" || savedKey === "humanitarian_maxi") {
        setStrategy(savedKey);
        setStrategySaved(true);
      }
    } catch {}
  }, []);

  // Orchestrator approval need check (optional, only if configured)
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setCheckingOrchestratorApproval(true);
        setNeedsOrchestratorApproval(false);
        const { getOrchestratorAddress } = await import("@/lib/address-book");
        const orchestrator = getOrchestratorAddress();
        if (!orchestrator) { setNeedsOrchestratorApproval(false); return; }
        if (!amount) { setNeedsOrchestratorApproval(false); return; }
        const { address: account } = await getActiveSigner();
        if (!account) { setNeedsOrchestratorApproval(true); return; }
        const token = "0x4200000000000000000000000000000000000006" as `0x${string}`;
        const assets = parseUnits(amount, 18);
        const allowance = await publicNavigatorReadAllowance(token, account, orchestrator);
        if (!active) return;
        setNeedsOrchestratorApproval(allowance < assets);
      } catch {
        if (!active) return;
        setNeedsOrchestratorApproval(true);
      } finally {
        if (active) setCheckingOrchestratorApproval(false);
      }
    })();
    return () => { active = false; };
  }, [amount, wallets, user]);

  useEffect(() => {
    let stopped = false;
    let unwatch: any;
    let lastMarketAt = 0;
    const pull = async () => {
      try {
        if (!ajeyVault) { if (!stopped) setData(null); return; }
        const [totalAssets, totalSupply, paused, ethMode] = await Promise.all([
          browserPublicClient.readContract({ ...(ajeyVault as any), functionName: "totalAssets" }) as Promise<bigint>,
          browserPublicClient.readContract({ ...(ajeyVault as any), functionName: "totalSupply" }) as Promise<bigint>,
          browserPublicClient.readContract({ ...(ajeyVault as any), functionName: "paused" }) as Promise<boolean>,
          browserPublicClient.readContract({ ...(ajeyVault as any), functionName: "ethMode" }) as Promise<boolean>,
        ]);
        const navPerShare = totalSupply === BigInt(0) ? 0 : Number(totalAssets) / Number(totalSupply);
        const summary: VaultSummary = {
          totalAssetsUSD: undefined,
          totalAssets: Number(totalAssets),
          totalAssetsWei: totalAssets.toString(),
          totalAssetsFormatted: formatEther(totalAssets),
          navPerShare,
          vTokenSupply: Number(totalSupply),
          paused,
          ethMode,
          strategies: [],
          aprMin: undefined,
          aprMax: undefined,
          aprRangeText: undefined,
        };
        if (!stopped) {
          setData((prev) => {
            if (!prev) return summary;
            const preservedApr = { aprMin: prev.aprMin, aprMax: prev.aprMax, aprRangeText: prev.aprRangeText } as Partial<VaultSummary>;
            return { ...prev, ...summary, ...preservedApr } as VaultSummary;
          });
        }

        const now = Date.now();
        if (now - lastMarketAt > 60000) {
          lastMarketAt = now;
          try {
            const mod = await import("@/lib/services/aave-markets");
            const snap = await mod.fetchAaveSupplySnapshot();
            const aprs = (snap?.reserves || [])
              .map((r: any) => (typeof r?.supplyAprPercent === "number" ? r.supplyAprPercent : 0))
              .filter((x: number) => Number.isFinite(x) && x > 0);
            if (aprs.length > 0 && !stopped) {
              const aprMin = Math.min(...aprs);
              const aprMax = Math.max(...aprs);
              setData((prev) => prev ? { ...prev, aprMin, aprMax, aprRangeText: `${aprMin}%–${aprMax}%` } : prev);
            }
          } catch {}
        }
      } catch {
        if (!stopped) setData(null);
      }
    };
    pull();
    try {
      if (browserWsPublicClient && ajeyVault) {
        unwatch = browserWsPublicClient.watchContractEvent({
          ...(ajeyVault as any),
          eventName: undefined as any,
          onLogs: () => pull(),
        } as any);
      } else {
        const t = setInterval(pull, 20000);
        unwatch = () => clearInterval(t);
      }
    } catch {
      const t = setInterval(pull, 20000);
      unwatch = () => clearInterval(t);
    }
    return () => { stopped = true; try { if (unwatch) unwatch(); } catch {} };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadUser() {
      try {
        if (!ajeyVault) return;
        const primaryWallet = wallets && wallets.length > 0 ? wallets[0] : undefined;
        const account = (primaryWallet?.address as `0x${string}`) || ((user as any)?.wallet?.address as `0x${string}` | undefined);
        const { publicClient } = await import("@/lib/chain");
        const [shares, feeBps, invested, maxW] = await Promise.all([
          account ? publicClient.readContract({ ...(ajeyVault as any), functionName: "balanceOf", args: [account] }) as Promise<bigint> : Promise.resolve(BigInt(0)),
          publicClient.readContract({ ...(ajeyVault as any), functionName: "feeBps" }) as Promise<number>,
          (async () => {
            if (!account) return BigInt(0);
            const s = await publicClient.readContract({ ...(ajeyVault as any), functionName: "balanceOf", args: [account] }) as bigint;
            return await publicClient.readContract({ ...(ajeyVault as any), functionName: "convertToAssets", args: [s] }) as bigint;
          })(),
          account ? publicClient.readContract({ ...(ajeyVault as any), functionName: "maxWithdraw", args: [account] }) as Promise<bigint> : Promise.resolve(BigInt(0)),
        ]);
        if (!cancelled) {
          setUserShare(formatEther(shares));
          setFeePct((Number(feeBps) / 100).toFixed(2) + "%");
          setUserInvested(formatEther(invested));
          setWithdrawableNow(formatEther(maxW));
        }
      } catch {
        if (!cancelled) {
          setUserShare(null);
          setFeePct(null);
          setUserInvested(null);
          setWithdrawableNow(null);
        }
      }
    }
    loadUser();
    let unsubscribe: any;
    try {
      if (browserWsPublicClient) {
        unsubscribe = browserWsPublicClient.watchBlocks({ onBlock: () => loadUser() });
      } else {
        const t = setInterval(loadUser, 30000); unsubscribe = () => clearInterval(t);
      }
    } catch {
      const t = setInterval(loadUser, 30000); unsubscribe = () => clearInterval(t);
    }
    return () => { cancelled = true; if (unsubscribe) try { unsubscribe(); } catch {} };
  }, [wallets, user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!ajeyVault) return;
        const base = await getBaseProviderIfConnected();
        const primaryWallet = wallets && wallets.length > 0 ? wallets[0] : undefined;
        const owner = (base?.address as `0x${string}` | undefined) || (primaryWallet?.address as `0x${string}` | undefined) || ((user as any)?.wallet?.address as `0x${string}` | undefined);
        if (!owner) { if (!cancelled) setNeedReallocApproval(null); return; }
        const allowance = await readShareAllowance(owner, browserPublicClient as any);
        const { maxUint256 } = await import("viem");
        const need = allowance !== maxUint256;
        if (!cancelled) setNeedReallocApproval(need);
      } catch {
        if (!cancelled) setNeedReallocApproval(null);
      }
    })();
    return () => { cancelled = true; };
  }, [wallets, user]);

  useEffect(() => {
    let unwatchSupplied: any;
    let stopped = false;
    (async () => {
      try {
        const client: any = browserWsPublicClient || browserPublicClient;
        if (!client || !ajeyVault) return;
        const usePolling = !browserWsPublicClient;
        unwatchSupplied = client.watchContractEvent({
          ...(ajeyVault as any),
          abi: AjeyVaultAbi as any,
          eventName: "SuppliedToAave",
          poll: usePolling as any,
          pollingInterval: 15000 as any,
          onLogs: async (logs: any[]) => {
            if (stopped) return;
            if (reallocPromptedRef.current) return;
            try { fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "reallocator", step: "supplied_event", data: { count: logs?.length } }) }); } catch {}
            try {
              const base = await getBaseProviderIfConnected();
              const primaryWallet = wallets && wallets.length > 0 ? wallets[0] : undefined;
              const owner = (base?.address as `0x${string}` | undefined) || (primaryWallet?.address as `0x${string}` | undefined) || ((user as any)?.wallet?.address as `0x${string}` | undefined);
              if (!owner) return;
              try { fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "reallocator", step: "owner_resolved", data: { owner } }) }); } catch {}
              const res: any = await simulateApproveReallocatorMax(owner, { client: browserPublicClient });
              if (res?.alreadyMax) { reallocPromptedRef.current = true; return; }
              try { fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "reallocator", step: "will_prompt" }) }); } catch {}
              const ok = typeof window !== "undefined" ? window.confirm("Enable reallocation by approving AgentReallocator to spend your vault shares?") : false;
              if (!ok) return;
              const { provider } = await getActiveSigner();
              await ensureBaseChain(provider);
              if (!provider) return;
              const clientW = createWalletClient({ chain: baseSepolia, transport: custom(provider) });
              const txHash = await clientW.writeContract(res.request);
              try { fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "reallocator", step: "approval_submitted", data: { txHash } }) }); } catch {}
              reallocPromptedRef.current = true;
            } catch (e) {
              // eslint-disable-next-line no-console
              console.error("[reallocator] approval flow failed", (e as any)?.message || e);
              try { fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "reallocator", step: "error", data: { message: (e as any)?.message || String(e) } }) }); } catch {}
            }
          },
        } as any);
      } catch {}
    })();
    return () => { stopped = true; try { if (unwatchSupplied) unwatchSupplied(); } catch {} };
  }, [wallets, user, evmProvider]);

  return (
    <div className="relative rounded-2xl border border-white/20 p-6 bg-black/10 dark:bg-black/50 backdrop-blur-xl w-full max-w-[640px] overflow-hidden shadow-[0_0_1px_rgba(255,255,255,0.25),0_10px_40px_-10px_rgba(124,58,237,0.35)]">
      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/10" />
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(120%_80%_at_50%_-10%,rgba(255,255,255,0.24),transparent_60%)] opacity-30" />
      <div className="pointer-events-none absolute -inset-x-20 -top-1/2 h-[220%] bg-[linear-gradient(120deg,rgba(255,255,255,0)_35%,rgba(255,255,255,0.18),rgba(255,255,255,0)_65%)] opacity-40 animate-[sheenSweep_9s_linear_infinite]" />
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Octant Donation: Invest & Direct Your Yield</h2>
        <button className="text-sm px-3 py-1 rounded-md border" onClick={() => setOpen((v) => !v)}>{open ? "Hide" : "Details"}</button>
      </div>
      <div className="mt-2">
        <div className="text-3xl font-semibold tracking-tight">{data?.totalAssetsFormatted ? `${Number(data.totalAssetsFormatted).toFixed(4)} ETH` : "—"}</div>
        <div className="mt-1 text-sm text-muted-foreground">Your ajWETH: {userShare ? `${Number(userShare).toFixed(4)} ajWETH` : "—"}</div>
      </div>

      {open && (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground">Yield is generated by supplying idle assets to Aave v3. Your yield is allocated to selected Octant causes using your chosen proportions.</p>
          <div className="mt-3 text-xs text-muted-foreground">{data?.paused ? "Vault paused" : "Vault active"}{data?.ethMode ? " · ETH deposits enabled" : ""}</div>
          {withdrawableNow && (
            <div className="mt-2 text-xs"><span className="text-muted-foreground">Max Withdraw: </span><span>{withdrawableNow} ETH</span></div>
          )}
          {needReallocApproval && (
            <div className="mt-3">
              <button
                type="button"
                disabled={enablingRealloc}
                onClick={async () => {
                  try {
                    setEnablingRealloc(true);
                    const primaryWallet = wallets && wallets.length > 0 ? wallets[0] : undefined;
                    const owner = (primaryWallet?.address as `0x${string}` | undefined) || ((user as any)?.wallet?.address as `0x${string}` | undefined);
                    if (!owner) return;
                    const res: any = await simulateApproveReallocatorMax(owner, { client: browserPublicClient });
                    if (res?.alreadyMax) { setNeedReallocApproval(false); return; }
                    try { if (primaryWallet?.switchChain) await primaryWallet.switchChain(baseSepolia.id); } catch {}
                    const provider = primaryWallet ? await primaryWallet.getEthereumProvider() : (evmProvider as any);
                    if (!provider) return;
                    const clientW = createWalletClient({ chain: baseSepolia, transport: custom(provider) });
                    await clientW.writeContract(res.request);
                    setNeedReallocApproval(false);
                  } catch (e) {
                    // eslint-disable-next-line no-console
                    console.error("[reallocator] manual enable failed", (e as any)?.message || e);
                  } finally {
                    setEnablingRealloc(false);
                  }
                }}
                className="rounded-md border px-3 py-1 text-xs"
              >{enablingRealloc ? "Enabling…" : "Enable reallocation"}</button>
            </div>
          )}
        </div>
      )}

      {/* Donation strategy selector */}
      <div className="mt-4 rounded-lg border border-white/15 p-4 bg-white/60 dark:bg-white/5">
        <div className="text-sm text-foreground mb-3">
          Choose a donation strategy. Funds are allocated to:
          <span className="block mt-1 text-xs">
            - <a className="underline" href="https://www.web3afrika.com/about" target="_blank" rel="noreferrer">Web3Afrika</a> (Crypto Public Goods),
            <span> </span>
            - <a className="underline" href="https://www.savethechildren.org.uk/" target="_blank" rel="noreferrer">Save the Children UK</a> (Humanitarian),
            <span> </span>
            - <a className="underline" href="https://thewaterproject.org/" target="_blank" rel="noreferrer">The Water Project</a> (Hygiene/WASH Kenya).
          </span>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={strategy}
            onChange={(e) => { setStrategy(e.target.value as StrategyKey | ""); setStrategySaved(false); }}
            className="min-w-0 flex-1 rounded-md border border-white/20 bg-white text-black dark:bg-white dark:text-black shadow-inner px-3 py-2 text-sm"
          >
            <option value="" className="text-black">Select a donation strategy…</option>
            <option value="crypto_maxi" className="text-black">Crypto‑maxi (60/20/20)</option>
            <option value="balanced" className="text-black">Balanced (40/30/30)</option>
            <option value="humanitarian_maxi" className="text-black">Humanitarian‑maxi (20/40/40)</option>
          </select>
          <button
            type="button"
            className="rounded-md border px-3 py-2 text-sm"
            onClick={() => {
              try {
                if (typeof window !== "undefined" && strategy) {
                  window.localStorage.setItem("octant_donation_strategy", strategy as string);
                  const mix = computeStrategyMix(strategy);
                  window.localStorage.setItem("octant_donation_mix_v2", JSON.stringify(mix));
                  try { fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "octant", step: "strategy_saved", data: { strategy, mix } }) }); } catch {}
                  setStrategySaved(true);
                }
              } catch {}
            }}
          >{strategySaved ? "Saved" : "Save"}</button>
        </div>
        {!!strategy && (
          <div className="mt-2 text-xs text-muted-foreground">Breakdown: {strategyBreakdown(strategy)}</div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <div className="text-xs text-muted-foreground space-y-1 min-w-0">
          <div className="flex gap-6">
            <div>
              <div className="text-muted-foreground">Withdrawable now</div>
              <div className="font-medium">{withdrawableNow ? `${Number(withdrawableNow).toFixed(4)} ETH` : "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Yield (Aave)</div>
              <div className="font-medium">{data?.aprRangeText || "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Fee</div>
              <div className="font-medium">{feePct || "—"}</div>
            </div>
          </div>
          <div className="text-[11px] opacity-80 mt-2">Invested (You): {userInvested ? `${Number(userInvested).toFixed(4)} ETH` : "—"} · Vault TVL: {data?.totalAssetsFormatted ? `${Number(data.totalAssetsFormatted).toFixed(4)} ETH` : "—"}</div>
        </div>
        <div className="flex flex-col gap-4 md:items-end">
          <div className="flex flex-wrap items-center gap-3 md:justify-end">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Deposit (ETH)"
              className="w-40 rounded-md border border-white/20 bg-gray-100/80 dark:bg-white/10 text-foreground placeholder:text-muted-foreground/70 shadow-inner px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={async () => {
                try {
                  const { provider, address: acct } = await getActiveSigner();
                  if (!provider) return;
                  const bal = await (provider as any).request?.({ method: "eth_getBalance", params: [acct, "latest"] });
                  if (!bal) return;
                  const wei = BigInt(bal);
                  const reserve = BigInt(2e14);
                  const usable = wei > reserve ? wei - reserve : BigInt(0);
                  setAmount(formatEther(usable));
                } catch {}
              }}
              className="rounded-md border px-2 py-2 text-xs"
            >Max</button>
            {/* Optional: ERC20 approval to Orchestrator before queuing */}
            {!!(process.env.NEXT_PUBLIC_ORCHESTRATOR_ADDRESS || true) && (
              <button
                type="button"
                disabled={approvingOrchestrator || checkingOrchestratorApproval || !amount}
                onClick={async () => {
                  try {
                    setApprovingOrchestrator(true);
                    const { getOrchestratorAddress } = await import("@/lib/address-book");
                    const orchestrator = getOrchestratorAddress();
                    if (!orchestrator) return;
                    const { provider, address: account } = await getActiveSigner();
                    if (!account) throw new Error("No connected address");
                    await ensureBaseChain(provider);
                    const token = "0x4200000000000000000000000000000000000006" as `0x${string}`;
                    const client = createWalletClient({ chain: baseSepolia, transport: custom(provider) });
                    const { publicClient } = await import("@/lib/chain");
                    const simApprove = await publicClient.simulateContract({
                      address: token,
                      abi: ERC20_MIN_ABI as any,
                      functionName: "approve",
                      args: [orchestrator, maxUint256],
                      account,
                    } as any);
                    const req: any = simApprove.request;
                    await client.writeContract(req);
                    setNeedsOrchestratorApproval(false);
                  } catch (e) {
                    // eslint-disable-next-line no-console
                    console.error("[octant] orchestrator approve failed", (e as any)?.message || e);
                  } finally {
                    setApprovingOrchestrator(false);
                  }
                }}
                className="rounded-md border px-3 py-2 text-xs"
              >{approvingOrchestrator ? "Approving…" : needsOrchestratorApproval ? "Approve Orchestrator" : "Approved"}</button>
            )}
            <button
              disabled={!amount || submitting || !!data?.paused || !strategyValid}
              onClick={async () => {
                try {
                  setSubmitting(true);
                  const { address: account } = await getActiveSigner();
                  if (!account) throw new Error("No connected address");
                  if (!strategyValid) throw new Error("Select a donation strategy first");
                  const selected = computeStrategyMix(strategy);
                  // Persist strategy + mix locally and log
                  try {
                    if (typeof window !== "undefined") {
                      window.localStorage.setItem("octant_donation_strategy", strategy as string);
                      window.localStorage.setItem("octant_donation_mix_v2", JSON.stringify(selected));
                    }
                  } catch {}
                  try { fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "octant", step: "queue_deposit_intent", data: { account, strategy, mix: selected, amount } }) }); } catch {}
                  // Build intent for Agent per integration guide
                  const WETH_BASE_CANONICAL = "0x4200000000000000000000000000000000000006";
                  const amountWei = parseUnits(amount, 18).toString();
                  const profile = strategy === "crypto_maxi" ? "MaxCrypto" : strategy === "balanced" ? "Balanced" : "MaxHumanitarian";
                  const intent = {
                    profile,
                    from: account,
                    inputAsset: WETH_BASE_CANONICAL,
                    amountInWei: amountWei,
                    targetAsset: WETH_BASE_CANONICAL,
                    receiver: account,
                    minAmountOutWei: "0",
                    slippageBps: 50,
                    donationMix: selected.map((m) => ({ address: m.address, pct: m.pct, label: m.label })),
                  };
                  await fetch("/api/intents/deposit", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ signedIntent: intent }),
                  });
                  setAmount("");
                  setStrategySaved(true);
                } catch (e: any) {
                  // eslint-disable-next-line no-console
                  console.error("[octant] queue deposit error", e?.message || e);
                } finally {
                  setSubmitting(false);
                }
              }}
              className="rounded-md border px-4 py-2 text-sm"
            >{data?.paused ? "Paused" : submitting ? "Queuing..." : "Queue Deposit"}</button>
          </div>
          <div className="flex flex-wrap items-center gap-3 md:justify-end">
            <input
              type="number"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="Withdraw (ETH)"
              className="w-40 rounded-md border border-white/20 bg-gray-100/80 dark:bg-white/10 text-foreground placeholder:text-muted-foreground/70 shadow-inner px-3 py-2 text-sm"
            />
            <button type="button" onClick={() => { if (withdrawableNow) setWithdrawAmount(withdrawableNow); }} className="rounded-md border px-2 py-2 text-xs">Max</button>
            <button
              disabled={!withdrawAmount || withdrawing || !!data?.paused}
              onClick={async () => {
                if (!ajeyVault) return alert("Vault not configured");
                try {
                  setWithdrawing(true);
                  const { provider, address: account } = await getActiveSigner();
                  if (!account) throw new Error("No connected address");
                  try { await ensureBaseChain(provider); } catch { throw new Error("Please switch your wallet network to Base Sepolia"); }
                  const asset = await getAssetAddress();
                  const decimals = (await publicNavigatorReadDecimals(asset)) || 18;
                  const assets = parseUnits(withdrawAmount, decimals);
                  const client = createWalletClient({ chain: baseSepolia, transport: custom(provider) });
                  const { publicClient } = await import("@/lib/chain");
                  const [paused, ethMode, maxW] = await Promise.all([
                    publicClient.readContract({ ...(ajeyVault as any), functionName: "paused" }) as Promise<boolean>,
                    publicClient.readContract({ ...(ajeyVault as any), functionName: "ethMode" }) as Promise<boolean>,
                    publicClient.readContract({ ...(ajeyVault as any), functionName: "maxWithdraw", args: [account] }) as Promise<bigint>,
                  ]);
                  if (paused) throw new Error("Vault is paused");
                  if (!ethMode) throw new Error("ETH withdrawals are disabled");
                  if (assets > maxW) throw new Error("Amount exceeds max withdraw");
                  await publicClient.readContract({ ...(ajeyVault as any), functionName: "previewWithdraw", args: [assets] }) as bigint;
                  try {
                    const sim = await publicClient.simulateContract({ ...(ajeyVault as any), functionName: "withdrawEth", args: [assets, account, account], account } as any);
                    const req: any = sim.request;
                    await client.writeContract(req);
                  } catch (err) { throw err as any; }
                  setWithdrawAmount("");
                } catch (e: any) {
                  // eslint-disable-next-line no-console
                  console.error("[octant] withdraw error", e?.message || e);
                } finally {
                  setWithdrawing(false);
                }
              }}
              className="rounded-md border px-4 py-2 text-sm"
            >{data?.paused ? "Paused" : withdrawing ? "Withdrawing..." : "Withdraw"}</button>
          </div>
        </div>
      </div>

      <style>{`@keyframes sheenSweep{0%{transform:translateX(-55%)}100%{transform:translateX(55%)}}`}</style>
    </div>
  );
}

async function publicNavigatorReadDecimals(token: `0x${string}`): Promise<number | undefined> {
  try {
    const { publicClient } = await import("@/lib/chain");
    const dec = (await publicClient.readContract({ address: token, abi: ERC20_MIN_ABI, functionName: "decimals" })) as number;
    return dec;
  } catch {
    return undefined;
  }
}

async function publicNavigatorReadAllowance(token: `0x${string}`, owner: `0x${string}`, spender: `0x${string}`): Promise<bigint> {
  try {
    const { publicClient } = await import("@/lib/chain");
    return (await publicClient.readContract({ address: token, abi: ERC20_MIN_ABI, functionName: "allowance", args: [owner, spender] })) as bigint;
  } catch {
    return BigInt(0);
  }
}


