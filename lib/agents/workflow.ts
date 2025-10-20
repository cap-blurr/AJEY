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
  // Logs for observability
  // eslint-disable-next-line no-console
  console.log("[workflow] executeAllocation", {
    vault: ajeyVault.address,
    amountAssets: plan.amountAssets,
    targetPool: plan.poolAddress,
    account: account.address,
  });
  let hash: `0x${string}`;
  try {
    hash = await client.writeContract({
      ...ajeyVault,
      functionName: "supplyToAave",
      args: [BigInt(plan.amountAssets)],
      account,
    } as any);
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error("[workflow] writeContract failed", e?.message || e);
    throw e;
  }
  // eslint-disable-next-line no-console
  console.log("[workflow] executeAllocation submitted", { txHash: hash });

  return { txHash: hash };
}


