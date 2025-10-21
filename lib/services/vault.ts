// VaultService — thin wrappers to your vault endpoints and on-chain calls
import { publicClient } from "@/lib/chain";
import type { Abi } from "viem";
import { AjeyVaultAbi } from "@/abi/AjeyVault";
import { RebasingWrapperAbi } from "@/abi/RebasingWrapper";

export type Strategy = {
  id: string;
  name: string;
  allocationPct: number;
  aprPct: number;
  tvlUSD: number;
  sparklineData: number[];
};

export type VaultSummary = {
  totalAssetsUSD: number | undefined;
  totalAssets?: number; // legacy
  totalAssetsWei?: string; // precise
  totalAssetsFormatted?: string; // human display (ETH)
  navPerShare: number;
  vTokenSupply: number;
  paused?: boolean;
  ethMode?: boolean;
  strategies: Strategy[];
  aprMin?: number;
  aprMax?: number;
  aprRangeText?: string;
};

export async function getVaultSummary(): Promise<VaultSummary> {
  const res = await fetch("/api/vault", { cache: "no-store" });
  return (await res.json()) as VaultSummary;
}

export async function getActivity() {
  const res = await fetch("/api/activity", { cache: "no-store" });
  return await res.json();
}

// On-chain configuration (addresses injected via env)
export const VAULT_ADDRESS = (process.env.NEXT_PUBLIC_VAULT || "") as `0x${string}`;
export const WRAPPER_ADDRESS = (process.env.NEXT_PUBLIC_WRAPPER || "") as `0x${string}`;

export const ajeyVault = VAULT_ADDRESS
  ? ({ address: VAULT_ADDRESS, abi: AjeyVaultAbi } as const)
  : undefined;

export const rebasingWrapper = WRAPPER_ADDRESS
  ? ({ address: WRAPPER_ADDRESS, abi: RebasingWrapperAbi } as const)
  : undefined;

// Minimal ERC20 interface for approvals/balances
export const ERC20_MIN_ABI = [
  { name: "approve", type: "function", stateMutability: "nonpayable", inputs: [ { name: "spender", type: "address" }, { name: "amount", type: "uint256" } ], outputs: [ { name: "", type: "bool" } ] },
  { name: "allowance", type: "function", stateMutability: "view", inputs: [ { name: "owner", type: "address" }, { name: "spender", type: "address" } ], outputs: [ { name: "", type: "uint256" } ] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [ { name: "account", type: "address" } ], outputs: [ { name: "", type: "uint256" } ] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [ { name: "", type: "uint8" } ] },
] as const satisfies Abi;

export async function getAssetAddress(): Promise<`0x${string}`> {
  if (!ajeyVault) throw new Error("Vault address not configured");
  return (await publicClient.readContract({ ...ajeyVault, functionName: "asset" })) as `0x${string}`;
}


export async function readAssetDecimals(token: `0x${string}`): Promise<number> {
  const dec = (await publicClient.readContract({ address: token, abi: ERC20_MIN_ABI, functionName: "decimals" })) as number;
  return dec || 18;
}

export async function readIdleUnderlying(): Promise<bigint> {
  if (!ajeyVault) throw new Error("Vault address not configured");
  return (await publicClient.readContract({ ...ajeyVault, functionName: "idleUnderlying" })) as bigint;
}



