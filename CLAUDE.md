# GaliaBrew — contexto para o Claude Code

Leia `docs/PRD.md` antes de qualquer tarefa. Este arquivo resume as regras que não podem ser quebradas.

## O que é
Aplicativo web de receitas de cerveja (criação, cálculo de OG/FG/ABV/IBU/cor, brassagem). Começou para uso pessoal
e já nasce multiusuário: cada pessoa vê e edita só o que é dela.

## Stack decidida
- Supabase: projeto `GaliaBrew`, ref `hzomsyfujxakcuaaedmh`, org "Versa" (plano Free), região sa-east-1.
  API: https://hzomsyfujxakcuaaedmh.supabase.co. Plano Free: pausa após 7 dias sem acesso (reativar no painel).
- GitHub: `llmannrich-ai/GaliaBrew` (criado PÚBLICO em 22/11/2026; recomendado mudar para privado).
- Portal: página estática (HTML + JS sem build) + Supabase Auth (e-mail + senha). Hospedagem a definir
  (Cloudflare Pages, como os outros portais).
- Cálculos no navegador, num único módulo `portal/calculos.js`, com testes.

## Princípio do produto (22/11/2026)
CADA RECEITA É UM LOTE. Não há módulo de brassagem nem versões de receita. Receita nova nasce de "criar a partir de"
uma anterior (cópia completa; a anterior não muda). Praticidade: só pedir o que o cervejeiro anota. Ver PRD 1.1.

## Regras obrigatórias
1. NUNCA no repositório: chave `service_role`, senha do banco, token, `.env`. A chave publicável (anon/publishable)
   pode ir no portal: quem protege os dados é a RLS.
2. Toda tabela nova em `public`: RLS ligada, políticas só `to authenticated`, nada para `anon`, privilégios explícitos
   (`grant ... to authenticated`). Dono = `dono uuid default auth.uid()`; política com `(select auth.uid())`.
3. Testar a RLS a cada migração que mexe em acesso: `supabase/testes/` (bloco DO que termina em RAISE EXCEPTION e
   desfaz tudo; todas as linhas "ok"). Depois rodar o verificador de segurança do Supabase (advisors).
4. Unidades no banco: kg (fermentáveis), g (lúpulos), L, °C, minutos, densidade em SG (1,050), cor em SRM,
   percentuais de 0 a 100. Conversão (°P, EBC, °L, oz, lb, gal, °F) só na tela.
5. Adição na receita guarda CÓPIA dos dados do ingrediente (nome, alfa, cor, rendimento, atenuação). Campo de cópia
   nulo é preenchido do cadastro pelo gatilho `*_copiar`; mudar o cadastro não altera receita antiga.
6. Gatilho que lê cadastro roda SEM security definer (a RLS vale): ninguém usa nem descobre ingrediente particular
   de outro usuário. Security definer só quando inevitável, sempre com `set search_path = ''` e execute revogado
   de `public`/`anon`.
7. `perfis.papel` (usuario | admin) só muda por SQL (postgres/service_role). O usuário altera só `nome`
   (privilégio por coluna).
8. Migração aplicada = arquivo em `supabase/migrations/` idêntico (conferir o md5 em
   `supabase_migrations.schema_migrations`). Uma tarefa por vez, com teste. Não criar pastas fora da estrutura
   abaixo sem perguntar.
9. Brewtarget (GPL-3) é referência de FÓRMULAS e regras, nunca de código: não copiar trechos. BeerJSON (MIT) pode
   ser usado livremente (modelo de dados, importação/exportação).

## Estrutura
- `supabase/migrations/` — SQL versionado (`NNNN_nome.sql`)
- `supabase/testes/` — testes de RLS e de funções (rodam e desfazem)
- `portal/` — página do app (fase 1: login + receitas); `portal/testes/` — testes (calculos.js e navegador)
- `.github/workflows/pages.yml` — publicação do portal no GitHub Pages
- `docs/PRD.md` — produto, decisões, modelo de dados, fórmulas
- `ferramentas/brewfather/` — importação de receitas de um backup do Brewfather (criada com aprovação, 22/11/2026)
- `.claude/skills/deploy/` — skill `/deploy` (22/11/2026, pedida pelo responsável): publicar SEMPRE por ela. Fila entre
  sessões paralelas em `refs/fila/*` no origin (`fila.sh`), atualiza com a main, `conferir.sh` (nº de migração, `?v=`),
  testes, push só avanço rápido na `main` e na branch padrão.

