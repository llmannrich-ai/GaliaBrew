// ferramentas.js — calculadoras avulsas: água da mostura e priming (mesmas fórmulas do calculos.js).
import { el, preencher, numeroBR, campoNumero, campoSelect, info } from "./ui.js?v=20261124c";
import { FAIXAS, FAIXAS_LUGAR as F } from "./faixas.js?v=20261124c";
import { temperaturaAguaMostura, primingGramas, sgDeBrix, refratometro, corrigirDensimetro, platoDeSg, FATOR_REFRATOMETRO_PADRAO } from "./calculos.js?v=20261124c";
import { preferencias, salvarPreferencias } from "./estado.js?v=20261124c";
import * as O from "./opcoes.js?v=20261124c";

// Volume que o grão ocupa na tina (L por kg), para saber se a mostura cabe.
const VOLUME_GRAO_L_KG = 0.67;

// Os valores ficam enquanto o portal estiver aberto (trocar de tela e voltar não apaga).
const agua = { graos_kg: 5, relacao: 3, grao_c: 20, alvo_c: 66 };
const prim = { litros: 20, co2: 2.4, temp_c: 20, acucar: "SACAROSE" };
// Fator do refratômetro e calibração do densímetro são do aparelho: ficam salvos neste navegador.
const refr = { brix_ini: 12, brix_fim: null, get fator() { return preferencias.fator_refratometro ?? FATOR_REFRATOMETRO_PADRAO; },
  set fator(v) { preferencias.fator_refratometro = v; salvarPreferencias(); } };
const dens = { sg: 1.050, temp_c: 25, get calibracao_c() { return preferencias.calibracao_densimetro_c ?? 20; },
  set calibracao_c(v) { preferencias.calibracao_densimetro_c = v; salvarPreferencias(); } };
const descobrir = { sg: null, brix: null };
// Densidade: aceita 1,050, 1050 e 50 (pontos).
const sg = { de: (x) => x, para: (v) => (v >= 900 ? v / 1000 : v > 2 && v < 200 ? 1 + v / 1000 : v) };

export function telaFerramentas(conteudo) {
  preencher(conteudo,
    el("div", { class: "titulo-linha" }, el("h2", { text: "Ferramentas" })),
    el("div", { class: "ferramentas" }, cartaoAgua(), cartaoPriming(), cartaoRefratometro(), cartaoDensimetro()));
}

const campo = (obj, k, rot, casas, ajuda, aoMudar, extra = {}) =>
  el("label", {}, el("span", {}, rot, info(ajuda)), campoNumero(obj, k, { casas, aoMudar, rotulo: rot, ...extra }));

function cartaoAgua() {
  const saida = el("div", { class: "resultado-ferramenta", "aria-live": "polite" });
  const calcular = () => {
    const litros = agua.graos_kg > 0 && agua.relacao > 0 ? agua.graos_kg * agua.relacao : null;
    const t = temperaturaAguaMostura({ graoC: agua.grao_c, alvoC: agua.alvo_c, litrosPorKg: agua.relacao });
    if (litros == null || t == null) { preencher(saida, el("p", { class: "nota", text: "Preencha grãos, água/grão e as temperaturas." })); return; }
    preencher(saida,
      linha("Água da mostura", `${numeroBR(litros, 1)} L`),
      linha("Temperatura da água", `${numeroBR(t, 1)} °C`),
      linha("Volume da mostura na tina", `${numeroBR(litros + agua.graos_kg * VOLUME_GRAO_L_KG, 1)} L`));
  };
  const s = el("section", { class: "cartao" },
    el("h3", { text: "Água da mostura" }),
    el("p", { class: "nota", text: "Quanta água e em que temperatura colocar para o grão + água ficar na temperatura da parada." }),
    el("div", { class: "grade-form" },
      campo(agua, "graos_kg", "Grãos (kg)", 2, null, calcular, { roleta: F.graos_kg }),
      campo(agua, "relacao", "Água/grão (L/kg)", 1, O.AJUDA_VOLUME.relacao_agua_grao_l_kg, calcular, { roleta: FAIXAS.relacao_agua_grao_l_kg }),
      campo(agua, "grao_c", "Temperatura do grão (°C)", 1, "Normalmente a temperatura ambiente.", calcular, { roleta: F.temp_ambiente }),
      campo(agua, "alvo_c", "Temperatura da parada (°C)", 1, "A temperatura que a mostura deve atingir (ex.: 66 °C na sacarificação).", calcular, { roleta: F.temp_mostura })),
    saida,
    el("p", { class: "nota", text: "Não conta o calor que a tina absorve: pré-aqueça a tina ou some 1 a 2 °C. Volume da mostura = água + 0,67 L por kg de grão." }));
  calcular();
  return s;
}

