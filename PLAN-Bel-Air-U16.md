# PLAN — Salon Bel Air Foot | Site Classement U16

**Auteur:** Muse Spark pour Amine · 27 sept 2026
**Repo cible:** `sajomtech-commits/salon-bel-air-u16` (public, GitHub Pages)
**Workspace:** `/workspace/Amine2` → sera poussé sur le git d'Amine

---

## 1 — Ce qu'on a trouvé sur le club

| Point | Info vérifiée |
|---|---|
| **Nom complet** | **Salon Bel Air Foot** (SB AF) — fusion 11 mai 2011 de *FC Salon* (1928) + *S.A. Bel-Air Salon* |
| **Ville** | Salon-de-Provence (13) — Bouches-du-Rhône |
| **Stade** | Stade **Marcel Roustan** |
| **District** | Provence · **Ligue Méditerranée** |
| **Couleurs historiques** | Bleu marine / Blanc (FC Salon) — Bel Air apporte le rouge ? On part sur **Navy #0A1628 + Or #C8A96A + Blanc cassé** pour le site = élégant + foot pro |
| **Niveau senior 24-25** | Régional 2 Méditerranée (R2 MED-C) — 11e |
| **Catégorie demandée** | **U16 Départemental 2 (U16 D2) — District Provence — Saison 2026/27** · poule à confirmer sur FFF (ex: Salon Bel Air Foot 22 - vu en D2) |
| **Compétition FFF** | `U16 D2 - U17-U16` sur `epreuves.fff.fr` (engagement 443647) et PDF District Provence (classements publiés chaque semaine en PDF + page FFF) — FFF bloque en 403, donc JSON local prioritaire |
| **Source classement** | Pas d'API publique stable FFF → **JSON local `data/u16-d2-2026-2027.json`** éditable à la main au début, puis scraper léger PDF/FFF si dispo. Fiable, rapide, pas de clés. |

> Le club est un club formateur historique : 3 saisons en Division 4 (1980-1983), champion DH Méditerranée 2014, école de foot très active. La page U16 D1 FFF existe mais renvoie souvent 403/PDF → on ne bloque pas le site là-dessus.

Sources: statfootballclubfrance.fr/fiche-club.php?id=609, ville de Salon, PDF District Provence FFF.

---

## 2 — Ton idée « site 3D en forme de ballon » : mon avis

**J'adore l'intention — classe, mémorable. Mais site *entier* en forme de ballon = piège.**

| Option | Rendu | Lisibilité classement | Perf | Verdict |
|---|---|---|---|---|
| **A. Tout le site mappé sur une sphère 3D** (canvas unique) | Wow | Catastrophique : texte courbé, scroll bizarre, inaccessible, SEO nul | Très lourd | ❌ à éviter |
| **B. (RECOMMANDÉ) Hero ballon 3D + tableau en verre flottant** | Premium / Apple-like | Parfait : tableau plat, lisible, triable | Léger (Three.js 150ko) | ✅ **classe + efficace** |
| **C. Ballon 3D qui s'ouvre au clic → révèle le classement** | Ludique | Bon après animation | Moyen | Option V2 possible |

