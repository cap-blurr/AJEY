import { publicClient } from "@/lib/chain";
import { ajeyVault, readIdleUnderlying } from "@/lib/services/vault";
import { addActivity } from "@/lib/activity";
import { fetchPoolYields } from "@/lib/services/aave";
import { executeAllocation } from "@/lib/agents/workflow";
import { generateReasoningPlan } from "@/lib/agents/gemini";

let started = false;
let allocating = false;
let lastHandledDepositTs = 0;

const ENABLED = process.env.AGENT_ENABLE_WATCHER === "true";
const POLL_MS = Number.parseInt(process.env.VAULT_EVENT_POLL_MS || "30000"); // default 30s
const MIN_ALLOCATE_INTERVAL_MS = Number.parseInt(process.env.AGENT_MIN_ALLOCATE_INTERVAL_MS || "60000"); // default 60s

export function startVaultEventWatcher() {
  if (started) return;
  if (!ENABLED) return; // gated by env to avoid accidental RPC usage
  started = true;
  if (!ajeyVault) return;
  const vault = ajeyVault!;

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
        if (idle === BigInt(0)) return;
        // 2) Fetch pools and ask reasoning agent for structured plan
        const pools = await fetchPoolYields();
        const planRes = await generateReasoningPlan({
          kind: "deposit",
          payload: {
            idleAssets: String(idle),
            vaultAddress: vault.address,
            pools,
          },
        });
        // Surface reasoning trace to activity for UI
        try {
          addActivity({
            id: `plan_${Date.now()}`,
            type: "allocate",
            status: "running",
            timestamp: Date.now(),
            title: `Agent plan generated`,
            details: planRes.rationale,
            trace: (planRes as any)?.trace,
            usage: (planRes as any)?.usage,
          } as any);
        } catch {}
        // eslint-disable-next-line no-console
        console.log("[agent] reasoning plan", planRes?.plan);
        const exec = (planRes?.plan as any)?.plan || (planRes?.plan as any);
        if (!exec?.amountAssets || !exec?.poolAddress) return;
        // 3) Execute via workflow agent (single in-flight)
        allocating = true;
        try {
          const { txHash } = await executeAllocation({ amountAssets: String(exec.amountAssets), poolAddress: exec.poolAddress });
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
}


