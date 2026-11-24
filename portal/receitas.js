// receitas.js — lista de receitas e editor com cálculo ao vivo (calculos.js).
import { el, limpar, preencher, avisar, mensagemErro, confirmar, numeroBR, campoNumero, campoTexto, campoSelect, campoQuantidade, editarCampo, info } from "./ui.js?v=20261124h";
import { roletaAberta, fecharRoleta } from "./roleta.js?v=20261124h";
import { FAIXAS_LUGAR, faixaCor, presetFermentavel, presetLupulo } from "./faixas.js?v=20261124h";
import { sb, sessao, preferencias } from "./estado.js?v=20261124h";
import { calcularReceita, platoDeSg, corHexDeSrm, corHexDeMalte, TEMPERATURA_WHIRLPOOL_PADRAO_C, IONS, leituraSulfatoCloreto, etapaSal, separarSaisAntigos } from "./calculos.js?v=20261124h";
import { abrirBusca } from "./busca.js?v=20261124h";
import { abrirAlvoOG, abrirAlvoIBU } from "./alvos.js?v=20261124h";
import { listarCadastro, amostraCor } from "./cadastros.js?v=20261124h";
import { fonteNaReceita, blocoFonte } from "./fontes.js?v=20261124h";
import * as O from "./opcoes.js?v=20261124h";
import { criarBarraVital, manterAcimaDaBarra, copo } from "./vital.js?v=20261124h";
import { icone } from "./icones.js?v=20261124h";
import { barraGrist, linhaFervura } from "./graficos.js?v=20261124h";
import { abrirRelatorio } from "./relatorio.js?v=20261124h";
import { blocoFotos, apagarFotosDaReceita } from "./fotos.js?v=20261124h";

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
    const abrir = (r) => { location.hash = `#/receita/${r.id}`; };
    const estiloTxt = (r) => (r.estilo ? `${r.estilo.codigo ? r.estilo.codigo + " " : ""}${r.estilo.nome}` : "");

    // Celular: cartões (copo na cor da cerveja, nº e nome, estilo e data, números principais). Computador: tabela.
    if (celular.matches) {
      preencher(corpo, el("ol", { class: "lista-receitas" }, lista.map((r) => {
        const vidro = copo();
        vidro.cerveja.setAttribute("fill", corHexDeSrm(r.cor_srm_calc ?? 0));
        const numeros = [
          r.og_calc != null ? `OG ${numeroBR(r.og_calc, 3)}` : null,
          r.abv_calc_pct != null ? `${numeroBR(r.abv_calc_pct, 1)}%` : null,
          r.ibu_calc != null ? `${numeroBR(r.ibu_calc, 0)} IBU` : null,
          r.cor_srm_calc != null ? `${numeroBR(O.corParaTela(r.cor_srm_calc), 0)} ${O.unidadeCor()}` : null,
        ].filter(Boolean).join(" · ");
        return el("li", {
          class: "receita-cartao", tabindex: 0, role: "link", "aria-label": `${r.lote_numero ? "Nº " + r.lote_numero + ", " : ""}${r.nome}`,
          on: { click: () => abrir(r), keydown: (e) => { if (e.key === "Enter") abrir(r); } },
        },
        el("span", { class: "rc-copo" }, vidro),
        el("div", { class: "rc-corpo" },
          el("div", { class: "rc-topo" },
            r.lote_numero ? el("span", { class: "rc-num", text: `#${r.lote_numero}` }) : null,
            el("strong", { class: "rc-nome", text: r.nome }),
            r.publica ? el("span", { class: "selo", text: "pública" }) : null),
          el("div", { class: "rc-sub", text: [estiloTxt(r), dataDoDia(r.data_brassagem)].filter(Boolean).join(" · ") }),
          numeros ? el("div", { class: "rc-numeros", text: numeros }) : null));
      })));
      return;
    }
    preencher(corpo, el("table", { class: "tabela" },
      el("thead", {}, el("tr", {}, ["", "Nº", "Nome", "Estilo", "Brassagem", "OG", "FG", "ABV", "IBU", `Cor (${O.unidadeCor()})`].map((h, i) => el("th", { class: i === 1 || (i >= 5 && i <= 9) ? "num" : "", text: h })))),
      el("tbody", {}, lista.map((r) => el("tr", {
        class: "clicavel", tabindex: 0,
        on: { click: () => abrir(r), keydown: (e) => { if (e.key === "Enter") abrir(r); } },
      },
      el("td", {}, amostraCor(r.cor_srm_calc ?? 0)),
      el("td", { class: "num", text: r.lote_numero ?? "" }),
      el("td", {}, el("strong", { text: r.nome }), r.publica ? el("span", { class: "selo", text: "pública" }) : null),
      el("td", { text: estiloTxt(r) }),
      el("td", { text: dataDoDia(r.data_brassagem) }),
      el("td", { class: "num", text: numeroBR(r.og_calc, 3) }),
      el("td", { class: "num", text: numeroBR(r.fg_calc, 3) }),
      el("td", { class: "num", text: r.abv_calc_pct == null ? "" : `${numeroBR(r.abv_calc_pct, 1)}%` }),
      el("td", { class: "num", text: numeroBR(r.ibu_calc, 0) }),
      el("td", { class: "num", text: r.cor_srm_calc == null ? "" : numeroBR(O.corParaTela(r.cor_srm_calc), 1) }))))));
  }
  // Troca tabela ↔ cartões quando a tela muda de largura (girar o celular, janela do computador).
  const celular = window.matchMedia("(max-width: 640px)");
  const aoMudarTela = () => { if (corpo.isConnected) desenhar(); else celular.removeEventListener("change", aoMudarTela); };
  celular.addEventListener("change", aoMudarTela);
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
  agua_origem: null, agua_alvo: null, agua_diluicao_pct: null, agua_mostura_l: null, agua_lavagem_l: null, sais: [], acidos: [],
  fermentaveis: [], lupulos: [], leveduras: [], outros: [],
  mostura: [{ nome: "Rampa 1", tipo: "TEMPERATURA", temperatura_c: 66, tempo_min: 60 }],
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
  r.sais = Array.isArray(data.sais) ? data.sais : [];
  r.acidos = Array.isArray(data.acidos) ? data.acidos : [];
  // Receita antiga: sais na água total, sem etapa → um sal na mostura e outro na lavagem (mesmos gramas de antes).
  if (r.sais.some((x) => !x.etapa)) {
    const v = calcularReceita({ ...r, sais: [] }).volumes;
    r.sais = separarSaisAntigos(r.sais, { aguaMostura: v.agua_mostura_l, aguaTotal: v.agua_total_l });
  }
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
    Promise.all(["estilos", "equipamentos", "fermentaveis", "lupulos", "leveduras", "outros", "aguas"].map((t) => listarCadastro(t)))
      .then(([estilos, equipamentos, fermentaveis, lupulos, leveduras, outros, aguas]) => ({ estilos, equipamentos, fermentaveis, lupulos, leveduras, outros, aguas })),
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
  // Tentativas: histórico para desfazer/refazer e a referência fixada. Vive enquanto a receita está aberta
  // (inclusive depois de salvar uma receita que já existia); não vai para o banco.
  const t = { passado: [], futuro: [], base: structuredClone(r), timer: null, ref: null, atalhos: null };
  montarEditor(conteudo, r, cat, leitura, t, { origem: nova ? rec : null });
  if (!leitura) instalarAtalhos(t);
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
    agua_origem: o.agua_origem ?? null, agua_alvo: o.agua_alvo ?? null, agua_diluicao_pct: o.agua_diluicao_pct ?? null,
    agua_mostura_l: o.agua_mostura_l ?? null, agua_lavagem_l: o.agua_lavagem_l ?? null,
    sais: (o.sais ?? []).map((x) => ({ ...x })),
    acidos: (o.acidos ?? []).map((x) => ({ ...x })),
    fermentacao: o.fermentacao.map(sem),
  };
}

/** Ctrl+Z desfaz, Ctrl+Shift+Z (ou Ctrl+Y) refaz — em qualquer campo do editor (o histórico cobre todos). */
let atalhoAtual = null;
function instalarAtalhos(t) {
  if (atalhoAtual) document.removeEventListener("keydown", atalhoAtual);
  atalhoAtual = (e) => {
    if (!t.atalhos || !document.contains(t.atalhos.marcador)) {      // saiu do editor
      document.removeEventListener("keydown", atalhoAtual);
      atalhoAtual = null;
      return;
    }
    if (!(e.ctrlKey || e.metaKey) || e.altKey || document.querySelector("dialog[open]")) return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) { e.preventDefault(); t.atalhos.desfazer(); }
    else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); t.atalhos.refazer(); }
  };
  document.addEventListener("keydown", atalhoAtual);
}

function aplicarEquipamento(r, eq) {
  r.equipamento_id = eq.id;
  for (const k of PARAMETROS_EQUIPAMENTO) if (eq[k] !== null && eq[k] !== undefined) r[k] = Number(eq[k]);
}

