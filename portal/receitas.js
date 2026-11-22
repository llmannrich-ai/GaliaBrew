// receitas.js — lista de receitas e editor com cálculo ao vivo (calculos.js).
import { el, limpar, preencher, avisar, mensagemErro, confirmar, numeroBR, campoNumero, campoTexto, campoSelect, info } from "./ui.js?v=20261122f";
import { sb, sessao } from "./estado.js?v=20261122f";
import { calcularReceita, compararComEstilo, platoDeSg, corHexDeSrm, TEMPERATURA_WHIRLPOOL_PADRAO_C } from "./calculos.js?v=20261122f";
import { listarCadastro, amostraCor } from "./cadastros.js?v=20261122f";
import * as O from "./opcoes.js?v=20261122f";

const editor = { sujo: false };
export const haAlteracoes = () => editor.sujo;

const PARTES = "receita_fermentaveis(*), receita_lupulos(*), receita_leveduras(*), receita_outros(*), receita_mostura_passos(*), receita_fermentacao_passos(*)";

// =====================================================================================================
// Lista
// =====================================================================================================
export async function telaReceitas(conteudo) {
  editor.sujo = false;
  const filtro = { quais: "minhas", texto: "" };
  const corpo = el("div", { class: "tabela-rolagem" }, el("p", { class: "nota", text: "Carregando…" }));
  preencher(conteudo, 
    el("div", { class: "titulo-linha" },
      el("h2", { text: "Receitas" }),
      el("a", { href: "#/receita/nova", class: "botao", text: "Nova receita" })),
    el("div", { class: "barra" },
      el("div", { class: "segmentos", role: "group", "aria-label": "Quais receitas" },
        [["minhas", "Minhas"], ["publicas", "Públicas de outros"]].map(([v, t]) => el("button", {
          type: "button", class: v === filtro.quais ? "ativo" : "", text: t, dataset: { v },
          on: { click: (e) => { filtro.quais = v; for (const b of e.target.parentNode.children) b.classList.toggle("ativo", b.dataset.v === v); desenhar(); } },
        }))),
      el("input", { type: "search", placeholder: "Buscar por nome ou estilo", "aria-label": "Buscar", on: { input: (e) => { filtro.texto = e.target.value; desenhar(); } } })),
    corpo);

  const { data, error } = await sb.from("receitas")
    .select("id, nome, tipo, dono, publica, lote_numero, data_brassagem, og_calc, fg_calc, abv_calc_pct, ibu_calc, cor_srm_calc, atualizado_em, estilo:estilos(nome, codigo)")
    .order("lote_numero", { ascending: false, nullsFirst: false }).order("atualizado_em", { ascending: false }).range(0, 1999);
  if (error) { preencher(corpo, el("p", { class: "erro-form", text: mensagemErro(error) })); return; }
  const receitas = data;

  function desenhar() {
    const t = filtro.texto.trim().toLowerCase();
    const lista = receitas.filter((r) => (filtro.quais === "minhas" ? r.dono === sessao.usuario.id : r.dono !== sessao.usuario.id))
      .filter((r) => !t || `${r.lote_numero ?? ""} ${r.nome} ${r.estilo?.nome ?? ""} ${r.estilo?.codigo ?? ""}`.toLowerCase().includes(t));
    if (!lista.length) {
      preencher(corpo, el("p", { class: "nota", text: filtro.quais === "minhas" ? (t ? "Nada encontrado." : "Nenhuma receita ainda. Use “Nova receita”.") : "Nenhuma receita pública de outros usuários." }));
      return;
    }
    preencher(corpo, el("table", { class: "tabela" },
      el("thead", {}, el("tr", {}, ["", "Nº", "Nome", "Estilo", "Brassagem", "OG", "FG", "ABV", "IBU", `Cor (${O.unidadeCor()})`, ""].map((h, i) => el("th", { class: i === 1 || (i >= 5 && i <= 9) ? "num" : "", text: h })))),
      el("tbody", {}, lista.map((r) => el("tr", {
        class: "clicavel", tabindex: 0,
        on: { click: () => { location.hash = `#/receita/${r.id}`; }, keydown: (e) => { if (e.key === "Enter") location.hash = `#/receita/${r.id}`; } },
      },
      el("td", {}, amostraCor(r.cor_srm_calc ?? 0)),
      el("td", { class: "num", text: r.lote_numero ?? "" }),
      el("td", {}, el("strong", { text: r.nome }), r.publica ? el("span", { class: "selo", text: "pública" }) : null),
      el("td", { text: r.estilo ? `${r.estilo.codigo ? r.estilo.codigo + " " : ""}${r.estilo.nome}` : "" }),
      el("td", { text: dataDoDia(r.data_brassagem) }),
      el("td", { class: "num", text: numeroBR(r.og_calc, 3) }),
      el("td", { class: "num", text: numeroBR(r.fg_calc, 3) }),
      el("td", { class: "num", text: r.abv_calc_pct == null ? "" : `${numeroBR(r.abv_calc_pct, 1)}%` }),
      el("td", { class: "num", text: numeroBR(r.ibu_calc, 0) }),
      el("td", { class: "num", text: r.cor_srm_calc == null ? "" : numeroBR(O.corParaTela(r.cor_srm_calc), 1) }),
      el("td", {}, r.dono === sessao.usuario.id ? el("button", {
        type: "button", class: "icone perigo", title: "Excluir", "aria-label": `Excluir ${r.nome}`, text: "×",
        on: {
          click: async (e) => {
            e.stopPropagation();
            if (!(await confirmar(`Excluir a receita “${r.nome}”? Não dá para desfazer.`, { ok: "Excluir", perigo: true }))) return;
            const { error: erro } = await sb.from("receitas").delete().eq("id", r.id);
            if (erro) return avisar(mensagemErro(erro), "erro");
            receitas.splice(receitas.indexOf(r), 1);
            avisar("Receita excluída.");
            desenhar();
          },
        },
      }) : null))))));
  }
  desenhar();
}

