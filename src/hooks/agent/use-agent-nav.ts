"use client";

// Tiny Zustand store for client-side navigation. Server state is handled
// by TanStack Query in use-agent-data.ts.
//
// Tabs mount lazily on first visit, then STAY mounted (visited) so
// switching back is instant — cached data, no skeletons, state kept.

import { create } from "zustand";
import type { AgentTab, AgentContentTab } from "@/lib/agent/types";

interface AgentNavState {
  tab: AgentTab;
  visited: AgentTab[];
  setTab: (t: AgentTab) => void;
  contentTab: AgentContentTab;
  setContentTab: (t: AgentContentTab) => void;
}

export const useAgentNav = create<AgentNavState>((set) => ({
  tab: "home",
  visited: ["home"],
  setTab: (t) =>
    set((s) => ({
      tab: t,
      visited: s.visited.includes(t) ? s.visited : [...s.visited, t],
    })),
  contentTab: "posts",
  setContentTab: (t) => set({ contentTab: t }),
}));
