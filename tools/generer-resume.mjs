#!/usr/bin/env node
/**
 * generer-resume.mjs — Générateur de résumé de match (Module 4 du plan).
 *
 * Le coach remplit `data/resume-input.json` (cases à cocher après le match),
 * puis l'Action GitHub `resume.yml` lance ce script :
 *  - Si la clé IA est configurée (secret GitHub IA_API_KEY) → vraie génération LLM.
 *  - Sinon → résumé "template" gratuit (fallback) à partir des réponses.
 * Le résultat est écrit dans data/actus/<slug>.json et ajouté au fil d'actualité.
 *
 * Usage : node tools/generer-resume.mjs
 * Env  : IA_API_KEY (openAI-compatible) · IA_BASE_URL (défaut DeepSeek) · IA_MODEL
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const INPUT = join(ROOT, 'data', 'resume-input.json');

const API_KEY = process.env.IA_API_KEY || process.env.DEEPSEEK_API_KEY;
const BASE_URL = process.env.IA_BASE_URL || 'https://api.deepseek.com/chat/completions';
const MODEL = process.env.IA_MODEL || 'deepseek-chat';

// Traduction des adjectifs pour le fallback
const ADJ = {
  'domination': 'les Salonnais ont dominé les débats',
  'combativite': 'les protégés de Salon ont fait preuve d\u2019une belle combativité',
  'collectif': 'c\u2019est un très beau collectif qui s\u2019est exprimé',
  'jeunesse': 'la jeunesse du groupe a fait la différence',
  'realisme': 'une efficacité et un réalisme remarquables',
  'mauvaise-competition': 'une soirée compliquée dans les duels',
  'frustration': 'un sentiment de frustration légitime',
};

function slugify(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function main() {
  if (!existsSync(INPUT)) {
    console.log('ℹ️ Pas de data/resume-input.json — rien à générer.');
    return;
  }
  const input = JSON.parse(readFileSync(INPUT, 'utf-8'));
  if (!input.actif) {
    console.log('ℹ️ resume-input actif=false — ignoré.');
    return;
  }
  const { categorie = 'U16', journee = '', domicile, adversaire = '?', scoreDomicile = 0, scoreExterieur = 0,
    buteurs = [], hommeDuMatch = '', adjectifs = [], commentaire = '' } = input;

  const club = domicile ? 'Salon Bel Air Foot' : adversaire;
  const autre = domicile ? adversaire : 'Salon Bel Air Foot';
  const score = ` ${scoreDomicile}-${scoreExterieur} `;
  const victoire = domicile ? scoreDomicile > scoreExterieur : scoreExterieur > scoreDomicile;
  const nul = scoreDomicile === scoreExterieur;

  let texte;
  if (API_KEY) {
    const prompt = `Rédige un petit article de presse sportive en français (4-6 phrases) pour le club amateur Salon Bel Air Foot.
Contexte : équipe ${categorie}, ${journee}, match ${club} ${score} ${autre}${domicile ? ' à domicile' : ' à l\'extérieur'}.
Buteurs : ${buteurs.join(', ') || 'non communiqués'}. Homme du match : ${hommeDuMatch || 'non communiqué'}.
Mots-clés : ${adjectifs.join(', ') || 'combativité'}. ${commentaire ? 'Note du coach : ' + commentaire : ''}
Titre accrocheur de 8-10 mots, puis texte. Réponds JSON {"titre":"...","texte":"..."}`;
    try {
      const r = await fetch(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7, max_tokens: 400,
        }),
      });
      const data = await r.json();
      const content = data?.choices?.[0]?.message?.content || '';
      const m = content.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        if (parsed.titre && parsed.texte) {
          texte = { titre: parsed.titre, texte: parsed.texte };
          console.log('✅ Résumé généré par IA (' + MODEL + ')');
        }
      }
    } catch (e) {
      console.warn('IA indisponible, fallback template :', e.message);
    }
  }

  if (!texte) {
    const adjTexte = adjectifs.map((a) => ADJ[a] || a).join(' ; ');
    const verbe = victoire ? "s'est imposé face à" : nul ? "a fait match nul contre" : "s'est incliné face à";
    const titre = `${victoire ? 'Victoire' : nul ? 'Match nul' : 'Défaite'} : ${club} ${score.trim()} ${autre}${
      victoire ? ' 🎉' : nul ? ' 🤝' : ' 💔'}`;
    texte = {
      titre,
      texte: `${categorie} — ${journee || 'journée'} : ${club} ${verbe} ${autre} sur le score de ${score.trim()}. ${
        adjTexte ? adjTexte.charAt(0).toUpperCase() + adjTexte.slice(1) + '. ' : ''
      }${buteurs.length ? 'Buts : ' + buteurs.join(', ') + '.' : ''}${
        hommeDuMatch ? ' Homme du match : ' + hommeDuMatch + '.' : ''}${commentaire ? ' ' + commentaire : ''}`,
    };
    console.log('✅ Résumé template généré (fallback)');
  }

  const now = new Date();
  const slug = slugify(`${categorie}-${journee || now.toISOString().slice(0, 10)}`);
  const outDir = join(ROOT, 'data', 'actus');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `${slug}.json`);
  writeFileSync(outFile, JSON.stringify({
    date: now.toISOString().slice(0, 10),
    categorie,
    titre: texte.titre,
    texte: texte.texte,
    emoji: victoire ? '⚽' : nul ? '🤝' : '💪',
  }, null, 2) + '\n');

  // désactive le flag pour éviter les générations en boucle
  input.actif = false;
  writeFileSync(INPUT, JSON.stringify(input, null, 2) + '\n');

  console.log(`✅ ${outFile}`);
}

main().catch((e) => { console.error('Erreur :', e.message); process.exit(1); });