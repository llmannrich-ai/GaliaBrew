// relatorio.js — relatório da receita em PDF: monta as páginas (A4), mostra no visualizador próprio (janela) e
// exporta o arquivo para a folha de compartilhamento do celular. O visualizador desenha em SVG os mesmos itens que o
// pdf.js escreve no arquivo: o que aparece na tela é o que vai no PDF.
import { el, svg, numeroBR, avisar } from "./ui.js?v=20261127c";
import { A4, gerarPdf, limparTexto, larguraTexto, quebrarTexto, encurtarTexto } from "./pdf.js?v=20261127c";
import { IONS, corHexDeSrm, platoDeSg, etapaSal, leituraSulfatoCloreto, TEMPERATURA_WHIRLPOOL_PADRAO_C } from "./calculos.js?v=20261127c";
import * as O from "./opcoes.js?v=20261127c";
import { icone } from "./icones.js?v=20261127c";

// Documento sempre claro (é para imprimir e mandar), nas cores do tema Clássico.
const COR = { tinta: "#1a130d", suave: "#4d4237", cobre: "#a14f17", linha: "#ddd1bf", painel: "#f3ece0", branco: "#ffffff" };
const MARGEM = 40;
const LARGURA = A4.largura - 2 * MARGEM;
const FIM = A4.altura - 50;            // abaixo disto fica o rodapé

const n = (v, casas) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? "—" : numeroBR(Number(v), casas));
const comUnidade = (v, casas, un) => (n(v, casas) === "—" ? "—" : `${n(v, casas)} ${un}`);
const dataDoDia = (d) => (d ? String(d).split("-").reverse().join("/") : "");

