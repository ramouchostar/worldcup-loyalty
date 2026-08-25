// v4 : /auth/callback n'est plus intercepté (bug — voir le handler fetch
// ci-dessous). Le bump force la mise à jour du service worker installé sur
// les appareils déjà connectés dès la prochaine visite, au lieu d'attendre
// une purge de cache fortuite.
const CACHE_NAME = "worldcup-loyalty-v4";

// Ressources à mettre en cache lors de l'installation
const PRECACHE_URLS = [
  "/",
  "/membres",
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
