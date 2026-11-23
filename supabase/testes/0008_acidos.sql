-- Teste da 0008 (ácidos no lote). Roda como postgres; termina em RAISE EXCEPTION e desfaz tudo. Tudo "ok".
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

  r1 := public.salvar_receita(jsonb_build_object('nome', 'Lote',
    'sais', jsonb_build_array(jsonb_build_object('sal', 'GESSO', 'gramas', 4)),
    'acidos', jsonb_build_array(jsonb_build_object('acido', 'LATICO_88', 'ml', 3))));
  select concat_ws('|', acidos -> 0 ->> 'acido', acidos -> 0 ->> 'ml', jsonb_array_length(sais)) into txt from public.receitas where id = r1;
  res := res || format(E'\n01 grava os ácidos (e mantém os sais da 0007): %s', case when txt = 'LATICO_88|3|1' then 'ok' else 'FALHOU (' || txt || ')' end);

  perform public.salvar_receita(jsonb_build_object('id', r1, 'nome', 'Lote'));
  select jsonb_array_length(acidos)::text into txt from public.receitas where id = r1;
  res := res || format(E'\n02 ácidos não enviados ficam como estão: %s', case when txt = '1' then 'ok' else 'FALHOU (' || txt || ')' end);

  perform public.salvar_receita(jsonb_build_object('id', r1, 'acidos', null));
  select acidos::text into txt from public.receitas where id = r1;
  res := res || format(E'\n03 ácidos nulo vira lista vazia: %s', case when txt = '[]' then 'ok' else 'FALHOU (' || txt || ')' end);

  begin
    perform public.salvar_receita(jsonb_build_object('id', r1, 'acidos', '"LATICO_88"'::jsonb));
    res := res || E'\n04 ácidos que não são lista são recusados: FALHOU';
  exception when check_violation then
    res := res || E'\n04 ácidos que não são lista são recusados: ok';
  end;
  reset role;

  raise exception 'RESULTADO DO TESTE (tudo desfeito):%', res;
end $$;
