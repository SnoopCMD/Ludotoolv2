/**
 * Calendrier mensuel imprimable (A4 paysage, noir et blanc), généré depuis
 * l'agenda. La page agenda prépare le contenu de chaque jour ; ce module ne
 * fait que la mise en page. Sans couleur, ce sont les formes qui distinguent :
 * événements en cartouches avec l'horaire en pastille noire, absences en
 * pastilles grises pointillées, fériés en négatif, horaires de l'équipe en bas.
 *
 * Une cellule chargée réduit sa police plutôt que de déborder : la feuille
 * doit tenir sur une page par mois.
 */

export type JourCalendrier = {
  dateKey: string;
  dansLeMois: boolean;
  ferie: string | null;
  /** Fermetures exceptionnelles du jour : horaire et/ou motif, vide pour une journée entière sans motif. */
  fermetures: string[];
  vacances: string[];
  presences: { horaire: string; noms: string[] }[];
  evenements: { horaire: string | null; type: string; titre: string; qui: string | null }[];
  absences: { type: string; horaire: string | null; noms: string[] }[];
};

/** `jours` : noms des colonnes affichées (lundi et dimanche peuvent être retirés). */
export type MoisCalendrier = { titre: string; jours: string[]; semaines: JourCalendrier[][] };

const echapper = (t: string) =>
  t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** « 09:00–17:00 » → « 9h–17h », « 13:30 » → « 13h30 » : plus court à l'impression. */
export const heureCourte = (t: string) => {
  const [h, m] = t.split(':');
  return `${Number(h)}h${m && m !== '00' ? m : ''}`;
};

/** Libellés courts des types de l'agenda, écrits devant chaque événement. */
const ETIQUETTES: Record<string, string> = {
  'Animation': 'Anim.',
  'Soirée Jeux': 'Soirée',
  'Réunion': 'Réunion',
  'Heures Exceptionnelles': 'H. supp.',
  'Sortie': 'Sortie',
  'Partenariat': 'Partenariat',
};

/**
 * Titre sans ce qui répète le type (« Réunion Organisation » sous l'étiquette
 * RÉUNION devient « Organisation ») ni l'horaire déjà écrit en tête.
 */
function titreCourt(type: string, titre: string) {
  let t = titre.replace(/\s*\(planning [^)]*\)/, '').trim();
  if (t.toLowerCase() === type.toLowerCase()) return '';
  // Les heures supp. posées depuis le planning s'intitulent « Heures supp. » : l'étiquette suffit.
  if (type === 'Heures Exceptionnelles') t = t.replace(/^heures? supp?\.?(lémentaires)?\s*/i, '');
  // Le type entier d'abord (« Soirée jeux 5 fév. » → « 5 fév. »), sinon son premier mot.
  for (const debut of [type, type.split(' ')[0]]) {
    if (t.toLowerCase().startsWith(debut.toLowerCase() + ' ')) { t = t.slice(debut.length).replace(/^[\s:–-]+/, ''); break; }
  }
  return t;
}

/**
 * Lignes qu'occupera une case, retours à la ligne compris. `parLigne` :
 * caractères par ligne à la taille de base, selon la largeur des colonnes.
 */
function lignesEstimees(j: JourCalendrier, parLigne: number) {
  const n = (texte: string) => Math.max(1, Math.ceil(texte.length / parLigne));
  return (j.ferie || j.fermetures.length || j.vacances.length ? 1.3 : 0)
    // Un cartouche : sa ligne d'en-tête (horaire, type), puis le titre, plus son cadre.
    + j.evenements.reduce((t, e) => t + 1.5 + n(`${titreCourt(e.type, e.titre)} · ${e.qui ?? ''}`), 0)
    + j.absences.reduce((t, a) => t + 0.3 + n(`${a.type} ${a.horaire ?? ''} ${a.noms.join(', ')}`), 0)
    + j.presences.reduce((t, p) => t + n(`${p.horaire} ${p.noms.join(', ')}`) * 0.95, 0)
    + (j.presences.length ? 0.6 : 0);
}

/** Hauteur d'une ligne de texte à la taille de base, en mm. */
const LIGNE_MM = 3.2;
/** Hauteur de la grille (toutes les semaines), et minimum pour une semaine presque vide. */
const GRILLE_MM = 164;
const SEMAINE_MIN_MM = 15;

