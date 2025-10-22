import { createPublicClient, http, webSocket, formatEther } from "viem";
import { baseSepolia } from "viem/chains";

// Server/browser env (explicit names per project config)
export const rpcUrl = process.env.BASE_RPC_URL || "https://sepolia.base.org";
export const wsRpcUrl = process.env.BASE_WS_URL || "";

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(rpcUrl),
});

// Optional WebSocket client for efficient event subscriptions (reduces eth_newFilter/eth_getFilterChanges)
export const wsPublicClient = wsRpcUrl
  ? createPublicClient({ chain: baseSepolia, transport: webSocket(wsRpcUrl) })
  : undefined;

// Browser helpers (use same names; Next will inline at build-time if provided)
export const browserRpcUrl = rpcUrl;
export const browserWsUrl = wsRpcUrl;

export const browserPublicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(browserRpcUrl),
});

export const browserWsPublicClient = browserWsUrl
  ? createPublicClient({ chain: baseSepolia, transport: webSocket(browserWsUrl) })
  : undefined;

export function formatEth(value: bigint) {
  return formatEther(value);
}


