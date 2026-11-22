-- 0001_schema.sql — GaliaBrew, fase 1
-- Perfis (login), cadastros de ingredientes, equipamentos e receitas.
-- Segurança: RLS em todas as tabelas, só o papel "authenticated" acessa; "anon" não lê nada.
-- Unidades no banco: kg, g, L, °C, minutos, densidade em SG (1,050), cor em SRM, percentuais 0-100.

-- =====================================================================
-- Privilégios padrão: objeto novo criado pelas migrações não nasce aberto para "anon"
-- =====================================================================
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon, public;

-- =====================================================================
-- Perfis
-- =====================================================================
create table public.perfis (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  nome      text not null default '',
  papel     text not null default 'usuario' check (papel in ('usuario', 'admin')),
  criado_em timestamptz not null default now()
);
comment on table public.perfis is 'Um por login. papel muda só por SQL (service_role/postgres): o usuário altera apenas o nome.';

-- Admin = pode gravar o catálogo do sistema (linhas com dono nulo).
create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfis p
    where p.user_id = (select auth.uid()) and p.papel = 'admin'
  );
$$;

-- Perfil criado junto com o login (cadastro ou convite). Nome vem do metadado "nome" ou do e-mail.
create or replace function public.criar_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfis (user_id, nome)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1), ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger perfis_criar
after insert on auth.users
for each row execute function public.criar_perfil();

create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- =====================================================================
-- Cadastros (catálogo). dono nulo = catálogo do sistema (todos leem, só admin grava);
-- dono preenchido = item particular do usuário.
-- =====================================================================
create table public.estilos (
  id            uuid primary key default gen_random_uuid(),
  dono          uuid references auth.users (id) on delete cascade default auth.uid(),
  guia          text not null default 'BJCP 2021',
  categoria     text,
  codigo        text,
  nome          text not null check (length(trim(nome)) > 0),
  tipo          text not null default 'CERVEJA' check (tipo in ('CERVEJA', 'HIDROMEL', 'SIDRA', 'KOMBUCHA', 'OUTRO')),
  og_min        numeric check (og_min between 0.990 and 1.200),
  og_max        numeric check (og_max between 0.990 and 1.200),
  fg_min        numeric check (fg_min between 0.980 and 1.100),
  fg_max        numeric check (fg_max between 0.980 and 1.100),
  ibu_min       numeric check (ibu_min >= 0),
  ibu_max       numeric check (ibu_max >= 0),
  cor_srm_min   numeric check (cor_srm_min >= 0),
  cor_srm_max   numeric check (cor_srm_max >= 0),
  abv_min_pct   numeric check (abv_min_pct between 0 and 100),
  abv_max_pct   numeric check (abv_max_pct between 0 and 100),
  co2_min_vol   numeric check (co2_min_vol >= 0),
  co2_max_vol   numeric check (co2_max_vol >= 0),
  notas         text,
  extras        jsonb not null default '{}'::jsonb,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (og_min <= og_max), check (fg_min <= fg_max), check (ibu_min <= ibu_max),
  check (cor_srm_min <= cor_srm_max), check (abv_min_pct <= abv_max_pct), check (co2_min_vol <= co2_max_vol)
);

