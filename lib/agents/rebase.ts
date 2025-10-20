// Server-only rebase runner: calls vault.rebaseAndTakeFees then wrapper.rebase
import { getWalletClient } from "@/lib/agents/wallet";
import { ajeyVault, rebasingWrapper } from "@/lib/services/vault";

export async function runRebaseCycle() {
  if (!ajeyVault) throw new Error("Vault address not configured");
  if (!rebasingWrapper) throw new Error("Wrapper address not configured");
  const client = getWalletClient("default");
  if (!client) throw new Error("No agent wallet configured");
  const account = client.account!;

  // Step 1: settle fees & checkpoint on the vault
  await client.writeContract({
    ...ajeyVault,
    functionName: "rebaseAndTakeFees",
    args: [],
    account,
  } as any);

  // Step 2: propagate index to the wrapper
  await client.writeContract({
    ...rebasingWrapper,
    functionName: "rebase",
    args: [],
    account,
  } as any);

  return { ok: true };
}


