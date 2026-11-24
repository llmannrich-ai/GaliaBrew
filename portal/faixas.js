// faixas.js — faixa de valores de cada campo numérico para a ROLETA do celular (roleta.js). Módulo puro (testado em
// portal/testes/faixas.test.mjs). Valores na UNIDADE DA TELA (a cor em EBC ou SRM, conforme o perfil).
//
// Faixa = {
//   min, max            limites da roleta (o valor atual fora deles entra na lista mesmo assim)
//   passo               intervalo entre valores; ou
//   segmentos           [[ate, passo], ...]: passo fino nos valores pequenos e maior nos grandes (ex.: cor, lúpulo)
//   partes: true        duas rodas: inteiro | fração (ex.: 4 | ,25 kg); a fração anda de `passo` em `passo`
//   inicial             valor da roleta quando o campo está vazio (o "mais provável"); número ou função () => número
//   vazio               texto do botão que deixa o campo vazio (ex.: "Usar a sugestão"); sem ele, não há o botão
// }

const arred = (x, casas = 4) => Number(Number(x).toFixed(casas));
const casasDe = (x) => { const s = String(x); return s.includes(".") ? s.split(".")[1].length : 0; };

/** Lista de valores de uma roda só (passo único ou segmentos), em ordem. */
export function valoresDaFaixa(f) {
  const segs = f.segmentos ?? [[f.max, f.passo]];
  const casas = Math.max(...segs.map(([, p]) => casasDe(p)), casasDe(f.min));
  const lista = [];
  let anterior = null;            // cada segmento continua do último valor do anterior, com o próprio passo
  for (const [ate, passo] of segs) {
    const fim = Math.min(ate, f.max);
    for (let v = anterior === null ? arred(f.min, casas) : arred(anterior + passo, casas); v <= fim + 1e-9; v = arred(v + passo, casas)) {
      lista.push(v);
      anterior = v;
    }
  }
  return lista;
}

/** Põe `valor` na lista ordenada se ainda não está (valor atual fora da grade ou fora da faixa). Devolve o índice. */
function incluir(lista, valor) {
  let i = lista.findIndex((x) => Math.abs(x - valor) < 1e-9);
  if (i >= 0) return i;
  i = lista.findIndex((x) => x > valor);
  if (i < 0) i = lista.length;
  lista.splice(i, 0, valor);
  return i;
}

/** Valor de partida: o atual; vazio → `inicial` (número ou função); sem ele, o mínimo. Fica dentro da faixa. */
export function valorInicial(f, atual) {
  if (Number.isFinite(atual)) return atual;
  const ini = typeof f.inicial === "function" ? f.inicial() : f.inicial;
  return Number.isFinite(ini) ? Math.min(f.max, Math.max(f.min, ini)) : f.min;
}

/**
 * Rodas para mostrar `valor`: [{ valores, textos, indice }]. Uma roda (lista de valores) ou duas (inteiro | fração).
 * fmt(v, casas) formata o número da roda única (ex.: numeroBR).
 */
export function rodasDaFaixa(f, valor, fmt) {
  if (!f.partes) {
    const valores = valoresDaFaixa(f);
    const indice = incluir(valores, valor);
    const casas = Math.max(casasDe(f.passo ?? 1), ...(f.segmentos ?? []).map(([, p]) => casasDe(p)));
    // O valor fora da grade (ex.: 12,5 g numa roda de 1 em 1) aparece com as próprias casas.
    return [{ valores, textos: valores.map((v) => fmt(v, Math.max(casas, Math.min(3, casasDe(v))))), indice }];
  }
  const casas = casasDe(f.passo);
  const inteiro = Math.floor(valor + 1e-9);
  const fracao = arred(valor - inteiro, casas + 2);
  const ints = [];
  for (let i = Math.floor(f.min); i <= Math.floor(f.max); i++) ints.push(i);
  const iInt = incluir(ints, inteiro);
  const fracs = [];
  for (let k = 0; k * f.passo < 1 - 1e-9; k++) fracs.push(arred(k * f.passo, casas));
  const iFrac = incluir(fracs, fracao);
  const casasFrac = Math.max(casas, casasDe(fracao));
  // A vírgula fica entre as duas rodas (roleta.js), não no texto: "4" | , | "80".
  const rodas = [
    { valores: ints, textos: ints.map(String), indice: iInt },
    { valores: fracs, textos: fracs.map((x) => x.toFixed(casasFrac).split(".")[1]), indice: iFrac },
  ];
  rodas.piso = Math.min(f.min, valor);          // abaixo do mínimo só se o valor atual já estava abaixo
  return rodas;
}

