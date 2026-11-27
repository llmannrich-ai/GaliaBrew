// Teste do portal no Chromium: arquivos do disco + Supabase simulado (mini PostgREST/GoTrue em memória).
// Rodar: node portal/testes/navegador.cjs [pasta para as capturas]   (precisa do pacote playwright com Chromium)
// Nada sai para a rede: o site e o Supabase são respondidos pelo próprio teste, com a CSP do _headers.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORTAL = path.resolve(__dirname, "..");
const ORIGEM = "http://galiabrew.test";
const SB = "https://hzomsyfujxakcuaaedmh.supabase.co";
const SAIDA = process.argv[2] || require("os").tmpdir();

// CSP do _headers
const headersTxt = fs.readFileSync(path.join(PORTAL, "_headers"), "utf8");
const CSP = headersTxt.match(/Content-Security-Policy: (.*)/)[1];

const USUARIO = { id: "11111111-1111-1111-1111-111111111111", email: "leo@teste.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const SENHA = "senha-correta-123";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = () => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USUARIO.id, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, email: USUARIO.email })}.assinatura`;

const db = {
  perfis: [{ user_id: USUARIO.id, nome: "Leo", papel: "usuario" }],
  estilos: [
    { id: "e1", dono: null, guia: "BJCP 2021", codigo: "5D", nome: "German Pils", categoria: "Pale Bitter European Beer", og_min: 1.044, og_max: 1.050, fg_min: 1.008, fg_max: 1.013, ibu_min: 22, ibu_max: 40, cor_srm_min: 2, cor_srm_max: 4, abv_min_pct: 4.4, abv_max_pct: 5.2 },
    { id: "e2", dono: null, guia: "BJCP 2021", codigo: "10A", nome: "Weissbier", categoria: "German Wheat Beer", og_min: 1.044, og_max: 1.053, fg_min: 1.008, fg_max: 1.014, ibu_min: 8, ibu_max: 15, cor_srm_min: 2, cor_srm_max: 6, abv_min_pct: 4.3, abv_max_pct: 5.6 },
    { id: "e3", dono: null, guia: "BJCP 2021", codigo: "21A", nome: "American IPA", categoria: "IPA", og_min: 1.056, og_max: 1.07, fg_min: 1.008, fg_max: 1.014, ibu_min: 40, ibu_max: 70, cor_srm_min: 6, cor_srm_max: 14, abv_min_pct: 5.5, abv_max_pct: 7.5 },
    { id: "e4", dono: null, guia: "BJCP 2021", codigo: "3A", nome: "Czech Pale Lager", categoria: "Czech Lager", og_min: 1.028, og_max: 1.044, fg_min: 1.008, fg_max: 1.014, ibu_min: 20, ibu_max: 35, cor_srm_min: 3, cor_srm_max: 6, abv_min_pct: 3, abv_max_pct: 4.1 },
  ],
  fermentaveis: [{ id: "f-sis", dono: null, nome: "Pilsen (sistema)", tipo: "GRAO", rendimento_pct: 81, umidade_pct: 4, cor_srm: 1.8, fermentavel_pct: 100, precisa_mostura: true, produtor: "Agrária",
    extras: { fonte: "Ficha técnica oficial (Agrária), consultada em 23/11/2026", url: "https://www.agraria.com.br/malte/teste" } }],
  lupulos: [], leveduras: [], outros: [], aguas: [{ id: "ag-tor", dono: null, nome: "Torneira teste", calcio_ppm: 20, magnesio_ppm: 4, sodio_ppm: 10, sulfato_ppm: 10, cloreto_ppm: 15, bicarbonato_ppm: 60 }, { id: "ag-alvo", dono: null, nome: "Alvo IPA", calcio_ppm: 110, magnesio_ppm: 10, sodio_ppm: 10, sulfato_ppm: 255, cloreto_ppm: 50, bicarbonato_ppm: 0 }], equipamentos: [], receitas: [],
  receita_fermentaveis: [], receita_lupulos: [], receita_leveduras: [], receita_outros: [], receita_mostura_passos: [], receita_fermentacao_passos: [],
};
// Catálogo grande de leveduras (como o real: ~900) para medir a busca.
db.leveduras = Array.from({ length: 900 }, (_, i) => ({
  id: `y${i}`, dono: null, nome: `Cepa ${i}`, produtor: i % 3 ? "Fermentis" : "Lallemand", tipo: i % 4 ? "ALE" : "LAGER", forma: "SECA",
  atenuacao_min_pct: 68 + (i % 12), atenuacao_max_pct: 72 + (i % 12),
})).concat([{ id: "y-saf", dono: null, nome: "SafLager W-34/70 Fermentação baixa", produtor: "Fermentis", tipo: "LAGER", forma: "SECA", atenuacao_min_pct: 80, atenuacao_max_pct: 84, temp_min_c: 9, temp_max_c: 15 }]);
const chamadas = [];
const uuid = () => crypto.randomUUID();

function filtrar(linhas, params) {
  let out = linhas;
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset", "columns", "on_conflict"].includes(k)) continue;
    const m = v.match(/^eq\.(.*)$/);
    if (m) out = out.filter((x) => String(x[k]) === m[1]);
  }
  return out;
}

function responder(rota, status, corpo, extra = {}) {
  return rota.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "content-range", ...extra }, body: corpo === undefined ? "" : JSON.stringify(corpo) });
}

