"use client";

// TanStack Query hooks for agent reads. Attendance + profile go through
// /api/attendance/staff/* (attendance Supabase, httpOnly cookie auth).
// Content stays on the main Supabase project via /api/agent/content.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AttendanceLogEntry,
  ContentBrochure,
  ContentPost,
  ContentVideo,
  Lead,
  LeadActivity,
  LeadActivityType,
  LeadStatus,
} from "@/lib/agent/types";

async function jsonOrThrow(res: Response) {
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

type MappedRecord = {
  id: string;
  attendanceDate: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  workingMinutes: number | null;
  status: string;
};

export function useAttendanceLog(days = 365) {
  return useQuery<AttendanceLogEntry[]>({
    queryKey: ["agent", "attendance-log", days],
    queryFn: async () => {
      const res = await fetch(`/api/attendance/staff/history?days=${days}`, {
        credentials: "include",
      });
      const data = await jsonOrThrow(res);
      const items: MappedRecord[] = Array.isArray(data?.items) ? data.items : [];
      const mapped = items
        .filter(
          (r) =>
            r.checkInTime ||
            r.status === "ON_LEAVE" ||
            r.status === "ABSENT" ||
            r.status === "HALF_DAY",
        )
        .map((r) => ({
          id: r.id,
          attendanceDate: r.attendanceDate.slice(0, 10),
          checkInTime: r.checkInTime,
          checkOutTime: r.checkOutTime,
          workingMinutes: r.workingMinutes,
          status: r.status as AttendanceLogEntry["status"],
        }));
      return mapped as AttendanceLogEntry[];
    },
    staleTime: 30_000,
    retry: 1,
  });
}

export function useContentPosts() {
  return useQuery<ContentPost[]>({
    queryKey: ["agent", "content", "posts"],
    queryFn: async () => {
      const res = await fetch("/api/agent/content?type=posts", { credentials: "include" });
      return jsonOrThrow(res);
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function useContentBrochures() {
  return useQuery<ContentBrochure[]>({
    queryKey: ["agent", "content", "brochures"],
    queryFn: async () => {
      const res = await fetch("/api/agent/content?type=brochures", { credentials: "include" });
      return jsonOrThrow(res);
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function useContentVideos() {
  return useQuery<ContentVideo[]>({
    queryKey: ["agent", "content", "videos"],
    queryFn: async () => {
      const res = await fetch("/api/agent/content?type=videos", { credentials: "include" });
      return jsonOrThrow(res);
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export interface AttendanceSubmitInput {
  kind: "CHECK_IN" | "CHECK_OUT";
  photoBlobBase64: string;
  geo: { latitude: number; longitude: number } | null;
  reason?: string | null;
}

export interface AttendanceSubmitResult {
  ok: boolean;
  error?: string;
  code?: string;
}

export function useLeads() {
  return useQuery<Lead[]>({
    queryKey: ["agent", "leads"],
    queryFn: async () => {
      const res = await fetch("/api/attendance/staff/leads", { credentials: "include" });
      const data = await jsonOrThrow(res);
      return Array.isArray(data?.items) ? data.items : [];
    },
    staleTime: 30_000,
    retry: 1,
  });
}

export function useLeadDetail(id: string | null) {
  return useQuery<{ lead: Lead; activities: LeadActivity[] }>({
    queryKey: ["agent", "leads", id],
    queryFn: async () => {
      const res = await fetch(`/api/attendance/staff/leads/${id}`, { credentials: "include" });
      return jsonOrThrow(res);
    },
    enabled: !!id,
    staleTime: 30_000,
    retry: 1,
  });
}

export interface LeadInput {
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  source?: string;
  status?: LeadStatus;
  notes?: string;
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation<Lead, Error, LeadInput>({
    mutationFn: async (input) => {
      const res = await fetch("/api/attendance/staff/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      const data = await jsonOrThrow(res);
      return data.item;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent", "leads"] });
    },
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation<Lead, Error, { id: string; patch: Partial<LeadInput> }>({
    mutationFn: async ({ id, patch }) => {
      const res = await fetch(`/api/attendance/staff/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      });
      const data = await jsonOrThrow(res);
      return data.item;
    },
    onSuccess: (_lead, vars) => {
      qc.invalidateQueries({ queryKey: ["agent", "leads"] });
      qc.invalidateQueries({ queryKey: ["agent", "leads", vars.id] });
    },
  });
}

export function useAddLeadActivity() {
  const qc = useQueryClient();
  return useMutation<LeadActivity, Error, { id: string; type: LeadActivityType; content: string }>({
    mutationFn: async ({ id, type, content }) => {
      const res = await fetch(`/api/attendance/staff/leads/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type, content }),
      });
      const data = await jsonOrThrow(res);
      return data.item;
    },
    onSuccess: (_act, vars) => {
      qc.invalidateQueries({ queryKey: ["agent", "leads"] });
      qc.invalidateQueries({ queryKey: ["agent", "leads", vars.id] });
    },
  });
}

export function useSubmitAttendance() {
  const qc = useQueryClient();
  return useMutation<AttendanceSubmitResult, Error, AttendanceSubmitInput>({
    mutationFn: async (input) => {
      // 1. Upload the photo to attendance storage.
      const uploadRes = await fetch("/api/attendance/upload-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ data: input.photoBlobBase64, kind: input.kind }),
      });
      const upload = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok) {
        return { ok: false, error: upload?.error ?? "Photo upload failed." };
      }

      // 2. Mark attendance (server validates geofence + policy).
      const markRes = await fetch("/api/attendance/staff/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          kind: input.kind,
          photoPath: upload.path ?? null,
          gps: input.geo,
          reason: input.reason ?? null,
        }),
      });
      const mark = await markRes.json().catch(() => ({}));
      if (!markRes.ok) {
        return { ok: false, error: mark?.error ?? "Could not mark attendance.", code: mark?.code };
      }
      return { ok: true };
    },
    onSuccess: (result) => {
      if (result.ok) {
        qc.invalidateQueries({ queryKey: ["agent", "attendance-log"] });
      }
    },
  });
}

// ─── Branch-manager payments (main project, pending until approved) ─────

export interface BmPlotOption {
  id: string;
  plotNumber: string;
  block: string | null;
  status: string;
  projectName: string | null;
  bookingId: string | null;
  saleId: string | null;
}

export interface BmCustomer {
  id: string;
  name: string;
  phone: string | null;
  /** Only customers with a live outstanding balance are returned. */
  plots: BmPlotOption[];
}

export function useBmCustomers(enabled: boolean) {
  return useQuery<BmCustomer[]>({
    queryKey: ["agent", "bm", "customers"],
    queryFn: async () => {
      const res = await fetch("/api/bm/customers", { credentials: "include" });
      const data = await jsonOrThrow(res);
      return Array.isArray(data?.items) ? data.items : [];
    },
    enabled,
    staleTime: 60_000,
    retry: 1,
  });
}

export interface BmRecording {
  id: string;
  date: string;
  paymentMode: string;
  referenceNumber: string | null;
  bank: string | null;
  chequeNumber: string | null;
  transactionId: string | null;
  remarks: string | null;
  status: string;
  rejectionRemark: string | null;
  approvedAt: string | null;
  proofCount: number;
  proofs: string[];
  createdAt: string;
  plotNumber: string | null;
  plotBlock: string | null;
  customerName: string | null;
}

export function useBmPayments(enabled: boolean) {
  return useQuery<BmRecording[]>({
    queryKey: ["agent", "bm", "payments"],
    queryFn: async () => {
      const res = await fetch("/api/bm/payments", { credentials: "include" });
      const data = await jsonOrThrow(res);
      return Array.isArray(data?.items) ? data.items : [];
    },
    enabled,
    staleTime: 30_000,
    retry: 1,
  });
}

export interface BmPaymentInput {
  plotId: string;
  date: string;
  amount: number;
  paymentMode: string;
  referenceNumber?: string;
  bank?: string;
  chequeNumber?: string;
  transactionId?: string;
  remarks?: string;
  proofUrls: string[];
}

export function useRecordBmPayment() {
  const qc = useQueryClient();
  return useMutation<{ id: string }, Error, BmPaymentInput>({
    mutationFn: async (input) => {
      const res = await fetch("/api/bm/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      const data = await jsonOrThrow(res);
      return { id: data.id };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent", "bm", "payments"] });
      qc.invalidateQueries({ queryKey: ["agent", "bm", "customers"] });
    },
  });
}

// ─── Admin payment approval (the only place an amount is readable) ────────

export type AdminPaymentStatus = "pending" | "approved" | "rejected";

export interface AdminPayment {
  id: string;
  amount: number;
  date: string;
  paymentMode: string;
  referenceNumber: string | null;
  bank: string | null;
  chequeNumber: string | null;
  transactionId: string | null;
  remarks: string | null;
  status: string;
  rejectionRemark: string | null;
  approvedAt: string | null;
  recordedBy: string | null;
  recordedByName: string | null;
  proofCount: number;
  proofs: string[];
  createdAt: string;
  plotNumber: string | null;
  plotBlock: string | null;
  customerName: string | null;
  customerPhone: string | null;
}

export function useAdminPayments(enabled: boolean, status: AdminPaymentStatus) {
  return useQuery<AdminPayment[]>({
    queryKey: ["admin", "payments", status],
    queryFn: async () => {
      const res = await fetch(`/api/admin/payments?status=${status}`, {
        credentials: "include",
      });
      const data = await jsonOrThrow(res);
      return Array.isArray(data?.items) ? data.items : [];
    },
    enabled,
    staleTime: 15_000,
    retry: 1,
  });
}

/** Cheap badge count for the pending queue — one row, count only. */
export function useAdminPendingCount(enabled: boolean) {
  return useQuery<number>({
    queryKey: ["admin", "payments", "count", "pending"],
    queryFn: async () => {
      const res = await fetch("/api/admin/payments?status=pending&countOnly=1", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Could not load count.");
      const data = await res.json();
      return Number(data?.count ?? 0);
    },
    enabled,
    staleTime: 15_000,
    retry: 1,
  });
}

export interface AdminPaymentDetail {
  payment: {
    id: string;
    amount: number;
    date: string;
    paymentMode: string | null;
    referenceNumber: string | null;
    bank: string | null;
    chequeNumber: string | null;
    transactionId: string | null;
    remarks: string | null;
    status: string;
    rejectionRemark: string | null;
    approvedAt: string | null;
    recordedBy: string | null;
    recordedByName: string | null;
    proofUrls: string[];
    createdAt: string;
  };
  plot: {
    id: string;
    plotNumber: string;
    block: string | null;
    size: number | null;
    sizeUnit: string | null;
    facing: string | null;
    status: string;
    cornerPlot: boolean | null;
    roadWidth: number | null;
    notes: string | null;
    totalPrice: number;
    basePricePerUnit: number | null;
    /** Price snapshot frozen at booking time, stored as a JSON object. */
    frozenPrice: {
      size?: number;
      sizeUnit?: string;
      frozenAt?: string;
      totalPrice?: number;
      basePricePerUnit?: number;
      effectivePricePerUnit?: number;
      cornerPremiumPerUnit?: number;
      facingPremiumPerUnit?: number;
    } | null;
    pricePerCent: number | null;
  } | null;
  project: {
    id: string;
    name: string;
    location: string | null;
    totalArea: string | null;
    numberOfPlots: number | null;
  } | null;
  layout: { id: string; name: string; numberOfPlots: number | null } | null;
  customer: {
    id: string;
    name: string;
    fatherName: string | null;
    phone: string | null;
    alternatePhone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    pinCode: string | null;
    occupation: string | null;
    pan: string | null;
    aadhaar: string | null;
    remarks: string | null;
  } | null;
  booking: {
    id: string;
    referenceCode: string | null;
    bookingDate: string | null;
    advancePaid: number | null;
    paymentMethod: string | null;
    expectedRegistrationDate: string | null;
    status: string | null;
    discount: number | null;
    originalPlotPrice: number | null;
    originalPlotSize: number | null;
    remarks: string | null;
  } | null;
  ledger: {
    grossPrice: number;
    discount: number;
    netPrice: number;
    paidToDate: number;
    outstanding: number;
  };
}

export function useAdminPaymentDetail(id: string | null) {
  return useQuery<AdminPaymentDetail>({
    queryKey: ["admin", "payment", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/payments?id=${encodeURIComponent(id!)}`, {
        credentials: "include",
      });
      return jsonOrThrow(res);
    },
    enabled: !!id,
    staleTime: 0,
    retry: 1,
  });
}

export function useDecideAdminPayment() {
  const qc = useQueryClient();
  return useMutation<
    void,
    Error,
    { id: string; decision: "approve" | "reject"; remark?: string }
  >({
    mutationFn: async (input) => {
      const res = await fetch("/api/admin/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      await jsonOrThrow(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "payments"] });
      // A newly approved payment changes every outstanding balance, so the
      // BM's customer list must refetch too.
      qc.invalidateQueries({ queryKey: ["agent", "bm"] });
    },
  });
}
