# GaliaBrew — contexto para o Claude Code

Leia `docs/PRD.md` antes de qualquer tarefa. Este arquivo resume as regras que não podem ser quebradas.

## O que é
Aplicativo web de receitas de cerveja (criação, cálculo de OG/FG/ABV/IBU/cor, brassagem). Começou para uso pessoal
e já nasce multiusuário: cada pessoa vê e edita só o que é dela.

## PLATAFORMA-ALVO: CELULAR (regra nº 0, ordem do responsável em 23/11/2026)
- O GaliaBrew é usado no CELULAR (iPhone, aberto como app pela Tela de Início). NÃO é um programa de computador.
  Melhorar o layout de desktop não tem valor para o responsável: não gastar tempo nisso.
- Todo pedido de tela/layout/visual sem plataforma dita = CELULAR. Desenhar, ajustar e conferir PRIMEIRO em 390 px e
  320 px com toque (`navegador.cjs`, contexto `isMobile + hasTouch`); as capturas mostradas ao responsável são as do
  celular (`p5*`, `p6*`), nunca as de 1366 px.
- Desktop só precisa não quebrar (os testes do navegador já cobrem). Nada de propor ou fazer melhoria só de desktop.
- Erro a não repetir (23/11/2026): o pedido de contraste e layout foi feito e mostrado em capturas de computador.

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
- `.github/workflows/testes.yml` — testes de todo PR para a main ("Cálculos e versões": cálculo + conferir.sh, exigido
  na proteção da main; "Portal no navegador": navegador.cjs com Playwright 1.63.0). Sessão na nuvem publica por PR
  (modo nuvem da skill /deploy), porque só pode enviar para a própria branch.
- `docs/PRD.md` — produto, decisões, modelo de dados, fórmulas
- `docs/PLANO-UX.md` — plano de UX e arte do editor de receitas (entregas E0–E6, 22/11/2026)
- `docs/PLANO-CLEAN.md` — plano da versão Clean da receita (opcional no perfil; etapas K0–K6, 24/11/2026; todas feitas)
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
- Testes: `node --test portal/testes/*.test.mjs` (45 testes, com os do pdf.js, das faixas da roleta e do modulepreload). OG e FG batem com o Brewtarget (±0,0005) nas 28 receitas
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
- Cor na TELA (24/11/2026, pergunta do responsável: "por que o Caramunich é preto?"): duas escalas. `corHexDeSrm` = cor
  da CERVEJA (copo, barra vital, lista, relatório; acima de 40 SRM é preta). `corHexDeMalte` = cor do GRÃO, no log do SRM
  de 1 a 600 (palha → dourado → castanho → marrom → preto), para a amostra do malte na receita, a barra do grist, a busca
  de fermentável e a lista dos Cadastros (`amostraCor(srm, corHexDeMalte)`). Antes todo malte acima de 40 SRM (cristal,
  chocolate, carafa) saía no mesmo preto. Só tela: nenhum cálculo muda.
- 0002: `fermentaveis.umidade_pct` (+ cópia em `receita_fermentaveis`): o rendimento da ficha do malte é base seca;
  sem a umidade a OG sai ~4% alta. `receitas.relacao_agua_grao_l_kg` e `perda_tina_l` (água da mostura × lavagem).

## Portal (`portal/`, 22/11/2026, migração 0003)
- HTML + módulos JS sem build: `index.html`, `app.js` (login, rotas `#/receitas`, `#/receita/<id|nova>`,
  `#/cadastros/<tabela>`, `#/perfil`), `menu.js` (menu lateral), `estado.js` (cliente Supabase, sessão, preferências), `ui.js` (DOM e números
  pt-BR), `opcoes.js` (listas = CHECK do banco; cor na tela em EBC ou SRM, escolha no perfil), `cadastros.js`,
  `receitas.js`, `vital.js` (barra vital do editor), `busca.js` (busca de ingrediente e de estilo), `alvos.js` (chegar à OG / ao IBU), `icones.js` (ícones próprios), `relatorio.js` + `pdf.js` (relatório da receita em PDF), `graficos.js` (grist e linha do tempo), `tema.js` (temas de cor), `calculos.js`, `style.css`, `_headers` (CSP e cabeçalhos de segurança do Cloudflare Pages).
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
- Excluir receita (23/11/2026, pedido do responsável): SÓ dentro da receita (botão "Excluir receita" em `.acoes-receita`,
  ao lado de "Nova a partir desta"; receita salva e do próprio usuário; confirmação com o nome; volta à lista). A lista
  (cartões e tabela) não tem botão de excluir.
- Receita de outro usuário (pública) abre só para leitura; "Duplicar para mim" grava cópia nova, privada, sem a
  ligação com cadastro/equipamento que a pessoa não enxerga (os dados copiados vão junto).
- Teste no navegador: `node portal/testes/navegador.cjs` (Chromium + Supabase simulado em memória + CSP do _headers;
  454 verificações: login, criar conta e esqueci a senha (celular 390/320 px), menu lateral (recolher, só ícones no tablet, gaveta no celular, linhas de ingrediente dentro do
  cartão em 1024/1280/1366/1440 px), cadastros com vírgula, busca (acento, teclado, sem filtros, recentes, 901 leveduras), ±/setas,
  arrastar e mover pelo teclado, detalhes/remover, desfazer/refazer, chegar à OG/IBU, sem cadeado, referência, barra vital x calculos.js, estados do estilo, diferença após
  mudança, barra à vista com a página rolada (1366 px e celular 390 px), tablet 1024 px, modo escuro, salvar/reabrir,
  lista, lote (nº automático, data, OG/FG medidas, eficiência real), "Nova a partir desta" e "começar a partir de",
  priming e temperatura da água no painel, tela Ferramentas (água da mostura, priming, refratômetro, correção do densímetro), água da
  receita (perfil de íons e sulfato/cloreto, pH estimado e ácido, volumes das águas informados),
  receita de outro, sair; e um bloco de celular com toque: barra do app, toque/segurar no ±, teclado aberto,
  cartões, arrastar com o dedo, janelas em 390 e 320 px, levedura em linha fixa + janela). O container não acessa o supabase.co: teste real só depois de publicar.
- Editor (E0 + E1 do `docs/PLANO-UX.md`, 22/11/2026, fonte do sistema): tokens de cor/tipo no topo do `style.css`
  (contraste AA conferido nos dois modos); barra vital fixa (computador: abaixo do topo; celular: no rodapé, ~157 px desde
  22/11/2026: puxador "detalhes" + 2 linhas de 3 números com régua; com teclado aberto fica baixa, sem régua;
  "detalhes" abre estado e faixas) com OG, FG, ABV, IBU, cor, pH da mostura (faixa fixa 5,2–5,6, ideal 5,3–5,5,
  não depende do estilo; "—" sem grão na mostura), régua da faixa do estilo (`reguaDoEstilo()` no calculos.js:
  folga de 25%, "perto" = últimos 10% da faixa, valor arredondado como na tela), estado com cor + ícone + texto, e a
  diferença da última mudança (acumula no mesmo campo, some em 3 s). Estilo no topo; Parâmetros numa seção curta
  (ver "Parâmetros da receita"); volumes e água no painel lateral (coluna única abaixo de 1180 px). SVG pelo `svg()` do ui.js.
- Editor (E2, 22/11/2026): fermentáveis e lúpulos em linhas (`secaoLinhas` no receitas.js) com a quantidade em
  destaque (`campoQuantidade` do ui.js: botões ± que não roubam o foco, ↑/↓ = 1 passo, Shift = 10; passo no perfil,
  padrão 250 g malte (era 50 g; 50 salvo no navegador vira 250 no estado.js) / 5 g lúpulo, em `preferencias`), % do grist e pontos da OG por malte, IBU e g/L por lúpulo
  (`pct_peso`, `pontos_og`, `g_l` no calculos.js), cor do malte em texto pequeno abaixo do nome (`.ing-sub`, unidade do perfil, 23/11/2026), totais no cabeçalho (fermentáveis: kg em destaque + água/malte efetiva = água da mostura ÷ grão da mostura, 23/11/2026), tocar no item (nome com seta ›, cor ou números; não nos campos) = JANELA do item (ver "Janela do item" abaixo; o
  botão ⋯ foi retirado em 23/11/2026), alça ⠿ para arrastar (mouse e toque) ou mover com ↑/↓. Leveduras, outros, mostura e fermentação
  seguem em tabela. O "+" do título da seção (23/11/2026, pedido do responsável: só o sinal, sem borda, 2,25rem negrito na fonte do
  app, cor `--destaque-escuro`, 44 px de toque, `aria-label` "Adicionar"; vale também para os passos de mostura/fermentação)
  abre a busca (`busca.js`): sem acento, vários termos, SEM filtros em botões
  (retirados de todas as buscas em 23/11/2026, pedido do responsável: no celular ocupavam a tela), recentes
  (localStorage) e "meus" no topo, 60 resultados por vez, Enter adiciona e leva o foco à quantidade.
- Busca de estilo (23/11/2026, sem migração): o Estilo do topo do editor é um botão que abre a mesma janela do `busca.js`
  (`TIPOS_BUSCA.estilos`). Acha por código (21A, casa exato e vem primeiro), nome, categoria e termos em português
  (`TERMOS_ESTILO`: trigo, azeda, defumada, belga, pilsen, oktoberfest...; o catálogo BJCP está em inglês). No estilo
  cada termo casa com o COMEÇO de uma palavra ("ale" não acha "Pale Lager"). Filtros: Receita ("Combina com a receita"
  = no máximo 1 parâmetro fora), Família, Cor, Amargor, Álcool — RETIRADOS em 23/11/2026 (no celular ocupavam a tela
  toda; pedido do responsável): a busca de estilo não tem filtros. Sem busca: "Atual", "Mais perto da receita" (5, por
  `encaixeEstilo` do calculos.js: parâmetros dentro da faixa e distância em larguras), recentes, catálogo em ordem de
  código (`ordemCodigo`: 3A antes de 10A). "Sem estilo" limpa. Cadastros → Estilos usa a mesma busca (`buscarItens`).
- Editor (E3, 22/11/2026; o modo "receita em %" ficou de fora por decisão do responsável): "Chegar à OG" escala os
  fermentáveis destravados pelo mesmo fator (bisseção, `ajustarParaOG`); "Chegar ao IBU" muda só um lúpulo (o de mais
  tempo ou o escolhido; regra de três, `ajustarParaIBU`). Abrem SÓ pelo número da OG/IBU na barra (os botões
  das seções Fermentáveis e Lúpulos foram retirados em 23/11/2026, pedido do responsável),
  com prévia antes de aplicar; aceitam OG em pontos (46 = 1,046). Cadeado por item RETIRADO da tela em 22/11/2026 (pedido do
  responsável); `travado` continua aceito no calculos.js, mas a tela não marca mais. Histórico em memória (50 passos; digitação vira passo após 0,8 s ou ao trocar de campo; ação inteira
  = 1 passo); Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y; desfazer remonta o editor e a barra mostra a diferença. A referência
  fixada ("Fixar/Voltar à referência") SAIU em 26/11/2026 (ver "Barra de números sem ferramentas").
  Histórico some ao sair da receita e ao salvar uma receita NOVA (o editor recarrega com o id).
- CELULAR PRIMEIRO (decisão de 22/11/2026: o responsável e a maioria das pessoas usam pelo celular). Toda tela nova se
  desenha e testa primeiro em 390 px e 320 px com toque (contexto `isMobile + hasTouch` no navegador.cjs).
  Etapa de celular (22/11/2026): no editor o menu geral (hoje a `barra-movel`) some e entra a `barra-app` presa no topo (‹ voltar, nome,
  ↶ desfazer, Salvar com ponto quando há alteração pendente); a barra de números acompanha o teclado
  (`visualViewport` → `--teclado`) e o campo em foco rola para cima dela (rolagem instantânea: toque durante rolagem
  suave não vira clique). TECLADO NO IPHONE (23/11/2026, print do responsável: a barra cobria a quantidade do malte
  novo): o iOS encolhe a área visível E a rola para cima do teclado (`offsetTop`), e a conta antiga descontava o
  offsetTop → "sem teclado", barra grande. Agora teclado aberto = `innerHeight − vv.height > 120` OU campo de digitar
  em foco em tela de toque (classe `com-teclado` na barra e `teclado-aberto` no html). Com teclado a barra vira UMA
  linha de 6 números (~47 px; em ≤ 360 px 5, sem o pH, porque "−0,037" não cabia com a fonte do GitHub; rótulos curtos EBC/pH, letra ≥ 12 px; a diferença aparece no lugar do rótulo), sem
  puxador/régua/aviso/margem do entalhe, e "detalhes" fecha; a página ganha 55vh embaixo para os últimos campos
  subirem; `manterAcimaDaBarra` só age no campo EM FOCO e só ao abrir o teclado/trocar de campo (rolar a tela com o
  teclado aberto não puxa de volta). Quantidade (`campoQuantidade`): no toque o número vem selecionado (digitar troca
  tudo), só se nada foi digitado desde o toque. Teste "iPhone:" no navegador.cjs simula o offsetTop; ± com toque no soltar (rolar a tela por cima não conta) e segurar repete; tabelas
  (leveduras, outros, mostura, fermentação) viram cartões com rótulo por campo (`td[data-rotulo]::before`); chip de
  diferença com `pointer-events: none`; `touch-action: manipulation` nos elementos de toque (sem espera de toque
  duplo). O arrastar com o dedo funciona. PENDÊNCIA: no simulador do Chrome, o 1º toque depois de arrastar a alça não
  vira clique (preso até o toque seguinte); causa não achada (detalhes no navegador.cjs). Conferir no iPhone real.