async function supabaseSimulado(rota) {
  const req = rota.request();
  const url = new URL(req.url());
  const metodo = req.method();
  if (metodo === "OPTIONS") return responder(rota, 204);
  if (url.pathname.startsWith("/storage/v1/")) return storageSimulado(rota, req, url, metodo);
  const corpo = req.postData() ? JSON.parse(req.postData()) : null;
  chamadas.push({ metodo, caminho: url.pathname + url.search, corpo });

  // ---- auth ----
  if (url.pathname === "/auth/v1/token") {
    if (corpo.email === USUARIO.email && corpo.password === SENHA) {
      return responder(rota, 200, { access_token: jwt(), token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "r1", user: USUARIO });
    }
    return responder(rota, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
  }
  if (url.pathname === "/auth/v1/user") return responder(rota, 200, USUARIO);
  if (url.pathname === "/auth/v1/logout") return responder(rota, 204);

  // ---- rpc ----
  if (url.pathname === "/rest/v1/rpc/eh_admin") return responder(rota, 200, false);
  if (url.pathname === "/rest/v1/rpc/salvar_receita") {
    const p = corpo.p;
    let r = p.id ? db.receitas.find((x) => x.id === p.id) : null;
    if (!r) {
      // Como o gatilho receitas_numerar (0005): sem número, o próximo do dono.
      const maior = Math.max(0, ...db.receitas.filter((x) => x.dono === USUARIO.id).map((x) => x.lote_numero ?? 0));
      r = { id: uuid(), dono: USUARIO.id, criado_em: new Date().toISOString(), lote_numero: maior + 1 };
      db.receitas.push(r);
    }
    const partes = { fermentaveis: "receita_fermentaveis", lupulos: "receita_lupulos", leveduras: "receita_leveduras", outros: "receita_outros", mostura: "receita_mostura_passos", fermentacao: "receita_fermentacao_passos" };
    for (const [k, v] of Object.entries(p)) if (!partes[k] && k !== "id" && !(k === "lote_numero" && v == null)) r[k] = v;
    r.atualizado_em = new Date().toISOString();
    for (const [k, t] of Object.entries(partes)) {
      if (!(k in p)) continue;
      db[t] = db[t].filter((x) => x.receita_id !== r.id).concat(p[k].map((x, i) => ({ id: uuid(), receita_id: r.id, ordem: i, ...x })));
    }
    return responder(rota, 200, r.id);
  }

  // ---- tabelas ----
  const tabela = url.pathname.replace("/rest/v1/", "");
  if (!db[tabela]) return responder(rota, 404, { message: `tabela ${tabela}` });
  const params = [...url.searchParams.entries()];
  const objeto = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
  if (metodo === "GET") {
    let linhas = filtrar(db[tabela], params);
    const sel = url.searchParams.get("select") || "*";
    if (tabela === "receitas") {
      linhas = linhas.map((r) => {
        const o = { ...r };
        if (sel.includes("estilo:estilos")) { const e = db.estilos.find((x) => x.id === r.estilo_id); o.estilo = e ? { nome: e.nome, codigo: e.codigo } : null; }
        for (const t of ["receita_fermentaveis", "receita_lupulos", "receita_leveduras", "receita_outros", "receita_mostura_passos", "receita_fermentacao_passos"]) {
          if (sel.includes(t)) o[t] = db[t].filter((x) => x.receita_id === r.id);
        }
        return o;
      });
    }
    if (objeto) return linhas.length ? responder(rota, 200, linhas[0]) : responder(rota, 406, { code: "PGRST116", message: "0 rows" });
    return responder(rota, 200, linhas, { "content-range": `0-${Math.max(0, linhas.length - 1)}/*` });
  }
  if (metodo === "POST") {
    const novos = (Array.isArray(corpo) ? corpo : [corpo]).map((x) => ({ id: uuid(), dono: USUARIO.id, ...x }));
    db[tabela].push(...novos);
    return responder(rota, 201, novos);
  }
  if (metodo === "PATCH") {
    const alvo = filtrar(db[tabela], params);
    alvo.forEach((x) => Object.assign(x, corpo));
    return responder(rota, 200, alvo);
  }
  if (metodo === "DELETE") {
    const alvo = filtrar(db[tabela], params);
    db[tabela] = db[tabela].filter((x) => !alvo.includes(x));
    return responder(rota, 200, alvo);
  }
  return responder(rota, 400, { message: "não simulado" });
}

// ---- Storage (bucket fotos-brassagem da 0011): guarda os bytes enviados e aplica o limite do bucket (400 kB, JPEG) ----
const fotosGuardadas = new Map();      // caminho → Buffer
const BALDE = "fotos-brassagem";
function medidasJpeg(b) {
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xc2) return { altura: b.readUInt16BE(i + 5), largura: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}
async function storageSimulado(rota, req, url, metodo) {
  const caminho = decodeURIComponent(url.pathname.replace("/storage/v1/object/", ""));
  chamadas.push({ metodo, caminho: url.pathname, corpo: null });
  if (metodo === "GET" && caminho.startsWith(`sign/${BALDE}/`)) {
    const f = fotosGuardadas.get(caminho.slice(`sign/${BALDE}/`.length));
    return f ? rota.fulfill({ status: 200, contentType: "image/jpeg", body: f }) : responder(rota, 404, { message: "Object not found" });
  }
  if (metodo === "POST" && caminho === `list/${BALDE}`) {
    const { prefix } = JSON.parse(req.postData());
    return responder(rota, 200, [...fotosGuardadas.keys()].filter((k) => k.startsWith(prefix + "/")).sort()
      .map((k) => ({ name: k.slice(prefix.length + 1), id: uuid(), created_at: new Date().toISOString(), metadata: { size: fotosGuardadas.get(k).length } })));
  }
  if (metodo === "POST" && caminho === `sign/${BALDE}`) {
    const { paths } = JSON.parse(req.postData());
    return responder(rota, 200, paths.map((p) => ({ error: null, path: p, signedURL: `/object/sign/${BALDE}/${p}?token=t` })));
  }
  if (metodo === "DELETE" && caminho === BALDE) {
    const { prefixes } = JSON.parse(req.postData());
    const apagados = prefixes.filter((k) => fotosGuardadas.delete(k));
    return responder(rota, 200, apagados.map((k) => ({ name: k, bucket_id: BALDE })));
  }
  if (metodo === "POST" && caminho.startsWith(`${BALDE}/`)) {
    // O corpo é multipart (FormData do supabase-js): o arquivo vai do início ao fim do JPEG.
    const bruto = req.postDataBuffer();
    const ini = bruto.indexOf(Buffer.from([0xff, 0xd8, 0xff])), fim = bruto.lastIndexOf(Buffer.from([0xff, 0xd9]));
    if (ini < 0 || fim < 0) return responder(rota, 415, { statusCode: "415", error: "invalid_mime_type", message: "mime type not supported" });
    const arq = bruto.subarray(ini, fim + 2);
    if (arq.length > 409600) return responder(rota, 413, { statusCode: "413", error: "Payload too large", message: "The object exceeded the maximum allowed size" });
    const destino = caminho.slice(BALDE.length + 1);
    fotosGuardadas.set(destino, Buffer.from(arq));
    return responder(rota, 200, { Key: `${BALDE}/${destino}`, Id: uuid() });
  }
  return responder(rota, 400, { message: "storage não simulado" });
}

const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json" };
// Números em lista no celular (26/11/2026): um abaixo do outro, régua larga e os limites do estilo embaixo das pontas
// da faixa, sem sobrepor e sem passar da barra. Devolve um texto com o problema ou "" quando está tudo certo.
async function conferirListaVital(pg) {
  return pg.evaluate(() => {
    const barra = document.querySelector(".vital").getBoundingClientRect();
    const itens = [...document.querySelectorAll(".vital .vital-item:not(.secundario)")].map((it) => {
      const b = it.getBoundingClientRect(); const r = it.querySelector(".regua").getBoundingClientRect();
      const v = it.querySelector(".vital-val").getBoundingClientRect();
      const lim = [...it.querySelectorAll(".regua-lim")].map((l) => ({ t: l.textContent, b: l.getBoundingClientRect(), vis: l.checkVisibility() }));
      return { m: it.dataset.metrica, top: b.top, bottom: b.bottom, esq: b.left, regua: r, val: v, lim };
    });
    const erros = [];
    if (itens.length !== 6) erros.push(`${itens.length} itens`);
    itens.forEach((it, i) => {
      if (i && it.top < itens[i - 1].bottom - 1) erros.push(`${it.m} não fica abaixo de ${itens[i - 1].m}`);
      if (Math.abs(it.esq - itens[0].esq) > 1) erros.push(`${it.m} fora da coluna`);
      if (it.regua.width < 70) erros.push(`${it.m}: régua de ${Math.round(it.regua.width)} px`);
      if (it.val.right > barra.right + 1 || it.val.left < it.regua.right) erros.push(`${it.m}: número fora do lugar`);
      const [a, b] = it.lim;
      if (!a.vis || !b.vis || !/\d/.test(a.t) || !/\d/.test(b.t)) erros.push(`${it.m}: limites "${a.t}"/"${b.t}" não aparecem`);
      else if (a.b.right > b.b.left - 2 || a.b.left < barra.left || b.b.right > it.val.left) erros.push(`${it.m}: limites se sobrepõem ou passam da régua`);
    });
    return erros.join("; ");
  });
}

async function site(rota) {
  const url = new URL(rota.request().url());
  let arq = decodeURIComponent(url.pathname);
  if (arq === "/") arq = "/index.html";
  const p = path.join(PORTAL, arq);
  if (!p.startsWith(PORTAL) || !fs.existsSync(p)) return rota.fulfill({ status: 404, body: "não achei" });
  return rota.fulfill({ status: 200, contentType: TIPOS[path.extname(p)] || "application/octet-stream", headers: { "content-security-policy": CSP }, body: fs.readFileSync(p) });
}

const ok = [];
const erros = [];
(async () => {
  const navegador = await chromium.launch();
  const ctx = await navegador.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 });
  const pagina = await ctx.newPage();
  pagina.on("console", (m) => { if (["error", "warning"].includes(m.type())) erros.push(`${m.type()}: ${m.text()}`); });
  pagina.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  await ctx.route(`${SB}/**`, supabaseSimulado);
  await ctx.route(`${ORIGEM}/**`, site);

  const verificar = (cond, msg) => { if (!cond) throw new Error(`FALHOU: ${msg}`); ok.push(msg); };

  await pagina.goto(`${ORIGEM}/`);
  await pagina.waitForSelector("form.login");
  verificar(true, "tela de login aparece");
  await pagina.fill('input[type="email"]', USUARIO.email);
  await pagina.fill('input[type="password"]', "errada");
  await pagina.click('button[type="submit"]');
  await pagina.waitForSelector("text=E-mail ou senha incorretos.");
  verificar(true, "senha errada mostra mensagem em português");
  await pagina.fill('input[type="password"]', SENHA);
  await pagina.click('button[type="submit"]');
  await pagina.waitForSelector("text=Nenhuma receita ainda");
  verificar(await pagina.isVisible(".lateral >> text=Leo"), "login entra e mostra o nome do perfil");
  verificar(await pagina.getAttribute('.lateral nav a[data-rota="receitas"]', "aria-current") === "page", "menu lateral marca a página atual");
  await pagina.screenshot({ path: `${SAIDA}/p1-receitas-vazia.png` });

  // Cadastro: equipamento e lúpulo
  await pagina.click("text=Cadastros");
  await pagina.waitForSelector("text=Pilsen (sistema)");
  verificar(await pagina.isVisible("td >> .selo.fonte.fabricante >> text=Fabricante"), "malte do catálogo com ficha da fabricante aparece com o selo 'Fabricante'");
  await pagina.click("td >> text=Pilsen (sistema)");
  verificar((await pagina.textContent("dialog .fonte-dados")).includes("ficha técnica da própria fabricante")
    && await pagina.getAttribute('dialog .fonte-dados a', "href") === "https://www.agraria.com.br/malte/teste",
    "formulário do malte mostra a fonte dos dados e o link da ficha");
  await pagina.click('dialog button:has-text("Fechar")');
  const fontes = await pagina.evaluate(async () => {
    const m = await import("./fontes.js?v=20261127b");
    return [
      { extras: { fonte: "beer-analytics.com, CC BY-SA 4.0 (via Brewtarget)" } },
      { extras: { fonte: "fontes públicas (via Brewtarget)" } },
      { extras: { fonte: "The Swaen (via Brewtarget)" }, notas: "SKU 1. Source: https://theswaen.com/products/x." },
      { extras: { fonte: "Embrapa, manual (2022), tabela 1", url: "https://www.infoteca.cnptia.embrapa.br/x.pdf" } },
      { extras: { fonte: "Ficha oficial (Hopsteiner)", url: "javascript:alert(1)" } },
      { dono: "u1", extras: {} },
      {},
    ].map((x) => { const f = m.fonteDados(x); return `${f.tipo}:${f.url ?? "-"}`; }).join(" ");
  });
  verificar(fontes === "GENERICA:- GENERICA:- FABRICANTE:https://theswaen.com/products/x ANALISE:https://www.infoteca.cnptia.embrapa.br/x.pdf FABRICANTE:- PROPRIA:- DESCONHECIDA:-",
    `fontes: genérico, Swaen (fabricante via Brewtarget), Embrapa (análise), link só https, meu (${fontes})`);
  // Cadastro de estilos: a mesma busca do editor (termo em português, código), em ordem de código (3A antes de 10A).
  await pagina.click('.abas >> text=Estilos');
  await pagina.waitForSelector("td >> text=German Pils");
  const codigos = () => pagina.$$eval("tbody tr", (ls) => ls.map((l) => l.textContent));
  verificar((await codigos()).findIndex((t) => t.includes("Czech Pale Lager")) < (await codigos()).findIndex((t) => t.includes("Weissbier")), "cadastro de estilos em ordem de código (3A antes de 10A)");
  await pagina.fill('input[aria-label="Buscar"]', "trigo");
  verificar((await codigos()).length === 1 && (await codigos())[0].includes("Weissbier"), "cadastro de estilos: \"trigo\" acha só a Weissbier");
  await pagina.fill('input[aria-label="Buscar"]', "21a");
  verificar((await codigos()).length === 1 && (await codigos())[0].includes("American IPA"), "cadastro de estilos: busca pelo código 21A");
  await pagina.click('.abas >> text=Equipamentos');
  await pagina.waitForSelector("text=Nenhum item ainda");
  await pagina.click("button:has-text('Novo')");
  await pagina.fill('dialog input[aria-label="Nome"]', "Panela 50 L");
  const vol = pagina.locator('dialog input[aria-label="Volume no fermentador (L)"]');
  await vol.fill("23");
  await pagina.locator('dialog input[aria-label="Perda na panela (L)"]').fill("2");
  await pagina.screenshot({ path: `${SAIDA}/p2-cadastro-equipamento.png` });
  await pagina.click('dialog button[type="submit"]');
  await pagina.waitForSelector("td >> text=Panela 50 L");
  verificar(db.equipamentos[0]?.volume_lote_l === 23 && db.equipamentos[0]?.perda_panela_l === 2, "equipamento gravado com números (vírgula/ponto lidos)");

  await pagina.click('.abas >> text=Lúpulos');
  await pagina.click("button:has-text('Novo')");
  await pagina.fill('dialog input[aria-label="Nome"]', "Saaz");
  await pagina.locator('dialog input[aria-label="Alfa ácido (%)"]').fill("3,5");
  await pagina.click('dialog button[type="submit"]');
  await pagina.waitForSelector("td >> text=Saaz");
  verificar(db.lupulos[0]?.alfa_pct === 3.5, "alfa 3,5 (vírgula) gravado como 3.5");
  verificar(await pagina.isVisible("tr:has-text('Saaz') .selo.fonte.meu"), "lúpulo cadastrado pela pessoa aparece com o selo 'Meu'");

  // Receita nova
  await pagina.click("text=Receitas");
  await pagina.click("text=Nova receita");
  await pagina.waitForSelector(".titulo-receita");
  verificar(await pagina.inputValue('input[aria-label="Volume no fermentador (L)"]') === "23,0", "equipamento único já preenche os parâmetros");
  await pagina.fill(".titulo-receita", "Pils da Galia");
  // Estilo: botão abre a busca; o código acha o estilo e Enter escolhe.
  const botaoEstilo = 'button.estilo-botao';
  verificar((await pagina.textContent(botaoEstilo)).includes("Escolher estilo"), "receita nova começa sem estilo");
  await pagina.click(botaoEstilo);
  await pagina.waitForSelector("dialog.busca");
  verificar(await pagina.textContent("dialog.busca h3") === "Escolher estilo", "estilo abre a janela de busca");
  verificar(!(await pagina.isVisible("dialog.busca .busca-grupo >> text=Mais perto da receita")), "sem ingredientes não sugere estilo pela receita");
  await pagina.fill("dialog.busca .busca-campo", "5d");
  await pagina.keyboard.press("Enter");
  await pagina.waitForSelector("dialog.busca", { state: "detached" });
  verificar((await pagina.textContent(botaoEstilo)).trim() === "German Pils›", "código 5D + Enter escolhe a German Pils (cartão só com o nome, sem o código)");
  const adicionar = (secao) => pagina.click(`[data-secao="${secao}"] button.adicionar`);
  const focado = () => pagina.evaluate(() => document.activeElement?.getAttribute("aria-label"));

  // Fermentável: a busca ignora acento ("agraria" acha o produtor "Agrária"); Enter adiciona e o foco vai para a quantidade.
  await adicionar("fermentaveis");
  await pagina.waitForSelector("dialog.busca");
  verificar(await focado() === "Buscar", "busca abre com o foco no campo");
  await pagina.keyboard.type("agraria");
  verificar(await pagina.textContent('.busca-opcao[aria-selected="true"] .busca-opcao-nome') === "Pilsen (sistema)", "busca sem acento: 'agraria' acha o malte da Agrária");
  verificar(await pagina.textContent('.busca-opcao[aria-selected="true"] .selo.fonte') === "Fabricante"
    && await pagina.locator("dialog.busca .chip, dialog.busca .busca-filtros").count() === 0, "busca mostra o selo da fonte e não tem filtros");
  await pagina.keyboard.press("Enter");
  await pagina.waitForSelector("dialog.busca", { state: "detached" });
  verificar(await focado() === "Qtd (kg)" && await pagina.evaluate(() => document.activeElement.closest("dialog.item-janela")?.open === true),
    "Enter adiciona o malte e abre a janela do item com o foco na quantidade");
  await pagina.keyboard.type("4,8");
  await pagina.keyboard.press("Enter");
  await pagina.waitForSelector("dialog.item-janela", { state: "detached" });
  verificar(await pagina.inputValue('[data-secao="fermentaveis"] li.ing input[aria-label="Qtd (kg)"]') === "4,800", "Enter na quantidade fecha a janela e a linha mostra 4,800 kg");

  // Lúpulo só com teclado: Adicionar → "saaz" → Enter → 60.
  await pagina.focus('[data-secao="lupulos"] button.adicionar');
  await pagina.keyboard.press("Enter");
  await pagina.waitForSelector("dialog.busca");
  await pagina.keyboard.type("saaz");
  await pagina.keyboard.press("Enter");
  await pagina.keyboard.type("60");
  verificar(await pagina.inputValue('dialog.item-janela input[aria-label="Qtd (g)"]') === "60", "lúpulo adicionado só com o teclado (Adicionar, 'saaz', Enter, 60)");
  await pagina.keyboard.press("Enter");
  await pagina.waitForSelector("dialog.item-janela", { state: "detached" });

  // Levedura: catálogo de 901 itens, Esc fecha sem adicionar; depois item livre.
  await adicionar("leveduras");
  await pagina.waitForSelector("dialog.busca");
  verificar((await pagina.textContent(".busca-info")).startsWith("901 itens · mostrando 60"), "busca mostra 60 de 901 leveduras sem travar");
  const ms = await pagina.evaluate(() => {
    const c = document.querySelector(".busca-campo");
    const t = performance.now();
    c.value = "fermentis w-34";
    c.dispatchEvent(new Event("input"));
    return performance.now() - t;
  });
  verificar(ms < 100 && await pagina.textContent('.busca-opcao[aria-selected="true"] .busca-opcao-nome') === "Fermentis SafLager W-34/70 Fermentação baixa",
    `busca em 901 leveduras com dois termos responde em ${Math.round(ms)} ms`);
  await pagina.fill(".busca-campo", "");   // campo de busca com texto: o 1º Esc só limpa o texto
  await pagina.screenshot({ path: `${SAIDA}/p3e-busca.png` });
  await pagina.keyboard.press("Escape");
  await pagina.waitForSelector("dialog.busca", { state: "detached" });
  verificar(await pagina.locator('[data-secao="leveduras"] li.ing').count() === 0, "Esc fecha a busca sem adicionar");
  await adicionar("leveduras");
  await pagina.click("dialog.busca >> text=Item livre");
  verificar(await focado() === "Nome" && await pagina.evaluate(() => document.activeElement.closest("dialog.item-janela.lev")?.open === true),
    "levedura livre: abre a janela do item com o foco no nome");
  await pagina.keyboard.type("W-34/70");
  await pagina.fill('dialog.item-janela input[aria-label="Atenuação %"]', "80");
  await pagina.selectOption('dialog.item-janela select[aria-label="Etapa"]', "SECUNDARIA");
  await pagina.fill('dialog.item-janela input[aria-label="Quantidade"]', "2");
  await pagina.click("dialog.item-janela button.item-pronto");
  await pagina.waitForSelector("dialog.item-janela", { state: "detached" });
  const linhaLev = '[data-secao="leveduras"] li.ing';
  verificar(await pagina.locator(`${linhaLev} :is(input, select, textarea)`).count() === 0
    && /W-34\/70/.test(await pagina.textContent(`${linhaLev} .ing-nome`)) && /80% aten\./.test(await pagina.textContent(`${linhaLev} .ing-sub`))
    && await pagina.textContent(`${linhaLev} .ing-fixo-qtd`) === "2 pacotes" && await pagina.textContent(`${linhaLev} .ing-fixo-sub`) === "Secundária",
    "levedura na receita: só valores fixos (nome, atenuação, 2 pacotes, Secundária), sem campo");
  // Tocar na quantidade fixa também abre a janela; Esc fecha. A etapa volta a Primária.
  await pagina.click(`${linhaLev} .ing-fixo`);
  await pagina.waitForSelector("dialog.item-janela.lev");
  verificar(await pagina.inputValue('dialog.item-janela input[aria-label="Quantidade"]') === "2,0", "tocar no valor da levedura abre a janela com os campos");
  await pagina.selectOption('dialog.item-janela select[aria-label="Etapa"]', "PRIMARIA");
  await pagina.fill('dialog.item-janela input[aria-label="Quantidade"]', "1");
  await pagina.keyboard.press("Escape");
  await pagina.waitForSelector("dialog.item-janela", { state: "detached" });
  verificar(await pagina.textContent(`${linhaLev} .ing-fixo-qtd`) === "1 pacote", "janela fechada: a linha da levedura mostra o valor novo (1 pacote)");
  // Tipo vem do cadastro: levedura sem ligação (livre/importada) tem o seletor e o botão "Ligar ao cadastro"; ligada,
  // o tipo é fixo (copiado do cadastro, com forma e atenuação).
  await pagina.click(`${linhaLev} .ing-nome`);
  await pagina.waitForSelector("dialog.item-janela.lev");
  verificar(await pagina.locator('dialog.item-janela select[aria-label="Tipo"]').count() === 1, "levedura sem cadastro: tipo no seletor");
  await pagina.click("dialog.item-janela button.ligar-cadastro");
  await pagina.waitForSelector("dialog.busca");
  verificar(await pagina.inputValue("dialog.busca .busca-campo") === "W-34/70"
    && await pagina.textContent('.busca-opcao[aria-selected="true"] .busca-opcao-nome') === "Fermentis SafLager W-34/70 Fermentação baixa",
    "ligar ao cadastro: a busca já vem com o nome da levedura e acha a do catálogo");
  await pagina.keyboard.press("Enter");
  await pagina.waitForSelector("dialog.busca", { state: "detached" });
  await pagina.waitForSelector("dialog.item-janela.lev .campo-fixo");
  verificar(await pagina.locator('dialog.item-janela select[aria-label="Tipo"]').count() === 0
    && await pagina.textContent("dialog.item-janela .campo-fixo") === "Lager" && await pagina.inputValue('dialog.item-janela input[aria-label="Atenuação %"]') === "82"
    && await pagina.inputValue('dialog.item-janela input[aria-label="Quantidade"]') === "1,0" && (await pagina.textContent("dialog.item-janela .item-sub")).startsWith("Lager"),
    "ligada ao cadastro: tipo fixo Lager vindo do cadastro (sem seletor), atenuação copiada e quantidade mantida");
  await pagina.fill('dialog.item-janela input[aria-label="Atenuação %"]', "80");
  await pagina.keyboard.press("Escape");
  await pagina.waitForSelector("dialog.item-janela", { state: "detached" });
  verificar((await pagina.textContent(`${linhaLev} .ing-sub`)).startsWith("Lager"), "a linha da levedura mostra o tipo do cadastro");
  // Brassagem (24/11/2026, como os Parâmetros): OG, FG e volume real à vista; "Todos" abre a janela com nº, data,
  // CO₂ e açúcar, e a eficiência real / ABV real / priming ao vivo na cabeça. OG medida digitada 1048 vira 1,048.
  verificar(await pagina.$$eval('[data-secao="brassagem"] .param-resumo input', (ns) => ns.map((n) => n.getAttribute("aria-label")).join("|"))
    === "OG medida|FG medida|Volume real no fermentador (L)" && await pagina.locator('[data-secao="brassagem"] input[aria-label="Nº do lote"], [data-secao="brassagem"] input[type="date"]').count() === 0,
    "brassagem: só OG medida, FG medida e volume real na seção (nº e data na janela)");
  await pagina.fill('[data-secao="brassagem"] input[aria-label="OG medida"]', "1048");
  await pagina.locator('[data-secao="brassagem"] input[aria-label="OG medida"]').blur();
  verificar(await pagina.inputValue('input[aria-label="OG medida"]') === "1,048", "OG medida digitada 1048 aparece como 1,048 ao sair do campo");
  verificar(/Eficiência real \d+%/.test(await pagina.textContent('[data-secao="brassagem"] .lote-medido')), "brassagem: a seção mostra a eficiência real abaixo dos números");
  await pagina.click('[data-secao="brassagem"] button.param-todos');
  await pagina.waitForSelector("dialog.lote-janela[open]");
  const gradeLote = await pagina.$$eval("dialog.lote-janela .param-grade .param", (ls) => ls.map((l) => l.dataset.campo).join(" "));
  verificar(gradeLote === "lote_numero data_brassagem og_medida fg_medida volume_final_l co2_alvo_vol priming_acucar"
    && /Eficiência real\d+%/.test(await pagina.textContent("dialog.lote-janela .fj-metricas")),
    `brassagem: janela com nº | data · OG | FG | volume · CO₂ | açúcar e a eficiência real na cabeça (${gradeLote})`);
  await pagina.fill('dialog.lote-janela input[aria-label="Data da brassagem"]', "2026-04-20");
  const primingAntes = await pagina.textContent("dialog.lote-janela .fj-metricas");
  await pagina.fill('dialog.lote-janela input[aria-label="CO₂ desejado (vol)"]', "2,5");
  verificar(/Priming\d+ g/.test(await pagina.textContent("dialog.lote-janela .fj-metricas")) && primingAntes.includes("Priming—"),
    "brassagem: CO₂ desejado mostra o priming ao vivo na cabeça da janela");
  await pagina.click("dialog.lote-janela button.item-pronto");
  await pagina.waitForSelector("dialog.lote-janela", { state: "detached", timeout: 2000 }).catch(() => {});
  verificar(await pagina.locator("dialog.lote-janela").count() === 0 && await pagina.textContent('[data-secao="brassagem"] .total-extra') === "20/04/2026"
    && await pagina.evaluate(() => document.activeElement?.closest('[data-secao="brassagem"]') && document.activeElement.classList.contains("param-todos")),
    "brassagem: Pronto fecha, a data aparece no título e o foco volta ao Todos");
  // Água: origem e alvo do cadastro (copiados), 6 g de gesso.
  await pagina.selectOption('select[aria-label="Água de base"]', "ag-tor");
  await pagina.selectOption('select[aria-label="Perfil alvo"]', "ag-alvo");
  await pagina.click("button:has-text('+ Sal na mostura')");
  await pagina.fill('input[aria-label="Gramas na mostura"]', "6");
  await pagina.click("button:has-text('+ Sal na lavagem')");
  await pagina.selectOption('section:has(h3:text("Água")) tr:has(input[aria-label="Gramas na lavagem"]) select', "CLORETO_CALCIO");
  await pagina.fill('input[aria-label="Gramas na lavagem"]', "2");
  await pagina.waitForTimeout(150);
  const phAntes = await pagina.textContent("section:has(h3:text('Água'))");
  verificar(/pH da mostura[\s\S]*?5,\d\d/.test(phAntes) && /\+ \d+,\d mL de lático 88%/.test(phAntes) && !phAntes.includes("Para chegar"),
    "mostra o pH estimado e o botão com o ácido que falta para 5,4 (sem texto)");
  await pagina.click(".ph-cartao button.ph-acido");
  const phDepois = await pagina.textContent(".ph-cartao");
  verificar(/(5,40|5,39|5,41)/.test(phDepois) && !phDepois.includes("Sem o ácido"), "com o lático sugerido o pH vai a 5,40");
  verificar(await pagina.locator(".ph-cartao button.ph-acido").count() === 0, "pH ideal (5,3–5,5): sem o botão de ácido");
  // Volumes das duas águas (0010): vazio mostra a sugestão; informados mudam ppm/pH e avisam se não fecham.
  verificar(await pagina.getAttribute('input[aria-label="Água da mostura (L)"]', "placeholder") === "14,4"
    && await pagina.getAttribute('input[aria-label="Água de lavagem (L)"]', "placeholder") === "18,4", "volumes vazios mostram a sugestão (14,4 L + 18,4 L)");
  await pagina.fill('input[aria-label="Água da mostura (L)"]', "18");
  await pagina.fill('input[aria-label="Água de lavagem (L)"]', "14");
  await pagina.waitForTimeout(150);
  const textoVol = await pagina.textContent("section:has(h3:text('Água'))");
  verificar(textoVol.includes("Total 32,0 L · 3,8 L/kg na mostura") && textoVol.includes("faltam 0,8 L"), "volumes informados: total, L/kg e aviso de falta 0,8 L");
  // Volume de cada água num campo só, no topo do bloco ao lado do título (24/11/2026), sem repetir os litros em texto.
  const topoAgua = await pagina.$$eval(".bloco-agua", (bs) => bs.map((b) => ({ campos: b.querySelectorAll('input[aria-label$="(L)"]').length,
    noTopo: !!b.querySelector('.bloco-agua-topo input[aria-label$="(L)"]'), texto: b.querySelector(".bloco-agua-topo").textContent.trim() })));
  verificar(topoAgua.length === 2 && topoAgua.every((b) => b.campos === 1 && b.noTopo && !/\d/.test(b.texto)),
    `água: um campo de litros por bloco, no topo, sem litros repetidos em texto (${JSON.stringify(topoAgua)})`);
  verificar(/^18(,0)?$/.test(await pagina.inputValue('input[aria-label="Água da mostura (L)"]')) && /^14(,0)?$/.test(await pagina.inputValue('input[aria-label="Água de lavagem (L)"]')),
    "água: litros informados nos campos do topo (18 e 14)");
  verificar((await pagina.textContent(".painel-lote")).includes("Água necessária"), "painel mostra a água necessária quando o informado não fecha");
  // Parâmetros (24/11/2026): na receita só lote, eficiência e fervura; "Todos" abre a janela com o equipamento e os 9 campos.
  verificar(await pagina.locator('[data-secao="parametros"] .param-resumo input').count() === 3
    && await pagina.locator('[data-secao="parametros"] input[aria-label="Água/grão na mostura (L/kg)"]').count() === 0,
    "parâmetros: a seção mostra só os 3 números principais (o resto fica na janela)");
  await pagina.click('[data-secao="parametros"] button.param-todos');
  await pagina.waitForSelector("dialog.parametros-janela[open]");
  const gradeParam = await pagina.$$eval("dialog.parametros-janela .param-grade .param", (ls) => ({
    n: ls.length, colunas: new Set(ls.map((l) => Math.round(l.getBoundingClientRect().left))).size,
    linhas: new Set(ls.map((l) => Math.round(l.querySelector("input").getBoundingClientRect().top))).size }));
  verificar(gradeParam.n === 9 && gradeParam.colunas === 3 && gradeParam.linhas === 3,
    `parâmetros: janela com os 9 campos em 3 colunas × 3 linhas (${JSON.stringify(gradeParam)})`);
  verificar(await pagina.locator('dialog.parametros-janela select[aria-label="Equipamento"]').count() === 1
    && (await pagina.textContent("dialog.parametros-janela .fj-metricas")).includes("Pré-fervura"), "parâmetros: equipamento e volumes na janela");
  // Água/grão dos Parâmetros = água da mostura informada ÷ grão; mudar a relação recalcula os litros da mostura.
  const relacao = 'dialog.parametros-janela input[aria-label="Água/grão na mostura (L/kg)"]';
  verificar(await pagina.inputValue(relacao) === "3,75", "água/grão dos Parâmetros segue a água da mostura informada (18 L ÷ 4,8 kg = 3,75)");
  const definirRelacao = (v) => pagina.$eval(relacao, (n, v) => { n.value = v; n.dispatchEvent(new Event("input", { bubbles: true })); }, v);
  await definirRelacao("4");
  verificar(await pagina.inputValue('input[aria-label="Água da mostura (L)"]') === "19,2", "mudar a água/grão (4 L/kg) recalcula a água da mostura (19,2 L)");
  await definirRelacao("3,75");
  verificar(await pagina.inputValue('input[aria-label="Água da mostura (L)"]') === "18,0", "voltar a 3,75 L/kg devolve 18 L");
  // Volume do lote na janela: os volumes da janela acompanham; ao fechar, a seção mostra o número novo.
  const preJanela = await pagina.textContent("dialog.parametros-janela .fj-metricas");
  const volJanela = 'dialog.parametros-janela input[aria-label="Volume no fermentador (L)"]';
  await pagina.fill(volJanela, "25");
  verificar(await pagina.textContent("dialog.parametros-janela .fj-metricas") !== preJanela, "parâmetros: volumes da janela mudam ao vivo");
  await pagina.fill(volJanela, "23");
  await pagina.click("dialog.parametros-janela button.item-pronto");
  await pagina.waitForSelector("dialog.parametros-janela", { state: "detached", timeout: 2000 }).catch(() => {});
  const fechouParam = { janelas: await pagina.locator("dialog.parametros-janela").count(),
    volume: await pagina.inputValue('[data-secao="parametros"] input[aria-label="Volume no fermentador (L)"]'),
    foco: await pagina.evaluate(() => document.activeElement?.className) };
  verificar(fechouParam.janelas === 0 && fechouParam.volume === "23,0" && fechouParam.foco.includes("param-todos"),
    `parâmetros: Pronto fecha, a seção mostra o volume e o foco volta ao botão (${JSON.stringify(fechouParam)})`);
  // Seção Água enxuta: sem diluição, sem texto explicativo nos blocos, base e alvo na mesma linha.
  verificar(await pagina.locator('[data-secao="agua"] input[aria-label*="iluição"]').count() === 0
    && await pagina.locator('[data-secao="agua"] .bloco-agua > p.nota').count() === 0, "água: sem campo de diluição e sem texto explicativo nos blocos");
  const topos = await pagina.$$eval('.agua-perfis > label', (ls) => ls.map((l) => Math.round(l.getBoundingClientRect().top)));
  verificar(topos.length === 2 && topos[0] === topos[1], "água de base e perfil alvo na mesma linha");
  // Cada água no seu bloco: litros, sais e (na mostura) ácido e pH ficam dentro do bloco da própria água.
  const blocoM = '.bloco-agua.mostura', blocoL = '.bloco-agua.lavagem';
  verificar(await pagina.locator(`${blocoM} input[aria-label="Água da mostura (L)"]`).count() === 1 && await pagina.locator(`${blocoM} input[aria-label="Gramas na mostura"]`).count() === 1
    && await pagina.locator(`${blocoM} button:has-text("+ Ácido")`).count() === 1 && (await pagina.textContent(blocoM)).includes("pH da mostura")
    && await pagina.locator(`${blocoM} input[aria-label="Gramas na lavagem"]`).count() === 0,
    "bloco da mostura: litros, sais da mostura, ácido e pH (sem sal da lavagem)");
  verificar(await pagina.locator(`${blocoL} input[aria-label="Água de lavagem (L)"]`).count() === 1 && await pagina.locator(`${blocoL} input[aria-label="Gramas na lavagem"]`).count() === 1
    && await pagina.locator(`${blocoL} input[aria-label="Gramas na mostura"]`).count() === 0 && await pagina.locator(`${blocoL} button:has-text("+ Ácido")`).count() === 0,
    "bloco da lavagem: litros e sais da lavagem (sem sal da mostura nem ácido)");
  const textoBlocos = (await pagina.textContent(blocoM)) + (await pagina.textContent(blocoL));
  verificar(!/Alcalinidade|Sulfato\/cloreto/.test(textoBlocos), "blocos da mostura e da lavagem sem alcalinidade residual e sem sulfato/cloreto (só na tabela)");
  const ph = await pagina.evaluate(() => {
    const c = document.querySelector(".bloco-agua.mostura .ph-cartao"), m = c?.querySelector(".ph-marca"), e = c?.querySelector(".ph-escala");
    if (!c || !m) return null;
    const rm = m.getBoundingClientRect(), re = e.getBoundingClientRect(), v = Number(c.querySelector(".ph-valor").textContent.replace(",", "."));
    return { v, pos: (rm.left + rm.width / 2 - re.left) / re.width, esperado: Math.min(1, Math.max(0, (v - 5) / 0.8)), estado: c.querySelector(".ph-estado").textContent };
  });
  verificar(ph && Math.abs(ph.pos - ph.esperado) < 0.02 && ph.estado, `pH: número, selo do estado e marcador na escala (${JSON.stringify(ph)})`);
  const phCompacto = await pagina.evaluate(() => {
    const c = document.querySelector(".ph-cartao"), cs = getComputedStyle(c);
    return { fonte: parseFloat(getComputedStyle(c.querySelector(".ph-valor")).fontSize), fundo: cs.backgroundColor, sombra: cs.boxShadow, paragrafos: c.querySelectorAll("p").length };
  });
  verificar(phCompacto.fonte <= 19 && phCompacto.fundo === "rgba(0, 0, 0, 0)" && phCompacto.sombra === "none" && phCompacto.paragrafos === 0,
    `pH compacto: número ≤ 19 px, sem fundo próprio e sem texto (${JSON.stringify(phCompacto)})`);
  await pagina.waitForTimeout(200);

  // Confere o painel com o calculos.js
  const esperado = await pagina.evaluate(async () => {
    const m = await import("./calculos.js?v=20261127b");
    return m.calcularReceita({
      volume_lote_l: 23, perda_panela_l: 2, eficiencia_pct: 72, fervura_min: 60, evaporacao_l_h: 3, absorcao_grao_l_kg: 1, relacao_agua_grao_l_kg: 3, perda_tina_l: 0,
      fermentaveis: [{ tipo: "GRAO", rendimento_pct: 81, umidade_pct: 4, cor_srm: 1.8, fermentavel_pct: 100, quantidade_kg: 4.8, etapa: "MOSTURA" }],
      lupulos: [{ alfa_pct: 3.5, quantidade_g: 60, etapa: "FERVURA", tempo_min: 60 }],
      leveduras: [{ atenuacao_pct: 80 }],
    });
  });
  const br = (v, c) => v.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
  const vital = (m, parte = "vital-val") => pagina.textContent(`.vital [data-metrica="${m}"] .${parte}`);
  verificar(await vital("og") === br(esperado.og, 3), `barra vital mostra OG ${br(esperado.og, 3)}`);
  verificar(await vital("ibu") === br(esperado.ibu, 0), `barra vital mostra IBU ${br(esperado.ibu, 0)}`);
  verificar(await vital("fg") === br(esperado.fg, 3), `barra vital mostra FG ${br(esperado.fg, 3)}`);
  verificar(await vital("abv") === `${br(esperado.abv_pct, 1)}%`, `barra vital mostra ABV ${br(esperado.abv_pct, 1)}%`);
  // German Pils: OG 1,044–1,050 (receita 1,041 → abaixo); IBU 22–40 (23 → perto do mínimo); cor 2–4 SRM.
  verificar((await vital("og", "vital-estado")).includes("abaixo do estilo") && await pagina.getAttribute('.vital [data-metrica="og"]', "class") === "vital-item estado-fora",
    "OG fora da faixa: ▼ abaixo do estilo (cor + ícone + texto)");
  verificar(await vital("ibu", "vital-estado") === "! perto do mínimo", "IBU 23 na faixa 22–40: ! perto do mínimo");
  verificar(await vital("cor", "vital-estado") === "✓ no estilo", "cor 6,3 EBC na faixa 3,9–7,9: ✓ no estilo");
  verificar(await vital("og", "vital-faixa") === "estilo 1,044–1,050", "faixa do estilo escrita sob a régua");
  // Busca de estilo com a receita pronta: atual no topo, sugestão pelos números, termos em português, sem filtros.
  await pagina.click(botaoEstilo);
  await pagina.waitForSelector("dialog.busca");
  const opcoesEstilo = () => pagina.$$eval("dialog.busca .busca-opcao-nome", (ls) => ls.map((l) => l.textContent));
  const grupos = await pagina.$$eval("dialog.busca .busca-grupo", (ls) => ls.map((l) => l.textContent));
  verificar(grupos[0] === "Atual" && (await opcoesEstilo())[0].startsWith("5D German Pils"), "busca de estilo: o atual vem primeiro, marcado");
  verificar(grupos[1] === "Mais perto da receita" && (await opcoesEstilo())[1].startsWith("3A Czech Pale Lager"),
    "OG 1,041, IBU 23, cor clara: sugere Czech Pale Lager pelos números da receita");
  verificar(await pagina.$$eval("dialog.busca .busca-opcao-resumo", (ls) => ls.every((l) => /receita em \d de \d faixas/.test(l.textContent))),
    "resumo de cada estilo diz em quantas faixas a receita cabe");
  await pagina.fill("dialog.busca .busca-campo", "trigo");
  verificar((await opcoesEstilo()).length === 1 && (await opcoesEstilo())[0].startsWith("10A Weissbier"), "\"trigo\" acha a Weissbier (catálogo em inglês)");
  await pagina.fill("dialog.busca .busca-campo", "ale");
  verificar(!(await opcoesEstilo()).some((t) => t.includes("Czech Pale Lager")), "\"ale\" casa com começo de palavra: não acha Pale Lager");
  await pagina.fill("dialog.busca .busca-campo", "");
  verificar(await pagina.locator("dialog.busca .busca-filtros, dialog.busca .chip").count() === 0, "busca de estilo sem filtros (no celular tomavam a tela)");
  await pagina.screenshot({ path: `${SAIDA}/p3b-busca-estilo.png` });
  await pagina.keyboard.press("Escape");
  await pagina.waitForSelector("dialog.busca", { state: "detached" });
  verificar((await pagina.textContent(botaoEstilo)).includes("German Pils"), "Esc fecha a busca sem trocar o estilo");
  const linhaF = '[data-secao="fermentaveis"] li.ing';
  const linhaL = '[data-secao="lupulos"] li.ing';
  verificar(await pagina.textContent(`${linhaF} .d1 .ing-dado-val`) === "100,0%" && await pagina.textContent(`${linhaF} .d2 .ing-dado-val`) === `+${br((esperado.og - 1) * 1000, 0)}`,
    "fermentável mostra % do grist e pontos da OG");
  verificar(await pagina.textContent(`${linhaL} .d1 .ing-dado-val`) === br(esperado.ibu, 1) && await pagina.textContent(`${linhaL} .d2 .ing-dado-val`) === br(60 / 23, 1),
    "lúpulo mostra IBU da adição e g/L");
  verificar(await pagina.getAttribute(".grist", "aria-label") === "Proporção dos fermentáveis no peso: Pilsen (sistema) 100%" && await pagina.locator(".grist-seg").count() === 1,
    "barra do grist: um segmento por malte, com descrição para leitor de tela");
  verificar(await pagina.getAttribute(".grist-copo .copo-cerveja", "fill") === await pagina.getAttribute(".vital-copo .copo-cerveja", "fill")
      && /^Cor da cerveja: \d+ EBC$/.test(await pagina.getAttribute(".grist-copo .copo", "aria-label")),
    "copo ao lado do grist na cor final da cerveja (igual ao da barra de números)");
  verificar(await pagina.textContent('[data-secao="fermentaveis"] .ing-sub') === "3,5 EBC", "fermentável mostra a cor (EBC) abaixo do nome");
  verificar(await pagina.locator("section.cartao h3.titulo-secao .ico").count() >= 8 && await pagina.locator(".lateral .marca .copo").count() === 1, "ícones nos títulos das seções e copo na marca");
  verificar(await pagina.textContent('[data-secao="fermentaveis"] .total-secao') === "4,80 kg" && await pagina.textContent('[data-secao="lupulos"] .total-secao') === `60 g · ${br(esperado.ibu, 0)} IBU`,
    "totais no cabeçalho das seções");
  verificar(await pagina.textContent('[data-secao="fermentaveis"] .total-extra') === "3,8 L/kg água/malte" // 18 L informados ÷ 4,8 kg
    && await pagina.locator('[data-secao="lupulos"] .total-extra').count() === 0
    && await pagina.$eval('[data-secao="fermentaveis"] .total-secao', (n) => parseFloat(getComputedStyle(n).fontSize)) >= 24,
    "fermentáveis: total em destaque e água/malte ao lado (usa a água da mostura informada)");
  verificar(await pagina.$eval('[data-secao="lupulos"] .total-secao', (n) => n.classList.contains("destaque") && parseFloat(getComputedStyle(n).fontSize) >= 24 && Number(getComputedStyle(n).fontWeight) >= 700)
    && !/pellet|flor|plug|crio|extrato/i.test(await pagina.textContent('[data-secao="lupulos"] .ing-sub')),
    "lúpulos: gramas e IBU final em destaque no título; linha sem a forma do lúpulo");
  verificar(await pagina.$$eval('[data-secao="parametros"] .param-resumo input', (ns) => ns.map((n) => n.value).join(" ")) === "23,0 72 60"
    && await pagina.textContent('[data-secao="parametros"] .total-extra') === "Panela 50 L", "parâmetros: lote, eficiência, fervura e equipamento à vista");
  verificar((await pagina.textContent(".painel-lote")).includes("Eficiência real"), "OG medida mostra a eficiência real (bloco Medido no lote)");
  const textoPainel = await pagina.textContent(".painel-lote");
  const textoAgua = await pagina.textContent("section:has(h3:text('Água'))");
  const esperadoAgua = await pagina.evaluate(async () => {
    const m = await import("./calculos.js?v=20261127b");
    const litros = (rot) => Number(document.querySelector(".painel-lote").textContent.match(new RegExp(rot + "[^0-9]*?([0-9]+,[0-9]) L"))[1].replace(",", "."));
    const o = { sulfato_ppm: 10, cloreto_ppm: 15 };
    const mostura = m.perfilAgua({ origem: o, sais: [{ sal: "GESSO", gramas: 6 }], litros: litros("Água da mostura") }).ions;
    const lavagem = m.perfilAgua({ origem: o, sais: [{ sal: "CLORETO_CALCIO", gramas: 2 }], litros: litros("Água de lavagem") }).ions;
    const panela = m.perfilAgua({ origem: o, sais: [{ sal: "GESSO", gramas: 6 }, { sal: "CLORETO_CALCIO", gramas: 2 }], litros: litros("Água total") }).ions;
    return { so4: [mostura, lavagem, panela].map((x) => Math.round(x.sulfato_ppm)), cl: [mostura, lavagem, panela].map((x) => Math.round(x.cloreto_ppm)) };
  });
  verificar(textoAgua.includes(`Sulfato (SO₄)SO₄10${esperadoAgua.so4.join("")}255`), `perfil da água: sulfato origem 10 → mostura/lavagem/panela ${esperadoAgua.so4.join(" / ")} (alvo 255)`);
  verificar(textoAgua.includes(`Cloreto (Cl)Cl15${esperadoAgua.cl.join("")}`), `perfil da água: cloreto da lavagem só na lavagem e na panela (${esperadoAgua.cl.join(" / ")})`);
  const indices = await pagina.$$eval(".perfil-agua tbody.perfil-indices tr", (trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent)));
  verificar(indices.length === 2 && indices[0][0].startsWith("Alcalinidade residual") && indices[1][0].startsWith("Sulfato/cloreto") && indices.every((l) => l.length === 6 && l.slice(1).every((x) => /^-?\d|—/.test(x))),
    `tabela do perfil: alcalinidade residual e sulfato/cloreto em base/mostura/lavagem/panela/alvo (${JSON.stringify(indices)})`);
  verificar(/Sulfato\/cloreto: mostura [a-z ]+ · total (seca e amarga|levemente amarga)/.test(textoAgua), "pé da tabela: leitura do sulfato/cloreto na mostura e no total");
  verificar(/Priming.*Açúcar comum \(sacarose\)\d+ g/.test(textoPainel), "CO₂ desejado mostra os gramas de priming");
  verificar(/Temperatura da água da mostura[\s\S]{0,300}?absorve\.\d+,\d °C/.test(textoPainel), "painel mostra a temperatura da água da mostura");

  // Mudança mostra a diferença e a barra continua à vista com a página rolada.
  const qtd = pagina.locator('input[aria-label="Qtd (kg)"]').first();
  await qtd.fill("5,3");
  await pagina.waitForSelector('.vital [data-metrica="og"] .vital-delta.visivel');
  const esperado53 = await pagina.evaluate(async () => {
    const m = await import("./calculos.js?v=20261127b");
    const f = (kg) => m.calcularReceita({ volume_lote_l: 23, perda_panela_l: 2, eficiencia_pct: 72, fervura_min: 60, evaporacao_l_h: 3,
      fermentaveis: [{ tipo: "GRAO", rendimento_pct: 81, umidade_pct: 4, cor_srm: 1.8, fermentavel_pct: 100, quantidade_kg: kg, etapa: "MOSTURA" }] }).og;
    return Number(f(5.3).toFixed(3)) - Number(f(4.8).toFixed(3));
  });
  verificar(await vital("og", "vital-delta") === `+${br(esperado53, 3)}`, `diferença só desta mudança: 4,8 → 5,3 kg = OG +${br(esperado53, 3)}`);
  await pagina.locator('textarea[aria-label="Notas"]').scrollIntoViewIfNeeded();
  const caixa = await pagina.locator(".vital").boundingBox();
  verificar(caixa.y >= 0 && caixa.y + caixa.height <= 900, `computador: barra vital à vista com a página rolada até as notas (y=${Math.round(caixa.y)})`);
  await pagina.screenshot({ path: `${SAIDA}/p3b-editor-rolado.png` });
  await qtd.fill("4,8");
  await pagina.waitForTimeout(100);
  verificar(await vital("og") === br(esperado.og, 3), "voltar a 4,8 kg volta a OG");

  // Ajuste rápido: + (250 g), seta ↑ (250 g), Shift+↓ (2,5 kg).
  await pagina.click(`${linhaF} button.passo[aria-label="Mais 250 g"]`);
  verificar(await qtd.inputValue() === "5,050", "botão + soma 250 g");
  await qtd.focus();
  await pagina.keyboard.press("ArrowUp");
  verificar(await qtd.inputValue() === "5,300", "seta ↑ soma 250 g");
  await pagina.keyboard.press("Shift+ArrowDown");
  verificar(await qtd.inputValue() === "2,800", "Shift+↓ tira 2,5 kg");
  await qtd.fill("4,8");

  // Segundo lúpulo pela busca (Saaz aparece em "Recentes"); mudar a etapa; arrastar; mover pelo teclado; remover.
  await adicionar("lupulos");
  await pagina.waitForSelector("dialog.busca");
  verificar(await pagina.textContent(".busca-grupo") === "Recentes", "busca mostra os recentes primeiro");
  await pagina.keyboard.press("Enter");
  await pagina.keyboard.type("20");
  await pagina.keyboard.press("Enter");
  await pagina.waitForSelector("dialog.item-janela", { state: "detached" });
  const segunda = `${linhaL}:nth-child(2)`;
  await pagina.selectOption(`${segunda} select[aria-label="Etapa"]`, "DRY_HOP");
  verificar(await pagina.isVisible(`${segunda} input[aria-label="Dia"]`) && !(await pagina.isVisible(`${segunda} input[aria-label="Tempo (min)"]`)) && await pagina.textContent(`${segunda} .d1 .ing-dado-val`) === "—",
    "dry hop: pede o dia no lugar do tempo e o IBU fica '—'");
  verificar(await vital("ibu") === br(esperado.ibu, 0), "dry hop não muda o IBU");
  // E4: linha do tempo com o lúpulo da fervura (60 min = início) e o dry hop na zona própria.
  const pontosTempo = await pagina.$$eval(".tempo-ponto", (ps) => ps.map((p) => ({ rot: p.getAttribute("aria-label"), esq: parseFloat(p.style.left) })));
  verificar(pontosTempo.length === 2 && pontosTempo.some((p) => p.esq === 0 && p.rot.includes("60 min")) && pontosTempo.some((p) => p.rot.includes("dry hop") && p.esq > 80),
    `linha do tempo: lúpulo de 60 min no início e dry hop na zona do fim (${pontosTempo.map((p) => Math.round(p.esq)).join(", ")}%)`);
  await pagina.click('.tempo-ponto[aria-label*="dry hop"]');
  verificar(await pagina.evaluate(() => document.querySelectorAll('[data-secao="lupulos"] li.ing')[1].classList.contains("destaque")), "tocar no lúpulo da linha do tempo destaca a linha dele");
  const alca2 = await pagina.locator(`${segunda} .ing-alca`).boundingBox();
  const linha1 = await pagina.locator(`${linhaL}:nth-child(1)`).boundingBox();
  await pagina.mouse.move(alca2.x + alca2.width / 2, alca2.y + alca2.height / 2);
  await pagina.mouse.down();
  await pagina.mouse.move(alca2.x + alca2.width / 2, linha1.y + 4, { steps: 8 });
  await pagina.mouse.up();
  await pagina.waitForTimeout(100);
  verificar(await pagina.inputValue(`${linhaL}:nth-child(1) input[aria-label="Qtd (g)"]`) === "20,0", "arrastar pela alça leva o lúpulo para cima");
  await pagina.focus(`${linhaL}:nth-child(1) .ing-alca`);
  await pagina.keyboard.press("ArrowDown");
  verificar(await pagina.inputValue(`${linhaL}:nth-child(2) input[aria-label="Qtd (g)"]`) === "20,0" && (await focado()).includes("posição 2 de 2"),
    "seta ↓ na alça desce o item e o foco acompanha");
  verificar(await pagina.locator(".ing-mais").count() === 0, "sem o botão ⋯ nas linhas de ingrediente");
  // Detalhes do item numa janela (24/11/2026): tocar no item abre; a quantidade está na janela.
  const janelaItem = "dialog.item-janela";
  await pagina.click(`${segunda} .ing-dado.d1`);
  verificar(await pagina.isVisible(janelaItem) && await pagina.locator(".ing-detalhes").count() === 0, "clicar nos números da linha abre a janela do item (sem detalhes embutidos na linha)");
  await pagina.click(`${janelaItem} button.item-fechar`);
  await pagina.waitForTimeout(50);
  const foco1 = (await focado()) ?? await pagina.evaluate(() => document.activeElement?.outerHTML.slice(0, 120));
  verificar(!(await pagina.isVisible(janelaItem)) && foco1.startsWith("Detalhes de"), `× fecha a janela e o foco volta ao item (${foco1})`);
  await pagina.click(`${segunda} input[aria-label="Qtd (g)"]`);
  verificar(!(await pagina.isVisible(janelaItem)), "clicar na quantidade da linha não abre a janela");
  await pagina.click(`${segunda} button.ing-nome`);
  verificar(await pagina.isVisible(`${janelaItem} input[aria-label="Alfa (%)"]`) && await pagina.isVisible(`${janelaItem} input[aria-label="Qtd (g)"]`),
    "clicar no nome do item abre a janela com a quantidade e os dados (alfa, forma, nome)");
  verificar((await pagina.textContent(`${janelaItem} .fonte-dados`)).includes("Cadastrado por você"), "janela do lúpulo na receita mostra a fonte dos dados");
  const glJanela = await pagina.textContent(`${janelaItem} .ing-dado.d2 .ing-dado-val`);
  await pagina.fill(`${janelaItem} input[aria-label="Qtd (g)"]`, "40");
  await pagina.waitForTimeout(50);
  const glJanela2 = await pagina.textContent(`${janelaItem} .ing-dado.d2 .ing-dado-val`);
  verificar(glJanela2 !== glJanela, `quantidade na janela: o g/L do lúpulo muda ao vivo (${glJanela} → ${glJanela2} g/L)`);
  await pagina.screenshot({ path: `${SAIDA}/p3f-detalhes.png` });
  await pagina.keyboard.press("Escape");
  await pagina.waitForTimeout(50);
  verificar(!(await pagina.isVisible(janelaItem)) && await pagina.inputValue(`${segunda} input[aria-label="Qtd (g)"]`) === "40,0", "Esc fecha a janela e a linha mostra a quantidade nova");
  await pagina.keyboard.press("Control+z");
  verificar(await pagina.inputValue(`${segunda} input[aria-label="Qtd (g)"]`) !== "40,0", "Ctrl+Z desfaz a quantidade mudada na janela");
  await pagina.click(`${segunda} button.ing-nome`);
  await pagina.click(`${janelaItem} >> text=Remover`);
  verificar(!(await pagina.isVisible(janelaItem)) && await pagina.locator(linhaL).count() === 1 && await pagina.inputValue('input[aria-label="Qtd (g)"]') === "60,0", "remover pela janela do item");

  // ---- E3: desfazer/refazer ----
  await pagina.keyboard.press("Control+z");
  verificar(await pagina.locator(linhaL).count() === 2, "Ctrl+Z traz de volta o lúpulo removido");
  await pagina.keyboard.press("Control+Shift+z");
  verificar(await pagina.locator(linhaL).count() === 1, "Ctrl+Shift+Z refaz a remoção");
  await qtd.fill("5,5");
  await pagina.keyboard.press("Control+z");
  verificar(await qtd.inputValue() === "4,800" && await vital("og") === br(esperado.og, 3), "Ctrl+Z volta a quantidade digitada");
  verificar((await vital("og", "vital-delta")).startsWith("−"), "depois de desfazer, a barra mostra a diferença");

  // ---- E3: chegar à OG (pelo número da OG na barra) ----
  verificar(await pagina.locator('.titulo-acoes button:has-text("Chegar à OG"), .titulo-acoes button:has-text("Chegar ao IBU")').count() === 0
    && await pagina.locator('.vital [data-metrica="og"] button.vital-val, .vital [data-metrica="ibu"] button.vital-val').count() === 2,
    "sem os botões Chegar à OG/IBU nas seções (abrem pelo número na barra)");
  await pagina.click('.vital [data-metrica="og"] button.vital-val');
  await pagina.waitForSelector("dialog.alvo");
  await pagina.fill('dialog.alvo input[aria-label="OG desejada"]', "46");
  verificar((await pagina.textContent(".alvo-previa")).includes("OG 1,046"), "OG em pontos (46) vira 1,046 na prévia");
  await pagina.click('dialog.alvo button:has-text("Meio do estilo")');
  const previaOG = await pagina.textContent(".alvo-previa");
  verificar(previaOG.includes("Pilsen (sistema)") && previaOG.includes("OG 1,047"), "prévia mostra o malte novo e a OG 1,047 (meio do German Pils) antes de aplicar");
  await pagina.screenshot({ path: `${SAIDA}/p3g-chegar-og.png` });
  await pagina.click('dialog.alvo button:has-text("Aplicar")');
  const kgOG = Number((await qtd.inputValue()).replace(",", "."));
  const kgEsperado = await pagina.evaluate(async () => {
    const m = await import("./calculos.js?v=20261127b");
    return m.ajustarParaOG({ volume_lote_l: 23, perda_panela_l: 2, eficiencia_pct: 72, fervura_min: 60, evaporacao_l_h: 3,
      fermentaveis: [{ tipo: "GRAO", rendimento_pct: 81, umidade_pct: 4, cor_srm: 1.8, fermentavel_pct: 100, quantidade_kg: 4.8, etapa: "MOSTURA" }] }, 1.047).quantidades[0];
  });
  verificar(await vital("og") === "1,047" && kgOG === kgEsperado, `Chegar à OG aplica ${br(kgEsperado, 3)} kg e a OG fica 1,047`);
  await pagina.keyboard.press("Control+z");
  verificar(await qtd.inputValue() === "4,800", "Ctrl+Z desfaz o ajuste inteiro");

  // ---- sem cadeado (retirado em 22/11/2026) ----
  verificar(await pagina.locator(".ing-trava").count() === 0, "linhas de ingrediente sem o botão de cadeado");

  // ---- E3: chegar ao IBU ----
  await pagina.click('.vital [data-metrica="ibu"] button.vital-val');
  await pagina.fill('dialog.alvo input[aria-label="IBU desejado"]', "30");
  verificar((await pagina.textContent(".alvo-previa")).includes("Saaz"), "prévia do IBU mostra o lúpulo que muda");
  await pagina.click('dialog.alvo button:has-text("Aplicar")');
  const gIBU = Number((await pagina.inputValue('input[aria-label="Qtd (g)"]')).replace(",", "."));
  verificar(await vital("ibu") === "30" && gIBU > 60, `Chegar ao IBU: 30 IBU com ${br(gIBU, 1)} g de Saaz`);
  await pagina.keyboard.press("Control+z");
  verificar(await pagina.inputValue('input[aria-label="Qtd (g)"]') === "60,0" && await vital("ibu") === br(esperado.ibu, 0), "Ctrl+Z volta o lúpulo");

  // ---- sem ferramentas na barra (26/11/2026, pedido do responsável): nem Desfazer/Refazer nem referência ----
  verificar(await pagina.locator(".vital-ferramentas, .vital-ref, .ref-info").count() === 0
    && await pagina.locator('.vital button:has-text("Fixar referência"), .vital button:has-text("Desfazer")').count() === 0,
    "barra de números sem Desfazer/Refazer e sem referência");
  verificar(await vital("cor", "vital-rot") === "EBC" && await vital("ph", "vital-rot") === "pH", "rótulos curtos: “EBC” (sem “Cor”) e “pH” (sem “mostura”)");
  await pagina.evaluate(() => window.scrollTo(0, 0));
  await pagina.screenshot({ path: `${SAIDA}/p3-editor.png` });
  verificar(await pagina.evaluate(() => document.documentElement.dataset.modo + "/" + document.documentElement.dataset.tema) === "claro/classico",
    "tema Automático com o aparelho claro = Clássico");
  await pagina.emulateMedia({ colorScheme: "dark" });
  await pagina.waitForFunction(() => document.documentElement.dataset.modo === "escuro", null, { timeout: 2000 }).catch(() => {});
  verificar(await pagina.evaluate(() => document.documentElement.dataset.modo + "/" + document.documentElement.dataset.tema) === "escuro/adega",
    "tema Automático acompanha o aparelho no escuro sem recarregar (Adega)");
  await pagina.screenshot({ path: `${SAIDA}/p3c-editor-escuro.png` });
  await pagina.emulateMedia({ colorScheme: "light" });
  // Linhas de ingrediente dentro do cartão (o menu lateral tira largura do editor).
  const sobraLinhas = () => pagina.evaluate(() => Math.max(...[...document.querySelectorAll("li.ing")].map((li) => {
    const sec = li.closest("section").getBoundingClientRect();
    return Math.round(Math.max(...[...li.children].filter((f) => !f.hidden).map((f) => f.getBoundingClientRect().right)) - sec.right);
  })));
  for (const [w, recolher] of [[1366, false], [1366, true], [1280, false], [1440, false]]) {
    if (recolher !== Boolean(await pagina.evaluate(() => document.querySelector(".casca").classList.contains("recolhido")))) await pagina.click("button.recolher");
    await pagina.setViewportSize({ width: w, height: 900 });
    await pagina.waitForTimeout(400);
    const sobra = await sobraLinhas();
    // seção sem margem interna desde 23/11/2026 (layout sem contorno): a linha pode encostar na borda, não passar dela
    verificar(sobra <= 0, `computador ${w} px, menu ${recolher ? "recolhido" : "completo"}: linhas de ingrediente cabem na seção (folga ${-sobra} px)`);
  }
  await pagina.setViewportSize({ width: 1024, height: 768 });
  await pagina.waitForTimeout(400); // o menu passa a só ícones com animação
  verificar(await pagina.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 1, "tablet (1024 px): página não passa da largura");
  verificar(await pagina.evaluate(() => document.querySelector(".casca").classList.contains("compacto") && document.querySelector(".lateral").getBoundingClientRect().width < 100), "tablet (1024 px): menu lateral fica só com ícones");
  verificar(await sobraLinhas() <= 0, "tablet (1024 px): linhas de ingrediente cabem na seção");
  await pagina.screenshot({ path: `${SAIDA}/p3d-editor-tablet.png` });
  await pagina.setViewportSize({ width: 1366, height: 900 });

  await pagina.click(".acoes-receita button:has-text('Salvar')");
  await pagina.waitForFunction(() => /#\/receita\/[0-9a-f-]{36}$/.test(location.hash));
  await pagina.waitForSelector(".titulo-receita");
  const salvo = chamadas.find((c) => c.caminho.startsWith("/rest/v1/rpc/salvar_receita"));
  verificar(salvo && salvo.corpo.p.fermentaveis[0].fermentavel_id === "f-sis" && salvo.corpo.p.fermentaveis[0].quantidade_kg === 4.8, "salvar_receita recebe o fermentável do cadastro com 4,8 kg");
  verificar(Math.abs(salvo.corpo.p.og_calc - esperado.og) < 1e-4, "og_calc gravado = cálculo");
  verificar(salvo.corpo.p.og_medida === 1.048 && salvo.corpo.p.data_brassagem === "2026-04-20" && salvo.corpo.p.lote_numero === null,
    "lote vai com OG 1048 → 1,048, data e número automático");
  verificar(salvo.corpo.p.agua_origem?.nome === "Torneira teste" && salvo.corpo.p.agua_origem.sulfato_ppm === 10 && !("id" in salvo.corpo.p.agua_origem)
    && salvo.corpo.p.agua_alvo?.nome === "Alvo IPA" && JSON.stringify(salvo.corpo.p.sais) === '[{"sal":"GESSO","gramas":6,"etapa":"MOSTURA"},{"sal":"CLORETO_CALCIO","gramas":2,"etapa":"LAVAGEM"}]', "água vai como cópia (sem id) e sais em gramas, cada um com a sua água");
  verificar(salvo.corpo.p.agua_mostura_l === 18 && salvo.corpo.p.agua_lavagem_l === 14, "água da mostura e da lavagem vão em litros");
  verificar(salvo.corpo.p.mostura.length > 0 && salvo.corpo.p.mostura.every((m, i) => m.nome === `Rampa ${i + 1}` && m.tipo === "TEMPERATURA"),
    `passo da mostura grava o próprio rótulo como nome (${salvo.corpo.p.mostura.map((m) => m.nome).join(", ")})`);
  verificar(await pagina.inputValue('input[aria-label="Água da mostura (L)"]') === "18,0", "água da mostura reabre com 18,0 L");
  verificar(salvo.corpo.p.acidos.length === 1 && salvo.corpo.p.acidos[0].acido === "LATICO_88" && salvo.corpo.p.acidos[0].ml > 0, "ácido vai em mL");
  verificar((await pagina.inputValue('select[aria-label="Água de base"]')) === "__atual", "água reabre como 'guardada nesta receita'");
  verificar(await pagina.textContent('[data-secao="brassagem"] .total-extra') === "nº 1 · 20/04/2026", "receita reabre com o nº do lote 1 e a data no título da Brassagem");
  verificar(await pagina.inputValue(".titulo-receita") === "Pils da Galia", "receita reabre do banco com o nome");
  verificar(await pagina.inputValue('input[aria-label="Qtd (kg)"]') === "4,800", "fermentável reabre com 4,800 kg");

  verificar(!(await pagina.textContent("body")).includes("null"), "nenhum 'null' escrito na tela do editor");
  await pagina.click("text=Voltar");
  await pagina.waitForSelector("td >> text=Pils da Galia");
  verificar(await pagina.isVisible("td >> text=5D German Pils"), "lista mostra a receita com o estilo");
  verificar(await pagina.isVisible("td >> text=20/04/2026"), "lista mostra a data da brassagem sem erro de fuso");

  // Ferramentas (24/11/2026): menu de botões; cada ferramenta abre numa janela. Valores padrão (5 kg, 3 L/kg, grão 20 °C,
  // parada 66 °C; 20 L, 2,4 vol, 20 °C, sacarose).
  await pagina.click(".lateral nav >> text=Ferramentas");
  await pagina.waitForSelector(".ferramentas-menu");
  verificar(await pagina.locator("button.ferramenta-botao").count() === 4, "Ferramentas: menu com 4 botões");
  const botaoFerr = (id) => `button.ferramenta-botao[data-ferramenta="${id}"]`;
  verificar((await pagina.textContent(botaoFerr("agua"))).includes("15,0 L a 72,3 °C"), "botão da água da mostura mostra o resultado (15,0 L a 72,3 °C)");
  const janelaFerr = () => pagina.textContent("dialog.ferramenta-janela[open]");
  const abrirFerr = async (id) => { await pagina.click(botaoFerr(id)); await pagina.waitForSelector(`dialog.ferramenta-janela[open][data-ferramenta="${id}"]`); };
  const fecharFerr = async () => { await pagina.click("dialog.ferramenta-janela .item-pronto"); await pagina.waitForSelector("dialog.ferramenta-janela", { state: "detached" }); };
  await abrirFerr("agua");
  const ferr = await pagina.textContent(".fj-resultado");
  verificar(ferr.includes("Água da mostura15,0 L") && ferr.includes("Temperatura da água72,3 °C"), "água da mostura: 15,0 L a 72,3 °C (resultado no topo da janela)");
  verificar(await pagina.evaluate(() => document.activeElement?.classList.contains("item-fechar")), "janela da ferramenta abre com o foco no ×");
  await pagina.keyboard.press("Escape");
  await pagina.waitForSelector("dialog.ferramenta-janela", { state: "detached" });
  verificar(await pagina.evaluate(() => document.activeElement?.dataset.ferramenta === "agua"), "Esc fecha a janela e o foco volta ao botão");
  await abrirFerr("priming");
  verificar((await janelaFerr()).includes("112 g"), "priming: 112 g de açúcar comum para 20 L a 2,4 vol");
  await pagina.selectOption('select[aria-label="Açúcar"]', "DEXTROSE");
  await pagina.fill('input[aria-label="CO₂ desejado (vol)"]', "0,5");
  verificar((await janelaFerr()).includes("não precisa de priming"), "CO₂ abaixo do que a cerveja já tem: avisa que não precisa");
  await pagina.fill('input[aria-label="CO₂ desejado (vol)"]', "2,4");
  await pagina.click("dialog.ferramenta-janela h2");
  await fecharFerr();
  verificar((await pagina.textContent(botaoFerr("priming"))).includes("de dextrose para 20 L"), "Pronto fecha e o botão do priming mostra a conta nova (dextrose)");
  await abrirFerr("priming");
  verificar(await pagina.inputValue('input[aria-label="CO₂ desejado (vol)"]') === "2,4", "valores ficam ao fechar e abrir de novo");
  await pagina.mouse.click(5, 5);              // toque no fundo escuro fecha
  await pagina.waitForSelector("dialog.ferramenta-janela", { state: "detached" });
  verificar(true, "toque fora da janela fecha");
  // Refratômetro (mosto 1,046 em densidade, fator 1,04) e densímetro (1,050 a 25 °C, calibrado a 20 °C).
  await abrirFerr("refratometro");
  verificar(await pagina.inputValue('input[aria-label="Densidade do mosto (antes de fermentar)"]') === "1,046", "refratômetro: mosto em densidade (1,046)");
  verificar((await janelaFerr()).includes("°Brix esperado no refratômetro11,9"), "refratômetro: 1,046 → 11,9 °Brix esperado");
  await pagina.fill('input[aria-label="°Brix atual (fermentando)"]', "6");
  verificar(/FG \(densidade atual\)1,011/.test(await janelaFerr()), "refratômetro fermentando (Terrill): FG 1,011");
  await pagina.click("summary:text('Descobrir o fator')");
  await pagina.fill('input[aria-label="Densímetro (mosto)"]', "1048");
  await pagina.fill('input[aria-label="Refratômetro (°Brix)"]', "12,5");
  await pagina.click('input[aria-label="Refratômetro (°Brix)"]');
  verificar(await pagina.inputValue('input[aria-label="Densímetro (mosto)"]') === "1,048", "densidade digitada 1048 aparece como 1,048 ao sair do campo");
  await pagina.click("button:has-text('Usar este fator')");
  verificar(await pagina.inputValue('input[aria-label="Fator do refratômetro"]') === "1,049", "descobre o fator (1,049) e passa a usar");
  verificar(await pagina.evaluate(() => JSON.parse(localStorage.getItem("galiabrew.preferencias")).fator_refratometro) === 1.049, "fator fica salvo no navegador");
  await pagina.click("dialog.ferramenta-janela .item-fechar");
  await pagina.waitForSelector("dialog.ferramenta-janela", { state: "detached" });
  verificar(/OG 1,0\d\d · FG 1,0\d\d/.test(await pagina.textContent(botaoFerr("refratometro"))), "× fecha e o botão do refratômetro mostra OG · FG");
  await abrirFerr("densimetro");
  verificar((await pagina.textContent(".fj-resultado")).includes("Densidade corrigida1,051"), "densímetro: 1,050 a 25 °C (calibrado a 20 °C) → 1,051");
  await pagina.screenshot({ path: `${SAIDA}/p6-ferramentas.png`, fullPage: true });
  await pagina.evaluate(() => { location.hash = "#/receitas"; });   // trocar de rota fecha a janela
  await pagina.waitForSelector("dialog.ferramenta-janela", { state: "detached" });
  await pagina.click(".lateral nav >> text=Receitas");
  await pagina.waitForSelector("td >> text=Pils da Galia");
  await pagina.screenshot({ path: `${SAIDA}/p4-lista.png` });

  // Menu recolhível: só ícones, fica salvo no navegador e continua assim ao recarregar.
  const larguraMenu = () => pagina.evaluate(() => document.querySelector(".lateral").getBoundingClientRect().width);
  const menuAberto = await larguraMenu();
  await pagina.click("button.recolher");
  await pagina.waitForFunction(() => document.querySelector(".lateral").getBoundingClientRect().width < 100);
  verificar(menuAberto > 200 && !(await pagina.isVisible(".lateral nav >> text=Receitas")), `recolher deixa o menu só com ícones (${Math.round(menuAberto)} → ${Math.round(await larguraMenu())} px)`);
  await pagina.screenshot({ path: `${SAIDA}/p4b-menu-recolhido.png` });
  await pagina.reload();
  await pagina.waitForSelector("td >> text=Pils da Galia");
  verificar(await pagina.evaluate(() => document.querySelector(".casca").classList.contains("recolhido")), "menu recolhido continua recolhido ao recarregar");
  await pagina.click('.lateral nav a[data-rota="ferramentas"]');
  await pagina.waitForSelector(".ferramentas-menu");
  verificar(true, "menu recolhido navega pelos ícones");
  await pagina.click("button.recolher");
  await pagina.waitForFunction(() => document.querySelector(".lateral").getBoundingClientRect().width > 200);
  await pagina.click(".lateral nav >> text=Receitas");
  await pagina.waitForSelector("td >> text=Pils da Galia");

  // Celular
  await pagina.setViewportSize({ width: 390, height: 844 });
  await pagina.waitForTimeout(400); // fim da animação da gaveta
  verificar(!(await pagina.isVisible(".lateral nav >> text=Receitas")) && await pagina.isVisible("button.abrir-menu >> visible=true"), "celular: menu escondido, botão de abrir no topo");
  await pagina.click("button.abrir-menu >> visible=true");
  await pagina.waitForFunction(() => document.querySelector(".lateral").getBoundingClientRect().left >= 0);
  verificar(await pagina.isVisible(".lateral nav >> text=Cadastros") && await pagina.evaluate(() => document.body.classList.contains("travado")), "celular: botão abre a gaveta com os nomes e trava a rolagem da página");
  await pagina.screenshot({ path: `${SAIDA}/p5f-celular-menu.png` });
  await pagina.click(".lateral nav >> text=Cadastros");
  await pagina.waitForSelector("text=Pilsen (sistema)");
  await pagina.waitForFunction(() => getComputedStyle(document.querySelector(".lateral")).visibility === "hidden");
  verificar(!(await pagina.evaluate(() => document.body.classList.contains("travado"))), "celular: escolher um item fecha a gaveta");
  await pagina.click("button.abrir-menu >> visible=true");
  await pagina.keyboard.press("Escape");
  await pagina.waitForFunction(() => getComputedStyle(document.querySelector(".lateral")).visibility === "hidden");
  verificar(true, "celular: Esc fecha a gaveta");
  await pagina.click("button.abrir-menu >> visible=true");
  await pagina.click(".veu", { position: { x: 370, y: 400 } });
  await pagina.waitForFunction(() => getComputedStyle(document.querySelector(".lateral")).visibility === "hidden");
  verificar(true, "celular: tocar fora fecha a gaveta");
  await pagina.click("button.abrir-menu >> visible=true");
  await pagina.click(".lateral nav >> text=Receitas");
  await pagina.click(".receita-cartao >> text=Pils da Galia");
  await pagina.waitForSelector(".titulo-receita");
  const larguraExtra = await pagina.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  verificar(larguraExtra <= 1, `celular: página não passa da largura (${larguraExtra}px)`);
  await pagina.locator('[data-secao="fermentaveis"] .titulo-linha').screenshot({ path: `${SAIDA}/p9-celular-total-fermentaveis.png` });
  await pagina.screenshot({ path: `${SAIDA}/p5-celular.png` });
  // Adicionar = só o "+", sem borda, na mesma linha do título da seção (390 px aqui; 320 px mais abaixo).
  const botoesMais = () => pagina.evaluate(() => [...document.querySelectorAll(".editor-corpo .titulo-linha button.adicionar")].map((b) => {
    const t = b.closest(".titulo-linha").querySelector("h3").getBoundingClientRect(), r = b.getBoundingClientRect(), cs = getComputedStyle(b);
    return { secao: b.closest("[data-secao]").dataset.secao, texto: b.textContent, rotulo: b.getAttribute("aria-label"),
      borda: cs.borderTopWidth, alinhado: r.top < t.bottom && r.bottom > t.top, toque: r.width >= 44 && r.height >= 44 };
  }));
  const mais390 = await botoesMais();
  verificar(mais390.length === 6 && mais390.every((b) => b.texto === "+" && b.rotulo?.startsWith("Adicionar") && b.borda === "0px" && b.alinhado && b.toque),
    `celular 390 px: "+" sem borda ao lado do título em todas as seções (${JSON.stringify(mais390.filter((b) => !(b.alinhado && b.toque && b.borda === "0px")))})`);
  await pagina.evaluate(() => document.querySelector('[data-secao="lupulos"]').scrollIntoView());
  await pagina.screenshot({ path: `${SAIDA}/p5e-celular-lupulos.png` });
  // Sal da água: nome, gramas e × na mesma linha (390 e 320 px), sem passar da largura do bloco.
  const linhaDoSal = () => pagina.evaluate(() => {
    const tr = document.querySelector('tr:has(input[aria-label="Gramas na mostura"])');
    const bloco = tr.closest(".bloco-agua").getBoundingClientRect();
    const r = [tr.querySelector("select"), tr.querySelector("input"), tr.querySelector("button")].map((n) => n.getBoundingClientRect());
    const meio = r.map((x) => x.top + x.height / 2);
    return { alinhado: Math.max(...meio) - Math.min(...meio) <= 2, ordem: r[0].right <= r[1].left && r[1].right <= r[2].left,
      cabe: r[2].right <= bloco.right + 1, altura: Math.round(tr.getBoundingClientRect().height), select: Math.round(r[0].width) };
  });
  const sal390 = await linhaDoSal();
  verificar(sal390.alinhado && sal390.ordem && sal390.cabe && sal390.altura <= 60, `celular: cada sal da água numa linha só (${JSON.stringify(sal390)})`);
  // Água de base e perfil alvo lado a lado, sem passar da largura da seção (390 e 320 px).
  const perfisAgua = () => pagina.evaluate(() => {
    const sec = document.querySelector('[data-secao="agua"]').getBoundingClientRect();
    const r = [...document.querySelectorAll(".agua-perfis select")].map((n) => n.getBoundingClientRect());
    return { linha: r.length === 2 && Math.abs(r[0].top - r[1].top) < 1, cabe: r.every((x) => x.right <= sec.right + 1), largura: r.map((x) => Math.round(x.width)) };
  });
  const perfis390 = await perfisAgua();
  verificar(perfis390.linha && perfis390.cabe, `celular 390 px: água de base e perfil alvo na mesma linha (${JSON.stringify(perfis390)})`);
  await pagina.evaluate(() => { document.querySelector('[data-secao="agua"]').scrollIntoView(); window.scrollBy(0, -20); });
  await pagina.screenshot({ path: `${SAIDA}/p5j-celular-agua-topo.png` });
  await pagina.evaluate(() => document.querySelector(".bloco-agua").scrollIntoView());
  await pagina.screenshot({ path: `${SAIDA}/p5g-celular-sais.png` });
  // pH em cartão e tabela do perfil com alcalinidade residual e SO₄/Cl, sem rolar para o lado (390 e 320 px).
  const tabelaPerfil = () => pagina.evaluate(() => { const t = document.querySelector(".perfil-agua"), p = t.parentElement; return { cabe: t.scrollWidth <= p.clientWidth + 1, t: t.scrollWidth, p: p.clientWidth }; });
  const fotosAgua = async (sufixo) => {
    await pagina.evaluate(() => { document.querySelector(".ph-cartao").scrollIntoView({ block: "center" }); });
    await pagina.screenshot({ path: `${SAIDA}/p5l-celular-ph${sufixo}.png` });
    await pagina.evaluate(() => { document.querySelector(".perfil-agua").scrollIntoView({ block: "center" }); });
    await pagina.screenshot({ path: `${SAIDA}/p5m-celular-perfil-agua${sufixo}.png` });
  };
  await fotosAgua("");
  const perfil390 = await tabelaPerfil();
  verificar(perfil390.cabe, `celular 390 px: tabela do perfil da água cabe sem rolar (${JSON.stringify(perfil390)})`);
  // Papel de parede próprio em cada água (23/11/2026): mostura e lavagem em tons diferentes entre si e da seção, com desenho.
  const fundosAgua = await pagina.evaluate(() => ["[data-secao=\"agua\"]", ".bloco-agua.mostura", ".bloco-agua.lavagem"].map((s) => {
    const cs = getComputedStyle(document.querySelector(s)); return { cor: cs.backgroundColor, desenho: cs.backgroundImage.startsWith("url(") };
  }));
  verificar(new Set(fundosAgua.map((f) => f.cor)).size === 3 && fundosAgua.every((f) => f.desenho),
    `celular: água da mostura e de lavagem com papel de parede próprio (${fundosAgua.map((f) => f.cor).join(" | ")})`);
  await pagina.evaluate(() => { document.querySelector(".bloco-agua.lavagem").scrollIntoView(); window.scrollBy(0, -70); });
  await pagina.screenshot({ path: `${SAIDA}/p5i-celular-lavagem.png` });
  await pagina.setViewportSize({ width: 320, height: 700 });
  const mais320 = await botoesMais();
  verificar(mais320.every((b) => b.alinhado && b.toque), `celular 320 px: "+" na linha do título (${JSON.stringify(mais320.filter((b) => !b.alinhado))})`);
  const sal320 = await linhaDoSal();
  verificar(sal320.alinhado && sal320.ordem && sal320.cabe && sal320.select >= 100, `celular 320 px: sal numa linha só (${JSON.stringify(sal320)})`);
  await pagina.screenshot({ path: `${SAIDA}/p5h-celular-sais-320.png` });
  await fotosAgua("-320");
  const perfil320 = await tabelaPerfil();
  verificar(perfil320.cabe, `celular 320 px: tabela do perfil da água cabe sem rolar (${JSON.stringify(perfil320)})`);
  const perfis320 = await perfisAgua();
  verificar(perfis320.linha && perfis320.cabe, `celular 320 px: água de base e perfil alvo na mesma linha (${JSON.stringify(perfis320)})`);
  await pagina.evaluate(() => { document.querySelector('[data-secao="agua"]').scrollIntoView(); window.scrollBy(0, -20); });
  await pagina.screenshot({ path: `${SAIDA}/p5k-celular-agua-topo-320.png` });
  await pagina.setViewportSize({ width: 390, height: 844 });
  const estouro = await pagina.evaluate(() => [...document.querySelectorAll("li.ing")].map((li) => {
    const sec = li.closest("section").getBoundingClientRect();
    const filhos = [...li.children].filter((f) => !f.hidden).map((f) => f.getBoundingClientRect().right);
    return Math.round(Math.max(...filhos) - sec.right);
  }));
  verificar(estouro.every((d) => d <= 1), `celular: linhas de ingrediente cabem no cartão (sobra ${estouro.join(", ")} px)`);
  await pagina.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await pagina.waitForTimeout(100);
  const barraCel = await pagina.locator(".vital").boundingBox();
  verificar(Math.abs(barraCel.y + barraCel.height - 844) <= 1, `celular: barra vital presa no rodapé (altura ${Math.round(barraCel.height)}px)`);
  const fimNotas = await pagina.locator('textarea[aria-label="Notas"]').boundingBox();
  verificar(fimNotas.y + fimNotas.height <= barraCel.y, "celular: a barra não cobre o fim da receita");
  verificar(await pagina.isVisible('.vital [data-metrica="ibu"] .vital-val') && !(await pagina.isVisible('.vital [data-metrica="ibu"] .vital-estado')), "celular: barra compacta (números sem textos)");
  await pagina.screenshot({ path: `${SAIDA}/p5b-celular-rolado.png` });
  await pagina.click(".vital-mais");
  verificar(await pagina.getAttribute(".vital-mais", "aria-expanded") === "true" && await pagina.isVisible('.vital [data-metrica="og"] .vital-estado'), "celular: 'detalhes' abre estado e faixas");
  verificar(await pagina.locator(".vital-ferramentas").count() === 0, "celular: 'detalhes' sem botões de desfazer e referência");
  await pagina.screenshot({ path: `${SAIDA}/p5c-celular-detalhes.png` });
  const listaDetalhes = await conferirListaVital(pagina);
  verificar(listaDetalhes === "", `celular: 'detalhes' mostra os números um abaixo do outro, com os limites do estilo${listaDetalhes ? ": " + listaDetalhes : ""}`);
  await pagina.click(".vital-mais");
  await pagina.evaluate(() => window.scrollTo(0, 0));
  await adicionar("fermentaveis");
  await pagina.waitForSelector("dialog.busca");
  const janela = await pagina.locator("dialog.busca").boundingBox();
  verificar(janela.width === 390 && janela.height === 844, "celular: busca em tela cheia");
  await pagina.screenshot({ path: `${SAIDA}/p5d-celular-busca.png` });
  await pagina.keyboard.press("Escape");

  // Receita pública de outro usuário: só leitura + duplicar
  const outro = "22222222-2222-2222-2222-222222222222";
  db.receitas.push({ id: "r-outro", dono: outro, nome: "IPA do Vizinho", tipo: "ALL_GRAIN", publica: true, volume_lote_l: 20, eficiencia_pct: 70, fervura_min: 60, evaporacao_l_h: 3, perda_panela_l: 1, absorcao_grao_l_kg: 1, relacao_agua_grao_l_kg: 3, perda_tina_l: 0, temp_grao_c: 20, og_calc: 1.06, estilo_id: null, equipamento_id: "eq-do-vizinho", atualizado_em: new Date().toISOString() });
  db.receita_fermentaveis.push({ id: "x1", receita_id: "r-outro", fermentavel_id: "malte-particular-do-vizinho", ordem: 0, nome: "Malte do vizinho", tipo: "GRAO", rendimento_pct: 80, umidade_pct: 4, cor_srm: 3, fermentavel_pct: 100, quantidade_kg: 6, etapa: "MOSTURA" });
  await pagina.setViewportSize({ width: 1366, height: 900 });
  await pagina.goto(`${ORIGEM}/#/receitas`);
  await pagina.waitForSelector("td >> text=Pils da Galia");
  await pagina.click(".segmentos >> text=Públicas de outros");
  await pagina.click("td >> text=IPA do Vizinho");
  await pagina.waitForSelector("text=Somente leitura");
  verificar(await pagina.isDisabled('input[aria-label="Qtd (kg)"]'), "receita de outro abre só para leitura");
  verificar(!(await pagina.isVisible("button:has-text('Salvar')")), "sem botão Salvar na receita de outro");
  verificar(await pagina.locator("button:has-text('Excluir')").count() === 0, "sem botão Excluir na receita de outro");
  await pagina.click("button:has-text('Nova a partir desta')");
  await pagina.waitForSelector("text=Receita nova a partir de");
  verificar((await pagina.evaluate(() => location.hash)) === "#/receita/nova/r-outro", "abre a receita nova a partir da de outro");
  verificar(!(await pagina.isDisabled('input[aria-label="Qtd (kg)"]')) && await pagina.inputValue(".titulo-receita") === "IPA do Vizinho", "receita nova vem editável, com os dados da anterior");
  verificar(await pagina.inputValue('input[aria-label="OG medida"]') === "", "dados do lote começam em branco");
  await pagina.click(".acoes-receita button:has-text('Salvar')");
  await pagina.waitForFunction(() => /#\/receita\/[0-9a-f-]{36}$/.test(location.hash));
  const copia = chamadas.filter((c) => c.caminho.startsWith("/rest/v1/rpc/salvar_receita")).pop().corpo.p;
  verificar(copia.id === null && copia.publica === false && copia.og_medida === null && copia.lote_numero === null, "salva como receita nova, privada, sem dados do lote");
  verificar(copia.fermentaveis[0].fermentavel_id === null && copia.equipamento_id === null && copia.fermentaveis[0].quantidade_kg === 6, "não leva ligação com cadastro que não enxergo, mas leva os dados");
  await pagina.waitForSelector('[data-secao="brassagem"] .total-extra:text("nº 2")');
  verificar(await pagina.textContent('[data-secao="brassagem"] .total-extra') === "nº 2", "receita nova recebe o próximo nº (2)");
  verificar(db.receitas.find((x) => x.id === "r-outro").nome === "IPA do Vizinho", "a receita anterior não muda");

  // Excluir só dentro da receita: a lista não tem botão; no editor pede confirmação (Cancelar não apaga).
  const idCopia = (await pagina.evaluate(() => location.hash)).split("/").pop();
  await pagina.goto(`${ORIGEM}/#/receitas`);
  await pagina.waitForSelector("td >> text=IPA do Vizinho");
  verificar(await pagina.locator("main button:has-text('×'), main button[aria-label^='Excluir']").count() === 0, "lista de receitas sem botão de excluir");
  await pagina.click("td >> text=IPA do Vizinho");
  await pagina.waitForSelector(".acoes-receita button:has-text('Excluir receita')");
  await pagina.click(".acoes-receita button:has-text('Excluir receita')");
  await pagina.click("dialog.confirmar button:has-text('Cancelar')");
  verificar(db.receitas.some((x) => x.id === idCopia), "excluir: cancelar mantém a receita");
  await pagina.click(".acoes-receita button:has-text('Excluir receita')");
  verificar((await pagina.textContent("dialog.confirmar p")).includes("IPA do Vizinho"), "excluir pede confirmação com o nome");
  await pagina.click("dialog.confirmar button:has-text('Excluir')");
  await pagina.waitForFunction(() => location.hash === "#/receitas");
  await pagina.waitForSelector("td >> text=Pils da Galia");
  verificar(!db.receitas.some((x) => x.id === idCopia) && !(await pagina.isVisible("td >> text=IPA do Vizinho")), "excluir apaga a receita e volta à lista");

  // Nova receita em branco oferece "começar a partir de" com as minhas receitas.
  await pagina.goto(`${ORIGEM}/#/receita/nova`);
  await pagina.waitForSelector('select[aria-label="Começar a partir de"] >> text=Pils da Galia', { state: "attached" });
  await pagina.selectOption('select[aria-label="Começar a partir de"]', { label: "1 · Pils da Galia · 20/04/2026" });
  await pagina.waitForSelector("text=Receita nova a partir de nº 1");
  verificar(await pagina.inputValue('input[aria-label="Qtd (kg)"]') === "4,800", "começar a partir de: copia os ingredientes da anterior");

  // Sair (a receita nova ainda não salva pede confirmação)
  let aviso = "";
  pagina.once("dialog", (d) => { aviso = d.message(); d.accept(); });
  await pagina.click("button:has-text('Sair')");
  await pagina.waitForSelector("form.login");
  verificar(aviso.includes("não salvas"), "sair com receita nova não salva pede confirmação");
  verificar(true, "sair volta para o login");

  // ================= Celular de verdade: tela de toque (isMobile + hasTouch), 390 px e 320 px =================
  const ctxCel = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctxCel.route(`${SB}/**`, supabaseSimulado);
  await ctxCel.route(`${ORIGEM}/**`, site);
  const cel = await ctxCel.newPage();
  cel.on("console", (m) => { if (["error", "warning"].includes(m.type())) erros.push(`${m.type()}: ${m.text()}`); });
  cel.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  const cdp = await ctxCel.newCDPSession(cel);
  const toque = async (tipo, x, y) => cdp.send("Input.dispatchTouchEvent", { type: tipo, touchPoints: tipo === "touchEnd" ? [] : [{ x, y }] });
  const centro = async (sel) => {
    await cel.locator(sel).first().evaluate((n) => n.scrollIntoView({ block: "center" }));
    const b = await cel.locator(sel).first().boundingBox();
    return [b.x + b.width / 2, b.y + b.height / 2];
  };
  const tocar = async (sel) => { const [x, y] = await centro(sel); await cel.touchscreen.tap(x, y); };
  const larguraSobra = () => cel.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  // Rolagem só na vertical: nem arrastando o dedo para o lado, nem por script, a página sai do lugar; e nada visível
  // passa da borda direita (o que passasse seria cortado, então é conferido à parte).
  const semRolagemLateral = async () => {
    const { width, height } = cel.viewportSize();
    await cel.evaluate(() => window.scrollTo(300, window.scrollY));
    const y = Math.round(height * 0.4);
    await toque("touchStart", width - 30, y);
    for (let x = width - 60; x >= 30; x -= 30) await toque("touchMove", x, y);
    await toque("touchEnd", 30, y);
    await cel.waitForTimeout(150);
    return cel.evaluate(() => {
      const passam = [...document.querySelectorAll("body *")].filter((n) => {
        if (n.closest(".lateral, .so-leitor, svg") || !n.checkVisibility()) return false;
        const r = n.getBoundingClientRect();
        return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
      }).map((n) => `${n.tagName.toLowerCase()}.${n.className}`);
      return { x: Math.round(window.scrollX + document.documentElement.scrollLeft + document.body.scrollLeft), passam: [...new Set(passam)].slice(0, 6) };
    });
  };
  const conferirLateral = async (onde) => {
    const r = await semRolagemLateral();
    verificar(r.x === 0 && r.passam.length === 0, `${onde}: rolagem só na vertical (deslocou ${r.x} px; passam da tela: ${r.passam.join(", ") || "nada"})`);
  };

  await cel.goto(`${ORIGEM}/`);
  await cel.fill('input[type="email"]', USUARIO.email);
  await cel.fill('input[type="password"]', SENHA);
  await cel.click('button[type="submit"]');
  await cel.waitForSelector(".receita-cartao >> text=Pils da Galia");
  verificar(await cel.locator(".receita-cartao").count() === db.receitas.filter((x) => x.dono === USUARIO.id).length && await larguraSobra() <= 1,
    "toque: lista de receitas em cartões, sem rolagem para o lado");
  verificar(await cel.locator(".receita-cartao button").count() === 0, "toque: cartão da lista sem botão de excluir");
  await conferirLateral("toque, lista");
  verificar((await cel.textContent(".receita-cartao:has-text('Pils da Galia') .rc-sub")).includes("20/04/2026") && (await cel.textContent(".receita-cartao:has-text('Pils da Galia') .rc-numeros")).startsWith("OG "),
    "toque: cartão mostra estilo, data e números");
  await cel.screenshot({ path: `${SAIDA}/p6f-celular-lista.png` });
  // Topo da tela de Receitas (25/11/2026): logo "Gália" grande e centrada sobre o fundo do tema, sem a barra escura;
  // o ≡ no canto abre o menu. Nenhum elemento preso no topo (o iOS 26 pinta a faixa do relógio com o fundo da página).
  const logoVisivel = () => cel.evaluate(() => {
    const img = [...document.querySelectorAll(".inicio-logo img")].find((n) => n.checkVisibility());
    if (!img) return null;
    const r = img.getBoundingClientRect();
    return { src: img.getAttribute("src"), carregada: img.complete && img.naturalWidth > 0, centro: Math.round(Math.abs(r.left + r.width / 2 - window.innerWidth / 2)),
      dentro: r.left >= 0 && r.right <= window.innerWidth, topo: Math.round(r.top), altura: Math.round(r.height),
      barra: document.querySelector(".barra-movel").checkVisibility(),
      // o que o iOS 26 usaria: preso/fixo, visível (opacidade ≥ 0,1), cobrindo o meio da tela a 4 px do topo
      presos: [...document.querySelectorAll("body *")].filter((n) => {
        const c = getComputedStyle(n), r = n.getBoundingClientRect(), x = window.innerWidth / 2;
        return ["sticky", "fixed"].includes(c.position) && c.visibility === "visible" && Number(c.opacity) >= 0.1 && r.top <= 4 && r.bottom > 4 && r.left <= x && r.right >= x;
      }).map((n) => n.className) };
  });
  await cel.waitForFunction(() => [...document.querySelectorAll(".inicio-logo img")].some((n) => n.checkVisibility() && n.complete && n.naturalWidth > 0), null, { timeout: 3000 }).catch(() => {});
  let lg = await logoVisivel();
  verificar(lg && lg.src === "icones/logo-galia.png" && lg.carregada && lg.centro <= 2 && lg.dentro && lg.topo < 30 && lg.altura >= 72 && lg.altura <= 88 && !lg.barra && lg.presos.length === 0,
    `toque: logo "Gália" (5rem) centrada no topo da tela de Receitas, sem a barra escura nem nada preso no topo (${JSON.stringify(lg)})`);
  verificar(await cel.getAttribute('meta[name="apple-mobile-web-app-status-bar-style"]', "content") === "default"
    && await cel.evaluate(() => document.querySelector('meta[name="theme-color"]').content.toLowerCase() === getComputedStyle(document.documentElement).getPropertyValue("--fundo").trim().toLowerCase()),
    "iPhone: barra de status padrão e theme-color = fundo da página do tema");
  // ≡ maior (26/11/2026, pedido do responsável): 56 px de toque, ícone de 34 px, no meio da altura da logo, sem sair da tela.
  const bm = await cel.evaluate(() => {
    const b = document.querySelector(".inicio-menu").getBoundingClientRect(), i = document.querySelector(".inicio-menu .ico").getBoundingClientRect();
    const l = [...document.querySelectorAll(".inicio-logo img")].find((n) => n.checkVisibility()).getBoundingClientRect();
    return { lado: Math.round(b.width), ico: Math.round(i.width), meio: Math.round(Math.abs((b.top + b.bottom) / 2 - (l.top + l.bottom) / 2)), esq: Math.round(i.left), separado: b.right <= l.left };
  });
  verificar(bm.lado >= 54 && bm.ico >= 32 && bm.meio <= 2 && bm.esq >= 0 && bm.separado, `toque: ≡ do topo maior, no meio da logo e sem encostar nela (${JSON.stringify(bm)})`);
  await cel.tap(".inicio-menu");
  await cel.waitForTimeout(350);
  verificar(await cel.evaluate(() => document.querySelector(".casca").classList.contains("menu-aberto") && document.querySelector(".inicio-menu").getAttribute("aria-expanded") === "true"),
    "toque: o ≡ do topo da tela de Receitas abre o menu");
  // Menu com a logo nova (26/11/2026): "Gália" em creme no lugar do copinho + "GaliaBrew".
  const ml = await cel.evaluate(() => {
    const img = document.querySelector(".lateral .marca .marca-logo"), r = img?.getBoundingClientRect(), f = document.querySelector(".lateral .fechar-menu").getBoundingClientRect();
    return img && { src: img.getAttribute("src"), carregada: img.complete && img.naturalWidth > 0, visivel: img.checkVisibility(), altura: Math.round(r.height),
      copo: document.querySelector(".lateral .marca .copo").checkVisibility(), separado: r.right <= f.left };
  });
  verificar(ml && ml.src === "icones/logo-galia-escuro.png" && ml.visivel && ml.altura >= 60 && !ml.copo && ml.separado,
    `toque: menu com a logo "Gália" em creme, sem o copinho (${JSON.stringify(ml)})`);
  await cel.screenshot({ path: `${SAIDA}/p6f-celular-menu-logo.png` });
  await cel.keyboard.press("Escape");
  await cel.waitForTimeout(350);
  await cel.emulateMedia({ colorScheme: "dark" });
  await cel.waitForFunction(() => document.documentElement.dataset.modo === "escuro", null, { timeout: 2000 }).catch(() => {});
  await cel.waitForFunction(() => [...document.querySelectorAll(".inicio-logo img")].some((n) => n.checkVisibility() && n.complete && n.naturalWidth > 0 && n.src.includes("escuro")), null, { timeout: 3000 }).catch(() => {});
  lg = await logoVisivel();
  verificar(lg && lg.src === "icones/logo-galia-escuro.png" && lg.carregada, "toque: tema escuro mostra a logo com as letras em creme");
  await cel.screenshot({ path: `${SAIDA}/p6f-celular-lista-escuro.png` });
  await cel.emulateMedia({ colorScheme: "light" });
  await cel.waitForFunction(() => document.documentElement.dataset.modo === "claro", null, { timeout: 2000 }).catch(() => {});
  await tocar(".receita-cartao >> text=Pils da Galia");
  await cel.waitForSelector(".barra-app");
  verificar(!(await cel.isVisible("header.barra-movel")) && await cel.textContent(".app-titulo") === "Pils da Galia" && await cel.isVisible(".barra-app .app-salvar"),
    "toque: no editor o menu geral some e a barra do app mostra voltar, nome, desfazer e Salvar");
  verificar(await cel.isVisible(".acoes-receita button:has-text('Excluir receita')"), "toque: Excluir receita fica dentro da receita");
  await cel.screenshot({ path: `${SAIDA}/p6x-celular-excluir.png` });
  const qtdCel = cel.locator('input[aria-label="Qtd (kg)"]').first();
  const maisF = '[data-secao="fermentaveis"] li.ing button.passo[aria-label="Mais 250 g"]';
  await tocar(maisF);
  verificar(await qtdCel.inputValue() === "5,050", "toque: um toque no + soma exatamente 250 g (sem contar duas vezes)");
  verificar(await cel.getAttribute(".barra-app .app-salvar", "class") === "app-salvar pendente", "toque: Salvar mostra o ponto de alteração pendente");
  await cel.waitForTimeout(900);
  const [mx, my] = await centro(maisF);
  await toque("touchStart", mx, my);
  await cel.waitForTimeout(1300);
  await toque("touchEnd");
  const depoisSegurar = Number((await qtdCel.inputValue()).replace(",", "."));
  verificar(depoisSegurar >= 5.05 + 0.25 * 8, `toque: segurar o + repete (${br(depoisSegurar, 3)} kg em 1,3 s)`);
  await tocar(".barra-app .app-desfazer");
  verificar(await qtdCel.inputValue() === "5,050", "toque: ↶ da barra do app desfaz o segurar inteiro");
  await tocar(".barra-app .app-desfazer");
  verificar(await qtdCel.inputValue() === "4,800", "toque: ↶ de novo desfaz o toque");

  // Teclado aberto (simulado: a visual viewport encolhe para 500 px) → a barra de números sobe junto.
  const teclado = (altura) => cel.evaluate((h) => {
    if (h === null) delete window.visualViewport.height;
    else Object.defineProperty(window.visualViewport, "height", { configurable: true, get: () => h });
    window.visualViewport.dispatchEvent(new Event("resize"));
  }, altura);
  await teclado(500);
  const atenuacao = cel.locator('input[aria-label="Autor"]').first();      // campo de digitar fora de janela
  await atenuacao.focus();
  await cel.waitForTimeout(1000);
  const vitalTeclado = await cel.locator(".vital").boundingBox();
  const campoTeclado = await atenuacao.boundingBox();
  verificar(Math.abs(vitalTeclado.y + vitalTeclado.height - 500) <= 1, `toque: com o teclado aberto a barra de números fica logo acima dele (fundo em ${Math.round(vitalTeclado.y + vitalTeclado.height)} px)`);
  verificar(campoTeclado.y + campoTeclado.height <= vitalTeclado.y, "toque: o campo em foco rola para cima da barra");
  verificar(vitalTeclado.height <= 52 && !(await cel.isVisible(".vital .vital-mais")) && !(await cel.isVisible(".vital .regua")),
    `toque: com o teclado a barra vira uma linha fina com os 6 números (${Math.round(vitalTeclado.height)} px de altura)`);
  await cel.screenshot({ path: `${SAIDA}/p6a-celular-teclado.png` });
  await teclado(null);
  await cel.evaluate(() => document.activeElement.blur());
  await cel.waitForTimeout(300);          // a barra espera ~120 ms depois de sair do campo (trocar de campo não pisca)
  const vitalSem = await cel.locator(".vital").boundingBox();
  verificar(Math.abs(vitalSem.y + vitalSem.height - 844) <= 1 && vitalSem.height > 100, "toque: teclado fechado, a barra volta ao rodapé (completa)");

  // iPhone de verdade (print de 23/11/2026): o iOS encolhe a área visível E a rola para cima do teclado
  // (offsetTop = innerHeight − altura). Antes a conta descontava o offsetTop, dava "sem teclado" e a barra ficava
  // grande, cobrindo o campo de quantidade de um malte novo.
  const tecladoIOS = (altura) => cel.evaluate((h) => {
    const vv = window.visualViewport;
    if (h === null) { delete vv.height; delete vv.offsetTop; }
    else {
      Object.defineProperty(vv, "height", { configurable: true, get: () => h });
      Object.defineProperty(vv, "offsetTop", { configurable: true, get: () => window.innerHeight - h });
    }
    vv.dispatchEvent(new Event("resize"));
  }, altura);
  const qtd2 = cel.locator('[data-secao="fermentaveis"] input[aria-label="Qtd (kg)"]').last();
  await qtd2.evaluate((n) => n.scrollIntoView({ block: "center" }));
  const [qx, qy] = await centro('[data-secao="fermentaveis"] li.ing:last-child input[aria-label="Qtd (kg)"]');

  // ROLETA (23/11/2026, pedido do responsável): tocar num número abre rodas para girar com o dedo, não o teclado.
  const qtdAntes = await qtd2.inputValue();
  const ogDaBarra = () => cel.textContent('.vital [data-metrica="og"] .vital-val');
  const ogAntes = await ogDaBarra();
  await cel.touchscreen.tap(qx, qy);
  await cel.waitForSelector(".roleta");
  await cel.waitForTimeout(250);
  const r1 = await cel.evaluate(() => {
    const ro = document.querySelector(".roleta").getBoundingClientRect();
    const v = document.querySelector(".vital").getBoundingClientRect();
    const c = document.querySelector("input.em-roleta").getBoundingClientRect();
    return { foco: document.activeElement?.tagName, teclado: document.activeElement?.matches?.("input"), rodas: document.querySelectorAll(".roleta-roda").length,
      valor: document.querySelector(".roleta-valor").textContent, linhaFina: document.querySelector(".vital").classList.contains("com-teclado"),
      vitalFundo: v.bottom, vitalAltura: v.height, roletaTopo: ro.top, roletaAltura: ro.height, campoFundo: c.bottom, larg: ro.width,
      meio: [...document.querySelectorAll(".roleta-item.no-meio")].map((n) => n.textContent) };
  });
  verificar(!r1.teclado && r1.rodas === 2 && r1.valor === `${qtdAntes} kg` && r1.meio.join(",") === qtdAntes.replace(/0$/, ""),
    `roleta: tocar na quantidade abre a roleta (sem teclado), com o valor atual no meio das rodas (${r1.meio.join(" ")} kg)`);
  verificar(r1.linhaFina && Math.abs(r1.vitalFundo - r1.roletaTopo) <= 1 && r1.vitalAltura <= 52 && r1.campoFundo <= r1.vitalFundo - r1.vitalAltura,
    `roleta: a barra de números vira a linha fina logo acima da roleta e o campo fica à vista (roleta com ${Math.round(r1.roletaAltura)} px)`);
  await cel.screenshot({ path: `${SAIDA}/p6r-roleta.png` });
  // Girar a roda das frações com o dedo (rolagem nativa da roda) até ,50.
  // Girar a roda com o dedo (toque de verdade via CDP): arrasta devagar e segura antes de soltar (sem inércia);
  // se a roda assentar fora do alvo, arrasta de novo o que falta (como a pessoa faria).
  const girar = async (k, texto) => {
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      const { rx, ry, alvoI, atualI } = await cel.evaluate(({ k, texto }) => {
        const roda = document.querySelectorAll(".roleta-roda")[k];
        const b = roda.getBoundingClientRect();
        return { rx: b.left + b.width / 2, ry: b.top + b.height / 2, atualI: Math.round(roda.scrollTop / 44),
          alvoI: Number([...roda.querySelectorAll(".roleta-item")].find((n) => n.textContent === texto).dataset.i) };
      }, { k, texto });
      if (alvoI === atualI) break;
      let falta = (alvoI - atualI) * 44;
      let y = falta > 0 ? ry + 80 : ry - 80;          // começa longe do meio para caber o arrasto
      await toque("touchStart", rx, y);
      while (Math.abs(falta) > 0) {
        const d = Math.sign(falta) * Math.min(Math.abs(falta), 22);
        y -= d; falta -= d;
        await toque("touchMove", rx, y);
        await cel.waitForTimeout(12);
      }
      await cel.waitForTimeout(200);
      await toque("touchEnd");
      await cel.waitForTimeout(450);
    }
  };
  await girar(1, "50");
  const depoisGiro = await qtd2.inputValue();
  verificar(depoisGiro === `${qtdAntes.split(",")[0]},500` && await cel.textContent(".roleta-valor") === `${depoisGiro} kg`,
    `roleta: girar a roda dos decimais muda a quantidade na hora (${qtdAntes} → ${depoisGiro} kg)`);
  verificar(await ogDaBarra() !== ogAntes, `roleta: a OG da barra acompanha a roleta (${ogAntes} → ${await ogDaBarra()})`);
  await tocar(".roleta-cancelar");
  verificar(await cel.locator(".roleta").count() === 0 && await qtd2.inputValue() === qtdAntes && await ogDaBarra() === ogAntes,
    "roleta: Cancelar fecha e volta ao valor de antes");
  await cel.touchscreen.tap(qx, qy);
  await cel.waitForSelector(".roleta");
  await cel.waitForTimeout(150);
  await girar(0, String(Number(qtdAntes.split(",")[0]) + 2));
  await girar(1, "25");
  await tocar(".roleta-ok");
  const esperadoRoleta = `${Number(qtdAntes.split(",")[0]) + 2},250`;
  verificar(await cel.locator(".roleta").count() === 0 && await qtd2.inputValue() === esperadoRoleta, `roleta: girar as duas rodas e OK grava ${esperadoRoleta} kg`);
  await tocar(".barra-app .app-desfazer");
  verificar(await qtd2.inputValue() === qtdAntes, "roleta: ↶ desfaz a roleta inteira num passo só");
  // Parâmetros no celular (24/11/2026): tocar no número da seção abre a roleta direto (sem janela); "Todos" abre a janela.
  const efic = '[data-secao="parametros"] input[aria-label="Eficiência (%)"]';
  const eficAntes = await cel.inputValue(efic);
  const ogParam = await ogDaBarra();
  await cel.evaluate(() => { document.querySelector('[data-secao="parametros"]').scrollIntoView(); window.scrollBy(0, -70); });
  await cel.waitForTimeout(100);
  await cel.screenshot({ path: `${SAIDA}/p6p-celular-parametros.png` });
  await tocar(efic);
  await cel.waitForSelector(".roleta");
  await cel.waitForTimeout(250);
  verificar(await cel.locator("dialog.parametros-janela").count() === 0 && await cel.locator(".vital.com-teclado").count() === 1,
    "parâmetros: tocar na eficiência abre a roleta direto, com a barra de números fina acima");
  await girar(0, String(Number(eficAntes) + 5));
  await tocar(".roleta-ok");
  verificar(await cel.inputValue(efic) === String(Number(eficAntes) + 5) && await ogDaBarra() !== ogParam,
    `parâmetros: a roleta muda a eficiência na receita (${eficAntes} → ${await cel.inputValue(efic)}) e a OG acompanha`);
  await tocar(".barra-app .app-desfazer");
  verificar(await cel.inputValue(efic) === eficAntes && await ogDaBarra() === ogParam, "parâmetros: ↶ desfaz a eficiência");
  const secParam = await cel.$$eval('[data-secao="parametros"] .param-resumo input', (ns) => ns.map((n) => {
    const b = n.getBoundingClientRect(); return { top: Math.round(b.top), h: Math.round(b.height), right: b.right }; }));
  verificar(new Set(secParam.map((x) => x.top)).size === 1 && secParam.every((x) => x.h >= 44 && x.right <= 390),
    `parâmetros: os 3 números numa linha, com 44 px de toque (${JSON.stringify(secParam)})`);
  const janelaParamCel = async (w) => cel.evaluate((w) => {
    const d = document.querySelector("dialog.parametros-janela");
    const b = d.getBoundingClientRect();
    const ins = [...d.querySelectorAll(".param-grade input")].map((n) => n.getBoundingClientRect());
    return { cabe: b.left >= 0 && b.right <= w && d.scrollWidth <= d.clientWidth, colunas: new Set(ins.map((x) => Math.round(x.left))).size,
      linhas: new Set(ins.map((x) => Math.round(x.top))).size, campoMin: Math.round(Math.min(...ins.map((x) => x.width))), altura: Math.round(b.height) };
  }, w);
  await tocar('[data-secao="parametros"] button.param-todos');
  await cel.waitForSelector("dialog.parametros-janela[open]");
  const pj390 = await janelaParamCel(390);
  verificar(pj390.cabe && pj390.colunas === 3 && pj390.linhas === 3 && pj390.campoMin >= 50,
    `parâmetros 390 px: janela com 9 campos em 3 × 3, cabe na tela (${JSON.stringify(pj390)})`);
  await cel.screenshot({ path: `${SAIDA}/p6p2-celular-parametros-janela.png` });
  await tocar('dialog.parametros-janela input[aria-label="Perda na panela (L)"]');
  await cel.waitForSelector("dialog.parametros-janela .roleta");
  await cel.waitForTimeout(250);
  verificar(await cel.evaluate(() => document.querySelector("dialog.parametros-janela .roleta").matches(":popover-open")),
    "parâmetros: a roleta abre dentro da janela (camada do topo)");
  await cel.screenshot({ path: `${SAIDA}/p6p3-celular-parametros-roleta.png` });
  await tocar(".roleta-cancelar");
  await cel.setViewportSize({ width: 320, height: 568 });
  await cel.waitForTimeout(150);
  const pj320 = await janelaParamCel(320);
  verificar(pj320.cabe && pj320.colunas === 3 && pj320.linhas === 3 && pj320.campoMin >= 40,
    `parâmetros 320 px: janela com 9 campos em 3 × 3, cabe na tela (${JSON.stringify(pj320)})`);
  await cel.screenshot({ path: `${SAIDA}/p6p4-celular-320-parametros-janela.png` });
  await tocar("dialog.parametros-janela .item-fechar");
  await cel.waitForSelector("dialog.parametros-janela", { state: "detached", timeout: 2000 }).catch(() => {});
  verificar(await cel.locator("dialog.parametros-janela").count() === 0, "parâmetros: × fecha a janela");
  await conferirLateral("320 px, parâmetros");
  await cel.evaluate(() => { document.querySelector('[data-secao="parametros"]').scrollIntoView(); window.scrollBy(0, -70); });
  await cel.screenshot({ path: `${SAIDA}/p6p5-celular-320-parametros.png` });
  await cel.setViewportSize({ width: 390, height: 844 });
  await cel.waitForTimeout(150);
  // Brassagem no celular (24/11/2026, como os Parâmetros): OG/FG/volume real tocáveis (roleta direto, no planejado);
  // "Todos" abre a janela com nº | data · OG | FG | volume · CO₂ | açúcar.
  const ogMed = '[data-secao="brassagem"] input[aria-label="OG medida"]';
  const ogMedAntes = await cel.inputValue(ogMed);
  await cel.evaluate(() => { document.querySelector('[data-secao="brassagem"]').scrollIntoView(); window.scrollBy(0, -70); });
  await cel.waitForTimeout(100);
  await tocar(ogMed);
  await cel.waitForSelector(".roleta");
  await cel.waitForTimeout(250);
  verificar(await cel.locator("dialog.lote-janela").count() === 0 && await cel.locator(".vital.com-teclado").count() === 1,
    "brassagem: tocar na OG medida abre a roleta direto, com a barra de números fina acima");
  await tocar(".roleta-ok");
  const ogPlan = await cel.inputValue(ogMed);
  verificar(/^1,0\d\d$/.test(ogPlan) && /Eficiência real \d+%/.test(await cel.textContent('[data-secao="brassagem"] .lote-medido')),
    `brassagem: a roleta grava a OG medida (${ogMedAntes || "vazia"} → ${ogPlan}) e a eficiência real aparece`);
  await cel.screenshot({ path: `${SAIDA}/p6p6-celular-brassagem.png` });
  const secLote = await cel.$$eval('[data-secao="brassagem"] .param-resumo input', (ns) => ns.map((n) => {
    const b = n.getBoundingClientRect(); return { top: Math.round(b.top), h: Math.round(b.height), right: b.right }; }));
  verificar(new Set(secLote.map((x) => x.top)).size === 1 && secLote.every((x) => x.h >= 44 && x.right <= 390),
    `brassagem: os 3 números numa linha, com 44 px de toque (${JSON.stringify(secLote)})`);
  const janelaLoteCel = async (w) => cel.evaluate((w) => {
    const d = document.querySelector("dialog.lote-janela");
    const b = d.getBoundingClientRect();
    const ps = [...d.querySelectorAll(".param-grade .param")].map((n) => n.querySelector("input, select").getBoundingClientRect());
    const vs = [...d.querySelectorAll(".param-grade .param-valor")].map((n) => n.getBoundingClientRect());
    return { cabe: b.left >= 0 && b.right <= w && d.scrollWidth <= d.clientWidth, colunas: new Set(ps.map((x) => Math.round(x.left))).size,
      linhas: new Set(vs.map((x) => Math.round(x.top))).size, campoMin: Math.round(Math.min(...ps.map((x) => x.width))),
      dentro: ps.every((x) => x.right <= b.right - 4), altura: Math.round(b.height) };
  }, w);
  await tocar('[data-secao="brassagem"] button.param-todos');
  await cel.waitForSelector("dialog.lote-janela[open]");
  await cel.screenshot({ path: `${SAIDA}/p6p7-celular-brassagem-janela.png` });
  const lj390 = await janelaLoteCel(390);
  verificar(lj390.cabe && lj390.dentro && lj390.colunas === 3 && lj390.linhas === 3 && lj390.campoMin >= 50,
    `brassagem 390 px: janela com os campos em 3 linhas × 3 colunas, cabe na tela (${JSON.stringify(lj390)})`);
  await tocar('dialog.lote-janela input[aria-label="CO₂ desejado (vol)"]');
  await cel.waitForSelector("dialog.lote-janela .roleta");
  await cel.waitForTimeout(250);
  verificar(await cel.evaluate(() => document.querySelector("dialog.lote-janela .roleta").matches(":popover-open")),
    "brassagem: a roleta do CO₂ abre dentro da janela (camada do topo)");
  await tocar(".roleta-cancelar");
  await cel.setViewportSize({ width: 320, height: 568 });
  await cel.waitForTimeout(150);
  const lj320 = await janelaLoteCel(320);
  verificar(lj320.cabe && lj320.dentro && lj320.colunas === 3 && lj320.linhas === 3 && lj320.campoMin >= 40,
    `brassagem 320 px: janela em 3 × 3, cabe na tela (${JSON.stringify(lj320)})`);
  await cel.screenshot({ path: `${SAIDA}/p6p8-celular-320-brassagem-janela.png` });
  await tocar("dialog.lote-janela .item-fechar");
  await cel.waitForSelector("dialog.lote-janela", { state: "detached", timeout: 2000 }).catch(() => {});
  verificar(await cel.locator("dialog.lote-janela").count() === 0, "brassagem: × fecha a janela");
  await conferirLateral("320 px, brassagem");
  await cel.evaluate(() => { document.querySelector('[data-secao="brassagem"]').scrollIntoView(); window.scrollBy(0, -70); });
  await cel.screenshot({ path: `${SAIDA}/p6p9-celular-320-brassagem.png` });
  await cel.setViewportSize({ width: 390, height: 844 });
  await cel.waitForTimeout(150);
  await tocar(".barra-app .app-desfazer");
  verificar(await cel.inputValue(ogMed) === ogMedAntes, "brassagem: ↶ desfaz a OG medida");
  // Inteiro e decimais bem separados (24/11/2026): vírgula entre as rodas, cada roda com a sua faixa.
  await tocar('[data-secao="fermentaveis"] li.ing:last-child input[aria-label="Qtd (kg)"]');
  await cel.waitForSelector(".roleta");
  await cel.waitForTimeout(250);
  const sep = await cel.evaluate(() => {
    const [a, b] = [...document.querySelectorAll(".roleta-roda")].map((n) => n.getBoundingClientRect());
    const meio = [...document.querySelectorAll(".roleta-item.no-meio")].map((n) => n.getBoundingClientRect());
    return { vao: Math.round(b.left - a.right), textos: Math.round(meio[1].left - meio[0].right), faixas: document.querySelectorAll(".roleta-faixa").length,
      virgula: document.querySelector(".roleta-virgula")?.textContent };
  });
  verificar(sep.vao >= 30 && sep.faixas === 2 && sep.virgula === ",", `roleta: inteiro e decimais separados (${sep.vao} px entre as rodas, ${sep.textos} px entre os números, vírgula no meio)`);
  // Mínimo de 100 g de malte (24/11/2026): 0 | ,05 vira 0,100 e a roda dos decimais volta para 10.
  await girar(0, "0");
  await girar(1, "05");
  // A roda volta para 10 com rolagem suave: espera ela parar (até 3 s) em vez de um tempo fixo (falhava às vezes com 500 ms).
  await cel.waitForFunction(() => document.querySelectorAll(".roleta-roda")[1]?.querySelector(".no-meio")?.textContent === "10", null, { timeout: 3000 }).catch(() => {});
  const rodaMin = await cel.evaluate(() => document.querySelectorAll(".roleta-roda")[1].querySelector(".no-meio")?.textContent);
  verificar(await qtd2.inputValue() === "0,100" && rodaMin === "10",
    `roleta: malte no mínimo 100 g (pedido 0,05 → ${await qtd2.inputValue()} kg, roda em ${rodaMin})`);
  await cel.screenshot({ path: `${SAIDA}/p6t-roleta-minimo.png` });
  await tocar(".roleta-cancelar");
  // Fora do editor do celular a roleta também cabe (320 px é conferido mais abaixo). Agora: trocar para o teclado.
  await centro('[data-secao="fermentaveis"] li.ing:last-child input[aria-label="Qtd (kg)"]');
  const [qx2, qy2] = await centro('[data-secao="fermentaveis"] li.ing:last-child input[aria-label="Qtd (kg)"]');
  await cel.touchscreen.tap(qx2, qy2);
  await cel.waitForSelector(".roleta");
  await cel.waitForTimeout(250);           // a roleta sobe em 0,18 s
  await tocar(".roleta-digitar");
  verificar(await cel.locator(".roleta").count() === 0 && await qtd2.evaluate((n) => n === document.activeElement && !n.readOnly),
    "roleta: “Digitar o número” fecha a roleta e põe o teclado no campo");
  // Pior caso: o campo termina bem embaixo da área visível (onde a barra fica), como no print.
  await qtd2.evaluate((n) => window.scrollBy(0, n.getBoundingClientRect().bottom - (window.innerHeight - 20)));
  await tecladoIOS(480);
  await cel.waitForTimeout(500);
  const sel = await qtd2.evaluate((n) => [n.selectionStart, n.selectionEnd, n.value.length]);
  verificar(sel[0] === 0 && sel[1] === sel[2] && sel[2] > 0, "toque: tocar na quantidade seleciona o número (digitar já troca o valor)");
  const ios = await cel.evaluate(() => {
    const v = document.querySelector(".vital").getBoundingClientRect();
    const c = document.activeElement.getBoundingClientRect();
    const topo = window.visualViewport.offsetTop;
    return { classe: document.querySelector(".vital").classList.contains("com-teclado"), alturaBarra: v.height, fundoBarra: v.bottom,
      fundoVisivel: topo + window.visualViewport.height, campoTopo: c.top - topo, campoFundo: c.bottom, barraTopo: v.top };
  });
  verificar(ios.classe && ios.alturaBarra <= 52, `iPhone: com a área visível rolada pelo iOS a barra também fica fina (${Math.round(ios.alturaBarra)} px)`);
  verificar(Math.abs(ios.fundoBarra - ios.fundoVisivel) <= 1, "iPhone: a barra fica colada no teclado");
  verificar(ios.campoFundo <= ios.barraTopo && ios.campoTopo >= 0, `iPhone: o campo da quantidade fica à vista, acima da barra (${Math.round(ios.barraTopo - ios.campoFundo)} px de folga)`);
  await cel.keyboard.type("0,5");
  verificar(await qtd2.inputValue() === "0,5", "toque: digitar 0,5 troca a quantidade inteira (sem apagar à mão)");
  await cel.screenshot({ path: `${SAIDA}/p6g-iphone-teclado.png` });
  await tecladoIOS(null);
  await cel.evaluate(() => document.activeElement.blur());
  await cel.waitForTimeout(300);
  verificar(await qtd2.evaluate((n) => n.readOnly), "roleta: ao sair do campo, o próximo toque volta a abrir a roleta");

  // Janela do item (24/11/2026): tocar no nome abre; quantidade no topo; roleta dentro da janela.
  const nomeMalte = '[data-secao="fermentaveis"] li.ing:first-of-type button.ing-nome';
  const janItem = "dialog.item-janela";
  await cel.evaluate((s) => document.querySelector(s).scrollIntoView({ block: "center" }), nomeMalte);
  const tamNome = await cel.locator(nomeMalte).boundingBox();
  await tocar(nomeMalte);
  await cel.waitForTimeout(150);
  const geo = await cel.evaluate((j) => {
    const d = document.querySelector(j);
    const q = d?.querySelector('input[aria-label="Qtd (kg)"]')?.getBoundingClientRect();
    const b = d?.getBoundingClientRect();
    const passa = [...d.querySelectorAll("*")].filter((n) => n.getBoundingClientRect().right > innerWidth + 0.5).map((n) => (n.className || n.tagName) + ":" + Math.round(n.getBoundingClientRect().right)).slice(0, 8);
    return { passa, aberta: Boolean(d?.open), larg: b?.width, topo: b?.top, fundo: innerHeight - b?.bottom, alt: b?.height, qTopo: q?.top, qFundo: q?.bottom, qAlt: q?.height, vw: innerWidth, rolagem: d ? d.scrollWidth - d.clientWidth : 0 };
  }, janItem);
  verificar(tamNome.height >= 44 && geo.aberta && geo.larg >= geo.vw - 20 && Math.abs(geo.topo - geo.fundo) <= 2 && geo.topo >= 16 && geo.rolagem <= 0 && !geo.passa.length,
    `toque: tocar no nome do malte abre a janela do item no meio da tela, mesma folga em cima e embaixo (${Math.round(geo.topo)} / ${Math.round(geo.fundo)} px, altura ${Math.round(geo.alt)} px; alvo de ${Math.round(tamNome.height)} px)`);
  verificar(await cel.locator("dialog.item-janela .item-receita").count() === 0 && (await cel.textContent("dialog.item-janela .item-rotulo-linha")).toLowerCase().includes("grist"),
    "toque: janela sem o texto 'Na receita'; grist e OG do malte na linha do rótulo da quantidade");
  verificar(geo.qAlt >= 40 && geo.qTopo - geo.topo < 130, `toque: a quantidade fica no alto da janela (${Math.round(geo.qTopo - geo.topo)} px abaixo do topo dela, ${Math.round(geo.qAlt)} px de altura)`);
  await cel.screenshot({ path: `${SAIDA}/p6i-celular-detalhes-toque.png` });
  const qJan = `${janItem} input[aria-label="Qtd (kg)"]`;
  const qLinha = '[data-secao="fermentaveis"] li.ing:first-of-type input[aria-label="Qtd (kg)"]';
  const qAntesJan = await cel.inputValue(qJan);
  await tocar(qJan);
  await cel.waitForSelector(`${janItem} > .roleta`);
  await cel.waitForTimeout(350);                                // fim da animação de subida
  const rj = await cel.evaluate((j) => {
    const f = document.querySelector(`${j} > .roleta`).getBoundingClientRect();
    const q = document.querySelector(`${j} input[aria-label="Qtd (kg)"]`).getBoundingClientRect();
    const y = document.querySelector(`${j} .roleta-ok`).getBoundingClientRect();
    const alvo = document.elementFromPoint(y.left + y.width / 2, y.top + y.height / 2);
    const d = document.querySelector(j).getBoundingClientRect();
    const folha = document.querySelector(`${j} > .roleta`);
    return { qFundo: q.bottom, rTopo: f.top, okTocavel: Boolean(alvo?.closest(".roleta-ok")), jTopo: d.top, jFundo: d.bottom,
      popover: folha.matches(":popover-open"), fundoRoleta: Math.round(innerHeight - f.bottom), largura: Math.round(f.width) };
  }, janItem);
  // Popover = camada do topo: no Safari do iPhone a roleta dentro da janela comum era cortada pela rolagem da janela.
  verificar(rj.popover && rj.fundoRoleta === 0 && rj.largura >= 380, `roleta: dentro da janela ela abre como popover (camada do topo), presa no rodapé e na largura (${rj.largura} px)`);
  verificar(rj.okTocavel && rj.qFundo <= rj.rTopo && Math.abs(rj.jTopo - geo.topo) <= 1 && rj.jFundo <= rj.rTopo,
    `roleta: dentro da janela do item ela recebe o toque, a janela não pula e termina acima da roleta, quantidade à vista (${Math.round(rj.rTopo - rj.qFundo)} px de folga)`);
  await cel.screenshot({ path: `${SAIDA}/p6u-janela-item-roleta.png` });
  await cel.keyboard.press("ArrowUp");                        // roda dos decimais um passo acima
  await cel.waitForTimeout(250);
  const qGiro = await cel.inputValue(qJan);
  await tocar(`${janItem} .roleta-ok`);
  await cel.waitForTimeout(150);
  verificar(qGiro !== qAntesJan && await cel.locator(`${janItem} > .roleta`).count() === 0 && await cel.evaluate((j) => document.querySelector(j)?.open, janItem),
    `roleta: OK grava a quantidade e a janela continua aberta (${qAntesJan} → ${qGiro} kg)`);
  await tocar(`${janItem} .item-pronto`);
  await cel.waitForTimeout(150);
  verificar(await cel.locator(janItem).count() === 0 && await cel.inputValue(qLinha) === qGiro, "toque: Pronto fecha a janela e a linha mostra a quantidade nova");
  await tocar(".barra-app button.app-desfazer");
  verificar(await cel.inputValue(qLinha) === qAntesJan, "toque: ↶ desfaz a quantidade escolhida na janela");
  // 320 px: tudo cabe na janela, sem rolagem para o lado.
  await cel.setViewportSize({ width: 320, height: 568 });
  await cel.waitForTimeout(200);
  await cel.evaluate((s) => document.querySelector(s).scrollIntoView({ block: "center" }), nomeMalte);
  await tocar(nomeMalte);
  await cel.waitForTimeout(150);
  const g320 = await cel.evaluate((j) => {
    const d = document.querySelector(j);
    const passa = [...d.querySelectorAll("*")].filter((n) => n.getBoundingClientRect().right > innerWidth + 0.5 && n.getClientRects().length).map((n) => n.className || n.tagName);
    return { passa, q: d.querySelector('input[aria-label="Qtd (kg)"]').getBoundingClientRect().bottom };
  }, janItem);
  verificar(!g320.passa.length && g320.q < 260, `toque: em 320 px a janela do item cabe na largura e a quantidade fica no alto${g320.passa.length ? " (passam: " + g320.passa.slice(0, 5).join(", ") + ")" : ""}`);
  await cel.screenshot({ path: `${SAIDA}/p6v-janela-item-320.png` });
  await tocar(`${janItem} .item-fechar`);
  await cel.setViewportSize({ width: 390, height: 844 });
  await cel.waitForTimeout(200);

  // Tabelas viram cartões, sem rolagem para o lado.
  const rolagemTabelas = await cel.evaluate(() => [...document.querySelectorAll(".tabela-rolagem")].map((t) => t.scrollWidth - t.clientWidth));
  verificar(rolagemTabelas.every((d) => d <= 0) && await cel.evaluate(() => getComputedStyle(document.querySelector('[data-secao="mostura"] tbody tr')).display) === "grid",
    "toque: outros, mostura e fermentação em cartões, sem rolagem para o lado");
  await cel.evaluate(() => document.querySelector('[data-secao="leveduras"]').scrollIntoView());
  await cel.screenshot({ path: `${SAIDA}/p6b-celular-cartoes.png` });

  // Leveduras (24/11/2026): linha com valores fixos (sem campo); tocar abre a janela do item com os campos.
  for (const largura of [390, 320]) {
    await cel.setViewportSize({ width: largura, height: largura === 390 ? 844 : 640 });
    await cel.waitForTimeout(150);
    const lev = '[data-secao="leveduras"] li.ing';
    await cel.evaluate((s) => document.querySelector(s).scrollIntoView({ block: "center" }), lev);
    const lin = await cel.evaluate((s) => {
      const li = document.querySelector(s), b = li.getBoundingClientRect();
      return { campos: li.querySelectorAll("input, select, textarea").length, h: b.height, passa: b.right > innerWidth + 0.5,
        qtd: li.querySelector(".ing-fixo-qtd")?.textContent };
    }, lev);
    verificar(lin.campos === 0 && lin.h <= 72 && !lin.passa && lin.qtd === "1 pacote",
      `toque ${largura} px: levedura numa linha só com valores fixos (${Math.round(lin.h)} px, "${lin.qtd}")`);
    if (largura === 390) await cel.screenshot({ path: `${SAIDA}/p6q-levedura-linha.png` });
    await tocar(`${lev} .ing-fixo`);
    await cel.waitForSelector("dialog.item-janela.lev");
    await cel.waitForTimeout(150);
    const jan = await cel.evaluate(() => {
      const d = document.querySelector("dialog.item-janela.lev");
      const passa = [...d.querySelectorAll("*")].filter((n) => n.getBoundingClientRect().right > innerWidth + 0.5 && n.getClientRects().length).map((n) => n.className || n.tagName);
      const r = (q) => !!d.querySelector(q);
      return { passa, campos: ["Nome", "Tipo", "Forma", "Atenuação %", "Etapa", "Quantidade", "Unidade"].every((l) => r(`[aria-label="${l}"]`)),
        foco: document.activeElement?.classList.contains("item-fechar"), roleta: !!document.querySelector(".roleta") };
    });
    verificar(!jan.passa.length && jan.campos && jan.foco && !jan.roleta,
      `toque ${largura} px: janela da levedura com todos os campos, cabe na largura, sem abrir teclado nem roleta${jan.passa.length ? " (passam: " + jan.passa.slice(0, 5).join(", ") + ")" : ""}`);
    await cel.screenshot({ path: `${SAIDA}/p6q-levedura-janela-${largura}.png` });
    await tocar("dialog.item-janela.lev .item-pronto");
    await cel.waitForSelector("dialog.item-janela", { state: "detached" });
  }
  await cel.setViewportSize({ width: 390, height: 844 });
  await cel.waitForTimeout(150);

  // Busca de ingrediente no celular: sem filtros, a lista começa logo abaixo do campo.
  await tocar('[data-secao="fermentaveis"] button.adicionar');
  await cel.waitForSelector("dialog.busca");
  const topoMaltes = (await cel.locator("dialog.busca .busca-opcao").first().boundingBox()).y;
  verificar(await cel.locator("dialog.busca .chip").count() === 0 && topoMaltes < 300, `toque: busca de malte sem filtros, 1º item a ${Math.round(topoMaltes)} px do topo`);
  await cel.screenshot({ path: `${SAIDA}/p6h-celular-busca-malte.png` });
  await cel.keyboard.press("Escape");
  await cel.waitForSelector("dialog.busca", { state: "detached" });

  // Busca de estilo no celular: sem filtros, os estilos começam logo abaixo do campo.
  await tocar(botaoEstilo);
  await cel.waitForSelector("dialog.busca");
  const topoEstilos = (await cel.locator("dialog.busca .busca-opcao").first().boundingBox()).y;
  verificar(await cel.locator("dialog.busca .chip").count() === 0 && topoEstilos < 300, `toque: busca de estilo sem filtros, 1º estilo a ${Math.round(topoEstilos)} px do topo`);
  await cel.screenshot({ path: `${SAIDA}/p6g-celular-busca-estilo.png` });
  await cel.keyboard.press("Escape");
  await cel.waitForSelector("dialog.busca", { state: "detached" });
  // Passos da mostura numa linha só (24/11/2026, pedido do responsável): ⠿ à esquerda | passo | °C | min | ×, todos na
  // mesma altura, sem um cobrir o outro, dentro da seção e com toque de 44 px na alça e no ×.
  // Fermentação no mesmo padrão (24/11/2026): ⠿ | nome do passo | °C | dias | ×.
  const passosLinha = (secao) => cel.evaluate((secao) => [...document.querySelectorAll(`[data-secao="${secao}"] tbody tr`)].map((tr) => {
    const q = (s) => tr.querySelector(s)?.getBoundingClientRect();
    const alca = q(".ing-alca"), passo = q('select[aria-label="Passo da mostura"], input[aria-label="Passo"]'), temp = q('input[aria-label="Temp. (°C)"]'),
      tempo = q('input[aria-label="Tempo (min)"], input[aria-label="Dias"]'), rem = q('button[aria-label="Remover"]');
    const todos = [alca, passo, temp, tempo, rem];
    if (todos.some((b) => !b)) return { falta: true };
    const sec = tr.closest("section").getBoundingClientRect();
    const cruza = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    const meio = (b) => b.top + b.height / 2;
    return {
      ordem: todos.every((b, k) => k === 0 || todos[k - 1].right <= b.left + 0.5),
      linha: todos.every((b) => Math.abs(meio(b) - meio(passo)) <= 2),
      sobrepoe: todos.some((a, k) => todos.some((b, l) => l > k && cruza(a, b))),
      cabe: todos.every((b) => b.left >= sec.left - 0.5 && b.right <= sec.right + 0.5),
      toque: alca.height >= 44 && rem.width >= 44 && rem.height >= 44,
      unidades: getComputedStyle(tr.querySelector('input[aria-label="Temp. (°C)"]').closest("td"), "::after").content,
      altura: Math.round(tr.getBoundingClientRect().height), passo: Math.round(passo.width),
      // Campo com texto cortado (nome do campo), ou false.
      corta: [...tr.querySelectorAll("input.num")].find((n) => n.scrollWidth > n.clientWidth + 1)?.getAttribute("aria-label") || (() => {
        const s = tr.querySelector("select");
        if (!s) return false;
        const cs = getComputedStyle(s), ctx = document.createElement("canvas").getContext("2d");
        ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        return ctx.measureText(s.selectedOptions[0].text).width > s.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 0.5 && "Passo da mostura";
      })(),
    };
  }), secao);
  await cel.locator('[data-secao="mostura"] .titulo-linha button.adicionar').click();
  for (const w of [320, 390]) {
    await cel.setViewportSize({ width: w, height: w === 320 ? 700 : 844 });
    const passos = await passosLinha("mostura");
    verificar(passos.length === 2 && passos.every((p) => !p.falta && p.ordem && p.linha && !p.sobrepoe && p.cabe && p.toque && p.altura <= 56 && p.passo >= 72 && !p.corta && p.unidades === '"°C"'),
      `toque ${w} px: cada passo da mostura numa linha (⠿ à esquerda, passo, °C, min, ×) sem cobrir campo (${JSON.stringify(passos)})`);
    await cel.evaluate(() => { document.querySelector('[data-secao="mostura"]').scrollIntoView(); window.scrollBy(0, -20); });
    await cel.screenshot({ path: `${SAIDA}/p6m-celular-mostura-${w}.png` });
    await cel.evaluate(() => { const n = document.querySelector('[data-secao="fermentacao"] input[aria-label="Dias"]'); n.value = "120"; });   // 3 dígitos
    const ferm = await passosLinha("fermentacao");
    await cel.evaluate(() => { const n = document.querySelector('[data-secao="fermentacao"] input[aria-label="Dias"]'); n.value = "14"; });
    verificar(ferm.length >= 1 && ferm.every((p) => !p.falta && p.ordem && p.linha && !p.sobrepoe && p.cabe && p.toque && p.altura <= 56 && p.passo >= 72 && !p.corta && p.unidades === '"°C"'),
      `toque ${w} px: cada passo da fermentação numa linha (⠿ à esquerda, nome, °C, dias, ×) sem cobrir campo (${JSON.stringify(ferm)})`);
  }
  // Alça ⠿ no lugar do ↑ (24/11/2026, pedido do responsável): arrastar com o dedo e mover pelas setas.
  const linhaM = '[data-secao="mostura"] tbody tr';
  const tempsM = () => cel.$$eval(`${linhaM} input[aria-label="Temp. (°C)"]`, (ns) => ns.map((n) => n.value));
  const antesM = await tempsM();
  verificar(await cel.locator(`${linhaM} .ing-alca`).count() === 2 && await cel.locator('[data-secao="mostura"] button[aria-label="Subir"]').count() === 0
    && (await cel.textContent(`${linhaM}:nth-child(1) .ing-alca`)) === "⠿", "mostura: alça ⠿ em todos os passos, sem o botão ↑");
  await cel.evaluate(() => { document.querySelector('[data-secao="mostura"]').scrollIntoView(); window.scrollBy(0, -20); });
  const [pmx, pmy] = await centro(`${linhaM}:nth-child(2) .ing-alca`);
  const m1 = await cel.locator(`${linhaM}:nth-child(1)`).boundingBox();
  await toque("touchStart", pmx, pmy);
  for (let k = 1; k <= 8; k++) { await toque("touchMove", pmx, pmy + ((m1.y + 6 - pmy) * k) / 8); await cel.waitForTimeout(16); }
  await toque("touchEnd");
  await cel.waitForTimeout(100);
  const depoisM = await tempsM();
  verificar(antesM.length === 2 && antesM[0] !== antesM[1] && depoisM[0] === antesM[1] && depoisM[1] === antesM[0],
    `mostura: arrastar a alça com o dedo leva o passo para cima (${antesM} → ${depoisM})`);
  await tocar('[data-secao="mostura"] .titulo-linha h3');   // toque neutro (pendência do simulador, ver lúpulos)
  await cel.focus(`${linhaM}:nth-child(1) .ing-alca`);
  await cel.keyboard.press("ArrowDown");
  verificar(JSON.stringify(await tempsM()) === JSON.stringify(antesM) && (await cel.evaluate(() => document.activeElement.getAttribute("aria-label"))).includes("posição 2 de 2"),
    "mostura: seta ↓ na alça desce o passo e o foco acompanha");
  // Tipo do passo (24/11/2026, pedido do responsável): só Rampa (numerada pela ordem), Mash out e Lavagem.
  const tiposPasso = () => cel.evaluate(() => [...document.querySelectorAll('[data-secao="mostura"] select[aria-label="Passo da mostura"]')]
    .map((s) => ({ opcoes: [...s.options].map((o) => o.text).join("|"), escolhido: s.selectedOptions[0].text })));
  verificar(await cel.locator('[data-secao="mostura"] tbody input.nome').count() === 0
    && await cel.locator('[data-secao="mostura"] tbody td[data-rotulo="Tipo"]').count() === 0, "mostura: sem campo de nome nem Tipo separado (passo = tipo)");
  const t1 = await tiposPasso();
  verificar(t1.length === 2 && t1[0].opcoes === "Rampa 1|Mash out|Lavagem" && t1[1].opcoes === "Rampa 2|Mash out|Lavagem" && t1.every((t) => t.escolhido.startsWith("Rampa")),
    `mostura: passo = tipo, só Rampa (numerada), Mash out e Lavagem (${JSON.stringify(t1)})`);
  await cel.selectOption('[data-secao="mostura"] tbody tr:nth-child(1) select[aria-label="Passo da mostura"]', "MASH_OUT");
  const t2 = await tiposPasso();
  verificar(t2[0].escolhido === "Mash out" && t2[1].escolhido === "Rampa 1", `mostura: trocar o tipo renumera as rampas (${JSON.stringify(t2)})`);
  await cel.selectOption('[data-secao="mostura"] tbody tr:nth-child(1) select[aria-label="Passo da mostura"]', "TEMPERATURA");
  verificar((await tiposPasso())[1].escolhido === "Rampa 2", "mostura: voltar a rampa renumera de novo");
  await cel.evaluate(() => { document.querySelector('[data-secao="mostura"]').scrollIntoView(); window.scrollBy(0, -20); });
  await cel.screenshot({ path: `${SAIDA}/p6m-celular-mostura.png` });
  await cel.locator('[data-secao="mostura"] tbody tr:nth-child(2) button[aria-label="Remover"]').click();
  await cel.setViewportSize({ width: 390, height: 844 });
  await cel.evaluate(() => window.scrollTo(0, 0));

  // Arrastar com o dedo: segundo lúpulo pela busca e arrastado para cima.
  await tocar('[data-secao="lupulos"] button.adicionar');
  await cel.waitForSelector("dialog.busca");
  await cel.keyboard.type("saaz");
  await cel.keyboard.press("Enter");
  await cel.waitForSelector(".roleta");
  await cel.waitForTimeout(250);
  // Mais provável no amargor de 60 min: 20 g em 20 L, proporcional ao volume do lote.
  const gLup = Math.round(20 * Number(db.receitas.find((x) => x.nome === "Pils da Galia").volume_lote_l) / 20);
  verificar(await cel.textContent(".roleta-valor") === `${gLup},0 g` && await cel.locator("dialog.item-janela > .roleta").count() === 1
    && await cel.inputValue('dialog.item-janela input[aria-label="Qtd (g)"]') === `${gLup},0`,
    `roleta: lúpulo novo abre a janela do item com a roleta já na quantidade mais provável (${gLup} g para o lote)`);
  await cel.screenshot({ path: `${SAIDA}/p6x-lupulo-novo-janela.png` });
  await tocar(".roleta-ok");
  await cel.waitForTimeout(150);
  // Janela do lúpulo: etapa e tempo junto da quantidade.
  verificar(await cel.isVisible('dialog.item-janela select[aria-label="Etapa"]') && await cel.inputValue('dialog.item-janela input[aria-label="Qtd (g)"]') === `${gLup},0`,
    "toque: janela do lúpulo com etapa, tempo e quantidade");
  await cel.screenshot({ path: `${SAIDA}/p6w-janela-lupulo.png` });
  await tocar("dialog.item-janela .item-pronto");
  await cel.waitForSelector("dialog.item-janela", { state: "detached" });
  const linhaLCel = '[data-secao="lupulos"] li.ing';
  const [ax, ay] = await centro(`${linhaLCel}:nth-child(2) .ing-alca`);
  const l1 = await cel.locator(`${linhaLCel}:nth-child(1)`).boundingBox();
  await toque("touchStart", ax, ay);
  for (let k = 1; k <= 8; k++) { await toque("touchMove", ax, ay + ((l1.y + 6 - ay) * k) / 8); await cel.waitForTimeout(16); }   // ritmo de dedo (60 Hz)
  await toque("touchEnd");
  await cel.waitForTimeout(100);
  verificar(await cel.inputValue(`${linhaLCel}:nth-child(1) input[aria-label="Qtd (g)"]`) === `${gLup},0`, "toque: arrastar a alça com o dedo leva o lúpulo para cima");

  // PENDÊNCIA (conferir no iPhone real): no simulador do Chrome (toque via CDP), depois de arrastar a alça o PRIMEIRO
  // toque não vira "click" (o clique fica preso até o toque seguinte). Não acontece com arrasto em elemento sem código.
  // Investigado sem sucesso: captura do ponteiro, redesenho da lista, foco, rolagem suave, toque duplo, ritmo do arrasto.
  // Aqui, um toque neutro (título da seção) encerra a sequência antes de seguir.
  await tocar('[data-secao="lupulos"] .titulo-linha h3');
  // Lúpulo em 2 linhas (24/11/2026, pedido do responsável): etapa e tempo à direita do nome, quantidade embaixo.
  const lupuloEmDuasLinhas = (larg) => cel.evaluate((larg) => [...document.querySelectorAll('[data-secao="lupulos"] li.ing')].map((li) => {
    const b = (q) => li.querySelector(q).getBoundingClientRect();
    const nome = b(".ing-nome"), quando = b(".ing-quando"), qtd = b(".ing-qtd");
    return quando.left >= nome.right - 1 && quando.top < qtd.top && quando.bottom <= qtd.top + 1 && quando.right <= Math.min(li.getBoundingClientRect().right, larg) + 1
      && nome.width >= 60;
  }).every(Boolean), larg);
  verificar(await lupuloEmDuasLinhas(390), "toque 390 px: etapa e tempo do lúpulo à direita do nome (2 linhas por lúpulo)");
  await cel.evaluate(() => { document.querySelector('[data-secao="lupulos"]').scrollIntoView(); window.scrollBy(0, -20); });
  await cel.screenshot({ path: `${SAIDA}/p6l-celular-lupulos.png` });
  await cel.setViewportSize({ width: 320, height: 568 });
  await cel.waitForTimeout(200);
  verificar(await lupuloEmDuasLinhas(320) && await larguraSobra() <= 1, "toque 320 px: etapa e tempo do lúpulo à direita do nome, sem passar da largura");
  await cel.evaluate(() => { document.querySelector('[data-secao="lupulos"]').scrollIntoView(); window.scrollBy(0, -20); });
  await cel.screenshot({ path: `${SAIDA}/p6l-celular-lupulos-320.png` });
  await cel.setViewportSize({ width: 390, height: 844 });
  await cel.waitForTimeout(200);
  // Janela "Chegar à OG" cabe na tela.
  await tocar('.vital [data-metrica="og"] button.vital-val');
  await cel.waitForSelector("dialog.alvo");
  const jan = await cel.locator("dialog.alvo").boundingBox();
  verificar(jan.x >= 0 && jan.x + jan.width <= 390 && await cel.isVisible('dialog.alvo button:has-text("Aplicar")'), "toque: janela de Chegar à OG cabe na tela");
  await cel.screenshot({ path: `${SAIDA}/p6c-celular-chegar-og.png` });
  await tocar('dialog.alvo button:has-text("Cancelar")');

  // 320 px (iPhone SE de 1ª geração, Androids pequenos).
  await cel.setViewportSize({ width: 320, height: 568 });
  await cel.waitForTimeout(200);
  verificar(await larguraSobra() <= 1, `320 px: editor não passa da largura (${await larguraSobra()} px)`);
  await cel.evaluate(() => window.scrollTo(0, 0));
  await cel.waitForTimeout(150);
  await cel.screenshot({ path: `${SAIDA}/p6y-320-excluir.png` });
  await tocar('input[aria-label="Qtd (kg)"]');
  await cel.waitForSelector(".roleta");
  await cel.waitForTimeout(300);
  const roleta320 = await cel.evaluate(() => {
    const ro = document.querySelector(".roleta");
    const fora = [...ro.querySelectorAll("*")].filter((n) => { const b = n.getBoundingClientRect(); return b.width > 0 && (b.right > 321 || b.left < -1); });
    return { fora: fora.length, rolagem: ro.scrollWidth - ro.clientWidth, botoes: [...ro.querySelectorAll("button")].map((b) => Math.round(b.getBoundingClientRect().height)) };
  });
  verificar(roleta320.fora === 0 && roleta320.rolagem <= 0 && roleta320.botoes.every((h) => h >= 44), `320 px: a roleta cabe na tela, botões com 44 px de toque (${roleta320.botoes.join(", ")})`);
  await cel.screenshot({ path: `${SAIDA}/p6s-roleta-320.png` });
  const estouroVital = await cel.evaluate(() => [...document.querySelectorAll(".vital .vital-item:not(.secundario)")].filter((n) => n.offsetParent).map((n) => {
    // folga = borda direita da casinha − o que vai mais à direita (número ou diferença); medida para fontes mais largas
    const dir = Math.max(...[...n.querySelectorAll(".vital-val, .vital-delta:not(:empty), .vital-rot")].map((c) => c.getBoundingClientRect().right));
    return Math.round(dir - n.getBoundingClientRect().right);
  }));
  verificar(await cel.evaluate(() => document.querySelector(".vital").classList.contains("com-teclado")) && estouroVital.length === 5 && estouroVital.every((d) => d <= -2),
    `320 px: com a roleta os 5 números (sem pH) cabem na linha fina com folga (posição da borda direita do conteúdo: ${estouroVital.join(", ")} px)`);
  await tocar(".roleta-cancelar");
  await cel.waitForTimeout(300);
  const estouro320 = await cel.evaluate(() => [...document.querySelectorAll("li.ing")].map((li) => {
    const sec = li.closest("section").getBoundingClientRect();
    return Math.round(Math.max(...[...li.children].filter((f) => !f.hidden).map((f) => f.getBoundingClientRect().right)) - sec.right);
  }));
  verificar(estouro320.every((d) => d <= 1), `320 px: linhas de ingrediente cabem no cartão (sobra ${estouro320.join(", ")} px)`);
  await cel.evaluate(() => window.scrollTo(0, 0));
  await cel.screenshot({ path: `${SAIDA}/p6d-celular-320.png` });
  await tocar('[data-secao="fermentaveis"] button.adicionar');
  await cel.waitForSelector("dialog.busca");
  verificar(await cel.evaluate(() => document.querySelector("dialog.busca").scrollWidth <= 320), "320 px: busca cabe na tela");
  await cel.keyboard.press("Escape");
  await tocar('.vital [data-metrica="ibu"] button.vital-val');
  const jan320 = await cel.locator("dialog.alvo").boundingBox();
  verificar(jan320.x >= 0 && jan320.x + jan320.width <= 320 && await cel.evaluate(() => document.querySelector("dialog.alvo").scrollWidth <= document.querySelector("dialog.alvo").clientWidth),
    "320 px: janela de Chegar ao IBU cabe na tela");
  await cel.screenshot({ path: `${SAIDA}/p6e-celular-320-ibu.png` });
  await cel.keyboard.press("Escape");
  await conferirLateral("320 px, editor");

  // Relatório em PDF: botão ao lado do nome, visualizador próprio (janela) e exportação para compartilhar.
  await cel.keyboard.press("Escape");
  await cel.evaluate(() => window.scrollTo(0, 0));
  const linhaNome = await cel.evaluate(() => {
    const c = (s) => document.querySelector(s).getBoundingClientRect();
    const [campo, botao] = [c(".titulo-receita"), c("button.botao-relatorio")];
    return { mesmaLinha: Math.abs((campo.top + campo.bottom) / 2 - (botao.top + botao.bottom) / 2) < 3, depois: botao.left >= campo.right, dentro: botao.right <= window.innerWidth, lado: Math.round(botao.width), campo: Math.round(campo.width) };
  });
  verificar(linhaNome.mesmaLinha && linhaNome.depois && linhaNome.dentro && linhaNome.lado >= 44 && linhaNome.campo >= 180,
    `320 px: botão do relatório ao lado do nome, na mesma linha (campo ${linhaNome.campo} px, botão ${linhaNome.lado} px)`);
  await cel.setViewportSize({ width: 390, height: 844 });
  await cel.waitForTimeout(200);
  await cel.evaluate(() => window.scrollTo(0, 0));
  await cel.screenshot({ path: `${SAIDA}/p6k-celular-botao-relatorio.png` });
  // Folha de compartilhamento do celular simulada: guarda o arquivo recebido.
  await cel.evaluate(() => {
    window.__compartilhado = null;
    Object.defineProperty(navigator, "canShare", { configurable: true, value: (d) => Boolean(d?.files?.length) });
    Object.defineProperty(navigator, "share", { configurable: true, value: async (d) => {
      const f = d.files[0];
      window.__compartilhado = { nome: f.name, tipo: f.type, titulo: d.title, bytes: Array.from(new Uint8Array(await f.arrayBuffer())) };
    } });
  });
  const ogBarra = (await cel.textContent('.vital [data-metrica="og"] .vital-val')).trim();
  await tocar("button.botao-relatorio");
  await cel.waitForSelector("dialog.relatorio[open]");
  const janRel = await cel.locator("dialog.relatorio").boundingBox();
  verificar(janRel.x === 0 && janRel.y === 0 && janRel.width === 390 && janRel.height === 844, "relatório abre numa janela que ocupa a tela do celular");
  const textoRel = await cel.evaluate(() => [...document.querySelectorAll("dialog.relatorio .rel-folha text")].map((t) => t.textContent));
  const nPaginas = await cel.locator("dialog.relatorio .rel-pagina").count();
  verificar(nPaginas >= 1 && textoRel.includes("Pils da Galia") && textoRel.includes("Fermentáveis") && textoRel.includes("Lúpulos") && textoRel.includes("Água e volumes")
    && textoRel.includes(ogBarra) && textoRel.some((t) => /página 1 de \d/.test(t)),
    `relatório mostra a receita (nome, seções, OG ${ogBarra} igual à barra; ${nPaginas} página(s))`);
  const folha = await cel.evaluate(() => {
    const a = document.querySelector(".rel-area"), f = document.querySelector(".rel-folha").getBoundingClientRect();
    const fora = [...document.querySelectorAll(".rel-folha")].flatMap((s) => {
      const caixa = s.viewBox.baseVal;
      return [...s.querySelectorAll("text")].filter((t) => { const b = t.getBBox(); return b.x < 0 || b.x + b.width > caixa.width + .5 || b.y + b.height > caixa.height; }).map((t) => t.textContent);
    });
    return { cabe: a.scrollWidth <= a.clientWidth, proporcao: f.height / f.width, fora };
  });
  verificar(folha.cabe && Math.abs(folha.proporcao - 841.89 / 595.28) < 0.01 && folha.fora.length === 0,
    `folha A4 inteira na largura da tela, nenhum texto fora da folha (${folha.fora.join(" | ")})`);
  await cel.screenshot({ path: `${SAIDA}/p6l-celular-relatorio.png` });
  await tocar('dialog.relatorio button[aria-label="Ampliar"]');
  await tocar('dialog.relatorio button[aria-label="Ampliar"]');
  verificar(await cel.textContent(".rel-zoom-valor") === "200%" && await cel.evaluate(() => { const a = document.querySelector(".rel-area"); return a.scrollWidth > a.clientWidth * 1.9; }),
    "ampliar: folha a 200%, com rolagem para os lados");
  await cel.screenshot({ path: `${SAIDA}/p6m-celular-relatorio-200.png` });
  verificar((await cel.textContent("button.rel-compartilhar")).trim() === "Compartilhar", "celular com folha de compartilhamento: botão Compartilhar");
  await tocar("button.rel-compartilhar");
  await cel.waitForFunction(() => window.__compartilhado);
  const comp = await cel.evaluate(() => window.__compartilhado);
  const pdf = Buffer.from(comp.bytes);
  fs.writeFileSync(`${SAIDA}/relatorio-celular.pdf`, pdf);
  const pdfTxt = pdf.toString("latin1");
  const xref = Number(pdfTxt.match(/startxref\n(\d+)\n%%EOF\n$/)?.[1]);
  verificar(/^GaliaBrew-\d+-pils-da-galia\.pdf$/.test(comp.nome) && comp.tipo === "application/pdf" && comp.titulo === "Pils da Galia",
    `compartilhar entrega o arquivo ${comp.nome} (application/pdf)`);
  verificar(pdfTxt.startsWith("%PDF-1.4") && pdfTxt.slice(xref, xref + 4) === "xref" && Number(pdfTxt.match(/\/Count (\d+)/)[1]) === nPaginas,
    `arquivo é um PDF com as mesmas ${nPaginas} página(s) do visualizador (${Math.round(pdf.length / 1024)} kB)`);
  await tocar("dialog.relatorio button.rel-fechar");
  await cel.waitForSelector("dialog.relatorio", { state: "detached", timeout: 3000 }).catch(() => {});      // o "close" da janela chega depois do toque
  verificar(await cel.locator("dialog.relatorio").count() === 0, "fechar tira o relatório da tela");
  // Aparelho sem compartilhamento de arquivo: o botão baixa o PDF.
  await cel.evaluate(() => { Object.defineProperty(navigator, "canShare", { configurable: true, value: undefined }); });
  await tocar("button.botao-relatorio");
  await cel.waitForSelector("dialog.relatorio[open]");
  const [baixado] = await Promise.all([cel.waitForEvent("download"), tocar("button.rel-compartilhar")]);
  verificar((await cel.textContent("button.rel-compartilhar")).trim() === "Baixar PDF" && baixado.suggestedFilename() === comp.nome, "sem compartilhamento: botão Baixar PDF baixa o arquivo");
  await cel.keyboard.press("Escape");
  await cel.waitForSelector("dialog.relatorio", { state: "detached", timeout: 3000 }).catch(() => {});
  verificar(await cel.locator("dialog.relatorio").count() === 0, "Esc fecha o relatório");

  // Fotos da brassagem (seção Notas): a foto do celular é reduzida no aparelho antes de subir para o Storage.
  const idPils = (await cel.evaluate(() => location.hash)).split("/").pop();
  const fotosTxt = () => cel.evaluate(() => ({ conta: document.querySelector(".fotos-conta").textContent, estado: document.querySelector(".fotos-estado")?.textContent ?? "", minis: document.querySelectorAll(".foto-mini").length }));
  await cel.locator('[data-secao="notas"] .fotos').evaluate((n) => n.scrollIntoView({ block: "center" }));
  await cel.waitForFunction(() => document.querySelector(".fotos-estado")?.textContent === "");
  const botaoFoto = await cel.locator(".fotos-adicionar").boundingBox();
  verificar((await fotosTxt()).conta === "0 de 12" && botaoFoto.height >= 44 && botaoFoto.width >= 300,
    `fotos: bloco na seção Notas, "0 de 12", botão Adicionar foto largo para o dedo (${Math.round(botaoFoto.width)} × ${Math.round(botaoFoto.height)} px)`);
  // Foto de celular simulada: 4000 × 3000 cheia de detalhe (ruído), vários MB.
  const fazerFoto = (l, a) => cel.evaluate(async ([largura, altura]) => {
    const grao = document.createElement("canvas");
    grao.width = grao.height = 256;
    const g = grao.getContext("2d"), dados = g.createImageData(256, 256);
    for (let i = 0; i < dados.data.length; i += 65536) crypto.getRandomValues(dados.data.subarray(i, i + 65536));
    for (let i = 3; i < dados.data.length; i += 4) dados.data[i] = 255;
    g.putImageData(dados, 0, 0);
    const tela = document.createElement("canvas");
    tela.width = largura; tela.height = altura;
    const c = tela.getContext("2d");
    c.fillStyle = c.createPattern(grao, "repeat");
    c.fillRect(0, 0, largura, altura);
    const blob = await new Promise((r) => tela.toBlob(r, "image/jpeg", 0.9));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let txt = "";
    for (let i = 0; i < bytes.length; i += 32768) txt += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(txt);
  }, [l, a]).then((b) => Buffer.from(b, "base64"));
  const fotoGrande = await fazerFoto(4000, 3000);
  await cel.setInputFiles('.fotos input[type="file"]', { name: "IMG_0001.jpg", mimeType: "image/jpeg", buffer: fotoGrande });
  await cel.waitForSelector(".foto-mini");
  await cel.waitForFunction(() => /gravada/.test(document.querySelector(".fotos-estado").textContent));
  const [caminho1, enviada1] = [...fotosGuardadas.entries()][0];
  const med1 = medidasJpeg(enviada1);
  verificar(fotoGrande.length > 2_000_000 && enviada1.length <= 300_000 && Math.max(med1.largura, med1.altura) <= 1600 && Math.abs(med1.largura / med1.altura - 4 / 3) < 0.01,
    `foto de ${(fotoGrande.length / 1e6).toFixed(1)} MB (4000 × 3000) sobe com ${Math.round(enviada1.length / 1000)} kB (${med1.largura} × ${med1.altura}), ${Math.round(fotoGrande.length / enviada1.length)}× menor`);
  verificar(new RegExp(`^${USUARIO.id}/${idPils}/[0-9a-z-]+\\.jpg$`).test(caminho1), "foto gravada na pasta <dono>/<receita>/ do bucket fotos-brassagem");
  const depois1 = await fotosTxt();
  verificar(depois1.conta === "1 de 12" && /^Foto gravada: \d+ kB \(a original tinha [\d,]+ MB\)\.$/.test(depois1.estado), `tela mostra a economia: "${depois1.estado}"`);
  // Foto pequena em pé não é ampliada; duas de uma vez.
  const fotoPequena = await fazerFoto(300, 400);
  await cel.setInputFiles('.fotos input[type="file"]', [{ name: "a.jpg", mimeType: "image/jpeg", buffer: fotoPequena }, { name: "b.jpg", mimeType: "image/jpeg", buffer: fotoPequena }]);
  await cel.waitForFunction(() => document.querySelectorAll(".foto-mini").length === 3 && /2 fotos gravadas/.test(document.querySelector(".fotos-estado").textContent));
  const med2 = medidasJpeg([...fotosGuardadas.values()][1]);
  verificar(med2.largura === 300 && med2.altura === 400 && fotosGuardadas.size === 3, "foto pequena (300 × 400) não é ampliada; duas fotos escolhidas de uma vez sobem as duas");
  // Arquivo que não é imagem: aviso, nada sobe.
  await cel.setInputFiles('.fotos input[type="file"]', { name: "nota.txt", mimeType: "text/plain", buffer: Buffer.from("não é foto") });
  await cel.waitForSelector(".aviso.erro >> text=Não consegui ler esta imagem");
  verificar(fotosGuardadas.size === 3 && (await fotosTxt()).minis === 3, "arquivo que não é imagem: aviso e nada é enviado");
  await cel.locator('[data-secao="notas"] .fotos').evaluate((n) => n.scrollIntoView({ block: "center" }));
  const grade = await cel.evaluate(() => {
    const m = [...document.querySelectorAll(".foto-mini")].map((n) => n.getBoundingClientRect());
    return { mesmaLinha: m.every((b) => Math.abs(b.top - m[0].top) < 1), quadrada: m.every((b) => Math.abs(b.width - b.height) < 1), lado: Math.round(m[0].width),
      carregadas: [...document.querySelectorAll(".foto-mini img")].every((i) => i.complete && i.naturalWidth > 0) };
  });
  verificar(grade.mesmaLinha && grade.quadrada && grade.lado >= 110 && grade.carregadas && await larguraSobra() <= 1,
    `390 px: 3 miniaturas quadradas por linha (${grade.lado} px), sem rolagem para o lado`);
  await cel.screenshot({ path: `${SAIDA}/p6n-celular-fotos.png` });
  await tocar(".foto-mini");
  await cel.waitForSelector("dialog.foto-janela[open]");
  await cel.waitForFunction(() => document.querySelector(".foto-grande").naturalWidth > 0);
  const janFoto = await cel.locator("dialog.foto-janela").boundingBox();
  const fotoAberta = await cel.evaluate(() => { const i = document.querySelector(".foto-grande"), b = i.getBoundingClientRect(); return { nat: i.naturalWidth, largura: Math.round(b.width), titulo: document.querySelector(".foto-janela .rel-titulo").textContent }; });
  verificar(janFoto.x === 0 && janFoto.y === 0 && janFoto.width === 390 && janFoto.height === 844 && fotoAberta.nat === med1.largura && fotoAberta.largura === 390 && fotoAberta.titulo === "Foto 1 de 3",
    "toque na miniatura abre a foto inteira numa janela que ocupa a tela");
  await cel.screenshot({ path: `${SAIDA}/p6o-celular-foto-aberta.png` });
  await tocar('.foto-janela button[aria-label="Próxima foto"]');
  verificar(await cel.textContent(".foto-janela .rel-titulo") === "Foto 2 de 3", "próxima foto");
  await tocar(".foto-janela button.foto-excluir");
  await cel.waitForSelector("dialog.confirmar[open]");
  await tocar("dialog.confirmar button.perigo");
  await cel.waitForFunction(() => document.querySelectorAll(".foto-mini").length === 2);
  verificar(fotosGuardadas.size === 2 && fotosGuardadas.has(caminho1) && await cel.textContent(".foto-janela .rel-titulo") === "Foto 2 de 2" && (await fotosTxt()).conta === "2 de 12",
    "excluir a foto (com confirmação) apaga do Storage e segue na foto seguinte");
  await tocar(".foto-janela button.rel-fechar");
  await cel.waitForSelector("dialog.foto-janela", { state: "detached", timeout: 3000 }).catch(() => {});
  // Reabrir a receita: as fotos vêm do Storage por link assinado (a CSP precisa deixar a imagem do Supabase entrar).
  cel.once("dialog", (d) => d.accept());      // a receita tem alteração pendente dos testes anteriores
  await cel.evaluate(() => { location.hash = "#/receitas"; });
  await cel.waitForSelector(".receita-cartao >> text=Pils da Galia");
  await tocar(".receita-cartao >> text=Pils da Galia");
  await cel.waitForSelector(".foto-mini");
  await cel.locator('[data-secao="notas"] .fotos').evaluate((n) => n.scrollIntoView({ block: "center" }));
  await cel.waitForFunction(() => [...document.querySelectorAll(".foto-mini img")].every((i) => i.complete && i.naturalWidth > 0));
  const reaberta = await cel.evaluate(() => [...document.querySelectorAll(".foto-mini img")].map((i) => new URL(i.src).host + "|" + i.naturalWidth));
  verificar(reaberta.length === 2 && reaberta[0] === `hzomsyfujxakcuaaedmh.supabase.co|${med1.largura}` && (await fotosTxt()).conta === "2 de 12",
    "ao reabrir a receita as 2 fotos aparecem, vindas do Storage");
  await cel.setViewportSize({ width: 320, height: 640 });
  await cel.waitForTimeout(200);
  await cel.locator('[data-secao="notas"] .fotos').evaluate((n) => n.scrollIntoView({ block: "center" }));
  verificar(await larguraSobra() <= 1 && await cel.evaluate(() => { const m = [...document.querySelectorAll(".foto-mini")].map((n) => n.getBoundingClientRect()); return m[0].top === m[1].top && m[1].right <= window.innerWidth; }),
    "320 px: fotos sem rolagem para o lado");
  await cel.screenshot({ path: `${SAIDA}/p6p-celular-fotos-320.png` });
  await cel.setViewportSize({ width: 390, height: 844 });
  // Receita nova (ainda sem id): só o aviso.
  await cel.evaluate(() => { location.hash = "#/receita/nova"; });
  await cel.waitForFunction(() => document.querySelector(".fotos .nota")?.textContent === "Salve a receita para adicionar fotos.");
  verificar(await cel.locator('.fotos input[type="file"]').count() === 0, "receita nova ainda não salva: pede para salvar antes de pôr fotos");
  await cel.evaluate(() => { location.hash = "#/receitas"; });
  await cel.waitForSelector(".receita-cartao >> text=Pils da Galia");
  await tocar(".receita-cartao >> text=Pils da Galia");
  await cel.waitForSelector(".barra-app");

  // Temas (Meu perfil → Aparência): troca na hora, fica salvo no aparelho, vale depois de recarregar.
  await cel.keyboard.press("Escape");
  cel.once("dialog", (d) => d.accept());
  await cel.evaluate(() => { location.hash = "#/perfil"; });
  await cel.waitForSelector(".tema-opcao");
  const temasIds = await cel.$$eval("fieldset.temas:not(.layouts) .tema-opcao", (ls) => ls.map((l) => l.dataset.opcao));
  verificar(temasIds.length === 9 && temasIds[0] === "auto" && await cel.isChecked('.tema-opcao[data-opcao="auto"] input'),
    "perfil: 9 temas, Automático marcado por padrão");
  verificar(await larguraSobra() <= 1, "320 px: temas do perfil sem rolagem para o lado");
  // Barra escura das outras telas (27/11/2026): logo "Gália" em creme no lugar do copinho + "GaliaBrew".
  await cel.evaluate(() => window.scrollTo(0, 0));
  const bl = await cel.evaluate(() => {
    const b = document.querySelector(".barra-movel"), img = b.querySelector(".marca .marca-logo"), r = img?.getBoundingClientRect();
    const m = b.querySelector(".abrir-menu").getBoundingClientRect(), rb = b.getBoundingClientRect();
    return img && { src: img.getAttribute("src"), carregada: img.complete && img.naturalWidth > 0, visivel: img.checkVisibility(), altura: Math.round(r.height),
      dentro: r.top >= rb.top && r.bottom <= rb.bottom, separado: m.right <= r.left, texto: b.querySelector(".marca").textContent.trim(), copo: !!b.querySelector(".copo") };
  });
  verificar(bl && bl.src === "icones/logo-galia-escuro.png" && bl.visivel && bl.altura >= 36 && bl.altura <= 44 && bl.dentro && bl.separado && !bl.texto && !bl.copo,
    `320 px: barra escura do perfil com a logo "Gália" em creme, sem copinho nem "GaliaBrew" (${JSON.stringify(bl)})`);
  await cel.screenshot({ path: `${SAIDA}/p6g-celular-320-barra-logo.png`, clip: { x: 0, y: 0, width: 320, height: 140 } });
  await cel.locator(".temas").first().evaluate((n) => n.scrollIntoView({ block: "start" }));
  await cel.screenshot({ path: `${SAIDA}/p6g-celular-320-temas.png` });
  await cel.setViewportSize({ width: 390, height: 844 });
  const corFundo = () => cel.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const fundoAntes = await corFundo();
  await tocar('.tema-opcao[data-opcao="stout"]');
  verificar(await cel.evaluate(() => document.documentElement.dataset.tema + "/" + document.documentElement.dataset.modo) === "stout/escuro"
    && await corFundo() === "rgb(12, 10, 9)" && fundoAntes === "rgb(255, 255, 255)", "toque no tema Stout troca as cores na hora (fundo preto)");
  verificar(await cel.evaluate(() => JSON.parse(localStorage.getItem("galiabrew.preferencias")).tema) === "stout"
    && await cel.getAttribute('meta[name="theme-color"]', "content") === "#0c0a09", "tema fica salvo no aparelho e pinta a barra do sistema com o fundo da página");
  await cel.locator(".temas").first().evaluate((n) => n.scrollIntoView({ block: "start" }));
  await cel.screenshot({ path: `${SAIDA}/p6h-celular-temas-stout.png` });
  await cel.reload();
  await cel.waitForSelector(".tema-opcao");
  verificar(await cel.evaluate(() => document.documentElement.dataset.tema) === "stout" && await cel.isChecked('.tema-opcao[data-opcao="stout"] input'),
    "depois de recarregar o tema continua (e aparece marcado)");
  await cel.evaluate(() => { location.hash = "#/receitas"; });
  await tocar(".receita-cartao >> text=Pils da Galia");
  await cel.waitForSelector(".barra-app");
  await cel.screenshot({ path: `${SAIDA}/p6i-celular-editor-stout.png` });
  for (const t of ["pilsen", "ipa", "red-ale", "black-ipa", "sol"]) {
    await cel.evaluate((id) => window.GaliaTema.aplicar(id), t);
    await cel.screenshot({ path: `${SAIDA}/p6j-celular-editor-${t}.png` });
  }
  verificar(await cel.evaluate(() => getComputedStyle(document.querySelector('[data-secao="fermentaveis"]')).backgroundImage) === "none",
    "Sol forte: seções sem desenho de fundo");
  // Rolagem só na vertical nas outras telas (320 px).
  await cel.keyboard.press("Escape");
  await cel.setViewportSize({ width: 320, height: 568 });
  const aceitar = (d) => d.accept();          // sair do editor com alteração pendente pede confirmação
  cel.on("dialog", aceitar);
  for (const [rota, espera] of [["#/ferramentas", ".ferramentas-menu"], ["#/cadastros/fermentaveis", "table.lista-cad"], ["#/cadastros/estilos", "table.lista-cad"], ["#/cadastros/equipamentos", ".abas"], ["#/perfil", "form, .cartao"]]) {
    await cel.evaluate((r) => { location.hash = r; }, rota);
    await cel.waitForFunction((r) => location.hash === r, rota);
    await cel.waitForSelector(espera);
    await conferirLateral(`320 px, ${rota}`);
    await cel.screenshot({ path: `${SAIDA}/p6g-celular-320-${rota.split("/").pop()}.png` });
    if (rota === "#/ferramentas") {
      // Capturas em 390 px (o que se mostra ao responsável): menu e a janela do priming.
      await cel.setViewportSize({ width: 390, height: 844 });
      await cel.waitForTimeout(200);
      await cel.screenshot({ path: `${SAIDA}/p6y-celular-ferramentas.png` });
      await tocar('button.ferramenta-botao[data-ferramenta="priming"]');
      await cel.waitForSelector("dialog.ferramenta-janela[open]");
      await cel.waitForTimeout(250);
      const jan = await cel.evaluate(() => { const r = document.querySelector("dialog.ferramenta-janela").getBoundingClientRect(); return { cima: r.top, baixo: innerHeight - r.bottom, esq: r.left, dir: innerWidth - r.right }; });
      verificar(Math.abs(jan.cima - jan.baixo) <= 2 && jan.esq >= 6 && jan.dir >= 6, `390 px: janela da ferramenta no meio da tela (${Math.round(jan.cima)}/${Math.round(jan.baixo)} px)`);
      await cel.screenshot({ path: `${SAIDA}/p6y2-celular-ferramenta-priming.png` });
      await tocar("dialog.ferramenta-janela .item-fechar");
      await cel.waitForSelector("dialog.ferramenta-janela", { state: "detached" });
      await cel.setViewportSize({ width: 320, height: 568 });
      await cel.waitForTimeout(200);
      // Menu de ferramentas no celular: botões na largura toda, um abaixo do outro, com 44 px ou mais de toque.
      const caixas = await cel.$$eval("button.ferramenta-botao", (bs) => bs.map((b) => b.getBoundingClientRect().toJSON()));
      verificar(caixas.length === 4 && caixas.every((c, k) => c.height >= 44 && c.right <= 320 && (k === 0 || c.top >= caixas[k - 1].bottom)),
        "320 px: 4 botões de ferramenta empilhados, dentro da largura e com toque ≥ 44 px");
      await tocar('button.ferramenta-botao[data-ferramenta="densimetro"]');
      await cel.waitForSelector("dialog.ferramenta-janela[open]");
      await conferirLateral("320 px, janela do densímetro");
      // Roleta dentro da janela: leitura do densímetro vazia começa em 1,050 (o placeholder); OK grava.
      await cel.evaluate(() => { const i = document.querySelector('input[aria-label="Leitura"]'); i.value = ""; i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true })); });
      await tocar('input[aria-label="Leitura"]');
      await cel.waitForSelector("dialog.ferramenta-janela .roleta");
      await cel.waitForTimeout(250);
      const campoVisivel = await cel.evaluate(() => document.querySelector("input.em-roleta").getBoundingClientRect().bottom <= document.querySelector(".roleta").getBoundingClientRect().top);
      verificar(await cel.textContent(".roleta-valor") === "1,050" && campoVisivel, "roleta (Ferramentas): densidade vazia começa em 1,050, dentro da janela, e o campo fica acima da roleta");
      const resVisivel = await cel.evaluate(() => { const r = document.querySelector(".fj-resultado").getBoundingClientRect(); return r.top >= 0 && r.bottom <= document.querySelector(".roleta").getBoundingClientRect().top; });
      verificar(resVisivel, "roleta (Ferramentas): o resultado fica à vista, acima da roleta");
      await cel.screenshot({ path: `${SAIDA}/p6z-celular-320-ferramenta-roleta.png` });
      await tocar(".roleta-ok");
      verificar(await cel.inputValue('input[aria-label="Leitura"]') === "1,050" && (await cel.textContent(".fj-resultado")).includes("1,05"), "roleta (Ferramentas): OK grava a leitura e a conta sai");
      await tocar("dialog.ferramenta-janela .item-pronto");
      await cel.waitForSelector("dialog.ferramenta-janela", { state: "detached" });
    }
  }
  cel.off("dialog", aceitar);
  await cel.setViewportSize({ width: 390, height: 844 });

  // Layout Clean (perfil → Aparência; docs/PLANO-CLEAN.md, etapas K0 + K3): ficha de malte e lúpulo, sem decoração.
  await cel.evaluate(() => { window.GaliaTema.aplicar("auto"); location.hash = "#/perfil"; });
  await cel.waitForSelector(".layouts .tema-opcao");
  verificar(await cel.isChecked('.layouts .tema-opcao[data-opcao="completo"] input') && await cel.evaluate(() => document.documentElement.dataset.layout) === "completo",
    "clean: o layout Completo é o padrão");
  await tocar('.tema-opcao[data-opcao="auto"]');          // capturas no tema padrão (o Stout ficou salvo acima)
  await tocar('.layouts .tema-opcao[data-opcao="clean"]');
  verificar(await cel.evaluate(() => document.documentElement.dataset.layout + "/" + JSON.parse(localStorage.getItem("galiabrew.preferencias")).layout) === "clean/clean",
    "clean: escolher no perfil marca o <html> e fica salvo no aparelho");
  await cel.locator(".layouts").evaluate((n) => n.scrollIntoView({ block: "center" }));
  await cel.screenshot({ path: `${SAIDA}/p7-perfil-layout.png` });
  await cel.reload();
  await cel.waitForSelector(".layouts .tema-opcao");
  verificar(await cel.evaluate(() => document.documentElement.dataset.layout) === "clean" && await cel.isChecked('.layouts .tema-opcao[data-opcao="clean"] input'),
    "clean: continua depois de recarregar");
  await cel.evaluate(() => { location.hash = "#/receitas"; });
  await tocar(".receita-cartao >> text=Pils da Galia");
  await cel.waitForSelector('[data-secao="fermentaveis"] li.ing.ficha');
  const nFerm = db.receita_fermentaveis.filter((x) => x.receita_id === idPils).length;
  const nLup = db.receita_lupulos.filter((x) => x.receita_id === idPils).length;
  const fichas = await cel.evaluate(() => ({
    ferm: document.querySelectorAll('[data-secao="fermentaveis"] li.ing.ficha').length,
    lup: document.querySelectorAll('[data-secao="lupulos"] li.ing.ficha').length,
    alcas: document.querySelectorAll(".linhas-ing .ing-alca").length,
    passos: [...document.querySelectorAll(".linhas-ing button.passo")].filter((b) => b.checkVisibility()).length,
    quando: document.querySelectorAll(".linhas-ing .ing-quando").length,
    alturas: [...document.querySelectorAll("li.ing.ficha")].map((l) => Math.round(l.getBoundingClientRect().height)),
  }));
  verificar(fichas.ferm === nFerm && fichas.lup === nLup && fichas.alcas === 0 && fichas.passos === 0 && fichas.quando === 0,
    `clean: malte e lúpulo em ficha, sem alça, sem ± e sem o seletor de etapa na linha (${fichas.ferm} + ${fichas.lup})`);
  verificar(fichas.alturas.every((h) => h <= 64), `clean: cada linha da ficha com até 64 px (${fichas.alturas.join(", ")} px)`);
  const decoracao = await cel.evaluate(() => {
    const sec = document.querySelector('[data-secao="fermentaveis"]');
    return { fundo: getComputedStyle(sec).backgroundImage, espuma: getComputedStyle(sec, "::after").content, icone: document.querySelector(".editor-corpo .titulo-icone")?.checkVisibility() ?? false };
  });
  verificar(decoracao.fundo === "none" && decoracao.espuma === "none" && decoracao.icone === false, "clean: seções sem papel de parede, sem espuma e sem ícone em círculo");
  // Ícone mínimo no título de cada seção, no lugar do traço (25/11/2026, pedido do responsável); nome em 14 px.
  const titulosClean = await cel.evaluate(() => [...document.querySelectorAll(".editor-corpo > .cartao > .titulo-linha > h3.titulo-secao")].map((h) => {
    const i = h.querySelector(".titulo-icone-min svg"); const b = i?.getBoundingClientRect();
    return { secao: h.closest(".cartao").dataset.secao, visivel: !!i?.checkVisibility(), lado: b ? Math.round(b.width) : 0,
      traco: getComputedStyle(h, "::before").content, fonte: parseFloat(getComputedStyle(h).fontSize) };
  }));
  const titulosRuins = titulosClean.filter((t) => !t.visivel || t.lado < 16 || t.lado > 20 || t.traco !== "none" || t.fonte !== 14);
  verificar(titulosClean.length >= 9 && titulosRuins.length === 0,
    `clean: ícone mínimo (16-20 px) no título das ${titulosClean.length} seções, sem o traço, nome em 14 px${titulosRuins.length ? ": " + JSON.stringify(titulosRuins) : ""}`);
  const subLup = await cel.textContent('[data-secao="lupulos"] li.ing.ficha .ing-sub');
  verificar(/^Fervura \d+ min/.test(subLup), `clean: o lúpulo diz quando entra na própria linha (“${subLup}”)`);
  // K2: números num cartão no topo (no fluxo, com o copo); ao rolar, linha fina no rodapé; de volta ao topo, cartão.
  const estadoVital = () => cel.evaluate(() => {
    const v = document.querySelector(".vital"); const b = v.getBoundingClientRect();
    return { pos: getComputedStyle(v).position, flut: v.classList.contains("flutuante"), copo: v.querySelector(".vital-copo").checkVisibility(),
      topo: Math.round(b.top), fundo: Math.round(innerHeight - b.bottom), altura: Math.round(b.height),
      vaga: Math.round(document.querySelector(".vital-vaga").getBoundingClientRect().height) };
  });
  await cel.evaluate(() => window.scrollTo(0, 0));
  await cel.waitForTimeout(200);
  const noTopo = await estadoVital();
  // Desde 26/11/2026 o cartão é uma lista (um número abaixo do outro, como no Brewfather): o copo sai do cartão e volta
  // ao lado da barra do grist.
  verificar(noTopo.pos === "static" && !noTopo.flut && !noTopo.copo && noTopo.topo < 420,
    `clean K2: números num cartão no topo da receita (topo em ${noTopo.topo} px, ${noTopo.altura} px de altura)`);
  const listaClean = await conferirListaVital(cel);
  const gristCopo = await cel.evaluate(() => document.querySelector(".grist-copo")?.checkVisibility() ?? false);
  verificar(listaClean === "" && gristCopo, `clean: números um abaixo do outro, com os limites do estilo, e o copo ao lado do grist${listaClean ? ": " + listaClean : ""}`);
  await cel.screenshot({ path: `${SAIDA}/p7e-clean-numeros-topo.png` });
  await cel.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await cel.waitForTimeout(300);
  const rolado = await estadoVital();
  verificar(rolado.pos === "fixed" && rolado.flut && rolado.fundo === 0 && rolado.altura <= 64 && !rolado.copo && rolado.vaga === noTopo.altura,
    `clean K2: ao rolar, linha fina presa no rodapé (${rolado.altura} px) e a página não pula (vaga de ${rolado.vaga} px)`);
  await cel.screenshot({ path: `${SAIDA}/p7f-clean-rolado.png` });
  await cel.evaluate(() => window.scrollTo(0, 0));
  await cel.waitForTimeout(300);
  verificar((await estadoVital()).pos === "static", "clean K2: de volta ao topo, a linha fina volta a ser o cartão");
  // K1: cabeçalho enxuto (sem botões na página; números logo abaixo) e menu ⋯.
  const cab = await cel.evaluate(() => ({
    acoes: document.querySelector(".acoes-receita").checkVisibility(),
    relatorio: document.querySelectorAll(".editor-topo .botao-relatorio").length,
    geral: document.querySelectorAll('.editor-corpo [data-secao="geral"]').length,
    semTitulo: document.querySelector(".barra-app").classList.contains("sem-titulo"),
    parametros: document.querySelector(".editor-corpo > .cartao")?.dataset.secao,
  }));
  verificar(!cab.acoes && cab.relatorio === 0 && cab.geral === 0 && cab.semTitulo && noTopo.topo <= 250 && cab.parametros === "parametros",
    `clean K1: sem botões de texto no topo, Dados gerais fora da página, nome só no título, Parâmetros 1º cartão e números a ${noTopo.topo} px do topo`);
  await tocar('[data-secao="parametros"] button.param-todos');
  await cel.waitForSelector("dialog.parametros-janela[open]");
  verificar(/Pré-fervura/.test(await cel.textContent("dialog.parametros-janela .parametros-numeros")) && await cel.locator(".painel-lote").count() === 0,
    "clean: sem painel lateral; Mais números, Volumes e Água dentro da janela dos Parâmetros");
  await tocar("dialog.parametros-janela .item-pronto");
  await cel.waitForSelector("dialog.parametros-janela", { state: "detached" });
  await cel.evaluate(() => window.scrollTo(0, 600));
  await cel.waitForTimeout(250);
  verificar(!(await cel.evaluate(() => document.querySelector(".barra-app").classList.contains("sem-titulo"))), "clean K1: ao rolar, o nome aparece na barra do app");
  await cel.evaluate(() => window.scrollTo(0, 0));
  await cel.waitForTimeout(250);
  // Ações ao lado do nome (o menu ⋯ saiu, 26/11/2026) e lote com a data ao lado, em letra maior.
  const acoesTopo = await cel.evaluate(() => {
    const nome = document.querySelector(".topo-clean .titulo-receita").getBoundingClientRect();
    const bs = [...document.querySelectorAll(".topo-clean .nome-acoes button")];
    const meta = document.querySelector(".topo-clean button.topo-meta");
    return {
      rotulos: bs.map((b) => b.getAttribute("aria-label")),
      aoLado: bs.every((b) => { const x = b.getBoundingClientRect(); return x.left >= nome.right - 1 && x.top < nome.bottom && x.bottom > nome.top && x.right <= innerWidth; }),
      toque: bs.every((b) => b.getBoundingClientRect().height >= 44),
      menu: document.querySelectorAll(".barra-app .app-menu, dialog.menu-receita").length,
      meta: meta.textContent, metaFonte: parseFloat(getComputedStyle(meta).fontSize),
    };
  });
  verificar(acoesTopo.rotulos.join("|") === "Relatório (PDF)|Nova a partir desta|Informações (tipo, autor, pública)|Excluir receita"
    && acoesTopo.aoLado && acoesTopo.toque && acoesTopo.menu === 0,
    `clean: Relatório, Nova, Informações e Excluir ao lado do nome, sem menu ⋯ (${acoesTopo.rotulos.join(", ")})`);
  verificar(/^Lote nº \d+·(\d\d\/\d\d\/\d{4}|sem data)$/.test(acoesTopo.meta) && acoesTopo.metaFonte >= 16,
    `clean: lote com a data da brassagem ao lado, letra de ${acoesTopo.metaFonte} px (“${acoesTopo.meta}”)`);
  await cel.screenshot({ path: `${SAIDA}/p7g-clean-acoes-nome.png` });
  await tocar(".topo-clean button.topo-meta");
  await cel.waitForSelector("dialog.lote-janela[open]");
  verificar(await cel.isVisible('dialog.lote-janela input[aria-label="Data da brassagem"]'), "clean: tocar no lote abre a janela da brassagem (com a data)");
  await tocar("dialog.lote-janela .item-pronto");
  await cel.waitForSelector("dialog.lote-janela", { state: "detached" });
  await tocar('.nome-acoes button[aria-label^="Informações"]');
  await cel.waitForSelector("dialog.informacoes[open]");
  verificar(await cel.isVisible('dialog.informacoes select[aria-label="Tipo"]') && await cel.isVisible('dialog.informacoes input[aria-label="Autor"]'),
    "clean K1: Informações abre tipo, autor e pública numa janela");
  await tocar("dialog.informacoes .item-pronto");
  await cel.waitForSelector("dialog.informacoes", { state: "detached" });
  await tocar('.nome-acoes button[aria-label="Relatório (PDF)"]');
  await cel.waitForSelector("dialog.relatorio[open]");
  verificar(true, "clean: o ícone do relatório ao lado do nome abre o relatório");
  await cel.keyboard.press("Escape");
  await cel.waitForSelector("dialog.relatorio", { state: "detached" });
  // K4: leveduras, outros, mostura e fermentação em ficha; tocar abre a janela com os campos; + abre o passo novo.
  const passosFicha = await cel.evaluate(() => Object.fromEntries(["leveduras", "outros", "mostura", "fermentacao"].map((k) => [k, {
    linhas: document.querySelectorAll(`[data-secao="${k}"] li.ing.ficha`).length,
    tabela: document.querySelectorAll(`[data-secao="${k}"] table`).length,
    alturas: [...document.querySelectorAll(`[data-secao="${k}"] li.ing.ficha`)].map((l) => Math.round(l.getBoundingClientRect().height)),
  }])));
  const nPassos = (t) => db[t].filter((x) => x.receita_id === idPils).length;
  verificar(Object.values(passosFicha).every((x) => x.tabela === 0 && x.alturas.every((h) => h <= 64))
    && passosFicha.mostura.linhas === nPassos("receita_mostura_passos") && passosFicha.leveduras.linhas === nPassos("receita_leveduras"),
    `clean K4: passos, levedura e outros em linhas de até 64 px, sem tabela (${Object.entries(passosFicha).map(([k, x]) => `${k} ${x.linhas}`).join(", ")})`);
  const linhaMostura = await cel.textContent('[data-secao="mostura"] li.ing.ficha.passo');
  verificar(/Rampa 1.*°C.*min/.test(linhaMostura), `clean K4: passo da mostura numa linha (“${linhaMostura}”)`);
  await tocar('[data-secao="mostura"] li.ing.ficha.passo button.ing-nome');
  await cel.waitForSelector("dialog.passo-janela[open]");
  verificar(await cel.isVisible('dialog.passo-janela select[aria-label="Passo da mostura"]') && await cel.isVisible('dialog.passo-janela input[aria-label="Temp. (°C)"]'),
    "clean K4: tocar no passo abre a janela com tipo, temperatura e tempo");
  await tocar('dialog.passo-janela input[aria-label="Temp. (°C)"]');
  await cel.waitForSelector("dialog.passo-janela .roleta");
  await cel.waitForTimeout(250);
  verificar(await cel.evaluate(() => document.querySelector(".roleta").matches(":popover-open")), "clean K4: a temperatura do passo usa a roleta, por cima da janela");
  await cel.screenshot({ path: `${SAIDA}/p7h-clean-passo-roleta.png` });
  await tocar(".roleta-cancelar");
  await tocar("dialog.passo-janela .item-pronto");
  await cel.waitForSelector("dialog.passo-janela", { state: "detached" });
  const nMosturaAntes = await cel.locator('[data-secao="mostura"] li.ing.ficha.passo').count();
  await tocar('[data-secao="mostura"] button.adicionar');
  await cel.waitForSelector("dialog.passo-janela[open]");
  verificar(await cel.locator('[data-secao="mostura"] li.ing.ficha.passo').count() === nMosturaAntes + 1, "clean K4: + na mostura cria o passo e abre a janela dele");
  await tocar("dialog.passo-janela button.perigo");
  await cel.waitForSelector("dialog.passo-janela", { state: "detached" });
  verificar(await cel.locator('[data-secao="mostura"] li.ing.ficha.passo').count() === nMosturaAntes, "clean K4: Remover na janela tira o passo");
  await cel.locator('[data-secao="leveduras"]').evaluate((n) => n.scrollIntoView({ block: "start" }));
  await cel.evaluate(() => window.scrollBy(0, -60));
  await cel.waitForTimeout(200);
  await cel.screenshot({ path: `${SAIDA}/p7i-clean-passos.png` });
  // K5: Notas em resumo; tocar abre a seção inteira numa janela; o painel lateral vai para os Parâmetros.
  const resumosK5 = await cel.evaluate(() => Object.fromEntries(["notas"].map((k) => {
    const sec = document.querySelector(`.editor-corpo > [data-secao="${k}"]`);
    const linhas = [...(sec?.querySelectorAll("li.ing") ?? [])].map((l) => Math.round(l.getBoundingClientRect().height));
    return [k, { resumida: sec?.classList.contains("resumida"), linhas, texto: sec?.textContent ?? "", campos: sec?.querySelectorAll("input, select, textarea").length }];
  })));
  verificar(Object.values(resumosK5).every((x) => x.resumida && x.campos === 0 && x.linhas.length >= 1 && x.linhas.length <= 3 && x.linhas.every((h) => h <= 80)),
    `clean K5: Notas em resumo, sem campos (${Object.entries(resumosK5).map(([k, x]) => `${k}: ${x.linhas.join("+")} px`).join("; ")})`);
  // Água no molde dos fermentáveis (25/11/2026): base/alvo numa linha, dois blocos separados (mostura com o pH,
  // lavagem), uma ficha por sal/ácido e, abaixo da lavagem, a tabela curta da concentração final.
  const aguaClean = () => cel.evaluate(() => {
    const sec = document.querySelector('.editor-corpo > [data-secao="agua"]');
    const bloco = (k) => sec.querySelector(`.agua-bloco.${k}`);
    const caixa = (n) => { const b = n.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) }; };
    const linhas = (k) => [...bloco(k).querySelectorAll("li.ing.ficha")].map((l) => ({
      nome: l.querySelector(".ing-nome-txt").textContent, sub: l.querySelector(".ing-sub").textContent,
      qtd: l.querySelector("input.qtd").value, extra: l.querySelector(".ficha-valor2")?.textContent ?? "", h: Math.round(l.getBoundingClientRect().height) }));
    const total = sec.querySelector(".agua-total");
    return {
      resumida: sec.classList.contains("resumida"),
      perfis: sec.querySelector(".agua-perfis-linha").textContent,
      mostura: linhas("mostura"), lavagem: linhas("lavagem"),
      cxMostura: caixa(bloco("mostura")), cxLavagem: caixa(bloco("lavagem")), cxTotal: caixa(total),
      cores: [getComputedStyle(bloco("mostura")).borderLeftColor, getComputedStyle(bloco("lavagem")).borderLeftColor],
      litros: [bloco("mostura").querySelector(".agua-bloco-litros input").placeholder || bloco("mostura").querySelector(".agua-bloco-litros input").value,
        bloco("lavagem").querySelector(".agua-bloco-litros input").placeholder || bloco("lavagem").querySelector(".agua-bloco-litros input").value],
      ph: bloco("mostura").querySelector(".ph-cartao:not([hidden]) .ph-escala") ? bloco("mostura").querySelector(".ph-valor").textContent : null,
      phNaLavagem: !!bloco("lavagem").querySelector(".ph-cartao"),
      colunas: [...total.querySelectorAll("thead th")].map((th) => th.textContent),
      linhasTotal: [...total.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map((c) => c.textContent)),
      indices: total.querySelector(".agua-total-indices")?.textContent ?? "",
      cabe: total.querySelector("table").scrollWidth <= total.querySelector("table").clientWidth + 1,
      tituloTotal: sec.querySelector(".titulo-linha .total-secao").textContent,
    };
  });
  const ag = await aguaClean();
  verificar(!ag.resumida && /^Base: .+Alvo: Alvo IPA/.test(ag.perfis), `clean água: seção própria (não é resumo), base e alvo numa linha (“${ag.perfis}”)`);
  verificar(ag.mostura.length === 2 && ag.mostura[0].nome === "Sulfato de cálcio" && ag.mostura[1].nome === "Ácido lático 88%" && /^pH −?-?0,\d\d$/.test(ag.mostura[1].sub) && ag.mostura[0].qtd === "6,0" && /^\+\d+ Ca · \+\d+ SO₄ ppm$/.test(ag.mostura[0].sub) && /g\/L$/.test(ag.mostura[0].extra)
    && ag.lavagem.length === 1 && ag.lavagem[0].nome === "Cloreto de cálcio" && /Ca · \+\d+ Cl ppm/.test(ag.lavagem[0].sub),
    `clean água: uma ficha por sal e ácido, cada um na sua água, com o que põe na água (sal: ppm e g/L; ácido: pH) (${JSON.stringify([...ag.mostura, ...ag.lavagem].map((x) => [x.nome, x.qtd, x.sub, x.extra]))})`);
  verificar([...ag.mostura, ...ag.lavagem].every((x) => x.h <= 64), `clean água: linhas com até 64 px (${[...ag.mostura, ...ag.lavagem].map((x) => x.h).join(", ")} px)`);
  verificar(ag.cxLavagem.top > ag.cxMostura.bottom && ag.cxTotal.top > ag.cxLavagem.bottom && ag.cores[0] !== ag.cores[1] && ag.litros.every((x) => /^\d+,\d$/.test(x)),
    `clean água: mostura e lavagem em blocos separados, de cor própria e com os litros no topo; total abaixo da lavagem (${JSON.stringify(ag.cores)})`);
  verificar(/^5,\d\d$/.test(ag.ph ?? "") && !ag.phNaLavagem, `clean água: pH com a escala dentro do bloco da mostura (${ag.ph})`);
  verificar(ag.colunas.join(" ") === "ppm Ca Mg Na SO₄ Cl HCO₃" && ag.linhasTotal.length === 2 && ag.linhasTotal[0][0] === "Total" && ag.linhasTotal[1][0] === "Alvo"
    && ag.linhasTotal.every((l) => l.length === 7 && l.slice(1).every((x) => /^\d+$/.test(x))) && /SO₄\/Cl \d+,\d\d/.test(ag.indices) && /Alc\. residual -?−?\d+ ppm/.test(ag.indices),
    `clean água: tabela da concentração final com os 6 íons do total e o alvo, SO₄/Cl e alcalinidade residual (${JSON.stringify(ag.linhasTotal)}; ${ag.indices})`);
  verificar(/^\d+,\d L$/.test(ag.tituloTotal), `clean água: total de água no título (${ag.tituloTotal})`);
  await cel.locator('.editor-corpo > [data-secao="agua"]').evaluate((n) => n.scrollIntoView({ block: "start" }));
  await cel.evaluate(() => window.scrollBy(0, -60));
  await cel.waitForTimeout(200);
  await cel.screenshot({ path: `${SAIDA}/p7j-clean-agua.png` });
  await cel.locator('.editor-corpo > [data-secao="agua"] .agua-total').evaluate((n) => n.scrollIntoView({ block: "end" }));
  await cel.evaluate(() => window.scrollBy(0, 60));
  await cel.waitForTimeout(150);
  await cel.screenshot({ path: `${SAIDA}/p7j2-clean-agua-total.png` });
  await conferirLateral("clean, água 390 px");
  // Perfil completo: a tabela de sempre numa janela; a coluna Total bate com a tabela curta.
  await tocar('.editor-corpo > [data-secao="agua"] .agua-total button.agua-link');
  await cel.waitForSelector("dialog.agua-perfil-janela[open] table.perfil-agua");
  const totalCompleto = await cel.$$eval("dialog.agua-perfil-janela table.perfil-agua > tbody:first-of-type tr", (trs) => trs.map((tr) => tr.children[4].textContent));
  verificar(JSON.stringify(totalCompleto) === JSON.stringify(ag.linhasTotal[0].slice(1)), `clean água: "Perfil completo" abre a tabela de sempre e o Total bate (${totalCompleto.join(" ")})`);
  await tocar("dialog.agua-perfil-janela .item-pronto");
  await cel.waitForSelector("dialog.agua-perfil-janela", { state: "detached" });
  // Tocar na quantidade do gesso = roleta direto (sem janela); Cancelar volta.
  await tocar('.agua-bloco.mostura li.ing.ficha input.qtd');
  await cel.waitForSelector(".roleta");
  await cel.waitForTimeout(350);
  const rolSal = { janela: await cel.locator("dialog.item-janela").count(), valor: await cel.textContent(".roleta-valor") };
  verificar(rolSal.janela === 0 && /^6,0/.test(rolSal.valor),
    `clean água: tocar na quantidade do sal abre a roleta direto, no valor atual (${JSON.stringify(rolSal)})`);
  await tocar(".roleta-cancelar");
  await cel.waitForSelector(".roleta", { state: "detached" });
  // "+" da lavagem: só sais (a lavagem não leva ácido); escolher abre a janela já na roleta; OK + Pronto = ficha nova.
  await tocar('.agua-bloco.lavagem button.adicionar');
  await cel.waitForSelector("dialog.agua-escolha[open]");
  const opcoesLavagem = await cel.$$eval("dialog.agua-escolha button.agua-opcao strong", (ns) => ns.map((n) => n.textContent));
  verificar(opcoesLavagem.length === 6 && !opcoesLavagem.some((x) => /Ácido/.test(x)), `clean água: + da lavagem oferece só os 6 sais (${opcoesLavagem.join(", ")})`);
  await cel.screenshot({ path: `${SAIDA}/p7k-clean-agua-adicionar.png` });
  await tocar("dialog.agua-escolha button.agua-opcao:has-text('Sal amargo')");
  await cel.waitForSelector("dialog.agua-item-janela[open] .roleta");
  await cel.waitForTimeout(350);
  await cel.screenshot({ path: `${SAIDA}/p7k2-clean-agua-sal-roleta.png` });
  await tocar(".roleta-ok");
  await cel.waitForSelector(".roleta", { state: "detached" });
  const efeitoSal = await cel.textContent("dialog.agua-item-janela .agua-efeito");
  verificar(/Nesta água \(\d+,\d L\): \+\d+ Mg · \+\d+ SO₄ ppm/.test(efeitoSal), `clean água: a janela do sal mostra o que ele põe na água (“${efeitoSal}”)`);
  await tocar("dialog.agua-item-janela .item-pronto");
  await cel.waitForSelector("dialog.agua-item-janela", { state: "detached" });
  const depoisAdd = await aguaClean();
  verificar(depoisAdd.lavagem.length === 2 && depoisAdd.lavagem[1].nome === "Sal amargo" && /^\d+,\d$/.test(depoisAdd.lavagem[1].qtd) && depoisAdd.mostura.length === ag.mostura.length
    && depoisAdd.linhasTotal[0][2] !== ag.linhasTotal[0][2],
    `clean água: o sal novo entra na lavagem e o Mg do total muda (${ag.linhasTotal[0][2]} → ${depoisAdd.linhasTotal[0][2]})`);
  // "+" da mostura: sais e ácidos; o ácido entra na mostura com o efeito no pH.
  await tocar('.agua-bloco.mostura button.adicionar');
  await cel.waitForSelector("dialog.agua-escolha[open]");
  verificar(await cel.locator("dialog.agua-escolha button.agua-opcao").count() === 9, "clean água: + da mostura oferece os 6 sais e os 3 ácidos");
  await tocar("dialog.agua-escolha button.agua-opcao:has-text('Ácido lático 88%')");
  await cel.waitForSelector(".roleta");
  await cel.waitForTimeout(350);
  await tocar(".roleta-ok");
  await cel.waitForSelector(".roleta", { state: "detached" });
  await tocar("dialog.agua-item-janela .item-pronto");
  await cel.waitForSelector("dialog.agua-item-janela", { state: "detached" });
  const comAcido = await aguaClean();
  const acido = comAcido.mostura.at(-1);
  verificar(comAcido.mostura.length === ag.mostura.length + 1 && acido.nome === "Ácido lático 88%" && /^pH −?-?0,\d\d$/.test(acido.sub) && comAcido.ph !== ag.ph, `clean água: ácido na mostura com o efeito no pH (“${acido?.sub}”; pH ${ag.ph} → ${comAcido.ph})`);
  // Remover pela janela do item (tocar no nome).
  await tocar(".agua-bloco.lavagem li.ing.ficha:has-text('Sal amargo') button.ing-nome");
  await cel.waitForSelector("dialog.agua-item-janela[open]");
  await tocar("dialog.agua-item-janela button.perigo");
  await cel.waitForSelector("dialog.agua-item-janela", { state: "detached" });
  verificar((await aguaClean()).lavagem.length === 1, "clean água: Remover na janela tira o sal");
  await tocar(".barra-app .app-desfazer");
  await cel.waitForTimeout(250);
  verificar((await aguaClean()).lavagem.length === 2, "clean água: ↶ volta o sal removido");
  // 320 px: tabela do total cabe, nada passa da borda.
  await cel.setViewportSize({ width: 320, height: 640 });
  await cel.waitForTimeout(250);
  const ag320 = await aguaClean();
  verificar(ag320.cabe && [...ag320.mostura, ...ag320.lavagem].every((x) => x.h <= 80), `clean água 320 px: tabela do total cabe e linhas de até 2 linhas de texto (${[...ag320.mostura, ...ag320.lavagem].map((x) => x.h).join(", ")} px)`);
  await cel.locator('.editor-corpo > [data-secao="agua"]').evaluate((n) => n.scrollIntoView({ block: "start" }));
  await cel.evaluate(() => window.scrollBy(0, -60));
  await cel.waitForTimeout(200);
  await cel.screenshot({ path: `${SAIDA}/p7k3-clean-agua-320.png` });
  await conferirLateral("clean, água 320 px");
  await cel.setViewportSize({ width: 390, height: 844 });
  await cel.waitForTimeout(250);
  const loteClean = await cel.evaluate(() => {
    const sec = document.querySelector('.editor-corpo > [data-secao="brassagem"]');
    return { cartao: sec?.classList.contains("parametros"), numeros: [...sec.querySelectorAll(".param-resumo input")].map((n) => n.value), texto: sec.textContent };
  });
  verificar(loteClean.cartao && loteClean.numeros[0] === "1,048" && /Priming \d+ g/.test(loteClean.texto),
    `clean: Brassagem no cartão dos Parâmetros, com a OG medida e o priming (${JSON.stringify(loteClean.numeros)})`);
  await tocar('.editor-corpo > [data-secao="brassagem"] button.param-todos');
  await cel.waitForSelector("dialog.lote-janela[open]");
  verificar(await cel.isVisible('dialog.lote-janela input[aria-label="OG medida"]') && /Eficiência real/.test(await cel.textContent("dialog.lote-janela .parametros-numeros")),
    "clean: Todos da Brassagem abre os campos e o que foi medido (sem painel lateral)");
  await tocar("dialog.lote-janela .item-fechar");
  await cel.waitForSelector("dialog.lote-janela", { state: "detached" });
  await tocar('.editor-corpo > [data-secao="notas"] button.ing-nome');
  await cel.waitForSelector('dialog.resumo-janela[data-secao="notas"][open]');
  await cel.fill('dialog.resumo-janela textarea[aria-label="Notas"]', "Moagem 1,1 mm. Dry hop no 3º dia.");
  await tocar("dialog.resumo-janela .item-pronto");
  await cel.waitForSelector("dialog.resumo-janela", { state: "detached" });
  verificar((await cel.textContent('.editor-corpo > [data-secao="notas"]')).includes("Moagem 1,1 mm. Dry hop no 3º dia."),
    "clean K5: nota escrita na janela aparece no resumo");
  await cel.screenshot({ path: `${SAIDA}/p7a-clean-receita.png` });
  const levClean = await cel.evaluate(() => {
    const li = document.querySelector('[data-secao="leveduras"] li.ing.ficha');
    li?.scrollIntoView({ block: "center" });
    return li ? { campos: li.querySelectorAll("input, select").length, alca: !!li.querySelector(".ing-alca"), qtd: li.querySelector(".ing-fixo-qtd")?.textContent } : null;
  });
  verificar(levClean && levClean.campos === 0 && !levClean.alca && levClean.qtd === "1 pacote", `clean: levedura em ficha só com valores fixos (${JSON.stringify(levClean)})`);
  await cel.screenshot({ path: `${SAIDA}/p7e-clean-levedura.png` });
  // Tocar na quantidade = roleta direto (sem abrir a janela); a OG acompanha e Cancelar volta.
  const qtdFicha = '[data-secao="fermentaveis"] li.ing.ficha input.qtd';
  const qtdFichaAntes = await cel.inputValue(qtdFicha);
  await tocar(qtdFicha);
  await cel.waitForSelector(".roleta");
  await cel.waitForTimeout(250);           // a roleta sobe em 0,18 s
  verificar(await cel.locator("dialog.item-janela").count() === 0 && (await cel.textContent(".roleta-valor")).startsWith(qtdFichaAntes),
    "clean: tocar na quantidade abre a roleta direto, no valor atual");
  const campoAcima = await cel.evaluate((sel) => document.querySelector(sel).getBoundingClientRect().bottom <= document.querySelector(".roleta").getBoundingClientRect().top, qtdFicha);
  verificar(campoAcima, "clean: a linha do malte fica à vista acima da roleta");
  await cel.screenshot({ path: `${SAIDA}/p7b-clean-roleta.png` });
  await tocar(".roleta-cancelar");
  await cel.waitForSelector(".roleta", { state: "detached" });
  verificar(await cel.inputValue(qtdFicha) === qtdFichaAntes, "clean: Cancelar volta a quantidade");
  // Tocar no nome = janela do item (com o ± e o resto dos campos).
  await tocar('[data-secao="lupulos"] li.ing.ficha button.ing-nome');
  await cel.waitForSelector("dialog.item-janela[open]");
  verificar(await cel.locator("dialog.item-janela button.passo").count() === 2 && await cel.isVisible("dialog.item-janela select.etapa"),
    "clean: tocar no nome abre a janela do item, com ± e a etapa");
  await tocar("dialog.item-janela .item-fechar");
  await cel.waitForSelector("dialog.item-janela", { state: "detached" });
  await conferirLateral("clean, 390 px, receita");
  await cel.setViewportSize({ width: 320, height: 568 });
  await cel.waitForTimeout(200);
  await conferirLateral("clean, 320 px, receita");
  verificar(await cel.evaluate(() => [...document.querySelectorAll(".vital .vital-item")].every((n) => {
    const b = n.getBoundingClientRect(); return [...n.querySelectorAll(".vital-rot")].every((x) => x.getBoundingClientRect().right <= b.right + 1);
  })), "clean, 320 px: rótulos do cartão dos números cabem no espaço de cada número");
  await cel.evaluate(() => window.scrollTo(0, 0));
  await cel.waitForTimeout(300);
  const lista320 = await conferirListaVital(cel);
  verificar(lista320 === "", `clean, 320 px: números um abaixo do outro, limites do estilo sem sobrepor${lista320 ? ": " + lista320 : ""}`);
  await cel.screenshot({ path: `${SAIDA}/p7e2-clean-numeros-320.png` });
  await cel.locator('[data-secao="fermentaveis"]').evaluate((n) => n.scrollIntoView({ block: "start" }));
  await cel.screenshot({ path: `${SAIDA}/p7c-clean-320.png` });
  // Nome longo em 320 px (36 letras, mais que 90% das receitas): até 3 linhas ao lado dos 4 ícones, sem cortar.
  await cel.evaluate(() => window.scrollTo(0, 0));
  const nomeAntes = await cel.inputValue(".topo-clean .titulo-receita");
  await cel.fill(".topo-clean .titulo-receita", "American IPA com Citra e Mosaic 2026");
  await cel.waitForTimeout(150);
  const nomeLongo = await cel.evaluate(() => {
    const t = document.querySelector(".topo-clean .titulo-receita"), b = t.getBoundingClientRect();
    const ic = [...document.querySelectorAll(".nome-acoes button")].map((x) => x.getBoundingClientRect());
    return { linhas: Math.round(b.height / parseFloat(getComputedStyle(t).lineHeight)), cabe: t.scrollHeight <= t.clientHeight + 1,
      separado: ic.every((x) => x.left >= b.right - 1 && x.right <= innerWidth) };
  });
  await cel.screenshot({ path: `${SAIDA}/p7c2-clean-320-nome-longo.png` });
  verificar(nomeLongo.linhas >= 2 && nomeLongo.linhas <= 3 && nomeLongo.cabe && nomeLongo.separado,
    `clean, 320 px: nome longo quebra em ${nomeLongo.linhas} linhas ao lado dos ícones, sem cortar`);
  await cel.fill(".topo-clean .titulo-receita", nomeAntes);
  // Estilo em destaque (27/11/2026): cartão com a faixa de cor e o nome, sem código e sem contagem, em 320 e 390 px.
  for (const largura of [320, 390]) {
    await cel.setViewportSize({ width: largura, height: 844 });
    await cel.evaluate(() => window.scrollTo(0, 0));
    await cel.waitForTimeout(200);
    const e = await cel.evaluate(() => {
      const b = document.querySelector(".topo-clean button.estilo-botao"), r = b.getBoundingClientRect();
      const nm = document.querySelector(".topo-clean .titulo-receita").getBoundingClientRect();
      return { alt: r.height, cabe: r.left >= 0 && r.right <= innerWidth, abaixoDoNome: r.top >= nm.bottom,
        texto: b.textContent.trim(), semExtra: !b.querySelector(".estilo-codigo, .estilo-encaixe"),
        letraNome: parseFloat(getComputedStyle(b.querySelector(".estilo-nome")).fontSize),
        letraTitulo: parseFloat(getComputedStyle(document.querySelector(".topo-clean .titulo-receita")).fontSize),
        faixaCor: getComputedStyle(b.querySelector(".estilo-cor")).backgroundImage.includes("gradient") };
    });
    verificar(e.alt >= 44 && e.cabe && e.abaixoDoNome && e.texto === "German Pils›" && e.semExtra
      && e.letraNome >= 17 && e.letraNome < e.letraTitulo && e.faixaCor,
      `clean, ${largura} px: estilo em cartão só com faixa de cor e nome (${Math.round(e.alt)} px, nome ${e.letraNome} px, sem código e sem contagem)`);
    await cel.screenshot({ path: `${SAIDA}/p7m-clean-estilo-${largura}.png`, clip: { x: 0, y: 0, width: largura, height: 330 } });
  }
  await cel.setViewportSize({ width: 1366, height: 900 });
  await cel.waitForTimeout(200);
  const computador = await cel.evaluate(() => ({ sobra: document.documentElement.scrollWidth - innerWidth,
    alturas: [...document.querySelectorAll("li.ing.ficha")].map((l) => Math.round(l.getBoundingClientRect().height)) }));
  verificar(computador.sobra <= 1 && computador.alturas.every((h) => h <= 64), `clean, 1366 px: não quebra (linhas de ${computador.alturas.join(", ")} px)`);
  await cel.setViewportSize({ width: 390, height: 844 });
  await cel.evaluate(() => window.GaliaTema.aplicar("adega"));
  // A volta de 1366 para 390 px pode deixar a gaveta do menu aberta (só neste roteiro): fecha antes da captura.
  await cel.evaluate(() => document.querySelector(".menu-aberto")?.classList.remove("menu-aberto"));
  await cel.evaluate(() => window.scrollTo(0, 0));
  await cel.waitForTimeout(250);
  await cel.screenshot({ path: `${SAIDA}/p7d-clean-escuro.png` });
  await cel.evaluate(() => window.scrollTo(0, 900));
  await cel.waitForTimeout(250);
  await cel.screenshot({ path: `${SAIDA}/p7l-clean-escuro-rolado.png` });
  // K6: contraste do Clean em todos os temas (WCAG): texto ≥ 7, secundário/estados/"+" ≥ 4,5, ícone do título ≥ 3.
  const temasClean = await cel.evaluate(() => window.GaliaTema.lista.map((t) => t.id).filter((id) => id !== "auto"));
  const ruins = [];
  for (const t of temasClean) {
    await cel.evaluate((id) => window.GaliaTema.aplicar(id), t);
    const c = await cel.evaluate(() => {
      const parse = (x) => {
        let m = x.match(/rgba?\(([^)]+)\)/);
        if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; }
        m = x.match(/color\(srgb ([^)]+)\)/);
        if (m) { const p = m[1].split(/[\s/]+/).filter(Boolean).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] ?? 1]; }
        return null;
      };
      const sobre = (a, b) => [0, 1, 2].map((i) => a[i] * a[3] + b[i] * (1 - a[3])).concat(1);
      const lum = (k) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(k[0]) + 0.7152 * f(k[1]) + 0.0722 * f(k[2]); };
      const razao = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100; };
      const sec = document.querySelector('.editor-corpo [data-secao="fermentaveis"]');
      const sonda = document.createElement("span");
      sec.append(sonda);
      const cor = (v) => { sonda.style.color = `var(${v})`; return parse(getComputedStyle(sonda).color); };
      const cartao = parse(getComputedStyle(sec).backgroundColor);
      const pagina = sobre(parse(getComputedStyle(document.body).backgroundColor), [255, 255, 255, 1]);
      const mais = getComputedStyle(sec.querySelector("button.adicionar"));
      const icone = parse(getComputedStyle(sec.querySelector(".titulo-icone-min")).color);
      const r = {
        texto: razao(cor("--tinta"), cartao), suave: razao(cor("--suave"), cartao), suave_pagina: razao(cor("--suave"), pagina),
        lupulo: razao(cor("--lupulo"), cartao), ambar: razao(cor("--ambar"), cartao), fora: razao(cor("--fora"), cartao),
        mais: razao(parse(mais.color), sobre(parse(mais.backgroundColor), cartao)), icone: razao(icone, cartao),
      };
      // cartão do estilo no topo (fundo = 9% do destaque sobre o cartão)
      const eb = document.querySelector("button.estilo-botao");
      const fundoE = sobre(parse(getComputedStyle(eb).backgroundColor), pagina);
      Object.assign(r, {
        estilo_nome: razao(parse(getComputedStyle(eb.querySelector(".estilo-nome")).color), fundoE),
        estilo_seta: razao(parse(getComputedStyle(eb.querySelector(".escolha-seta")).color), fundoE),
      });
      sonda.remove();
      return r;
    });
    const minimo = { texto: 7, icone: 3, estilo_nome: 7, estilo_seta: 3 };
    for (const [k, v] of Object.entries(c)) if (!(v >= (minimo[k] ?? 4.5))) ruins.push(`${t} ${k} ${v}`);
  }
  await cel.evaluate(() => window.GaliaTema.aplicar("auto"));
  verificar(ruins.length === 0, `clean K6: contraste nos ${temasClean.length} temas (texto ≥ 7; secundário, estados e “+” ≥ 4,5; ícone ≥ 3; cartão do estilo)${ruins.length ? ": " + ruins.join("; ") : ""}`);
  // Volta ao Completo para o resto do teste.
  await cel.evaluate(() => {
    window.GaliaTema.aplicar("auto"); window.GaliaTema.aplicarLayout("completo");
    const p = JSON.parse(localStorage.getItem("galiabrew.preferencias")); p.layout = "completo"; localStorage.setItem("galiabrew.preferencias", JSON.stringify(p));
  });

  // Excluir a receita leva as fotos dela junto.
  await cel.evaluate(() => { window.GaliaTema.aplicar("auto"); location.hash = "#/receitas"; });
  await cel.waitForSelector(".receita-cartao >> text=Pils da Galia");
  await tocar(".receita-cartao >> text=Pils da Galia");
  await cel.waitForSelector(".acoes-receita button.excluir-receita");
  await tocar(".acoes-receita button.excluir-receita");
  await cel.waitForSelector("dialog.confirmar[open]");
  await tocar("dialog.confirmar button.perigo");
  await cel.waitForSelector(".aviso >> text=Receita excluída");
  await cel.waitForTimeout(300);
  verificar(fotosGuardadas.size === 0 && !db.receitas.some((x) => x.id === idPils), "excluir a receita apaga também as fotos dela do Storage");
  await ctxCel.close();

  // O 400 é o da senha errada, testada de propósito (uma vez só).
  const esperados = erros.filter((e) => /status of 400/.test(e));
  const relevantes = erros.filter((e) => !/favicon/.test(e) && !/status of 400/.test(e));
  verificar(esperados.length === 1, "único erro de rede = o login com senha errada");
  console.log(ok.map((x) => `ok - ${x}`).join("\n"));
  console.log(relevantes.length ? `\nERROS NO CONSOLE:\n${relevantes.join("\n")}` : "\nsem erros no console (CSP ativa)");
  await navegador.close();
})().catch(async (e) => {
  console.log(ok.map((x) => `ok - ${x}`).join("\n"));
  if (erros.length) console.log(`\nERROS NO CONSOLE:\n${erros.join("\n")}`);
  console.error(e.message);
  process.exit(1);
});
