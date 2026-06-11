// ============================================================
//  TOM LOUVORES — app.js
// ============================================================

const URL_BASE = CONFIG.SUPABASE_URL;
const KEY      = CONFIG.SUPABASE_KEY;
const TABLE    = CONFIG.TABLE_NAME;

// ── Credenciais admin (client-side) ──────────────────────────
const ADMIN_USER = "admin";
const ADMIN_PASS = "louvor123";

let musicas    = [];
let editandoId = null;
let tomMinList = [];
let cifraList  = [];   // URLs de cifra do modal de edição

const CHIP_CLASS = {
  "Raphaela":    "chip-Raphaela",
  "Daniela":     "chip-Daniela",
  "Cris":        "chip-Cris",
  "Mirian":      "chip-Mirian",
  "Pr. Humberto":"chip-Humberto",
};

// ============================================================
//  AUTH — Login / Logout
// ============================================================

function isAdmin() {
  return sessionStorage.getItem("tl_admin") === "1";
}

function aplicarEstadoAuth() {
  const admin = isAdmin();
  // body class controla visibilidade dos botões de edição via CSS
  document.body.classList.toggle("read-only", !admin);

  document.getElementById("btnLoginShow").style.display  = admin ? "none"  : "";
  document.getElementById("btnNovaMusica").style.display = admin ? ""      : "none";
  document.getElementById("btnLogout").style.display     = admin ? ""      : "none";
}

function abrirLogin() {
  document.getElementById("loginUser").value = "";
  document.getElementById("loginPass").value = "";
  document.getElementById("loginError").textContent = "";
  document.getElementById("loginOverlay").classList.add("open");
  setTimeout(() => document.getElementById("loginUser").focus(), 80);
}

function fecharLogin() {
  document.getElementById("loginOverlay").classList.remove("open");
}

function loginFecharFora(e) {
  if (e.target.id === "loginOverlay") fecharLogin();
}

function tentarLogin() {
  const user = document.getElementById("loginUser").value.trim();
  const pass = document.getElementById("loginPass").value;

  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    sessionStorage.setItem("tl_admin", "1");
    fecharLogin();
    aplicarEstadoAuth();
    toast("Bem-vindo, admin ✓");
    render(musicas); // re-renderiza com botões de edição visíveis
  } else {
    document.getElementById("loginError").textContent = "Usuário ou senha incorretos.";
    document.getElementById("loginPass").value = "";
    document.getElementById("loginPass").focus();
  }
}

function logout() {
  sessionStorage.removeItem("tl_admin");
  aplicarEstadoAuth();
  toast("Sessão encerrada.");
  render(musicas); // re-renderiza sem botões de edição
}

// ============================================================
//  Serialização
// ============================================================

function serializarPares(lista) {
  return JSON.stringify(lista);
}

function deserializarPares(str) {
  if (!str) return [];
  if (!str.startsWith("[")) {
    return str.split(",").map(t => ({ tom: t.trim(), min: "" })).filter(x => x.tom);
  }
  try { return JSON.parse(str); } catch { return []; }
}

// ============================================================
//  API
// ============================================================

async function req(path, opts = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(opts.headers || {}),
    },
  });
  if (!r.ok) throw new Error(await r.text());
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

// ordena alfabeticamente (A→Z), desempatando pela data mais recente
function ordenarMusicas() {
  const col = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
  musicas.sort((a, b) => {
    const cmp = col.compare(a.nome || "", b.nome || "");
    if (cmp !== 0) return cmp;
    // nomes iguais → mais recente primeiro
    return new Date(b.criado_em || 0) - new Date(a.criado_em || 0);
  });
}

async function carregar() {
  try {
    musicas = await req(`${TABLE}?order=criado_em.desc`) || [];
    ordenarMusicas();
    atualizarStats();
    atualizarFiltroTons();
    render(musicas);
    setStatus(true);
  } catch (e) {
    console.error(e);
    setStatus(false);
    toast("Erro ao conectar com o banco.", true);
    document.getElementById("stLoading").style.display = "none";
    document.getElementById("stEmpty").style.display   = "flex";
  }
}

