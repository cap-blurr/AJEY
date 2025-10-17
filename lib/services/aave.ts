// Aave v3 pools (preapproved) on Base Sepolia — seed list for hackathon
// Replace with on-chain registry or API later

export type AavePool = {
  poolAddress: `0x${string}`;
  poolName: string;
  assetSymbol: string;
};

// Seed with example addresses; update with your actual Base Sepolia pool addresses
import { AAVE_BASE_SEPOLIA_POOLS } from "@/config/aave-base-sepolia";

export const PREAPPROVED_POOLS: AavePool[] = AAVE_BASE_SEPOLIA_POOLS;

// Placeholder yield fetcher — replace with subgraph or protocol API
export async function fetchPoolYields(): Promise<Array<AavePool & { aprPct: number }>> {
  // Hackathon: fixed APR for the single ETH pool; replace with live data
  return PREAPPROVED_POOLS.map((p) => ({ ...p, aprPct: 6.5 }));
}

export function selectBestPoolByApr(
  pools: Array<AavePool & { aprPct: number }>,
): (AavePool & { aprPct: number }) | undefined {
  return pools.slice().sort((a, b) => b.aprPct - a.aprPct)[0];
}