/** Escritor de páginas: guarda a posição (y) e abre página nova quando o bloco não cabe. */
function criarDocumento() {
  const paginas = [];
  let itens;
  const d = {
    paginas,
    y: 0,
    novaPagina() { itens = []; paginas.push({ ...A4, itens }); d.y = MARGEM; },
    garantir(altura) { if (d.y + altura > FIM) { d.novaPagina(); return true; } return false; },
    texto(x, y, txt, { tam = 9.5, negrito = false, cor = COR.tinta, alinh = "inicio" } = {}) {
      const limpo = limparTexto(txt);
      if (limpo) itens.push({ tipo: "texto", x, y, txt: limpo, tam, negrito, cor, alinh });
    },
    ret(x, y, l, a, cor) { itens.push({ tipo: "ret", x, y, l, a, cor }); },
    linha(x1, y1, x2, y2, cor = COR.linha, esp = 0.5) { itens.push({ tipo: "linha", x1, y1, x2, y2, cor, esp }); },

    /** Título de seção: faixa creme com traço cobre (como na tela). `minimo` = espaço que o começo da seção pede. */
    secao(titulo, minimo = 60) {
      d.y += 8;
      d.garantir(22 + minimo);
      d.ret(MARGEM, d.y, LARGURA, 18, COR.painel);
      d.ret(MARGEM, d.y, 3, 18, COR.cobre);
      d.texto(MARGEM + 10, d.y + 12.6, titulo, { tam: 10.5, negrito: true });
      d.y += 24;
    },

    /** Pares rótulo/valor em colunas. */
    pares(lista, colunas = 4) {
      const itensValidos = lista.filter(Boolean);
      const larg = LARGURA / colunas;
      for (let i = 0; i < itensValidos.length; i += colunas) {
        d.garantir(30);
        itensValidos.slice(i, i + colunas).forEach(([rot, val], j) => {
          const x = MARGEM + j * larg;
          d.texto(x, d.y + 8, encurtarTexto(rot, 7.5, larg - 8), { tam: 7.5, cor: COR.suave });
          d.texto(x, d.y + 21, encurtarTexto(val || "—", 10.5, larg - 8, true), { tam: 10.5, negrito: true });
        });
        d.y += 30;
      }
    },

    /**
     * Tabela. colunas: [{ rot, l (pontos), alinh: "fim" para número }]; a 1ª coluna quebra linha, as outras encurtam.
     * linhas: listas de textos. O cabeçalho se repete quando a tabela passa de página.
     */
    tabela(colunas, linhas, { rodape = null } = {}) {
      const TAM = 9.5, ENTRE = 11.5, FOLGA = 4;
      const xs = [];
      colunas.reduce((x, c) => { xs.push(x); return x + c.l; }, MARGEM);
      const celula = (i, y, txt, opcoes) => {
        const c = colunas[i];
        d.texto(c.alinh === "fim" ? xs[i] + c.l - FOLGA : xs[i] + (i ? FOLGA : 0), y, txt, { ...opcoes, alinh: c.alinh === "fim" ? "fim" : "inicio" });
      };
      const cabecalho = () => {
        colunas.forEach((c, i) => celula(i, d.y + 8, c.rot, { tam: 7.5, cor: COR.suave }));
        d.y += 12;
        d.linha(MARGEM, d.y, MARGEM + LARGURA, d.y, COR.suave, 0.6);
      };
      // Tabela curta que não cabe no resto da página vai inteira para a seguinte (não fica uma linha só para trás).
      const estimada = 12 + (linhas.length + (rodape ? 1 : 0)) * (ENTRE + 5) + 4;
      d.garantir(estimada <= 320 ? estimada : 12 + 20);
      cabecalho();
      const escrever = (valores, negrito) => {
        const primeira = quebrarTexto(valores[0] ?? "", TAM, colunas[0].l - FOLGA, negrito);
        const altura = primeira.length * ENTRE + 5;
        if (d.garantir(altura)) cabecalho();
        primeira.forEach((t, k) => d.texto(xs[0], d.y + 10.5 + k * ENTRE, t, { tam: TAM, negrito }));
        for (let i = 1; i < colunas.length; i++) {
          celula(i, d.y + 10.5, encurtarTexto(valores[i] ?? "", TAM, colunas[i].l - 2 * FOLGA, negrito), { tam: TAM, negrito });
        }
        d.y += altura;
        d.linha(MARGEM, d.y, MARGEM + LARGURA, d.y);
      };
      for (const l of linhas) escrever(l, false);
      if (rodape) escrever(rodape, true);
      d.y += 4;
    },

    /** Texto corrido com quebra de linha (respeita as linhas em branco do usuário). */
    paragrafo(txt, { tam = 9.5, cor = COR.tinta, entre = 12.5 } = {}) {
      for (const l of quebrarTexto(txt, tam, LARGURA)) {
        if (!l) { d.y += entre / 2; continue; }
        d.garantir(entre);
        d.texto(MARGEM, d.y + tam, l, { tam, cor });
        d.y += entre;
      }
      d.y += 2;
    },
  };
  d.novaPagina();
  return d;
}

/**
 * Páginas do relatório da receita `r` (como está na tela, salvo ou não) com os resultados `res` do calculos.js.
 * ctx: { estilo, equipamento, agora }.
 */
