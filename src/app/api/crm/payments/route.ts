import { NextRequest, NextResponse } from "next/server";
import { getCrmSupabase, getStaffFromCrmRequest } from "@/lib/crm/server";

export const dynamic = "force-dynamic";

function genPaymentId() {
  return `pay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// GET /api/crm/payments?mine=1&plotId=&customerId=&limit=20
//
// Reads `payment_submissions` — recordings awaiting (or having had) an admin
// decision. The `payments` ledger is deliberately NOT read here, so a pending
// recording can never be mistaken for received money.
export async function GET(req: NextRequest) {
  try {
    const staff = await getStaffFromCrmRequest(req as unknown as Request);
    if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sb = getCrmSupabase();
    const mine = req.nextUrl.searchParams.get("mine");
    const plotId = req.nextUrl.searchParams.get("plotId");
    const customerId = req.nextUrl.searchParams.get("customerId");
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10) || 20, 100);

    let query = sb.from("payment_submissions").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }).limit(limit);

    if (mine === "1" || mine === "true") {
      query = query.eq("recorded_by", staff.id);
    }
    if (plotId) query = query.eq("plot_id", plotId);
    if (customerId) query = query.eq("customer_id", customerId);

    const { data, error } = await query;
    if (error) throw error;

    // Enrich with plot + customer names for display
    const plotIds = [...new Set((data ?? []).map((p: any) => p.plot_id).filter(Boolean))];
    const custIds = [...new Set((data ?? []).map((p: any) => p.customer_id).filter(Boolean))];
    let plotMap: Record<string, any> = {};
    let custMap: Record<string, any> = {};
    if (plotIds.length) {
      const { data: plots } = await sb.from("plots").select("id, plot_number, block, project_id").in("id", plotIds);
      (plots ?? []).forEach((pl: any) => (plotMap[pl.id] = pl));
      const projIds = [...new Set((plots ?? []).map((pl: any) => pl.project_id).filter(Boolean))];
      if (projIds.length) {
        const { data: projs } = await sb.from("projects").select("id, name").in("id", projIds);
        const pm: Record<string, string> = {};
        (projs ?? []).forEach((pr: any) => (pm[pr.id] = pr.name));
        Object.values(plotMap).forEach((pl: any) => (pl.projectName = pm[pl.project_id] ?? null));
      }
    }
    if (custIds.length) {
      const { data: custs } = await sb.from("customers").select("id, name, phone").in("id", custIds);
      (custs ?? []).forEach((c: any) => (custMap[c.id] = c));
    }

    const enriched = (data ?? []).map((p: any) => ({
      id: p.id,
      plotId: p.plot_id,
      plotLabel: p.plot_id ? (plotMap[p.plot_id] ? `${plotMap[p.plot_id].projectName ?? ""} ${plotMap[p.plot_id].block}-${plotMap[p.plot_id].plot_number}`.trim() : p.plot_id) : null,
      customerId: p.customer_id,
      customerName: p.customer_id ? (custMap[p.customer_id]?.name ?? null) : null,
      customerPhone: p.customer_id ? (custMap[p.customer_id]?.phone ?? null) : null,
      amount: p.amount,
      paymentMode: p.payment_mode,
      date: p.date,
      referenceNumber: p.reference_number,
      bank: p.bank,
      chequeNumber: p.cheque_number,
      transactionId: p.transaction_id,
      remarks: p.remarks,
      status: p.status,
      recordedBy: p.recorded_by,
      recordedByName: p.recorded_by_name,
      proofUrls: p.proof_urls ?? [],
      createdAt: p.created_at,
    }));

    return NextResponse.json({ payments: enriched }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[crm/payments GET] error:", err);
    const msg = err instanceof Error ? err.message : "Failed to fetch payments";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/crm/payments  { plotId, customerId?, amount, paymentMode, date, referenceNumber?, bank?, chequeNumber?, transactionId?, remarks?, proofUrls? }
export async function POST(req: NextRequest) {
  try {
    const staff = await getStaffFromCrmRequest(req as unknown as Request);
    if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const plotId: string | undefined = body.plotId?.toString().trim();
    let customerId: string | undefined = body.customerId?.toString().trim() || undefined;
    const amount = Number(body.amount);
    const paymentMode = (body.paymentMode ?? body.payment_mode ?? "cash").toString().trim().toLowerCase();
    const date = body.date?.toString().trim() || new Date().toISOString().slice(0, 10);
    const referenceNumber = body.referenceNumber?.toString().trim() || body.reference_number?.toString().trim() || null;
    const bank = body.bank?.toString().trim() || null;
    const chequeNumber = body.chequeNumber?.toString().trim() || body.cheque_number?.toString().trim() || null;
    const transactionId = body.transactionId?.toString().trim() || body.transaction_id?.toString().trim() || null;
    const remarks = body.remarks?.toString().trim() || null;
    const proofUrls: string[] = Array.isArray(body.proofUrls) ? body.proofUrls.slice(0, 3) : Array.isArray(body.proof_urls) ? body.proof_urls.slice(0, 3) : [];

    if (!plotId && !customerId) return NextResponse.json({ error: "plotId or customerId is required" }, { status: 400 });
    if (!amount || amount <= 0) return NextResponse.json({ error: "amount must be > 0" }, { status: 400 });
    const allowedModes = ["cash", "cheque", "neft", "rtgs", "upi", "card", "bank_transfer"];
    if (!allowedModes.includes(paymentMode)) return NextResponse.json({ error: `paymentMode must be one of: ${allowedModes.join(", ")}` }, { status: 400 });

    const sb = getCrmSupabase();

    // Validate plot and resolve customer/booking/sale if not provided
    let plot: any = null;
    let bookingId: string | null = null;
    let saleId: string | null = null;
    if (plotId) {
      const { data: pData, error: pErr } = await sb.from("plots").select("id, customer_id, booking_id, sale_id, status, total_price").eq("id", plotId).single();
      if (pErr || !pData) return NextResponse.json({ error: "Plot not found" }, { status: 404 });
      plot = pData;
      if (!customerId) customerId = pData.customer_id ?? undefined;
      bookingId = pData.booking_id ?? null;
      saleId = pData.sale_id ?? null;
      // If plot is available with no customer, we allow payment but customerId must be supplied
      if (plot.status === "available" && !customerId) {
        return NextResponse.json({ error: "This plot is not booked. Please select a customer or book the plot first." }, { status: 400 });
      }
      if (!customerId) return NextResponse.json({ error: "Customer not linked to this plot. Please provide customerId." }, { status: 400 });
    }

    // Validate customer exists if provided
    if (customerId) {
      const { data: cData, error: cErr } = await sb.from("customers").select("id").eq("id", customerId).single();
      if (cErr || !cData) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    // If bookingId/saleId not from plot, try to find active booking/sale for this plot+customer
    if (!bookingId && plotId && customerId) {
      const { data: bData } = await sb.from("bookings").select("id").eq("plot_id", plotId).eq("customer_id", customerId).eq("status", "active").maybeSingle();
      if (bData) bookingId = bData.id;
    }
    if (!saleId && plotId && customerId) {
      const { data: sData } = await sb.from("sales").select("id").eq("plot_id", plotId).eq("customer_id", customerId).maybeSingle();
      if (sData) saleId = sData.id;
    }

    const id = genPaymentId();
    const insertRow: Record<string, any> = {
      id,
      plot_id: plotId ?? null,
      customer_id: customerId ?? null,
      booking_id: bookingId,
      sale_id: saleId,
      date,
      amount,
      payment_mode: paymentMode,
      reference_number: referenceNumber,
      bank,
      cheque_number: chequeNumber,
      transaction_id: transactionId,
      remarks,
      status: "pending",
      recorded_by: staff.id,
      recorded_by_name: staff.name,
      proof_urls: proofUrls,
    };

    const { error: insErr } = await sb.from("payment_submissions").insert(insertRow);
    if (insErr) throw insErr;

    // Log activity
    try {
      await sb.from("activity_logs").insert({
        id: `al-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        user_id: staff.id,
        user_name: staff.name,
        action: "CREATE_PAYMENT",
        entity: "payment",
        entity_id: id,
        details: `BM ${staff.name} recorded ₹${amount} for plot ${plotId ?? customerId} (pending approval)`,
      });
    } catch { /* ignore activity log failure */ }

    return NextResponse.json({ ok: true, id, status: "pending", amount, plotId, customerId });
  } catch (err) {
    console.error("[crm/payments POST] error:", err);
    const msg = err instanceof Error ? err.message : "Failed to create payment";
    const status = (err as any)?.status ?? 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