create table public.fermentaveis (
  id              uuid primary key default gen_random_uuid(),
  dono            uuid references auth.users (id) on delete cascade default auth.uid(),
  nome            text not null check (length(trim(nome)) > 0),
  tipo            text not null default 'GRAO'
                  check (tipo in ('GRAO', 'EXTRATO', 'EXTRATO_SECO', 'ACUCAR', 'FRUTA', 'SUCO', 'MEL', 'OUTRO')),
  grupo           text check (grupo in ('BASE', 'CARAMELO', 'FLOCO', 'TORRADO', 'ESPECIAL', 'DEFUMADO', 'ADJUNTO')),
  produtor        text,
  origem          text,
  rendimento_pct  numeric not null check (rendimento_pct between 0 and 100),   -- extrato potencial, % da sacarose
  cor_srm         numeric not null check (cor_srm >= 0),
  fermentavel_pct numeric not null default 100 check (fermentavel_pct between 0 and 100), -- lactose = 0
  precisa_mostura boolean not null default true,
  max_lote_pct    numeric check (max_lote_pct between 0 and 100),
  notas           text,
  extras          jsonb not null default '{}'::jsonb,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create table public.lupulos (
  id            uuid primary key default gen_random_uuid(),
  dono          uuid references auth.users (id) on delete cascade default auth.uid(),
  nome          text not null check (length(trim(nome)) > 0),
  produtor      text,
  origem        text,
  ano           int check (ano between 1900 and 2100),
  forma         text not null default 'PELLET' check (forma in ('PELLET', 'FLOR', 'PLUG', 'EXTRATO', 'CRIO', 'OUTRO')),
  alfa_pct      numeric not null check (alfa_pct between 0 and 100),
  beta_pct      numeric check (beta_pct between 0 and 100),
  uso           text check (uso in ('AMARGOR', 'AROMA', 'DUPLO')),
  oleo_ml_100g  numeric check (oleo_ml_100g >= 0),
  substitutos   text,
  notas         text,
  extras        jsonb not null default '{}'::jsonb,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.leveduras (
  id                    uuid primary key default gen_random_uuid(),
  dono                  uuid references auth.users (id) on delete cascade default auth.uid(),
  nome                  text not null check (length(trim(nome)) > 0),
  produtor              text,
  codigo_produto        text,
  tipo                  text not null default 'ALE'
                        check (tipo in ('ALE', 'LAGER', 'KVEIK', 'TRIGO', 'BRETT', 'LACTO', 'PEDIO', 'MISTA',
                                        'VINHO', 'HIDROMEL', 'SIDRA', 'OUTRO')),
  forma                 text not null default 'SECA' check (forma in ('SECA', 'LIQUIDA', 'SLANT', 'CULTURA')),
  temp_min_c            numeric check (temp_min_c between -5 and 50),
  temp_max_c            numeric check (temp_max_c between -5 and 50),
  atenuacao_min_pct     numeric check (atenuacao_min_pct between 0 and 100),
  atenuacao_max_pct     numeric check (atenuacao_max_pct between 0 and 100),
  floculacao            text check (floculacao in ('BAIXA', 'MEDIA_BAIXA', 'MEDIA', 'MEDIA_ALTA', 'ALTA', 'MUITO_ALTA')),
  tolerancia_alcool_pct numeric check (tolerancia_alcool_pct between 0 and 100),
  pof                   boolean,
  notas                 text,
  extras                jsonb not null default '{}'::jsonb,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  check (temp_min_c <= temp_max_c), check (atenuacao_min_pct <= atenuacao_max_pct)
);

create table public.outros (
  id            uuid primary key default gen_random_uuid(),
  dono          uuid references auth.users (id) on delete cascade default auth.uid(),
  nome          text not null check (length(trim(nome)) > 0),
  tipo          text not null default 'OUTRO'
                check (tipo in ('TEMPERO', 'CLARIFICANTE', 'SAL_AGUA', 'ERVA', 'SABOR', 'NUTRIENTE', 'ACIDO', 'OUTRO')),
  uso_para      text,
  notas         text,
  extras        jsonb not null default '{}'::jsonb,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.aguas (
  id              uuid primary key default gen_random_uuid(),
  dono            uuid references auth.users (id) on delete cascade default auth.uid(),
  nome            text not null check (length(trim(nome)) > 0),
  calcio_ppm      numeric not null default 0 check (calcio_ppm >= 0),
  magnesio_ppm    numeric not null default 0 check (magnesio_ppm >= 0),
  sodio_ppm       numeric not null default 0 check (sodio_ppm >= 0),
  sulfato_ppm     numeric not null default 0 check (sulfato_ppm >= 0),
  cloreto_ppm     numeric not null default 0 check (cloreto_ppm >= 0),
  bicarbonato_ppm numeric not null default 0 check (bicarbonato_ppm >= 0),
  ph              numeric check (ph between 0 and 14),
  notas           text,
  extras          jsonb not null default '{}'::jsonb,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

-- Equipamento é sempre particular.
create table public.equipamentos (
  id                     uuid primary key default gen_random_uuid(),
  dono                   uuid not null references auth.users (id) on delete cascade default auth.uid(),
  nome                   text not null check (length(trim(nome)) > 0),
  volume_lote_l          numeric not null check (volume_lote_l > 0),          -- volume no fermentador
  volume_panela_l        numeric check (volume_panela_l > 0),
  evaporacao_l_h         numeric not null default 3 check (evaporacao_l_h >= 0),
  perda_panela_l         numeric not null default 1 check (perda_panela_l >= 0),       -- trub + chiller
  perda_tina_l           numeric not null default 0 check (perda_tina_l >= 0),         -- espaço morto da tina
  perda_fermentador_l    numeric not null default 0.5 check (perda_fermentador_l >= 0),
  absorcao_grao_l_kg     numeric not null default 1.0 check (absorcao_grao_l_kg >= 0),
  eficiencia_pct         numeric not null default 72 check (eficiencia_pct between 0 and 100),
  relacao_agua_grao_l_kg numeric not null default 3.0 check (relacao_agua_grao_l_kg > 0),
  notas                  text,
  extras                 jsonb not null default '{}'::jsonb,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now()
);

-- =====================================================================
-- Receitas
-- Os parâmetros de cálculo são COPIADOS do equipamento (editáveis): a receita não muda se o
-- equipamento mudar, e quem lê uma receita pública consegue recalcular sem ver o equipamento.
-- =====================================================================
create table public.receitas (
  id                 uuid primary key default gen_random_uuid(),
  dono               uuid not null references auth.users (id) on delete cascade default auth.uid(),
  nome               text not null check (length(trim(nome)) > 0),
  tipo               text not null default 'ALL_GRAIN' check (tipo in ('ALL_GRAIN', 'EXTRATO', 'PARCIAL')),
  autor              text,
  estilo_id          uuid references public.estilos (id) on delete set null,
  equipamento_id     uuid references public.equipamentos (id) on delete set null,
  volume_lote_l      numeric not null default 20 check (volume_lote_l > 0),
  eficiencia_pct     numeric not null default 72 check (eficiencia_pct between 0 and 100),
  fervura_min        int not null default 60 check (fervura_min >= 0),
  evaporacao_l_h     numeric not null default 3 check (evaporacao_l_h >= 0),
  perda_panela_l     numeric not null default 1 check (perda_panela_l >= 0),
  absorcao_grao_l_kg numeric not null default 1.0 check (absorcao_grao_l_kg >= 0),
  temp_grao_c        numeric not null default 20 check (temp_grao_c between -10 and 60),
  -- Resultados gravados pelo portal (calculos.js), só para listas e filtros.
  og_calc            numeric,
  fg_calc            numeric,
  abv_calc_pct       numeric,
  ibu_calc           numeric,
  cor_srm_calc       numeric,
  publica            boolean not null default false,  -- true = qualquer usuário logado lê
  notas              text,
  extras             jsonb not null default '{}'::jsonb,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);

-- Adições: cada linha guarda uma CÓPIA dos dados do ingrediente (nome, alfa, cor...).
-- Campo de cópia enviado nulo é preenchido pelo cadastro (gatilho); mudar o cadastro não altera receitas.
create table public.receita_fermentaveis (
  id              uuid primary key default gen_random_uuid(),
  receita_id      uuid not null references public.receitas (id) on delete cascade,
  fermentavel_id  uuid references public.fermentaveis (id) on delete set null,
  ordem           int not null default 0,
  nome            text not null,
  tipo            text not null
                  check (tipo in ('GRAO', 'EXTRATO', 'EXTRATO_SECO', 'ACUCAR', 'FRUTA', 'SUCO', 'MEL', 'OUTRO')),
  rendimento_pct  numeric not null check (rendimento_pct between 0 and 100),
  cor_srm         numeric not null check (cor_srm >= 0),
  fermentavel_pct numeric not null check (fermentavel_pct between 0 and 100),  -- nulo = cadastro (ou 100)
  quantidade_kg   numeric not null check (quantidade_kg > 0),
  etapa           text not null default 'MOSTURA' check (etapa in ('MOSTURA', 'FERVURA', 'FERMENTACAO', 'ENVASE')),
  criado_em       timestamptz not null default now()
);

create table public.receita_lupulos (
  id            uuid primary key default gen_random_uuid(),
  receita_id    uuid not null references public.receitas (id) on delete cascade,
  lupulo_id     uuid references public.lupulos (id) on delete set null,
  ordem         int not null default 0,
  nome          text not null,
  forma         text not null check (forma in ('PELLET', 'FLOR', 'PLUG', 'EXTRATO', 'CRIO', 'OUTRO')),
  alfa_pct      numeric not null check (alfa_pct between 0 and 100),
  quantidade_g  numeric not null check (quantidade_g > 0),
  etapa         text not null default 'FERVURA'
                check (etapa in ('MOSTURA', 'PRIMEIRO_MOSTO', 'FERVURA', 'WHIRLPOOL', 'DRY_HOP', 'ENVASE')),
  tempo_min     numeric check (tempo_min >= 0),        -- fervura: minutos até o fim; whirlpool: duração
  temperatura_c numeric check (temperatura_c between 0 and 100),  -- whirlpool
  dia           int check (dia >= 0),                  -- dry hop: dia da fermentação
  criado_em     timestamptz not null default now(),
  check (etapa <> 'FERVURA' or tempo_min is not null)
);

create table public.receita_leveduras (
  id            uuid primary key default gen_random_uuid(),
  receita_id    uuid not null references public.receitas (id) on delete cascade,
  levedura_id   uuid references public.leveduras (id) on delete set null,
  ordem         int not null default 0,
  nome          text not null,
  tipo          text not null
                check (tipo in ('ALE', 'LAGER', 'KVEIK', 'TRIGO', 'BRETT', 'LACTO', 'PEDIO', 'MISTA',
                                'VINHO', 'HIDROMEL', 'SIDRA', 'OUTRO')),
  forma         text not null check (forma in ('SECA', 'LIQUIDA', 'SLANT', 'CULTURA')),
  atenuacao_pct numeric check (atenuacao_pct between 0 and 100),  -- nulo no cadastro = média mín./máx.
  quantidade    numeric check (quantidade > 0),
  unidade       text check (unidade in ('G', 'PACOTE', 'ML', 'BILHOES_CELULAS', 'UN')),
  etapa         text not null default 'PRIMARIA' check (etapa in ('PRIMARIA', 'SECUNDARIA', 'ENVASE')),
  criado_em     timestamptz not null default now()
);

create table public.receita_outros (
  id         uuid primary key default gen_random_uuid(),
  receita_id uuid not null references public.receitas (id) on delete cascade,
  outro_id   uuid references public.outros (id) on delete set null,
  ordem      int not null default 0,
  nome       text not null,
  tipo       text not null
             check (tipo in ('TEMPERO', 'CLARIFICANTE', 'SAL_AGUA', 'ERVA', 'SABOR', 'NUTRIENTE', 'ACIDO', 'OUTRO')),
  quantidade numeric not null check (quantidade > 0),
  unidade    text not null check (unidade in ('G', 'KG', 'ML', 'L', 'UN', 'COLHER_CHA', 'COLHER_SOPA')),
  etapa      text not null default 'FERVURA' check (etapa in ('MOSTURA', 'FERVURA', 'FERMENTACAO', 'ENVASE')),
  tempo_min  numeric check (tempo_min >= 0),
  criado_em  timestamptz not null default now()
);

create table public.receita_mostura_passos (
  id                    uuid primary key default gen_random_uuid(),
  receita_id            uuid not null references public.receitas (id) on delete cascade,
  ordem                 int not null default 0,
  nome                  text not null check (length(trim(nome)) > 0),
  tipo                  text not null default 'INFUSAO'
                        check (tipo in ('INFUSAO', 'TEMPERATURA', 'DECOCCAO', 'MASH_OUT', 'LAVAGEM')),
  temperatura_c         numeric not null check (temperatura_c between 0 and 100),
  tempo_min             int not null check (tempo_min >= 0),
  rampa_min             int check (rampa_min >= 0),
  volume_agua_l         numeric check (volume_agua_l >= 0),
  temperatura_infusao_c numeric check (temperatura_infusao_c between 0 and 100),
  criado_em             timestamptz not null default now()
);

create table public.receita_fermentacao_passos (
  id                uuid primary key default gen_random_uuid(),
  receita_id        uuid not null references public.receitas (id) on delete cascade,
  ordem             int not null default 0,
  nome              text not null check (length(trim(nome)) > 0),
  temperatura_c     numeric not null check (temperatura_c between -5 and 50),
  temperatura_fim_c numeric check (temperatura_fim_c between -5 and 50),
  dias              numeric not null check (dias >= 0),
  criado_em         timestamptz not null default now()
);

-- =====================================================================
-- Índices (dono e todas as chaves estrangeiras)
-- =====================================================================
create index estilos_dono       on public.estilos (dono);
create index fermentaveis_dono  on public.fermentaveis (dono);
create index lupulos_dono       on public.lupulos (dono);
create index leveduras_dono     on public.leveduras (dono);
create index outros_dono        on public.outros (dono);
create index aguas_dono         on public.aguas (dono);
create index equipamentos_dono  on public.equipamentos (dono);
create index receitas_dono      on public.receitas (dono);
create index receitas_publica   on public.receitas (publica) where publica;
create index receitas_estilo    on public.receitas (estilo_id);
create index receitas_equipamento on public.receitas (equipamento_id);
create index receita_fermentaveis_receita on public.receita_fermentaveis (receita_id);
create index receita_fermentaveis_item    on public.receita_fermentaveis (fermentavel_id);
create index receita_lupulos_receita      on public.receita_lupulos (receita_id);
create index receita_lupulos_item         on public.receita_lupulos (lupulo_id);
create index receita_leveduras_receita    on public.receita_leveduras (receita_id);
create index receita_leveduras_item       on public.receita_leveduras (levedura_id);
create index receita_outros_receita       on public.receita_outros (receita_id);
create index receita_outros_item          on public.receita_outros (outro_id);
create index receita_mostura_passos_receita     on public.receita_mostura_passos (receita_id);
create index receita_fermentacao_passos_receita on public.receita_fermentacao_passos (receita_id);

-- =====================================================================
-- Gatilhos: atualizado_em
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['estilos', 'fermentaveis', 'lupulos', 'leveduras', 'outros', 'aguas',
                           'equipamentos', 'receitas'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.tocar_atualizado_em()',
                   t || '_atualizado_em', t);
  end loop;
end $$;

-- =====================================================================
-- Gatilhos: referência só a item VISÍVEL ao usuário + cópia dos dados do cadastro.
-- Rodam com os direitos de quem grava (sem security definer): a RLS do cadastro vale na leitura,
-- então ninguém usa (nem descobre o conteúdo de) ingrediente particular de outro usuário.
-- =====================================================================
create or replace function public.receitas_validar_refs()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estilo_id is not null and (tg_op = 'INSERT' or new.estilo_id is distinct from old.estilo_id)
     and not exists (select 1 from public.estilos e where e.id = new.estilo_id) then
    raise exception 'Estilo não encontrado' using errcode = 'P0002';
  end if;
  if new.equipamento_id is not null and (tg_op = 'INSERT' or new.equipamento_id is distinct from old.equipamento_id)
     and not exists (select 1 from public.equipamentos q where q.id = new.equipamento_id) then
    raise exception 'Equipamento não encontrado' using errcode = 'P0002';
  end if;
  return new;
end;
$$;
create trigger receitas_validar_refs before insert or update on public.receitas
for each row execute function public.receitas_validar_refs();

create or replace function public.receita_fermentaveis_copiar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare f public.fermentaveis;
begin
  if new.fermentavel_id is null or (tg_op = 'UPDATE' and new.fermentavel_id is not distinct from old.fermentavel_id) then
    new.fermentavel_pct := coalesce(new.fermentavel_pct, 100);
    return new;
  end if;
  select * into f from public.fermentaveis where id = new.fermentavel_id;
  if not found then
    raise exception 'Fermentável não encontrado' using errcode = 'P0002';
  end if;
  new.nome            := coalesce(new.nome, f.nome);
  new.tipo            := coalesce(new.tipo, f.tipo);
  new.rendimento_pct  := coalesce(new.rendimento_pct, f.rendimento_pct);
  new.cor_srm         := coalesce(new.cor_srm, f.cor_srm);
  new.fermentavel_pct := coalesce(new.fermentavel_pct, f.fermentavel_pct);
  return new;
end;
$$;
create trigger receita_fermentaveis_copiar before insert or update on public.receita_fermentaveis
for each row execute function public.receita_fermentaveis_copiar();

create or replace function public.receita_lupulos_copiar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare l public.lupulos;
begin
  if new.lupulo_id is null or (tg_op = 'UPDATE' and new.lupulo_id is not distinct from old.lupulo_id) then
    return new;
  end if;
  select * into l from public.lupulos where id = new.lupulo_id;
  if not found then
    raise exception 'Lúpulo não encontrado' using errcode = 'P0002';
  end if;
  new.nome     := coalesce(new.nome, l.nome);
  new.forma    := coalesce(new.forma, l.forma);
  new.alfa_pct := coalesce(new.alfa_pct, l.alfa_pct);
  return new;
end;
$$;
create trigger receita_lupulos_copiar before insert or update on public.receita_lupulos
for each row execute function public.receita_lupulos_copiar();

create or replace function public.receita_leveduras_copiar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare y public.leveduras;
begin
  if new.levedura_id is null or (tg_op = 'UPDATE' and new.levedura_id is not distinct from old.levedura_id) then
    return new;
  end if;
  select * into y from public.leveduras where id = new.levedura_id;
  if not found then
    raise exception 'Levedura não encontrada' using errcode = 'P0002';
  end if;
  new.nome          := coalesce(new.nome, y.nome);
  new.tipo          := coalesce(new.tipo, y.tipo);
  new.forma         := coalesce(new.forma, y.forma);
  new.atenuacao_pct := coalesce(new.atenuacao_pct,
                                (y.atenuacao_min_pct + y.atenuacao_max_pct) / 2,
                                y.atenuacao_min_pct, y.atenuacao_max_pct);
  return new;
end;
$$;
create trigger receita_leveduras_copiar before insert or update on public.receita_leveduras
for each row execute function public.receita_leveduras_copiar();

create or replace function public.receita_outros_copiar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare o public.outros;
begin
  if new.outro_id is null or (tg_op = 'UPDATE' and new.outro_id is not distinct from old.outro_id) then
    return new;
  end if;
  select * into o from public.outros where id = new.outro_id;
  if not found then
    raise exception 'Item não encontrado' using errcode = 'P0002';
  end if;
  new.nome := coalesce(new.nome, o.nome);
  new.tipo := coalesce(new.tipo, o.tipo);
  return new;
end;
$$;
create trigger receita_outros_copiar before insert or update on public.receita_outros
for each row execute function public.receita_outros_copiar();

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.perfis enable row level security;
create policy perfis_ler on public.perfis for select to authenticated
  using (user_id = (select auth.uid()) or (select public.eh_admin()));
create policy perfis_editar on public.perfis for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

do $$
declare
  t text;
  pode_gravar constant text := '(dono = (select auth.uid()) or (dono is null and (select public.eh_admin())))';
  pode_ser_dono constant text := '(dono = (select auth.uid()))';
  receita_minha constant text :=
    'exists (select 1 from public.receitas r where r.id = receita_id and r.dono = (select auth.uid()))';
  receita_visivel constant text :=
    'exists (select 1 from public.receitas r where r.id = receita_id and (r.dono = (select auth.uid()) or r.publica))';
begin
  -- Cadastros: sistema (dono nulo) + particulares
  foreach t in array array['estilos', 'fermentaveis', 'lupulos', 'leveduras', 'outros', 'aguas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (dono is null or dono = (select auth.uid()))', t || '_ler', t);
    execute format('create policy %I on public.%I for insert to authenticated with check %s', t || '_incluir', t, pode_gravar);
    execute format('create policy %I on public.%I for update to authenticated using %s with check %s', t || '_editar', t, pode_gravar, pode_gravar);
    execute format('create policy %I on public.%I for delete to authenticated using %s', t || '_excluir', t, pode_gravar);
  end loop;

  -- Equipamentos: só o dono
  execute 'alter table public.equipamentos enable row level security';
  execute format('create policy equipamentos_ler on public.equipamentos for select to authenticated using %s', pode_ser_dono);
  execute format('create policy equipamentos_incluir on public.equipamentos for insert to authenticated with check %s', pode_ser_dono);
  execute format('create policy equipamentos_editar on public.equipamentos for update to authenticated using %s with check %s', pode_ser_dono, pode_ser_dono);
  execute format('create policy equipamentos_excluir on public.equipamentos for delete to authenticated using %s', pode_ser_dono);

  -- Receitas: dono grava; dono ou qualquer logado (se pública) lê
  execute 'alter table public.receitas enable row level security';
  execute 'create policy receitas_ler on public.receitas for select to authenticated using (dono = (select auth.uid()) or publica)';
  execute format('create policy receitas_incluir on public.receitas for insert to authenticated with check %s', pode_ser_dono);
  execute format('create policy receitas_editar on public.receitas for update to authenticated using %s with check %s', pode_ser_dono, pode_ser_dono);
  execute format('create policy receitas_excluir on public.receitas for delete to authenticated using %s', pode_ser_dono);

  -- Partes da receita: seguem a receita
  foreach t in array array['receita_fermentaveis', 'receita_lupulos', 'receita_leveduras', 'receita_outros',
                           'receita_mostura_passos', 'receita_fermentacao_passos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (%s)', t || '_ler', t, receita_visivel);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', t || '_incluir', t, receita_minha);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', t || '_editar', t, receita_minha, receita_minha);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)', t || '_excluir', t, receita_minha);
  end loop;
end $$;

-- =====================================================================
-- Privilégios explícitos (não depender do padrão do projeto)
-- =====================================================================
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

grant select on public.perfis to authenticated;
grant update (nome) on public.perfis to authenticated;   -- papel não: só por SQL

grant select, insert, update, delete on
  public.estilos, public.fermentaveis, public.lupulos, public.leveduras, public.outros, public.aguas,
  public.equipamentos, public.receitas,
  public.receita_fermentaveis, public.receita_lupulos, public.receita_leveduras, public.receita_outros,
  public.receita_mostura_passos, public.receita_fermentacao_passos
to authenticated;

revoke execute on function public.eh_admin() from public, anon;
grant execute on function public.eh_admin() to authenticated;
revoke execute on function public.criar_perfil(), public.tocar_atualizado_em(), public.receitas_validar_refs(),
  public.receita_fermentaveis_copiar(), public.receita_lupulos_copiar(), public.receita_leveduras_copiar(),
  public.receita_outros_copiar()
from public, anon, authenticated;
