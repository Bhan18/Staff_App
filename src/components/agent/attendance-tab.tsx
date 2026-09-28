"use client";

// Attendance view — today's status card (check-in / check-out) + history
// as a clean grouped timeline. Check-in/out go through the app's camera
// flow (owned by the page) so every action is photo-verified.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAgentAuth } from "@/hooks/agent/use-agent-auth";
import { useAttendanceLog } from "@/hooks/agent/use-agent-data";
import { useOnline } from "@/hooks/use-online";
import {
  SkeletonList,
  EmptyState,
  ErrorState,
  StatusPill,
} from "@/components/agent/ui-primitives";
import {
  formatTime,
  formatDate,
  todayKey,
  workedDurationHours,
  formatDuration,
} from "@/lib/agent-format";
import {
  Camera,
  LogOut,
  MapPin,
  Clock,
  CheckCircle2,
  Calendar,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  Plus,
  Loader2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AgentTodayRecord, AttendanceLogEntry } from "@/lib/agent/types";

interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  admin_remark: string | null;
  created_at: string;
}

const LEAVE_TYPES = [
  { value: "CASUAL", label: "Casual Leave" },
  { value: "SICK", label: "Sick Leave" },
  { value: "EARNED", label: "Earned Leave" },
  { value: "UNPAID", label: "Unpaid Leave" },
] as const;

const LEAVE_STATUS_META: Record<string, { color: string; bg: string }> = {
  PENDING: { color: "var(--brand-golden)", bg: "color-mix(in srgb, var(--brand-golden) 8%, white)" },
  APPROVED: { color: "var(--brand-emerald)", bg: "color-mix(in srgb, var(--brand-emerald) 8%, white)" },
  REJECTED: { color: "var(--brand-checkout)", bg: "color-mix(in srgb, var(--brand-checkout) 8%, white)" },
  CANCELLED: { color: "#888", bg: "#f5f5f5" },
};

function daysBetween(start: string, end: string): number {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
}

interface AttendanceTabProps {
  onCheckIn: () => void;
  onCheckOut: () => void;
  busy?: boolean;
}

export function AttendanceTab({ onCheckIn, onCheckOut, busy }: AttendanceTabProps) {
  const { session } = useAgentAuth();
  const history = useAttendanceLog(14);
  const online = useOnline();

  const today = session?.today ?? null;
  const checkedIn = !!today?.checkInTime;
  const checkedOut = !!today?.checkOutTime;

  const [subTab, setSubTab] = useState<"attendance" | "leaves">("attendance");

  return (
    <div className="fade-in space-y-4 px-4 pb-6 pt-4">
      {/* Sub-tab toggle */}
      <div className="flex gap-1.5 rounded-xl border p-1" style={{ borderColor: "color-mix(in srgb, var(--brand-emerald) 12%, #e5e0d4)", background: "color-mix(in srgb, var(--brand-emerald) 3%, white)" }}>
        <button
          onClick={() => setSubTab("attendance")}
          className={cn("agent-press flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors", subTab === "attendance" ? "bg-white shadow-sm" : "")}
          style={subTab === "attendance" ? { color: "var(--brand-emerald)" } : { color: "var(--brand-ink)/50" }}
        >
          <Clock className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
          Attendance
        </button>
        <button
          onClick={() => setSubTab("leaves")}
          className={cn("agent-press flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors", subTab === "leaves" ? "bg-white shadow-sm" : "")}
          style={subTab === "leaves" ? { color: "var(--brand-emerald)" } : { color: "var(--brand-ink)/50" }}
        >
          <CalendarOff className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
          Leaves
        </button>
      </div>

      {subTab === "attendance" ? (
        <>
          {/* Today's status card */}
          <section>
            <TodayCard
              today={today}
              checkedIn={checkedIn}
              checkedOut={checkedOut}
              onCheckIn={onCheckIn}
              onCheckOut={onCheckOut}
              busy={busy}
              online={online}
            />
          </section>

          {/* Monthly summary */}
          <section>
            <MonthlyStats records={(history.data ?? []) as AttendanceLogEntry[]} />
          </section>

          {/* History timeline */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-[15px] font-semibold tracking-tight">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                History
              </h2>
              {history.data != null && history.data.length > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  {history.data.length} records
                </span>
              )}
            </div>
            {history.isLoading ? (
              <SkeletonList count={6} height={70} />
            ) : history.isError ? (
              <ErrorState onRetry={() => history.refetch()} />
            ) : !history.data || history.data.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="No attendance yet"
                description="Your check-ins will appear here once you start marking attendance."
              />
            ) : (
              <HistoryTimeline records={history.data as AttendanceLogEntry[]} />
            )}
          </section>
        </>
      ) : (
        <LeavesSection />
      )}
    </div>
  );
}

