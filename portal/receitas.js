// receitas.js — lista de receitas e editor com cálculo ao vivo (calculos.js).
import { el, limpar, preencher, avisar, mensagemErro, confirmar, numeroBR, dataBR, campoNumero, campoTexto, campoSelect } from "./ui.js?v=20261122c";
import { sb, sessao } from "./estado.js?v=20261122c";
import { calcularReceita, platoDeSg } from "./calculos.js?v=20261122c";
import { listarCadastro, amostraCor } from "./cadastros.js?v=20261122c";
import * as O from "./opcoes.js?v=20261122c";
import { criarBarraVital } from "./vital.js?v=20261122c";

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
    .select("id, nome, tipo, dono, publica, og_calc, fg_calc, abv_calc_pct, ibu_calc, cor_srm_calc, atualizado_em, estilo:estilos(nome, codigo)")
    .order("atualizado_em", { ascending: false }).range(0, 1999);
  if (error) { preencher(corpo, el("p", { class: "erro-form", text: mensagemErro(error) })); return; }
  const receitas = data;

  function desenhar() {
    const t = filtro.texto.trim().toLowerCase();
    const lista = receitas.filter((r) => (filtro.quais === "minhas" ? r.dono === sessao.usuario.id : r.dono !== sessao.usuario.id))
      .filter((r) => !t || `${r.nome} ${r.estilo?.nome ?? ""} ${r.estilo?.codigo ?? ""}`.toLowerCase().includes(t));
    if (!lista.length) {
      preencher(corpo, el("p", { class: "nota", text: filtro.quais === "minhas" ? "Nenhuma receita ainda. Use “Nova receita”." : "Nenhuma receita pública de outros usuários." }));
      return;
    }
    preencher(corpo, el("table", { class: "tabela" },
      el("thead", {}, el("tr", {}, ["", "Nome", "Estilo", "OG", "FG", "ABV", "IBU", `Cor (${O.unidadeCor()})`, "Atualizada", ""].map((h, i) => el("th", { class: i >= 3 && i <= 7 ? "num" : "", text: h })))),
      el("tbody", {}, lista.map((r) => el("tr", {
        class: "clicavel", tabindex: 0,
        on: { click: () => { location.hash = `#/receita/${r.id}`; }, keydown: (e) => { if (e.key === "Enter") location.hash = `#/receita/${r.id}`; } },
      },
      el("td", {}, amostraCor(r.cor_srm_calc ?? 0)),
      el("td", {}, el("strong", { text: r.nome }), r.publica ? el("span", { class: "selo", text: "pública" }) : null),
      el("td", { text: r.estilo ? `${r.estilo.codigo ? r.estilo.codigo + " " : ""}${r.estilo.nome}` : "" }),
      el("td", { class: "num", text: numeroBR(r.og_calc, 3) }),
      el("td", { class: "num", text: numeroBR(r.fg_calc, 3) }),
      el("td", { class: "num", text: r.abv_calc_pct == null ? "" : `${numeroBR(r.abv_calc_pct, 1)}%` }),
      el("td", { class: "num", text: numeroBR(r.ibu_calc, 0) }),
      el("td", { class: "num", text: r.cor_srm_calc == null ? "" : numeroBR(O.corParaTela(r.cor_srm_calc), 1) }),
      el("td", { text: dataBR(r.atualizado_em) }),
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

export async function telaEditor(conteudo, id) {
  editor.sujo = false;
  preencher(conteudo, el("p", { class: "nota", text: "Carregando…" }));
  const [cat, rec] = await Promise.all([
    Promise.all(["estilos", "equipamentos", "fermentaveis", "lupulos", "leveduras", "outros"].map((t) => listarCadastro(t)))
      .then(([estilos, equipamentos, fermentaveis, lupulos, leveduras, outros]) => ({ estilos, equipamentos, fermentaveis, lupulos, leveduras, outros })),
    id && id !== "nova" ? carregarReceita(id) : Promise.resolve(null),
  ]);
  if (id && id !== "nova" && !rec) {
    preencher(conteudo, el("p", { class: "erro-form", text: "Receita não encontrada (ou sem acesso)." }), el("a", { href: "#/receitas", text: "Voltar às receitas" }));
    return;
  }
  const r = rec ?? PADRAO();
  if (!rec && cat.equipamentos.length === 1) aplicarEquipamento(r, cat.equipamentos[0]);
  const leitura = Boolean(rec) && rec.dono !== sessao.usuario.id;
  montarEditor(conteudo, r, cat, leitura);
}

function aplicarEquipamento(r, eq) {
  r.equipamento_id = eq.id;
  for (const k of PARAMETROS_EQUIPAMENTO) if (eq[k] !== null && eq[k] !== undefined) r[k] = Number(eq[k]);
}

function montarEditor(conteudo, r, cat, leitura) {
  const calculados = new Map();      // item → célula com valor calculado (% do açúcar, IBU)
  const vital = criarBarraVital();
  const painel = el("aside", { class: "painel-lote" });
  const resumoLote = el("span", { class: "resumo-texto" });
  const secoes = {};
  const des = leitura;
  let montado = false;            // antes de montar, os cálculos não contam como "mudança" (sem diferença na barra)

  const mudou = () => {
    if (!leitura) editor.sujo = true;
    atualizarResultados();
  };

  // ---------- resultados: barra vital + painel "Lote e água" ----------
  const blocoPainel = (titulo, aberto) => el("details", { class: "cartao bloco-painel", open: aberto }, el("summary", { text: titulo }));
  const celular = window.matchMedia("(max-width: 640px)").matches;
  const pNumeros = blocoPainel("Mais números", !celular);
  const pVolumes = blocoPainel("Volumes", !celular);
  const pAgua = blocoPainel("Água", !celular);
  const pNotas = el("div", { class: "notas-painel" });
  preencher(painel, pNumeros, pVolumes, pAgua, pNotas);
  const corpoBloco = (bloco, ...linhas) => { while (bloco.children.length > 1) bloco.lastChild.remove(); bloco.append(...linhas); };
  const linha = (rot, valor) => el("div", { class: "metrica" }, el("span", { class: "rot", text: rot }), el("span", { class: "val", text: valor }));

  function atualizarResultados() {
    const res = calcularReceita(r);
    res.fermentaveis.forEach((x, i) => { const c = calculados.get(r.fermentaveis[i]); if (c) c.textContent = `${numeroBR(x.pct_acucar, 0)}%`; });
    res.lupulos.forEach((x, i) => { const c = calculados.get(r.lupulos[i]); if (c) c.textContent = numeroBR(x.ibu, 1); });
    const estilo = cat.estilos.find((e) => e.id === r.estilo_id);
    vital.atualizar(res, estilo, { mudanca: montado && !leitura });
    const v = res.volumes;
    corpoBloco(pNumeros,
      linha("OG em °Plato", `${numeroBR(platoDeSg(res.og), 1)} °P`),
      linha("FG em °Plato", `${numeroBR(platoDeSg(res.fg), 1)} °P`),
      linha("Gravidade pré-fervura", numeroBR(res.sg_pre_fervura, 3)));
    corpoBloco(pVolumes,
      linha("Pré-fervura", `${numeroBR(v.pre_fervura_l, 1)} L`),
      linha("Pós-fervura", `${numeroBR(v.pos_fervura_l, 1)} L`),
      linha("No fermentador", `${numeroBR(v.lote_l, 1)} L`),
      linha("Grãos na mostura", `${numeroBR(v.graos_kg, 2)} kg`));
    corpoBloco(pAgua,
      linha("Água total", `${numeroBR(v.agua_total_l, 1)} L`),
      linha("Água da mostura", `${numeroBR(v.agua_mostura_l, 1)} L`),
      linha("Água de lavagem", `${numeroBR(v.agua_lavagem_l, 1)} L`));
    preencher(pNotas,
      estilo ? el("p", { class: "nota", text: `Comparando com ${estilo.codigo ? estilo.codigo + " " : ""}${estilo.nome}.` }) : el("p", { class: "nota", text: "Escolha um estilo no topo para ver as faixas." }),
      el("p", { class: "nota", text: "IBU só da fervura e do primeiro mosto (whirlpool e dry hop não entram no Tinseth)." }));
    const eq = cat.equipamentos.find((e) => e.id === r.equipamento_id);
    resumoLote.textContent = [
      `${numeroBR(r.volume_lote_l, 1)} L no fermentador`,
      `${numeroBR(r.eficiencia_pct, 0)}% de eficiência`,
      `${numeroBR(r.fervura_min, 0)} min de fervura`,
      eq ? eq.nome : null,
    ].filter(Boolean).join(" · ");
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

  async function salvar(comoCopia = false) {
    msg.textContent = "";
    const problemas = validar(r);
    if (problemas.length) { msg.textContent = problemas.join(" "); return; }
    const res = calcularReceita(r);
    const p = montarPayload(r, res);
    if (comoCopia) {
      // Na cópia de receita de outra pessoa, só fica a ligação com o que eu enxergo (os dados já vão copiados).
      const visivel = (lista, id) => (id && lista.some((x) => x.id === id) ? id : null);
      Object.assign(p, { id: null, nome: `${r.nome} (cópia)`, publica: false, estilo_id: visivel(cat.estilos, r.estilo_id), equipamento_id: visivel(cat.equipamentos, r.equipamento_id) });
      p.fermentaveis.forEach((x) => { x.fermentavel_id = visivel(cat.fermentaveis, x.fermentavel_id); });
      p.lupulos.forEach((x) => { x.lupulo_id = visivel(cat.lupulos, x.lupulo_id); });
      p.leveduras.forEach((x) => { x.levedura_id = visivel(cat.leveduras, x.levedura_id); });
      p.outros.forEach((x) => { x.outro_id = visivel(cat.outros, x.outro_id); });
    }
    botaoSalvar.disabled = true;
    const { data, error } = await sb.rpc("salvar_receita", { p });
    botaoSalvar.disabled = false;
    if (error) { msg.textContent = mensagemErro(error); return; }
    editor.sujo = false;
    avisar(comoCopia ? "Cópia criada." : "Receita salva.");
    r.id = data;
    if (location.hash !== `#/receita/${data}`) location.hash = `#/receita/${data}`;   // recarrega o editor
  }

  const acoes = el("div", { class: "acoes-receita" },
    leitura ? el("span", { class: "selo", text: "Somente leitura (receita de outro usuário)" }) : botaoSalvar,
    r.id ? el("button", { type: "button", class: "secundario", text: leitura ? "Duplicar para mim" : "Duplicar", on: { click: async () => {
      if (!leitura && editor.sujo && !(await confirmar("Salvar as alterações antes? A cópia é feita do que está na tela."))) return;
      salvar(true);
    } } }) : null,
    el("a", { href: "#/receitas", class: "botao secundario", text: "Voltar" }));

  const estiloCampo = el("label", { class: "estilo-topo" }, el("span", { text: "Estilo" }), campoSelect(r, "estilo_id",
    cat.estilos.map((e) => [e.id, `${e.codigo ? e.codigo + " " : ""}${e.nome}${e.dono ? " (meu)" : ""}`]), { aoMudar: mudou, desabilitado: des, vazio: "— sem estilo —", rotulo: "Estilo" }));

  const geral = el("section", { class: "cartao" },
    el("h3", { text: "Dados gerais" }),
    el("div", { class: "grade-form" },
      el("label", {}, el("span", { text: "Tipo" }), campoSelect(r, "tipo", O.TIPO_RECEITA, { aoMudar: mudou, desabilitado: des, rotulo: "Tipo" })),
      el("label", {}, el("span", { text: "Autor" }), campoTexto(r, "autor", { aoMudar: mudou, desabilitado: des, max: 80, rotulo: "Autor" })),
      el("label", { class: "linha" }, el("input", { type: "checkbox", checked: r.publica, disabled: des, on: { change: (e) => { r.publica = e.target.checked; mudou(); } } }),
        "Pública (outros usuários podem ver e duplicar)")));

  const equipamentoCampo = el("div", { class: "grade-form" },
    el("label", {}, el("span", { text: "Equipamento" }), campoSelect(r, "equipamento_id",
      cat.equipamentos.map((e) => [e.id, e.nome]), {
        desabilitado: des, vazio: cat.equipamentos.length ? "— nenhum —" : "— cadastre em Cadastros —", rotulo: "Equipamento",
        aoMudar: () => {
          const eq = cat.equipamentos.find((e) => e.id === r.equipamento_id);
          if (eq) { aplicarEquipamento(r, eq); desenharParametros(); avisar("Parâmetros copiados do equipamento."); }
          mudou();
        },
      })));

  const parametros = el("div", { class: "grade-form" });
  function desenharParametros() {
    const p = (k, rot, casas) => el("label", {}, el("span", { text: rot }), campoNumero(r, k, { casas, aoMudar: mudou, desabilitado: des, rotulo: rot }));
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

  // Lote: uma linha de resumo; os parâmetros abrem ao clicar. Receita nova sem equipamento já abre (falta o volume).
  const lote = el("details", { class: "cartao lote", open: !r.id && !r.equipamento_id && !leitura },
    el("summary", {}, el("span", { class: "resumo-titulo", text: "Lote" }), resumoLote, el("span", { class: "resumo-acao", "aria-hidden": "true" })),
    equipamentoCampo,
    parametros);

  conteudo.classList.add("com-vital");
  preencher(conteudo,
    el("div", { class: "editor-topo" }, nomeInput, estiloCampo, acoes),
    msg,
    vital.elemento,
    el("div", { class: "editor" },
      el("div", { class: "editor-corpo" },
        lote, fermentaveis, lupulos, leveduras, outros, mostura, fermentacao, geral, notas),
      painel));
  atualizarResultados();
  montado = true;
  if (!r.id && !leitura) nomeInput.focus();
}

/** Dá nome acessível ao campo da tabela (o cabeçalho da coluna). */
function comRotulo(n, rot) {
  if (n instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(n.tagName) && !n.getAttribute("aria-label")) n.setAttribute("aria-label", rot);
  return n;
}

const num0 = (v, padrao = 0) => (v === null || v === undefined ? padrao : Number(v));

function validar(r) {
  const p = [];
  if (!String(r.nome ?? "").trim()) p.push("Dê um nome à receita.");
  if (!(r.volume_lote_l > 0)) p.push("Volume no fermentador deve ser maior que zero.");
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
      "perda_panela_l", "absorcao_grao_l_kg", "relacao_agua_grao_l_kg", "perda_tina_l", "temp_grao_c", "publica", "notas"]),
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
