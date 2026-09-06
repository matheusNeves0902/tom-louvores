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
let tomMinList = [];   // [{ tom, mins: [nomes...] }]
let cifraList  = [];   // URLs de cifra do modal de edição

const CHIP_CLASS = {
  "Raphaela":    "chip-Raphaela",
  "Daniela":     "chip-Daniela",
  "Cris":        "chip-Cris",
  "Mirian":      "chip-Mirian",
  "Pr. Humberto":"chip-Humberto",
};

const MINISTRANTES = ["Raphaela", "Daniela", "Cris", "Mirian", "Pr. Humberto"];

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
//  Ministrantes por par (agora um tom pode ter vários nomes)
// ============================================================

// "Raphaela, Cris" → ["Raphaela","Cris"]
function minsToArray(str) {
  return (str || "").split(",").map(s => s.trim()).filter(Boolean);
}

// ["Raphaela","Cris"] → "Raphaela, Cris"
function minsFromArray(arr) {
  return (arr || []).filter(Boolean).join(", ");
}

// ============================================================
//  Tom único → gravado como "Todos"
// ============================================================
//  Com um único tom, o par é SALVO NO BANCO como min="Todos",
//  e o(s) ministrante(s) real(is) ficam preservados em "min_orig".
//  Assim sistemas externos leem a tag direto da tabela, e ao
//  cadastrar um segundo tom o(s) nome(s) verdadeiro(s) volta(m).

const MIN_TODOS = "Todos";

// true quando a música tem apenas UM tom cadastrado
function tomParaTodos(pares) {
  return pares.length === 1 && !!pares[0].tom;
}

// o par vale para o time inteiro? (tag gravada ou registro antigo de tom único)
function parEhTodos(p, pares) {
  return p.min === MIN_TODOS || tomParaTodos(pares);
}

// ministrantes reais de um par. Retorna null quando o par vale
// para todo mundo (tom único / tag "Todos").
function minsReaisDoPar(p, pares) {
  if (parEhTodos(p, pares)) {
    return null;
  }
  return minsToArray(p.min);
}

// normaliza a lista antes de gravar:
//  1 tom  → min = "Todos", nome(s) real(is) guardado(s) em min_orig
//  2+ tons → volta o(s) nome(s) real(is) e descarta min_orig
function normalizarParesParaSalvar(lista) {
  if (lista.length === 1) {
    const p = lista[0];
    const real = minsFromArray(p.mins);
    const par  = { tom: p.tom, min: MIN_TODOS };
    if (real) par.min_orig = real;
    return [par];
  }
  return lista.map(p => ({
    tom: p.tom,
    min: minsFromArray(p.mins),
  }));
}

// pares como o admin deve vê-los no modal: sempre os ministrantes reais,
// agrupados por tom → { tom, mins:[...] }
function paresParaEdicao(str) {
  return deserializarPares(str).map(p => {
    const real = p.min_orig || (p.min === MIN_TODOS ? "" : p.min) || "";
    return { tom: p.tom, mins: minsToArray(real) };
  });
}

// pares "efetivos": um tom marcado como Todos conta para
// todos os ministrantes do sistema (usado nos filtros e buscas)
function paresEfetivos(m) {
  const pares = deserializarPares(m.tom);
  const out = [];
  pares.forEach(p => {
    const reais = minsReaisDoPar(p, pares);
    if (reais === null) {
      MINISTRANTES.forEach(min => out.push({ tom: p.tom, min, auto: true }));
    } else {
      reais.forEach(min => out.push({ tom: p.tom, min }));
    }
  });
  return out;
}