// =====================================================================================================
// Editor
// =====================================================================================================
const PADRAO = () => ({
  id: null, nome: "", tipo: "ALL_GRAIN", autor: sessao.perfil?.nome || "", estilo_id: null, equipamento_id: null,
  volume_lote_l: 20, eficiencia_pct: 72, fervura_min: 60, evaporacao_l_h: 3, perda_panela_l: 1, absorcao_grao_l_kg: 1,
  relacao_agua_grao_l_kg: 3, perda_tina_l: 0, temp_grao_c: 20, publica: false, notas: "",
  lote_numero: null, data_brassagem: null, og_medida: null, fg_medida: null, volume_final_l: null, co2_alvo_vol: null, priming_acucar: null,
  fermentaveis: [], lupulos: [], leveduras: [], outros: [],
  mostura: [{ nome: "Sacarificação", tipo: "INFUSAO", temperatura_c: 66, tempo_min: 60 }],
  fermentacao: [{ nome: "Primária", temperatura_c: 19, dias: 14 }],
});

const PARAMETROS_EQUIPAMENTO = ["volume_lote_l", "eficiencia_pct", "evaporacao_l_h", "perda_panela_l", "perda_tina_l", "absorcao_grao_l_kg", "relacao_agua_grao_l_kg"];

async function carregarReceita(id) {
  const { data, error } = await sb.from("receitas").select(`*, ${PARTES}`).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const ord = (a) => (a ?? []).sort((x, y) => x.ordem - y.ordem);
  const r = { ...data };
  r.fermentaveis = ord(data.receita_fermentaveis);
  r.lupulos = ord(data.receita_lupulos);
  r.leveduras = ord(data.receita_leveduras);
  r.outros = ord(data.receita_outros);
  r.mostura = ord(data.receita_mostura_passos);
  r.fermentacao = ord(data.receita_fermentacao_passos);
  for (const k of ["receita_fermentaveis", "receita_lupulos", "receita_leveduras", "receita_outros", "receita_mostura_passos", "receita_fermentacao_passos"]) delete r[k];
  return r;
}

/** Rotas: #/receita/<id>, #/receita/nova (em branco) e #/receita/nova/<id da receita de origem>. */
export async function telaEditor(conteudo, id, origemId) {
  editor.sujo = false;
  preencher(conteudo, el("p", { class: "nota", text: "Carregando…" }));
  const nova = !id || id === "nova";
  const buscar = nova ? origemId : id;
  const [cat, rec] = await Promise.all([
    Promise.all(["estilos", "equipamentos", "fermentaveis", "lupulos", "leveduras", "outros"].map((t) => listarCadastro(t)))
      .then(([estilos, equipamentos, fermentaveis, lupulos, leveduras, outros]) => ({ estilos, equipamentos, fermentaveis, lupulos, leveduras, outros })),
    buscar ? carregarReceita(buscar) : Promise.resolve(null),
  ]);
  if (buscar && !rec) {
    preencher(conteudo, el("p", { class: "erro-form", text: "Receita não encontrada (ou sem acesso)." }), el("a", { href: "#/receitas", text: "Voltar às receitas" }));
    return;
  }
  let r;
  if (nova && rec) {
    r = copiaDe(rec, cat);
    editor.sujo = true;
  } else {
    r = rec ?? PADRAO();
    if (!rec && cat.equipamentos.length === 1) aplicarEquipamento(r, cat.equipamentos[0]);
  }
  const leitura = !nova && rec.dono !== sessao.usuario.id;
  montarEditor(conteudo, r, cat, leitura, nova ? rec : null);
}

/**
 * Receita nova a partir de outra (cada receita é um lote; a anterior não muda). Copia ingredientes, parâmetros,
 * mostura, fermentação e estilo; dados do lote, notas e "pública" ficam em branco; número = automático ao salvar.
 * Ligação com cadastro/equipamento que eu não enxergo (receita pública de outro) cai, mas os dados copiados vão.
 */
function copiaDe(o, cat) {
  const visivel = (lista, id) => (id && lista.some((x) => x.id === id) ? id : null);
  const sem = (x) => { const c = { ...x }; delete c.id; delete c.receita_id; delete c.criado_em; return c; };
  return {
    ...PADRAO(),
    ...Object.fromEntries(["nome", "tipo", ...PARAMETROS_EQUIPAMENTO, "fervura_min", "temp_grao_c"].map((k) => [k, o[k]])),
    estilo_id: visivel(cat.estilos, o.estilo_id),
    equipamento_id: visivel(cat.equipamentos, o.equipamento_id),
    fermentaveis: o.fermentaveis.map((x) => ({ ...sem(x), fermentavel_id: visivel(cat.fermentaveis, x.fermentavel_id) })),
    lupulos: o.lupulos.map((x) => ({ ...sem(x), lupulo_id: visivel(cat.lupulos, x.lupulo_id) })),
    leveduras: o.leveduras.map((x) => ({ ...sem(x), levedura_id: visivel(cat.leveduras, x.levedura_id) })),
    outros: o.outros.map((x) => ({ ...sem(x), outro_id: visivel(cat.outros, x.outro_id) })),
    mostura: o.mostura.map(sem),
    fermentacao: o.fermentacao.map(sem),
  };
}

