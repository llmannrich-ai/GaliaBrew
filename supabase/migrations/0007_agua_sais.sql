-- 0007_agua_sais.sql — química da água no lote (receita = lote, PRD 1.1).
-- A receita guarda CÓPIA dos perfis de água (origem e alvo), como faz com os ingredientes: mudar o cadastro de águas
-- não altera receita antiga. Sais em gramas na água total do dia; os ppm são calculados no portal (calculos.js:
-- perfilAgua). salvar_receita passa a gravar os campos novos.
-- Perfil (jsonb): {"nome", "calcio_ppm", "magnesio_ppm", "sodio_ppm", "sulfato_ppm", "cloreto_ppm", "bicarbonato_ppm"}.
-- Sais (jsonb): [{"sal": "GESSO" | "CLORETO_CALCIO" | "SULFATO_MAGNESIO" | "CLORETO_MAGNESIO" | "CLORETO_SODIO" |
-- "BICARBONATO_SODIO", "gramas": 5.0}].

alter table public.receitas
  add column agua_origem       jsonb check (agua_origem is null or jsonb_typeof(agua_origem) = 'object'),
  add column agua_alvo         jsonb check (agua_alvo is null or jsonb_typeof(agua_alvo) = 'object'),
  add column agua_diluicao_pct numeric check (agua_diluicao_pct between 0 and 100),
  add column sais              jsonb not null default '[]'::jsonb check (jsonb_typeof(sais) = 'array');
comment on column public.receitas.agua_origem is 'Cópia do perfil da água usada (ppm).';
comment on column public.receitas.agua_alvo is 'Cópia do perfil alvo (ppm), só para comparar.';
comment on column public.receitas.agua_diluicao_pct is '% da água trocada por destilada/osmose.';
comment on column public.receitas.sais is 'Sais na água total: [{sal, gramas}].';

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
    og_medida = n.og_medida, fg_medida = n.fg_medida, volume_final_l = n.volume_final_l,
    co2_alvo_vol = n.co2_alvo_vol, priming_acucar = n.priming_acucar,
    agua_origem = n.agua_origem, agua_alvo = n.agua_alvo, agua_diluicao_pct = n.agua_diluicao_pct,
    sais = coalesce(n.sais, '[]'::jsonb)
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
