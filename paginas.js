// ============================================================
//  TOM LOUVORES — duas páginas
//  Carregue por ÚLTIMO, depois de todos os outros scripts.
//
//  index.html      → só os louvores escalados nos cultos
//  repertorio.html → a lista completa, com busca e filtros
//
//  Os dois arquivos compartilham o mesmo app.js. Cada página
//  traz escondidos os campos de que o app.js precisa mas que
//  ela não mostra, então nada aqui altera o app.js.
// ============================================================

const PAGINA = document.body.dataset.pagina || "cultos";

// ============================================================
//  ESTILO
// ============================================================

(function paginasEstilo() {
  const st = document.createElement("style");
  st.textContent = `
  /* ── abas Cultos / Repertório ──────────────────────────────
     No desktop elas moram dentro do header, ao lado da logo:
     aproveita a faixa larga que estava vazia. No celular o
     header quebra em duas linhas e as abas viram uma faixa de
     largura inteira — mas ainda dentro do header, então tudo
     sobe grudado ao rolar.                                     */
  .nav-pag{
    display:flex;align-items:stretch;gap:24px;flex-shrink:0;
    margin-left:28px;
    margin-right:auto;      /* encosta na logo e empurra o resto */
    padding-left:28px;
    border-left:1px solid var(--black4);
    align-self:stretch;
  }
  .nav-pag a{
    display:inline-flex;align-items:center;
    font-family:'Inter',sans-serif;
    font-size:12px;font-weight:700;
    letter-spacing:0.1em;text-transform:uppercase;
    color:var(--gray2);text-decoration:none;
    border-bottom:2px solid transparent;
    transition:color 0.15s,border-color 0.15s;
    white-space:nowrap;
  }
  .nav-pag a:hover{color:var(--white)}
  .nav-pag a[aria-current]{color:var(--yellow);border-bottom-color:var(--yellow)}

  /* a busca gruda logo abaixo do header, seja qual for a altura
     dele. O valor é medido no navegador (ajustarHeader). */
  .toolbar{top:var(--header-alt, 64px)}

  /* Cada camada fixa pinta uma faixa preta acima de si. Sem isso,
     qualquer diferença de um pixel entre a base do header e o topo
     da busca vira uma fresta por onde o texto passa rolando. */
  .header,.toolbar,.search-row{background:var(--black)}

  /* acima de 768px quem gruda é a .toolbar inteira */
  .toolbar::before{
    content:"";position:absolute;
    left:0;right:0;bottom:100%;height:26px;
    background:var(--black);
    pointer-events:none;
  }

  @media(max-width:768px){
    /* abaixo daqui a .toolbar vira display:contents e quem gruda
       é a .search-row — a faixa acompanha */
    .search-row{top:var(--header-alt, 110px)}
    .search-row::before{
      content:"";position:absolute;
      left:0;right:0;bottom:100%;height:26px;
      background:var(--black);
      pointer-events:none;
    }
  }
  @media(max-width:480px){
    .search-row{top:var(--header-alt, 102px)}
  }

  @media(max-width:900px){
    .header-inner{flex-wrap:wrap;height:auto;padding-top:10px}
    .logo{order:1}
    .header-right{order:2}
    .nav-pag{
      order:3;flex-basis:100%;gap:0;
      margin:10px 0 0;padding-left:0;
      border-left:none;
      border-top:1px solid var(--black4);
    }
    .nav-pag a{flex:1;justify-content:center;padding:12px 0 10px;font-size:11px}
  }

  /* Abaixo de 440px a logo e as ações começavam a não caber juntas
     e as ações caíam para uma linha só delas, empurrando tudo.
     Encolhendo os espaçamentos elas voltam para a mesma linha. */
  @media(max-width:440px){
    .header-inner{gap:10px;padding-left:14px;padding-right:14px}
    .header-right{gap:6px;flex-wrap:nowrap}
    .logo{gap:8px;min-width:0}
    .logo-sep{display:none}
    .logo-sub{font-size:8.5px;letter-spacing:0.08em}
    .btn-add{padding:8px 10px;font-size:11px;letter-spacing:0.01em}
    .btn-logout{padding:8px 9px;font-size:11px;letter-spacing:0.01em}
    .lyra-dl{padding:8px 9px}
  }

  /* Abaixo de 350px nem o rótulo cabe: fica só o "+", que já é
     o símbolo entendido de adicionar. O nome da marca continua. */
  @media(max-width:350px){
    .btn-lbl{display:none}
    .btn-add{padding:8px 13px;font-size:15px;line-height:1}
  }

  /* Seção vazia não aparece para quem só visualiza. Com login o
     bloco continua visível, senão não haveria onde clicar em
     "+ Adicionar". O :has olha se sobrou a mensagem de vazio. */
  body.read-only .culto-secao:has(.culto-empty){display:none}

  /* ── louvores do culto: aproveitar a largura ───────────────
     Com um culto por vez na tela, cada louvor ocupava uma linha
     inteira e sobrava metade da tela vazia. Acima de 820px eles
     passam a se distribuir em colunas.                         */
  @media(min-width:820px){
    .culto-col-bd,
    .culto-secao-bd{
      display:grid;
      grid-template-columns:repeat(auto-fill,minmax(280px,1fr));
      gap:8px;align-content:start;
    }
    .culto-empty{grid-column:1/-1}
  }`;
  document.head.appendChild(st);
})();