function aplicarEquipamento(r, eq) {
  r.equipamento_id = eq.id;
  for (const k of PARAMETROS_EQUIPAMENTO) if (eq[k] !== null && eq[k] !== undefined) r[k] = Number(eq[k]);
}

function montarEditor(conteudo, r, cat, leitura, origem) {
  const calculados = new Map();      // item → célula com valor calculado (% do açúcar, IBU)
  const painel = el("aside", { class: "resultados", "aria-live": "polite" });
  const secoes = {};
  const des = leitura;

  const mudou = () => {
    if (!leitura) editor.sujo = true;
    atualizarResultados();
  };

  // ---------- resultados ----------
  function atualizarResultados() {
    const res = calcularReceita(r);
    res.fermentaveis.forEach((x, i) => { const c = calculados.get(r.fermentaveis[i]); if (c) c.textContent = `${numeroBR(x.pct_acucar, 0)}%`; });
    res.lupulos.forEach((x, i) => { const c = calculados.get(r.lupulos[i]); if (c) c.textContent = numeroBR(x.ibu, 1); });
    const estilo = cat.estilos.find((e) => e.id === r.estilo_id);
    const cmp = compararComEstilo(res, estilo);
    const v = res.volumes;
    const linha = (rot, valor, chave, faixaTxt, ajuda) => el("div", { class: "metrica" },
      el("span", { class: "rot" }, rot, info(ajuda)),
      el("span", { class: "val", text: valor }),
      cmp && chave && cmp[chave] ? el("span", { class: `faixa ${cmp[chave].toLowerCase()}`, title: faixaTxt, text: { ABAIXO: "abaixo", DENTRO: "ok", ACIMA: "acima" }[cmp[chave]] }) : null);
    const fx = (a, b, casas, conv = (x) => x) => (estilo && (a != null || b != null) ? `Estilo: ${numeroBR(conv(a), casas)} a ${numeroBR(conv(b), casas)}` : "");
    const amostra = el("span", { class: "amostra grande", "aria-hidden": "true" });
    amostra.style.background = corHexDeSrm(res.cor_srm);
    preencher(painel, 
      el("h3", { text: "Resultado" }),
      el("div", { class: "cor-linha" }, amostra, el("span", { text: `${numeroBR(O.corParaTela(res.cor_srm), 1)} ${O.unidadeCor()}` })),
      linha("OG", `${numeroBR(res.og, 3)} (${numeroBR(platoDeSg(res.og), 1)} °P)`, "og", fx(estilo?.og_min, estilo?.og_max, 3)),
      linha("FG", numeroBR(res.fg, 3), "fg", fx(estilo?.fg_min, estilo?.fg_max, 3)),
      linha("ABV", `${numeroBR(res.abv_pct, 1)}%`, "abv_pct", fx(estilo?.abv_min_pct, estilo?.abv_max_pct, 1)),
      linha("IBU (Tinseth)", numeroBR(res.ibu, 0), "ibu", fx(estilo?.ibu_min, estilo?.ibu_max, 0)),
      linha(`Cor (${O.unidadeCor()})`, numeroBR(O.corParaTela(res.cor_srm), 1), "cor_srm", fx(estilo?.cor_srm_min, estilo?.cor_srm_max, 1, O.corParaTela)),
      linha("BU:GU", numeroBR(res.bu_gu, 2)),
      linha("Atenuação", `${numeroBR(res.atenuacao_pct, 0)}%`),
      linha("Gravidade pré-fervura", numeroBR(res.sg_pre_fervura, 3)),
      ...painelMedido(res, linha),
      ...painelPriming(res, linha),
      el("h4", { text: "Volumes" }),
      linha("Água total", `${numeroBR(v.agua_total_l, 1)} L`, null, null, O.AJUDA_VOLUME.agua_total_l),
      linha("Água da mostura", `${numeroBR(v.agua_mostura_l, 1)} L`, null, null, O.AJUDA_VOLUME.agua_mostura_l),
      v.temperatura_agua_mostura_c != null ? linha("Temperatura da água da mostura", `${numeroBR(v.temperatura_agua_mostura_c, 1)} °C`, null, null, O.AJUDA_VOLUME.temperatura_agua_mostura_c) : null,
      linha("Água de lavagem", `${numeroBR(v.agua_lavagem_l, 1)} L`, null, null, O.AJUDA_VOLUME.agua_lavagem_l),
      linha("Pré-fervura", `${numeroBR(v.pre_fervura_l, 1)} L`, null, null, O.AJUDA_VOLUME.pre_fervura_l),
      linha("Pós-fervura", `${numeroBR(v.pos_fervura_l, 1)} L`, null, null, O.AJUDA_VOLUME.pos_fervura_l),
      linha("Grãos", `${numeroBR(v.graos_kg, 2)} kg`),
      estilo ? el("p", { class: "nota", text: `Comparando com ${estilo.codigo ? estilo.codigo + " " : ""}${estilo.nome}.` }) : null,
      res.avisos.includes("SEM_LEVEDURA") ? el("p", { class: "nota alerta", text: "Sem levedura: a FG fica igual à OG." }) : null,
      el("p", { class: "nota", text: `IBU pelo Tinseth. Whirlpool conta menos quanto mais frio (sem temperatura = ${TEMPERATURA_WHIRLPOOL_PADRAO_C} °C); dry hop não conta.` }));
    return res;
  }

  // ---------- seção genérica de lista ----------
  function secaoLista(chave, titulo, { colunas, adicionar, vazio }) {
    const corpo = el("tbody");
    const sec = el("section", { class: "cartao" },
      el("div", { class: "titulo-linha" }, el("h3", { text: titulo }), leitura ? null : adicionar()),
      el("div", { class: "tabela-rolagem" },
        el("table", { class: "tabela editavel" },
          el("thead", {}, el("tr", {}, colunas.map((c) => el("th", { class: c.num ? "num" : "", text: c.r })), leitura ? null : el("th"))),
          corpo)));
    const desenhar = () => {
      limpar(corpo);
      if (!r[chave].length) corpo.append(el("tr", {}, el("td", { colspan: colunas.length + 1, class: "nota", text: vazio })));
      r[chave].forEach((item, i) => {
        corpo.append(el("tr", {},
          colunas.map((c) => el("td", { class: c.num ? "num" : "", dataset: { rotulo: c.r } }, comRotulo(c.campo(item, i), c.r))),
          leitura ? null : el("td", { class: "acoes-linha" },
            i > 0 ? el("button", { type: "button", class: "icone", title: "Subir", "aria-label": "Subir", text: "↑", on: { click: () => { [r[chave][i - 1], r[chave][i]] = [r[chave][i], r[chave][i - 1]]; desenhar(); mudou(); } } }) : null,
            el("button", { type: "button", class: "icone perigo", title: "Remover", "aria-label": "Remover", text: "×", on: { click: () => { r[chave].splice(i, 1); desenhar(); mudou(); } } }))));
      });
      atualizarResultados();
    };
    secoes[chave] = desenhar;
    desenhar();
    return sec;
  }

  /** Select "Adicionar…" com o cadastro (sistema + meus) e a opção de item livre. */
  function seletorCadastro(lista, aoEscolher, livre, rotuloItem = (x) => x.nome) {
    const s = el("select", {
      class: "adicionar", "aria-label": "Adicionar",
      on: {
        change: (e) => {
          const v = e.target.value;
          e.target.value = "";
          if (!v) return;
          if (v === "__livre") aoEscolher(livre());
          else aoEscolher(lista.find((x) => x.id === v));
        },
      },
    },
    el("option", { value: "", text: "+ Adicionar…" }),
    el("option", { value: "__livre", text: "Item livre (digitar os dados)" }),
    lista.length ? el("optgroup", { label: "Cadastro" }, lista.map((x) => el("option", { value: x.id, text: `${rotuloItem(x)}${x.dono ? " (meu)" : ""}` }))) : null);
    return s;
  }

  const num = (k, casas, extra = {}) => (item) => campoNumero(item, k, { casas, aoMudar: mudou, desabilitado: des, ...extra });
  const txt = (k, extra = {}) => (item) => campoTexto(item, k, { aoMudar: mudou, desabilitado: des, classe: "nome", ...extra });
  const sel = (k, opcoes, extra = {}) => (item) => campoSelect(item, k, opcoes, { aoMudar: mudou, desabilitado: des, ...extra });
  const calc = (item) => { const c = el("span", { class: "calculado" }); calculados.set(item, c); return c; };

  // ---------- cabeçalho ----------
  const nomeInput = campoTexto(r, "nome", { aoMudar: mudou, desabilitado: des, classe: "titulo-receita", placeholder: "Nome da receita", rotulo: "Nome da receita", max: 120 });
  const msg = el("p", { class: "erro-form", role: "alert" });
  const botaoSalvar = el("button", { type: "button", text: "Salvar", on: { click: () => salvar() } });

  async function salvar() {
    msg.textContent = "";
    const problemas = validar(r);
    if (problemas.length) { msg.textContent = problemas.join(" "); return; }
    const res = calcularReceita(r);
    const p = montarPayload(r, res);
    botaoSalvar.disabled = true;
    const { data, error } = await sb.rpc("salvar_receita", { p });
    botaoSalvar.disabled = false;
    if (error) { msg.textContent = mensagemErro(error); return; }
    editor.sujo = false;
    avisar("Receita salva.");
    r.id = data;
    if (location.hash !== `#/receita/${data}`) location.hash = `#/receita/${data}`;   // recarrega o editor
  }

  const acoes = el("div", { class: "acoes-receita" },
    leitura ? el("span", { class: "selo", text: "Somente leitura (receita de outro usuário)" }) : botaoSalvar,
    r.id ? el("button", { type: "button", class: "secundario", text: "Nova a partir desta", on: { click: async () => {
      if (!leitura && editor.sujo && !(await confirmar("Há alterações não salvas. A receita nova é feita do que está salvo. Continuar?"))) return;
      editor.sujo = false;
      location.hash = `#/receita/nova/${r.id}`;
    } } }) : null,
    el("a", { href: "#/receitas", class: "botao secundario", text: "Voltar" }));

  const geral = el("section", { class: "cartao" },
    el("h3", { text: "Geral" }),
    el("div", { class: "grade-form" },
      el("label", {}, el("span", { text: "Tipo" }), campoSelect(r, "tipo", O.TIPO_RECEITA, { aoMudar: mudou, desabilitado: des, rotulo: "Tipo" })),
      el("label", {}, el("span", { text: "Estilo" }), campoSelect(r, "estilo_id",
        cat.estilos.map((e) => [e.id, `${e.codigo ? e.codigo + " " : ""}${e.nome}${e.dono ? " (meu)" : ""}`]), { aoMudar: mudou, desabilitado: des, vazio: "— sem estilo —", rotulo: "Estilo" })),
      el("label", {}, el("span", { text: "Equipamento" }), campoSelect(r, "equipamento_id",
        cat.equipamentos.map((e) => [e.id, e.nome]), {
          desabilitado: des, vazio: cat.equipamentos.length ? "— nenhum —" : "— cadastre em Cadastros —", rotulo: "Equipamento",
          aoMudar: () => {
            const eq = cat.equipamentos.find((e) => e.id === r.equipamento_id);
            if (eq) { aplicarEquipamento(r, eq); desenharParametros(); avisar("Parâmetros copiados do equipamento."); }
            mudou();
          },
        })),
      el("label", {}, el("span", { text: "Autor" }), campoTexto(r, "autor", { aoMudar: mudou, desabilitado: des, max: 80, rotulo: "Autor" })),
      el("label", { class: "linha" }, el("input", { type: "checkbox", checked: r.publica, disabled: des, on: { change: (e) => { r.publica = e.target.checked; mudou(); } } }),
        "Pública (outros usuários podem ver e duplicar)")));

  // Densidade: aceita 1,050, 1050 e 50 (pontos) para 1,050.
  const sg = { de: (x) => x, para: (v) => (v >= 900 ? v / 1000 : v > 2 && v < 200 ? 1 + v / 1000 : v) };
  const campoLote = (k, rot, extra) => el("label", {}, el("span", {}, rot, info(O.AJUDA_VOLUME[k])), campoNumero(r, k, { aoMudar: mudou, desabilitado: des, rotulo: rot, ...extra }));
  const lote = el("section", { class: "cartao" },
    el("h3", { text: "Lote" }),
    el("div", { class: "grade-form" },
      campoLote("lote_numero", "Nº do lote", { casas: 0, placeholder: "automático" }),
      el("label", {}, el("span", { text: "Data da brassagem" }), el("input", {
        type: "date", value: r.data_brassagem ?? "", disabled: des, "aria-label": "Data da brassagem",
        on: { change: (e) => { r.data_brassagem = e.target.value || null; mudou(); } },
      })),
      campoLote("og_medida", "OG medida", { casas: 3, placeholder: "1,050", ...sg }),
      campoLote("fg_medida", "FG medida", { casas: 3, placeholder: "1,010", ...sg }),
      campoLote("volume_final_l", "Volume real no fermentador (L)", { casas: 1 }),
      campoLote("co2_alvo_vol", "CO₂ desejado (vol)", { casas: 1, placeholder: "2,4" }),
      el("label", {}, el("span", {}, "Açúcar do priming", info(O.AJUDA_VOLUME.priming_acucar)),
        campoSelect(r, "priming_acucar", O.ACUCAR_PRIMING, { aoMudar: mudou, desabilitado: des, vazio: "Açúcar comum (sacarose)", rotulo: "Açúcar do priming" }))));

  const inicio = !r.id && !leitura ? el("section", { class: "cartao" },
    origem
      ? el("p", { class: "nota", text: `Receita nova a partir de ${origem.lote_numero ? "nº " + origem.lote_numero + " – " : ""}${origem.nome}. A anterior não muda; dados do lote e notas começam em branco.` })
      : seletorOrigem()) : null;

  function seletorOrigem() {
    const s = el("select", { "aria-label": "Começar a partir de", on: { change: (e) => { if (e.target.value) { editor.sujo = false; location.hash = `#/receita/nova/${e.target.value}`; } } } },
      el("option", { value: "", text: "Carregando receitas…" }));
    sb.from("receitas").select("id, nome, lote_numero, data_brassagem").eq("dono", sessao.usuario.id)
      .order("lote_numero", { ascending: false, nullsFirst: false }).order("atualizado_em", { ascending: false }).range(0, 1999)
      .then(({ data }) => preencher(s, el("option", { value: "", text: data?.length ? "— em branco —" : "— nenhuma receita ainda —" }),
        (data ?? []).map((x) => el("option", { value: x.id, text: [x.lote_numero, x.nome, dataDoDia(x.data_brassagem)].filter(Boolean).join(" · ") }))));
    return el("label", { class: "origem" }, el("span", { text: "Começar a partir de uma receita anterior" }), s);
  }

  const parametros = el("div", { class: "grade-form" });
  function desenharParametros() {
    const p = (k, rot, casas) => el("label", {}, el("span", {}, rot, info(O.AJUDA_VOLUME[k])), campoNumero(r, k, { casas, aoMudar: mudou, desabilitado: des, rotulo: rot }));
    preencher(parametros, 
      p("volume_lote_l", "Volume no fermentador (L)", 1),
      p("eficiencia_pct", "Eficiência (%)", 0),
      p("fervura_min", "Fervura (min)", 0),
      p("evaporacao_l_h", "Evaporação (L/h)", 1),
      p("perda_panela_l", "Perda na panela (L)", 1),
      p("perda_tina_l", "Perda na tina (L)", 1),
      p("absorcao_grao_l_kg", "Absorção do grão (L/kg)", 2),
      p("relacao_agua_grao_l_kg", "Água/grão na mostura (L/kg)", 1),
      p("temp_grao_c", "Temperatura do grão (°C)", 1));
  }
  desenharParametros();

  const cor = { de: O.corParaTela, para: O.corDaTela };
  const fermentaveis = secaoLista("fermentaveis", "Fermentáveis", {
    vazio: "Nenhum fermentável.",
    colunas: [
      { r: "Nome", campo: txt("nome") },
      { r: "Tipo", campo: sel("tipo", O.TIPO_FERMENTAVEL) },
      { r: "Qtd (kg)", num: true, campo: num("quantidade_kg", 3) },
      { r: "Rend. %", num: true, campo: num("rendimento_pct", 1) },
      { r: "Umid. %", num: true, campo: num("umidade_pct", 1) },
      { r: `Cor (${O.unidadeCor()})`, num: true, campo: num("cor_srm", 1, cor) },
      { r: "Etapa", campo: sel("etapa", O.ETAPA_FERMENTAVEL) },
      { r: "% açúcar", num: true, campo: calc },
    ],
    adicionar: () => seletorCadastro(cat.fermentaveis, (f) => {
      r.fermentaveis.push(f.id
        ? { fermentavel_id: f.id, nome: f.nome, tipo: f.tipo, rendimento_pct: num0(f.rendimento_pct), umidade_pct: num0(f.umidade_pct), cor_srm: num0(f.cor_srm), fermentavel_pct: num0(f.fermentavel_pct, 100), quantidade_kg: null, etapa: ["GRAO", "OUTRO"].includes(f.tipo) ? "MOSTURA" : "FERVURA" }
        : f);
      secoes.fermentaveis(); mudou();
    }, () => ({ fermentavel_id: null, nome: "", tipo: "GRAO", rendimento_pct: 80, umidade_pct: 4, cor_srm: 2, fermentavel_pct: 100, quantidade_kg: null, etapa: "MOSTURA" })),
  });

  const lupulos = secaoLista("lupulos", "Lúpulos", {
    vazio: "Nenhum lúpulo.",
    colunas: [
      { r: "Nome", campo: txt("nome") },
      { r: "Forma", campo: sel("forma", O.FORMA_LUPULO) },
      { r: "Alfa %", num: true, campo: num("alfa_pct", 1) },
      { r: "Qtd (g)", num: true, campo: num("quantidade_g", 1) },
      { r: "Etapa", campo: (item) => campoSelect(item, "etapa", O.ETAPA_LUPULO, { desabilitado: des, aoMudar: () => { secoes.lupulos(); mudou(); } }) },
      { r: "Tempo (min)", num: true, campo: (item) => campoNumero(item, "tempo_min", { casas: 0, aoMudar: mudou, desabilitado: des || ["DRY_HOP", "PRIMEIRO_MOSTO", "ENVASE"].includes(item.etapa) }) },
      { r: "Temp. (°C)", num: true, campo: (item) => campoNumero(item, "temperatura_c", { casas: 0, aoMudar: mudou, desabilitado: des || item.etapa !== "WHIRLPOOL", placeholder: item.etapa === "WHIRLPOOL" ? String(TEMPERATURA_WHIRLPOOL_PADRAO_C) : undefined }) },
      { r: "Dia", num: true, campo: (item) => campoNumero(item, "dia", { casas: 0, aoMudar: mudou, desabilitado: des || item.etapa !== "DRY_HOP" }) },
      { r: "IBU", num: true, campo: calc },
    ],
    adicionar: () => seletorCadastro(cat.lupulos, (h) => {
      r.lupulos.push(h.id
        ? { lupulo_id: h.id, nome: h.nome, forma: h.forma, alfa_pct: num0(h.alfa_pct), quantidade_g: null, etapa: "FERVURA", tempo_min: 60, dia: null }
        : h);
      secoes.lupulos(); mudou();
    }, () => ({ lupulo_id: null, nome: "", forma: "PELLET", alfa_pct: 5, quantidade_g: null, etapa: "FERVURA", tempo_min: 60, dia: null }),
    (h) => `${h.nome} — ${numeroBR(h.alfa_pct, 1)}%`),
  });

  const leveduras = secaoLista("leveduras", "Leveduras", {
    vazio: "Nenhuma levedura (a FG fica igual à OG).",
    colunas: [
      { r: "Nome", campo: txt("nome") },
      { r: "Tipo", campo: sel("tipo", O.TIPO_LEVEDURA) },
      { r: "Forma", campo: sel("forma", O.FORMA_LEVEDURA) },
      { r: "Atenuação %", num: true, campo: num("atenuacao_pct", 0) },
      { r: "Qtd", num: true, campo: num("quantidade", 1) },
      { r: "Unidade", campo: sel("unidade", O.UNIDADE_LEVEDURA, { vazio: "—" }) },
      { r: "Etapa", campo: sel("etapa", O.ETAPA_LEVEDURA) },
    ],
    adicionar: () => seletorCadastro(cat.leveduras, (y) => {
      const media = y.atenuacao_min_pct != null && y.atenuacao_max_pct != null ? (Number(y.atenuacao_min_pct) + Number(y.atenuacao_max_pct)) / 2 : num0(y.atenuacao_min_pct ?? y.atenuacao_max_pct, null);
      r.leveduras.push(y.id
        ? { levedura_id: y.id, nome: y.nome, tipo: y.tipo, forma: y.forma, atenuacao_pct: media, quantidade: 1, unidade: "PACOTE", etapa: "PRIMARIA" }
        : y);
      secoes.leveduras(); mudou();
    }, () => ({ levedura_id: null, nome: "", tipo: "ALE", forma: "SECA", atenuacao_pct: 75, quantidade: 1, unidade: "PACOTE", etapa: "PRIMARIA" }),
    (y) => [y.produtor, y.nome].filter(Boolean).join(" ")),
  });

  const outros = secaoLista("outros", "Outros ingredientes", {
    vazio: "Nenhum.",
    colunas: [
      { r: "Nome", campo: txt("nome") },
      { r: "Tipo", campo: sel("tipo", O.TIPO_OUTRO) },
      { r: "Qtd", num: true, campo: num("quantidade", 2) },
      { r: "Unidade", campo: sel("unidade", O.UNIDADE_OUTRO) },
      { r: "Etapa", campo: sel("etapa", O.ETAPA_OUTRO) },
      { r: "Tempo (min)", num: true, campo: num("tempo_min", 0) },
    ],
    adicionar: () => seletorCadastro(cat.outros, (o) => {
      r.outros.push(o.id ? { outro_id: o.id, nome: o.nome, tipo: o.tipo, quantidade: null, unidade: "G", etapa: "FERVURA", tempo_min: null } : o);
      secoes.outros(); mudou();
    }, () => ({ outro_id: null, nome: "", tipo: "OUTRO", quantidade: null, unidade: "G", etapa: "FERVURA", tempo_min: null })),
  });

  const botaoPasso = (chave, novo) => () => el("button", { type: "button", class: "secundario pequeno", text: "+ Passo", on: { click: () => { r[chave].push(novo()); secoes[chave](); mudou(); } } });
  const mostura = secaoLista("mostura", "Mostura", {
    vazio: "Sem passos.",
    colunas: [
      { r: "Passo", campo: txt("nome") },
      { r: "Tipo", campo: sel("tipo", O.TIPO_MOSTURA) },
      { r: "Temp. (°C)", num: true, campo: num("temperatura_c", 1) },
      { r: "Tempo (min)", num: true, campo: num("tempo_min", 0) },
    ],
    adicionar: botaoPasso("mostura", () => ({ nome: "", tipo: "TEMPERATURA", temperatura_c: 72, tempo_min: 10 })),
  });
  const fermentacao = secaoLista("fermentacao", "Fermentação", {
    vazio: "Sem passos.",
    colunas: [
      { r: "Passo", campo: txt("nome") },
      { r: "Temp. (°C)", num: true, campo: num("temperatura_c", 1) },
      { r: "Dias", num: true, campo: num("dias", 0) },
    ],
    adicionar: botaoPasso("fermentacao", () => ({ nome: "", temperatura_c: 2, dias: 3 })),
  });

  const notas = el("section", { class: "cartao" }, el("h3", { text: "Notas" }),
    el("textarea", { rows: 4, maxlength: 8000, disabled: des, value: r.notas ?? "", "aria-label": "Notas", on: { input: (e) => { r.notas = e.target.value; mudou(); } } }));

  preencher(conteudo, 
    el("div", { class: "editor-topo" }, nomeInput, acoes),
    msg,
    el("div", { class: "editor" },
      el("div", { class: "editor-corpo" },
        inicio,
        geral,
        lote,
        el("section", { class: "cartao" }, el("h3", { text: "Parâmetros do lote" }), parametros),
        fermentaveis, lupulos, leveduras, outros, mostura, fermentacao, notas),
      painel));
  atualizarResultados();
  if (!r.id && !leitura) nomeInput.focus();
}

