"use client"

import React from "react"
import { PrivyProvider } from "@privy-io/react-auth"
import { baseSepolia } from "viem/chains"

interface PrivyProviderWrapperProps {
  children: React.ReactNode
}

export function PrivyProviderWrapper({ children }: PrivyProviderWrapperProps) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID as string | undefined

  return (
    <PrivyProvider
      appId={appId ?? ""}
      config={{
        loginMethods: ["email", "wallet", "google"],
        // Pre-generate an embedded EVM wallet for users who log in without an external wallet
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
        // Configure Base Sepolia using viem's chain object
        defaultChain: baseSepolia,
        supportedChains: [baseSepolia],
        appearance: {
          // Use a brand-accent color close to the site's primary
          accentColor: "#6366F1", // Tailwind indigo-500
          // Show Base Account as a wallet option in the modal
          walletList: ["base_account"],
          // Keep email first; wallets still available in the modal
          showWalletLoginFirst: false,
        },
      }}
    >
      {children}
    </PrivyProvider>
  )
}


