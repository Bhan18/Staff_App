import { NextRequest, NextResponse } from "next/server";
import { getCrmSupabase, getStaffFromCrmRequest } from "@/lib/crm/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const staff = await getStaffFromCrmRequest(req as unknown as Request);
    if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const plotId = req.nextUrl.searchParams.get("plotId")?.trim();
    const customerId = req.nextUrl.searchParams.get("customerId")?.trim();
    if (!plotId && !customerId) return NextResponse.json({ error: "plotId or customerId is required" }, { status: 400 });

    const sb = getCrmSupabase();

    let plot: any = null;
    let project: any = null;
    let customer: any = null;
    let booking: any = null;
    let sale: any = null;

    if (plotId) {
      const { data: pData, error: pErr } = await sb.from("plots").select("*").eq("id", plotId).single();
      if (pErr) return NextResponse.json({ error: pErr.message }, { status: 404 });
      plot = pData;
      if (plot?.project_id) {
        const { data: pr } = await sb.from("projects").select("id, name, location").eq("id", plot.project_id).single();
        project = pr ?? null;
      }
      if (plot?.customer_id) {
        const { data: c } = await sb.from("customers").select("*").eq("id", plot.customer_id).single();
        customer = c ?? null;
      }
      if (plot?.booking_id) {
        const { data: b } = await sb.from("bookings").select("*").eq("id", plot.booking_id).single();
        booking = b ?? null;
      }
      if (plot?.sale_id) {
        const { data: s } = await sb.from("sales").select("*").eq("id", plot.sale_id).single();
        sale = s ?? null;
      }
    } else if (customerId) {
      const { data: c, error: cErr } = await sb.from("customers").select("*").eq("id", customerId).single();
      if (cErr) return NextResponse.json({ error: cErr.message }, { status: 404 });
      customer = c;
      // fetch plots for this customer
      const { data: cPlots } = await sb.from("plots").select("*").eq("customer_id", customerId).limit(10);
      // pick first booked/sold plot as primary
      plot = (cPlots ?? []).find((p: any) => p.status !== "available") ?? (cPlots?.[0] ?? null);
      if (plot?.project_id) {
        const { data: pr } = await sb.from("projects").select("id, name, location").eq("id", plot.project_id).single();
        project = pr ?? null;
      }
      if (plot?.booking_id) {
        const { data: b } = await sb.from("bookings").select("*").eq("id", plot.booking_id).single();
        booking = b ?? null;
      }
      if (plot?.sale_id) {
        const { data: s } = await sb.from("sales").select("*").eq("id", plot.sale_id).single();
        sale = s ?? null;
      }
      // attach all customer plots for picker
    }

    // Payment summary for this plot/customer.
    //
    // `payments` is the ledger and now only ever holds approved money, so the
    // pending/rejected figures come from `payment_submissions` instead.
    let payments: any[] = [];
    let submissions: any[] = [];
    if (plot?.id || customer?.id) {
      const scope = (q: any) => {
        let scoped = q.select("id, amount, status, date, payment_mode, created_at").order("date", { ascending: false }).limit(50);
        if (plot?.id && customer?.id) scoped = scoped.or(`plot_id.eq.${plot.id},customer_id.eq.${customer.id}`);
        else if (plot?.id) scoped = scoped.eq("plot_id", plot.id);
        else if (customer?.id) scoped = scoped.eq("customer_id", customer.id);
        return scoped;
      };

      const [ledgerRes, subRes] = await Promise.all([
        scope(sb.from("payments")),
        scope(sb.from("payment_submissions")),
      ]);
      payments = ledgerRes.data ?? [];
      submissions = subRes.data ?? [];
    }

    const totalApproved = payments.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
    const totalPending = submissions
      .filter((p: any) => p.status === "pending")
      .reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
    const totalRejected = submissions
      .filter((p: any) => p.status === "rejected")
      .reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);

    // Also fetch all plots for this customer for selector
    let customerPlots: any[] = [];
    if (customer?.id) {
      const { data: cp } = await sb.from("plots").select("id, plot_number, block, status, project_id, total_price").eq("customer_id", customer.id);
      customerPlots = (cp ?? []).map((p: any) => ({
        id: p.id,
        plotNumber: p.plot_number,
        block: p.block,
        status: p.status,
        projectId: p.project_id,
        totalPrice: p.total_price,
      }));
      // enrich with project names
      const projIds = [...new Set(customerPlots.map((p: any) => p.projectId))];
      if (projIds.length) {
        const { data: prs } = await sb.from("projects").select("id, name").in("id", projIds);
        const pm: Record<string, string> = {};
        (prs ?? []).forEach((pr: any) => (pm[pr.id] = pr.name));
        customerPlots = customerPlots.map((p: any) => ({ ...p, projectName: pm[p.projectId] ?? null }));
      }
    }

    return NextResponse.json({
      plot: plot ? {
        id: plot.id,
        plotNumber: plot.plot_number,
        block: plot.block,
        status: plot.status,
        size: plot.size,
        sizeUnit: plot.size_unit,
        totalPrice: plot.total_price,
        pricePerCent: plot.price_per_cent,
        projectId: plot.project_id,
        customerId: plot.customer_id,
        bookingId: plot.booking_id,
        saleId: plot.sale_id,
      } : null,
      project: project ? { id: project.id, name: project.name, location: project.location } : null,
      customer: customer ? { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email, address: customer.address, city: customer.city } : null,
      booking: booking ? { id: booking.id, bookingDate: booking.booking_date, advancePaid: booking.advance_paid, status: booking.status } : null,
      sale: sale ? { id: sale.id, saleDate: sale.sale_date, saleAmount: sale.sale_amount, balanceAmount: sale.balance_amount } : null,
      customerPlots,
      payments,
      summary: { totalApproved, totalPending, totalRejected, count: payments.length },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[crm/context] error:", err);
    const msg = err instanceof Error ? err.message : "Failed to load context";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
