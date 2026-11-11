-- ============================================================
-- Piel Morena FC - Esquema Supabase
-- Ejecutar completo en: Supabase Dashboard -> SQL Editor
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Tablas
-- Se guarda el documento original completo en data (jsonb) para
-- conservar el modelo de la app, con columnas extra para ordenar
-- e indexar. Los ids se conservan igual que en Firestore.
-- ------------------------------------------------------------
create table if not exists public.players (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists players_name_idx    on public.players ((data->>'name'));
create index if not exists players_updated_idx on public.players (updated_at);

create table if not exists public.matches (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists matches_date_idx    on public.matches ((data->>'date'));
create index if not exists matches_closed_idx  on public.matches ((data->>'closed'));
create index if not exists matches_updated_idx on public.matches (updated_at);

create table if not exists public.backups (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists backups_updated_idx on public.backups (updated_at);

-- ------------------------------------------------------------
-- updated_at automático
-- ------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists players_touch on public.players;
create trigger players_touch before update on public.players
for each row execute function public.touch_updated_at();

drop trigger if exists matches_touch on public.matches;
create trigger matches_touch before update on public.matches
for each row execute function public.touch_updated_at();

drop trigger if exists backups_touch on public.backups;
create trigger backups_touch before update on public.backups
for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- Administrador
-- Mismo criterio que las reglas de Firestore: por email del JWT.
-- ------------------------------------------------------------
-- CORREGIDO (v2): antes también aceptaba user_metadata.user_name / preferred_username, pero
-- user_metadata lo puede editar el propio usuario con auth.updateUser(): cualquiera que se
-- logueara podía ponerse "learmonelli" y volverse admin. Ahora solo cuenta el email del token.
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'leandroarmonelli@gmail.com';
$$;

-- Un partido finalizado (data->>'closed' = true) solo puede ser
-- editado por el admin, o únicamente en el campo comments.
create or replace function public.enforce_closed_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- La service_role (scripts de migración) puede reimportar sin restricción.
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;

  if coalesce((old.data->>'closed')::boolean, false)
     and not public.is_admin()
     and (new.data - 'comments') is distinct from (old.data - 'comments') then
    raise exception 'El partido está finalizado: solo se pueden editar comentarios'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists matches_closed_guard on public.matches;
create trigger matches_closed_guard before update on public.matches
for each row execute function public.enforce_closed_match();

-- ------------------------------------------------------------
-- RLS (mismas reglas funcionales que Firestore)
-- ------------------------------------------------------------
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.backups enable row level security;

drop policy if exists players_select on public.players;
create policy players_select on public.players
  for select using (true);

drop policy if exists players_insert on public.players;
create policy players_insert on public.players
  for insert with check (true);

drop policy if exists players_update on public.players;
create policy players_update on public.players
  for update using (true) with check (true);

drop policy if exists players_delete on public.players;
create policy players_delete on public.players
  for delete using (public.is_admin());

drop policy if exists matches_select on public.matches;
create policy matches_select on public.matches
  for select using (true);

drop policy if exists matches_insert on public.matches;
create policy matches_insert on public.matches
  for insert with check (true);

drop policy if exists matches_update on public.matches;
create policy matches_update on public.matches
  for update using (true) with check (true);

drop policy if exists matches_delete on public.matches;
create policy matches_delete on public.matches
  for delete using (public.is_admin());

drop policy if exists backups_select on public.backups;
create policy backups_select on public.backups
  for select using (true);

drop policy if exists backups_insert on public.backups;
create policy backups_insert on public.backups
  for insert with check (true);

-- CORREGIDO (v2): antes cualquiera con la clave pública podía editar o borrar las copias.
-- Ahora solo el admin. El backup semanal de pg_cron corre como postgres y no pasa por RLS.
drop policy if exists backups_update on public.backups;
create policy backups_update on public.backups
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists backups_delete on public.backups;
create policy backups_delete on public.backups
  for delete using (public.is_admin());

-- Permisos de tabla (RLS sigue filtrando fila por fila)
grant select, insert, update, delete on public.players to anon, authenticated, service_role;
grant select, insert, update, delete on public.matches to anon, authenticated, service_role;
grant select, insert, update, delete on public.backups to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- RPC: actualizar solo los comentarios de un partido.
-- Así una edición de comentarios no pisa el resto del documento.
-- ------------------------------------------------------------
create or replace function public.set_match_comments(p_id text, p_comments jsonb)
returns void
language sql
security invoker
as $$
  update public.matches
     set data = jsonb_set(coalesce(data, '{}'::jsonb), '{comments}', coalesce(p_comments, '[]'::jsonb), true),
         updated_at = now()
   where id = p_id;
$$;

-- ------------------------------------------------------------
-- RPC: reemplazar todo el equipo (restaurar backup / reset).
-- Solo el administrador puede ejecutarla.
-- ------------------------------------------------------------
create or replace function public.restore_team_data(p_players jsonb, p_matches jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador puede restaurar datos' using errcode = '42501';
  end if;

  delete from public.players;
  delete from public.matches;

  insert into public.players (id, data)
  select coalesce(nullif(x->>'id', ''), gen_random_uuid()::text), x
  from jsonb_array_elements(coalesce(p_players, '[]'::jsonb)) as t(x);

  insert into public.matches (id, data)
  select coalesce(nullif(x->>'id', ''), gen_random_uuid()::text), x
  from jsonb_array_elements(coalesce(p_matches, '[]'::jsonb)) as t(x);
end;
$$;

grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.set_match_comments(text, jsonb) to anon, authenticated, service_role;
grant execute on function public.restore_team_data(jsonb, jsonb) to authenticated, service_role;

-- ------------------------------------------------------------
-- Realtime: publicar las tres tablas
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'players'
  ) then
    alter publication supabase_realtime add table public.players;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'backups'
  ) then
    alter publication supabase_realtime add table public.backups;
  end if;
end;
$$;
