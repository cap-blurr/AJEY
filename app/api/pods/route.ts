import { NextRequest, NextResponse } from "next/server";
import { addActivity } from "@/lib/activity";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const podId = `pod_${Date.now()}`;
  addActivity({
    id: podId,
    type: "pod_create",
    status: "success",
    timestamp: Date.now(),
    title: `Pod created: ${body?.name || podId}`,
  });
  return NextResponse.json({ podId });
}


