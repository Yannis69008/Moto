/* Inclinomètre moto : fonctionnement hors connexion.
   - l'appli (page HTML) : s'ouvre tout de suite depuis la copie enregistrée, la nouvelle version se télécharge en arrière-plan
     et l'appli propose de l'installer ;
   - motos 3D (moto-XX.bin) : téléchargées une seule fois, puis gardées ;
   - bibliothèque de carte et polices : copie locale d'abord ;
   - fonds de carte déjà vus : gardés (jusqu'à environ 1500 tuiles) pour s'afficher sans réseau. */
var APP = "moto-app-v2", LIB = "moto-lib-v1", TIL = "moto-tiles-v1", MOD = "moto-models-v1", MAXT = 1500;

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

  /* la page de l'appli : copie enregistree tout de suite, mise a jour en arriere-plan */
  if (r.mode === "navigate" || (u.origin === location.origin && /\.html$/.test(u.pathname))) {
    e.respondWith(caches.open(APP).then(function (c) {
      return c.match("inclinometre-moto.html").then(function (old) {
        var net = fetch(u.origin + u.pathname, { cache: "no-store" }).then(function (res) {
          if (res && res.ok) {
            var et = res.headers.get("etag") || res.headers.get("last-modified") || "", oe = old ? (old.headers.get("etag") || old.headers.get("last-modified") || "") : "";
            c.put("inclinometre-moto.html", res.clone());
            if (old && et && et !== oe) self.clients.matchAll().then(function (cl) { cl.forEach(function (x) { x.postMessage({ t: "upd" }); }); });
          }
          return res;
        });
        if (old) { e.waitUntil(net.catch(function () {})); return old; }
        return net;
      });
    }));
    return;
  }

  /* motos 3D : une fois telechargees, gardees */
  if (u.origin === location.origin && /\.bin$/.test(u.pathname)) {
    e.respondWith(caches.open(MOD).then(function (c) {
      return c.match(u.pathname).then(function (hit) {
        if (hit) return hit;
        return fetch(u.pathname).then(function (res) { if (res && res.ok) c.put(u.pathname, res.clone()); return res; });
      });
    }));
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