async function salvar() {
  if (!isAdmin()) { toast("Faça login para editar.", true); return; }

  const nome  = document.getElementById("fNome").value.trim();
  const obsTx = document.getElementById("fObs").value.trim();
  const yt    = document.getElementById("fYoutube").value.trim();
  const spoti = document.getElementById("fSpotify").value.trim();

  // se sobrou algo digitado no campo de cifra sem clicar no "+", aproveita
  const cifraPendente = document.getElementById("fCifra").value.trim();
  if (cifraPendente) {
    let u = cifraPendente;
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    if (!cifraList.includes(u)) cifraList.push(u);
    document.getElementById("fCifra").value = "";
    renderCifraList();
  }

  // cada cifra recebe a marcação [cifra] para ser reconhecida em qualquer site
  const cifrasMarc = cifraList.map(u => CIFRA_TAG + u);

  // junta observação textual + youtube + cifras + spotify num único campo (observacoes)
  const obs = [obsTx, yt, ...cifrasMarc, spoti].filter(Boolean).join("\n");

  if (!nome)              { toast("Preencha o nome da música.", true); return; }
  if (!tomMinList.length) { toast("Adicione ao menos um tom e ministrante.", true); return; }

  // bloqueia nome duplicado (ignora acentos, caixa e espaços)
  const norm = s => (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLowerCase().replace(/\s+/g, " ");
  const jaExiste = musicas.some(m =>
    m.id != editandoId && norm(m.nome) === norm(nome)
  );
  if (jaExiste) {
    toast(`"${nome}" já está no repertório.`, true);
    return;
  }

  const btn = document.getElementById("btnSalvar");
  btn.disabled = true; btn.textContent = "Salvando...";

  const tomStr = serializarPares(tomMinList);
  const minStr = [...new Set(tomMinList.map(p => p.min).filter(Boolean))].join(", ");

  try {
    if (editandoId) {
      await req(`${TABLE}?id=eq.${editandoId}`, {
        method: "PATCH",
        body: JSON.stringify({ nome, tom: tomStr, ministrante: minStr, observacoes: obs }),
      });
      toast("Música atualizada ✓");
    } else {
      await req(TABLE, {
        method: "POST",
        body: JSON.stringify({ nome, tom: tomStr, ministrante: minStr, observacoes: obs }),
      });
      toast("Música adicionada ✓");
    }
    fecharModal();
    await carregar();
  } catch (e) {
    console.error(e);
    toast("Erro ao salvar. Verifique permissões do Supabase.", true);
  } finally {
    btn.disabled = false;
    btn.textContent = editandoId ? "SALVAR ALTERAÇÕES" : "SALVAR";
  }
}

async function excluir(id) {
  if (!isAdmin()) { toast("Faça login para excluir.", true); return; }
  if (!confirm("Excluir esta música?")) return;
  try {
    await req(`${TABLE}?id=eq.${id}`, { method: "DELETE" });
    toast("Música removida.");
    await carregar();
  } catch {
    toast("Erro ao excluir.", true);
  }
}

// ============================================================
//  Tom + Min no modal
// ============================================================

function adicionarTomMin() {
  const tom = document.getElementById("fTom").value;
  const min = document.getElementById("fMin").value;
  if (!tom || !min) { toast("Selecione tom e ministrante antes de adicionar.", true); return; }
  if (tomMinList.find(p => p.tom === tom)) {
    toast(`Tom ${tom} já foi adicionado.`, true); return;
  }
  tomMinList.push({ tom, min });
  document.getElementById("fTom").value = "";
  document.getElementById("fMin").value = "";
  renderTomList();
}

function removerTomMin(idx) {
  tomMinList.splice(idx, 1);
  renderTomList();
}

function renderTomList() {
  const container = document.getElementById("tomList");
  container.innerHTML = "";
  tomMinList.forEach((p, i) => {
    const chip = CHIP_CLASS[p.min] || "";
    const div = document.createElement("div");
    div.className = "tom-list-item";
    div.innerHTML = `
      <div class="tom-list-info">
        <span class="tom-list-badge">${esc(p.tom)}</span>
        <span class="tom-list-min card-min-label ${chip}">${esc(p.min)}</span>
      </div>
      <button class="tom-list-remove" onclick="removerTomMin(${i})" title="Remover">✕</button>`;
    container.appendChild(div);
  });
}

// ── Cifras (lista dinâmica no modal) ──────────────────────────
function adicionarCifra() {
  const inp = document.getElementById("fCifra");
  let url = inp.value.trim();
  if (!url) { toast("Cole o link da cifra antes de adicionar.", true); return; }
  // adiciona https:// se o usuário esqueceu
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  if (cifraList.includes(url)) { toast("Essa cifra já foi adicionada.", true); return; }
  cifraList.push(url);
  inp.value = "";
  renderCifraList();
}

function removerCifra(idx) {
  cifraList.splice(idx, 1);
  renderCifraList();
}

function renderCifraList() {
  const container = document.getElementById("cifraList");
  if (!container) return;
  container.innerHTML = "";
  cifraList.forEach((url, i) => {
    const div = document.createElement("div");
    div.className = "tom-list-item";
    div.innerHTML = `
      <div class="tom-list-info cifra-list-info">
        <span class="cifra-list-icon">♪</span>
        <span class="cifra-list-url">${esc(url)}</span>
      </div>
      <button class="tom-list-remove" onclick="removerCifra(${i})" title="Remover">✕</button>`;
    container.appendChild(div);
  });
}



function render(lista) {
  const grid  = document.getElementById("grid");
  const empty = document.getElementById("stEmpty");
  document.getElementById("stLoading").style.display = "none";

  grid.querySelectorAll(".card").forEach(c => c.remove());

  if (!lista.length) { empty.style.display = "flex"; return; }
  empty.style.display = "none";

  const admin = isAdmin();

  lista.forEach(m => {
    const pares = deserializarPares(m.tom);
    const data  = m.criado_em ? new Date(m.criado_em).toLocaleDateString("pt-BR") : "";

    const tonsHTML = pares.map(p => {
      const chip = CHIP_CLASS[p.min] || "";
      return `
        <div class="card-ton-row">
          <span class="card-badge">${esc(p.tom)}</span>
          ${p.min ? `<span class="card-min-label ${chip}">${esc(p.min)}</span>` : ""}
        </div>`;
    }).join("") || `<div class="card-ton-row"><span class="card-badge">${esc(m.tom)}</span></div>`;

    const obsLimpa = obsSemLinks(m.observacoes || "");
    const temYt    = obsTemYoutube(m.observacoes || "");
    const temSp    = obsTemSpotify(m.observacoes || "");
    const temCf    = obsTemCifra(m.observacoes || "");

    const div = document.createElement("div");
    div.className = "card card-editable";
    div.onclick = () => abrirView(m);

    const delBtn = admin
      ? `<button class="act-btn del" title="Excluir" onclick="event.stopPropagation();excluir('${m.id}')">✕</button>`
      : "";

    const tagsHTML = (temYt || temSp || temCf) ? `<div class="card-tags">
        ${temYt ? `<span class="card-yt-tag" title="YouTube">▶ YT</span>` : ""}
        ${temSp ? `<span class="card-yt-tag card-sp-tag" title="Spotify">Spotify</span>` : ""}
        ${temCf ? `<span class="card-yt-tag card-cf-tag" title="Cifra">Cifra</span>` : ""}
      </div>` : "";

    div.innerHTML = `
      <div class="card-head">
        <p class="card-nome">${esc(m.nome)}</p>
        ${delBtn}
      </div>
      <div class="card-tons">${tonsHTML}</div>
      ${obsLimpa ? `<p class="card-obs">${esc(obsLimpa)}</p>` : ""}
      ${(data || tagsHTML) ? `<div class="card-foot">
        ${tagsHTML}
        ${data ? `<span class="card-date">${data}</span>` : ""}
      </div>` : ""}`;
    grid.appendChild(div);
  });
}

// ============================================================
//  Filtros
// ============================================================

function filtrar() {
  const b = document.getElementById("busca").value.toLowerCase();
  const m = document.getElementById("filtroMin").value;
  const t = document.getElementById("filtroTom").value;
  render(musicas.filter(x => {
    const pares = deserializarPares(x.tom);
    const tons  = pares.map(p => p.tom);
    const mins  = pares.map(p => p.min);
    return (
      (!b || x.nome.toLowerCase().includes(b)) &&
      (!m || mins.includes(m) || x.ministrante === m) &&
      (!t || tons.includes(t))
    );
  }));
}

function atualizarStats() {
  document.getElementById("totalMusicas").textContent = musicas.length;
  const todosOsTons = musicas.flatMap(m => deserializarPares(m.tom).map(p => p.tom));
  document.getElementById("totalTons").textContent = [...new Set(todosOsTons)].length;
}

function atualizarFiltroTons() {
  const sel  = document.getElementById("filtroTom");
  const cur  = sel.value;
  const tons = [...new Set(
    musicas.flatMap(m => deserializarPares(m.tom).map(p => p.tom))
  )].sort();
  sel.innerHTML = `<option value="">Tons</option>` +
    tons.map(t => `<option${t === cur ? " selected" : ""}>${t}</option>`).join("");
}

// ============================================================
//  Modal LEITURA (visualizar música)
// ============================================================

let viewMusicaId = null;

// marcação usada para identificar um link como cifra (independe do site)
const CIFRA_TAG = "[cifra]";

// extrai todas as URLs de cifra (marcadas com [cifra])
function extrairCifras(texto = "") {
  const re = /\[cifra\](https?:\/\/[^\s]+)/gi;
  const out = [];
  let m;
  while ((m = re.exec(texto)) !== null) out.push(m[1]);
  return out;
}

// extrai URLs comuns (YouTube, Spotify, etc.), ignorando as marcadas como cifra
function extrairLinks(texto = "") {
  // remove as ocorrências de [cifra]URL antes de varrer os demais links
  const semCifra = texto.replace(/\[cifra\]https?:\/\/[^\s]+/gi, "");
  const re = /(https?:\/\/[^\s]+)/gi;
  return semCifra.match(re) || [];
}

function ehYoutube(url) {
  return /(?:youtube\.com|youtu\.be)/i.test(url);
}

function ehSpotify(url) {
  return /(?:open\.spotify\.com|spotify\.link|spoti\.fi)/i.test(url);
}

// remove todos os links (comuns + cifras marcadas) do texto, deixando só o escrito
function obsSemLinks(texto = "") {
  let t = texto.replace(/\[cifra\]https?:\/\/[^\s]+/gi, "");
  extrairLinks(texto).forEach(url => { t = t.replace(url, ""); });
  return t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// true se a observação contém algum link do YouTube
function obsTemYoutube(texto = "") {
  return extrairLinks(texto).some(ehYoutube);
}

function obsTemSpotify(texto = "") {
  return extrairLinks(texto).some(ehSpotify);
}

function obsTemCifra(texto = "") {
  return extrairCifras(texto).length > 0;
}

function abrirView(m) {
  viewMusicaId = m.id;
  ajustarBotaoEdicaoView(!!m.id);

  document.getElementById("viewTitulo").textContent = m.nome || "MÚSICA";

  // tons + ministrantes
  const pares = deserializarPares(m.tom);
  const tonsBox = document.getElementById("viewTons");
  tonsBox.innerHTML = (pares.length ? pares : [{ tom: m.tom, min: "" }]).map(p => {
    const chip = CHIP_CLASS[p.min] || "";
    return `
      <div class="card-ton-row">
        <span class="card-badge">${esc(p.tom)}</span>
        ${p.min ? `<span class="card-min-label ${chip}">${esc(p.min)}</span>` : ""}
      </div>`;
  }).join("");

  // observações
  const obs = (m.observacoes || "").trim();
  const obsEl = document.getElementById("viewObs");
  // separa links do texto: o texto exibido não mostra as URLs (só os botões abaixo)
  const links  = extrairLinks(obs);
  const cifras = extrairCifras(obs);
  const obsTexto = obsSemLinks(obs);

  if (obsTexto) {
    obsEl.textContent = obsTexto;
    obsEl.classList.remove("empty");
    document.getElementById("viewObsWrap").style.display = "";
  } else if (links.length || cifras.length) {
    // só tinha link na observação → esconde a seção de texto inteira
    document.getElementById("viewObsWrap").style.display = "none";
  } else {
    obsEl.textContent = "Sem observações.";
    obsEl.classList.add("empty");
    document.getElementById("viewObsWrap").style.display = "";
  }

  // botões formatados: cifras (fileira própria) + youtube/spotify (lado a lado) + outros
  const linksWrap = document.getElementById("viewLinksWrap");

  const cifraBtns = cifras.map((url, i) =>
    `<a class="view-yt-btn view-cf-btn" href="${esc(url)}" target="_blank" rel="noopener">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/></svg>
        Abrir Cifra${cifras.length > 1 ? " " + (i + 1) : ""}
      </a>`
  ).join("");

  const ytUrl = links.find(ehYoutube);
  const spUrl = links.find(ehSpotify);

  const ytBtn = ytUrl
    ? `<a class="view-yt-btn view-mini" href="${esc(ytUrl)}" target="_blank" rel="noopener">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z"/></svg>
        YouTube
      </a>`
    : "";

  const spBtn = spUrl
    ? `<a class="view-yt-btn view-sp-btn view-mini" href="${esc(spUrl)}" target="_blank" rel="noopener">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.5 17.3a.75.75 0 0 1-1.03.25c-2.82-1.72-6.37-2.11-10.56-1.16a.75.75 0 1 1-.33-1.46c4.58-1.05 8.5-.6 11.67 1.34.35.22.46.68.25 1.03zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.23-1.98-8.15-2.56-11.97-1.4a.94.94 0 1 1-.55-1.8c4.36-1.32 9.78-.68 13.49 1.6.44.27.58.85.32 1.29zm.13-3.4C15.73 8.45 8.4 8.2 4.62 9.35a1.12 1.12 0 1 1-.65-2.15c4.34-1.32 12.43-1.06 16.5 1.36a1.12 1.12 0 0 1-1.15 1.93z"/></svg>
        Spotify
      </a>`
    : "";

  // YouTube + Spotify juntos numa linha (se ao menos um existir)
  const linhaMidia = (ytBtn || spBtn)
    ? `<div class="view-links-row">${ytBtn}${spBtn}</div>`
    : "";

  // demais links (que não são youtube, spotify nem cifra) ficam full-width abaixo
  const outrosBtns = links
    .filter(url => !ehYoutube(url) && !ehSpotify(url))
    .map(url =>
      `<a class="view-yt-btn" style="background:rgba(96,165,250,0.08);border-color:rgba(96,165,250,0.3);color:#60A5FA" href="${esc(url)}" target="_blank" rel="noopener">🔗 Abrir link</a>`
    ).join("");

  linksWrap.innerHTML = cifraBtns + linhaMidia + outrosBtns;

  document.getElementById("viewOverlay").classList.add("open");
}

// esconde/mostra o lápis conforme a música existir no repertório
function ajustarBotaoEdicaoView(temId) {
  const btn = document.getElementById("viewEditBtn");
  if (btn) btn.style.display = temId ? "" : "none";
}

function fecharView() {
  document.getElementById("viewOverlay").classList.remove("open");
  viewMusicaId = null;
}

function viewFecharFora(e) {
  if (e.target.id === "viewOverlay") fecharView();
}

// botão lápis dentro da leitura → abre edição
function editarDaLeitura() {
  const m = musicas.find(x => x.id == viewMusicaId);
  fecharView();
  if (m) abrirModal(m);
}

// abrir leitura a partir de um louvor do culto
function abrirViewCulto(tipo, idx) {
  const l = cultos[tipo]?.louvores?.[idx];
  if (!l) return;

  // tenta achar a música original pra puxar observações completas
  const original = l.musica_id ? musicas.find(m => m.id == l.musica_id) : null;

  if (original) {
    // mostra a música, mas destaca o tom/ministrante específico deste culto no topo
    const m = {
      ...original,
      tom: serializarPares([{ tom: l.tom, min: l.min }]),
    };
    abrirView(m);
    // restaura todos os tons abaixo? não: o culto define um tom específico.
    // mas mantemos as observações da música original (já vêm em original.observacoes)
  } else {
    // música não está mais no repertório: mostra só o que o louvor guarda
    abrirView({
      id: null,
      nome: l.nome,
      tom: serializarPares([{ tom: l.tom, min: l.min }]),
      observacoes: "",
    });
  }
}

// ============================================================
//  Modal música
// ============================================================

function abrirModal(m = null) {
  if (!isAdmin()) { abrirLogin(); return; }
  editandoId  = m ? m.id : null;
  tomMinList  = m ? deserializarPares(m.tom) : [];

  document.getElementById("modalTitulo").textContent = m ? "EDITAR MÚSICA" : "NOVA MÚSICA";
  document.getElementById("fNome").value = m?.nome        || "";

  // separa os links da observação para os campos próprios
  const obsCompleta = m?.observacoes || "";
  cifraList         = extrairCifras(obsCompleta);             // várias cifras
  const comuns      = extrairLinks(obsCompleta);
  const spotifyUrl  = comuns.find(ehSpotify) || "";
  const youtubeUrl  = comuns.find(ehYoutube) || "";
  // observação textual = sem nenhum link (cifras, spotify, youtube e outros saem do texto)
  let obsTexto = obsSemLinks(obsCompleta);
  // links comuns que não sejam spotify nem youtube voltam ao texto da obs
  comuns.filter(u => !ehSpotify(u) && !ehYoutube(u)).forEach(u => {
    obsTexto = (obsTexto + "\n" + u).trim();
  });

  document.getElementById("fObs").value     = obsTexto;
  document.getElementById("fCifra").value   = "";
  document.getElementById("fYoutube").value = youtubeUrl;
  document.getElementById("fSpotify").value = spotifyUrl;
  document.getElementById("fTom").value  = "";
  document.getElementById("fMin").value  = "";
  document.getElementById("btnSalvar").textContent = m ? "SALVAR ALTERAÇÕES" : "SALVAR";

  renderTomList();
  renderCifraList();
  document.getElementById("overlay").classList.add("open");
  setTimeout(() => document.getElementById("fNome").focus(), 80);
}

function editar(id) {
  const m = musicas.find(x => x.id == id);
  if (m) abrirModal(m);
}

function fecharModal() {
  document.getElementById("overlay").classList.remove("open");
  editandoId = null;
  tomMinList = [];
  cifraList  = [];
}

function fecharFora(e) {
  if (e.target.id === "overlay") fecharModal();
}

// ============================================================
//  Utils
// ============================================================

function setStatus(ok) {
  const p = document.getElementById("statusPill");
  p.className = "status-pill " + (ok ? "ok" : "err");
  document.getElementById("statusTxt").textContent = ok ? "Conectado" : "Offline";
}

function toast(msg, err = false) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className   = "toast show" + (err ? " err" : "");
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.className = "toast"; }, 3200);
}

