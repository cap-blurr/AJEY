"use client";

export default function PodDepositCard() {
  return (
    <div className="rounded-xl border p-6 bg-background/60 backdrop-blur">
      <h2 className="text-xl font-semibold">Pod Deposit</h2>
      <div className="mt-3 flex items-center gap-2">
        <input type="number" placeholder="Amount" className="w-40 rounded-md border bg-background px-3 py-2 text-sm" />
        <button className="rounded-md border px-4 py-2 text-sm">Deposit</button>
      </div>
    </div>
  );
}


