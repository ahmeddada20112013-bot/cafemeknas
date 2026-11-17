-- =====================================================================
--  مقهى مكناس — قاعدة البيانات على Supabase
--  شغّل هذا الملف في: Supabase Dashboard ← SQL Editor ← New query ← Run
--  يمكن تشغيله أكثر من مرة دون مشكلة (لا يحذف أي بيانات).
-- =====================================================================

-- ---------- الحسابات: صاحب المقهى والمدير فقط ----------
create table if not exists public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role    text not null unique check (role in ('owner', 'manager')),
  title   text not null
);

-- دور المستخدم الحالي (null إن لم يكن من طاقم المقهى)
create or replace function public.my_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select role from public.staff where user_id = auth.uid()
$$;
revoke all on function public.my_role() from public;
grant execute on function public.my_role() to authenticated;

-- ---------- الإعدادات / المنتجات / الطاولات ----------
create table if not exists public.config (
  key        text primary key check (key in ('settings', 'products', 'stations')),
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- الطلبات المفتوحة (طلب واحد لكل طاولة / جهاز) ----------
create table if not exists public.open_orders (
  station_id text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- الفواتير (رقم الفاتورة يعطيه الخادم ولا يتكرر) ----------
create table if not exists public.sales (
  id         text primary key,
  no         bigint generated always as identity unique,
  data       jsonb not null,
  closed_at  timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists sales_closed_at_idx on public.sales (closed_at);

-- ---------- الدردشة ----------
create table if not exists public.chat (
  id         bigint generated always as identity primary key,
  from_role  text not null check (from_role in ('owner', 'manager')),
  text       text not null check (char_length(text) between 1 and 1000),
  created_at timestamptz not null default now()
);

-- ---------- صلاحيات الوصول للجداول ----------
-- (بعض مشاريع Supabase الجديدة لا تعطي هذه الصلاحيات تلقائياً)
grant usage on schema public to authenticated;
grant select on public.staff to authenticated;
grant select, insert, update, delete on public.config, public.open_orders, public.sales, public.chat to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on public.staff, public.config, public.open_orders, public.sales, public.chat from anon;

-- ---------- الصلاحيات (Row Level Security) ----------
alter table public.staff       enable row level security;
alter table public.config      enable row level security;
alter table public.open_orders enable row level security;
alter table public.sales       enable row level security;
alter table public.chat        enable row level security;

drop policy if exists staff_read on public.staff;
create policy staff_read on public.staff for select to authenticated
  using (public.my_role() is not null);

-- الإعدادات والمنتجات والطاولات: الكل يقرأ، صاحب المقهى فقط يعدّل
drop policy if exists config_read on public.config;
create policy config_read on public.config for select to authenticated
  using (public.my_role() is not null);
drop policy if exists config_owner_write on public.config;
create policy config_owner_write on public.config for all to authenticated
  using (public.my_role() = 'owner') with check (public.my_role() = 'owner');

-- الطلبات المفتوحة: صاحب المقهى والمدير
drop policy if exists open_orders_staff on public.open_orders;
create policy open_orders_staff on public.open_orders for all to authenticated
  using (public.my_role() is not null) with check (public.my_role() is not null);

-- الفواتير: الكل يقرأ ويضيف، صاحب المقهى فقط يحذف، ولا أحد يعدّل فاتورة
drop policy if exists sales_read on public.sales;
create policy sales_read on public.sales for select to authenticated
  using (public.my_role() is not null);
drop policy if exists sales_insert on public.sales;
create policy sales_insert on public.sales for insert to authenticated
  with check (public.my_role() is not null);
drop policy if exists sales_owner_delete on public.sales;
create policy sales_owner_delete on public.sales for delete to authenticated
  using (public.my_role() = 'owner');

-- الدردشة: كل واحد يرسل باسمه فقط
drop policy if exists chat_read on public.chat;
create policy chat_read on public.chat for select to authenticated
  using (public.my_role() is not null);
drop policy if exists chat_insert on public.chat;
create policy chat_insert on public.chat for insert to authenticated
  with check (from_role = public.my_role());

-- ---------- التحديث اللحظي (Realtime) ----------
do $$
declare t text;
begin
  foreach t in array array['config', 'open_orders', 'sales', 'chat'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
