-- Teste da 0005 (receita = lote): número automático por dono, campos do lote em salvar_receita.
-- Roda como postgres; termina em RAISE EXCEPTION e desfaz tudo. Todas as linhas devem dizer "ok".
do $$
declare
  a    uuid := gen_random_uuid();
  b    uuid := gen_random_uuid();
  r1   uuid;
  r2   uuid;
  r3   uuid;
  rb   uuid;
  txt  text;
  res  text := '';
begin
  insert into auth.users (id, email) values (a, 'teste-a@galiabrew.invalid'), (b, 'teste-b@galiabrew.invalid');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  r1 := public.salvar_receita('{"nome": "Primeira"}'::jsonb);
  r2 := public.salvar_receita('{"nome": "Segunda", "lote_numero": null}'::jsonb);
  select string_agg(lote_numero::text, ',' order by lote_numero) into txt from public.receitas where id in (r1, r2);
  res := res || format(E'\n01 número automático 1, 2: %s', case when txt = '1,2' then 'ok' else 'FALHOU (' || txt || ')' end);

  r3 := public.salvar_receita('{"nome": "Escolhida", "lote_numero": 92}'::jsonb);
  select lote_numero::text into txt from public.receitas where id = r3;
  res := res || format(E'\n02 número informado é mantido: %s', case when txt = '92' then 'ok' else 'FALHOU (' || txt || ')' end);

  perform public.salvar_receita(jsonb_build_object('id', r3, 'nome', 'Escolhida', 'lote_numero', null,
    'data_brassagem', '2026-04-20', 'og_medida', 1.064, 'fg_medida', 1.011, 'volume_final_l', 17.5));
  select concat_ws('|', lote_numero, data_brassagem, og_medida, fg_medida, volume_final_l) into txt from public.receitas where id = r3;
  res := res || format(E'\n03 campos do lote gravados; número nulo não apaga: %s',
    case when txt = '92|2026-04-20|1.064|1.011|17.5' then 'ok' else 'FALHOU (' || txt || ')' end);

  begin
    perform public.salvar_receita(jsonb_build_object('id', r3, 'og_medida', 1064));
    res := res || E'\n04 OG medida fora da faixa é recusada: FALHOU';
  exception when check_violation then
    res := res || E'\n04 OG medida fora da faixa é recusada: ok';
  end;

  -- B tem a própria numeração e não enxerga o lote de A.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  rb := public.salvar_receita('{"nome": "Lote de B"}'::jsonb);
  select lote_numero::text into txt from public.receitas where id = rb;
  res := res || format(E'\n05 numeração é por dono (B começa em 1): %s', case when txt = '1' then 'ok' else 'FALHOU (' || txt || ')' end);
  select count(*)::text into txt from public.receitas where id = r3;
  res := res || format(E'\n06 B não lê a receita privada de A: %s', case when txt = '0' then 'ok' else 'FALHOU' end);

  -- Receita nova de A depois do 92 recebe 93.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  r1 := public.salvar_receita('{"nome": "Terceira"}'::jsonb);
  select lote_numero::text into txt from public.receitas where id = r1;
  res := res || format(E'\n07 próximo número = maior + 1: %s', case when txt = '93' then 'ok' else 'FALHOU (' || txt || ')' end);

  begin
    perform public.receitas_numerar();
    res := res || E'\n08 função do gatilho não é chamável: FALHOU';
  exception when others then
    res := res || E'\n08 função do gatilho não é chamável: ok';
  end;
  reset role;

  raise exception 'RESULTADO DO TESTE (tudo desfeito):%', res;
end $$;
