// ============================================================
//  TOM LOUVORES — afinador
//  Carregue DEPOIS do opcoes.js.
//
//  Ouve pelo microfone e diz a nota e quantos cents ela está
//  acima ou abaixo. Serve para violão (6 cordas) e baixo (4).
//
//  A detecção usa autocorrelação normalizada (McLeod): compara o
//  sinal com ele mesmo deslocado e procura o deslocamento que
//  melhor se repete. É mais estável que contar cruzamentos de
//  zero, que se perde com corda grave e com harmônicos fortes.
// ============================================================

const AF_NOTAS = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

//  Afinações. Meio tom abaixo e Drop D aparecem bastante em
//  louvor, e antes o afinador só conhecia a padrão — quem baixava
//  meio tom via todas as cordas acusando 100 cents fora.
const AF_AFINACOES = {
  violao: {
    padrao:      { nome: "Padrão",           notas: [40, 45, 50, 55, 59, 64] },
    meio_abaixo: { nome: "½ tom abaixo",     notas: [39, 44, 49, 54, 58, 63] },
    drop_d:      { nome: "Drop D",           notas: [38, 45, 50, 55, 59, 64] },
    drop_c:      { nome: "Drop C#",          notas: [37, 44, 49, 54, 58, 63] },
  },
  baixo: {
    padrao:      { nome: "Padrão",           notas: [28, 33, 38, 43] },
    meio_abaixo: { nome: "½ tom abaixo",     notas: [27, 32, 37, 42] },
    drop_d:      { nome: "Drop D",           notas: [26, 33, 38, 43] },
  },
};

//  Nome de cada corda a partir da nota, com a mais aguda do violão
//  em minúscula, como se escreve na tablatura.
function afCordasDe(inst, afinacao) {
  const cfg = (AF_AFINACOES[inst] || {})[afinacao] || AF_AFINACOES[inst].padrao;
  return cfg.notas.map((midi, i) => {
    let r = AF_NOTAS[((midi % 12) + 12) % 12];
    if (inst === "violao" && i === 5) r = r.toLowerCase();
    return { rotulo: r, midi };
  });
}

let afAfinacao = localStorage.getItem("tl_afinacao") || "padrao";

const AF_INSTRUMENTOS = {
  violao: { nome: "Violão", get cordas() { return afCordasDe("violao", afAfinacao); } },
  baixo:  { nome: "Baixo",  get cordas() { return afCordasDe("baixo",  afAfinacao); } },
};

const afFreqDeMidi = m => 440 * Math.pow(2, (m - 69) / 12);
const afMidiDeFreq = f => 69 + 12 * Math.log2(f / 440);

// ── Detecção ────────────────────────────────────────────────
//  Recebe um pedaço de onda e devolve a frequência, ou -1 quando
//  não há nota clara. Função pura de propósito: dá para testar
//  sem microfone e sem navegador.

