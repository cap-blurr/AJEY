import type { Abi } from "viem";

// Minimal ABI to satisfy current client usage (no direct calls in UI today)
export const AgentReallocatorAbi: Abi = [
  {
    type: "function",
    name: "permitShares",
    stateMutability: "nonpayable",
    inputs: [
      { name: "strategy", type: "address" },
      { name: "owner", type: "address" },
      { name: "value", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

