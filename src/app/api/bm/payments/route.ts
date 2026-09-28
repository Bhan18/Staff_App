import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireBranchManager } from "@/lib/agent/bm-guard";
import { getPaymentsSupabase } from "@/lib/agent/payments-supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RECORDABLE = ["booked", "reserved", "sold"];

// GET /api/bm/payments — the BM's own recordings (any status), newest first,
// with plot + customer labels for display. The amount is deliberately NOT
// returned: the BM typed it in, and the figure is only ever read on the
// admin approval screen.
//
// Reads `payment_submissions`, not `payments`: a recording is not money until
// an admin approves it, and the ledger is only written on approval.
export async function GET(req: NextRequest) {
  const gate = await requireBranchManager(req);
  if (!gate.authorized) return gate.response;

  const sb = getPaymentsSupabase();
  if (!sb) {
    return NextResponse.json({ error: "Service not configured." }, { status: 503 });
  }

  const { data, error } = await sb
    .from("payment_submissions")
    .select("*")
    .eq("recorded_by", gate.employee.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: "Could not load payments." }, { status: 500 });
  }

  const rows = data ?? [];
  const plotIds = [...new Set(rows.map((r: { plot_id: string }) => r.plot_id).filter(Boolean))];
  const custIds = [...new Set(rows.map((r: { customer_id: string }) => r.customer_id).filter(Boolean))];

  const [plotRes, custRes] = await Promise.all([
    plotIds.length
      ? sb.from("plots").select("id, plot_number, block").in("id", plotIds)
      : Promise.resolve({ data: [] as { id: string; plot_number: string; block: string }[] }),
    custIds.length
      ? sb.from("customers").select("id, name").in("id", custIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const plotById = new Map(
    ((plotRes.data ?? []) as { id: string; plot_number: string; block: string }[]).map((p) => [p.id, p]),
  );
  const custById = new Map(
    ((custRes.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]),
  );

  const items = rows.map((r: Record<string, unknown>) => ({
    id: r.id,
    date: r.date,
    paymentMode: r.payment_mode,
    referenceNumber: r.reference_number ?? null,
    bank: r.bank ?? null,
    chequeNumber: r.cheque_number ?? null,
    transactionId: r.transaction_id ?? null,
    remarks: r.remarks ?? null,
    status: r.status ?? "pending",
    rejectionRemark: r.rejection_remark ?? null,
    approvedAt: r.approved_at ?? null,
    proofCount: Array.isArray(r.proof_urls) ? r.proof_urls.length : 0,
    proofs: Array.isArray(r.proof_urls) ? r.proof_urls : [],
    createdAt: r.created_at,
    plotNumber: (r.plot_id && plotById.get(r.plot_id as string)?.plot_number) || null,
    plotBlock: (r.plot_id && plotById.get(r.plot_id as string)?.block) || null,
    customerName: (r.customer_id && custById.get(r.customer_id as string)) || null,
  }));

  return NextResponse.json(
    { items },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// POST /api/bm/payments — record a payment. ALWAYS enters `payment_submissions`
// as `pending` with the BM stamped as recorder. Nothing touches the `payments`
// ledger here: admin approval is what writes money, so a recording is invisible
// to every balance until an admin decides on it.
export async function POST(req: NextRequest) {
  const gate = await requireBranchManager(req);
  if (!gate.authorized) return gate.response;

  const sb = getPaymentsSupabase();
  if (!sb) {
    return NextResponse.json({ error: "Service not configured." }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const amount = Number(body?.amount);
  const plotId = String(body?.plotId ?? "");
  const date = String(body?.date ?? "");

  if (!plotId) return NextResponse.json({ error: "Plot is required." }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Enter a valid amount." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}/.test(date)) {
    return NextResponse.json({ error: "Valid date is required." }, { status: 400 });
  }
  if (date.slice(0, 10) > new Date().toISOString().slice(0, 10)) {
    return NextResponse.json({ error: "Date cannot be in the future." }, { status: 400 });
  }

  const proofUrls: string[] = Array.isArray(body?.proofUrls) ? body.proofUrls : [];
  if (proofUrls.length > 3) {
    return NextResponse.json({ error: "Maximum 3 proof images." }, { status: 400 });
  }
  if (proofUrls.some((u) => typeof u !== "string" || !u.startsWith("proofs/"))) {
    return NextResponse.json({ error: "Invalid proof reference." }, { status: 400 });
  }

  // The plot must exist and be in a recordable state.
  const { data: plot, error: plotErr } = await sb
    .from("plots")
    .select("id, status, customer_id, booking_id, sale_id")
    .eq("id", plotId)
    .single();
  if (plotErr || !plot) {
    return NextResponse.json({ error: "Plot not found." }, { status: 404 });
  }
  if (!RECORDABLE.includes(plot.status)) {
    return NextResponse.json({ error: "Payments can only be recorded for booked plots." }, { status: 400 });
  }

  const id = `pay-${Date.now().toString(36)}-${randomUUID().slice(0, 4)}`;
  const row = {
    id,
    plot_id: plotId,
    customer_id: plot.customer_id,
    booking_id: plot.booking_id,
    sale_id: plot.sale_id,
    date: new Date(date).toISOString(),
    amount,
    payment_mode: String(body?.paymentMode ?? "cash"),
    reference_number: body?.referenceNumber ? String(body.referenceNumber) : null,
    bank: body?.bank ? String(body.bank) : null,
    cheque_number: body?.chequeNumber ? String(body.chequeNumber) : null,
    transaction_id: body?.transactionId ? String(body.transactionId) : null,
    remarks: body?.remarks ? String(body.remarks) : null,
    status: "pending",
    recorded_by: gate.employee.id,
    recorded_by_name: gate.employee.name,
    proof_urls: proofUrls,
    created_at: new Date().toISOString(),
  };

  const { error } = await sb.from("payment_submissions").insert(row);
  if (error) {
    return NextResponse.json({ error: "Could not record payment." }, { status: 500 });
  }
  return NextResponse.json({ item: { id }, id }, { status: 201 });
}
