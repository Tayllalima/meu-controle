
create extension if not exists pgcrypto;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text not null default '📌',
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  date date not null,
  type text not null check (type in ('income', 'expense')),
  category_id uuid references public.categories(id) on delete set null,
  installment_group uuid,
  installment_current integer not null default 1,
  installment_total integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null,
  category_id uuid not null references public.categories(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, month, category_id)
);

alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;

drop policy if exists "categories_select_own" on public.categories;
drop policy if exists "categories_insert_own" on public.categories;
drop policy if exists "categories_update_own" on public.categories;
drop policy if exists "categories_delete_own" on public.categories;

create policy "categories_select_own"
on public.categories for select
using (auth.uid() = user_id);

create policy "categories_insert_own"
on public.categories for insert
with check (auth.uid() = user_id);

create policy "categories_update_own"
on public.categories for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "categories_delete_own"
on public.categories for delete
using (auth.uid() = user_id);

drop policy if exists "transactions_select_own" on public.transactions;
drop policy if exists "transactions_insert_own" on public.transactions;
drop policy if exists "transactions_update_own" on public.transactions;
drop policy if exists "transactions_delete_own" on public.transactions;

create policy "transactions_select_own"
on public.transactions for select
using (auth.uid() = user_id);

create policy "transactions_insert_own"
on public.transactions for insert
with check (auth.uid() = user_id);

create policy "transactions_update_own"
on public.transactions for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "transactions_delete_own"
on public.transactions for delete
using (auth.uid() = user_id);

drop policy if exists "budgets_select_own" on public.budgets;
drop policy if exists "budgets_insert_own" on public.budgets;
drop policy if exists "budgets_update_own" on public.budgets;
drop policy if exists "budgets_delete_own" on public.budgets;

create policy "budgets_select_own"
on public.budgets for select
using (auth.uid() = user_id);

create policy "budgets_insert_own"
on public.budgets for insert
with check (auth.uid() = user_id);

create policy "budgets_update_own"
on public.budgets for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "budgets_delete_own"
on public.budgets for delete
using (auth.uid() = user_id);

create index if not exists categories_user_id_idx
on public.categories(user_id);

create index if not exists transactions_user_date_idx
on public.transactions(user_id, date desc);

create index if not exists budgets_user_month_idx
on public.budgets(user_id, month);
