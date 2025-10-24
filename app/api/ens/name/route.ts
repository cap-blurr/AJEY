import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, toCoinType } from "viem";
import { base, mainnet } from "viem/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const address = (searchParams.get("address") || "").trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json({ error: "invalid address" }, { status: 400 });
    }
    const rpc = process.env.ETH_MAINNET_RPC_URL || process.env.NEXT_PUBLIC_ETH_MAINNET_RPC_URL || "https://eth.llamarpc.com";
    const client = createPublicClient({ chain: mainnet, transport: http(rpc) });
    const name = await client.getEnsName({ address: address as `0x${string}`, coinType: toCoinType(base.id) });
    return NextResponse.json({ name: name || null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}


