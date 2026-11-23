-- Teste da 0011 (fotos da brassagem no Storage). Roda como postgres; termina em RAISE EXCEPTION e desfaz tudo.
-- Tudo "ok". O limite de tamanho e o tipo do arquivo são aplicados pelo serviço de Storage (aqui só se confere que
-- estão configurados no bucket).
do $$
declare
  a    uuid := gen_random_uuid();
  b    uuid := gen_random_uuid();
  r1   uuid;
  r2   uuid;
  n    int;
  txt  text;
  res  text := '';
begin
  insert into auth.users (id, email) values (a, 'teste-a@galiabrew.invalid'), (b, 'teste-b@galiabrew.invalid');

  select concat_ws('|', public, file_size_limit, array_to_string(allowed_mime_types, ',')) into txt from storage.buckets where id = 'fotos-brassagem';
  res := res || format(E'\n01 bucket privado, até 400 kB, só JPEG: %s', case when txt = 'f|409600|image/jpeg' then 'ok' else 'FALHOU (' || coalesce(txt, 'sem bucket') || ')' end);

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r1 := public.salvar_receita(jsonb_build_object('nome', 'Lote com fotos'));
  r2 := public.salvar_receita(jsonb_build_object('nome', 'Outro lote'));

  insert into storage.objects (bucket_id, name) values ('fotos-brassagem', a || '/' || r1 || '/f01.jpg');
  select count(*) into n from storage.objects where bucket_id = 'fotos-brassagem';
  res := res || format(E'\n02 A envia foto na própria receita e lê: %s', case when n = 1 then 'ok' else 'FALHOU (' || n || ')' end);

  begin
    insert into storage.objects (bucket_id, name) values ('fotos-brassagem', b || '/' || r1 || '/x.jpg');
    res := res || E'\n03 A não envia para a pasta de B: FALHOU';
  exception when insufficient_privilege then
    res := res || E'\n03 A não envia para a pasta de B: ok';
  end;

  begin
    insert into storage.objects (bucket_id, name) values ('fotos-brassagem', a || '/' || gen_random_uuid() || '/x.jpg');
    res := res || E'\n04 A não envia para receita que não existe: FALHOU';
  exception when insufficient_privilege then
    res := res || E'\n04 A não envia para receita que não existe: ok';
  end;

  begin
    insert into storage.objects (bucket_id, name) values ('fotos-brassagem', a || '/solta.jpg');
    res := res || E'\n05 caminho fora de <dono>/<receita>/ é recusado: FALHOU';
  exception when insufficient_privilege then
    res := res || E'\n05 caminho fora de <dono>/<receita>/ é recusado: ok';
  end;

  -- Limite por receita: já há 1; cabem mais 11; a 13ª é recusada. Outra receita continua aceitando.
  insert into storage.objects (bucket_id, name)
    select 'fotos-brassagem', a || '/' || r1 || '/f' || to_char(i, 'FM00') || '.jpg' from generate_series(2, 12) i;
  begin
    insert into storage.objects (bucket_id, name) values ('fotos-brassagem', a || '/' || r1 || '/f13.jpg');
    res := res || E'\n06 13ª foto da receita é recusada: FALHOU';
  exception when insufficient_privilege then
    res := res || E'\n06 13ª foto da receita é recusada: ok';
  end;
  insert into storage.objects (bucket_id, name) values ('fotos-brassagem', a || '/' || r2 || '/f01.jpg');
  select count(*) into n from storage.objects where bucket_id = 'fotos-brassagem';
  res := res || format(E'\n07 o limite é por receita (outra receita aceita): %s', case when n = 13 then 'ok' else 'FALHOU (' || n || ')' end);

  -- B: não lê foto de receita privada, não envia na receita de A, não apaga.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from storage.objects where bucket_id = 'fotos-brassagem';
  res := res || format(E'\n08 B não lê as fotos da receita privada de A: %s', case when n = 0 then 'ok' else 'FALHOU (' || n || ')' end);
  begin
    insert into storage.objects (bucket_id, name) values ('fotos-brassagem', b || '/' || r1 || '/x.jpg');
    res := res || E'\n09 B não envia foto na receita de A: FALHOU';
  exception when insufficient_privilege then
    res := res || E'\n09 B não envia foto na receita de A: ok';
  end;
  select public.fotos_cabem(r1::text)::text into txt;
  res := res || format(E'\n10 a contagem de B não enxerga as fotos de A: %s', case when txt = 'true' then 'ok' else 'FALHOU' end);

  -- Receita pública: B lê as fotos dela (só dela), continua sem apagar.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform public.salvar_receita(jsonb_build_object('id', r1, 'publica', true));
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from storage.objects where bucket_id = 'fotos-brassagem';
  res := res || format(E'\n11 B lê as 12 fotos da receita pública (e não a da privada): %s', case when n = 12 then 'ok' else 'FALHOU (' || n || ')' end);
  perform set_config('storage.allow_delete_query', 'true', true);   -- o Storage bloqueia delete por SQL; liberado só nesta transação
  delete from storage.objects where bucket_id = 'fotos-brassagem';
  get diagnostics n = row_count;
  res := res || format(E'\n12 B não apaga foto de A: %s', case when n = 0 then 'ok' else 'FALHOU (' || n || ')' end);
  update storage.objects set name = name || '.x' where bucket_id = 'fotos-brassagem';
  get diagnostics n = row_count;
  res := res || format(E'\n13 ninguém altera foto (sem política de update): %s', case when n = 0 then 'ok' else 'FALHOU (' || n || ')' end);

  -- A apaga as próprias, inclusive depois de excluir a receita.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  delete from public.receitas where id = r2;
  delete from storage.objects where bucket_id = 'fotos-brassagem' and name like a || '/' || r2 || '/%';
  get diagnostics n = row_count;
  res := res || format(E'\n14 A apaga a foto de uma receita já excluída: %s', case when n = 1 then 'ok' else 'FALHOU (' || n || ')' end);
  reset role;

  select count(*) into n from pg_policy where polrelid = 'storage.objects'::regclass and polname like 'fotos_brassagem_%' and polroles = array[(select oid from pg_roles where rolname = 'authenticated')];
  res := res || format(E'\n15 3 políticas, todas só para authenticated: %s', case when n = 3 then 'ok' else 'FALHOU (' || n || ')' end);
  select concat_ws('|', has_function_privilege('anon', 'public.fotos_cabem(text)', 'execute'), has_function_privilege('authenticated', 'public.fotos_cabem(text)', 'execute')) into txt;
  res := res || format(E'\n16 fotos_cabem: anon não executa, authenticated sim: %s', case when txt = 'f|t' then 'ok' else 'FALHOU (' || txt || ')' end);

  raise exception 'RESULTADO DO TESTE (tudo desfeito):%', res;
end $$;
