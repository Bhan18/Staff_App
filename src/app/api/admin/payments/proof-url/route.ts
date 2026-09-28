import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/attendance/staff-auth";
import { getPaymentsSupabase } from "@/lib/agent/payments-supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/admin/payments/proof-url?path= — signed read URL for a proof
// image. Admins approving a payment need to see every proof regardless of
// who recorded it, so there is no per-BM ownership check here (the admin
// gate is the whole authorisation).

const BUCKET = "payment-proofs";

export async function GET(req: NextRequest) {
  const gate = await requireAdminSession(req);
  if (!gate.authorized) return gate.response;

  const sb = getPaymentsSupabase();
  if (!sb) {
    return NextResponse.json({ error: "Service not configured." }, { status: 503 });
  }

  const path = req.nextUrl.searchParams.get("path")?.trim() ?? "";
  if (!path || !path.startsWith("proofs/") || path.includes("..")) {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }

  // The path must sit on some submission. A pending recording is not in the
  // `payments` ledger yet, but the approver still needs to see its proofs, so
  // authorisation is checked against `payment_submissions`.
  const { data: linked } = await sb
    .from("payment_submissions")
    .select("id")
    .contains("proof_urls", [path])
    .limit(1);
  if (!linked || linked.length === 0) {
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
