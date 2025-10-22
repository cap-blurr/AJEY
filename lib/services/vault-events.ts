import { publicClient, wsPublicClient, formatEth } from "@/lib/chain";
import { ajeyVault, readIdleUnderlying, rebasingWrapper } from "@/lib/services/vault";
import { addActivity, appendActivityTrace, updateActivity } from "@/lib/activity";
import { fetchPoolYields } from "@/lib/services/aave";
import { executeAllocation } from "@/lib/agents/workflow";
import { generateReasoningPlan } from "@/lib/agents/gemini";
import { runRebaseCycle } from "@/lib/agents/rebase";
import { fetchAaveSupplySnapshot } from "@/lib/services/aave-markets";
import { getWalletClient } from "@/lib/agents/wallet";

let started: boolean = (globalThis as any).__ajeyWatcherStarted || false;
let allocating = false;
let lastHandledDepositTs = 0;
let currentTraceId: string | undefined;

const ENABLED = process.env.AGENT_ENABLE_WATCHER !== "false"; // default enabled unless explicitly disabled
const POLL_MS = Number.parseInt(process.env.VAULT_EVENT_POLL_MS || "60000"); // default 60s to reduce filter churn
const MIN_ALLOCATE_INTERVAL_MS = Number.parseInt(process.env.AGENT_MIN_ALLOCATE_INTERVAL_MS || "60000"); // default 60s
const REBASE_INTERVAL_MS = Number.parseInt(process.env.AGENT_REBASE_INTERVAL_MS || "300000"); // default 5m