// HTML das linhas de tom — usado no card e no modal de leitura.
// expandir=false mantém o par exatamente como veio (ex.: tom de um culto).
function tonsParaHTML(m, expandir = true) {
  const pares = deserializarPares(m.tom);

  if (!pares.length) {
    return `<div class="card-ton-row"><span class="card-badge">${esc(m.tom || "—")}</span></div>`;
  }

  return pares.map(p => {
    const reais = expandir ? minsReaisDoPar(p, pares) : minsToArray(p.min);

    const chipsHTML = (reais === null)
      ? `<span class="card-min-label chip-todos">${MIN_TODOS}</span>`
      : reais.map(n => `<span class="card-min-label ${CHIP_CLASS[n] || ""}">${esc(n)}</span>`).join("");

    return `
      <div class="card-ton-row">
        <span class="card-badge">${esc(p.tom)}</span>
        <span class="ton-row-right">${chipsHTML}</span>
      </div>`;
  }).join("");
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

  // 1 tom → grava a tag "Todos"; 2+ → nomes reais
  const paresSalvar = normalizarParesParaSalvar(tomMinList);
  const tomStr = serializarPares(paresSalvar);
  const minStr = [...new Set(tomMinList.flatMap(p => p.mins))].join(", ");

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

// adiciona um ministrante a um tom. Se o tom já existe na lista,
// o ministrante entra no MESMO bloco (não cria linha nova).
function adicionarTomMin() {
  const tom = document.getElementById("fTom").value;
  const min = document.getElementById("fMin").value;
  if (!tom || !min) { toast("Selecione tom e ministrante antes de adicionar.", true); return; }

  let entrada = tomMinList.find(p => p.tom === tom);
  if (entrada) {
    if (entrada.mins.includes(min)) {
      toast(`${min} já está no tom ${tom}.`, true);
      return;
    }
    entrada.mins.push(min);
  } else {
    tomMinList.push({ tom, mins: [min] });
  }

  document.getElementById("fTom").value = "";
  document.getElementById("fMin").value = "";
  renderTomList();
}

// remove um ministrante específico de um tom; se era o último, o
// bloco do tom inteiro some sozinho.
function removerMinDoTom(tomIdx, minIdx) {
  const entrada = tomMinList[tomIdx];
  if (!entrada) return;
  entrada.mins.splice(minIdx, 1);
  if (!entrada.mins.length) tomMinList.splice(tomIdx, 1);
  renderTomList();
}

function renderTomList() {
  const container = document.getElementById("tomList");
  container.innerHTML = "";

  tomMinList.forEach((p, ti) => {
    const div = document.createElement("div");
    div.className = "tom-list-item";

    const chipsHTML = p.mins.map((min, mi) => {
      const chip = CHIP_CLASS[min] || "";
      return `<span class="tom-list-min card-min-label ${chip}" style="display:inline-flex;align-items:center;gap:4px;">
                ${esc(min)}
                <button type="button" class="tom-list-remove" style="width:16px;height:16px;min-width:16px;font-size:10px;padding:0;line-height:1;"
                  onclick="removerMinDoTom(${ti},${mi})" title="Remover ${esc(min)}">✕</button>
              </span>`;
    }).join("");

    div.innerHTML = `
      <div class="tom-list-info" style="flex-wrap:wrap;gap:6px;align-items:center;">
        <span class="tom-list-badge">${esc(p.tom)}</span>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">${chipsHTML}</div>
      </div>`;
    container.appendChild(div);
  });

  // aviso: com um único tom, ele é exibido como "Todos"
  if (tomMinList.length === 1) {
    const aviso = document.createElement("div");
    aviso.className = "tom-list-hint";
    aviso.textContent = "Só um tom cadastrado — ele será salvo como \"Todos\". Ao adicionar um segundo tom, o(s) ministrante(s) volta(m).";
    container.appendChild(aviso);
  }
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

// ============================================================
//  Grade do repertório
// ============================================================

// ícones das plataformas. Na grade eles são monocromáticos: dizem
// "existe link", sem disputar atenção com o amarelo do tom. A cor
// da marca aparece só nos botões grandes, dentro do modal.
const ICO_PLATAFORMA = {
  youtube: `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z"/></svg>`,

  spotify: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.5 17.3a.75.75 0 0 1-1.03.25c-2.82-1.72-6.37-2.11-10.56-1.16a.75.75 0 1 1-.33-1.46c4.58-1.05 8.5-.6 11.67 1.34.35.22.46.68.25 1.03zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.23-1.98-8.15-2.56-11.97-1.4a.94.94 0 1 1-.55-1.8c4.36-1.32 9.78-.68 13.49 1.6.44.27.58.85.32 1.29zm.13-3.4C15.73 8.45 8.4 8.2 4.62 9.35a1.12 1.12 0 1 1-.65-2.15c4.34-1.32 12.43-1.06 16.5 1.36a1.12 1.12 0 0 1-1.15 1.93z"/></svg>`,

  cifra: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/></svg>`,
};

function render(lista) {
  const grid  = document.getElementById("grid");
  const empty = document.getElementById("stEmpty");
  document.getElementById("stLoading").style.display = "none";

  grid.querySelectorAll(".card").forEach(c => c.remove());

  if (!lista.length) { empty.style.display = "flex"; return; }
  empty.style.display = "none";

  const admin = isAdmin();

  lista.forEach(m => {
    const data = m.criado_em ? new Date(m.criado_em).toLocaleDateString("pt-BR") : "";

    // um único tom → mostra "Todos" no lugar do ministrante
    const tonsHTML = tonsParaHTML(m);

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
        ${temYt ? `<span class="card-ico" title="Tem vídeo no YouTube">${ICO_PLATAFORMA.youtube}</span>` : ""}
        ${temSp ? `<span class="card-ico" title="Tem áudio no Spotify">${ICO_PLATAFORMA.spotify}</span>` : ""}
        ${temCf ? `<span class="card-ico" title="Tem cifra">${ICO_PLATAFORMA.cifra}</span>` : ""}
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
    // pares efetivos: tom único vale para todos os ministrantes
    const pares = paresEfetivos(x);
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

// expandirTom=false mantém o par como veio (usado quando o tom vem de um culto)
function abrirView(m, expandirTom = true) {
  viewMusicaId = m.id;
  ajustarBotaoEdicaoView(!!m.id);

  document.getElementById("viewTitulo").textContent = m.nome || "MÚSICA";

  // tons + ministrantes
  document.getElementById("viewTons").innerHTML = tonsParaHTML(m, expandirTom);

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
    // false: o tom aqui é o definido para este culto, não vira "Todos"
    abrirView(m, false);
  } else {
    // música não está mais no repertório: mostra só o que o louvor guarda
    abrirView({
      id: null,
      nome: l.nome,
      tom: serializarPares([{ tom: l.tom, min: l.min }]),
      observacoes: "",
    }, false);
  }
}

// ============================================================
//  Modal música
// ============================================================

function abrirModal(m = null) {
  if (!isAdmin()) { abrirLogin(); return; }
  editandoId  = m ? m.id : null;
  tomMinList  = m ? paresParaEdicao(m.tom) : [];

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
let cultoSecaoAtual = "principal"; // seção do item sendo adicionado

// seções de cada culto: lista principal, ofertório e pós-palavra
const SECAO_LABEL = {
  principal: "Louvores",
  ofertorio: "Ofertório",
  pos:       "Pós-palavra",
  ceia:      "Ceia",
};

// em qual seção um louvor salvo está (compatível com o formato antigo)
function secaoDoLouvor(l) {
  if (l.ofertorio) return "ofertorio";
  if (l.pos)       return "pos";
  if (l.ceia)      return "ceia";
  return "principal";
}

// A Ceia é no primeiro domingo do mês: dia da semana domingo e
// data até o dia 7 (só o primeiro domingo cai nessa faixa).
function ehPrimeiroDomingo(d) {
  return d.getDay() === 0 && d.getDate() <= 7;
}

// próxima data (>= base) que cai no dia da semana indicado (base padrão = hoje)
function proximaData(diaSemana, base = new Date()) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const diff = (diaSemana - d.getDay() + 7) % 7; // 0 = no próprio dia
  d.setDate(d.getDate() + diff);
  return d;
}

function formatarDataCulto(d) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// data (YYYY-MM-DD em horário local) — ordenável como string e comparável por dia
function isoDia(d) {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// data do culto (YYYY-MM-DD) a que um novo louvor deve pertencer = próxima ocorrência
function dataAlvoCulto(tipo) {
  const def = CULTO_DEFS.find(d => d.tipo === tipo);
  if (!def || def.diaSemana == null) return isoDia(new Date());
  return isoDia(proximaData(def.diaSemana));
}

// "há X" legível a partir de um timestamp ISO (atualizado_em)
function tempoRelativo(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const seg = Math.floor((Date.now() - t) / 1000);
  if (seg < 45)  return "agora mesmo";
  const min = Math.round(seg / 60);
  if (min < 60)  return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24)    return h === 1 ? "há 1 hora" : `há ${h} horas`;
  const dias = Math.floor(h / 24);
  if (dias === 1) return "ontem";
  if (dias < 7)  return `há ${dias} dias`;
  return "em " + new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// monta o texto da lista de um culto, pronto pra colar no WhatsApp
function textoCultoParaCopiar(def, dados) {
  const louvores   = dados.louvores || [];
  const principais = louvores.filter(l => secaoDoLouvor(l) === "principal");
  const ofertorios = louvores.filter(l => secaoDoLouvor(l) === "ofertorio");
  const posPalavra = louvores.filter(l => secaoDoLouvor(l) === "pos");
  const ceia       = louvores.filter(l => secaoDoLouvor(l) === "ceia");
  const dataStr    = formatarDataCulto(proximaData(def.diaSemana));

  const linhaMusica = l => `${l.nome} — ${l.tom || "—"}`;

  const linhas = [`${def.dia} — ${dataStr}`, ""];
  principais.forEach((l, i) => linhas.push(`${i + 1}. ${linhaMusica(l)}`));
  if (posPalavra.length) {
    linhas.push("", "Pós-palavra:");
    posPalavra.forEach(l => linhas.push(`- ${linhaMusica(l)}`));
  }
  if (ceia.length) {
    linhas.push("", "Ceia:");
    ceia.forEach(l => linhas.push(`- ${linhaMusica(l)}`));
  }
  if (ofertorios.length) {
    linhas.push("", "Ofertório:");
    ofertorios.forEach(l => linhas.push(`- ${linhaMusica(l)}`));
  }
  return linhas.join("\n");
}

// copia texto pra área de transferência.
// tenta o método síncrono primeiro: mantém o "gesto" do clique e funciona em file:// e http.
// se falhar, tenta a Clipboard API moderna (precisa de contexto seguro / https).
function copiarTexto(texto) {
  try {
    const ta = document.createElement("textarea");
    ta.value = texto;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, texto.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) return Promise.resolve(true);
  } catch (e) { /* tenta a API moderna abaixo */ }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(texto).then(() => true).catch(() => false);
  }
  return Promise.resolve(false);
}

// clique no botão "Copiar" de um culto
async function copiarCulto(tipo) {
  const def   = CULTO_DEFS.find(d => d.tipo === tipo);
  const dados = cultos[tipo];
  if (!def || !dados || !(dados.louvores || []).length) {
    toast("Nada para copiar ainda.", true);
    return;
  }
  const ok = await copiarTexto(textoCultoParaCopiar(def, dados));
  toast(ok ? "Lista copiada ✓" : "Não consegui copiar — copie manualmente.", !ok);
}


async function carregarCultos() {
  try {
    const rows = await req(`${CULTOS_TABLE}`) || [];
    const vazio = () => ({ id: null, louvores: [], ministrante: "", ministrante_data: null, atualizado_em: null });
    cultos = {};
    CULTO_DEFS.forEach(d => { cultos[d.tipo] = vazio(); });
    rows.forEach(r => {
      const raw = typeof r.louvores === "string"
        ? (() => { try { return JSON.parse(r.louvores); } catch { return []; } })()
        : (r.louvores || []);
      // formato antigo: array de louvores. formato novo: { ministrante, ministrante_data, itens: [...] }
      let lista = [], ministrante = "", ministranteData = null;
      if (Array.isArray(raw)) {
        lista = raw;
      } else if (raw && typeof raw === "object") {
        lista = Array.isArray(raw.itens) ? raw.itens : [];
        ministrante = raw.ministrante || "";
        ministranteData = raw.ministrante_data || null;
      }
      cultos[r.tipo] = {
        id: r.id,
        louvores: lista,
        ministrante,
        ministrante_data: ministranteData,
        atualizado_em: r.atualizado_em || null,
      };
    });

    // limpa louvores e escala de cultos que já passaram
    await limparCultosExpirados();

    renderCultos();
  } catch (e) {
    console.error("Cultos:", e);
    // se a tabela ainda não existe, só mostra vazio sem travar a página
    cultos = {};
    CULTO_DEFS.forEach(d => {
      cultos[d.tipo] = { id: null, louvores: [], ministrante: "", ministrante_data: null, atualizado_em: null };
    });
    renderCultos();
  }
}

// formato salvo no banco: { ministrante, ministrante_data, itens }
// guarda o escalado e a data do culto dele junto da lista, sem coluna nova
function serializarLouvores(dados) {
  return {
    ministrante: dados.ministrante || "",
    ministrante_data: dados.ministrante_data || "",
    itens: dados.louvores || [],
  };
}

// limpeza automática: remove os louvores cujo culto já passou (data < hoje)
// e apaga o ministrante escalado daquele mesmo culto.
// itens antigos sem o campo "data" são tratados como de cultos passados.
async function limparCultosExpirados() {
  const hoje = isoDia(new Date());
  for (const def of CULTO_DEFS) {
    const dados = cultos[def.tipo];
    if (!dados) continue;

    let mudou = false;

    // ── louvores ──
    if (dados.louvores && dados.louvores.length) {
      const antes = dados.louvores.length;
      // mantém só os que ainda não passaram (data do culto >= hoje)
      dados.louvores = dados.louvores.filter(l => l.data && l.data >= hoje);
      if (dados.louvores.length !== antes) mudou = true;
    }

    // ── ministrante escalado ──
    if (dados.ministrante) {
      if (!dados.ministrante_data) {
        // escala salva antes deste campo existir: adota o próximo culto como referência
        dados.ministrante_data = dataAlvoCulto(def.tipo);
        mudou = true;
      } else if (dados.ministrante_data < hoje) {
        // o culto dele já passou → some com a escala
        dados.ministrante = "";
        dados.ministrante_data = null;
        mudou = true;
      }
    } else if (dados.ministrante_data) {
      dados.ministrante_data = null;
      mudou = true;
    }

    if (mudou && dados.id) {
      // persiste a limpeza (automática, sem exigir admin)
      try {
        const agora = new Date().toISOString();
        await req(`${CULTOS_TABLE}?id=eq.${dados.id}`, {
          method: "PATCH",
          body: JSON.stringify({ louvores: serializarLouvores(dados), atualizado_em: agora }),
        });
        dados.atualizado_em = agora;
      } catch (e) {
        console.error("Falha ao limpar culto expirado:", e);
      }
    }
  }
}

// markup de uma linha de louvor (reutilizado nas duas seções: principal e ofertório)
// recebe o índice ORIGINAL dentro de cultos[tipo].louvores para remover/abrir corretamente
function louvorRowHTML(tipo, l, i) {
  return `
    <div class="culto-louvor">
      <div class="culto-louvor-info culto-louvor-click"
           onclick="abrirViewCulto('${tipo}',${i})" title="Ver detalhes">
        <span class="culto-louvor-badge">${esc(l.tom || "—")}</span>
        <div class="culto-louvor-txt">
          <div class="culto-louvor-nome">${esc(l.nome)}</div>
        </div>
      </div>
      <button class="culto-louvor-rm" title="Remover"
        onclick="event.stopPropagation();removerLouvorCulto('${tipo}',${i})">✕</button>
    </div>`;
}

function renderCultos() {
  const grid = document.getElementById("cultosGrid");
  if (!grid) return;
  grid.innerHTML = "";

  CULTO_DEFS.forEach(def => {
    const dados    = cultos[def.tipo] || { louvores: [] };
    const louvores = dados.louvores || [];
    const dataStr  = formatarDataCulto(proximaData(def.diaSemana));

    // separa por seção, preservando o índice original de cada louvor
    const principais = [];
    const ofertorio  = [];
    const posPalavra = [];
    const ceia       = [];
    const balde = { ofertorio, pos: posPalavra, ceia, principal: principais };
    louvores.forEach((l, i) => balde[secaoDoLouvor(l)].push({ l, i }));

    // a Ceia só existe no culto de primeiro domingo — ou quando já
    // houver louvor guardado nela, para nada sumir da tela
    const temCeia = ehPrimeiroDomingo(proximaData(def.diaSemana)) || ceia.length > 0;

    const itensHTML = principais.length
      ? principais.map(x => louvorRowHTML(def.tipo, x.l, x.i)).join("")
      : `<div class="culto-empty">Nenhum louvor adicionado.</div>`;

    const ofertorioHTML = ofertorio.length
      ? ofertorio.map(x => louvorRowHTML(def.tipo, x.l, x.i)).join("")
      : `<div class="culto-empty">Nenhum ofertório definido.</div>`;

    const posHTML = posPalavra.length
      ? posPalavra.map(x => louvorRowHTML(def.tipo, x.l, x.i)).join("")
      : `<div class="culto-empty">Nenhum louvor de pós-palavra.</div>`;

    const ceiaHTML = ceia.length
      ? ceia.map(x => louvorRowHTML(def.tipo, x.l, x.i)).join("")
      : `<div class="culto-empty">Nenhum louvor da Ceia.</div>`;

    const secaoCeiaHTML = temCeia ? `
      <div class="culto-secao culto-secao-ceia">
        <div class="culto-secao-label">Ceia</div>
        <div class="culto-secao-bd">${ceiaHTML}</div>
        <button class="culto-add-btn culto-add-secao" onclick="abrirCultoModal('${def.tipo}','ceia')">+ Adicionar ceia</button>
      </div>` : "";

    const col = document.createElement("div");
    col.className = "culto-col";

    const atualizadoStr = tempoRelativo(dados.atualizado_em);
    const metaHTML = louvores.length
      ? `<div class="culto-col-meta">
           <span class="culto-atualizado">${atualizadoStr ? "Atualizado " + atualizadoStr : ""}</span>
           <button class="culto-copy-btn" onclick="copiarCulto('${def.tipo}')" title="Copiar lista">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
             Copiar
           </button>
         </div>`
      : "";

    // ministrante escalado do culto: select pra admin, texto pra quem só visualiza
    const escalado = dados.ministrante || "";
    const chipEscalado = CHIP_CLASS[escalado] || "";
    const optsEscalado = MINISTRANTES.map(m =>
      `<option${m === escalado ? " selected" : ""}>${m}</option>`).join("");
    const escalaHTML = `
      <div class="culto-escala">
        <span class="culto-escala-label">Ministrante</span>
        <select class="culto-escala-sel" onchange="definirEscalado('${def.tipo}', this.value)">
          <option value="">— escalar —</option>
          ${optsEscalado}
        </select>
        <span class="culto-escala-nome ${escalado ? chipEscalado : "culto-escala-vazio"}">${escalado || "A definir"}</span>
      </div>`;

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
      ${escalaHTML}
      <div class="culto-col-bd">${itensHTML}</div>
      <button class="culto-add-btn" onclick="abrirCultoModal('${def.tipo}')">+ Adicionar louvor</button>
      <div class="culto-secao culto-secao-pos">
        <div class="culto-secao-label">Pós-palavra</div>
        <div class="culto-secao-bd">${posHTML}</div>
        <button class="culto-add-btn culto-add-secao" onclick="abrirCultoModal('${def.tipo}','pos')">+ Adicionar pós-palavra</button>
      </div>
      ${secaoCeiaHTML}
      <div class="culto-secao">
        <div class="culto-secao-label">Ofertório</div>
        <div class="culto-secao-bd">${ofertorioHTML}</div>
        <button class="culto-add-btn culto-add-secao" onclick="abrirCultoModal('${def.tipo}','ofertorio')">+ Adicionar ofertório</button>
      </div>
      ${metaHTML}`;
    grid.appendChild(col);
  });
}