function esc(s = "") {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    fecharModal();
    fecharLogin();
    fecharCultoModal();
    fecharView();
  }
});

// ============================================================
//  CULTOS
// ============================================================

const CULTOS_TABLE = "cultos";

const CULTO_DEFS = [
  { tipo: "quarta",         titulo: "Quarta",        dia: "Quarta-feira",    diaSemana: 3 },
  { tipo: "domingo_manha",  titulo: "Domingo",       dia: "Domingo · Manhã", diaSemana: 0 },
  { tipo: "domingo_noite",  titulo: "Domingo",       dia: "Domingo · Noite", diaSemana: 0 },
];

// estado: { quarta:{id,louvores:[],atualizado_em}, ... }
let cultos = {};
let cultoTipoAtual = null;     // tipo sendo editado no modal
let cultoMusicaSel = null;     // música escolhida da lista (aba "do repertório")

// próxima data (>= hoje) que cai no dia da semana indicado
function proximaData(diaSemana) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const diff = (diaSemana - hoje.getDay() + 7) % 7; // 0 = hoje mesmo
  const d = new Date(hoje);
  d.setDate(hoje.getDate() + diff);
  return d;
}

function formatarDataCulto(d) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// um culto "expira" 1 dia após a data dele (passou 1 dia → limpa os louvores)
function cultoExpirou(def) {
  const dataCulto = proximaData(def.diaSemana);
  // mas a data do culto pode ter sido a da semana passada se já passou:
  // proximaData sempre devolve >= hoje, então comparamos com a última atualização.
  const dados = cultos[def.tipo];
  if (!dados || !dados.atualizado_em) return false;
  if (!dados.louvores || !dados.louvores.length) return false;

  // data do culto a que a lista atual se refere = a próxima ocorrência
  // a partir do dia em que foi salva
  const salvo = new Date(dados.atualizado_em);
  salvo.setHours(0, 0, 0, 0);
  const diff = (def.diaSemana - salvo.getDay() + 7) % 7;
  const dataReferente = new Date(salvo);
  dataReferente.setDate(salvo.getDate() + diff);

  // limite = data do culto + 1 dia (00:00 do dia seguinte ao culto + 1)
  const limite = new Date(dataReferente);
  limite.setDate(dataReferente.getDate() + 2); // dia do culto + 1 dia inteiro depois
  limite.setHours(0, 0, 0, 0);

  return new Date() >= limite;
}


