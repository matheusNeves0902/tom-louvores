// ============================================================
//  TOM LOUVORES — dados sempre frescos
//  Carregue por ÚLTIMO, depois de todos os outros.
//
//  Os dados eram buscados uma vez só, quando a página abria. Uma
//  música cadastrada no banco só aparecia depois de sair do site
//  e voltar. Aqui a busca acontece de novo em três momentos:
//
//    · ao voltar para a aba (é quando quase sempre mudou algo)
//    · ao recuperar a conexão
//    · de tempos em tempos, com a aba aberta
//
//  Nada disso pisa no que a pessoa está fazendo: se houver modal
//  aberto ou edição em andamento, a atualização espera.
// ============================================================

const FRESCO_INTERVALO = 90000;     // 1min30 com a aba na frente
let frescoUltima = Date.now();
let frescoOcupado = false;

//  Está no meio de alguma coisa? Então não mexer.
function frescoPodeAtualizar() {
  if (frescoOcupado) return false;
  if (document.hidden) return false;

  //  Qualquer sobreposição aberta. Listar os nomes um a um dava
  //  errado — o modal de leitura chama-se viewOverlay, não
  //  viewModal — então a busca é pelo padrão que todos seguem.
  if (document.querySelector(".overlay-bg.open, .overlay.open, .modal.open, #lyraOverlay.open"))
    return false;

  // e os painéis do leitor, que também são trabalho em andamento
  if (document.querySelector("#acPainel.on, #afPainel.on, #mtPainel.on, #opRapido.on"))
    return false;

  // digitando em algum campo
  const f = document.activeElement;
  if (f && /^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName)) return false;

  return true;
}

//  O índice das cifras fica na memória a sessão inteira, e é ele
//  que carrega o updated_at de cada música. Enquanto ele não é
//  relido, uma cifra editada no banco parece igual: a versão do
//  disco bate com a do índice velho e a cópia antiga é servida.
//
//  Relendo o índice, a conferência de versão que já existe no
//  lyra.js faz o resto — e rebaixa só a música que mudou, não as
//  outras duzentas.
async function frescoIndiceCifras() {
  if (typeof lyraCarregarIndice !== "function") return;
  try {
    const antigo = typeof lyraIndice !== "undefined" && lyraIndice ? lyraIndice : null;

    lyraIndice = null;
    lyraIndiceEmCurso = null;
    const novo = await lyraCarregarIndice();
    if (!novo) { lyraIndice = antigo; return; }   // sem rede: fica o que havia

    // some da memória com as músicas cuja versão mudou, para a
    // próxima abertura buscar a cifra nova
    if (antigo && typeof lyraCacheMusica !== "undefined") {
      const versaoAntiga = new Map();
      antigo.forEach(m => versaoAntiga.set(m.slug, m.versao || ""));
      let trocadas = 0;
      novo.forEach(m => {
        const antes = versaoAntiga.get(m.slug);
        if (antes !== undefined && antes !== (m.versao || "")) {
          lyraCacheMusica.delete(m.slug);
          trocadas++;
        }
      });
      if (trocadas && typeof toast === "function")
        toast(trocadas === 1 ? "1 cifra foi atualizada" : `${trocadas} cifras foram atualizadas`);
    }
  } catch (e) { /* sem rede: segue com o índice que já estava */ }
}

//  Guarda onde a pessoa está para devolver depois: a lista inteira
//  é redesenhada, e sem isso a rolagem saltaria para o topo.
async function frescoAtualizar(motivo = "") {
  if (!frescoPodeAtualizar()) return false;
  frescoOcupado = true;

  const alvo = document.getElementById("lyraCorpo") || document.scrollingElement;
  const altura = alvo ? alvo.scrollTop : 0;
  const antes = Array.isArray(musicas) ? musicas.length : 0;

  try {
    await Promise.all([
      typeof carregar === "function" ? carregar() : null,
      typeof carregarCultos === "function" ? carregarCultos() : null,
      frescoIndiceCifras(),
    ]);
    frescoUltima = Date.now();

    if (alvo) alvo.scrollTop = altura;

    const depois = Array.isArray(musicas) ? musicas.length : 0;
    if (depois > antes && typeof toast === "function") {
      const n = depois - antes;
      toast(n === 1 ? "1 música nova no repertório" : `${n} músicas novas no repertório`);
    }
    return true;
  } catch (e) {
    return false;                    // sem rede: fica o que já estava
  } finally {
    frescoOcupado = false;
  }
}

// ── quando atualizar ────────────────────────────────────────

//  Voltar para a aba é o gatilho mais útil: é aí que a pessoa
//  cadastrou algo em outro lugar e voltou para conferir.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && Date.now() - frescoUltima > 8000) frescoAtualizar("voltou à aba");
});

//  A conexão voltou: o que estava na tela pode ser de antes.
window.addEventListener("online", () => frescoAtualizar("voltou a rede"));

//  E de tempos em tempos, para quem deixa o site aberto no culto.
setInterval(() => {
  if (Date.now() - frescoUltima >= FRESCO_INTERVALO) frescoAtualizar("relógio");
}, 20000);

//  Depois de salvar qualquer coisa, os outros aparelhos demoram
//  até o próximo ciclo — mas quem salvou vê na hora.
if (typeof salvarCulto === "function") {
  const frescoSalvarOriginal = salvarCulto;
  salvarCulto = async function (...a) {
    const r = await frescoSalvarOriginal.apply(this, a);
    frescoUltima = Date.now();
    return r;
  };
}