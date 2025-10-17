// Workflow executor: calls vault contract to allocate funds (e.g., supplyToAave)
import { getWalletClient } from "@/lib/agents/wallet";
import { ajeyVault } from "@/lib/services/vault";

export async function executeAllocation(plan: {
  amountAssets: string;
  poolAddress: `0x${string}`;
}) {
  if (!ajeyVault) throw new Error("Vault address not configured");
  const client = getWalletClient("default");
  if (!client) throw new Error("No agent wallet configured");
  const account = client.account!;

  // AjeyVault ABI indicates agent methods such as supplyToAave(amount)
  // Convert amountAssets (string) to bigint wei for ETH if needed upstream
  const hash = await client.writeContract({
    ...ajeyVault,
    functionName: "supplyToAave",
    args: [BigInt(plan.amountAssets)],
    account,
  } as any);

  return { txHash: hash };
}


