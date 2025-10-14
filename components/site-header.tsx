"use client"

import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { usePrivy } from "@privy-io/react-auth"
import { useRouter } from "next/navigation"

export function SiteHeader() {
  const { ready, authenticated, logout } = usePrivy()
  const router = useRouter()

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
            <Button onClick={handleLogout}>
              Logout
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  )
}