function cartaoPriming() {
  const saida = el("div", { class: "resultado-ferramenta", "aria-live": "polite" });
  const calcular = () => {
    const p = primingGramas({ litros: prim.litros, co2Alvo: prim.co2, temperaturaMaxC: prim.temp_c, acucar: prim.acucar });
    if (!p) { preencher(saida, el("p", { class: "nota", text: "Preencha volume, CO₂ desejado e temperatura." })); return; }
    preencher(saida,
      linha(`${O.rotulo(O.ACUCAR_PRIMING, prim.acucar)}`, `${numeroBR(p.gramas, 0)} g`),
      linha("Por litro", `${numeroBR(p.g_por_litro, 2)} g/L`),
      linha("CO₂ que a cerveja já tem", `${numeroBR(p.co2_residual, 2)} vol`),
      p.gramas === 0 ? el("p", { class: "nota alerta", text: "A cerveja já tem esse CO₂: não precisa de priming." }) : null);
  };
  const s = el("section", { class: "cartao" },
    el("h3", { text: "Priming" }),
    el("p", { class: "nota", text: "Açúcar para carbonatar na garrafa ou no barril." }),
    el("div", { class: "grade-form" },
      campo(prim, "litros", "Cerveja a envasar (L)", 1, null, calcular, { roleta: F.litros }),
      campo(prim, "co2", "CO₂ desejado (vol)", 1, O.AJUDA_VOLUME.co2_alvo_vol, calcular, { roleta: { ...FAIXAS.co2_alvo_vol, vazio: undefined } }),
      campo(prim, "temp_c", "Maior temperatura da fermentação (°C)", 1, O.AJUDA_VOLUME.temperatura_max_ferm, calcular, { roleta: F.temp_fermentacao }),
      el("label", {}, el("span", { text: "Açúcar" }), campoSelect(prim, "acucar", O.ACUCAR_PRIMING, { aoMudar: calcular, rotulo: "Açúcar" }))),
    saida,
    el("details", {}, el("summary", { text: "CO₂ típico por estilo" }),
      el("table", { class: "tabela" }, el("tbody", {}, O.CO2_TIPICO.map(([e, v]) => el("tr", {}, el("td", { text: e }), el("td", { class: "num", text: v })))))));
  calcular();
  return s;
}

const linha = (rot, valor) => el("div", { class: "metrica" }, el("span", { class: "rot", text: rot }), el("span", { class: "val", text: valor }));

