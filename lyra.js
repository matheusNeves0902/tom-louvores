// ============================================================
//  TOM LOUVORES — integração com o Lyra
//  API pública, somente leitura, sem chave.
//  Cifra e letra abrem DENTRO do site, num leitor próprio.
//  Carregue DEPOIS do app.js. Não altera nada do app.js.
// ============================================================

const LYRA_API = "https://lyra-music-database.vercel.app/api/v1";

const lyraCacheBusca  = new Map();  // nome normalizado → música do Lyra (ou null)
const lyraPendentes   = new Map();  // nome normalizado → busca em andamento
const lyraCacheCifra  = new Map();  // "slug|tom|instrumento" → texto da cifra
const lyraCacheLetra  = new Map();  // slug → letra

let lyraToken     = 0;     // descarta carregamentos de cifra/letra atrasados
let lyraTokenView = 0;     // descarta buscas atrasadas do modal de leitura
let lyraNavToken  = 0;     // descarta trocas de música atrasadas (setas)
let lyraNavegando = false; // trava a seta enquanto a troca não termina

let lyraAtual  = null;     // { song, tom, instrumento, modo, tonsDaCasa, nav }
let lyraZoom   = 100;      // tamanho do texto, em %
let lyraQuebra = false;    // quebrar linhas longas em vez de rolar na horizontal
let lyraClaro  = false;    // leitor no modo claro

// nas pontas da lista não existe próxima/anterior com cifra:
// a seta apaga em vez de disparar um aviso na tela
let lyraFimLista = { ant: false, prox: false };

let lyraListaVisivel = []; // repertório como está filtrado na tela
let lyraCtxCulto = null;   // culto de onde a música foi aberta, se foi

const LYRA_FONTE_BASE = 15;   // px a 100%

// preferências de leitura sobrevivem entre sessões
try {
  const salvo = JSON.parse(localStorage.getItem("lyra_prefs") || "{}");
  if (typeof salvo.zoom   === "number")  lyraZoom   = salvo.zoom;
  if (typeof salvo.quebra === "boolean") lyraQuebra = salvo.quebra;
  if (typeof salvo.claro  === "boolean") lyraClaro  = salvo.claro;
} catch (e) { /* sem preferências salvas */ }

function lyraSalvarPrefs() {
  try {
    localStorage.setItem("lyra_prefs",
      JSON.stringify({ zoom: lyraZoom, quebra: lyraQuebra, claro: lyraClaro }));
  } catch (e) { /* modo privado, por exemplo */ }
}

// ── Texto ────────────────────────────────────────────────────

function lyraNorm(s = "") {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .trim().toLowerCase().replace(/\s+/g, " ");
}

