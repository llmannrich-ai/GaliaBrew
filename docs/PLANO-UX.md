# GaliaBrew — Plano de UX e direção de arte do editor de receitas

Versão 1 — 22/11/2026.

Status: **E0 e E1 feitas em 22/11/2026** (fonte do sistema, decisão do responsável). Próxima: E2. Base: código do portal (`receitas.js`, `style.css`), capturas da tela atual (computador e
celular 390 px, geradas pelo `navegador.cjs`) e documentação pública do Brewfather.

---

## 1. Resumo

O editor faz a conta certa, mas foi desenhado como **formulário de cadastro**. O uso real é outro: o cervejeiro
ajusta malte e lúpulo várias vezes seguidas até os números baterem com o estilo. Para isso a tela precisa
1. manter OG, FG, ABV, IBU e cor **sempre visíveis, grandes e comparados com o estilo**;
2. mostrar **o efeito de cada mudança** (quanto a OG subiu quando o malte foi de 4,8 para 5,0 kg);
3. deixar **a quantidade** como o campo principal da linha, com ajuste rápido (± passo, teclado);
4. oferecer **atalhos de alvo**: "chegar a OG 1,052", "chegar a 40 IBU", receita em %.

Ordem recomendada: barra vital → linha de ingrediente e busca → ferramentas de alvo e desfazer → arte completa →
celular dedicado. As três primeiras entregas resolvem ~80% do problema sem mudar o banco.

---

## 2. Diagnóstico da tela atual

| # | Problema | Onde aparece | Impacto no ajuste da receita |
|---|---|---|---|
| D1 | Os números vitais têm o mesmo peso visual de "Água de lavagem" e "Grãos (kg)" (14 linhas iguais) | Painel "Resultado" | O olho não acha a OG rápido |
| D2 | A faixa do estilo só aparece ao passar o mouse (`title`); o selo "abaixo/ok" é minúsculo (0,7 rem) | Painel | Não dá para ver *quanto* falta nem onde dentro da faixa está |
| D3 | No celular o painel vai para o topo e some ao rolar até os maltes | `@media (max-width:1000px)` | No celular, ajustar malte = rolar para cima e para baixo a cada mudança |
| D4 | Nenhum retorno da mudança: o número troca sem destaque nem diferença | `atualizarResultados()` | Difícil perceber o efeito de 100 g |
| D5 | "Geral" e "Parâmetros do lote" (9 campos de equipamento, raramente mexidos) ocupam a primeira dobra | Ordem das seções | Maltes e lúpulos ficam abaixo da dobra |
| D6 | Linha do fermentável com 8 campos editáveis do mesmo tamanho (rendimento, umidade, cor vêm do cadastro) | Tabela editável | Ruído; a quantidade não se destaca |
| D7 | "+ Adicionar…" é um `<select>` nativo com 215 fermentáveis, 450 lúpulos e 897 leveduras, sem busca | `seletorCadastro()` | Achar "Cascade" numa lista de 450 é lento; no celular é pior |
| D8 | Não existe desfazer, nem comparação com a versão anterior | — | Testar uma ideia e voltar exige anotar à mão |
| D9 | Nada visual além de uma bolinha de cor: sem gráfico de grist, sem linha do tempo de lúpulo | — | A receita não "se vê" |
| D10 | Visual genérico (cartões brancos, âmbar único); identidade fraca | `style.css` | Produto parece rascunho |
| D11 | No celular as tabelas rolam na horizontal com 7–8 campos por linha | Tabelas | Edição no celular quase inviável |

O que já está bom e deve ficar: cálculo ao vivo a cada tecla, números com vírgula, cor em EBC/SRM pelo perfil,
leitura da receita de outro usuário, CSP rígida e testes de navegador.

---

## 3. O que o Brewfather faz e o que aproveitar

