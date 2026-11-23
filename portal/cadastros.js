// cadastros.js — telas de cadastro (ingredientes, estilos, águas, equipamentos), todas pelo mesmo formulário.
import { el, limpar, preencher, avisar, mensagemErro, confirmar, numeroBR, campoNumero, campoTexto, campoSelect, info } from "./ui.js?v=20261123o";
import { sb, sessao } from "./estado.js?v=20261123o";
import * as O from "./opcoes.js?v=20261123o";
import { corHexDeSrm } from "./calculos.js?v=20261123o";
import { buscarItens, ordemCodigo } from "./busca.js?v=20261123o";
import { fonteDados, seloFonte, blocoFonte } from "./fontes.js?v=20261123o";

// Cadastros de ingrediente: mostram de onde vêm os dados (fabricante, genérico, análise, meu).
const INGREDIENTES = new Set(["fermentaveis", "lupulos", "leveduras", "outros"]);

// Tipos de campo: texto | numero (casas) | cor (SRM no banco) | select (opcoes) | bool | area
export const CADASTROS = {
  fermentaveis: {
    titulo: "Fermentáveis", catalogo: true,
    campos: [
      { k: "nome", r: "Nome", t: "texto", obrig: true, largo: true },
      { k: "tipo", r: "Tipo", t: "select", opcoes: O.TIPO_FERMENTAVEL, obrig: true },
      { k: "grupo", r: "Grupo", t: "select", opcoes: O.GRUPO_FERMENTAVEL },
      { k: "produtor", r: "Produtor", t: "texto" },
      { k: "origem", r: "Origem", t: "texto" },
      { k: "rendimento_pct", r: "Rendimento (% base seca)", t: "numero", casas: 1, obrig: true },
      { k: "umidade_pct", r: "Umidade (%)", t: "numero", casas: 1 },
      { k: "cor_srm", r: "Cor", t: "cor", casas: 1, obrig: true },
      { k: "fermentavel_pct", r: "Fermentável (%)", t: "numero", casas: 0, dica: "Lactose = 0" },
      { k: "max_lote_pct", r: "Máx. no lote (%)", t: "numero", casas: 0 },
      { k: "precisa_mostura", r: "Precisa de mostura", t: "bool" },
      { k: "notas", r: "Notas", t: "area" },
    ],
    novo: () => ({ tipo: "GRAO", rendimento_pct: 80, umidade_pct: 4, cor_srm: 2, fermentavel_pct: 100, precisa_mostura: true }),
    colunas: [["nome", "Nome"], ["tipo", "Tipo", (v) => O.rotulo(O.TIPO_FERMENTAVEL, v)], ["cor_srm", "Cor", "cor"], ["rendimento_pct", "Rend. %", 1], ["produtor", "Produtor"]],
  },
  lupulos: {
    titulo: "Lúpulos", catalogo: true,
    campos: [
      { k: "nome", r: "Nome", t: "texto", obrig: true, largo: true },
      { k: "forma", r: "Forma", t: "select", opcoes: O.FORMA_LUPULO, obrig: true },
      { k: "alfa_pct", r: "Alfa ácido (%)", t: "numero", casas: 1, obrig: true },
      { k: "beta_pct", r: "Beta ácido (%)", t: "numero", casas: 1 },
      { k: "uso", r: "Uso", t: "select", opcoes: O.USO_LUPULO },
      { k: "origem", r: "Origem", t: "texto" },
      { k: "produtor", r: "Produtor", t: "texto" },
      { k: "ano", r: "Safra", t: "numero", casas: 0 },
      { k: "oleo_ml_100g", r: "Óleos (mL/100 g)", t: "numero", casas: 1 },
      { k: "substitutos", r: "Substitutos", t: "texto", largo: true },
      { k: "notas", r: "Notas", t: "area" },
    ],
    novo: () => ({ forma: "PELLET", alfa_pct: 5 }),
    colunas: [["nome", "Nome"], ["alfa_pct", "Alfa %", 1], ["forma", "Forma", (v) => O.rotulo(O.FORMA_LUPULO, v)], ["uso", "Uso", (v) => O.rotulo(O.USO_LUPULO, v)], ["origem", "Origem"]],
  },
  leveduras: {
    titulo: "Leveduras", catalogo: true,
    campos: [
      { k: "nome", r: "Nome", t: "texto", obrig: true, largo: true },
      { k: "produtor", r: "Produtor", t: "texto" },
      { k: "codigo_produto", r: "Código", t: "texto" },
      { k: "tipo", r: "Tipo", t: "select", opcoes: O.TIPO_LEVEDURA, obrig: true },
      { k: "forma", r: "Forma", t: "select", opcoes: O.FORMA_LEVEDURA, obrig: true },
      { k: "atenuacao_min_pct", r: "Atenuação mín. (%)", t: "numero", casas: 0 },
      { k: "atenuacao_max_pct", r: "Atenuação máx. (%)", t: "numero", casas: 0 },
      { k: "temp_min_c", r: "Temp. mín. (°C)", t: "numero", casas: 1 },
      { k: "temp_max_c", r: "Temp. máx. (°C)", t: "numero", casas: 1 },
      { k: "floculacao", r: "Floculação", t: "select", opcoes: O.FLOCULACAO },
      { k: "tolerancia_alcool_pct", r: "Tolerância ao álcool (%)", t: "numero", casas: 1 },
      { k: "pof", r: "POF+ (fenólica)", t: "bool" },
      { k: "notas", r: "Notas", t: "area" },
    ],
    novo: () => ({ tipo: "ALE", forma: "SECA" }),
    colunas: [["nome", "Nome"], ["produtor", "Produtor"], ["tipo", "Tipo", (v) => O.rotulo(O.TIPO_LEVEDURA, v)],
      ["atenuacao_min_pct", "Atenuação", (v, x) => faixa(x.atenuacao_min_pct, x.atenuacao_max_pct, 0, "%")],
      ["temp_min_c", "Temp.", (v, x) => faixa(x.temp_min_c, x.temp_max_c, 0, " °C")]],
  },
  outros: {
    titulo: "Outros", catalogo: true,
    campos: [
      { k: "nome", r: "Nome", t: "texto", obrig: true, largo: true },
      { k: "tipo", r: "Tipo", t: "select", opcoes: O.TIPO_OUTRO, obrig: true },
      { k: "uso_para", r: "Uso", t: "texto", largo: true },
      { k: "notas", r: "Notas", t: "area" },
    ],
    novo: () => ({ tipo: "OUTRO" }),
    colunas: [["nome", "Nome"], ["tipo", "Tipo", (v) => O.rotulo(O.TIPO_OUTRO, v)], ["uso_para", "Uso"]],
  },
  estilos: {
    titulo: "Estilos", catalogo: true, ordem: ["codigo", "nome"],
    campos: [
      { k: "nome", r: "Nome", t: "texto", obrig: true, largo: true },
      { k: "guia", r: "Guia", t: "texto" },
      { k: "codigo", r: "Código", t: "texto" },
      { k: "categoria", r: "Categoria", t: "texto", largo: true },
      { k: "tipo", r: "Tipo", t: "select", opcoes: O.TIPO_ESTILO },
      { k: "og_min", r: "OG mín.", t: "numero", casas: 3 }, { k: "og_max", r: "OG máx.", t: "numero", casas: 3 },
      { k: "fg_min", r: "FG mín.", t: "numero", casas: 3 }, { k: "fg_max", r: "FG máx.", t: "numero", casas: 3 },
      { k: "ibu_min", r: "IBU mín.", t: "numero", casas: 0 }, { k: "ibu_max", r: "IBU máx.", t: "numero", casas: 0 },
      { k: "cor_srm_min", r: "Cor mín.", t: "cor", casas: 1 }, { k: "cor_srm_max", r: "Cor máx.", t: "cor", casas: 1 },
      { k: "abv_min_pct", r: "ABV mín. (%)", t: "numero", casas: 1 }, { k: "abv_max_pct", r: "ABV máx. (%)", t: "numero", casas: 1 },
      { k: "co2_min_vol", r: "CO₂ mín. (vol)", t: "numero", casas: 1 }, { k: "co2_max_vol", r: "CO₂ máx. (vol)", t: "numero", casas: 1 },
      { k: "notas", r: "Notas", t: "area" },
    ],
    novo: () => ({ guia: "Próprio", tipo: "CERVEJA" }),
    colunas: [["codigo", "Código"], ["nome", "Nome"], ["og_min", "OG", (v, x) => faixa(x.og_min, x.og_max, 3)],
      ["ibu_min", "IBU", (v, x) => faixa(x.ibu_min, x.ibu_max, 0)], ["guia", "Guia"]],
  },
  aguas: {
    titulo: "Águas", catalogo: true,
    campos: [
      { k: "nome", r: "Nome", t: "texto", obrig: true, largo: true },
      { k: "calcio_ppm", r: "Cálcio (ppm)", t: "numero", casas: 1 }, { k: "magnesio_ppm", r: "Magnésio (ppm)", t: "numero", casas: 1 },
      { k: "sodio_ppm", r: "Sódio (ppm)", t: "numero", casas: 1 }, { k: "sulfato_ppm", r: "Sulfato (ppm)", t: "numero", casas: 1 },
      { k: "cloreto_ppm", r: "Cloreto (ppm)", t: "numero", casas: 1 }, { k: "bicarbonato_ppm", r: "Bicarbonato (ppm)", t: "numero", casas: 1 },
      { k: "ph", r: "pH", t: "numero", casas: 2 },
      { k: "notas", r: "Notas", t: "area" },
    ],
    novo: () => ({ calcio_ppm: 0, magnesio_ppm: 0, sodio_ppm: 0, sulfato_ppm: 0, cloreto_ppm: 0, bicarbonato_ppm: 0 }),
    colunas: [["nome", "Nome"], ["calcio_ppm", "Ca", 0], ["sulfato_ppm", "SO₄", 0], ["cloreto_ppm", "Cl", 0], ["bicarbonato_ppm", "HCO₃", 0]],
  },
  equipamentos: {
    titulo: "Equipamentos", catalogo: false,
    campos: [
      { k: "nome", r: "Nome", t: "texto", obrig: true, largo: true },
      { k: "volume_lote_l", r: "Volume no fermentador (L)", t: "numero", casas: 1, obrig: true },
      { k: "volume_panela_l", r: "Volume da panela (L)", t: "numero", casas: 1 },
      { k: "eficiencia_pct", r: "Eficiência (%)", t: "numero", casas: 0, obrig: true },
      { k: "evaporacao_l_h", r: "Evaporação (L/h)", t: "numero", casas: 1, obrig: true },
      { k: "perda_panela_l", r: "Perda na panela (L)", t: "numero", casas: 1 },
      { k: "perda_tina_l", r: "Perda na tina (L)", t: "numero", casas: 1 },
      { k: "perda_fermentador_l", r: "Perda no fermentador (L)", t: "numero", casas: 1 },
      { k: "absorcao_grao_l_kg", r: "Absorção do grão (L/kg)", t: "numero", casas: 2 },
      { k: "relacao_agua_grao_l_kg", r: "Água/grão na mostura (L/kg)", t: "numero", casas: 1 },
      { k: "notas", r: "Notas", t: "area" },
    ],
    novo: () => ({ volume_lote_l: 20, eficiencia_pct: 72, evaporacao_l_h: 3, perda_panela_l: 1, perda_tina_l: 0, perda_fermentador_l: 0.5, absorcao_grao_l_kg: 1, relacao_agua_grao_l_kg: 3 }),
    colunas: [["nome", "Nome"], ["volume_lote_l", "Fermentador (L)", 1], ["eficiencia_pct", "Efic. %", 0], ["evaporacao_l_h", "Evap. L/h", 1]],
  },
};

