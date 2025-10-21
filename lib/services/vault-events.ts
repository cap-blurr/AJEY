import { publicClient, wsPublicClient } from "@/lib/chain";
import { ajeyVault, readIdleUnderlying, rebasingWrapper } from "@/lib/services/vault";
import { addActivity } from "@/lib/activity";
import { fetchPoolYields } from "@/lib/services/aave";
import { executeAllocation } from "@/lib/agents/workflow";
import { generateReasoningPlan } from "@/lib/agents/gemini";
import { runRebaseCycle } from "@/lib/agents/rebase";
import { fetchAaveSupplySnapshot } from "@/lib/services/aave-markets";
import { getWalletClient } from "@/lib/agents/wallet";

let started: boolean = (globalThis as any).__ajeyWatcherStarted || false;
let allocating = false;
let lastHandledDepositTs = 0;

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
        // eslint-disable-next-line no-console
        console.log("[agent] Deposit event detected", { count: logs.length, assets: String(assets ?? BigInt(0)), blockNumber: head?.toString() });
        addActivity({ id: `evt_${Date.now()}`, type: "vault", status: "running", timestamp: Date.now(), title: `Deposit event: ${assets ?? "?"} assets` });

        // Debounce frequent deposits to avoid repeated allocations
        const now = Date.now();
        if (now - lastHandledDepositTs < MIN_ALLOCATE_INTERVAL_MS) return;
        if (allocating) return;
        lastHandledDepositTs = now;

        // 1) Read current idle funds
        const idle = await readIdleUnderlying();
        console.log("[agent] idleUnderlying(wei)", { idleWei: String(idle) });
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
        // Push a brief thinking summary into activity for UI trace
        const thinking = (planRes as any)?.plan?.thinkingSummary || (planRes as any)?.thinkingSummary || (Array.isArray(planRes?.thoughts) ? planRes.thoughts[0] : undefined);
        addActivity({ id: `plan_${Date.now()}`, type: "allocate", status: "running", timestamp: Date.now(), title: `Agent plan generated`, details: thinking || planRes.rationale });

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
        if (!target?.amountWei) { console.log("[agent] no target amountWei selected"); return; }

        // 4) Execute via workflow agent (single in-flight)
        allocating = true;
        try {
          const { txHash } = await executeAllocation({ amountWei: String(target.amountWei || idle) });
          // eslint-disable-next-line no-console
          console.log("[agent] allocation submitted", { txHash });
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
      addActivity({ id: `evt_${Date.now()}`, type: "vault", status: "success", timestamp: Date.now(), title: `SuppliedToAave x${logs.length}` });
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
      addActivity({ id: `evt_${Date.now()}`, type: "vault", status: "success", timestamp: Date.now(), title: `WithdrawnFromAave x${logs.length}` });
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


