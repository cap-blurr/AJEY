"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { publicClient, formatEth } from "@/lib/chain";
import { ERC20_MIN_ABI } from "@/lib/services/vault";

export default function AccountStatusBar() {
  const { user } = usePrivy();
  const [address, setAddress] = useState<string>("");
  const [balance, setBalance] = useState<string>("—");
  const [usdc, setUsdc] = useState<string>("—");
  const [chainOk, setChainOk] = useState<boolean>(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const a = (user as any)?.wallet?.address || "";
    setAddress(a);
    if (a) {
      publicClient
        .getBalance({ address: a as `0x${string}` })
        .then((b) => {
          const eth = Number(formatEth(b));
          setBalance(`${eth.toFixed(4)} ETH`);
        })
        .catch(() => setBalance(`0.0000 ETH`));
      // USDC on Base Sepolia — fetch via viem then format safely
      (async () => {
        try {
          const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`;
          const dec = (await publicClient.readContract({ address: USDC, abi: ERC20_MIN_ABI as any, functionName: "decimals" })) as number;
          const bal = (await publicClient.readContract({ address: USDC, abi: ERC20_MIN_ABI as any, functionName: "balanceOf", args: [a as `0x${string}`] })) as bigint;
          const denom = Math.pow(10, Number(dec || 6));
          const v = Number(bal) / denom;
          setUsdc(`${(isFinite(v) ? v : 0).toFixed(2)} USDC`);
        } catch {
          setUsdc(`0.00 USDC`);
        }
      })();
      // Check chain id via window.ethereum if present
      if (typeof window !== "undefined" && (window as any).ethereum?.request) {
        (window as any).ethereum
          .request({ method: "eth_chainId" })
          .then((cid: string) => setChainOk(cid?.toLowerCase() === "0x14a34"))
          .catch(() => setChainOk(true));
      }
    } else {
      setBalance(`0.0000 ETH`);
      setUsdc(`0.00 USDC`);
    }
  }, [user]);

  return (
    <div className="w-full rounded-md border px-3 py-2 bg-background/60 backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-xs text-muted-foreground">Network</div>
          <div className={`text-xs ${chainOk ? "" : "text-red-400"}`}>{chainOk ? "Base Sepolia" : "Wrong network"}</div>
        </div>
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-xs text-muted-foreground">Balance</div>
          <div className="text-xs">{balance}</div>
        </div>
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-xs text-muted-foreground">USDC</div>
          <div className="text-xs">{usdc}</div>
        </div>
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-xs text-muted-foreground">Address</div>
          <button
            type="button"
            onClick={async () => {
              if (!address) return;
              try {
                await navigator.clipboard.writeText(address);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              } catch {}
            }}
            className="text-xs font-mono truncate max-w-[260px] hover:underline"
            title="Click to copy"
          >
            {address || "—"} {copied && <span className="opacity-70">(copied)</span>}
          </button>
        </div>
      </div>
    </div>
  );
}