// ── persistência ──────────────────────────────────────────────
async function salvarCulto(tipo) {
  const dados = cultos[tipo];
  const agora = new Date().toISOString();
  const louvoresSerial = serializarLouvores(dados);
  const payload = { tipo, louvores: louvoresSerial, atualizado_em: agora };
  try {
    if (dados.id) {
      await req(`${CULTOS_TABLE}?id=eq.${dados.id}`, {
        method: "PATCH",
        body: JSON.stringify({ louvores: louvoresSerial, atualizado_em: agora }),
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

// define/troca o ministrante escalado de um culto
async function definirEscalado(tipo, valor) {
  if (!isAdmin()) { toast("Faça login para editar.", true); return; }
  const dados = cultos[tipo];
  if (!dados) return;
  const anterior = dados.ministrante || "";
  const anteriorData = dados.ministrante_data || null;
  if (valor === anterior) return;
  dados.ministrante = valor;
  // guarda a qual culto esta escala pertence, para expirar junto com ele
  dados.ministrante_data = valor ? dataAlvoCulto(tipo) : null;
  renderCultos();
  const ok = await salvarCulto(tipo);
  if (ok) {
    toast(valor ? `Escalado: ${valor} ✓` : "Ministrante removido ✓");
  } else {
    dados.ministrante = anterior; // desfaz em caso de erro
    dados.ministrante_data = anteriorData;
    renderCultos();
  }
}

async function removerLouvorCulto(tipo, idx) {
  if (!isAdmin()) { toast("Faça login para editar.", true); return; }
  cultos[tipo].louvores.splice(idx, 1);
  renderCultos();
  await salvarCulto(tipo);
}

// ── modal de adicionar louvor ─────────────────────────────────
function abrirCultoModal(tipo, secao = "principal") {
  if (!isAdmin()) { abrirLogin(); return; }
  cultoTipoAtual = tipo;
  cultoMusicaSel = null;
  cultoSecaoAtual = SECAO_LABEL[secao] ? secao : "principal";

  const def = CULTO_DEFS.find(d => d.tipo === tipo);
  const tituloSecao = cultoSecaoAtual === "principal" ? "ADICIONAR" : SECAO_LABEL[cultoSecaoAtual].toUpperCase();
  document.getElementById("cultoModalTitulo").textContent =
    `${tituloSecao} · ${def.titulo.toUpperCase()}`;

  // reset campos
  document.getElementById("cBuscaMusica").value = "";
  document.getElementById("cNovoNome").value = "";
  document.getElementById("cNovoTom").value = "";
  document.getElementById("cNovoMin").value = "";
  document.getElementById("cTomEscolhido").value = "";
  document.getElementById("cultoTomWrap").style.display = "none";

  cultoTab("escolher");
  filtrarMusicasCulto();

  document.getElementById("cultoOverlay").classList.add("open");
}

function fecharCultoModal() {
  document.getElementById("cultoOverlay").classList.remove("open");
  cultoTipoAtual = null;
  cultoMusicaSel = null;
  cultoSecaoAtual = "principal";
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

// ao escolher uma música do repertório, o tom já entra sozinho de acordo
// com o ministrante ESCALADO neste culto (se houver um tom pra ele).
function selecionarMusicaCulto(id) {
  const m = musicas.find(x => x.id == id);
  if (!m) return;
  cultoMusicaSel = m;

  document.querySelectorAll("#cultoMusicaList .culto-musica-opt").forEach(el => {
    el.classList.toggle("sel", el.dataset.id == id);
  });

  const pares = deserializarPares(m.tom);
  const tonsUnicos = [...new Set(pares.map(p => p.tom).filter(Boolean))];
  const sel = document.getElementById("cTomEscolhido");
  sel.innerHTML = `<option value="">Tom</option>` +
    tonsUnicos.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
  sel.onchange = null;

  // ministrante escalado para este culto (definido no topo da coluna)
  const escalado = cultos[cultoTipoAtual]?.ministrante || "";
  let tomAuto = "";

  if (escalado) {
    // acha o par cujo tom vale pra esse ministrante (real ou "Todos")
    const par = pares.find(p => {
      const reais = minsReaisDoPar(p, pares);
      return reais === null || reais.includes(escalado);
    });
    if (par) tomAuto = par.tom;
  }

  // fallback: só há um tom cadastrado
  if (!tomAuto && tonsUnicos.length === 1) tomAuto = tonsUnicos[0];

  sel.value = tomAuto;
  document.getElementById("cultoTomWrap").style.display = "";
}

// confirmar adição (das duas abas)
async function confirmarLouvorCulto() {
  if (!isAdmin()) { toast("Faça login para editar.", true); return; }
  const criando = document.getElementById("tabCriar").classList.contains("active");

  let nome, tom, min = "", musicaId = null;

  if (criando) {
    nome = document.getElementById("cNovoNome").value.trim();
    tom  = document.getElementById("cNovoTom").value;
    min  = document.getElementById("cNovoMin").value; // usado só pro cadastro no repertório
    if (!nome) { toast("Preencha o nome da música.", true); return; }
    if (!tom || !min) { toast("Selecione tom e ministrante.", true); return; }
  } else {
    if (!cultoMusicaSel) { toast("Escolha uma música.", true); return; }
    nome = cultoMusicaSel.nome;
    tom  = document.getElementById("cTomEscolhido").value;
    musicaId = cultoMusicaSel.id;
    if (!tom) { toast("Selecione o tom.", true); return; }
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
        // nasce com um tom só → já grava a tag "Todos", guardando o nome real
        const tomStr = serializarPares(normalizarParesParaSalvar([{ tom, mins: [min] }]));
        const nova = await req(TABLE, {
          method: "POST",
          body: JSON.stringify({ nome, tom: tomStr, ministrante: min, observacoes: "" }),
        });
        if (nova && nova[0]) musicaId = nova[0].id;
      }
    }

    // adiciona ao culto na seção em que o modal foi aberto
    // "data" = dia do culto a que o louvor pertence, usado para limpeza automática
    // obs.: o ministrante agora é por culto (escalado no topo), não por louvor
    const item = { musica_id: musicaId, nome, tom, data: dataAlvoCulto(cultoTipoAtual) };
    if (cultoSecaoAtual === "ofertorio") item.ofertorio = true;
    if (cultoSecaoAtual === "pos")       item.pos = true;
    if (cultoSecaoAtual === "ceia")      item.ceia = true;
    cultos[cultoTipoAtual].louvores.push(item);
    const ok = await salvarCulto(cultoTipoAtual);

    if (ok) {
      renderCultos();
      if (criando) await carregar(); // atualiza repertório/stats
      toast(cultoSecaoAtual === "principal"
        ? "Louvor adicionado ✓"
        : `${SECAO_LABEL[cultoSecaoAtual]} adicionado ✓`);
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
onScrollBusca();

//  Em paralelo, não em fila: os cultos respondem em ~100ms e o
//  repertório em ~800ms, e esperar um pelo outro deixava a página
//  em branco à toa.
//
//  Só que o disparo espera o DOMContentLoaded de propósito: os
//  arquivos carregados depois deste (paginas.js) trocam o que
//  cada página faz — sem a espera, a busca sairia antes da troca
//  e a página do repertório voltaria a buscar cultos.
function iniciar() {
  return Promise.all([
    carregar(),        // repertório
    carregarCultos(),  // cultos
  ]);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", iniciar);
} else {
  iniciar();
}