/** Dá nome acessível ao campo da tabela (o cabeçalho da coluna). */
function comRotulo(n, rot) {
  if (n instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(n.tagName) && !n.getAttribute("aria-label")) n.setAttribute("aria-label", rot);
  return n;
}

const num0 = (v, padrao = 0) => (v === null || v === undefined ? padrao : Number(v));

/** Data sem hora ("2026-04-20") em dd/mm/aaaa, sem passar por fuso (new Date daria o dia anterior no Brasil). */
const dataDoDia = (d) => (d ? d.split("-").reverse().join("/") : "");

/** Linhas do que foi medido no lote, ao lado do planejado. */
function painelMedido(res, linha) {
  const m = res.medido;
  if (m.og == null && m.fg == null) return [];
  const pct = (v) => (v == null ? "—" : `${numeroBR(v, 0)}%`);
  return [
    el("h4", { text: "Medido no lote" }),
    m.og != null ? linha("OG medida", `${numeroBR(m.og, 3)} (plan. ${numeroBR(res.og, 3)})`) : null,
    m.fg != null ? linha("FG medida", `${numeroBR(m.fg, 3)} (plan. ${numeroBR(res.fg, 3)})`) : null,
    m.eficiencia_pct != null ? linha("Eficiência real", pct(m.eficiencia_pct)) : null,
    m.abv_pct != null ? linha("ABV real", `${numeroBR(m.abv_pct, 1)}%`) : null,
    m.atenuacao_pct != null ? linha("Atenuação aparente real", pct(m.atenuacao_pct)) : null,
  ];
}