/**
 * Hauteur de chaque semaine : proportionnelle à son jour le plus chargé, pour
 * qu'une semaine débordant sur le mois voisin (souvent vide) laisse sa place
 * aux semaines pleines. La somme fait toujours GRILLE_MM.
 */
function hauteursSemaines(semaines: JourCalendrier[][], parLigne: number) {
  const besoins = semaines.map(s => Math.max(SEMAINE_MIN_MM,
    5 + LIGNE_MM * Math.max(0, ...s.filter(j => j.dansLeMois).map(j => lignesEstimees(j, parLigne)))));
  const total = besoins.reduce((a, b) => a + b, 0);
  return besoins.map(b => (b / total) * GRILLE_MM);
}

function cellule(j: JourCalendrier, hauteurMm: number, parLigne: number) {
  const numero = Number(j.dateKey.slice(8));
  const style = `style="height:${hauteurMm.toFixed(1)}mm"`;
  if (!j.dansLeMois) return `<td class="hors"><div class="in" ${style}><div class="num">${numero}</div></div></td>`;
  // Plus la case est pleine, plus la police diminue (d1 → d3) ; l'ajustement mesuré finit le travail.
  const charge = lignesEstimees(j, parLigne) / ((hauteurMm - 4) / LIGNE_MM);
  const densite = charge > 1.18 ? 'd3' : charge > 1.06 ? 'd2' : charge > 0.95 ? 'd1' : '';

  const tete: string[] = [];
  if (j.ferie) tete.push(`<span class="pill ferie">${echapper(j.ferie)}</span>`);
  for (const f of j.fermetures) tete.push(`<span class="pill ferie">Fermé${f ? ` · ${echapper(f)}` : ''}</span>`);
  if (j.vacances.length) tete.push(`<span class="pill vac">Vacances ${j.vacances.map(z => z.replace('Zone ', '')).join('·')}</span>`);

  const corps: string[] = [];
  for (const e of j.evenements) {
    const court = e.titre ? titreCourt(e.type, e.titre) : '';
    corps.push(`<div class="ev">`
      + `<div class="ev-tete">${e.horaire ? `<span class="heure">${e.horaire}</span>` : ''}<span class="type">${echapper(ETIQUETTES[e.type] ?? e.type)}</span></div>`
      + (court || e.qui ? `<div class="ev-titre">${echapper(court)}${e.qui ? ` <span class="qui">${court ? '· ' : ''}${echapper(e.qui)}</span>` : ''}</div>` : '')
      + `</div>`);
  }
  for (const a of j.absences) {
    corps.push(`<div class="pill abs"><b>${echapper(a.type)}${a.horaire ? ` ${a.horaire}` : ''}</b> ${echapper(a.noms.join(', '))}</div>`);
  }
  const pres = j.presences.length
    ? `<div class="pres">${j.presences.map(p => `<div><span class="heure-pres">${p.horaire}</span>${echapper(p.noms.join(', '))}</div>`).join('')}</div>`
    : '';
  // La case a une hauteur fixe : un jour très chargé est rogné plutôt que de pousser le mois sur deux pages.
  return `<td class="${densite}"><div class="in" ${style}>`
    + `<div class="tete"><div class="pills">${tete.join('')}</div><div class="num">${numero}</div></div>`
    + corps.join('') + pres
    + `</div></td>`;
}

