# PLAN D'ÉVOLUTION — Plateforme Salon Bel Air Foot (multi-catégories)

État : 27/09/2026 · Repo : aminax547-cpu/salon-bel-air-u16 · GitHub Pages (statique, gratuit)

---

## Module 1 — Architecture multi-catégories ✅ (implémenté)

- **Router** : hash-based (`#/u16`, `#/u17`, `#/u19`, `#/u14`) — fonctionne sur GitHub Pages sans config serveur.
- **Navigation** : barre avec menu déroulant ⌄ Catégories (U14 / U16 / U17 / U19), bascule instantanée SPA.
- **Dashboard d'accueil** (route `#/`) : dernières nouvelles du club toutes catégories + 4 cartes catégories.
- **Données** : un fichier JSON par catégorie (`data/u16.json`, `data/u19.json`…) + `data/club.json` central.

### Catégories activées
| Cat | Compétition FFF | cpNo | Poule | État |
|---|---|---|---|---|
| **U16 D2** | Départemental 2 | 457249 | A | ✅ données réelles (2e) |
| **U19 D1** | Départemental 1 | 457242 | A | ✅ données réelles (11e) |
| **U17 / U14** | — | — | — | 🕓 structure prête — activer dès que le club a une équipe engageant (donner cpNo) |

> U17 D2 2026/27 : aucune équipe "Salon Bel Air Foot" dans les poules A/B/C (vérifié). Le club n'a pas d'équipe U17 cette saison → carte "Bientôt".

---

## Module 2 — Statistiques "Pro" (style Ligue 1 / Opta) ✅ calculées depuis FFF

Tout est calculé **automatiquement** par `tools/fetch-fff.mjs` à partir des données officielles :

- **Meilleurs buteurs / passeurs du club** : champs `data/*-joueurs.json` (buts/passes gérés par le staff, préservés). La FFF ne publie pas les buts individuels pour les jeunes.
- **Forme (5 derniers matchs)** : série 🟢🟢🟠🔴🟢 calculée depuis les résultats.
- **Clean sheets** : % de matchs sans encaisser.
- **Moyenne buts marqués / encaissés** par match.
- **Domicile vs Extérieur** : mini-graphique comparatif.

Rendu : barres SVG + badges, sans librairie externe (léger, rapide).

---

## Module 3 — Calendrier & Match Day ✅

- **Compte à rebours** "Prochain match" (jours : heures : min : sec) sur l'accueil catégorie.
- **Météo au coup d'envoi** : Open-Meteo (API gratuite, sans clé, CORS OK) — condition/température au jour du match.
- **"S'y rendre" (Google Maps)** : lien open `https://maps.google.com/?q=<stade>` — itinéraire GPS direct (gratuit, pas de clé).
- **"Ajouter au calendrier"** : télécharge un fichier `.ics` (Google/Apple) généré côté client (?).

---

## Module 4 — IA & contenu automatisé (⚠️ clé requise pour l'API)

- **Générateur de résumés IA** `tools/generer-resume.mjs` :
  - Le coach édite `data/resume-input.json` (score, buteurs, homme du match, 3 adjectifs) — cases à cocher côté site.
  - L'Action GitHub (`resume.yml`) appelle l'API (OpenAI **ou DeepSeek — clé déjà dispo dans le workspace**) avec la clé en *secret* GitHub (jamais exposée côté client).
  - Génère `data/actus/<date>.json` → affiché dans le fil d'actualité.
- **Notification automatique** : workflow `notify.yml` envoie un webhook Discord (ou WhatsApp via service type CallMeBot/push-notifier) quand le classement change. URL en secret.
- Sans clé configurée : le script génère un **résumé template** (fallback gratuit) à partir des réponses du coach.

---

## Module 5 — UI/UX "Mode Ultra" ✅

- **Dark mode immersif** : déjà par défaut (navy/gold), contraste optimisé.
- **Skeleton / shimmer** pendant le chargement des tableaux.
- **Transitions fluides** entre onglets (fade/slide via classes CSS).
- **Cartes matchs "Versus"** style FIFA : blason SBA vs blason adverse, score géant, statut.

---

## Architecture technique

```
index.html            # SPA : router + dashboard + vue catégorie
app.js                # router hash + rendu classement/stats/calendrier/équipe
style.css             # design system navy/or, dark, skeleton, versus
tools/fetch-fff.mjs   # scrape FFF (SSR ng-state) → data/<cat>.json (incrémental, idle-safe)
tools/generer-resume.mjs # générateur de résumé (template local OU API IA + clé secret)
data/club.json        # infos club + catégories activées
data/u16.json         # classement + calendrier + stats U16 (généré)
data/u19.json         # idem U19 (généré)
data/u16-joueurs.json # effectif U16 (généré + éditable buts/passes)
data/resume-input.json # réponse du coach pour la génération IA
.github/workflows/sync.yml   # cron 6h : fetch FFF
.github/workflows/resume.yml # génère un résumé si resume-input a un flag
.github/workflows/notify.yml # webhook Discord sur changement
```

**Pourquoi pas React/Tailwind ?** Le site est 100 % statique sur GitHub Pages avec zéro build :
plus rapide, plus fiable, modifiable par le club sans toolchain. Le router SPA + design system
CSS couvrent la flexibilité multi-catégories et le dark mode demandés.

---

## Priorités court terme (prochain sprint)
1. ✅ Multi-catégories U16 + U19 (réel)
2. ✅ Stats pro + compte à rebours + météo + ICS + Maps
3. 🕓 Cartes U17/U14 dès qu'une équipe est engagée
4. 🕓 IA résumés (configurer secret GitHub → clé DeepSeek dispo)
5. 🕓 Webhook Discord/WhatsApp (fournir URL webhook)