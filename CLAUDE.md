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
- Testes: `node --test portal/testes/*.test.mjs` (26 testes). OG e FG batem com o Brewtarget (±0,0005) nas 28 receitas
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
- HTML + módulos JS sem build: `index.html`, `app.js` (login, rotas `#/receitas`, `#/receita/<id|nova>`,
  `#/cadastros/<tabela>`, `#/perfil`), `menu.js` (menu lateral), `estado.js` (cliente Supabase, sessão, preferências), `ui.js` (DOM e números
  pt-BR), `opcoes.js` (listas = CHECK do banco; cor na tela em EBC ou SRM, escolha no perfil), `cadastros.js`,
  `receitas.js`, `vital.js` (barra vital do editor), `busca.js` (busca de ingrediente e de estilo), `alvos.js` (chegar à OG / ao IBU), `icones.js` (ícones próprios), `graficos.js` (grist e linha do tempo), `calculos.js`, `style.css`, `_headers` (CSP e cabeçalhos de segurança do Cloudflare Pages).
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
  170 verificações: login, menu lateral (recolher, só ícones no tablet, gaveta no celular, linhas de ingrediente dentro do
  cartão em 1024/1280/1366/1440 px), cadastros com vírgula, busca (acento, teclado, filtros, recentes, 901 leveduras), ±/setas,
  arrastar e mover pelo teclado, detalhes/remover, desfazer/refazer, chegar à OG/IBU, sem cadeado, referência, barra vital x calculos.js, estados do estilo, diferença após
  mudança, barra à vista com a página rolada (1366 px e celular 390 px), tablet 1024 px, modo escuro, salvar/reabrir,
  lista, lote (nº automático, data, OG/FG medidas, eficiência real), "Nova a partir desta" e "começar a partir de",
  priming e temperatura da água no painel, tela Ferramentas (água da mostura, priming, refratômetro, correção do densímetro), água da
  receita (perfil de íons e sulfato/cloreto, pH estimado e ácido, volumes das águas informados),
  receita de outro, sair; e um bloco de celular com toque: barra do app, toque/segurar no ±, teclado aberto,
  cartões, arrastar com o dedo, janelas em 390 e 320 px). O container não acessa o supabase.co: teste real só depois de publicar.
- Editor (E0 + E1 do `docs/PLANO-UX.md`, 22/11/2026, fonte do sistema): tokens de cor/tipo no topo do `style.css`
  (contraste AA conferido nos dois modos); barra vital fixa (computador: abaixo do topo; celular: no rodapé, ~157 px desde
  22/11/2026: puxador "detalhes" + 2 linhas de 3 cartões com número e régua; com teclado aberto fica baixa, sem régua;
  "detalhes" abre estado e faixas) com OG, FG, ABV, IBU, cor, pH da mostura (faixa fixa 5,2–5,6, ideal 5,3–5,5,
  não depende do estilo; "—" sem grão na mostura), régua da faixa do estilo (`reguaDoEstilo()` no calculos.js:
  folga de 25%, "perto" = últimos 10% da faixa, valor arredondado como na tela), estado com cor + ícone + texto, e a
  diferença da última mudança (acumula no mesmo campo, some em 3 s). Estilo no topo; lote numa linha de resumo
  (`<details>`); volumes e água no painel lateral (coluna única abaixo de 1180 px). SVG pelo `svg()` do ui.js.
- Editor (E2, 22/11/2026): fermentáveis e lúpulos em linhas (`secaoLinhas` no receitas.js) com a quantidade em
  destaque (`campoQuantidade` do ui.js: botões ± que não roubam o foco, ↑/↓ = 1 passo, Shift = 10; passo no perfil,
  padrão 250 g malte (era 50 g; 50 salvo no navegador vira 250 no estado.js) / 5 g lúpulo, em `preferencias`), % do grist e pontos da OG por malte, IBU e g/L por lúpulo
  (`pct_peso`, `pontos_og`, `g_l` no calculos.js), totais no cabeçalho (fermentáveis: kg em destaque + água/malte efetiva = água da mostura ÷ grão da mostura, 23/11/2026), ⋯ = detalhes (dados do cadastro, subir,
  descer, remover), alça ⠿ para arrastar (mouse e toque) ou mover com ↑/↓. Leveduras, outros, mostura e fermentação
  seguem em tabela. "+ Adicionar" abre a busca (`busca.js`): sem acento, vários termos, filtros por tipo, recentes
  (localStorage) e "meus" no topo, 60 resultados por vez, Enter adiciona e leva o foco à quantidade.
