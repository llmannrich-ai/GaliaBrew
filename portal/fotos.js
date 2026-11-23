// fotos.js — fotos da brassagem (seção Notas da receita). Cada foto é REDUZIDA no aparelho antes de subir
// (lado maior até 1600 px, JPEG, alvo ~300 kB) para gastar pouco do Storage; o bucket recusa acima de 400 kB (0011).
// As fotos são gravadas na hora (não dependem do "Salvar" da receita) em <dono>/<receita>/<arquivo>.jpg.
import { el, preencher, avisar, mensagemErro, confirmar, numeroBR } from "./ui.js?v=20261123s";
import { sb } from "./estado.js?v=20261123s";
import { icone } from "./icones.js?v=20261123s";

export const FOTOS = { bucket: "fotos-brassagem", lado: 1600, ladoMinimo: 700, alvoBytes: 300_000, tetoBytes: 400_000, porReceita: 12, qualidades: [0.78, 0.66, 0.54] };

/** Medidas finais: cabe em `lado` no lado maior, sem ampliar foto pequena. */
export function medidasFoto(largura, altura, lado) {
  const f = Math.min(1, lado / Math.max(largura, altura));
  return [Math.max(1, Math.round(largura * f)), Math.max(1, Math.round(altura * f))];
}

const tamanhoTxt = (bytes) => (bytes >= 1_000_000 ? `${numeroBR(bytes / 1_000_000, 1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} kB`);

function carregarImagem(arquivo) {
  return new Promise((resolver, rejeitar) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolver(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rejeitar(new Error("Não consegui ler esta imagem.")); };
    img.src = url;
  });
}

const paraJpeg = (tela, q) => new Promise((resolver) => tela.toBlob(resolver, "image/jpeg", q));

/**
 * Reduz a foto: tenta 1600 px em três qualidades; se ainda passar do alvo, diminui o lado em 20% e repete.
 * O <img> já entrega a foto na orientação certa (EXIF do celular). Devolve { blob, largura, altura }.
 */
export async function comprimirFoto(arquivo) {
  const img = await carregarImagem(arquivo);
  if (!img.naturalWidth || !img.naturalHeight) throw new Error("Não consegui ler esta imagem.");
  const tela = document.createElement("canvas");
  let blob = null, largura = 0, altura = 0;
  for (let lado = FOTOS.lado; ; lado = Math.round(lado * 0.8)) {
    [largura, altura] = medidasFoto(img.naturalWidth, img.naturalHeight, lado);
    tela.width = largura;
    tela.height = altura;
    const ctx = tela.getContext("2d");
    ctx.fillStyle = "#fff";            // imagem com transparência vira fundo branco no JPEG
    ctx.fillRect(0, 0, largura, altura);
    ctx.drawImage(img, 0, 0, largura, altura);
    for (const q of FOTOS.qualidades) {
      blob = await paraJpeg(tela, q);
      if (!blob || blob.type !== "image/jpeg") throw new Error("Este aparelho não conseguiu reduzir a foto.");
      if (blob.size <= FOTOS.alvoBytes) return { blob, largura, altura };
    }
    if (lado * 0.8 < FOTOS.ladoMinimo) break;
  }
  if (blob.size <= FOTOS.tetoBytes) return { blob, largura, altura };
  throw new Error("Não consegui reduzir esta foto o bastante.");
}

const sorteio = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("");
const pasta = (dono, receitaId) => `${dono}/${receitaId}`;

async function listarFotos(dono, receitaId) {
  const balde = sb.storage.from(FOTOS.bucket);
  const { data, error } = await balde.list(pasta(dono, receitaId), { limit: 100, sortBy: { column: "name", order: "asc" } });
  if (error) throw error;
  const caminhos = (data ?? []).filter((x) => x.name && x.id !== null).map((x) => `${pasta(dono, receitaId)}/${x.name}`);
  if (!caminhos.length) return [];
  const { data: links, error: erro } = await balde.createSignedUrls(caminhos, 3600);
  if (erro) throw erro;
  return links.filter((x) => x.signedUrl).map((x) => ({ caminho: x.path, url: x.signedUrl }));
}

/** Ao excluir a receita: apaga as fotos dela (as políticas deixam o dono apagar o que está na própria pasta). */
export async function apagarFotosDaReceita(dono, receitaId) {
  const balde = sb.storage.from(FOTOS.bucket);
  const { data } = await balde.list(pasta(dono, receitaId), { limit: 100 });
  const caminhos = (data ?? []).filter((x) => x.name).map((x) => `${pasta(dono, receitaId)}/${x.name}`);
  if (caminhos.length) await balde.remove(caminhos);
}

