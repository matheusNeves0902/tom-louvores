// ============================================================
//  TOM LOUVORES — sons de verdade
//  Carregue DEPOIS do acordes.js e ANTES do afinador.js.
//
//  Troca a síntese por gravações reais de piano de cauda, violão
//  de aço e baixo acústico. As amostras vêm do banco FluidR3_GM,
//  uma nota por arquivo, e ficam guardadas no aparelho depois da
//  primeira vez — quem já abriu uma vez toca offline.
// ============================================================

const SOM_BASE = "https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM";

const SOM_INSTRUMENTOS = {
  piano:  { pasta: "acoustic_grand_piano", min: 21, max: 96, ganho: 1.0 },
  violao: { pasta: "acoustic_guitar_steel", min: 38, max: 84, ganho: 1.0 },
  baixo:  { pasta: "acoustic_bass",         min: 26, max: 72, ganho: 1.1 },
};

const SOM_NOMES = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
const somNomeNota = m => SOM_NOMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

// ── guarda no aparelho ──────────────────────────────────────
//  O localStorage não serve para áudio, então vai no IndexedDB,
//  que aguenta megabytes e sobrevive a fechar o navegador.

const SOM_BD = "tl_amostras";
let somBDPromessa = null;

function somBD() {
  if (somBDPromessa) return somBDPromessa;
  somBDPromessa = new Promise((ok, erro) => {
    const req = indexedDB.open(SOM_BD, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("mp3");
    req.onsuccess = () => ok(req.result);
    req.onerror = () => erro(req.error);
  }).catch(() => null);
  return somBDPromessa;
}

async function somDoDisco(chave) {
  const bd = await somBD();
  if (!bd) return null;
  return new Promise(ok => {
    const t = bd.transaction("mp3", "readonly").objectStore("mp3").get(chave);
    t.onsuccess = () => ok(t.result || null);
    t.onerror = () => ok(null);
  });
}

async function somParaDisco(chave, dados) {
  const bd = await somBD();
  if (!bd) return;
  try { bd.transaction("mp3", "readwrite").objectStore("mp3").put(dados, chave); } catch {}
}

// ── carregamento ────────────────────────────────────────────

const somBuffers = new Map();     // "violao:52" → AudioBuffer
const somPendentes = new Map();

async function somCarregar(inst, midi) {
  const cfg = SOM_INSTRUMENTOS[inst];
  if (!cfg) return null;
  const nota = Math.max(cfg.min, Math.min(cfg.max, midi));
  const chave = `${inst}:${nota}`;

  if (somBuffers.has(chave)) return somBuffers.get(chave);
  if (somPendentes.has(chave)) return somPendentes.get(chave);

  const carga = (async () => {
    let bruto = await somDoDisco(chave);
    if (!bruto) {
      const url = `${SOM_BASE}/${cfg.pasta}-mp3/${somNomeNota(nota)}.mp3`;
      const r = await fetch(url);
      if (!r.ok) throw new Error("amostra não encontrada: " + url);
      bruto = await r.arrayBuffer();
      somParaDisco(chave, bruto.slice(0));
    }
    const buf = await acCtx().decodeAudioData(bruto.slice(0));
    somBuffers.set(chave, buf);
    return buf;
  })();

  somPendentes.set(chave, carga);
  try { return await carga; }
  catch { return null; }
  finally { somPendentes.delete(chave); }
}

//  Toca a amostra. Se ela ainda não chegou, o pedido é feito e a
//  nota sai pela síntese antiga — melhor um som imperfeito na
//  hora do que silêncio esperando a rede.
function somTocar(inst, midi, quando, dur, ganho = 1) {
  const cfg = SOM_INSTRUMENTOS[inst];
  const nota = Math.max(cfg.min, Math.min(cfg.max, midi));
  const chave = `${inst}:${nota}`;
  const buf = somBuffers.get(chave);

  if (!buf) { somCarregar(inst, midi); return false; }

  const ctx = acCtx();
  const src = ctx.createBufferSource();
  src.buffer = buf;
  // fora do alcance da amostra, ajusta a altura pelo que faltou
  const diferenca = midi - nota;
  if (diferenca) src.playbackRate.value = Math.pow(2, diferenca / 12);

  const g = ctx.createGain();
  g.gain.setValueAtTime(ganho * cfg.ganho, quando);
  // solta a tecla: a cauda desce em vez de cortar seco
  g.gain.setValueAtTime(ganho * cfg.ganho, quando + dur * 0.72);
  g.gain.exponentialRampToValueAtTime(0.0001, quando + dur + 0.45);

  src.connect(g); g.connect(ctx.destination);
  src.start(quando);
  src.stop(quando + dur + 0.5);
  acTocando.push(src);
  return true;
}

//  Deixa prontas as notas de um acorde antes de alguém apertar
//  Ouvir, para a primeira vez já sair com o som certo.
function somPreparar(inst, midis) {
  midis.forEach(m => somCarregar(inst, m));
}

// ── troca as vozes sintetizadas pelas gravações ─────────────

const somVozViolaoSintetica = acVozViolao;
acVozViolao = function (midi, quando, dur, ganho = 0.5) {
  if (somTocar("violao", midi, quando, dur, ganho * 1.6)) return;
  return somVozViolaoSintetica(midi, quando, dur, ganho);
};

const somVozPianoSintetica = acVozPiano;
acVozPiano = function (midi, quando, dur, ganho = 0.20) {
  if (somTocar("piano", midi, quando, dur, ganho * 3.4)) return;
  return somVozPianoSintetica(midi, quando, dur, ganho);
};

//  Ao abrir o painel de um acorde, já busca as amostras dele.
const somDesenharOriginal = acDesenhar;
acDesenhar = function (...a) {
  const r = somDesenharOriginal.apply(this, a);
  if (acAtual) {
    try {
      somPreparar(acAba === "teclado" ? "piano" : "violao", acNotasParaTocar(acAtual));
    } catch {}
  }
  return r;
};