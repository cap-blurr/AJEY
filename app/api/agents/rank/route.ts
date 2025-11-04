import { NextRequest, NextResponse } from "next/server";
import { fetchAaveSupplySnapshot } from "@/lib/services/aave-markets";
import { publicClient } from "@/lib/chain";
import { AjeyVaultAbi } from "@/abi/AjeyVault";
import { ajeyVault, ERC20_MIN_ABI } from "@/lib/services/vault";
import { generateReasoningPlan } from "@/lib/agents/openai";

export async function GET() {
  try {
    const head = await publicClient.getBlockNumber().catch(() => undefined);
    const market = await fetchAaveSupplySnapshot();
    if (!ajeyVault) return NextResponse.json({ error: "vault not configured" }, { status: 500 });
    const [idle, totalAssets, totalSupply, underlying] = await Promise.all([
      publicClient.readContract({ ...ajeyVault, functionName: "idleUnderlying", blockNumber: head }) as Promise<bigint>,
      publicClient.readContract({ ...ajeyVault, functionName: "totalAssets", blockNumber: head }) as Promise<bigint>,
      publicClient.readContract({ ...ajeyVault, functionName: "totalSupply", blockNumber: head }) as Promise<bigint>,
      publicClient.readContract({ ...ajeyVault, functionName: "asset", blockNumber: head }) as Promise<`0x${string}`>,
    ]);
    let assetDecimals = 18;
    try { assetDecimals = await publicClient.readContract({ address: underlying, abi: ERC20_MIN_ABI as any, functionName: "decimals", args: [], blockNumber: head }) as number; } catch {}

    // Build JSON instructions for the reasoning agent (WETH-only, no pool address)
    const instructions = {
      version: 1,
      objective: "Propose a single target allocation in WETH-only (supply) and amount in wei.",
      policy: {
        filter: {
          requireActive: true,
          requireNotFrozen: true,
          minAvailableUSD: "0",
        },
        rank: ["supplyAprPercent desc", "availableUSD desc", "tvlUSD desc"],
        output: {
          fields: ["asset", "symbol", "supplyAprPercent", "availableUSD", "tvlUSD", "capacityHeadroomUSD"],
          plan: { fields: ["action", "amountWei"] },
        },
      },
      context: {
        vault: {
          address: ajeyVault.address,
          idleWei: idle.toString(),
          idleEth4dp: (() => { try { const v = idle; const scaled = v / BigInt(1e14); const whole = scaled / BigInt(1e4); const frac = scaled % BigInt(1e4); return `${whole.toString()}.${frac.toString().padStart(4, "0")}`; } catch { return "0.0000"; } })(),
          totalAssets: totalAssets.toString(),
          totalSupply: totalSupply.toString(),
          asset: underlying,
          assetDecimals,
          amountUnit: "wei",
        },
        market,
      },
      guidance: [
        "Use only supplyAprPercent for yield; ignore borrow APR.",
        "Prefer markets with availableUSD > 0 and capacityHeadroomUSD ≠ '0'.",
        "amountWei should be <= idleWei and within capacity headroom; round down to nearest 1e14 wei.",
      ],
    };

    const planRes = await generateReasoningPlan({
      kind: "deposit",
      payload: instructions,
    });
    return NextResponse.json({ blockNumber: head?.toString(), instructions, plan: planRes.plan, rationale: planRes.rationale, thoughts: planRes.thoughts, usage: planRes.usage });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}


