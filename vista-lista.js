// ============================================================
//  TOM LOUVORES — vista em lista
//  Alternativa aos cards: uma linha por música, densa.
//  Carregue DEPOIS do app.js e do lyra.js.
//  Não altera nenhum arquivo existente.
// ============================================================
//  O que muda de ideia em relação ao card:
//   • o card mostra 8 músicas por tela, a lista mostra ~25
//   • o tom fica na primeira coluna, alinhado — dá pra varrer
//     a coluna inteira procurando um tom sem ler os nomes
//   • cabeçalho de grupo gruda no topo enquanto você rola
//   • índice lateral A–Z pula direto pra letra (218 músicas
//     é muita rolagem)
//   • agrupar por LETRA, por TOM ou por MAIS RECENTE
//   • teclado: ↑ ↓ anda, Enter abre, / foca a busca
// ============================================================

const VISTA_KEY   = "tl_vista";
const VISTA_GRUPO = "tl_vista_grupo";

let vistaModo    = localStorage.getItem(VISTA_KEY)   || "lista";  // lista | cards
let vistaAgrupar = localStorage.getItem(VISTA_GRUPO) || "letra";  // letra | tom | recente
let vistaLista   = [];

// ── estilo (injetado, para não mexer no style.css) ──────────

(function vistaEstilo() {
  const st = document.createElement("style");
  st.textContent = `
  .lst-wrap{max-width:1280px;margin:0 auto 80px;padding:0 36px;position:relative}

  /* barra de controles da lista */
  .lst-bar{
    display:flex;align-items:center;gap:14px;
    padding:10px 0 12px;
    border-bottom:1px solid var(--black4);
    font-size:11px;font-weight:700;letter-spacing:0.1em;
    text-transform:uppercase;color:var(--gray2);
  }
  .lst-count{color:var(--gray)}
  .lst-bar-sp{flex:1}
  .lst-bar-lbl{flex-shrink:0}

  /* em tela estreita o "RECENTES" ficava cortado: some o rótulo
     e os botões apertam, mantendo a barra numa linha só */
  @media(max-width:480px){
    .lst-bar{gap:8px}
    .lst-bar-lbl{display:none}
    .lst-count{font-size:10px}
    .lst-seg button{padding:6px 8px;font-size:9px;letter-spacing:0.06em}
  }
  .lst-seg{display:inline-flex;border:1px solid var(--black5);border-radius:var(--r);overflow:hidden}
  .lst-seg button{
    background:transparent;border:none;cursor:pointer;
    font-family:'Inter',sans-serif;
    font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;
    color:var(--gray2);padding:7px 12px;transition:all 0.15s;
  }
  .lst-seg button:hover{color:var(--white);background:var(--black3)}
  .lst-seg button.on{background:var(--yellow);color:var(--black)}

  /* âncora do pulo: um ponto de altura zero ANTES do cabeçalho.
     Ela nunca gruda, então medir a posição dela sempre dá certo. */
  .lst-ancora{
    display:block;height:0;overflow:hidden;
    scroll-margin-top:calc(var(--lst-topo, 118px) + 12px);
  }

  /* cabeçalho de grupo */
  .lst-grupo{
    position:sticky;z-index:60;
    /* gruda exatamente onde a busca termina. O valor é medido no
       navegador (vistaAjustarTopo), porque a altura da barra muda
       com a largura da tela, com o notch e com o zoom da fonte. */
    top:var(--lst-topo, 118px);
    background:var(--black);
    display:flex;align-items:baseline;gap:14px;
    /* MARGEM, não padding: padding faz parte da caixa que gruda e
       viajava junto, virando um vão preto entre a busca e a letra */
    margin-top:30px;
    padding:6px 0 12px;
    position:sticky;
  }
  /* a listra do grupo: mesma largura e mesma cor da que separa as
     músicas — os 10px de cada lado acompanham a margem negativa da
     linha. A diferença é só a ponta arredondada. */
  .lst-grupo::after{
    content:"";position:absolute;
    left:-10px;right:-10px;bottom:0;height:2px;
    border-radius:2px;
    background:var(--black4);
  }
  /* o primeiro grupo não precisa do respiro de cima */
  .lst-grupo:first-of-type{margin-top:12px}

  /* a letra é DIVISÃO, não conteúdo: bem maior que o tom e sem
     o amarelo, que nesta tela pertence só ao tom. Antes as duas
     tinham o mesmo tamanho e a mesma cor, e a lista virava um
     bloco só. */
  .lst-grupo b{
    font-family:'Bebas Neue',sans-serif;
    font-size:36px;line-height:0.8;letter-spacing:0.04em;
    color:var(--white);
  }
  .lst-grupo span{
    font-size:11px;font-weight:600;letter-spacing:0.04em;
    color:var(--gray2);
  }
  .lst-grupo i{flex:1;height:1px;background:transparent;font-style:normal}

  /* a linha */
  .lst-row{
    display:grid;
    /* larguras FIXAS. Com "auto" cada linha é uma grade própria e
       se ajusta ao próprio conteúdo: quem tem C#M empurra o nome
       mais para a direita que quem tem E, e nada alinha. */
    grid-template-columns:100px minmax(0,1fr) auto 74px 26px;
    align-items:center;gap:14px;
    padding:9px 10px;margin:0 -10px;
    /* sem raio: o separador é um inset box-shadow e acompanhava a
       curva do canto, deixando a listra com as pontas arredondadas */
    border-radius:0;
    cursor:pointer;outline:none;
    border:1px solid transparent;
    transition:background 0.12s,border-color 0.12s;
  }
  .lst-row + .lst-row{box-shadow:inset 0 1px 0 var(--black4)}
  .lst-row:hover{background:var(--black2)}
  .lst-row:focus-visible{border-color:var(--yellow);background:var(--black2)}

  /* dois tons por linha: com 3 ou 4 tons a coluna cresce para
     baixo em vez de empurrar o nome para a direita */
  .lst-tons{
    display:grid;grid-template-columns:repeat(2,auto);
    gap:4px;justify-content:start;align-content:center;
    min-width:0;
  }
  .lst-tom{
    font-family:'Bebas Neue',sans-serif;
    font-size:16px;line-height:1;letter-spacing:0.04em;
    color:var(--yellow);
    background:rgba(255,224,0,0.08);
    border:1px solid rgba(255,224,0,0.2);
    padding:4px 7px;border-radius:4px;
    min-width:34px;text-align:center;
  }
  .lst-tom.mais{
    color:var(--gray2);background:transparent;
    border-color:var(--black5);font-family:'Inter',sans-serif;
    font-size:10px;font-weight:700;padding:5px 6px;
  }
  .lst-nome{
    font-size:14px;font-weight:600;color:var(--white);
    letter-spacing:-0.01em;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  }
  .lst-mins{display:flex;gap:5px;flex-shrink:0;min-width:150px;justify-content:flex-end;min-height:19px}
  .lst-min{
    font-size:9px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;
    color:#B4B4B4;background:rgba(255,255,255,0.05);
    border:1px solid rgba(255,255,255,0.08);
    padding:3px 8px;border-radius:3px;white-space:nowrap;
  }
  .lst-min.todos{color:#8A8A8A}
  .lst-data{
    font-size:10px;color:var(--gray2);text-align:right;
    letter-spacing:0.04em;white-space:nowrap;
  }
  .lst-del{
    width:22px;height:22px;
    background:transparent;border:1px solid transparent;
    color:var(--gray2);font-size:11px;cursor:pointer;
    border-radius:4px;opacity:0;transition:all 0.15s;
    display:flex;align-items:center;justify-content:center;
  }
  .lst-row:hover .lst-del{opacity:1}
  .lst-del:hover{background:rgba(248,113,113,0.1);color:#F87171;border-color:rgba(248,113,113,0.3)}
  body.read-only .lst-del{display:none}

  /* índice A–Z */
  .lst-az{
    position:fixed;right:10px;top:50%;transform:translateY(-50%);
    display:flex;flex-direction:column;gap:1px;z-index:70;
  }
  .lst-az button{
    background:none;border:none;cursor:pointer;
    font-family:'Inter',sans-serif;
    font-size:9px;font-weight:700;color:var(--gray2);
    width:18px;height:15px;border-radius:3px;
    transition:all 0.12s;
  }
  .lst-az button:hover{color:var(--black);background:var(--yellow)}
  .lst-az button:disabled{opacity:0.25;cursor:default}
  .lst-az button:disabled:hover{color:var(--gray2);background:none}

  .lst-vazio{padding:70px 0;text-align:center;color:var(--gray2);font-size:13px}

  /* botão de alternar vista, na barra de filtros */
  .btn-vista{
    display:inline-flex;align-items:center;gap:7px;flex-shrink:0;
    background:var(--black2);border:1px solid var(--black5);
    color:var(--gray);font-family:'Inter',sans-serif;
    font-size:12px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;
    padding:11px 14px;border-radius:var(--r);cursor:pointer;transition:all 0.15s;
  }
  .btn-vista:hover{border-color:var(--gray3);color:var(--white)}

  @media(max-width:820px){
    .lst-row{
      /* aqui também com largura fixa: com "auto" cada linha
         media a própria coluna e os nomes começavam em pontos
         diferentes, de 89px a 203px */
      grid-template-columns:100px minmax(0,1fr) auto;
      grid-template-areas:"tons nome del" "tons mins mins";
      row-gap:6px;
    }
    .lst-tons{grid-area:tons;min-width:0}
    .lst-mins{min-width:0;justify-content:flex-start}
    /* o nome pode usar duas linhas, mas o espaço das duas é sempre
       reservado: assim uma música de nome curto ocupa a mesma
       altura de uma de nome longo, e a lista fica com um ritmo só */
    .lst-nome{
      grid-area:nome;white-space:normal;
      display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
      overflow:hidden;line-height:1.3;min-height:calc(1.3em * 2);
    }
    .lst-mins{grid-area:mins}
    .lst-del {grid-area:del;opacity:1}
    .lst-data{display:none}
    .lst-wrap{padding:0 20px}
    .lst-grupo{margin-top:26px;padding:2px 0 8px}
    .lst-grupo b{font-size:30px}
    .lst-az{right:2px}
    .btn-vista span{display:none}
    .btn-vista{padding:11px 12px}
  }`;
  document.head.appendChild(st);
})();