function afDetectar(buf, taxa) {
  const n = buf.length;

  // volume: abaixo disso é silêncio ou ruído de fundo
  let soma = 0;
  for (let i = 0; i < n; i++) soma += buf[i] * buf[i];
  const rms = Math.sqrt(soma / n);
  if (rms < 0.008) return -1;

  //  A busca vai só até o período da nota mais grave que
  //  interessa (baixo em E, 41Hz). Sem esse limite, metade do
  //  cálculo é gasto com atrasos que nunca serão a resposta.
  const maxAtraso = Math.min(Math.floor(n / 2), Math.ceil(taxa / 35));
  const nsdf = new Float32Array(maxAtraso);

  for (let atraso = 0; atraso < maxAtraso; atraso++) {
    let acf = 0, energia = 0;
    for (let i = 0; i < n - atraso; i++) {
      acf     += buf[i] * buf[i + atraso];
      energia += buf[i] * buf[i] + buf[i + atraso] * buf[i + atraso];
    }
    nsdf[atraso] = energia > 0 ? (2 * acf) / energia : 0;
  }

  //  Todos os picos, e depois o PRIMEIRO que chega perto do mais
  //  alto. Pegar direto o mais alto erra: um harmônico costuma
  //  empatar com o fundamental e desloca a leitura alguns cents.
  let i = 0;
  while (i < maxAtraso - 1 && nsdf[i] > 0) i++;
  while (i < maxAtraso - 1 && nsdf[i] <= 0) i++;

  const picos = [];
  for (; i < maxAtraso - 1; i++)
    if (nsdf[i] > nsdf[i - 1] && nsdf[i] >= nsdf[i + 1]) picos.push(i);
  if (!picos.length) return -1;

  const maior = Math.max(...picos.map(p => nsdf[p]));
  if (maior < 0.5) return -1;
  const melhor = picos.find(p => nsdf[p] >= maior * 0.9);

  //  parábola pelos três pontos: afina o período entre amostras
  const parabola = k => {
    const a = nsdf[k - 1], b = nsdf[k], c = nsdf[k + 1];
    return k + (a - c) / (2 * (2 * b - a - c) || 1);
  };

  let periodo = parabola(melhor);

  //  Refino: em vez de medir um período, mede quantos couberem na
  //  janela e divide. Um erro de meia amostra dividido por sete
  //  ciclos vale um sétimo em cents. É o que tira a leitura da
  //  corda B de 8 cents para menos de 1.
  const ciclos = Math.floor((maxAtraso - 2) / periodo);
  if (ciclos >= 2) {
    const alvo = Math.round(periodo * ciclos);
    //  a janela cresce com o número de ciclos: se cada período
    //  pode estar meia amostra fora, sete períodos podem estar
    //  três e meia, e uma busca de ±3 travava no pico errado
    const raio = Math.max(3, Math.ceil(ciclos * 0.75));
    let longe = -1, valor = 0;
    for (let k = alvo - raio; k <= alvo + raio; k++) {
      if (k < 1 || k >= maxAtraso - 1) continue;
      if (nsdf[k] > nsdf[k - 1] && nsdf[k] >= nsdf[k + 1] && nsdf[k] > valor) {
        valor = nsdf[k]; longe = k;
      }
    }
    if (longe > 0 && valor > 0.4) periodo = parabola(longe) / ciclos;
  }

  const f = taxa / periodo;
  return (f > 25 && f < 1400) ? f : -1;
}

//  Nota mais próxima e a diferença em cents.
function afAnalisar(freq, cordas) {
  const midiExato = afMidiDeFreq(freq);
  const midi = Math.round(midiExato);
  const cents = Math.round((midiExato - midi) * 100);

  let corda = null, menor = Infinity;
  cordas.forEach((c, i) => {
    const d = Math.abs(midiExato - c.midi);
    if (d < menor) { menor = d; corda = i; }
  });

  return {
    freq,
    nota: AF_NOTAS[((midi % 12) + 12) % 12],
    oitava: Math.floor(midi / 12) - 1,
    cents,
    corda,                       // índice da corda mais próxima
    longe: menor > 1.5,          // mais de um tom e meio: nem é essa corda
  };
}

if (typeof module !== "undefined") module.exports = { afDetectar, afAnalisar, AF_INSTRUMENTOS, afFreqDeMidi };

// ============================================================
//  INTERFACE
// ============================================================

let afInst = localStorage.getItem("tl_afinador_inst") || "violao";
let afStream = null, afCtx = null, afAnalisador = null, afBuf = null, afRaf = null;
let afSuave = null;                       // leitura amaciada, para o ponteiro não tremer