// ============================================================
//  NAVEGAÇÃO
// ============================================================

function navMontar() {
  const barra = document.querySelector(".header-inner");
  if (!barra || document.querySelector(".nav-pag")) return;

  const nav = document.createElement("nav");
  nav.className = "nav-pag";
  nav.setAttribute("aria-label", "Seções");
  nav.innerHTML = `
    <a href="./"${PAGINA === "cultos" ? ' aria-current="page"' : ""}>Cultos</a>
    <a href="repertorio.html"${PAGINA === "repertorio" ? ' aria-current="page"' : ""}>Repertório</a>`;

  // entra logo depois da logo: no desktop fica à esquerda,
  // no celular vira a terceira linha do header
  const logo = barra.querySelector(".logo");
  logo ? logo.insertAdjacentElement("afterend", nav) : barra.appendChild(nav);

  ajustarHeader();
}

// ── altura real do header ───────────────────────────────────
//  O header muda de altura: ganha uma linha no celular, cresce
//  com o notch. Em vez de repetir números pelo CSS, medimos uma
//  vez e guardamos em --header-alt, que a busca usa para grudar
//  no lugar certo logo abaixo.

function ajustarHeader() {
  const h = document.querySelector(".header");
  if (!h) return;
  document.documentElement.style.setProperty("--header-alt", h.offsetHeight + "px");

  // a lista recalcula onde os cabeçalhos de letra grudam
  if (typeof vistaAjustarTopo === "function") vistaAjustarTopo();
}

window.addEventListener("resize", ajustarHeader);
window.addEventListener("load", ajustarHeader);
if (window.visualViewport) window.visualViewport.addEventListener("resize", ajustarHeader);

// ============================================================
//  O QUE CADA PÁGINA FAZ
// ============================================================

if (PAGINA === "cultos") {
  //  O repertório inteiro continua sendo carregado — o app.js
  //  precisa dele para abrir a música com observações e cifras
  //  a partir de um louvor escalado — mas não faz sentido montar
  //  as 218 linhas numa seção escondida.
  render = function (lista) {
    if (typeof lyraListaVisivel !== "undefined") lyraListaVisivel = lista || [];
  };
}

if (PAGINA === "repertorio") {
  //  Nada de cultos nesta página: nem a busca no banco, nem o
  //  desenho. Uma requisição a menos no carregamento.
  //  (o app.js chama estas duas logo após carregar o repertório,
  //   e este arquivo roda antes disso acontecer)
  carregarCultos = async function () {};
  renderCultos   = function () {};
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", navMontar);
} else {
  navMontar();
}