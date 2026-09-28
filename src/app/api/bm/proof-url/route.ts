import { NextRequest, NextResponse } from "next/server";
import { requireBranchManager } from "@/lib/agent/bm-guard";
import { getPaymentsSupabase } from "@/lib/agent/payments-supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/bm/proof-url?path= — signed read URL for a proof image, only
// when the path belongs to one of the BM's own recordings.

const BUCKET = "payment-proofs";

export async function GET(req: NextRequest) {
  const gate = await requireBranchManager(req);
  if (!gate.authorized) return gate.response;

  const sb = getPaymentsSupabase();
  if (!sb) {
    return NextResponse.json({ error: "Service not configured." }, { status: 503 });
  }

  const path = req.nextUrl.searchParams.get("path")?.trim() ?? "";
  if (!path || !path.startsWith("proofs/") || path.includes("..")) {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }

  // Ownership check: the path must sit on one of this BM's submissions.
  const { data: own } = await sb
    .from("payment_submissions")
    .select("id")
    .eq("recorded_by", gate.employee.id)
    .contains("proof_urls", [path])
    .limit(1);
  if (!own || own.length === 0) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 10 * 60);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Could not load proof." }, { status: 500 });
  }
  return NextResponse.json(
    { url: data.signedUrl },
    { headers: { "Cache-Control": "no-store" } },
  );
}