/** Índices das rodas que mostram `v` (o mais perto em cada roda). Usado quando o valor bate no mínimo/máximo. */
export function indicesDoValor(rodas, v) {
  const perto = (lista, x) => lista.reduce((m, y, i) => (Math.abs(y - x) < Math.abs(lista[m] - x) ? i : m), 0);
  if (rodas.length === 1) return [perto(rodas[0].valores, v)];
  const inteiro = Math.floor(v + 1e-9);
  return [perto(rodas[0].valores, inteiro), perto(rodas[1].valores, arred(v - inteiro, 6))];
}

/** Valor das rodas (índices escolhidos), arredondado; com duas rodas, inteiro + fração dentro de [min, max]. */
export function valorDasRodas(f, rodas, indices) {
  if (rodas.length === 1) return rodas[0].valores[indices[0]];
  const v = arred(rodas[0].valores[indices[0]] + rodas[1].valores[indices[1]], 6);
  // Teto = max (ex.: 50 | ,99 vira 50), a não ser que o valor atual já passasse dele (aí a roda de inteiros cresceu).
  const teto = rodas[0].valores.at(-1) > Math.floor(f.max) ? Infinity : f.max;
  return Math.min(Math.max(v, rodas.piso ?? f.min), teto);
}

// ---------- faixas do GaliaBrew (unidades do banco, regra 4; cor na unidade da tela) ----------
const sgFaixa = (inicial) => ({ min: 0.99, max: 1.15, passo: 0.001, inicial });
export const FAIXAS = {
  // ingredientes
  quantidade_kg: { min: 0.1, max: 50, passo: 0.01, partes: true, inicial: 4 },     // mínimo 100 g (pedido do responsável)
  quantidade_g: { min: 0, max: 1000, segmentos: [[100, 1], [300, 5], [1000, 10]], inicial: 20 },
  rendimento_pct: { min: 0, max: 100, passo: 0.1, partes: true, inicial: 80 },
  umidade_pct: { min: 0, max: 20, passo: 0.1, partes: true, inicial: 4 },
  fermentavel_pct: { min: 0, max: 100, passo: 1, inicial: 100 },
  max_lote_pct: { min: 0, max: 100, passo: 1, inicial: 100 },
  alfa_pct: { min: 0, max: 25, passo: 0.1, partes: true, inicial: 8 },
  beta_pct: { min: 0, max: 15, passo: 0.1, partes: true, inicial: 4 },
  oleo_ml_100g: { min: 0, max: 5, passo: 0.1, partes: true, inicial: 1 },
  ano: { min: 2000, max: 2035, passo: 1, inicial: new Date().getFullYear() },
  atenuacao_pct: { min: 40, max: 100, passo: 1, inicial: 75 },
  atenuacao_min_pct: { min: 40, max: 100, passo: 1, inicial: 72 },
  atenuacao_max_pct: { min: 40, max: 100, passo: 1, inicial: 78 },
  temp_min_c: { min: 0, max: 40, passo: 0.5, inicial: 16 },
  temp_max_c: { min: 0, max: 40, passo: 0.5, inicial: 22 },
  tolerancia_alcool_pct: { min: 0, max: 25, passo: 0.5, inicial: 10 },
  // lúpulo: tempo, temperatura do whirlpool, dia do dry hop
  tempo_min: { min: 0, max: 180, passo: 1, inicial: 60 },
  dia: { min: 0, max: 30, passo: 1, inicial: 4 },
  // levedura e outros
  quantidade: { min: 0, max: 1000, segmentos: [[1, 0.05], [20, 0.5], [200, 1], [1000, 10]], inicial: 1 },
  dias: { min: 0, max: 90, passo: 1, inicial: 7 },
  // água
  gramas: { min: 0, max: 100, segmentos: [[10, 0.1], [30, 0.5], [100, 1]], inicial: 2 },
  ml: { min: 0, max: 50, segmentos: [[10, 0.1], [50, 0.5]], inicial: 2 },
  agua_mostura_l: { min: 0, max: 300, passo: 0.1, partes: true, inicial: 15, vazio: "Usar a sugestão" },
  agua_lavagem_l: { min: 0, max: 300, passo: 0.1, partes: true, inicial: 15, vazio: "Usar a sugestão" },
  agua_diluicao_pct: { min: 0, max: 100, passo: 5, inicial: 0, vazio: "Sem diluição" },
  calcio_ppm: { min: 0, max: 400, passo: 1, inicial: 50 },
  magnesio_ppm: { min: 0, max: 100, passo: 1, inicial: 10 },
  sodio_ppm: { min: 0, max: 300, passo: 1, inicial: 10 },
  sulfato_ppm: { min: 0, max: 800, segmentos: [[200, 1], [800, 5]], inicial: 50 },
  cloreto_ppm: { min: 0, max: 400, passo: 1, inicial: 50 },
  bicarbonato_ppm: { min: 0, max: 600, segmentos: [[200, 1], [600, 5]], inicial: 50 },
  ph: { min: 4, max: 9, passo: 0.05, inicial: 7 },
  // parâmetros do lote / equipamento
  volume_lote_l: { min: 1, max: 500, passo: 0.1, partes: true, inicial: 20 },
  volume_panela_l: { min: 1, max: 500, passo: 0.1, partes: true, inicial: 35 },
  eficiencia_pct: { min: 30, max: 100, passo: 1, inicial: 72 },
  fervura_min: { min: 0, max: 240, passo: 5, inicial: 60 },
  evaporacao_l_h: { min: 0, max: 20, passo: 0.1, partes: true, inicial: 3 },
  perda_panela_l: { min: 0, max: 50, passo: 0.1, partes: true, inicial: 1 },
  perda_tina_l: { min: 0, max: 50, passo: 0.1, partes: true, inicial: 0.5 },
  perda_fermentador_l: { min: 0, max: 50, passo: 0.1, partes: true, inicial: 1 },
  absorcao_grao_l_kg: { min: 0, max: 3, passo: 0.01, inicial: 1 },
  relacao_agua_grao_l_kg: { min: 1, max: 8, passo: 0.1, inicial: 3 },
  temp_grao_c: { min: -5, max: 45, passo: 0.5, inicial: 20 },
  // lote (receita = lote)
  og_medida: sgFaixa(1.05),
  fg_medida: sgFaixa(1.01),
  volume_final_l: { min: 0, max: 500, passo: 0.1, partes: true, inicial: 20 },
  co2_alvo_vol: { min: 1, max: 5, passo: 0.1, inicial: 2.4, vazio: "Sem priming" },
  // estilo (cadastro)
  og_min: sgFaixa(1.04), og_max: sgFaixa(1.06), fg_min: sgFaixa(1.008), fg_max: sgFaixa(1.014),
  ibu_min: { min: 0, max: 150, passo: 1, inicial: 20 }, ibu_max: { min: 0, max: 150, passo: 1, inicial: 40 },
  abv_min_pct: { min: 0, max: 20, passo: 0.1, partes: true, inicial: 4.5 }, abv_max_pct: { min: 0, max: 20, passo: 0.1, partes: true, inicial: 6 },
  co2_min_vol: { min: 1, max: 5, passo: 0.1, inicial: 2.2 }, co2_max_vol: { min: 1, max: 5, passo: 0.1, inicial: 2.7 },
  // preferências (passo dos botões ±)
  passo_fermentavel_g: { min: 10, max: 1000, segmentos: [[100, 10], [1000, 50]], inicial: 250 },
  passo_lupulo_g: { min: 1, max: 50, passo: 1, inicial: 5 },
};

