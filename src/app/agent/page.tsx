"use client";

// Agent app shell. Owns:
//   - splash on first boot
//   - sign-in gate when no staff session
//   - tab navigation (home / content / attendance / profile)
//   - camera capture flow overlay (check-in / check-out)
//   - submission to /api/attendance/staff/mark

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AgentSplash } from "@/components/agent/splash";
import { AgentSignIn } from "@/components/agent/sign-in";
import { TopBar } from "@/components/agent/top-bar";
import { BottomNav } from "@/components/agent/bottom-nav";
import { HomeTab } from "@/components/agent/home-tab";
import { ContentTab } from "@/components/agent/content-tab";
import { AttendanceTab } from "@/components/agent/attendance-tab";
import { LeadsTab } from "@/components/agent/leads-tab";
import { BmPaymentsTab } from "@/components/agent/bm-payments-tab";
import { ProfileTab } from "@/components/agent/profile-tab";
import { CameraCapture } from "@/components/agent/camera-capture";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { useAgentAuth } from "@/hooks/agent/use-agent-auth";
import { useAgentNav } from "@/hooks/agent/use-agent-nav";
import { useSubmitAttendance, type AttendanceSubmitResult } from "@/hooks/agent/use-agent-data";
import type { AgentSession } from "@/lib/agent/types";
import { isOutsideWindow } from "@/lib/attendance/window";

type CaptureState =
  | { open: false }
  | { open: true; type: "CHECK_IN" | "CHECK_OUT" };

/** True when a mark of `type` right now is earlier than the allowed window. */
function isMarkOutsideWindow(
  session: AgentSession | null,
  type: "CHECK_IN" | "CHECK_OUT",
): boolean {
  if (!session) return false;
  const s = session.settings;
  if (!s.officeStartTime || !s.officeEndTime) return false;
  return isOutsideWindow(
    type,
    {
      officeStartTime: s.officeStartTime,
      officeEndTime: s.officeEndTime,
      checkInEarlyWindowMinutes: s.checkInEarlyWindowMinutes ?? 45,
      checkOutEarlyWindowMinutes: s.checkOutEarlyWindowMinutes ?? 180,
      timezone: s.timezone,
    },
    new Date(),
  );
}

