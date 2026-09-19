// Import en lot des PDF de règles depuis Philibert, pour tous les jeux du
// catalogue sans pdf_url. Tout le travail (recherche, téléchargement, R2, base)
// est fait par le Worker via POST /api/regles/philibert : ce script ne fait
// qu'enchaîner les appels, doucement, pour rester poli avec Philibert.
//
// Relançable sans risque : les jeux déjà renseignés sont ignorés côté serveur.
//
//   node scripts/importer_regles_philibert.mjs                 # production
//   node scripts/importer_regles_philibert.mjs --base http://localhost:3000
//   node scripts/importer_regles_philibert.mjs --limite 50     # pour essayer
//   node scripts/importer_regles_philibert.mjs --pause 1500    # ms entre deux jeux

const args = process.argv.slice(2);
const opt = (nom, defaut) => { const i = args.indexOf(`--${nom}`); return i >= 0 ? args[i + 1] : defaut; };
const BASE = opt('base', 'https://ludotool.t-coumond.workers.dev').replace(/\/$/, '');
const LIMITE = Number(opt('limite', 0));
const PAUSE = Number(opt('pause', 1000));

const dormir = (ms) => new Promise(r => setTimeout(r, ms));

const catalogue = await fetch(`${BASE}/api/catalogue?fields=ean,nom,pdf_url`).then(r => r.json());
if (!Array.isArray(catalogue)) { console.error('Catalogue illisible :', catalogue); process.exit(1); }

let aFaire = catalogue.filter(j => !j.pdf_url && /^\d{8,14}$/.test(String(j.ean)));
if (LIMITE) aFaire = aFaire.slice(0, LIMITE);
console.log(`${catalogue.length} fiches, ${aFaire.length} sans règle à traiter (base ${BASE})\n`);

const bilan = { importe: 0, introuvable: 0, telechargement_impossible: 0, deja: 0, erreur: 0 };
const debut = Date.now();

for (let i = 0; i < aFaire.length; i++) {
  const { ean, nom } = aFaire[i];
  const prefixe = `[${String(i + 1).padStart(4)}/${aFaire.length}] ${nom}`;
  let res;
  try {
    res = await fetch(`${BASE}/api/regles/philibert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ean, nom }),
      signal: AbortSignal.timeout(120000),
    }).then(r => r.json());
  } catch (e) {
    res = { error: e.message };
  }
  if (res.error) { bilan.erreur++; console.log(`${prefixe} — ERREUR ${res.error}`); }
  else {
    bilan[res.statut] = (bilan[res.statut] || 0) + 1;
    const detail = res.statut === 'importe' ? `✓ ${res.libelle} (${(res.taille / 1048576).toFixed(1)} Mo)`
      : res.statut === 'telechargement_impossible' ? `⚠ trouvé mais non téléchargé : ${res.source}`
      : res.statut === 'introuvable' ? '✗' : res.statut;
    console.log(`${prefixe} — ${detail}`);
  }
  await dormir(PAUSE);
}

const minutes = ((Date.now() - debut) / 60000).toFixed(1);
console.log(`\nTerminé en ${minutes} min :`, bilan);
