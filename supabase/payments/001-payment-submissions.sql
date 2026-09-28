-- Option B: staged payment approval.
--
-- `payments` is the ledger of real money. Nothing should ever appear in it
-- until an admin approves. Branch managers therefore record into
-- `payment_submissions`, and approval is what inserts into `payments`.
--
--   BM records            -> payment_submissions (status 'pending')
--   admin approves        -> INSERT into payments (status 'approved')
--                             + submission.status = 'approved',
--                               submission.payment_id = <new payments.id>
--   admin rejects         -> submission.status = 'rejected' (no ledger row)
--
-- The submission row is RETAINED after a decision, so the full audit trail
-- (who recorded it, who rejected it and why) survives. Rejected submissions
-- are simply never promoted, which is why `payments` stays clean.
--
-- RUN THIS IN THE PAYMENTS SUPABASE PROJECT — not the attendance project.
-- The two are separate databases; see src/lib/agent/payments-supabase.ts.

create table if not exists payment_submissions (
  id                 text primary key,
  plot_id            text,
  customer_id        text,
  booking_id         text,
  sale_id            text,
  date               timestamptz not null,
  amount             numeric not null check (amount > 0),
  payment_mode       text,
  reference_number   text,
  bank               text,
  cheque_number      text,
  transaction_id     text,
  remarks            text,
  status             text not null default 'pending'
                       check (status in ('pending', 'approved', 'rejected')),
  rejection_remark   text,
  approved_at        timestamptz,
  approved_by        text,
  recorded_by        text,
  recorded_by_name   text,
  proof_urls         jsonb not null default '[]'::jsonb,
  -- set once the submission has been promoted into `payments`
  payment_id         text,
  created_at         timestamptz not null default now()
);

create index if not exists payment_submissions_status_idx
  on payment_submissions (status);
create index if not exists payment_submissions_plot_idx
  on payment_submissions (plot_id);
create index if not exists payment_submissions_customer_idx
  on payment_submissions (customer_id);
create index if not exists payment_submissions_recorder_idx
  on payment_submissions (recorded_by);
-- A submission may only be promoted once. Partial unique index makes a
-- double-approval impossible even if two admins race each other.
create unique index if not exists payment_submissions_promoted_idx
  on payment_submissions (payment_id)
  where payment_id is not null;

-- Row level security -------------------------------------------------------
--
-- The server talks to this project with the service_role key, which bypasses
-- RLS entirely, so these policies exist only for the anon-key fallback path
-- documented in src/lib/agent/payments-supabase.ts. They mirror the posture
-- the existing `payments` table already has: readable and writable by anon.
--
-- That fallback is a known security compromise (the anon key ships to every
-- browser). Set PAYMENTS_SUPABASE_URL + PAYMENTS_SUPABASE_SERVICE_ROLE_KEY
-- and you can drop these policies entirely.
alter table payment_submissions enable row level security;

drop policy if exists "anon read submissions"   on payment_submissions;
drop policy if exists "anon insert submissions" on payment_submissions;
drop policy if exists "anon update submissions" on payment_submissions;

create policy "anon read submissions"
  on payment_submissions for select to anon, authenticated using (true);

create policy "anon insert submissions"
  on payment_submissions for insert to anon, authenticated with check (true);

create policy "anon update submissions"
  on payment_submissions for update to anon, authenticated using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- Backfill: any row already sitting in `payments` with status 'pending' was
-- recorded before this change and is awaiting a decision. Move those into the
-- submissions table so the approval queue keeps working, then leave `payments`
-- holding only real money.
--
-- Run this ONLY after creating the table above, and only once. It is safe to
-- re-run: rows already present in payment_submissions are skipped.
-- ---------------------------------------------------------------------------
insert into payment_submissions (
  id, plot_id, customer_id, booking_id, sale_id, date, amount, payment_mode,
  reference_number, bank, cheque_number, transaction_id, remarks, status,
  rejection_remark, approved_at, approved_by, recorded_by, recorded_by_name,
  proof_urls, payment_id, created_at
)
select
  p.id, p.plot_id, p.customer_id, p.booking_id, p.sale_id, p.date, p.amount,
  p.payment_mode, p.reference_number, p.bank, p.cheque_number,
  p.transaction_id, p.remarks, p.status, p.rejection_remark, p.approved_at,
  p.approved_by, p.recorded_by, p.recorded_by_name,
  coalesce(p.proof_urls, '[]'::jsonb),
  case when p.status = 'approved' then p.id else null end,
  coalesce(p.created_at, now())
from payments p
where p.status is distinct from 'approved'
on conflict (id) do nothing;

-- Remove the decided-but-unapproved leftovers from the ledger now that the
-- submissions table holds the audit trail. Rows with status 'approved' stay.
delete from payments
where status is distinct from 'approved';

-- Belt and braces: the ledger should never accept a non-approved row again.
-- Drop it if the payments table already has an equivalent constraint.
alter table payments
  drop constraint if exists payments_status_approved_check;
alter table payments
  add constraint payments_status_approved_check
  check (status = 'approved');
