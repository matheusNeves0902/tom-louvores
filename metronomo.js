// ============================================================
//  TOM LOUVORES — metrônomo
//  Carregue DEPOIS do afinador.js.
//
//  O tempo não é marcado por setTimeout: em JavaScript ele atrasa
//  sempre que a tela está ocupada, e um metrônomo que hesita não
//  serve para nada. Os cliques são agendados no relógio do áudio,
//  que roda em outra linha e não escorrega.
// ============================================================

let mtRodando = false;
let mtBpm = Number(localStorage.getItem("tl_bpm") || 90);
let mtCompasso = Number(localStorage.getItem("tl_compasso") || 4);
let mtProximo = 0, mtTempo = 0, mtTimer = null, mtVisual = null;

const MT_ANTECEDENCIA = 0.12;      // segundos agendados à frente
const MT_OLHADA = 25;              // de quanto em quanto se olha a fila

(function mtEstilo() {
  const st = document.createElement("style");
  st.textContent = `
  .mt-painel{
    position:absolute;left:0;right:0;bottom:0;z-index:78;
    background:#151515;border-top:1px solid var(--gray3);
    border-radius:18px 18px 0 0;
    padding:12px 18px calc(22px + env(safe-area-inset-bottom));
    transform:translateY(101%);transition:transform .22s ease;
    max-height:82%;overflow:auto;
  }
  .mt-painel.on{transform:none}
  .claro .mt-painel{background:#F4F0E9;border-top-color:rgba(0,0,0,.14)}
  @media (min-width:1100px){ .lyra-box.op-fixo .mt-painel{left:320px} }

  .mt-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
  .mt-hd h4{margin:0;font-family:'Inter',sans-serif;font-size:12px;font-weight:800;
    letter-spacing:.14em;text-transform:uppercase;color:var(--gray)}
  .mt-x{background:none;border:none;color:var(--gray);font-size:17px;cursor:pointer;padding:2px 6px}

  /* luzes do compasso */
  .mt-luzes{display:flex;justify-content:center;gap:10px;margin:4px 0 14px}
  .mt-luz{width:14px;height:14px;border-radius:50%;background:var(--gray3);transition:background .06s,transform .06s}
  .mt-luz.forte{width:17px;height:17px}
  .mt-luz.acesa{background:var(--cifra);transform:scale(1.18)}
  .mt-luz.forte.acesa{background:#fff}
  .claro .mt-luz.forte.acesa{background:#1a1a1a}

  .mt-bpm{text-align:center;margin-bottom:6px}
  /* o número é um campo: dá para digitar 140 em vez de subir de
     um em um cinquenta vezes */
  .mt-bpm-campo{
    font-family:'Bebas Neue',sans-serif;font-size:62px;line-height:1;
    color:#eee;letter-spacing:.02em;background:none;border:none;
    width:3.1ch;padding:0;text-align:center;caret-color:var(--cifra);
    border-bottom:2px solid transparent;transition:border-color .15s;
  }
  .mt-bpm-campo:hover{border-bottom-color:var(--gray3)}
  .mt-bpm-campo:focus{outline:none;border-bottom-color:var(--cifra)}
  .mt-bpm-campo::-webkit-outer-spin-button,
  .mt-bpm-campo::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
  .claro .mt-bpm-campo{color:#1a1a1a}
  .mt-bpm span{font-family:'Inter',sans-serif;font-size:12px;color:var(--gray);margin-left:6px}

  .mt-linha{display:flex;align-items:center;gap:10px;margin-bottom:12px}
  .mt-linha input[type=range]{flex:1;-webkit-appearance:none;appearance:none;height:4px;
    border-radius:2px;background:var(--gray3);outline:none;cursor:pointer}
  .mt-linha input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;
    border-radius:50%;background:var(--cifra);cursor:pointer}
  .mt-passo{
    flex:0 0 44px;height:44px;border-radius:11px;cursor:pointer;
    background:var(--black5);border:1px solid var(--gray3);color:#ddd;
    font-family:'Inter',sans-serif;font-size:19px;font-weight:700;
  }
  .claro .mt-passo{background:#E4DFD8;border-color:rgba(0,0,0,.16);color:#242424}

  .mt-atalhos{display:flex;gap:8px;margin-bottom:10px}
  .mt-atalhos button{
    flex:1;padding:8px 2px;border-radius:10px;cursor:pointer;
    background:none;border:1px solid var(--gray3);color:var(--gray);
    font-family:'Inter',sans-serif;font-size:11px;font-weight:700;line-height:1.3;
  }
  .mt-atalhos button small{display:block;font-size:12.5px;color:#ddd;font-weight:800;margin-top:1px}
  .mt-atalhos button.on{border-color:var(--cifra);color:var(--cifra)}
  .mt-atalhos button.on small{color:var(--cifra)}
  .claro .mt-atalhos button small{color:#242424}

  .mt-compassos{display:flex;gap:8px;margin-bottom:14px}
  .mt-compassos button{
    flex:1;padding:10px 4px;border-radius:11px;cursor:pointer;
    background:var(--black5);border:1px solid var(--gray3);color:#ddd;
    font-family:'Inter',sans-serif;font-size:13px;font-weight:700;
  }
  .mt-compassos button.on{background:var(--cifra);border-color:var(--cifra);color:#1a1a1a}
  .claro .mt-compassos button{background:#E4DFD8;border-color:rgba(0,0,0,.16);color:#242424}
  .claro .mt-compassos button.on{background:var(--cifra-claro);border-color:var(--cifra-claro);color:#fff}

  .mt-acoes{display:flex;gap:10px}
  .mt-tocar{
    flex:1;padding:15px;border-radius:12px;border:none;cursor:pointer;
    background:var(--cifra);color:#1a1a1a;
    font-family:'Inter',sans-serif;font-size:14.5px;font-weight:800;
  }
  .mt-tocar.on{background:none;border:1px solid var(--gray3);color:#ddd}
  .claro .mt-tocar{background:var(--cifra-claro);color:#fff}
  .mt-batendo{
    flex:0 0 122px;padding:15px 8px;border-radius:12px;cursor:pointer;
    background:none;border:1px dashed var(--gray3);color:var(--gray);
    font-family:'Inter',sans-serif;font-size:12.5px;font-weight:700;
  }`;
  document.head.appendChild(st);
})();