function lyraEsc(s = "") {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Cache das buscas, guardado no aparelho ───────────────────
//  Sem isso, toda visita começa do zero e a primeira abertura de
//  cada música precisa esperar a API responder.

const LYRA_CACHE_KEY  = "lyra_busca_v1";
const LYRA_CACHE_DIAS = 14;

// só o que o leitor usa — mantém o armazenamento pequeno
function lyraEnxugar(s) {
  if (!s) return null;
  return {
    slug: s.slug, title: s.title, artist: s.artist,
    keys: s.keys, base_key: s.base_key, has_chords: s.has_chords,
  };
}

(function lyraLerCacheDoDisco() {
  try {
    const bruto  = JSON.parse(localStorage.getItem(LYRA_CACHE_KEY) || "{}");
    const limite = Date.now() - LYRA_CACHE_DIAS * 864e5;
    Object.keys(bruto).forEach(chave => {
      const reg = bruto[chave];
      if (reg && reg.t > limite) lyraCacheBusca.set(chave, reg.s);
    });
  } catch (e) { /* cache corrompido: começa vazio */ }
})();

let lyraGravarTimer = null;
function lyraGravarCache() {
  clearTimeout(lyraGravarTimer);
  lyraGravarTimer = setTimeout(() => {
    try {
      const obj = {}, agora = Date.now();
      lyraCacheBusca.forEach((s, chave) => { obj[chave] = { s, t: agora }; });
      localStorage.setItem(LYRA_CACHE_KEY, JSON.stringify(obj));
    } catch (e) { /* sem espaço ou modo privado */ }
  }, 1500);
}

// ── Tons ─────────────────────────────────────────────────────

// o Lyra nomeia o mesmo tom com bemol quando o tom base pede:
// uma música em C lista "Db", não "C#".
const LYRA_ENARMONIA = {
  "C#": "Db", "Db": "C#",
  "D#": "Eb", "Eb": "D#",
  "F#": "Gb", "Gb": "F#",
  "G#": "Ab", "Ab": "G#",
  "A#": "Bb", "Bb": "A#",
};

function lyraPartesTom(tom = "") {
  const t = String(tom).trim();
  const menor = /m$/.test(t) && !/^[A-G][#b]?$/.test(t);
  return { raiz: menor ? t.slice(0, -1) : t, menor };
}

// "F#m" → "fsm"   |   "Bb" → "bb"   |   "C" → "c"
function lyraKeySlug(tom) {
  const { raiz, menor } = lyraPartesTom(tom);
  return raiz.replace("#", "s").toLowerCase() + (menor ? "m" : "");
}

// como o Lyra escreve este tom nesta música (ou null)
function lyraTomDisponivel(tom, keys = []) {
  if (!tom) return null;
  const { raiz, menor } = lyraPartesTom(tom);
  const sufixo = menor ? "m" : "";
  const alvos = [raiz, LYRA_ENARMONIA[raiz]].filter(Boolean).map(r => r + sufixo);
  return keys.find(k => alvos.includes(k)) || null;
}

// ── Busca da música ──────────────────────────────────────────

function lyraTemNoCache(nome) {
  return lyraCacheBusca.has(lyraNorm(nome));
}

function lyraDoCache(nome) {
  return lyraCacheBusca.get(lyraNorm(nome)) || null;
}

async function lyraBuscar(nome) {
  const chave = lyraNorm(nome);
  if (!chave) return null;
  if (lyraCacheBusca.has(chave)) return lyraCacheBusca.get(chave);
  if (lyraPendentes.has(chave))  return lyraPendentes.get(chave);

  const busca = (async () => {
    let achada = null;
    try {
      const url = `${LYRA_API}/songs?q=${encodeURIComponent(nome)}&fields=title&limit=8`;
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        const res  = data.results || [];
        achada = res.find(s => lyraNorm(s.title) === chave)
              || res.find(s => lyraNorm(s.title).startsWith(chave))
              || null;
      } else {
        return null;                    // erro do servidor não vira cache
      }
    } catch (e) {
      console.warn("Cifras indisponíveis:", e);
      return null;                      // sem rede: tenta de novo depois
    }

    lyraCacheBusca.set(chave, lyraEnxugar(achada));
    lyraGravarCache();
    return lyraCacheBusca.get(chave);
  })();

  lyraPendentes.set(chave, busca);
  try { return await busca; }
  finally { lyraPendentes.delete(chave); }
}

// ── Pré-carregamento ─────────────────────────────────────────
//  Assim que o repertório aparece na tela, as buscas vão sendo
//  feitas em segundo plano, de três em três. Quando a pessoa abre
//  a música, a resposta já está aqui e o botão certo entra pronto.

const lyraFila = [];
let lyraFilaAtivos = 0;
const LYRA_FILA_MAX = 3;

function lyraRodarFila() {
  while (lyraFilaAtivos < LYRA_FILA_MAX && lyraFila.length) {
    const nome = lyraFila.shift();
    lyraFilaAtivos++;
    lyraBuscar(nome).catch(() => {}).then(() => {
      lyraFilaAtivos--;
      lyraRodarFila();
    });
  }
}

function lyraAgendarBusca(nome) {
  const chave = lyraNorm(nome);
  if (!chave || lyraCacheBusca.has(chave) || lyraPendentes.has(chave)) return;
  if (lyraFila.some(n => lyraNorm(n) === chave)) return;
  lyraFila.push(nome);
}

const lyraOcioso = window.requestIdleCallback || (fn => setTimeout(fn, 300));

function lyraPreCarregar(nomes) {
  if (!nomes || !nomes.length) return;
  lyraOcioso(() => {
    nomes.filter(Boolean).forEach(lyraAgendarBusca);
    lyraRodarFila();
  });
}

// os louvores já escalados nos cultos vêm primeiro na fila
function lyraPreCarregarCultos() {
  if (typeof cultos === "undefined" || !cultos) return;
  const nomes = [];
  Object.values(cultos).forEach(c => {
    (c && c.louvores || []).forEach(l => l && l.nome && nomes.push(l.nome));
  });
  lyraPreCarregar(nomes);
}
[1200, 4000, 10000].forEach(ms => setTimeout(lyraPreCarregarCultos, ms));

// ── Reconhecer linhas de acorde ──────────────────────────────

const LYRA_RE_ACORDE = /^[A-G](#|b)?(m|maj|min|sus|dim|aug|add|M)?\d*(\((.*?)\))?(\/[A-G](#|b)?)?$/;

function lyraEhLinhaDeAcorde(linha) {
  const t = linha.trim();
  if (!t) return false;
  if (t.startsWith("[")) return true;              // [Intro], [Refrão]...
  const tokens = t.split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  const acordes = tokens.filter(tk => LYRA_RE_ACORDE.test(tk.replace(/^\[|\]$/g, "")));
  return acordes.length / tokens.length >= 0.6;
}

function lyraFracaoAcordes(texto) {
  const linhas = texto.split("\n").filter(l => l.trim());
  if (!linhas.length) return 0;
  return linhas.filter(lyraEhLinhaDeAcorde).length / linhas.length;
}

// ── Cifra ────────────────────────────────────────────────────

// acha o texto da cifra na resposta, sem depender do nome do campo
function lyraExtrairCifra(obj) {
  if (typeof obj === "string") return obj;
  if (!obj || typeof obj !== "object") return "";

  const provaveis = ["chords", "chord_sheet", "chordsheet", "cifra",
                     "content", "text", "body", "sheet", "chart"];
  for (const campo of provaveis) {
    if (typeof obj[campo] === "string" && obj[campo].includes("\n")) return obj[campo];
  }

  let melhor = "";
  const visitar = v => {
    if (typeof v === "string") {
      if (v.includes("\n") && v.length > melhor.length) melhor = v;
    } else if (v && typeof v === "object") {
      Object.values(v).forEach(visitar);
    }
  };
  visitar(obj);

  if (!melhor) console.warn("Não achei a cifra nesta resposta →", obj);
  return melhor;
}

async function lyraCarregarCifra(slug, tomLyra, instrumento) {
  const chave = `${slug}|${tomLyra}|${instrumento}`;
  if (lyraCacheCifra.has(chave)) return lyraCacheCifra.get(chave);

  const qs  = instrumento === "violao" ? "?instrumento=violao" : "";
  const url = `${LYRA_API}/songs/${slug}/chords/${lyraKeySlug(tomLyra)}${qs}`;

  const r = await fetch(url);
  if (!r.ok) throw new Error(`Resposta ${r.status}`);

  const bruto = await r.text();
  let texto;
  try { texto = lyraExtrairCifra(JSON.parse(bruto)); }
  catch { texto = bruto; }

  lyraCacheCifra.set(chave, texto);
  return texto;
}

// ── Letra ────────────────────────────────────────────────────

// a letra é o maior texto multilinha que NÃO parece cifra
function lyraExtrairLetra(obj) {
  if (typeof obj === "string") return obj;
  if (!obj || typeof obj !== "object") return "";

  const provaveis = ["lyrics", "letra", "lyric", "lyrics_text", "letra_texto"];
  for (const campo of provaveis) {
    if (typeof obj[campo] === "string" && obj[campo].trim()) return obj[campo];
  }

  let melhor = "";
  const visitar = v => {
    if (typeof v === "string") {
      if (v.includes("\n") && v.length > melhor.length && lyraFracaoAcordes(v) < 0.15) melhor = v;
    } else if (v && typeof v === "object") {
      Object.values(v).forEach(visitar);
    }
  };
  visitar(obj);

  if (!melhor) console.warn("Não achei a letra nesta resposta →", obj);
  return melhor;
}

async function lyraCarregarLetra(slug) {
  if (lyraCacheLetra.has(slug)) return lyraCacheLetra.get(slug);

  const r = await fetch(`${LYRA_API}/songs/${slug}`);
  if (!r.ok) throw new Error(`Resposta ${r.status}`);

  const bruto = await r.text();
  let texto;
  try { texto = lyraExtrairLetra(JSON.parse(bruto)); }
  catch { texto = bruto; }

  lyraCacheLetra.set(slug, texto);
  return texto;
}

// ── Montagem do texto na tela ────────────────────────────────

function lyraCifraParaHTML(texto) {
  return texto.split("\n").map(linha => {
    const cls = lyraEhLinhaDeAcorde(linha) ? "lyra-acordes" : "lyra-letra";
    return `<span class="${cls}">${lyraEsc(linha) || " "}</span>`;
  }).join("\n");
}

function lyraLetraParaHTML(texto) {
  return texto.split("\n").map(linha => {
    const t = linha.trim();
    const cls = (t.startsWith("[") || /^\(.*\)$/.test(t)) ? "lyra-secao" : "lyra-letra";
    return `<span class="${cls}">${lyraEsc(linha) || " "}</span>`;
  }).join("\n");
}

// ── Lista de navegação ───────────────────────────────────────
//  De um culto: a ordem dos louvores daquele culto.
//  Do repertório: a lista como está filtrada na tela.

function lyraMontarNav(m, ctxCulto) {
  if (ctxCulto && typeof cultos !== "undefined" && cultos[ctxCulto.tipo]) {
    const louvores = cultos[ctxCulto.tipo].louvores || [];
    return {
      itens: louvores.map(l => ({ nome: l.nome, tom: l.tom })),
      idx: ctxCulto.idx,
    };
  }

  const lista = lyraListaVisivel || [];
  const idx = lista.findIndex(x => x.id == m.id);
  if (idx < 0) return null;

  return {
    itens: lista.map(x => ({
      nome: x.nome,
      tom: (deserializarPares(x.tom)[0] || {}).tom || "",
    })),
    idx,
  };
}

// ── Setas de navegação ───────────────────────────────────────

// liga/desliga as duas setas enquanto a troca está em andamento
function lyraSetasOcupadas(ocupado) {
  ["lyraAnt", "lyraProx"].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.disabled = ocupado;
  });
}