async function carregarCultos() {
  try {
    const rows = await req(`${CULTOS_TABLE}`) || [];
    cultos = {};
    CULTO_DEFS.forEach(d => { cultos[d.tipo] = { id: null, louvores: [], atualizado_em: null }; });
    rows.forEach(r => {
      const louvores = typeof r.louvores === "string"
        ? (() => { try { return JSON.parse(r.louvores); } catch { return []; } })()
        : (r.louvores || []);
      cultos[r.tipo] = {
        id: r.id,
        louvores,
        atualizado_em: r.atualizado_em || null,
      };
    });

    // limpa louvores de cultos que já passaram +1 dia
    await limparCultosExpirados();

    renderCultos();
  } catch (e) {
    console.error("Cultos:", e);
    // se a tabela ainda não existe, só mostra vazio sem travar a página
    cultos = {};
    CULTO_DEFS.forEach(d => { cultos[d.tipo] = { id: null, louvores: [], atualizado_em: null }; });
    renderCultos();
  }
}

// percorre os cultos e zera os que expiraram (salvando no banco)
async function limparCultosExpirados() {
  for (const def of CULTO_DEFS) {
    if (cultoExpirou(def)) {
      cultos[def.tipo].louvores = [];
      // salva direto sem exigir admin (limpeza automática)
      const dados = cultos[def.tipo];
      try {
        if (dados.id) {
          await req(`${CULTOS_TABLE}?id=eq.${dados.id}`, {
            method: "PATCH",
            body: JSON.stringify({ louvores: [], atualizado_em: new Date().toISOString() }),
          });
          dados.atualizado_em = new Date().toISOString();
        }
      } catch (e) {
        console.error("Falha ao limpar culto expirado:", e);
      }
    }
  }
}

