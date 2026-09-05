// ============================================================
//  TOM LOUVORES — integração com o Lyra
//  API pública, somente leitura, sem chave.
//  Cifra e letra abrem DENTRO do site, num leitor próprio.
//  Carregue DEPOIS do app.js. Não altera nada do app.js.
// ============================================================

const LYRA_API = "https://lyra-music-database.vercel.app/api/v1";

const lyraCacheBusca  = new Map();  // nome normalizado → música do Lyra (ou null)
const lyraPendentes   = new Map();  // nome normalizado → busca em andamento
const lyraCacheMusica = new Map();  // slug → { lyrics, porTom, base_key }

let lyraToken     = 0;     // descarta carregamentos de cifra/letra atrasados
let lyraTokenView = 0;     // descarta buscas atrasadas do modal de leitura
let lyraNavToken  = 0;     // descarta trocas de música atrasadas (setas)
let lyraNavegando = false; // trava a seta enquanto a troca não termina

let lyraAtual  = null;     // { song, tom, modo, nome, tonsDaCasa, nav }
let lyraZoom   = 100;      // tamanho do texto, em %
let lyraQuebra = false;    // quebrar linhas longas em vez de rolar na horizontal
let lyraClaro  = false;    // leitor no modo claro

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
          .toLowerCase()
          // medley escrito de dois jeitos: "A/B", "A / B" e "A + B"
          // passam a virar a mesma coisa
          .replace(/[\/+]/g, " / ")
          .replace(/\s+/g, " ").trim();
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

// ── Índice local: a tabela musicas_lyra ──────────────────────
//  Em vez de perguntar o nome à API a cada música (frágil: título
//  diferente, limite de resultados, campo has_chords ausente na
//  resposta enxuta), lemos a tabela uma vez e resolvemos o slug
//  aqui dentro. A API só é usada para o texto da cifra, por slug.

const LYRA_TABELA  = "musicas_lyra";
const LYRA_COLUNAS = "slug,title,artist,base_key,available_keys,updated_at";