// mostra as setas só quando há lista, e apaga a que não leva a lugar nenhum
function lyraAtualizarSetas() {
  const ant  = document.getElementById("lyraAnt");
  const prox = document.getElementById("lyraProx");
  if (!ant || !prox) return;

  const nav = lyraAtual && lyraAtual.nav;
  if (!nav || !nav.itens || nav.itens.length < 2) {
    ant.style.display = prox.style.display = "none";
    return;
  }

  ant.style.display = prox.style.display = "";
  ant.disabled  = nav.idx <= 0                    || lyraFimLista.ant;
  prox.disabled = nav.idx >= nav.itens.length - 1  || lyraFimLista.prox;
}

async function lyraIrPara(direcao) {
  if (!lyraAtual || !lyraAtual.nav || lyraNavegando) return;

  const { itens } = lyraAtual.nav;
  const modo = lyraAtual.modo;
  let i = lyraAtual.nav.idx;

  // já está na ponta: a seta está apagada, não há nada a fazer
  if ((direcao > 0 && i >= itens.length - 1) || (direcao < 0 && i <= 0)) return;

  const meuNav = ++lyraNavToken;
  lyraNavegando = true;
  lyraSetasOcupadas(true);

  const corpo = document.getElementById("lyraCorpo");
  const antes = corpo.innerHTML;      // volta ao que estava se nada for achado
  lyraToken++;                        // cancela um carregamento ainda no ar

  // só mostra "procurando" se a resposta não vier na hora
  const avisar = setTimeout(() => {
    if (meuNav === lyraNavToken)
      corpo.innerHTML = `<div class="lyra-msg">Procurando a próxima música...</div>`;
  }, 180);

  try {
    for (let passo = 0; passo < 40; passo++) {
      i += direcao;
      if (i < 0 || i >= itens.length) break;

      const item = itens[i];
      const song = lyraTemNoCache(item.nome) ? lyraDoCache(item.nome)
                                             : await lyraBuscar(item.nome);
      if (meuNav !== lyraNavToken) return;   // outra troca começou no meio
      if (!song || !song.has_chords) continue;

      clearTimeout(avisar);
      lyraFimLista = { ant: false, prox: false };
      lyraAtual = {
        song, modo,
        tom: lyraTomDisponivel(item.tom, song.keys) || song.base_key || (song.keys || [])[0],
        instrumento: "teclado",
        tonsDaCasa: [item.tom].filter(Boolean),
        nav: { itens, idx: i },
      };
      lyraAtualizarCabecalho();
      lyraPreencherTons();
      lyraAplicarModo();
      lyraRenderConteudo();
      return;
    }

    // acabou a lista naquela direção: fica onde estava, sem aviso na tela
    if (meuNav === lyraNavToken && lyraAtual) {
      clearTimeout(avisar);
      lyraFimLista[direcao > 0 ? "prox" : "ant"] = true;
      corpo.innerHTML = antes;
      lyraAplicarEstiloTexto();
    }
  } finally {
    clearTimeout(avisar);
    if (meuNav === lyraNavToken) {
      lyraNavegando = false;
      lyraSetasOcupadas(false);
      lyraAtualizarSetas();
    }
  }
}

