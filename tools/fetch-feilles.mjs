#!/usr/bin/env node
/**
 * fetch-feilles.mjs — Scraper FEUILLE PAR FEUILLE des matchs de Salon Bel Air Foot.
 *
 * Justification : le site doit montrer un HISTORIQUE RÉEL et indiscutable, calculé
 * depuis les feuilles de match officielles FFF, pas des données génériques.
 *
 * Approche en 2 étapes :
 *   1. Lister toutes les URLs /competition/match/<id> (passés + futurs) : on part
 *      des IDs connus (seed + snapshot classement) et on scanne les IDs suivants
 *      (les IDs FFF sont séquentiels : 6 matchs/journée) jusqu'à trouver les
 *      matchs de Salon Bel Air (joués + à venir).
 *   2. Pour chaque match passé : parser la PAGE du match (SSR) et extraire :
 *        - score exact + stade/lieu + GPS + heure
 *        - composition complète (titulaires + remplaçants, numéros)
 *        - événements avec timing : buts?, remplacements, cartons
 *   3. AGRÉGATION SCIENTIFIQUE → data/stats_<cat>.json
 *        matchs_joues : +1 si titulaire OU entré en jeu (événement remplacement)
 *        jaunes/rouges : comptés sur les événements nominatifs
 *        buts/passes : la FFF ne publie PAS les buteurs pour les jeunes →
 *          champ buts rempli via data/staff-input.json (saisie coach), sinon 0.
 *
 * Usage : node tools/fetch-feilles.mjs --cat u16   (ou u19)
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const CATS = {
  u16: { libelle: 'U16', cpNo: '457249', seedIds: [79514105, 79514111, 79514115] },
  u19: { libelle: 'U19', cpNo: '457242', seedIds: [79379988, 79379990, 79379999] },
};

const argIdx = process.argv.indexOf('--cat');
const CAT_KEY = argIdx !== -1 ? process.argv[argIdx + 1] || 'u16' : 'u16';
const CAT = CATS[CAT_KEY];
if (!CAT) { console.error(`Catégorie inconnue : ${CAT_KEY}`); process.exit(1); }

const CLUB_CIBLE = 'SALON BEL AIR FOOT';
const OUT = join(ROOT, 'data', `stats_${CAT_KEY}.json`);
const OUT_MATCHS = join(ROOT, 'data', `feuilles_${CAT_KEY}.json`);

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function hdrs() {
  return {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    'Sec-CH-UA': '"Chromium";v="126", "Google Chrome";v="126", "Not.A/Brand";v="24"',
    'Sec-CH-UA-Mobile': '?0', 'Sec-CH-UA-Platform': '"macOS"',
    'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none', 'Sec-Fetch-User': '?1', 'Upgrade-Insecure-Requests': '1',
  };
}
const attente = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(url) {
  const res = await fetch(url, { headers: hdrs() });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await res.text();
}
function extractNgState(html) {
  const m = html.match(/<script[^>]*id="ng-state"[^>]*>\s*(.*?)<\/script>/s);
  if (!m) throw new Error('ng-state absent');
  return JSON.parse(
    m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  );
}
function stateValue(ng, suffix) {
  const key = Object.keys(ng).find((k) => k.includes(suffix));
  if (!key) return null;
  const e = ng[key];
  return e && typeof e === 'object' && 'body' in e ? e.body : e;
}
const num = (v) => { const n = parseInt(v, 10); return Number.isNaN(n) ? 0 : n; };
function nomJoueur(j) { return `${j?.prenom || ''} ${j?.nom || ''}`.trim(); }

/* ------------------------------------------------------------------ */
/* ÉTAPE 2 : parser une feuille de match (composition + événements)    */
/* ------------------------------------------------------------------ */
async function parseFeuille(matchId) {
  try {
    const html = await fetchPage(`https://epreuves.fff.fr/competition/match/${matchId}`);
    const state = extractNgState(html);
    const body = stateValue(state, `/matches/${matchId}`);
    if (!body) return null;
    const df = body.donneesFormatees || body;

    // infos générales
    const recevant = df.recevant || {}, visiteur = df.visiteur || {};
    const nomR = (recevant.club || {}).nom || '';
    const nomV = (visiteur.club || {}).nom || '';
    const sbaDomicile = nomR.toUpperCase().includes(CLUB_CIBLE.toUpperCase());
    const sbaPresent = sbaDomicile || nomV.toUpperCase().includes(CLUB_CIBLE.toUpperCase());
    if (!sbaPresent) return null;

    const stade = df.stade || {};
    const joue = !!df.joue;
    const score =
      joue && recevant.buts != null && visiteur.buts != null
        ? `${recevant.buts} — ${visiteur.buts}`
        : null;

    // composition du club cible (titulaires + remplaçants)
    const compo = [];
    for (const side of ['recevant', 'visiteur']) {
      const adv = side === 'recevant' ? recevant : visiteur;
      const clubSide = (adv.club || {}).nom || '';
      if (clubSide.toUpperCase().includes(CLUB_CIBLE.toUpperCase())) {
        for (const p of adv.composition || []) {
          compo.push({
            inNo: p.inNo ?? null,
            numero: p.maillot ?? null,
            prenom: (p.prenom || '').trim(),
            nom: (p.nom || '').trim(),
            type: p.type === 'remplacant' ? 'remplaçant' : 'titulaire',
            momentsForts: p.momentsForts || [],
          });
        }
      }
    }

    // événements du match (timing)
    const evenements = (df.momentsForts || []).map((e) => {
      const isSBA = e.clubType === (sbaDomicile ? 'recevant' : 'visiteur');
      return {
        minute: e.minute ?? null,
        type: e.type ?? null,
        joueur: nomJoueur(e.joueur),
        remplacant: e.remplacant ? nomJoueur(e.remplacant) : null,
        entrant: e.remplacant ? nomJoueur(e.remplacant) : null,
        sortant: e.joueur ? nomJoueur(e.joueur) : null,
        sba: isSBA,
        clubAdverse: isSBA ? null : nomJoueur(e.joueur),
        typeSanction: e.typeSanction ?? null,
      };
    });

    return {
      id: `match_${matchId}`,
      maNo: matchId,
      journee: df.journee?.pjNo != null ? `J${df.journee.pjNo}` : null,
      date: df.date,
      score,
      joue,
      domicile: sbaDomicile,
      adversaire: sbaDomicile ? nomV : nomR,
      stade: stade.nom || null,
      gps: stade.lat != null && (stade.long != null || stade.lon != null)
        ? `${stade.lat},${stade.long ?? stade.lon}`
        : null,
      heure: df.date
        ? new Date(df.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : null,
      composition: compo,
      evenements,
    };
  } catch (e) {
    console.warn(`  (feuille ${matchId} indisponible : ${e.message})`);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* AGRÉGATION SCIENTIFIQUE                                            */
/* ------------------------------------------------------------------ */
function agreger(feuilles) {
  const stats = new Map(); // key: inNo|prenom nom → {…}
  const cle = (j) => `${j.inNo ?? ''}|${j.prenom} ${j.nom}`;

  for (const f of feuilles) {
    if (!f.joue || !f.score) continue;
    const joueursDejaComptes = new Set();

    // qui est entré en jeu ? (titulaires + remplaçants ayant un événement remplacement "entrant")
    const entrants = new Set(
      f.evenements.filter((e) => e.type === 'remplacement' && e.sba && e.entrant).map((e) => e.entrant)
    );

    for (const p of f.composition) {
      const joueLeMatch =
        p.type === 'titulaire' ||
        entrants.has(`${p.prenom} ${p.nom}`) ||
        (p.momentsForts || []).some((m) => m === 'remplacement');
      if (!joueLeMatch) continue; // remplaçant jamais entré → 0 match

      const key = cle(p);
      const cur = stats.get(key) || {
        nom: `${p.prenom} ${p.nom}`.trim(),
        numero: p.numero,
        matchs_joues: 0, buts: 0, passes: 0, jaunes: 0, rouges: 0,
      };
      cur.matchs_joues += 1;
      stats.set(key, cur);
    }

    // cartons nominatifs depuis les événements
    for (const e of f.evenements) {
      if (!e.sba) continue;
      if (e.type === 'carton-jaune' && e.joueur) {
        // retrouver le joueur par nom
        for (const [key, cur] of stats) {
          if (cur.nom === e.joueur) { cur.jaunes += 1; break; }
        }
      } else if (e.type === 'carton-rouge' && e.joueur) {
        for (const [key, cur] of stats) {
          if (cur.nom === e.joueur) { cur.rouges += 1; break; }
        }
      }
    }
  }

  return [...stats.values()].sort((a, b) => b.matchs_joues - a.matchs_joues || a.nom.localeCompare(b.nom));
}

/* ------------------------------------------------------------------ */
/* ÉTAPE 1 : lister les matchs (scan séquentiel autour des seeds)      */
/* ------------------------------------------------------------------ */
async function main() {
  console.log(`→ Scraping feuilles par feuille (${CAT.libelle})…`);

  // charger les IDs déjà connus (mémoire : feuilles_<cat>.json) — les seeds
  // restent TOUJOURS incluses (elles recouvrent les matchs joués du début)
  let idsConnus = new Set(CAT.seedIds);
  if (existsSync(OUT_MATCHS)) {
    try {
      for (const f of JSON.parse(readFileSync(OUT_MATCHS, 'utf-8'))) if (f.maNo) idsConnus.add(f.maNo);
    } catch (_) { /* ignore */ }
  }

  // Étape 1 : compléter la liste des URLs. On part des IDs connus et on scanne
  // les IDs suivants jusqu'à +24 (les matchs futurs sont déjà publiés) sauf si
  // on a déjà les 2 prochaines journées.
  let base = idsConnus.size ? Math.max(...idsConnus) : 0;
  const scanJusqua = base + 24;
  let futuresTrouvees = 0;
  for (let id = base + 1; id <= scanJusqua; id++) {
    if (idsConnus.has(id)) continue;
    const f = await parseFeuille(id);
    if (f) {
      idsConnus.add(id);
      if (!f.joue) futuresTrouvees++;
      else console.log(`  ✓ feuille ${id} jouée (${f.adversaire} ${f.score})`);
      if (!f.joue && futuresTrouvees >= 2 && base > 0) break;
    }
    await attente(180);
  }

  // Étape 2 : re-parser CHAQUE match joué/futur avec retry (rate-limit FFF)
  const feuilles = [];
  for (const id of idsConnus) {
    let f = null;
    for (let essai = 0; essai < 3 && !f; essai++) {
      f = await parseFeuille(id);
      if (!f) await attente(400);
    }
    if (f) feuilles.push(f);
    await attente(140);
  }
  const jouees = feuilles.filter((f) => f.joue && f.score);
  const futures = feuilles.filter((f) => !f.joue);

  console.log(`  ${jouees.length} matchs joués · ${futures.length} à venir`);

  // AGRÉGATION réelle
  const effectif = agreger(jouees);

  // Fusion avec staff-input.json → buts/passes (la FFF ne les publie pas)
  const staffFile = join(ROOT, 'data', 'staff-input.json');
  if (existsSync(staffFile)) {
    try {
      const staff = JSON.parse(readFileSync(staffFile, 'utf-8'));
      for (const s of staff.joueurs || []) {
        const nomS = `${s.prenom || ''} ${s.nom || ''}`.trim().toUpperCase();
        // priorité 1 : matching par numéro de maillot quand fourni (désambiguïse
        // les homonymes LUCAS B. #5 vs #9) ; sinon par nom complet
        const found =
          (s.numero != null && effectif.find((j) => j.nom.toUpperCase() === nomS && j.numero === s.numero)) ||
          effectif.find((j) => j.nom.toUpperCase() === nomS);
        if (found) { found.buts = s.buts ?? 0; found.passes = s.passes ?? 0; }
        else if ((s.buts ?? 0) > 0) {
          // joueur signalé par le coach mais absent des feuilles : on le crée
          effectif.push({
            nom: `${s.prenom || ''} ${s.nom || ''}`.trim(),
            numero: s.numero ?? null,
            matchs_joues: s.matchs_joues ?? 0, buts: s.buts ?? 0,
            passes: s.passes ?? 0, jaunes: s.cartons_jaunes ?? 0, rouges: s.cartons_rouges ?? 0,
          });
        }
      }
    } catch (_) { /* ignore */ }
  }

  // sortie strictement conforme au brief §3
  const statsOut = {
    categorie: CAT.libelle,
    saison: '2026/27',
    calcul: 'feuilles de match officielles FFF (composition + événements), cumul par match joué',
    maj: new Date().toISOString(),
    effectif: effectif.map((j) => ({
      nom: j.nom, matchs_joues: j.matchs_joues, buts: j.buts,
      passes: j.passes, jaunes: j.jaunes, rouges: j.rouges,
    })),
  };
  writeFileSync(OUT, JSON.stringify(statsOut, null, 2) + '\n');
  writeFileSync(OUT_MATCHS, JSON.stringify(feuilles, null, 2) + '\n');

  console.log(`\n✅ ${OUT}`);
  console.log(`   ${effectif.length} joueurs agrégés`);
  for (const j of effectif.filter((x) => x.matchs_joues > 0).slice(0, 12)) {
    console.log(`   ${j.nom.padEnd(14)} J${j.matchs_joues} B${j.buts} P${j.passes} 🟨${j.jaunes} 🟥${j.rouges}`);
  }
  console.log(`✅ ${OUT_MATCHS} (${jouees.length} feuilles jouées + ${futures.length} futures)`);
}

main().catch((e) => { console.error('Erreur :', e.message); process.exit(1); });