// o app.js fala REST direto com o Supabase pelo helper req().
// Se ele existir, usamos o mesmo caminho (mesma chave, mesmo host).
async function lyraLerTabela() {
  const caminho = `${LYRA_TABELA}?select=${LYRA_COLUNAS}`;

  if (typeof req === "function") return await req(caminho);

  if (typeof CONFIG === "undefined" || !CONFIG.SUPABASE_URL) return null;
  const r = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${caminho}`, {
    headers: {
      apikey: CONFIG.SUPABASE_KEY,
      Authorization: `Bearer ${CONFIG.SUPABASE_KEY}`,
    },
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

let lyraIndice = null;          // Map: nome normalizado → música
let lyraIndiceEmCurso = null;

// "Clamo Jesus (part. Marsena)" → "clamo jesus"
function lyraChaveCurta(s = "") {
  return lyraNorm(s).replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim();
}

async function lyraCarregarIndice() {
  if (lyraIndice) return lyraIndice;
  if (lyraIndiceEmCurso) return lyraIndiceEmCurso;

  lyraIndiceEmCurso = (async () => {
    try {
      const data = await lyraLerTabela();
      if (!data || !data.length) {
        console.warn(`Tabela ${LYRA_TABELA} vazia ou inacessível.`);
        return null;
      }

      const idx = new Map();
      data.forEach(r => {
        if (!r.slug) return;
        const song = {
          slug: r.slug,
          title: r.title,
          artist: r.artist,
          base_key: r.base_key,
          keys: r.available_keys || [],
          versao: r.updated_at || "",       // muda quando você edita a cifra
          has_chords: true,
        };
        [lyraNorm(r.title), lyraChaveCurta(r.title)].forEach(k => {
          if (k && !idx.has(k)) idx.set(k, song);
        });
      });

      lyraIndice = idx;
      // o índice é a fonte da verdade: o cache de buscas antigas
      // (que pode ter gravado "sem cifra" por falha de rede) sai de cena
      lyraCacheBusca.clear();
      try { localStorage.removeItem(LYRA_CACHE_KEY); } catch (e) {}
      lyraLimparOrfas();
      lyraAtualizarBotaoBaixar();
      console.info(`Cifras: ${data.length} músicas carregadas de ${LYRA_TABELA}.`);
      return idx;
    } catch (e) {
      console.warn(`Não consegui ler ${LYRA_TABELA}:`, e);
      return null;
    } finally {
      lyraIndiceEmCurso = null;
    }
  })();

  return lyraIndiceEmCurso;
}

lyraCarregarIndice();
setTimeout(() => { if (!lyraIndice) lyraCarregarIndice(); }, 4000);

// casa o nome do repertório com o título do banco
function lyraNoIndice(nome) {
  if (!lyraIndice) return null;

  const cheia = lyraNorm(nome);
  const curta = lyraChaveCurta(nome);

  // só igualdade. Nada de "começa com": senão "O Fogo Arderá"
  // casaria com o medley "O Fogo Arderá / Ah Jesus / ..." e as duas
  // músicas abririam a mesma cifra.
  // O caso "Clamo Jesus" × "Clamo Jesus (part. Marsena)" continua
  // funcionando porque o índice guarda a versão sem parênteses.
  return lyraIndice.get(cheia) || lyraIndice.get(curta) || null;
}

// ── Busca da música ──────────────────────────────────────────

// com o índice carregado, a resposta é imediata e sempre atual
function lyraTemNoCache(nome) {
  if (lyraIndice) return true;
  return lyraCacheBusca.has(lyraNorm(nome));
}

function lyraDoCache(nome) {
  if (lyraIndice) return lyraNoIndice(nome);
  return lyraCacheBusca.get(lyraNorm(nome)) || null;
}

async function lyraBuscar(nome) {
  const chave = lyraNorm(nome);
  if (!chave) return null;

  await lyraCarregarIndice();
  if (lyraIndice) return lyraNoIndice(nome);   // caminho normal

  // Sem acesso à tabela: cai na busca por nome da API pública.
  if (lyraCacheBusca.has(chave)) return lyraCacheBusca.get(chave);
  if (lyraPendentes.has(chave))  return lyraPendentes.get(chave);

  const busca = (async () => {
    let achada = null;
    try {
      const url = `${LYRA_API}/songs?q=${encodeURIComponent(nome)}&limit=8`;
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        const res  = data.results || [];
        const curta = lyraChaveCurta(nome);
        achada = res.find(s => lyraNorm(s.title) === chave)
              || res.find(s => lyraChaveCurta(s.title) === curta)
              || null;
        // resposta enxuta às vezes não traz has_chords: não invente "não tem"
        if (achada && achada.has_chords === undefined) achada.has_chords = true;
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
//  Só faz sentido no modo de reserva (sem a tabela). Com o índice
//  carregado não há nada para adiantar: a resposta já é local.

const lyraFila = [];
let lyraFilaAtivos = 0;
const LYRA_FILA_MAX = 2;
const LYRA_FILA_TETO = 60;      // não sai disparando o repertório inteiro

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
  if (lyraFila.length >= LYRA_FILA_TETO) return;
  if (lyraFila.some(n => lyraNorm(n) === chave)) return;
  lyraFila.push(nome);
}

const lyraOcioso = window.requestIdleCallback || (fn => setTimeout(fn, 300));

function lyraPreCarregar(nomes) {
  if (lyraIndice || !nomes || !nomes.length) return;
  lyraOcioso(() => {
    if (lyraIndice) return;
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

// ── Guardar as músicas no aparelho ───────────────────────────
//  Cada música baixada fica no armazenamento local, comprimida.
//  O leitor lê primeiro da memória, depois do disco e só então
//  vai à rede — então cifra já baixada abre sem internet.

const LYRA_DISCO_PREFIXO = "lyra_m_";
const LYRA_DISCO_INDICE  = "lyra_baixadas_v1";

// quanto foi baixado de verdade (bytes na rede, já comprimidos
// pelo servidor) e quanto está ocupado no aparelho
let lyraBytesBaixados = 0;

function lyraContarBytes(url) {
  try {
    const e = performance.getEntriesByName(url).pop();
    if (!e) return;
    lyraBytesBaixados += e.transferSize || e.encodedBodySize || 0;
  } catch (err) { /* navegador sem Performance API */ }
}

function lyraEspacoUsado() {
  let n = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LYRA_DISCO_PREFIXO)) n += (localStorage.getItem(k) || "").length;
    }
  } catch (e) { /* sem acesso */ }
  return n;
}

function lyraKB(bytes) {
  if (!bytes) return "0 KB";
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
}

const lyraTemCompressao =
  typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";

async function lyraComprimir(texto) {
  if (!lyraTemCompressao) return null;
  const fluxo = new Blob([texto]).stream().pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(fluxo).arrayBuffer());
  let bin = "";
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + passo));
  }
  return btoa(bin);
}

async function lyraDescomprimir(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(fluxo).text();
}

// o Map de tons não sobrevive ao JSON: vira objeto e volta
function lyraMusicaParaTexto(m) {
  return JSON.stringify({
    lyrics: m.lyrics || "",
    base_key: m.base_key || "",
    tons: Object.fromEntries(m.porTom),
  });
}

function lyraMusicaDeTexto(txt) {
  const o = JSON.parse(txt);
  return {
    lyrics: o.lyrics || "",
    base_key: o.base_key || "",
    porTom: new Map(Object.entries(o.tons || {})),
  };
}

function lyraListaBaixadas() {
  try { return JSON.parse(localStorage.getItem(LYRA_DISCO_INDICE) || "[]"); }
  catch (e) { return []; }
}

function lyraMarcarBaixada(slug) {
  const lista = lyraListaBaixadas();
  if (!lista.includes(slug)) {
    lista.push(slug);
    try { localStorage.setItem(LYRA_DISCO_INDICE, JSON.stringify(lista)); } catch (e) {}
  }
}

// versão publicada desta música, segundo o índice (updated_at)
function lyraVersaoDoSlug(slug) {
  if (!lyraIndice) return null;
  for (const song of lyraIndice.values()) if (song.slug === slug) return song.versao || "";
  return null;
}

async function lyraDoDisco(slug) {
  let bruto = null;
  try { bruto = localStorage.getItem(LYRA_DISCO_PREFIXO + slug); } catch (e) { return null; }
  if (!bruto) return null;
  try {
    const reg = JSON.parse(bruto);

    // a cifra foi editada no banco depois de baixada: descarta e busca de novo
    const atual = lyraVersaoDoSlug(slug);
    if (atual !== null && reg.v !== undefined && reg.v !== atual) return null;

    const txt = reg.z ? await lyraDescomprimir(reg.d) : reg.d;
    return lyraMusicaDeTexto(txt);
  } catch (e) {
    return null;                       // registro estragado: será rebaixado
  }
}

// devolve true se gravou. Lança quando o armazenamento encheu.
async function lyraGravarNoDisco(slug, musica) {
  const txt = lyraMusicaParaTexto(musica);
  const v = lyraVersaoDoSlug(slug) || "";
  let reg;
  try {
    const z = await lyraComprimir(txt);
    reg = z ? { z: 1, d: z, v } : { z: 0, d: txt, v };
  } catch (e) {
    reg = { z: 0, d: txt, v };
  }
  // grava por cima do registro anterior deste mesmo slug
  localStorage.setItem(LYRA_DISCO_PREFIXO + slug, JSON.stringify(reg));
  lyraMarcarBaixada(slug);
  return true;
}

// música apagada ou com slug trocado no banco continuaria ocupando
// espaço para sempre: some com ela
function lyraLimparOrfas() {
  if (!lyraIndice) return 0;
  const validos = new Set(lyraSlugsDoIndice());
  let removidas = 0;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(LYRA_DISCO_PREFIXO)) continue;
      if (!validos.has(k.slice(LYRA_DISCO_PREFIXO.length))) {
        localStorage.removeItem(k);
        removidas++;
      }
    }
    localStorage.setItem(LYRA_DISCO_INDICE,
      JSON.stringify(lyraListaBaixadas().filter(x => validos.has(x))));
  } catch (e) { /* sem acesso ao armazenamento */ }
  return removidas;
}

// ── Botão "Baixar cifras" no cabeçalho ───────────────────────

const LYRA_ICO_BAIXAR = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M4 21h16"/></svg>`;
const LYRA_ICO_OK     = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`;

let lyraBaixando = false;

function lyraSlugsDoIndice() {
  if (!lyraIndice) return [];
  return [...new Set([...lyraIndice.values()].map(s => s.slug))];
}

function lyraMontarBotaoBaixar() {
  if (document.getElementById("lyraBaixar")) return;
  const barra = document.querySelector(".header-right");
  if (!barra) return;

  const estilo = document.createElement("style");
  estilo.textContent = `
    .lyra-dl{display:inline-flex;align-items:center;gap:7px}
    .lyra-dl:disabled{opacity:.6;cursor:default}
    .lyra-dl.pronto{color:var(--tinta);border-color:var(--tinta-3)}
    .lyra-dl.pronto:hover{background:var(--papel-2)}
    @media(max-width:600px){.lyra-dl-txt{display:none}.lyra-dl{padding:9px 11px}}`;
  document.head.appendChild(estilo);

  const btn = document.createElement("button");
  btn.id = "lyraBaixar";
  btn.className = "btn-logout lyra-dl";
  btn.innerHTML = `${LYRA_ICO_BAIXAR}<span class="lyra-dl-txt">Baixar cifras</span>`;
  btn.addEventListener("click", lyraBaixarTudo);

  barra.insertBefore(btn, document.getElementById("btnLoginShow") || null);
  lyraAtualizarBotaoBaixar();
}

function lyraAtualizarBotaoBaixar(txt) {
  const btn = document.getElementById("lyraBaixar");
  if (!btn) return;

  const pintar = (ico, rotulo) => {
    btn.innerHTML = `${ico}<span class="lyra-dl-txt">${rotulo}</span>`;
  };

  if (txt) { pintar(LYRA_ICO_BAIXAR, txt); return; }

  const slugs  = lyraSlugsDoIndice();
  const total  = slugs.length;
  const salvas = lyraListaBaixadas().filter(x => slugs.includes(x)).length;
  const tudo   = total > 0 && salvas >= total;

  btn.style.display = "";        // sempre visível, mesmo antes do índice chegar
  btn.classList.toggle("pronto", tudo);

  pintar(
    tudo ? LYRA_ICO_OK : LYRA_ICO_BAIXAR,
    tudo    ? "Cifras salvas"
    : salvas ? `Baixar cifras (${salvas}/${total})`
             : "Baixar cifras"
  );

  const ocupado = lyraEspacoUsado();
  btn.title = tudo
    ? `${salvas} músicas guardadas neste aparelho (${lyraKB(ocupado)}). Toque para atualizar.`
    : `Guardar todas as cifras neste aparelho, para abrir sem internet.` +
      (ocupado ? ` Já guardadas: ${lyraKB(ocupado)}.` : "");
}

async function lyraBaixarTudo() {
  if (lyraBaixando) return;
  await lyraCarregarIndice();

  const slugs = lyraSlugsDoIndice();
  if (!slugs.length) {
    toast("Não consegui ler a lista de cifras. Verifique a conexão.", true);
    return;
  }

  lyraLimparOrfas();

  const btn = document.getElementById("lyraBaixar");
  lyraBaixando = true;
  lyraBytesBaixados = 0;
  if (btn) btn.disabled = true;

  let ok = 0, falhas = 0, cheio = false;

  for (let i = 0; i < slugs.length; i++) {
    lyraAtualizarBotaoBaixar(`Baixando ${i + 1}/${slugs.length}`);
    try {
      lyraCacheMusica.delete(slugs[i]);
      // busca do banco mesmo que já exista no disco
      const musica = await lyraCarregarMusica(slugs[i], true);
      await lyraGravarNoDisco(slugs[i], musica);
      ok++;
    } catch (e) {
      if (e && (e.name === "QuotaExceededError" || /quota|exceeded/i.test(e.message || ""))) {
        cheio = true;
        break;
      }
      console.warn("Não baixei", slugs[i], e);
      falhas++;
    }
  }

  lyraBaixando = false;
  if (btn) btn.disabled = false;
  lyraAtualizarBotaoBaixar();

  const baixado = lyraBytesBaixados ? ` · ${lyraKB(lyraBytesBaixados)} baixados` : "";

  if (cheio)       toast(`Armazenamento cheio. ${ok} de ${slugs.length} salvas.`, true);
  else if (falhas) toast(`${ok} salvas, ${falhas} sem conexão.`, true);
  else             toast(`${ok} ${ok === 1 ? "cifra guardada" : "cifras guardadas"} ✓${baixado}`);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", lyraMontarBotaoBaixar);
} else {
  lyraMontarBotaoBaixar();
}

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

// ── Música completa: cifra em todos os tons + letra ──────────
//  Uma requisição por música (?include=all_keys) traz a letra e a
//  cifra já transposta em todos os tons. Trocar de tom e abrir a
//  letra passam a ser instantâneos, sem ir à rede de novo.

const lyraMusicaPendente = new Map();   // slug → carregamento em andamento

//  forcar = true ignora o que está guardado e busca do banco.
//  É o que o botão "Baixar cifras" faz: sem isso ele relia o disco,
//  regravava a mesma coisa e a edição feita no banco nunca chegava.
async function lyraCarregarMusica(slug, forcar = false) {
  if (!forcar && lyraCacheMusica.has(slug))   return lyraCacheMusica.get(slug);
  if (!forcar && lyraMusicaPendente.has(slug)) return lyraMusicaPendente.get(slug);

  const carga = (async () => {
    const salva = forcar ? null : await lyraDoDisco(slug);
    if (salva && salva.porTom.size) {
      lyraCacheMusica.set(slug, salva);
      return salva;
    }

    const url = `${LYRA_API}/songs/${slug}?include=all_keys`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Resposta ${r.status}`);
    const d = await r.json();
    lyraContarBytes(url);

    const porTom = new Map();
    (d.keys || []).forEach(k => {
      if (!k || !k.chords) return;
      const chave = String(k.key_slug || lyraKeySlug(k.key || "")).toLowerCase();
      if (chave) porTom.set(chave, k.chords);
    });
    // resposta sem all_keys: ao menos o tom base vem em "chords"
    if (!porTom.size && d.chords) porTom.set(lyraKeySlug(d.base_key || ""), d.chords);

    const musica = { lyrics: d.lyrics || "", porTom, base_key: d.base_key || "" };
    lyraCacheMusica.set(slug, musica);
    // o que foi aberto uma vez fica guardado, sem depender do botão
    lyraGravarNoDisco(slug, musica).catch(() => {});
    return musica;
  })();

  lyraMusicaPendente.set(slug, carga);
  try { return await carga; }
  finally { lyraMusicaPendente.delete(slug); }
}