// ── Ícones ───────────────────────────────────────────────────

const LYRA_ICO_QUEBRA = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 12h13a3 3 0 0 1 0 6h-2"/><path d="M16 16l-2 2 2 2"/><path d="M3 18h6"/></svg>`;
const LYRA_ICO_ANT    = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`;
const LYRA_ICO_PROX   = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`;
const LYRA_ICO_SOL    = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
const LYRA_ICO_LUA    = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`;
const LYRA_ICO_CIFRA  = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/></svg>`;
const LYRA_ICO_LETRA  = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 11h16M4 16h10"/></svg>`;

// ── Modal do leitor ──────────────────────────────────────────

function lyraMontarEstrutura() {
  if (document.getElementById("lyraOverlay")) return;

  const ov = document.createElement("div");
  ov.id = "lyraOverlay";
  ov.innerHTML = `
    <div class="lyra-box" id="lyraBox" role="dialog" aria-modal="true">
      <div class="lyra-hd">
        <div class="lyra-hd-txt">
          <h3 id="lyraTitulo"></h3>
          <p id="lyraArtista"></p>
        </div>
        <div class="lyra-hd-acoes">
          <button class="lyra-btn" id="lyraAnt"  aria-label="Música anterior">${LYRA_ICO_ANT}</button>
          <button class="lyra-btn" id="lyraProx" aria-label="Próxima música">${LYRA_ICO_PROX}</button>
          <button class="lyra-x"   id="lyraFechar" aria-label="Fechar">&#10005;</button>
        </div>
      </div>

      <div class="lyra-barra">
        <div class="lyra-grupo">
          <div class="lyra-seg" id="lyraSeg">
            <button data-modo="cifra">Cifra</button>
            <button data-modo="letra">Letra</button>
          </div>
          <span class="lyra-grupo-tom" id="lyraGrupoTom">
            <span class="lyra-lbl">Tom</span>
            <span class="lyra-tom">
              <select id="lyraTomSel" aria-label="Tom da cifra"></select>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
            </span>
          </span>
          <button class="lyra-btn" id="lyraTema" aria-label="Alternar fundo claro"></button>
        </div>

        <div class="lyra-grupo">
          <button class="lyra-btn" id="lyraQuebraBtn" aria-label="Quebrar linhas longas"
                  title="Quebrar linhas longas">${LYRA_ICO_QUEBRA}</button>
          <div class="lyra-seg">
            <button id="lyraMenos" aria-label="Diminuir letra">A&minus;</button>
            <span class="lyra-pct" id="lyraPct">100%</span>
            <button id="lyraMais" aria-label="Aumentar letra">A+</button>
          </div>
        </div>
      </div>

      <div class="lyra-corpo" id="lyraCorpo"></div>
    </div>`;
  document.body.appendChild(ov);

  ov.addEventListener("click", e => { if (e.target === ov) lyraFecharLeitor(); });
  document.getElementById("lyraFechar").addEventListener("click", lyraFecharLeitor);
  document.getElementById("lyraAnt").addEventListener("click",  () => lyraIrPara(-1));
  document.getElementById("lyraProx").addEventListener("click", () => lyraIrPara(+1));

  document.getElementById("lyraSeg").querySelectorAll("[data-modo]").forEach(b =>
    b.addEventListener("click", () => {
      if (!lyraAtual || lyraAtual.modo === b.dataset.modo) return;
      lyraAtual.modo = b.dataset.modo;
      lyraAplicarModo();
      lyraRenderConteudo();
    }));

  document.getElementById("lyraTomSel").addEventListener("change", e => {
    if (!lyraAtual) return;
    lyraAtual.tom = e.target.value;
    lyraRenderConteudo();
  });

  document.getElementById("lyraTema").addEventListener("click", () => {
    lyraClaro = !lyraClaro;
    lyraAplicarTema();
    lyraSalvarPrefs();
  });

  document.getElementById("lyraQuebraBtn").addEventListener("click", () => {
    lyraQuebra = !lyraQuebra;
    lyraAplicarEstiloTexto();
    lyraSalvarPrefs();
  });

  document.getElementById("lyraMenos").addEventListener("click", () => lyraAjustarZoom(-10));
  document.getElementById("lyraMais").addEventListener("click",  () => lyraAjustarZoom(+10));

  lyraLigarArraste(document.getElementById("lyraCorpo"));

  // Esc fecha só o leitor; setas trocam de música
  document.addEventListener("keydown", e => {
    if (!ov.classList.contains("open")) return;
    if (e.key === "Escape")     { e.stopPropagation(); lyraFecharLeitor(); }
    if (e.key === "ArrowRight") { e.stopPropagation(); lyraIrPara(+1); }
    if (e.key === "ArrowLeft")  { e.stopPropagation(); lyraIrPara(-1); }
  }, true);
}

