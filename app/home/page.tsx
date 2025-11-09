"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AccountStatusBar from "@/components/personal/AccountStatusBar";
import ProductCard from "@/components/personal/ProductCard";
import OctantDonationProductCard from "@/components/personal/OctantDonationProductCard";
import { useBasename } from "@/lib/basename";
// import PortfolioPanel from "@/components/personal/PortfolioPanel";
import ActivityFeed from "@/components/personal/ActivityFeed";
// import PodSwitcher from "@/components/pod/PodSwitcher";
// import PodOverview from "@/components/pod/PodOverview";
// import PodActivityFeed from "@/components/pod/PodActivityFeed";
// import PodMembership from "@/components/pod/PodMembership";
// import PodProposals from "@/components/pod/PodProposals";
// import PodInvesting from "@/components/pod/PodInvesting";
// import PodAutoPull from "@/components/pod/PodAutoPull";
// import PodWithdrawals from "@/components/pod/PodWithdrawals";

export default function HomePage() {
  const { ready, authenticated, user } = usePrivy();
  const router = useRouter();
  const address = (user?.wallet?.address || "") as `0x${string}` | "";
  const basename = useBasename(address);
  // const [activeTab, setActiveTab] = useState<"home" | "pod">("home");
  // const [activePod, setActivePod] = useState<`0x${string}` | undefined>(undefined);

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
          <p className="text-sm text-white">Welcome{address ? `, ${basename || address}` : ""}.</p>
        </div>

        {/* Pods UI temporarily disabled for hackathon */}

        <div className="mt-6 grid gap-6">
          <AccountStatusBar />
          <div className="grid gap-10 md:grid-cols-[640px_0.2fr_360px] items-start justify-center">
            <div>
              <h2 className="text-lg font-semibold mb-2">Ajey Vault</h2>
              <ProductCard />
              <div className="mt-10">
                <h2 className="text-lg font-semibold mb-2">Octant Donation Product</h2>
                <OctantDonationProductCard />
              </div>
            </div>
            <div className="hidden md:block" />
            <div>
              <h2 className="text-lg font-semibold mb-2">Activity</h2>
              <div className="w-full max-w-[360px]">
                <ActivityFeed />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


