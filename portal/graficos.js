// graficos.js — gráficos do editor, desenhados para o celular primeiro (largura total, toque).
// Barra do grist: proporção de cada malte no peso, na cor do próprio malte.
// Linha do tempo da fervura: quando cada lúpulo entra (tamanho = gramas); tocar leva à linha do lúpulo.
import { el, preencher, numeroBR } from "./ui.js?v=20261124d";
import { corHexDeMalte, corHexDeSrm } from "./calculos.js?v=20261124d";
import * as O from "./opcoes.js?v=20261124d";
import { copo } from "./vital.js?v=20261124d";

const nomeDe = (x) => String(x.nome ?? "").trim() || "(sem nome)";

/** Barra empilhada: um segmento por fermentável com quantidade, largura = % do peso. */
export function barraGrist() {
  const barra = el("div", { class: "grist", role: "img" });
  // Copo ao lado da barra com a cor FINAL da cerveja (24/11/2026, pedido do responsável): a barra mostra a cor de cada
  // grão; o copo, o que eles dão juntos na receita (mesma cor do copo da barra de números).
  const vidro = copo();
  vidro.removeAttribute("aria-hidden");
  vidro.setAttribute("role", "img");
  // Sem legenda de texto abaixo da barra (retirada em 23/11/2026, pedido do responsável): o nome e o % estão nas linhas.
  const elemento = el("div", { class: "grafico-grist" }, barra, el("span", { class: "grist-copo" }, vidro));
  function atualizar(res, fermentaveis) {
    const cor = `${numeroBR(O.corParaTela(res.cor_srm ?? 0), 0)} ${O.unidadeCor()}`;
    vidro.cerveja.setAttribute("fill", corHexDeSrm(res.cor_srm ?? 0));
    vidro.setAttribute("aria-label", `Cor da cerveja: ${cor}`);
    const itens = fermentaveis.map((f, i) => ({ f, pct: res.fermentaveis[i]?.pct_peso ?? 0 })).filter((x) => x.pct > 0);
    elemento.hidden = itens.length === 0;
    const desc = itens.map(({ f, pct }) => `${nomeDe(f)} ${numeroBR(pct, 0)}%`).join(", ");
    barra.setAttribute("aria-label", `Proporção dos fermentáveis no peso: ${desc}`);
    preencher(barra, itens.map(({ f, pct }) => {
      const seg = el("span", { class: "grist-seg", title: `${nomeDe(f)}: ${numeroBR(pct, 1)}%` });
      seg.style.width = `${pct}%`;
      seg.style.background = corHexDeMalte(f.cor_srm ?? 0);
      return seg;
    }));
  }
  return { elemento, atualizar };
}

/**
 * Linha do tempo: fervura (do início ao fim, minutos contados para trás), whirlpool e dry hop.
 * aoTocar(indice) recebe o índice do lúpulo em r.lupulos.
 */
