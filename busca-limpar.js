// ============================================================
//  TOM LOUVORES — limpar a busca
//  Botão "×" dentro do campo, visível só quando há texto.
//  Carregue DEPOIS do app.js. Não altera nada do app.js.
// ============================================================

(function () {
    const inp = document.getElementById("busca");
    if (!inp || document.getElementById("buscaLimpar")) return;
  
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "search-clear";
    btn.id = "buscaLimpar";
    btn.setAttribute("aria-label", "Limpar busca");
    btn.innerHTML = "&#10005;";
  
    inp.parentElement.appendChild(btn);
  
    const atualizar = () => btn.classList.toggle("on", inp.value.length > 0);
  
    inp.addEventListener("input", atualizar);
  
    btn.addEventListener("click", () => {
      inp.value = "";
      atualizar();
      filtrar();
      inp.focus();
    });
  
    atualizar();   // caso o campo já venha preenchido
  })();