## Importação do Brewfather (`ferramentas/brewfather/`, 22/11/2026)
- `converter.mjs` (backup.json → jsonb do `salvar_receita`, recalcula com calculos.js e compara) e `importar.py`
  (grava como o usuário: `request.jwt.claims` + `set local role authenticated`; simula sem `--gravar`; pula
  `extras.brewfather_id` já importado). Senha do banco só em `GALIABREW_DB_SENHA`. Detalhes no README da pasta.
- Datas: `criado_em`/`atualizado_em` vêm do Brewfather (`_created`/`_timestamp`). Como `salvar_receita` e o gatilho
  `receitas_atualizado_em` gravam "agora", o importar.py volta ao papel postgres e ajusta as datas com o gatilho
  desligado só na transação. As 102 receitas de 22/11/2026 foram corrigidas assim pelo MCP (datas de 2020 a 2026).
- 22/11/2026: 102 receitas importadas para llmannrich (2 rascunhos vazios ignorados). Eficiência = `mashEfficiency`
  do Brewfather; cor do malte vem em °L. OG de 100/102 em ±0,002. IBU (depois do whirlpool, 22/11/2026): pior diferença 18%, 80/101 dentro de 10%;
  sobra ~9% abaixo nos lúpulos de fervura, variando por receita (4-14%), causa não identificada.
- Pooler do banco: `aws-1-sa-east-1.pooler.supabase.com:5432`, usuário `postgres.hzomsyfujxakcuaaedmh`.

## Modelo de acesso (0001, 22/11/2026)
- Cadastros (`estilos`, `fermentaveis`, `lupulos`, `leveduras`, `outros`, `aguas`): `dono` nulo = catálogo do
  sistema (todos os logados leem, só admin grava); `dono` preenchido = particular.
- `equipamentos`: sempre particular.
- `receitas`: dono grava; lê o dono ou qualquer logado se `publica = true`. Partes da receita
  (`receita_fermentaveis`, `receita_lupulos`, `receita_leveduras`, `receita_outros`, `receita_mostura_passos`,
  `receita_fermentacao_passos`) seguem a receita.
- `receitas` guarda os parâmetros de cálculo copiados do equipamento (volume, eficiência, fervura, evaporação,
  perdas, absorção) e os resultados `*_calc` gravados pelo portal (só para listas).
- `perfis`: criado pelo gatilho `perfis_criar` em `auth.users` (nome = metadado `nome` ou início do e-mail).
- `public.rls_auto_enable()` é do próprio Supabase (event trigger que liga a RLS em tabela nova); o aviso do advisor
  sobre ela é falso positivo (função de event trigger não é chamável pela API). `eh_admin()` exposta de propósito
  (só diz se o próprio usuário é admin; o portal usa para o menu).
- Teste `supabase/testes/0001_rls.sql`: 18 verificações ok em 22/11/2026 (refeito após a 0002).

## Cálculos (`portal/calculos.js`, 22/11/2026, migração 0002)
- Testes: `node --test portal/testes/*.test.mjs` (19 testes). OG e FG batem com o Brewtarget (±0,0005) nas 28 receitas
  de exemplo do banco padrão dele (`portal/testes/gabarito-brewtarget.json`; a Rauchbier ficou fora: o OG gravado lá
  não confere com os próprios ingredientes). IBU pela tabela de Tinseth; ABV pela tabela do HMRC.
- Regras: açúcar = kg × rendimento × (1 − umidade); grão/adjunto na mostura leva a eficiência; extrato, açúcar, mel,
  fruta e suco não levam, mas perdem a fração que fica na panela (lote ÷ pós-fervura); grão fora da mostura rende 60%.
  OG no volume pós-fervura (lote + perda da panela). FG pela levedura de MAIOR atenuação (sem valor: 75%), parte não
  fermentável (lactose) inteira na FG.
- IBU (Tinseth) no volume do lote; gravidade = média da panela durante o tempo do lúpulo (o volume cai com a
  evaporação); primeiro mosto = fervura inteira × 1,1; mostura, dry hop e envase = 0.
