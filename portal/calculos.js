// calculos.js — cálculos da receita do GaliaBrew (OG, FG, ABV, IBU, cor, volumes).
// Módulo puro (sem dependências), roda no navegador e no Node (testes em portal/testes/).
// Unidades: kg, g, L, °C, minutos, densidade em SG, cor em SRM, percentuais 0-100.
//
// Fórmulas públicas: polinômio °Plato da ASBC, Tinseth (IBU), Morey (cor), tabela de ABV do HMRC (Excise
// Notice 226). As regras de OG/FG seguem as do Brewtarget (GPL-3), reescritas aqui a partir da descrição —
// nenhum trecho de código foi copiado. Ver docs/PRD.md, seção 5.

// ---------------------------------------------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------------------------------------------
export const DENSIDADE_SACAROSE_KG_L = 1.587;
export const ATENUACAO_PADRAO_PCT = 75;          // levedura sem atenuação informada
export const FATOR_GRAO_FORA_MOSTURA = 0.6;      // grão só em infusão (receita de extrato) rende menos
export const AJUSTE_PRIMEIRO_MOSTO = 1.1;        // lúpulo no primeiro mosto: +10% sobre a fervura inteira
export const TEMPERATURA_WHIRLPOOL_PADRAO_C = 80; // whirlpool sem temperatura informada (o mesmo do Brewfather)
const KG_PARA_LB = 1 / 0.45359237;
const L_PARA_GAL = 1 / 3.785411784;
const SG_MIN = 0.9;
const SG_MAX = 1.2;

// Tipos de fermentável cujo açúcar já existe (não depende da eficiência da mostura).
const ACUCAR_PRONTO = new Set(["EXTRATO", "EXTRATO_SECO", "ACUCAR", "FRUTA", "SUCO", "MEL"]);
// Etapas em que o ingrediente está na panela durante a fervura.
const NA_PANELA = new Set(["MOSTURA", "FERVURA"]);

// Tabela do HMRC: diferença de gravidade em excesso (OG − FG, em "pontos") × fator = ABV %.
// [de, até, fator] com os pontos em décimos (para comparar inteiros).
const FATORES_HMRC = [
  [0, 69, 0.125], [70, 104, 0.126], [105, 172, 0.127], [173, 261, 0.128], [262, 360, 0.129],
  [361, 465, 0.130], [466, 571, 0.131], [572, 679, 0.132], [680, 788, 0.133], [789, 897, 0.134],
  [898, 1007, 0.135],
];

// ---------------------------------------------------------------------------------------------------------------
// Conversões
// ---------------------------------------------------------------------------------------------------------------
const num = (v, padrao = 0) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? padrao : Number(v));

/** °Plato a partir da densidade (SG 20/20 °C), polinômio da ASBC. */
export function platoDeSg(sg) {
  return -616.868 + 1111.14 * sg - 630.272 * sg ** 2 + 135.997 * sg ** 3;
}

/** Densidade (SG) a partir do °Plato: inverso do polinômio por bisseção (a função é crescente no intervalo). */
export function sgDePlato(plato) {
  let lo = SG_MIN;
  let hi = SG_MAX;
  for (let i = 0; i < 60; i++) {
    const meio = (lo + hi) / 2;
    if (platoDeSg(meio) < plato) lo = meio;
    else hi = meio;
  }
  return (lo + hi) / 2;
}

/** °Plato de uma solução com `acucarKg` de açúcar (equivalente em sacarose) num volume total de `litros`. */
export function platoDeAcucar(acucarKg, litros) {
  const agua = litros - acucarKg / DENSIDADE_SACAROSE_KG_L;
  const total = acucarKg + agua;
  return total > 0 ? (acucarKg / total) * 100 : 0;
}

/** Densidade (SG) de `acucarKg` dissolvidos em `litros`. */
export function sgDeAcucar(acucarKg, litros) {
  return litros > 0 && acucarKg > 0 ? sgDePlato(platoDeAcucar(acucarKg, litros)) : 1;
}

/** Açúcar (kg) que dá a densidade `sg` em `litros` (inverso de sgDeAcucar). */
export function acucarDeSg(sg, litros) {
  if (!(litros > 0) || !(sg > 1)) return 0;
  const p = platoDeSg(sg);
  return (p * litros) / (100 - p * (1 - 1 / DENSIDADE_SACAROSE_KG_L));
}

export const pontos = (sg) => (sg - 1) * 1000;
export const sgDePontos = (p) => 1 + p / 1000;
export const ebcDeSrm = (srm) => srm * 1.97;
export const srmDeEbc = (ebc) => ebc / 1.97;
export const lovibondDeSrm = (srm) => (srm + 0.76) / 1.3546;
export const srmDeLovibond = (l) => 1.3546 * l - 0.76;
export const fahrenheitDeCelsius = (c) => (c * 9) / 5 + 32;
export const celsiusDeFahrenheit = (f) => ((f - 32) * 5) / 9;

