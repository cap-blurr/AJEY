"use client"

import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { usePrivy, useWallets } from "@privy-io/react-auth"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { toCoinType } from "viem"
import { base } from "viem/chains"
import { useBasename } from "@/lib/basename"

export function SiteHeader() {
  const { ready, authenticated, logout, user } = usePrivy()
  const { wallets } = useWallets()
  const router = useRouter()

  const address = useMemo(() => {
    const a = (wallets && wallets[0]?.address) || ((user as any)?.wallet?.address) || ""
    return a as `0x${string}` | ""
  }, [wallets, user])
  const basename = useBasename(address)

  const handleLogout = async () => {
    try {
      await logout()
    } finally {
      router.replace("/")
    }
  }
  return (
    <header className="bg-background sticky top-0 z-40 w-full border-b">
      <div className="container flex h-16 items-center justify-between">
        <div />
        <div className="flex items-center space-x-2">
          <ThemeToggle />
          {ready && authenticated ? (
            <Button onClick={handleLogout} title={address || undefined}>
              {basename ? `Logout ${basename}` : "Logout"}
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  )
}
