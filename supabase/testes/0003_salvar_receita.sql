-- Teste da função salvar_receita (0003). Roda como postgres; termina em RAISE EXCEPTION e desfaz tudo.
do $$
declare
  a     uuid := gen_random_uuid();
  b     uuid := gen_random_uuid();
  f_sis uuid;
  h_sis uuid;
  r_a   uuid;
  r2    uuid;
  n     int;
  txt   text;
  res   text := '';
begin
  insert into auth.users (id, email) values (a, 'teste-a@galiabrew.invalid'), (b, 'teste-b@galiabrew.invalid');
  insert into public.fermentaveis (dono, nome, tipo, rendimento_pct, cor_srm, umidade_pct)
  values (null, 'Pilsen (sistema)', 'GRAO', 80, 1.8, 4) returning id into f_sis;
  insert into public.lupulos (dono, nome, forma, alfa_pct) values (null, 'Saaz (sistema)', 'PELLET', 3.5)
  returning id into h_sis;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  r_a := public.salvar_receita(jsonb_build_object(
    'nome', 'Pils A', 'volume_lote_l', 23, 'dono', b, 'publica', false,
    'fermentaveis', jsonb_build_array(
      jsonb_build_object('fermentavel_id', f_sis, 'quantidade_kg', 5),
      jsonb_build_object('nome', 'Açúcar', 'tipo', 'ACUCAR', 'rendimento_pct', 100, 'cor_srm', 0, 'quantidade_kg', 0.3, 'etapa', 'FERVURA')),
    'lupulos', jsonb_build_array(
      jsonb_build_object('lupulo_id', h_sis, 'quantidade_g', 40, 'tempo_min', 60),
      jsonb_build_object('lupulo_id', h_sis, 'alfa_pct', 4.1, 'quantidade_g', 20, 'tempo_min', 10)),
    'leveduras', jsonb_build_array(jsonb_build_object('nome', 'W-34/70', 'tipo', 'LAGER', 'forma', 'SECA', 'atenuacao_pct', 80)),
    'mostura', jsonb_build_array(jsonb_build_object('nome', 'Sacarificação', 'temperatura_c', 65, 'tempo_min', 60))));

  select dono = a and volume_lote_l = 23 into strict txt from public.receitas where id = r_a;
  res := res || format(E'\n01 receita nova é de quem grava (campo dono enviado é ignorado): %s', case when txt = 'true' then 'ok' else 'FALHOU' end);
  select string_agg(nome || '|' || ordem || '|' || etapa || '|' || umidade_pct, ';' order by ordem) into txt
  from public.receita_fermentaveis where receita_id = r_a;
  res := res || format(E'\n02 fermentáveis na ordem, cópia do cadastro e etapa padrão: %s',
    case when txt = 'Pilsen (sistema)|0|MOSTURA|4;Açúcar|1|FERVURA|0' then 'ok' else 'FALHOU (' || txt || ')' end);
  select string_agg(nome || '|' || alfa_pct, ';' order by ordem) into txt from public.receita_lupulos where receita_id = r_a;
  res := res || format(E'\n03 lúpulo: cópia do alfa, ou o alfa do lote informado: %s',
    case when txt = 'Saaz (sistema)|3.5;Saaz (sistema)|4.1' then 'ok' else 'FALHOU (' || txt || ')' end);

  -- Editar: troca o nome, deixa só um fermentável, não manda lúpulos (ficam como estão).
  r2 := public.salvar_receita(jsonb_build_object('id', r_a, 'nome', 'Pils A v2',
    'fermentaveis', jsonb_build_array(jsonb_build_object('fermentavel_id', f_sis, 'quantidade_kg', 5.5))));
  select count(*) into n from public.receita_fermentaveis where receita_id = r_a;
  res := res || format(E'\n04 edição substitui as partes enviadas: %s', case when r2 = r_a and n = 1 then 'ok' else 'FALHOU (' || n || ')' end);
  select count(*) into n from public.receita_lupulos where receita_id = r_a;
  res := res || format(E'\n05 parte não enviada fica como está: %s', case when n = 2 then 'ok' else 'FALHOU (' || n || ')' end);
  select nome || '|' || volume_lote_l into txt from public.receitas where id = r_a;
  res := res || format(E'\n06 campo não enviado no cabeçalho fica como está: %s', case when txt = 'Pils A v2|23' then 'ok' else 'FALHOU (' || txt || ')' end);

  begin
    perform public.salvar_receita(jsonb_build_object('nome', 'quebrada',
      'fermentaveis', jsonb_build_array(jsonb_build_object('nome', 'x', 'tipo', 'GRAO', 'rendimento_pct', 80, 'cor_srm', 2, 'quantidade_kg', -1))));
    res := res || E'\n07 erro numa parte desfaz a receita inteira: FALHOU (gravou)';
  exception when others then
    select count(*) into n from public.receitas where nome = 'quebrada';
    res := res || format(E'\n07 erro numa parte desfaz a receita inteira: %s', case when n = 0 then 'ok' else 'FALHOU' end);
  end;

  -- B tenta gravar por cima da receita de A.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  begin
    perform public.salvar_receita(jsonb_build_object('id', r_a, 'nome', 'invadida'));
    res := res || E'\n08 B não grava na receita de A: FALHOU';
  exception when others then
    res := res || E'\n08 B não grava na receita de A: ok (' || sqlerrm || ')';
  end;

  reset role;
  select nome into txt from public.receitas where id = r_a;
  res := res || format(E'\n09 receita de A intacta: %s', case when txt = 'Pils A v2' then 'ok' else 'FALHOU (' || txt || ')' end);

  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin
    perform public.salvar_receita('{"nome": "anon"}'::jsonb);
    res := res || E'\n10 sem login não chama a função: FALHOU';
  exception when others then
    res := res || E'\n10 sem login não chama a função: ok (' || sqlerrm || ')';
  end;
  reset role;

  raise exception 'RESULTADO DO TESTE (tudo desfeito):%', res;
end $$;