(function afEstilo() {
  const st = document.createElement("style");
  st.textContent = `
  .af-painel{
    position:absolute;left:0;right:0;bottom:0;z-index:78;
    background:#151515;border-top:1px solid var(--gray3);
    border-radius:18px 18px 0 0;
    padding:12px 18px calc(22px + env(safe-area-inset-bottom));
    transform:translateY(101%);transition:transform .22s ease;
    max-height:82%;overflow:auto;
  }
  .af-painel.on{transform:none}
  .claro .af-painel{background:#F4F0E9;border-top-color:rgba(0,0,0,.14)}
  @media (min-width:1100px){
    .lyra-box.op-fixo .af-painel{left:320px}
  }

  .af-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
  .af-hd h4{margin:0;font-family:'Inter',sans-serif;font-size:12px;font-weight:800;
    letter-spacing:.14em;text-transform:uppercase;color:var(--gray)}
  .af-x{background:none;border:none;color:var(--gray);font-size:17px;cursor:pointer;padding:2px 6px}

  .af-topo{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}
  .af-sel{
    background:var(--black5);border:1px solid var(--gray3);color:#e6e6e6;
    border-radius:10px;padding:7px 10px;cursor:pointer;
    font-family:'Inter',sans-serif;font-size:12.5px;font-weight:600;
  }
  .claro .af-sel{background:#E4DFD8;border-color:rgba(0,0,0,.16);color:#242424}
  .af-abas{display:inline-flex;border:1px solid var(--gray3);border-radius:10px;overflow:hidden}
  .af-abas button{background:none;border:none;cursor:pointer;color:#c8c8c8;
    font-family:'Inter',sans-serif;font-size:12.5px;font-weight:700;padding:8px 18px}
  .af-abas button.on{background:var(--cifra);color:#1a1a1a}
  .claro .af-abas button.on{background:var(--cifra-claro);color:#fff}

  /* mostrador */
  .af-mostrador{
    border:2px solid var(--gray3);border-radius:18px;
    padding:18px 14px 8px;margin-bottom:14px;
    transition:border-color .2s,box-shadow .2s;
  }
  .af-mostrador.certo{border-color:#8FE84A;box-shadow:0 0 22px rgba(143,232,74,.18)}

  /* fita de notas: a atual grande no meio, as vizinhas apagadas */
  .af-fita{display:flex;align-items:baseline;justify-content:center;gap:14px;min-height:58px}
  .af-fita span{
    font-family:'Bebas Neue',sans-serif;color:var(--gray2);opacity:.45;
    font-size:26px;line-height:1;letter-spacing:.02em;
  }
  .af-fita span sup{font-size:11px;opacity:.8;margin-left:1px}
  .af-fita span.atual{
    opacity:1;font-size:54px;color:#e9e9e9;
  }
  .af-mostrador.certo .af-fita span.atual{color:#8FE84A}
  .claro .af-fita span.atual{color:#1a1a1a}
  .claro .af-mostrador.certo .af-fita span.atual{color:#2F8C0F}

  .af-hz{text-align:center;font-family:'Inter',sans-serif;font-size:12.5px;
    color:var(--gray2);font-variant-numeric:tabular-nums;min-height:17px;margin-bottom:2px}

  /* ponteiro */
  .af-gauge{width:100%;height:auto;display:block}
  .af-tick{stroke:var(--gray3);stroke-width:1.6;stroke-linecap:round}
  .af-tick.forte{stroke:var(--gray2);stroke-width:2.2}
  .af-sinal{fill:var(--gray2);font-family:'Inter',sans-serif;font-size:13px;font-weight:700}
  .af-agulha{stroke:#c9c9c9;stroke-width:2.6;stroke-linecap:round;
    transition:transform .1s linear,stroke .18s}
  .af-mostrador.certo .af-agulha{stroke:#8FE84A;stroke-width:3.2}
  .af-pivo{fill:none;stroke:var(--gray3);stroke-width:2}
  .af-mostrador.certo .af-pivo{stroke:#8FE84A}
  .af-cents{text-align:center;font-family:'Inter',sans-serif;font-size:12.5px;
    font-weight:700;color:var(--gray);min-height:17px;font-variant-numeric:tabular-nums}
  .af-cents.certo{color:#8FE84A}

  /* cordas — este bloco foi apagado por engano ao trocar o
     mostrador, e as caixas ficaram sem forma nenhuma */
  .af-cordas{display:grid;gap:8px;margin:14px 0 4px}
  .af-cordas button{
    display:flex;flex-direction:column;align-items:center;gap:3px;line-height:1.15;
    background:var(--black5);border:1px solid var(--gray3);border-radius:11px;
    color:#ddd;cursor:pointer;font-family:'Inter',sans-serif;
    font-size:15px;font-weight:800;padding:11px 4px;
  }
  .af-cordas button small{
    font-size:9.5px;font-weight:600;color:var(--gray2);white-space:nowrap;
  }
  .af-cordas button.perto{border-color:var(--cifra);color:var(--cifra)}
  .af-cordas button.certo{background:#8FE84A;border-color:#8FE84A;color:#12240a}
  .af-cordas button.certo small{color:#12240a;opacity:.75}
  .claro .af-cordas button{background:#E4DFD8;border-color:rgba(0,0,0,.16);color:#242424}

  .af-mic{
    width:100%;margin-top:14px;padding:14px;border-radius:12px;cursor:pointer;
    background:var(--cifra);border:none;color:#1a1a1a;
    font-family:'Inter',sans-serif;font-size:14px;font-weight:800;
  }
  .af-mic.ativo{background:none;border:1px solid var(--gray3);color:#ddd}
  .claro .af-mic{background:var(--cifra-claro);color:#fff}
  .af-aviso{font-family:'Inter',sans-serif;font-size:12px;color:var(--gray);
    text-align:center;margin-top:10px;line-height:1.45}`;
  document.head.appendChild(st);
})();

