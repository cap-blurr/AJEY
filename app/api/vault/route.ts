import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    totalAssetsUSD: 123456.78,
    navPerShare: 1.04,
    vTokenSupply: 987654.32,
    strategies: [
      { id: "s1", name: "Base Lender", allocationPct: 40, aprPct: 9.2, tvlUSD: 50000, sparklineData: [1, 2, 3, 2, 4, 5] },
      { id: "s2", name: "ETH LP", allocationPct: 35, aprPct: 7.1, tvlUSD: 43000, sparklineData: [2, 2, 3, 3, 4, 4] },
      { id: "s3", name: "Points Farm", allocationPct: 25, aprPct: 4.4, tvlUSD: 30345, sparklineData: [1, 1, 2, 2, 3, 3] },
    ],
  });
}


