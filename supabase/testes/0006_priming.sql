-- Teste da 0006 (priming no lote). Roda como postgres; termina em RAISE EXCEPTION e desfaz tudo. Tudo "ok".
do $$
declare
  a    uuid := gen_random_uuid();
  r1   uuid;
  txt  text;
  res  text := '';
begin
  insert into auth.users (id, email) values (a, 'teste-a@galiabrew.invalid');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  r1 := public.salvar_receita('{"nome": "Lote", "co2_alvo_vol": 2.4, "priming_acucar": "DEXTROSE", "og_medida": 1.050}'::jsonb);
  select concat_ws('|', co2_alvo_vol, priming_acucar, og_medida, lote_numero) into txt from public.receitas where id = r1;
  res := res || format(E'\n01 grava CO2 desejado e açúcar (e mantém os campos da 0005): %s',
    case when txt = '2.4|DEXTROSE|1.050|1' then 'ok' else 'FALHOU (' || txt || ')' end);

  perform public.salvar_receita(jsonb_build_object('id', r1, 'nome', 'Lote'));
  select concat_ws('|', co2_alvo_vol, priming_acucar) into txt from public.receitas where id = r1;
  res := res || format(E'\n02 campo não enviado fica como está: %s', case when txt = '2.4|DEXTROSE' then 'ok' else 'FALHOU (' || txt || ')' end);

  begin
    perform public.salvar_receita(jsonb_build_object('id', r1, 'priming_acucar', 'CERVEJA'));
    res := res || E'\n03 açúcar fora da lista é recusado: FALHOU';
  exception when check_violation then
    res := res || E'\n03 açúcar fora da lista é recusado: ok';
  end;

  begin
    perform public.salvar_receita(jsonb_build_object('id', r1, 'co2_alvo_vol', 24));
    res := res || E'\n04 CO2 absurdo (24 vol) é recusado: FALHOU';
  exception when check_violation then
    res := res || E'\n04 CO2 absurdo (24 vol) é recusado: ok';
  end;
  reset role;

  raise exception 'RESULTADO DO TESTE (tudo desfeito):%', res;
end $$;
