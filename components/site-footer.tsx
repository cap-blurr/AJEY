"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { usePathname } from "next/navigation"
// import { ModeToggle } from "@/components/mode-toggle"

export function SiteFooter({ className }: React.HTMLAttributes<HTMLElement>) {
  const pathname = usePathname()
  const showGradient = pathname !== "/"
  return (
    <footer className={cn("relative overflow-hidden", className)}>
      {showGradient ? (
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#ff00aaff] via-[#7c3aed66] to-transparent to-90% dark:from-[#ff00aaee] dark:via-[#7c3aed88]" />
      ) : null}
      <div className="container flex flex-col items-center justify-between gap-4 md:h-24 md:flex-row bottom-0 inset-x-0 rounded-lg">
        <div className="flex flex-col items-center gap-4 px-0 md:flex-row md:gap-2 md:px-0">
          {/* <Icons.logo /> */}
          <p className="text-center text-sm leading-loose md:text-left">
            Brought to you by{" "}
            <a
              href="https://x.com/captain_blurr"
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-4"
            >
              Gichuki.
            </a>
          </p>
        </div>
        {/* <ModeToggle /> */}
      </div>
    </footer>
  )
}