export function startVaultEventWatcher() {
  if (started) return;
  if (!ENABLED) {
    // eslint-disable-next-line no-console
    console.log("[agent] vault event watcher disabled (AGENT_ENABLE_WATCHER=false)");
    return; // gated by env to avoid accidental RPC usage
  }
  started = true;
  (globalThis as any).__ajeyWatcherStarted = true;
  if (!ajeyVault) return;
  const vault = ajeyVault!;
  // eslint-disable-next-line no-console
  console.log("[agent] starting vault event watcher", { vault: vault.address });
  const wrapper = rebasingWrapper;
  // Create wallet once to ensure readiness; avoid logging sensitive info
  try { getWalletClient("default"); } catch {}

  const eventClient: any = wsPublicClient || publicClient;
  const usePolling = !wsPublicClient; // prefer WebSocket subscriptions if available

  // Helper: check if event exists in ABI to avoid runtime errors
  const abiHasEvent = (abi: any[], name: string) => {
    try {
      return Array.isArray(abi) && abi.some((e: any) => e?.type === "event" && e?.name === name);
    } catch {
      return false;
    }
  };

  // When users deposit, vault emits ERC-4626 Deposit(owner, receiver, assets, shares)
  if (abiHasEvent(vault.abi as any[], "Deposit")) eventClient.watchContractEvent({
    ...vault,
    eventName: "Deposit",
    poll: usePolling,
    pollingInterval: POLL_MS,
    onLogs: async (logs: any[]) => {
      try {
        const last: any = logs[logs.length - 1];
        const head = await publicClient.getBlockNumber().catch(() => undefined);
        const assets = last?.args?.assets as bigint | undefined;
        const txHash = (last as any)?.transactionHash as string | undefined;
        // eslint-disable-next-line no-console
        console.log("[agent] Deposit event detected", { count: logs.length, assets: String(assets ?? BigInt(0)), blockNumber: head?.toString(), tx: txHash });
        // eslint-disable-next-line no-console
        console.log("[trace] init", { id: currentTraceId, assets: String(assets ?? BigInt(0)) });
        // Record user deposit activity for UI
        try {
          if (assets) {
            addActivity({ id: `dep_${Date.now()}`, type: "user_deposit", status: "success", timestamp: Date.now(), title: `Deposit ${formatEth(assets)} ETH`, details: txHash || "" });
          }
        } catch {}
        // Create a fresh reasoning trace for this deposit cycle
        currentTraceId = `trace_${Date.now()}`;
        addActivity({ id: currentTraceId, type: "allocate", status: "running", timestamp: Date.now(), title: "Agent reasoning", trace: [] });
        appendActivityTrace(currentTraceId, "Agent is reasoning…");

        // Debounce frequent deposits to avoid repeated allocations
        const now = Date.now();
        if (now - lastHandledDepositTs < MIN_ALLOCATE_INTERVAL_MS) return;
        if (allocating) return;
        lastHandledDepositTs = now;

        // 1) Read current idle funds
        const idle = await readIdleUnderlying();
        console.log("[agent] idleUnderlying(wei)", { idleWei: String(idle) });
        // eslint-disable-next-line no-console
        console.log("[trace] line", { id: currentTraceId, line: `Idle balance: ${String(idle)} wei` });
        if (currentTraceId) appendActivityTrace(currentTraceId, `Idle balance: ${String(idle)} wei`);
        // Idle is in smallest unit (wei); allow 4 decimals on ETH: threshold = 0.0001 ETH
        const threshold = BigInt("100000000000000"); // 1e14 wei
        if (idle < threshold) { console.log("[agent] idleUnderlying below threshold, skip", { idle: idle.toString() }); return; }

        // 2) Fetch supply snapshot and run reasoning
        const market = await fetchAaveSupplySnapshot();
        const instructions = {
          version: 1,
          objective: "Propose a single WETH supply allocation and amount in wei.",
          policy: {
            filter: { requireActive: true, requireNotFrozen: true, minAvailableUSD: "0" },
            rank: ["supplyAprPercent desc", "availableUSD desc", "tvlUSD desc"],
          },
          context: {
            vault: { address: vault.address, idleWei: String(idle), amountUnit: "wei" },
            market,
          },
          guidance: [
            "Vault asset is WETH and pool is fixed; return only amountWei rounded down to nearest 1e14 wei.",
          ],
        };
        const planRes = await generateReasoningPlan({ kind: "deposit", payload: instructions });
        console.log("[agent] reasoning result", JSON.stringify(planRes?.plan || {}, null, 2));
        console.log("[agent] reasoning rationale", planRes?.rationale || "");
        // eslint-disable-next-line no-console
        console.log("[trace] line", { id: currentTraceId, line: `Rationale: ${planRes?.rationale || ""}` });
        // Append rationale then thinking summary to live trace
        if (currentTraceId && planRes?.rationale) appendActivityTrace(currentTraceId, `Rationale: ${planRes.rationale}`);
        const thinking = (planRes as any)?.plan?.thinkingSummary || (planRes as any)?.thinkingSummary || (Array.isArray(planRes?.thoughts) ? planRes.thoughts[0] : undefined);
        if (currentTraceId && thinking) appendActivityTrace(currentTraceId, `Thinking: ${thinking}`);

        // 3) Choose target: prefer reasoning output else WETH fallback
        const parsed = (planRes?.plan as any) || {};
        const ranking: any[] = Array.isArray(parsed?.ranking) ? parsed.ranking : [];
        let target = parsed?.plan;
        if (!target || !target.amountWei) {
          const weth = ranking.find((r) => String(r?.symbol).toUpperCase() === "WETH");
          if (weth) {
            // Round down to nearest 1e14 wei (0.0001 ETH)
            const floored = (idle / BigInt(1e14)) * BigInt(1e14);
            target = { action: "SUPPLY", amountWei: String(floored) };
          }
        }
        console.log("[agent] exec plan", target);
        // eslint-disable-next-line no-console
        console.log("[trace] line", { id: currentTraceId, line: `Execute allocation: amountWei=${String(target?.amountWei || idle)}` });
        if (currentTraceId) appendActivityTrace(currentTraceId, `Execute allocation: amountWei=${String(target?.amountWei || idle)}`);
        if (!target?.amountWei) { console.log("[agent] no target amountWei selected"); return; }

        // 4) Execute via workflow agent (single in-flight)
        allocating = true;
        try {
          const { txHash } = await executeAllocation({ amountWei: String(target.amountWei || idle) });
          // eslint-disable-next-line no-console
          console.log("[agent] allocation submitted", { txHash });
          // eslint-disable-next-line no-console
          console.log("[trace] line", { id: currentTraceId, line: `Allocation submitted: ${txHash}` });
          if (currentTraceId) appendActivityTrace(currentTraceId, `Allocation submitted: ${txHash}`);
          addActivity({ id: `alloc_${Date.now()}`, type: "allocate", status: "success", timestamp: Date.now(), title: `Auto-allocate tx: ${txHash}` });
        } finally {
          allocating = false;
        }
      } catch (e: any) {
        // eslint-disable-next-line no-console
        console.error("[agent] deposit handler error", e?.message || e);
        addActivity({ id: `evt_err_${Date.now()}`, type: "vault", status: "error", timestamp: Date.now(), title: "Deposit handler failed", details: e?.message || String(e) });
      }
    },
  });

  if (abiHasEvent(vault.abi as any[], "SuppliedToAave")) eventClient.watchContractEvent({
    ...vault,
    eventName: "SuppliedToAave",
    poll: usePolling,
    pollingInterval: POLL_MS,
    onLogs: (logs: any[]) => {
      // eslint-disable-next-line no-console
      console.log("[agent] SuppliedToAave", { count: logs.length });
      try {
        const last: any = logs[logs.length - 1];
        const amount: bigint | undefined = (last?.args?.amount as any) || (last?.args?.assets as any);
        const txHash = last?.transactionHash as string | undefined;
        addActivity({ id: `ainv_${Date.now()}`, type: "agent_invest", status: "success", timestamp: Date.now(), title: `Agent invested ${amount ? formatEth(amount) : "?"} WETH → Aave`, details: txHash || "" });
      } catch {}
      addActivity({ id: `evt_${Date.now()}`, type: "vault", status: "success", timestamp: Date.now(), title: `SuppliedToAave x${logs.length}` });
      if (currentTraceId) {
        appendActivityTrace(currentTraceId, "Supplied to Aave ✓");
        updateActivity(currentTraceId, { status: "success" });
        currentTraceId = undefined;
      }
    },
  });

  if (abiHasEvent(vault.abi as any[], "WithdrawnFromAave")) eventClient.watchContractEvent({
    ...vault,
    eventName: "WithdrawnFromAave",
    poll: usePolling,
    pollingInterval: POLL_MS,
    onLogs: (logs: any[]) => {
      // eslint-disable-next-line no-console
      console.log("[agent] WithdrawnFromAave", { count: logs.length });
      try {
        const last: any = logs[logs.length - 1];
        const amount: bigint | undefined = (last?.args?.amount as any) || (last?.args?.assets as any);
        const txHash = last?.transactionHash as string | undefined;
        addActivity({ id: `arealloc_${Date.now()}`, type: "agent_reallocation", status: "success", timestamp: Date.now(), title: `Agent reallocated: withdrew ${amount ? formatEth(amount) : "?"} WETH from Aave`, details: txHash || "" });
      } catch {}
      addActivity({ id: `evt_${Date.now()}`, type: "vault", status: "success", timestamp: Date.now(), title: `WithdrawnFromAave x${logs.length}` });
    },
  });

  // ERC-4626 Withdraw event (user-initiated withdrawals)
  if (abiHasEvent(vault.abi as any[], "Withdraw")) eventClient.watchContractEvent({
    ...vault,
    eventName: "Withdraw",
    poll: usePolling,
    pollingInterval: POLL_MS,
    onLogs: (logs: any[]) => {
      try {
        const last: any = logs[logs.length - 1];
        const assets = last?.args?.assets as bigint | undefined;
        const txHash = last?.transactionHash as string | undefined;
        addActivity({ id: `wd_${Date.now()}`, type: "user_withdraw", status: "success", timestamp: Date.now(), title: `Withdraw ${assets ? formatEth(assets) : "?"} ETH`, details: txHash || "" });
      } catch {}
    },
  });

  if (abiHasEvent(vault.abi as any[], "PerformanceFeeTaken")) eventClient.watchContractEvent({
    ...vault,
    eventName: "PerformanceFeeTaken",
    poll: usePolling,
    pollingInterval: POLL_MS,
    onLogs: (logs: any[]) => {
      // eslint-disable-next-line no-console
      console.log("[agent] PerformanceFeeTaken", { count: logs.length });
      addActivity({ id: `evt_${Date.now()}`, type: "vault", status: "success", timestamp: Date.now(), title: `Fees settled x${logs.length}` });
    },
  });

  if (wrapper) {
    if (abiHasEvent((wrapper as any).abi as any[], "Rebased")) eventClient.watchContractEvent({
      ...wrapper,
      eventName: "Rebased",
      poll: usePolling,
      pollingInterval: POLL_MS,
      onLogs: (logs: any[]) => {
        // eslint-disable-next-line no-console
        console.log("[agent] Wrapper Rebased", { count: logs.length });
        addActivity({ id: `evt_${Date.now()}`, type: "vault", status: "success", timestamp: Date.now(), title: `Wrapper rebased x${logs.length}` });
      },
    });
  }

  // Periodic rebase cycle
  // Rebase scheduler removed: rebase should not run on an interval.
  // Trigger rebase explicitly from business flows (e.g., on withdrawal) instead.
}


