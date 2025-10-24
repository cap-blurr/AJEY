"use client"

import { useEffect, useMemo, useState } from "react"
import { toCoinType } from "viem"
import { base } from "viem/chains"

export async function resolveBasename(address: `0x${string}`): Promise<string | null> {
  try {
    if (!address) return null
    // Resolve via server to avoid browser RPC/CORS issues
    const res = await fetch(`/api/ens/name?address=${address}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const name = data?.name as string | null | undefined;
    return name || null
  } catch {
    return null
  }
}

export function useBasename(address: `0x${string}` | "") {
  const [basename, setBasename] = useState<string | null>(null)
  const stableAddr = useMemo(() => address as `0x${string}` | "", [address])
  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        if (!stableAddr) { setBasename(null); return }
        const name = await resolveBasename(stableAddr as `0x${string}`)
        if (!cancelled) setBasename(name)
      } catch {
        if (!cancelled) setBasename(null)
      }
    }
    run()
    return () => { cancelled = true }
  }, [stableAddr])
  return basename
}