export function montarRelatorio(r, res, { estilo = null, equipamento = null, agora = new Date() } = {}) {
  const d = criarDocumento();
  const nome = String(r.nome ?? "").trim() || "Receita sem nome";
  const unCor = O.unidadeCor();
  const cor = (srm) => n(srm === null || srm === undefined ? null : O.corParaTela(Number(srm)), unCor === "EBC" ? 0 : 1);
  const v = res.volumes;

  // ---------- cabeçalho ----------
  d.texto(MARGEM, d.y + 7, "GALIABREW · RECEITA", { tam: 8, negrito: true, cor: COR.cobre });
  d.y += 14;
  const AMOSTRA = 40;
  const yTopo = d.y;
  for (const l of quebrarTexto(nome, 20, LARGURA - AMOSTRA - 14, true)) {
    d.texto(MARGEM, d.y + 18, l, { tam: 20, negrito: true });
    d.y += 23;
  }
  const sub = [
    r.lote_numero ? `Lote nº ${r.lote_numero}` : null,
    estilo ? `${estilo.codigo ? estilo.codigo + " " : ""}${estilo.nome}` : null,
    O.rotulo(O.TIPO_RECEITA, r.tipo),
    r.data_brassagem ? `Brassagem em ${dataDoDia(r.data_brassagem)}` : null,
    String(r.autor ?? "").trim() ? `por ${String(r.autor).trim()}` : null,
  ].filter(Boolean).join(" · ");
  for (const l of quebrarTexto(sub, 10, LARGURA - AMOSTRA - 14)) {
    d.texto(MARGEM, d.y + 11, l, { tam: 10, cor: COR.suave });
    d.y += 13;
  }
  // Amostra da cor da cerveja, à direita do nome.
  d.ret(MARGEM + LARGURA - AMOSTRA, yTopo, AMOSTRA, AMOSTRA, COR.suave);
  d.ret(MARGEM + LARGURA - AMOSTRA + 1, yTopo + 1, AMOSTRA - 2, AMOSTRA - 2, corHexDeSrm(res.cor_srm));
  d.y = Math.max(d.y, yTopo + AMOSTRA) + 7;
  d.linha(MARGEM, d.y, MARGEM + LARGURA, d.y, COR.cobre, 1.5);
  d.y += 10;

  // ---------- números ----------
  const faixa = (min, max, casas, conv = (x) => x) => (estilo && min != null && max != null ? `${n(conv(Number(min)), casas)} – ${n(conv(Number(max)), casas)}` : "");
  const casasCor = unCor === "EBC" ? 0 : 1;
  const caixas = [
    ["OG", n(res.og, 3), faixa(estilo?.og_min, estilo?.og_max, 3)],
    ["FG", n(res.fg, 3), faixa(estilo?.fg_min, estilo?.fg_max, 3)],
    ["ABV", `${n(res.abv_pct, 1)}%`, faixa(estilo?.abv_min_pct, estilo?.abv_max_pct, 1)],
    ["IBU", n(res.ibu, 0), faixa(estilo?.ibu_min, estilo?.ibu_max, 0)],
    [`COR (${unCor})`, n(O.corParaTela(res.cor_srm), 1), faixa(estilo?.cor_srm_min, estilo?.cor_srm_max, casasCor, O.corParaTela)],
    ["pH DA MOSTURA", res.ph_mostura ? n(res.ph_mostura.ph, 2) : "—", "5,2 – 5,6"],
  ];
  const VAO = 6;
  const lCaixa = (LARGURA - VAO * (caixas.length - 1)) / caixas.length;
  caixas.forEach(([rot, val, fx], i) => {
    const x = MARGEM + i * (lCaixa + VAO);
    d.ret(x, d.y, lCaixa, 46, COR.painel);
    d.texto(x + 7, d.y + 12, rot, { tam: 7, cor: COR.suave });
    d.texto(x + 7, d.y + 29, val, { tam: 15, negrito: true });
    d.texto(x + 7, d.y + 40, fx, { tam: 7, cor: COR.suave });
  });
  d.y += 52;
  d.texto(MARGEM, d.y + 8, [
    estilo ? "Abaixo de cada número: a faixa do estilo" : "Sem estilo escolhido",
    `OG ${n(platoDeSg(res.og), 1)} °P`,
    `BU/GU ${n(res.bu_gu, 2)}`,
    `Atenuação aparente ${n(res.atenuacao_pct, 0)}%`,
  ].join(" · "), { tam: 8, cor: COR.suave });
  d.y += 12;

  // ---------- ingredientes ----------
  if (r.fermentaveis.length) {
    d.secao("Fermentáveis");
    d.tabela([
      { rot: "FERMENTÁVEL", l: 205 }, { rot: "ETAPA", l: 75 }, { rot: "QTD (kg)", l: 60, alinh: "fim" }, { rot: "% DO PESO", l: 60, alinh: "fim" },
      { rot: `COR (${unCor})`, l: 55, alinh: "fim" }, { rot: "REND. %", l: 60, alinh: "fim" },
    ], r.fermentaveis.map((f, i) => [
      `${String(f.nome ?? "").trim() || "(sem nome)"}${f.tipo && f.tipo !== "GRAO" ? ` (${O.rotulo(O.TIPO_FERMENTAVEL, f.tipo)})` : ""}`,
      O.rotulo(O.ETAPA_FERMENTAVEL, f.etapa), n(f.quantidade_kg, 3), n(res.fermentaveis[i]?.pct_peso, 1), cor(f.cor_srm), n(f.rendimento_pct, 0),
    ]), { rodape: ["Total", "", n(v.fermentaveis_kg, 3), "100,0", "", ""] });
  }
  if (r.lupulos.length) {
    const quando = (h) => {
      if (h.etapa === "DRY_HOP") return h.dia != null ? `dia ${n(h.dia, 0)}` : "—";
      if (!["FERVURA", "WHIRLPOOL", "MOSTURA"].includes(h.etapa)) return "—";
      const t = h.tempo_min != null ? `${n(h.tempo_min, 0)} min` : "—";
      return h.etapa === "WHIRLPOOL" ? `${t} a ${n(h.temperatura_c ?? TEMPERATURA_WHIRLPOOL_PADRAO_C, 0)} °C` : t;
    };
    d.secao("Lúpulos");
    d.tabela([
      { rot: "LÚPULO", l: 160 }, { rot: "FORMA", l: 50 }, { rot: "ETAPA", l: 85 }, { rot: "QUANDO", l: 80 }, { rot: "ALFA %", l: 45, alinh: "fim" },
      { rot: "QTD (g)", l: 50, alinh: "fim" }, { rot: "IBU", l: 45, alinh: "fim" },
    ], r.lupulos.map((h, i) => [
      String(h.nome ?? "").trim() || "(sem nome)", O.rotulo(O.FORMA_LUPULO, h.forma), O.rotulo(O.ETAPA_LUPULO, h.etapa), quando(h), n(h.alfa_pct, 1),
      n(h.quantidade_g, 1), ["FERVURA", "PRIMEIRO_MOSTO", "WHIRLPOOL"].includes(h.etapa) ? n(res.lupulos[i]?.ibu, 1) : "—",
    ]), { rodape: ["Total", "", "", "", "", n(r.lupulos.reduce((s, h) => s + (Number(h.quantidade_g) || 0), 0), 1), n(res.ibu, 1)] });
  }
  if (r.leveduras.length) {
    d.secao("Leveduras");
    d.tabela([
      { rot: "LEVEDURA", l: 205 }, { rot: "TIPO", l: 55 }, { rot: "FORMA", l: 55 }, { rot: "ETAPA", l: 65 },
      { rot: "QUANTIDADE", l: 70, alinh: "fim" }, { rot: "ATENUAÇÃO %", l: 65, alinh: "fim" },
    ], r.leveduras.map((y) => [
      String(y.nome ?? "").trim() || "(sem nome)", O.rotulo(O.TIPO_LEVEDURA, y.tipo), O.rotulo(O.FORMA_LEVEDURA, y.forma), O.rotulo(O.ETAPA_LEVEDURA, y.etapa),
      y.quantidade != null ? `${n(y.quantidade, Number.isInteger(Number(y.quantidade)) ? 0 : 1)} ${O.rotulo(O.UNIDADE_LEVEDURA, y.unidade)}` : "—",
      n(y.atenuacao_pct, 0),
    ]));
  }
  if (r.outros.length) {
    d.secao("Outros ingredientes");
    d.tabela([
      { rot: "INGREDIENTE", l: 200 }, { rot: "TIPO", l: 85 }, { rot: "ETAPA", l: 80 }, { rot: "QUANTIDADE", l: 85, alinh: "fim" }, { rot: "TEMPO", l: 65, alinh: "fim" },
    ], r.outros.map((o) => [
      String(o.nome ?? "").trim() || "(sem nome)", O.rotulo(O.TIPO_OUTRO, o.tipo), O.rotulo(O.ETAPA_OUTRO, o.etapa),
      o.quantidade != null ? `${n(o.quantidade, 2)} ${O.rotulo(O.UNIDADE_OUTRO, o.unidade)}` : "—",
      o.tempo_min != null ? `${n(o.tempo_min, 0)} min` : "—",
    ]));
  }

  // ---------- processo ----------
  if (r.mostura.length) {
    d.secao("Mostura");
    d.tabela([{ rot: "PASSO", l: 355 }, { rot: "TEMPERATURA", l: 80, alinh: "fim" }, { rot: "TEMPO", l: 80, alinh: "fim" }],
      r.mostura.map((m, i) => [O.rotuloPasso(r.mostura, i), comUnidade(m.temperatura_c, 1, "°C"), comUnidade(m.tempo_min, 0, "min")]));
  }
  if (r.fermentacao.length) {
    d.secao("Fermentação");
    d.tabela([{ rot: "PASSO", l: 355 }, { rot: "TEMPERATURA", l: 80, alinh: "fim" }, { rot: "DIAS", l: 80, alinh: "fim" }],
      r.fermentacao.map((f) => [String(f.nome ?? "").trim() || "(sem nome)", comUnidade(f.temperatura_c, 1, "°C"), n(f.dias, 0)]));
  }

  // ---------- água ----------
  d.secao("Água e volumes", 70);
  d.pares([
    ["Água da mostura", comUnidade(v.agua_mostura_l, 1, "L")],
    ["Temperatura da água da mostura", comUnidade(v.temperatura_agua_mostura_c, 1, "°C")],
    ["Água de lavagem", comUnidade(v.agua_lavagem_l, 1, "L")],
    ["Água total", comUnidade(v.agua_total_l, 1, "L")],
    ["Pré-fervura", comUnidade(v.pre_fervura_l, 1, "L")],
    ["Pós-fervura", comUnidade(v.pos_fervura_l, 1, "L")],
    ["No fermentador", comUnidade(v.lote_l, 1, "L")],
    ["Grãos na mostura", comUnidade(v.graos_kg, 2, "kg")],
  ]);
  if ((v.agua_mostura_informada || v.agua_lavagem_informada) && Math.abs(v.agua_diferenca_l) >= 0.5) {
    d.paragrafo(`A receita precisa de ${n(v.agua_necessaria_l, 1)} L de água para chegar a ${n(v.pre_fervura_l, 1)} L na pré-fervura: ${v.agua_diferenca_l > 0 ? "sobram" : "faltam"} ${n(Math.abs(v.agua_diferenca_l), 1)} L.`, { tam: 8.5, cor: COR.suave, entre: 11 });
    d.y += 4;
  }
  const a = res.agua;
  const sais = (r.sais ?? []).filter((x) => x.sal && Number(x.gramas) > 0);
  const acidos = (r.acidos ?? []).filter((x) => x.acido && Number(x.ml) > 0);
  if (a || acidos.length) {
    const so4cl = (p) => (p?.sulfato_cloreto == null ? "—" : `${n(p.sulfato_cloreto, 2)} (${O.LEITURA_SO4_CL[leituraSulfatoCloreto(p.sulfato_cloreto)]})`);
    d.pares([
      ["Água de base", r.agua_origem?.nome ?? "—"],
      ["Perfil alvo", r.agua_alvo?.nome ?? "—"],
      acidos.length && res.ph_mostura ? ["pH da mostura sem o ácido", n(res.ph_mostura.ph_sem_acido, 2)] : null,
    ]);
    if (sais.length || acidos.length) {
      const gramas = (sal, etapa) => {
        const g = sais.filter((x) => x.sal === sal && etapaSal(x) === etapa).reduce((s, x) => s + Number(x.gramas), 0);
        return g > 0 ? n(g, 1) : "—";
      };
      d.tabela([{ rot: "SAIS E ÁCIDOS", l: 275 }, { rot: "NA MOSTURA", l: 120, alinh: "fim" }, { rot: "NA LAVAGEM", l: 120, alinh: "fim" }], [
        ...[...new Set(sais.map((x) => x.sal))].map((sal) => [O.rotulo(O.SAL_AGUA, sal), gramas(sal, "MOSTURA") === "—" ? "—" : `${gramas(sal, "MOSTURA")} g`, gramas(sal, "LAVAGEM") === "—" ? "—" : `${gramas(sal, "LAVAGEM")} g`]),
        ...acidos.map((x) => [O.rotulo(O.ACIDO, x.acido), `${n(x.ml, 1)} mL`, "—"]),
      ]);
    }
    if (a) {
      const alvo = r.agua_alvo;
      const lIon = alvo ? 75 : 90;
      d.tabela([
        { rot: "ÍON (ppm)", l: LARGURA - lIon * (alvo ? 5 : 4) }, { rot: "BASE", l: lIon, alinh: "fim" }, { rot: "MOSTURA", l: lIon, alinh: "fim" },
        { rot: "LAVAGEM", l: lIon, alinh: "fim" }, { rot: "TOTAL", l: lIon, alinh: "fim" }, alvo ? { rot: "ALVO", l: lIon, alinh: "fim" } : null,
      ].filter(Boolean), IONS.map((k) => [
        O.NOME_ION[k], n(a.base.ions[k], 0), n(a.mostura.ions[k], 0), n(a.lavagem.ions[k], 0), n(a.panela.ions[k], 0),
        ...(alvo ? [n(Number(alvo[k] ?? 0), 0)] : []),
      ]));
      d.pares([
        ["Sulfato/cloreto na mostura", so4cl(a.mostura)],
        ["Sulfato/cloreto no total", so4cl(a.panela)],
        ["Alcalinidade residual da mostura", comUnidade(a.mostura.alcalinidade_residual, 0, "ppm")],
        ["Alcalinidade residual da lavagem", comUnidade(a.lavagem.alcalinidade_residual, 0, "ppm")],
      ]);
    }
  }

  // ---------- parâmetros ----------
  d.secao("Parâmetros do equipamento", 60);
  d.pares([
    ["Equipamento", equipamento?.nome ?? "—"],
    ["Volume no fermentador", comUnidade(r.volume_lote_l, 1, "L")],
    ["Eficiência", n(r.eficiencia_pct, 0) === "—" ? "—" : `${n(r.eficiencia_pct, 0)}%`],
    ["Fervura", comUnidade(r.fervura_min, 0, "min")],
    ["Evaporação", comUnidade(r.evaporacao_l_h, 1, "L/h")],
    ["Perda na panela", comUnidade(r.perda_panela_l, 1, "L")],
    ["Perda na tina", comUnidade(r.perda_tina_l, 1, "L")],
    ["Absorção do grão", comUnidade(r.absorcao_grao_l_kg, 2, "L/kg")],
    ["Água/grão na mostura", comUnidade(v.relacao_agua_grao_l_kg ?? r.relacao_agua_grao_l_kg, 1, "L/kg")],
    ["Temperatura do grão", comUnidade(r.temp_grao_c, 1, "°C")],
  ]);

  // ---------- lote ----------
  const m = res.medido;
  const p = res.priming;
  const temLote = r.lote_numero || r.data_brassagem || m.og != null || m.fg != null || r.volume_final_l != null || p;
  if (temLote) {
    const pct = (x, casas = 0) => (x == null ? null : `${n(x, casas)}%`);
    d.secao("Brassagem (lote)", 60);
    d.pares([
      r.lote_numero ? ["Nº do lote", String(r.lote_numero)] : null,
      r.data_brassagem ? ["Data da brassagem", dataDoDia(r.data_brassagem)] : null,
      m.og != null ? ["OG medida", `${n(m.og, 3)} (prevista ${n(res.og, 3)})`] : null,
      m.fg != null ? ["FG medida", `${n(m.fg, 3)} (prevista ${n(res.fg, 3)})`] : null,
      r.volume_final_l != null ? ["Volume real no fermentador", comUnidade(r.volume_final_l, 1, "L")] : null,
      m.eficiencia_pct != null ? ["Eficiência real", pct(m.eficiencia_pct)] : null,
      m.abv_pct != null ? ["ABV real", pct(m.abv_pct, 1)] : null,
      m.atenuacao_pct != null ? ["Atenuação aparente real", pct(m.atenuacao_pct)] : null,
      r.co2_alvo_vol != null ? ["CO₂ desejado", comUnidade(r.co2_alvo_vol, 1, "vol")] : null,
      p?.gramas != null ? [`Priming: ${O.rotulo(O.ACUCAR_PRIMING, p.acucar)}`, `${n(p.gramas, 0)} g (${n(p.g_por_litro, 2)} g/L)`] : null,
    ]);
    if (p?.gramas != null) {
      d.paragrafo(`Priming para ${n(p.litros, 1)} L; CO₂ que a cerveja já tem: ${n(p.co2_residual, 2)} vol (fermentou até ${n(p.temperatura_max_c, 0)} °C).`, { tam: 8.5, cor: COR.suave, entre: 11 });
    }
  }

  // ---------- notas ----------
  if (String(r.notas ?? "").trim()) {
    d.secao("Notas", 30);
    d.paragrafo(String(r.notas).trim());
  }

  // ---------- rodapé ----------
  const z = (x) => String(x).padStart(2, "0");
  const gerado = `${z(agora.getDate())}/${z(agora.getMonth() + 1)}/${agora.getFullYear()} ${z(agora.getHours())}:${z(agora.getMinutes())}`;
  const total = d.paginas.length;
  d.paginas.forEach((pg, i) => {
    const y = A4.altura - 36;
    pg.itens.push({ tipo: "linha", x1: MARGEM, y1: y, x2: MARGEM + LARGURA, y2: y, cor: COR.linha, esp: 0.5 });
    pg.itens.push({ tipo: "texto", x: MARGEM, y: y + 12, txt: encurtarTexto(`GaliaBrew · ${nome}`, 7.5, LARGURA - 170), tam: 7.5, negrito: false, cor: COR.suave, alinh: "inicio" });
    pg.itens.push({ tipo: "texto", x: MARGEM + LARGURA, y: y + 12, txt: `Gerado em ${gerado} · página ${i + 1} de ${total}`, tam: 7.5, negrito: false, cor: COR.suave, alinh: "fim" });
  });
  return d.paginas;
}

