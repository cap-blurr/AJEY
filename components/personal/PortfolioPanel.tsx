"use client";

export default function PortfolioPanel() {
  return (
    <div className="rounded-xl border p-6 bg-background/60 backdrop-blur">
      <h2 className="text-xl font-semibold">Portfolio</h2>
      <p className="text-sm text-muted-foreground">Your positions will appear here once deposits are made.</p>
      <div className="mt-3 text-xs text-muted-foreground">Auto-refreshes every 15s.</div>
    </div>
  );
}


