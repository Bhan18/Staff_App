"use client";

// Admin overview — today's headcount by status + who is checked in now.

import {
  Users,
  UserCheck,
  Clock3,
  UserX,
  Coffee,
  Plane,
  RefreshCw,
  Radio,
} from "lucide-react";
import { useAdminFetch } from "@/hooks/admin/use-admin-data";
import {
  SkeletonList,
  EmptyState,
  ErrorState,
} from "@/components/agent/ui-primitives";

type OverviewData = {
  overview: {
    totalStaff: number;
    present: number;
    late: number;
    absent: number;
    halfDay: number;
    onLeave: number;
    byDepartment: {
      department: string;
      total: number;
      present: number;
      late: number;
      absent: number;
    }[];
  };
  checkedInNow: {
    employeeId: string;
    employeeCode: string;
    name: string;
    department: string;
    phone: string;
    checkInTime: string | null;
    checkInPhoto: string | null;
  }[];
};

export function OverviewTab() {
  const { data, loading, error, reload } = useAdminFetch<OverviewData>(
    "/api/attendance/admin/overview",
  );

  if (loading && !data) return <SkeletonList count={6} height={72} />;
  if (error && !data) {
    return <ErrorState title="Couldn't load overview" description={error} onRetry={reload} />;
  }
  if (!data) return <EmptyState icon={Users} title="No data" />;

  const o = data.overview;

  const stats = [
    { label: "Total staff", value: o.totalStaff, icon: Users, tint: "var(--brand-emerald)" },
    { label: "Present", value: o.present, icon: UserCheck, tint: "var(--brand-checkin)" },
    { label: "Late", value: o.late, icon: Clock3, tint: "var(--brand-warn)" },
    { label: "Half-day", value: o.halfDay, icon: Coffee, tint: "#a16207" },
    { label: "On leave", value: o.onLeave, icon: Plane, tint: "var(--brand-gold)" },
    { label: "Absent", value: o.absent, icon: UserX, tint: "var(--brand-checkout)" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Today</h2>
        <button
          onClick={reload}
          className="agent-press flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium"
          style={{
            background: "color-mix(in srgb, var(--brand-emerald) 10%, white)",
            color: "var(--brand-emerald)",
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="agent-card p-4">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{
                  background: `color-mix(in srgb, ${s.tint} 12%, white)`,
                  color: s.tint,
                }}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="mt-3 text-2xl font-semibold tabular-nums">{s.value}</div>
              <div className="text-[11px] text-[var(--brand-ink)]/55">{s.label}</div>
            </div>
          );
        })}
      </div>

      {o.byDepartment.length > 0 && (
        <div className="agent-card overflow-hidden">
          <div className="border-b px-4 py-3 text-xs font-semibold" style={{ borderColor: "color-mix(in srgb, var(--brand-emerald) 10%, transparent)" }}>
            By department
          </div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-[var(--brand-ink)]/50">
                <th className="px-4 py-2 font-medium">Department</th>
                <th className="px-2 py-2 text-center font-medium">Total</th>
                <th className="px-2 py-2 text-center font-medium" style={{ color: "var(--brand-checkin)" }}>Present</th>
                <th className="px-2 py-2 text-center font-medium" style={{ color: "var(--brand-warn)" }}>Late</th>
                <th className="px-4 py-2 text-center font-medium" style={{ color: "var(--brand-checkout)" }}>Absent</th>
              </tr>
            </thead>
            <tbody>
              {o.byDepartment.map((d) => (
                <tr key={d.department} className="border-t" style={{ borderColor: "color-mix(in srgb, var(--brand-emerald) 8%, transparent)" }}>
                  <td className="px-4 py-2.5 font-medium">{d.department}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums">{d.total}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums">{d.present}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums">{d.late}</td>
                  <td className="px-4 py-2.5 text-center tabular-nums">{d.absent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="agent-card overflow-hidden">
        <div className="flex items-center gap-2 border-b px-4 py-3 text-xs font-semibold" style={{ borderColor: "color-mix(in srgb, var(--brand-emerald) 10%, transparent)" }}>
          <Radio className="h-3.5 w-3.5" style={{ color: "var(--brand-emerald)" }} />
          Checked in now
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{
              background: "color-mix(in srgb, var(--brand-checkin) 12%, white)",
              color: "var(--brand-checkin)",
            }}
          >
            {data.checkedInNow.length} on duty
          </span>
        </div>
        {data.checkedInNow.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-[var(--brand-ink)]/50">
            Nobody has checked in yet today.
          </div>
        ) : (
          <ul
            className="divide-y"
            style={{ borderColor: "color-mix(in srgb, var(--brand-emerald) 8%, transparent)" }}
          >
            {data.checkedInNow.map((p) => (
              <li key={p.employeeId} className="flex items-center gap-3 px-4 py-3">
                {p.checkInPhoto ? (
                  <img
                    src={p.checkInPhoto}
                    alt=""
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ background: "var(--brand-emerald)" }}
                  >
                    {initials(p.name)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{p.name}</div>
                  <div className="truncate text-[10px] text-[var(--brand-ink)]/55">
                    {p.department} · {p.employeeCode}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-medium tabular-nums">
                    {formatTime(p.checkInTime)}
                  </div>
                  <div className="text-[10px] text-[var(--brand-ink)]/50">check-in</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function initials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
