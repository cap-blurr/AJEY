// VaultService — thin wrappers to your vault endpoints and future on-chain calls
import { publicClient } from "@/lib/chain";

export type Strategy = {
  id: string;
  name: string;
  allocationPct: number;
  aprPct: number;
  tvlUSD: number;
  sparklineData: number[];
};

export type VaultSummary = {
  totalAssetsUSD: number;
  navPerShare: number;
  vTokenSupply: number;
  strategies: Strategy[];
};

export async function getVaultSummary(): Promise<VaultSummary> {
  const res = await fetch("/api/vault", { cache: "no-store" });
  return (await res.json()) as VaultSummary;
}

export async function getActivity() {
  const res = await fetch("/api/activity", { cache: "no-store" });
  return await res.json();
}


