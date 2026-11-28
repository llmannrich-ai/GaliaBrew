-- Teste da 0009 (maltes e lúpulos de marca no catálogo do sistema). Roda como postgres; termina em RAISE EXCEPTION e
-- desfaz tudo. Tudo "ok".
do $$
declare
  a    uuid := gen_random_uuid();
  f_id uuid;
  h_id uuid;
  r1   uuid;
  n    int;
  txt  text;
  res  text := '';
begin
  select string_agg(produtor || '=' || c, ' ' order by produtor) into txt
  from (select produtor, count(*) c from public.fermentaveis
        where dono is null and produtor in ('Weyermann','BestMalz','Viking Malt','Dingemans','Agrária','Uma Malta','Pauls Malt')
        group by produtor) x;
  res := res || format(E'\n01 maltes por marca: %s', case when txt = 'Agrária=7 BestMalz=41 Dingemans=28 Pauls Malt=8 Uma Malta=9 Viking Malt=31 Weyermann=49'
    then 'ok' else 'FALHOU (' || coalesce(txt, '-') || ')' end);

  select count(*) into n from public.lupulos
  where dono is null and (nome like '% Lupulin Pellets' or nome in ('Cascade (Brasil)', 'Comet (Brasil)'));
  res := res || format(E'\n02 lúpulos novos (20 Hopsteiner + 2 do Brasil): %s', case when n = 22 then 'ok' else 'FALHOU (' || n || ')' end);

  select count(*) into n from public.fermentaveis
  where extras ->> 'fonte' like 'Ficha técnica oficial%'
    and (dono is not null or extras ->> 'url' is null or rendimento_pct is null or cor_srm is null or umidade_pct is null);
  res := res || format(E'\n03 todo malte novo é do sistema, com fonte, rendimento, cor e umidade: %s', case when n = 0 then 'ok' else 'FALHOU (' || n || ')' end);

  select count(*) into n from public.lupulos
  where (nome like '% Lupulin Pellets' or nome like '% (Brasil)') and (dono is not null or alfa_pct is null or extras ->> 'url' is null);
  res := res || format(E'\n04 todo lúpulo novo é do sistema, com alfa e fonte: %s', case when n = 0 then 'ok' else 'FALHOU (' || n || ')' end);

  select id into f_id from public.fermentaveis where dono is null and nome = 'Weyermann Malte Pilsner';   -- era 'Weyermann Pilsner Malt' até a 0012
  select id into h_id from public.lupulos where dono is null and nome = 'Lotus Lupulin Pellets';

  -- Usuário comum logado
  insert into auth.users (id, email) values (a, 'teste-a@galiabrew.invalid');
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into n from public.fermentaveis where produtor = 'Weyermann';
  res := res || format(E'\n05 usuário logado lê os maltes novos: %s', case when n = 49 then 'ok' else 'FALHOU (' || n || ')' end);

  update public.fermentaveis set cor_srm = 99 where id = f_id;
  get diagnostics n = row_count;
  res := res || format(E'\n06 usuário comum não altera o catálogo: %s', case when n = 0 then 'ok' else 'FALHOU (' || n || ')' end);

  r1 := public.salvar_receita(jsonb_build_object('nome', 'Lote',
    'fermentaveis', jsonb_build_array(jsonb_build_object('fermentavel_id', f_id, 'quantidade_kg', 5)),
    'lupulos', jsonb_build_array(jsonb_build_object('lupulo_id', h_id, 'quantidade_g', 10, 'tempo_min', 60))));
  select concat_ws('|', nome, rendimento_pct, cor_srm, umidade_pct) into txt from public.receita_fermentaveis where receita_id = r1;
  res := res || format(E'\n07 receita copia o malte de marca: %s', case when txt = 'Weyermann Malte Pilsner|80.5|1.78|5' then 'ok' else 'FALHOU (' || txt || ')' end);
  select concat_ws('|', nome, alfa_pct) into txt from public.receita_lupulos where receita_id = r1;
  res := res || format(E'\n08 receita copia o lúpulo em lupulina: %s', case when txt = 'Lotus Lupulin Pellets|24.5' then 'ok' else 'FALHOU (' || txt || ')' end);
  reset role;

  raise exception 'RESULTADO DO TESTE (tudo desfeito):%', res;
end $$;