function montarEditor(conteudo, r, cat, leitura, t, { resAnterior = null, origem = null } = {}) {
  const calculados = new Map();      // item → função que escreve os valores calculados da linha (% do grist, IBU...)
  let janelaItem = null;             // janela de detalhes aberta: { chave, item, aoCalcular }
  const totais = [];                 // funções que escrevem o total no cabeçalho de cada seção
  const estiloAtual = () => cat.estilos.find((e) => e.id === r.estilo_id);
  /** Título de seção com ícone. */
  const tituloSecao = (nomeIcone, titulo, ...resto) => el("h3", { class: "titulo-secao" }, el("span", { class: "titulo-icone" }, icone(nomeIcone)), titulo, ...resto);

  // ---------- tentativas: desfazer/refazer e referência ----------
  const HISTORICO_MAX = 50;
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  /** Fecha o passo atual do histórico (se a receita mudou desde o último). */
  function registrar() {
    clearTimeout(t.timer);
    t.timer = null;
    if (!leitura && !igual(r, t.base)) {
      t.passado.push(t.base);
      if (t.passado.length > HISTORICO_MAX) t.passado.shift();
      t.futuro = [];
      t.base = structuredClone(r);
    }
    atualizarFerramentas();
  }
  /** Digitação: vira um passo quando a pessoa para (0,8 s) ou muda de campo. Roleta aberta = um passo só, ao fechar. */
  const registrarQuandoLivre = () => { if (roletaAberta()) t.timer = setTimeout(registrarQuandoLivre, 300); else registrar(); };
  function agendarRegistro() {
    clearTimeout(t.timer);
    t.timer = setTimeout(registrarQuandoLivre, 800);
    bDesfazer.disabled = false;
    bDesfazerApp.disabled = false;
  }
  /** Ação inteira (adicionar, remover, mover, ajuste automático) = um passo próprio. */
  function acao(fn) { registrar(); fn(); registrar(); }
  function irPara(estado) {
    const antes = calcularReceita(r);
    Object.assign(r, structuredClone(estado));
    t.base = structuredClone(r);
    editor.sujo = true;
    const y = window.scrollY;
    montarEditor(conteudo, r, cat, leitura, t, { resAnterior: antes, origem });
    window.scrollTo(0, y);
  }
  function desfazer() {
    registrar();
    if (!t.passado.length) return;
    t.futuro.push(structuredClone(r));
    irPara(t.passado.pop());
  }
  function refazer() {
    registrar();
    if (!t.futuro.length) return;
    t.passado.push(structuredClone(r));
    irPara(t.futuro.pop());
  }
  function fixarReferencia() {
    registrar();
    t.ref = { receita: structuredClone(r), res: calcularReceita(r), hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) };
    vital.definirReferencia(t.ref.res);
    atualizarResultados();
    atualizarFerramentas();
  }
  function voltarReferencia() {
    registrar();
    if (igual(r, t.ref.receita)) return;
    t.passado.push(structuredClone(r));
    t.futuro = [];
    irPara(t.ref.receita);
  }
  function soltarReferencia() {
    t.ref = null;
    vital.definirReferencia(null);
    atualizarResultados();
    atualizarFerramentas();
  }
  const bDesfazer = el("button", { type: "button", class: "secundario pequeno", title: "Desfazer (Ctrl+Z)", on: { click: desfazer } }, icone("desfazer"), "Desfazer");
  const bDesfazerApp = el("button", { type: "button", class: "icone app-desfazer", title: "Desfazer", "aria-label": "Desfazer", on: { click: desfazer } }, icone("desfazer"));
  const bRefazer = el("button", { type: "button", class: "secundario pequeno", title: "Refazer (Ctrl+Shift+Z)", on: { click: refazer } }, icone("refazer"), "Refazer");
  const bFixar = el("button", { type: "button", class: "secundario pequeno", text: "Fixar referência", title: "Guarda os números de agora para comparar com as próximas tentativas", on: { click: fixarReferencia } });
  const refInfo = el("span", { class: "ref-info" });
  const bVoltarRef = el("button", { type: "button", class: "secundario pequeno", text: "Voltar à referência", on: { click: voltarReferencia } });
  const bSoltar = el("button", { type: "button", class: "link", text: "Soltar", title: "Parar de comparar", on: { click: soltarReferencia } });
  const ferramentas = leitura ? null : el("div", { class: "vital-ferramentas" },
    bDesfazer, bRefazer, el("span", { class: "separador", "aria-hidden": "true" }), bFixar, refInfo, bVoltarRef, bSoltar);
  function atualizarFerramentas() {
    bDesfazer.disabled = !t.passado.length && !t.timer;
    bDesfazerApp.disabled = bDesfazer.disabled;
    bRefazer.disabled = !t.futuro.length;
    bFixar.hidden = Boolean(t.ref);
    bVoltarRef.hidden = bSoltar.hidden = !t.ref;
    refInfo.textContent = t.ref ? `Comparando com a referência das ${t.ref.hora}` : "";
  }

  const ajustarOG = () => abrirAlvoOG({
    r, estilo: estiloAtual(),
    aoAplicar: (qs) => acao(() => { r.fermentaveis.forEach((f, i) => { f.quantidade_kg = qs[i]; }); secoes.fermentaveis(); mudou("ajuste-og"); avisar("Fermentáveis ajustados. Ctrl+Z desfaz."); }),
  });
  const ajustarIBU = () => abrirAlvoIBU({
    r, estilo: estiloAtual(),
    aoAplicar: (a) => acao(() => { r.lupulos[a.indice].quantidade_g = a.gramas; secoes.lupulos(); mudou("ajuste-ibu"); avisar("Lúpulo ajustado. Ctrl+Z desfaz."); }),
  });
  const vital = criarBarraVital({ aoAjustar: leitura ? {} : { og: ajustarOG, ibu: ajustarIBU }, ferramentas });
  const grist = barraGrist();
  const tempo = linhaFervura({
    aoTocar: (i) => {          // leva à linha do lúpulo e a destaca (sem abrir o teclado)
      const li = document.querySelectorAll('[data-secao="lupulos"] li.ing')[i];
      if (!li) return;
      li.scrollIntoView({ block: "center" });
      li.classList.remove("destaque");
      void li.offsetWidth;
      li.classList.add("destaque");
    },
  });
  t.atalhos = { desfazer, refazer, marcador: vital.elemento };
  const painel = el("aside", { class: "painel-lote" });
  const resumoLote = el("span", { class: "resumo-texto" });
  const secoes = {};
  const des = leitura;
  let montado = false;            // antes de montar, os cálculos não contam como "mudança" (sem diferença na barra)

  /** campo = o campo que mudou (os botões ± não ficam com o foco); sem ele, a barra vital usa o campo em foco. */
  const mudou = (campo) => {
    if (!leitura) { editor.sujo = true; agendarRegistro(); marcarPendente(); }
    atualizarResultados(campo);
  };

  // ---------- resultados: barra vital + painel "Lote e água" ----------
  const blocoPainel = (titulo, aberto) => el("details", { class: "cartao bloco-painel", open: aberto }, el("summary", { text: titulo }));
  const celular = window.matchMedia("(max-width: 640px)").matches;
  const pMedido = blocoPainel("Medido no lote", true);
  const pPriming = blocoPainel("Priming", true);
  const pNumeros = blocoPainel("Mais números", !celular);
  const pVolumes = blocoPainel("Volumes", !celular);
  const pAgua = blocoPainel("Água", !celular);
  const pNotas = el("div", { class: "notas-painel" });
  preencher(painel, pMedido, pPriming, pNumeros, pVolumes, pAgua, pNotas);
  const corpoBloco = (bloco, ...linhas) => { while (bloco.children.length > 1) bloco.lastChild.remove(); bloco.append(...linhas.filter(Boolean)); };
  const linha = (rot, valor, ajuda) => el("div", { class: "metrica" }, el("span", { class: "rot" }, rot, info(ajuda)), el("span", { class: "val", text: valor }));

  const aoRecalcular = [];   // partes do editor que mostram resultado fora do painel (ex.: perfil da água)
  function atualizarResultados(campo) {
    const res = calcularReceita(r);
    for (const f of aoRecalcular) f(res);
    res.fermentaveis.forEach((x, i) => calculados.get(r.fermentaveis[i])?.(x));
    res.lupulos.forEach((x, i) => calculados.get(r.lupulos[i])?.(x));
    if (janelaItem) {
      const x = res[janelaItem.chave]?.[r[janelaItem.chave].indexOf(janelaItem.item)];
      if (x) janelaItem.aoCalcular(x);
    }
    for (const t of totais) t(res);
    const estilo = estiloAtual();
    vital.atualizar(res, estilo, { mudanca: montado && !leitura, campo: campo ?? document.activeElement });
    grist.atualizar(res, r.fermentaveis);
    tempo.atualizar(res, r.lupulos, r.fervura_min);
    const v = res.volumes;
    corpoBloco(pNumeros,
      linha("OG em °Plato", `${numeroBR(platoDeSg(res.og), 1)} °P`),
      linha("FG em °Plato", `${numeroBR(platoDeSg(res.fg), 1)} °P`),
      linha("Gravidade pré-fervura", numeroBR(res.sg_pre_fervura, 3)));
    const medidas = linhasMedido(res, linha);
    pMedido.hidden = !medidas.length;
    corpoBloco(pMedido, ...medidas);
    const priming = painelPriming(res, linha).slice(1);      // sem o título: o bloco já tem
    pPriming.hidden = !priming.length;
    corpoBloco(pPriming, ...priming);
    corpoBloco(pVolumes,
      linha("Pré-fervura", `${numeroBR(v.pre_fervura_l, 1)} L`, O.AJUDA_VOLUME.pre_fervura_l),
      linha("Pós-fervura", `${numeroBR(v.pos_fervura_l, 1)} L`, O.AJUDA_VOLUME.pos_fervura_l),
      linha("No fermentador", `${numeroBR(v.lote_l, 1)} L`, O.AJUDA_VOLUME.volume_lote_l),
      linha("Grãos na mostura", `${numeroBR(v.graos_kg, 2)} kg`));
    corpoBloco(pAgua,
      linha("Água total", `${numeroBR(v.agua_total_l, 1)} L`, O.AJUDA_VOLUME.agua_total_l),
      linha("Água da mostura", `${numeroBR(v.agua_mostura_l, 1)} L`, O.AJUDA_VOLUME.agua_mostura_l),
      v.temperatura_agua_mostura_c != null ? linha("Temperatura da água da mostura", `${numeroBR(v.temperatura_agua_mostura_c, 1)} °C`, O.AJUDA_VOLUME.temperatura_agua_mostura_c) : null,
      linha("Água de lavagem", `${numeroBR(v.agua_lavagem_l, 1)} L`, O.AJUDA_VOLUME.agua_lavagem_l),
      Math.abs(v.agua_diferenca_l) >= 0.05 ? linha("Água necessária", `${numeroBR(v.agua_necessaria_l, 1)} L`, O.AJUDA_VOLUME.agua_necessaria_l) : null);
    preencher(pNotas,
      estilo ? el("p", { class: "nota", text: `Comparando com ${estilo.codigo ? estilo.codigo + " " : ""}${estilo.nome}.` }) : el("p", { class: "nota", text: "Escolha um estilo no topo para ver as faixas." }),
      el("p", { class: "nota", text: `IBU pelo Tinseth. Whirlpool conta menos quanto mais frio (sem temperatura = ${TEMPERATURA_WHIRLPOOL_PADRAO_C} °C); dry hop não conta.` }));
    const eq = cat.equipamentos.find((e) => e.id === r.equipamento_id);
    tituloApp.textContent = String(r.nome ?? "").trim() || "Receita nova";
    resumoLote.textContent = [
      `${numeroBR(r.volume_lote_l, 1)} L no fermentador`,
      `${numeroBR(r.eficiencia_pct, 0)}% de eficiência`,
      `${numeroBR(r.fervura_min, 0)} min de fervura`,
      eq ? eq.nome : null,
    ].filter(Boolean).join(" · ");
    return res;
  }

  // ---------- seção genérica de lista ----------
  function secaoLista(chave, titulo, { colunas, adicionar, vazio, iconeSecao }) {
    const corpo = el("tbody");
    const sec = el("section", { class: "cartao", dataset: { secao: chave } },
      el("div", { class: "titulo-linha" }, tituloSecao(iconeSecao, titulo), leitura ? null : adicionar()),
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
            i > 0 ? el("button", { type: "button", class: "icone", title: "Subir", "aria-label": "Subir", text: "↑", on: { click: () => acao(() => { [r[chave][i - 1], r[chave][i]] = [r[chave][i], r[chave][i - 1]]; desenhar(); mudou(); }) } }) : null,
            el("button", { type: "button", class: "icone perigo", title: "Remover", "aria-label": "Remover", text: "×", on: { click: () => acao(() => { r[chave].splice(i, 1); desenhar(); mudou(); }) } }))));
      });
      atualizarResultados();
    };
    secoes[chave] = desenhar;
    desenhar();
    return sec;
  }

  /** Botão "+" (só o sinal, sem borda) que abre a busca do cadastro (sistema + meus) com a opção de item livre. */
  const botaoAdicionar = (tipo, aoEscolher, aoLivre) => () => el("button", {
    type: "button", class: "adicionar", text: "+", title: "Adicionar", "aria-label": "Adicionar",
    on: { click: () => abrirBusca({ tipo, itens: cat[tipo], aoEscolher, aoLivre }) },
  });

  const num = (k, casas, extra = {}) => (item) => campoNumero(item, k, { casas, aoMudar: mudou, desabilitado: des, ...extra });
  const txt = (k, extra = {}) => (item) => campoTexto(item, k, { aoMudar: mudou, desabilitado: des, classe: "nome", ...extra });
  const sel = (k, opcoes, extra = {}) => (item) => campoSelect(item, k, opcoes, { aoMudar: mudou, desabilitado: des, ...extra });

  // ---------- cabeçalho ----------
  const nomeInput = campoTexto(r, "nome", { aoMudar: mudou, desabilitado: des, classe: "titulo-receita", placeholder: "Nome da receita", rotulo: "Nome da receita", max: 120 });
  // Relatório em PDF (ao lado do nome): mostra a receita como está na tela, salva ou não; também na só leitura.
  const botaoRelatorio = el("button", {
    type: "button", class: "secundario botao-relatorio", title: "Relatório da receita (PDF)", "aria-label": "Relatório da receita em PDF", "aria-haspopup": "dialog",
    on: { click: () => abrirRelatorio(r, calcularReceita(r), { estilo: estiloAtual(), equipamento: cat.equipamentos.find((e) => e.id === r.equipamento_id) }) },
  }, icone("relatorio"));
  const msg = el("p", { class: "erro-form", role: "alert" });
  const botaoSalvar = el("button", { type: "button", class: "so-largo", text: "Salvar", on: { click: () => salvar() } });
  const botaoSalvarApp = el("button", { type: "button", class: "app-salvar", text: "Salvar", on: { click: () => salvar() } });
  /** Salvar com ponto = há alteração não salva. */
  function marcarPendente() {
    for (const b of [botaoSalvar, botaoSalvarApp]) b.classList.toggle("pendente", editor.sujo);
  }

  async function salvar() {
    msg.textContent = "";
    const problemas = validar(r);
    if (problemas.length) { msg.textContent = problemas.join(" "); return; }
    const res = calcularReceita(r);
    const p = montarPayload(r, res);
    botaoSalvar.disabled = botaoSalvarApp.disabled = true;
    const { data, error } = await sb.rpc("salvar_receita", { p });
    botaoSalvar.disabled = botaoSalvarApp.disabled = false;
    if (error) { msg.textContent = mensagemErro(error); return; }
    editor.sujo = false;
    marcarPendente();
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
    // Excluir só existe aqui dentro (a lista não tem botão de excluir): receita salva e do próprio usuário.
    r.id && !leitura ? el("button", { type: "button", class: "secundario excluir-receita", text: "Excluir receita", on: { click: async () => {
      if (!(await confirmar(`Excluir a receita “${r.nome || "sem nome"}”? Não dá para desfazer.`, { ok: "Excluir", perigo: true }))) return;
      const { error: erro } = await sb.from("receitas").delete().eq("id", r.id);
      if (erro) { msg.textContent = mensagemErro(erro); return; }
      apagarFotosDaReceita(r.dono, r.id).catch(() => {});      // as fotos saem do Storage junto (sem travar a tela)
      editor.sujo = false;
      avisar("Receita excluída.");
      location.hash = "#/receitas";
    } } }) : null,
    el("a", { href: "#/receitas", class: "botao secundario so-largo", text: "Voltar" }));

  // Celular: barra do app no topo (voltar, nome, desfazer, salvar), sempre à vista; o menu geral some no editor.
  const tituloApp = el("span", { class: "app-titulo" });
  const barraApp = el("div", { class: "barra-app" },
    el("a", { href: "#/receitas", class: "app-voltar", "aria-label": "Voltar às receitas" }, icone("voltar")),
    tituloApp,
    leitura ? el("span", { class: "selo", text: "só leitura" }) : bDesfazerApp,
    leitura ? null : botaoSalvarApp);

  // Estilo: botão que abre a busca (código, nome, termos em português, filtros, "Mais perto da receita").
  const nomeEstilo = el("span", { class: "escolha-texto" });
  const mostrarEstilo = () => {
    const e = estiloAtual();
    nomeEstilo.textContent = e ? `${e.codigo ? e.codigo + " " : ""}${e.nome}${e.dono ? " (meu)" : ""}` : "— sem estilo —";
  };
  const trocarEstilo = (id) => {
    if (r.estilo_id !== id) { r.estilo_id = id; mostrarEstilo(); mudou(); }
    botaoEstilo.focus();
  };
  const botaoEstilo = el("button", {
    type: "button", class: "escolha", disabled: des, "aria-label": "Estilo", "aria-haspopup": "dialog",
    on: { click: () => abrirBusca({
      tipo: "estilos", itens: cat.estilos, contexto: calcularReceita(r), atualId: r.estilo_id,
      aoEscolher: (e) => trocarEstilo(e.id), aoLivre: () => trocarEstilo(null),
    }) },
  }, nomeEstilo, el("span", { class: "escolha-seta", "aria-hidden": "true", text: "▾" }));
  mostrarEstilo();
  const estiloCampo = el("div", { class: "estilo-topo" }, el("span", { class: "rotulo-campo", text: "Estilo" }), botaoEstilo);

  const geral = el("section", { class: "cartao", dataset: { secao: "geral" } },
    tituloSecao("geral", "Dados gerais"),
    el("div", { class: "grade-form" },
      el("label", {}, el("span", { text: "Tipo" }), campoSelect(r, "tipo", O.TIPO_RECEITA, { aoMudar: mudou, desabilitado: des, rotulo: "Tipo" })),
      el("label", {}, el("span", { text: "Autor" }), campoTexto(r, "autor", { aoMudar: mudou, desabilitado: des, max: 80, rotulo: "Autor" })),
      el("label", { class: "linha" }, el("input", { type: "checkbox", checked: r.publica, disabled: des, on: { change: (e) => { r.publica = e.target.checked; mudou(); } } }),
        "Pública (outros usuários podem ver e duplicar)")));

  const equipamentoCampo = el("div", { class: "grade-form" },
    el("label", {}, el("span", { text: "Equipamento" }), campoSelect(r, "equipamento_id",
      cat.equipamentos.map((e) => [e.id, e.nome]), {
        desabilitado: des, vazio: cat.equipamentos.length ? "— nenhum —" : "— cadastre em Cadastros —", rotulo: "Equipamento",
        aoMudar: () => acao(() => {
          const eq = cat.equipamentos.find((e) => e.id === r.equipamento_id);
          if (eq) { aplicarEquipamento(r, eq); desenharParametros(); avisar("Parâmetros copiados do equipamento."); }
          mudou();
        }),
      })));

  // Brassagem (receita = lote): nº, data e o que foi medido. Densidade aceita 1,050, 1050 e 50 (pontos).
  const sg = { de: (x) => x, para: (v) => (v >= 900 ? v / 1000 : v > 2 && v < 200 ? 1 + v / 1000 : v) };
  const campoLote = (k, rot, extra) => el("label", {}, el("span", {}, rot, info(O.AJUDA_VOLUME[k])), campoNumero(r, k, { aoMudar: mudou, desabilitado: des, rotulo: rot, ...extra }));
  const brassagem = el("section", { class: "cartao", dataset: { secao: "brassagem" } },
    tituloSecao("brassagem", "Brassagem (lote)"),
    el("div", { class: "grade-form" },
      campoLote("lote_numero", "Nº do lote", { casas: 0, placeholder: "automático", roleta: false }),
      el("label", {}, el("span", { text: "Data da brassagem" }), el("input", {
        type: "date", value: r.data_brassagem ?? "", disabled: des, "aria-label": "Data da brassagem",
        on: { change: (e) => { r.data_brassagem = e.target.value || null; mudou(); } },
      })),
      // Roleta começa no planejado (OG/FG calculadas, volume do lote): o mais provável de ter sido medido.
      campoLote("og_medida", "OG medida", { casas: 3, placeholder: "1,050", ...sg, roleta: { inicial: () => Number(calcularReceita(r).og?.toFixed(3)) } }),
      campoLote("fg_medida", "FG medida", { casas: 3, placeholder: "1,010", ...sg, roleta: { inicial: () => Number(calcularReceita(r).fg?.toFixed(3)) } }),
      campoLote("volume_final_l", "Volume real no fermentador (L)", { casas: 1, roleta: { inicial: () => Number(r.volume_lote_l) } }),
      campoLote("co2_alvo_vol", "CO₂ desejado (vol)", { casas: 1, placeholder: "2,4" }),
      el("label", {}, el("span", {}, "Açúcar do priming", info(O.AJUDA_VOLUME.priming_acucar)),
        campoSelect(r, "priming_acucar", O.ACUCAR_PRIMING, { aoMudar: mudou, desabilitado: des, vazio: "Açúcar comum (sacarose)", rotulo: "Açúcar do priming" }))));

  const inicio = !r.id && !leitura ? el("section", { class: "cartao", dataset: { secao: "inicio" } },
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

  // ---------- linhas de ingrediente (fermentáveis e lúpulos): a quantidade é o campo principal ----------
  const rotular = (texto, campo) => el("label", {}, el("span", { text: texto }), campo);
  const dado = (rot, val, classe) => el("div", { class: `ing-dado ${classe}` }, el("span", { class: "ing-dado-rot", text: rot }), val);
  const passo = (k, padrao) => (Number(preferencias[k]) > 0 ? Number(preferencias[k]) : padrao);

  function secaoLinhas(chave, titulo, { classe, vazio, adicionar, ferramenta, total, extra, destaque, montarLinha, iconeSecao, grafico }) {
    const lista = el("ol", { class: `linhas-ing ${classe}` });
    const totalEl = el("span", { class: destaque ? "total-secao destaque" : "total-secao" });
    // extra: dado complementar ao lado do total (ex.: água/malte nos fermentáveis); some quando não há valor.
    const extraEl = extra ? el("span", { class: "total-extra" }) : null;
    const sec = el("section", { class: "cartao", dataset: { secao: chave } },
      el("div", { class: "titulo-linha" }, tituloSecao(iconeSecao, titulo, " ", totalEl, extraEl),
        leitura ? null : el("div", { class: "titulo-acoes" }, ferramenta ?? null, adicionar())),
      grafico ?? null,
      lista);
    totais.push((res) => {
      totalEl.textContent = r[chave].length ? total(res) : "";
      if (extraEl) extraEl.textContent = r[chave].length ? (extra(res) ?? "") : "";
    });

    function linha(item, i) {
      const nome = el("strong", { class: "ing-nome-txt" });
      const ctx = { mudou: (campo) => { refrescar(); mudou(campo); } };
      const partes = montarLinha(item, ctx);
      // Linha de dados abaixo do nome só quando a seção a define (fermentáveis: só a cor, desde 23/11/2026).
      const sub = partes.sub ? el("span", { class: "ing-sub" }) : null;
      function refrescar() {
        nome.textContent = String(item.nome ?? "").trim() || "(sem nome)";
        if (sub) sub.textContent = partes.sub().filter(Boolean).join(" · ");
        partes.refrescar?.();
      }
      /** focar = true no teclado (o foco acompanha o item); com dedo/mouse não mexe no foco. */
      const mover = (para, focar = true) => moverItem(i, para, focar);
      const nomeItem = String(item.nome ?? "").trim() || "item sem nome";
      // Detalhes numa janela (24/11/2026, pedido do responsável; antes abriam embutidos na linha): tocar no item
      // (nome, cor ou números; não nos campos) abre a janela com a quantidade em cima e os dados do item.
      const botaoNome = el("button", {
        type: "button", class: "ing-nome", title: "Toque para ver os detalhes", "aria-haspopup": "dialog",
        "aria-label": `Detalhes de ${nomeItem}`,
        on: { click: () => abrirItem(item) },
      }, el("span", { class: "ing-nome-linha" }, nome, el("span", { class: "ing-seta", "aria-hidden": "true", text: "›" })), sub ?? null);
      const alca = leitura ? el("span", { class: "ing-alca", "aria-hidden": "true" }) : el("button", {
        type: "button", class: "ing-alca", text: "⠿", title: "Arraste para mudar a ordem (ou use as setas ↑ ↓)",
        "aria-label": `Mover ${String(item.nome ?? "").trim() || "item"}, posição ${i + 1} de ${r[chave].length} (setas ↑ ↓)`,
        on: {
          keydown: (e) => { if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); mover(i + (e.key === "ArrowUp" ? -1 : 1)); } },
          pointerdown: (e) => arrastar(e, i, mover),
        },
      });
      const li = el("li", { class: "ing" }, alca, partes.visual ?? null, botaoNome, partes.colunas);
      // Tocar fora dos campos (amostra de cor, números calculados) também abre os detalhes.
      li.addEventListener("click", (e) => {
        if (e.target.closest("input, select, textarea, button, a, label, .ing-qtd, .ing-quando")) return;
        abrirItem(item);
      });
      refrescar();
      calculados.set(item, partes.aoCalcular);
      return li;
    }

    /** Muda o item de posição (um passo do desfazer). */
    function moverItem(de, para, focar) {
      if (de < 0 || para < 0 || para >= r[chave].length || para === de) return;
      acao(() => {
        const [x] = r[chave].splice(de, 1);
        r[chave].splice(para, 0, x);
        desenhar();
        mudou();
      });
      if (focar) lista.querySelectorAll(".ing-alca")[para]?.focus();
    }

    /**
     * Janela do item: nome e dados no topo, QUANTIDADE em destaque (lúpulo: etapa e tempo junto), os números do item e
     * da receita ao vivo (a barra de números fica atrás da janela), os dados copiados do cadastro e subir/descer/remover.
     * Os campos são os mesmos da linha (montarLinha), ligados ao mesmo item; ao fechar, a seção é redesenhada.
     */
    function abrirItem(item, { focarNome = false, editarQtd = false } = {}) {
      if (!r[chave].includes(item) || document.querySelector("dialog.item-janela")) return;
      const nome = el("strong", { class: "item-nome" });
      const ctx = { mudou: (campo) => { refrescar(); mudou(campo); } };
      const partes = montarLinha(item, ctx);
      const sub = el("span", { class: "item-sub" });
      function refrescar() {
        nome.textContent = String(item.nome ?? "").trim() || "(sem nome)";
        sub.textContent = (partes.sub?.() ?? []).filter(Boolean).join(" · ");
        partes.refrescar?.();
      }
      const pega = (classe) => partes.colunas.find((n) => n.classList.contains(classe)) ?? null;
      // Rótulo do bloco; na quantidade, os números do item (grist e OG / IBU e g/L) ficam na mesma linha do rótulo.
      const rotuloBloco = (texto, n, extra = null) => (n ? el("div", { class: "item-bloco" },
        el("div", { class: "item-rotulo-linha" }, el("span", { class: "item-rotulo", text: texto }), extra), n) : null);
      // Pé numa linha só (24/11/2026, janela mais baixa): ↑ ↓ só com a seta.
      const bSubir = el("button", { type: "button", class: "secundario pequeno item-mover", text: "↑", title: "Subir na lista", "aria-label": "Subir", on: { click: () => deslocar(-1) } });
      const bDescer = el("button", { type: "button", class: "secundario pequeno item-mover", text: "↓", title: "Descer na lista", "aria-label": "Descer", on: { click: () => deslocar(1) } });
      // Fonte dos dados recolhida (o texto é longo): o resumo mostra o selo; tocar abre.
      const detalhes = partes.detalhes();
      const fonteEl = detalhes.find((n) => n?.classList?.contains("fonte-dados")) ?? null;
      const fonte = fonteEl ? el("details", { class: "item-fonte" },
        el("summary", {}, "Fonte dos dados ", fonteEl.querySelector(".selo")?.cloneNode(true) ?? null), fonteEl) : null;
      const posicao = () => r[chave].indexOf(item);
      const botoesPosicao = () => { bSubir.disabled = posicao() <= 0; bDescer.disabled = posicao() >= r[chave].length - 1; };
      const deslocar = (n) => { moverItem(posicao(), posicao() + n, false); botoesPosicao(); };
      const fechar = () => { if (d.open) d.close(); };
      const titulo = String(item.nome ?? "").trim() || "item sem nome";
      const d = el("dialog", { class: `item-janela ${classe}`, "aria-label": `Detalhes de ${titulo}` },
        el("div", { class: "item-topo" },
          partes.visual ?? null,
          el("div", { class: "item-titulo" }, nome, sub),
          el("button", { type: "button", class: "item-fechar", "aria-label": "Fechar", title: "Fechar", text: "×", on: { click: fechar } })),
        el("div", { class: "item-corpo" },
          el("div", { class: "item-principal" },
            rotuloBloco("Quando", pega("ing-quando")),
            rotuloBloco("Quantidade", pega("ing-qtd"), el("div", { class: "item-dados" }, partes.colunas.filter((n) => n.classList.contains("ing-dado"))))),
          el("div", { class: "grade-form" }, detalhes.filter((n) => n !== fonteEl)),
          fonte),
        el("div", { class: "item-acoes" },
          leitura ? null : [bSubir, bDescer, el("button", { type: "button", class: "perigo pequeno", text: "Remover", on: { click: () => {
            acao(() => { r[chave].splice(posicao(), 1); desenhar(); mudou(); });
            fechar();
          } } })],
          el("button", { type: "button", class: "item-pronto", text: "Pronto", on: { click: fechar } })));

      // Tocar no fundo escuro fecha; se a roleta estava aberta, o toque só fecha a roleta.
      let roletaNoToque = false;
      d.addEventListener("pointerdown", () => { roletaNoToque = roletaAberta(); }, true);
      d.addEventListener("click", (e) => {
        if (e.target !== d || roletaNoToque) return;
        const b = d.getBoundingClientRect();
        if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) fechar();
      });
      // Enter num campo de digitar (computador: digitou a quantidade) = Pronto.
      d.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.defaultPrevented && e.target.matches?.("input") && !roletaAberta()) { e.preventDefault(); fechar(); }
      });
      // Esc com a roleta aberta fecha só a roleta.
      d.addEventListener("cancel", (e) => { if (roletaAberta()) { e.preventDefault(); fecharRoleta(false); } });
      window.addEventListener("hashchange", fechar);
      d.addEventListener("close", () => {
        window.removeEventListener("hashchange", fechar);
        if (roletaAberta()) fecharRoleta(true);
        janelaItem = null;
        d.remove();
        desenhar();                  // a linha mostra o que mudou na janela (quantidade, nome, cor...)
        // O foco volta ao item (a linha foi refeita); item removido ou outra tela: fica onde estiver.
        const k = posicao();
        if (k >= 0 && lista.isConnected) lista.querySelectorAll(":scope > li.ing button.ing-nome")[k]?.focus({ preventScroll: true });
      });

      janelaItem = { chave, item, aoCalcular: partes.aoCalcular };
      refrescar();
      botoesPosicao();
      document.body.append(d);
      d.showModal();
      const x = calcularReceita(r)[chave]?.[posicao()];
      if (x) partes.aoCalcular(x);
      // Item livre (sem cadastro): foco no nome. Item novo do cadastro: direto na quantidade (celular: roleta no valor
      // mais provável). Senão o foco fica no × (no celular não abre teclado nem roleta).
      if (focarNome && !leitura) d.querySelector('.grade-form input[aria-label="Nome"]')?.focus();
      else if (editarQtd && !leitura) editarCampo(d.querySelector("input.qtd"));
      else d.querySelector(".item-fechar").focus({ preventScroll: true });
    }

    /** Arrastar pela alça (mouse e toque): a linha segue o ponteiro; ao soltar, vai para a posição. */
    function arrastar(e, i, mover) {
      if (e.button !== 0) return;
      const alca = e.currentTarget;
      const li = alca.closest("li");
      const linhas = [...lista.querySelectorAll(":scope > li.ing")];
      const centros = linhas.map((l) => { const b = l.getBoundingClientRect(); return b.top + b.height / 2; });
      const y0 = e.clientY;
      let destino = i;
      let moveu = false;
      alca.setPointerCapture?.(e.pointerId);
      const aoMover = (ev) => {
        const dy = ev.clientY - y0;
        if (!moveu && Math.abs(dy) < 4) return;
        moveu = true;
        li.classList.add("arrastando");
        li.style.transform = `translateY(${dy}px)`;
        destino = centros.filter((c, k) => k !== i && c < centros[i] + dy).length;
      };
      const fim = (ev) => {
        alca.removeEventListener("pointermove", aoMover);
        alca.removeEventListener("pointerup", fim);
        alca.removeEventListener("pointercancel", fim);
        li.classList.remove("arrastando");
        li.style.transform = "";
        // Solta a captura e só redesenha no próximo quadro: remover a alça ainda capturada deixa o Chrome sem
        // gerar o "click" do toque seguinte.
        if (alca.hasPointerCapture?.(ev.pointerId)) alca.releasePointerCapture(ev.pointerId);
        if (moveu && destino !== i) requestAnimationFrame(() => mover(destino, false));
      };
      alca.addEventListener("pointermove", aoMover);
      alca.addEventListener("pointerup", fim);
      alca.addEventListener("pointercancel", fim);
    }

    function desenhar() {
      limpar(lista);
      if (!r[chave].length) lista.append(el("li", { class: "nota ing-vazio", text: vazio }));
      r[chave].forEach((item, i) => lista.append(linha(item, i)));
      atualizarResultados();
    }
    secoes[chave] = desenhar;
    /** Depois de adicionar, abre a janela do item (24/11/2026, pedido do responsável): do cadastro → na quantidade;
     *  item livre → no nome. */
    focos[chave] = (livre) => abrirItem(r[chave].at(-1), livre ? { focarNome: true } : { editarQtd: true });
    desenhar();
    return sec;
  }
  const focos = {};
  const adicionarItem = (chave, item, livre) => {
    acao(() => {
      r[chave].push(item);
      secoes[chave]();
      mudou();
    });
    focos[chave]?.(livre);
  };

  const cor = { de: O.corParaTela, para: O.corDaTela };
  const fermentaveis = secaoLinhas("fermentaveis", "Fermentáveis", {
    iconeSecao: "malte", grafico: grist.elemento,
    classe: "ferm",
    vazio: "Nenhum fermentável. Toque em “+” para adicionar.",
    total: (res) => `${numeroBR(res.volumes.fermentaveis_kg, 2)} kg`,
    destaque: true,
    // Razão efetiva (água da mostura ÷ grão da mostura): já considera o limite da água total.
    extra: (res) => (res.volumes.graos_kg > 0 ? `${numeroBR(res.volumes.agua_mostura_l / res.volumes.graos_kg, 1)} L/kg água/malte` : null),
    // Sem botão "Chegar à OG" na seção (retirado em 23/11/2026, pedido do responsável): abre pelo número da OG na barra.
    adicionar: botaoAdicionar("fermentaveis",
      (f) => adicionarItem("fermentaveis", { fermentavel_id: f.id, nome: f.nome, tipo: f.tipo, rendimento_pct: num0(f.rendimento_pct), umidade_pct: num0(f.umidade_pct), cor_srm: num0(f.cor_srm), fermentavel_pct: num0(f.fermentavel_pct, 100), quantidade_kg: null, etapa: ["GRAO", "OUTRO"].includes(f.tipo) ? "MOSTURA" : "FERVURA" }),
      () => adicionarItem("fermentaveis", { fermentavel_id: null, nome: "", tipo: "GRAO", rendimento_pct: 80, umidade_pct: 4, cor_srm: 2, fermentavel_pct: 100, quantidade_kg: null, etapa: "MOSTURA" }, true)),
    montarLinha: (item, ctx) => {
      const amostra = el("span", { class: "amostra ing-cor", "aria-hidden": "true" });
      const pct = el("span", { class: "ing-dado-val" });
      const pts = el("span", { class: "ing-dado-val" });
      const passoG = passo("passo_fermentavel_g", 250);
      const campo = { desabilitado: des, aoMudar: ctx.mudou };
      return {
        visual: amostra,
        // Linha pequena abaixo do nome: só a cor do malte, na unidade do perfil (EBC padrão). Pedido do responsável, 23/11/2026.
        sub: () => [item.cor_srm != null && item.cor_srm !== "" ? `${numeroBR(O.corParaTela(Number(item.cor_srm)), 1).replace(/,0$/, "")} ${O.unidadeCor()}` : null],
        refrescar: () => { amostra.style.background = corHexDeMalte(item.cor_srm ?? 0); },
        colunas: [
          el("div", { class: "ing-qtd" }, campoQuantidade(item, "quantidade_kg", { casas: 3, passo: passoG / 1000, passoTxt: `${numeroBR(passoG, 0)} g`, unidade: "kg", rotulo: "Qtd (kg)", desabilitado: des, aoMudar: (c) => mudou(c), roleta: { inicial: () => presetFermentavel(item, r) } })),
          dado("grist", pct, "d1"), dado("OG", pts, "d2")],
        detalhes: () => [
          rotular("Nome", campoTexto(item, "nome", { ...campo, rotulo: "Nome", max: 120 })),
          rotular("Tipo", campoSelect(item, "tipo", O.TIPO_FERMENTAVEL, { ...campo, rotulo: "Tipo" })),
          rotular("Etapa", campoSelect(item, "etapa", O.ETAPA_FERMENTAVEL, { ...campo, rotulo: "Etapa" })),
          rotular("Rendimento (% base seca)", campoNumero(item, "rendimento_pct", { ...campo, casas: 1, rotulo: "Rendimento (%)" })),
          rotular("Umidade (%)", campoNumero(item, "umidade_pct", { ...campo, casas: 1, rotulo: "Umidade (%)" })),
          rotular(`Cor (${O.unidadeCor()})`, campoNumero(item, "cor_srm", { ...campo, ...cor, casas: 1, rotulo: `Cor (${O.unidadeCor()})`, roleta: faixaCor(O.unidadeCor()) })),
          rotular("Fermentável (%) — lactose = 0", campoNumero(item, "fermentavel_pct", { ...campo, casas: 0, rotulo: "Fermentável (%)" })),
          blocoFonte(fonteNaReceita(item, cat.fermentaveis, "fermentavel_id"), { classe: "largo" })],
        aoCalcular: (x) => {
          pct.textContent = `${numeroBR(x.pct_peso, 1)}%`;
          pts.textContent = `+${numeroBR(x.pontos_og, 0)}`;
          pts.title = `${numeroBR(x.pontos_og, 1)} pontos da OG (${numeroBR(x.pct_acucar, 0)}% do açúcar)`;
        },
      };
    },
  });

  const DA_IBU = new Set(["FERVURA", "PRIMEIRO_MOSTO", "WHIRLPOOL"]);     // etapas que entram no IBU
  const lupulos = secaoLinhas("lupulos", "Lúpulos", {
    iconeSecao: "lupulo", grafico: tempo.elemento,
    classe: "lup",
    vazio: "Nenhum lúpulo. Toque em “+” para adicionar.",
    total: (res) => `${numeroBR(r.lupulos.reduce((s, h) => s + (Number(h.quantidade_g) || 0), 0), 0)} g · ${numeroBR(res.ibu, 0)} IBU`,
    // Sem botão "Chegar ao IBU" na seção (retirado em 23/11/2026, pedido do responsável): abre pelo número do IBU na barra.
    adicionar: botaoAdicionar("lupulos",
      (h) => adicionarItem("lupulos", { lupulo_id: h.id, nome: h.nome, forma: h.forma, alfa_pct: num0(h.alfa_pct), quantidade_g: null, etapa: "FERVURA", tempo_min: 60, dia: null }),
      () => adicionarItem("lupulos", { lupulo_id: null, nome: "", forma: "PELLET", alfa_pct: 5, quantidade_g: null, etapa: "FERVURA", tempo_min: 60, dia: null }, true)),
    montarLinha: (item, ctx) => {
      const ibu = el("span", { class: "ing-dado-val" });
      const gl = el("span", { class: "ing-dado-val" });
      const passoG = passo("passo_lupulo_g", 5);
      const campo = { desabilitado: des, aoMudar: ctx.mudou };
      const tempo = el("span", { class: "ing-tempo" });
      const desenharTempo = () => {
        if (["FERVURA", "WHIRLPOOL", "MOSTURA"].includes(item.etapa)) {
          preencher(tempo, campoNumero(item, "tempo_min", { ...campo, casas: 0, rotulo: "Tempo (min)", classe: "num curto", unidade: "min", roleta: { inicial: item.etapa === "WHIRLPOOL" ? 20 : 60 } }), el("span", { class: "sufixo", text: "min" }),
            item.etapa === "WHIRLPOOL" ? [campoNumero(item, "temperatura_c", { ...campo, casas: 0, rotulo: "Temperatura do whirlpool (°C)", classe: "num curto", unidade: "°C", placeholder: String(TEMPERATURA_WHIRLPOOL_PADRAO_C), roleta: FAIXAS_LUGAR.temp_whirlpool }), el("span", { class: "sufixo", text: "°C" })] : null);
        } else if (item.etapa === "DRY_HOP") {
          preencher(tempo, el("span", { class: "sufixo", text: "dia" }), campoNumero(item, "dia", { ...campo, casas: 0, rotulo: "Dia", classe: "num curto", unidade: "º dia" }));
        } else limpar(tempo);
      };
      desenharTempo();
      const etapa = campoSelect(item, "etapa", O.ETAPA_LUPULO, {
        desabilitado: des, rotulo: "Etapa", classe: "etapa",
        aoMudar: () => {
          if (item.etapa === "FERVURA" && item.tempo_min == null) item.tempo_min = 60;
          desenharTempo();
          ctx.mudou();
        },
      });
      return {
        sub: () => [O.rotulo(O.FORMA_LUPULO, item.forma), item.alfa_pct != null ? `alfa ${numeroBR(item.alfa_pct, 1)}%` : null],
        colunas: [
          el("div", { class: "ing-quando" }, etapa, tempo),
          el("div", { class: "ing-qtd" }, campoQuantidade(item, "quantidade_g", { casas: 1, passo: passoG, passoTxt: `${numeroBR(passoG, 0)} g`, unidade: "g", rotulo: "Qtd (g)", desabilitado: des, aoMudar: (c) => mudou(c), roleta: { inicial: () => presetLupulo(item, r) } })),
          dado("IBU", ibu, "d1"), dado("g/L", gl, "d2")],
        detalhes: () => [
          rotular("Nome", campoTexto(item, "nome", { ...campo, rotulo: "Nome", max: 120 })),
          rotular("Forma", campoSelect(item, "forma", O.FORMA_LUPULO, { ...campo, rotulo: "Forma" })),
          rotular("Alfa ácido (%)", campoNumero(item, "alfa_pct", { ...campo, casas: 1, rotulo: "Alfa (%)" })),
          blocoFonte(fonteNaReceita(item, cat.lupulos, "lupulo_id"), { classe: "largo" })],
        aoCalcular: (x) => {
          const conta = DA_IBU.has(item.etapa);
          ibu.textContent = conta ? numeroBR(x.ibu, 1) : "—";
          ibu.title = conta ? "" : "Dry hop, mostura e envase não dão amargor no cálculo";
          gl.textContent = numeroBR(x.g_l, 1);
        },
      };
    },
  });

  /** Leveduras e outros (tabela): acrescenta e põe o foco no campo indicado da linha nova. */
  const adicionarLinhaTabela = (chave, item, focar) => {
    acao(() => { r[chave].push(item); secoes[chave](); mudou(); });
    editarCampo(document.querySelector(`[data-secao="${chave}"] tbody tr:last-child [aria-label="${focar}"]`));
  };

  const leveduras = secaoLista("leveduras", "Leveduras", {
    iconeSecao: "levedura",
    vazio: "Nenhuma levedura (a FG fica igual à OG).",
    colunas: [
      { r: "Nome", campo: txt("nome") },
      { r: "Tipo", campo: sel("tipo", O.TIPO_LEVEDURA) },
      { r: "Forma", campo: sel("forma", O.FORMA_LEVEDURA) },
      { r: "Atenuação %", num: true, campo: num("atenuacao_pct", 0) },
      // Roleta começa no comum para a unidade: 1 pacote, 11 g de fermento seco, 100 mL de fermento líquido/cultivado.
      { r: "Qtd", num: true, campo: (item) => num("quantidade", 1, { roleta: { min: 0, max: 1000, segmentos: [[10, 0.5], [200, 1], [1000, 10]],
        inicial: () => ({ G: 11, ML: 100, BILHOES_CELULAS: 200 })[item.unidade] ?? 1 } })(item) },
      { r: "Unidade", campo: sel("unidade", O.UNIDADE_LEVEDURA, { vazio: "—" }) },
      { r: "Etapa", campo: sel("etapa", O.ETAPA_LEVEDURA) },
    ],
    adicionar: botaoAdicionar("leveduras", (y) => {
      const media = y.atenuacao_min_pct != null && y.atenuacao_max_pct != null ? (Number(y.atenuacao_min_pct) + Number(y.atenuacao_max_pct)) / 2 : num0(y.atenuacao_min_pct ?? y.atenuacao_max_pct, null);
      adicionarLinhaTabela("leveduras", { levedura_id: y.id, nome: y.nome, tipo: y.tipo, forma: y.forma, atenuacao_pct: media, quantidade: 1, unidade: "PACOTE", etapa: "PRIMARIA" }, "Atenuação %");
    }, () => adicionarLinhaTabela("leveduras", { levedura_id: null, nome: "", tipo: "ALE", forma: "SECA", atenuacao_pct: 75, quantidade: 1, unidade: "PACOTE", etapa: "PRIMARIA" }, "Nome")),
  });

  // ---------- água: origem, diluição, alvo, sais e perfil final ----------
  function secaoAgua() {
    const copiaPerfil = (a) => (a ? { nome: a.nome, ...Object.fromEntries(IONS.map((k) => [k, a[k] == null ? 0 : Number(a[k])])) } : null);
    const escolha = (chave, rot, ajuda, vazio) => {
      const atual = r[chave];
      const s = el("select", {
        disabled: des, "aria-label": rot,
        on: { change: (e) => {
          const v = e.target.value;
          if (v === "__atual") return;
          r[chave] = v ? copiaPerfil(cat.aguas.find((x) => x.id === v)) : null;
          mudou();
        } },
      },
      el("option", { value: "", text: vazio, selected: !atual }),
      atual ? el("option", { value: "__atual", text: `${atual.nome ?? "Perfil"} (guardado nesta receita)`, selected: true }) : null,
      cat.aguas.length ? el("optgroup", { label: "Cadastro" }, cat.aguas.map((x) => el("option", { value: x.id, text: `${x.nome}${x.dono ? " (minha)" : ""}` }))) : null);
      return el("label", {}, el("span", {}, rot, info(ajuda)), s);
    };

    // Sais separados: os da mostura vão na água da mostura, os da lavagem na água de lavagem (perfis calculados à parte).
    const grupos = Object.fromEntries(["MOSTURA", "LAVAGEM"].map((etapa) => [etapa, { corpo: el("tbody"), litros: el("span", { class: "bloco-agua-litros" }) }]));
    const desenharSais = () => {
      for (const [etapa, g] of Object.entries(grupos)) {
        limpar(g.corpo);
        const lista = r.sais.filter((x) => etapaSal(x) === etapa);
        if (!lista.length) g.corpo.append(el("tr", {}, el("td", { colspan: 3, class: "nota", text: "Nenhum sal." })));
        for (const x of lista) {
          g.corpo.append(el("tr", {},
            el("td", { dataset: { rotulo: "Sal" } }, comRotulo(campoSelect(x, "sal", O.SAL_AGUA, { aoMudar: mudou, desabilitado: des }), "Sal")),
            el("td", { class: "num", dataset: { rotulo: "Gramas", unidade: "g" } }, comRotulo(campoNumero(x, "gramas", { casas: 1, aoMudar: mudou, desabilitado: des, rotulo: etapa === "MOSTURA" ? "Gramas na mostura" : "Gramas na lavagem" }), "Gramas")),
            leitura ? null : el("td", { class: "acoes-linha" },
              el("button", { type: "button", class: "icone perigo", title: "Remover", "aria-label": "Remover sal", text: "×", on: { click: () => { r.sais.splice(r.sais.indexOf(x), 1); desenharSais(); mudou(); } } }))));
        }
      }
      atualizarResultados();
    };
    const novoSal = (etapa) => { r.sais.push({ sal: "GESSO", gramas: null, etapa }); desenharSais(); mudou(); };
    // Lavagem com a mesma concentração da mostura: cada sal da mostura × (água de lavagem ÷ água da mostura).
    let ultimoRes = null;
    const lavagemIgualMostura = () => {
      const v = ultimoRes?.volumes;
      if (!v || !(v.agua_mostura_l > 0)) return;
      const fator = v.agua_lavagem_l / v.agua_mostura_l;
      r.sais = [...r.sais.filter((x) => etapaSal(x) === "MOSTURA"),
        ...r.sais.filter((x) => etapaSal(x) === "MOSTURA" && Number(x.gramas) > 0).map((x) => ({ sal: x.sal, gramas: Number((Number(x.gramas) * fator).toFixed(1)), etapa: "LAVAGEM" }))]
        .filter((x) => x.etapa !== "LAVAGEM" || x.gramas > 0);
      desenharSais(); mudou();
    };
    const tabelaSais = (etapa, extra) => el("div", {},
      el("div", { class: "titulo-linha" }, el("h5", {}, etapa === "MOSTURA" ? "Sais na mostura" : "Sais na lavagem", info(O.AJUDA_VOLUME.sais_agua)),
        leitura ? null : el("div", { class: "acoes-sais" }, extra, el("button", { type: "button", class: "secundario pequeno", text: etapa === "MOSTURA" ? "+ Sal na mostura" : "+ Sal na lavagem", on: { click: () => novoSal(etapa) } }))),
      el("div", { class: "tabela-rolagem" }, el("table", { class: "tabela editavel linha-unica" },
        el("thead", {}, el("tr", {}, ["Sal", "Gramas"].map((h, i) => el("th", { class: i ? "num" : "", text: h })), leitura ? null : el("th"))),
        grupos[etapa].corpo)));

    const corpoAcidos = el("tbody");
    const desenharAcidos = () => {
      limpar(corpoAcidos);
      if (!r.acidos.length) corpoAcidos.append(el("tr", {}, el("td", { colspan: 3, class: "nota", text: "Nenhum ácido." })));
      r.acidos.forEach((x, i) => corpoAcidos.append(el("tr", {},
        el("td", { dataset: { rotulo: "Ácido" } }, comRotulo(campoSelect(x, "acido", O.ACIDO, { aoMudar: mudou, desabilitado: des }), "Ácido")),
        el("td", { class: "num", dataset: { rotulo: "mL", unidade: "mL" } }, comRotulo(campoNumero(x, "ml", { casas: 1, aoMudar: mudou, desabilitado: des }), "mL")),
        leitura ? null : el("td", { class: "acoes-linha" },
          el("button", { type: "button", class: "icone perigo", title: "Remover", "aria-label": "Remover ácido", text: "×", on: { click: () => { r.acidos.splice(i, 1); desenharAcidos(); mudou(); } } })))));
      atualizarResultados();
    };
    const caixaPh = el("div", { class: "resumo-agua", "aria-live": "polite" });
    aoRecalcular.push((res) => {
      const m = res.ph_mostura;
      if (!m) { preencher(caixaPh, el("p", { class: "nota", text: "Adicione grãos na mostura para estimar o pH." })); return; }
      const faixa = m.ph < 5.2 ? "baixo" : m.ph > 5.6 ? "alto" : m.ph >= 5.3 && m.ph <= 5.5 ? "ideal" : "ok";
      const sugestao = m.latico_88_ml >= 0.1;
      preencher(caixaPh,
        el("div", { class: "metrica" }, el("span", { class: "rot" }, "pH estimado da mostura", info(O.AJUDA_VOLUME.ph_mostura)),
          el("span", { class: "val", text: numeroBR(m.ph, 2) }),
          el("span", { class: `faixa ${faixa === "ideal" || faixa === "ok" ? "dentro" : faixa === "alto" ? "acima" : "abaixo"}`, text: faixa })),
        r.acidos.length ? el("div", { class: "metrica" }, el("span", { class: "rot", text: "Sem o ácido" }), el("span", { class: "val", text: numeroBR(m.ph_sem_acido, 2) })) : null,
        sugestao
          ? el("p", { class: "nota" }, `Para chegar a ${numeroBR(m.alvo, 1)}: mais ${numeroBR(m.latico_88_ml, 1)} mL de ácido lático 88% (ou ${numeroBR(m.fosforico_10_ml, 0)} mL de fosfórico 10%). `,
              leitura ? null : el("button", { type: "button", class: "secundario pequeno", text: "Adicionar o lático", on: { click: () => {
                const ja = r.acidos.find((x) => x.acido === "LATICO_88");
                const ml = Number(m.latico_88_ml.toFixed(1));
                if (ja) ja.ml = Number(((Number(ja.ml) || 0) + ml).toFixed(1)); else r.acidos.push({ acido: "LATICO_88", ml });
                desenharAcidos(); mudou();
              } } }))
          : m.ph < 5.2 ? el("p", { class: "nota alerta", text: "pH baixo: use água com mais alcalinidade (bicarbonato) ou menos malte torrado/ácido." }) : null);
    });

    // Volumes das duas águas: o cervejeiro informa; vazio = sugestão (aparece como texto de fundo do campo).
    const campoMostura = campoNumero(r, "agua_mostura_l", { casas: 1, aoMudar: mudou, desabilitado: des, rotulo: "Água da mostura (L)" });
    const campoLavagem = campoNumero(r, "agua_lavagem_l", { casas: 1, aoMudar: mudou, desabilitado: des, rotulo: "Água de lavagem (L)" });
    const notaVolumes = el("p", { class: "nota largo", "aria-live": "polite" });
    aoRecalcular.push((res) => {
      const v = res.volumes;
      campoMostura.placeholder = `${numeroBR(v.agua_mostura_sugerida_l, 1)} (sugestão)`;
      campoLavagem.placeholder = `${numeroBR(v.agua_lavagem_sugerida_l, 1)} (sugestão)`;
      const partes = [`Total ${numeroBR(v.agua_total_l, 1)} L`];
      if (v.relacao_agua_grao_l_kg != null) partes.push(`${numeroBR(v.relacao_agua_grao_l_kg, 1)} L/kg na mostura`);
      const informou = v.agua_mostura_informada || v.agua_lavagem_informada;
      const dif = v.agua_diferenca_l;
      const longe = informou && Math.abs(dif) >= 0.5;
      notaVolumes.classList.toggle("alerta", longe);
      notaVolumes.textContent = `${partes.join(" · ")}. ` + (!informou
        ? "Campos vazios usam a sugestão (kg de grão × relação água/grão; a lavagem completa a água necessária)."
        : longe
          ? `A receita precisa de ${numeroBR(v.agua_necessaria_l, 1)} L para chegar a ${numeroBR(v.pre_fervura_l, 1)} L na pré-fervura: ${dif > 0 ? "sobram" : "faltam"} ${numeroBR(Math.abs(dif), 1)} L.`
          : `Bate com a água necessária (${numeroBR(v.agua_necessaria_l, 1)} L).`);
    });

    const perfil = el("div", { class: "tabela-rolagem" });
    const resumo = el("div", { class: "resumo-agua" });            // panela (as duas águas juntas)
    const resumoMostura = el("div", { class: "resumo-agua" });
    const resumoLavagem = el("div", { class: "resumo-agua" });
    aoRecalcular.push((res) => {
      ultimoRes = res;
      grupos.MOSTURA.litros.textContent = `${numeroBR(res.volumes.agua_mostura_l, 1)} L`;
      grupos.LAVAGEM.litros.textContent = `${numeroBR(res.volumes.agua_lavagem_l, 1)} L`;
      const a = res.agua;
      if (!a) {
        preencher(perfil, el("p", { class: "nota", text: "Escolha a água de origem ou adicione sais para ver o perfil." }));
        preencher(resumo); preencher(resumoMostura); preencher(resumoLavagem);
        return;
      }
      const alvo = r.agua_alvo;
      const fator = 1 - (Number(r.agua_diluicao_pct) || 0) / 100;
      const longe = (v, k) => alvo && Math.abs(v - Number(alvo[k] ?? 0)) > Math.max(15, 0.25 * Number(alvo[k] ?? 0));
      preencher(perfil, el("table", { class: "tabela perfil-agua" },
        el("thead", {}, el("tr", {}, [["Íon (ppm)", "ppm"], ["Origem", "Orig."], ["Mostura", "Most."], ["Lavagem", "Lav."], ["Panela", "Pan."], alvo ? ["Alvo", "Alvo"] : null].filter(Boolean)
          .map(([longo, curto], i) => el("th", { class: i ? "num" : "" }, el("span", { class: "ion-longo", text: longo }), el("abbr", { class: "ion-curto", title: longo, text: curto }))))),
        el("tbody", {}, IONS.map((k) => el("tr", {},
          el("td", {}, el("span", { class: "ion-longo", text: O.NOME_ION[k] }), el("abbr", { class: "ion-curto", title: O.NOME_ION[k], text: O.SIMBOLO_ION[k] })),
          el("td", { class: "num", text: numeroBR(Number(r.agua_origem?.[k] ?? 0) * fator, 0) }),
          el("td", { class: `num${longe(a.mostura.ions[k], k) ? " longe" : ""}`, text: numeroBR(a.mostura.ions[k], 0) }),
          el("td", { class: "num", text: numeroBR(a.lavagem.ions[k], 0) }),
          el("td", { class: `num${longe(a.panela.ions[k], k) ? " longe" : ""}`, text: numeroBR(a.panela.ions[k], 0) }),
          alvo ? el("td", { class: "num", text: numeroBR(Number(alvo[k] ?? 0), 0) }) : null)))));
      const so4cl = (p) => (p.sulfato_cloreto == null ? "—" : `${numeroBR(p.sulfato_cloreto, 2)} (${O.LEITURA_SO4_CL[leituraSulfatoCloreto(p.sulfato_cloreto)]})`);
      preencher(resumoMostura,
        el("div", { class: "metrica" }, el("span", { class: "rot" }, "Alcalinidade residual da mostura", info(O.AJUDA_VOLUME.alcalinidade_residual)),
          el("span", { class: "val", text: `${numeroBR(a.mostura.alcalinidade_residual, 0)} ppm` })),
        el("div", { class: "metrica" }, el("span", { class: "rot", text: "Sulfato/cloreto na mostura" }), el("span", { class: "val", text: so4cl(a.mostura) })));
      preencher(resumoLavagem,
        el("div", { class: "metrica" }, el("span", { class: "rot", text: "Alcalinidade residual da lavagem" }), el("span", { class: "val", text: `${numeroBR(a.lavagem.alcalinidade_residual, 0)} ppm` })));
      preencher(resumo,
        el("div", { class: "metrica" }, el("span", { class: "rot" }, "Sulfato/cloreto na panela", info(O.AJUDA_VOLUME.sulfato_cloreto)),
          el("span", { class: "val", text: so4cl(a.panela) })),
        el("p", { class: "nota", text: `Mostura: ${numeroBR(a.mostura.sais_g, 1)} g de sais em ${numeroBR(a.mostura.litros, 1)} L. Lavagem: ${numeroBR(a.lavagem.sais_g, 1)} g em ${numeroBR(a.lavagem.litros, 1)} L. Panela = as duas águas juntas, o que chega à fervura.` }));
    });

    const sec = el("section", { class: "cartao", dataset: { secao: "agua" } },
      el("div", { class: "titulo-linha" }, tituloSecao("agua", "Água")),
      el("div", { class: "grade-form" },
        escolha("agua_origem", "Água de origem", O.AJUDA_VOLUME.agua_origem, "— nenhuma (só destilada) —"),
        el("label", {}, el("span", {}, "Diluição com destilada (%)", info(O.AJUDA_VOLUME.agua_diluicao_pct)),
          campoNumero(r, "agua_diluicao_pct", { casas: 0, aoMudar: mudou, desabilitado: des, rotulo: "Diluição com destilada (%)", placeholder: "0" })),
        escolha("agua_alvo", "Perfil alvo", O.AJUDA_VOLUME.agua_alvo, "— sem alvo —")),
      // Cada água num bloco próprio, com tudo o que vai nela (litros, sais, ácido) e o que resulta dela.
      el("div", { class: "bloco-agua mostura" },
        el("div", { class: "bloco-agua-topo" }, el("h4", { class: "bloco-agua-titulo", text: "Água da mostura" }), grupos.MOSTURA.litros),
        el("p", { class: "nota", text: "A água em que o grão fica de molho. Sais e ácido desta água mudam o pH da mostura." }),
        el("label", { class: "bloco-agua-litros-campo" }, el("span", {}, "Litros de água da mostura", info(O.AJUDA_VOLUME.agua_mostura_l)), campoMostura),
        tabelaSais("MOSTURA"),
        el("div", { class: "titulo-linha" }, el("h5", {}, "Ácido na mostura", info(O.AJUDA_VOLUME.acidos)),
          leitura ? null : el("button", { type: "button", class: "secundario pequeno", text: "+ Ácido", on: { click: () => { r.acidos.push({ acido: "LATICO_88", ml: null }); desenharAcidos(); mudou(); } } })),
        el("div", { class: "tabela-rolagem" }, el("table", { class: "tabela editavel linha-unica" },
          el("thead", {}, el("tr", {}, ["Ácido", "mL"].map((h, i) => el("th", { class: i ? "num" : "", text: h })), leitura ? null : el("th"))),
          corpoAcidos)),
        caixaPh,
        resumoMostura),
      el("div", { class: "bloco-agua lavagem" },
        el("div", { class: "bloco-agua-topo" }, el("h4", { class: "bloco-agua-titulo", text: "Água de lavagem" }), grupos.LAVAGEM.litros),
        el("p", { class: "nota", text: "A água para lavar o grão depois da mostura. Não muda o pH da mostura. Zero = sem lavagem." }),
        el("label", { class: "bloco-agua-litros-campo" }, el("span", {}, "Litros de água de lavagem", info(O.AJUDA_VOLUME.agua_lavagem_l)), campoLavagem),
        tabelaSais("LAVAGEM",
          el("button", { type: "button", class: "secundario pequeno", text: "Igual à mostura", title: "Troca os sais da lavagem pelos da mostura, na proporção dos volumes", on: { click: lavagemIgualMostura } })),
        resumoLavagem),
      el("h4", {}, "Total do dia", info(O.AJUDA_VOLUME.volumes_agua)),
      notaVolumes,
      el("h4", { text: "Perfil: mostura, lavagem e panela" }),
      perfil, resumo);
    desenharSais();
    desenharAcidos();
    return sec;
  }

  const agua = secaoAgua();

  const outros = secaoLista("outros", "Outros ingredientes", {
    iconeSecao: "outros",
    vazio: "Nenhum.",
    colunas: [
      { r: "Nome", campo: txt("nome") },
      { r: "Tipo", campo: sel("tipo", O.TIPO_OUTRO) },
      { r: "Qtd", num: true, campo: (item) => num("quantidade", 2, { roleta: { inicial: () => ({ G: 5, KG: 0.5, ML: 5, L: 1 })[item.unidade] ?? 1 } })(item) },
      { r: "Unidade", campo: sel("unidade", O.UNIDADE_OUTRO) },
      { r: "Etapa", campo: sel("etapa", O.ETAPA_OUTRO) },
      { r: "Tempo (min)", num: true, campo: num("tempo_min", 0, { roleta: FAIXAS_LUGAR.tempo_outro }) },
    ],
    adicionar: botaoAdicionar("outros",
      (o) => adicionarLinhaTabela("outros", { outro_id: o.id, nome: o.nome, tipo: o.tipo, quantidade: null, unidade: "G", etapa: "FERVURA", tempo_min: null }, "Qtd"),
      () => adicionarLinhaTabela("outros", { outro_id: null, nome: "", tipo: "OUTRO", quantidade: null, unidade: "G", etapa: "FERVURA", tempo_min: null }, "Nome")),
  });

  const botaoPasso = (chave, novo) => () => el("button", { type: "button", class: "adicionar", text: "+", title: "Adicionar passo", "aria-label": "Adicionar passo", on: { click: () => acao(() => { r[chave].push(novo()); secoes[chave](); mudou(); }) } });
  const mostura = secaoLista("mostura", "Mostura", {
    iconeSecao: "mostura",
    vazio: "Sem passos.",
    colunas: [
      // Passo = tipo (24/11/2026, pedido do responsável: o nome só repetia o tipo). Rampa com o número que ela tem (ou
      // teria) pela ordem; trocar o tipo renumera as outras. O nome gravado é o próprio rótulo (montarPayload).
      { r: "Passo", campo: (item, i) => {
        const antes = O.numerosRampa(r.mostura.slice(0, i)).filter(Boolean).length;
        const opcoes = O.TIPO_MOSTURA.map(([v, t]) => [v, v === "TEMPERATURA" ? `Rampa ${antes + 1}` : t]);
        const vista = { tipo: O.tipoPasso(item.tipo) };
        return campoSelect(vista, "tipo", opcoes, { desabilitado: des, rotulo: "Passo da mostura",
          aoMudar: () => { item.tipo = vista.tipo; secoes.mostura(); mudou(); } });
      } },
      { r: "Temp. (°C)", num: true, campo: num("temperatura_c", 1, { roleta: FAIXAS_LUGAR.temp_mostura }) },
      { r: "Tempo (min)", num: true, campo: num("tempo_min", 0, { roleta: FAIXAS_LUGAR.tempo_mostura }) },
    ],
    adicionar: botaoPasso("mostura", () => ({ nome: "", tipo: "TEMPERATURA", temperatura_c: 72, tempo_min: 10 })),
  });
  const fermentacao = secaoLista("fermentacao", "Fermentação", {
    iconeSecao: "fermentacao",
    vazio: "Sem passos.",
    colunas: [
      { r: "Passo", campo: txt("nome") },
      { r: "Temp. (°C)", num: true, campo: num("temperatura_c", 1, { roleta: FAIXAS_LUGAR.temp_fermentacao }) },
      { r: "Dias", num: true, campo: num("dias", 0) },
    ],
    adicionar: botaoPasso("fermentacao", () => ({ nome: "", temperatura_c: 2, dias: 3 })),
  });

  const notas = el("section", { class: "cartao", dataset: { secao: "notas" } }, tituloSecao("notas", "Notas"),
    el("textarea", { rows: 4, maxlength: 8000, disabled: des, value: r.notas ?? "", "aria-label": "Notas", on: { input: (e) => { r.notas = e.target.value; mudou(); } } }),
    // Fotos da brassagem: gravadas na hora no Storage (fora do Salvar e do desfazer); não vão na cópia "a partir de".
    blocoFotos({ receitaId: r.id, dono: r.dono, leitura }));

  // Lote: uma linha de resumo; os parâmetros abrem ao clicar. Receita nova sem equipamento já abre (falta o volume).
  const lote = el("details", { class: "cartao lote", open: !r.id && !r.equipamento_id && !leitura },
    el("summary", {}, el("span", { class: "resumo-titulo" }, el("span", { class: "titulo-icone" }, icone("parametros")), "Parâmetros"), resumoLote, el("span", { class: "resumo-acao", "aria-hidden": "true" })),
    equipamentoCampo,
    parametros);

  conteudo.classList.add("com-vital");
  const topo = el("div", { class: "editor-topo" }, el("div", { class: "nome-linha" }, nomeInput, botaoRelatorio), estiloCampo, acoes);
  const corpo = el("div", { class: "editor" },
    el("div", { class: "editor-corpo" },
      inicio, lote, fermentaveis, lupulos, leveduras, agua, outros, mostura, fermentacao, brassagem, geral, notas),
    painel);
  // Mudar de campo fecha o passo do histórico (cada campo editado = um passo).
  for (const n of [topo, corpo]) {
    n.addEventListener("focusin", (e) => {
      if (t.timer) registrar();
      // Celular: depois que o teclado abre, o campo não pode ficar atrás da barra de números.
      if (window.matchMedia("(max-width: 640px)").matches && e.target.matches("input, select, textarea")) {
        setTimeout(() => manterAcimaDaBarra(e.target, vital.elemento), 350);
      }
    });
  }
  document.body.classList.add("no-editor");
  preencher(conteudo, barraApp, topo, msg, vital.elemento, corpo);
  marcarPendente();
  vital.definirReferencia(t.ref?.res ?? null);
  if (resAnterior) vital.atualizar(resAnterior, estiloAtual());     // desfazer/refazer: a barra mostra a diferença
  else atualizarResultados();
  montado = true;
  if (resAnterior) atualizarResultados("historico");
  atualizarFerramentas();
  if (!r.id && !leitura && !resAnterior) nomeInput.focus();
}