//  Ponteiro em arco: os riscos cobrem de -50 a +50 cents, com o
//  bemol à esquerda e o sustenido à direita. A agulha gira em
//  torno do pino de baixo, como num afinador de bancada.
const AF_ABERTURA = 52;                      // graus para cada lado

function afSvgPonteiro() {
  const cx = 150, cy = 176, raio = 150;
  const riscos = [];
  for (let c = -50; c <= 50; c += 5) {
    const forte = c % 25 === 0;
    const g = (c / 50) * AF_ABERTURA - 90;
    const r = g * Math.PI / 180;
    const r1 = raio - (forte ? 17 : 10), r2 = raio;
    riscos.push(`<line x1="${(cx + Math.cos(r) * r1).toFixed(1)}" y1="${(cy + Math.sin(r) * r1).toFixed(1)}"
                       x2="${(cx + Math.cos(r) * r2).toFixed(1)}" y2="${(cy + Math.sin(r) * r2).toFixed(1)}"
                       class="af-tick${forte ? " forte" : ""}"/>`);
  }
  return `<svg viewBox="0 0 300 190" class="af-gauge" aria-hidden="true">
    ${riscos.join("")}
    <text x="30" y="150" class="af-sinal">&#9837;</text>
    <text x="264" y="150" class="af-sinal">&#9839;</text>
    <line id="afAgulha" class="af-agulha" x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - raio + 6}"
          style="transform-box:fill-box;transform-origin:50% 100%"/>
    <circle class="af-pivo" cx="${cx}" cy="${cy}" r="7"/>
  </svg>`;
}

function afPainel() {
  let p = document.getElementById("afPainel");
  if (p) return p;
  const box = document.getElementById("lyraBox");
  if (!box) return null;

  p = document.createElement("div");
  p.id = "afPainel";
  p.className = "af-painel";
  p.innerHTML = `
    <div class="op-pega"></div>
    <div class="af-hd">
      <h4>Afinador</h4>
      <button class="af-x" id="afX" aria-label="Fechar">&#10005;</button>
    </div>
    <div class="af-topo">
      <div class="af-abas" id="afAbas">
        <button data-i="violao">Violão</button>
        <button data-i="baixo">Baixo</button>
      </div>
      <select class="af-sel" id="afAfinacaoSel" aria-label="Afinação"></select>
    </div>
    <div class="af-mostrador" id="afMostrador">
      <div class="af-fita" id="afFita"></div>
      <div class="af-hz" id="afHz"></div>
      ${afSvgPonteiro()}
      <div class="af-cents" id="afCents"></div>
    </div>
    <div class="af-cordas" id="afCordas"></div>
    <button class="af-mic" id="afMic">Ligar o microfone</button>
    <p class="af-aviso" id="afAviso">O navegador vai pedir permissão do microfone.</p>`;
  box.appendChild(p);

  p.querySelector("#afX").addEventListener("click", afFechar);
  p.querySelector("#afMic").addEventListener("click", () => afStream ? afParar() : afLigar());
  p.querySelectorAll("#afAbas button").forEach(b =>
    b.addEventListener("click", () => {
      afInst = b.dataset.i;
      localStorage.setItem("tl_afinador_inst", afInst);
      // baixo não tem Drop C#: volta para a padrão se ficou órfã
      if (!AF_AFINACOES[afInst][afAfinacao]) afAfinacao = "padrao";
      afPintarBase();
    }));

  p.querySelector("#afAfinacaoSel").addEventListener("change", e => {
    afAfinacao = e.target.value;
    localStorage.setItem("tl_afinacao", afAfinacao);
    afPintarBase();
  });
  afPintarBase();
  return p;
}