// arrastar para o lado troca de música — mas só quando o texto
// já chegou ao fim da rolagem horizontal, para não brigar com ela
function lyraLigarArraste(corpo) {
  let x0 = 0, y0 = 0, t0 = 0;

  corpo.addEventListener("touchstart", e => {
    const t = e.changedTouches[0];
    x0 = t.clientX; y0 = t.clientY; t0 = Date.now();
  }, { passive: true });

  corpo.addEventListener("touchend", e => {
    const t = e.changedTouches[0];
    const dx = t.clientX - x0;
    const dy = t.clientY - y0;

    if (Date.now() - t0 > 700) return;                    // arrasto lento: ignora
    if (Math.abs(dx) < 70) return;                        // curto demais
    if (Math.abs(dx) < Math.abs(dy) * 1.8) return;        // foi rolagem vertical

    const naBorda = dx < 0
      ? corpo.scrollLeft + corpo.clientWidth >= corpo.scrollWidth - 2
      : corpo.scrollLeft <= 2;
    if (!naBorda) return;

    lyraIrPara(dx < 0 ? +1 : -1);
  }, { passive: true });
}

function lyraAjustarZoom(passo) {
  lyraZoom = Math.min(220, Math.max(60, lyraZoom + passo));
  lyraAplicarEstiloTexto();
  lyraSalvarPrefs();
}

