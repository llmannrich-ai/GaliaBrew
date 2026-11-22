-- 0004_catalogo_inicial.sql — catálogo do sistema (dono nulo): estilos BJCP 2021, fermentáveis, lúpulos, leveduras,
-- outros e perfis de água. 22/11/2026.
--
-- De onde vêm os dados: arquivos da pasta data/ do Brewtarget, TRAVADOS no commit 6d9e69d0ef8c4a4c9c355710f643929f817b7987
-- e conferidos pelo md5 (se o arquivo baixado mudar, a migração falha e nada é gravado). O próprio banco baixa os
-- arquivos (extensão http; ao fim, só o postgres pode usá-la); o conteúdo não passa pelo repositório.
--   DefaultContent002-BJCP_2021_Styles.json     estilos: só nome, categoria, código e faixas numéricas (os textos
--                                                descritivos do BJCP têm direitos autorais e ficaram de fora)
--   DefaultContent003-Ingredients-Hops-Yeasts   lúpulos e leveduras que faltam no 005 (sem as notas dos laboratórios)
--   DefaultContent004-MoreYeasts.json           leveduras que faltam (idem)
--   DefaultContent005-Fermentables-Recipes.beer fermentáveis, lúpulos e leveduras (beer-analytics.com, CC BY-SA 4.0;
--                                                maltes The Swaen); fora a pasta "Canadian Homebrewers Association"
--                                                (itens de receitas, repetidos)
--   DefaultContent006-MashAndWaterProfiles.beer perfis de água (nomes traduzidos, sem as notas)
-- "Outros" (sais, ácidos, clarificantes, especiarias) foram escritos aqui, em português.
--
-- Conversões: temperatura °F → °C; cor °L → SRM (1,3546 × °L − 0,76) e EBC → SRM (÷ 1,97); atenuação limitada a 100%;
-- temperatura fora de −5 a 50 °C ou mínima > máxima fica em branco. Leveduras repetidas (mesmo produtor + código)
-- entram uma vez, na ordem 005 → 003 → 004; "Omega Yeast" = "Omega Yeast Labs", "Wyeast Labs" = "Wyeast".
-- Contagem esperada: 110 estilos, 215 fermentáveis, 450 lúpulos, 897 leveduras, 44 outros, 23 águas.

do $$
begin
  if exists (select 1 from public.fermentaveis where dono is null)
     or exists (select 1 from public.estilos where dono is null) then
    raise exception 'O catálogo do sistema já tem itens: esta carga é só para banco vazio.';
  end if;
end $$;

create extension if not exists http with schema extensions;

-- Baixa um arquivo, confere o md5 e devolve o JSON (sem as linhas de comentário "//"). Função temporária da sessão.
create or replace function pg_temp.fonte(p_arquivo text, p_md5 text)
returns jsonb
language plpgsql
as $$
declare r record;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '120');
  select status, content into r
  from extensions.http_get('https://raw.githubusercontent.com/Brewtarget/brewtarget/6d9e69d0ef8c4a4c9c355710f643929f817b7987/data/' || p_arquivo);
  if r.status is distinct from 200 or md5(r.content) is distinct from p_md5 then
    raise exception 'Arquivo % não confere (status %, md5 %)', p_arquivo, r.status, md5(r.content);
  end if;
  return regexp_replace(r.content, '^[ \t]*//[^\n]*$', '', 'gn')::jsonb;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Estilos BJCP 2021
-- ---------------------------------------------------------------------------------------------------------------
insert into public.estilos (dono, guia, categoria, codigo, nome, tipo, og_min, og_max, fg_min, fg_max, ibu_min, ibu_max,
                            cor_srm_min, cor_srm_max, abv_min_pct, abv_max_pct, extras)
