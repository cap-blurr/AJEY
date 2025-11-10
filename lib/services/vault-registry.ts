import { AjeyVaultAbi } from "@/abi/AjeyVault";
import { AddressBook, getOrchestratorAddress as getOrchFromBook, getVaultAddress as getVaultFromBook } from "@/lib/address-book";

export type AssetSymbol = "WETH" | "USDC" | "USDT" | "DAI";

const CANONICAL_ASSETS: Record<AssetSymbol, `0x${string}`> = {
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  DAI:  "0x6B175474E89094C44Da98b954EedeAC495271d0F",
};

export function parseAssetSymbol(input: string | null | undefined): AssetSymbol | undefined {
  if (!input) return undefined;
  const up = input.toUpperCase();
  if (up === "WETH" || up === "USDC" || up === "USDT" || up === "DAI") return up as AssetSymbol;
  return undefined;
}

export function getAssetAddress(symbol: AssetSymbol): `0x${string}` {
  const envKey = `ASSET_${symbol}`;
  const fromEnv = (process.env[envKey] || process.env[envKey as keyof NodeJS.ProcessEnv] || "").trim();
  if (fromEnv && fromEnv.startsWith("0x")) return fromEnv as `0x${string}`;
  // Fallback to address book canonical if available
  return (AddressBook.assets[symbol] || CANONICAL_ASSETS[symbol]) as `0x${string}`;
}

export function getVaultAddress(symbol: AssetSymbol): `0x${string}` | undefined {
  // Prefer NEXT_PUBLIC_* so client components can also import this registry if needed
  const pubKey = `NEXT_PUBLIC_VAULT_${symbol}`;
  const srvKey = `VAULT_${symbol}`;
  const pub = (process.env[pubKey] || "").trim();
  if (pub && pub.startsWith("0x")) return pub as `0x${string}`;
  const srv = (process.env[srvKey] || "").trim();
  if (srv && srv.startsWith("0x")) return srv as `0x${string}`;
  // Fallback to address book default
  return getVaultFromBook(symbol as any);
}

export function getVaultContract(symbol: AssetSymbol): { address: `0x${string}`; abi: typeof AjeyVaultAbi } | undefined {
  const addr = getVaultAddress(symbol);
  if (!addr) return undefined;
  return { address: addr, abi: AjeyVaultAbi } as const;
}

export function getOrchestratorAddress(): `0x${string}` | undefined {
  const keys = ["NEXT_PUBLIC_ORCHESTRATOR_ADDRESS", "NEXT_PUBLIC_ORCHESTRATOR", "ORCHESTRATOR_ADDRESS"];
  for (const k of keys) {
    const v = (process.env[k] || "").trim();
    if (v && v.startsWith("0x")) return v as `0x${string}`;
  }
  return getOrchFromBook();
}

export function listConfiguredVaults(): Array<{ symbol: AssetSymbol; address: `0x${string}` }> {
  const out: Array<{ symbol: AssetSymbol; address: `0x${string}` }> = [];
  (["WETH", "USDC", "USDT", "DAI"] as AssetSymbol[]).forEach((s) => {
    const addr = getVaultAddress(s);
    if (addr) out.push({ symbol: s, address: addr });
  });
  return out;
}


