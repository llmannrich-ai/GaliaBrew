-- 0005_receita_lote.sql — CADA RECEITA É UM LOTE (decisão de 22/11/2026, PRD 1.1).
-- Não há módulo de brassagem: o que aconteceu no lote fica na própria receita.
-- 1) Campos do lote: número, data da brassagem, OG e FG medidas, volume final real no fermentador.
-- 2) Número automático: receita nova sem número recebe o próximo do dono (gatilho sem security definer: a RLS vale).
-- 3) salvar_receita passa a gravar os campos novos (número enviado nulo mantém o atual).
-- 4) Receitas existentes: número e data tirados do nome quando houver (ex.: "92 - Blond ... 20/04/26").

alter table public.receitas
  add column lote_numero    int check (lote_numero > 0),
  add column data_brassagem date,
  add column og_medida      numeric check (og_medida between 0.98 and 1.2),
  add column fg_medida      numeric check (fg_medida between 0.98 and 1.2),
  add column volume_final_l numeric check (volume_final_l > 0);
comment on column public.receitas.lote_numero is 'Número do lote do dono (automático na criação; pode repetir, ex.: 83a e 83b).';
comment on column public.receitas.volume_final_l is 'Litros que foram de fato para o fermentador.';

create index receitas_dono_lote on public.receitas (dono, lote_numero);

create or replace function public.receitas_numerar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.lote_numero is null then
    select coalesce(max(lote_numero), 0) + 1 into new.lote_numero from public.receitas where dono = new.dono;
  end if;
  return new;
end;
$$;
revoke execute on function public.receitas_numerar() from public, anon, authenticated;

create trigger receitas_numerar before insert on public.receitas
  for each row execute function public.receitas_numerar();

-- Receitas existentes: número = dígitos do começo do nome; data = primeira dd/mm/aa(aa) válida do nome.
do $$
declare
  x record;
  m text[];
  d date;
begin
  for x in select id, nome from public.receitas loop
    m := regexp_match(x.nome, '^\s*(\d{1,5})');
    d := null;
    declare
      dm text[] := regexp_match(x.nome, '(\d{1,2})/(\d{1,2})/(\d{4}|\d{2})(?!\d)');
    begin
      if dm is not null then
        d := make_date(case when length(dm[3]) = 2 then 2000 + dm[3]::int else dm[3]::int end, dm[2]::int, dm[1]::int);
      end if;
    exception when others then
      d := null;
    end;
    update public.receitas
      set lote_numero = coalesce(lote_numero, (m)[1]::int), data_brassagem = coalesce(data_brassagem, d)
      where id = x.id and (m is not null or d is not null);
  end loop;
end $$;

