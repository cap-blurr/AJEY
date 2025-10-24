"use client";

import { buttonVariants } from "@/components/ui/button"
import RetroGrid from "@/components/magicui/retro-grid"
import { cn } from "@/lib/utils";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import AjeyLogo from "@/Ajey Header focused-Photoroom.png";
// import { NostalgiaPage } from "./nostalgia-section/page";

export default function IndexPage() {
  const { ready, authenticated, logout } = usePrivy();
  const { login } = useLogin({
    onComplete: () => {
      // After a successful login, route to /home
      // We avoid import of router to keep page lean; rely on location for now
      try { window.location.href = "/home" } catch {}
    },
  });
  return (
    <section className="relative container grid items-center gap-6 pb-8 pt-6 md:py-10 mx-auto justify-center mt-20">
      
      <div className="flex max-w-[980px] flex-col items-center gap-6 retro-theme relative">
        <div className="z-10 flex flex-col items-center gap-4">
          <Image
            src={AjeyLogo}
            alt="AJEY logo"
            priority
            className="w-[420px] max-w-full h-auto drop-shadow-[0_0_35px_rgba(0,236,255,0.45)]"
          />
          <h1 className="text-3xl sm:text-3xl md:text-4xl lg:text-5xl font-pixel font-bold leading-tight tracking-wider text-accent-foreground text-center">
            Sign in to continue
          </h1>
          <p className="max-w-[700px] text-lg sm:text-xl text-accent-foreground text-center">
            Use Email to create your embedded wallet and start Earning!
          </p>
          <div className="flex gap-3">
            {!ready ? (
              <Button disabled className={cn(buttonVariants())}>Loading…</Button>
            ) : authenticated ? (
              <Button variant="outline" onClick={() => logout()}>
                Sign out
              </Button>
            ) : (
              <Button
                onClick={() =>
                  login({ loginMethods: ["email", "wallet"], walletChainType: "ethereum-only" })
                }
                className={cn(buttonVariants())}
              >
                Continue with Email or Base
              </Button>
            )}
          </div>
        </div>
      
      
      </div>
      {/* Match home page gradient background */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#ff00aaff] via-[#7c3aed66] to-transparent to-90% dark:from-[#ff00aaee] dark:via-[#7c3aed88]" />
      <RetroGrid className="z-0 absolute inset-0 max-w-[1000]" /> 
      <div className="flex gap-4 justify-center"></div>
    
    </section>
    
  )
}
