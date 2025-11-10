import { NextRequest, NextResponse } from "next/server";
import { fetchAaveSupplySnapshot } from "@/lib/services/aave-markets";
import { publicClient } from "@/lib/chain";
import { AjeyVaultAbi } from "@/abi/AjeyVault";
import { ajeyVault, ERC20_MIN_ABI } from "@/lib/services/vault";
import { generateReasoningPlan } from "@/lib/agents/openai";
import { getVaultContract, parseAssetSymbol } from "@/lib/services/vault-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  // Avoid static export/prerender at build time
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return NextResponse.json({}, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const symbolParam = parseAssetSymbol(req.nextUrl.searchParams.get("asset")) || "WETH";
    const head = await publicClient.getBlockNumber().catch(() => undefined);
    // Fetch on-chain Aave snapshot; if it fails, continue with empty market
    let marketRaw: any;
    let snapshotError: string | undefined;
    try {
      marketRaw = await fetchAaveSupplySnapshot();
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error("[rank] aave snapshot error", e?.message || e);
      marketRaw = { network: "ethereum", reserves: [], asOfBlock: head?.toString() || "0" };
      snapshotError = e?.message || String(e);
    }
    // Restrict to allowed assets (mainnet canonical): WETH, USDC, USDT, DAI
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
    // Resolve vault based on ?asset= param or fallback to single env-based ajeyVault
    const vault = getVaultContract(symbolParam) || ajeyVault;
    let idle = BigInt(0);
    let totalAssets = BigInt(0);
    let totalSupply = BigInt(0);
    let underlying: `0x${string}` = "0x0000000000000000000000000000000000000000";
    let assetDecimals = 18;
    if (vault) {
      const [idleV, totalAssetsV, totalSupplyV, assetV] = await Promise.all([
        publicClient.readContract({ ...vault, functionName: "idleUnderlying", blockNumber: head }) as Promise<bigint>,
        publicClient.readContract({ ...vault, functionName: "totalAssets", blockNumber: head }) as Promise<bigint>,
        publicClient.readContract({ ...vault, functionName: "totalSupply", blockNumber: head }) as Promise<bigint>,
        publicClient.readContract({ ...vault, functionName: "asset", blockNumber: head }) as Promise<`0x${string}`>,
      ]);
      idle = idleV; totalAssets = totalAssetsV; totalSupply = totalSupplyV; underlying = assetV;
      try { assetDecimals = await publicClient.readContract({ address: underlying, abi: ERC20_MIN_ABI as any, functionName: "decimals", args: [], blockNumber: head }) as number; } catch {}
    }

    // Build JSON instructions for the reasoning agent (supply-only; allowed assets filtered above)
    const instructions = {
      version: 1,
      objective: "Choose the single highest-yield reserve from the provided list (WETH/USDC/USDT/DAI) and propose a supply amount in wei.",
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
          address: vault?.address || "0x0000000000000000000000000000000000000000",
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

    let planRes: any = null;
    try {
      planRes = await generateReasoningPlan({ kind: "deposit", payload: instructions });
    } catch (e: any) {
      // If planner is unavailable (e.g., OPENAI_KEY missing), still return the market snapshot & a deterministic top pick
      const reserves = Array.isArray(market.reserves) ? market.reserves : [];
      const ranked = reserves.slice().sort((a: any, b: any) => (b?.supplyAprPercent || 0) - (a?.supplyAprPercent || 0));
      const top = ranked[0] || null;
      return NextResponse.json({ blockNumber: head?.toString(), instructions, market, topReserve: top, error: e?.message || "planner_unavailable", snapshotError });
    }
    return NextResponse.json({ blockNumber: head?.toString(), instructions, plan: planRes.plan, rationale: planRes.rationale, thoughts: planRes.thoughts, usage: planRes.usage, snapshotError });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}