Confirmado na documentação dele:
- **Faixas do estilo sombreadas** atrás de cada indicador; o valor da receita aparece dentro ou fora da faixa
  ([designer](https://docs.brewfather.app/recipes/designer)).
- **Entrada por porcentagem**: adiciona os maltes e informa a % de cada um; o total precisa fechar 100%.
- **Escalar para uma OG**: clicar na OG e informar o alvo; os maltes são reescalados.
- **Ajustador de cor**: ajusta os fermentáveis para chegar a uma cor alvo
  ([color adjuster](https://docs.brewfather.app/recipes/color-adjuster)).
- **Estilo como alvo** nos ajustes ([custom styles](https://docs.brewfather.app/profiles/custom-styles)).

Ponto fraco (sua observação, que confirmo como padrão do produto): muita informação em fonte pequena para caber
tudo. Resultado: densidade alta, hierarquia baixa.

Onde o GaliaBrew pode ser melhor (e não só igual):
| Tema | Brewfather | GaliaBrew (proposta) |
|---|---|---|
| Hierarquia | Muitos números do mesmo tamanho | 5 números vitais grandes; o resto recolhido |
| Retorno da mudança | Número troca | Número troca **e** mostra a diferença (+0,002) por 3 s |
| Comparar tentativas | Versões salvas | "Fixar referência" na tela: compara a tentativa atual com a fixada, sem salvar |
| Celular | App completo, denso | Barra vital fixa embaixo + cartões de ingrediente com botões ± grandes |
| Idioma e unidades | Inglês com tradução | Português nativo, vírgula, °P/EBC |

Cuidado legal: aproveitar **mecânicas** (faixa do estilo, modo %, escalar por OG) é livre; não copiar a aparência
(cores, ícones, leiaute idêntico) nem textos dele. Mesma regra já aplicada ao Brewtarget.

---

## 4. Princípios de desenho (valem para toda decisão)

1. **Números vitais nunca saem da tela** enquanto a receita é editada, em nenhum tamanho de tela.
2. **Mudou, mostrou**: toda alteração que mexe num número vital mostra a diferença.
3. **Campo principal em destaque**: na linha do ingrediente, a quantidade é o maior campo; dado de cadastro
   (rendimento, umidade, alfa) fica visível, mas pequeno, e só abre para edição quando pedido.
4. **Cor não é o único sinal**: dentro/fora da faixa leva cor + ícone + texto (acessibilidade e sol na rua).
5. **Desfazer sempre**: qualquer ajuste automático (escalar, alvo) pode ser desfeito com um toque.
6. **Tamanho mínimo**: texto de corpo 15–16 px; nada de valor de receita abaixo de 13 px.

---

## 5. Proposta de tela

### 5.1 Barra vital (resolve D1–D4)

Faixa fixa no topo do editor (computador) e embaixo da tela (celular), sempre visível.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ [copo]   OG 1,048 ▲+0,002   FG 1,010   ABV 5,0%   IBU 32 ▼−3   COR 9 EBC   BU:GU 0,67     │
│  9 EBC   ├──[■■■■●■]──┤     ├─[■■●■]─┤ ├─[■■■●]┤ ├─[■●■■■]─┤ ├[■■●■]┤                      │
│          12,0 °P  ✓ estilo  ✓          ▲ acima  ✓            ✓        5D German Pils       │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Número**: 28–32 px no computador, 20–22 px no celular; algarismos tabulares (não "pulam" ao mudar).
- **Régua do estilo** sob cada número: faixa do estilo sombreada, marcador na posição da receita, eixo com
  margem de 25% além da faixa (para ver o quanto está fora). Sem estilo escolhido: só o número.
- **Estado**: dentro = verde-lúpulo + ✓; perto do limite (últimos 10% da faixa) = âmbar; fora = cobre-avermelhado
  + ▲/▼ + "acima/abaixo". Hoje é só um selo de 0,7 rem.
- **Diferença**: após cada mudança, um chip "+0,002" ao lado do número por ~3 s (some com transição curta; sem
  animação se o sistema pedir "reduzir movimento").
- **Copo**: ilustração SVG preenchida com a cor calculada (substitui a bolinha), com espuma.
- **Volumes, água, BU:GU detalhado, pré-fervura**: saem da barra e vão para um painel "Lote e água" recolhível
  (lateral no computador, aba no celular).
- Celular: barra de 56 px embaixo com OG · ABV · IBU · cor (4 números + mini-régua); tocar abre a barra completa
  como folha deslizante.

### 5.2 Leiaute do editor (resolve D5)

```
Computador (≥ 1100 px)
┌ Nome da receita ··························· [Estilo ▾] [Salvar] [⋯] ┐
├ BARRA VITAL (fixa) ────────────────────────────────────────────────┤
│ ┌ Fermentáveis ─────────────────────┐ ┌ Lote e água (recolhível) ┐ │
│ │ barra do grist (% por malte, cor) │ │ 23 L · 72% · 60 min      │ │
│ │ linhas de ingrediente             │ │ Equipamento: Panela 30 L │ │
│ ├ Lúpulos ──────────────────────────┤ │ volumes, água, pré-ferv. │ │
│ │ linha do tempo da fervura          │ │ [editar parâmetros]      │ │
│ │ linhas de lúpulo                   │ └──────────────────────────┘ │
│ ├ Levedura ─────────────────────────┤                              │
│ ├ Outros ───────────────────────────┤                              │
│ └───────────────────────────────────┘                              │
│ Abas abaixo: [Mostura] [Fermentação] [Notas] [Dados gerais]        │
└────────────────────────────────────────────────────────────────────┘
```

- Estilo sobe para o topo (é o alvo de tudo); tipo, autor, pública vão para "Dados gerais".
- Parâmetros do lote viram **uma linha de resumo** ("23 L · 72% eficiência · 60 min · Panela 30 L — editar").
- Ingredientes que definem os números (fermentáveis, lúpulos, levedura) ficam na primeira dobra.

### 5.3 Linha de ingrediente (resolve D6)

```
Fermentáveis                                     [kg | %]   Total 5,30 kg   [+ Adicionar]
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ▮ Pilsen Agrária                 [ − ]  4,800 kg  [ + ]    90,6%   OG +41   3,5 EBC  ⋯ │
│   Grão · mostura · rend. 81% · umid. 4%                                               │
│ ▮ Carapils                       [ − ]  0,500 kg  [ + ]     9,4%   OG +3    4 EBC    ⋯ │
└──────────────────────────────────────────────────────────────────────────────────────┘
▮ = amostra da cor do malte.   ⋯ = detalhes (editar rendimento, umidade, cor, etapa; remover; mover)
```

- Quantidade: campo grande + botões ±. Passo padrão: 50 g (fermentável), 5 g (lúpulo); `↑/↓` no teclado = 1
  passo, `Shift` = 10 passos. Passo configurável no perfil.
- Colunas calculadas por item: **% do grist** (peso), **contribuição em pontos de OG**, cor do malte.
  Para lúpulo: **IBU da adição** e **g/L**.
- Arrastar para reordenar (substitui o botão ↑).
- Total do grist e soma dos IBU no cabeçalho da seção.

### 5.4 Busca de ingrediente (resolve D7)

Substitui o `<select>` por uma janela de busca:
- Campo com foco automático; filtra enquanto digita (nome, produtor, tipo); ignora acentos.
- Filtros rápidos: fermentável por grupo (base, caramelo, torrado…) e faixa de cor; lúpulo por uso e alfa;
  levedura por tipo e atenuação.
- Cada resultado mostra os dados-chave (cor e rendimento; alfa; atenuação e temperatura).
- Seções "Recentes" (últimos usados pelo usuário) e "Meus" no topo.
- `Enter` adiciona e **leva o foco direto para a quantidade** da nova linha.
- Celular: abre como folha de baixo, tela cheia.

### 5.5 Ferramentas de alvo e de tentativa (resolve D8 e é o diferencial)

| Ferramenta | O que faz | Regra |
|---|---|---|
| **Modo %** | Alterna a coluna de quantidade entre kg e % do grist | Total precisa fechar 100%; avisa se não fechar. Em % o total de malte é decidido pela OG alvo |
| **Chegar à OG** | Toca na OG → informa 1,052 → escala os fermentáveis mantendo as proporções | Itens travados (🔒) não mudam; resultado mostrado antes de aplicar |
| **Chegar ao IBU** | Toca no IBU → informa 40 → ajusta a adição de amargor (a de maior tempo) ou as marcadas | Mantém aroma/dry hop intactos |
| **Chegar à cor** | Ajusta só o malte escolhido (ex.: torrado) para a cor alvo | Fase posterior |
| **Travar item** | Cadeado na linha: o item não muda nos ajustes automáticos | — |
| **Desfazer / refazer** | `Ctrl+Z` / `Ctrl+Shift+Z` e botões; histórico em memória da sessão (50 passos) | Ajuste automático = 1 passo |
| **Fixar referência** | Congela os números atuais; a barra vital passa a mostrar "ref. 1,048 → agora 1,052" | Não salva no banco; botão "voltar à referência" restaura a receita fixada |

Cálculo: OG cresce com o açúcar (função monótona), então "chegar à OG" é uma busca por bisseção do fator de
escala sobre `calcularReceita()`. IBU é proporcional aos gramas, então "chegar ao IBU" é regra de três. Ambos
entram em `calculos.js` com testes (regra do CLAUDE.md).

### 5.6 Visualizações (resolve D9)

- **Barra do grist**: barra horizontal empilhada, cada malte com a própria cor e a %; passar o mouse destaca a
  linha.
- **Linha do tempo da fervura**: eixo de 60 → 0 min com as adições de lúpulo (tamanho = gramas, número = IBU),
  depois whirlpool e dry hop (dia).
- **Copo**: SVG com a cor calculada; ao lado, a faixa de cor do estilo como gradiente.
- Tudo em SVG desenhado no próprio código (sem biblioteca, mantém a CSP `script-src 'self'`).

---

## 6. Direção de arte

### 6.1 Conceito
"Cervejaria artesanal de bancada": quente, material, com precisão de laboratório. Cobre e malte como base;
verde-lúpulo só para "dentro da faixa". A cor da cerveja é **dado**, então a interface não usa âmbar forte em
áreas grandes para não competir com o copo.

### 6.2 Paleta (tokens em `style.css`)
| Token | Claro | Escuro ("adega") | Uso |
|---|---|---|---|
| `--fundo` | #F5EFE4 (creme de malte) | #14110E | Fundo |
| `--superficie` | #FFFDF8 | #1F1A15 | Cartões |
| `--tinta` | #2A211A (café) | #F1E8DA | Texto |
| `--suave` | #6E6255 | #A89A88 | Rótulos |
| `--cobre` | #A8541C | #E08A4A | Ação principal, marca |
| `--lupulo` | #4E7A2F | #8CC063 | Dentro da faixa |
| `--ambar` | #B7791F | #E5B04A | Perto do limite |
| `--fora` | #B23A2A | #EF7462 | Fora da faixa |
| `--linha` | #E4D9C6 | #3A322A | Bordas |

Validar contraste AA (4,5:1 texto; 3:1 elementos gráficos) antes de fechar os valores.

### 6.3 Tipografia
- Escala: 12 (rótulo) · 14 · 16 (corpo) · 20 · 24 · 32 (número vital).
- Números: algarismos tabulares sempre (`font-variant-numeric: tabular-nums`).
- Opção A (recomendada): hospedar 2 fontes livres (licença OFL) no próprio site — uma serifada de display para
  títulos e marca (ex.: Fraunces) e uma sem serifa com bons números (ex.: Inter), só caracteres latinos (~120 KB).
  A CSP já permite (`font-src 'self'`). **Exige pasta nova `portal/fontes/` — precisa da sua aprovação.**
- Opção B: fonte do sistema + só ajuste de pesos e tamanhos. Zero custo, identidade menor.

### 6.4 Ícones e ilustração
- Conjunto próprio em SVG (malte, lúpulo, levedura, água, termômetro, relógio, cadeado, desfazer), traço 1,75 px,
  num único `portal/icones/icones.svg` (pasta já existe) usado por `<use href>`.
- Copo da receita e ícone do app redesenhados no mesmo traço.
- `ui.js` ganha um `svg()` (o `el()` atual cria elementos HTML; SVG precisa de `createElementNS`).

### 6.5 Movimento
- Número vital: transição curta (150 ms) e chip de diferença; régua desliza o marcador.
- Tudo desligado com `prefers-reduced-motion`.

---

## 7. Plano de execução

Cada entrega é uma tarefa com teste (regra 8 do CLAUDE.md), versão nova nos `?v=` e verificações novas no
`navegador.cjs` (capturas em 1366 px e 390 px).

| Entrega | Conteúdo | Resolve | Esforço | Critério de aceite |
|---|---|---|---|---|
| **E0 — Fundação visual** | Tokens de cor, escala de tipo, espaçamento; `svg()` no ui.js; modo escuro revisado | D10 (base) | P | Telas atuais iguais em estrutura, com tokens novos; contraste AA conferido |
| **E1 — Barra vital** | Barra fixa com 5 números grandes, réguas do estilo, estados com ícone, chip de diferença, copo SVG; "Lote e água" recolhível; estilo no topo; parâmetros em linha de resumo | D1–D5 | M | Em 1366 px e 390 px, OG/ABV/IBU/cor visíveis com o campo do último malte em foco; diferença aparece após mudar quantidade |
| **E2 — Linha de ingrediente + busca** | Quantidade com ±, teclado, % do grist, pontos de OG por item, IBU e g/L por lúpulo, detalhes recolhidos, arrastar; janela de busca com filtros, recentes, Enter → quantidade | D6, D7 | M | Adicionar "Cascade" e chegar à quantidade só com teclado em < 5 s; busca filtra 897 leveduras sem travar |
| **E3 — Alvo e tentativas** | Modo %, chegar à OG, chegar ao IBU, travar, desfazer/refazer, fixar referência | D8 | M | Testes em `calculos.test.mjs` (OG alvo ±0,0005; IBU alvo ±0,5); desfazer restaura o estado exato |
| **E4 — Arte completa** | Fontes (se aprovado), ícones, gráfico do grist, linha do tempo da fervura, ícone do app | D9, D10 | M | Revisão visual nas duas larguras e no modo escuro |
| **E5 — Celular** | Barra vital embaixo, cartões de ingrediente no lugar de tabelas, folhas de baixo, alvos de toque ≥ 44 px | D3, D11 | M | Receita completa criada no iPhone (390 px) sem rolagem horizontal |
| E6 — Depois | Chegar à cor, modelo de IBU de whirlpool, salvar a referência como versão da receita (liga com "versões" da fase 2) | — | — | — |

P = até 1 dia; M = 1–3 dias de trabalho do Claude Code com testes.

Banco: E0–E5 não precisam de migração. Preferências (passo do ±, kg/%) ficam no navegador como as atuais;
a % alvo de cada malte, se quiser guardar, cabe em `receita_fermentaveis` numa migração própria (decidir na E3).

---

## 8. Riscos e contrapontos

| Risco | Por que importa | Mitigação |
|---|---|---|
| Barra vital grande come a tela do celular | Sobra pouco espaço para editar | Versão compacta de 56 px com 4 números; completa só ao tocar |
| Ajuste automático "mexe sozinho" e surpreende | Perde a confiança no app | Prévia antes de aplicar + desfazer + itens travados |
| Modo %: "% de quê?" | Peso e extrato dão números diferentes | Padrão = % do peso (como no mercado); % do açúcar visível nos detalhes |
| Correr atrás de todas as funções do Brewfather | Escopo explode, nada fica bom | Foco no ciclo "mudar → ver → decidir"; o resto vai para a fase 2 |
| IBU de whirlpool continua 0 | Receitas de IPA moderna ficam com IBU subestimado | Aviso visível na linha do lúpulo; modelo próprio na E6 |
| Fontes próprias aumentam o peso da página | Primeira carga mais lenta no 4G | Só latim, `font-display: swap`, cache longo pelo `?v=` |
| Reescrever `receitas.js` (460 linhas) de uma vez | Quebra o que funciona | Entregas pequenas; `navegador.cjs` passa a cada uma |

---

## 9. Como medir se melhorou

Teste de tarefa cronometrado (antes de E1 e depois de E3), no computador e no celular:
1. Criar uma American Pale Ale do zero e chegar a OG 1,050–1,054, IBU 35–40, cor 10–14 EBC.
2. Na mesma receita, testar trocar 300 g de Crystal por Munich e voltar ao estado anterior.

Medir: tempo total, número de rolagens para cima/baixo e erros de digitação. Meta: tempo −50% e zero rolagens
para conferir os números.

---

## 10. Decisões que dependem de você

1. **Fontes próprias** (pasta nova `portal/fontes/`, ~120 KB) ou fonte do sistema?
2. **Modo %**: por peso (recomendado) ou por extrato?
3. **Passos do ±**: 50 g para malte e 5 g para lúpulo estão bons?
4. **Ordem**: começar pela E0 + E1 (recomendado) ou outra prioridade?
