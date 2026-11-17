-- MUSE / ИИ-стилист — схема ядра MVP (ТЗ, задача 3).
-- Миграция идемпотентна: её можно применять поверх уже созданных вручную таблиц.
--
-- Основные сущности (профиль, вещи, события, поездки) хранятся как JSONB-документы
-- в колонке data: так фронтенд может добавлять поля (цветотип, мерки, атрибуты для ленты)
-- без миграций. Обратная связь, аналитика, расходы на ИИ и push-подписки — отдельные таблицы.

-- ------------------------------------------------------------------ документы пользователя

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.wardrobe_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.events (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.trips (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Если таблицы создавались раньше без уникального ключа, upsert(onConflict: 'user_id,id') не сработает.
do $$
declare t text;
begin
  foreach t in array array['wardrobe_items', 'events', 'trips'] loop
    if not exists (
      select 1 from pg_indexes where schemaname = 'public' and tablename = t and indexdef ilike '%(user_id, id)%' and indexdef ilike '%unique%'
    ) then
      execute format('create unique index if not exists %I on public.%I (user_id, id)', t || '_user_id_id_key', t);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------------ обратная связь (задача 16)

create table if not exists public.feedback (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ------------------------------------------------------------------ аналитика (задача 22)

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists analytics_events_name_created on public.analytics_events (name, created_at);
create index if not exists analytics_events_user on public.analytics_events (user_id, created_at);

-- ------------------------------------------------------------------ ИИ: расходы и кеш (задача 23)

create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  kind text not null,               -- 'outfits' | 'recognition' | 'figure'
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  cached boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_day on public.ai_usage (user_id, created_at);

create table if not exists public.ai_cache (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  kind text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- ------------------------------------------------------------------ уведомления (задача 19)

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- ------------------------------------------------------------------ RLS: данные одной пользовательницы недоступны другой

alter table public.profiles enable row level security;
alter table public.wardrobe_items enable row level security;
alter table public.events enable row level security;
alter table public.trips enable row level security;
alter table public.feedback enable row level security;
alter table public.analytics_events enable row level security;
alter table public.ai_usage enable row level security;
alter table public.ai_cache enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notifications_sent enable row level security;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'wardrobe_items', 'events', 'trips', 'feedback', 'push_subscriptions'] loop
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format(
      'create policy "owner_all" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t
    );
  end loop;
end $$;

-- Аналитику клиент только пишет (и только от своего имени); читает — владелец проекта в Dashboard.
drop policy if exists "insert_own" on public.analytics_events;
create policy "insert_own" on public.analytics_events for insert to authenticated with check (user_id = (select auth.uid()));

-- Свои расходы на ИИ можно посмотреть (лимиты), писать — только Edge Functions (service role).
drop policy if exists "read_own" on public.ai_usage;
create policy "read_own" on public.ai_usage for select to authenticated using (user_id = (select auth.uid()));
-- ai_cache и notifications_sent: политик нет — доступ только у service role.

-- ------------------------------------------------------------------ закрытое хранилище фото (задачи 7, 21)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wardrobe', 'wardrobe', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false;

-- Файлы лежат по пути <user_id>/<item_id>/<original|clean>.jpg
drop policy if exists "wardrobe_owner_select" on storage.objects;
drop policy if exists "wardrobe_owner_insert" on storage.objects;
drop policy if exists "wardrobe_owner_update" on storage.objects;
drop policy if exists "wardrobe_owner_delete" on storage.objects;
create policy "wardrobe_owner_select" on storage.objects for select to authenticated
  using (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "wardrobe_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "wardrobe_owner_update" on storage.objects for update to authenticated
  using (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "wardrobe_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ------------------------------------------------------------------ сводки для Павла (Dashboard → SQL / Table editor)

create or replace view public.analytics_summary with (security_invoker = true) as
with registered as (
  select user_id, min(created_at) as at from public.analytics_events where name = 'signup' group by user_id
), threshold as (
  select user_id, min(created_at) as at from public.analytics_events where name = 'threshold_10_reached' group by user_id
), first_outfit as (
  select user_id, min(created_at) as at from public.analytics_events where name = 'outfits_received' group by user_id
), active_days as (
  select distinct user_id, created_at::date as day from public.analytics_events
)
select
  (select count(*) from registered) as registrations,
  (select count(*) from threshold) as passed_10_items,
  (select count(*) from registered r where exists (select 1 from active_days a where a.user_id = r.user_id and a.day >= (r.at + interval '7 days')::date)) as returned_after_7_days,
  (select count(*) from registered r where exists (select 1 from active_days a where a.user_id = r.user_id and a.day >= (r.at + interval '30 days')::date)) as returned_after_30_days,
  (select round(100.0 * count(*) filter (where name = 'outfit_take') / nullif(count(*) filter (where name in ('outfit_take', 'outfit_other')), 0), 1)
     from public.analytics_events) as take_share_percent,
  (select round(avg(case when (props ->> 'comfortable')::boolean then 1 else 0 end) * 100, 1)
     from public.analytics_events where name = 'feedback_comfort') as comfortable_percent,
  (select round(avg(extract(epoch from (f.at - r.at)) / 60)::numeric, 1)
     from registered r join first_outfit f using (user_id)) as avg_minutes_to_first_outfit,
  (select count(*) from public.analytics_events where name = 'event_created') as events_created,
  (select count(*) from public.analytics_events where name = 'trip_created') as trips_created,
  (select count(*) from public.analytics_events where name = 'account_deleted') as accounts_deleted;

create or replace view public.ai_cost_daily with (security_invoker = true) as
select
  created_at::date as day,
  kind,
  count(*) filter (where not cached) as requests,
  count(*) filter (where cached) as cache_hits,
  count(distinct user_id) as users,
  round(sum(cost_usd)::numeric, 4) as cost_usd,
  round((sum(cost_usd) / nullif(count(distinct user_id), 0))::numeric, 5) as cost_per_user_usd
from public.ai_usage
group by 1, 2
order by 1 desc, 2;

revoke all on public.analytics_summary from anon, authenticated;
revoke all on public.ai_cost_daily from anon, authenticated;