- Whirlpool (22/11/2026): Tinseth pelos minutos do whirlpool na gravidade do fim da fervura × fator de isomerização
  de Malowicz 2,39e11 × e^(−9773/K) (90 °C 0,49; 85 °C 0,34; 80 °C 0,23); sem temperatura = 80 °C (como o Brewfather).
  Lúpulos da fervura/primeiro mosto ganham [Tinseth(t + whirlpool) − Tinseth(t)] × fator (whirlpool da receita = o
  mais longo; temperatura = média ponderada pelos gramas). Bate com o Brewfather (ele usa a mesma curva).
- Fim de linha: `portal/vendor/** -text` no .gitattributes; com CRLF o hash do SRI muda e o portal não carrega.
- Cor: Morey com °L = (SRM + 0,76) ÷ 1,3546 no volume pós-fervura. EBC = SRM × 1,97.
- 0002: `fermentaveis.umidade_pct` (+ cópia em `receita_fermentaveis`): o rendimento da ficha do malte é base seca;
  sem a umidade a OG sai ~4% alta. `receitas.relacao_agua_grao_l_kg` e `perda_tina_l` (água da mostura × lavagem).

## Portal (`portal/`, 22/11/2026, migração 0003)
- HTML + módulos JS sem build: `index.html`, `app.js` (login, menu, rotas `#/receitas`, `#/receita/<id|nova>`,
  `#/cadastros/<tabela>`, `#/perfil`), `estado.js` (cliente Supabase, sessão, preferências), `ui.js` (DOM e números
  pt-BR), `opcoes.js` (listas = CHECK do banco; cor na tela em EBC ou SRM, escolha no perfil), `cadastros.js`,
  `receitas.js`, `calculos.js`, `style.css`, `_headers` (CSP e cabeçalhos de segurança do Cloudflare Pages).
- supabase-js 2.119.2 dentro do repositório (`vendor/supabase-2.119.2.js`, MIT, com SRI no index.html): o site não
  depende de CDN e a CSP fica `script-src 'self'`. Trocar de versão = arquivo novo com a versão no nome + SRI novo.
- Texto do usuário só por textContent (`el()`/`preencher()` do ui.js); nunca innerHTML com dado. O `append` nativo
  escreve "null": usar `preencher(n, ...)`, que ignora vazios.
- VERSÃO NOS IMPORTS (lição do portal de notas, 05/11/2026): todo import entre scripts e os arquivos do index.html
  levam `?v=AAAAMMDDx`. A cada publicação que mude qualquer .js/.css, trocar em todos de uma vez:
  `sed -i -E 's/\?v=[0-9a-z]+/?v=AAAAMMDDx/g' portal/*.js portal/index.html` (e o import do navegador.cjs).
- Gravação da receita só por `salvar_receita(p jsonb)` (0003, security invoker: a RLS vale): cabeçalho + partes numa
  transação; parte enviada é substituída inteira, parte ausente fica como está; `id`/`dono` do jsonb são ignorados
  (dono = quem grava). Teste `supabase/testes/0003_salvar_receita.sql`: 10 verificações ok.
- Receita de outro usuário (pública) abre só para leitura; "Duplicar para mim" grava cópia nova, privada, sem a
  ligação com cadastro/equipamento que a pessoa não enxerga (os dados copiados vão junto).
- Teste no navegador: `node portal/testes/navegador.cjs` (Chromium + Supabase simulado em memória + CSP do _headers;
  45 verificações: login, cadastros com vírgula, editor x calculos.js, lote/nº automático, ferramentas, priming, salvar/reabrir, lista, celular 390 px, receita
  de outro, sair). O container não acessa o supabase.co: teste real só depois de publicar.
- Publicação: GitHub Pages (decisão de 22/11/2026), https://llmannrich-ai.github.io/GaliaBrew/, pelo workflow
  `.github/workflows/pages.yml` (push em portal/ ou à mão): roda os testes do cálculo, monta o site sem `testes/` e
  `_headers` e publica. Só publica da branch PADRÃO do repositório. Pré-requisito único (manual, o proxy daqui não
  mexe em configuração do repositório): Settings → Pages → Source = GitHub Actions. O Pages não lê `_headers`: a CSP
  está também numa `<meta>` no index.html (frame-ancestors só vale no _headers, para um dia ir ao Cloudflare).
  Cache do Pages: 10 min; o `?v=` resolve os scripts. Depois de publicar: Supabase → Authentication → URL
  Configuration → Site URL e Redirect URLs = esse endereço (senão convite/recuperação de senha volta para localhost).
