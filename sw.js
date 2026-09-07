// ============================================================
//  TOM LOUVORES — funcionamento sem internet
//
//  As cifras e as amostras de som já ficavam guardadas, mas o app
//  em si dependia da rede para abrir. Numa igreja com sinal ruim
//  isso dava tela branca justo na hora do culto.
//
//  Estratégias, por tipo de coisa:
//    · o próprio app (html, css, js) → do cache primeiro, e a rede
//      atualiza por trás para a próxima abertura
//    · as amostras de som → do cache, e só busca se faltar
//    · o banco de dados (Supabase, Lyra) → sempre da rede, com o
//      cache como rede de segurança quando ela falha
// ============================================================

const CACHE = "tom-louvores-v9";

const APP = [
  "./",
  "./index.html",
  "./repertorio.html",
  "./style.css",
  "./config.js",
  "./app.js",
  "./lyra.js",
  "./acordes.js",
  "./opcoes.js",
  "./afinador.js",
  "./metronomo.js",
  "./vista-lista.js",
  "./culto-seletor.js",
  "./busca-limpar.js",
  "./paginas.js",
  "./atualizar.js",
  "./sons.js",

  //  Sem estes, o app abria offline mas sem o fundo do topo e sem
  //  o ícone na tela de início do celular.
  //
  //  São logo2 e logo3 porque são os que as páginas usam de fato:
  //  eu tinha posto "logo.png" no chute, e o resultado era guardar
  //  um arquivo que ninguém exibe e deixar de fora os dois que
  //  aparecem na tela.
  "./manifest.json",
  "./image.jpg",
  "./logo2.png",
  "./logo3.png",
];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    //  cache:"reload" força ir à rede de verdade. Sem isso, o
    //  navegador entrega do cache HTTP dele e a versão "nova" que
    //  entra no pacote é a antiga — o app trocava de cache e
    //  continuava rodando o mesmo código.
    await Promise.all(APP.map(u =>
      c.add(new Request(u, { cache: "reload" })).catch(() => {})));
    self.skipWaiting();
  })());
});

//  A página pede para a versão nova assumir sem esperar o próximo
//  lançamento. Só então ela recarrega, já com o código novo.
self.addEventListener("message", e => {
  if (e.data && e.data.acao === "assumir") self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter(n => n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

const ehBanco = url =>
  url.hostname.includes("supabase") ||
  url.hostname.includes("lyra-music-database");

const ehAmostra = url => url.hostname.includes("gleitz.github.io");

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  //  Dados: a rede manda. Só se ela falhar é que vale o que estava
  //  guardado — melhor um culto de ontem do que nada.
  if (ehBanco(url)) {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok) (await caches.open(CACHE)).put(req, r.clone());
        return r;
      } catch {
        const c = await caches.match(req);
        if (c) return c;
        throw new Error("sem rede e sem cópia guardada");
      }
    })());
    return;
  }

  //  Amostras de som: uma vez baixadas, nunca mudam.
  if (ehAmostra(url)) {
    e.respondWith((async () => {
      const c = await caches.match(req);
      if (c) return c;
      const r = await fetch(req);
      if (r.ok) (await caches.open(CACHE)).put(req, r.clone());
      return r;
    })());
    return;
  }

  //  A PÁGINA em si tenta a rede primeiro. Com o cache na frente,
  //  o app instalado abria sempre a versão guardada e só trocava de
  //  código no segundo lançamento — foi por isso que o recarregar
  //  depois de baixar não funcionava no app, mas funcionava no
  //  navegador. A cópia guardada continua valendo quando falta rede.
  if (req.mode === "navigate" || url.pathname.endsWith(".html")) {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok) (await caches.open(CACHE)).put(req, r.clone());
        return r;
      } catch {
        return (await caches.match(req)) ||
               (await caches.match("./index.html")) ||
               new Response("sem conexão", { status: 503 });
      }
    })());
    return;
  }

  //  Os demais arquivos do app: entrega o guardado na hora e busca
  //  a versão nova por trás, para a próxima abertura já vir nova.
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const c = await caches.match(req);
      const rede = fetch(req).then(r => {
        if (r.ok) caches.open(CACHE).then(cc => cc.put(req, r.clone()));
        return r;
      }).catch(() => null);
      return c || (await rede) || new Response("sem conexão", { status: 503 });
    })());
  }
});