// ---------------------------------------------------------------------------------------------------------------
// Fórmulas isoladas
// ---------------------------------------------------------------------------------------------------------------

/** ABV % pela tabela do HMRC; fora da tabela (diferença > 100,7 pontos), fórmula de Daniels/Hall. */
export function abv(og, fg) {
  if (!(og >= fg)) return { abv_pct: 0, metodo: "INVALIDO" };
  const difX10 = Math.round(10 * (pontos(og) - pontos(fg)));
  const faixa = FATORES_HMRC.find(([de, ate]) => de <= difX10 && difX10 <= ate);
  if (faixa) return { abv_pct: (difX10 / 10) * faixa[2], metodo: "HMRC" };
  return { abv_pct: ((76.08 * (og - fg)) / (1.775 - og)) * (fg / 0.794), metodo: "DANIELS" };
}

/** Utilização do alfa ácido (decimal) de Tinseth: fator de gravidade × fator de tempo. */
export function utilizacaoTinseth(sgMosto, minutos) {
  if (!(minutos > 0)) return 0;
  const fatorGravidade = 1.65 * 0.000125 ** (sgMosto - 1);
  const fatorTempo = (1 - Math.exp(-0.04 * minutos)) / 4.15;
  return fatorGravidade * fatorTempo;
}

/** IBU de uma adição na fervura (Tinseth). `litros` = volume de cerveja pronta (no fermentador). */
export function ibuTinseth({ alfaPct, gramas, minutos, sgMosto, litros }) {
  if (!(litros > 0)) return 0;
  const mgPorLitroAlfa = ((alfaPct / 100) * gramas * 1000) / litros;
  return utilizacaoTinseth(sgMosto, minutos) * mgPorLitroAlfa;
}

/**
 * Velocidade de isomerização do alfa ácido a `celsius`, relativa à fervura (100 °C = 1), pela equação de
 * Arrhenius publicada por Malowicz (2009): k ∝ 2,39 × 10¹¹ × e^(−9773 / K). Usada no whirlpool:
 * 90 °C ≈ 0,49; 85 °C ≈ 0,34; 80 °C ≈ 0,23; 70 °C ≈ 0,10.
 */
export function fatorIsomerizacao(celsius) {
  if (!Number.isFinite(celsius)) return 0;
  return Math.min(1, 2.39e11 * Math.exp(-9773 / (celsius + 273.15)));
}

// ---------------------------------------------------------------------------------------------------------------
// Água da mostura e priming
// ---------------------------------------------------------------------------------------------------------------
export const CALOR_ESPECIFICO_GRAO = 0.41;   // relativo à água (balanço de calor, como em Palmer, "How to Brew")

/**
 * Temperatura da água para a infusão: a mistura água + grão fica em `alvoC`.
 * Tw = alvo + (0,41 ÷ L/kg) × (alvo − grão). Não conta o calor que a tina absorve (pré-aquecer a tina, ou somar 1-2 °C).
 */
export function temperaturaAguaMostura({ graoC, alvoC, litrosPorKg }) {
  if (!(litrosPorKg > 0) || !Number.isFinite(graoC) || !Number.isFinite(alvoC)) return null;
  return alvoC + (CALOR_ESPECIFICO_GRAO / litrosPorKg) * (alvoC - graoC);
}

/** CO₂ que a cerveja já tem (volumes) depois de fermentar até `celsius` (a maior temperatura que ela atingiu). */
export function co2Residual(celsius) {
  const f = fahrenheitDeCelsius(celsius);
  return 3.0378 - 0.050062 * f + 0.00026555 * f * f;
}

/** Gramas de cada açúcar por litro para subir 1 volume de CO₂ (dextrose: 15,195 g/galão; os outros relativos a ela). */
export const PRIMING_G_L_VOL = { SACAROSE: 3.65, DEXTROSE: 4.01, EXTRATO_SECO: 5.84, MEL: 4.64 };

/** Priming: gramas de açúcar para chegar a `co2Alvo` volumes em `litros`, depois de fermentar até `temperaturaMaxC`. */
export function primingGramas({ litros, co2Alvo, temperaturaMaxC, acucar = "SACAROSE" }) {
  const fator = PRIMING_G_L_VOL[acucar];
  if (!(litros > 0) || !(co2Alvo > 0) || !fator || !Number.isFinite(temperaturaMaxC)) return null;
  const residual = co2Residual(temperaturaMaxC);
  return { gramas: Math.max(0, (co2Alvo - residual) * litros * fator), co2_residual: residual, g_por_litro: Math.max(0, (co2Alvo - residual) * fator) };
}

// ---------------------------------------------------------------------------------------------------------------
// Refratômetro e densímetro
// ---------------------------------------------------------------------------------------------------------------
export const FATOR_REFRATOMETRO_PADRAO = 1.04;   // mosto lê ~4% acima de uma solução de sacarose de mesmo °P