- Busca de estilo (23/11/2026, sem migração): o Estilo do topo do editor é um botão que abre a mesma janela do `busca.js`
  (`TIPOS_BUSCA.estilos`). Acha por código (21A, casa exato e vem primeiro), nome, categoria e termos em português
  (`TERMOS_ESTILO`: trigo, azeda, defumada, belga, pilsen, oktoberfest...; o catálogo BJCP está em inglês). No estilo
  cada termo casa com o COMEÇO de uma palavra ("ale" não acha "Pale Lager"). Filtros: Receita ("Combina com a receita"
  = no máximo 1 parâmetro fora), Família, Cor, Amargor, Álcool. Sem busca: "Atual", "Mais perto da receita" (5, por
  `encaixeEstilo` do calculos.js: parâmetros dentro da faixa e distância em larguras), recentes, catálogo em ordem de
  código (`ordemCodigo`: 3A antes de 10A). "Sem estilo" limpa. Cadastros → Estilos usa a mesma busca (`buscarItens`).
- Editor (E3, 22/11/2026; o modo "receita em %" ficou de fora por decisão do responsável): "Chegar à OG" escala os
  fermentáveis destravados pelo mesmo fator (bisseção, `ajustarParaOG`); "Chegar ao IBU" muda só um lúpulo (o de mais
  tempo ou o escolhido; regra de três, `ajustarParaIBU`). Abrem SÓ pelo número da OG/IBU na barra (os botões
  das seções Fermentáveis e Lúpulos foram retirados em 23/11/2026, pedido do responsável),
  com prévia antes de aplicar; aceitam OG em pontos (46 = 1,046). Cadeado por item RETIRADO da tela em 22/11/2026 (pedido do
  responsável); `travado` continua aceito no calculos.js, mas a tela não marca mais. Histórico em memória (50 passos; digitação vira passo após 0,8 s ou ao trocar de campo; ação inteira
  = 1 passo); Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y; desfazer remonta o editor e a barra mostra a diferença. "Fixar
  referência" compara cada número com a tentativa fixada; "Voltar à referência" restaura (e pode ser desfeito).
  Histórico e referência somem ao sair da receita e ao salvar uma receita NOVA (o editor recarrega com o id).
- CELULAR PRIMEIRO (decisão de 22/11/2026: o responsável e a maioria das pessoas usam pelo celular). Toda tela nova se
  desenha e testa primeiro em 390 px e 320 px com toque (contexto `isMobile + hasTouch` no navegador.cjs).
  Etapa de celular (22/11/2026): no editor o menu geral (hoje a `barra-movel`) some e entra a `barra-app` presa no topo (‹ voltar, nome,
  ↶ desfazer, Salvar com ponto quando há alteração pendente); a barra de números acompanha o teclado
  (`visualViewport` → `--teclado`) e o campo em foco rola para cima dela (rolagem instantânea: toque durante rolagem
  suave não vira clique); ± com toque no soltar (rolar a tela por cima não conta) e segurar repete; tabelas
  (leveduras, outros, mostura, fermentação) viram cartões com rótulo por campo (`td[data-rotulo]::before`); chip de
  diferença com `pointer-events: none`; `touch-action: manipulation` nos elementos de toque (sem espera de toque
  duplo). O arrastar com o dedo funciona. PENDÊNCIA: no simulador do Chrome, o 1º toque depois de arrastar a alça não
  vira clique (preso até o toque seguinte); causa não achada (detalhes no navegador.cjs). Conferir no iPhone real.
- Arte (E4, 22/11/2026): ícones próprios em `icones.js` (grade 24, traço 1,75, `icone(nome)` gera SVG pelo `svg()`;
  sem arquivo .svg para não precisar de requisição nem mexer na CSP): títulos de seção com ícone num círculo, botões
  (adicionar, desfazer, refazer, voltar) e copinho na marca. Barra do grist (cada malte na própria cor, % do peso,
  descrição para leitor de tela) e linha do tempo da fervura (`graficos.js`: bolinha por lúpulo, tamanho ~ gramas,
  fervura / whirlpool / dry hop; tocar leva à linha do lúpulo e a destaca). Lista de receitas em cartões no celular
  (copo na cor da cerveja, nº, nome, estilo, data, OG/ABV/IBU/cor), tabela no computador. Ícone do app mantido.
- Publicação: GitHub Pages (decisão de 22/11/2026), https://llmannrich-ai.github.io/GaliaBrew/, pelo workflow
  `.github/workflows/pages.yml` (push em portal/ ou à mão): roda os testes do cálculo, monta o site sem `testes/` e
  `_headers` e publica. Só publica da branch PADRÃO do repositório (a `main`). Pré-requisito único (manual, o proxy daqui não
  mexe em configuração do repositório): Settings → Pages → Source = GitHub Actions. O Pages não lê `_headers`: a CSP
  está também numa `<meta>` no index.html (frame-ancestors só vale no _headers, para um dia ir ao Cloudflare).
  Cache do Pages: 10 min; o `?v=` resolve os scripts. Depois de publicar: Supabase → Authentication → URL
  Configuration → Site URL e Redirect URLs = esse endereço (senão convite/recuperação de senha volta para localhost).
