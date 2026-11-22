-- Teste da 0007 (água e sais no lote). Roda como postgres; termina em RAISE EXCEPTION e desfaz tudo. Tudo "ok".
do $$
declare
  a    uuid := gen_random_uuid();
  b    uuid := gen_random_uuid();
  r1   uuid;
  txt  text;
  res  text := '';
begin
  insert into auth.users (id, email) values (a, 'teste-a@galiabrew.invalid'), (b, 'teste-b@galiabrew.invalid');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  r1 := public.salvar_receita(jsonb_build_object('nome', 'Lote', 'co2_alvo_vol', 2.4,
    'agua_origem', jsonb_build_object('nome', 'Minha torneira', 'calcio_ppm', 20, 'bicarbonato_ppm', 80),
    'agua_alvo', jsonb_build_object('nome', 'Alvo IPA', 'sulfato_ppm', 250),
    'agua_diluicao_pct', 25,
    'sais', jsonb_build_array(jsonb_build_object('sal', 'GESSO', 'gramas', 6), jsonb_build_object('sal', 'CLORETO_CALCIO', 'gramas', 2))));
  select concat_ws('|', agua_origem ->> 'nome', agua_alvo ->> 'sulfato_ppm', agua_diluicao_pct, jsonb_array_length(sais), sais -> 0 ->> 'sal', co2_alvo_vol)
    into txt from public.receitas where id = r1;
  res := res || format(E'\n01 grava cópia da água, alvo, diluição e sais (e mantém a 0006): %s',
    case when txt = 'Minha torneira|250|25|2|GESSO|2.4' then 'ok' else 'FALHOU (' || txt || ')' end);

  perform public.salvar_receita(jsonb_build_object('id', r1, 'nome', 'Lote'));
  select jsonb_array_length(sais)::text into txt from public.receitas where id = r1;
  res := res || format(E'\n02 sais não enviados ficam como estão: %s', case when txt = '2' then 'ok' else 'FALHOU (' || txt || ')' end);

  perform public.salvar_receita(jsonb_build_object('id', r1, 'sais', null));
  select sais::text into txt from public.receitas where id = r1;
  res := res || format(E'\n03 sais nulo vira lista vazia: %s', case when txt = '[]' then 'ok' else 'FALHOU (' || txt || ')' end);

  begin
    perform public.salvar_receita(jsonb_build_object('id', r1, 'sais', jsonb_build_object('sal', 'GESSO')));
    res := res || E'\n04 sais que não são lista são recusados: FALHOU';
  exception when check_violation then
    res := res || E'\n04 sais que não são lista são recusados: ok';
  end;

  begin
    perform public.salvar_receita(jsonb_build_object('id', r1, 'agua_diluicao_pct', 150));
    res := res || E'\n05 diluição acima de 100% é recusada: FALHOU';
  exception when check_violation then
    res := res || E'\n05 diluição acima de 100% é recusada: ok';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*)::text into txt from public.receitas where id = r1;
  res := res || format(E'\n06 B não lê a água da receita privada de A: %s', case when txt = '0' then 'ok' else 'FALHOU' end);
  reset role;

  raise exception 'RESULTADO DO TESTE (tudo desfeito):%', res;
end $$;
