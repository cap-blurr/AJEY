// Server-only helpers for custodial agent wallets on Base Sepolia

import { createWalletClient, http, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

export type AgentRole = "deposit" | "pod" | "default";

type AgentConfig = {
  role: AgentRole;
  privateKey: Hex;
};

function env(key: string): string | undefined {
  let v = process.env[key];
  if (!v) return undefined;
  v = v.trim();
  // strip wrapping quotes if present
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v.length > 0 ? v : undefined;
}

function readAgentConfigs(): AgentConfig[] {
  const list: AgentConfig[] = [];
  const pkDefault = env("AGENT_DEFAULT_PRIVATE_KEY") as Hex | undefined;
  // const pkDeposit = env("AGENT_DEPOSIT_PRIVATE_KEY") as Hex | undefined;
  // const pkPod = env("AGENT_POD_PRIVATE_KEY") as Hex | undefined;

  if (pkDefault) list.push({ role: "default", privateKey: pkDefault });
  // if (pkDeposit) list.push({ role: "deposit", privateKey: pkDeposit });
  // if (pkPod) list.push({ role: "pod", privateKey: pkPod });

  // Comma-separated fallback disabled: only AGENT_DEFAULT_PRIVATE_KEY is supported
  // const many = env("AGENT_PRIVATE_KEYS");
  // if (many) {
  //   many
  //     .split(",")
  //     .map((s) => s.trim())
  //     .filter(Boolean)
  //     .forEach((pk, i) => {
  //       const role: AgentRole = (i === 0 ? "default" : ("default" as AgentRole));
  //       list.push({ role, privateKey: pk as Hex });
  //     });
  // }

  return list;
}

export function getAgentAccounts() {
  const configs = readAgentConfigs();
  const accounts = [] as Array<{ role: AgentRole; account: ReturnType<typeof privateKeyToAccount> }>;
  for (const c of configs) {
    try {
      let key = c.privateKey as string;
      key = key.trim();
      // ensure 0x prefix if missing
      if (!key.startsWith("0x")) key = ("0x" + key) as Hex;
      const acct = privateKeyToAccount(key as Hex);
      accounts.push({ role: c.role, account: acct });
    } catch {
      // skip invalid keys
      // eslint-disable-next-line no-console
      console.warn("[wallet] invalid private key for role", c.role);
    }
  }
  return accounts;
}

export function getAgentAddress(role: AgentRole = "default"): string | undefined {
  const entry = getAgentAccounts().find((a) => a.role === role) || getAgentAccounts()[0];
  return entry?.account.address;
}

export function getWalletClient(role: AgentRole = "default") {
  const rpcUrl = env("BASE_RPC_URL") || "https://sepolia.base.org";
  const entry = getAgentAccounts().find((a) => a.role === role) || getAgentAccounts()[0];
  if (!entry) return undefined;
  // cache per role to avoid recreating repeatedly
  const key = `__ajey_wallet_${role}`;
  const g = globalThis as any;
  if (g[key]) return g[key];
  const client = createWalletClient({
    account: entry.account,
    chain: baseSepolia,
    transport: http(rpcUrl),
  });
  g[key] = client;
  return client;
}

export async function sendNativeTransfer(params: {
  role?: AgentRole;
  to: string;
  amountEth: string;
}) {
  const client = getWalletClient(params.role || "default");
  if (!client) throw new Error("No agent wallet configured");
  // eslint-disable-next-line no-console
  console.log("[wallet] sendNativeTransfer", { to: params.to, amountEth: params.amountEth, role: params.role || "default" });
  const hash = await client.sendTransaction({
    account: client.account!,
    to: params.to as `0x${string}`,
    value: parseEther(params.amountEth),
  });
  // eslint-disable-next-line no-console
  console.log("[wallet] sendNativeTransfer submitted", { txHash: hash });
  return { hash };
}