select null, 'BJCP 2021', s ->> 'category', s ->> 'style_id', s ->> 'name', 'CERVEJA',
       (s #>> '{original_gravity,minimum,value}')::numeric, (s #>> '{original_gravity,maximum,value}')::numeric,
       (s #>> '{final_gravity,minimum,value}')::numeric, (s #>> '{final_gravity,maximum,value}')::numeric,
       (s #>> '{international_bitterness_units,minimum,value}')::numeric, (s #>> '{international_bitterness_units,maximum,value}')::numeric,
       (s #>> '{color,minimum,value}')::numeric, (s #>> '{color,maximum,value}')::numeric,
       (s #>> '{alcohol_by_volume,minimum,value}')::numeric, (s #>> '{alcohol_by_volume,maximum,value}')::numeric,
       jsonb_strip_nulls(jsonb_build_object('fonte', 'BJCP 2021, github.com/beerjson/bjcp-json (via Brewtarget)',
                                            'categoria_id', s ->> 'category_id', 'tags', s ->> 'tags'))
from jsonb_array_elements(pg_temp.fonte('DefaultContent002-BJCP_2021_Styles.json', '3367e7f11e2c8f30cd12d33981dc5fa5') #> '{beerjson,styles}') s;

-- ---------------------------------------------------------------------------------------------------------------
-- Fermentáveis
-- ---------------------------------------------------------------------------------------------------------------
insert into public.fermentaveis (dono, nome, tipo, grupo, produtor, origem, rendimento_pct, umidade_pct, cor_srm,
                                 fermentavel_pct, precisa_mostura, max_lote_pct, notas, extras)
select null, x ->> 'name',
       case x ->> 'fermentable_type' when 'grain' then 'GRAO' when 'sugar' then 'ACUCAR' when 'extract' then 'EXTRATO'
         when 'dry extract' then 'EXTRATO_SECO' when 'fruit' then 'FRUTA' when 'juice' then 'SUCO' when 'honey' then 'MEL'
         else 'OUTRO' end,
       case x ->> 'grain_group' when 'base' then 'BASE' when 'caramel' then 'CARAMELO' when 'flaked' then 'FLOCO'
         when 'roasted' then 'TORRADO' when 'specialty' then 'ESPECIAL' when 'smoked' then 'DEFUMADO'
         when 'adjunct' then 'ADJUNTO' end,
       x ->> 'producer', x ->> 'origin',
       least(100, (x #>> '{yield_fine_grind,value}')::numeric),
       coalesce((x #>> '{moisture,value}')::numeric, 0),
       round(case x #>> '{color,unit}' when 'Lovi' then greatest(0, 1.3546 * cor.v - 0.76)
                                        when 'EBC' then cor.v / 1.97 else cor.v end, 2),
       coalesce((x #>> '{fermentable_fraction,value}')::numeric, 100),
       coalesce((x ->> 'recommend_mash')::boolean, true),
       (x #>> '{max_in_batch,value}')::numeric,
       x ->> 'notes',
       jsonb_strip_nulls(jsonb_build_object(
         'fonte', case x ->> 'folder_path' when 'The Swaen' then 'The Swaen (via Brewtarget)'
                    else 'beer-analytics.com, CC BY-SA 4.0 (via Brewtarget)' end,
         'pasta', x ->> 'folder_path', 'codigo', x ->> 'product_id'))
from jsonb_array_elements(pg_temp.fonte('DefaultContent005-Fermentables-Recipes.beer', '8af026d2ae0badb51b2c97278b226715') #> '{DotBeer,fermentables}') x
cross join lateral (select (x #>> '{color,value}')::numeric as v) cor
where x ->> 'folder_path' <> 'Canadian Homebrewers Association';

-- ---------------------------------------------------------------------------------------------------------------
-- Lúpulos: 005 (com notas, CC BY-SA) + os do 003 que faltam (sem notas)
-- ---------------------------------------------------------------------------------------------------------------
with h5 as (
  select x, 1 as prio
  from jsonb_array_elements(pg_temp.fonte('DefaultContent005-Fermentables-Recipes.beer', '8af026d2ae0badb51b2c97278b226715') #> '{DotBeer,hops}') x
  where x ->> 'folder_path' <> 'Canadian Homebrewers Association'
), h3 as (
  select x, 2 as prio
  from jsonb_array_elements(pg_temp.fonte('DefaultContent003-Ingredients-Hops-Yeasts.json', 'bb953398e1f30e393693a43bd888a328') #> '{beerjson,hop_varieties}') x
  where lower(x ->> 'name') not in (select lower(h5.x ->> 'name') from h5)
), todos as (
  select x, prio, row_number() over (partition by lower(x ->> 'name'), coalesce(x ->> 'origin', '') order by prio) as n
  from (select * from h5 union all select * from h3) u
)
insert into public.lupulos (dono, nome, origem, forma, alfa_pct, beta_pct, uso, substitutos, oleo_ml_100g, notas, extras)
select null, x ->> 'name', x ->> 'origin', 'PELLET',
       (x #>> '{alpha_acid,value}')::numeric, (x #>> '{beta_acid,value}')::numeric,
       case coalesce(x ->> 'hop_type', x ->> 'type') when 'aroma' then 'AROMA' when 'bittering' then 'AMARGOR'
         when 'aroma/bittering' then 'DUPLO' end,
       x ->> 'substitutes', (x #>> '{oil_content,total_oil_ml_per_100g}')::numeric,
       case when prio = 1 then x ->> 'notes' end,
       jsonb_strip_nulls(jsonb_build_object(
         'fonte', case prio when 1 then 'beer-analytics.com, CC BY-SA 4.0 (via Brewtarget)' else 'fontes públicas (via Brewtarget)' end,
         'alfa_min_pct', (x #>> '{alpha_acid_range,minimum,value}')::numeric,
         'alfa_max_pct', (x #>> '{alpha_acid_range,maximum,value}')::numeric))
from todos
where n = 1;

-- ---------------------------------------------------------------------------------------------------------------
-- Leveduras: 005 (com notas, CC BY-SA) → 003 → 004 (só "indicada para")
-- ---------------------------------------------------------------------------------------------------------------
with c as (
  select x, 1 as prio from jsonb_array_elements(pg_temp.fonte('DefaultContent005-Fermentables-Recipes.beer', '8af026d2ae0badb51b2c97278b226715') #> '{DotBeer,cultures}') x
  where x ->> 'folder_path' <> 'Canadian Homebrewers Association'
  union all
  select x, 2 from jsonb_array_elements(pg_temp.fonte('DefaultContent003-Ingredients-Hops-Yeasts.json', 'bb953398e1f30e393693a43bd888a328') #> '{beerjson,cultures}') x
  union all
  select x, 3 from jsonb_array_elements(pg_temp.fonte('DefaultContent004-MoreYeasts.json', 'e74f9d4dfef6ce6bdeda285eb7dada4b') #> '{beerjson,cultures}') x
), n as (
  select x, prio,
         case x ->> 'producer' when 'Omega Yeast' then 'Omega Yeast Labs' when 'Wyeast Labs' then 'Wyeast'
           when 'mauribrew' then 'Mauribrew' else x ->> 'producer' end as produtor,
         coalesce(x ->> 'culture_type', x ->> 'type') as tipo_origem
  from c
), d as (
  select *, row_number() over (
           partition by lower(produtor), lower(coalesce(nullif(trim(x ->> 'product_id'), ''), x ->> 'name'))
           order by prio) as k
  from n
), t as (
  select *,
         case x #>> '{temperature_range,minimum,unit}' when 'F' then ((x #>> '{temperature_range,minimum,value}')::numeric - 32) * 5 / 9
           else (x #>> '{temperature_range,minimum,value}')::numeric end as t1,
         case x #>> '{temperature_range,maximum,unit}' when 'F' then ((x #>> '{temperature_range,maximum,value}')::numeric - 32) * 5 / 9
           else (x #>> '{temperature_range,maximum,value}')::numeric end as t2,
         least(100, (x #>> '{attenuation_range,minimum,value}')::numeric) as a1,
         least(100, (x #>> '{attenuation_range,maximum,value}')::numeric) as a2
  from d
  where k = 1
)
insert into public.leveduras (dono, nome, produtor, codigo_produto, tipo, forma, temp_min_c, temp_max_c,
                              atenuacao_min_pct, atenuacao_max_pct, floculacao, tolerancia_alcool_pct, pof, notas, extras)
select null, x ->> 'name', produtor, nullif(trim(x ->> 'product_id'), ''),
       case tipo_origem when 'ale' then 'ALE' when 'lager' then 'LAGER' when 'kveik' then 'KVEIK' when 'brett' then 'BRETT'
         when 'lacto' then 'LACTO' when 'mixed-culture' then 'MISTA' when 'wine' then 'VINHO' when 'champagne' then 'VINHO'
         else 'OUTRO' end,
       case x ->> 'form' when 'dry' then 'SECA' when 'liquid' then 'LIQUIDA' when 'slant' then 'SLANT' else 'CULTURA' end,
       round(case when t1 between -5 and 50 and (t2 is null or t1 <= t2) then t1 end, 1),
       round(case when t2 between -5 and 50 and (t1 is null or t1 <= t2) then t2 end, 1),
       case when a1 <= coalesce(a2, 100) then a1 end,
       case when coalesce(a1, 0) <= a2 then a2 end,
       case x ->> 'flocculation' when 'very low' then 'BAIXA' when 'low' then 'BAIXA' when 'medium low' then 'MEDIA_BAIXA'
         when 'medium' then 'MEDIA' when 'medium high' then 'MEDIA_ALTA' when 'high' then 'ALTA'
         when 'very high' then 'MUITO_ALTA' end,
       least(100, (x #>> '{alcohol_tolerance,value}')::numeric),
       (x ->> 'pof')::boolean,
       case when prio = 1 then x ->> 'notes'
            when nullif(x ->> 'best_for', '') is not null then 'Indicada para: ' || (x ->> 'best_for') end,
       jsonb_build_object('fonte', case prio when 1 then 'beer-analytics.com, CC BY-SA 4.0 (via Brewtarget)'
                                             else 'fontes públicas (via Brewtarget)' end)
from t;

-- ---------------------------------------------------------------------------------------------------------------
-- Outros (escritos aqui)
-- ---------------------------------------------------------------------------------------------------------------
insert into public.outros (dono, nome, tipo, uso_para, extras)
select null, nome, tipo, uso, '{"fonte": "GaliaBrew"}'::jsonb
from (values
  ('Sulfato de cálcio (gesso)', 'SAL_AGUA', 'Água: cálcio e sulfato; realça o amargor e a secura'),
  ('Cloreto de cálcio', 'SAL_AGUA', 'Água: cálcio e cloreto; realça o corpo e o malte'),
  ('Cloreto de cálcio em flocos', 'SAL_AGUA', 'Água: cálcio e cloreto (forma hidratada)'),
  ('Sulfato de magnésio (sal de Epsom)', 'SAL_AGUA', 'Água: magnésio e sulfato'),
  ('Cloreto de magnésio', 'SAL_AGUA', 'Água: magnésio e cloreto'),
  ('Cloreto de sódio (sal de cozinha)', 'SAL_AGUA', 'Água: sódio e cloreto; usar pouco'),
  ('Bicarbonato de sódio', 'SAL_AGUA', 'Água: aumenta a alcalinidade (cervejas escuras)'),
  ('Carbonato de cálcio (giz)', 'SAL_AGUA', 'Água: aumenta a alcalinidade; dissolve mal'),
  ('Hidróxido de cálcio (cal hidratada)', 'SAL_AGUA', 'Água: aumenta a alcalinidade e o cálcio'),
  ('Metabissulfito (tablete Campden)', 'SAL_AGUA', 'Água: remove cloro e cloramina'),
  ('Ácido lático 88%', 'ACIDO', 'Baixa o pH da mostura e da água de lavagem'),
  ('Ácido fosfórico 10%', 'ACIDO', 'Baixa o pH sem alterar o sabor'),
  ('Ácido sulfúrico 10%', 'ACIDO', 'Baixa o pH; acrescenta sulfato'),
  ('Ácido clorídrico 10%', 'ACIDO', 'Baixa o pH; acrescenta cloreto'),
  ('Ácido cítrico (solução)', 'ACIDO', 'Baixa o pH'),
  ('Whirlfloc', 'CLARIFICANTE', 'Fervura: últimos 10 a 15 minutos'),
  ('Musgo irlandês', 'CLARIFICANTE', 'Fervura: últimos 10 a 15 minutos'),
  ('Gelatina', 'CLARIFICANTE', 'Maturação a frio'),
  ('Nutriente de levedura', 'NUTRIENTE', 'Fervura (últimos 10 minutos) ou fermentação'),
  ('Casca de laranja', 'TEMPERO', 'Fervura ou maturação'),
  ('Casca de laranja amarga (Curaçao)', 'TEMPERO', 'Witbier: fervura'),
  ('Coentro (sementes)', 'TEMPERO', 'Witbier: fervura'),
  ('Canela', 'TEMPERO', null),
  ('Cravo', 'TEMPERO', null),
  ('Gengibre', 'TEMPERO', null),
  ('Noz-moscada', 'TEMPERO', null),
  ('Zimbro', 'TEMPERO', null),
  ('Baunilha (fava)', 'TEMPERO', 'Maturação'),
  ('Pimenta-branca', 'TEMPERO', null),
  ('Pimenta (chili)', 'TEMPERO', null),
  ('Pimenta chipotle', 'TEMPERO', null),
  ('Erva-doce (funcho)', 'TEMPERO', null),
  ('Chai', 'TEMPERO', null),
  ('Café em grãos', 'SABOR', 'Maturação (cold brew ou grãos)'),
  ('Café', 'SABOR', null),
  ('Cacau (nibs)', 'SABOR', 'Maturação'),
  ('Coco', 'SABOR', 'Maturação'),
  ('Avelã', 'SABOR', null),
  ('Whisky', 'SABOR', 'Envase ou maturação'),
  ('Chá verde', 'ERVA', null),
  ('Rooibos', 'ERVA', null),
  ('Jasmim', 'ERVA', null),
  ('Lavanda', 'ERVA', null),
  ('Hortelã', 'ERVA', null)
) v(nome, tipo, uso);

-- ---------------------------------------------------------------------------------------------------------------
-- Águas (perfis-alvo por estilo e água da torneira de algumas cidades)
-- ---------------------------------------------------------------------------------------------------------------
insert into public.aguas (dono, nome, calcio_ppm, magnesio_ppm, sodio_ppm, sulfato_ppm, cloreto_ppm, bicarbonato_ppm, ph, extras)
select null,
       coalesce('Alvo — ' || tr.pt, regexp_replace(x ->> 'name', '^(.*) tap water(.*)$', 'Torneira — \1\2')),
       coalesce((x #>> '{calcium,value}')::numeric, 0), coalesce((x #>> '{magnesium,value}')::numeric, 0),
       coalesce((x #>> '{sodium,value}')::numeric, 0), coalesce((x #>> '{sulfate,value}')::numeric, 0),
       coalesce((x #>> '{chloride,value}')::numeric, 0), coalesce((x #>> '{bicarbonate,value}')::numeric, 0),
       (x #>> '{pH,value}')::numeric,
       jsonb_build_object('fonte', 'Brewtarget (via DefaultContent006)', 'nome_original', x ->> 'name')
from jsonb_array_elements(pg_temp.fonte('DefaultContent006-MashAndWaterProfiles.beer', 'd51fefbc6f50720f98350a79d0a84260') #> '{DotBeer,waters}') x
left join (values
  ('Light and malty', 'clara e maltada'),
  ('Pale, Soft (Pilsner, Helles)', 'clara, suave (Pilsner, Helles)'),
  ('Pale, Balanced (Blonde, Kölsch, Wheat)', 'clara, equilibrada (Blonde, Kölsch, trigo)'),
  ('Pale, Hoppy (Pale Ale, West Coast IPA)', 'clara, lupulada (Pale Ale, West Coast IPA)'),
  ('Pale, Juicy (New England IPA)', 'clara, suculenta (New England IPA)'),
  ('Amber, Hoppy (Bitter, ESB, Amber Ale)', 'âmbar, lupulada (Bitter, ESB, Amber Ale)'),
  ('Amber, Balanced (Vienna, Altbier)', 'âmbar, equilibrada (Vienna, Altbier)'),
  ('Amber, Malty (Märzen, Scottish, Bock)', 'âmbar, maltada (Märzen, Scottish, Bock)'),
  ('Brown, Balanced (Brown Ale, Porter)', 'marrom, equilibrada (Brown Ale, Porter)'),
  ('Brown, Malty (Dunkel, Dubbel)', 'marrom, maltada (Dunkel, Dubbel)'),
  ('Black, Dry (Dry Stout, Black IPA)', 'preta, seca (Dry Stout, Black IPA)'),
  ('Black, Full (Sweet & Imperial Stout)', 'preta, encorpada (Sweet e Imperial Stout)')
) tr(en, pt) on tr.en = x ->> 'name';

-- ---------------------------------------------------------------------------------------------------------------
-- Conferência e limpeza
-- ---------------------------------------------------------------------------------------------------------------
do $$
declare e int; f int; l int; y int; o int; a int;
begin
  select count(*) into e from public.estilos where dono is null;
  select count(*) into f from public.fermentaveis where dono is null;
  select count(*) into l from public.lupulos where dono is null;
  select count(*) into y from public.leveduras where dono is null;
  select count(*) into o from public.outros where dono is null;
  select count(*) into a from public.aguas where dono is null;
  if (e, f, l, y, o, a) is distinct from (110, 215, 450, 897, 44, 23) then
    raise exception 'Contagem diferente do esperado: estilos %, fermentáveis %, lúpulos %, leveduras %, outros %, águas %',
      e, f, l, y, o, a;
  end if;
end $$;

-- A extensão http fica instalada (removê-la pede confirmação no Supabase), mas ninguém além do postgres a usa.
do $$
declare fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p join pg_depend d on d.objid = p.oid and d.deptype = 'e'
    join pg_extension e on e.oid = d.refobjid
    where e.extname = 'http'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
  end loop;
end $$;