create or replace function public.salvar_receita(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  r    public.receitas;
  n    public.receitas;
begin
  if (select auth.uid()) is null then
    raise exception 'Login necessário' using errcode = '42501';
  end if;

  if v_id is null then
    insert into public.receitas (nome) values (coalesce(nullif(trim(p ->> 'nome'), ''), 'Nova receita'))
    returning * into r;
  else
    select * into r from public.receitas where id = v_id and dono = (select auth.uid()) for update;
    if not found then
      raise exception 'Receita não encontrada' using errcode = 'P0002';
    end if;
  end if;

  -- Campos ausentes no jsonb ficam como estão (ou com o padrão, na receita nova). id e dono nunca mudam.
  n := jsonb_populate_record(r, p - array['id', 'dono', 'criado_em', 'atualizado_em']);
  update public.receitas set
    nome = n.nome, tipo = n.tipo, autor = n.autor, estilo_id = n.estilo_id, equipamento_id = n.equipamento_id,
    volume_lote_l = n.volume_lote_l, eficiencia_pct = n.eficiencia_pct, fervura_min = n.fervura_min,
    evaporacao_l_h = n.evaporacao_l_h, perda_panela_l = n.perda_panela_l, absorcao_grao_l_kg = n.absorcao_grao_l_kg,
    relacao_agua_grao_l_kg = n.relacao_agua_grao_l_kg, perda_tina_l = n.perda_tina_l, temp_grao_c = n.temp_grao_c,
    og_calc = n.og_calc, fg_calc = n.fg_calc, abv_calc_pct = n.abv_calc_pct, ibu_calc = n.ibu_calc,
    cor_srm_calc = n.cor_srm_calc, publica = n.publica, notas = n.notas, extras = n.extras,
    lote_numero = coalesce(n.lote_numero, r.lote_numero), data_brassagem = n.data_brassagem,
    og_medida = n.og_medida, fg_medida = n.fg_medida, volume_final_l = n.volume_final_l
  where id = r.id;

  if p ? 'fermentaveis' then
    delete from public.receita_fermentaveis where receita_id = r.id;
    insert into public.receita_fermentaveis
      (receita_id, fermentavel_id, ordem, nome, tipo, rendimento_pct, umidade_pct, cor_srm, fermentavel_pct,
       quantidade_kg, etapa)
    select r.id, x.fermentavel_id, e.ord - 1, x.nome, x.tipo, x.rendimento_pct, x.umidade_pct, x.cor_srm,
           x.fermentavel_pct, x.quantidade_kg, coalesce(x.etapa, 'MOSTURA')
    from jsonb_array_elements(coalesce(p -> 'fermentaveis', '[]'::jsonb)) with ordinality as e(j, ord)
    cross join lateral jsonb_populate_record(null::public.receita_fermentaveis, e.j) as x
    order by e.ord;
  end if;

  if p ? 'lupulos' then
    delete from public.receita_lupulos where receita_id = r.id;
    insert into public.receita_lupulos
      (receita_id, lupulo_id, ordem, nome, forma, alfa_pct, quantidade_g, etapa, tempo_min, temperatura_c, dia)
    select r.id, x.lupulo_id, e.ord - 1, x.nome, x.forma, x.alfa_pct, x.quantidade_g, coalesce(x.etapa, 'FERVURA'),
           x.tempo_min, x.temperatura_c, x.dia
    from jsonb_array_elements(coalesce(p -> 'lupulos', '[]'::jsonb)) with ordinality as e(j, ord)
    cross join lateral jsonb_populate_record(null::public.receita_lupulos, e.j) as x
    order by e.ord;
  end if;

  if p ? 'leveduras' then
    delete from public.receita_leveduras where receita_id = r.id;
    insert into public.receita_leveduras
      (receita_id, levedura_id, ordem, nome, tipo, forma, atenuacao_pct, quantidade, unidade, etapa)
    select r.id, x.levedura_id, e.ord - 1, x.nome, x.tipo, x.forma, x.atenuacao_pct, x.quantidade, x.unidade,
           coalesce(x.etapa, 'PRIMARIA')
    from jsonb_array_elements(coalesce(p -> 'leveduras', '[]'::jsonb)) with ordinality as e(j, ord)
    cross join lateral jsonb_populate_record(null::public.receita_leveduras, e.j) as x
    order by e.ord;
  end if;

  if p ? 'outros' then
    delete from public.receita_outros where receita_id = r.id;
    insert into public.receita_outros
      (receita_id, outro_id, ordem, nome, tipo, quantidade, unidade, etapa, tempo_min)
    select r.id, x.outro_id, e.ord - 1, x.nome, x.tipo, x.quantidade, x.unidade, coalesce(x.etapa, 'FERVURA'), x.tempo_min
    from jsonb_array_elements(coalesce(p -> 'outros', '[]'::jsonb)) with ordinality as e(j, ord)
    cross join lateral jsonb_populate_record(null::public.receita_outros, e.j) as x
    order by e.ord;
  end if;

  if p ? 'mostura' then
    delete from public.receita_mostura_passos where receita_id = r.id;
    insert into public.receita_mostura_passos
      (receita_id, ordem, nome, tipo, temperatura_c, tempo_min, rampa_min, volume_agua_l, temperatura_infusao_c)
    select r.id, e.ord - 1, x.nome, coalesce(x.tipo, 'INFUSAO'), x.temperatura_c, x.tempo_min, x.rampa_min,
           x.volume_agua_l, x.temperatura_infusao_c
    from jsonb_array_elements(coalesce(p -> 'mostura', '[]'::jsonb)) with ordinality as e(j, ord)
    cross join lateral jsonb_populate_record(null::public.receita_mostura_passos, e.j) as x
    order by e.ord;
  end if;

  if p ? 'fermentacao' then
    delete from public.receita_fermentacao_passos where receita_id = r.id;
    insert into public.receita_fermentacao_passos
      (receita_id, ordem, nome, temperatura_c, temperatura_fim_c, dias)
    select r.id, e.ord - 1, x.nome, x.temperatura_c, x.temperatura_fim_c, x.dias
    from jsonb_array_elements(coalesce(p -> 'fermentacao', '[]'::jsonb)) with ordinality as e(j, ord)
    cross join lateral jsonb_populate_record(null::public.receita_fermentacao_passos, e.j) as x
    order by e.ord;
  end if;

  return r.id;
end;
$$;

revoke execute on function public.salvar_receita(jsonb) from public, anon;
grant execute on function public.salvar_receita(jsonb) to authenticated;