// ── ícones ──────────────────────────────────────────────────

const VISTA_ICO = {
  lista: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>`,
  cards: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
};

// ── utilidades ──────────────────────────────────────────────

function vistaNorm(s = "") {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
}

function vistaInicial(nome) {
  const c = vistaNorm(nome)[0] || "#";
  return /[A-Z]/.test(c) ? c : "#";
}

// tons únicos de uma música, na ordem cadastrada
function vistaTons(m) {
  return [...new Set(deserializarPares(m.tom).map(p => p.tom).filter(Boolean))];
}

// ministrantes: null quando o tom vale para todos
function vistaMins(m) {
  const pares = deserializarPares(m.tom);
  const todos = pares.some(p => minsReaisDoPar(p, pares) === null);
  if (todos) return null;
  return [...new Set(pares.flatMap(p => minsReaisDoPar(p, pares) || []))];
}

// ── agrupamento ─────────────────────────────────────────────

function vistaAgrupada(lista) {
  const grupos = new Map();

  if (vistaAgrupar === "tom") {
    lista.forEach(m => {
      const tons = vistaTons(m);
      (tons.length ? tons : ["—"]).forEach(t => {
        if (!grupos.has(t)) grupos.set(t, []);
        grupos.get(t).push(m);
      });
    });
    return [...grupos.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], "pt-BR", { numeric: true }));
  }

  if (vistaAgrupar === "recente") {
    const ordenada = [...lista].sort((a, b) =>
      new Date(b.criado_em || 0) - new Date(a.criado_em || 0));
    const hoje = new Date();
    const dias = d => Math.floor((hoje - new Date(d || 0)) / 86400000);
    ordenada.forEach(m => {
      const d = dias(m.criado_em);
      const g = d <= 7 ? "Últimos 7 dias"
              : d <= 30 ? "Último mês"
              : d <= 90 ? "Últimos 3 meses" : "Mais antigas";
      if (!grupos.has(g)) grupos.set(g, []);
      grupos.get(g).push(m);
    });
    return [...grupos.entries()];
  }

  lista.forEach(m => {                       // por letra (padrão)
    const l = vistaInicial(m.nome);
    if (!grupos.has(l)) grupos.set(l, []);
    grupos.get(l).push(m);
  });
  return [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
}

// ── desenho ─────────────────────────────────────────────────

function vistaLinhaHTML(m) {
  const tons = vistaTons(m);
  const mins = vistaMins(m);

  const tonsHTML = (tons.length ? tons.slice(0, 3) : ["—"])
    .map(t => `<span class="lst-tom">${esc(t)}</span>`).join("")
    + (tons.length > 3 ? `<span class="lst-tom mais">+${tons.length - 3}</span>` : "");

  const minsHTML = mins === null
    ? `<span class="lst-min todos">Todos</span>`
    : mins.slice(0, 3).map(n => `<span class="lst-min">${esc(n)}</span>`).join("");

  const data = m.criado_em
    ? new Date(m.criado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
    : "";

  return `
    <div class="lst-row" data-id="${m.id}" tabindex="0" role="button">
      <div class="lst-tons">${tonsHTML}</div>
      <div class="lst-nome">${esc(m.nome)}</div>
      <div class="lst-mins">${minsHTML}</div>
      <div class="lst-data">${data}</div>
      <button class="lst-del" title="Excluir"
        onclick="event.stopPropagation();excluir('${m.id}')">✕</button>
    </div>`;
}

function vistaRenderLista(lista) {
  const grid = document.getElementById("grid");

  // tira só os cards: #stLoading e #stEmpty moram dentro do #grid e
  // o app.js conta com eles existindo quando volta para a visão em cards
  grid.querySelectorAll(".card").forEach(c => c.remove());
  const carregando = document.getElementById("stLoading");
  const vazio      = document.getElementById("stEmpty");
  if (carregando) carregando.style.display = "none";
  if (vazio)      vazio.style.display      = "none";
  grid.style.display = "none";                 // a grade some; a lista assume

  let wrap = document.getElementById("lstWrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "lstWrap";
    wrap.className = "lst-wrap";
    grid.parentNode.insertBefore(wrap, grid.nextSibling);
  }
  wrap.style.display = "";

  const grupos = vistaAgrupada(lista);
  const total  = lista.length;

  const barra = `
    <div class="lst-bar">
      <span class="lst-count">${total} ${total === 1 ? "música" : "músicas"}</span>
      <span class="lst-bar-sp"></span>
      <span class="lst-bar-lbl">Agrupar</span>
      <span class="lst-seg" id="lstAgrupar">
        <button data-g="letra"${vistaAgrupar === "letra" ? ' class="on"' : ""}>A–Z</button>
        <button data-g="tom"${vistaAgrupar === "tom" ? ' class="on"' : ""}>Tom</button>
        <button data-g="recente"${vistaAgrupar === "recente" ? ' class="on"' : ""}>Recentes</button>
      </span>
    </div>`;

  const corpo = grupos.map(([nome, itens]) => `
    <span class="lst-ancora" id="lstG-${encodeURIComponent(nome)}" aria-hidden="true"></span>
    <div class="lst-grupo">
      <b>${esc(nome)}</b>
      <span>${itens.length}</span>
      <i></i>
    </div>
    ${itens.map(vistaLinhaHTML).join("")}`).join("");

  wrap.innerHTML = barra + (total
    ? corpo
    : `<div class="lst-vazio">Nenhuma música encontrada.</div>`);

  // agrupamento
  wrap.querySelectorAll("#lstAgrupar button").forEach(b =>
    b.addEventListener("click", () => {
      vistaAgrupar = b.dataset.g;
      localStorage.setItem(VISTA_GRUPO, vistaAgrupar);
      vistaRenderLista(vistaLista);
    }));

  // abrir a música
  wrap.querySelectorAll(".lst-row").forEach(row => {
    const m = lista.find(x => x.id == row.dataset.id);
    row.addEventListener("click", () => abrirView(m));
    row.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrirView(m); }
    });
  });

  vistaAjustarTopo();
  vistaRenderIndice(grupos);
}

// ── onde o cabeçalho de grupo deve grudar ───────────────────
//  Abaixo de 768px quem fica fixo no topo é a .search-row;
//  acima, a .toolbar inteira. Medimos o rodapé desse elemento e
//  guardamos em --lst-topo, que o CSS usa. Assim o cabeçalho
//  encosta na busca em vez de flutuar no meio da lista.

function vistaAjustarTopo() {
  const fixo = document.querySelector(
    window.innerWidth <= 768 ? ".search-row" : ".toolbar");
  if (!fixo) return;

  // Onde a busca gruda é a base do header, e ela mesma diz a própria
  // altura. Antes eu lia o "top" calculado da busca, que podia estar
  // com o valor de reserva enquanto o header ainda não tinha sido
  // medido — e aí o cabeçalho de letra grudava fora do lugar.
  const header  = document.querySelector(".header");
  const grudaEm = header
    ? header.offsetHeight
    : (parseFloat(getComputedStyle(fixo).top) || 0);

  document.documentElement.style.setProperty(
    "--lst-topo", (grudaEm + fixo.offsetHeight) + "px");
}

window.addEventListener("resize", vistaAjustarTopo);
window.addEventListener("load", vistaAjustarTopo);
// a primeira rolagem confere de novo: fontes e imagens podem ter
// mudado a altura do header depois do desenho inicial
window.addEventListener("scroll", vistaAjustarTopo, { once: true, passive: true });
if (window.visualViewport) window.visualViewport.addEventListener("resize", vistaAjustarTopo);

// ── índice lateral A–Z ──────────────────────────────────────

// Descobre QUEM rola: a janela ou algum ancestral com rolagem
// própria. Sem isso, mandar a janela rolar não move nada quando
// a lista mora dentro de um contêiner que rola sozinho.
function vistaQuemRola(el) {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY;
    if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight + 4) return n;
  }
  return null;                       // é a janela mesmo
}

// Leva a âncora do grupo até o topo útil.
// A âncora tem altura zero e não é grudenta, então o retângulo
// dela é sempre a posição verdadeira — o cabeçalho, por ser
// sticky, mentia a posição depois do primeiro pulo.
function vistaIrPara(alvo, folga) {
  const caixa = vistaQuemRola(alvo);
  const rect  = alvo.getBoundingClientRect();

  const atual = caixa ? caixa.scrollTop : window.scrollY;
  const base  = caixa ? caixa.getBoundingClientRect().top : 0;
  const alvoY = Math.max(0, atual + rect.top - base - folga);

  (caixa || window).scrollTo({ top: alvoY, behavior: "smooth" });

  // rede de segurança: se algo interromper a rolagem suave
  // (foco, gesto, outra rolagem), termina o trajeto sem animação
  setTimeout(() => {
    const onde = caixa ? caixa.scrollTop : window.scrollY;
    if (Math.abs(onde - alvoY) > 4) (caixa || window).scrollTo({ top: alvoY });
  }, 500);
}

function vistaRenderIndice(grupos) {
  let az = document.getElementById("lstAZ");
  if (vistaAgrupar !== "letra" || !grupos.length) { if (az) az.remove(); return; }

  if (!az) {
    az = document.createElement("div");
    az.id = "lstAZ";
    az.className = "lst-az";
    document.body.appendChild(az);
  }

  const existentes = new Set(grupos.map(g => g[0]));
  const letras = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

  az.innerHTML = letras.map(l =>
    `<button data-l="${l}"${existentes.has(l) ? "" : " disabled"}>${l}</button>`).join("");

  az.querySelectorAll("button").forEach(b =>
    b.addEventListener("click", () => {
      const alvo = document.getElementById("lstG-" + encodeURIComponent(b.dataset.l));
      if (!alvo) return;

      // a folga sai do scroll-margin-top da âncora, que o CSS já
      // define: mexeu no layout, o pulo se ajusta sozinho
      const folga = parseFloat(getComputedStyle(alvo).scrollMarginTop) || 0;
      vistaIrPara(alvo, folga);
    }));
}

// ── alternar entre lista e cards ────────────────────────────

function vistaAlternar() {
  vistaModo = vistaModo === "lista" ? "cards" : "lista";
  localStorage.setItem(VISTA_KEY, vistaModo);

  const wrap = document.getElementById("lstWrap");
  const az   = document.getElementById("lstAZ");
  if (vistaModo === "cards") {
    if (wrap) wrap.style.display = "none";
    if (az) az.remove();
    document.getElementById("grid").style.display = "";
  }
  render(vistaLista);
}

function vistaBotao() {
  if (document.getElementById("btnVista")) return;
  const alvo = document.querySelector(".filtros-row");
  if (!alvo) return;

  const b = document.createElement("button");
  b.id = "btnVista";
  b.className = "btn-vista";
  b.addEventListener("click", vistaAlternar);
  alvo.appendChild(b);
  vistaAtualizarBotao();
}

function vistaAtualizarBotao() {
  const b = document.getElementById("btnVista");
  if (!b) return;
  const proxima = vistaModo === "lista" ? "cards" : "lista";
  b.innerHTML = `${VISTA_ICO[proxima]}<span>${proxima === "cards" ? "Cards" : "Lista"}</span>`;
  b.title = `Mudar para a visão em ${proxima}`;
}

// ── teclado: ↑ ↓ anda, / foca a busca ───────────────────────

document.addEventListener("keydown", e => {
  const digitando = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  const modalAberto = document.querySelector(".overlay-bg.open, #lyraOverlay.open, #loginOverlay.open");
  if (modalAberto) return;

  if (e.key === "/" && !digitando) {
    e.preventDefault();
    document.getElementById("busca").focus();
    return;
  }
  if (vistaModo !== "lista" || digitando) return;
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

  const linhas = [...document.querySelectorAll(".lst-row")];
  if (!linhas.length) return;
  e.preventDefault();

  const atual = linhas.indexOf(document.activeElement);
  const prox  = e.key === "ArrowDown"
    ? Math.min(linhas.length - 1, atual + 1)
    : Math.max(0, atual - 1);
  linhas[prox === -1 ? 0 : prox].focus({ preventScroll: false });
});

// ── enxerto no render do app.js ─────────────────────────────

const vistaRenderAnterior = render;
render = function (lista) {
  vistaLista = lista || [];

  if (vistaModo === "cards") {
    document.getElementById("grid").style.display = "";
    const w = document.getElementById("lstWrap");
    if (w) w.style.display = "none";
    vistaRenderAnterior(lista);
  } else {
    // o leitor de cifras usa esta lista para as setas de navegação
    if (typeof lyraListaVisivel !== "undefined") lyraListaVisivel = vistaLista;
    vistaRenderLista(vistaLista);
  }
  vistaAtualizarBotao();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", vistaBotao);
} else {
  vistaBotao();
}