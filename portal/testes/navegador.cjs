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
  estilos: [{ id: "e1", dono: null, guia: "BJCP 2021", codigo: "5D", nome: "German Pils", og_min: 1.044, og_max: 1.050, fg_min: 1.008, fg_max: 1.013, ibu_min: 22, ibu_max: 40, cor_srm_min: 2, cor_srm_max: 4, abv_min_pct: 4.4, abv_max_pct: 5.2 }],
  fermentaveis: [{ id: "f-sis", dono: null, nome: "Pilsen (sistema)", tipo: "GRAO", rendimento_pct: 81, umidade_pct: 4, cor_srm: 1.8, fermentavel_pct: 100, precisa_mostura: true, produtor: "Agrária" }],
  lupulos: [], leveduras: [], outros: [], aguas: [], equipamentos: [], receitas: [],
  receita_fermentaveis: [], receita_lupulos: [], receita_leveduras: [], receita_outros: [], receita_mostura_passos: [], receita_fermentacao_passos: [],
};
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

const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json" };
async function site(rota) {
  const url = new URL(rota.request().url());
  let arq = decodeURIComponent(url.pathname);
  if (arq === "/") arq = "/index.html";
  const p = path.join(PORTAL, arq);
  if (!p.startsWith(PORTAL) || !fs.existsSync(p)) return rota.fulfill({ status: 404, body: "não achei" });
  return rota.fulfill({ status: 200, contentType: TIPOS[path.extname(p)] || "application/octet-stream", headers: { "content-security-policy": CSP }, body: fs.readFileSync(p) });
}