/** Dá nome acessível ao campo da tabela (o cabeçalho da coluna). */
function comRotulo(n, rot) {
  if (n instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(n.tagName) && !n.getAttribute("aria-label")) n.setAttribute("aria-label", rot);
  return n;
}

const num0 = (v, padrao = 0) => (v === null || v === undefined ? padrao : Number(v));

/** Data sem hora ("2026-04-20") em dd/mm/aaaa, sem passar por fuso (new Date daria o dia anterior no Brasil). */
const dataDoDia = (d) => (d ? d.split("-").reverse().join("/") : "");

/** Linhas do que foi medido no lote, ao lado do planejado (vazio sem OG/FG medida). */
function linhasMedido(res, linha) {
  const m = res.medido;
  if (m.og == null && m.fg == null) return [];
  const pct = (v) => (v == null ? "—" : `${numeroBR(v, 0)}%`);
  return [
    m.og != null ? linha("OG medida", `${numeroBR(m.og, 3)} (plan. ${numeroBR(res.og, 3)})`) : null,
    m.fg != null ? linha("FG medida", `${numeroBR(m.fg, 3)} (plan. ${numeroBR(res.fg, 3)})`) : null,
    m.eficiencia_pct != null ? linha("Eficiência real", pct(m.eficiencia_pct)) : null,
    m.abv_pct != null ? linha("ABV real", `${numeroBR(m.abv_pct, 1)}%`) : null,
    m.atenuacao_pct != null ? linha("Atenuação aparente real", pct(m.atenuacao_pct)) : null,
  ].filter(Boolean);
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
  if (r.agua_diluicao_pct != null && !(r.agua_diluicao_pct >= 0 && r.agua_diluicao_pct <= 100)) p.push("Diluição: de 0 a 100%.");
  if (r.agua_mostura_l != null && !(r.agua_mostura_l > 0 && r.agua_mostura_l <= 1000)) p.push("Água da mostura: maior que zero (ou deixe vazio para usar a sugestão).");
  if (r.agua_lavagem_l != null && !(r.agua_lavagem_l >= 0 && r.agua_lavagem_l <= 1000)) p.push("Água de lavagem: zero ou mais (0 = sem lavagem; vazio = sugestão).");
  if (r.agua_lavagem_l === 0 && (r.sais ?? []).some((x) => etapaSal(x) === "LAVAGEM")) p.push("Há sais na lavagem, mas a água de lavagem está em 0 L.");
  if ((r.sais ?? []).some((x) => !x.sal || !(x.gramas > 0))) p.push("Sais: escolha o sal e os gramas (> 0).");
  if ((r.acidos ?? []).some((x) => !x.acido || !(x.ml > 0))) p.push("Ácidos: escolha o ácido e os mL (> 0).");
  const falta = (lista, teste) => lista.some((x) => !teste(x));
  if (falta(r.fermentaveis, (f) => String(f.nome ?? "").trim() && f.quantidade_kg > 0 && f.rendimento_pct != null && f.cor_srm != null)) p.push("Fermentáveis: preencha nome, quantidade (> 0), rendimento e cor.");
  if (falta(r.lupulos, (h) => String(h.nome ?? "").trim() && h.quantidade_g > 0 && h.alfa_pct != null && (h.etapa !== "FERVURA" || h.tempo_min != null))) p.push("Lúpulos: preencha nome, quantidade (> 0), alfa e o tempo na fervura.");
  if (falta(r.leveduras, (y) => String(y.nome ?? "").trim() && (y.quantidade == null || y.quantidade > 0))) p.push("Leveduras: preencha o nome.");
  if (falta(r.outros, (o) => String(o.nome ?? "").trim() && o.quantidade > 0)) p.push("Outros: preencha nome e quantidade (> 0).");
  if (falta(r.mostura, (m) => m.temperatura_c != null && m.tempo_min != null)) p.push("Mostura: preencha temperatura e tempo de cada passo.");
  if (falta(r.fermentacao, (f) => String(f.nome ?? "").trim() && f.temperatura_c != null && f.dias != null)) p.push("Fermentação: preencha nome, temperatura e dias.");
  return p;
}