export default function AgentPage() {
  const { session, loading, refreshSession } = useAgentAuth();
  const { tab, visited, setTab } = useAgentNav();
  const submit = useSubmitAttendance();
  const [capture, setCapture] = useState<CaptureState>({ open: false });
  const [reasonRequired, setReasonRequired] = useState(false);

  // Lock body scroll while camera is open.
  useEffect(() => {
    if (capture.open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [capture.open]);

  const startCapture = useCallback(
    (type: "CHECK_IN" | "CHECK_OUT") => {
      setReasonRequired(isMarkOutsideWindow(session, type));
      setCapture({ open: true, type });
    },
    [session],
  );

  const closeCapture = useCallback(() => setCapture({ open: false }), []);

  // Boot sequence — splash waits in parallel with the auth session check
  // (min ~350ms), then hands straight to sign-in or the app. No extra
  // spinner stage, so opening is as fast as the session fetch allows.
  //
  // A refresh (pull-to-refresh while the tab was already running) skips
  // the splash entirely — the app renders straight through with no overlay.
  // Detected two independent ways so it holds on any device: sessionStorage
  // (persists across a reload in the same tab) and the navigation timing
  // API (reports type "reload").
  const [isRefresh] = useState(() => {
    try {
      if (sessionStorage.getItem("agent-booted")) return true;
    } catch {
      /* storage unavailable — fall through to the navigation check */
    }
    const nav = performance.getEntriesByType?.("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (nav?.type !== "navigate") return true;
    try {
      sessionStorage.setItem("agent-booted", "1");
    } catch {
      /* ignore */
    }
    return false;
  });
  const [splash, setSplash] = useState<"visible" | "leaving" | "gone">(
    isRefresh ? "gone" : "visible",
  );

  useEffect(() => {
    if (loading) return;
    if (splash === "gone") return;
    const t1 = setTimeout(() => setSplash("leaving"), 350);
    const t2 = setTimeout(() => setSplash("gone"), 700);
    // Hard ceiling — the splash must never persist, even if the session
    // check hangs. 4s is far beyond the normal boot path.
    const t3 = setTimeout(() => setSplash("gone"), 4000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [loading]);

  const onSubmit = useCallback(
    async ({
      photoBase64,
      geo,
      reason,
    }: {
      photoBase64: string;
      geo: import("@/lib/agent/types").GeoReading | null;
      reason?: string | null;
    }) => {
      const kind = capture.open ? capture.type : "CHECK_IN";
      const res = await submit.mutateAsync({
        kind,
        photoBlobBase64: photoBase64,
        geo: geo ? { latitude: geo.lat, longitude: geo.lng } : null,
        reason,
      });
      if (!res.ok) {
        if (res.code === "REASON_REQUIRED") {
          // The server still wants a reason — reveal the picker and retry.
          setReasonRequired(true);
        }
        // Throw so the camera reverts out of "Submitting…" and shows the
        // readable inline error instead of staying stuck.
        throw new Error(failureMessage(kind, res));
      }
      toast.success(kind === "CHECK_IN" ? "Checked in" : "Checked out", {
        description: "Your attendance has been recorded.",
      });
      setCapture({ open: false });
      await refreshSession();
      setTab("home");
    },
    [capture, submit, refreshSession, setTab]
  );

  // Boot sequence — splash first (cold open only; refresh skips it).
  if (splash !== "gone") {
    return <AgentSplash leaving={splash === "leaving"} />;
  }

  // Still validating the session after a refresh — hold without an overlay
  // so the sign-in screen never flashes mid-session.
  if (loading) {
    return null;
  }

  // Not signed in.
  if (!session) {
    return <AgentSignIn />;
  }

  // Admin role gets the admin dashboard instead of the staff UI.
  const isAdmin = session.isAdmin || session.employee.role === "ADMIN";
  if (isAdmin) {
    return <AdminDashboard />;
  }

  return (
    <div className="agent-shell flex min-h-dynamic flex-col">
      <TopBar />
      <main className="agent-frame flex-1">
        {visited.includes("home") && (
          <div hidden={tab !== "home"}>
            <HomeTab
              onCheckIn={() => startCapture("CHECK_IN")}
              onCheckOut={() => startCapture("CHECK_OUT")}
            />
          </div>
        )}
        {visited.includes("content") && (
          <div hidden={tab !== "content"}><ContentTab /></div>
        )}
        {visited.includes("attendance") && (
          <div hidden={tab !== "attendance"}>
            <AttendanceTab
              onCheckIn={() => startCapture("CHECK_IN")}
              onCheckOut={() => startCapture("CHECK_OUT")}
              busy={submit.isPending}
            />
          </div>
        )}
        {visited.includes("leads") && (
          <div hidden={tab !== "leads"}><LeadsTab /></div>
        )}
        {visited.includes("payments") && (
          <div hidden={tab !== "payments"}><BmPaymentsTab /></div>
        )}
        {visited.includes("profile") && (
          <div hidden={tab !== "profile"}><ProfileTab /></div>
        )}
      </main>
      <BottomNav />

      {capture.open && (
        <CameraCapture
          key={capture.type}
          type={capture.type === "CHECK_IN" ? "check_in" : "check_out"}
          onSubmit={onSubmit}
          onCancel={closeCapture}
          requiresReason={reasonRequired}
          reasonOptions={session.settings.reasonOptions ?? []}
        />
      )}

    </div>
  );
}

function failureMessage(
  kind: "CHECK_IN" | "CHECK_OUT",
  res: AttendanceSubmitResult,
): string {
  if (res.code === "OUTSIDE_AREA") {
    return kind === "CHECK_IN"
      ? "You are outside the permitted area for check-in. Move closer to the office and try again."
      : "You are outside the permitted area for check-out. Move closer to the office and try again.";
  }
  if (res.code === "REASON_REQUIRED") {
    return kind === "CHECK_IN"
      ? "Check-in is before the allowed time. Pick a reason to continue."
      : "Check-out is before the allowed time. Pick a reason to continue.";
  }
  return res.error ?? "Could not submit. Please try again.";
}