function lyraAplicarTema() {
  const box = document.getElementById("lyraBox");
  if (box) box.classList.toggle("claro", lyraClaro);
  const btn = document.getElementById("lyraTema");
  if (btn) {
    btn.innerHTML = lyraClaro ? LYRA_ICO_LUA : LYRA_ICO_SOL;
    btn.setAttribute("aria-label", lyraClaro ? "Voltar ao fundo escuro" : "Usar fundo claro");
  }
}

function lyraAplicarEstiloTexto() {
  const emCifra = !lyraAtual || lyraAtual.modo === "cifra";
  document.getElementById("lyraPct").textContent = lyraZoom + "%";
  document.getElementById("lyraQuebraBtn").classList.toggle("on", lyraQuebra && emCifra);

  const pre = document.querySelector("#lyraCorpo .lyra-pre");
  if (!pre) return;
  pre.style.fontSize = (LYRA_FONTE_BASE * lyraZoom / 100).toFixed(1) + "px";
  pre.classList.toggle("quebra", lyraQuebra && emCifra);
}

// mostra/esconde o que só faz sentido na cifra
function lyraAplicarModo() {
  const emCifra = lyraAtual.modo === "cifra";
  document.getElementById("lyraGrupoTom").style.display  = emCifra ? "" : "none";
  document.getElementById("lyraQuebraBtn").style.display = emCifra ? "" : "none";

  document.getElementById("lyraSeg").querySelectorAll("[data-modo]").forEach(b =>
    b.classList.toggle("on", b.dataset.modo === lyraAtual.modo));
}

