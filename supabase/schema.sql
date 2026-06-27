-- ============================================================================
-- Financeiro — schema de sync no Supabase
-- Rode isto no SQL Editor do seu projeto (Dashboard → SQL Editor → New query).
-- ============================================================================
--
-- Estratégia local-first: cada entidade do app (conta, lançamento, etc.) vira
-- uma linha genérica nesta tabela. O app continua consultando tudo localmente
-- (IndexedDB/Dexie); o servidor só guarda o espelho para sincronizar entre
-- dispositivos. Conflitos são resolvidos por last-write-wins (updated_at).

create table if not exists public.records (
  id          uuid        not null primary key,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  table_name  text        not null,
  data        jsonb       not null,
  updated_at  timestamptz not null,
  deleted     boolean     not null default false
);

-- Índices para o pull incremental (por usuário, ordenado por updated_at).
create index if not exists records_user_updated_idx
  on public.records (user_id, updated_at);
create index if not exists records_user_table_idx
  on public.records (user_id, table_name);

-- ----------------------------------------------------------------------------
-- Row Level Security: cada usuário só enxerga e altera os próprios registros.
-- ----------------------------------------------------------------------------
alter table public.records enable row level security;

drop policy if exists "records_select_own" on public.records;
create policy "records_select_own" on public.records
  for select using (auth.uid() = user_id);

drop policy if exists "records_insert_own" on public.records;
create policy "records_insert_own" on public.records
  for insert with check (auth.uid() = user_id);

drop policy if exists "records_update_own" on public.records;
create policy "records_update_own" on public.records
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "records_delete_own" on public.records;
create policy "records_delete_own" on public.records
  for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Realtime: permite que outros dispositivos recebam mudanças na hora.
-- (ignora erro se a tabela já estiver na publicação)
-- ----------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.records;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