function faixa(a, b, casas, suf = "") {
  if (a == null && b == null) return "";
  return `${numeroBR(a, casas)}–${numeroBR(b, casas)}${suf}`;
}

/** Lista (sistema + do usuário) de um cadastro, para os selects do editor de receita. */
export async function listarCadastro(tabela) {
  const ordem = CADASTROS[tabela]?.ordem ?? ["nome"];
  let q = sb.from(tabela).select("*");
  for (const c of ordem) q = q.order(c, { ascending: true, nullsFirst: false });
  const { data, error } = await q.range(0, 4999);
  if (error) throw error;
  return data;
}

const podeEditar = (item) => item.dono === sessao.usuario.id || (item.dono === null && sessao.admin);

export async function telaCadastros(conteudo, chave) {
  const def = CADASTROS[chave];
  const filtro = { texto: "" };
  const abas = el("nav", { class: "abas" },
    Object.entries(CADASTROS).map(([k, d]) => el("a", { href: `#/cadastros/${k}`, class: k === chave ? "ativo" : "", text: d.titulo })));
  const corpo = el("div", { class: "tabela-rolagem" }, el("p", { class: "nota", text: "Carregando…" }));
  preencher(conteudo, 
    el("h2", { text: "Cadastros" }), abas,
    el("div", { class: "barra" },
      el("input", { type: "search", placeholder: chave === "estilos" ? "Buscar estilo: 21A, pils, trigo, belga…" : `Buscar em ${def.titulo.toLowerCase()}`, "aria-label": "Buscar", on: { input: (e) => { filtro.texto = e.target.value; desenhar(); } } }),
      el("button", { type: "button", text: "Novo", on: { click: () => abrirFormulario(chave, def.novo(), recarregar) } })),
    def.catalogo ? el("p", { class: "nota", text: INGREDIENTES.has(chave)
      ? "Fonte: “Fabricante” = ficha técnica da própria marca; “Análise” = laboratório/pesquisa; “Genérico” = valores típicos, não de uma marca; “Meu” = cadastrado por você (só você vê). Itens do catálogo comum só o admin altera."
      : "Itens “Sistema” são do catálogo comum (todos veem; só o admin altera). Os seus só você vê." }) : null,
    corpo);

  let itens = [];
  async function recarregar() {
    try {
      itens = await listarCadastro(chave);
      desenhar();
    } catch (e) {
      preencher(corpo, el("p", { class: "erro-form", text: mensagemErro(e) }));
    }
  }
  function desenhar() {
    const t = filtro.texto.trim().toLowerCase();
    // Estilos: a mesma busca do editor (código, nome, categoria, termos em português, sem acento), em ordem de código.
    const lista = chave === "estilos" ? buscarItens([...itens].sort(ordemCodigo), "estilos", t)
      : t ? itens.filter((x) => def.colunas.some(([k]) => String(x[k] ?? "").toLowerCase().includes(t))) : itens;
    const cab = el("tr", {}, def.colunas.map(([, r, f]) => el("th", { class: typeof f === "number" || f === "cor" ? "num" : "", text: f === "cor" ? `${r} (${O.unidadeCor()})` : r })),
      def.catalogo ? el("th", { text: INGREDIENTES.has(chave) ? "Fonte" : "Origem" }) : null);
    const linhas = lista.map((x) => el("tr", { class: "clicavel", tabindex: 0, on: { click: () => abrirFormulario(chave, x, recarregar), keydown: (e) => { if (e.key === "Enter") abrirFormulario(chave, x, recarregar); } } },
      def.colunas.map(([k, , f]) => {
        if (f === "cor") return el("td", { class: "num" }, amostraCor(x[k]), numeroBR(O.corParaTela(x[k]), 1));
        if (typeof f === "number") return el("td", { class: "num", text: numeroBR(x[k], f) });
        if (typeof f === "function") return el("td", { text: f(x[k], x) });
        return el("td", { text: x[k] ?? "" });
      }),
      def.catalogo ? el("td", {}, INGREDIENTES.has(chave) ? seloFonte(fonteDados(x))
        : el("span", { class: x.dono ? "selo meu" : "selo", text: x.dono ? "Meu" : "Sistema" })) : null));
    preencher(corpo, lista.length
      ? el("table", { class: "tabela" }, el("thead", {}, cab), el("tbody", {}, linhas))
      : el("p", { class: "nota", text: itens.length ? "Nada encontrado." : "Nenhum item ainda. Use “Novo”." }));
  }
  await recarregar();
}