function montarPayload(r, res) {
  const so = (obj, chaves) => Object.fromEntries(chaves.map((k) => [k, typeof obj[k] === "string" ? obj[k].trim() : obj[k] ?? null]));
  const arred = (v, c) => (Number.isFinite(v) ? Number(v.toFixed(c)) : null);
  return {
    ...so(r, ["id", "nome", "tipo", "autor", "estilo_id", "equipamento_id", "volume_lote_l", "eficiencia_pct", "fervura_min", "evaporacao_l_h",
      "perda_panela_l", "absorcao_grao_l_kg", "relacao_agua_grao_l_kg", "perda_tina_l", "temp_grao_c", "publica", "notas",
      "lote_numero", "data_brassagem", "og_medida", "fg_medida", "volume_final_l", "co2_alvo_vol", "priming_acucar",
      "agua_origem", "agua_alvo", "agua_diluicao_pct", "agua_mostura_l", "agua_lavagem_l"]),
    sais: (r.sais ?? []).map((x) => ({ sal: x.sal, gramas: x.gramas, etapa: etapaSal(x) })),
    acidos: (r.acidos ?? []).map((x) => ({ acido: x.acido, ml: x.ml })),
    fervura_min: Math.round(r.fervura_min ?? 60),
    og_calc: arred(res.og, 4), fg_calc: arred(res.fg, 4), abv_calc_pct: arred(res.abv_pct, 2), ibu_calc: arred(res.ibu, 1), cor_srm_calc: arred(res.cor_srm, 1),
    fermentaveis: r.fermentaveis.map((x) => so(x, ["fermentavel_id", "nome", "tipo", "rendimento_pct", "umidade_pct", "cor_srm", "fermentavel_pct", "quantidade_kg", "etapa"])),
    lupulos: r.lupulos.map((x) => so(x, ["lupulo_id", "nome", "forma", "alfa_pct", "quantidade_g", "etapa", "tempo_min", "temperatura_c", "dia"])),
    leveduras: r.leveduras.map((x) => so(x, ["levedura_id", "nome", "tipo", "forma", "atenuacao_pct", "quantidade", "unidade", "etapa"])),
    outros: r.outros.map((x) => so(x, ["outro_id", "nome", "tipo", "quantidade", "unidade", "etapa", "tempo_min"])),
    mostura: r.mostura.map((x, i) => ({ ...so(x, ["tipo", "temperatura_c", "rampa_min", "volume_agua_l", "temperatura_infusao_c"]), nome: O.rotuloPasso(r.mostura, i), tempo_min: Math.round(x.tempo_min ?? 0) })),
    fermentacao: r.fermentacao.map((x) => so(x, ["nome", "temperatura_c", "temperatura_fim_c", "dias"])),
  };
}
