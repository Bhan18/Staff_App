"use client";

// Admin payment approval — the queue of payments branch managers recorded
// in the staff app. Every row entered as `pending`; approving writes
// `approved` to the shared `payments` table, which is the same table the
// admin-dashboard reads, so the ledger updates in both places at once.
//
// This screen is the ONLY place a payment amount is rendered. It is not
// shown to branch managers anywhere in their own app.

import { useEffect, useState, type ReactNode } from "react";
import {
  IndianRupee,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronLeft,
  Wallet,
  ImageIcon,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  useAdminPayments,
  useAdminPaymentDetail,
  useAdminPendingCount,
  useDecideAdminPayment,
  type AdminPayment,
  type AdminPaymentDetail,
  type AdminPaymentStatus,
} from "@/hooks/agent/use-agent-data";

const FILTERS: { id: AdminPaymentStatus; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

const STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  pending: { color: "var(--brand-warn)", bg: "color-mix(in srgb, var(--brand-warn) 14%, transparent)", label: "Pending" },
  approved: { color: "var(--brand-emerald)", bg: "color-mix(in srgb, var(--brand-emerald) 14%, transparent)", label: "Approved" },
  rejected: { color: "var(--brand-checkout)", bg: "color-mix(in srgb, var(--brand-checkout) 12%, transparent)", label: "Rejected" },
};

function StatusChip({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.pending!;
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ color: s.color, background: s.bg }}
    >
      {s.label}
    </span>
  );
}

const inputCls =
  "w-full rounded-xl border border-[color-mix(in_srgb,var(--brand-emerald)_15%,#e5e0d4)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--brand-emerald)]";