**Ma reco B :**
- Un **ballon 3D photoréaliste** (Three.js + texture cuir) qui tourne lentement au centre, éclairage studio, ombre douce. Au scroll, il recule légèrement (parallax).
- Le **classement** est une carte **glassmorphism** (verre dépoli + bord or) qui *flotte* devant le ballon, comme posée sur le terrain.
- Effet « stade de nuit » en arrière-plan (dégradé navy + projecteurs).
- Résultat : tu as le **3D classe** sans sacrifier la consultation du classement (l'objectif #1).

Tu valides B ? On peut ajouter une micro-interaction : clic sur le ballon = il rebondit et fait apparaître le prochain match.

---

## 3 — Proposition design (simple, efficace, élégant)

**Direction : Quiet Luxury Football**
- **Palette** : `#0A1628` (navy profond) · `#C8A96A` (or Bel Air) · `#EFF3F8` (blanc glace) · accent bleu `#2A5BD7`
- **Typo** : `Outfit` (titres) + `Inter` (tableau) — gratuite, élégante
- **Layout desktop-first** (comme demandé : *oublie d'adapter au format mobile* → on fait **beau sur grand écran**, adaptation mobile minimale non prioritaire)
  ```
  [Header fin : logo SB AF + "BEL AIR • U16 D2 — 2026/27" + LIVE pill]
  [Hero 3D : Ballon + titre "Le classement. Sans détour."]
  [Carte Classement : # | Club | Pts | J | G N P | Diff — ligne Bel Air surlignée or]
  [Bandeau "Prochain match" + "Dernier résultat"]
  [Footer : liens FFF / District Provence • MAJ manuelle]
  ```

- **Détails premium** : liseré or 1px, ombres douces, hover ligne = léger glow, chiffre Pts en gras or.

Mobile : on ne casse pas tout — le tableau reste scrollable horizontalement, mais pas de menu hamburger/design mobile poussé en V1 (respect de ta consigne).

---

## 4 — Stack & Repo public

**Repo à créer :** `https://github.com/sajomtech-commits/salon-bel-air-u16`
- Public, `main` → GitHub Pages (gratuit, instantané)
- Compte : **sajomtech-commits** (token déjà validé) — bien dans le git d'Amine

**Stack V1 (ultra-léger, pas besoin d'Astro) :**
- `Vite` + HTML/CSS/JS pur + `Three.js@0.160` (via CDN `importmap`)
- `data/u16-d2-2026-2027.json` : tableau classement
- `assets/` : logo vectorisé Salon Bel Air (à recréer propre si pas de SVG officiel)
- Déploiement : `gh-pages` via Action `deploy.yml` (push sur `main` = site en ligne en 30s)

Pourquoi pas Astro/React ? Pour un classement, le pur est plus rapide, plus beau, zéro build compliqué. On passera à Astro quand on aura 5 catégories.

---

## 5 — Données U16 — structure prête

```json
{
  "competition": "U16 Départemental 2 - Provence - 2026/27",
  "updated": "2026-09-27",
  "source": "District Provence FFF (PDF + FFF)",
  "teams": [
    { "pos": 1, "club": "Salon Bel Air Foot 22", "pts": 18, "j": 6, "g": 6, "n": 0, "p": 0, "bp": 22, "bc": 5, "diff": 17, "isBelAir": true },
    { "pos": 2, "club": "A.C. Port de Bouc 21", "pts": 12, ... }
  ]
}
```

En V1 on remplit avec le vrai classement du moment (je le récupère sur le dernier PDF District dès que tu valides). Mise à jour = éditer le JSON + `git push` → site à jour.

Évolution : petit script `tools/fetch-fff.mjs` qui tente de parser le PDF FFF automatiquement (optionnel).

---

## 6 — Architecture fichiers

```
salon-bel-air-u16/
├─ index.html          # hero 3D + tableau
├─ style.css           # glass + navy/gold
├─ app.js              # rendu tableau + Three.js ballon
├─ data/
│  └─ u16-d2-2026-2027.json
├─ assets/
│  ├─ logo-bel-air.svg
│  └─ ball-texture.jpg
├─ .github/workflows/deploy.yml
└─ README.md
```

---

## 7 — Roadmap évolutive (tu voulais ajouter les autres catégories)

**V1 — Maintenant (1 jour) :** Hero ballon 3D + classement U16 + Pages en ligne
**V2 — Semaine prochaine :** Onglets `U14 | U16 | U17 | U19 | Seniors` (même design, JSON par catégorie) + filtre saison
**V3 — Ensuite :** Page calendrier/résultats, fiche équipe, admin no-code (édition via GitHub directement ou petit CMS Decap)
**V4 — Bonus :** Mode « ballon qui s'ouvre » au clic, stats buteurs, partage Instagram auto

Chaque catégorie = 1 JSON, zéro refonte.

---

## 8 — Livraison & hébergement

- **URL finale :** `https://sajomtech-commits.github.io/salon-bel-air-u16/`
- **Coût :** 0€ (GitHub Pages)
- **MAJ classement :** 30 sec (éditer JSON + push)
- **SEO :** title `Salon Bel Air Foot — Classement U16 D2 2026/27 | Salon-de-Provence`

---

## 9 — Ce que j'attends de toi pour lancer

1. **Valides-tu le concept B (ballon hero + verre) vs ballon total ?** 
2. **Nom de repo ok : `salon-bel-air-u16` ?** Ou tu préfères `bel-air-salon-u16-classement` ?
3. **Mobile :** tu confirmes qu'on reste **desktop-first** (pas d'optimisation mobile poussée en V1) comme tu l'as écrit ? Ou tu voulais dire l'inverse (« n'oublie pas ») et on fait full responsive ?
4. **Logo :** as-tu un SVG/logo HD du Salon Bel Air Foot ? Sinon j'en recrée un minimal (SB AF + 1928) en or/navy.

Dès ton OK (même un « vasy B » suffit), je :
- crée le repo public dans `sajomtech-commits`,
- pousse le site 3D + premier JSON U16 avec données réelles,
- active GitHub Pages et te donne l'URL en direct.

---

*Prêt à shooter ?*