function cartaoRefratometro() {
  const saida = el("div", { class: "resultado-ferramenta", "aria-live": "polite" });
  const saidaFator = el("div", { class: "resultado-ferramenta", "aria-live": "polite" });
  const calcular = () => {
    if (!(refr.fator > 0) || !(refr.brix_ini > 0)) { preencher(saida, el("p", { class: "nota", text: "Preencha o °Brix do mosto e o fator." })); return; }
    const og = sgDeBrix(refr.brix_ini, refr.fator);
    if (refr.brix_fim == null) {
      preencher(saida, linha("Densidade do mosto (OG)", numeroBR(og, 3)),
        el("p", { class: "nota", text: "Com a cerveja já fermentando, preencha também o °Brix atual: o álcool muda a leitura." }));
      return;
    }
    const r = refratometro({ brixInicial: refr.brix_ini, brixFinal: refr.brix_fim, fator: refr.fator });
    preencher(saida,
      linha("OG", numeroBR(r.og, 3)),
      linha("FG (densidade atual)", numeroBR(r.fg, 3)),
      r.abv_pct != null ? linha("ABV", `${numeroBR(r.abv_pct, 1)}%`) : null,
      r.atenuacao_pct != null ? linha("Atenuação aparente", `${numeroBR(r.atenuacao_pct, 0)}%`) : null,
      r.fg > r.og ? el("p", { class: "nota alerta", text: "O °Brix atual parece alto demais para essa leitura inicial." }) : null);
  };
  const calcularFator = () => {
    if (!(descobrir.sg > 1) || !(descobrir.brix > 0)) { preencher(saidaFator, el("p", { class: "nota", text: "Meça o mesmo mosto (antes de fermentar) com os dois aparelhos." })); return; }
    const f = descobrir.brix / platoDeSg(descobrir.sg);
    preencher(saidaFator, linha("Fator do seu refratômetro", numeroBR(f, 3)),
      el("button", { type: "button", class: "secundario pequeno", text: "Usar este fator", on: { click: () => { refr.fator = Number(f.toFixed(3)); campoFator.value = numeroBR(refr.fator, 3); calcular(); } } }));
  };
  const campoFator = campoNumero(refr, "fator", { casas: 3, aoMudar: calcular, rotulo: "Fator do refratômetro", roleta: F.fator_refratometro });
  const s = el("section", { class: "cartao" },
    el("h3", { text: "Refratômetro" }),
    el("p", { class: "nota", text: "Converte °Brix em densidade. Com a cerveja fermentando, corrige o efeito do álcool (equação de Terrill)." }),
    el("div", { class: "grade-form" },
      campo(refr, "brix_ini", "°Brix do mosto (antes de fermentar)", 1, null, calcular, { roleta: F.brix }),
      campo(refr, "brix_fim", "°Brix atual (fermentando)", 1, "Deixe em branco se a cerveja ainda não fermentou.", calcular, { roleta: { ...F.brix, inicial: () => (Number(refr.brix_ini) > 0 ? Number((refr.brix_ini / 2).toFixed(1)) : 6), vazio: "Ainda não fermentou" } }),
      el("label", {}, el("span", {}, "Fator do refratômetro", info("O mosto lê um pouco acima de açúcar puro. 1,04 é o valor comum; o seu fica salvo neste navegador.")), campoFator)),
    saida,
    el("details", {}, el("summary", { text: "Descobrir o fator do meu refratômetro" }),
      el("div", { class: "grade-form" },
        campo(descobrir, "sg", "Densímetro (mosto)", 3, null, calcularFator, { placeholder: "1,050", ...sg, roleta: F.sg }),
        campo(descobrir, "brix", "Refratômetro (°Brix)", 1, null, calcularFator, { roleta: F.brix })),
      saidaFator));
  calcular();
  calcularFator();
  return s;
}

function cartaoDensimetro() {
  const saida = el("div", { class: "resultado-ferramenta", "aria-live": "polite" });
  const calcular = () => {
    const c = corrigirDensimetro({ sg: dens.sg, tempC: dens.temp_c, calibracaoC: dens.calibracao_c });
    if (c == null || !(dens.sg > 0.98)) { preencher(saida, el("p", { class: "nota", text: "Preencha a leitura e as temperaturas." })); return; }
    preencher(saida, linha("Densidade corrigida", numeroBR(c, 3)), linha("Diferença", `${c >= dens.sg ? "+" : ""}${numeroBR((c - dens.sg) * 1000, 1)} pontos`));
  };
  const s = el("section", { class: "cartao" },
    el("h3", { text: "Densímetro" }),
    el("p", { class: "nota", text: "Corrige a leitura de uma amostra fora da temperatura de calibração do densímetro." }),
    el("div", { class: "grade-form" },
      campo(dens, "sg", "Leitura", 3, null, calcular, { placeholder: "1,050", ...sg, roleta: F.sg }),
      campo(dens, "temp_c", "Temperatura da amostra (°C)", 1, null, calcular, { roleta: F.temp_amostra }),
      campo(dens, "calibracao_c", "Calibração do densímetro (°C)", 1, "Vem escrita no densímetro: normalmente 20 °C (ou 15,6 °C = 60 °F). Fica salva neste navegador.", calcular, { roleta: { ...F.temp_amostra, passo: 0.1, partes: true } })),
    saida,
    el("p", { class: "nota", text: "Acima de uns 40 °C a correção perde precisão: melhor esfriar a amostra." }));
  calcular();
  return s;
}