export function linhaFervura({ aoTocar } = {}) {
  const trilho = el("div", { class: "tempo-trilho" });
  const reguas = el("div", { class: "tempo-reguas", "aria-hidden": "true" });
  const elemento = el("div", { class: "grafico-tempo", role: "group", "aria-label": "Linha do tempo dos lúpulos" }, trilho, reguas);

  function atualizar(res, lupulos, fervuraMin) {
    const ferv = Number(fervuraMin) > 0 ? Number(fervuraMin) : 60;
    const comQtd = lupulos.map((h, i) => ({ h, i, ibu: res.lupulos[i]?.ibu ?? 0 })).filter((x) => Number(x.h.quantidade_g) > 0);
    elemento.hidden = comQtd.length === 0;
    if (!comQtd.length) return;
    const temWp = comQtd.some((x) => x.h.etapa === "WHIRLPOOL");
    const temDh = comQtd.some((x) => x.h.etapa === "DRY_HOP" || x.h.etapa === "ENVASE");
    // Zonas (em % da largura): fervura ocupa o que sobra.
    const zWp = temWp ? 16 : 0;
    const zDh = temDh ? 16 : 0;
    const zFerv = 100 - zWp - zDh;
    const maxG = Math.max(...comQtd.map((x) => Number(x.h.quantidade_g)));
    const diam = (g) => Math.round(18 + 16 * Math.sqrt(Number(g) / maxG));      // 18–34 px (área ~ gramas)

    const posicao = ({ h }) => {
      if (h.etapa === "FERVURA" || h.etapa === "MOSTURA") return zFerv * (1 - Math.min(ferv, Math.max(0, Number(h.tempo_min) || 0)) / ferv);
      if (h.etapa === "PRIMEIRO_MOSTO") return 0;
      if (h.etapa === "WHIRLPOOL") return zFerv + zWp / 2;
      return zFerv + zWp + zDh / 2;                                               // dry hop / envase
    };
    // Lúpulos no mesmo ponto sobem um pouco, para não se esconderem.
    const pontos = comQtd.map((x) => ({ ...x, pos: posicao(x) })).sort((a, b) => a.pos - b.pos);
    const nivel = new Map();
    for (const p of pontos) {
      const vizinhos = pontos.filter((q) => q !== p && nivel.has(q) && Math.abs(q.pos - p.pos) < 6);
      nivel.set(p, vizinhos.length);
    }

    const quando = (h) => ({
      FERVURA: `${numeroBR(h.tempo_min ?? 0, 0)} min`, MOSTURA: "mostura", PRIMEIRO_MOSTO: "1º mosto",
      WHIRLPOOL: `whirlpool ${numeroBR(h.tempo_min ?? 0, 0)} min`, DRY_HOP: h.dia != null ? `dry hop, dia ${numeroBR(h.dia, 0)}` : "dry hop", ENVASE: "envase",
    }[h.etapa] ?? O.rotulo(O.ETAPA_LUPULO, h.etapa));

    const faixa = (ini, larg, nome) => { const z = el("span", { class: "tempo-zona", dataset: { zona: nome } }); z.style.left = `${ini}%`; z.style.width = `${larg}%`; return z; };
    preencher(trilho,
      el("span", { class: "tempo-eixo" }),
      zWp ? faixa(zFerv, zWp, "wp") : null,
      zDh ? faixa(zFerv + zWp, zDh, "dh") : null,
      pontos.map((p) => {
        const d = diam(p.h.quantidade_g);
        const ibuTxt = ["FERVURA", "PRIMEIRO_MOSTO", "WHIRLPOOL"].includes(p.h.etapa) ? ` · ${numeroBR(p.ibu, 0)} IBU` : "";
        const rotulo = `${nomeDe(p.h)}, ${numeroBR(p.h.quantidade_g, 0)} g, ${quando(p.h)}${ibuTxt}`;
        const b = el("button", {
          type: "button", class: `tempo-ponto etapa-${String(p.h.etapa).toLowerCase()}`, title: rotulo, "aria-label": rotulo,
          dataset: { indice: p.i }, on: { click: () => aoTocar?.(p.i) },
        }, el("span", { text: numeroBR(p.h.quantidade_g, 0) }));
        b.style.left = `${p.pos}%`;
        b.style.width = b.style.height = `${d}px`;
        b.style.bottom = `${20 + nivel.get(p) * 14}px`;     // centro no eixo; empilha se coincidir
        return b;
      }));
    const marcas = [ferv, Math.round(ferv / 2), 0].map((m) => {
      const s = el("span", { class: "tempo-marca", text: m === ferv ? `${m} min` : String(m) });
      s.style.left = `${zFerv * (1 - m / ferv)}%`;
      return s;
    });
    const zona = (txt, centro) => { const s = el("span", { class: "tempo-marca zona", text: txt }); s.style.left = `${centro}%`; return s; };
    preencher(reguas, marcas, zWp ? zona("whirlpool", zFerv + zWp / 2) : null, zDh ? zona("dry hop", zFerv + zWp + zDh / 2) : null);
  }
  return { elemento, atualizar };
}
