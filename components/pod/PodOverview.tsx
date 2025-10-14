"use client";

export default function PodOverview() {
  return (
    <div className="rounded-xl border p-6 bg-background/60 backdrop-blur">
      <h2 className="text-xl font-semibold">Pod Overview</h2>
      <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-muted-foreground">Pod TVL</div>
          <div>$0</div>
        </div>
        <div>
          <div className="text-muted-foreground">Members</div>
          <div>1</div>
        </div>
        <div>
          <div className="text-muted-foreground">Strategy</div>
          <div>AjeyVault</div>
        </div>
      </div>
    </div>
  );
}