/** Campos com o mesmo nome em lugares diferentes (temperatura, tempo): faixa própria, escolhida no próprio campo. */
export const FAIXAS_LUGAR = {
  temp_mostura: { min: 30, max: 100, passo: 0.5, inicial: 66 },
  tempo_mostura: { min: 0, max: 240, passo: 1, inicial: 60 },
  temp_fermentacao: { min: -2, max: 40, passo: 0.5, inicial: 19 },
  temp_whirlpool: { min: 50, max: 100, passo: 1, inicial: 80, vazio: "Padrão (80 °C)" },
  tempo_outro: { min: 0, max: 180, passo: 1, inicial: 15 },
  sg: sgFaixa(1.05),
  brix: { min: 0, max: 35, passo: 0.1, partes: true, inicial: 12 },
  fator_refratometro: { min: 0.95, max: 1.1, passo: 0.001, inicial: 1.04 },
  graos_kg: { min: 0, max: 100, passo: 0.05, partes: true, inicial: 5 },
  litros: { min: 0, max: 500, passo: 0.5, partes: true, inicial: 20 },
  temp_amostra: { min: 0, max: 100, passo: 0.5, inicial: 20 },
  temp_ambiente: { min: -5, max: 45, passo: 0.5, inicial: 20 },
};

/** Cor na unidade da tela: passo fino nos maltes claros, maior nos escuros. */
export function faixaCor(unidade, inicial) {
  return unidade === "SRM"
    ? { min: 0, max: 700, segmentos: [[10, 0.1], [20, 0.5], [60, 1], [200, 5], [700, 10]], inicial: inicial ?? 3 }
    : { min: 0, max: 1600, segmentos: [[30, 0.5], [100, 1], [400, 5], [1600, 10]], inicial: inicial ?? 6 };
}

