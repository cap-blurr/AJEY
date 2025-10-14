"use client"

import React from "react"
import { PrivyProvider } from "@privy-io/react-auth"

interface PrivyProviderWrapperProps {
  children: React.ReactNode
}

export function PrivyProviderWrapper({ children }: PrivyProviderWrapperProps) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID as string | undefined

  // Minimal Base Sepolia chain object compatible with viem's Chain shape
  const BASE_SEPOLIA: any = {
    id: 84532,
    name: "Base Sepolia",
    network: "base-sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: { http: ["https://sepolia.base.org"] },
      public: { http: ["https://sepolia.base.org"] },
    },
    blockExplorers: {
      default: { name: "Basescan", url: "https://sepolia.basescan.org" },
    },
    testnet: true,
  }

  return (
    <PrivyProvider
      appId={appId ?? ""}
      config={{
        loginMethods: ["email", "google"],
        // Pre-generate an embedded EVM wallet for users who log in without an external wallet
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
        // Configure Base Sepolia
        defaultChain: BASE_SEPOLIA,
        supportedChains: [BASE_SEPOLIA],
        appearance: {
          // Use a brand-accent color close to the site's primary
          accentColor: "#6366F1", // Tailwind indigo-500
        },
      }}
    >
      {children}
    </PrivyProvider>
  )
}


