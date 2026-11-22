-- 0002_umidade_agua.sql — campos que o cálculo precisa (descobertos no teste contra o Brewtarget, 22/11/2026)
-- 1) Umidade do malte: o rendimento de catálogo é em base seca; sem descontar a umidade (3-5%) a OG sai ~4% alta.
-- 2) Receita: relação água/grão (água da mostura × lavagem) e perda na tina, copiadas do equipamento como os demais
--    parâmetros de cálculo.

alter table public.fermentaveis
  add column umidade_pct numeric not null default 0 check (umidade_pct between 0 and 100);
comment on column public.fermentaveis.rendimento_pct is 'Extrato potencial, % da sacarose, base seca (ficha do malte).';
comment on column public.fermentaveis.umidade_pct is 'Umidade %. Açúcar = kg × rendimento × (1 − umidade).';

alter table public.receita_fermentaveis
  add column umidade_pct numeric check (umidade_pct between 0 and 100);   -- cópia do cadastro (nulo = copiar)

alter table public.receitas
  add column relacao_agua_grao_l_kg numeric not null default 3.0 check (relacao_agua_grao_l_kg > 0),
  add column perda_tina_l numeric not null default 0 check (perda_tina_l >= 0);

-- Gatilho de cópia passa a levar a umidade (sem cadastro: 0).
create or replace function public.receita_fermentaveis_copiar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare f public.fermentaveis;
begin
  if new.fermentavel_id is null or (tg_op = 'UPDATE' and new.fermentavel_id is not distinct from old.fermentavel_id) then
    new.fermentavel_pct := coalesce(new.fermentavel_pct, 100);
    new.umidade_pct     := coalesce(new.umidade_pct, 0);
    return new;
  end if;
  select * into f from public.fermentaveis where id = new.fermentavel_id;
  if not found then
    raise exception 'Fermentável não encontrado' using errcode = 'P0002';
  end if;
  new.nome            := coalesce(new.nome, f.nome);
  new.tipo            := coalesce(new.tipo, f.tipo);
  new.rendimento_pct  := coalesce(new.rendimento_pct, f.rendimento_pct);
  new.umidade_pct     := coalesce(new.umidade_pct, f.umidade_pct);
  new.cor_srm         := coalesce(new.cor_srm, f.cor_srm);
  new.fermentavel_pct := coalesce(new.fermentavel_pct, f.fermentavel_pct);
  return new;
end;
$$;
revoke execute on function public.receita_fermentaveis_copiar() from public, anon, authenticated;

-- Sem linhas ainda; o not null vem depois do default do gatilho.
alter table public.receita_fermentaveis alter column umidade_pct set not null;
