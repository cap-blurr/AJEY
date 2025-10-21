import { NextResponse } from "next/server";
import { publicClient } from "@/lib/chain";
import { ajeyVault } from "@/lib/services/vault";
import { fetchAaveSupplySnapshot } from "@/lib/services/aave-markets";
import { formatEther } from "viem";

export async function GET() {
  if (!ajeyVault) return NextResponse.json({ error: "vault not configured" }, { status: 500 });
  try {
    // light cache for Aave snapshot to reduce eth_call churn
    const g = globalThis as any;
    const now = Date.now();
    const cached = g.__ajeyAaveSnapshot && (now - g.__ajeyAaveSnapshotAt < 60_000) ? g.__ajeyAaveSnapshot : undefined;

    const [totalAssets, totalSupply, paused, ethMode, market] = await Promise.all([
      publicClient.readContract({ ...ajeyVault, functionName: "totalAssets" }) as Promise<bigint>,
      publicClient.readContract({ ...ajeyVault, functionName: "totalSupply" }) as Promise<bigint>,
      publicClient.readContract({ ...ajeyVault, functionName: "paused" }) as Promise<boolean>,
      publicClient.readContract({ ...ajeyVault, functionName: "ethMode" }) as Promise<boolean>,
      cached ? Promise.resolve(cached) : fetchAaveSupplySnapshot(),
    ]);

    if (!cached && market) { g.__ajeyAaveSnapshot = market; g.__ajeyAaveSnapshotAt = now; }

    // navPerShare = totalAssets / totalSupply (handle zero)
    const navPerShare = totalSupply === BigInt(0) ? 0 : Number(totalAssets) / Number(totalSupply);

    // APR range from market snapshot (across reserves) for context
    const aprsRaw = (market?.reserves || [])
      .map((r: any) => (typeof r?.supplyAprPercent === "number" ? r.supplyAprPercent : 0))
      .filter((x: number) => Number.isFinite(x));
    const aprs = aprsRaw.filter((x: number) => x > 0); // exclude zero to avoid misleading 0% lower bound
    const aprMin = aprs.length ? Math.min(...aprs) : undefined;
    const aprMax = aprs.length ? Math.max(...aprs) : undefined;
    const aprRangeText = aprMin !== undefined && aprMax !== undefined ? `${aprMin}%–${aprMax}%` : undefined;

    return NextResponse.json({
      totalAssetsUSD: undefined,
      totalAssets: Number(totalAssets),
      totalAssetsWei: totalAssets.toString(),
      totalAssetsFormatted: formatEther(totalAssets),
      navPerShare,
      vTokenSupply: Number(totalSupply),
      paused,
      ethMode,
      strategies: [],
      aprMin,
      aprMax,
      aprRangeText,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}


