"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { type VaultSummary, getAssetAddress, ERC20_MIN_ABI, ajeyVault } from "@/lib/services/vault";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom, encodeFunctionData, parseUnits, toHex, BaseError, ContractFunctionRevertedError, formatEther } from "viem";
import { baseSepolia } from "viem/chains";
import { browserWsPublicClient, browserPublicClient } from "@/lib/chain";
import { AjeyVaultAbi } from "@/abi/AjeyVault";
 

export default function ProductCard() {
  const [data, setData] = useState<VaultSummary | null>(null);
  const [userShare, setUserShare] = useState<string | null>(null); // ajWETH
  const [userInvested, setUserInvested] = useState<string | null>(null); // assets from convertToAssets(balanceOf)
  const [withdrawableNow, setWithdrawableNow] = useState<string | null>(null); // maxWithdraw(user)
  const [feePct, setFeePct] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<string>(""); // deposit amount (ETH)
  const [withdrawAmount, setWithdrawAmount] = useState<string>(""); // withdraw amount (ETH)
  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const [maxWithdrawEth, setMaxWithdrawEth] = useState<string | null>(null);

  const evmProvider = useMemo(() => {
    // Privy embeds wallets; in browser we can access window.ethereum
    if (typeof window !== "undefined" && (window as any).ethereum) {
      return (window as any).ethereum;
    }
    return null;
  }, []);

  useEffect(() => {
    let stopped = false;
    let unwatch: any;
    let lastMarketAt = 0;
    const pull = async () => {
      try {
        if (!ajeyVault) { if (!stopped) setData(null); return; }
        // Read summary directly from chain for freshness
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
            // Preserve previously computed APR fields so they don't get wiped between market refreshes
            const preservedApr = {
              aprMin: prev.aprMin,
              aprMax: prev.aprMax,
              aprRangeText: prev.aprRangeText,
            } as Partial<VaultSummary>;
            return { ...prev, ...summary, ...preservedApr } as VaultSummary;
          });
        }

        // Update APR range occasionally (heavy call) — throttle to ~60s
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
    // initial load
    pull();
    // live updates: subscribe to vault Deposit/WithdrawnFromAave/SuppliedToAave via WS if available
    try {
      if (browserWsPublicClient && ajeyVault) {
        unwatch = browserWsPublicClient.watchContractEvent({
          ...(ajeyVault as any),
          eventName: undefined as any, // subscribe to all and filter
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

  // Load user & vault stats: balanceOf(user), convertToAssets(balance), maxWithdraw(user), feeBps, totalAssets handled in summary
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
    // refresh less frequently as these change on actions/events
    // Prefer block subscription for user updates to reduce eth_call burst
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

  // Load max withdraw for connected user to guide withdrawals
  useEffect(() => {
    let cancelled = false;
    async function loadMax() {
      try {
        const primaryWallet = wallets && wallets.length > 0 ? wallets[0] : undefined;
        const account = (primaryWallet?.address as `0x${string}`) || ((user as any)?.wallet?.address as `0x${string}` | undefined);
        if (!account || !ajeyVault) { setMaxWithdrawEth(null); return; }
        const { publicClient } = await import("@/lib/chain");
        const v = await publicClient.readContract({ ...(ajeyVault as any), functionName: "maxWithdraw", args: [account] }) as bigint;
        if (!cancelled) setMaxWithdrawEth(formatEther(v));
      } catch {
        if (!cancelled) setMaxWithdrawEth(null);
      }
    }
    loadMax();
    return () => { cancelled = true; };
  }, [wallets, user]);

  return (
    <div className="rounded-xl border p-6 bg-background/60 backdrop-blur w-full max-w-[640px] overflow-hidden">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Invest In AAVE Markets</h2>
        <button
          className="text-sm px-3 py-1 rounded-md border"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide" : "Details"}
        </button>
      </div>
      <div className="mt-2">
        <div className="text-3xl font-semibold tracking-tight">{data?.totalAssetsFormatted ? `${Number(data.totalAssetsFormatted).toFixed(4)} ETH` : "—"}</div>
        <div className="mt-1 text-sm text-muted-foreground">Your ajWETH: {userShare ? `${Number(userShare).toFixed(4)} ajWETH` : "—"}</div>
      </div>

      {open && (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground">
            Yield is generated by supplying idle assets to Aave v3. Vault shares track value via ERC‑4626 exchange rate.
          </p>
          <div className="mt-3 grid md:grid-cols-3 gap-3">
            {data?.strategies?.map((s) => (
              <div key={s.id} className="rounded-lg border p-3">
                <div className="text-sm font-medium">{s.name}</div>
                <div className="text-xs text-muted-foreground">{s.allocationPct}% allocated</div>
                <div className="text-xs">APR {s.aprPct}%</div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            {data?.paused ? "Vault paused" : "Vault active"}{data?.ethMode ? " · ETH deposits enabled" : ""}
          </div>
          {maxWithdrawEth && (
            <div className="mt-2 text-xs">
              <span className="text-muted-foreground">Max Withdraw: </span>
              <span>{maxWithdrawEth} ETH</span>
            </div>
          )}
        </div>
      )}

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
          <div className="text-[11px] opacity-80 mt-2">
            Invested (You): {userInvested ? `${Number(userInvested).toFixed(4)} ETH` : "—"} · Vault TVL: {data?.totalAssetsFormatted ? `${Number(data.totalAssetsFormatted).toFixed(4)} ETH` : "—"}
          </div>
        </div>
        {/* Right column: stack actions vertically and allow wrap on small screens */}
        <div className="flex flex-col gap-4 md:items-end">
          <div className="flex flex-wrap items-center gap-3 md:justify-end">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Deposit (ETH)"
              className="w-40 rounded-md border bg-background px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={async () => {
            try {
              const primaryWallet = wallets && wallets.length > 0 ? wallets[0] : undefined;
              const provider = primaryWallet ? await primaryWallet.getEthereumProvider() : (evmProvider as any);
              if (!provider) return;
              const bal = await (provider as any).request?.({ method: "eth_getBalance", params: [primaryWallet?.address, "latest"] });
              if (!bal) return;
              const wei = BigInt(bal);
              // Keep small gas reserve (~0.0002 ETH)
              const reserve = BigInt(2e14);
              const usable = wei > reserve ? wei - reserve : BigInt(0);
              setAmount(formatEther(usable));
            } catch {}
            }}
              className="rounded-md border px-2 py-2 text-xs"
            >Max</button>
            <button
            disabled={!amount || submitting || !!data?.paused}
            onClick={async () => {
            if (!ajeyVault) return alert("Vault not configured");
            try {
              setSubmitting(true);
              const primaryWallet = wallets && wallets.length > 0 ? wallets[0] : undefined;
              const account = (primaryWallet?.address as `0x${string}`) || ((user as any)?.wallet?.address as `0x${string}` | undefined);
              if (!account) throw new Error("No connected address");

              // debug log
              fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "deposit", step: "start", data: { account } }) });

              // Ensure wallet is on Base Sepolia using Privy wallet API where possible
              try {
                if (primaryWallet?.switchChain) {
                  await primaryWallet.switchChain(baseSepolia.id);
                }
              } catch {
                fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "deposit", step: "switchChain_failed" }) });
                throw new Error("Please switch your wallet network to Base Sepolia");
              }

              // Resolve asset and decimals for proper units
              const asset = await getAssetAddress();
              const decimals = (await publicNavigatorReadDecimals(asset)) || 18;
              const assets = parseUnits(amount, decimals);
              fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "deposit", step: "resolved_amount", data: { asset, decimals, assets: assets.toString() } }) });

              // Build viem wallet client from embedded wallet provider
              const provider = primaryWallet ? await primaryWallet.getEthereumProvider() : (evmProvider as any);
              const client = createWalletClient({ chain: baseSepolia, transport: custom(provider) });

              // Log current chain id from provider
              try {
                const cid = await (provider as any)?.request?.({ method: "eth_chainId" });
                fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "deposit", step: "pre_tx_chain", data: { chainId: String(cid) } }) });
              } catch {}

              // Try ETH path first: depositEth(receiver) with value
              let usedEthPath = false;
              try {
                const { publicClient } = await import("@/lib/chain");
                const sim = await publicClient.simulateContract({
                  ...(ajeyVault as any),
                  functionName: "depositEth",
                  args: [account],
                  value: assets,
                  account,
                } as any);
                const req: any = sim.request;
                fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "deposit", step: "simulate_depositEth_ok", data: { gas: req.gas?.toString?.(), maxFeePerGas: req.maxFeePerGas?.toString?.(), maxPriorityFeePerGas: req.maxPriorityFeePerGas?.toString?.(), value: req.value?.toString?.() } }) });
                const hash = await client.writeContract(req);
                fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "deposit", step: "tx_submitted_eth", data: { hash } }) });
                usedEthPath = true;
              } catch (err: any) {
                let reason: string | undefined;
                if (err instanceof BaseError) {
                  const r = err.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | undefined;
                  reason = r?.data?.errorName;
                }
                fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "deposit", step: "simulate_depositEth_failed", data: { reason: reason || err?.message } }) });
                usedEthPath = false;
              }

              if (!usedEthPath) {
                // ERC20 path: if asset is WETH, wrap native ETH first, then approve + deposit(assets, receiver)
                const { publicClient } = await import("@/lib/chain");
                const WETH_BASE_CANONICAL = "0x4200000000000000000000000000000000000006";

                if ((asset as string).toLowerCase() === WETH_BASE_CANONICAL.toLowerCase()) {
                  try {
                    const simWrap = await publicClient.simulateContract({
                      address: asset,
                      abi: [ { name: "deposit", type: "function", stateMutability: "payable", inputs: [], outputs: [] } ] as any,
                      functionName: "deposit",
                      args: [],
                      value: assets,
                      account,
                    } as any);
                    const reqWrap: any = simWrap.request;
                    fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "deposit", step: "simulate_wrap_ok", data: { gas: reqWrap.gas?.toString?.(), value: reqWrap.value?.toString?.() } }) });
                    const hashWrap = await client.writeContract(reqWrap);
                    fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "deposit", step: "wrap_submitted", data: { hash: hashWrap } }) });
                  } catch (err: any) {
                    fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "deposit", step: "wrap_failed", data: { message: err?.message } }) });
                    throw new Error("WETH wrap failed; please ensure ETH balance and try again.");
                  }
                }
                const allowance: bigint = await publicNavigatorReadAllowance(asset, account, ajeyVault.address);
                if (allowance < assets) {
                  const simApprove = await publicClient.simulateContract({
                    address: asset,
                    abi: ERC20_MIN_ABI as any,
                    functionName: "approve",
                    args: [ajeyVault.address, assets],
                    account,
                  } as any);
                  const reqApprove: any = simApprove.request;
                  fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "deposit", step: "simulate_approve_ok", data: { gas: reqApprove.gas?.toString?.(), maxFeePerGas: reqApprove.maxFeePerGas?.toString?.(), maxPriorityFeePerGas: reqApprove.maxPriorityFeePerGas?.toString?.() } }) });
                  const hashApprove = await client.writeContract(reqApprove);
                  fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "deposit", step: "approve_submitted" }) });
                }

                const simDeposit = await publicClient.simulateContract({
                  ...(ajeyVault as any),
                  functionName: "deposit",
                  args: [assets, account],
                  account,
                } as any);
                const reqDep: any = simDeposit.request;
                fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "deposit", step: "simulate_deposit_ok", data: { gas: reqDep.gas?.toString?.(), maxFeePerGas: reqDep.maxFeePerGas?.toString?.(), maxPriorityFeePerGas: reqDep.maxPriorityFeePerGas?.toString?.() } }) });
                let hash: string;
                try {
                  hash = await client.writeContract(reqDep);
                } catch (err: any) {
                  let reason: string | undefined;
                  if (err instanceof BaseError) {
                    const r = err.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | undefined;
                    reason = r?.data?.errorName;
                  }
                  fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "deposit", step: "deposit_write_failed", data: { reason: reason || err?.message } }) });
                  throw err;
                }
                fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "deposit", step: "tx_submitted_erc20", data: { hash } }) });
              }
              setAmount("");
            } catch (e: any) {
              fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "deposit", step: "error", data: { message: e?.message || String(e) } }) });
            } finally {
              fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "deposit", step: "end" }) });
              setSubmitting(false);
            }
            }}
              className="rounded-md border px-4 py-2 text-sm"
            >
              {data?.paused ? "Paused" : submitting ? "Submitting..." : "Deposit"}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3 md:justify-end">
            <input
              type="number"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="Withdraw (ETH)"
              className="w-40 rounded-md border bg-background px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => { if (maxWithdrawEth) setWithdrawAmount(maxWithdrawEth); }}
              className="rounded-md border px-2 py-2 text-xs"
            >Max</button>
            <button
              disabled={!withdrawAmount || withdrawing || !!data?.paused}
              onClick={async () => {
            if (!ajeyVault) return alert("Vault not configured");
            try {
              setWithdrawing(true);
              const primaryWallet = wallets && wallets.length > 0 ? wallets[0] : undefined;
              const account = (primaryWallet?.address as `0x${string}`) || ((user as any)?.wallet?.address as `0x${string}` | undefined);
              if (!account) throw new Error("No connected address");

              // debug log
              fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "withdraw", step: "start", data: { account } }) });

              // Ensure wallet is on Base Sepolia
              try {
                if (primaryWallet?.switchChain) {
                  await primaryWallet.switchChain(baseSepolia.id);
                }
              } catch {
                fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "withdraw", step: "switchChain_failed" }) });
                throw new Error("Please switch your wallet network to Base Sepolia");
              }

              // Resolve asset and decimals and parse amount
              const asset = await getAssetAddress();
              const decimals = (await publicNavigatorReadDecimals(asset)) || 18;
              const assets = parseUnits(withdrawAmount, decimals);
              fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "withdraw", step: "resolved_amount", data: { asset, decimals, assets: assets.toString() } }) });

              // Build viem wallet client from embedded wallet provider
              const provider = primaryWallet ? await primaryWallet.getEthereumProvider() : (evmProvider as any);
              const client = createWalletClient({ chain: baseSepolia, transport: custom(provider) });

              // Log current chain id from provider
              try {
                const cid = await (provider as any)?.request?.({ method: "eth_chainId" });
                fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "withdraw", step: "pre_tx_chain", data: { chainId: String(cid) } }) });
              } catch {}

              // Read guards & limits: paused, ethMode, maxWithdraw
              const { publicClient } = await import("@/lib/chain");
              const [paused, ethMode, maxW] = await Promise.all([
                publicClient.readContract({ ...(ajeyVault as any), functionName: "paused" }) as Promise<boolean>,
                publicClient.readContract({ ...(ajeyVault as any), functionName: "ethMode" }) as Promise<boolean>,
                publicClient.readContract({ ...(ajeyVault as any), functionName: "maxWithdraw", args: [account] }) as Promise<bigint>,
              ]);
              fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "withdraw", step: "guards", data: { paused, ethMode, maxWithdraw: maxW.toString() } }) });
              if (paused) throw new Error("Vault is paused");
              if (!ethMode) throw new Error("ETH withdrawals are disabled");
              if (assets > maxW) throw new Error("Amount exceeds max withdraw");

              // Preview required shares
              const shares = await publicClient.readContract({ ...(ajeyVault as any), functionName: "previewWithdraw", args: [assets] }) as bigint;
              fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "withdraw", step: "preview_withdraw_ok", data: { shares: shares.toString() } }) });

              // Simulate withdrawEth then write
              try {
                const sim = await publicClient.simulateContract({
                  ...(ajeyVault as any),
                  functionName: "withdrawEth",
                  args: [assets, account, account],
                  account,
                } as any);
                const req: any = sim.request;
                fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "withdraw", step: "simulate_withdrawEth_ok", data: { gas: req.gas?.toString?.(), maxFeePerGas: req.maxFeePerGas?.toString?.(), maxPriorityFeePerGas: req.maxPriorityFeePerGas?.toString?.() } }) });
                const hash = await client.writeContract(req);
                fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "withdraw", step: "tx_submitted_withdrawEth", data: { hash } }) });
              } catch (err: any) {
                let reason: string | undefined;
                if (err instanceof BaseError) {
                  const r = err.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | undefined;
                  reason = r?.data?.errorName;
                }
                fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "withdraw", step: "withdraw_write_failed", data: { reason: reason || err?.message } }) });
                throw err;
              }

              setWithdrawAmount("");
            } catch (e: any) {
              fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "withdraw", step: "error", data: { message: e?.message || String(e) } }) });
            } finally {
              fetch("/api/debug/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "withdraw", step: "end" }) });
              setWithdrawing(false);
            }
            }}
              className="rounded-md border px-4 py-2 text-sm"
            >
              {data?.paused ? "Paused" : withdrawing ? "Withdrawing..." : "Withdraw"}
            </button>
          </div>
        </div>
      </div>

      {/* Agent reasoning trace — light subtle panel */}
      <AgentTracePanel />
    </div>
  );
}

