# Salon Bel Air Foot — U16 D2 2026/27

Site élégant de consultation du classement **U16 Départemental 2 — District Provence** — saison **2026/27**.

- ⚽ **Club :** Salon Bel Air Foot (Salon-de-Provence, Stade Marcel Roustan, fondé 1928)
- 🏆 **Catégorie :** U16 D2 — Poule A — District Provence (FFF)
- ✨ **Design :** ballon 3D réaliste (Three.js, texture panneaux icosaédrique + relief) + verre dépoli, palette navy/or
- 🔄 **Données :** synchronisées **automatiquement** depuis les données officielles FFF (epreuves.fff.fr)

## 🔄 Mise à jour automatique du classement

Le site se met à jour **tout seul** après chaque week-end grâce à deux mécanismes :

1. **`tools/fetch-fff.mjs`** — script Node (zéro dépendance) qui récupère le classement
   officiel depuis la page SSR de la FFF (le site FFF bloque l'API JSON directe avec un
   WAF, mais la page HTML rendue serveur contient toutes les données — on les extrait du
   `#ng-state` Angular) et écrit `data/u16-d2-2026-2027.json`.
2. **`.github/workflows/sync.yml`** — GitHub Action qui exécute ce script
   automatiquement (lundi / mardi / jeudi à 08h UTC) et commit les changements.
   → push sur `main` = site à jour en ~30 s.

**Lancement manuel :**

```bash
node tools/fetch-fff.mjs            # Poule A (défaut)
node tools/fetch-fff.mjs --poule B  # autre poule si un jour
```

Paramétrable via variable d'env : `FFF_CPNO=457249` (U16 D2 Provence 2026/27).

## Structure

```
index.html                  # page + hero ballon 3D
style.css                   # design glass navy/or
app.js                      # classement (découplé de la 3D) + scène Three.js réaliste
assets/three.module.js      # Three.js hébergé en local (fiable, zéro CDN)
data/u16-d2-2026-2027.json  # données générées (ne pas éditer à la main)
tools/fetch-fff.mjs         # script de synchronisation FFF
.github/workflows/sync.yml  # mise à jour automatique (cron)
```

## Roadmap

- V1 : U16 D2 + héro ballon 3D + mise à jour auto FFF ✅
- V2 : onglets U14 / U17 / U19 / Seniors (1 compétition FFF par fichier)
- V3 : calendrier + résultat détaillé

## URL

https://aminax547-cpu.github.io/salon-bel-air-u16/

---
Fait avec 🤍 pour Salon Bel Air Foot. Site non officiel.