async function lyraCarregarCifra(slug, tomLyra) {
  const musica = await lyraCarregarMusica(slug);
  const chave  = lyraKeySlug(tomLyra);
  if (musica.porTom.has(chave)) return musica.porTom.get(chave);

  // tom que não veio no pacote: busca o avulso e guarda junto
  const r = await fetch(`${LYRA_API}/songs/${slug}/chords/${chave}`);
  if (!r.ok) return "";
  const d = await r.json();
  const texto = d.chords || "";
  if (texto) musica.porTom.set(chave, texto);
  return texto;
}

async function lyraCarregarLetra(slug) {
  return (await lyraCarregarMusica(slug)).lyrics;
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

    // A fila segue a ordem da TELA, não a ordem em que os louvores
    // foram cadastrados. Sem isso, um louvor da Ceia adicionado
    // antes dos outros abria como se fosse o primeiro do culto.
    const ORDEM = { principal: 0, pos: 1, ceia: 2, ofertorio: 3 };
    const secao = l => (typeof secaoDoLouvor === "function" ? secaoDoLouvor(l) : "principal");

    const ordenados = louvores
      .map((l, i) => ({ l, i }))
      .sort((a, b) => (ORDEM[secao(a.l)] ?? 0) - (ORDEM[secao(b.l)] ?? 0) || a.i - b.i);

    return {
      itens: ordenados.map(x => ({ nome: x.l.nome, tom: x.l.tom })),
      // o índice clicado é o do array; aqui vira a posição na fila
      idx: Math.max(0, ordenados.findIndex(x => x.i === ctxCulto.idx)),
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

// mostra as setas só quando há lista; apaga apenas na primeira e na
// última música — nunca no meio, mesmo que a vizinha não tenha cifra
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
  ant.disabled  = nav.idx <= 0;
  prox.disabled = nav.idx >= nav.itens.length - 1;
}

//  A seta anda uma música por vez, na ordem exata da lista do culto.
//  Se a música não estiver no banco do Lyra, ela ainda assim aparece,
//  com um aviso no lugar da cifra — a seta nunca morre no meio da lista.
async function lyraIrPara(direcao) {
  if (!lyraAtual || !lyraAtual.nav || lyraNavegando) return;

  const { itens } = lyraAtual.nav;
  const i = lyraAtual.nav.idx + direcao;
  if (i < 0 || i >= itens.length) return;      // ponta da lista

  const meuNav = ++lyraNavToken;
  lyraNavegando = true;
  lyraSetasOcupadas(true);
  lyraToken++;                                 // cancela carregamento no ar

  const item  = itens[i];
  const corpo = document.getElementById("lyraCorpo");

  // só avisa se a busca demorar; com o cache, quase nunca aparece
  const avisar = setTimeout(() => {
    if (meuNav === lyraNavToken)
      corpo.innerHTML = `<div class="lyra-msg">Carregando ${lyraEsc(item.nome)}...</div>`;
  }, 180);

  try {
    const song = lyraTemNoCache(item.nome) ? lyraDoCache(item.nome)
                                           : await lyraBuscar(item.nome);
    if (meuNav !== lyraNavToken) return;        // outra troca começou no meio

    const temCifra = !!(song && song.has_chords);
    lyraAtual = {
      song: temCifra ? song : null,
      nome: item.nome,
      modo: lyraAtual.modo,
      tom: temCifra
        ? (lyraTomDisponivel(item.tom, song.keys) || song.base_key || (song.keys || [])[0])
        : "",
        tonsDaCasa: [item.tom].filter(Boolean),
      nav: { itens, idx: i },
    };

    lyraAtualizarCabecalho();
    lyraPreencherTons();
    lyraAplicarModo();
    lyraRenderConteudo();

    // adianta a busca dos vizinhos, para a próxima seta ser instantânea
    lyraPreCarregar(itens.slice(Math.max(0, i - 1), i + 3).map(x => x.nome));
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
  const emCifra = lyraAtual.modo === "cifra" && !!lyraAtual.song;
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
  const { song, nome } = lyraAtual;
  document.getElementById("lyraTitulo").textContent  =
    (song && song.title) || nome || "";
  document.getElementById("lyraArtista").textContent =
    song ? (song.artist || "") : "Sem cifra no banco";
}

function lyraPreencherTons() {
  const { song, tom } = lyraAtual;
  const sel = document.getElementById("lyraTomSel");
  if (!song) { sel.innerHTML = ""; return; }
  sel.innerHTML = (song.keys || [])
    .map(k => `<option value="${lyraEsc(k)}">${lyraEsc(k)}</option>`)
    .join("");
  sel.value = tom;
}

async function lyraRenderConteudo() {
  const corpo = document.getElementById("lyraCorpo");
  const { song, tom, modo, nome } = lyraAtual;
  const meuToken = ++lyraToken;

  // música da lista que não existe no banco do Lyra: mostra o aviso
  // e mantém a navegação viva para seguir para a próxima
  if (!song) {
    corpo.innerHTML = `<div class="lyra-msg">
      ${lyraEsc(nome || "Esta música")} não está no banco de cifras.
    </div>`;
    return;
  }

  corpo.innerHTML = `<div class="lyra-msg">${
    modo === "letra" ? "Carregando letra..." : `Carregando cifra em ${lyraEsc(tom)}...`
  }</div>`;

  try {
    const texto = modo === "letra"
      ? await lyraCarregarLetra(song.slug)
      : await lyraCarregarCifra(song.slug, tom);

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

  lyraAtual = {
    song, tom, modo,
    nome: song.title || "",
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