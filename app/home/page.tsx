"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AccountStatusBar from "@/components/personal/AccountStatusBar";
import ProductCard from "@/components/personal/ProductCard";
import PortfolioPanel from "@/components/personal/PortfolioPanel";
import ActivityFeed from "@/components/personal/ActivityFeed";
import PodSwitcher from "@/components/pod/PodSwitcher";
import PodOverview from "@/components/pod/PodOverview";
import PodDepositCard from "@/components/pod/PodDepositCard";
import PodWithdrawCard from "@/components/pod/PodWithdrawCard";
import PodActivityFeed from "@/components/pod/PodActivityFeed";

export default function HomePage() {
  const { ready, authenticated, user } = usePrivy();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"home" | "pod">("home");

  useEffect(() => {
    if (ready && !authenticated) {
      router.replace("/");
    }
  }, [ready, authenticated, router]);

  if (!ready) return null;

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#ff00aaff] via-[#7c3aed66] to-transparent to-90% dark:from-[#ff00aaee] dark:via-[#7c3aed88]" />
      <div className="container mx-auto py-10 px-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-white">Welcome{user?.wallet?.address ? `, ${user.wallet.address}` : ""}.</p>
        </div>

        <div className="mt-6 flex gap-2">
          <button
            className={`rounded-md px-4 py-2 text-sm font-medium ${activeTab === "home" ? "bg-white/10 border border-white/20" : "bg-white/5 border border-transparent"}`}
            onClick={() => setActiveTab("home")}
          >
            Home
          </button>
          <button
            className={`rounded-md px-4 py-2 text-sm font-medium ${activeTab === "pod" ? "bg-white/10 border border-white/20" : "bg-white/5 border border-transparent"}`}
            onClick={() => setActiveTab("pod")}
          >
            Pod
          </button>
        </div>

        {activeTab === "home" ? (
          <div className="mt-6 grid gap-6">
            <AccountStatusBar />
            <div className="grid gap-6 md:grid-cols-2">
              <div className="md:col-span-2">
                <h2 className="text-lg font-semibold mb-2">Places to invest</h2>
                <ProductCard />
              </div>
              <PortfolioPanel />
              <ActivityFeed />
            </div>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <PodSwitcher />
            <PodOverview />
            <PodDepositCard />
            <PodWithdrawCard />
            <PodActivityFeed />
          </div>
        )}
      </div>
    </div>
  );
}