/** Densidade a partir da leitura do refratômetro em mosto NÃO fermentado: °Brix ÷ fator → °P → SG. */
export function sgDeBrix(brix, fator = FATOR_REFRATOMETRO_PADRAO) {
  if (!Number.isFinite(brix) || !(fator > 0)) return null;
  return sgDePlato(brix / fator);
}

/**
 * FG pelo refratômetro com a cerveja fermentando (o álcool distorce a leitura). Equação cúbica de Sean Terrill
 * (2011), com as leituras divididas pelo fator do refratômetro. Devolve OG, FG, ABV e atenuação aparente.
 */
export function refratometro({ brixInicial, brixFinal, fator = FATOR_REFRATOMETRO_PADRAO }) {
  if (!Number.isFinite(brixInicial) || !Number.isFinite(brixFinal) || !(fator > 0) || brixInicial <= 0) return null;
  const o = brixInicial / fator;
  const f = brixFinal / fator;
  const fg = 1 - 0.0044993 * o + 0.011774 * f + 0.00027581 * o * o - 0.0012717 * f * f - 0.0000072800 * o ** 3 + 0.000063293 * f ** 3;
  const og = sgDePlato(o);
  const ok = fg <= og;
  return { og, fg, abv_pct: ok ? abv(og, fg).abv_pct : null, atenuacao_pct: ok && og > 1 ? ((og - fg) / (og - 1)) * 100 : null };
}

/** Densidade da água relativa a 60 °F na temperatura `celsius` (polinômio usual da correção do densímetro). */
function fatorTemperaturaDensimetro(celsius) {
  const f = fahrenheitDeCelsius(celsius);
  return 1.00130346 - 0.000134722124 * f + 0.00000204052596 * f * f - 0.00000000232820948 * f ** 3;
}

/** Corrige a leitura do densímetro feita a `tempC` para a temperatura de calibração dele (`calibracaoC`, 20 °C). */
export function corrigirDensimetro({ sg, tempC, calibracaoC = 20 }) {
  if (!Number.isFinite(sg) || !Number.isFinite(tempC) || !Number.isFinite(calibracaoC)) return null;
  return sg * (fatorTemperaturaDensimetro(tempC) / fatorTemperaturaDensimetro(calibracaoC));
}

// ---------------------------------------------------------------------------------------------------------------
// Química da água: sais e perfil de íons
// ---------------------------------------------------------------------------------------------------------------
export const IONS = ["calcio_ppm", "magnesio_ppm", "sodio_ppm", "sulfato_ppm", "cloreto_ppm", "bicarbonato_ppm"];

// Massas molares (g/mol). 1 g de sal em 1 L dá (massa do íon × quantos ÷ massa do sal) × 1000 mg/L (ppm).
const M = { Ca: 40.078, Mg: 24.305, Na: 22.990, SO4: 96.06, Cl: 35.453, HCO3: 61.017, H2O: 18.015 };
const ppmPorGL = (massaSal, partes) => Object.fromEntries(Object.entries(partes).map(([ion, m]) => [ion, (m / massaSal) * 1000]));
export const SAIS = {
  GESSO:             ppmPorGL(M.Ca + M.SO4 + 2 * M.H2O,      { calcio_ppm: M.Ca, sulfato_ppm: M.SO4 }),          // CaSO₄·2H₂O
  CLORETO_CALCIO:    ppmPorGL(M.Ca + 2 * M.Cl + 2 * M.H2O,   { calcio_ppm: M.Ca, cloreto_ppm: 2 * M.Cl }),       // CaCl₂·2H₂O
  SULFATO_MAGNESIO:  ppmPorGL(M.Mg + M.SO4 + 7 * M.H2O,      { magnesio_ppm: M.Mg, sulfato_ppm: M.SO4 }),        // MgSO₄·7H₂O (sal amargo)
  CLORETO_MAGNESIO:  ppmPorGL(M.Mg + 2 * M.Cl + 6 * M.H2O,   { magnesio_ppm: M.Mg, cloreto_ppm: 2 * M.Cl }),     // MgCl₂·6H₂O
  CLORETO_SODIO:     ppmPorGL(M.Na + M.Cl,                   { sodio_ppm: M.Na, cloreto_ppm: M.Cl }),            // NaCl (sal de cozinha)
  BICARBONATO_SODIO: ppmPorGL(M.Na + M.HCO3,                 { sodio_ppm: M.Na, bicarbonato_ppm: M.HCO3 }),      // NaHCO₃
};

/**
 * Perfil final da água: origem diluída com água destilada/osmose (`diluicaoPct` % do volume) + sais (gramas no
 * volume `litros`, a água toda do dia). Devolve os íons (ppm), a relação sulfato/cloreto, a alcalinidade e a
 * alcalinidade residual (Kolbach, ppm como CaCO₃: alcalinidade − Ca/1,4 − Mg/1,7).
 */
