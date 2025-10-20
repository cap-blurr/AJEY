import { publicClient } from "@/lib/chain";
import { ajeyVault, readIdleUnderlying, rebasingWrapper } from "@/lib/services/vault";
import { addActivity } from "@/lib/activity";
import { fetchPoolYields } from "@/lib/services/aave";
import { executeAllocation } from "@/lib/agents/workflow";
import { generateReasoningPlan } from "@/lib/agents/gemini";
import { runRebaseCycle } from "@/lib/agents/rebase";
import { fetchAaveSupplySnapshot } from "@/lib/services/aave-markets";

let started = false;
let allocating = false;
let lastHandledDepositTs = 0;

const ENABLED = process.env.AGENT_ENABLE_WATCHER === "true";
const POLL_MS = Number.parseInt(process.env.VAULT_EVENT_POLL_MS || "30000"); // default 30s
const MIN_ALLOCATE_INTERVAL_MS = Number.parseInt(process.env.AGENT_MIN_ALLOCATE_INTERVAL_MS || "60000"); // default 60s
const REBASE_INTERVAL_MS = Number.parseInt(process.env.AGENT_REBASE_INTERVAL_MS || "300000"); // default 5m

export function startVaultEventWatcher() {
  if (started) return;
  if (!ENABLED) return; // gated by env to avoid accidental RPC usage
  started = true;
  if (!ajeyVault) return;
  const vault = ajeyVault!;
  const wrapper = rebasingWrapper;

  // When users deposit, vault emits ERC-4626 Deposit(owner, receiver, assets, shares)
  publicClient.watchContractEvent({
    ...vault,
    eventName: "Deposit",
    poll: true,
    pollingInterval: POLL_MS,
    onLogs: async (logs) => {
      try {
        const last: any = logs[logs.length - 1];
        const assets = last?.args?.assets as bigint | undefined;
        // eslint-disable-next-line no-console
        console.log("[agent] Deposit event detected", { count: logs.length, assets: String(assets ?? BigInt(0)) });
        addActivity({ id: `evt_${Date.now()}`, type: "vault", status: "running", timestamp: Date.now(), title: `Deposit event: ${assets ?? "?"} assets` });

        // Debounce frequent deposits to avoid repeated allocations
        const now = Date.now();
        if (now - lastHandledDepositTs < MIN_ALLOCATE_INTERVAL_MS) return;
        if (allocating) return;
        lastHandledDepositTs = now;

        // 1) Read current idle funds
        const idle = await readIdleUnderlying();
        if (idle === BigInt(0)) { console.log("[agent] idleUnderlying=0; skip allocation"); return; }

        // 2) Fetch supply snapshot and run reasoning
        const market = await fetchAaveSupplySnapshot();
        const instructions = {
          version: 1,
          objective: "Rank Aave reserves for supply-only allocations and propose a single target allocation.",
          policy: {
            filter: { requireActive: true, requireNotFrozen: true, minAvailableUSD: "0" },
            rank: ["supplyAprPercent desc", "availableUSD desc", "tvlUSD desc"],
          },
          context: {
            vault: { address: vault.address, idleUnderlying: String(idle) },
            market,
          },
          guidance: ["Prefer WETH if multiple options exist and idle asset is ETH/WETH on testnet."],
        };
        const planRes = await generateReasoningPlan({ kind: "deposit", payload: instructions });
        console.log("[agent] reasoning result", JSON.stringify(planRes?.plan || {}, null, 2));
        addActivity({ id: `plan_${Date.now()}`, type: "allocate", status: "running", timestamp: Date.now(), title: `Agent plan generated`, details: planRes.rationale });

        // 3) Choose target: prefer reasoning output else WETH fallback
        const parsed = (planRes?.plan as any) || {};
        const ranking: any[] = Array.isArray(parsed?.ranking) ? parsed.ranking : [];
        let target = parsed?.plan;
        if (!target || !target.poolAddress) {
          const weth = ranking.find((r) => String(r?.symbol).toUpperCase() === "WETH");
          if (weth) target = { action: "SUPPLY", amountAssets: String(idle), poolAddress: weth.asset, poolName: "WETH" };
        }
        if (!target?.poolAddress) { console.log("[agent] no target pool selected"); return; }

        // 4) Execute via workflow agent (single in-flight)
        allocating = true;
        try {
          const { txHash } = await executeAllocation({ amountAssets: String(target.amountAssets || idle), poolAddress: target.poolAddress });
          // eslint-disable-next-line no-console
          console.log("[agent] allocation submitted", { txHash, pool: target.poolName || target.poolAddress });
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

  publicClient.watchContractEvent({
    ...vault,
    eventName: "SuppliedToAave",
    poll: true,
    pollingInterval: POLL_MS,
    onLogs: (logs) => {
      // eslint-disable-next-line no-console
      console.log("[agent] SuppliedToAave", { count: logs.length });
      addActivity({ id: `evt_${Date.now()}`, type: "vault", status: "success", timestamp: Date.now(), title: `SuppliedToAave x${logs.length}` });
    },
  });

  publicClient.watchContractEvent({
    ...vault,
    eventName: "WithdrawnFromAave",
    poll: true,
    pollingInterval: POLL_MS,
    onLogs: (logs) => {
      // eslint-disable-next-line no-console
      console.log("[agent] WithdrawnFromAave", { count: logs.length });
      addActivity({ id: `evt_${Date.now()}`, type: "vault", status: "success", timestamp: Date.now(), title: `WithdrawnFromAave x${logs.length}` });
    },
  });

  publicClient.watchContractEvent({
    ...vault,
    eventName: "PerformanceFeeTaken",
    poll: true,
    pollingInterval: POLL_MS,
    onLogs: (logs) => {
      // eslint-disable-next-line no-console
      console.log("[agent] PerformanceFeeTaken", { count: logs.length });
      addActivity({ id: `evt_${Date.now()}`, type: "vault", status: "success", timestamp: Date.now(), title: `Fees settled x${logs.length}` });
    },
  });

  if (wrapper) {
    publicClient.watchContractEvent({
      ...wrapper,
      eventName: "Rebased",
      poll: true,
      pollingInterval: POLL_MS,
      onLogs: (logs) => {
        // eslint-disable-next-line no-console
        console.log("[agent] Wrapper Rebased", { count: logs.length });
        addActivity({ id: `evt_${Date.now()}`, type: "vault", status: "success", timestamp: Date.now(), title: `Wrapper rebased x${logs.length}` });
      },
    });
  }

  // Periodic rebase cycle
  try {
    setInterval(async () => {
      try {
        await runRebaseCycle();
        addActivity({ id: `rebase_${Date.now()}`, type: "allocate", status: "success", timestamp: Date.now(), title: "Rebase cycle executed" });
      } catch (e: any) {
        // eslint-disable-next-line no-console
        console.error("[agent] rebase cycle error", e?.message || e);
        addActivity({ id: `rebase_err_${Date.now()}`, type: "allocate", status: "error", timestamp: Date.now(), title: "Rebase cycle failed", details: e?.message || String(e) });
      }
    }, REBASE_INTERVAL_MS);
  } catch {}
}


