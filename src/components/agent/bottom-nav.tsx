"use client";

// Bottom navigation — staff tabs + a Payments tab for branch managers.
// Sticky, safe-area aware, hidden keyboard.

import { Home, FileText, Clock3, User, Users, IndianRupee } from "lucide-react";
import { useAgentNav } from "@/hooks/agent/use-agent-nav";
import { useAgentAuth } from "@/hooks/agent/use-agent-auth";
import type { AgentTab } from "@/lib/agent/types";

const TABS: { id: AgentTab; label: string; icon: typeof Home; bmOnly?: boolean }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "attendance", label: "Attendance", icon: Clock3 },
  { id: "content", label: "Content", icon: FileText },
  { id: "leads", label: "My Leads", icon: Users },
  { id: "payments", label: "Payments", icon: IndianRupee, bmOnly: true },
  { id: "profile", label: "Profile", icon: User },
];

export function BottomNav() {
  const { tab, setTab } = useAgentNav();
  const { session } = useAgentAuth();
  const isBm = session?.employee?.role === "BRANCH_MANAGER";
  const visible = TABS.filter((t) => !t.bmOnly || isBm);
  return (
    <nav
      className="sticky bottom-0 z-30 border-t bg-white/95 backdrop-blur safe-pb"
      style={{ borderColor: "color-mix(in srgb, var(--brand-emerald) 12%, #e5e0d4)" }}
      aria-label="Primary"
    >
      <div className={`mx-auto grid max-w-2xl ${visible.length > 5 ? "grid-cols-6" : "grid-cols-5"}`}>
        {visible.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`agent-press agent-tab-${active ? "active" : "idle"} flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium tap-highlight-none`}
              style={{ color: active ? "var(--brand-emerald)" : "color-mix(in srgb, var(--brand-ink) 55%, transparent)" }}
              aria-current={active ? "page" : undefined}
            >
              <span className="agent-tab-icon transition-transform">
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
              </span>
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