export function amostraCor(srm) {
  const s = el("span", { class: "amostra", "aria-hidden": "true" });
  s.style.background = corHexDeSrm(srm);   // CSSOM (não é atributo style): permitido pela CSP
  return s;
}

function campo(obj, c, desabilitado) {
  const comum = { desabilitado, rotulo: c.r };
  if (c.t === "texto") return campoTexto(obj, c.k, comum);
  if (c.t === "numero") return campoNumero(obj, c.k, { ...comum, casas: c.casas ?? 2 });
  if (c.t === "cor") return campoNumero(obj, c.k, { ...comum, casas: c.casas ?? 1, de: O.corParaTela, para: O.corDaTela });
  if (c.t === "select") return campoSelect(obj, c.k, c.opcoes, { ...comum, vazio: c.obrig ? undefined : "—" });
  if (c.t === "bool") return el("input", { type: "checkbox", checked: obj[c.k], disabled: desabilitado, "aria-label": c.r, on: { change: (e) => { obj[c.k] = e.target.checked; } } });
  if (c.t === "area") return el("textarea", { rows: 3, disabled: desabilitado, maxlength: 4000, "aria-label": c.r, value: obj[c.k] ?? "", on: { input: (e) => { obj[c.k] = e.target.value; } } });
  return null;
}