// ── som do clique ───────────────────────────────────────────
//  Dois tons curtos: o primeiro tempo mais agudo, para o ouvido
//  achar a cabeça do compasso sem contar.
function mtClique(quando, forte) {
  const ctx = acCtx();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "square";
  o.frequency.setValueAtTime(forte ? 1600 : 1050, quando);

  g.gain.setValueAtTime(0.0001, quando);
  g.gain.exponentialRampToValueAtTime(forte ? 0.32 : 0.20, quando + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, quando + 0.055);

  o.connect(g); g.connect(ctx.destination);
  o.start(quando);
  o.stop(quando + 0.07);
}

// ── o relógio ───────────────────────────────────────────────
function mtAgendar() {
  const ctx = acCtx();
  while (mtProximo < ctx.currentTime + MT_ANTECEDENCIA) {
    const forte = mtCompasso > 0 && mtTempo % mtCompasso === 0;
    mtClique(mtProximo, forte);
    mtAcenderDepois(mtTempo % (mtCompasso || 4), mtProximo - ctx.currentTime);
    mtProximo += 60 / mtBpm;
    mtTempo++;
  }
}

//  A luz acende no instante em que o clique soa, e não quando foi
//  agendado — por isso o atraso calculado.
function mtAcenderDepois(indice, daquiA) {
  setTimeout(() => {
    const luzes = document.querySelectorAll(".mt-luz");
    luzes.forEach((l, i) => l.classList.toggle("acesa", i === indice));
    clearTimeout(mtVisual);
    mtVisual = setTimeout(() => luzes.forEach(l => l.classList.remove("acesa")), 90);
  }, Math.max(0, daquiA * 1000));
}

function mtComecar() {
  mtRodando = true;
  mtTempo = 0;
  mtProximo = acCtx().currentTime + 0.06;
  mtTimer = setInterval(mtAgendar, MT_OLHADA);
  mtAgendar();
  mtPintar();
}

function mtParar() {
  mtRodando = false;
  clearInterval(mtTimer);
  document.querySelectorAll(".mt-luz").forEach(l => l.classList.remove("acesa"));
  mtPintar();
}

