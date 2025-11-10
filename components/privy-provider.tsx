"use client"

import React from "react"
import { PrivyProvider } from "@privy-io/react-auth"
import { defineChain } from "viem"

interface PrivyProviderWrapperProps {
  children: React.ReactNode
}

export function PrivyProviderWrapper({ children }: PrivyProviderWrapperProps) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID as string | undefined
  // Custom mainnet fork (Tenderly) — Chain ID 8
  // RPC: https://virtual.mainnet.eu.rpc.tenderly.co/82c86106-662e-4d7f-a974-c311987358ff
  const tenderlyFork = defineChain({
    id: 8,
    name: "Mainnet Fork (Tenderly EU)",
    network: "ethereum",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: {
        http: ["https://virtual.mainnet.eu.rpc.tenderly.co/82c86106-662e-4d7f-a974-c311987358ff"],
      },
      public: {
        http: ["https://virtual.mainnet.eu.rpc.tenderly.co/82c86106-662e-4d7f-a974-c311987358ff"],
      },
    },
    // Treat as a testnet/fork to avoid mainnet-only safety checks
    testnet: true,
  })

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
        // Configure custom Tenderly fork chain using viem's defineChain
        defaultChain: tenderlyFork,
        supportedChains: [tenderlyFork],
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


