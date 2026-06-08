// ============================================================
//  TOM LOUVORES — app.js
// ============================================================

const URL_BASE = CONFIG.SUPABASE_URL;
const KEY      = CONFIG.SUPABASE_KEY;
const TABLE    = CONFIG.TABLE_NAME;

let musicas    = [];
let editandoId = null;

// pares ativos no modal: [{tom, ministrante}, ...]
let tomMinList = [];

const CHIP_CLASS = {
  "Raphaela":    "chip-Raphaela",
  "Daniela":     "chip-Daniela",
  "Cris":        "chip-Cris",
  "Mirian":      "chip-Mirian",
  "Pr. Humberto":"chip-Humberto",
};

// ——— Serialização ———
// No banco: campo "tom" guarda JSON string  → '[{"tom":"G","min":"Raphaela"},...]'
// Campo "ministrante" não é mais usado, fica vazio para compatibilidade.

function serializarPares(lista) {
  return JSON.stringify(lista);
}

function deserializarPares(str) {
  if (!str) return [];
  // Suporte ao formato antigo (string simples "G" ou "G, D")
  if (!str.startsWith("[")) {
    return str.split(",").map(t => ({ tom: t.trim(), min: "" })).filter(x => x.tom);
  }
  try { return JSON.parse(str); } catch { return []; }
}

// ——— API ———

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

async function carregar() {
  try {
    musicas = await req(`${TABLE}?order=criado_em.desc`) || [];
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
  const nome = document.getElementById("fNome").value.trim();
  const obs  = document.getElementById("fObs").value.trim();

  if (!nome)              { toast("Preencha o nome da música.", true); return; }
  if (!tomMinList.length) { toast("Adicione ao menos um tom e ministrante.", true); return; }

  const btn = document.getElementById("btnSalvar");
  btn.disabled = true; btn.textContent = "Salvando...";

  // tom = JSON string com pares; ministrante = lista simples para compatibilidade nos filtros
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
  if (!confirm("Excluir esta música?")) return;
  try {
    await req(`${TABLE}?id=eq.${id}`, { method: "DELETE" });
    toast("Música removida.");
    await carregar();
  } catch {
    toast("Erro ao excluir.", true);
  }
}

// ——— Tom+Min no modal ———

function adicionarTomMin() {
  const tom = document.getElementById("fTom").value;
  const min = document.getElementById("fMin").value;
  if (!tom || !min) { toast("Selecione tom e ministrante antes de adicionar.", true); return; }

  // Não permite duplicar o mesmo tom
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

// ——— Render cards ———

function render(lista) {
  const grid  = document.getElementById("grid");
  const empty = document.getElementById("stEmpty");
  document.getElementById("stLoading").style.display = "none";

  grid.querySelectorAll(".card").forEach(c => c.remove());

  const badge = document.getElementById("countBadge");
  if (badge) {
    badge.textContent = lista.length === musicas.length
      ? musicas.length + " músicas"
      : lista.length + " de " + musicas.length;
  }

  if (!lista.length) { empty.style.display = "flex"; return; }
  empty.style.display = "none";

  lista.forEach(m => {
    const pares = deserializarPares(m.tom);
    const data  = m.criado_em ? new Date(m.criado_em).toLocaleDateString("pt-BR") : "";

    // Linhas tom · ministrante
    const tonsHTML = pares.map(p => {
      const chip = CHIP_CLASS[p.min] || "";
      return `
        <div class="card-ton-row">
          <span class="card-badge">${esc(p.tom)}</span>
          ${p.min ? `<span class="card-min-label ${chip}">${esc(p.min)}</span>` : ""}
        </div>`;
    }).join("") || `<div class="card-ton-row"><span class="card-badge">${esc(m.tom)}</span></div>`;

    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div class="card-head">
        <p class="card-nome">${esc(m.nome)}</p>
        <div class="card-acts">
          <button class="act-btn"     title="Editar"  onclick="editar('${m.id}')">✏</button>
          <button class="act-btn del" title="Excluir" onclick="excluir('${m.id}')">✕</button>
        </div>
      </div>
      <div class="card-tons">${tonsHTML}</div>
      ${m.observacoes ? `<p class="card-obs">${esc(m.observacoes)}</p>` : ""}
      ${data ? `<div class="card-foot"><span class="card-date">${data}</span></div>` : ""}`;
    grid.appendChild(div);
  });
}

// ——— Filtros ———

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
  sel.innerHTML = `<option value="">Todos os tons</option>` +
    tons.map(t => `<option${t === cur ? " selected" : ""}>${t}</option>`).join("");
}

// ——— Modal ———

function abrirModal(m = null) {
  editandoId  = m ? m.id : null;
  tomMinList  = m ? deserializarPares(m.tom) : [];

  document.getElementById("modalTitulo").textContent = m ? "EDITAR MÚSICA" : "NOVA MÚSICA";
  document.getElementById("fNome").value = m?.nome       || "";
  document.getElementById("fObs").value  = m?.observacoes || "";
  document.getElementById("fTom").value  = "";
  document.getElementById("fMin").value  = "";
  document.getElementById("btnSalvar").textContent = m ? "SALVAR ALTERAÇÕES" : "SALVAR";

  renderTomList();
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
}

function fecharFora(e) {
  if (e.target.id === "overlay") fecharModal();
}

// ——— Utils ———

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

document.addEventListener("keydown", e => { if (e.key === "Escape") fecharModal(); });

carregar();