// ── bater o tempo com o dedo ────────────────────────────────
let mtBatidas = [];
function mtBater() {
  const agora = performance.now();
  mtBatidas = mtBatidas.filter(t => agora - t < 3000);
  mtBatidas.push(agora);
  if (mtBatidas.length < 2) return;

  const intervalos = mtBatidas.slice(1).map((t, i) => t - mtBatidas[i]);
  const media = intervalos.reduce((a, b) => a + b) / intervalos.length;
  const bpm = Math.round(60000 / media);
  if (bpm >= 30 && bpm <= 260) mtDefinirBpm(bpm);
}

function mtDefinirBpm(v, digitando = false) {
  mtBpm = Math.max(30, Math.min(260, Math.round(v) || mtBpm));
  localStorage.setItem("tl_bpm", mtBpm);
  mtPintar(digitando);
}

// ── tela ────────────────────────────────────────────────────
function mtPainel() {
  let p = document.getElementById("mtPainel");
  if (p) return p;
  const box = document.getElementById("lyraBox");
  if (!box) return null;

  p = document.createElement("div");
  p.id = "mtPainel";
  p.className = "mt-painel";
  p.innerHTML = `
    <div class="op-pega"></div>
    <div class="mt-hd"><h4>Metrônomo</h4><button class="mt-x" id="mtX" aria-label="Fechar">&#10005;</button></div>
    <div class="mt-luzes" id="mtLuzes"></div>
    <div class="mt-bpm">
      <input id="mtBpmCampo" class="mt-bpm-campo" type="text" inputmode="numeric"
             maxlength="3" aria-label="Andamento em BPM" value="90">
      <span>BPM</span>
    </div>
    <div class="mt-linha">
      <button class="mt-passo" id="mtMenos" aria-label="Diminuir">&minus;</button>
      <input type="range" id="mtRange" min="30" max="260" step="1" aria-label="Andamento">
      <button class="mt-passo" id="mtMais" aria-label="Aumentar">+</button>
    </div>
    <div class="mt-atalhos" id="mtAtalhos">
      ${[
        ["Lento", 65], ["Moderado", 90], ["Animado", 120], ["Rápido", 145],
      ].map(([t, v]) => `<button data-v="${v}">${t}<small>${v}</small></button>`).join("")}
    </div>
    <div class="mt-compassos" id="mtCompassos">
      ${[2,3,4,6].map(n => `<button data-n="${n}">${n}/4</button>`).join("")}
      <button data-n="0">livre</button>
    </div>
    <div class="mt-acoes">
      <button class="mt-tocar" id="mtTocar">Começar</button>
      <button class="mt-batendo" id="mtBater">Bater o tempo</button>
    </div>`;
  box.appendChild(p);

  p.querySelector("#mtX").addEventListener("click", mtFechar);
  p.querySelector("#mtTocar").addEventListener("click", () => mtRodando ? mtParar() : mtComecar());
  p.querySelector("#mtBater").addEventListener("click", mtBater);
  p.querySelector("#mtMenos").addEventListener("click", () => mtDefinirBpm(mtBpm - 1));
  p.querySelector("#mtMais").addEventListener("click", () => mtDefinirBpm(mtBpm + 1));
  p.querySelector("#mtRange").addEventListener("input", e => mtDefinirBpm(Number(e.target.value)));

  //  Enquanto digita, o valor não é forçado para dentro da faixa:
  //  quem quer 120 passa por "1" e por "12", e corrigir no meio da
  //  digitação apagaria o que a pessoa está escrevendo.
  const campo = p.querySelector("#mtBpmCampo");
  campo.addEventListener("input", e => {
    const limpo = e.target.value.replace(/\D/g, "").slice(0, 3);
    e.target.value = limpo;
    const v = Number(limpo);
    if (limpo && v >= 30 && v <= 260) mtDefinirBpm(v, true);
  });
  campo.addEventListener("focus", () => campo.select());
  campo.addEventListener("blur", () => mtDefinirBpm(Number(campo.value) || mtBpm));
  campo.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); campo.blur(); }
    if (e.key === "ArrowUp")   { e.preventDefault(); mtDefinirBpm(mtBpm + (e.shiftKey ? 10 : 1)); }
    if (e.key === "ArrowDown") { e.preventDefault(); mtDefinirBpm(mtBpm - (e.shiftKey ? 10 : 1)); }
  });
  p.querySelectorAll("#mtAtalhos button").forEach(b =>
    b.addEventListener("click", () => mtDefinirBpm(Number(b.dataset.v))));
  p.querySelectorAll("#mtCompassos button").forEach(b =>
    b.addEventListener("click", () => {
      mtCompasso = Number(b.dataset.n);
      localStorage.setItem("tl_compasso", mtCompasso);
      mtTempo = 0;
      mtPintar();
    }));
  mtPintar();
  return p;
}