- iPhone: manifest.webmanifest + apple-touch-icon (`icones/`, desenho próprio) → "Adicionar à Tela de Início" abre
  como app; topo respeita a área do entalhe (safe-area). Versão dos scripts: 20261122f.

## Receita = lote (0005, aplicada em 22/11/2026)
- `receitas` ganhou `lote_numero` (automático pelo gatilho `receitas_numerar`: maior do dono + 1; pode repetir, ex.
  83a/83b), `data_brassagem` (date), `og_medida`, `fg_medida` (0,98-1,2), `volume_final_l`. `salvar_receita` grava
  esses campos; `lote_numero` enviado nulo mantém o atual. Teste `supabase/testes/0005_receita_lote.sql`: 8 ok.
- Carga: número e data tirados do nome das importadas (93 com nº, 61 com data); 9 sem número no nome ficaram nulos.
- `calculos.js` → `res.medido`: eficiência real (OG medida no volume real + perda da panela, menos açúcar pronto,
  sobre o açúcar possível do grão), ABV real, atenuação aparente real.
- Portal: card "Lote" (nº, data, OG/FG medidas aceitam 1,050 / 1050 / 50, volume real); lista por nº com a data;
  "Nova a partir desta" (rota `#/receita/nova/<id>`) e, na receita nova, "Começar a partir de uma receita anterior".
  A cópia leva tudo menos dados do lote, notas e "pública"; liga só cadastros que a pessoa enxerga. Data sem hora
  é formatada por `dataDoDia` (new Date desloca um dia no fuso do Brasil).

## Água da mostura e priming (0006, 22/11/2026)
- `calculos.js`: `temperaturaAguaMostura` (balanço de calor de Palmer: Tw = alvo + 0,41 ÷ (L/kg) × (alvo − grão); não
  conta a tina), `co2Residual` (CO₂ que fica na cerveja pela maior temperatura, fórmula usual em °F) e `primingGramas`
  (g/L por volume: sacarose 3,65; dextrose 4,01 = 15,195 g/galão; DME 5,84; mel 4,64 — aproximações usuais).
  Na receita: `res.volumes.temperatura_agua_mostura_c` (1º passo da mostura, `temp_grao_c`, água da mostura ÷ kg) e
  `res.priming` (volume real ou planejado; maior temperatura dos passos de fermentação, sem passos 20 °C).
- 0006: `receitas.co2_alvo_vol` (0-6) e `priming_acucar` (SACAROSE|DEXTROSE|EXTRATO_SECO|MEL; nulo = sacarose);
  `salvar_receita` grava os dois. Teste `supabase/testes/0006_priming.sql`.
- Portal: página `#/ferramentas` (`ferramentas.js`: calculadoras avulsas, valores ficam enquanto o portal está aberto;
  tabela de CO₂ típico por estilo, porque o catálogo BJCP não tem CO₂); card Lote com CO₂ desejado e açúcar; painel
  com a temperatura da água da mostura e o priming.

## Refratômetro e densímetro (22/11/2026, sem migração)
- `calculos.js`: `sgDeBrix` (°Brix ÷ fator → °P → SG; fator padrão 1,04), `refratometro` (FG com álcool pela cúbica
  de Sean Terrill, leituras ÷ fator; devolve OG, FG, ABV, atenuação) e `corrigirDensimetro` (polinômio usual da
  densidade da água em °F; calibração padrão 20 °C).
- Ferramentas: cartões Refratômetro (com "Descobrir o fator": °Brix ÷ °P do densímetro no mesmo mosto) e Densímetro.
  Fator do refratômetro e calibração do densímetro ficam em `preferencias` (localStorage), por serem do aparelho.
- `campoNumero` (ui.js): ao sair do campo mostra o valor guardado (densidade digitada 1048 aparece 1,048).

