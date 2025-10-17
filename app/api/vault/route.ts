import { NextResponse } from "next/server";
import { publicClient } from "@/lib/chain";
import { ajeyVault } from "@/lib/services/vault";

export async function GET() {
  if (!ajeyVault) return NextResponse.json({ error: "vault not configured" }, { status: 500 });
  try {
    const [totalAssets, totalSupply, paused, ethMode] = await Promise.all([
      publicClient.readContract({ ...ajeyVault, functionName: "totalAssets" }) as Promise<bigint>,
      publicClient.readContract({ ...ajeyVault, functionName: "totalSupply" }) as Promise<bigint>,
      publicClient.readContract({ ...ajeyVault, functionName: "paused" }) as Promise<boolean>,
      publicClient.readContract({ ...ajeyVault, functionName: "ethMode" }) as Promise<boolean>,
    ]);

    // navPerShare = totalAssets / totalSupply (handle zero)
    const navPerShare = totalSupply === BigInt(0) ? 0 : Number(totalAssets) / Number(totalSupply);

    return NextResponse.json({
      totalAssetsUSD: undefined,
      totalAssets: Number(totalAssets),
      navPerShare,
      vTokenSupply: Number(totalSupply),
      paused,
      ethMode,
      strategies: [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}