export function perfilAgua({ origem = {}, diluicaoPct = 0, sais = [], litros }) {
  const fator = 1 - Math.min(100, Math.max(0, num(diluicaoPct))) / 100;
  const ions = Object.fromEntries(IONS.map((k) => [k, num(origem[k]) * fator]));
  if (litros > 0) {
    for (const s of sais) {
      const tabela = SAIS[s.sal];
      if (!tabela || !(num(s.gramas) > 0)) continue;
      for (const [ion, ppm] of Object.entries(tabela)) ions[ion] += (ppm * num(s.gramas)) / litros;
    }
  }
  const alcalinidade = ions.bicarbonato_ppm * (50.04 / M.HCO3);
  return {
    ions,
    sulfato_cloreto: ions.cloreto_ppm > 0 ? ions.sulfato_ppm / ions.cloreto_ppm : null,
    alcalinidade,
    alcalinidade_residual: alcalinidade - ions.calcio_ppm / 1.4 - ions.magnesio_ppm / 1.7,
  };
}

/** Leitura da relação sulfato/cloreto (faixas usuais). */
export function leituraSulfatoCloreto(r) {
  if (r == null) return null;
  if (r < 0.4) return "MUITO_MALTADA";
  if (r < 0.77) return "MALTADA";
  if (r <= 1.3) return "EQUILIBRADA";
  if (r <= 2) return "LEVEMENTE_AMARGA";
  return "SECA_AMARGA";
}

