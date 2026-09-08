// ============================================================
//  TOM LOUVORES — ministrante da escala (Firebase)
//  Depois de carregar os cultos, se o campo Ministrante estiver
//  vazio, busca no Firestore quem está escalado para a data-alvo
//  daquele culto e grava no Supabase. Valor já preenchido
//  (manual ou anterior) nunca é sobrescrito.
//  Carregue DEPOIS do app.js. Só na página de cultos.
// ============================================================

const ESCALA_TURNO_POR_TIPO = {
  quarta: "único",
  domingo_manha: "manhã",
  domingo_noite: "noite",
};

function escalaCampoStr(fields, nome) {
  const f = fields && fields[nome];
  return f && f.stringValue != null ? f.stringValue : "";
}

// Firestore REST: louvor + data; filtramos função/turno no cliente
async function escalaBuscarDocsDoCulto(data) {
  const projectId = CONFIG.FIREBASE && CONFIG.FIREBASE.projectId;
  if (!projectId || !data) return [];

  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents:runQuery`;

  const body = {
    structuredQuery: {
      from: [{ collectionId: "escalas" }],
      where: {
        compositeFilter: {
          op: "AND",
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: "ministerioId" },
                op: "EQUAL",
                value: { stringValue: "louvor" },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: "data" },
                op: "EQUAL",
                value: { stringValue: data },
              },
            },
          ],
        },
      },
    },
  };

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("Firestore runQuery " + r.status);

  const rows = await r.json();
  if (!Array.isArray(rows)) return [];

  return rows
    .map(row => row.document && row.document.fields)
    .filter(Boolean);
}

function escalaNomeNoTomLouvores(pessoaNome) {
  if (!pessoaNome) return "";
  const lower = String(pessoaNome).trim().toLowerCase();
  return MINISTRANTES.find(m => m.toLowerCase() === lower) || "";
}

async function escalaMinistranteDoTipo(tipo) {
  const turno = ESCALA_TURNO_POR_TIPO[tipo];
  if (!turno) return "";

  const data = dataAlvoCulto(tipo);
  const docs = await escalaBuscarDocsDoCulto(data);
  const doc = docs.find(
    f =>
      escalaCampoStr(f, "funcao") === "MINISTRANTE" &&
      escalaCampoStr(f, "turno") === turno
  );
  if (!doc) return "";

  return escalaNomeNoTomLouvores(escalaCampoStr(doc, "pessoaNome"));
}

// igual à limpeza automática: persiste sem exigir login de admin
async function escalaPreencherSeVazio(tipo, nome) {
  const dados = cultos[tipo];
  if (!dados || !nome) return false;
  if (dados.ministrante) return false; // manual / já preenchido vence

  dados.ministrante = nome;
  dados.ministrante_data = dataAlvoCulto(tipo);

  const ok = await salvarCulto(tipo);
  if (!ok) {
    dados.ministrante = "";
    dados.ministrante_data = null;
    return false;
  }
  return true;
}

async function escalaSincronizarMinistrantes() {
  if (typeof CULTO_DEFS === "undefined" || !CULTO_DEFS.length) return;
  if (!CONFIG.FIREBASE || !CONFIG.FIREBASE.projectId) return;

  let mudou = false;

  for (const def of CULTO_DEFS) {
    const dados = cultos[def.tipo];
    if (!dados || dados.ministrante) continue; // não sobrescreve

    try {
      const nome = await escalaMinistranteDoTipo(def.tipo);
      if (!nome) continue;
      if (await escalaPreencherSeVazio(def.tipo, nome)) mudou = true;
    } catch (e) {
      console.error("Escala Firebase (" + def.tipo + "):", e);
    }
  }

  if (mudou) renderCultos();
}

// ── enxerto: roda após cada carga de cultos ─────────────────
const escalaCarregarCultosOriginal = carregarCultos;
carregarCultos = async function () {
  await escalaCarregarCultosOriginal.apply(this, arguments);
  await escalaSincronizarMinistrantes();
};
