import { publicClient, browserPublicClient } from "@/lib/chain";
import { ajeyVault } from "@/lib/services/vault";
import { AgentReallocatorAbi } from "@/abi/AgentReallocator";
import { maxUint256 } from "viem";

const MAX_UINT256 = maxUint256;

export function getAgentReallocatorAddress(): `0x${string}` {
  const addr = (process.env.NEXT_PUBLIC_AGENT_REALLOCATOR || "").trim();
  if (!addr) throw new Error("NEXT_PUBLIC_AGENT_REALLOCATOR not set");
  return addr as `0x${string}`;
}

export const agentReallocator = {
  address: getAgentReallocatorAddress(),
  abi: AgentReallocatorAbi,
} as const;

export async function readShareAllowance(owner: `0x${string}`, client = publicClient): Promise<bigint> {
  if (!ajeyVault) throw new Error("Vault address not configured");
  const spender = getAgentReallocatorAddress();
  return await client.readContract({
    ...(ajeyVault as any),
    functionName: "allowance",
    args: [owner, spender],
  }) as bigint;
}

// Returns { alreadyMax: true } if no tx needed; otherwise { alreadyMax: false, request }
export async function simulateApproveReallocatorMax(
  owner: `0x${string}`,
  opts?: { client?: any },
): Promise<{ alreadyMax: true } | { alreadyMax: false; request: any }> {
  if (!ajeyVault) throw new Error("Vault address not configured");
  const c = opts?.client ?? publicClient;
  const spender = getAgentReallocatorAddress();

  const allowance = await c.readContract({
    ...(ajeyVault as any),
    functionName: "allowance",
    args: [owner, spender],
  }) as bigint;

  if (allowance === MAX_UINT256) return { alreadyMax: true as const };

  const sim = await c.simulateContract({
    ...(ajeyVault as any),
    functionName: "approve",
    args: [spender, MAX_UINT256],
    account: owner,
  } as any);

  return { alreadyMax: false as const, request: sim.request };
}