function afPintarBase() {
  const p = document.getElementById("afPainel");
  if (!p) return;
  p.querySelectorAll("#afAbas button").forEach(b => b.classList.toggle("on", b.dataset.i === afInst));

  const sel = p.querySelector("#afAfinacaoSel");
  if (sel) {
    sel.innerHTML = Object.entries(AF_AFINACOES[afInst])
      .map(([k, v]) => `<option value="${k}">${v.nome}</option>`).join("");
    if (!AF_AFINACOES[afInst][afAfinacao]) afAfinacao = "padrao";
    sel.value = afAfinacao;
  }
  const cordas = AF_INSTRUMENTOS[afInst].cordas;
  const g = p.querySelector("#afCordas");
  g.style.gridTemplateColumns = `repeat(${cordas.length},1fr)`;
  g.innerHTML = cordas.map((c, i) =>
    `<button data-c="${i}">${c.rotulo}<small>${afFreqDeMidi(c.midi).toFixed(1)} Hz</small></button>`).join("");
  g.querySelectorAll("button").forEach(b =>
    b.addEventListener("click", () => {
      // toca a corda como referência, usando a voz de violão
      const m = cordas[Number(b.dataset.c)].midi;
      const t = acCtx().currentTime + 0.05;
      //  A referência sai no instrumento que está sendo afinado, e
      //  bem mais alto que uma nota de acorde: aqui soa uma nota
      //  sozinha, enquanto num acorde seis somam. Com o mesmo
      //  ganho, esta parecia baixa demais. O baixo sobe mais ainda,
      //  porque grave é ouvido como mais fraco na mesma potência.
      const forca = afInst === "baixo" ? 3.4 : 2.6;
      if (typeof somTocar === "function" &&
          somTocar(afInst === "baixo" ? "baixo" : "violao", m, t, 2.2, forca)) return;
      if (typeof acVozViolao === "function") acVozViolao(m, t, 2.2, 1.3);
    }));
  afLimpar();
}

function afLimpar() {
  const p = document.getElementById("afPainel");
  if (!p) return;
  p.querySelector("#afFita").innerHTML = `<span class="atual">&mdash;</span>`;
  p.querySelector("#afHz").textContent = "";
  p.querySelector("#afCents").textContent = "";
  p.querySelector("#afCents").classList.remove("certo");
  p.querySelector("#afMostrador").classList.remove("certo");
  const ag = p.querySelector("#afAgulha");
  if (ag) ag.style.transform = "rotate(0deg)";
  p.querySelectorAll("#afCordas button").forEach(b => b.classList.remove("perto", "certo"));
}

