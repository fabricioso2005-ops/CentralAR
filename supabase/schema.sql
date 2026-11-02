-- =====================================================================
-- Central AR · esquema do banco (Supabase / PostgreSQL)
-- Rode este arquivo inteiro no Supabase: SQL Editor → New query → Run.
-- Pode rodar de novo sem problema (é idempotente).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Perfis: um por usuário do Supabase Auth (gerente comercial ou gestor)
-- ---------------------------------------------------------------------
create table if not exists public.perfis (
  id         uuid primary key references auth.users (id) on delete cascade,
  nome       text not null default '',
  email      text not null default '',
  telefone   text not null default '',
  papel      text not null default 'gerente' check (papel in ('gerente', 'gestor')),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

-- Cria o perfil automaticamente quando um usuário é criado no Auth
create or replace function public.criar_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome, email)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), split_part(new.email, '@', 1)),
          coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil();

-- Perfis de usuários que já existiam antes deste script
insert into public.perfis (id, nome, email)
select u.id, coalesce(nullif(u.raw_user_meta_data ->> 'nome', ''), split_part(u.email, '@', 1)), coalesce(u.email, '')
from auth.users u
on conflict (id) do nothing;

-- O usuário logado é gestor (ativo)?
create or replace function public.eh_gestor()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and papel = 'gestor' and ativo);
$$;

-- O usuário logado está ativo?
create or replace function public.esta_ativo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo);
$$;