/** Nome do arquivo: GaliaBrew-84-pils-da-galia.pdf (sem acento nem espaço). */
export function nomeDoArquivo(r) {
  const base = String(r.nome ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return ["GaliaBrew", r.lote_numero || null, base || "receita"].filter(Boolean).join("-") + ".pdf";
}

/** Uma página em SVG, item por item (textLength = largura do PDF: a quebra de linha não muda com a fonte do aparelho). */
function folhaSvg(pagina) {
  return svg("svg", { viewBox: `0 0 ${pagina.largura} ${pagina.altura}`, class: "rel-folha", "font-family": "Helvetica, Arial, sans-serif" },
    svg("rect", { x: 0, y: 0, width: pagina.largura, height: pagina.altura, fill: COR.branco }),
    pagina.itens.map((it) => {
      if (it.tipo === "ret") return svg("rect", { x: it.x, y: it.y, width: it.l, height: it.a, fill: it.cor });
      if (it.tipo === "linha") return svg("line", { x1: it.x1, y1: it.y1, x2: it.x2, y2: it.y2, stroke: it.cor, "stroke-width": it.esp ?? 0.5 });
      const largura = larguraTexto(it.txt, it.tam, it.negrito);
      return svg("text", {
        x: it.x, y: it.y, "font-size": it.tam, "font-weight": it.negrito ? 700 : 400, fill: it.cor,
        "text-anchor": it.alinh === "fim" ? "end" : it.alinh === "meio" ? "middle" : "start",
        textLength: largura > 0 && it.txt.length > 1 ? Number(largura.toFixed(2)) : null, lengthAdjust: "spacing", text: it.txt,
      });
    }));
}

const ZOOMS = [1, 1.5, 2, 3];

/** Abre o visualizador do relatório (janela). Compartilhar manda o PDF para a folha de compartilhamento do aparelho. */
export function abrirRelatorio(r, res, ctx = {}) {
  const paginas = montarRelatorio(r, res, ctx);
  const nome = String(r.nome ?? "").trim() || "Receita sem nome";
  const nomeArquivo = nomeDoArquivo(r);
  const bytes = gerarPdf(paginas, { titulo: nome, autor: String(r.autor ?? "").trim() });
  const arquivo = new File([bytes], nomeArquivo, { type: "application/pdf" });
  const podeCompartilhar = typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [arquivo] });

  function baixar() {
    const url = URL.createObjectURL(arquivo);
    const link = el("a", { href: url, download: nomeArquivo, hidden: true });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    avisar("PDF baixado.");
  }
  async function compartilhar() {
    if (!podeCompartilhar) { baixar(); return; }
    try {
      await navigator.share({ files: [arquivo], title: nome });
    } catch (e) {
      if (e?.name !== "AbortError") baixar();          // AbortError = a pessoa fechou a folha de compartilhamento
    }
  }

  let zoom = 0;
  const folhas = el("div", { class: "rel-folhas", dataset: { zoom: "1" } },
    paginas.map((pg, i) => el("div", { class: "rel-pagina", role: "group", "aria-label": `Página ${i + 1} de ${paginas.length}` }, folhaSvg(pg))));
  const area = el("div", { class: "rel-area", tabindex: 0, "aria-label": "Páginas do relatório" }, folhas);
  const rotuloZoom = el("span", { class: "rel-zoom-valor", "aria-live": "polite", text: "100%" });
  const menos = el("button", { type: "button", class: "icone", "aria-label": "Diminuir", text: "−", disabled: true, on: { click: () => mudarZoom(-1) } });
  const mais = el("button", { type: "button", class: "icone", "aria-label": "Ampliar", text: "+", on: { click: () => mudarZoom(1) } });
  function mudarZoom(passo) {
    // Mantém à vista o mesmo ponto do documento (proporção da rolagem; do 100% abre pelo canto esquerdo).
    const fy = area.scrollHeight > 0 ? area.scrollTop / area.scrollHeight : 0;
    const fx = area.scrollWidth > 0 ? area.scrollLeft / area.scrollWidth : 0;
    zoom = Math.min(ZOOMS.length - 1, Math.max(0, zoom + passo));
    folhas.dataset.zoom = String(ZOOMS[zoom]);
    rotuloZoom.textContent = `${Math.round(ZOOMS[zoom] * 100)}%`;
    menos.disabled = zoom === 0;
    mais.disabled = zoom === ZOOMS.length - 1;
    area.scrollTop = fy * area.scrollHeight;
    area.scrollLeft = fx * area.scrollWidth;
  }

  const janela = el("dialog", { class: "relatorio", "aria-label": `Relatório da receita ${nome}` },
    el("header", { class: "rel-topo" },
      el("button", { type: "button", class: "icone rel-fechar", "aria-label": "Fechar o relatório", on: { click: () => janela.close() } }, icone("fechar")),
      el("div", { class: "rel-titulo" }, el("strong", { text: "Relatório" }), el("span", { text: nome })),
      el("button", { type: "button", class: "rel-compartilhar", on: { click: compartilhar } },
        icone(podeCompartilhar ? "compartilhar" : "baixar"), podeCompartilhar ? "Compartilhar" : "Baixar PDF")),
    area,
    el("footer", { class: "rel-pe" },
      el("div", { class: "rel-zoom", role: "group", "aria-label": "Tamanho" }, menos, rotuloZoom, mais),
      el("span", { class: "rel-info", text: `${paginas.length} ${paginas.length === 1 ? "página" : "páginas"} · A4 · ${nomeArquivo}` })));
  janela.addEventListener("close", () => janela.remove());
  document.body.append(janela);
  janela.showModal();
  return janela;
}