async function afLigar() {
  const aviso = document.getElementById("afAviso");
  try {
    afStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (e) {
    aviso.textContent = location.protocol === "https:" || location.hostname === "localhost"
      ? "Não consegui acessar o microfone. Verifique a permissão do navegador."
      : "O microfone só funciona em endereço seguro (https).";
    return;
  }

  afCtx = new (window.AudioContext || window.webkitAudioContext)();
  const fonte = afCtx.createMediaStreamSource(afStream);
  afAnalisador = afCtx.createAnalyser();
  afAnalisador.fftSize = 4096;
  fonte.connect(afAnalisador);
  afBuf = new Float32Array(afAnalisador.fftSize);

  document.getElementById("afMic").textContent = "Desligar o microfone";
  document.getElementById("afMic").classList.add("ativo");
  aviso.textContent = "Toque uma corda solta.";
  afOuvirLoop();
}

function afParar() {
  const tinhaMicrofone = !!afStream;

  if (afRaf) cancelAnimationFrame(afRaf);
  if (afStream) afStream.getTracks().forEach(t => t.stop());
  if (afCtx) afCtx.close();
  afStream = afCtx = afAnalisador = null; afSuave = null;

  //  Com o microfone aberto, o navegador entra em modo de chamada
  //  e abaixa a saída para o alto-falante não realimentar o eco.
  //  Soltar o microfone não desfaz isso sozinho: o contexto de
  //  áudio continua na sessão rebaixada. Refazer o contexto é o
  //  que devolve o volume dos acordes e do metrônomo.
  if (tinhaMicrofone) afRestaurarSaida();
  const b = document.getElementById("afMic");
  if (b) { b.textContent = "Ligar o microfone"; b.classList.remove("ativo"); }
  afLimpar();
}

//  A análise custa uns 12ms. A cada quadro, isso come metade do
//  orçamento de 16ms e engasga a tela em aparelho antigo. Vinte
//  vezes por segundo é mais que suficiente: ninguém afina uma
//  corda em menos de 50ms.
const AF_INTERVALO = 50;
let afUltima = 0;

//  Fecha o contexto compartilhado para que o próximo som crie um
//  novo, já fora do modo de chamada. As amostras são soltas junto,
//  mas voltam do disco sem passar pela rede.
function afRestaurarSaida() {
  try {
    if (typeof acAudio !== "undefined" && acAudio) {
      const velho = acAudio;
      acAudio = null;
      if (typeof somSaida !== "undefined") somSaida = null;
      if (typeof somBuffers !== "undefined") somBuffers.clear();
      if (typeof acTocando !== "undefined") acTocando = [];
      velho.close();
    }
  } catch (e) { /* já estava fechado */ }
}

function afOuvirLoop(agora) {
  if (!afAnalisador) return;
  afRaf = requestAnimationFrame(afOuvirLoop);
  if (agora && agora - afUltima < AF_INTERVALO) return;
  afUltima = agora || 0;

  afAnalisador.getFloatTimeDomainData(afBuf);
  const f = afDetectar(afBuf, afCtx.sampleRate);
  if (f > 0) {
    // média corrida: sem isso o número dança a cada quadro
    afSuave = afSuave === null ? f : afSuave * 0.72 + f * 0.28;
    afMostrar(afAnalisar(afSuave, AF_INSTRUMENTOS[afInst].cordas));
  }
}

function afMostrar(a) {
  const p = document.getElementById("afPainel");
  if (!p) return;
  const certo = Math.abs(a.cents) <= 4;

  p.querySelector("#afMostrador").classList.toggle("certo", certo);

  // a nota no meio e duas vizinhas de cada lado
  const midi = Math.round(afMidiDeFreq(a.freq));
  const fita = [-2, -1, 0, 1, 2].map(d => {
    const m = midi + d;
    const nome = AF_NOTAS[((m % 12) + 12) % 12];
    const oit = Math.floor(m / 12) - 1;
    return `<span class="${d === 0 ? "atual" : ""}">${nome}<sup>${oit}</sup></span>`;
  }).join("");
  p.querySelector("#afFita").innerHTML = fita;

  p.querySelector("#afHz").textContent = a.freq.toFixed(1) + " Hz";

  const cents = p.querySelector("#afCents");
  cents.textContent = certo ? "afinado" : `${a.cents > 0 ? "+" : ""}${a.cents} cents`;
  cents.classList.toggle("certo", certo);

  const grau = Math.max(-1, Math.min(1, a.cents / 50)) * AF_ABERTURA;
  const agulha = p.querySelector("#afAgulha");
  if (agulha) agulha.style.transform = `rotate(${grau}deg)`;

  p.querySelectorAll("#afCordas button").forEach((b, i) => {
    const nessa = i === a.corda && !a.longe;
    b.classList.toggle("perto", nessa && !certo);
    b.classList.toggle("certo", nessa && certo);
  });
}

function afAbrir() {
  afPainel().classList.add("on");
  // busca as amostras das cordas para o toque de referência sair certo
  if (typeof somPreparar === "function")
    somPreparar(afInst === "baixo" ? "baixo" : "violao",
                AF_INSTRUMENTOS[afInst].cordas.map(c => c.midi));

  //  Um painel por vez. Em tela estreita o menu de opções recolhe
  //  para o afinador subir sozinho; em tela larga o menu é coluna
  //  fixa e continua onde está.
  if (typeof opRapidoFechar === "function") opRapidoFechar();
  if (typeof acFechar === "function") acFechar();
  if (!OP_LARGO()) {
    opFechar();
    document.getElementById("opFundo")?.classList.add("on");
  }
}

function afFechar() {
  afParar();
  document.getElementById("afPainel")?.classList.remove("on");
  if (!OP_LARGO()) document.getElementById("opFundo")?.classList.remove("on");
}

// ── linha no menu de opções ─────────────────────────────────
const AF_ICO = `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M12 3v10"/><circle cx="12" cy="16.5" r="3.5"/><path d="M5 9a9 9 0 0 1 14 0"/></svg>`;

const afMontarOriginal = opMontar;
opMontar = function (...a) {
  const r = afMontarOriginal.apply(this, a);
  const p = document.getElementById("opPainel");
  if (p && !document.getElementById("opLinhaAfinador")) {
    const b = document.createElement("button");
    b.className = "lyra-btn";
    b.textContent = "Abrir";
    b.style.cssText = "padding:0 14px;font-size:12.5px";
    b.addEventListener("click", afAbrir);
    p.appendChild(opGrupo(opLinha(AF_ICO, "Afinador", b, "opLinhaAfinador")));
  }
  return r;
};

const afFecharLeitor = lyraFecharLeitor;
lyraFecharLeitor = function (...a) { afFechar(); return afFecharLeitor.apply(this, a); };