## Catálogo inicial (0004, aplicada em 22/11/2026)
- 110 estilos BJCP 2021, 215 fermentáveis, 450 lúpulos, 897 leveduras, 44 outros (escritos em português), 23 águas,
  todos com `dono` nulo e a origem em `extras.fonte`. O próprio banco baixou os arquivos do Brewtarget travados no
  commit 6d9e69d (md5 conferido) pela extensão `http`; o conteúdo não está no repositório.
- Só números e nomes dos estilos (texto do BJCP tem direitos autorais). Notas só de fonte CC BY-SA (beer-analytics.com);
  leveduras de outras fontes levam só "Indicada para". Nomes de ingredientes ficaram no original (marcas e produtos).
- Dado consertado na carga: X2 IPA Argenta vinha com densidade em pontos (1055) → 1,055. Atenuação acima de 100% → 100;
  temperatura impossível → em branco.
- A 1ª tentativa parou numa confirmação do Supabase por causa de "drop" no script (a confirmação não aparece para o
  responsável): evitar comando destrutivo em migração; se precisar, pedir para ele rodar no SQL Editor.
- A extensão `http` ficou instalada. O revoke da 0004 NÃO tirou o acesso de anon/authenticated (as permissões foram dadas
  pelo supabase_admin; o postgres não consegue revogar). Risco prático nulo: o schema `extensions` não é exposto pela API.
  Para remover: painel → Database → Extensions → http (desligar).

## Login (painel do Supabase, não dá para fazer por SQL)
- DECIDIDO (22/11/2026): cadastro ABERTO ("Allow new users to sign up" ligado), para testes com amigos. A RLS protege
  os dados. Confirmação de e-mail DESLIGADA (o e-mail padrão do Supabase só entrega para membros da org Versa, então
  amigos não conseguiriam confirmar). Consequência: recuperação de senha só funciona para membros da org.
  Senha mínima 10 caracteres.
- Para recuperação de senha de todos (ou religar a confirmação): SMTP próprio (Authentication → Emails → SMTP; ex.:
  Resend ou Brevo, plano gratuito).
- Site URL e Redirect URLs = https://llmannrich-ai.github.io/GaliaBrew/ (feito pelo responsável em 22/11/2026).
- Primeiro admin: depois de criar o próprio login, `update perfis set papel = 'admin' where user_id = ...` por SQL.

## Situação em 22/11/2026 (fim da 1ª sessão)
- No ar: https://llmannrich-ai.github.io/GaliaBrew/ (publicado da branch padrão, hoje `claude/gallant-hypatia-oyvzpp`;
  a `main` recebe o mesmo conteúdo a cada etapa concluída). O container de desenvolvimento NÃO acessa github.io nem
  supabase.co: conferir publicação por `gh api .../deployments` e o banco pelo MCP do Supabase.
- Login do responsável criado (llmannrich@gmail.com) e já `admin`. Migrações 0001-0006 aplicadas.
- A conexão MCP do Supabase precisa estar na org "Versa" (o coletor de notas está em outra org).
- Pendente do responsável: (opcional) SMTP próprio para recuperação de senha dos amigos; (opcional) repositório privado (aí o Pages exige plano pago),
  branch padrão = main (o workflow publica da branch padrão), desligar a extensão http no painel.
- 22/11/2026: FASE 1 CONCLUÍDA (testada no iPhone; Site URL/Redirect configuradas; IBU com whirlpool).
- Fase 2 (1) feita em 22/11/2026: "criar a partir de" + dados do lote (0005).
- Fase 2 (2a) feita em 22/11/2026: calculadoras de água da mostura e priming (0006, página Ferramentas).
- Fase 2 (2b) feita em 22/11/2026: refratômetro e correção do densímetro (Ferramentas).
- Próximo: (3) escalar receita. Sem módulo de brassagem e sem versões.

## Ordem de trabalho
- Fase 1 (CONCLUÍDA em 22/11/2026): 0001 aplicada ✔ → `portal/calculos.js` + testes ✔ → portal com login, cadastros e editor
  de receita ✔ → publicação no GitHub Pages (workflow pronto; falta ligar o Pages) → catálogo ✔ (0004).
- Fase 2: receita = lote ("criar a partir de", dados do lote na receita), ferramentas (água de mostura, priming,
  refratômetro, correção do densímetro), escalar receita.
- Fase 3: importar/exportar BeerJSON e BeerXML, estoque, química da água.
