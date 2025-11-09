// Lightweight Octant helpers: fetch donation causes from a registry (if configured),
// otherwise return a safe placeholder list. Designed to run in both server and browser.

export type DonationCause = {
  id: string;
  name: string;
  recipient: `0x${string}`;
};

const FALLBACK_CAUSES: DonationCause[] = [
  { id: "cause_oss", name: "Open Source Sustainability", recipient: "0x0000000000000000000000000000000000000001" },
  { id: "cause_public_goods", name: "Public Goods Infrastructure", recipient: "0x0000000000000000000000000000000000000002" },
  { id: "cause_research", name: "Research & Education", recipient: "0x0000000000000000000000000000000000000003" },
  { id: "cause_climate", name: "Climate & Environment", recipient: "0x0000000000000000000000000000000000000004" },
  { id: "cause_community", name: "Community Grants", recipient: "0x0000000000000000000000000000000000000005" },
];

export async function loadDonationCauses(): Promise<DonationCause[]> {
  // No ABI yet — return a static dummy list for the dropdown.
  return FALLBACK_CAUSES;
}

export type DonationMixItem = { causeId: string; pct: number };

export function validateDonationMix(mix: DonationMixItem[], available: DonationCause[]): { ok: boolean; reason?: string } {
  const filtered = mix.filter((m) => m && m.causeId && Number.isFinite(m.pct));
  if (filtered.length === 0) return { ok: false, reason: "Select at least one cause" };
  if (filtered.length > 3) return { ok: false, reason: "Select up to 3 causes" };
  const ids = new Set(filtered.map((m) => m.causeId));
  if (ids.size !== filtered.length) return { ok: false, reason: "Duplicate causes not allowed" };
  const sum = filtered.reduce((s, m) => s + (m.pct || 0), 0);
  if (sum !== 100) return { ok: false, reason: "Proportions must sum to 100%" };
  for (const m of filtered) {
    if (m.pct <= 0) return { ok: false, reason: "Each proportion must be > 0%" };
    const found = available.find((c) => c.id === m.causeId);
    if (!found) return { ok: false, reason: "Unknown cause selected" };
  }
  return { ok: true };
}