/** Priming do lote (só com CO₂ desejado preenchido). */
function painelPriming(res, linha) {
  const p = res.priming;
  if (!p || p.gramas == null) return [];
  return [
    el("h4", { text: "Priming" }),
    linha(O.rotulo(O.ACUCAR_PRIMING, p.acucar), `${numeroBR(p.gramas, 0)} g`),
    linha("Por litro", `${numeroBR(p.g_por_litro, 2)} g/L`),
    el("p", { class: "nota", text: `Para ${numeroBR(p.litros, 1)} L; CO₂ que a cerveja já tem: ${numeroBR(p.co2_residual, 2)} vol (fermentou até ${numeroBR(p.temperatura_max_c, 0)} °C).` }),
  ];
}

function validar(r) {
  const p = [];
  if (!String(r.nome ?? "").trim()) p.push("Dê um nome à receita.");
  if (!(r.volume_lote_l > 0)) p.push("Volume no fermentador deve ser maior que zero.");
  if (r.lote_numero != null && !(Number.isInteger(r.lote_numero) && r.lote_numero > 0)) p.push("Nº do lote: número inteiro maior que zero.");
  for (const [k, rot] of [["og_medida", "OG medida"], ["fg_medida", "FG medida"]]) {
    if (r[k] != null && !(r[k] >= 0.98 && r[k] <= 1.2)) p.push(`${rot}: use densidade como 1,050 (ou 1050, ou 50).`);
  }
  if (r.volume_final_l != null && !(r.volume_final_l > 0)) p.push("Volume real deve ser maior que zero.");
  if (r.co2_alvo_vol != null && !(r.co2_alvo_vol > 0 && r.co2_alvo_vol <= 6)) p.push("CO₂ desejado: entre 0 e 6 volumes (ex.: 2,4).");
  const falta = (lista, teste) => lista.some((x) => !teste(x));
  if (falta(r.fermentaveis, (f) => String(f.nome ?? "").trim() && f.quantidade_kg > 0 && f.rendimento_pct != null && f.cor_srm != null)) p.push("Fermentáveis: preencha nome, quantidade (> 0), rendimento e cor.");
  if (falta(r.lupulos, (h) => String(h.nome ?? "").trim() && h.quantidade_g > 0 && h.alfa_pct != null && (h.etapa !== "FERVURA" || h.tempo_min != null))) p.push("Lúpulos: preencha nome, quantidade (> 0), alfa e o tempo na fervura.");
  if (falta(r.leveduras, (y) => String(y.nome ?? "").trim() && (y.quantidade == null || y.quantidade > 0))) p.push("Leveduras: preencha o nome.");
  if (falta(r.outros, (o) => String(o.nome ?? "").trim() && o.quantidade > 0)) p.push("Outros: preencha nome e quantidade (> 0).");
  if (falta(r.mostura, (m) => String(m.nome ?? "").trim() && m.temperatura_c != null && m.tempo_min != null)) p.push("Mostura: preencha nome, temperatura e tempo de cada passo.");
  if (falta(r.fermentacao, (f) => String(f.nome ?? "").trim() && f.temperatura_c != null && f.dias != null)) p.push("Fermentação: preencha nome, temperatura e dias.");
  return p;
}