/** Bloco "Fotos da brassagem" da seção Notas. Sem id (receita ainda não salva) só explica; leitura = só ver. */
export function blocoFotos({ receitaId, dono, leitura }) {
  const fotos = [];
  const grade = el("div", { class: "fotos-grade" });
  const conta = el("span", { class: "fotos-conta" });
  const estado = el("p", { class: "nota fotos-estado", role: "status" });
  const entrada = el("input", { type: "file", accept: "image/*", multiple: true, class: "so-leitor" });
  const adicionar = el("label", { class: "botao secundario fotos-adicionar" }, icone("foto"), el("span", { text: "Adicionar foto" }), entrada);
  const bloco = el("div", { class: "fotos" },
    el("div", { class: "fotos-cab" }, el("h4", { text: "Fotos da brassagem" }), conta));

  if (!receitaId) {
    bloco.append(el("p", { class: "nota", text: "Salve a receita para adicionar fotos." }));
    return bloco;
  }
  bloco.append(grade, estado);
  if (!leitura) {
    bloco.append(adicionar, el("p", { class: "nota fotos-dica", text: `Até ${FOTOS.porReceita} fotos. Cada uma é reduzida automaticamente (cerca de 0,3 MB) e gravada na hora.` }));
  }

  let ocupado = false;
  function desenhar() {
    preencher(grade, fotos.map((f, i) => el("button", {
      type: "button", class: "foto-mini", "aria-label": `Abrir a foto ${i + 1} de ${fotos.length}`, on: { click: () => abrirFoto(i) },
    }, el("img", { src: f.url, alt: "", loading: "lazy", decoding: "async" }))));
    conta.textContent = leitura ? (fotos.length ? String(fotos.length) : "") : `${fotos.length} de ${FOTOS.porReceita}`;
    const cheio = fotos.length >= FOTOS.porReceita;
    entrada.disabled = cheio || ocupado;
    adicionar.classList.toggle("desligado", cheio || ocupado);
    if (leitura && !fotos.length) estado.textContent = "Sem fotos.";
  }

  async function enviar(arquivos) {
    const cabem = FOTOS.porReceita - fotos.length;
    const lista = arquivos.slice(0, cabem);
    if (arquivos.length > cabem) avisar(`Só cabem mais ${cabem} (limite de ${FOTOS.porReceita} fotos por receita).`, "erro");
    if (!lista.length) return;
    ocupado = true;
    desenhar();
    let feitas = 0, antes = 0, depois = 0;
    for (const [i, arquivo] of lista.entries()) {
      estado.textContent = lista.length > 1 ? `Reduzindo e enviando ${i + 1} de ${lista.length}…` : "Reduzindo e enviando…";
      try {
        const { blob } = await comprimirFoto(arquivo);
        const caminho = `${pasta(dono, receitaId)}/${Date.now().toString(36).padStart(9, "0")}-${sorteio()}.jpg`;
        const { error } = await sb.storage.from(FOTOS.bucket).upload(caminho, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
        if (error) throw error;
        fotos.push({ caminho, url: URL.createObjectURL(blob) });
        feitas += 1; antes += arquivo.size; depois += blob.size;
        desenhar();
      } catch (e) {
        avisar(`${arquivo.name || "Foto"}: ${erroFoto(e)}`, "erro");
      }
    }
    ocupado = false;
    estado.textContent = feitas
      ? `${feitas === 1 ? "Foto gravada" : `${feitas} fotos gravadas`}: ${tamanhoTxt(depois)} (${feitas === 1 ? "a original tinha" : "as originais tinham"} ${tamanhoTxt(antes)}).`
      : "";
    desenhar();
  }
  entrada.addEventListener("change", () => {
    const arquivos = [...entrada.files];
    entrada.value = "";
    enviar(arquivos);
  });

  function abrirFoto(inicio) {
    let i = inicio;
    const img = el("img", { class: "foto-grande", alt: "" });
    const titulo = el("strong", {});
    const anterior = el("button", { type: "button", class: "icone", "aria-label": "Foto anterior", text: "‹", on: { click: () => mostrar(i - 1) } });
    const proxima = el("button", { type: "button", class: "icone", "aria-label": "Próxima foto", text: "›", on: { click: () => mostrar(i + 1) } });
    function mostrar(n) {
      i = Math.max(0, Math.min(fotos.length - 1, n));
      img.src = fotos[i].url;
      img.alt = `Foto ${i + 1} da brassagem`;
      titulo.textContent = `Foto ${i + 1} de ${fotos.length}`;
      anterior.disabled = i === 0;
      proxima.disabled = i === fotos.length - 1;
    }
    const excluir = leitura ? null : el("button", {
      type: "button", class: "perigo foto-excluir", text: "Excluir",
      on: {
        click: async () => {
          if (!(await confirmar("Excluir esta foto? Não dá para desfazer.", { ok: "Excluir", perigo: true }))) return;
          const f = fotos[i];
          const { data, error } = await sb.storage.from(FOTOS.bucket).remove([f.caminho]);
          if (error || !data?.length) return avisar(error ? erroFoto(error) : "Não foi possível excluir a foto.", "erro");
          fotos.splice(fotos.indexOf(f), 1);
          estado.textContent = "Foto excluída.";
          desenhar();
          if (fotos.length) mostrar(i); else janela.close();
        },
      },
    });
    const janela = el("dialog", { class: "foto-janela", "aria-label": "Foto da brassagem" },
      el("header", { class: "rel-topo" },
        el("button", { type: "button", class: "icone rel-fechar", "aria-label": "Fechar a foto", on: { click: () => janela.close() } }, icone("fechar")),
        el("div", { class: "rel-titulo" }, titulo),
        excluir),
      el("div", { class: "foto-area" }, img),
      el("footer", { class: "foto-pe" }, anterior, proxima));
    janela.addEventListener("close", () => janela.remove());
    document.body.append(janela);
    mostrar(i);
    janela.showModal();
  }

  estado.textContent = "Carregando fotos…";
  listarFotos(dono, receitaId).then((lista) => {
    fotos.unshift(...lista);
    estado.textContent = "";
    desenhar();
  }).catch((e) => {
    estado.textContent = `Não consegui carregar as fotos: ${erroFoto(e)}`;
    desenhar();
  });
  desenhar();
  return bloco;
}

function erroFoto(e) {
  const m = String(e?.message ?? e ?? "");
  if (/exceeded the maximum allowed size|too large|Payload/i.test(m)) return "a foto ficou grande demais para o limite.";
  if (/mime type/i.test(m)) return "tipo de arquivo não aceito.";
  if (/Bucket not found/i.test(m)) return "o armazenamento de fotos ainda não foi criado no servidor.";
  if (/row-level security/i.test(m)) return `limite de fotos atingido (${FOTOS.porReceita} por receita) ou sem permissão.`;
  return mensagemErro(e);
}
