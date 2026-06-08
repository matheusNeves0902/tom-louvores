// ============================================================
//  APP.JS — Lógica principal
// ============================================================

const SUPABASE_URL = CONFIG.SUPABASE_URL;
const SUPABASE_KEY = CONFIG.SUPABASE_KEY;
const TABLE = CONFIG.TABLE_NAME;

let musicas = [];
let editandoId = null;

const MINISTRANTE_CORES = {
  "Raphaela":    { bg: "#F0EBF8", color: "#6B3FA0", borda: "#C9A8E8" },
  "Daniela":     { bg: "#EBF4FB", color: "#1A6FA3", borda: "#8EC8EF" },
  "Cris":        { bg: "#EBF8F2", color: "#1A7A4A", borda: "#7DD4A8" },
  "Mirian":      { bg: "#FDF0EB", color: "#A0460F", borda: "#F0A87A" },
  "Pr. Humberto":{ bg: "#F8F0EB", color: "#6B3010", borda: "#D4956A" },
};

// ——— API helpers ———

async function apiFetch(endpoint, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  const headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
    ...options.headers,
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function carregarMusicas() {
  try {
    const data = await apiFetch(`${TABLE}?order=criado_em.desc`);
    musicas = data || [];
    atualizarStats();
    atualizarFiltroTons();
    renderizar(musicas);
    definirStatus(true);
  } catch (e) {
    console.error("Erro ao carregar:", e);
    definirStatus(false);
    mostrarToast("Erro ao conectar com o banco de dados.", "erro");
    document.getElementById("loadingState").style.display = "none";
    document.getElementById("emptyState").style.display = "flex";
  }
}

async function salvarMusica() {
  const nome = document.getElementById("inputNome").value.trim();
  const tom  = document.getElementById("inputTom").value;
  const min  = document.getElementById("inputMinistrante").value;
  const obs  = document.getElementById("inputObs").value.trim();

  if (!nome || !tom || !min) {
    mostrarToast("Preencha nome, tom e ministrante.", "erro");
    return;
  }

  const btnSalvar = document.getElementById("btnSalvar");
  btnSalvar.disabled = true;
  btnSalvar.textContent = "Salvando...";

  const payload = { nome, tom, ministrante: min, observacoes: obs };

  try {
    if (editandoId) {
      await apiFetch(`${TABLE}?id=eq.${editandoId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      mostrarToast("Música atualizada com sucesso! ✓");
    } else {
      await apiFetch(TABLE, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      mostrarToast("Música adicionada com sucesso! ✓");
    }
    fecharModal();
    await carregarMusicas();
  } catch (e) {
    console.error("Erro ao salvar:", e);
    mostrarToast("Erro ao salvar a música.", "erro");
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.textContent = "Salvar Música";
  }
}

async function excluirMusica(id) {
  if (!confirm("Deseja excluir esta música?")) return;
  try {
    await apiFetch(`${TABLE}?id=eq.${id}`, { method: "DELETE" });
    mostrarToast("Música removida.");
    await carregarMusicas();
  } catch (e) {
    mostrarToast("Erro ao excluir.", "erro");
  }
}

// ——— UI ———

function renderizar(lista) {
  const grid   = document.getElementById("cardsGrid");
  const empty  = document.getElementById("emptyState");
  const loading = document.getElementById("loadingState");

  loading.style.display = "none";

  if (!lista.length) {
    grid.innerHTML = "";
    empty.style.display = "flex";
    return;
  }
  empty.style.display = "none";

  grid.innerHTML = lista.map(m => {
    const cor = MINISTRANTE_CORES[m.ministrante] || { bg: "#F5F5F5", color: "#555", borda: "#CCC" };
    const data = m.criado_em ? new Date(m.criado_em).toLocaleDateString("pt-BR") : "";
    return `
    <div class="card" data-id="${m.id}">
      <div class="card-top">
        <div class="card-tom">${m.tom}</div>
        <div class="card-actions">
          <button class="card-btn" title="Editar" onclick="editarMusica('${m.id}')">✏️</button>
          <button class="card-btn card-btn-del" title="Excluir" onclick="excluirMusica('${m.id}')">🗑️</button>
        </div>
      </div>
      <h3 class="card-nome">${escapeHtml(m.nome)}</h3>
      ${m.observacoes ? `<p class="card-obs">${escapeHtml(m.observacoes)}</p>` : ""}
      <div class="card-footer">
        <span class="chip-ministrante" style="background:${cor.bg};color:${cor.color};border-color:${cor.borda}">
          ${m.ministrante}
        </span>
        ${data ? `<span class="card-data">${data}</span>` : ""}
      </div>
    </div>`;
  }).join("");
}

function filtrar() {
  const busca = document.getElementById("busca").value.toLowerCase();
  const min   = document.getElementById("filtroMinistrante").value;
  const tom   = document.getElementById("filtroTom").value;
  const res = musicas.filter(m =>
    (!busca || m.nome.toLowerCase().includes(busca)) &&
    (!min   || m.ministrante === min) &&
    (!tom   || m.tom === tom)
  );
  renderizar(res);
}

function atualizarStats() {
  document.getElementById("totalMusicas").textContent = musicas.length;
  const tons = [...new Set(musicas.map(m => m.tom))];
  document.getElementById("totalTons").textContent = tons.length;
}

function atualizarFiltroTons() {
  const sel = document.getElementById("filtroTom");
  const atual = sel.value;
  const tons = [...new Set(musicas.map(m => m.tom))].sort();
  sel.innerHTML = `<option value="">Todos os tons</option>` +
    tons.map(t => `<option ${t === atual ? "selected" : ""}>${t}</option>`).join("");
}

function abrirModal(musica = null) {
  editandoId = musica ? musica.id : null;
  document.getElementById("modalTitle").textContent = musica ? "Editar Música" : "Nova Música";
  document.getElementById("inputNome").value = musica ? musica.nome : "";
  document.getElementById("inputTom").value  = musica ? musica.tom : "";
  document.getElementById("inputMinistrante").value = musica ? musica.ministrante : "";
  document.getElementById("inputObs").value  = musica ? (musica.observacoes || "") : "";
  document.getElementById("btnSalvar").textContent = musica ? "Salvar Alterações" : "Salvar Música";
  document.getElementById("modalOverlay").classList.add("open");
  setTimeout(() => document.getElementById("inputNome").focus(), 100);
}

function editarMusica(id) {
  const m = musicas.find(x => x.id == id);
  if (m) abrirModal(m);
}

function fecharModal() {
  document.getElementById("modalOverlay").classList.remove("open");
  editandoId = null;
}

function fecharModalFora(e) {
  if (e.target.id === "modalOverlay") fecharModal();
}

function mostrarToast(msg, tipo = "ok") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast show" + (tipo === "erro" ? " toast-erro" : "");
  setTimeout(() => t.className = "toast", 3000);
}

function definirStatus(ok) {
  const badge = document.getElementById("statusBadge");
  badge.className = "status-badge " + (ok ? "status-ok" : "status-erro");
  badge.innerHTML = `<span class="status-dot"></span>${ok ? "Conectado" : "Desconectado"}`;
}

function escapeHtml(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// Teclado
document.addEventListener("keydown", e => {
  if (e.key === "Escape") fecharModal();
});

// Init
carregarMusicas();