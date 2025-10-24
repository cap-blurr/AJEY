"use client"

import { useEffect, useMemo, useState } from "react"
import { createPublicClient, http, toCoinType } from "viem"
import { base } from "viem/chains"

export function getBaseMainnetRpcUrl(): string {
  const env = (process as any)?.env || {}
  return ( env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org") as string
}

export async function resolveBasename(address: `0x${string}`): Promise<string | null> {
  try {
    if (!address) return null
    const rpc = getBaseMainnetRpcUrl()
    const client = createPublicClient({ chain: base, transport: http(rpc) })
    const name = await client.getEnsName({ address, coinType: toCoinType(base.id) })
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


