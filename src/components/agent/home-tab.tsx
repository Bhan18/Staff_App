"use client";

// Home view — "What do I need today?" at a glance.
// Hierarchy: greeting → today's attendance → quick actions → latest
// content (post / videos / brochures).

import { useEffect, useState } from "react";
import { useAgentAuth } from "@/hooks/agent/use-agent-auth";
import { useAgentNav } from "@/hooks/agent/use-agent-nav";
import {
  useContentPosts,
  useContentBrochures,
  useContentVideos,
} from "@/hooks/agent/use-agent-data";
import { SkeletonCard, StatusPill } from "@/components/agent/ui-primitives";
import {
  greetingFor,
  formatTime,
  formatDate,
  todayKey,
  timeAgo,
} from "@/lib/agent-format";
import {
  Clock,
  FileText,
  BookOpen,
  PlayCircle,
  ChevronRight,
  CalendarCheck,
  ArrowRight,
  Wallet,
} from "lucide-react";
import type { AgentTodayRecord } from "@/lib/agent/types";

interface HomeTabProps {
  onCheckIn: () => void;
  onCheckOut: () => void;
}

export function HomeTab({ onCheckIn, onCheckOut }: HomeTabProps) {
  const { session } = useAgentAuth();
  const { setTab, setContentTab } = useAgentNav();
  const posts = useContentPosts();
  const videos = useContentVideos();
  const brochures = useContentBrochures();

  const today = session?.today ?? null;
  const name = session?.employee?.name ?? "there";

  const checkedIn = !!today?.checkInTime;
  const checkedOut = !!today?.checkOutTime;

  const latestPost = posts.data?.[0];
  const latestVideo = videos.data?.[0];
  const latestBrochure = brochures.data?.[0];

  return (
    <div className="fade-in space-y-7 px-4 pb-6 pt-4">
      {/* Greeting */}
      <section>
        <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          {formatDate(todayKey())}
          <LiveClock />
        </p>
        <h1 className="mt-1.5 text-3xl font-semibold tracking-tight">
          {greetingFor(name)}
        </h1>
      </section>

      {/* Today's attendance — single prominent card */}
      <section>
        <TodayCard
          today={today}
          checkedIn={checkedIn}
          checkedOut={checkedOut}
          onCheckIn={onCheckIn}
          onCheckOut={onCheckOut}
          onViewDetails={() => setTab("attendance")}
        />
      </section>

      {/* Quick actions — 2×2 grid */}
      <section>
        <h2 className="mb-3 text-[15px] font-semibold tracking-tight">Quick access</h2>
        <div className="grid grid-cols-2 gap-3">
          <QuickAction
            icon={Clock}
            label="Attendance"
            sub={checkedIn ? "View today" : "Mark now"}
            onClick={() => setTab("attendance")}
          />
          <QuickAction
            icon={Wallet}
            label="Record Payment"
            sub="By BM — pending approval"
            onClick={() => setTab("payments")}
          />
          <QuickAction
            icon={FileText}
            label="Posts"
            sub={`${posts.data?.length ?? 0} updates`}
            onClick={() => {
              setTab("content");
              setContentTab("posts");
            }}
          />
          <QuickAction
            icon={BookOpen}
            label="Brochures"
            sub={`${brochures.data?.length ?? 0} docs`}
            onClick={() => {
              setTab("content");
              setContentTab("brochures");
            }}
          />
          <QuickAction
            icon={PlayCircle}
            label="Videos"
            sub={`${videos.data?.length ?? 0} clips`}
            onClick={() => {
              setTab("content");
              setContentTab("videos");
            }}
          />
        </div>
      </section>

      {/* Latest post — image-led */}
      {posts.isLoading ? (
        <section>
          <SkeletonCard className="h-48" />
        </section>
      ) : latestPost ? (
        <section>
          <SectionHead
            title="Latest update"
            onSeeAll={() => {
              setTab("content");
              setContentTab("posts");
            }}
          />
          <button
            onClick={() => {
              setTab("content");
              setContentTab("posts");
            }}
            className="block w-full overflow-hidden rounded-2xl border border-border/60 bg-card text-left shadow-sm transition active:scale-[0.99]"
          >
            {latestPost.cover_image_url && (
              <div className="aspect-[16/9] overflow-hidden bg-muted">
                <img
                  src={latestPost.cover_image_url}
                  alt={latestPost.title}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
            )}
            <div className="p-4">
              {latestPost.pinned && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                  Pinned
                </span>
              )}
              <h3 className="mt-1 line-clamp-2 text-base font-semibold tracking-tight">
                {latestPost.title}
              </h3>
              {latestPost.body && (
                <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                  {latestPost.body}
                </p>
              )}
              <div className="mt-2 text-[11px] text-muted-foreground">
                {timeAgo(latestPost.published_at)}
              </div>
            </div>
          </button>
        </section>
      ) : null}

      {/* Latest video + brochure — compact rows side by side */}
      <section>
        <SectionHead title="Recent content" />
        <div className="space-y-3">
          {latestVideo && (
            <button
              onClick={() => {
                setTab("content");
                setContentTab("videos");
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card p-2.5 text-left shadow-sm transition active:scale-[0.99]"
            >
              <div className="relative h-14 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
                {latestVideo.thumbnail_url && (
                  <img
                    src={latestVideo.thumbnail_url}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                )}
                <div className="absolute inset-0 grid place-items-center bg-black/30">
                  <PlayCircle className="h-6 w-6 text-white" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-medium uppercase tracking-wider text-primary">
                  Video
                </div>
                <div className="truncate text-sm font-medium">{latestVideo.title}</div>
                <div className="text-[11px] text-muted-foreground">
                  {timeAgo(latestVideo.published_at)}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            </button>
          )}
          {latestBrochure && (
            <button
              onClick={() => {
                setTab("content");
                setContentTab("brochures");
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card p-2.5 text-left shadow-sm transition active:scale-[0.99]"
            >
              <div className="relative grid h-14 w-20 flex-shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
                {latestBrochure.cover_image_url ? (
                  <img
                    src={latestBrochure.cover_image_url}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <FileText className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-medium uppercase tracking-wider text-primary">
                  Brochure
                </div>
                <div className="truncate text-sm font-medium">{latestBrochure.title}</div>
                <div className="text-[11px] text-muted-foreground">
                  {timeAgo(latestBrochure.published_at)}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

// ─── Live clock ────────────────────────────────────────────────────────────

function LiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <span
      className="tnum flex-shrink-0 text-sm font-medium tabular-nums text-muted-foreground"
      aria-live="off"
    >
      {now.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      })}
    </span>
  );
}

// ─── Today's attendance card ────────────────────────────────────────────────

function TodayCard({
  today,
  checkedIn,
  checkedOut,
  onCheckIn,
  onCheckOut,
  onViewDetails,
}: {
  today: AgentTodayRecord | null;
  checkedIn: boolean;
  checkedOut: boolean;
  onCheckIn: () => void;
  onCheckOut: () => void;
  onViewDetails: () => void;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 text-white shadow-sm"
      style={{
        background:
          checkedIn && !checkedOut
            ? "linear-gradient(135deg, #c2372e 0%, #e2736b 100%)"
            : "linear-gradient(135deg, var(--brand-emerald) 0%, var(--brand-emerald-soft) 100%)",
      }}
    >
      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/5 blur-2xl" />
      <div className="relative flex items-start justify-between">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-white/60">
            Today&apos;s attendance
          </div>
          {checkedIn ? (
            <>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="tnum text-2xl font-semibold">
                  {formatTime(today?.checkInTime)}
                </span>
                <StatusPill status={today?.status ?? "present"} className="bg-white/15 text-white" />
              </div>
              <div className="mt-1 text-xs text-white/70">
                {checkedOut
                  ? `Checked out · ${formatTime(today?.checkOutTime)}`
                  : "Still checked in"}
              </div>
            </>
          ) : (
            <>
              <div className="mt-1.5 text-xl font-semibold">Not checked in yet</div>
              <div className="mt-1 text-xs text-white/70">
                Capture a live selfie to mark today&apos;s attendance.
              </div>
            </>
          )}
        </div>
        <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-white/10 backdrop-blur">
          <CalendarCheck className="h-5 w-5" />
        </div>
      </div>
      <button
        onClick={checkedIn ? (checkedOut ? onViewDetails : onCheckOut) : onCheckIn}
        className="relative mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-white/15 py-2.5 text-sm font-medium text-white backdrop-blur transition active:scale-[0.98] hover:bg-white/20"
      >
        {checkedIn ? (checkedOut ? "View details" : "Check out") : "Check in now"}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Quick action tile ──────────────────────────────────────────────────────

function QuickAction({
  icon: Icon,
  label,
  sub,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start gap-2.5 rounded-2xl border border-border/60 bg-card p-3.5 text-left shadow-sm transition active:scale-[0.98]"
    >
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10">
        <Icon className="h-[18px] w-[18px] text-primary" />
      </div>
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground">{sub}</div>
      </div>
    </button>
  );
}

// ─── Section header ─────────────────────────────────────────────────────────

function SectionHead({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      {onSeeAll && (
        <button
          onClick={onSeeAll}
          className="flex items-center gap-0.5 text-xs font-medium text-primary active:opacity-70"
        >
          See all
          <ChevronRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