/** Cor em SRM pela fórmula de Morey, a partir das MCU (Σ lb × °L ÷ galão). */
export function srmMorey(mcu) {
  return mcu > 0 ? 1.4922 * mcu ** 0.6859 : 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Receita
// ---------------------------------------------------------------------------------------------------------------

/** Açúcar (kg de sacarose equivalente) de uma adição de fermentável, antes da eficiência. */
export function acucarDoFermentavel(f) {
  let kg = num(f.quantidade_kg) * (num(f.rendimento_pct) / 100) * (1 - num(f.umidade_pct) / 100);
  if (f.tipo === "GRAO" && f.etapa !== "MOSTURA") kg *= FATOR_GRAO_FORA_MOSTURA;
  return kg;
}

/**
 * Calcula a receita. `r` usa os mesmos nomes de coluna do banco (tabela receitas + listas das adições):
 *   volume_lote_l, eficiencia_pct, fervura_min, evaporacao_l_h, perda_panela_l, absorcao_grao_l_kg,
 *   relacao_agua_grao_l_kg, perda_tina_l,
 *   fermentaveis: [{ tipo, rendimento_pct, umidade_pct, cor_srm, fermentavel_pct, quantidade_kg, etapa }],
 *   lupulos:      [{ alfa_pct, quantidade_g, etapa, tempo_min }],
 *   leveduras:    [{ atenuacao_pct }]
 */
export function calcularReceita(r) {
  const lote = num(r.volume_lote_l);
  const perdaPanela = num(r.perda_panela_l);
  const fervuraMin = num(r.fervura_min);
  const evaporacao = num(r.evaporacao_l_h);
  const eficiencia = num(r.eficiencia_pct) / 100;
  const fermentaveis = r.fermentaveis ?? [];
  const lupulos = r.lupulos ?? [];
  const leveduras = r.leveduras ?? [];

  // Volumes. Pós-fervura = lote + perda na panela (trub/chiller); a OG é a do mosto ao fim da fervura.
  const posFervura = lote + perdaPanela;
  const preFervura = posFervura + evaporacao * (fervuraMin / 60);
  const fracaoAoFermentador = posFervura > 0 ? Math.min(1, Math.max(0, lote / posFervura)) : 1;

  // Açúcares. Do amido (grão/adjunto): leva a eficiência. Pronto (extrato, açúcar, mel, fruta): não leva,
  // mas perde a parte que fica na panela (perda_panela). Não fermentável = (100 − fermentavel_pct) %.
  let doAmido = 0;
  let pronto = 0;
  let naoFermentavel = 0;
  let naPanela = 0;          // açúcar na panela durante a fervura (para a gravidade do lúpulo)
  const porItem = fermentaveis.map((f) => {
    const bruto = acucarDoFermentavel(f);
    const ehPronto = ACUCAR_PRONTO.has(f.tipo);
    const efetivo = ehPronto ? bruto * fracaoAoFermentador : bruto * eficiencia;
    const fracaoNaoFerm = 1 - num(f.fermentavel_pct, 100) / 100;
    if (ehPronto) pronto += efetivo;
    else doAmido += efetivo;
    naoFermentavel += efetivo * fracaoNaoFerm;
    if (NA_PANELA.has(f.etapa)) naPanela += ehPronto ? bruto : bruto * eficiencia;
    return { acucar_kg: efetivo };
  });
  const acucarTotal = doAmido + pronto;
  const kgTotal = fermentaveis.reduce((s, f) => s + num(f.quantidade_kg), 0);

  const og = sgDeAcucar(acucarTotal, posFervura);
  const pontosNaoFerm = naoFermentavel > 0 ? pontos(sgDeAcucar(naoFermentavel, posFervura)) : 0;

  // FG: a levedura de MAIOR atenuação manda; com levedura sem atenuação, 75%.
  let atenuacao = 0;
  for (const y of leveduras) atenuacao = Math.max(atenuacao, num(y.atenuacao_pct));
  if (leveduras.length > 0 && atenuacao <= 0) atenuacao = ATENUACAO_PADRAO_PCT;
  const pontosFg = (pontos(og) - pontosNaoFerm) * (1 - atenuacao / 100) + pontosNaoFerm;
  const fg = sgDePontos(pontosFg);
  const alcool = abv(og, fg);

  // Gravidade na panela: o volume cai com a evaporação; em t minutos antes do fim = pós-fervura + evaporação × t.
  const sgNaPanela = (minAntesDoFim) => sgDeAcucar(naPanela, posFervura + evaporacao * (minAntesDoFim / 60));
  const sgMediaNaPanela = (minutos) => {
    if (!(minutos > 0)) return sgNaPanela(0);
    const passos = 20;
    let soma = 0;
    for (let i = 0; i <= passos; i++) soma += sgNaPanela((minutos * i) / passos) * (i === 0 || i === passos ? 0.5 : 1);
    return soma / passos;
  };
  const sgPreFervura = sgNaPanela(fervuraMin);

  // IBU (Tinseth). Whirlpool: Tinseth pelos minutos do whirlpool, na gravidade do fim da fervura, × velocidade
  // de isomerização na temperatura (Malowicz; sem temperatura = 80 °C). Os lúpulos da fervura continuam na panela
  // durante o whirlpool: ganham a utilização de Tinseth entre t e t + whirlpool, × o mesmo fator. Whirlpool da
  // receita = o mais longo; temperatura = média ponderada pelos gramas. Dry hop, mostura e envase = 0.
  const tempWhirlpool = (h) => num(h.temperatura_c, TEMPERATURA_WHIRLPOOL_PADRAO_C) || TEMPERATURA_WHIRLPOOL_PADRAO_C;
  const whirlpools = lupulos.filter((h) => h.etapa === "WHIRLPOOL" && num(h.tempo_min) > 0);
  const minWhirlpool = whirlpools.reduce((m, h) => Math.max(m, num(h.tempo_min)), 0);
  const gramasWhirlpool = whirlpools.reduce((s, h) => s + num(h.quantidade_g), 0);
  const fatorWhirlpool = gramasWhirlpool > 0
    ? fatorIsomerizacao(whirlpools.reduce((s, h) => s + tempWhirlpool(h) * num(h.quantidade_g), 0) / gramasWhirlpool)
    : 0;
  const sgFimFervura = sgNaPanela(0);
  const ibuPorItem = lupulos.map((h) => {
    let minutos = 0;
    let ajuste = 1;
    let sgMosto = null;
    if (h.etapa === "FERVURA") minutos = Math.min(num(h.tempo_min), fervuraMin || num(h.tempo_min));
    else if (h.etapa === "PRIMEIRO_MOSTO") { minutos = fervuraMin; ajuste = AJUSTE_PRIMEIRO_MOSTO; }
    else if (h.etapa === "WHIRLPOOL") {
      minutos = num(h.tempo_min);
      ajuste = fatorIsomerizacao(tempWhirlpool(h));
      sgMosto = sgFimFervura;
    }
    const lup = { alfaPct: num(h.alfa_pct), gramas: num(h.quantidade_g), litros: lote };
    let ibu = minutos > 0 ? ajuste * ibuTinseth({ ...lup, minutos, sgMosto: sgMosto ?? sgMediaNaPanela(minutos) }) : 0;
    if ((h.etapa === "FERVURA" || h.etapa === "PRIMEIRO_MOSTO") && minWhirlpool > 0) {
      ibu += fatorWhirlpool * (ibuTinseth({ ...lup, minutos: minutos + minWhirlpool, sgMosto: sgFimFervura })
        - ibuTinseth({ ...lup, minutos, sgMosto: sgFimFervura }));
    }
    return { ibu, g_l: lote > 0 ? num(h.quantidade_g) / lote : 0 };
  });
  const ibu = ibuPorItem.reduce((s, x) => s + x.ibu, 0);

  // Cor (Morey): MCU = Σ lb × °L ÷ galão, no volume pós-fervura.
  let mcu = 0;
  if (posFervura > 0) {
    for (const f of fermentaveis) {
      mcu += (num(f.quantidade_kg) * KG_PARA_LB * lovibondDeSrm(num(f.cor_srm))) / (posFervura * L_PARA_GAL);
    }
  }
  const corSrm = srmMorey(mcu);

  // Água: grão na mostura absorve; mostura = kg de grão × relação água/grão; o resto é lavagem.
  const graosKg = fermentaveis
    .filter((f) => f.etapa === "MOSTURA" && !ACUCAR_PRONTO.has(f.tipo))
    .reduce((s, f) => s + num(f.quantidade_kg), 0);
  const absorcao = graosKg * num(r.absorcao_grao_l_kg, 1);
  const aguaTotal = preFervura + absorcao + (graosKg > 0 ? num(r.perda_tina_l) : 0);
  const aguaMostura = Math.min(aguaTotal, graosKg * num(r.relacao_agua_grao_l_kg, 3));
  // Temperatura da água da mostura: para chegar ao 1º passo da mostura com o grão na temperatura informada.
  const primeiroPasso = (r.mostura ?? []).find((m) => Number.isFinite(Number(m.temperatura_c)) && m.temperatura_c !== null);
  const tempAguaMostura = graosKg > 0 && primeiroPasso
    ? temperaturaAguaMostura({ graoC: num(r.temp_grao_c, 20), alvoC: num(primeiroPasso.temperatura_c), litrosPorKg: aguaMostura / graosKg })
    : null;
  // Água do dia: origem (cópia na receita) + diluição + sais, na água total; cada sal dividido entre mostura e lavagem
  // na proporção dos volumes.
  const temAgua = r.agua_origem || (r.sais ?? []).length;
  const agua = temAgua
    ? {
        ...perfilAgua({ origem: r.agua_origem ?? {}, diluicaoPct: r.agua_diluicao_pct, sais: r.sais ?? [], litros: aguaTotal }),
        sais: (r.sais ?? []).map((x) => ({ ...x, mostura_g: aguaTotal > 0 ? (num(x.gramas) * aguaMostura) / aguaTotal : 0, lavagem_g: aguaTotal > 0 ? (num(x.gramas) * (aguaTotal - aguaMostura)) / aguaTotal : 0 })),
        litros: aguaTotal,
      }
    : null;
  // Priming do lote: volume real (ou o planejado); temperatura = a maior da fermentação (sem passos: 20 °C).
  const tempsFerm = (r.fermentacao ?? []).flatMap((f) => [f.temperatura_c, f.temperatura_fim_c]).filter((t) => t !== null && t !== undefined && t !== "").map(Number);
  const tempMaxFerm = tempsFerm.length ? Math.max(...tempsFerm) : 20;
  const priming = num(r.co2_alvo_vol) > 0
    ? { ...primingGramas({ litros: num(r.volume_final_l) || lote, co2Alvo: num(r.co2_alvo_vol), temperaturaMaxC: tempMaxFerm, acucar: r.priming_acucar || "SACAROSE" }),
        temperatura_max_c: tempMaxFerm, litros: num(r.volume_final_l) || lote, acucar: r.priming_acucar || "SACAROSE" }
    : null;

  // O que aconteceu no lote (receita = lote): OG/FG medidas e volume real no fermentador.
  // Eficiência real: açúcar que a OG medida representa no volume real pós-fervura (volume final + perda na panela),
  // menos o açúcar pronto (extrato, açúcar...), dividido pelo açúcar que o grão podia dar (sem a eficiência).
  function medido() {
    const ogM = num(r.og_medida, null);
    const fgM = num(r.fg_medida, null);
    const volM = num(r.volume_final_l, null);
    const m = { og: ogM, fg: fgM, volume_final_l: volM, eficiencia_pct: null, abv_pct: null, atenuacao_pct: null };
    if (ogM > 1 && eficiencia > 0 && doAmido > 0) {
      const amidoPossivel = doAmido / eficiencia;
      const realAmido = acucarDeSg(ogM, (volM ?? lote) + perdaPanela) - pronto;
      m.eficiencia_pct = Math.max(0, (realAmido / amidoPossivel) * 100);
    }
    if (ogM > 1 && fgM > 0 && fgM <= ogM) {
      m.abv_pct = abv(ogM, fgM).abv_pct;
      m.atenuacao_pct = ((ogM - fgM) / (ogM - 1)) * 100;
    }
    return m;
  }

  return {
    og,
    fg,
    abv_pct: alcool.abv_pct,
    abv_metodo: alcool.metodo,
    atenuacao_pct: atenuacao,
    ibu,
    cor_srm: corSrm,
    cor_ebc: ebcDeSrm(corSrm),
    bu_gu: pontos(og) > 0 ? ibu / pontos(og) : 0,
    sg_pre_fervura: sgPreFervura,
    volumes: {
      pre_fervura_l: preFervura,
      pos_fervura_l: posFervura,
      lote_l: lote,
      graos_kg: graosKg,
      fermentaveis_kg: kgTotal,
      absorcao_l: absorcao,
      agua_total_l: aguaTotal,
      agua_mostura_l: aguaMostura,
      temperatura_agua_mostura_c: tempAguaMostura,
      agua_lavagem_l: aguaTotal - aguaMostura,
    },
    // Por item: % do peso do grist, % do açúcar e a parte da OG que vem dele (pontos da OG × fração do açúcar).
    fermentaveis: porItem.map((x, i) => {
      const fracao = acucarTotal > 0 ? x.acucar_kg / acucarTotal : 0;
      return {
        ...x,
        pct_peso: kgTotal > 0 ? (num(fermentaveis[i].quantidade_kg) / kgTotal) * 100 : 0,
        pct_acucar: fracao * 100,
        pontos_og: fracao * pontos(og),
        indice: i,
      };
    }),
    lupulos: ibuPorItem,
    medido: medido(),
    priming,
    agua,
    avisos: [
      ...(leveduras.length === 0 && fermentaveis.length > 0 ? ["SEM_LEVEDURA"] : []),
      ...(lote <= 0 ? ["SEM_VOLUME"] : []),
    ],
  };
}

/** Confere a receita com as faixas do estilo: para cada indicador, ABAIXO | DENTRO | ACIMA | null (sem faixa). */
export function compararComEstilo(res, e) {
  if (!e) return null;
  const faixa = (v, min, max) => {
    if (min == null && max == null) return null;
    if (min != null && v < Number(min)) return "ABAIXO";
    if (max != null && v > Number(max)) return "ACIMA";
    return "DENTRO";
  };
  return {
    og: faixa(res.og, e.og_min, e.og_max),
    fg: faixa(res.fg, e.fg_min, e.fg_max),
    ibu: faixa(res.ibu, e.ibu_min, e.ibu_max),
    cor_srm: faixa(res.cor_srm, e.cor_srm_min, e.cor_srm_max),
    abv_pct: faixa(res.abv_pct, e.abv_min_pct, e.abv_max_pct),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Ajustes automáticos (E3): chegar a uma OG ou a um IBU. Item com `travado: true` não muda.
// ---------------------------------------------------------------------------------------------------------------
/** Etapas de lúpulo que entram no IBU (Tinseth). */
export const ETAPAS_IBU = new Set(["FERVURA", "PRIMEIRO_MOSTO"]);

const comQuantidades = (r, chave, campo, fn) => ({ ...r, [chave]: (r[chave] ?? []).map((x, i) => ({ ...x, [campo]: fn(x, i) })) });
const arredonda = (v, casas) => Number(v.toFixed(casas));

/**
 * Escala os fermentáveis destravados (com quantidade > 0) pelo MESMO fator até a OG chegar ao alvo.
 * A OG cresce com o fator (função monótona): busca por bisseção. Quantidades arredondadas ao grama.
 * Devolve { ok: true, quantidades, fator, og } ou { ok: false, motivo: SEM_LIVRES | TRAVADOS_PASSAM | INALCANCAVEL }.
 */
export function ajustarParaOG(r, alvo) {
  const fs = r.fermentaveis ?? [];
  const livre = fs.map((f) => !f.travado && num(f.quantidade_kg) > 0);
  if (!livre.some(Boolean)) return { ok: false, motivo: "SEM_LIVRES" };
  const ogCom = (fator) => calcularReceita(comQuantidades(r, "fermentaveis", "quantidade_kg", (f, i) => (livre[i] ? num(f.quantidade_kg) * fator : num(f.quantidade_kg)))).og;
  if (ogCom(0) >= alvo) return { ok: false, motivo: "TRAVADOS_PASSAM" };
  let hi = 1;
  while (ogCom(hi) < alvo && hi < 1024) hi *= 2;
  if (ogCom(hi) < alvo) return { ok: false, motivo: "INALCANCAVEL" };
  let lo = 0;
  for (let k = 0; k < 60; k++) {
    const meio = (lo + hi) / 2;
    if (ogCom(meio) < alvo) lo = meio;
    else hi = meio;
  }
  const fator = (lo + hi) / 2;
  const quantidades = fs.map((f, i) => (livre[i] ? arredonda(num(f.quantidade_kg) * fator, 3) : f.quantidade_kg ?? null));
  const og = calcularReceita(comQuantidades(r, "fermentaveis", "quantidade_kg", (f, i) => quantidades[i])).og;
  return { ok: true, quantidades, fator, og };
}

/** Lúpulos que podem ser ajustados para o IBU: destravados, na fervura (tempo > 0) ou no primeiro mosto. */
export function lupulosAjustaveis(r) {
  const fervura = num(r.fervura_min);
  return (r.lupulos ?? [])
    .map((h, i) => ({ i, minutos: h.etapa === "PRIMEIRO_MOSTO" ? fervura : num(h.tempo_min) }))
    .filter(({ i, minutos }) => !r.lupulos[i].travado && ETAPAS_IBU.has(r.lupulos[i].etapa) && minutos > 0)
    .sort((a, b) => b.minutos - a.minutos);           // o de amargor (mais tempo) primeiro
}

/**
 * Muda só UM lúpulo (o de amargor = mais tempo, ou o `indice` escolhido) até o IBU total chegar ao alvo.
 * IBU é proporcional aos gramas (a gravidade não depende do lúpulo): regra de três. Gramas com 1 casa.
 * Devolve { ok: true, indice, gramas, ibu } ou { ok: false, motivo: SEM_AMARGOR | SEM_EFEITO | OUTROS_PASSAM, ibuOutros }.
 */
export function ajustarParaIBU(r, alvo, indice) {
  const ajustaveis = lupulosAjustaveis(r);
  if (!ajustaveis.length) return { ok: false, motivo: "SEM_AMARGOR" };
  const i = ajustaveis.some((a) => a.i === indice) ? indice : ajustaveis[0].i;
  // IBU é linear nos gramas DESTE lúpulo com os outros fixos (inclusive a parte que ele ganha no whirlpool):
  // mede com 0 g e com 1 g.
  const ibuCom = (g) => calcularReceita(comQuantidades(r, "lupulos", "quantidade_g", (h, j) => (j === i ? g : num(h.quantidade_g)))).ibu;
  const ibuOutros = ibuCom(0);
  const porGrama = ibuCom(1) - ibuOutros;
  if (!(porGrama > 0)) return { ok: false, motivo: "SEM_EFEITO", indice: i, ibuOutros };
  const gramas = (alvo - ibuOutros) / porGrama;
  if (gramas < 0) return { ok: false, motivo: "OUTROS_PASSAM", indice: i, ibuOutros };
  const g = arredonda(gramas, 1);
  const ibu = calcularReceita(comQuantidades(r, "lupulos", "quantidade_g", (h, j) => (j === i ? g : num(h.quantidade_g)))).ibu;
  return { ok: true, indice: i, gramas: g, ibu };
}

/**
 * Régua do estilo (barra vital): onde o valor cai em relação à faixa do estilo.
 * O eixo vai da faixa menos `folga` × largura até a faixa mais `folga` × largura (para ver o quanto está fora).
 * Estado: ABAIXO | PERTO_MIN | DENTRO | PERTO_MAX | ACIMA; "perto" = dentro, a menos de `perto` × largura da borda.
 * Arredondar o valor na precisão da tela ANTES (1,0439 aparece 1,044 e não deve sair "abaixo" de 1,044).
 * Sem mínimo E máximo, devolve null (sem régua).
 */
export function reguaDoEstilo(valor, min, max, { folga = 0.25, perto = 0.1 } = {}) {
  if (min === null || min === undefined || max === null || max === undefined || !Number.isFinite(Number(valor))) return null;
  const a = Math.min(Number(min), Number(max));
  const b = Math.max(Number(min), Number(max));
  const v = Number(valor);
  const largura = b - a > 0 ? b - a : Math.abs(a) * 0.1 || 1;
  const eixoIni = a - folga * largura;
  const eixoFim = b + folga * largura;
  const pos = (x) => Math.min(1, Math.max(0, (x - eixoIni) / (eixoFim - eixoIni)));
  let estado = "DENTRO";
  if (v < a) estado = "ABAIXO";
  else if (v > b) estado = "ACIMA";
  else if (b > a && v - a < perto * largura) estado = "PERTO_MIN";
  else if (b > a && b - v < perto * largura) estado = "PERTO_MAX";
  return { estado, pos: pos(v), ini: pos(a), fim: pos(b), eixo: [eixoIni, eixoFim], foraDoEixo: v < eixoIni || v > eixoFim };
}

/** Cor aproximada para a tela (#rrggbb) a partir do SRM, por interpolação numa escala de referência. */
export function corHexDeSrm(srm) {
  const escala = [
    [0, [255, 245, 200]], [2, [248, 227, 120]], [4, [234, 189, 60]], [6, [222, 155, 30]], [9, [198, 120, 20]],
    [12, [172, 90, 15]], [16, [140, 62, 12]], [20, [110, 42, 10]], [26, [80, 28, 8]], [35, [50, 18, 6]], [40, [30, 10, 4]],
  ];
  const s = Math.max(0, Math.min(40, num(srm)));
  let i = escala.findIndex(([v]) => v >= s);
  if (i <= 0) i = 1;
  const [v0, c0] = escala[i - 1];
  const [v1, c1] = escala[i];
  const t = v1 > v0 ? (s - v0) / (v1 - v0) : 0;
  const hex = c0.map((c, k) => Math.round(c + (c1[k] - c) * t).toString(16).padStart(2, "0")).join("");
  return `#${hex}`;
}