async function publicNavigatorReadDecimals(token: `0x${string}`): Promise<number | undefined> {
  try {
    // Lazy import to keep module graph lean
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


function estimateYieldText(data: VaultSummary | null) {
  if (!data) return "—";
  // Simple placeholder: derive pseudo-APR from navPerShare delta vs 1.0
  const nav = Number(data.navPerShare || 0);
  if (!isFinite(nav) || nav <= 0) return "—";
  const apr = Math.max(0, (nav - 1) * 100).toFixed(2);
  return `${apr}%`;
}

  function AgentTracePanel() {
    const [current, setCurrent] = useState<{ id: string; lines: string[]; status: string } | null>(null);
    const [visibleCount, setVisibleCount] = useState(0);
    const linesRef = (typeof window !== "undefined" ? (window as any).ReactTraceLinesRef : undefined) || { current: [] as string[] };
    const containerRef = useRef<HTMLDivElement | null>(null);
    // Track latest trace id across SSE callbacks to avoid stale closures
    const currentIdRef = useRef<string | null>(null);
    // Keep a ref to the live EventSource for proper cleanup
    const esRef = useRef<EventSource | null>(null);
    // Animate fade-out on completion
    const [exiting, setExiting] = useState(false);
    useEffect(() => {
      let ticker: any;
      let stopped = false;
      async function fetchOnce() {
        try {
          const res = await fetch("/api/activity", { cache: "no-store" });
          const data = await res.json();
          const items = (data?.items || []) as Array<any>;
          const traced = items.filter((x) => x?.type === "allocate" && Array.isArray(x.trace) && x.trace.length > 0);
          if (traced.length > 0) {
            const latest = traced[0];
            const id = latest.id as string;
            const lines = (latest.trace as string[]) || [];
            if (!stopped) {
              setCurrent((prev) => {
                const changingId = !prev || prev.id !== id;
                if (changingId) setVisibleCount(0);
                linesRef.current = lines;
                currentIdRef.current = id;
                return { id, lines, status: latest.status as string };
              });
            }
          }
        } catch {}
      }
      fetchOnce();
      // SSE live updates
      try {
        esRef.current = new EventSource("/api/activity/stream", { withCredentials: false } as any);
        // eslint-disable-next-line no-console
        console.log("[trace] SSE connecting to /api/activity/stream");
        const onSnapshot = (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            const latest = data?.latestTrace;
            // eslint-disable-next-line no-console
            console.log("[trace] snapshot", { items: (data?.items || []).length, hasTrace: !!latest });
            if (latest && Array.isArray(latest.trace)) {
              currentIdRef.current = latest.id;
              setCurrent({ id: latest.id, lines: latest.trace, status: latest.status });
              linesRef.current = latest.trace;
              setVisibleCount((n) => Math.min(n, latest.trace.length));
            }
          } catch {}
        };
        const onTrace = (e: MessageEvent) => {
          try {
            const payload = JSON.parse(e.data);
            // eslint-disable-next-line no-console
            console.log("[trace] activity:trace", { id: payload?.id, count: (payload?.lines || []).length });
            if (payload?.id && Array.isArray(payload.lines)) {
              currentIdRef.current = payload.id;
              setCurrent({ id: payload.id, lines: payload.lines, status: "running" });
              linesRef.current = payload.lines;
              setVisibleCount((n) => Math.min(n + 1, payload.lines.length));
            }
          } catch {}
        };
        const onUpdate = (e: MessageEvent) => {
          try {
            const item = JSON.parse(e.data);
            // eslint-disable-next-line no-console
            console.log("[trace] activity:update", { id: item?.id, status: item?.status });
            if (item?.id && item?.status && currentIdRef.current === item.id) {
              setCurrent((prev) => (prev ? { ...prev, status: item.status } : prev));
            }
          } catch {}
        };
        esRef.current.addEventListener("snapshot", onSnapshot as any);
        esRef.current.addEventListener("activity:trace", onTrace as any);
        esRef.current.addEventListener("activity:update", onUpdate as any);
      } catch {}
      // progressive reveal as fallback
      ticker = setInterval(() => {
        const total = (linesRef.current || []).length;
        setVisibleCount((n) => (total === 0 ? 0 : Math.min(n + 1, total)));
      }, 1200);
      return () => {
        stopped = true;
        try { if (esRef.current) esRef.current.close(); } catch {}
        esRef.current = null;
        clearInterval(ticker);
      };
    }, []);

    // Keep newest line focused visually by anchoring to bottom via CSS (no imperative scroll)
    useEffect(() => {
      // Intentionally left empty to avoid janky scrollbars/animations.
    }, [visibleCount, current?.id]);

    // Ephemeral cleanup: keep for ~10s, then fade out smoothly
    useEffect(() => {
      if (current?.status === "success") {
        setExiting(false);
        const fadeAt = 9000; // start fading ~1s before removal
        const removeAt = 10000; // remove after 10s total
        const t1 = setTimeout(() => setExiting(true), fadeAt);
        const t2 = setTimeout(() => {
          setCurrent(null);
          setVisibleCount(0);
          linesRef.current = [];
          setExiting(false);
        }, removeAt);
        return () => { clearTimeout(t1); clearTimeout(t2); };
      }
    }, [current?.status]);

    // Filter out noisy lines; show higher-level reasoning only
    const rawLines = current?.lines || [];
    const lines = rawLines.filter((t) => !(t.startsWith("Deposit detected") || t.startsWith("Idle balance:")));
    const count = Math.min(visibleCount, lines.length);
    if (!current || count === 0) return null;
    const maxVisible = 8;
    const start = Math.max(0, count - maxVisible);
    const display = lines.slice(start, count);
    return (
      <div className="mt-6 rounded-md border bg-white/50 dark:bg-white/5 p-3 overflow-hidden" style={{ opacity: exiting ? 0 : 1, transition: "opacity 800ms ease-out" }}>
        <div className="text-xs font-medium text-muted-foreground mb-2">Agent reasoning</div>
        <div ref={containerRef} className="text-xs relative overflow-hidden flex flex-col justify-end" style={{ minHeight: 56, maxHeight: 200 }}>
          {display.map((t, i) => {
            const age = display.length - 1 - i; // 0 = newest
            const isNewest = age === 0;
            const opacity = Math.max(0.35, 1 - age * 0.14);
            return (
              <div key={`${current.id}_${start + i}`} className={`${isNewest ? "text-foreground" : "text-muted-foreground"}`} style={{ opacity, transition: "opacity 420ms ease, transform 420ms ease" }}>
                <span className={"inline-block animate-[slideUpFade_450ms_ease] " + (isNewest ? "animate-[pulseHighlight_1200ms_ease-out]" : "")}>{t}</span>
              </div>
            );
          })}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-white/70 dark:from-background/70 to-transparent" />
        </div>
        <style>{`@keyframes slideUpFade{from{transform:translateY(8px);opacity:.0;filter:blur(1px)}to{transform:translateY(0);opacity:1;filter:blur(0)}}@keyframes pulseHighlight{0%{background:rgba(255,255,255,.16)}100%{background:transparent}}`}</style>
      </div>
    );
  }