export function construireCalendrierHTML(mois: MoisCalendrier[]): string {
  const pages = mois.map(m => {
    // ~36 caractères par ligne avec 7 colonnes, davantage quand il y en a moins.
    const parLigne = Math.round(36 * 7 / m.jours.length);
    const hauteurs = hauteursSemaines(m.semaines, parLigne);
    const [nomMois, annee] = m.titre.split(' ');
    return `
    <section class="page">
      <header>
        <h1>${echapper(nomMois)} <span class="annee">${echapper(annee ?? '')}</span></h1>
        <div class="legende">
          <span class="ex-ev"><span class="heure">14h</span><span class="type">Anim.</span></span> événement
          <span class="pill abs ex"><b>Congé</b> absence</span>
          <span><span class="heure-pres">9h–18h</span>horaires de l’équipe</span>
        </div>
      </header>
      <table class="cal">
        <thead><tr>${m.jours.map(j => `<th>${j}</th>`).join('')}</tr></thead>
        <tbody>${m.semaines.map((s, i) => `<tr>${s.map(j => cellule(j, hauteurs[i], parLigne)).join('')}</tr>`).join('')}</tbody>
      </table>
    </section>`;
  }).join('');

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Calendrier Ludothèque</title>
<style>
@page{size:A4 landscape;margin:8mm}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;padding:0;background:#fff;color:#111}
/* Largeur de la feuille (A4 paysage moins les marges), aussi à l'écran : l'ajustement des cases mesure la mise en page réelle. */
body{font-family:Arial,Helvetica,sans-serif;font-size:7.6pt;line-height:1.25;width:281mm}
.page{height:193mm;overflow:hidden;page-break-after:always;break-after:page}
.page:last-child{page-break-after:auto;break-after:auto}
header{display:flex;align-items:flex-end;gap:12px;margin-bottom:2.2mm}
h1{margin:0;font-size:22pt;font-weight:900;letter-spacing:-.01em;text-transform:capitalize;line-height:1}
h1 .annee{font-weight:300;color:#666}
.legende{margin-left:auto;display:flex;gap:10px;align-items:center;font-size:6.8pt;color:#444}
.legende .ex-ev{display:inline-flex;gap:2px;align-items:center;border:.8px solid #111;border-radius:2mm;padding:.4mm .8mm}
/* Espacement entre cases ; la marge négative aligne la grille sur les bords de la page. */
table.cal{width:calc(100% + 2.2mm);border-collapse:separate;border-spacing:1.1mm;table-layout:fixed;margin:0 -1.1mm}
table.cal th{font-size:7pt;font-weight:800;text-transform:uppercase;letter-spacing:.1em;padding:1.2mm 1mm;background:#111;color:#fff;border-radius:1.8mm}
table.cal td{border:1px solid #111;border-radius:2.2mm;vertical-align:top;padding:0;background:#fff}
td .in{padding:1mm 1.3mm;overflow:hidden}
td.hors{border:1px dashed #c8c8c8;background:#fafafa}
.tete{display:flex;align-items:flex-start;gap:1mm;margin-bottom:.8mm}
.tete .pills{flex:1;display:flex;flex-wrap:wrap;gap:.8mm}
.num{font-size:12pt;font-weight:900;line-height:1;margin-left:auto}
td.hors .num{color:#c4c4c4;font-weight:400;font-size:10pt}
.pill{display:inline-block;border-radius:5mm;padding:.15mm 1.6mm;font-size:.84em;line-height:1.35}
.ferie{background:#111;color:#fff;font-weight:900;text-transform:uppercase;letter-spacing:.04em}
.vac{border:.8px solid #111;text-transform:uppercase;letter-spacing:.05em;font-weight:700;background:#f1f1f1}
.ev{border:.8px solid #111;border-radius:1.8mm;padding:.5mm .9mm .6mm;margin-bottom:.8mm;background:#fff}
.ev-tete{display:flex;align-items:center;gap:1mm;flex-wrap:wrap}
.heure{background:#111;color:#fff;border-radius:3mm;padding:0 1.2mm;font-weight:800;font-size:.9em;white-space:nowrap}
.type{font-weight:900;text-transform:uppercase;letter-spacing:.06em;font-size:.82em}
.ev-titre{margin-top:.2mm;font-weight:600}
.qui{font-weight:400;color:#555}
.abs{display:block;border:.8px dashed #555;background:#ececec;font-style:italic;margin-bottom:.8mm;border-radius:3mm}
.abs b{font-style:normal;font-weight:800}
.legende .abs{display:inline-block;margin:0}
.pres{margin-top:1mm;padding-top:.8mm;border-top:.8px dotted #888;color:#333;font-size:.92em;display:flex;flex-direction:column;gap:.5mm}
.heure-pres{display:inline-block;background:#e4e4e4;border-radius:3mm;padding:0 1.1mm;margin-right:1mm;font-weight:800;color:#111;white-space:nowrap}
td.d1{font-size:7pt} td.d2{font-size:6.4pt} td.d3{font-size:5.8pt}
</style></head><body>${pages}
<script>
// Ajustement final, mesuré : une case qui déborde encore perd un peu de taille
// de police jusqu'à tout contenir (5 pt au minimum). L'estimation par case
// ne fait que donner un point de départ.
document.querySelectorAll('td .in').forEach(function (el) {
  var taille = parseFloat(getComputedStyle(el).fontSize);
  while (el.scrollHeight > el.clientHeight + 1 && taille > 6.7) {
    taille -= 0.25;
    el.style.fontSize = taille + 'px';
  }
});
</script></body></html>`;
}
