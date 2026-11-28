-- Teste da 0012 (nomes do catálogo em português). Roda como postgres; termina em RAISE EXCEPTION e desfaz tudo.
-- Tudo "ok".
do $$
declare
  a    uuid := gen_random_uuid();
  f_id uuid;
  r1   uuid;
  n    int;
  txt  text;
  res  text := '';
begin
  select count(*) into n from public.fermentaveis where dono is null and extras ? 'nome_original';
  res := res || format(E'\n01 fermentáveis traduzidos guardam o nome original: %s', case when n = 309 then 'ok' else 'FALHOU (' || n || ')' end);

  select count(*) into n from public.fermentaveis where dono is null and extras ? 'nome_original' and nome = extras ->> 'nome_original';
  res := res || format(E'\n02 nenhum ficou com o nome igual ao original: %s', case when n = 0 then 'ok' else 'FALHOU (' || n || ')' end);

  select string_agg(nome, ' | ' order by nome) into txt from public.fermentaveis
   where dono is null and extras ->> 'nome_original' in ('Pilsner Malt', 'Unmalted Barley', 'Flaked Oats', 'Caramel/Crystal Malt – 60L', 'Lactose (Milk Sugar)');
  res := res || format(E'\n03 exemplos traduzidos: %s', case when txt = 'Aveia em Flocos | Cevada Não Maltada | Lactose (Açúcar do Leite) | Malte Caramelo/Cristal – 60L | Malte Pilsner'
    then 'ok' else 'FALHOU (' || coalesce(txt, '-') || ')' end);

  select count(*) into n from public.fermentaveis
   where dono is null and nome ~* '\m(malt|wheat|rye|oat|roasted|smoked|flaked|unmalted|sugar|syrup|type)\M'
     and coalesce(produtor, '') <> 'Pauls Malt' and nome <> 'Golden Naked Oats';
  res := res || format(E'\n04 sem palavra genérica em inglês (fora marca e produto): %s', case when n = 0 then 'ok' else 'FALHOU (' || n || ')' end);

  select count(*) into n from public.lupulos where dono is null and nome ~ '\((GR|US|NZ|CZ)\)$';
  res := res || format(E'\n05 lúpulos sem sigla de país em inglês: %s', case when n = 0 then 'ok' else 'FALHOU (' || n || ')' end);

  select count(*) into n from public.lupulos where dono is null and nome in ('Magnum (Alemanha)', 'Saaz (Tchéquia)', 'Hallertau (Nova Zelândia)', 'Tettnang (EUA)');
  res := res || format(E'\n06 lúpulos com a origem em português: %s', case when n = 4 then 'ok' else 'FALHOU (' || n || ')' end);

  select count(*) into n from public.aguas where dono is null and nome in ('Torneira — Munique (2026)', 'Torneira — Nova York (2024)', 'Torneira — Berlim (2025)');
  res := res || format(E'\n07 águas com a cidade em português: %s', case when n = 3 then 'ok' else 'FALHOU (' || n || ')' end);

  select count(*) into n from public.receita_fermentaveis where nome in ('Malte Pilsner', 'Cevada Torrada', 'Aveia em Flocos');
  select id into f_id from public.fermentaveis where dono is null and nome = 'Malte Pilsner';

  -- Usuário comum: a receita nova copia o nome em português; receitas antigas não mudaram (regra 5).
  insert into auth.users (id, email) values (a, 'teste-a@galiabrew.invalid');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r1 := public.salvar_receita(jsonb_build_object('nome', 'Lote',
    'fermentaveis', jsonb_build_array(jsonb_build_object('fermentavel_id', f_id, 'quantidade_kg', 5))));
  select nome into txt from public.receita_fermentaveis where receita_id = r1;
  res := res || format(E'\n08 receita nova copia o nome em português: %s', case when txt = 'Malte Pilsner' then 'ok' else 'FALHOU (' || coalesce(txt, '-') || ')' end);
  reset role;

  res := res || format(E'\n09 nenhuma receita antiga mudou de nome (cópias com o nome novo antes deste teste): %s', case when n = 0 then 'ok' else 'FALHOU (' || n || ')' end);

  raise exception 'RESULTADO DO TESTE (tudo desfeito):%', res;
end $$;