(async () => {
  const navegador = await chromium.launch();
  const ctx = await navegador.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 });
  const pagina = await ctx.newPage();
  const erros = [];
  pagina.on("console", (m) => { if (["error", "warning"].includes(m.type())) erros.push(`${m.type()}: ${m.text()}`); });
  pagina.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  await ctx.route(`${SB}/**`, supabaseSimulado);
  await ctx.route(`${ORIGEM}/**`, site);

  const ok = [];
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
  verificar(await pagina.isVisible("header >> text=Leo"), "login entra e mostra o nome do perfil");
  await pagina.screenshot({ path: `${SAIDA}/p1-receitas-vazia.png` });

  // Cadastro: equipamento e lúpulo
  await pagina.click("text=Cadastros");
  await pagina.waitForSelector("text=Pilsen (sistema)");
  verificar(await pagina.isVisible("td >> text=Sistema"), "catálogo do sistema aparece com selo");
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

  // Receita nova
  await pagina.click("text=Receitas");
  await pagina.click("text=Nova receita");
  await pagina.waitForSelector(".titulo-receita");
  verificar(await pagina.inputValue('input[aria-label="Volume no fermentador (L)"]') === "23,0", "equipamento único já preenche os parâmetros");
  await pagina.fill(".titulo-receita", "Pils da Galia");
  await pagina.selectOption('select[aria-label="Estilo"]', "e1");
  const adicionar = pagina.locator("select.adicionar");
  await adicionar.nth(0).selectOption("f-sis");
  await pagina.locator('input[aria-label="Qtd (kg)"]').first().fill("4,8");
  await adicionar.nth(1).selectOption(db.lupulos[0].id);
  await pagina.locator('input[aria-label="Qtd (g)"]').first().fill("60");
  await adicionar.nth(2).selectOption("__livre");
  await pagina.locator('table:near(h3:text("Leveduras")) input[aria-label="Nome"]').first().fill("W-34/70");
  await pagina.locator('input[aria-label="Atenuação %"]').first().fill("80");
  // Lote: data, OG medida digitada como 1048 (vira 1,048).
  await pagina.fill('input[aria-label="Data da brassagem"]', "2026-04-20");
  await pagina.fill('input[aria-label="OG medida"]', "1048");
  await pagina.fill('input[aria-label="CO₂ desejado (vol)"]', "2,5");
  await pagina.waitForTimeout(200);

  // Confere o painel com o calculos.js
  const esperado = await pagina.evaluate(async () => {
    const m = await import("./calculos.js?v=20261122f");
    return m.calcularReceita({
      volume_lote_l: 23, perda_panela_l: 2, eficiencia_pct: 72, fervura_min: 60, evaporacao_l_h: 3, absorcao_grao_l_kg: 1, relacao_agua_grao_l_kg: 3, perda_tina_l: 0,
      fermentaveis: [{ tipo: "GRAO", rendimento_pct: 81, umidade_pct: 4, cor_srm: 1.8, fermentavel_pct: 100, quantidade_kg: 4.8, etapa: "MOSTURA" }],
      lupulos: [{ alfa_pct: 3.5, quantidade_g: 60, etapa: "FERVURA", tempo_min: 60 }],
      leveduras: [{ atenuacao_pct: 80 }],
    });
  });
  const textoPainel = await pagina.textContent(".resultados");
  const br = (v, c) => v.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
  verificar(textoPainel.includes(br(esperado.og, 3)), `painel mostra OG ${br(esperado.og, 3)}`);
  verificar(textoPainel.includes(`IBU (Tinseth)${br(esperado.ibu, 0)}`), `painel mostra IBU ${br(esperado.ibu, 0)}`);
  verificar(textoPainel.includes(br(esperado.fg, 3)), `painel mostra FG ${br(esperado.fg, 3)}`);
  verificar(textoPainel.includes("Eficiência real"), "OG medida mostra a eficiência real");
  verificar(/Priming.*Açúcar comum \(sacarose\)\d+ g/.test(textoPainel), "CO₂ desejado mostra os gramas de priming");
  verificar(/Temperatura da água da mostura[\s\S]{0,300}?absorve\.\d+,\d °C/.test(textoPainel), "painel mostra a temperatura da água da mostura");
  await pagina.screenshot({ path: `${SAIDA}/p3-editor.png`, fullPage: true });

  await pagina.click("button:has-text('Salvar')");
  await pagina.waitForFunction(() => /#\/receita\/[0-9a-f-]{36}$/.test(location.hash));
  await pagina.waitForSelector(".titulo-receita");
  const salvo = chamadas.find((c) => c.caminho.startsWith("/rest/v1/rpc/salvar_receita"));
  verificar(salvo && salvo.corpo.p.fermentaveis[0].fermentavel_id === "f-sis" && salvo.corpo.p.fermentaveis[0].quantidade_kg === 4.8, "salvar_receita recebe o fermentável do cadastro com 4,8 kg");
  verificar(Math.abs(salvo.corpo.p.og_calc - esperado.og) < 1e-4, "og_calc gravado = cálculo");
  verificar(salvo.corpo.p.og_medida === 1.048 && salvo.corpo.p.data_brassagem === "2026-04-20" && salvo.corpo.p.lote_numero === null,
    "lote vai com OG 1048 → 1,048, data e número automático");
  verificar(await pagina.inputValue('input[aria-label="Nº do lote"]') === "1", "receita reabre com o nº do lote 1");
  verificar(await pagina.inputValue(".titulo-receita") === "Pils da Galia", "receita reabre do banco com o nome");
  verificar(await pagina.inputValue('input[aria-label="Qtd (kg)"]') === "4,800", "fermentável reabre com 4,800 kg");

  verificar(!(await pagina.textContent("body")).includes("null"), "nenhum 'null' escrito na tela do editor");
  await pagina.click("text=Voltar");
  await pagina.waitForSelector("td >> text=Pils da Galia");
  verificar(await pagina.isVisible("td >> text=5D German Pils"), "lista mostra a receita com o estilo");
  verificar(await pagina.isVisible("td >> text=20/04/2026"), "lista mostra a data da brassagem sem erro de fuso");

  // Ferramentas: valores padrão (5 kg, 3 L/kg, grão 20 °C, parada 66 °C; 20 L, 2,4 vol, 20 °C, sacarose).
  await pagina.click("header nav >> text=Ferramentas");
  await pagina.waitForSelector("h3:text('Priming')");
  const ferr = await pagina.textContent(".ferramentas");
  verificar(ferr.includes("Água da mostura15,0 L") && ferr.includes("Temperatura da água72,3 °C"), "água da mostura: 15,0 L a 72,3 °C");
  verificar(ferr.includes("112 g"), "priming: 112 g de açúcar comum para 20 L a 2,4 vol");
  await pagina.selectOption('select[aria-label="Açúcar"]', "DEXTROSE");
  await pagina.fill('input[aria-label="CO₂ desejado (vol)"]', "0,5");
  verificar((await pagina.textContent(".ferramentas")).includes("não precisa de priming"), "CO₂ abaixo do que a cerveja já tem: avisa que não precisa");
  // Refratômetro (12 °Brix, fator 1,04) e densímetro (1,050 a 25 °C, calibrado a 20 °C).
  const refr = () => pagina.textContent("section:has(h3:text('Refratômetro'))");
  verificar((await refr()).includes("Densidade do mosto (OG)1,046"), "refratômetro: 12 °Brix → OG 1,046");
  await pagina.fill('input[aria-label="°Brix atual (fermentando)"]', "6");
  verificar(/FG \(densidade atual\)1,011/.test(await refr()), "refratômetro fermentando (Terrill): FG 1,011");
  await pagina.click("summary:text('Descobrir o fator')");
  await pagina.fill('input[aria-label="Densímetro (mosto)"]', "1048");
  await pagina.fill('input[aria-label="Refratômetro (°Brix)"]', "12,5");
  await pagina.click('input[aria-label="Refratômetro (°Brix)"]');
  verificar(await pagina.inputValue('input[aria-label="Densímetro (mosto)"]') === "1,048", "densidade digitada 1048 aparece como 1,048 ao sair do campo");
  await pagina.click("button:has-text('Usar este fator')");
  verificar(await pagina.inputValue('input[aria-label="Fator do refratômetro"]') === "1,049", "descobre o fator (1,049) e passa a usar");
  verificar(await pagina.evaluate(() => JSON.parse(localStorage.getItem("galiabrew.preferencias")).fator_refratometro) === 1.049, "fator fica salvo no navegador");
  verificar((await pagina.textContent("section:has(h3:text('Densímetro'))")).includes("Densidade corrigida1,051"), "densímetro: 1,050 a 25 °C (calibrado a 20 °C) → 1,051");
  await pagina.screenshot({ path: `${SAIDA}/p6-ferramentas.png`, fullPage: true });
  await pagina.click("header nav >> text=Receitas");
  await pagina.screenshot({ path: `${SAIDA}/p4-lista.png` });

  // Celular
  await pagina.setViewportSize({ width: 390, height: 844 });
  await pagina.click("td >> text=Pils da Galia");
  await pagina.waitForSelector(".titulo-receita");
  const larguraExtra = await pagina.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  verificar(larguraExtra <= 1, `celular: página não passa da largura (${larguraExtra}px)`);
  await pagina.screenshot({ path: `${SAIDA}/p5-celular.png` });

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
  await pagina.click("button:has-text('Nova a partir desta')");
  await pagina.waitForSelector("text=Receita nova a partir de");
  verificar((await pagina.evaluate(() => location.hash)) === "#/receita/nova/r-outro", "abre a receita nova a partir da de outro");
  verificar(!(await pagina.isDisabled('input[aria-label="Qtd (kg)"]')) && await pagina.inputValue(".titulo-receita") === "IPA do Vizinho", "receita nova vem editável, com os dados da anterior");
  verificar(await pagina.inputValue('input[aria-label="OG medida"]') === "", "dados do lote começam em branco");
  await pagina.click("button:has-text('Salvar')");
  await pagina.waitForFunction(() => /#\/receita\/[0-9a-f-]{36}$/.test(location.hash));
  const copia = chamadas.filter((c) => c.caminho.startsWith("/rest/v1/rpc/salvar_receita")).pop().corpo.p;
  verificar(copia.id === null && copia.publica === false && copia.og_medida === null && copia.lote_numero === null, "salva como receita nova, privada, sem dados do lote");
  verificar(copia.fermentaveis[0].fermentavel_id === null && copia.equipamento_id === null && copia.fermentaveis[0].quantidade_kg === 6, "não leva ligação com cadastro que não enxergo, mas leva os dados");
  await pagina.waitForSelector('input[aria-label="Nº do lote"]');
  verificar(await pagina.inputValue('input[aria-label="Nº do lote"]') === "2", "receita nova recebe o próximo nº (2)");
  verificar(db.receitas.find((x) => x.id === "r-outro").nome === "IPA do Vizinho", "a receita anterior não muda");

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

  // O 400 é o da senha errada, testada de propósito (uma vez só).
  const esperados = erros.filter((e) => /status of 400/.test(e));
  const relevantes = erros.filter((e) => !/favicon/.test(e) && !/status of 400/.test(e));
  verificar(esperados.length === 1, "único erro de rede = o login com senha errada");
  console.log(ok.map((x) => `ok - ${x}`).join("\n"));
  console.log(relevantes.length ? `\nERROS NO CONSOLE:\n${relevantes.join("\n")}` : "\nsem erros no console (CSP ativa)");
  await navegador.close();
})().catch(async (e) => { console.error(e.message); process.exit(1); });
