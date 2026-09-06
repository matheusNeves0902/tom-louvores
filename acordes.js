// ============================================================
//  TOM LOUVORES — acordes clicáveis e rolagem automática
//  Carregue DEPOIS do lyra.js.
//
//  Toque num acorde da cifra e abre um painel com:
//    · a forma no violão, com ou sem capotraste
//    · as notas no teclado
//  A barra do leitor ganha o controle de rolagem automática.
// ============================================================

// ── Teoria ──────────────────────────────────────────────────

const AC_NOTAS  = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const AC_BEMOL  = { "Db":"C#", "Eb":"D#", "Gb":"F#", "Ab":"G#", "Bb":"A#",
                    "Cb":"B", "Fb":"E" };

function acPitch(nome) {
  const n = AC_BEMOL[nome] || nome;
  const i = AC_NOTAS.indexOf(n);
  return i < 0 ? null : i;
}

//  Interpreta o nome do acorde.
//  Devolve { raiz, pcs:[graus em semitons], baixo, rotulo }
//  Os graus saem em semitons a partir da tônica: 0=tônica, 4=terça
//  maior, 7=quinta, e assim por diante.
function acLer(nome) {
  const m = String(nome).trim().match(/^([A-G][#b]?)(.*)$/);
  if (!m) return null;

  const raiz = acPitch(m[1]);
  if (raiz === null) return null;

  let resto = m[2];
  let baixo = null;

  const barra = resto.match(/\/([A-G][#b]?)$/);
  if (barra) { baixo = acPitch(barra[1]); resto = resto.slice(0, barra.index); }

  const t = resto.replace(/\s+/g, "");
  const tem = re => re.test(t);

  const menor  = /^(m|min)(?!aj)/.test(t);
  const dim    = tem(/^(dim|°|o)/);
  const aum    = tem(/^(aug|\+)/);
  const sus2   = tem(/(sus2|^2)/);
  const sus4   = tem(/(sus4|^4)/);
  const setima = tem(/(^|[^0-9])7(?!M)/) || tem(/\(7\)/);
  const maj7   = tem(/(7M|maj7|M7)/);
  const sexta  = tem(/(^|[^0-9])6/);
  const nona   = tem(/9/);
  const onze   = tem(/11/);
  const treze  = tem(/13/);

  const g = new Set([0]);

  if (dim)            g.add(3), g.add(6);
  else if (aum)       g.add(4), g.add(8);
  else if (sus2 && !menor) g.add(2), g.add(7);
  else if (sus4 && !menor) g.add(5), g.add(7);
  else                g.add(menor ? 3 : 4), g.add(7);

  if (maj7)   g.add(11);
  if (setima) g.add(10);
  if (sexta && !setima && !maj7) g.add(9);
  if (nona)   g.add(2);
  if (onze)   g.add(5);
  if (treze)  g.add(9);

  const pcs = [...g].sort((a, b) => a - b);
  return {
    raiz, pcs, baixo,
    // notas reais, já em altura absoluta de classe
    notas: pcs.map(x => (raiz + x) % 12),
    rotulo: String(nome).trim(),
    menor, dim, aum, sus: (sus2 || sus4) && !menor,
    // a nota que dá identidade ao acorde e não pode faltar na forma
    caracteristica: dim ? 3 : (sus4 && !menor) ? 5 : (sus2 && !menor) ? 2 : (menor ? 3 : 4),
  };
}

function acNomeNota(pc) { return AC_NOTAS[((pc % 12) + 12) % 12]; }

// ── Violão ──────────────────────────────────────────────────
//  Afinação padrão, em semitons absolutos (E2 = 40)

const AC_CORDAS = [40, 45, 50, 55, 59, 64];   // da 6ª para a 1ª
const AC_MUDA   = -1;                          // corda abafada

//  Procura formas tocáveis. Em vez de guardar uma tabela de
//  acordes — que nunca cobre C#m7(11) e afins — a forma é
//  calculada: para cada janela de 5 casas, cada corda recebe as
//  casas que produzem nota do acorde, e as combinações viáveis
//  são pontuadas.
function acFormasViolao(ac, limite = 3) {
  if (!ac) return [];
  const pcs   = new Set(ac.notas);
  const baixo = ac.baixo !== null ? ac.baixo : ac.raiz;
  const terca = (ac.raiz + (ac.caracteristica ?? (ac.menor ? 3 : 4))) % 12;
  const achadas = [];

  for (let base = 0; base <= 9; base++) {
    const opcoes = AC_CORDAS.map(corda => {
      const o = [AC_MUDA];
      for (let f = base === 0 ? 0 : base; f <= base + 4; f++) {
        const n = (corda + f) % 12;
        if (pcs.has(n) || n === baixo) o.push(f);       // o baixo pode ser nota de fora
      }
      if (base > 0 && (pcs.has(corda % 12) || corda % 12 === baixo)) o.push(0);
      return o;
    });

    const combo = [];
    (function anda(i) {
      if (achadas.length > 400) return;
      if (i === 6) { avaliar([...combo]); return; }
      for (const f of opcoes[i]) { combo.push(f); anda(i + 1); combo.pop(); }
    })(0);

    function avaliar(forma) {
      const tocadas = forma.filter(f => f !== AC_MUDA);
      if (tocadas.length < 4) return;

      // abafadas só nas cordas graves, nunca no meio
      const primeira = forma.findIndex(f => f !== AC_MUDA);
      if (forma.slice(primeira).some(f => f === AC_MUDA)) return;

      const presas = tocadas.filter(f => f > 0);
      if (presas.length) {
        const span = Math.max(...presas) - Math.min(...presas);
        if (span > 4) return;
      }

      const notas = forma.map((f, i) => f === AC_MUDA ? null : (AC_CORDAS[i] + f) % 12);
      const soam  = new Set(notas.filter(n => n !== null));

      // a mais grave tem que ser o baixo pedido
      if (notas[primeira] !== baixo) return;
      // e nenhuma outra corda pode tocar nota de fora do acorde
      for (let i = primeira + 1; i < 6; i++) {
        if (notas[i] !== null && !pcs.has(notas[i])) return;
      }
      // tônica e terça (ou 2ª/4ª do sus) são obrigatórias
      if (!soam.has(ac.raiz) || !soam.has(terca)) return;
      // sétima e nona, quando o nome pede, também
      for (const grau of ac.pcs) {
        if (grau >= 9 || grau === 2 || grau === 5) {
          if (!soam.has((ac.raiz + grau) % 12)) return;
        }
      }

      achadas.push({ forma, pos: presas.length ? Math.min(...presas) : 0 });
    }
  }

  // pontuação: casa baixa, cordas soltas, poucas abafadas, poucos dedos
  const vistas = new Set();
  return achadas
    .map(x => {
      const f = x.forma;
      const presas = f.filter(v => v > 0);
      const min = presas.length ? Math.min(...presas) : 0;
      const dedos = new Set(presas).size;
      const span = presas.length ? Math.max(...presas) - min : 0;
      const nota =
        x.pos * 2.0 +                                   // quanto mais perto da pestana, melhor
        f.filter(v => v === AC_MUDA).length * 1.0 +     // abafar corda é normal no violão
        dedos * 1.7 +                                   // menos dedos, mais fácil
        span * 1.6 -                                    // esticar a mão é o que mais atrapalha
        f.filter(v => v === 0).length * 1.2;            // corda solta ajuda
      return { ...x, nota, casa: min, dedos, span };
    })
    .sort((a, b) => a.nota - b.nota)
    .filter(x => {
      const k = x.forma.join(",");
      if (vistas.has(k)) return false;
      vistas.add(k); return true;
    })
    .slice(0, limite);
}

//  Transpõe o nome do acorde para baixo, para achar a forma que
//  se toca com capotraste na casa N.
function acComCapo(nome, capo) {
  const ac = acLer(nome);
  if (!ac || !capo) return nome;
  const nova = acNomeNota((ac.raiz - capo + 120) % 12);
  const resto = nome.slice(nome.match(/^[A-G][#b]?/)[0].length);
  const baixo = resto.match(/\/([A-G][#b]?)$/);
  let saida = nova + resto;
  if (baixo) {
    const nb = acNomeNota((acPitch(baixo[1]) - capo + 120) % 12);
    saida = nova + resto.slice(0, baixo.index) + "/" + nb;
  }
  return saida;
}

// ── Desenhos ────────────────────────────────────────────────

//  Em que casa o desenho começa. Com corda solta e nada além da
//  4ª casa, começa na 1 e mostra o cavalete — é assim que se lê um
//  acorde aberto. Fora disso, começa na casa da posição.
function acJanela(forma, casa) {
  const temSolta = forma.includes(0);
  const maiorCasa = Math.max(0, ...forma.filter(f => f > 0));
  return (temSolta && maiorCasa <= 4) ? 1 : Math.max(1, casa);
}

//  Qual dedo em cada corda presa. Pestana leva o indicador; o
//  resto sai por ordem de casa e depois de corda, que é como a
//  mão naturalmente se acomoda.
function acDedilhado(forma) {
  const presas = forma.map((f, i) => ({ f, i })).filter(x => x.f > 0);
  if (!presas.length) return {};
  const min = Math.min(...presas.map(x => x.f));
  const naMin = presas.filter(x => x.f === min);
  const acima = presas.filter(x => x.f > min);
  const dedos = {};

  const pestana = naMin.length >= 3 && acima.length > 0;
  if (pestana) naMin.forEach(x => dedos[x.i] = 1);

  let n = pestana ? 2 : 1;
  const resto = (pestana ? acima : presas)
    .sort((a, b) => a.f - b.f || b.i - a.i);
  resto.forEach(x => { dedos[x.i] = Math.min(n++, 4); });
  return dedos;
}

function acSvgViolao(res, titulo) {
  if (!res) return `<p class="ac-vazio">Sem forma simples para este acorde.</p>`;
  const { forma, casa } = res;
  const primeira = acJanela(forma, casa);
  const casas = 5, larg = 132, alt = 158;
  const px = 22, py = 26, dx = 88 / 5, dy = 100 / casas;

  const dedos = acDedilhado(forma);
  let s = `<svg viewBox="0 0 ${larg} ${alt}" class="ac-svg" role="img" aria-label="${titulo}">`;
  for (let i = 0; i < 6; i++)
    s += `<line x1="${px + i * dx}" y1="${py}" x2="${px + i * dx}" y2="${py + 100}" class="ac-corda"/>`;
  for (let i = 0; i <= casas; i++)
    s += `<line x1="${px}" y1="${py + i * dy}" x2="${px + 88}" y2="${py + i * dy}" class="ac-traste"/>`;
  if (primeira === 1)
    s += `<rect x="${px - 1.5}" y="${py - 4}" width="91" height="4" class="ac-pestana-nut"/>`;
  else
    s += `<text x="${px - 7}" y="${py + dy * 0.75}" class="ac-casa">${primeira}ª</text>`;

  const dedosNaCasaAntes = forma.filter(f => f === primeira).length;
  if (dedosNaCasaAntes >= 3 && forma.some(f => f > primeira)) {
    const idx = forma.map((f, i) => f === primeira ? i : -1).filter(i => i >= 0);
    const x1 = px + Math.min(...idx) * dx, x2 = px + Math.max(...idx) * dx;
    s += `<rect x="${x1 - 6.6}" y="${py + 0.5 * dy - 6.6}" width="${x2 - x1 + 13.2}"
           height="13.2" rx="6.6" class="ac-pestana"/>`;
  }

  forma.forEach((f, i) => {
    const x = px + i * dx;
    if (f === AC_MUDA) { s += `<text x="${x}" y="${py - 7}" class="ac-x">✕</text>`; return; }
    if (f === 0)       { s += `<circle cx="${x}" cy="${py - 10}" r="3.4" class="ac-solta"/>`; return; }
    const linha = f - primeira + 1;
    const cy = py + linha * dy - dy / 2;
    s += `<circle cx="${x}" cy="${cy}" r="6.6" class="ac-dedo"/>`;
    if (dedos[i]) s += `<text x="${x}" y="${cy + 2.6}" class="ac-num">${dedos[i]}</text>`;
  });

  return s + `</svg>`;
}

function acSvgTeclado(ac, compacto = false) {
  if (!ac) return "";

  //  A régua é sempre a mesma, começando no C — é o desenho que a
  //  pessoa reconhece de imediato. O que muda são as bolinhas: elas
  //  sobem a partir da nota do acorde, uma vez cada. Um Em7 marca
  //  E G B D; um C/E abre no E do baixo.
  const BRANCAS = [0, 2, 4, 5, 7, 9, 11];
  const ehBranca = pc => BRANCAS.includes(((pc % 12) + 12) % 12);

  const inicio = ac.baixo !== null ? ac.baixo : ac.raiz;
  const base = 0;                 // dó
  const desloca = inicio;         // a que altura o acorde começa

  const SEMIS = 24;                                   // duas oitavas
  const bw = compacto ? 15 : 21, bh = compacto ? 60 : 82;
  const pw = bw * 0.60, ph = bh * 0.62;

  // posição de cada semitom na régua
  const pos = [];
  let w = 0;
  for (let s = 0; s <= SEMIS; s++) {
    const pc = (base + s) % 12;
    if (ehBranca(pc)) { pos[s] = { branca: true, x: w * bw, i: w }; w++; }
    else              { pos[s] = { branca: false, x: (w - 1) * bw + bw - pw / 2 }; }
  }
  const larg = w * bw, alt = bh + 4;

  let sv = `<svg viewBox="0 0 ${larg} ${alt}" class="ac-svg ac-teclado" role="img"
             aria-label="notas de ${ac.rotulo} no teclado">`;
  for (let s = 0; s <= SEMIS; s++)
    if (pos[s].branca)
      sv += `<rect x="${pos[s].x}" y="2" width="${bw - 1}" height="${bh}" rx="2" class="ac-tecla"/>`;
  for (let s = 0; s <= SEMIS; s++)
    if (!pos[s].branca)
      sv += `<rect x="${pos[s].x}" y="2" width="${pw}" height="${ph}" rx="1.4" class="ac-preta"/>`;

  //  cada nota do acorde uma vez, subindo a partir da inicial
  const graus = new Set();
  if (ac.baixo !== null) graus.add(0);                       // o baixo abre
  ac.pcs.forEach(g => {
    const rel = ((ac.raiz + g) - inicio + 24) % 12;
    graus.add(rel === 0 && ac.baixo !== null ? 12 : rel);     // não pisa no baixo
  });

  const r = compacto ? 3.4 : 4.4;
  [...graus].sort((a, b) => a - b).forEach(rel => {
    const s = desloca + rel;
    if (!pos[s]) return;
    const ehRaiz = ((base + s) % 12) === ac.raiz;
    const ehBaixoNota = ac.baixo !== null && rel === 0;
    const cls = ehBaixoNota ? "ac-ponto ac-p-baixo" : ehRaiz ? "ac-ponto ac-p-raiz" : "ac-ponto";
    const cx = pos[s].branca ? pos[s].x + (bw - 1) / 2 : pos[s].x + pw / 2;
    const cy = pos[s].branca ? bh - r - 5 : ph - r - 4;
    sv += `<circle cx="${cx}" cy="${cy}" r="${r}" class="${cls}"/>`;
  });
  return sv + `</svg>`;
}

// ============================================================
//  LIGAÇÃO COM O LEITOR
// ============================================================

const AC_RE_TOKEN = /^[A-G](#|b)?((m|maj|min|sus|dim|aug|add|M|°|\+)|\d+|\(.*?\))*(\/[A-G](#|b)?)?$/;
//  A casa do capotraste fica guardada mesmo quando ele está
//  desligado: quem toca sempre na 2ª não precisa reescolher.
let acCapoCasa = Number(localStorage.getItem("tl_capo_casa") || 2);
let acCapoUsar = localStorage.getItem("tl_capo_usar") === "1";
let acAba  = localStorage.getItem("tl_aba_acorde") || "violao";

// ── estilo ──────────────────────────────────────────────────
(function acEstilo() {
  const st = document.createElement("style");
  st.textContent = `
  /* sem sublinhado: numa linha cheia de acordes o pontilhado
     virava ruído, e a cor já diz que ali é acorde */
  .ac-tk{all:unset; cursor:pointer; font:inherit; color:inherit}
  .ac-tk:hover,.ac-tk:focus-visible{
    background:rgba(238,158,99,0.20); border-radius:3px;
    box-shadow:0 0 0 2px rgba(238,158,99,0.20);
  }
  .claro .ac-tk:hover,.claro .ac-tk:focus-visible{
    background:rgba(194,65,12,0.14); box-shadow:0 0 0 2px rgba(194,65,12,0.14);
  }

  /* painel que sobe por baixo */
  .ac-painel{
    position:absolute; left:0; right:0; bottom:0; z-index:20;
    background:#161616; border-top:1px solid var(--gray3);
    padding:14px 16px calc(16px + env(safe-area-inset-bottom));
    transform:translateY(101%); transition:transform .22s ease;
    max-height:70%; overflow:auto;
  }
  .ac-painel.on{transform:none}
  .claro .ac-painel{background:#F1EDE6;border-top-color:rgba(0,0,0,.14)}

  .ac-hd{display:flex;align-items:center;gap:12px;margin-bottom:12px}
  .ac-nome-ac{font-size:22px;font-weight:800;color:var(--cifra);letter-spacing:.02em}
  .claro .ac-nome-ac{color:var(--cifra-claro)}
  .ac-sub{font-size:12px;color:var(--gray);flex:1;min-width:0}
  .ac-fechar{background:none;border:none;color:var(--gray);font-size:18px;cursor:pointer;padding:2px 6px}

  .ac-abas{display:inline-flex;border:1px solid var(--gray3);border-radius:10px;overflow:hidden;margin-bottom:12px}
  .ac-abas button{
    background:none;border:none;cursor:pointer;font-family:'Inter',sans-serif;
    font-size:12px;font-weight:700;color:#c8c8c8;padding:7px 14px;
  }
  .ac-abas button.on{background:var(--cifra);color:#1a1a1a}
  .claro .ac-abas button{color:#5f5f5f}
  .claro .ac-abas button.on{background:var(--cifra-claro);color:#fff}

  .ac-capo{display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap}
  .ac-capo span{font-size:12px;color:var(--gray)}
  .ac-liga{display:inline-flex;align-items:center;gap:7px;cursor:pointer}
  .ac-liga input{width:15px;height:15px;accent-color:var(--cifra);cursor:pointer}
  .claro .ac-liga input{accent-color:var(--cifra-claro)}
  .ac-capo select:disabled{opacity:.4;cursor:default}
  .ac-forma-de{opacity:.6;font-weight:600}
  .ac-capo select{
    background:var(--black5);border:1px solid var(--gray3);color:#f0f0f0;
    border-radius:8px;padding:6px 10px;font-family:'Inter',sans-serif;font-size:12px;cursor:pointer;
  }
  .claro .ac-capo select{background:#E4DFD8;border-color:rgba(0,0,0,.16);color:#242424}

  .ac-formas{display:flex;gap:18px;align-items:center}
  .ac-variar-painel{padding:7px 14px;font-size:12px}
  .ac-acoes{display:flex;flex-direction:column;gap:8px;align-items:stretch}
  .ac-ouvir{
    display:inline-flex;align-items:center;justify-content:center;gap:7px;
    background:none;border:1px solid var(--gray3);border-radius:8px;
    color:#d8d8d8;font-family:'Inter',sans-serif;font-size:12.5px;font-weight:700;
    padding:8px 16px;cursor:pointer;transition:all .15s;
  }
  .ac-ouvir:hover{border-color:var(--cifra);color:var(--cifra)}
  .ac-ouvir.on{background:var(--cifra);border-color:var(--cifra);color:#1a1a1a}
  .claro .ac-ouvir{color:#3a3a3a;border-color:rgba(0,0,0,.2)}
  .claro .ac-ouvir.on{background:var(--cifra-claro);border-color:var(--cifra-claro);color:#fff}
  .ac-balao-btns{display:inline-flex;gap:6px;align-items:center}
  .ac-so-som{padding:3px 8px;display:inline-flex;align-items:center}
  .ac-so-som.on{background:var(--cifra);border-color:var(--cifra);color:#1a1a1a}
  .ac-conta{opacity:.55;font-weight:600;margin-left:4px}
  .ac-forma{text-align:center}
  .ac-forma figcaption{font-size:11px;color:var(--gray);margin-top:2px}
  .ac-svg{width:118px;height:auto}
  .ac-teclado{width:100%;max-width:340px}
  .ac-vazio{font-size:13px;color:var(--gray)}

  .ac-corda,.ac-traste{stroke:#8a8a8a;stroke-width:1}
  .claro .ac-corda,.claro .ac-traste{stroke:#6b6b6b}
  .ac-pestana-nut{fill:#d8d8d8}
  .claro .ac-pestana-nut{fill:#333}
  .ac-dedo{fill:var(--cifra)}
  .claro .ac-dedo{fill:var(--cifra-claro)}
  .ac-pestana{fill:var(--cifra);opacity:.9}
  .claro .ac-pestana{fill:var(--cifra-claro)}
  .ac-solta{fill:none;stroke:#d0d0d0;stroke-width:1.4}
  .claro .ac-solta{stroke:#555}
  .ac-x{fill:#9a9a9a;font-size:9px;text-anchor:middle;font-family:'Inter',sans-serif}
  .ac-casa{fill:#9a9a9a;font-size:8px;text-anchor:end;font-family:'Inter',sans-serif}
  .claro .ac-x,.claro .ac-casa{fill:#666}

  /* teclado no tom do leitor: teclas escuras, bolinha branca */
  .ac-tecla{fill:#2B2B2B;stroke:#4A4A4A;stroke-width:.7}
  .ac-preta{fill:#6E6E6E;stroke:none}
  .ac-ponto{fill:#fff;stroke:none}
  .ac-p-raiz{fill:#fff}
  .ac-p-baixo{fill:var(--cifra)}
  .claro .ac-tecla{fill:#FBFAF8;stroke:#B9B2A6}
  .claro .ac-preta{fill:#5C5750}
  .claro .ac-ponto{fill:#1a1a1a}
  .claro .ac-p-raiz{fill:#1a1a1a}
  .claro .ac-p-baixo{fill:var(--cifra-claro)}

  /* rolagem automática */
  .ac-rolar{display:inline-flex;align-items:center;gap:6px}
  .ac-vel{
    -webkit-appearance:none;appearance:none;width:74px;height:4px;border-radius:2px;
    background:var(--gray3);outline:none;cursor:pointer;
  }
  .ac-vel::-webkit-slider-thumb{
    -webkit-appearance:none;width:14px;height:14px;border-radius:50%;
    background:var(--cifra);cursor:pointer;
  }
  .claro .ac-vel::-webkit-slider-thumb{background:var(--cifra-claro)}
  @media(max-width:600px){.ac-vel{width:56px}}`;
  document.head.appendChild(st);
})();

// ── acordes clicáveis ───────────────────────────────────────
//  Envolve cada acorde num <button>. Como nada é acrescentado ao
//  texto visível, o alinhamento das colunas da cifra não muda.

const acCifraOriginal = lyraCifraParaHTML;
lyraCifraParaHTML = function (texto) {
  const html = acCifraOriginal(texto);
  return html.replace(
    /<span class="lyra-acordes">([\s\S]*?)<\/span>/g,
    (todo, dentro) => `<span class="lyra-acordes">${acMarcarTokens(dentro)}</span>`
  );
};

function acMarcarTokens(linha) {
  // o token inclui parênteses: C#m7(11) é um acorde só, não dois.
  // Um acorde envolvido, como "(Cm)", também vira botão — mas os
  // parênteses ficam de fora dele, para o texto não mudar.
  return linha.replace(/[^\s]+/g, tk => {
    const nucleo = tk.match(/^(\(*)(.*?)(\)*)$/);
    const [, abre, meio, fecha] = nucleo;
    const limpo = meio.replace(/[.,;]+$/, "");
    const marcar = alvo =>
      `<button type="button" class="ac-tk" data-ac="${alvo}">${alvo}</button>`;

    //  Etiqueta de divisão no meio de uma linha de acordes, como
    //  "[Intro] F C Em Am": ela recebe a cor da seção, e os
    //  acordes ao lado seguem laranja.
    if (/^\[.+\]$/.test(tk)) return `<span class="lyra-secao">${tk}</span>`;

    if (AC_RE_TOKEN.test(tk) && acLer(tk)) return marcar(tk);           // C#m7(11)
    if (limpo && AC_RE_TOKEN.test(limpo) && acLer(limpo))
      return abre + marcar(limpo) + fecha;                              // (Cm)
    return tk;
  });
}

// ── painel ──────────────────────────────────────────────────

function acPainel() {
  let p = document.getElementById("acPainel");
  if (p) return p;
  const box = document.getElementById("lyraBox");
  if (!box) return null;

  p = document.createElement("div");
  p.id = "acPainel";
  p.className = "ac-painel";
  p.innerHTML = `
    <div class="ac-hd">
      <span class="ac-nome-ac" id="acNome"></span>
      <span class="ac-sub" id="acSub"></span>
      <button class="ac-fechar" id="acFechar" aria-label="Fechar">&#10005;</button>
    </div>
    <div class="ac-abas" id="acAbas">
      <button data-aba="violao">Violão</button>
      <button data-aba="teclado">Teclado</button>
    </div>
    <div class="ac-capo" id="acCapoBox">
      <label class="ac-liga">
        <input type="checkbox" id="acCapoUsar">
        <span>Usar capotraste</span>
      </label>
      <select id="acCapoSel"></select>
      <span id="acCapoDica"></span>
    </div>
    <div id="acConteudo"></div>`;
  box.appendChild(p);

  p.querySelector("#acFechar").addEventListener("click", acFechar);
  p.querySelectorAll("#acAbas button").forEach(b =>
    b.addEventListener("click", () => {
      acAba = b.dataset.aba;
      localStorage.setItem("tl_aba_acorde", acAba);
      acDesenhar();
    }));

  const sel = p.querySelector("#acCapoSel");
  sel.innerHTML = Array.from({length:9},(_,i)=>`${i+1}ª casa`)
    .map((t,i)=>`<option value="${i+1}">${t}</option>`).join("");
  sel.value = acCapoCasa;
  sel.addEventListener("change", e => {
    acCapoCasa = Number(e.target.value);
    localStorage.setItem("tl_capo_casa", acCapoCasa);
    acPintarBalao(); acDesenhar();
  });

  const usar = p.querySelector("#acCapoUsar");
  usar.checked = acCapoUsar;
  usar.addEventListener("change", e => {
    acCapoUsar = e.target.checked;
    localStorage.setItem("tl_capo_usar", acCapoUsar ? "1" : "0");
    acPintarBalao(); acDesenhar();
  });
  return p;
}

let acAtual = null;
let acPainelVar = 0;      // qual forma está na tela

function acAbrir(nome) {
  if (nome !== acAtual) acPainelVar = 0;
  acAtual = nome;

  //  um painel por vez: o acorde recolhe o afinador e as folhas
  //  rápidas, que ocupam o mesmo canto da tela
  if (typeof afFechar === "function") afFechar();
  if (typeof opRapidoFechar === "function") opRapidoFechar();
  if (typeof OP_LARGO === "function" && !OP_LARGO() && typeof opFechar === "function") opFechar();
  const p = acPainel();
  if (!p) return;
  p.classList.add("on");
  acDesenhar();
}

function acFechar() {
  const p = document.getElementById("acPainel");
  if (p) p.classList.remove("on");
  acAtual = null;
}

function acCapo_() { return acCapoUsar ? acCapoCasa : 0; }

function acDesenhar() {
  const p = document.getElementById("acPainel");
  if (!p || !acAtual) return;

  p.querySelectorAll("#acAbas button").forEach(b =>
    b.classList.toggle("on", b.dataset.aba === acAba));
  p.querySelector("#acCapoBox").style.display = acAba === "violao" ? "" : "none";
  p.querySelector("#acCapoSel").value = acCapoCasa;
  p.querySelector("#acCapoSel").disabled = !acCapoUsar;
  p.querySelector("#acCapoUsar").checked = acCapoUsar;

  const ac = acLer(acAtual);
  p.querySelector("#acNome").textContent = acAtual;
  p.querySelector("#acSub").textContent =
    ac ? "notas " + ac.notas.map(acNomeNota).join(" · ") : "";

  const alvo = p.querySelector("#acConteudo");

  if (acAba === "teclado") {
    alvo.innerHTML = `${acSvgTeclado(ac)}
      <div class="ac-acoes">
        <button type="button" class="ac-ouvir" id="acOuvirBtn">${AC_ICO_SOM} Ouvir</button>
      </div>`;
    const o = alvo.querySelector("#acOuvirBtn");
    if (o) o.addEventListener("click", () => acOuvir(acAtual, o));
    return;
  }

  const nomeForma = acCapo_() ? acComCapo(acAtual, acCapo_()) : acAtual;
  const formas = acFormasViolao(acLer(nomeForma), 3);
  p.querySelector("#acCapoDica").textContent =
    acCapo_() ? `forma de ${nomeForma}` : "";

  if (!formas.length) {
    alvo.innerHTML = `<p class="ac-vazio">Sem forma simples para ${nomeForma} nesta afinação.</p>`;
    return;
  }

  //  Uma forma por vez. Três lado a lado viravam ruído: quem está
  //  com o violão na mão quer uma resposta, e troca se não servir.
  const i = acPainelVar % formas.length;
  const f = formas[i];
  alvo.innerHTML = `
    <div class="ac-formas">
      <figure class="ac-forma">
        ${acSvgViolao(f, nomeForma)}
        <figcaption>${acJanela(f.forma, f.casa) === 1
            ? "posição aberta" : acJanela(f.forma, f.casa) + "ª casa"}</figcaption>
      </figure>
      <div class="ac-acoes">
        ${formas.length > 1 ? `
          <button type="button" class="ac-variar ac-variar-painel" id="acVariarPainel">
            Variar <span class="ac-conta">${i + 1}/${formas.length}</span>
          </button>` : ""}
        <button type="button" class="ac-ouvir" id="acOuvirBtn">${AC_ICO_SOM} Ouvir</button>
      </div>
    </div>`;

  const v = alvo.querySelector("#acVariarPainel");
  if (v) v.addEventListener("click", () => { acPainelVar++; acDesenhar(); });
  const ou = alvo.querySelector("#acOuvirBtn");
  if (ou) ou.addEventListener("click", () => acOuvir(acAtual, ou));
}

// clique em qualquer acorde da cifra
document.addEventListener("click", e => {
  const b = e.target.closest(".ac-tk");
  if (b) { e.preventDefault(); acAbrir(b.dataset.ac); }
});

// ── rolagem automática ──────────────────────────────────────

let acRolando = false, acVel = Number(localStorage.getItem("tl_vel_rolagem") || 30), acRaf = null, acResto = 0;

//  Botão de instrumento na própria barra: no CifraClub isso mora
//  nas opções, mas aqui o leitor tem uma barra só e trocar de
//  violão para teclado é coisa que se faz no meio do ensaio.
function acMontarInstrumento() {
  if (document.getElementById("acInstBtn")) return;
  const barra = document.querySelector(".lyra-barra .lyra-grupo:last-child");
  if (!barra) return;

  const b = document.createElement("button");
  b.className = "lyra-btn";
  b.id = "acInstBtn";
  b.title = "Instrumento dos diagramas";
  b.addEventListener("click", () => {
    acAba = acAba === "violao" ? "teclado" : "violao";
    localStorage.setItem("tl_aba_acorde", acAba);
    acPintarInstrumento();
    acPintarBalao();
    if (document.getElementById("acPainel")?.classList.contains("on")) acDesenhar();
  });
  barra.insertBefore(b, barra.firstChild);
  acPintarInstrumento();
}

const AC_ICO_VIOLAO = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 2.5l2 2-3.2 2.1-.9-.9-2.1 3.2"/><circle cx="10" cy="15" r="5.5"/><circle cx="10" cy="15" r="1.6"/><path d="M13.9 11.1l1.4-1.4"/></svg>`;
const AC_ICO_TECLADO = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="1.6"/><path d="M8 6v7M13 6v7M18 6v7"/></svg>`;

function acPintarInstrumento() {
  const b = document.getElementById("acInstBtn");
  if (!b) return;
  b.innerHTML = acAba === "teclado" ? AC_ICO_TECLADO : AC_ICO_VIOLAO;
  b.setAttribute("aria-label",
    acAba === "teclado" ? "Diagramas no teclado. Trocar para violão"
                        : "Diagramas no violão. Trocar para teclado");
}

function acMontarRolagem() {
  if (document.getElementById("acRolarBtn")) return;
  const barra = document.querySelector(".lyra-barra .lyra-grupo:last-child");
  if (!barra) return;

  const g = document.createElement("span");
  g.className = "ac-rolar";
  g.innerHTML = `
    <button class="lyra-btn" id="acRolarBtn" title="Rolagem automática" aria-label="Rolagem automática">▶</button>
    <input type="range" class="ac-vel" id="acVel" min="5" max="120" step="5" value="${acVel}"
           aria-label="Velocidade da rolagem">`;
  barra.appendChild(g);

  document.getElementById("acRolarBtn").addEventListener("click", acAlternarRolagem);
  document.getElementById("acVel").addEventListener("input", e => {
    acVel = Number(e.target.value);
    localStorage.setItem("tl_vel_rolagem", acVel);
  });
}

function acAlternarRolagem() {
  acRolando ? acPararRolagem() : acComecarRolagem();
}

function acComecarRolagem() {
  const corpo = document.getElementById("lyraCorpo");
  if (!corpo) return;
  acRolando = true; acResto = 0;
  const btn = document.getElementById("acRolarBtn");
  if (btn) { btn.textContent = "❚❚"; btn.classList.add("on"); }

  let antes = performance.now();
  (function passo(agora) {
    if (!acRolando) return;
    const dt = Math.min(agora - antes, 100) / 1000;
    antes = agora;
    // acVel em pixels por segundo, com o resto acumulado para
    // que velocidades baixas não fiquem travadas em zero
    acResto += (acVel / 4) * dt;
    const inteiro = Math.floor(acResto);
    if (inteiro > 0) {
      acResto -= inteiro;
      const antesTopo = corpo.scrollTop;
      corpo.scrollTop += inteiro;
      if (corpo.scrollTop === antesTopo) { acPararRolagem(); return; }  // chegou ao fim
    }
    acRaf = requestAnimationFrame(passo);
  })(antes);
}

function acPararRolagem() {
  acRolando = false;
  if (acRaf) cancelAnimationFrame(acRaf);
  const btn = document.getElementById("acRolarBtn");
  if (btn) { btn.textContent = "▶"; btn.classList.remove("on"); }
}

// para ao tocar na cifra, como num leitor de partitura
document.addEventListener("pointerdown", e => {
  if (acRolando && e.target.closest("#lyraCorpo")) acPararRolagem();
});

// ── enxertos no leitor ──────────────────────────────────────

const acRenderOriginal = lyraRenderConteudo;
lyraRenderConteudo = async function (...a) {
  const r = await acRenderOriginal.apply(this, a);
  acMontarInstrumento();
  acMontarRolagem();
  acPararRolagem();
  acFechar();
  return r;
};

//  ao fechar o leitor, para a rolagem e recolhe o painel
const acFecharLeitorOriginal = lyraFecharLeitor;
lyraFecharLeitor = function (...a) {
  acPararRolagem();
  acFechar();
  return acFecharLeitorOriginal.apply(this, a);
};

// ============================================================
//  BALÃO NO PASSAR O MOUSE
//  No desktop aparece ao passar por cima; no celular, que não
//  tem hover, só no toque — e aí abre o painel completo.
// ============================================================

//  Detecta pela ausência de dedo, não pela presença de mouse:
//  vários navegadores de desktop respondem "sem hover" e a
//  feature sumiria à toa. Tela de toque tem pointer grosso.
const AC_ICO_SOM = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6.5 9H3v6h3.5L11 19V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>`;

const AC_TEM_HOVER = !window.matchMedia("(pointer: coarse)").matches;
let acBalaoVar = 0;      // qual das formas está sendo mostrada
let acBalaoAc  = null;

(function acEstiloBalao() {
  const st = document.createElement("style");
  st.textContent = `
  .ac-balao{
    position:absolute; z-index:40; display:none;
    background:#1C1C1C; border:1px solid var(--gray3);
    border-radius:12px; padding:10px 12px 8px;
    box-shadow:0 12px 30px rgba(0,0,0,.5);
    text-align:center; pointer-events:auto;
  }
  .ac-balao.on{display:block}
  .claro .ac-balao{background:#FBF8F3;border-color:rgba(0,0,0,.16);box-shadow:0 12px 30px rgba(0,0,0,.18)}
  .ac-balao-nome{
    font-family:'Inter',sans-serif;font-size:14px;font-weight:800;
    color:var(--cifra);margin-bottom:4px;letter-spacing:.02em;
  }
  .claro .ac-balao-nome{color:var(--cifra-claro)}
  .ac-balao .ac-svg{width:104px}
  .ac-balao .ac-teclado{width:186px}
  .ac-pe-so{justify-content:center}
  .ac-balao-pe .ac-balao-casa{font-variant:tabular-nums}
  .ac-balao-pe{
    display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:4px;
  }
  .ac-balao-casa{font-family:'Inter',sans-serif;font-size:10px;color:var(--gray)}
  .ac-variar{
    background:none;border:1px solid var(--gray3);border-radius:7px;
    color:#c8c8c8;font-family:'Inter',sans-serif;font-size:10.5px;font-weight:700;
    padding:3px 9px;cursor:pointer;
  }
  .ac-variar:hover{border-color:var(--cifra);color:var(--cifra)}
  .ac-variar:disabled{opacity:.38;cursor:default}
  .ac-variar:disabled:hover{border-color:var(--gray3);color:#c8c8c8}
  .claro .ac-variar{color:#5f5f5f;border-color:rgba(0,0,0,.2)}
  .ac-num{font-size:7.4px;text-anchor:middle;fill:#1a1a1a;font-family:'Inter',sans-serif;font-weight:800}`;
  document.head.appendChild(st);
})();

function acBalao() {
  let b = document.getElementById("acBalao");
  if (b) return b;
  const box = document.getElementById("lyraBox");
  if (!box) return null;
  b = document.createElement("div");
  b.id = "acBalao";
  b.className = "ac-balao";
  box.appendChild(b);
  return b;
}

function acMostrarBalao(tk) {
  if (!AC_TEM_HOVER) return;
  const b = acBalao();
  if (!b) return;
  const nome = tk.dataset.ac;
  if (nome !== acBalaoAc) { acBalaoAc = nome; acBalaoVar = 0; }
  acPintarBalao();

  b.classList.add("on");
  const box = document.getElementById("lyraBox").getBoundingClientRect();
  const r = tk.getBoundingClientRect();
  const larg = b.offsetWidth, alt = b.offsetHeight;
  let x = r.left - box.left + r.width / 2 - larg / 2;
  x = Math.max(8, Math.min(x, box.width - larg - 8));
  let y = r.top - box.top - alt - 8;
  if (y < 8) y = r.bottom - box.top + 8;        // não cabe em cima: vai pra baixo
  b.style.left = x + "px";
  b.style.top  = y + "px";
}

function acPintarBalao() {
  const b = document.getElementById("acBalao");
  if (!b || !acBalaoAc) return;

  //  No teclado as notas do acorde são as mesmas sempre — não há
  //  o que variar. Mostra uma só, sem o botão.
  if (acAba === "teclado") {
    const ac = acLer(acBalaoAc);
    b.innerHTML = `
      <div class="ac-balao-nome">${acBalaoAc}</div>
      ${acSvgTeclado(ac, true)}
      <div class="ac-balao-pe">
        <span class="ac-balao-casa">${ac ? ac.notas.map(acNomeNota).join(" · ") : ""}</span>
        <button type="button" class="ac-variar ac-so-som" id="acOuvirBalao"
                title="Ouvir o acorde">${AC_ICO_SOM}</button>
      </div>`;
    const ob = b.querySelector("#acOuvirBalao");
    if (ob) ob.addEventListener("click", e => { e.stopPropagation(); acOuvir(acBalaoAc, ob); });
    return;
  }

  const nomeForma = acCapo_() ? acComCapo(acBalaoAc, acCapo_()) : acBalaoAc;
  const formas = acFormasViolao(acLer(nomeForma), 3);
  if (!formas.length) { b.innerHTML = `<p class="ac-vazio">sem forma</p>`; return; }

  const i = acBalaoVar % formas.length;
  const f = formas[i];
  const janela = acJanela(f.forma, f.casa);
  b.innerHTML = `
    <div class="ac-balao-nome">${acBalaoAc}${acCapo_() ? ` <span class="ac-forma-de">(${nomeForma})</span>` : ""}</div>
    ${acSvgViolao(f, acBalaoAc)}
    <div class="ac-balao-pe">
      <span class="ac-balao-casa">${janela === 1 ? "aberta" : janela + "ª casa"}</span>
      <span class="ac-balao-btns">
        ${formas.length > 1 ? `<button type="button" class="ac-variar" id="acVariar">Variar</button>` : ""}
        <button type="button" class="ac-variar ac-so-som" id="acOuvirBalao" title="Ouvir o acorde">${AC_ICO_SOM}</button>
      </span>
    </div>`;
  const v = b.querySelector("#acVariar");
  if (v) v.addEventListener("click", e => {
    e.stopPropagation(); acBalaoVar++; acPintarBalao();
  });
  const ob = b.querySelector("#acOuvirBalao");
  if (ob) ob.addEventListener("click", e => { e.stopPropagation(); acOuvir(acBalaoAc, ob); });
}

function acEsconderBalao() {
  const b = document.getElementById("acBalao");
  if (b) b.classList.remove("on");
}

//  O hover pede paciência dos dois lados: espera um instante
//  antes de abrir, para não piscar enquanto o olho atravessa uma
//  linha cheia de acordes, e espera outro antes de fechar, para
//  dar tempo de levar o mouse até o balão e clicar em Variar.
if (AC_TEM_HOVER) {
  const ESPERA_ABRIR = 130, ESPERA_FECHAR = 260;
  let abrir = null, fechar = null, ultimo = null;

  const cancelar = () => { clearTimeout(abrir); clearTimeout(fechar); };

  document.addEventListener("mouseover", e => {
    const tk = e.target.closest(".ac-tk");

    if (tk) {
      clearTimeout(fechar);
      if (tk === ultimo && document.getElementById("acBalao")?.classList.contains("on")) return;
      clearTimeout(abrir);
      abrir = setTimeout(() => { ultimo = tk; acMostrarBalao(tk); }, ESPERA_ABRIR);
      return;
    }

    // dentro do próprio balão: mantém aberto
    if (e.target.closest(".ac-balao")) { cancelar(); return; }

    clearTimeout(abrir);
    clearTimeout(fechar);
    fechar = setTimeout(() => { ultimo = null; acEsconderBalao(); }, ESPERA_FECHAR);
  });

  // sair da janela fecha na hora
  document.addEventListener("mouseleave", () => { cancelar(); ultimo = null; acEsconderBalao(); });
  document.addEventListener("scroll", () => { cancelar(); ultimo = null; acEsconderBalao(); }, true);
  window.addEventListener("resize", () => { cancelar(); ultimo = null; acEsconderBalao(); });
}

// ============================================================
//  OUVIR O ACORDE
//  Toca as notas uma a uma e depois todas juntas. O som é
//  sintetizado na hora — não baixa nenhum arquivo de áudio.
// ============================================================

let acAudio = null;
let acTocando = [];

function acCtx() {
  if (!acAudio) acAudio = new (window.AudioContext || window.webkitAudioContext)();
  if (acAudio.state === "suspended") acAudio.resume();   // iOS só libera após um toque
  return acAudio;
}

const acFreq = midi => 440 * Math.pow(2, (midi - 69) / 12);

//  Duas vozes diferentes, porque um violão e um piano não soam
//  igual: a corda é percutida e morre rápido no agudo, o piano
//  tem harmônicos que sustentam.

//  VIOLÃO — Karplus-Strong: um estouro de ruído entra num atraso
//  do tamanho do período da nota e realimenta com uma média que
//  vai apagando os agudos. É o modelo clássico de corda pinçada.
function acVozViolao(midi, quando, dur, ganho = 0.5) {
  const ctx = acCtx();
  const sr = ctx.sampleRate;
  const f = acFreq(midi);
  const n = Math.max(2, Math.round(sr / f));
  const total = Math.floor(sr * Math.min(dur + 0.4, 4));

  const buf = ctx.createBuffer(1, total, sr);
  const d = buf.getChannelData(0);

  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;   // o estouro
  const perda = 0.996;                                        // quanto a corda segura
  for (let i = n; i < total; i++) d[i] = perda * 0.5 * (d[i - n] + d[i - n + 1]);

  const src = ctx.createBufferSource();
  src.buffer = buf;

  const corpo = ctx.createBiquadFilter();     // caixa do violão
  corpo.type = "lowpass";
  corpo.frequency.setValueAtTime(3600, quando);

  const g = ctx.createGain();
  g.gain.setValueAtTime(ganho, quando);
  g.gain.exponentialRampToValueAtTime(0.0001, quando + dur + 0.35);

  src.connect(corpo); corpo.connect(g); g.connect(ctx.destination);
  src.start(quando);
  src.stop(quando + dur + 0.4);
  acTocando.push(src);
}

//  PIANO — parciais harmônicas somadas. Cada harmônico entra mais
//  fraco e morre antes que o anterior, que é o que dá o brilho no
//  ataque e o corpo que fica depois.
function acVozPiano(midi, quando, dur, ganho = 0.20) {
  const ctx = acCtx();
  const f = acFreq(midi);
  const parciais = [[1, 1], [2, 0.42], [3, 0.20], [4, 0.11], [6, 0.05]];

  const mestre = ctx.createGain();
  mestre.gain.setValueAtTime(ganho, quando);
  mestre.gain.exponentialRampToValueAtTime(0.0001, quando + dur + 0.5);
  mestre.connect(ctx.destination);

  parciais.forEach(([mult, peso], k) => {
    const o = ctx.createOscillator();
    o.type = k === 0 ? "triangle" : "sine";
    o.frequency.setValueAtTime(f * mult, quando);

    const g = ctx.createGain();
    const pico = peso * 0.9;
    g.gain.setValueAtTime(0.0001, quando);
    g.gain.exponentialRampToValueAtTime(pico, quando + 0.006);        // martelo
    g.gain.exponentialRampToValueAtTime(pico * 0.28, quando + 0.12);
    // harmônico alto apaga antes do fundamental
    g.gain.exponentialRampToValueAtTime(0.0001, quando + dur / (1 + k * 0.55));

    o.connect(g); g.connect(mestre);
    o.start(quando);
    o.stop(quando + dur + 0.55);
    acTocando.push(o);
  });
}

//  A voz segue o instrumento escolhido.
function acNota(midi, quando, dur, ganho) {
  return acAba === "teclado"
    ? acVozPiano(midi, quando, dur, ganho ?? 0.20)
    : acVozViolao(midi, quando, dur, ganho ?? 0.5);
}

//  As notas que vão soar. No violão sai a forma que está na tela,
//  corda por corda; no teclado, a sequência que o desenho mostra.
function acNotasParaTocar(nome) {
  const ac = acLer(nome);
  if (!ac) return [];

  if (acAba === "violao") {
    const nomeForma = acCapo_() ? acComCapo(nome, acCapo_()) : nome;
    const f = acFormasViolao(acLer(nomeForma), 3)[acPainelVar % 3] ||
              acFormasViolao(acLer(nomeForma), 1)[0];
    if (f) {
      const capo = acCapo_();
      return f.forma
        .map((casa, i) => casa === AC_MUDA ? null : AC_CORDAS[i] + casa + capo)
        .filter(x => x !== null);
    }
  }

  const inicio = ac.baixo !== null ? ac.baixo : ac.raiz;
  const graus = new Set();
  if (ac.baixo !== null) graus.add(0);
  ac.pcs.forEach(g => {
    const rel = ((ac.raiz + g) - inicio + 24) % 12;
    graus.add(rel === 0 && ac.baixo !== null ? 12 : rel);
  });
  return [...graus].sort((a, b) => a - b).map(rel => 48 + inicio + rel);
}

function acParar() {
  acTocando.forEach(o => { try { o.stop(); } catch {} });
  acTocando = [];
}

function acOuvir(nome, botao) {
  acParar();
  const notas = acNotasParaTocar(nome);
  if (!notas.length) return;

  const ctx = acCtx();
  const t0 = ctx.currentTime + 0.06;
  const passo = 0.38;

  notas.forEach((m, i) => acNota(m, t0 + i * passo, 0.95));       // uma a uma

  // e o acorde: no violão as cordas entram em sequência rápida,
  // como uma palhetada; no piano as notas caem juntas
  const juntas = t0 + notas.length * passo + 0.22;
  const arrastada = acAba === "teclado" ? 0 : 0.022;
  notas.forEach((m, i) =>
    acNota(m, juntas + i * arrastada, 2.1, acAba === "teclado" ? 0.15 : 0.40));

  if (botao) {
    botao.classList.add("on");
    const fim = (notas.length * passo + 2.5) * 1000;
    clearTimeout(botao._t);
    botao._t = setTimeout(() => botao.classList.remove("on"), fim);
  }
}