function montarPayload(r, res) {
  const so = (obj, chaves) => Object.fromEntries(chaves.map((k) => [k, typeof obj[k] === "string" ? obj[k].trim() : obj[k] ?? null]));
  const arred = (v, c) => (Number.isFinite(v) ? Number(v.toFixed(c)) : null);
  return {
    ...so(r, ["id", "nome", "tipo", "autor", "estilo_id", "equipamento_id", "volume_lote_l", "eficiencia_pct", "fervura_min", "evaporacao_l_h",
      "perda_panela_l", "absorcao_grao_l_kg", "relacao_agua_grao_l_kg", "perda_tina_l", "temp_grao_c", "publica", "notas",
      "lote_numero", "data_brassagem", "og_medida", "fg_medida", "volume_final_l", "co2_alvo_vol", "priming_acucar"]),
    fervura_min: Math.round(r.fervura_min ?? 60),
    og_calc: arred(res.og, 4), fg_calc: arred(res.fg, 4), abv_calc_pct: arred(res.abv_pct, 2), ibu_calc: arred(res.ibu, 1), cor_srm_calc: arred(res.cor_srm, 1),
    fermentaveis: r.fermentaveis.map((x) => so(x, ["fermentavel_id", "nome", "tipo", "rendimento_pct", "umidade_pct", "cor_srm", "fermentavel_pct", "quantidade_kg", "etapa"])),
    lupulos: r.lupulos.map((x) => so(x, ["lupulo_id", "nome", "forma", "alfa_pct", "quantidade_g", "etapa", "tempo_min", "temperatura_c", "dia"])),
    leveduras: r.leveduras.map((x) => so(x, ["levedura_id", "nome", "tipo", "forma", "atenuacao_pct", "quantidade", "unidade", "etapa"])),
    outros: r.outros.map((x) => so(x, ["outro_id", "nome", "tipo", "quantidade", "unidade", "etapa", "tempo_min"])),
    mostura: r.mostura.map((x) => ({ ...so(x, ["nome", "tipo", "temperatura_c", "rampa_min", "volume_agua_l", "temperatura_infusao_c"]), tempo_min: Math.round(x.tempo_min ?? 0) })),
    fermentacao: r.fermentacao.map((x) => so(x, ["nome", "temperatura_c", "temperatura_fim_c", "dias"])),
  };
}