- Arte (E4, 22/11/2026): ícones próprios em `icones.js` (grade 24, traço 1,75, `icone(nome)` gera SVG pelo `svg()`;
  sem arquivo .svg para não precisar de requisição nem mexer na CSP): títulos de seção com ícone num círculo, botões
  (adicionar, desfazer, refazer, voltar) e copinho na marca. Barra do grist (cada malte na própria cor, % do peso,
  descrição para leitor de tela) e linha do tempo da fervura (`graficos.js`: bolinha por lúpulo, tamanho ~ gramas,
  fervura / whirlpool / dry hop; tocar leva à linha do lúpulo e a destaca). Copo ao lado da barra do grist (24/11/2026, pedido do
  responsável) na cor FINAL da cerveja (`corHexDeSrm`, igual ao copo da barra vital; `aria-label` "Cor da cerveja: N EBC");
  a barra mostra a cor de cada grão (`corHexDeMalte`). Captura `p6u` (390 e 320 px). Lista de receitas em cartões no celular
  (copo na cor da cerveja, nº, nome, estilo, data, OG/ABV/IBU/cor), tabela no computador. Ícone do app = o livro da logo Galia (25/11/2026, ver "Logo na página principal").
- Publicação: GitHub Pages (decisão de 22/11/2026), https://llmannrich-ai.github.io/GaliaBrew/, pelo workflow
  `.github/workflows/pages.yml` (push em portal/ ou à mão): roda os testes do cálculo, monta o site sem `testes/` e
  `_headers` e publica. Só publica da branch PADRÃO do repositório (a `main`). Pré-requisito único (manual, o proxy daqui não
  mexe em configuração do repositório): Settings → Pages → Source = GitHub Actions. O Pages não lê `_headers`: a CSP
  está também numa `<meta>` no index.html (frame-ancestors só vale no _headers, para um dia ir ao Cloudflare).
  Workflow em dois jobs (montar → publicar, 24/11/2026: num job só o deploy-pages falhava sem achar o pacote).
  Cache do Pages: 10 min; o `?v=` resolve os scripts. Depois de publicar: Supabase → Authentication → URL
  Configuration → Site URL e Redirect URLs = esse endereço (senão convite/recuperação de senha volta para localhost).
- iPhone: manifest.webmanifest + apple-touch-icon (`icones/`, desenho próprio) → "Adicionar à Tela de Início" abre
  como app; topo respeita a área do entalhe (safe-area). Versão dos scripts: 20261128b.
- Menu lateral (`menu.js`, 23/11/2026, substituiu o menu horizontal): sempre escuro (café + cobre no Clássico/Adega; cada tema tem o seu menu escuro);
  ícones do `icones.js`, copo da marca do `vital.js` e arte de lúpulo e cevada em traço fino no pé (SVG no JS, sem
  arquivo e sem style inline). ≥ 1181 px: completo, botão "Recolher" deixa só ícones (`preferencias.menu_recolhido`).
  960–1180 px: só ícones automaticamente (classe `compacto`; o editor precisa da largura). ≤ 959 px: `barra-movel` escura
  no topo e o menu vira gaveta (fecha ao escolher, no véu ou com Esc; trava a rolagem enquanto aberta). `--topo-h` =
  altura da `barra-movel` (0 no computador). No editor do celular (≤ 640 px) a `barra-movel` some, como antes o topo.
  Editor em coluna única pela LARGURA AO LADO DO MENU, não pela tela: classe `estreito` na `.casca` quando a `.principal`
  tem até 1180 px (ResizeObserver no menu.js; regras com `:where(.casca.estreito)`, sem somar especificidade). Ex.: 1366 px
  com menu completo = uma coluna; recolhido = duas.
