const CACHE_NAME = "worldcup-loyalty-v1";

// Ressources à mettre en cache lors de l'installation
const PRECACHE_URLS = [
  "/",
  "/leaderboard",
  "/offline",
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
      icon: "/icon-192.png",
      badge: "/icon-192.png",
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

  // API routes et pages auth : network-first (toujours depuis le serveur)
  const isNetworkFirst =
    url.pathname.startsWith("/api/") ||
    url.pathname === "/login" ||
    url.pathname === "/signup" ||
    url.pathname === "/dashboard" ||
    url.pathname === "/register";

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
