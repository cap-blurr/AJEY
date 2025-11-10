import { NextRequest, NextResponse } from "next/server";
import { addActivity } from "@/lib/activity";
import { generateReasoningPlan } from "@/lib/agents/openai";
import { executeAllocation } from "@/lib/agents/workflow";
import { ajeyVault, readIdleUnderlying } from "@/lib/services/vault";
import { fetchAaveSupplySnapshot } from "@/lib/services/aave-markets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Accepts optional overrides { idleWei: string, vaultAddress: string }
export async function POST(req: NextRequest) {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return NextResponse.json({}, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
  const body = await req.json().catch(() => ({}));
  let idleWei = body?.idleWei as string | undefined;
  let vaultAddress = body?.vaultAddress as string | undefined;
  const providedPlan = (body?.plan || body?.execPlan) as { action?: string; amountWei?: string } | undefined;

  // Infer defaults if omitted
  if (!idleWei) {
    try {
      const idle = await readIdleUnderlying();
      idleWei = String(idle);
    } catch {}
  }
  if (!vaultAddress) {
    if (ajeyVault) vaultAddress = ajeyVault.address as string;
  }
  if (!idleWei || !vaultAddress) {
    return NextResponse.json({ error: "idleWei and vaultAddress required" }, { status: 400 });
  }

  // 1) Fetch live Aave snapshot for reasoning context and restrict to allowed assets
  const marketRaw = await fetchAaveSupplySnapshot();
  const ALLOWED = new Set([
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
    "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
    "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
  ]);
  const market = {
    ...marketRaw,
    reserves: (marketRaw.reserves || []).filter((r: any) => ALLOWED.has(String(r.asset).toLowerCase())),
  };

  // Helper: format wei to ETH with 4 decimal places, floored
  const formatEth4dp = (weiStr: string) => {
    try {
      const wei = BigInt(weiStr);
      const scaled = wei / BigInt(1e14); // now in units of 1e-4 ETH
      const whole = scaled / BigInt(1e4);
      const frac = scaled % BigInt(1e4);
      return `${whole.toString()}.${frac.toString().padStart(4, "0")}`;
    } catch {
      return "0.0000";
    }
  };
  const idleEth4dp = formatEth4dp(idleWei);

  // 2) Use provided plan if present; otherwise ask the reasoning agent for an allocation instruction
  let execPlan: any = undefined;
  let planRes: any = undefined;
  if (providedPlan && providedPlan.amountWei) {
    execPlan = providedPlan;
    // eslint-disable-next-line no-console
    console.log("[allocate] plan source: provided", execPlan);
  } else {
    planRes = await generateReasoningPlan({
      kind: "deposit",
      payload: {
        vault: { address: vaultAddress, idleWei, idleEth4dp },
        market,
      },
    });
    // eslint-disable-next-line no-console
    console.log("[allocate] plan source: generated", planRes?.plan || {});
    execPlan = (planRes?.plan?.plan || planRes?.plan) as any;
  }

  // Log thoughts & usage for observability
  if (planRes?.thoughts && planRes.thoughts.length) {
    // eslint-disable-next-line no-console
    console.log("[allocate] thoughts:", planRes.thoughts);
  }
  if (planRes?.usage) {
    // eslint-disable-next-line no-console
    console.log("[allocate] usage:", planRes.usage);
  }

  const planId = `plan_${Date.now()}`;
  addActivity({
    id: planId,
    type: "allocate",
    status: "queued",
    timestamp: Date.now(),
    title: `Allocation proposed`,
    details: (planRes as any)?.plan?.thinkingSummary || planRes?.rationale,
    usage: planRes?.usage,
  });

  // 3) Execute via workflow agent using default custodial key
  try {
    // Expect plan: { action, amountWei }
    if (!execPlan?.amountWei) {
      return NextResponse.json({ planId, plan: planRes?.plan, error: "invalid plan" }, { status: 422 });
    }
    // eslint-disable-next-line no-console
    console.log("[allocate] executing", { amountWei: execPlan.amountWei });
    const { txHash } = await executeAllocation({ amountWei: String(execPlan.amountWei) });
    // eslint-disable-next-line no-console
    console.log("[allocate] allocation submitted", { txHash });
    addActivity({ id: planId, type: "allocate", status: "success", timestamp: Date.now(), title: `Allocation tx: ${txHash}` });
    return NextResponse.json({ planId, txHash, plan: planRes?.plan || execPlan, thoughts: planRes?.thoughts, usage: planRes?.usage });
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error("[allocate] allocation error", e?.message || e);
    addActivity({ id: planId, type: "allocate", status: "error", timestamp: Date.now(), title: `Allocation failed`, details: e?.message || String(e) });
    return NextResponse.json({ planId, error: e?.message || String(e) }, { status: 500 });
  }
}