function abrirFormulario(chave, item, aoSalvar) {
  const def = CADASTROS[chave];
  const novo = !item.id;
  const editavel = novo || podeEditar(item);
  const dados = structuredClone(item);
  const sistema = { valor: false };
  const msg = el("p", { class: "erro-form", role: "alert" });

  const d = el("dialog", { class: "formulario" },
    el("form", {
      method: "dialog",
      on: {
        submit: async (e) => {
          e.preventDefault();
          const falta = def.campos.filter((c) => c.obrig && (dados[c.k] === null || dados[c.k] === undefined || String(dados[c.k]).trim() === ""));
          if (falta.length) { msg.textContent = `Preencha: ${falta.map((c) => c.r).join(", ")}.`; return; }
          const registro = Object.fromEntries(def.campos.map((c) => [c.k, typeof dados[c.k] === "string" ? dados[c.k].trim() || null : dados[c.k] ?? null]));
          for (const c of def.campos) if (c.t === "bool") registro[c.k] = Boolean(dados[c.k]);
          let resp;
          if (novo) {
            if (def.catalogo && sessao.admin && sistema.valor) registro.dono = null;
            resp = await sb.from(chave).insert(registro).select("id");
          } else {
            resp = await sb.from(chave).update(registro).eq("id", item.id).select("id");
          }
          if (resp.error) { msg.textContent = mensagemErro(resp.error); return; }
          if (!resp.data?.length) { msg.textContent = "Não foi possível salvar (sem permissão)."; return; }
          d.close();
          avisar("Salvo.");
          aoSalvar();
        },
      },
    },
    el("h3", { text: `${novo ? "Novo" : editavel ? "Editar" : "Ver"} — ${def.titulo}` }),
    !novo && INGREDIENTES.has(chave) ? blocoFonte(fonteDados(item)) : null,
    !editavel ? el("p", { class: "nota", text: "Item do catálogo do sistema: só o admin altera. Para mudar algo, crie um seu." }) : null,
    el("div", { class: "grade-form" },
      def.campos.map((c) => el("label", { class: c.largo || c.t === "area" ? "largo" : c.t === "bool" ? "linha" : "" },
        el("span", {}, c.r, c.obrig ? " *" : "", c.t === "cor" ? ` (${O.unidadeCor()})` : "", chave === "equipamentos" ? info(O.AJUDA_VOLUME[c.k]) : null),
        campo(dados, c, !editavel),
        c.dica ? el("small", { text: c.dica }) : null))),
    novo && def.catalogo && sessao.admin
      ? el("label", { class: "linha" }, el("input", { type: "checkbox", on: { change: (e) => { sistema.valor = e.target.checked; } } }), "Catálogo do sistema (todos os usuários veem)")
      : null,
    msg,
    el("div", { class: "acoes" },
      !novo && editavel ? el("button", {
        type: "button", class: "perigo", text: "Excluir",
        on: {
          click: async () => {
            if (!(await confirmar(`Excluir “${item.nome}”? Receitas que usam este item mantêm a cópia dos dados.`, { ok: "Excluir", perigo: true }))) return;
            const { error, data } = await sb.from(chave).delete().eq("id", item.id).select("id");
            if (error) { msg.textContent = mensagemErro(error); return; }
            if (!data?.length) { msg.textContent = "Não foi possível excluir (sem permissão)."; return; }
            d.close();
            avisar("Excluído.");
            aoSalvar();
          },
        },
      }) : null,
      el("span", { class: "espaco" }),
      el("button", { type: "button", class: "secundario", text: editavel ? "Cancelar" : "Fechar", on: { click: () => d.close() } }),
      editavel ? el("button", { type: "submit", text: "Salvar" }) : null)));
  d.addEventListener("close", () => d.remove());
  document.body.append(d);
  d.showModal();
}
