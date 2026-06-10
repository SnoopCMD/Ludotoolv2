/**
 * Génère un fichier SQL pour restaurer les retours à la ligne dans le champ `contenu`
 * de la table `catalogue` dans Cloudflare D1.
 *
 * Source : Supabase (données correctes avec \n)
 * Cible  : Cloudflare D1 (données dégradées sans \n après migration)
 *
 * Usage :
 *   node scripts/fix_contenu_d1.mjs
 *   CLOUDFLARE_API_TOKEN=xxx npx wrangler d1 execute ludotool-db --file=scripts/fix_contenu_d1.sql --remote
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://tpaofmsnlkhqruohsnvk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_PruZG4nS0LjVZf7mhW0Gqg_KJq29-_B';

function escapeSql(str) {
  if (str === null || str === undefined) return 'NULL';
  return "'" + str.replace(/'/g, "''") + "'";
}

async function main() {
  console.log('Récupération des données depuis Supabase...');

  const allRows = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/catalogue?select=ean,contenu&contenu=not.is.null&contenu=neq.&offset=${offset}&limit=${pageSize}`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': SUPABASE_ANON_KEY, 'Range-Unit': 'items', 'Range': `${offset}-${offset + pageSize - 1}` } }
    );
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    allRows.push(...data);
    console.log(`  Récupéré ${allRows.length} lignes...`);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  // Filtrer uniquement ceux qui ont de vrais \n (les données correctes)
  const rowsWithNewlines = allRows.filter(r => r.contenu && r.contenu.includes('\n'));
  console.log(`\n${rowsWithNewlines.length} enregistrements avec \\n à restaurer dans D1.`);

  const sqlLines = rowsWithNewlines.map(row =>
    `UPDATE catalogue SET contenu = ${escapeSql(row.contenu)} WHERE ean = ${escapeSql(row.ean)};`
  );

  const sqlContent = sqlLines.join('\n') + '\n';
  const outputPath = join(__dirname, 'fix_contenu_d1.sql');
  writeFileSync(outputPath, sqlContent, 'utf8');

  console.log(`\nFichier SQL généré : ${outputPath}`);
  console.log(`\nPour appliquer à D1 :`);
  console.log(`  CLOUDFLARE_API_TOKEN=<ton_token> npx wrangler d1 execute ludotool-db --file=scripts/fix_contenu_d1.sql --remote`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
