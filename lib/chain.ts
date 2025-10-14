import { createPublicClient, http, formatEther } from "viem";
import { baseSepolia } from "viem/chains";

export const rpcUrl = process.env.BASE_RPC_URL || "https://sepolia.base.org";

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(rpcUrl),
});

export function formatEth(value: bigint) {
  return formatEther(value);
}


