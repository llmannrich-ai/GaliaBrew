-- Correção das leveduras importadas do Brewfather (24/11/2026, pedido do responsável: "o tipo da levedura deve vir do
-- cadastro"). Rodado UMA vez pelo MCP do Supabase (papel postgres), fora das migrações: é dado, não estrutura.
--
-- Antes: 106 de 107 leveduras das receitas sem ligação com o cadastro (levedura_id nulo), tipo chutado na importação
-- (Ale ou Lager; Brettanomyces como Ale).
--
-- 1) LIGAR ao cadastro quando o produto é identificável pelo código entre parênteses ou pelo nome do fabricante
--    (Brewfather escreve as Lallemand sem "LalBrew"). Copia tipo e forma do cadastro.
--    NÃO muda nome nem atenuação: a FG calculada e o texto das receitas já brassadas ficam como estavam.
-- 2) Só o TIPO, sem ligar, quando o produto não está no catálogo mas o tipo é certo pelo nome (Brettanomyces = BRETT,
--    blend de Flanders = MISTA).
-- O resto (TeckBrew, Fermo* sem a cepa no catálogo, Farmhouse, Vermont Ale bio4, Lager-BF16, nome vazio) fica sem
-- ligação: o portal oferece "Ligar ao cadastro" na janela da levedura.
--
-- O gatilho receita_leveduras_copiar só preenche campo nulo (tipo e forma vão explícitos). Atualizar
-- receita_leveduras não toca em receitas.atualizado_em.

with ligar(nome, levedura_id) as (values
  ('Nottingham Yeast',                          '85aca6c8-988a-42e5-9e18-97ea629139f7'::uuid),  -- LalBrew Nottingham
  ('Nottingham',                                '85aca6c8-988a-42e5-9e18-97ea629139f7'),
  ('Lama summer ale 19 litros com nottingham',  '85aca6c8-988a-42e5-9e18-97ea629139f7'),
  ('Windsor Yeast',                             'ffb65e0d-bec4-4591-9501-87007f23b09c'),  -- LalBrew Windsor
  ('Diamond Lager',                             'c56f0b3c-da87-4578-888d-14793f8f42ca'),  -- Lallemand Diamond Lager
  ('Abbaye Belgian',                            'd3e3bc46-8513-4ddd-9136-20f23aa507dc'),  -- LalBrew Abbaye Belgian Ale
  ('Abbaye',                                    'ab53ffbb-107c-4f2f-8ba3-2b27cbaed040'),  -- LalBrew Abbaye
  ('Verdant IPA',                               '3ab95796-b727-457f-92a5-11a89e7955c1'),  -- LalBrew Verdant IPA
  ('Belle Saison',                              '4fed568f-2c67-4a83-9d1e-fa18760b3a52'),  -- LalBrew Belle Saison
  ('New England',                               'f4c1e983-ac80-4430-a3ac-edab8ba50b81'),  -- LalBrew New England
  ('Wit Belgian',                               'd8283e61-99fa-4d7d-9d38-4cf3ba6d637f'),  -- LalBrew Wit
  ('Philly Sour',                               '40a7d63a-b945-477e-b30e-6268e1035a06'),  -- WildBrew Philly Sour
  ('Safale American (US-05)',                   'c72fab6b-e1f3-4aa2-8bb2-39d1ddd1c069'),
  ('SafAle English Ale (S-04)',                 '80135e85-973b-455a-8769-e3585beac052'),
  ('SafBrew Specialty Ale (T-58)',              '7741dcca-3b6d-428b-ba81-631b450e255e'),
  ('Saflager Lager (W-34/70)',                  '4baa3a1b-bd71-48b4-9b98-c884ae028e55'),
  ('Safebrew Abbey Ale (BE-256)',               '8ca31dad-f3e3-4090-ad8f-97ce5cdf5b59'),
  ('Safale Belgian-Saison (BE-134)',            '864816a0-e8cd-490c-901c-fdf03be4b3df'),
  ('California Lager (M54)',                    '8009618e-f69f-429f-a5df-09550567b990'),  -- Mangrove Jack's M54
  ('Fermolager W',                              '8182afd2-4749-4ffc-9af3-41e519ebbac9'),  -- AEB
  ('Brettanomyces Bruxellensis (WLP648)',       'b91caf5b-c86a-4bb7-a4fc-a4a91b993fc5')   -- White Labs WLP648
),
so_tipo(nome, tipo) as (values
  ('Brettanomyces Claussenii',             'BRETT'),
  ('Brettanomyces Claussenii - levtek',    'BRETT'),
  ('Brettanomyces Bruxelensis',            'BRETT'),
  ('Brettanomyces bruxelensis (CL-5200)',  'BRETT'),
  ('Brettanomyces brasileira (WLP648)',    'BRETT'),   -- o nome diz WLP648, mas WLP648 é a Trois Vrai: só o tipo
  ('Blend Red Flanders ALE',               'MISTA')
),
a as (
  update public.receita_leveduras rl
     set levedura_id = y.id, tipo = y.tipo, forma = y.forma
    from ligar l join public.leveduras y on y.id = l.levedura_id
   where rl.levedura_id is null and rl.nome = l.nome
  returning rl.nome
),
b as (
  update public.receita_leveduras rl
     set tipo = s.tipo
    from so_tipo s
   where rl.levedura_id is null and rl.nome = s.nome
  returning rl.nome
)
select (select count(*) from a) as ligadas, (select count(*) from b) as so_tipo;

-- DESFAZER (estado anterior: todas sem levedura_id; tipo Ale, exceto as Lager abaixo; forma igual à do cadastro):
-- update public.receita_leveduras set levedura_id = null,
--        tipo = case when nome in ('Diamond Lager', 'Saflager Lager (W-34/70)', 'California Lager (M54)', 'Fermolager W')
--                    then 'LAGER' else 'ALE' end
--  where nome in (<os nomes das duas listas acima>);
