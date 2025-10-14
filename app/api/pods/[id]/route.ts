import { NextResponse } from "next/server";

export async function GET(_: Request, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  return NextResponse.json({
    podId: id,
    name: `Pod ${id}`,
    navUSD: 1234.56,
    membersCount: 3,
    nextContributionDate: new Date(Date.now() + 86400000).toISOString(),
    userSharePct: 12.34,
  });
}