- iPhone: manifest.webmanifest + apple-touch-icon (`icones/`, desenho próprio) → "Adicionar à Tela de Início" abre
  como app; topo respeita a área do entalhe (safe-area). Versão dos scripts: 20261123i.
- Menu lateral (`menu.js`, 23/11/2026, substituiu o menu horizontal): sempre escuro (café + cobre) nos dois temas;
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
- Pendente (já existia antes do menu): editor estoura a largura entre 641 e ~850 px (iPad em pé): as linhas de
  ingrediente só ficam compactas até 640 px.

## Receita = lote (0005, aplicada em 22/11/2026)
- `receitas` ganhou `lote_numero` (automático pelo gatilho `receitas_numerar`: maior do dono + 1; pode repetir, ex.
  83a/83b), `data_brassagem` (date), `og_medida`, `fg_medida` (0,98-1,2), `volume_final_l`. `salvar_receita` grava
  esses campos; `lote_numero` enviado nulo mantém o atual. Teste `supabase/testes/0005_receita_lote.sql`: 8 ok.
- Carga: número e data tirados do nome das importadas (93 com nº, 61 com data); 9 sem número no nome ficaram nulos.
- `calculos.js` → `res.medido`: eficiência real (OG medida no volume real + perda da panela, menos açúcar pronto,
  sobre o açúcar possível do grão), ABV real, atenuação aparente real.
- Portal: card "Brassagem (lote)" no fim do editor (nº, data, OG/FG medidas aceitam 1,050 / 1050 / 50, volume real;
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

## Refratômetro e densímetro (22/11/2026, sem migração)
- `calculos.js`: `sgDeBrix` (°Brix ÷ fator → °P → SG; fator padrão 1,04), `refratometro` (FG com álcool pela cúbica
  de Sean Terrill, leituras ÷ fator; devolve OG, FG, ABV, atenuação) e `corrigirDensimetro` (polinômio usual da
  densidade da água em °F; calibração padrão 20 °C).
- Ferramentas: cartões Refratômetro (com "Descobrir o fator": °Brix ÷ °P do densímetro no mesmo mosto) e Densímetro.
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
  ingrediente (selo + filtro "Fonte"), na coluna "Fonte" e no formulário dos Cadastros de ingrediente (com link "Ver a
  ficha", só https) e nos detalhes (⋯) do malte/lúpulo na receita (`fonteNaReceita`: fonte do item ligado do catálogo;
  sem ligação = "Da receita", caso das 102 importadas do Brewfather). Carga nova de catálogo: gravar `extras.fonte`
  ("Ficha técnica oficial (Marca)…") e `extras.url` para o selo sair certo.
- Teste `supabase/testes/0009_catalogo_marcas.sql`: 8 ok (contagem por marca, campos preenchidos, leitura por usuário
  comum, catálogo não editável por ele, receita copia malte e lúpulo novos). Advisors: sem aviso novo.

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
- No ar: https://llmannrich-ai.github.io/GaliaBrew/, publicado da `main`, que é a branch padrão desde 22/11/2026
  (antes era `claude/gallant-hypatia-oyvzpp`, hoje parada). O container de desenvolvimento NÃO acessa github.io nem
  supabase.co: conferir publicação por `gh api .../deployments` e o banco pelo MCP do Supabase.
- GitHub (22/11/2026, feito pelo responsável): `main` protegida (PR obrigatório, sem aprovação; o dono pode enviar
  direto, que é o que o /deploy das sessões no computador faz); ambiente `github-pages` aceita a `main`. Sessão na
  nuvem não grava a `main` nem a fila: publica pelo modo nuvem do /deploy (PR + merge pela API, com pedido do
  responsável). 1ª publicação assim: PR #3 (editor novo, celular, arte), 22/11/2026.
- Pendente na proteção da `main`: marcar o teste "Cálculos e versões" como obrigatório e "Require branches to be up
  to date" (Settings → Branches → Edit). Sem isso, o GitHub não barra PR desatualizado.
- Login do responsável criado (llmannrich@gmail.com) e já `admin`. Migrações 0001-0010 aplicadas.
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
- Próximo: (3) escalar receita. Sem módulo de brassagem e sem versões.

## Ordem de trabalho
- Fase 1 (CONCLUÍDA em 22/11/2026): 0001 aplicada ✔ → `portal/calculos.js` + testes ✔ → portal com login, cadastros e editor
  de receita ✔ → publicação no GitHub Pages (workflow pronto; falta ligar o Pages) → catálogo ✔ (0004).
- Fase 2: receita = lote ("criar a partir de", dados do lote na receita), ferramentas (água de mostura, priming,
  refratômetro, correção do densímetro), escalar receita.
- Fase 3: importar/exportar BeerJSON e BeerXML, estoque, química da água.
