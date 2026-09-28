# Salon Bel Air Foot — Plateforme multi-catégories

Site élégant de suivi des équipes jeunes de **Salon Bel Air Foot** (District Provence), alimenté
automatiquement par les données officielles FFF.

## ✨ Fonctionnalités

- **Multi-catégories** : U16 (D2, 2e) · U19 (D1, 11e) — U17/U14 activables en 2 min (structure prête)
- **Dashboard accueil** : cartes des équipes + fil d'actualité (résumés générés)
- **Stats "Pro"** : forme 5 matchs 🟢🟠🔴, % clean sheets, moyenne buts/match, domicile vs extérieur
- **Match Day** : compte à rebours prochain match, météo (Open-Meteo), bouton "S'y rendre" (Google Maps), ajout au calendrier (.ics)
- **Effectif** : joueurs extraits des feuilles de match officielles FFF (composition)
- **Dark mode immersif**, skeleton shimmer, transitions, cartes "Versus" style FIFA
- **Mobile** : layout responsive

## 🔄 Mise à jour automatique (GitHub Actions)

`.github/workflows/sync.yml` — toutes les 6 h :
```bash
node tools/fetch-fff.mjs --cat u16   # → data/u16.json (classement + calendrier + stats)
node tools/fetch-fff.mjs --cat u19   # → data/u19.json
```
Incrémental : l'effectif (`*-joueurs.json`) n'est modifié que quand de nouveaux matchs
apparaissent ; les buts/passes saisis par le staff sont préservés.

### Activer une catégorie (U17 / U14)
1. Trouver le cpNo FFF (ex. `epreuves.fff.fr/competition/engagement/<cpNo>-...`)
2. Ajouter l'entrée dans `CATS` dans `tools/fetch-fff.mjs`
3. Ajouter la carte dans `data/club.json`

## ✍️ Résumés IA (Module 4)

`tools/generer-resume.mjs` — le coach remplit `data/resume-input.json`, l'Action `resume.yml`
génère l'article (LLM si clé `IA_API_KEY` en secret GitHub, sinon template gratutit).
L'article apparaît dans le fil d'actualité.

**Config clé IA (DeepSeek dispo dans le workspace)** :
Settings → Secrets and variables → Actions → `IA_API_KEY` (optionnel : `IA_BASE_URL`, `IA_MODEL`).

## 🔔 Notifications (Module 4)

`.github/workflows/notify.yml` — webhook Discord/WhatsApp après chaque sync si le secret
`DISCORD_WEBHOOK_URL` est configuré.

## 🗂️ Structure

```
index.html · style.css · app.js        # SPA (router hash #/u16, #/u19, #/stats, #/calendrier)
tools/fetch-fff.mjs                    # sync FFF multi-catégories (WAF-safe : SSR ng-state)
tools/generer-resume.mjs               # générateur de résumés (IA ou template)
data/club.json                         # config club + catégories + actualités
data/u16.json · data/u19.json          # classements + calendriers + stats (générés)
data/u16-joueurs.json · u19-joueurs.json # effectifs (générés + buts/passes éditable)
data/actus/                            # résumés générés (index.json = fil d'actualité)
.github/workflows/sync.yml · resume.yml · notify.yml
```

## 🔗

https://aminax547-cpu.github.io/salon-bel-air-u16/

---
Fait avec 🤍 pour Salon Bel Air Foot. Site non officiel — données FFF (epreuves.fff.fr).