function renderCultos() {
  const grid = document.getElementById("cultosGrid");
  if (!grid) return;
  grid.innerHTML = "";

  CULTO_DEFS.forEach(def => {
    const dados    = cultos[def.tipo] || { louvores: [] };
    const louvores = dados.louvores || [];
    const dataStr  = formatarDataCulto(proximaData(def.diaSemana));

    const itensHTML = louvores.length
      ? louvores.map((l, i) => {
          const chip = CHIP_CLASS[l.min] || "";
          return `
            <div class="culto-louvor">
              <div class="culto-louvor-info culto-louvor-click"
                   onclick="abrirViewCulto('${def.tipo}',${i})" title="Ver detalhes">
                <span class="culto-louvor-badge">${esc(l.tom || "—")}</span>
                <div class="culto-louvor-txt">
                  <div class="culto-louvor-nome">${esc(l.nome)}</div>
                  ${l.min ? `<span class="culto-louvor-min ${chip}">${esc(l.min)}</span>` : ""}
                </div>
              </div>
              <button class="culto-louvor-rm" title="Remover"
                onclick="event.stopPropagation();removerLouvorCulto('${def.tipo}',${i})">✕</button>
            </div>`;
        }).join("")
      : `<div class="culto-empty">Nenhum louvor adicionado.</div>`;

    const col = document.createElement("div");
    col.className = "culto-col";
    col.innerHTML = `
      <div class="culto-col-hd">
        <div class="culto-col-hd-left">
          <div class="culto-col-titulo-row">
            <span class="culto-col-titulo">${def.titulo}</span>
            <span class="culto-col-data">${dataStr}</span>
          </div>
          <div class="culto-col-dia">${def.dia}</div>
        </div>
        <span class="culto-col-count">${louvores.length} ${louvores.length === 1 ? "louvor" : "louvores"}</span>
      </div>
      <div class="culto-col-bd">${itensHTML}</div>
      <button class="culto-add-btn" onclick="abrirCultoModal('${def.tipo}')">+ Adicionar louvor</button>`;
    grid.appendChild(col);
  });
}