-- ---------------------------------------------------------------------
-- Parceiros: imobiliárias e corretores autônomos de cada gerente
-- ---------------------------------------------------------------------
create table if not exists public.parceiros (
  id              uuid primary key default gen_random_uuid(),
  dono            uuid not null default auth.uid() references public.perfis (id) on delete restrict,
  tipo            text not null check (tipo in ('imobiliaria', 'corretor')),
  nome            text not null,
  responsavel     text not null default '',
  creci           text not null default '',
  telefone        text not null default '',
  email           text not null default '',
  cidade          text not null default '',
  imobiliaria_id  uuid references public.parceiros (id) on delete set null,
  etapa           text not null default 'novo' check (etapa in ('novo', 'ativo', 'parceiro', 'inativo')),
  proximo_contato date,
  notas           text not null default '',
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index if not exists parceiros_dono_idx on public.parceiros (dono);
create index if not exists parceiros_retorno_idx on public.parceiros (proximo_contato);

-- ---------------------------------------------------------------------
-- Contatos: histórico de cada conversa com um parceiro
-- ---------------------------------------------------------------------
create table if not exists public.contatos (
  id          uuid primary key default gen_random_uuid(),
  dono        uuid not null default auth.uid() references public.perfis (id) on delete restrict,
  parceiro_id uuid not null references public.parceiros (id) on delete cascade,
  canal       text not null default 'WhatsApp',
  texto       text not null,
  em          timestamptz not null default now()
);
create index if not exists contatos_parceiro_idx on public.contatos (parceiro_id, em desc);

-- ---------------------------------------------------------------------
-- Visitas agendadas
-- ---------------------------------------------------------------------
create table if not exists public.visitas (
  id            uuid primary key default gen_random_uuid(),
  dono          uuid not null default auth.uid() references public.perfis (id) on delete restrict,
  parceiro_id   uuid references public.parceiros (id) on delete set null,
  cliente       text not null default '',
  inicio        timestamptz not null,
  duracao_min   integer not null default 60 check (duracao_min between 5 and 720),
  local         text not null default '',
  obs           text not null default '',
  status        text not null default 'agendada' check (status in ('agendada', 'realizada', 'cancelada')),
  lembretes     integer[] not null default '{60,1440}',
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists visitas_dono_inicio_idx on public.visitas (dono, inicio);

-- atualizado_em automático
create or replace function public.tocar_atualizado()
returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;

drop trigger if exists parceiros_tocar on public.parceiros;
create trigger parceiros_tocar before update on public.parceiros
  for each row execute function public.tocar_atualizado();
drop trigger if exists visitas_tocar on public.visitas;
create trigger visitas_tocar before update on public.visitas
  for each row execute function public.tocar_atualizado();

-- Um gerente não pode trocar o dono de um registro (só o gestor transfere)
create or replace function public.proteger_dono()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.dono is distinct from old.dono and not public.eh_gestor() then
    raise exception 'Somente o gestor pode transferir registros entre gerentes.';
  end if;
  return new;
end $$;

drop trigger if exists parceiros_dono on public.parceiros;
create trigger parceiros_dono before update on public.parceiros
  for each row execute function public.proteger_dono();
drop trigger if exists visitas_dono on public.visitas;
create trigger visitas_dono before update on public.visitas
  for each row execute function public.proteger_dono();

-- Ao transferir um parceiro, o histórico e as visitas futuras vão junto
create or replace function public.levar_junto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.dono is distinct from old.dono then
    update public.contatos set dono = new.dono where parceiro_id = new.id;
    update public.visitas set dono = new.dono
      where parceiro_id = new.id and status = 'agendada' and inicio >= now();
  end if;
  return new;
end $$;

drop trigger if exists parceiros_levar on public.parceiros;
create trigger parceiros_levar after update of dono on public.parceiros
  for each row execute function public.levar_junto();

-- ---------------------------------------------------------------------
-- Segurança por linha (RLS): cada gerente só vê e mexe no que é dele;
-- o gestor vê e mexe em tudo. Usuário desativado não acessa nada.
-- ---------------------------------------------------------------------
alter table public.perfis    enable row level security;
alter table public.parceiros enable row level security;
alter table public.contatos  enable row level security;
alter table public.visitas   enable row level security;

drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated
  using (id = auth.uid() or public.eh_gestor());

drop policy if exists perfis_editar on public.perfis;
create policy perfis_editar on public.perfis for update to authenticated
  using (id = auth.uid() or public.eh_gestor())
  with check (id = auth.uid() or public.eh_gestor());

-- Gerente só altera nome e telefone do próprio perfil; papel e ativo só pela função do gestor
revoke update on public.perfis from authenticated;
grant update (nome, telefone) on public.perfis to authenticated;

do $$
declare t text;
begin
  foreach t in array array['parceiros', 'contatos', 'visitas'] loop
    execute format('drop policy if exists %1$s_ler on public.%1$s', t);
    execute format('create policy %1$s_ler on public.%1$s for select to authenticated
                    using (public.esta_ativo() and (dono = auth.uid() or public.eh_gestor()))', t);
    execute format('drop policy if exists %1$s_criar on public.%1$s', t);
    execute format('create policy %1$s_criar on public.%1$s for insert to authenticated
                    with check (public.esta_ativo() and (dono = auth.uid() or public.eh_gestor()))', t);
    execute format('drop policy if exists %1$s_editar on public.%1$s', t);
    execute format('create policy %1$s_editar on public.%1$s for update to authenticated
                    using (public.esta_ativo() and (dono = auth.uid() or public.eh_gestor()))
                    with check (public.esta_ativo() and (dono = auth.uid() or public.eh_gestor()))', t);
    execute format('drop policy if exists %1$s_apagar on public.%1$s', t);
    execute format('create policy %1$s_apagar on public.%1$s for delete to authenticated
                    using (public.esta_ativo() and (dono = auth.uid() or public.eh_gestor()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Função do gestor: mudar papel / ativar / desativar um usuário
-- ---------------------------------------------------------------------
create or replace function public.gestor_definir_usuario(p_id uuid, p_papel text, p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_gestor() then
    raise exception 'Somente o gestor pode alterar usuários.';
  end if;
  if p_id = auth.uid() and (p_papel <> 'gestor' or not p_ativo) then
    raise exception 'Você não pode remover o seu próprio acesso de gestor.';
  end if;
  update public.perfis set papel = p_papel, ativo = p_ativo where id = p_id;
end $$;

revoke all on function public.gestor_definir_usuario(uuid, text, boolean) from public, anon;
grant execute on function public.gestor_definir_usuario(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Atualização em tempo real no app (Supabase Realtime)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['parceiros', 'contatos', 'visitas', 'perfis'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- PRIMEIRO GESTOR: depois de criar o seu usuário em Authentication → Users,
-- troque o e-mail abaixo e rode só esta linha:
--
--   update public.perfis set papel = 'gestor' where email = 'seu-email@ar.com.br';
-- ---------------------------------------------------------------------
