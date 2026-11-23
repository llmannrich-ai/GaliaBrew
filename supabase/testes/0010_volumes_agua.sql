-- Teste da 0010 (água da mostura e da lavagem informadas). Roda como postgres; termina em RAISE EXCEPTION e desfaz
-- tudo. Tudo "ok".
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

  r1 := public.salvar_receita(jsonb_build_object('nome', 'Lote', 'agua_mostura_l', 16.5, 'agua_lavagem_l', 14,
    'acidos', jsonb_build_array(jsonb_build_object('acido', 'LATICO_88', 'ml', 2))));
  select concat_ws('|', agua_mostura_l, agua_lavagem_l, jsonb_array_length(acidos)) into txt from public.receitas where id = r1;
  res := res || format(E'\n01 grava água da mostura e da lavagem (e mantém os ácidos da 0008): %s',
    case when txt = '16.5|14|1' then 'ok' else 'FALHOU (' || txt || ')' end);

  perform public.salvar_receita(jsonb_build_object('id', r1, 'nome', 'Lote'));
  select concat_ws('|', agua_mostura_l, agua_lavagem_l) into txt from public.receitas where id = r1;
  res := res || format(E'\n02 campos não enviados ficam como estão: %s', case when txt = '16.5|14' then 'ok' else 'FALHOU (' || txt || ')' end);

  perform public.salvar_receita(jsonb_build_object('id', r1, 'agua_mostura_l', null, 'agua_lavagem_l', 0));
  select concat_ws('|', coalesce(agua_mostura_l::text, 'nulo'), agua_lavagem_l) into txt from public.receitas where id = r1;
  res := res || format(E'\n03 mostura nula (= sugestão) e lavagem 0 (sem lavagem): %s', case when txt = 'nulo|0' then 'ok' else 'FALHOU (' || txt || ')' end);

  begin
    perform public.salvar_receita(jsonb_build_object('id', r1, 'agua_mostura_l', 0));
    res := res || E'\n04 água da mostura 0 é recusada: FALHOU';
  exception when check_violation then
    res := res || E'\n04 água da mostura 0 é recusada: ok';
  end;

  begin
    perform public.salvar_receita(jsonb_build_object('id', r1, 'agua_lavagem_l', -1));
    res := res || E'\n05 água de lavagem negativa é recusada: FALHOU';
  exception when check_violation then
    res := res || E'\n05 água de lavagem negativa é recusada: ok';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*)::text into txt from public.receitas where id = r1;
  res := res || format(E'\n06 B não lê a receita privada de A: %s', case when txt = '0' then 'ok' else 'FALHOU' end);
  begin
    perform public.salvar_receita(jsonb_build_object('id', r1, 'agua_mostura_l', 99));
    res := res || E'\n07 B não grava os volumes na receita de A: FALHOU';
  exception when sqlstate 'P0002' then
    res := res || E'\n07 B não grava os volumes na receita de A: ok';
  end;
  reset role;

  raise exception 'RESULTADO DO TESTE (tudo desfeito):%', res;
end $$;
