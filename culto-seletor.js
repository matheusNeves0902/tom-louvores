// ============================================================
//  TOM LOUVORES — cultos
//  1. Seletor de culto no topo, já no próximo que vai acontecer.
//  2. Tons mostram o ministrante ao adicionar louvor.
//  3. Bloco "Tom neste culto" dentro do modal do louvor,
//     com troca de tom e cadastro de tom novo.
//  Carregue DEPOIS do app.js. Não altera nada do app.js.
// ============================================================

// dia da semana (0 = domingo) e horário de cada culto
const CULTO_HORARIOS = {
    quarta:        { dia: 3, h: 19, min: 30 },
    domingo_manha: { dia: 0, h: 10, min: 0  },
    domingo_noite: { dia: 0, h: 19, min: 0  },
  };
  
  const CULTO_TOM_NOVO = "__novo__";
  
  const CULTO_TONS = [
    "Orig.",
    "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
    "Cm", "C#m", "Dm", "D#m", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "A#m", "Bm",
  ];
  
  let cultoSelecionado = null;   // tipo do culto, ou "todos"
  let cultoCtxView     = null;   // culto de onde o modal de leitura foi aberto
  
  // ============================================================
  //  SELETOR DE CULTO
  // ============================================================
  
  // próxima ocorrência deste culto, contando o horário
  function cultoProximaOcorrencia(tipo, agora = new Date()) {
    const h = CULTO_HORARIOS[tipo];
    if (!h) return null;
  
    const d = new Date(agora);
    d.setDate(d.getDate() + ((h.dia - d.getDay() + 7) % 7));
    d.setHours(h.h, h.min, 0, 0);
  
    // já passou hoje → semana que vem
    if (d < agora) d.setDate(d.getDate() + 7);
    return d;
  }
  
  // qual culto acontece primeiro a partir de agora
  function cultoMaisProximo() {
    let melhor = null, quando = Infinity;
    CULTO_DEFS.forEach(def => {
      const d = cultoProximaOcorrencia(def.tipo);
      if (d && d.getTime() < quando) { quando = d.getTime(); melhor = def.tipo; }
    });
    return melhor || CULTO_DEFS[0].tipo;
  }
  
  function cultoDataCurta(tipo) {
    const d = cultoProximaOcorrencia(tipo);
    return d ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "";
  }
  
  function cultoMontarSeletor() {
    if (document.getElementById("cultoSeletor")) return;
  
    const grid = document.getElementById("cultosGrid");
    if (!grid) return;
  
    const barra = document.createElement("div");
    barra.className = "culto-seletor";
    barra.id = "cultoSeletor";
    barra.innerHTML = `
      <span class="culto-seletor-data" id="cultoSeletorData"></span>
      <select class="sel culto-seletor-sel" id="cultoSeletorSel"></select>`;
  
    grid.parentNode.insertBefore(barra, grid);
  
    document.getElementById("cultoSeletorSel").addEventListener("change", e => {
      cultoSelecionado = e.target.value;
      cultoAplicarSelecao();
    });
  }
  
  function cultoPreencherSeletor() {
    const sel = document.getElementById("cultoSeletorSel");
    if (!sel) return;
  
    sel.innerHTML = CULTO_DEFS.map(def =>
      `<option value="${def.tipo}">${cultoDataCurta(def.tipo)} · ${def.dia}</option>`
    ).join("") + `<option value="todos">Ver todos</option>`;
  
    if (!cultoSelecionado) cultoSelecionado = cultoMaisProximo();
    sel.value = cultoSelecionado;
  }
  
  function cultoAplicarSelecao() {
    const grid = document.getElementById("cultosGrid");
    if (!grid) return;
  
    const sel   = document.getElementById("cultoSeletorSel");
    const badge = document.getElementById("cultoSeletorData");
    const todos = cultoSelecionado === "todos";
  
    if (sel)   sel.value = cultoSelecionado;
    if (badge) badge.textContent = todos ? "—" : cultoDataCurta(cultoSelecionado);
  
    grid.classList.toggle("solo", !todos);
  
    // as colunas seguem a ordem de CULTO_DEFS
    grid.querySelectorAll(".culto-col").forEach((col, i) => {
      const def = CULTO_DEFS[i];
      col.style.display = (todos || (def && def.tipo === cultoSelecionado)) ? "" : "none";
    });
  }
  
  // ============================================================
  //  TONS: ministrante por tom e cadastro de tom novo
  // ============================================================
  
  // ministrantes de um tom específico. null = vale para todos.
  function cultoMinsDoTom(m, tom) {
    const pares = deserializarPares(m.tom);
    const nomes = [];
    let todos = false;
  
    pares.filter(p => p.tom === tom).forEach(p => {
      const reais = minsReaisDoPar(p, pares);
      if (reais === null) todos = true;
      else reais.forEach(n => nomes.push(n));
    });
  
    return todos ? null : [...new Set(nomes)];
  }
  
  // <option> de cada tom da música, com quem canta
  function cultoOpcoesTom(m, selecionado = "", comNovo = true) {
    const tons = m ? [...new Set(deserializarPares(m.tom).map(p => p.tom).filter(Boolean))] : [];
  
    // tom que já está na escala mas saiu do repertório continua na lista
    if (selecionado && !tons.includes(selecionado)) tons.unshift(selecionado);
  
    const opts = tons.map(t => {
      const mins = m ? cultoMinsDoTom(m, t) : null;
      const quem = mins === null ? (m ? "Todos" : "") : mins.join(", ");
      const sel  = t === selecionado ? " selected" : "";
      return `<option value="${t}"${sel}>${t}${quem ? " · " + quem : ""}</option>`;
    }).join("");
  
    return opts + (comNovo ? `<option value="${CULTO_TOM_NOVO}">+ Outro tom...</option>` : "");
  }
  
  function cultoOpcoesDeTom(selecionado = "") {
    return CULTO_TONS.map(t =>
      `<option value="${t}"${t === selecionado ? " selected" : ""}>${t}</option>`).join("");
  }
  
  function cultoOpcoesDeMinistrante() {
    return `<option value="">Ministrante</option>` +
      MINISTRANTES.map(n => `<option value="${n}">${n}</option>`).join("");
  }
  
  // grava um par tom+ministrante na música do repertório
  async function cultoAdicionarTomNaMusica(musicaId, tom, min) {
    if (!tom || !min) { toast("Selecione o tom e o ministrante.", true); return false; }
  
    const m = musicas.find(x => x.id == musicaId);
    if (!m) { toast("Música não encontrada no repertório.", true); return false; }
  
    // junta com o que já existe, sem duplicar
    const lista = paresParaEdicao(m.tom);
    const jaTem = lista.find(p => p.tom === tom);
    if (jaTem) {
      if (jaTem.mins.includes(min)) { toast(`${min} já canta em ${tom}.`, true); return false; }
      jaTem.mins.push(min);
    } else {
      lista.push({ tom, mins: [min] });
    }
  
    const tomStr = serializarPares(normalizarParesParaSalvar(lista));
    const minStr = [...new Set(lista.flatMap(p => p.mins))].join(", ");
  
    try {
      await req(`${TABLE}?id=eq.${m.id}`, {
        method: "PATCH",
        body: JSON.stringify({ tom: tomStr, ministrante: minStr }),
      });
    } catch (e) {
      console.error(e);
      toast("Erro ao salvar o novo tom.", true);
      return false;
    }
  
    await carregar();   // repertório e cards atualizados
    return true;
  }
  
  // ============================================================
  //  MODAL: adicionar louvor ao culto
  // ============================================================
  
  function cultoMontarLinhaNovoTom() {
    if (document.getElementById("cultoNovoTom")) return;
  
    const wrap = document.getElementById("cultoTomWrap");
    if (!wrap) return;
  
    const bloco = document.createElement("div");
    bloco.id = "cultoNovoTom";
    bloco.style.marginTop = "14px";
    bloco.innerHTML = `
      <label class="flabel">Cadastrar outro tom</label>
      <div class="tom-add-row">
        <select id="cultoNovoTomSel" class="finput">${cultoOpcoesDeTom()}</select>
        <select id="cultoNovoMinSel" class="finput">${cultoOpcoesDeMinistrante()}</select>
        <button type="button" class="btn-add-tom" id="cultoBtnNovoTom" title="Adicionar tom">+</button>
      </div>
      <p class="culto-hint">Entra no repertório da música e já fica escolhido aqui.</p>`;
    wrap.appendChild(bloco);
  
    document.getElementById("cultoBtnNovoTom").addEventListener("click", async () => {
      if (!isAdmin())      { toast("Faça login para editar.", true); return; }
      if (!cultoMusicaSel) { toast("Escolha uma música.", true); return; }
  
      const tom = document.getElementById("cultoNovoTomSel").value;
      const min = document.getElementById("cultoNovoMinSel").value;
  
      const ok = await cultoAdicionarTomNaMusica(cultoMusicaSel.id, tom, min);
      if (!ok) return;
  
      const sel = document.getElementById("cTomEscolhido");
      sel.innerHTML = `<option value="">Tom</option>` +
        cultoOpcoesTom(musicas.find(x => x.id == cultoMusicaSel.id), tom, false);
      sel.value = tom;
  
      document.getElementById("cultoNovoMinSel").value = "";
      toast(`${tom} adicionado ✓`);
    });
  }
  
  // reescreve as opções de tom com o ministrante de cada uma
  function cultoEnriquecerTons(id) {
    const m   = musicas.find(x => x.id == id);
    const sel = document.getElementById("cTomEscolhido");
    if (!m || !sel) return;
  
    cultoMontarLinhaNovoTom();
  
    const escolhido = sel.value;   // o app.js já escolheu o tom do escalado
    sel.innerHTML = `<option value="">Tom</option>` + cultoOpcoesTom(m, escolhido, false);
    sel.value = escolhido;
  }
  
  // ============================================================
  //  MODAL DE LEITURA: bloco "Tom neste culto"
  // ============================================================
  
  function cultoRemoverBlocoTom() {
    const antigo = document.getElementById("viewTomCulto");
    if (antigo) antigo.remove();
  }
  
  function cultoInjetarBlocoTom(ctx) {
    cultoRemoverBlocoTom();
    if (!ctx) return;
    if (typeof isAdmin === "function" && !isAdmin()) return;
  
    const l = (cultos[ctx.tipo] && cultos[ctx.tipo].louvores || [])[ctx.idx];
    if (!l) return;
  
    const m = l.musica_id ? musicas.find(x => x.id == l.musica_id) : null;
    const tomAtual = l.tom || "";
  
    const ancora = document.getElementById("viewTons");
    const secao  = ancora && ancora.closest(".view-section");
    if (!secao) return;
  
    const bloco = document.createElement("div");
    bloco.className = "view-section";
    bloco.id = "viewTomCulto";
    bloco.innerHTML = `
      <label class="flabel">Tom neste culto</label>
      <select id="viewTomSel" class="finput">
        ${m ? cultoOpcoesTom(m, tomAtual, false) : cultoOpcoesDeTom(tomAtual)}
      </select>
  
      <label class="flabel" style="margin-top:16px">Cadastrar outro tom</label>
      <div class="tom-add-row">
        <select class="finput" id="viewTomNovoSel">${cultoOpcoesDeTom()}</select>
        <select class="finput" id="viewMinNovoSel">${cultoOpcoesDeMinistrante()}</select>
        <button type="button" class="btn-add-tom" id="viewTomBtn" title="Adicionar tom">+</button>
      </div>`;
  
    secao.after(bloco);
  
    const sel = document.getElementById("viewTomSel");
  
    sel.addEventListener("change", e => cultoAplicarTom(ctx, e.target.value, l));
  
    document.getElementById("viewTomBtn").addEventListener("click", async () => {
      const tom = document.getElementById("viewTomNovoSel").value;
      const min = document.getElementById("viewMinNovoSel").value;
  
      const ok = m ? await cultoAdicionarTomNaMusica(m.id, tom, min) : !!tom;
      if (!ok) return;
  
      if (m) {
        sel.innerHTML = cultoOpcoesTom(musicas.find(x => x.id == m.id), tom, false);
        sel.value = tom;
      }
      document.getElementById("viewMinNovoSel").value = "";
      await cultoAplicarTom(ctx, tom, l);
    });
  }
  
  // grava o tom escolhido no louvor do culto e atualiza a tela
  async function cultoAplicarTom(ctx, tom, louvor) {
    if (!tom) return;
  
    cultos[ctx.tipo].louvores[ctx.idx].tom = tom;
    const ok = await salvarCulto(ctx.tipo);
    if (!ok) return;
  
    louvor.tom = tom;
    toast(`Tom alterado para ${tom} ✓`);
  
    // o bloco de tons do próprio modal reflete a mudança na hora
    const tons = document.getElementById("viewTons");
    if (tons) {
      tons.innerHTML = tonsParaHTML(
        { tom: serializarPares([{ tom, min: louvor.min || "" }]) }, false);
    }
  
    renderCultos();
  }
  
  // ============================================================
  //  ENXERTOS
  // ============================================================
  
  const cultoRenderOriginal = renderCultos;
  renderCultos = function () {
    cultoRenderOriginal();
    cultoMontarSeletor();
    cultoPreencherSeletor();
    cultoAplicarSelecao();
  };
  
  const cultoSelecionarOriginal = selecionarMusicaCulto;
  selecionarMusicaCulto = function (id) {
    cultoSelecionarOriginal(id);
    cultoEnriquecerTons(id);
  };
  
  const cultoAbrirModalOriginal = abrirCultoModal;
  abrirCultoModal = function (tipo, secao) {
    cultoAbrirModalOriginal(tipo, secao);
    const min = document.getElementById("cultoNovoMinSel");
    if (min) min.value = "";
  };
  
  // marca de qual culto o modal de leitura foi aberto
  const cultoAbrirViewCultoOriginal = abrirViewCulto;
  abrirViewCulto = function (tipo, idx) {
    cultoCtxView = { tipo, idx };
    try { cultoAbrirViewCultoOriginal(tipo, idx); }
    finally { cultoCtxView = null; }
  };
  
  const cultoAbrirViewOriginal = abrirView;
  abrirView = function (m, expandirTom = true) {
    const ctx = cultoCtxView;              // capturado antes de qualquer await
    cultoAbrirViewOriginal(m, expandirTom);
    cultoInjetarBlocoTom(ctx);
  };
  
  const cultoFecharViewOriginal = fecharView;
  fecharView = function () {
    cultoRemoverBlocoTom();
    cultoFecharViewOriginal();
  };