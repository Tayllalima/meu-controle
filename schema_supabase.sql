-- MEU CONTROLE V2 - schema inicial para Supabase/PostgreSQL
create extension if not exists "pgcrypto";

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text not null default '📌',
  created_at timestamptz not null default now()
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null,
  category_id uuid not null references public.categories(id) on delete cascade,
  amount numeric(12,2) not null default 0,
  unique(user_id, month, category_id)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null,
  date date not null,
  type text not null check(type in ('expense','income')),
  category_id uuid references public.categories(id) on delete set null,
  installment_group uuid,
  installment_current integer not null default 1,
  installment_total integer not null default 1,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;
alter table public.budgets enable row level security;
alter table public.transactions enable row level security;

create policy "own categories" on public.categories for all using (auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "own budgets" on public.budgets for all using (auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "own transactions" on public.transactions for all using (auth.uid()=user_id) with check(auth.uid()=user_id);
