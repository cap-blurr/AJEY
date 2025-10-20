import { NextRequest, NextResponse } from "next/server";
import { fetchAaveSupplySnapshot } from "@/lib/services/aave-markets";
import { publicClient } from "@/lib/chain";
import { AjeyVaultAbi } from "@/abi/AjeyVault";
import { ajeyVault } from "@/lib/services/vault";
import { generateReasoningPlan } from "@/lib/agents/gemini";

export async function GET() {
  try {
    const market = await fetchAaveSupplySnapshot();
    if (!ajeyVault) return NextResponse.json({ error: "vault not configured" }, { status: 500 });
    const [idle, totalAssets, totalSupply] = await Promise.all([
      publicClient.readContract({ ...ajeyVault, functionName: "idleUnderlying" }) as Promise<bigint>,
      publicClient.readContract({ ...ajeyVault, functionName: "totalAssets" }) as Promise<bigint>,
      publicClient.readContract({ ...ajeyVault, functionName: "totalSupply" }) as Promise<bigint>,
    ]);

    // Build JSON instructions for the reasoning agent
    const instructions = {
      version: 1,
      objective: "Rank Aave reserves for supply-only allocations and propose a single target allocation.",
      policy: {
        filter: {
          requireActive: true,
          requireNotFrozen: true,
          minAvailableUSD: "0",
        },
        rank: ["supplyAprPercent desc", "availableUSD desc", "tvlUSD desc"],
        output: {
          fields: ["asset", "symbol", "supplyAprPercent", "availableUSD", "tvlUSD", "capacityHeadroomUSD"],
          plan: { fields: ["action", "amountAssets", "poolAddress", "poolName"] },
        },
      },
      context: {
        vault: {
          address: ajeyVault.address,
          idleUnderlying: idle.toString(),
          totalAssets: totalAssets.toString(),
          totalSupply: totalSupply.toString(),
        },
        market,
      },
      guidance: [
        "Use only supplyAprPercent for yield; ignore borrow APR.",
        "Prefer markets with availableUSD > 0 and capacityHeadroomUSD ≠ '0'.",
        "amountAssets should be <= idleUnderlying and within capacityHeadroom.",
      ],
    };

    const planRes = await generateReasoningPlan({
      kind: "deposit",
      payload: instructions,
    });

    return NextResponse.json({ instructions, plan: planRes.plan, rationale: planRes.rationale, trace: planRes.trace });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}