function lyraFecharLeitor() {
  const ov = document.getElementById("lyraOverlay");
  if (ov) ov.classList.remove("open");
  document.body.classList.remove("lyra-travado");
  lyraNavToken++;
  lyraNavegando = false;
  lyraAtual = null;
}

function lyraAtualizarCabecalho() {
  document.getElementById("lyraTitulo").textContent  = lyraAtual.song.title  || "";
  document.getElementById("lyraArtista").textContent = lyraAtual.song.artist || "";
}

function lyraPreencherTons() {
  const { song, tom } = lyraAtual;
  const sel = document.getElementById("lyraTomSel");
  sel.innerHTML = (song.keys || [])
    .map(k => `<option value="${lyraEsc(k)}">${lyraEsc(k)}</option>`)
    .join("");
  sel.value = tom;
}

async function lyraRenderConteudo() {
  const corpo = document.getElementById("lyraCorpo");
  const { song, tom, instrumento, modo } = lyraAtual;
  const meuToken = ++lyraToken;

  corpo.innerHTML = `<div class="lyra-msg">${
    modo === "letra" ? "Carregando letra..." : `Carregando cifra em ${lyraEsc(tom)}...`
  }</div>`;

  try {
    const texto = modo === "letra"
      ? await lyraCarregarLetra(song.slug)
      : await lyraCarregarCifra(song.slug, tom, instrumento);

    if (meuToken !== lyraToken || !lyraAtual) return;

    if (!texto) {
      corpo.innerHTML = `<div class="lyra-msg">${
        modo === "letra"
          ? "Esta música não tem letra cadastrada."
          : `Esta música não tem cifra em ${lyraEsc(tom)}.`
      }</div>`;
      return;
    }

    corpo.innerHTML = modo === "letra"
      ? `<pre class="lyra-pre letra">${lyraLetraParaHTML(texto)}</pre>`
      : `<pre class="lyra-pre">${lyraCifraParaHTML(texto)}</pre>`;

    corpo.scrollTop = 0;
    corpo.scrollLeft = 0;
    lyraAplicarEstiloTexto();
  } catch (e) {
    if (meuToken !== lyraToken || !lyraAtual) return;
    console.warn("Falha ao carregar:", e);
    corpo.innerHTML = `<div class="lyra-msg">Não deu para carregar.
      Verifique a conexão e tente de novo.</div>`;
  }
}

function lyraAbrirLeitor(song, tomPedido, tonsDaCasa, nav, modo = "cifra") {
  lyraMontarEstrutura();

  const keys = song.keys || [];
  const tom  = lyraTomDisponivel(tomPedido, keys) || song.base_key || keys[0];

  lyraNavToken++;
  lyraNavegando = false;
  lyraFimLista = { ant: false, prox: false };

  lyraAtual = {
    song, tom, modo,
    instrumento: "teclado",
    tonsDaCasa: tonsDaCasa || [],
    nav: nav || null,
  };

  lyraAtualizarCabecalho();
  lyraAtualizarSetas();

  document.getElementById("lyraOverlay").classList.add("open");
  document.body.classList.add("lyra-travado");

  lyraAplicarTema();
  lyraPreencherTons();
  lyraAplicarModo();
  lyraRenderConteudo();

  // com o leitor aberto, adianta a busca dos vizinhos da lista
  if (nav && nav.itens) {
    lyraPreCarregar(nav.itens.slice(Math.max(0, nav.idx - 2), nav.idx + 4).map(x => x.nome));
  }
}