export function PaymentsTab() {
  const [filter, setFilter] = useState<AdminPaymentStatus>("pending");
  const q = useAdminPayments(true, filter);
  const countQ = useAdminPendingCount(true);
  const decide = useDecideAdminPayment();
  const [openId, setOpenId] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<AdminPayment | null>(null);
  const [remark, setRemark] = useState("");

  const items = q.data ?? [];
  const pendingCount = countQ.data ?? 0;
  const openItem = items.find((p) => p.id === openId) ?? null;

  useEffect(() => {
    if (!rejectFor) setRemark("");
  }, [rejectFor]);

  async function approve(p: AdminPayment) {
    try {
      await decide.mutateAsync({ id: p.id, decision: "approve" });
      toast.success("Payment approved", {
        description: "The ledger and the admin-dashboard are updated.",
      });
      setOpenId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not approve.");
    }
  }

  async function reject() {
    if (!rejectFor) return;
    if (!remark.trim()) {
      toast.error("Enter a reason so the branch manager knows why.");
      return;
    }
    try {
      await decide.mutateAsync({ id: rejectFor.id, decision: "reject", remark: remark.trim() });
      toast.success("Payment rejected");
      setRejectFor(null);
      setOpenId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reject.");
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Payment Approvals</h2>
          <p className="text-xs text-[var(--brand-ink)]/50">
            Recorded by branch managers, awaiting your decision
          </p>
        </div>
        <button
          onClick={() => void q.refetch()}
          className="agent-press flex h-9 w-9 items-center justify-center rounded-full"
          style={{
            background: "color-mix(in srgb, var(--brand-emerald) 10%, transparent)",
            color: "var(--brand-emerald)",
          }}
          aria-label="Refresh"
        >
          <Loader2 className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Segmented filter */}
      <div
        className="flex gap-1 rounded-full p-1"
        style={{ background: "color-mix(in srgb, var(--brand-ink) 6%, transparent)" }}
      >
        {FILTERS.map((f) => {
          const active = filter === f.id;
          const count = f.id === "pending" ? pendingCount : undefined;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="agent-press flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
              style={
                active
                  ? {
                      background: "var(--brand-paper)",
                      color: "var(--brand-emerald)",
                      boxShadow: "0 2px 8px -2px rgb(0 0 0 / 0.15)",
                    }
                  : { color: "color-mix(in srgb, var(--brand-ink) 55%, transparent)" }
              }
            >
              {f.label}
              {count != null && count > 0 && (
                <span
                  className="rounded-full px-1.5 text-[10px] font-semibold text-white"
                  style={{ background: "var(--brand-warn)" }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {q.isLoading ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[104px] animate-pulse rounded-2xl"
              style={{ background: "color-mix(in srgb, var(--brand-ink) 7%, transparent)" }}
            />
          ))}
        </div>
      ) : q.isError ? (
        <div
          className="rounded-2xl px-4 py-3 text-sm font-medium"
          style={{ background: "color-mix(in srgb, var(--brand-checkout) 10%, transparent)", color: "var(--brand-checkout)" }}
        >
          {q.error.message}
        </div>
      ) : items.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed px-4 py-14 text-center"
          style={{ borderColor: "color-mix(in srgb, var(--brand-emerald) 18%, transparent)" }}
        >
          <div
            className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ background: "color-mix(in srgb, var(--brand-emerald) 10%, transparent)" }}
          >
            <Wallet
              className="h-5 w-5"
              style={{ color: "var(--brand-emerald)" }}
            />
          </div>
          <div className="text-sm font-medium">Nothing {filter} right now</div>
          <div className="mt-0.5 text-xs text-[var(--brand-ink)]/45">
            {filter === "pending"
              ? "New recordings from branch managers will land here."
              : "No payments with this status yet."}
          </div>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((p) => (
            <button
              key={p.id}
              onClick={() => setOpenId(p.id)}
              className="agent-press group rounded-2xl p-3.5 text-left transition-shadow"
              style={{
                background: "color-mix(in srgb, var(--brand-paper) 70%, transparent)",
                border: "1px solid color-mix(in srgb, var(--brand-emerald) 12%, transparent)",
                boxShadow: "0 1px 2px rgb(0 0 0 / 0.04)",
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-xl font-semibold tabular-nums tracking-tight">
                  {inr(p.amount)}
                </span>
                <StatusChip status={p.status} />
              </div>

              <div className="mt-1.5 truncate text-sm font-medium">{p.customerName ?? "—"}</div>
              <div className="truncate text-[11px] text-[var(--brand-ink)]/50">
                {p.plotNumber ? `Plot ${p.plotNumber}` : "—"}
                {p.recordedByName ? ` · ${p.recordedByName}` : ""}
              </div>

              <div className="mt-2.5 flex items-center justify-between border-t pt-2.5 text-[11px] text-[var(--brand-ink)]/45"
                style={{ borderColor: "color-mix(in srgb, var(--brand-emerald) 10%, transparent)" }}
              >
                <span className="capitalize">{String(p.paymentMode ?? "—").replace("_", " ")}</span>
                <span className="flex items-center gap-2">
                  {p.proofCount > 0 && (
                    <span className="flex items-center gap-1">
                      <ImageIcon className="h-3 w-3" />
                      {p.proofCount}
                    </span>
                  )}
                  {fmtDate(p.date)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {openItem && (
        <DetailSheet
          item={openItem}
          busy={decide.isPending}
          onClose={() => setOpenId(null)}
          onApprove={() => void approve(openItem)}
          onReject={() => setRejectFor(openItem)}
        />
      )}

      {rejectFor && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center p-4 backdrop-blur-sm sm:items-center"
          style={{ background: "rgb(0 0 0 / 0.45)" }}
        >
          <div
            className="w-full max-w-md rounded-3xl p-5 shadow-2xl"
            style={{
              background: "var(--brand-paper)",
              border: "1px solid color-mix(in srgb, var(--brand-emerald) 14%, transparent)",
            }}
          >
            <div className="text-base font-semibold tracking-tight">Reject this payment?</div>
            <div className="mt-1 text-xs text-[var(--brand-ink)]/55">
              {rejectFor.customerName ?? "—"}
              {rejectFor.plotNumber ? ` · Plot ${rejectFor.plotNumber}` : ""} ·{" "}
              <span className="font-semibold tabular-nums">{inr(rejectFor.amount)}</span>
            </div>
            <textarea
              autoFocus
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={3}
              placeholder="Reason — the branch manager will see this"
              className={`${inputCls} mt-4 resize-none`}
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setRejectFor(null)}
                className="agent-press flex-1 rounded-full py-2.5 text-sm font-medium"
                style={{
                  background: "color-mix(in srgb, var(--brand-ink) 7%, transparent)",
                  color: "var(--brand-ink)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => void reject()}
                disabled={decide.isPending}
                className="agent-press flex-1 rounded-full py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "var(--brand-checkout)" }}
              >
                {decide.isPending ? "Rejecting..." : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function DetailSheet({
  item,
  busy,
  onClose,
  onApprove,
  onReject,
}: {
  item: AdminPayment;
  busy: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  // Payment + ledger + plot context, loaded on open.
  const d = useAdminPaymentDetail(item.id);
  const proofs = d.data?.payment.proofUrls ?? item.proofs;

  return (
    <div
      className="fixed inset-0 z-[65] flex flex-col"
      style={{ background: "var(--brand-paper)" }}
    >
      <header
        className="flex items-center gap-3 px-4 pb-3 pt-3 backdrop-blur-xl safe-pt"
        style={{
          background: "color-mix(in srgb, var(--brand-paper) 80%, transparent)",
          borderBottom: "1px solid color-mix(in srgb, var(--brand-emerald) 10%, transparent)",
        }}
      >
        <button
          onClick={onClose}
          className="agent-press flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: "color-mix(in srgb, var(--brand-ink) 6%, transparent)" }}
          aria-label="Close"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight">
          Payment details
        </div>
        {item.status !== "pending" && <StatusChip status={item.status} />}
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 py-4"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
      >
        {d.isLoading ? (
          <div className="space-y-3">
            <div
              className="h-28 animate-pulse rounded-3xl"
              style={{ background: "color-mix(in srgb, var(--brand-ink) 7%, transparent)" }}
            />
            <div
              className="h-20 animate-pulse rounded-2xl"
              style={{ background: "color-mix(in srgb, var(--brand-ink) 7%, transparent)" }}
            />
          </div>
        ) : d.isError ? (
          <div
            className="rounded-2xl px-4 py-3 text-sm font-medium"
            style={{ background: "color-mix(in srgb, var(--brand-checkout) 10%, transparent)", color: "var(--brand-checkout)" }}
          >
            {d.error.message}
          </div>
        ) : d.data ? (
          <DetailBody detail={d.data} />
        ) : null}

        {item.status === "rejected" && item.rejectionRemark && (
          <div
            className="mt-3 rounded-2xl p-3 text-xs leading-relaxed"
            style={{ background: "color-mix(in srgb, var(--brand-checkout) 10%, transparent)", color: "var(--brand-checkout)" }}
          >
            Rejected: {item.rejectionRemark}
          </div>
        )}

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--brand-ink)]/50">
            Proof photos ({proofs.length})
          </div>
          {proofs.length === 0 ? (
            <div className="text-xs text-[var(--brand-ink)]/40">No proofs attached.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {proofs.map((p) => (
                <ProofImage key={p} path={p} />
              ))}
            </div>
          )}
        </div>
      </div>

      {item.status === "pending" && (
        <div
          className="sticky bottom-0 flex gap-2 px-4 py-3 backdrop-blur-xl"
          style={{
            background: "color-mix(in srgb, var(--brand-paper) 85%, transparent)",
            borderTop: "1px solid color-mix(in srgb, var(--brand-emerald) 10%, transparent)",
            paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))",
          }}
        >
          <div className="mx-auto flex w-full max-w-2xl gap-2">
            <button
              onClick={onReject}
              disabled={busy}
              className="agent-press flex flex-1 items-center justify-center gap-1.5 rounded-full py-3 text-sm font-semibold disabled:opacity-60"
              style={{
                background: "color-mix(in srgb, var(--brand-checkout) 10%, transparent)",
                color: "var(--brand-checkout)",
              }}
            >
              <XCircle className="h-4 w-4" /> Reject
            </button>
            <button
              onClick={onApprove}
              disabled={busy}
              className="agent-press flex flex-[1.4] items-center justify-center gap-1.5 rounded-full py-3 text-sm font-semibold text-white disabled:opacity-60"
              style={{
                background:
                  "linear-gradient(135deg, var(--brand-emerald), var(--brand-emerald-soft))",
                boxShadow: "0 8px 20px -10px color-mix(in srgb, var(--brand-emerald) 80%, transparent)",
              }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {busy ? "Saving..." : "Approve payment"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailBody({ detail }: { detail: AdminPaymentDetail }) {
  const { payment, plot, project, customer, booking, ledger } = detail;

  return (
    <div className="space-y-3">
      {/* 1. The payment being judged — hero card. */}
      <div
        className="rounded-3xl p-4 text-white"
        style={{
          background:
            "linear-gradient(135deg, var(--brand-emerald) 0%, var(--brand-emerald-soft) 100%)",
          boxShadow: "0 12px 28px -14px color-mix(in srgb, var(--brand-emerald) 85%, transparent)",
        }}
      >
        <div className="text-[11px] font-medium uppercase tracking-wider text-white/70">
          {fmtDate(payment.date)} · {String(payment.paymentMode ?? "—").replace("_", " ")}
        </div>
        <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
          {inr(payment.amount)}
        </div>
        <div className="mt-0.5 text-xs text-white/75">
          {payment.recordedByName ? `Recorded by ${payment.recordedByName}` : "Recorded by branch manager"}
        </div>
        {(payment.referenceNumber || payment.chequeNumber || payment.transactionId) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {payment.referenceNumber && <MiniChip>Ref {payment.referenceNumber}</MiniChip>}
            {payment.chequeNumber && <MiniChip>Cheque {payment.chequeNumber}</MiniChip>}
            {payment.transactionId && <MiniChip>UTR {payment.transactionId}</MiniChip>}
          </div>
        )}
      </div>

      {payment.remarks && (
        <div
          className="rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed"
          style={{ background: "color-mix(in srgb, var(--brand-ink) 5%, transparent)" }}
        >
          <span className="text-[var(--brand-ink)]/45">Note: </span>
          {payment.remarks}
        </div>
      )}

      {/* 2. Where that payment sits against the plot. */}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Net payable" value={inr(ledger.netPrice)} />
        <Stat label="Paid" value={inr(ledger.paidToDate)} good />
        <Stat label="Outstanding" value={inr(ledger.outstanding)} alert={ledger.outstanding > 0} />
      </div>
      {ledger.discount > 0 && (
        <div className="-mt-1 text-center text-[10px] text-[var(--brand-ink)]/45">
          after {inr(ledger.discount)} discount
        </div>
      )}
      {payment.amount > ledger.outstanding && (
        <div
          className="flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-xs font-medium"
          style={{ background: "color-mix(in srgb, var(--brand-warn) 12%, transparent)", color: "var(--brand-warn)" }}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          More than the plot currently owes.
        </div>
      )}

      {/* 3. The plot, the customer, the booking — just the essentials. */}
      <div
        className="divide-y overflow-hidden rounded-2xl"
        style={{
          background: "color-mix(in srgb, var(--brand-ink) 4%, transparent)",
          border: "1px solid color-mix(in srgb, var(--brand-emerald) 10%, transparent)",
        }}
      >
        {plot && (
          <Row label="Plot">
            <span className="font-semibold">
              {plot.plotNumber}
              {plot.block ? ` · ${plot.block}` : ""}
            </span>
            <span className="text-[var(--brand-ink)]/50">
              {[
                plot.size != null ? `${plot.size} ${plot.sizeUnit ?? ""}`.trim() : null,
                plot.facing,
                plot.status,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </Row>
        )}
        {project && (
          <Row label="Project">
            <span>{project.name}</span>
            {project.location && <span className="text-[var(--brand-ink)]/50">{project.location}</span>}
          </Row>
        )}
        {customer && (
          <Row label="Customer">
            <span className="font-medium">{customer.name}</span>
            {customer.phone && <span className="text-[var(--brand-ink)]/50">{customer.phone}</span>}
          </Row>
        )}
        {booking?.referenceCode && <Row label="Booking" value={booking.referenceCode} />}
      </div>
    </div>
  );
}

function MiniChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white/90">
      {children}
    </span>
  );
}

function Row({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2.5">
      <span className="shrink-0 text-xs text-[var(--brand-ink)]/50">{label}</span>
      <span className="flex min-w-0 flex-col items-end gap-0.5 text-right">
        {value ?? children}
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  good,
  alert,
}: {
  label: string;
  value: string;
  good?: boolean;
  alert?: boolean;
}) {
  return (
    <div
      className="rounded-xl bg-black/[0.03] px-2 py-2.5"
    >
      <div className="text-[10px] text-[var(--brand-ink)]/50">{label}</div>
      <div
        className="mt-0.5 text-xs font-semibold tabular-nums"
        style={good ? { color: "var(--brand-emerald)" } : alert ? { color: "var(--brand-checkout)" } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function ProofImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/payments/proof-url?path=${encodeURIComponent(path)}`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((d) => {
        if (live && d?.url) setUrl(d.url);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [path]);

  if (!url) return <div className="h-24 w-24 animate-pulse rounded-xl bg-black/5" />;
  return (
    <>
      <button onClick={() => setOpen(true)} className="agent-press">
        <img src={url} alt="Proof of payment" className="h-24 w-24 rounded-xl border object-cover" />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setOpen(false)}
        >
          <img src={url} alt="Proof of payment" className="max-h-[85vh] max-w-[92vw] rounded-2xl object-contain" />
        </div>
      )}
    </>
  );
}

function inr(n: number): string {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
