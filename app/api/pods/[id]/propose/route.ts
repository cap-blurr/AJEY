import { NextRequest, NextResponse } from "next/server";
import { addActivity } from "@/lib/activity";
import { generatePlan } from "@/lib/agents/gemini";

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  const body = await req.json().catch(() => ({}));

  const planRes = await generatePlan({
    kind: "pod_proposal",
    payload: { podId: id, proposal: body },
  });

  const planId = `plan_${Date.now()}`;
  addActivity({
    id: planId,
    type: "pod_proposal",
    status: "queued",
    timestamp: Date.now(),
    title: `Pod ${id} proposal queued`,
    details: planRes.rationale,
  });

  // TODO: POST plan to workflow agent HTTPS endpoint /agent/plans

  return NextResponse.json({ planId, status: "queued" });
}