// ── Botões dentro do modal de leitura ────────────────────────

function lyraBlocoBotoes(m, song, nav) {
  const tons = [...new Set(
    deserializarPares(m.tom).map(p => p.tom).filter(t => t && t !== "Orig.")
  )];
  const alvos = tons.length ? tons : [song.base_key];

  const bloco = document.createElement("div");
  bloco.className = "view-lyra";
  bloco.innerHTML = `
    <button type="button" class="view-yt-btn view-cf-btn" data-lyra-cifra="1">
      ${LYRA_ICO_CIFRA}Abrir cifra
    </button>
    <button type="button" class="view-yt-btn view-cf-btn" data-lyra-letra="1">
      ${LYRA_ICO_LETRA}Ver letra
    </button>`;

  bloco.querySelector("[data-lyra-cifra]").onclick =
    () => lyraAbrirLeitor(song, alvos[0], tons, nav, "cifra");

  bloco.querySelector("[data-lyra-letra]").onclick =
    () => lyraAbrirLeitor(song, alvos[0], tons, nav, "letra");

  return bloco;
}

// troca o link manual pelos botões do Lyra, sem passo intermediário
function lyraTrocarPelosBotoes(wrap, m, song, nav) {
  wrap.querySelectorAll("a.view-cf-btn").forEach(el => el.remove());
  wrap.appendChild(lyraBlocoBotoes(m, song, nav));
}

function lyraRenderNaView(m, nav) {
  const wrap = document.getElementById("viewLinksWrap");
  if (!wrap || !m || !m.nome) return;

  const meuToken = ++lyraTokenView;

  // caminho normal: a busca já está em cache, então os botões certos
  // entram no mesmo instante em que o modal abre. Nada aparece e some.
  if (lyraTemNoCache(m.nome)) {
    const song = lyraDoCache(m.nome);
    if (song && song.has_chords) lyraTrocarPelosBotoes(wrap, m, song, nav);
    return;
  }

  // primeira vez com essa música (o pré-carregamento ainda não chegou nela):
  // o link manual fica escondido desde já, para não aparecer e depois sumir
  const manuais = [...wrap.querySelectorAll("a.view-cf-btn")];
  manuais.forEach(a => a.style.display = "none");

  lyraBuscar(m.nome).then(song => {
    if (meuToken !== lyraTokenView) { manuais.forEach(a => a.style.display = ""); return; }
    if (song && song.has_chords) lyraTrocarPelosBotoes(wrap, m, song, nav);
    else manuais.forEach(a => a.style.display = "");
  });
}

// ── Enxerto: embrulha as funções do app.js ───────────────────

// guarda a lista do repertório como está filtrada na tela
// e já vai buscando as cifras dela em segundo plano
const lyraRenderOriginal = render;
render = function (lista) {
  lyraListaVisivel = lista || [];
  lyraRenderOriginal(lista);
  lyraPreCarregar(lyraListaVisivel.map(x => x && x.nome));
};

// marca de qual culto a música foi aberta
const lyraAbrirViewCultoOriginal = abrirViewCulto;
abrirViewCulto = function (tipo, idx) {
  lyraCtxCulto = { tipo, idx };
  try { lyraAbrirViewCultoOriginal(tipo, idx); }
  finally { lyraCtxCulto = null; }
};

const lyraAbrirViewOriginal = abrirView;
abrirView = function (m, expandirTom = true) {
  const nav = lyraMontarNav(m, lyraCtxCulto);   // capturado antes de qualquer await
  lyraAbrirViewOriginal(m, expandirTom);
  lyraRenderNaView(m, nav);
};

const lyraFecharViewOriginal = fecharView;
fecharView = function () {
  lyraToken++;
  lyraTokenView++;
  lyraFecharLeitor();
  lyraFecharViewOriginal();
};