// ─── Leaves sub-section ──────────────────────────────────────────────────────

function LeavesSection() {
  const [items, setItems] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [leaveType, setLeaveType] = useState("CASUAL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaves = useCallback(async () => {
    try {
      const res = await fetch("/api/attendance/staff/leave");
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLeaves(); }, [fetchLeaves]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (!startDate || !endDate) { setError("Select dates."); return; }
    if (endDate < startDate) { setError("End date must be on or after start date."); return; }
    if (!reason.trim()) { setError("Enter a reason."); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/attendance/staff/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaveType, startDate, endDate, reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Could not submit request.");
        return;
      }
      setItems((prev) => [data.item, ...prev]);
      setShowForm(false);
      setStartDate("");
      setEndDate("");
      setReason("");
      setLeaveType("CASUAL");
    } catch {
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-[15px] font-semibold tracking-tight">
          <CalendarOff className="h-4 w-4 text-muted-foreground" />
          Leave Requests
        </h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="agent-press flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-white"
          style={{ background: "var(--brand-emerald)" }}
        >
          {showForm ? "Cancel" : <><Plus className="h-3.5 w-3.5" /> Apply</>}
        </button>
      </div>

      {showForm && (
        <form onSubmit={onSubmit} className="space-y-3 rounded-xl border p-3" style={{ borderColor: "color-mix(in srgb, var(--brand-emerald) 15%, #e5e0d4)", background: "color-mix(in srgb, var(--brand-emerald) 3%, white)" }}>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[var(--brand-ink)]/70">Leave Type</label>
            <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className="rounded-xl border border-[color-mix(in_srgb,var(--brand-emerald)_15%,#e5e0d4)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--brand-emerald)]">
              {LEAVE_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[var(--brand-ink)]/70">Start Date</label>
              <input type="date" value={startDate} min={today} onChange={(e) => setStartDate(e.target.value)} className="rounded-xl border border-[color-mix(in_srgb,var(--brand-emerald)_15%,#e5e0d4)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--brand-emerald)]" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[var(--brand-ink)]/70">End Date</label>
              <input type="date" value={endDate} min={startDate || today} onChange={(e) => setEndDate(e.target.value)} className="rounded-xl border border-[color-mix(in_srgb,var(--brand-emerald)_15%,#e5e0d4)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--brand-emerald)]" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[var(--brand-ink)]/70">Reason</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="rounded-xl border border-[color-mix(in_srgb,var(--brand-emerald)_15%,#e5e0d4)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--brand-emerald)] resize-none" placeholder="Why do you need leave?" />
          </div>
          {error && (
            <div className="rounded-lg px-3 py-2 text-xs font-medium" style={{ background: "color-mix(in srgb, var(--brand-checkout) 8%, white)", color: "var(--brand-checkout)" }}>{error}</div>
          )}
          <button type="submit" disabled={submitting} className="agent-press flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--brand-emerald)" }}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>Submit Request</span>}
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-xs text-[var(--brand-ink)]/40">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-10 text-center text-xs text-[var(--brand-ink)]/40" style={{ borderColor: "color-mix(in srgb, var(--brand-emerald) 12%, #e5e0d4)" }}>
          <CalendarOff className="mx-auto mb-2 h-8 w-8 opacity-30" />
          No leave requests yet.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const meta = LEAVE_STATUS_META[item.status] ?? LEAVE_STATUS_META.CANCELLED;
            const days = daysBetween(item.start_date, item.end_date);
            return (
              <div key={item.id} className="rounded-xl border p-3" style={{ borderColor: "color-mix(in srgb, var(--brand-emerald) 10%, #e5e0d4)" }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">{LEAVE_TYPES.find((t) => t.value === item.leave_type)?.label ?? item.leave_type}</span>
                  <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: meta.color, background: meta.bg }}>{item.status}</span>
                </div>
                <div className="mt-1 text-[11px] text-[var(--brand-ink)]/55">
                  {item.start_date} → {item.end_date} · {days} {days === 1 ? "day" : "days"}
                </div>
                <div className="mt-0.5 text-xs text-[var(--brand-ink)]/70">{item.reason}</div>
                {item.admin_remark && (
                  <div className="mt-1 rounded-lg px-2 py-1 text-[11px] text-[var(--brand-ink)]/50" style={{ background: "color-mix(in srgb, var(--brand-golden) 6%, white)" }}>
                    Admin: {item.admin_remark}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Today card ─────────────────────────────────────────────────────────────

function TodayCard({
  today,
  checkedIn,
  checkedOut,
  onCheckIn,
  onCheckOut,
  busy,
  online,
}: {
  today: AgentTodayRecord | null;
  checkedIn: boolean;
  checkedOut: boolean;
  onCheckIn: () => void;
  onCheckOut: () => void;
  busy?: boolean;
  online: boolean;
}) {
  const worked = workedDurationHours(today?.checkInTime, today?.checkOutTime);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
      <div
        className={cn("p-5", !checkedIn && "text-white")}
        style={
          !checkedIn
            ? {
                background:
                  "linear-gradient(135deg, var(--brand-emerald) 0%, var(--brand-emerald-soft) 100%)",
              }
            : undefined
        }
      >
        <div className="flex items-start justify-between">
          <div>
            <div
              className={cn(
                "text-[11px] font-medium uppercase tracking-wider",
                !checkedIn ? "text-white/60" : "text-muted-foreground",
              )}
            >
              {formatDate(todayKey())}
            </div>
            {!checkedIn ? (
              <>
                <div className="mt-1.5 text-2xl font-semibold">Ready to check in</div>
                <div className="mt-1 text-xs text-white/70">
                  Take a live selfie to begin your day.
                </div>
              </>
            ) : (
              <div className="mt-1.5 flex items-baseline gap-2.5">
                <span className="tnum text-2xl font-semibold">
                  {formatTime(today?.checkInTime)}
                </span>
                <StatusPill status={today?.status ?? "present"} />
              </div>
            )}
          </div>
          <div
            className={cn(
              "grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl",
              !checkedIn ? "bg-white/10 backdrop-blur" : "bg-primary/10",
            )}
          >
            <Clock className={cn("h-5 w-5", !checkedIn && "text-white")} />
          </div>
        </div>

        {checkedIn && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MiniStat label="Check-in" value={formatTime(today?.checkInTime)} />
            <MiniStat
              label="Check-out"
              value={checkedOut ? formatTime(today?.checkOutTime) : "—"}
            />
          </div>
        )}

        {checkedIn && today?.checkInPhoto && (
          <div className="mt-3 flex items-center gap-2">
            <StaffPhotoThumb path={today.checkInPhoto} label="In" />
            {today?.checkOutPhoto && (
              <StaffPhotoThumb path={today.checkOutPhoto} label="Out" />
            )}
          </div>
        )}
      </div>

      {today?.checkInDistance != null && checkedIn && (
        <div className="flex items-center gap-1.5 border-t border-border/60 bg-muted/30 px-5 py-2.5 text-[11px] text-muted-foreground">
          <MapPin className="h-3 w-3" />
          {today.checkInDistance <= 5
            ? "At office"
            : `~${Math.round(today.checkInDistance)} m from office`}
          {today.checkInLatitude != null && today.checkInLongitude != null && (
            <span className="opacity-60">
              · {today.checkInLatitude.toFixed(3)}, {today.checkInLongitude.toFixed(3)}
            </span>
          )}
        </div>
      )}

      <div className="p-4">
        {!checkedIn ? (
          <Button
            onClick={onCheckIn}
            disabled={busy || !online}
            size="lg"
            className="h-12 w-full rounded-xl text-[15px] font-medium"
          >
            <Camera className="h-4 w-4" />
            {busy ? "Checking in…" : "Check in with selfie"}
          </Button>
        ) : !checkedOut ? (
          <Button
            onClick={onCheckOut}
            disabled={busy || !online}
            size="lg"
            variant="destructive"
            className="h-12 w-full rounded-xl text-[15px] font-medium"
          >
            <LogOut className="h-4 w-4" />
            {busy ? "Checking out…" : "Check out"}
          </Button>
        ) : (
          <div className="flex items-center justify-center gap-2 py-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Day complete
            {worked != null && (
              <span className="font-normal text-muted-foreground">
                · {formatDuration(Math.round(worked * 60))}
              </span>
            )}
          </div>
        )}
        {!online && (
          <p className="mt-2 text-center text-[11px] text-amber-600 dark:text-amber-400">
            You&apos;re offline — reconnect to mark attendance.
          </p>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background/50 px-3 py-2 dark:bg-white/5">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="tnum mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}

// ─── Staff photo thumbnail ───────────────────────────────────────────────────

function StaffPhotoThumb({ path, label }: { path: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/attendance/photo-url?path=${encodeURIComponent(path)}`)
      .then((r) => r.json())
      .then((d) => {
        if (active && d.url) setSrc(d.url);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [path]);

  if (!src) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-lg border border-border/60"
        title={`${label} photo`}
      >
        <img src={src} alt={`${label} photo`} className="h-full w-full object-cover" />
        <span className="absolute bottom-0 right-0 rounded-tl bg-black/60 px-1 py-px text-[8px] font-semibold text-white">
          {label}
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpen(false)}
        >
          <img
            src={src}
            alt={`${label} photo`}
            className="max-h-[85vh] max-w-[90vw] rounded-2xl object-contain shadow-xl"
          />
        </div>
      )}
    </>
  );
}

// ─── Monthly stats row ──────────────────────────────────────────────────────

function MonthlyStats({ records }: { records: AttendanceLogEntry[] }) {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null); // null = current month

  // Build list of available months from records (YYYY-MM keys, newest first)
  const availableMonths = useMemo(() => {
    const map = new Map<string, string>(); // key → label
    for (const r of records) {
      const raw = r.attendanceDate.slice(0, 7); // YYYY-MM
      if (map.has(raw)) continue;
      const d = new Date(`${raw}-15T00:00:00`);
      map.set(raw, d.toLocaleDateString(undefined, { month: "long", year: "numeric" }));
    }
    return Array.from(map.entries());
  }, [records]);

  // Active month key
  const activeKey = selectedMonth ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const filtered = useMemo(() => {
    if (selectedMonth === null) {
      // Current month
      return records.filter((r) => {
        const d = new Date(`${r.attendanceDate}T00:00:00`);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
    }
    if (selectedMonth === "ALL") return records;
    return records.filter((r) => r.attendanceDate.slice(0, 7) === selectedMonth);
  }, [records, selectedMonth, now]);

  const present = filtered.filter((r) => r.status === "PRESENT").length;
  const halfDay = filtered.filter((r) => r.status === "HALF_DAY").length;
  const late = filtered.filter((r) => r.status === "LATE").length;
  const absent = filtered.filter((r) => r.status === "ABSENT").length;

  const stats = [
    { label: "Present", value: present, color: "text-emerald-600 dark:text-emerald-400" },
    { label: "Half Day", value: halfDay, color: "text-sky-600 dark:text-sky-400" },
    { label: "Late", value: late, color: "text-amber-600 dark:text-amber-400" },
    { label: "Absent", value: absent, color: "text-rose-600 dark:text-rose-400" },
  ];

  const activeLabel =
    selectedMonth === null
      ? "This Month"
      : selectedMonth === "ALL"
        ? "All Time"
        : availableMonths.find(([k]) => k === activeKey)?.[1] ?? activeKey;

  const navPrev = () => {
    const idx = availableMonths.findIndex(([k]) => k === activeKey);
    if (selectedMonth === null) {
      // Go to latest available month (or stay if already there)
      if (availableMonths.length > 0) setSelectedMonth(availableMonths[0][0]);
    } else if (idx < availableMonths.length - 1) {
      setSelectedMonth(availableMonths[idx + 1][0]);
    }
  };
  const navNext = () => {
    const idx = availableMonths.findIndex(([k]) => k === activeKey);
    if (selectedMonth === "ALL") return;
    if (selectedMonth === null) return;
    if (idx > 0) {
      setSelectedMonth(availableMonths[idx - 1][0]);
    } else {
      setSelectedMonth(null); // back to current month
    }
  };

  return (
    <div className="space-y-3">
      {/* Month selector */}
      <div className="flex items-center justify-between">
        <button
          onClick={navPrev}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
          disabled={
            selectedMonth === "ALL" ||
            (selectedMonth !== null &&
              availableMonths.findIndex(([k]) => k === activeKey) >=
                availableMonths.length - 1)
          }
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold">{activeLabel}</span>
          <select
            value={selectedMonth ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setSelectedMonth(v === "" ? null : v);
            }}
            className="rounded-lg border border-border/60 bg-card px-2 py-1 text-[12px] text-foreground"
          >
            <option value="">This Month</option>
            {availableMonths.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
            <option value="ALL">All Time</option>
          </select>
        </div>
        <button
          onClick={navNext}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
          disabled={selectedMonth === null || selectedMonth === "ALL" || availableMonths.findIndex(([k]) => k === activeKey) <= 0}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-2">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-border/60 bg-card px-2 py-3 text-center shadow-sm"
          >
            <div className={cn("tnum text-xl font-semibold", s.color)}>{s.value}</div>
            <div className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── History timeline (grouped by week) ─────────────────────────────────────

const DOT_COLOR: Record<AttendanceLogEntry["status"], string> = {
  PRESENT: "bg-emerald-500",
  LATE: "bg-amber-500",
  HALF_DAY: "bg-sky-500",
  ABSENT: "bg-rose-500",
  ON_LEAVE: "bg-sky-500",
  CANCELLED: "bg-neutral-400",
};

function HistoryTimeline({ records }: { records: AttendanceLogEntry[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, AttendanceLogEntry[]>();
    for (const r of records) {
      const d = new Date(`${r.attendanceDate}T00:00:00`);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const key = weekStart.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      });
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries());
  }, [records]);

  return (
    <div className="space-y-5">
      {groups.map(([weekLabel, items]) => (
        <div key={weekLabel}>
          <div className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Week of {weekLabel}
          </div>
          <div className="relative pl-5">
            <div className="absolute bottom-1 left-[7px] top-1 w-px bg-border" />
            <div className="space-y-2.5">
              {items.map((r) => {
                const d = new Date(`${r.attendanceDate}T00:00:00`);
                const dayLabel = d.toLocaleDateString(undefined, { weekday: "short" });
                const dateLabel = d.toLocaleDateString(undefined, {
                  day: "2-digit",
                  month: "short",
                });
                return (
                  <div key={r.id} className="relative">
                    <span
                      className={cn(
                        "absolute -left-[14px] top-3 h-3 w-3 rounded-full border-2 border-background",
                        DOT_COLOR[r.status] ?? "bg-neutral-400",
                      )}
                    />
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-3.5 py-2.5 shadow-sm">
                      <div className="flex items-center gap-2.5">
                        <div className="flex gap-1">
                          {r.checkInPhoto ? (
                            <StaffPhotoThumb path={r.checkInPhoto} label="In" />
                          ) : null}
                          {r.checkOutPhoto ? (
                            <StaffPhotoThumb path={r.checkOutPhoto} label="Out" />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{dayLabel}</span>
                            <span className="text-[11px] text-muted-foreground">{dateLabel}</span>
                            <StatusPill status={r.status} />
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                            {r.checkInTime ? (
                              <span className="tnum">In {formatTime(r.checkInTime)}</span>
                            ) : (
                              <span>—</span>
                            )}
                            {r.checkOutTime && (
                              <span className="tnum">Out {formatTime(r.checkOutTime)}</span>
                            )}
                            {r.workingMinutes != null && r.workingMinutes > 0 && (
                              <span className="text-muted-foreground/70">
                                {formatDuration(r.workingMinutes)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