/**
 * Quantidade mais provável de um fermentável (kg) para o lote: o 1º grão claro = malte base (4 kg em 20 L);
 * outro grão claro 1 kg; Munique/Viena (5-15 SRM) 0,5 kg; cristal e torrado 0,25 kg; açúcar/extrato 0,5 kg.
 * Proporcional ao volume do lote; arredondado a 50 g.
 */
export function presetFermentavel(item, receita) {
  const escala = (Number(receita?.volume_lote_l) > 0 ? Number(receita.volume_lote_l) : 20) / 20;
  const cor = Number(item?.cor_srm) || 0;
  const grao = !item?.tipo || item.tipo === "GRAO" || item.tipo === "OUTRO";
  const outrosComQtd = (receita?.fermentaveis ?? []).filter((x) => x !== item && Number(x.quantidade_kg) > 0);
  let kg;
  if (!grao) kg = 0.5;
  else if (cor >= 15) kg = 0.25;
  else if (cor >= 5) kg = 0.5;
  else kg = outrosComQtd.length ? 1 : 4;
  return Math.max(0.1, Number((Math.round((kg * escala) / 0.05) * 0.05).toFixed(2)));
}

/** Gramas mais prováveis de um lúpulo (20 L): amargor 20 g; sabor/aroma 30 g; whirlpool 40 g; dry hop 50 g. */
export function presetLupulo(item, receita) {
  const escala = (Number(receita?.volume_lote_l) > 0 ? Number(receita.volume_lote_l) : 20) / 20;
  const t = Number(item?.tempo_min);
  let g = 20;
  if (item?.etapa === "DRY_HOP") g = 50;
  else if (item?.etapa === "WHIRLPOOL") g = 40;
  else if (item?.etapa === "FERVURA" && Number.isFinite(t) && t <= 20) g = 30;
  return Math.max(1, Math.round(g * escala));
}
