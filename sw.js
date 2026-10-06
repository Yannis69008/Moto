/* Inclinomètre moto : fonctionnement hors connexion.
   - l'appli (page HTML) : réseau d'abord (pour recevoir les mises à jour), sinon la dernière copie enregistrée ;
   - bibliothèque de carte et polices : copie locale d'abord ;
   - fonds de carte déjà vus : gardés (jusqu'à environ 1500 tuiles) pour s'afficher sans réseau. */
var APP = "moto-app-v1", LIB = "moto-lib-v1", TIL = "moto-tiles-v1", MAXT = 1500;

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(APP).then(function (c) {
    return c.addAll(["inclinometre-moto.html"]).catch(function () {});
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return [APP, LIB, TIL].indexOf(k) < 0; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function trimTiles() {
  caches.open(TIL).then(function (c) {
    c.keys().then(function (ks) {
      if (ks.length > MAXT) for (var i = 0; i < ks.length - MAXT; i++) c.delete(ks[i]);
    });
  });
}

self.addEventListener("fetch", function (e) {
  var r = e.request;
  if (r.method !== "GET") return;
  var u = new URL(r.url);

  /* la page de l'appli */
  if (r.mode === "navigate" || (u.origin === location.origin && /\.html$/.test(u.pathname))) {
    e.respondWith(
      fetch(r).then(function (res) {
        if (res && res.ok) { var cp = res.clone(); caches.open(APP).then(function (c) { c.put("inclinometre-moto.html", cp); }); }
        return res;
      }).catch(function () {
        return caches.open(APP).then(function (c) { return c.match("inclinometre-moto.html"); });
      })
    );
    return;
  }

  /* bibliothèque de carte (cdnjs) et polices */
  if (/cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(u.host)) {
    e.respondWith(caches.open(LIB).then(function (c) {
      return c.match(r).then(function (hit) {
        if (hit) return hit;
        return fetch(r).then(function (res) { if (res && (res.ok || res.type === "opaque")) c.put(r, res.clone()); return res; });
      });
    }));
    return;
  }

  /* fonds de carte OpenStreetMap */
  if (/tile\.openstreetmap\.org$/.test(u.host)) {
    e.respondWith(caches.open(TIL).then(function (c) {
      return fetch(r).then(function (res) {
        if (res && (res.ok || res.type === "opaque")) { c.put(r, res.clone()); trimTiles(); }
        return res;
      }).catch(function () {
        return c.match(r).then(function (hit) { return hit || Response.error(); });
      });
    }));
    return;
  }
  /* le reste (météo, radars, itinéraires) : réseau normal, l'appli gère déjà l'absence de connexion */
});
