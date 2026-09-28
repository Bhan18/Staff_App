"use client";

// Admin employees — add, edit, reset password, activate/deactivate, delete.
// Backed by /api/attendance/admin/employees.

import { useMemo, useState } from "react";
import {
  Users,
  Search,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  X,
  UserCheck,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { useAdminFetch } from "@/hooks/admin/use-admin-data";
import { useAgentAuth } from "@/hooks/agent/use-agent-auth";
import {
  SkeletonList,
  EmptyState,
  ErrorState,
  StatusPill,
} from "@/components/agent/ui-primitives";
import { FileDrop } from "./file-drop";

type EmployeeToday = {
  status: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  checkInPhoto: string | null;
};

type AdminEmployee = {
  id: string;
  employeeCode: string;
  name: string;
  phone: string;
  department: string;
  role: string;
  status: string;
  profilePhoto: string | null;
  today: EmployeeToday | null;
};

type EmployeesData = {
  employees: AdminEmployee[];
  date: string;
};

const inputCls =
  "w-full rounded-xl border border-[color-mix(in_srgb,var(--brand-emerald)_15%,#e5e0d4)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--brand-emerald)]";

export function EmployeesTab() {
  const { data, loading, error, reload } = useAdminFetch<EmployeesData>(
    "/api/attendance/admin/employees",
  );
  const { session } = useAgentAuth();
  const selfId = session?.employee?.id ?? "";
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<AdminEmployee | null>(null);
  const [deleting, setDeleting] = useState<AdminEmployee | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const departments = useMemo(
    () => [...new Set((data?.employees ?? []).map((e) => e.department))].sort(),
    [data],
  );

  const filtered = useMemo(() => {
    let list = data?.employees ?? [];
    if (dept) list = list.filter((e) => e.department === dept);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.employeeCode.toLowerCase().includes(q),
      );
    }
    return list;
  }, [data, search, dept]);

  async function toggleStatus(e: AdminEmployee) {
    if (e.id === selfId) {
      toast.error("You cannot deactivate your own account.");
      return;
    }
    setBusyId(e.id);
    try {
      const res = await fetch("/api/attendance/admin/employees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: e.id,
          status: e.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d?.error ?? "Could not update status.");
        return;
      }
      toast.success(e.status === "ACTIVE" ? "Employee deactivated" : "Employee reactivated");
      reload();
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusyId(deleting.id);
    try {
      const res = await fetch(`/api/attendance/admin/employees?id=${deleting.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d?.error ?? "Could not delete employee.");
        return;
      }
      toast.success("Employee deleted");
      setDeleting(null);
      reload();
    } finally {
      setBusyId(null);
    }
  }

  if (loading && !data) return <SkeletonList count={8} height={64} />;
  if (error && !data) {
    return <ErrorState title="Couldn't load employees" description={error} onRetry={reload} />;
  }
  if (!data) return <EmptyState icon={Users} title="No employees" />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Employees{" "}
          <span className="font-normal text-[var(--brand-ink)]/50">({filtered.length})</span>
        </h2>
        <button
          onClick={() => setShowAdd(true)}
          className="agent-press flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-white"
          style={{ background: "var(--brand-emerald)" }}
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
            style={{ color: "var(--brand-ink)/40" }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or code"
            className="w-full rounded-lg border bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-[var(--brand-emerald)]"
            style={{ borderColor: "color-mix(in srgb, var(--brand-emerald) 15%, #e5e0d4)" }}
          />
        </div>
        <select
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          className="rounded-lg border bg-white px-3 py-2 text-xs outline-none focus:border-[var(--brand-emerald)]"
          style={{ borderColor: "color-mix(in srgb, var(--brand-emerald) 15%, #e5e0d4)" }}
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="No employees match" />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((e) => {
            const isSelf = e.id === selfId;
            const busy = busyId === e.id;
            return (
              <div key={e.id} className={`agent-card p-3.5 ${e.status !== "ACTIVE" ? "opacity-75" : ""}`}>
                <div className="flex items-center gap-3">
                  {e.profilePhoto ? (
                    <img src={e.profilePhoto} alt="" className="h-11 w-11 rounded-full object-cover" />
                  ) : e.today?.checkInPhoto ? (
                    <img src={e.today.checkInPhoto} alt="" className="h-11 w-11 rounded-full object-cover" />
                  ) : (
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                      style={{ background: e.status !== "ACTIVE" ? "#9ca3af" : "var(--brand-emerald)" }}
                    >
                      {initials(e.name)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{e.name}</span>
                      {e.role === "ADMIN" && (
                        <span
                          className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase"
                          style={{ background: "color-mix(in srgb, var(--brand-gold) 20%, white)", color: "#8a6d24" }}
                        >
                          Admin
                        </span>
                      )}
                      {e.role === "BRANCH_MANAGER" && (
                        <span
                          className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase"
                          style={{ background: "color-mix(in srgb, #7c3aed 12%, white)", color: "#7c3aed" }}
                        >
                          BM
                        </span>
                      )}
                      {e.status !== "ACTIVE" && (
                        <span className="shrink-0 rounded-full bg-black/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-black/50">
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[10px] text-[var(--brand-ink)]/55">
                      {e.department} / {e.employeeCode} · {e.phone}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      {e.today ? (
                        <>
                          <StatusPill status={e.today.status} />
                          <span className="text-[10px] tabular-nums text-[var(--brand-ink)]/60">
                            in {formatTime(e.today.checkInTime)}
                          </span>
                        </>
                      ) : (
                        <span
                          className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium"
                          style={{ background: "color-mix(in srgb, var(--brand-checkout) 8%, white)", color: "var(--brand-checkout)" }}
                        >
                          No record today
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 flex items-center gap-1.5 border-t pt-2.5" style={{ borderColor: "color-mix(in srgb, var(--brand-emerald) 8%, transparent)" }}>
                  <button
                    onClick={() => setEditing(e)}
                    className="agent-press flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium"
                    style={{ background: "color-mix(in srgb, var(--brand-emerald) 10%, white)", color: "var(--brand-emerald)" }}
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button
                    onClick={() => toggleStatus(e)}
                    disabled={busy || isSelf}
                    title={e.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                    className="agent-press flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium disabled:opacity-40"
                    style={{ background: "color-mix(in srgb, var(--brand-gold) 12%, white)", color: "#8a6d24" }}
                  >
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : e.status === "ACTIVE" ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                    {e.status === "ACTIVE" ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    onClick={() => !isSelf && setDeleting(e)}
                    disabled={busy || isSelf}
                    title={isSelf ? "You cannot delete your own account" : "Delete"}
                    className="agent-press flex items-center justify-center rounded-lg px-2.5 py-1.5 disabled:opacity-40"
                    style={{ background: "color-mix(in srgb, var(--brand-checkout) 8%, white)", color: "var(--brand-checkout)" }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <EmployeeForm
          title="Add employee"
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); reload(); }}
        />
      )}
      {editing && (
        <EmployeeForm
          title="Edit employee"
          employee={editing}
          isSelf={editing.id === selfId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
      {deleting && (
        <ConfirmSheet
          title="Delete employee?"
          body={`Delete ${deleting.name} (${deleting.employeeCode})? Their attendance, salary, leave and lead history will be removed too. This cannot be undone.`}
          confirmLabel="Delete"
          busy={busyId === deleting.id}
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

const PRESET_ROLES = ["Staff", "ADMIN", "BRANCH_MANAGER"] as const;

function EmployeeForm({
  title,
  employee,
  isSelf,
  onClose,
  onSaved,
}: {
  title: string;
  employee?: AdminEmployee;
  isSelf?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!employee;
  const [code, setCode] = useState(employee?.employeeCode ?? "");
  const [name, setName] = useState(employee?.name ?? "");
  const [phone, setPhone] = useState(employee?.phone ?? "");
  const [department, setDepartment] = useState(employee?.department ?? "");
  // Unified role state: preset or custom. Replaces old isAdmin+jobRole split which required typing BRANCH_MANAGER manually.
  const initialIsPreset = !employee || (["Staff", "ADMIN", "BRANCH_MANAGER"] as string[]).includes(employee.role);
  const [rolePreset, setRolePreset] = useState<string>(employee?.role && (["Staff", "ADMIN", "BRANCH_MANAGER"] as string[]).includes(employee.role) ? employee.role : (employee?.role ? "__custom" : "Staff"));
  const [customRole, setCustomRole] = useState<string>(employee && !initialIsPreset ? employee.role : "");
  const [password, setPassword] = useState("");
  const [photo, setPhoto] = useState<string | null>(employee?.profilePhoto ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!code.trim() || !name.trim() || !phone.trim() || !department.trim()) {
      setError("Code, name, phone and department are required.");
      return;
    }
    if (password && password.length < 4) {
      setError("Password must be at least 4 characters.");
      return;
    }
    setBusy(true);
    try {
      const role = rolePreset === "__custom" ? (customRole.trim() || "Staff") : rolePreset;
      if (isSelf && employee?.role === "ADMIN" && role !== "ADMIN") {
        setError("You cannot remove your own admin access.");
        setBusy(false);
        return;
      }
      const res = await fetch("/api/attendance/admin/employees", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(
          isEdit
            ? {
                id: employee!.id,
                employeeCode: code.trim(),
                name: name.trim(),
                phone: phone.trim(),
                department: department.trim(),
                role,
                profilePhoto: photo,
                ...(password ? { password } : {}),
              }
            : {
                employeeCode: code.trim(),
                name: name.trim(),
                phone: phone.trim(),
                department: department.trim(),
                role,
                profilePhoto: photo,
                ...(password ? { password } : {}),
              },
        ),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d?.error ?? "Could not save employee.");
        return;
      }
      toast.success(isEdit ? "Employee updated" : "Employee added");
      onSaved();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl bg-white p-4 sm:rounded-2xl"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">{title}</div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <FileDrop
          label="Profile photo"
          accept="image/*"
          maxMB={5}
          uploadUrl="/api/attendance/admin/upload"
          kind="image"
          value={photo}
          onUploaded={(url) => setPhoto(url)}
          onClear={() => setPhoto(null)}
          hint="Drag & drop or choose a photo · up to 5MB"
        />

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Employee code *">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="EMP009" className={inputCls} />
          </Field>
          <Field label="Phone *">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="98xxxxxx" className={inputCls} />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Full name *">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={inputCls} />
          </Field>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Department *">
            <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Construction" className={inputCls} />
          </Field>
          <Field label="Job role">
            <input value={customRole} onChange={(e) => setCustomRole(e.target.value)} placeholder="Site Engineer" className={inputCls} style={{ display: rolePreset === "__custom" ? undefined : "none" }} />
            <select
              value={rolePreset}
              onChange={(e) => setRolePreset(e.target.value)}
              className={inputCls}
              style={{ display: rolePreset === "__custom" ? "none" : undefined }}
              disabled={isSelf && employee?.role === "ADMIN"}
            >
              <option value="Staff">Staff — attendance & leads</option>
              <option value="BRANCH_MANAGER">Branch Manager — staff app + Payments tab</option>
              <option value="ADMIN">Administrator — full dashboard</option>
              <option value="__custom">Custom job title…</option>
            </select>
          </Field>
        </div>
        {rolePreset === "__custom" && (
          <button type="button" onClick={() => setRolePreset("Staff")} className="mt-1 text-xs font-medium" style={{ color: "var(--brand-emerald)" }}>← Back to presets</button>
        )}
        {rolePreset === "BRANCH_MANAGER" && (
          <p className="mt-1 text-xs" style={{ color: "color-mix(in srgb, var(--brand-emerald) 70%, transparent)" }}>Branch Managers record payments from the staff app (pending admin approval).</p>
        )}
        {isSelf && employee?.role === "ADMIN" && (
          <p className="mt-1 text-xs text-[var(--brand-ink)]/45">Your own admin access can't be removed.</p>
        )}

        <div className="mt-3">
          <Field label={isEdit ? "New password (blank = keep current)" : "Password (optional)"}>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="text" placeholder="Min 4 characters" className={inputCls} />
          </Field>
        </div>

        {error && (
          <div className="mt-3 rounded-lg px-3 py-2 text-xs font-medium" style={{ background: "color-mix(in srgb, var(--brand-checkout) 8%, white)", color: "var(--brand-checkout)" }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="agent-press mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: "var(--brand-emerald)" }}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? "Saving..." : isEdit ? "Save changes" : "Add employee"}
        </button>
      </form>
    </div>
  );
}

export function ConfirmSheet({
  title,
  body,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-t-2xl bg-white p-4 sm:rounded-2xl"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="text-sm font-semibold">{title}</div>
        <p className="mt-1 text-xs leading-relaxed text-[var(--brand-ink)]/65">{body}</p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={onCancel}
            className="agent-press flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold"
            style={{ borderColor: "color-mix(in srgb, var(--brand-emerald) 20%, #e5e0d4)" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="agent-press flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--brand-checkout)" }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-[var(--brand-ink)]/70">{label}</label>
      {children}
    </div>
  );
}

function formatTime(iso: string | null): string {
  if (!iso) return "---";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "---";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function initials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
