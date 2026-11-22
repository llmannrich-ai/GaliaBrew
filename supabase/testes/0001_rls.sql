-- Teste da segurança (RLS) da 0001 (+ cópia da umidade, 0002). Roda como postgres (SQL Editor ou MCP execute_sql).
-- Cria dois logins fictícios (A = admin, B = usuário comum), executa as operações com o papel
-- "authenticated" (e "anon" no fim) e termina com RAISE EXCEPTION: o Postgres desfaz TUDO.
-- Resultado esperado: a mensagem de erro lista cada verificação com "ok"; qualquer "FALHOU" é problema.
do $$
declare
  a     uuid := gen_random_uuid();
  b     uuid := gen_random_uuid();
  f_sis uuid;
  f_a   uuid;
  r_a   uuid;
  r_b   uuid;
  n     int;
  txt   text;
  res   text := '';
begin
  -- ---------- preparação (postgres) ----------
  insert into auth.users (id, email, raw_user_meta_data)
  values (a, 'teste-a@galiabrew.invalid', '{"nome": "Teste A"}'),
         (b, 'teste-b@galiabrew.invalid', '{}');
  select count(*) into n from public.perfis where user_id in (a, b);
  res := res || format(E'\n01 perfis criados pelo gatilho: %s', case when n = 2 then 'ok' else 'FALHOU (' || n || ')' end);
  select nome into txt from public.perfis where user_id = b;
  res := res || format(E'\n02 nome padrão = início do e-mail: %s', case when txt = 'teste-b' then 'ok' else 'FALHOU (' || txt || ')' end);
  update public.perfis set papel = 'admin' where user_id = a;
  insert into public.fermentaveis (dono, nome, tipo, rendimento_pct, cor_srm, fermentavel_pct, umidade_pct)
  values (null, 'Pilsen (sistema)', 'GRAO', 80, 1.8, 100, 4) returning id into f_sis;

  -- ---------- como A (admin) ----------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.fermentaveis (nome, tipo, rendimento_pct, cor_srm) values ('Malte particular A', 'GRAO', 78, 3)
  returning id into f_a;
  insert into public.receitas (nome) values ('Receita A') returning id into r_a;
  insert into public.receita_fermentaveis (receita_id, fermentavel_id, quantidade_kg) values (r_a, f_sis, 5);
  select nome || '|' || rendimento_pct || '|' || fermentavel_pct || '|' || umidade_pct into txt
  from public.receita_fermentaveis where receita_id = r_a;
  res := res || format(E'\n03 cópia do cadastro na adição: %s', case when txt = 'Pilsen (sistema)|80|100|4' then 'ok' else 'FALHOU (' || txt || ')' end);

  begin
    insert into public.fermentaveis (dono, nome, tipo, rendimento_pct, cor_srm) values (null, 'Trigo (sistema)', 'GRAO', 82, 2);
    res := res || E'\n04 admin grava catálogo do sistema: ok';
  exception when others then
    res := res || E'\n04 admin grava catálogo do sistema: FALHOU (' || sqlerrm || ')';
  end;

  -- ---------- como B (usuário comum) ----------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);

  select count(*) into n from public.fermentaveis;
  res := res || format(E'\n05 B vê só o catálogo do sistema (2), não o particular de A: %s', case when n = 2 then 'ok' else 'FALHOU (' || n || ')' end);
  select count(*) into n from public.receitas;
  res := res || format(E'\n06 B não vê receita privada de A: %s', case when n = 0 then 'ok' else 'FALHOU (' || n || ')' end);
  update public.receitas set nome = 'invadida' where id = r_a;
  get diagnostics n = row_count;
  res := res || format(E'\n07 B não altera receita de A: %s', case when n = 0 then 'ok' else 'FALHOU' end);
  delete from public.fermentaveis where id = f_sis;
  get diagnostics n = row_count;
  res := res || format(E'\n08 B não apaga catálogo do sistema: %s', case when n = 0 then 'ok' else 'FALHOU' end);

  begin
    insert into public.receita_fermentaveis (receita_id, nome, tipo, rendimento_pct, cor_srm, quantidade_kg)
    values (r_a, 'x', 'GRAO', 80, 2, 1);
    res := res || E'\n09 B não inclui ingrediente na receita de A: FALHOU';
  exception when others then
    res := res || E'\n09 B não inclui ingrediente na receita de A: ok';
  end;

  insert into public.receitas (nome) values ('Receita B') returning id into r_b;
  begin
    insert into public.receita_fermentaveis (receita_id, fermentavel_id, quantidade_kg) values (r_b, f_a, 1);
    res := res || E'\n10 B não usa ingrediente particular de A: FALHOU';
  exception when others then
    res := res || E'\n10 B não usa ingrediente particular de A: ok (' || sqlerrm || ')';
  end;

  begin
    insert into public.fermentaveis (dono, nome, tipo, rendimento_pct, cor_srm) values (null, 'x', 'GRAO', 80, 2);
    res := res || E'\n11 B não grava catálogo do sistema: FALHOU';
  exception when others then
    res := res || E'\n11 B não grava catálogo do sistema: ok';
  end;

  begin
    insert into public.receitas (dono, nome) values (a, 'em nome de A');
    res := res || E'\n12 B não cria receita em nome de A: FALHOU';
  exception when others then
    res := res || E'\n12 B não cria receita em nome de A: ok';
  end;

  begin
    update public.perfis set papel = 'admin' where user_id = b;
    res := res || E'\n13 B não se torna admin: FALHOU';
  exception when others then
    res := res || E'\n13 B não se torna admin: ok (' || sqlerrm || ')';
  end;

  update public.perfis set nome = 'Teste B' where user_id = b;
  get diagnostics n = row_count;
  res := res || format(E'\n14 B altera o próprio nome: %s', case when n = 1 then 'ok' else 'FALHOU' end);
  select count(*) into n from public.perfis;
  res := res || format(E'\n15 B vê só o próprio perfil: %s', case when n = 1 then 'ok' else 'FALHOU (' || n || ')' end);

  -- ---------- A torna a receita pública ----------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  update public.receitas set publica = true where id = r_a;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.receita_fermentaveis where receita_id = r_a;
  res := res || format(E'\n16 B lê receita pública de A (e os ingredientes): %s', case when n = 1 then 'ok' else 'FALHOU (' || n || ')' end);
  update public.receita_fermentaveis set quantidade_kg = 99 where receita_id = r_a;
  get diagnostics n = row_count;
  res := res || format(E'\n17 B não altera receita pública de A: %s', case when n = 0 then 'ok' else 'FALHOU' end);

  -- ---------- anon (sem login) ----------
  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin
    select count(*) into n from public.receitas;
    res := res || E'\n18 sem login não lê nada: FALHOU (' || n || ')';
  exception when others then
    res := res || E'\n18 sem login não lê nada: ok (' || sqlerrm || ')';
  end;
  reset role;

  raise exception 'RESULTADO DO TESTE (tudo desfeito):%', res;
end $$;