function mtPintar(digitando = false) {
  const p = document.getElementById("mtPainel");
  if (!p) return;
  const campo = p.querySelector("#mtBpmCampo");
  // não reescreve o campo enquanto ele está sendo digitado
  if (campo && !digitando && document.activeElement !== campo) campo.value = mtBpm;
  p.querySelector("#mtRange").value = mtBpm;

  const luzes = p.querySelector("#mtLuzes");
  const n = mtCompasso || 4;
  if (luzes.children.length !== n) {
    luzes.innerHTML = Array.from({ length: n }, (_, i) =>
      `<span class="mt-luz${i === 0 && mtCompasso ? " forte" : ""}"></span>`).join("");
  }

  p.querySelectorAll("#mtCompassos button").forEach(b =>
    b.classList.toggle("on", Number(b.dataset.n) === mtCompasso));
  p.querySelectorAll("#mtAtalhos button").forEach(b =>
    b.classList.toggle("on", Number(b.dataset.v) === mtBpm));

  const t = p.querySelector("#mtTocar");
  t.textContent = mtRodando ? "Parar" : "Começar";
  t.classList.toggle("on", mtRodando);
}

function mtAbrir() {
  mtPainel().classList.add("on");
  if (typeof afFechar === "function") afFechar();
  if (typeof acFechar === "function") acFechar();
  if (typeof opRapidoFechar === "function") opRapidoFechar();
  if (!OP_LARGO()) {
    opFechar();
    document.getElementById("opFundo")?.classList.add("on");
  }
}

function mtFechar() {
  mtParar();
  document.getElementById("mtPainel")?.classList.remove("on");
  if (!OP_LARGO()) document.getElementById("opFundo")?.classList.remove("on");
}

// ── linha no menu ───────────────────────────────────────────
const MT_ICO = `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M9.5 3h5l4 18h-13z"/><path d="M6.2 15h11.6"/><path d="M12 20V7"/></svg>`;

const mtMontarOriginal = opMontar;
opMontar = function (...a) {
  const r = mtMontarOriginal.apply(this, a);
  const p = document.getElementById("opPainel");
  if (p && !document.getElementById("opLinhaMetronomo")) {
    const b = document.createElement("button");
    b.className = "lyra-btn";
    b.textContent = "Abrir";
    b.style.cssText = "padding:0 14px;font-size:12.5px";
    b.addEventListener("click", mtAbrir);
    // entra no mesmo grupo do afinador, que já está no fim do menu
    const grupoAfinador = document.getElementById("opLinhaAfinador")?.parentElement;
    const linha = opLinha(MT_ICO, "Metrônomo", b, "opLinhaMetronomo");
    if (grupoAfinador) grupoAfinador.appendChild(linha);
    else p.appendChild(opGrupo(linha));
  }
  return r;
};

//  os outros painéis recolhem o metrônomo, mas o som continua:
//  quem liga o metrônomo quer tocar junto com a cifra na tela
const mtAfAbrir = afAbrir;
afAbrir = function (...a) { document.getElementById("mtPainel")?.classList.remove("on"); return mtAfAbrir.apply(this, a); };

const mtOpAbrir = opAbrir;
opAbrir = function (...a) { document.getElementById("mtPainel")?.classList.remove("on"); return mtOpAbrir.apply(this, a); };

const mtFecharLeitor = lyraFecharLeitor;
lyraFecharLeitor = function (...a) { mtFechar(); return mtFecharLeitor.apply(this, a); };