- Layout de contraste (23/11/2026, pedido do responsável; só style.css): página branca (`--fundo` = `--cartao` = branco;
  escuro #13100d), texto #1a130d (18:1), `--suave` #4d4237 (9,8:1 no branco, 8,3:1 na faixa), `--borda-campo` ≥ 3:1,
  `--apagado` só para placeholder (itálico). Estados (lúpulo, âmbar, fora) ≥ 4,7:1 no branco e na faixa. Conferir a razão
  ao mudar uma cor. Seção SEM contorno: `.cartao` sem borda/sombra/margem interna; o título (`.cartao > h3`,
  `> .titulo-linha`, `details.lote > summary`) fica numa faixa `--painel` com traço cobre à esquerda. Barra vital, blocos
  do painel lateral, login e cartões da lista = fundo `--painel`, sem borda. Página sem largura máxima, margem lateral
  `--lado` (.75rem; .55rem no celular; a `barra-app` usa o mesmo valor na margem negativa). Ferramentas em `columns`.
  Testes de largura das linhas de ingrediente: folga ≥ 0 até a borda da seção (não há mais margem interna de 17 px).
- Campos mais enxutos (23/11/2026, duas rodadas pedidas pelo responsável: "levemente acima do necessário" e "reduza mais
  um pouco"; só style.css): no celular ± 36×36 px (eram 44), quantidade 69×32 (80×40), campos de texto/número e
  seletores ~32 px de altura (40), com a letra de 16 px mantida nos campos (abaixo disso o iPhone dá zoom ao tocar). "+" de adicionar, × de remover e botões
  da barra do app continuam com 44 px.
- Lúpulo em 2 linhas no celular (24/11/2026, pedido do responsável: "ocupar menos linhas"; só style.css): etapa e tempo
  à DIREITA do nome (seletor 6,4rem, tempo 2,9rem, só na linha; o nome longo quebra); quantidade e IBU/g/L embaixo.
  Whirlpool: a temperatura desce para baixo do tempo. Teste "toque 390/320 px: etapa e tempo do lúpulo à direita do
  nome"; capturas `p6l-celular-lupulos` (390) e `-320`.
- Leitura no celular (23/11/2026, regra nº 0; fim do bloco `max-width: 640px` do style.css): nenhum texto abaixo de
  ~12 px (rótulos em maiúsculas da barra vital, dos cartões de tabela e GRIST/OG/IBU iam a 10,9 px), dado do
  ingrediente (`.ing-sub`) e legenda do grist quebram linha em vez de cortar, × de remover no canto do cartão ao lado do
  nome, menos vão entre seções (1,25rem), régua com trilho mais escuro (`--trilho` #e0d4c1).
- Papel de parede por seção (23/11/2026, pedido do responsável: "layout cansativo"): cada seção do editor
  (`.editor-corpo > .cartao`, pelo `data-secao`) é um bloco de cor clara com desenho apagado em SVG no próprio CSS
  (data URI; a CSP aceita `img-src data:`): Fermentáveis amarelo/ramo de cevada com grãos e barbas, Lúpulos verde/flor (cone de
  brácteas) e folha palmada, Leveduras branco/células brotando com vacúolo, Água azul/gota e ondas (cores e desenhos
  pedidos pelo responsável; arte própria, traço 1,3 em ladrilho de 150 px, 23/11/2026); Notas creme com pauta; demais alternam creme e branco liso. No
  celular os blocos vão de ponta a ponta e encostam um no outro (a cor separa); título sem faixa, ícone na cor da
  seção. Tokens `--pp-*` no style.css (claro e escuro); texto e estados ≥ 4,6:1 em todos os fundos.
- Colarinho de espuma entre as seções (23/11/2026, pedido do responsável: arte própria para separar as seções, que só
  mudavam de cor; só style.css, só no celular ≤ 640 px): cada seção do editor começa com uma crista de espuma de cerveja
  que sobe por cima da anterior (bolhas grandes e pequenas na borda com traço na cor da seção, bolhas vazadas dentro e
  bolhinhas soltas). Duas máscaras SVG em data URI (`--espuma-forma`, `--espuma-aro`; ladrilho 240 × 32 px) no
  `::after` (na cor `--pp` da PRÓPRIA seção: com cor mais clara ficava uma faixa com linha reta sobre o fundo de baixo, print do iPhone em 23/11/2026; não usar `--espuma`, que é a cor do copinho) e `::before` (aro na cor da
  seção); a cor vem das variáveis, então vale em todos os temas. 32 px: 18 acima da seção, 14 dentro; padding da seção
  maior em cima e embaixo para não encostar no conteúdo; `pointer-events: none`; o desenho começa em ponto diferente a
  cada seção (`--espuma-x` por nth-child). Para mudar o desenho, regerar as duas máscaras juntas (o aro = a forma 1,6 px
  acima + as bolhas soltas).
- Passos em cartão no celular (23/11/2026, print do responsável na Mostura): do 2º item em diante ↑ e × ficam lado a
  lado à direita do nome, que abre 6,6rem para os dois (antes abria só 3,3rem e o ↑ cobria o nome); os botões ficam no
  meio da altura do campo do nome (`top: 1.75rem`). Vale para leveduras, outros, mostura e fermentação (`secaoLista`).
  Teste "toque 320/390 px: ↑ e × dos passos da mostura" (captura `p6m`). A lista de opções do Tipo é a nativa do iOS.
- Alça ⠿ no lugar do ↑ (24/11/2026, pedido do responsável): leveduras, outros, mostura e fermentação (`secaoLista`) usam a
  mesma alça dos maltes/lúpulos (`ing-alca`), em TODOS os itens, ao lado do ×: arrastar (mouse e dedo) ou ↑/↓ no teclado
  (1 passo do desfazer). Arrastar é o `arrastarPelaAlca` do receitas.js (serve a `li` e `tr`). Teste "mostura: alça ⠿".
- Tipo do passo da mostura (24/11/2026, pedido do responsável, sem migração): na tela só "Rampa N" (numerada pela ordem
  entre as rampas; trocar o tipo ou mover renumera), "Mash out" e "Lavagem" (`TIPO_MOSTURA`, `tipoPasso`, `rotuloPasso`
  no opcoes.js; o relatório em PDF usa o mesmo rótulo). Rampa grava `TEMPERATURA` (tipo genérico do BeerJSON); INFUSAO e
  DECOCCAO antigos (importadas do Brewfather) ficam no banco e aparecem como rampa. O tipo não entra em nenhum cálculo.
  Passo = tipo (24/11/2026, pedido do responsável: o nome só repetia o tipo): o cartão tem só "Passo" (seletor Rampa N /
  Mash out / Lavagem, `aria-label` "Passo da mostura"), Temp. e Tempo. Sem campo de nome: ao salvar,
  `montarPayload` grava `nome` = o rótulo ("Rampa 2"; a coluna é not null). Nomes antigos (ex.: "Protein rest" das
  importadas) são trocados pelo rótulo quando a receita é salva. Relatório: colunas Passo | Temperatura | Tempo.
  Passo numa LINHA SÓ (24/11/2026, pedido do responsável): ⠿ à ESQUERDA (padrão dos maltes e lúpulos) | passo | temp. °C |
  tempo min | ×, sem rótulo em cima (unidade depois do número). `secaoLista(..., { linhaUnica: true })` + coluna `u`
  (unidade) no receitas.js; tabela `.passos-linha` no style.css (seletor com seta própria e estreita: a nativa cortava
  "Rampa 1" em 320 px). FERMENTAÇÃO no mesmo padrão (24/11/2026, pedido do responsável): ⠿ | nome | °C | dias | ×
  (coluna dos dias um pouco mais larga: cabe "120 dias"). Leveduras e outros seguem em cartão (alça à direita). Testes
  "toque 320/390 px: cada passo da mostura/fermentação numa linha" (ordem, mesma altura, sem sobrepor, sem cortar texto);
  capturas `p6m-celular-mostura-320/390` (mostram as duas seções). Vale no layout Completo; no Clean (K4) a mostura e a
  fermentação usam a ficha (`resumo` no `secaoLista` → `secaoListaFicha`).
- Rolagem só na vertical (23/11/2026, pedido do responsável: a tela podia ser arrastada para o lado): `html`/`body` com
  `overflow-x: clip` (o que passar da largura é cortado, sem criar área de rolagem; não atrapalha o `sticky`). A causa
  era a lista dos Cadastros, tabela larga demais no celular: até 640 px virou cartões (`.tabela.lista-cad`, nome em cima
  e dados com o nome da coluna na frente, pelo `data-rotulo`). Como o corte esconde o que sobra, tela nova TEM de caber:
  o `conferirLateral` do navegador.cjs arrasta o dedo para o lado e lista o que passa da borda (lista, editor,
  ferramentas, cadastros e perfil em 320 px).
- Temas de cor (23/11/2026, pedido do responsável; sem migração): Meu perfil → Aparência, 9 opções em cartões com
  miniatura do app: Automático (Clássico de dia, Adega à noite, segue o celular sem recarregar), Clássico, Adega,
  Pilsen, IPA, Red Ale (claros), Stout, Black IPA (escuros) e Sol forte (alto contraste para a brassagem ao ar livre:
  preto no branco, borda de campo 2 px, sem desenho de fundo). Escolha em `preferencias.tema` (localStorage: vale no
  aparelho). `tema.js` é script COMUM no `<head>`, sem defer (entra antes da 1ª pintura, não pisca): lista dos temas,
  põe `data-tema` e `data-modo` (claro|escuro) no `<html>` e a cor do `theme-color`; `window.GaliaTema` para o perfil.
  CSS: o modo escuro NÃO usa mais `prefers-color-scheme`; é `[data-modo="escuro"]`. Cada tema = bloco
  `[data-tema="..."]` (sem :root, para valer nas miniaturas) que troca só o que muda sobre a base, inclusive o menu
  (`--menu-*`; o destaque do menu usa color-mix da `--menu-cobre`). Contraste conferido por script em todos os temas
  (texto ≥ 7:1 no fundo e ≥ 4,5:1 nos fundos de seção; estados e destaque ≥ 4,5:1; borda ≥ 3:1). Tema novo: bloco no
  style.css + linha no `TEMAS` do tema.js + reconferir o contraste.
- Pendente (já existia antes do menu): editor estoura a largura entre 641 e ~850 px (iPad em pé): as linhas de
  ingrediente só ficam compactas até 640 px.

## Carregamento mais rápido (27/11/2026, pedido do responsável: "carregamento lento" ao abrir o app e a receita; sem migração)
- Causa: cada receita aberta baixava as 7 tabelas do catálogo com todas as colunas (~1,9 MB de JSON; ~920 kB eram notas
  que o editor não mostra), sempre de novo; e os 21 módulos JS chegavam em cascata (5 níveis de import = 5 idas e voltas).
- Catálogo do editor (`catalogoDoEditor` no cadastros.js): só as colunas usadas (`COLUNAS_EDITOR`: sem notas e sem datas;
  o malte mantém as notas por causa do link da The Swaen no fontes.js), ~0,97 MB, UMA leitura por sessão guardada em
  memória por 30 min. Gravar/excluir nos Cadastros apaga a cópia daquela tabela; sair/trocar de usuário apaga tudo.
  Pré-carregado 1,2 s depois da 1ª tela (`preCarregarCatalogo` no app.js). A tela de Cadastros continua com `select *`
  (`listarCadastro`). Ingrediente novo usado pelo editor = coluna nova no `COLUNAS_EDITOR`.
- Paginação: o PostgREST do Supabase devolve no máximo 1.000 linhas (leveduras já são 897): `lerTudo` lê em páginas de
  1.000 com `id` no fim da ordem. O Supabase simulado do navegador.cjs aplica offset/limit e o teto de 1.000.
- `<link rel="modulepreload">` de todos os módulos no index.html (com o mesmo `?v=`): baixam juntos. Módulo novo = linha
  nova lá; `portal/testes/modulos.test.mjs` falha se faltar ou sobrar.
- Teste do navegador: "catálogo do editor baixado uma vez, sem notas e paginado". Não medido no iPhone real.
- Próximo passo se a 1ª abertura ainda incomodar: guardar o catálogo no aparelho (IndexedDB) e/ou service worker para os
  scripts (o GitHub Pages força cache de 10 min; depois disso cada abertura reconfere os arquivos).

## Barra de números limpa no celular (24/11/2026, pedido do responsável: "carregada, com bordas"; só style.css + vital.js)
- Sem cartões, sem bordas e sem cantos arredondados: os 6 números ficam direto no papel da barra (`--painel`), que se
  separa da página só por uma sombra suave para cima. Estado = ponto colorido antes do rótulo (verde no estilo, âmbar
  perto, vermelho fora; fora o número também fica vermelho). Régua de 4 px com o marcador recortado no papel; na cor, a
  faixa do estilo são dois traços [ ] sobre a escala de cor. Ponto com a cor da cerveja antes do número da cor
  (`.vital-amostra`, só no celular; some na linha fina do teclado). Diferença da última mudança = texto solto no canto,
  sem pílula. Computador não mudou. Capturas `p5`, `p5c`, `p6d`, `p6g`.

## Números em lista no celular (26/11/2026, pedido do responsável: "muito resumidos, difíceis de ver os limites do estilo; um abaixo do outro, semelhante ao Brewfather"; só style.css + vital.js)
- No cartão dos números do Clean (sempre) e no "detalhes" aberto do Completo: uma LINHA por número (OG, FG, ABV, IBU,
  Cor, pH): ponto do estado + rótulo | régua larga (8 px, marcador de 14 px) com os LIMITES do estilo escritos embaixo das
  pontas da faixa (`.regua-lim`, posição = `regua.ini`/`regua.fim`) | número. "Detalhes" acrescenta o estado em texto
  e BU:GU/atenuação. A barra fechada do rodapé no Completo segue em 2 × 3 (6 linhas
  fixas cobririam ~1/3 da tela) e a linha fina (teclado, roleta, cartão rolado) não mudou. Computador não mudou.
- Copo: sai do cartão do Clean (a cor tem a amostra na própria linha) e volta ao lado da barra do grist.
- Teste do navegador (`conferirListaVital`): 6 linhas uma abaixo da outra, régua ≥ 70 px, limites visíveis sem sobrepor
  e sem passar do número, no "detalhes" (390 px) e no Clean (390 e 320 px). Capturas `p5c`, `p7e`, `p7e2` (320 px), `p7d`.

## Barra de números sem ferramentas e com rótulos curtos (26/11/2026, pedido do responsável; vital.js, receitas.js, style.css)
- Saiu a linha de ferramentas da barra (`.vital-ferramentas`: Desfazer, Refazer, Fixar/Voltar à referência, Soltar) e a
  função de referência inteira (`definirReferencia`, `t.ref`, `.vital-ref`): "não traz informação útil". Desfazer fica no
  ↶ da barra do app (celular) e em Ctrl+Z; refazer só por Ctrl+Shift+Z / Ctrl+Y (no celular não há mais botão de refazer).
- Rótulos: "EBC" (ou "SRM", conforme o perfil) no lugar de "Cor EBC" e "pH" no lugar de "pH mostura", em todo lugar da
  barra (sem o `.rot-longo`). Teste "barra de números sem Desfazer/Refazer e sem referência" e "rótulos curtos".

## Layout Clean da receita (24/11/2026, pedido do responsável; plano `docs/PLANO-CLEAN.md`; sem migração)
- Opcional: Meu perfil → Aparência → "Layout da receita: Completo | Clean" (`preferencias.layout`, localStorage). O
  `tema.js` põe `data-layout` no `<html>` antes da 1ª pintura (`GaliaTema.layouts/layout/aplicarLayout`). Padrão = Clean desde 27/11/2026 (ver "Padrão Pilsen + Clean"; antes Completo).
  Vale com QUALQUER tema (decisão do responsável: sem tema novo).
- Decisões do responsável (24/11/2026, "Sim" às recomendações do plano): cores do tema sem decoração; números no topo +
  linha fina ao rolar (K2, a fazer); tocar na quantidade abre a roleta direto; se o Clean for aprovado em ~2 semanas,
  vira o padrão e o Completo sai (não manter dois layouts para sempre).
- K0 (feito): bloco `:root[data-layout="clean"]` no fim do style.css: `--pp-*` = cartão liso, sem motivos, sem espuma
  (`::before/::after` content none), sem ícone em círculo; seções = cartões (`--k-cartao`) sobre a página `--k-pagina`
  (claro: 5% de tinta; escuro: fundo, cartão 7% de tinta); títulos em versalete 12 px cinza; "+" mais leve.
- K3 (feito): malte e lúpulo em FICHA (`li.ing.ficha`, `ficha` no `montarEditor`/`secaoLinhas` do receitas.js): amostra
  (lúpulo: ponto verde) · nome + um dado (`subFicha`: malte = tipo se não for grão + cor; lúpulo = `quandoLupulo()` +
  alfa) · quantidade (o MESMO `campoQuantidade`, sem ± na linha; toque = roleta direto) + um resultado (grist %; IBU, ou
  g/L no dry hop pela classe `sem-valor`). Sem alça e sem seletor de etapa na linha: ordem, etapa e ± ficam na janela do
  item (tocar no nome). Linha ≤ 64 px (58 px no teste).
- K2 (feito, só celular ≤ 640 px): `criarBarraVital({ noTopo })` põe a barra numa `.vital-vaga` no fluxo, logo abaixo
  do topo: CARTÃO com o copo e os 6 números (`.vital.no-topo`, position static). IntersectionObserver na vaga (margem
  de cima = altura da `barra-app`): saiu da tela → classes `flutuante` + `com-teclado` = a linha fina do teclado presa
  no rodapé (42 px); voltou → cartão. A vaga guarda a altura do cartão (`min-height`) para a página não pular quando a
  barra fica fixa (rolagem, teclado ou roleta). No Clean o copinho do grist some (o copo está no cartão).
  K0 + K3 PUBLICADAS em 24/11/2026 (PR #50).
- K1 (feito): topo `.topo-clean` = meta do lote (`metaTopo`; desde 26/11/2026 ver "Ações ao lado do nome"), nome como
  título (o mesmo campo, sem moldura), estilo como link. Parâmetros = o cartão da PR #53 (3 números tocáveis + "Todos ›"
  que abre `dialog.parametros-janela`), 1º cartão do corpo, logo abaixo dos números; no Clean os 3 números ficam sem
  moldura e o "Todos ›" vira link (a linha curta dos Parâmetros no topo, de antes da PR #53, saiu). Ações (menu ⋯ até 26/11/2026; hoje
  ícones ao lado do nome, ver "Ações ao lado do nome"): Relatório (PDF), Nova a partir desta, Informações (tipo, autor, pública: os campos da
  seção Dados gerais numa janela, `abrirInformacoes`; a seção sai da página) e Excluir receita (chamam os botões de
  sempre). No celular `.acoes-receita` some; o nome só aparece na barra do app depois de rolar (`sem-titulo`). Números a
  171 px do topo em 390 px (eram 250). Ícones novos: reticencias, copiar, lixeira.
- K4 (feito): outros, mostura e fermentação em FICHA (`secaoListaFicha` no receitas.js, quando `secaoLista`
  recebe `resumo(item, i)` → { nome, sub, valor, valor2 }): uma linha por item (ex.: "Rampa 1 | 66 °C · 60 min").
  Leveduras NÃO: usam o `secaoLinhas` (ver "Leveduras com valores fixos"). Tocar abre `dialog.item-janela.passo-janela` com os MESMOS campos das
  colunas (roleta por cima, em popover), ↑ ↓ Remover e Pronto; "+" cria e já abre a janela do item novo
  (`abrirPassoDe`). Sem tabela, sem alça e sem × na linha. Auxiliares de texto `n0` e `juntar`.
- K5 (feito): Notas em RESUMO (a Água também até 25/11/2026: hoje tem seção própria, ver "Água no Clean"; o Lote até
  24/11/2026: hoje usa o cartão da Brassagem) (`secaoResumida(chave, titulo, conteudo, linhas)` no receitas.js; as linhas
  são refeitas a cada cálculo pelo `aoRecalcular`). Notas: começo da nota. Tocar
  abre `dialog.item-janela.resumo-janela` com a seção de sempre (os mesmos nós; Lote leva também Medido e Priming) e
  Pronto. Ordem no Clean: parâmetros, fermentáveis, lúpulos, leveduras, mostura, fermentação, água, outros, brassagem, notas.
  Sem painel lateral: Mais números, Volumes e Água (do painel) ficam na janela "Todos ›" dos Parâmetros, abaixo dos
  campos (`.parametros-numeros`); as notas de rodapé do painel ("Comparando com...", "IBU pelo Tinseth...") não
  aparecem no Clean. Em ≤ 360 px o cartão dos números usa rótulos curtos (pH, EBC): no CI "pH MOSTURA" passava da borda.
- K6 (feito, 24/11/2026, pedido do responsável: "talento melhor na separação entre as seções, títulos, fontes"; só
  style.css, bloco "Clean K6" no fim, só ≤ 640 px): cada seção (e o cartão dos números) = cartão arredondado (14 px,
  borda 8% da tinta, sombra mínima) com vão de .65rem sobre a página cinza; cabeçalho da receita direto na página (meta
  em versalete 12 px, nome 26 px peso 780). Título da seção: traço de 3 px na cor de destaque + nome em versalete 13 px
  na cor do texto + totais à direita (tabulares) + linha fina embaixo; "+" num círculo de 36 px com fundo 12% do
  destaque; "›" dos resumos na mesma medida. Linhas: nome 15,5 px peso 520, dado 13 px, número 15,5 px negrito;
  separador em sombra interna de 1 px. Linha do tempo dos lúpulos 58 → 40 px (bolinhas a 78%). Teste "clean K6":
  contraste nos 8 temas fixos (texto ≥ 7; secundário, estados e "+" ≥ 4,5; traço ≥ 3), medido nas cores calculadas.
  Capturas `p7d` (escuro, topo) e `p7l` (escuro, rolado). Falta só conferir no iPhone real.
- Ícone mínimo no título (25/11/2026, pedido do responsável): o traço de 3 px saiu; no lugar, um ícone de 18 px na cor
  de destaque, sem círculo (`<seção>_min` no icones.js: grão, cone, célula com broto, folha, termômetro, bolhas, panela,
  gota, controles, linhas; `tituloSecao` usa o `_min` quando o layout é Clean). Nome da seção 13 → 14 px. Fichas e
  resumos usam o ícone da própria seção (antes "geral"). Teste "clean: ícone mínimo..." e contraste do ícone ≥ 3.
- Teste do navegador: bloco "clean:" (perfil, ficha, roleta, janela, 390/320/1366 px,
  escuro, K2 topo/rolado); capturas `p7` (perfil), `p7a` (receita), `p7b` (roleta), `p7c` (320 px), `p7d` (escuro),
  `p7e` (números no topo), `p7f` (linha fina ao rolar), `p7g` (ações ao lado do nome), `p7h` (passo com roleta), `p7i` (levedura em linha),
  `p7j`/`p7j2` (Água: blocos e concentração final), `p7k` (+ da lavagem), `p7k2` (sal novo na roleta), `p7k3` (Água 320 px).

## Padrão Pilsen + Clean (27/11/2026, pedido do responsável; só tema.js)
- Quem abre o app sem escolha salva no aparelho começa no tema PILSEN e no layout CLEAN (`TEMA_PADRAO`/`LAYOUT_PADRAO` no
  tema.js; valor desconhecido também cai no padrão). Escolha feita no perfil (`preferencias.tema`/`layout`) continua
  valendo. Consequência: aparelho que nunca escolheu tema/layout (inclusive quem já usava) passa a abrir em Pilsen + Clean.
- Teste do navegador: contexto limpo no início confere o padrão e que a escolha salva vence; os demais contextos começam
  com Automático + Completo salvos (`SEMENTE_PREF`), porque as verificações antigas foram escritas sobre eles.

## Parâmetros da receita (24/11/2026, pedido do responsável; sem migração)
- Saiu o `<details>` "Parâmetros" que abria na página. Agora: seção `section.cartao.parametros` (`data-secao="parametros"`)
  com o nome do equipamento no título e SÓ os 3 números principais (Volume, Eficiência, Fervura; `.param-resumo`). São o
  mesmo `campoNumero`: no celular tocar abre a ROLETA direto (como a quantidade do malte/lúpulo; barra de números fina
  acima, 1 passo do desfazer); no computador, campo. Botão "Todos ›" (`button.param-todos`) abre a janela.
- Janela `dialog.parametros-janela` (`abrirParametros` no receitas.js; mesmo molde/CSS da janela das Ferramentas):
  cabeça presa com Pré-fervura · Pós-fervura · Água total ao vivo (`janelaParam.aoCalcular`), Equipamento (copia os
  parâmetros, 1 passo) e os 9 campos (`CAMPOS_PARAM`) em grade de 3 colunas × 3 linhas: rótulo curto em cima com ⓘ
  preso à última palavra, número + unidade embaixo (cabe em 320 px; subgrid alinha os campos quando o rótulo quebra; a
  explicação do ⓘ abre na largura da grade). Fecha por ×, Pronto, Enter, Esc, toque no fundo ou troca de rota (roleta
  aberta: fecha só a roleta); ao fechar, a seção redesenha e o foco volta ao "Todos". Desfazer fecha a janela.
  aria-label dos campos = rótulo completo ("Volume no fermentador (L)"...). Água/grão continua sincronizada com a água da
  mostura (`campoRelacao` = campo da janela, só enquanto aberta).
- Teste do navegador: seção com 3 números, janela 3 × 3, volumes ao vivo, Pronto/foco, roleta na eficiência (OG
  acompanha, ↶ desfaz), roleta dentro da janela, 390/320 px sem passar da largura. Capturas `p6p` (seção 390),
  `p6p2` (janela 390), `p6p3` (roleta na janela), `p6p4` (janela 320), `p6p5` (seção 320).

## Brassagem (lote) no molde dos Parâmetros (24/11/2026, pedido do responsável; sem migração)
- O cartão "Brassagem (lote)" (`data-secao="brassagem"`, classes `cartao parametros`) mostra o nº e a data no título
  ("nº 104 · 20/04/2026", `loteExtra`) e SÓ os 3 números medidos no dia: OG medida, FG medida, Volume real (o mesmo
  `campoParam` dos Parâmetros; no celular tocar = roleta direto, começando no planejado). Abaixo, linha curta com o que já
  se sabe (`.lote-medido`: "Eficiência real 83% · ABV real · Priming 135 g"; some vazia). "Todos ›" (`bLote`) abre
  `dialog.lote-janela` (`abrirLote`): cabeça com Eficiência real · ABV real · Priming ao vivo e grade 3 × 3:
  Nº | Data (2 colunas, `celulaLarga`) · OG | FG | Volume · CO₂ | Açúcar do priming (2 colunas). Placeholder do nº = "auto".
- As duas janelas usam o mesmo `abrirJanelaCampos` do receitas.js (fecha por ×, Pronto, Enter, Esc, fundo, rota; roleta
  em popover; foco volta ao "Todos"). `campoParam` aceita um 6º item com opções extras do `campoNumero` (sg, roleta).
  Desfazer (`irPara`) fecha as duas.
- Clean: o resumo "Lote" saiu; usa o mesmo cartão. Na janela, abaixo dos campos, Medido no lote e Priming
  (`.parametros-numeros`), já que o Clean não tem painel lateral.
- Teste do navegador: seção com só os 3 números, OG 1048 → 1,048, eficiência real na seção, janela (ordem dos campos,
  priming ao vivo, Pronto/foco/data no título), reabre com "nº 1 · 20/04/2026"; celular: roleta na OG (↶ desfaz),
  janela 3 × 3 em 390/320 px, roleta do CO₂ em popover. Capturas `p6p6` (seção 390), `p6p7` (janela 390), `p6p8`
  (janela 320), `p6p9` (seção 320).

## Janela do item (24/11/2026, pedido do responsável; sem migração)
- Os detalhes de malte e lúpulo NÃO abrem mais embutidos na linha: tocar no item abre `dialog.item-janela`
  (`abrirItem` no `secaoLinhas` do receitas.js). Topo fixo (cor do malte, nome, dados, ×); QUANTIDADE em destaque logo
  abaixo (lúpulo: "Quando" = etapa e tempo/dia em cima); números do item e "Na receita: OG · IBU · ABV · cor" ao vivo
  (a barra de números fica atrás da janela; `janelaItem` no `atualizarResultados`); dados do cadastro e fonte; pé com
  Subir/Descer/Remover e Pronto. Fecha por ×, Pronto, Esc, toque no fundo ou troca de rota; ao fechar a seção é
  redesenhada e o foco volta ao item. Campos = os mesmos do `montarLinha` (chamado de novo, ligado ao mesmo item;
  `detalhes` virou função). Item livre (sem cadastro) abre a janela com o foco no nome.
- Celular (24/11/2026, 2ª rodada pedida pelo responsável: "mais baixa, folga em cima semelhante à de baixo"): cartão
  no MEIO da tela (mesma folga em cima e embaixo; largura − 1rem; malte ~555 px, lúpulo ~435 px em 390 px); números do
  item (grist/OG ou IBU/g/L) na linha do rótulo "Quantidade"; SEM o texto "Na receita..." (retirado a pedido); fonte dos
  dados recolhida num `<details>` com o selo; pé numa linha (↑ ↓ só seta, Remover, Pronto). Quantidade com ± de 44 px
  e campo na largura. Computador: janela de 560 px no centro.
- ADICIONAR abre a janela (24/11/2026, pedido do responsável): item do cadastro → janela com a quantidade em edição
  (celular: roleta no valor mais provável; computador: foco no campo, Enter = Pronto); item livre → janela com foco no nome.
- Roleta dentro de janela modal: entra na própria janela (`campo.closest("dialog[open]")`), senão ficaria atrás dela
  sem receber toque (valia também para os Cadastros). A janela fica onde está (margem de cima fixada no lugar atual,
  sem pular) e termina acima da roleta (max-height), rolando por dentro; tudo volta ao fechar (roleta.js). Esc com a
  roleta aberta fecha só a roleta; toque no fundo com a roleta aberta só fecha a roleta.
- Roleta na janela = POPOVER (24/11/2026, print do iPhone: o campo ficava marcado e a janela encolhia, mas a roleta não
  aparecia): no Safari a roleta `position: fixed` dentro da janela era cortada pela área de rolagem da janela (no
  Chrome não; o teste não pegava). Agora, dentro de `dialog[open]`, a folha ganha `popover="manual"` + `showPopover()`:
  vai para a camada do topo (acima da janela, sem corte) e, por ser descendente da janela, continua recebendo toque.
  `.roleta[popover]` desfaz o estilo padrão do popover (inset, borda, tamanho). Precisa de iOS 17+; sem popover, cai no
  comportamento antigo. Teste confere `:popover-open`.
- Teste do navegador: janela no computador (abrir pelos números e pelo nome, × e foco, quantidade ao vivo, Esc, Ctrl+Z,
  remover) e no celular (390 px no topo, roleta dentro da janela, OK, Pronto, ↶, 320 px sem passar da largura,
  janela do lúpulo). Capturas `p6i` (malte), `p6u` (roleta na janela), `p6v` (320 px), `p6w` (lúpulo), `p6x` (lúpulo novo).

## Leveduras com valores fixos e janela (24/11/2026, pedido do responsável; sem migração)
- A seção Leveduras saiu da tabela editável (`secaoLista`) e usa o `secaoLinhas` (classe `lev`), como malte e lúpulo,
  mas a linha NÃO tem campo: só texto (`fixo` no `montarLinha`: nome ›, "Ale · Seca · 80% aten." e, à direita,
  "1 pacote" / "2 pacotes" em destaque com a etapa embaixo). Tocar em qualquer parte da linha abre a janela do item
  (`dialog.item-janela.lev`): Quantidade (± de 1, roleta no comum para a unidade) + Unidade na mesma linha; Nome, Tipo,
  Forma, Atenuação, Etapa, fonte dos dados; ↑ ↓ Remover e Pronto. Ordem: alça ⠿ na linha (Completo) ou ↑ ↓ na janela.
- Adicionar: do catálogo abre a janela SEM roleta (`editarAoAdicionar: false`: já vem 1 pacote, Pronto basta);
  item livre abre com o foco no nome. Clean: ficha (ponto · nome + forma e atenuação · "1 pacote"/etapa), sem alça.
- TIPO vem do CADASTRO (24/11/2026, pedido do responsável): levedura ligada a um cadastro que a pessoa enxerga
  (`ligadaAoCadastro`) mostra o tipo FIXO (`.campo-fixo`, sem seletor), copiado ao escolher (`copiaLevedura`: nome, tipo,
  forma, atenuação média; regra 5: mudar o cadastro depois não altera a receita). Sem ligação (106 de 107 leveduras das
  receitas, importadas do Brewfather sem `levedura_id`; item livre) o tipo segue no seletor e a janela tem o botão
  "Ligar ao cadastro": abre a busca já com o código entre parênteses ou o nome sem "Yeast" (`buscaDaLevedura`: "US-05",
  "Nottingham"); escolher copia tipo/forma/atenuação/nome, mantém quantidade/unidade/etapa e reabre a janela (1 passo do
  desfazer). Ligada: "Trocar por outra do cadastro". `abrirBusca` aceita `texto` (busca inicial) e `titulo`.
  Dado corrigido em 24/11/2026 (pedido do responsável), pelo MCP, script `ferramentas/brewfather/corrigir-leveduras.sql`
  (com o desfazer): 81 leveduras importadas LIGADAS ao cadastro por código/nome (Nottingham, US-05, S-04, W-34/70,
  Diamond, Abbaye, Verdant, T-58, M54, BE-256, BE-134, Philly Sour...; copiados tipo e forma; nome e atenuação NÃO
  mudaram, então a FG das receitas é a mesma) e 6 só com o tipo corrigido (5 Brettanomyces → BRETT, blend de Flanders →
  MISTA). Ficaram 25 sem ligação (TeckBrew, Fermo* sem a cepa no catálogo, Farmhouse, Vermont Ale bio4, Lager-BF16
  como Ale, nome vazio): ligar pela janela. Datas das receitas intactas (o gatilho de data é só em `receitas`).
- Outros ingredientes, mostura e fermentação: tabela/cartões no Completo; no Clean, ficha + janela (K4, `secaoListaFicha`).
- Teste do navegador: levedura livre na janela, linha sem campo, tocar no valor abre, Esc; celular 390/320 px (linha de
  64 px, janela cabe, sem teclado nem roleta) e clean. Capturas `p6q-levedura-linha`, `p6q-levedura-janela-390/320`, `p7e`.

## Roleta para números no celular (23/11/2026, pedido do responsável: digitar quantidade era ruim; sem migração)
- Tela de toque (`pointer: coarse`): todo `campoNumero` com faixa vira "botão" da roleta (somente leitura, o teclado não
  abre); tocar abre `abrirRoleta` (`portal/roleta.js`): folha no rodapé, NÃO modal, com rodas de rolagem nativa +
  scroll-snap (inércia do aparelho), item de 44 px, 5 à vista, o do meio na faixa cobre. Duas rodas (inteiro | ,fração)
  para kg, %, L; uma roda (passo único ou segmentos: fino nos pequenos, maior nos grandes) para g, min, cor, densidade.
  O valor vai para o campo AO VIVO (a barra de números do editor vira a linha fina logo acima da roleta, como com o
  teclado: `vital.js` lê a altura da `.roleta` e o evento "roleta"). OK / tocar fora / Enter confirmam; Cancelar / Esc
  voltam ao valor de antes; "Digitar o número" fecha e abre o teclado no campo (volta a somente leitura ao sair);
  botão de deixar vazio só onde vazio tem sentido (`vazio` na faixa: água = sugestão, CO₂ = sem priming...).
  Histórico: a roleta inteira = 1 passo do desfazer (`registrarQuandoLivre` espera fechar). Computador: nada muda.
- Faixas em `portal/faixas.js` (módulo puro, testado em `portal/testes/faixas.test.mjs`): `FAIXAS` pela chave do campo
  (unidades do banco; cor na unidade da tela por `faixaCor`), `FAIXAS_LUGAR` para chaves repetidas (temperatura/tempo da
  mostura, fermentação, whirlpool, outros; campos das Ferramentas). Campo passa `roleta: faixa | { inicial } | false`.
  Valor atual fora da grade/da faixa entra na roda (abrir e fechar não muda o número).
- Valor de partida com o campo vazio ("o mais provável"): `roleta.inicial` do campo > número do placeholder (sugestão)
  > `inicial` da faixa. Malte (`presetFermentavel`): 1º grão claro 4 kg, outro claro 1 kg, 5-15 SRM 0,5 kg, cristal/
  torrado 0,25 kg, açúcar 0,5 kg; lúpulo (`presetLupulo`): amargor 20 g, ≤ 20 min 30 g, whirlpool 40 g, dry hop 50 g;
  ambos × volume do lote ÷ 20 L. OG/FG medidas começam na calculada; volume real no do lote; levedura 1 pacote / 11 g /
  100 mL. Ingrediente novo do cadastro abre a roleta já na quantidade (`editarCampo` do ui.js). Nº do lote fica no teclado.
- Teste do navegador (bloco "roleta:"): abrir sem teclado, barra fina acima, girar com o dedo (toque via CDP, arrasto
  lento sem inércia), OG acompanha, Cancelar, OK, desfazer num passo, Digitar, lúpulo novo no preset, 320 px, Ferramentas.
  Capturas `p6r` (390 px) e `p6s` (320 px). Falta conferir no iPhone real (inércia + snap do Safari).
- 24/11/2026 (pedido do responsável): inteiro e decimais SEPARADOS — cada roda numa `.roleta-coluna` com a própria
  faixa do meio e a vírgula entre elas (`.roleta-virgula`; o texto da roda dos decimais não leva vírgula). Malte com
  MÍNIMO de 100 g na roleta (`quantidade_kg.min` 0,1): 0 | ,05 vira 0,10 e as rodas voltam (`indicesDoValor`); valor
  antigo abaixo do mínimo (ex.: 30 g de acidificado) não muda ao abrir (`rodas.piso`). Os botões ± não têm esse mínimo.
  Captura `p6t`.
- Roda fora do valor (24/11/2026): a rolagem suave que leva a roda ao valor certo (ex.: mínimo de 100 g) podia ser
  interrompida e a roda ficar em ",05" com o campo em 0,100 (o teste falhava ~1 em 3). `irPara` confere em 0,6 s e, se
  a roda não chegou e o dedo não mexeu nela de novo (`gesto`), vai direto sem animação. O teste espera a roda parar (até 3 s).

## Relatório da receita em PDF (23/11/2026, pedido do responsável; sem migração)
- Botão com ícone de relatório AO LADO do nome da receita (`.nome-linha` no topo do editor; vale também na só leitura).
  Abre `abrirRelatorio` (`portal/relatorio.js`): janela (`dialog.relatorio`, tela inteira no celular) com as folhas A4, zoom
  100/150/200/300% e o botão "Compartilhar" (folha de compartilhamento do celular: `navigator.share({ files })`; aparelho
  sem isso = "Baixar PDF"). Arquivo `GaliaBrew-<nº>-<nome>.pdf`. Usa a receita como está na tela (salva ou não).
- `portal/pdf.js`: gerador de PDF PRÓPRIO (sem biblioteca, sem CDN; módulo puro, testado em `portal/testes/pdf.test.mjs`).
  Página = lista de itens (texto, retângulo, linha) em pontos; Helvetica/Helvetica-Bold padrão, WinAnsi, texto em
  hexadecimal (arquivo todo ASCII). `limparTexto` troca o que a fonte não tem (CO₂ → CO2; emoji vira "?").
- O visualizador desenha em SVG os MESMOS itens que vão para o PDF (com `textLength` = largura das métricas da Helvetica):
  não é um leitor de PDF genérico, mas o que se vê é o que sai no arquivo. Mudou o conteúdo = mexer só em
  `montarRelatorio` (cabeçalho com cor da cerveja, números com faixa do estilo, fermentáveis, lúpulos, leveduras, outros,
  mostura, fermentação, água e volumes com sais/ácidos/íons, parâmetros, lote, notas; rodapé com data e página).
  Tabela curta não se divide entre páginas; cabeçalho de tabela se repete na página seguinte.
- Conferido em 23/11/2026 com leitor independente (pdftoppm/pdftotext/pypdf). Falta conferir no iPhone real a folha de
  compartilhamento com arquivo (WhatsApp, Arquivos, AirDrop).

## Receita = lote (0005, aplicada em 22/11/2026)
- `receitas` ganhou `lote_numero` (automático pelo gatilho `receitas_numerar`: maior do dono + 1; pode repetir, ex.
  83a/83b), `data_brassagem` (date), `og_medida`, `fg_medida` (0,98-1,2), `volume_final_l`. `salvar_receita` grava
  esses campos; `lote_numero` enviado nulo mantém o atual. Teste `supabase/testes/0005_receita_lote.sql`: 8 ok.
- Carga: número e data tirados do nome das importadas (93 com nº, 61 com data); 9 sem número no nome ficaram nulos.
- `calculos.js` → `res.medido`: eficiência real (OG medida no volume real + perda da panela, menos açúcar pronto,
  sobre o açúcar possível do grão), ABV real, atenuação aparente real.
- Portal: card "Brassagem (lote)" no fim do editor (nº, data, OG/FG medidas aceitam 1,050 / 1050 / 50, volume real;
  desde 24/11/2026 no molde dos Parâmetros: ver "Brassagem (lote) no molde dos Parâmetros";
  o resumo dos parâmetros de equipamento no topo passou a se chamar "Parâmetros"); bloco "Medido no lote" no painel
  lateral (só aparece com OG/FG medida); lista por nº com a data;
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

## Menu de Ferramentas (24/11/2026, pedido do responsável; sem migração)
- `#/ferramentas` é um MENU de botões (`ul.ferramentas-menu` > `button.ferramenta-botao`), um por ferramenta: ícone num
  quadrado, grupo (Brassagem / Envase / Medição), nome e o resultado da última conta (ex.: "15,0 L a 72,3 °C"). No
  celular, um abaixo do outro na largura toda (≥ 5 rem de altura); no computador, grade de colunas.
- Tocar abre a ferramenta numa janela (`dialog.ferramenta-janela`, `abrirFerramenta`): cabeça PRESA no topo com ícone,
  nome, × e o RESULTADO em blocos (número grande, rótulo embaixo), para ficar à vista enquanto a roleta/teclado mudam os
  campos; campos e notas; "Pronto" no pé. Fecha por ×, Pronto, Esc, toque no fundo ou troca de rota (com a roleta aberta,
  Esc/toque no fundo fecham só a roleta); ao fechar o botão atualiza o resumo e recebe o foco. Celular: cartão no meio
  da tela (como a janela do item); a roleta entra na janela.
- Ferramenta nova = uma linha no `FERRAMENTAS` do ferramentas.js: `contas()` (sem DOM: { metricas: [[rótulo, valor]],
  avisos }), `campos(calcular)`, `resumo(c)` (linha do botão), ícone do `icones.js` (novos: garrafa, refratometro,
  densimetro, abrir) e `cor` = par de papel de parede (`mostura`, `ferm`, `lavagem`, `agua` → `--pp-*`; contraste já
  conferido em todos os temas). Capturas `p6y` (menu 390 px), `p6y2` (priming 390 px), `p6z` (roleta na janela, 320 px).

## Refratômetro e densímetro (22/11/2026, sem migração)
- `calculos.js`: `sgDeBrix` (°Brix ÷ fator → °P → SG; fator padrão 1,04), `refratometro` (FG com álcool pela cúbica
  de Sean Terrill, leituras ÷ fator; devolve OG, FG, ABV, atenuação) e `corrigirDensimetro` (polinômio usual da
  densidade da água em °F; calibração padrão 20 °C).
- Ferramentas: cartões Refratômetro (com "Descobrir o fator": °Brix ÷ °P do densímetro no mesmo mosto) e Densímetro.
  Mosto pré-fermentação entra em DENSIDADE (SG, 24/11/2026, pedido do responsável), não em °Brix: a conta de Terrill usa
  °Brix = °P(SG) × fator; sem o °Brix atual mostra o °Brix esperado no refratômetro.
  Fator do refratômetro e calibração do densímetro ficam em `preferencias` (localStorage), por serem do aparelho.
- `campoNumero` (ui.js): ao sair do campo mostra o valor guardado (densidade digitada 1048 aparece 1,048).

## Química da água: sais e perfil de íons (0007, 22/11/2026)
- `calculos.js`: `SAIS` (ppm por g/L a partir das massas molares: gesso, CaCl₂·2H₂O, MgSO₄·7H₂O, MgCl₂·6H₂O, NaCl,
  NaHCO₃), `perfilAgua` (origem × (1 − diluição) + sais ÷ litros; relação SO₄/Cl; alcalinidade como CaCO₃ e residual
  de Kolbach: alcalinidade − Ca/1,4 − Mg/1,7), `leituraSulfatoCloreto`.
- Sais separados por água (22/11/2026, sem migração): cada sal tem `etapa` MOSTURA | LAVAGEM no jsonb `sais`
  (`etapaSal`: sem etapa = mostura). `res.agua` = { mostura, lavagem, panela }, cada um um `perfilAgua` no próprio
  volume (+ `litros`, `sais_g`); panela = todos os sais na água total. pH estimado usa só a água/sais da mostura.
  Receita antiga (sais sem etapa = água total) é convertida ao abrir no editor por `separarSaisAntigos` (mostura +
  lavagem na proporção dos volumes, mesmos gramas); grava com etapa ao salvar. Card Água: tabela de sais da mostura e
  da lavagem ("Igual à mostura" copia os sais da mostura na proporção dos volumes), perfil Origem/Mostura/Lavagem/
  Panela/Alvo (destaque longe do alvo na mostura e na panela; no celular símbolos curtos para caber sem rolagem).
- 0007: `receitas.agua_origem` e `agua_alvo` (jsonb, CÓPIA do perfil: nome + 6 íons; sem id, como a regra 5),
  `agua_diluicao_pct`, `sais` (jsonb lista [{sal, gramas, etapa}], nunca nulo). Teste `supabase/testes/0007_agua_sais.sql`.
- Portal: card "Água" no editor (origem, diluição, alvo do cadastro de águas; sais; tabela origem × final × alvo, com
  destaque no que está longe do alvo; SO₄/Cl com leitura; alcalinidade residual). "Criar a partir de" copia a água.
- Ácido e pH estimado da mostura (0008, 22/11/2026): `phMostura` (balanço de cargas no espírito de Troester): cada
  malte puxa para o seu pH em água destilada com uma capacidade tampão (base 40, cristal 80, torrado 200 mEq/(kg·pH);
  pHDI base = máx(5,2; 5,76 − 0,025 × SRM), cristal = 5,22 − 0,00504 × °L, torrado 4,7; acidificado = base + 333 mEq/kg),
  alcalinidade (HCO₃ que vira H₂CO₃ no pH, pKa 6,35), Ca/3,5 + Mg/7 (Kolbach), ácidos (lático 88% ≈ 11,8 mmol/mL, pKa
  3,86; fosfórico 10%/85%: 1º próton + fração do 2º). Resolve por bisseção; `ml_para(alvo)` dá o ácido que falta.
  Classe do malte pelo nome (acid/sauer; carafa/roast/black/chocolate ou SRM ≥ 200; cara/crystal/caramel). Calibrado
  por regras práticas (pilsen em destilada ≈ 5,7; 1% acidificado ≈ −0,07; Kolbach ≈ +0,25 por 10 °dH; stout em
  destilada < 5,4). É ESTIMATIVA ±0,1-0,2. `receitas.acidos` (jsonb [{acido, ml}], só mostura). Teste
  `supabase/testes/0008_acidos.sql`. Card Água: lista de ácidos, pH estimado com faixa e botão "Adicionar o lático"
  (alvo 5,4).
- Volumes das águas informados (0010, aplicada em 23/11/2026, pedido do responsável): `receitas.agua_mostura_l` (> 0) e
  `agua_lavagem_l` (≥ 0; 0 = sem lavagem/BIAB); nulo = sugestão (mostura = kg × relação água/grão; lavagem = necessária
  − mostura), por isso as receitas antigas/importadas não mudam. Sais (ppm), pH e temperatura da água da mostura usam os
  litros informados. `res.volumes`: `agua_total_l` = mostura + lavagem; `agua_necessaria_l` = pré-fervura + absorção +
  tina; `agua_diferenca_l`; `*_sugerida_l`; `*_informada`; `relacao_agua_grao_l_kg` resultante. Card Água → "Volumes":
  dois campos com a sugestão de fundo e aviso quando a soma não fecha com a necessária (≥ 0,5 L); painel mostra "Água
  necessária" quando difere. "Criar a partir de" copia os volumes. Teste `supabase/testes/0010_volumes_agua.sql`
  (7 ok, ensaiado no banco em transação desfeita antes de aplicar). A 0009 (catálogo de marcas) é de outra sessão.
- Seção Água enxuta (24/11/2026, pedido do responsável, sem migração): SEM textos explicativos visíveis (o responsável
  não quer; ficam só os ⓘ, o aviso de água que falta/sobra e a sugestão de ácido com o botão); SEM o campo de diluição
  com destilada (não se usa no Brasil; nenhuma receita usava; `agua_diluicao_pct` segue no banco e no calculos.js);
  "Água de base" (era "Água de origem"; coluna "Base" no perfil e no PDF, de `res.agua.base`) e "Perfil alvo" lado a
  lado também no celular (`.agua-perfis`, duas colunas fixas; o seletor corta o nome longo). Capturas `p5j`/`p5k`.
- Blocos da água mais limpos (24/11/2026, pedido do responsável, sem migração): (1) litros num CAMPO ÚNICO no topo de
  cada bloco, ao lado do título (`.bloco-agua-litros`: campo + "L"; antes os litros apareciam no título E num campo
  abaixo); vazio mostra a sugestão como número de fundo (sem "(sugestão)", que não cabe; `title` = "Sugestão: N L").
  (2) Alcalinidade residual e sulfato/cloreto SAÍRAM dos blocos e do pé da seção: ficam só na tabela do perfil, em
  `tbody.perfil-indices` (Base, Mostura, Lavagem, Panela e Alvo; alvo por `perfilAgua` sem sais) e a leitura no `tfoot`
  ("Sulfato/cloreto: mostura X · panela Y"); no celular "Alc. res."/"SO₄/Cl" com ⓘ. (3) pH estimado COMPACTO
  (`.ph-cartao`; 2ª rodada no mesmo dia, pedido do responsável: "muito grande", sem texto, sem fundo próprio): uma linha
  "pH da mostura ⓘ | 5,41 (18 px) | selo" (ideal 5,3–5,5 verde, aceitável âmbar, baixo/alto vermelho) e escala fina
  5,0–5,8 em zonas com marcador (posição = (pH − 5) ÷ 0,8), no papel do bloco (só um traço em cima). Sem "Sem o ácido",
  sem frase de sugestão e sem aviso de pH baixo: só o botão "+ N mL de lático 88%" (leva a 5,4; some com o pH já ideal). Capturas `p5l` (pH) e
  `p5m` (tabela), 390 e 320 px.
- Água/grão = água da mostura (24/11/2026, pedido do responsável: "o volume da mostura deve dar a razão água/malte"):
  com a água da mostura informada, `relacao_agua_grao_l_kg` (Parâmetros) = litros ÷ kg de grão da mostura, sincronizada
  a cada cálculo (`sincronizarRelacao` no receitas.js) e gravada assim; mudar a relação nos Parâmetros recalcula os
  litros da mostura (`relacaoMudou`). Sem água informada, a relação gera a sugestão, como antes. Os cálculos (pH,
  ppm, temperatura da água) já usavam os litros informados; o erro era o campo e o banco ficarem em 3 (ex.: Hop lager,
  22 L ÷ 5,7 kg = 3,86 L/kg, gravada 3).
- Card Água em blocos (23/11/2026, pedido do responsável: no celular não ficava claro a que água pertencia cada sal):
  origem/diluição/alvo no topo; depois um BLOCO "Água da mostura" (litros, sais, ácido, pH estimado, alcalinidade
  residual e SO₄/Cl da mostura) e um BLOCO "Água de lavagem" (litros, sais com "Igual à mostura", alcalinidade residual);
  depois "Total do dia" (conferência com a água necessária) e o perfil Origem/Mostura/Lavagem/Panela/Alvo com SO₄/Cl da
  panela. `.bloco-agua` (style.css): fundo liso sobre o papel de parede, faixa à esquerda cobre (mostura) / azul
  (lavagem), título e litros em `--t-m`. Teste do navegador confere que cada sal e o ácido ficam no bloco certo.
  Papel de parede próprio nos dois blocos (23/11/2026, pedido do responsável): mostura âmbar (`--pp-mostura`, grãos e
  vapor) e lavagem água-marinha (`--pp-lavagem`, gotas caindo como a aspersão), tons diferentes do azul da seção; faixa
  e título na cor de cada um (`--pp-*-cor`). Tokens junto dos outros `--pp-*` (claro, escuro e Sol forte sem desenho);
  contraste conferido nos 8 temas (texto ≥ 8:1, estados ≥ 4,8:1, borda de campo ≥ 3:1). Captura `p5i` (lavagem).

- Sais e ácidos numa linha só no celular (23/11/2026, pedido do responsável): tabela com classe `linha-unica`
  (style.css, bloco de 640 px): seletor do sal | quantidade + unidade (`data-unidade`, g ou mL) | ×, sem rótulo em cima;
  o nome longo corta no seletor fechado. Teste do navegador confere em 390 e 320 px (capturas `p5g`, `p5h`).

## Fotos da brassagem (0011, aplicada em 23/11/2026, pedido do responsável)
- Aplicada pelo MCP (md5 igual ao arquivo). Teste: 14 das 16 verificações ok em transação desfeita; as 2 que usam
  `delete` (12: B não apaga foto de A; 14: A apaga foto de receita excluída) NÃO rodaram: o MCP pede uma confirmação
  que não chega ao responsável. Para rodar o teste inteiro: colar `supabase/testes/0011_fotos_brassagem.sql` no SQL
  Editor do painel. Advisors: aviso novo só o esperado (`fotos_cabem` é security definer executável por authenticated,
  de propósito: a política de envio a usa e ela só conta as fotos de quem chama).
- Storage: bucket PRIVADO `fotos-brassagem`, caminho `<dono>/<receita>/<arquivo>.jpg`, limite do bucket 400 kB e só
  `image/jpeg` (quem enviar sem reduzir é barrado pelo próprio Storage). Sem tabela nova: a lista vem da pasta.
- Políticas em `storage.objects` (só `to authenticated`): ler = minha pasta ou receita que eu enxergo (pública de outro);
  enviar = minha pasta + receita minha + `public.fotos_cabem(receita)` (12 por receita, 500 por usuário; security
  definer porque a política não pode consultar a própria tabela; `search_path = ''`, execute só para authenticated);
  apagar = minha pasta (vale para foto de receita já excluída). Sem update. Delete por SQL em `storage.objects` é
  bloqueado pelo Supabase (gatilho `protect_objects_delete`): apagar foto só pela API (o portal faz).
- Portal (`portal/fotos.js`): bloco "Fotos da brassagem" dentro da seção Notas. `comprimirFoto`: `<img>` (respeita a
  orientação EXIF do celular) → canvas → JPEG; lado maior 1600 px nas qualidades 0,78/0,66/0,54; se passar de 300 kB
  diminui o lado em 20% (até ~700 px) e repete; foto pequena não é ampliada. Foto é gravada NA HORA (fora do Salvar e
  do desfazer); receita nova pede para salvar antes. Miniaturas 3 por linha no celular (links assinados de 1 h), toque
  abre a foto em tela inteira (anterior/próxima, Excluir com confirmação). Receita pública de outro: só ver. "Nova a
  partir desta" NÃO copia fotos (são do lote). Excluir a receita apaga as fotos (`apagarFotosDaReceita`). O relatório
  em PDF não leva fotos.
- CSP: `img-src` ganhou `blob:` (prévia local) e `https://hzomsyfujxakcuaaedmh.supabase.co` (link assinado), no
  `_headers` e na `<meta>` do index.html. Nome do arquivo sem `crypto.randomUUID` (não existe fora de https).
- Conta de espaço: ~0,2-0,3 MB por foto → 1 GB do plano Free ≈ 3.500-5.000 fotos.
- Teste `supabase/testes/0011_fotos_brassagem.sql` (16 verificações; usa `storage.allow_delete_query` só na transação).
  Navegador: foto simulada de 9,9 MB (4000 × 3000) sobe com ~265 kB. Falta conferir no iPhone real (câmera/HEIC).

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

## Catálogo de marcas (0009, aplicada em 23/11/2026)
- 173 maltes de marca + 22 lúpulos, `dono` nulo: Weyermann 49, BestMalz 41, Viking Malt 31, Dingemans 28, Uma Malta 9,
  Pauls Malt 8 (fichas do site da Uma Malta, distribuidora oficial), Agrária 7; Hopsteiner Lupulin Pellets 20 (forma
  CRIO) e Cascade/Comet "(Brasil)" (Embrapa, manual de 2022). Levantamento em 5 lojas brasileiras (nov/2026):
  Weyermann, Castle e Agrária em todas; Viking, Crisp, Dingemans na maioria.
- Números SÓ de fichas oficiais baixadas e lidas (URL em `extras.url`; faixa de cor em `extras.cor_ebc` e nas notas).
  Cor = meio da faixa EBC ÷ 1,97. Sem extrato/umidade publicados (Agrária inteira, alguns acidificados/torrados):
  valor típico do grupo, avisado na nota. Nomes levam a marca (a receita copia só o nome). Notas próprias, curtas.
- FORA (pendente): Castle/Château e Crisp (os sites recusam acesso automatizado: HTTP 403 / sem conexão daqui),
  Yakima Chief Cryo e LUPOMAX (sem números oficiais acessíveis), lúpulo Mantiqueira (análise não conferida).
- Rede do ambiente "GaliaBrew" liberada (23/11/2026, aprovada pelo responsável) para os sites dos fabricantes:
  weyermann.de, castlemalting.com, agraria.com.br, bestmalz.de, vikingmalt.com, dingemansmout.be, umamalta.com.br,
  crispmalt.com, yakimachief.com, johnihaas.com, barthhaas.com, hopsteiner.com, infoteca.cnptia.embrapa.br.
- Fonte dos dados na tela (23/11/2026, sem migração): `portal/fontes.js` classifica pelo `extras.fonte` → selo
  "Fabricante" (ficha oficial; Swaen = fabricante transcrita pelo Brewtarget, link tirado das notas), "Análise"
  (Embrapa), "Genérico" (beer-analytics / fontes públicas / GaliaBrew), "Meu" (dono preenchido). Aparece na busca de
  ingrediente (selo; o filtro "Fonte" saiu com os demais filtros), na coluna "Fonte" e no formulário dos Cadastros de ingrediente (com link "Ver a
  ficha", só https) e na janela do malte/lúpulo na receita (`fonteNaReceita`: fonte do item ligado do catálogo;
  sem ligação = "Da receita", caso das 102 importadas do Brewfather). Carga nova de catálogo: gravar `extras.fonte`
  ("Ficha técnica oficial (Marca)…") e `extras.url` para o selo sair certo.
- Teste `supabase/testes/0009_catalogo_marcas.sql`: 8 ok (contagem por marca, campos preenchidos, leitura por usuário
  comum, catálogo não editável por ele, receita copia malte e lúpulo novos). Advisors: sem aviso novo.

## Login (painel do Supabase, não dá para fazer por SQL)
- DECIDIDO (22/11/2026): cadastro ABERTO ("Allow new users to sign up" ligado), para testes com amigos. A RLS protege
  os dados. Confirmação de e-mail DESLIGADA (o e-mail padrão do Supabase só entrega para membros da org Versa, então
  amigos não conseguiriam confirmar). Consequência: recuperação de senha só funciona para membros da org.
  Senha (27/11/2026, pedido do responsável: tirar as restrições, só o mínimo): só 6 caracteres, sem exigir tipo de
  caractere. O pedido foi 4, mas o Supabase Auth não aceita menos de 6 (piso do servidor). Constante `SENHA_MIN` no
  ui.js (cadastro, nova senha, trocar senha no perfil e mensagem de erro). O painel do Supabase JÁ estava em 6
  (conferido pelo responsável em 28/11/2026); os 10 caracteres eram só do portal. Lição: configuração do painel não se
  vê daqui (sem token de administração); não afirmar o valor dela a partir desta anotação, perguntar ao responsável.
- Para recuperação de senha de todos (ou religar a confirmação): SMTP próprio (Authentication → Emails → SMTP; ex.:
  Resend ou Brevo, plano gratuito).
- Site URL e Redirect URLs = https://llmannrich-ai.github.io/GaliaBrew/ (feito pelo responsável em 22/11/2026).
- Tela "Criar conta" (27/11/2026, pedido do responsável; `telaCriarConta` no app.js, sem migração): no login, "Ainda não
  tem conta? Criar conta" (a nota "Acesso só por convite" saiu). Nome, e-mail, senha (≥ `SENHA_MIN` = 6, conferida no aparelho) e
  repetir; `sb.auth.signUp` com `data.nome` (o gatilho `perfis_criar` usa). Sem confirmação de e-mail a conta ENTRA NA
  HORA (o onAuthStateChange abre o app); se um dia a confirmação for religada, a tela avisa para abrir o link do e-mail.
  Aviso na tela: "use um e-mail real: é só por ele que dá para recuperar a senha". E-mail repetido = mensagem em
  português (`mensagemErro`). "Esqueci a senha" responde igual exista ou não a conta (não revela quem tem cadastro) e
  avisa que só chega a e-mail real. LIMITE: com o SMTP padrão do Supabase o link só chega a e-mails da org Versa; para os
  amigos receberem, SMTP próprio (Resend/Brevo) no painel. Teste no navegador: bloco "criar conta" (capturas `p6c`).
- Primeiro admin: depois de criar o próprio login, `update perfis set papel = 'admin' where user_id = ...` por SQL.

## Situação em 22/11/2026 (fim da 1ª sessão)
- No ar: https://llmannrich-ai.github.io/GaliaBrew/, publicado da `main`, que é a branch padrão desde 22/11/2026
  (antes era `claude/gallant-hypatia-oyvzpp`, hoje parada). O container de desenvolvimento NÃO acessa github.io nem
  supabase.co: conferir publicação por `gh api .../deployments` e o banco pelo MCP do Supabase.
- GitHub (22/11/2026, feito pelo responsável): `main` protegida (PR obrigatório, sem aprovação; o dono pode enviar
  direto, que é o que o /deploy das sessões no computador faz); ambiente `github-pages` aceita a `main`. Sessão na
  nuvem não grava a `main` nem a fila: publica pelo modo nuvem do /deploy (PR + merge pela API, com pedido do
  responsável). 1ª publicação assim: PR #3 (editor novo, celular, arte), 22/11/2026.
- Pendente na proteção da `main`: marcar o teste "Cálculos e versões" como obrigatório e "Require branches to be up
  to date" (Settings → Branches → Edit). Sem isso, o GitHub não barra PR desatualizado.
- Login do responsável criado (llmannrich@gmail.com) e já `admin`. Migrações 0001-0011 aplicadas.
- A conexão MCP do Supabase precisa estar na org "Versa" (o coletor de notas está em outra org).
- Pendente do responsável: (opcional) SMTP próprio para recuperação de senha dos amigos; (opcional) repositório privado (aí o Pages exige plano pago),
  desligar a extensão http no painel.
- 22/11/2026: FASE 1 CONCLUÍDA (testada no iPhone; Site URL/Redirect configuradas; IBU com whirlpool).
- Fase 2 (1) feita em 22/11/2026: "criar a partir de" + dados do lote (0005).
- Fase 2 (2a) feita em 22/11/2026: calculadoras de água da mostura e priming (0006, página Ferramentas).
- Fase 2 (2b) feita em 22/11/2026: refratômetro e correção do densímetro (Ferramentas).
- Fase 3 (química da água) começada em 22/11/2026: sais e perfil de íons (0007).
- 22/11/2026: química da água com ácido e pH estimado (0008).
- 23/11/2026: água da mostura e da lavagem informadas pelo cervejeiro (0010).
- 23/11/2026: fotos da brassagem na seção Notas, reduzidas no aparelho (0011, Storage).
- Próximo: (3) escalar receita. Sem módulo de brassagem e sem versões.

## Ordem de trabalho
- Fase 1 (CONCLUÍDA em 22/11/2026): 0001 aplicada ✔ → `portal/calculos.js` + testes ✔ → portal com login, cadastros e editor
  de receita ✔ → publicação no GitHub Pages (workflow pronto; falta ligar o Pages) → catálogo ✔ (0004).
- Fase 2: receita = lote ("criar a partir de", dados do lote na receita), ferramentas (água de mostura, priming,
  refratômetro, correção do densímetro), escalar receita.
- Fase 3: importar/exportar BeerJSON e BeerXML, estoque, química da água.

## Coluna "Total" no perfil da água (24/11/2026, pedido do responsável; só texto)
- A coluna "Panela" da tabela do perfil (tela e PDF) passou a se chamar "Total" (as duas águas juntas com todos os
  sais, o que chega à fervura). Pé da tabela: "mostura X · total Y"; PDF: "Sulfato/cloreto no total". No código o
  perfil continua `res.agua.panela`.

## Água no Clean no molde dos fermentáveis (25/11/2026, pedido do responsável; sem migração)
- No layout Clean a seção Água deixou de ser resumo + janela: `secaoAguaClean()` no receitas.js (o Completo segue com o
  `secaoAgua()`, sem mudança). De cima para baixo: total de água no título ("32,0 L"); linha "Base: X / Alvo: Y" (tocar
  abre os dois seletores numa janela); DOIS blocos separados (`.agua-bloco.mostura` cobre, `.lavagem` água-marinha: faixa
  de 3 px à esquerda, fundo 6% da cor, título em versalete na cor do bloco; ≤ 360 px o título vira só "MOSTURA" /
  "LAVAGEM"), cada um com os litros no topo (campo; tocar = roleta; vazio mostra a sugestão; mostura mostra L/kg) e "+".
- Uma FICHA por sal/ácido (como o malte): ponto na cor do bloco (ácido = gota) · nome + o que põe NESTA água ("+78 Ca ·
  +186 SO₄ ppm"; ácido: "pH −0,25", com os outros ácidos mantidos) │ quantidade (o `campoQuantidade`; toque = roleta
  direto) + g/L. Tocar no nome abre a janela do item (quantidade com ± e roleta, troca do sal/ácido, efeito ao vivo,
  Remover, Pronto). "+" abre a escolha (`dialog.agua-escolha`): mostura = 6 sais + 3 ácidos; lavagem = só os 6 sais;
  escolher já abre a janela na roleta. Lavagem tem "Igual à mostura" (só com sal na mostura). Adicionar/remover/igual =
  1 passo do desfazer (`acao`).
- pH da mostura com a escala (a mesma `caixaPhMostura`, com o botão do lático) DENTRO do bloco da mostura.
- Abaixo da lavagem: aviso de água necessária (≥ 0,5 L) e a tabela curta "Concentração final" (`.agua-total`): ppm |
  Ca Mg Na SO₄ Cl HCO₃, linha Total (água toda do dia com todos os sais = `res.agua.panela`; longe do alvo = sublinhado
  pontilhado) e linha Alvo; embaixo SO₄/Cl com a leitura (e o do alvo) e alcalinidade residual. "Perfil completo ›" abre
  a tabela de sempre (Base, Mostura, Lavagem, Total, Alvo) numa janela. Cabe em 320 px.
- Partes comuns aos dois layouts viraram funções do `montarEditor`: `escolhaPerfilAgua`, `copiarSaisParaLavagem`,
  `caixaPhMostura(aoAcido)`, `tabelaPerfilAgua(res)`. Janela simples da água: `abrirJanelaAgua`.
- Teste do navegador (bloco "clean água:"): seção própria, base/alvo, fichas por água com ppm/g/L/pH, blocos separados e
  de cor própria, pH só na mostura, tabela (6 íons, Total = coluna Total do perfil completo), roleta na quantidade, + da
  lavagem (só sais) e da mostura (9 opções), Remover e ↶, 390 e 320 px sem rolagem lateral. Falta conferir no iPhone real.

## Logo na página principal e barra de status do iPhone (25/11/2026, pedido do responsável; sem migração)
- Logo "Gália" (arte do responsável JÁ SEM FUNDO, com acento; versão final em 25/11/2026, escolhida pelo responsável entre
  3 opções): GRANDE e centrada no topo da tela de Receitas (`header.inicio-topo` no `telaReceitas`; 5rem de altura desde 26/11/2026, era 7,5rem),
  sobre o fundo do tema. No celular (≤ 959 px) a `barra-movel` escura SOME nessa tela (`body.na-inicio`, posto pelo app.js)
  e o ≡ (`button.abrir-menu.inicio-menu`, chama `abrirMenu` do menu.js) fica no canto esquerdo, no meio da altura da logo
  (26/11/2026: 56 px de toque, ícone de 34 px); no computador só a logo. Menu lateral/gaveta (26/11/2026, pedido do
  responsável): a marca é a logo em creme (`img.marca-logo` = `logo-galia-escuro.png`, 4rem; o menu é sempre escuro); só no
  menu de ícones (recolhido/960–1180 px) volta o copinho. A `barra-movel` (barra escura das outras telas no
  celular) também mostra a logo em creme (`.barra-movel .marca-logo`, 2,5rem; 27/11/2026, pedido do responsável; teste
  "320 px: barra escura do perfil com a logo...", captura `p6g-celular-320-barra-logo`).
  Testes "toque: ≡ do topo maior..." e "toque: menu com a logo..."; captura `p6f-celular-menu-logo`. Dois arquivos em `icones/` (538 × 300, RGBA,
  recortados da arte): `logo-galia.png` (cores da arte, temas claros) e `logo-galia-escuro.png` (verde-escuro trocado
  por creme #f1e8da mantendo a transparência, temas escuros); o CSS mostra uma pelo `data-modo`. Tentativas descartadas
  no mesmo dia: logo abaixo da barra escura (ficava "abaixo da logo antiga") e logo pequena dentro da barra.
- Ícone do app (Tela de Início, favicon e manifest; 25/11/2026, pedido do responsável: "troque o ícone pelo livro"):
  `icones/icone-180.png` e `icone-512.png` = o livro da logo (contorno verde, frasco e linhas), recortado da arte e
  centrado a 80% da largura num quadrado creme #fdf7ef (o fundo da arte; em âmbar o recorte deixava contorno branco).
  Mesmos nomes de arquivo: o iPhone só troca o ícone ao remover e "Adicionar à Tela de Início" de novo.
- Tarja de cima (barra de status do app da Tela de Início): DECISÃO do responsável (25/11/2026) = cor de FUNDO DA PÁGINA
  do tema. O iOS 26 IGNORA a `theme-color` e pinta essa faixa com o elemento `position: fixed/sticky` de largura total no
  topo da página (opacidade ≥ 0,1); sem nenhum, com o fundo do body. Por isso: `apple-mobile-web-app-status-bar-style` =
  `default` (o `black-translucent` + faixa fixa da 1ª tentativa saiu: relatos de névoa no iOS 26) e NADA preso no topo
  da tela de Receitas no celular (`barra-movel` com `position: static` até 640 px e escondida nessa tela). No editor a
  `barra-app` é presa (cor `--cartao`). `theme-color` (Android/outros) = `--fundo` do tema (tema.js; padrão #ffffff no
  index.html e no manifest). Teste "toque: logo..." confere que nada preso cobre o meio do topo. O iOS só relê ao abrir:
  remover o ícone e "Adicionar à Tela de Início" de novo. Falta conferir no iPhone real.

## Ícones de fermentáveis e lúpulo redesenhados (27/11/2026, pedido do responsável: "muito ruim"; só icones.js)
- `malte` = espiga de cevada: haste, 3 pares de grãos CHEIOS + 1 no topo (`fill`/`stroke: none` no próprio caminho) e
  barbas longas em traço fino (`stroke-width` 1,25 no caminho). `lupulo` = cone com as brácteas em losango, haste e folha.
  Em 18 px o contorno de grão pequeno virava borrão; por isso grão cheio. `malte_min`/`lupulo_min` (Clean) = o mesmo
  desenho (constantes `ESPIGA` e `CONE`). Atributo no caminho vale sobre o do `<svg>` e sobre o stroke-width do CSS.

## Lúpulos: total em destaque e sem a forma (25/11/2026, pedido do responsável; sem migração)
- O título da seção Lúpulos mostra "N g · N IBU" em destaque (`destaque: true` no `secaoLinhas`, a mesma letra grande
  do kg dos fermentáveis); no celular quebra linha abaixo do título em 320 px.
- A forma do lúpulo (pellet, flor...) saiu da receita na tela: a linha mostra só o alfa e a janela do item não tem mais
  o campo Forma. A coluna `forma` segue no banco (copiada do cadastro; item livre = PELLET) e no relatório em PDF.

## "Sulfato de cálcio" no lugar de "Gesso" (26/11/2026, pedido do responsável; só texto)
- Na tela (seletor dos sais, fichas da água no Clean) e no relatório em PDF o sal se chama "Sulfato de cálcio". O código
  gravado no banco continua `GESSO` (jsonb `sais`; receitas antigas não mudam).

## Ações ao lado do nome e lote com a data no Clean (26/11/2026, pedido do responsável; sem migração)
- O menu ⋯ (barra do app no celular / ao lado do nome no computador) SAIU. Relatório (PDF), Nova a partir desta,
  Informações (tipo, autor, pública) e Excluir receita viraram 4 ícones ao lado do nome (`.nome-acoes`, `acaoNome` no
  receitas.js; ícones relatorio, copiar, info (novo), lixeira em vermelho; 36 × 44 px de toque, 34 px em ≤ 360 px). Chamam
  os mesmos botões de sempre (Excluir confirma com o nome). Receita nova: só Relatório e Informações; de outro usuário:
  sem Excluir. No Clean os botões de texto "Nova a partir desta"/"Excluir receita" das `.acoes-receita` ficam escondidos.
- Nome no Clean = `textarea` de 1 linha que cresce (`campoNomeQuebra`: Enter não cria linha, quebra de linha colada vira
  espaço, altura pelo texto e refeita quando a largura muda). Letra 22 px no celular (era 26) e 20 px em ≤ 360 px: com os
  ícones ao lado, o nome mediano das receitas (24 letras) fica em 1-2 linhas em 390 px; 36 letras (90% das receitas têm
  menos) = 3 linhas em 320 px. Completo não mudou (input + botão do relatório).
- (27/11/2026: os ícones foram para a linha do lote e o nome para a barra do app; ver "Nome na barra do app".)
- Meta do lote = botão (`button.topo-meta`) "Lote nº 104 · 20/04/2026", 17 px negrito (era 12 px em versalete), data
  sempre ao lado ("sem data"; "Lote novo"/"Lote sem nº" sem número). Tocar abre a janela da Brassagem (`abrirLote`).
- Teste do navegador: ícones na ordem, ao lado do nome, ≥ 44 px, sem menu ⋯; lote com data e letra ≥ 16 px; tocar no lote
  abre a janela; Informações e Relatório pelos ícones; nome longo em 320 px. Capturas `p7g-clean-acoes-nome` (390) e
  `p7c2-clean-320-nome-longo`.

## Nome na barra do app com o copo; ícones na linha do lote (27/11/2026, pedido do responsável; sem migração)
- Barra do app (celular, nos dois layouts): ‹ | copo na cor da cerveja (`copo()` do vital.js, `corHexDeSrm(res.cor_srm)` a
  cada cálculo) + nome (até 2 linhas, depois reticências; 18 px, 16 px em ≤ 360 px) | ↶ | Salvar. O nome fica SEMPRE
  à vista (saiu o `sem-titulo`, que só mostrava o nome depois de rolar).
- Clean: o cabeçalho encolheu. 1ª linha = "Lote nº · data" (`.topo-linha`) com os 4 ícones (Relatório, Nova a partir
  desta, Informações, Excluir) À DIREITA, na mesma linha; abaixo o estilo. O campo do nome (`textarea.titulo-receita`)
  some no celular (≤ 640 px; no computador continua abaixo da linha do lote). Editar o nome no celular: tocar no nome da
  barra (`button.app-nome`) abre Informações com o campo "Nome" no topo e o foco nele (o campo do topo acompanha).
  Salvar sem nome no celular abre essa janela. Números a ~181 px do topo em 390 px (eram ~250).
- Teste do navegador: nome só na barra, copo antes do nome, ícones na linha do lote, tocar no nome abre Informações e a
  barra acompanha, nome longo em 320 px em até 2 linhas sem empurrar ↶/Salvar. Capturas `p7g` (390) e `p7c2` (320).

## Estilo em destaque no cabeçalho da receita (27/11/2026, pedido do responsável; sem migração)
- O estilo deixou de ser link pequeno (Clean) / seletor com rótulo "Estilo" (Completo): nos DOIS layouts é um cartão
  (`button.escolha.estilo-botao`, em `.estilo-topo`, ~48 px) que abre a mesma busca de estilo. Dentro: faixa vertical
  com a cor da cerveja do estilo (`corHexDeSrm` do mínimo ao máximo; some sem faixa de cor), o NOME em 18 px peso 750
  (menor que o nome da receita) e "›". Sem estilo: borda tracejada e "Escolher estilo"; só leitura: "Sem estilo".
  `aria-label` = "Estilo: German Pils". Fundo = 9% do destaque sobre o cartão.
- NO MESMO DIA, a pedido do responsável, SAÍRAM do cartão o código BJCP ("5D", que era um selo) e a linha "N de 5
  números no estilo" (a barra de números já mostra cada faixa). Não recolocar. A busca e a lista seguem com o código.
- Teste do navegador: "clean, 320/390 px: estilo em cartão só com faixa de cor e nome" (≥ 44 px, cabe, abaixo do nome,
  texto = só o nome, sem `.estilo-codigo`/`.estilo-encaixe`) e contraste do cartão no "clean K6" (nome ≥ 7, seta ≥ 3)
  nos 8 temas. Seletor do teste: `button.estilo-botao`. Capturas `p7m-clean-estilo-320/390`.

## Água de base só do usuário (27/11/2026, pedido do responsável; sem migração)
- Seletor "Água de base" (Completo e Clean, `escolhaPerfilAgua` + `gruposPerfilAgua` no receitas.js) lista SÓ as águas
  que a pessoa cadastrou (`dono` preenchido, grupo "Minhas águas"); sem nenhuma, aviso "Nenhuma água sua. Cadastre em
  Cadastros → Águas." (`.agua-sem-base`). "Perfil alvo" lista SÓ o catálogo: os "Alvo — …" no grupo "Por tipo de
  cerveja" (sem o prefixo na opção; a cópia na receita guarda o nome inteiro).
- Os 11 "Torneira — <cidade> (ano)" do catálogo (Amsterdam, Berlin, Denver, NYC, Paris...: água de torneira de cidades
  estrangeiras, nenhuma receita usava) NÃO aparecem em nenhum dos dois seletores; seguem no banco e em Cadastros → Águas.
- Receita antiga com base do catálogo continua com a cópia (opção "__atual"). Teste "água: base só com as águas
  cadastradas pela pessoa...".

## Inoculação e starter na seção Leveduras (27/11/2026, pedido do responsável; sem migração)
- `calculos.js`: `inoculacao({ leveduras, og, litros, cfg })` (testes em calculos.test.mjs). Células em BILHÕES; necessárias
  = taxa (M células/mL/°P) × litros × °P. Taxa automática (`taxaInoculacaoPadrao`): ale 0,75, lager 1,5; OG > 1,060: ale
  1,0, lager 2,0 (lager = alguma levedura LAGER na primária). Contam só as leveduras da fermentação PRIMÁRIA.
  `celulasDaLevedura`: seca 15 bi/g (ajustável; sachê 11,5 g), líquida 100 bi/pacote × viabilidade (0,7% ao dia desde a
  fabricação, `viabilidadeLiquida`), mL/g de líquida = lama 1 bi/mL, "bi células" direto; slant/cultura em pacote = não dá
  para saber (pede a quantidade em bi células). `crescimentoStarter`: AGITADOR = modelo de Kai Troester (Braukaiser: 1,4
  bi/g de extrato abaixo de 1,4 bi/g; acima, 2,33 − 0,67 × bi/g), AGITAR = curva de Chris White (12,55 × x^−0,4595 − 1,
  limitada a 0-6); DME = extrato ÷ 0,96; água = massa − DME. `starterSugerido` = menor de 0,5 a 5 L (0,25 L) que chega;
  null = um passo não chega. Situação: OK 90-250% do ideal, BAIXA 60-90, MUITO_BAIXA < 60, ALTA > 250. Estimativa.
- Dados em `receitas.extras.inoculacao` = { taxa, fabricacao, bilhoes_g, starter (AGITADOR|AGITAR), starter_l, starter_sg }
  (campos vazios não vão; `extrasParaGravar` no montarPayload mantém o resto do extras, ex.: brewfather_id). "Nova a
  partir desta" copia a escolha, menos a data de fabricação (é do pacote do lote). OG e volume: os medidos no lote, se houver.
- Tela: botão `.pitch-resumo` no pé da seção Leveduras (Completo e Clean): "INOCULAÇÃO E STARTER", "Precisa 411 bi · tem
  173 bi" (ou "com o starter"), dica ("Use 3 pacotes", "Faça um starter de 1,5 L ou use 2 pacotes", "Starter de 2 L · 195 g
  de DME") e o % do ideal num selo na cor do estado. Some sem levedura na primária. Tocar abre `dialog.pitch-janela`
  (`abrirPitch`, mesmo `abrirJanelaCampos` dos Parâmetros): cabeça Precisa | Tem/Com o starter | Do ideal ao vivo; linha
  OG · L · ale/lager · viabilidade; campos Taxa (vazia = automática no fundo), Fabricação (só líquida), Seca bi/g (só seca),
  Starter (Sem starter | Agitador magnético | Sem agitador), Volume (vazio = sugestão) e Densidade (vazia = 1,036); linhas
  Levedura da receita, Taxa sem starter, DME no starter, O starter cresce, Taxa com o starter; botão "Usar N pacotes" (1
  passo do desfazer; só com uma levedura na primária e sem starter). Desfazer fecha a janela.
- Teste do navegador (celular): resumo, janela = resumo, taxa automática, starter no agitador ≥ 100%, roleta do volume
  em popover, 390/320 px sem passar da largura, Pronto/foco, ↶. Capturas `p6q2` (resumo), `p6q3` (janela 390), `p6q4`
  (janela 320), `p6q5` (resumo 320). Falta: relatório em PDF não mostra o starter; conferir no iPhone real.

## Fermentáveis do maior para o menor (27/11/2026, pedido do responsável; sem migração)
- A seção Fermentáveis fica SEMPRE ordenada pela quantidade, da maior para a menor (`ordenarFermentaveis` no receitas.js;
  estável: empate e malte sem quantidade mantêm a ordem entre si; sem quantidade vai para o fim). Vale nos dois layouts,
  na barra do grist e no relatório em PDF (seguem a ordem de `r.fermentaveis`); ao salvar, a `ordem` gravada já é essa.
- Sem ordem manual nos maltes: saíram a alça ⠿ da linha (Completo; a coluna dela saiu do grid no style.css) e o ↑ ↓ da
  janela do item (`ordenar` no `secaoLinhas`). Lúpulos, leveduras e passos seguem com ordem manual.
- Quando reordena: ao abrir a receita (sem marcar alteração), ao redesenhar a seção (adicionar, remover, fechar a janela,
  Chegar à OG) e quando o passo do desfazer fecha (`registrar`: ±, roleta). Digitando a quantidade no computador, espera
  o campo perder o foco (a linha não pula no meio da digitação). A base do histórico também é ordenada: um ↶ desfaz a
  quantidade e a ordem juntas, sem passo "só de ordem". Item novo: a janela abre pelo próprio item (`focos[chave](item)`).
- Teste do navegador (celular 390 px, Completo): abre ordenada sem alça e sem "pendente"; + 250 g leva o Cristal para
  cima do Munique; janela sem ↑ ↓; um ↶ desfaz. Captura `p6o-celular-ordem-maltes`.
