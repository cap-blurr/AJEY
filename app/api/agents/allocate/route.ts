import { NextRequest, NextResponse } from "next/server";
import { addActivity } from "@/lib/activity";
import { generateReasoningPlan } from "@/lib/agents/gemini";
import { fetchPoolYields } from "@/lib/services/aave";
import { executeAllocation } from "@/lib/agents/workflow";
import { ajeyVault, readIdleUnderlying } from "@/lib/services/vault";

// Accepts { idleAssets: string, vaultAddress: string }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  let idleAssets = body?.idleAssets as string | undefined;
  let vaultAddress = body?.vaultAddress as string | undefined;

  // Infer defaults if omitted
  if (!idleAssets) {
    try {
      const idle = await readIdleUnderlying();
      idleAssets = String(idle);
    } catch {}
  }
  if (!vaultAddress) {
    if (ajeyVault) vaultAddress = ajeyVault.address as string;
  }
  if (!idleAssets || !vaultAddress) {
    return NextResponse.json({ error: "idleAssets and vaultAddress required" }, { status: 400 });
  }

  // 1) Fetch preapproved pools + yields
  const pools = await fetchPoolYields();

  // 2) Ask the reasoning agent for an allocation instruction (structured JSON)
  const planRes = await generateReasoningPlan({
    kind: "deposit",
    payload: {
      idleAssets,
      vaultAddress,
      pools, // [{ poolAddress, poolName, assetSymbol, aprPct }]
    },
  });
  // eslint-disable-next-line no-console
  console.log("[allocate] reasoning result", planRes?.plan || {});

  // Log trace to terminal for observability
  if (planRes.trace && planRes.trace.length) {
    // eslint-disable-next-line no-console
    console.log("[allocate] reasoning trace:", planRes.trace);
    if (planRes.usage) {
      // eslint-disable-next-line no-console
      console.log("[allocate] usage:", planRes.usage);
    }
  }

  const planId = `plan_${Date.now()}`;
  const proposedPoolName = (planRes as any)?.plan?.plan?.poolName ?? (planRes as any)?.plan?.poolName;
  addActivity({
    id: planId,
    type: "allocate",
    status: "queued",
    timestamp: Date.now(),
    title: `Allocation proposed: ${proposedPoolName || "pool"}`,
    details: planRes.rationale,
    trace: planRes.trace,
    usage: planRes.usage,
  });

  // 3) Execute via workflow agent using default custodial key
  try {
    // The reasoning API now returns { rationale, plan: { action, amountAssets, poolAddress, poolName } }
    const exec = (planRes?.plan?.plan || planRes?.plan) as any;
    if (!exec?.amountAssets || !exec?.poolAddress) {
      return NextResponse.json({ planId, plan: planRes.plan, error: "invalid plan" }, { status: 422 });
    }
    // eslint-disable-next-line no-console
    console.log("[allocate] executing", { amountAssets: exec.amountAssets, poolAddress: exec.poolAddress });
    const { txHash } = await executeAllocation({ amountAssets: String(exec.amountAssets), poolAddress: exec.poolAddress });
    // eslint-disable-next-line no-console
    console.log("[allocate] allocation submitted", { txHash });
    addActivity({ id: planId, type: "allocate", status: "success", timestamp: Date.now(), title: `Allocation tx: ${txHash}` });
    return NextResponse.json({ planId, txHash, plan: planRes.plan });
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error("[allocate] allocation error", e?.message || e);
    addActivity({ id: planId, type: "allocate", status: "error", timestamp: Date.now(), title: `Allocation failed`, details: e?.message || String(e) });
    return NextResponse.json({ planId, error: e?.message || String(e) }, { status: 500 });
  }
}