// ── persistência ──────────────────────────────────────────────
async function salvarCulto(tipo) {
  const dados = cultos[tipo];
  const agora = new Date().toISOString();
  const payload = { tipo, louvores: dados.louvores, atualizado_em: agora };
  try {
    if (dados.id) {
      await req(`${CULTOS_TABLE}?id=eq.${dados.id}`, {
        method: "PATCH",
        body: JSON.stringify({ louvores: dados.louvores, atualizado_em: agora }),
      });
    } else {
      const novo = await req(CULTOS_TABLE, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (novo && novo[0]) dados.id = novo[0].id;
    }
    dados.atualizado_em = agora;
    return true;
  } catch (e) {
    console.error(e);
    toast("Erro ao salvar o culto. Verifique a tabela no Supabase.", true);
    return false;
  }
}

async function removerLouvorCulto(tipo, idx) {
  if (!isAdmin()) { toast("Faça login para editar.", true); return; }
  cultos[tipo].louvores.splice(idx, 1);
  renderCultos();
  await salvarCulto(tipo);
}

// ── modal de adicionar louvor ─────────────────────────────────
function abrirCultoModal(tipo) {
  if (!isAdmin()) { abrirLogin(); return; }
  cultoTipoAtual = tipo;
  cultoMusicaSel = null;

  const def = CULTO_DEFS.find(d => d.tipo === tipo);
  document.getElementById("cultoModalTitulo").textContent =
    `ADICIONAR · ${def.titulo.toUpperCase()}`;

  // reset campos
  document.getElementById("cBuscaMusica").value = "";
  document.getElementById("cNovoNome").value = "";
  document.getElementById("cNovoTom").value = "";
  document.getElementById("cNovoMin").value = "";
  document.getElementById("cTomEscolhido").value = "";
  document.getElementById("cMinEscolhido").value = "";
  document.getElementById("cultoTomWrap").style.display = "none";

  cultoTab("escolher");
  filtrarMusicasCulto();

  document.getElementById("cultoOverlay").classList.add("open");
}

function fecharCultoModal() {
  document.getElementById("cultoOverlay").classList.remove("open");
  cultoTipoAtual = null;
  cultoMusicaSel = null;
}

function cultoFecharFora(e) {
  if (e.target.id === "cultoOverlay") fecharCultoModal();
}

function cultoTab(qual) {
  const escolher = qual === "escolher";
  document.getElementById("tabEscolher").classList.toggle("active", escolher);
  document.getElementById("tabCriar").classList.toggle("active", !escolher);
  document.getElementById("cultoPaneEscolher").style.display = escolher ? "" : "none";
  document.getElementById("cultoPaneCriar").style.display    = escolher ? "none" : "";
}

// lista de músicas do repertório (aba "do repertório")
function filtrarMusicasCulto() {
  const termo = document.getElementById("cBuscaMusica").value.trim().toLowerCase();
  const list  = document.getElementById("cultoMusicaList");

  // sem busca, lista vazia (não despeja o repertório inteiro)
  if (!termo) {
    list.innerHTML = `<div class="culto-empty">Digite para buscar uma música.</div>`;
    return;
  }

  const filtradas = musicas
    .filter(m => m.nome.toLowerCase().includes(termo))
    .slice(0, 40);

  list.innerHTML = filtradas.length
    ? filtradas.map(m =>
        `<div class="culto-musica-opt" data-id="${m.id}" onclick="selecionarMusicaCulto('${m.id}')">${esc(m.nome)}</div>`
      ).join("")
    : `<div class="culto-empty">Nenhuma música encontrada.</div>`;
}

function selecionarMusicaCulto(id) {
  const m = musicas.find(x => x.id == id);
  if (!m) return;
  cultoMusicaSel = m;

  document.querySelectorAll("#cultoMusicaList .culto-musica-opt").forEach(el => {
    el.classList.toggle("sel", el.dataset.id == id);
  });

  // popular dropdown de tom com os tons já cadastrados dessa música
  const pares = deserializarPares(m.tom);
  const sel = document.getElementById("cTomEscolhido");
  sel.innerHTML = `<option value="">Tom</option>` +
    pares.map(p => `<option value="${esc(p.tom)}" data-min="${esc(p.min || "")}">${esc(p.tom)}${p.min ? " · " + esc(p.min) : ""}</option>`).join("");

  // se a música só tem 1 tom, já preenche tom + ministrante
  if (pares.length === 1) {
    sel.value = pares[0].tom;
    if (pares[0].min) document.getElementById("cMinEscolhido").value = pares[0].min;
  }

  // ao trocar de tom, sugerir o ministrante daquele tom
  sel.onchange = () => {
    const opt = sel.options[sel.selectedIndex];
    const min = opt ? opt.getAttribute("data-min") : "";
    if (min) document.getElementById("cMinEscolhido").value = min;
  };

  document.getElementById("cultoTomWrap").style.display = "";
}

// confirmar adição (das duas abas)
async function confirmarLouvorCulto() {
  if (!isAdmin()) { toast("Faça login para editar.", true); return; }
  const criando = document.getElementById("tabCriar").classList.contains("active");

  let nome, tom, min, musicaId = null;

  if (criando) {
    nome = document.getElementById("cNovoNome").value.trim();
    tom  = document.getElementById("cNovoTom").value;
    min  = document.getElementById("cNovoMin").value;
    if (!nome) { toast("Preencha o nome da música.", true); return; }
    if (!tom || !min) { toast("Selecione tom e ministrante.", true); return; }
  } else {
    if (!cultoMusicaSel) { toast("Escolha uma música.", true); return; }
    nome = cultoMusicaSel.nome;
    tom  = document.getElementById("cTomEscolhido").value;
    min  = document.getElementById("cMinEscolhido").value;
    musicaId = cultoMusicaSel.id;
    if (!tom) { toast("Selecione o tom.", true); return; }
    if (!min) { toast("Selecione o ministrante.", true); return; }
  }

  const btn = document.getElementById("btnAddLouvor");
  btn.disabled = true; btn.textContent = "Salvando...";

  try {
    // se criou nova, salva também no repertório geral — mas evita duplicar
    if (criando) {
      const norm = s => (s || "")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .trim().toLowerCase().replace(/\s+/g, " ");
      const existente = musicas.find(m => norm(m.nome) === norm(nome));

      if (existente) {
        // já existe no repertório → reaproveita, não cria duplicata
        musicaId = existente.id;
        nome = existente.nome; // usa o nome já cadastrado
        toast(`"${nome}" já existia — usando o do repertório.`);
      } else {
        const tomStr = serializarPares([{ tom, min }]);
        const nova = await req(TABLE, {
          method: "POST",
          body: JSON.stringify({ nome, tom: tomStr, ministrante: min, observacoes: "" }),
        });
        if (nova && nova[0]) musicaId = nova[0].id;
      }
    }

    // adiciona ao culto
    cultos[cultoTipoAtual].louvores.push({ musica_id: musicaId, nome, tom, min });
    const ok = await salvarCulto(cultoTipoAtual);

    if (ok) {
      renderCultos();
      if (criando) await carregar(); // atualiza repertório/stats
      toast("Louvor adicionado ✓");
      fecharCultoModal();
    } else {
      // desfaz se falhou
      cultos[cultoTipoAtual].louvores.pop();
    }
  } catch (e) {
    console.error(e);
    toast("Erro ao adicionar louvor.", true);
  } finally {
    btn.disabled = false;
    btn.textContent = "ADICIONAR";
  }
}

// ============================================================
//  Busca fixa (sombra ao grudar)
// ============================================================

// detecta quando a busca grudou no topo, para aplicar sombra
function onScrollBusca() {
  const mobile = window.innerWidth <= 768;
  const alvo   = document.querySelector(mobile ? ".search-row" : ".toolbar");
  const outro  = document.querySelector(mobile ? ".toolbar" : ".search-row");
  if (outro) outro.classList.remove("stuck");
  if (!alvo) return;
  const limite = window.innerWidth <= 480 ? 57 : 65;
  const grudou = alvo.getBoundingClientRect().top <= limite;
  alvo.classList.toggle("stuck", grudou);
}

window.addEventListener("scroll", onScrollBusca, { passive: true });
window.addEventListener("resize", onScrollBusca);

// ── Init ──────────────────────────────────────────────────────
aplicarEstadoAuth();
carregar();
carregarCultos();
onScrollBusca();