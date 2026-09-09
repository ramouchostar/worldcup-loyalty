// v5 : /membres n'est plus ni précaché ni intercepté (voir le handler fetch
// ci-dessous). Le bump purge la copie périmée du splash sur les appareils
// où elle traîne encore — sans lui, un membre déjà connecté continuerait de
// la recevoir jusqu'à une purge de cache fortuite.
//
// v4 : /auth/callback n'est plus intercepté (bug — voir le handler fetch
// ci-dessous). Le bump force la mise à jour du service worker installé sur
// les appareils déjà connectés dès la prochaine visite, au lieu d'attendre
// une purge de cache fortuite.
const CACHE_NAME = "worldcup-loyalty-v5";

// Ressources à mettre en cache lors de l'installation.
// /membres (start_url de la PWA) en est volontairement absent : rien ne le
// sert plus depuis le cache, une entrée précachée ne ferait que vieillir.
const PRECACHE_URLS = [
  "/",
  "/offline",
  "/api/icons/192",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Supprime les anciens caches
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: "Belchicken", body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(data.title ?? "Belchicken", {
      body: data.body,
      icon: "/api/icons/192",
      badge: "/api/icons/192",
      data: { url: data.url ?? "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      const existing = clients.find(c => c.url.includes(url));
      return existing ? existing.focus() : self.clients.openWindow(url);
    })
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ne pas intercepter les requêtes non-GET ou vers Supabase / APIs externes
  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // /auth/callback : jamais intercepté, même en network-first. Cette route
  // répond toujours par une redirection HTTP porteuse des cookies de session
  // (Google OAuth, magic link) ; event.respondWith(fetch(...)) suivrait cette
  // redirection lui-même et rendrait la page finale sans que le navigateur ne
  // l'enregistre comme une navigation propre — l'utilisateur retombe sur la
  // page d'où il venait (ex. la landing "/", précachée ci-dessus) alors que
  // la session, elle, est bien ouverte. D'où le symptôme « connecté avec
  // Google mais renvoyé sur la landing, il faut recliquer sur Connexion ».
  // Laisser passer entièrement au navigateur (pas de respondWith) évite le
  // problème à la racine.
  if (url.pathname === "/auth/callback") return;

  // /membres : jamais intercepté non plus, pour la même raison. C'est le
  // start_url de la PWA, et son contenu dépend de la session — un membre
  // déjà connecté est redirigé vers son dashboard côté serveur (correctif du
  // 2026-09-02, cf. app/(public)/membres/page.tsx).
  //
  // La page tombait jusqu'ici dans le stale-while-revalidate ci-dessous, dont
  // la règle est `return cached ?? networkFetch` : le cache était renvoyé
  // immédiatement et la réponse réseau ne servait qu'à le rafraîchir pour la
  // fois suivante. Deux conséquences, la seconde bien pire que la première :
  //   1. toute modification de la page n'apparaissait qu'au lancement
  //      SUIVANT (symptôme constaté le 2026-09-09 sur les pièces Fluent) ;
  //   2. un membre connecté recevait le splash anonyme depuis le cache et
  //      retombait sur « Se connecter » — la redirection, revenue en
  //      arrière-plan, n'était jamais appliquée à la page affichée. Le
  //      correctif serveur du 2026-09-02 ne pouvait donc pas s'appliquer.
  //
  // On ne le passe pas en network-first : cette branche répond par
  // `event.respondWith(fetch(request))`, qui suivrait lui-même la redirection
  // de session et rendrait le dashboard sous l'URL /membres sans navigation
  // propre — exactement le bug de /auth/callback ci-dessus. Laisser passer au
  // navigateur évite le problème à la racine sur le point d'entrée de l'app,
  // là où une régression serait la plus coûteuse.
  //
  // Contrepartie assumée : un lancement hors ligne affiche l'erreur réseau du
  // navigateur au lieu de notre page /offline. Personne ne perd rien à
  // l'usage — /offline n'était de toute façon jamais atteint pour cette URL
  // (le cache répondait avant), et le splash hors ligne donnait l'illusion
  // d'une app utilisable alors que ses deux boutons exigent le réseau.
  if (url.pathname === "/membres") return;

  // Pages membres authentifiées (/r/[id]/...) : network-first, SAUF la
  // landing (/r/[id]) et le classement — surfaces de consultation où la
  // vitesse d'affichage prime. Le dashboard, les récompenses (countdown
  // 48h), la réserve et la soumission de ticket doivent être frais.
  const memberMatch = url.pathname.match(/^\/r\/[^/]+(\/.*)?$/);
  const memberSubPath = memberMatch?.[1] ?? null;
  const isMemberAppPage =
    !!memberSubPath && memberSubPath !== "/" && memberSubPath !== "/leaderboard";

  // Network-first (toujours depuis le serveur) :
  // - /api/* et pages auth (historique)
  // - /admin/* et /platform : consoles opérationnelles — une donnée en
  //   retard fait prendre de mauvaises décisions, un formulaire pré-rempli
  //   périmé peut écraser des données fraîches
  // - /coupon/* : dispositif anti-fraude à timer 10 min (ADR 0011), ne doit
  //   jamais sortir d'un cache
  const isNetworkFirst =
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/admin") ||
    url.pathname.startsWith("/platform") ||
    url.pathname.startsWith("/coupon") ||
    url.pathname === "/login" ||
    url.pathname === "/signup" ||
    url.pathname === "/register" ||
    isMemberAppPage;

  if (isNetworkFirst) {
    event.respondWith(
      fetch(request).catch(() =>
        url.pathname.startsWith("/api/")
          ? new Response(JSON.stringify({ error: "Hors ligne" }), { headers: { "Content-Type": "application/json" } })
          : caches.match("/offline").then(r => r ?? new Response("Hors ligne", { status: 503 }))
      )
    );
    return;
  }

  // Pages et assets statiques : stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached ?? new Response("Hors ligne", { status: 503 }));

      return cached ?? networkFetch;
    })
  );
});
