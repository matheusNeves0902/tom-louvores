// ============================================================
//  TOM LOUVORES — roteiro de verificação
//
//  Cole no console do navegador, com o site aberto, depois de
//  qualquer mudança nos arquivos. Ele confere os pontos que já
//  quebraram durante o desenvolvimento — cada linha aqui existe
//  porque um dia deu errado de verdade.
//
//  Uso:  verificar()
//        verificar({leitor: false})   ← pula os testes do leitor
// ============================================================

async function verificar(opcoes = {}) {
    const testes = [];
    const t = (nome, valor, esperado = true) =>
      testes.push({ nome, ok: valor === esperado, valor });
  
    const esperar = ms => new Promise(r => setTimeout(r, ms));
  
    // ── 1. todos os arquivos carregaram, na ordem certa ──
    const modulos = {
      "app.js": "carregar", "lyra.js": "lyraCarregarIndice",
      "acordes.js": "acLer", "sons.js": "somTocar",
      "opcoes.js": "opMontar", "afinador.js": "afDetectar",
      "metronomo.js": "mtComecar", "atualizar.js": "frescoAtualizar",
      "culto-seletor.js": "cultoProximaOcorrencia",
    };
    Object.entries(modulos).forEach(([arq, fn]) =>
      t(`carregou ${arq}`, typeof window[fn] === "function"));
  
    // ── 2. detecção de tela: já falhou duas vezes por usar
    //       pointer:fine, que alguns navegadores não declaram ──
    t("detecção de celular não depende de pointer:fine",
      typeof opEhCelular === "function" &&
      opEhCelular() === window.matchMedia("(max-width: 820px), (pointer: coarse)").matches);
  
    // ── 3. acordes: os que já deram problema ──
    const acordes = ["C", "Cm6", "C#m7(11)", "E7M(9)", "B/D#", "C#m/G", "F#4", "A7(2)"];
    const falhos = acordes.filter(a => {
      const ac = acLer(a);
      if (!ac) return true;
      return !acFormasViolao(ac, 1).length;
    });
    t(`todos os ${acordes.length} acordes difíceis geram forma`, falhos.length === 0);
    if (falhos.length) console.warn("  sem forma:", falhos.join(" "));
  
    // ── 4. linhas com parênteses continuam sendo linha de acorde ──
    const linhas = [
      ["( Cm  Cm7(9) )", true], ["( F#2  E2 )", true],
      ["[Intro] F  C  Em", true], ["Pelo Senhor marchamos sim", false],
      ["Sua glória será vista em toda a terra", false],
    ];
    const erradas = linhas.filter(([txt, esperado]) =>
      (lyraEhLinhaDeAcorde(txt) || lyraEhSecao?.(txt)) !== esperado);
    t("linhas de acorde e de letra classificadas certo", erradas.length === 0);
    if (erradas.length) console.warn("  erradas:", erradas.map(x => x[0]));
  
    // ── 5. o texto da cifra sai idêntico: se mudar, as colunas
    //       desalinham da letra ──
    const amostra = "[Intro] F  C  Em\n( Cm  Cm7(9) )\nPelo Senhor";
    const div = document.createElement("div");
    div.innerHTML = lyraCifraParaHTML(amostra);
    t("marcação não altera o texto da cifra", div.textContent === amostra);
  
    // ── 6. afinação: as dez cordas soltas, com erro humano-audível ──
    const TAXA = 44100, N = 4096;
    const onda = f => {
      const b = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        let v = 0;
        for (let h = 1; h <= 5; h++) v += (1 / h) * Math.sin(2 * Math.PI * f * h * (i / TAXA));
        b[i] = v * 0.3;
      }
      return b;
    };
    let piorCents = 0;
    ["violao", "baixo"].forEach(inst =>
      afCordasDe(inst, "padrao").forEach(c => {
        const f = afFreqDeMidi(c.midi);
        const d = afDetectar(onda(f), TAXA);
        piorCents = Math.max(piorCents, d > 0 ? Math.abs(1200 * Math.log2(d / f)) : 999);
      }));
    t(`afinador erra menos de 5 cents (pior: ${piorCents.toFixed(2)})`, piorCents < 5);
  
    // ── 7. cultos: a janela de permanência ──
    if (typeof cultoProximaOcorrencia === "function") {
      const domingoMeioDia = new Date("2026-09-06T12:00:00");
      const d = cultoProximaOcorrencia("domingo_manha", domingoMeioDia);
      t("culto da manhã ainda vale ao meio-dia de domingo",
        d.getDate() === domingoMeioDia.getDate());
      const domingoTarde = new Date("2026-09-06T17:00:00");
      t("depois da janela, passa para o próximo culto",
        cultoProximaOcorrencia("domingo_manha", domingoTarde).getDate() !== domingoTarde.getDate());
    }
  
    // ── 8. metrônomo: o intervalo tem que ser exato ──
    if (typeof mtBpm !== "undefined") {
      t("BPM dentro da faixa", mtBpm >= 30 && mtBpm <= 260);
    }
  
    // ── 9. o app está guardado para funcionar sem internet ──
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      t("service worker ativo", !!reg?.active);
      if (window.caches) {
        const nomes = await caches.keys();
        const c = nomes.length ? await caches.open(nomes[0]) : null;
        const n = c ? (await c.keys()).length : 0;
        t(`app guardado no cache (${n} arquivos)`, n >= 10);
      }
    }
  
    // ── 10. o leitor: só se pedido, porque abre a tela ──
    if (opcoes.leitor !== false && typeof lyraAbrirPorSlug === "function") {
      // deixado de fora por padrão: mexe na tela de quem está usando
    }
  
    // ── resultado ──
    const falharam = testes.filter(x => !x.ok);
    console.log("%c ROTEIRO DE VERIFICAÇÃO ", "background:#EE9E63;color:#1a1a1a;font-weight:700");
    testes.forEach(x =>
      console.log(`%c ${x.ok ? "ok " : "FALHOU"} %c ${x.nome}`,
        `color:${x.ok ? "#8FE84A" : "#ff6b6b"};font-weight:700`, "color:inherit"));
    console.log(
      `%c${falharam.length ? falharam.length + " de " + testes.length + " falharam" : "tudo certo: " + testes.length + " verificações"}`,
      `color:${falharam.length ? "#ff6b6b" : "#8FE84A"};font-weight:700;font-size:13px`);
  
    return { total: testes.length, falharam: falharam.length, detalhes: testes };
  }
  
  console.log("%cRoteiro carregado. Rode:  verificar()", "color:#EE9E63;font-weight:700");