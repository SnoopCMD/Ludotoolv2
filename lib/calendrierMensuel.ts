/**
 * Calendrier mensuel imprimable (A4 paysage, noir et blanc), généré depuis
 * l'agenda. La page agenda prépare le contenu de chaque jour ; ce module ne
 * fait que la mise en page, sans couleur : le type d'un événement est écrit en
 * toutes lettres, les absences sont en italique, les fériés en négatif.
 *
 * Une cellule chargée réduit sa police plutôt que de déborder : la feuille
 * doit tenir sur une page par mois.
 */

export type JourCalendrier = {
  dateKey: string;
  dansLeMois: boolean;
  ferie: string | null;
  vacances: string[];
  presences: { horaire: string; noms: string[] }[];
  evenements: { horaire: string | null; type: string; titre: string; qui: string | null }[];
  absences: { type: string; horaire: string | null; noms: string[] }[];
};

export type MoisCalendrier = { titre: string; semaines: JourCalendrier[][] };

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
 * Lignes qu'occupera une case, retours à la ligne compris (environ 36
 * caractères par ligne dans une colonne, à la taille de base).
 */
function lignesEstimees(j: JourCalendrier) {
  const n = (texte: string) => Math.max(1, Math.ceil(texte.length / 36));
  return (j.ferie || j.vacances.length ? 1 : 0)
    + j.evenements.reduce((t, e) => t + n(`${e.horaire ?? ''} ${ETIQUETTES[e.type] ?? e.type} ${titreCourt(e.type, e.titre)} (${e.qui ?? ''})`), 0)
    + j.absences.reduce((t, a) => t + n(`${a.type} ${a.horaire ?? ''} : ${a.noms.join(', ')}`), 0)
    + j.presences.reduce((t, p) => t + n(`${p.horaire} ${p.noms.join(', ')}`) * 0.9, 0)
    + (j.presences.length ? 0.4 : 0);
}

/** Hauteur d'une ligne de texte à la taille de base, en mm. */
const LIGNE_MM = 3.2;
/** Hauteur de la grille (toutes les semaines), et minimum pour une semaine presque vide. */
const GRILLE_MM = 168;
const SEMAINE_MIN_MM = 15;

/**
 * Hauteur de chaque semaine : proportionnelle à son jour le plus chargé, pour
 * qu'une semaine débordant sur le mois voisin (souvent vide) laisse sa place
 * aux semaines pleines. La somme fait toujours GRILLE_MM.
 */
function hauteursSemaines(semaines: JourCalendrier[][]) {
  const besoins = semaines.map(s => Math.max(SEMAINE_MIN_MM,
    4 + LIGNE_MM * Math.max(0, ...s.filter(j => j.dansLeMois).map(lignesEstimees))));
  const total = besoins.reduce((a, b) => a + b, 0);
  return besoins.map(b => (b / total) * GRILLE_MM);
}

function cellule(j: JourCalendrier, hauteurMm: number) {
  const numero = Number(j.dateKey.slice(8));
  const style = `style="height:${hauteurMm.toFixed(1)}mm"`;
  if (!j.dansLeMois) return `<td class="hors"><div class="in" ${style}><div class="num">${numero}</div></div></td>`;
  // Plus la case est pleine, plus la police diminue (d1 → d3) ; l'ajustement mesuré finit le travail.
  const charge = lignesEstimees(j) / ((hauteurMm - 3) / LIGNE_MM);
  const densite = charge > 1.18 ? 'd3' : charge > 1.06 ? 'd2' : charge > 0.95 ? 'd1' : '';
  const lignes: string[] = [];
  if (j.ferie) lignes.push(`<div class="ferie">${echapper(j.ferie)}</div>`);
  if (j.vacances.length) lignes.push(`<div class="vac">Vacances ${j.vacances.map(z => z.replace('Zone ', '')).join('·')}</div>`);
  for (const e of j.evenements) {
    const etiquette = ETIQUETTES[e.type] ?? e.type;
    const court = e.titre ? titreCourt(e.type, e.titre) : '';
    const titre = court ? ` ${echapper(court)}` : '';
    lignes.push(`<div class="ev">${e.horaire ? `<b>${e.horaire}</b> ` : ''}<span class="type">${echapper(etiquette)}</span>${titre}${e.qui ? ` <span class="qui">(${echapper(e.qui)})</span>` : ''}</div>`);
  }
  for (const a of j.absences) {
    lignes.push(`<div class="abs">${echapper(a.type)}${a.horaire ? ` ${a.horaire}` : ''} : ${echapper(a.noms.join(', '))}</div>`);
  }
  if (j.presences.length) {
    lignes.push(`<div class="pres">${j.presences.map(p => `<div><b>${p.horaire}</b> ${echapper(p.noms.join(', '))}</div>`).join('')}</div>`);
  }
  // La case a une hauteur fixe : un jour très chargé est rogné plutôt que de pousser le mois sur deux pages.
  return `<td class="${densite}"><div class="in" ${style}><div class="num">${numero}</div>${lignes.join('')}</div></td>`;
}

export function construireCalendrierHTML(mois: MoisCalendrier[]): string {
  const jours = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const pages = mois.map(m => {
    const hauteurs = hauteursSemaines(m.semaines);
    return `
    <section class="page">
      <header><h1>${echapper(m.titre)}</h1><span class="legende">Anim. animation · Soirée soirée jeux · H. supp. heures exceptionnelles · <i>italique</i> absences · en bas : horaires de l’équipe</span></header>
      <table class="cal">
        <thead><tr>${jours.map(j => `<th>${j}</th>`).join('')}</tr></thead>
        <tbody>${m.semaines.map((s, i) => `<tr>${s.map(j => cellule(j, hauteurs[i])).join('')}</tr>`).join('')}</tbody>
      </table>
    </section>`;
  }).join('');

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Calendrier Ludothèque</title>
<style>
@page{size:A4 landscape;margin:8mm}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff;color:#000}
/* Largeur de la feuille (A4 paysage moins les marges), aussi à l'écran : l'ajustement des cases mesure la mise en page réelle. */
body{font-family:Arial,Helvetica,sans-serif;font-size:7.6pt;line-height:1.22;width:281mm}
.page{height:193mm;overflow:hidden;page-break-after:always;break-after:page}
.page:last-child{page-break-after:auto;break-after:auto}
header{display:flex;align-items:baseline;gap:10px;border-bottom:2px solid #000;padding-bottom:2mm;margin-bottom:2mm}
h1{margin:0;font-size:17pt;text-transform:uppercase;letter-spacing:.03em}
.legende{font-size:6.8pt;color:#333;margin-left:auto}
table.cal{width:100%;border-collapse:collapse;table-layout:fixed}
table.cal th{font-size:7.5pt;text-transform:uppercase;letter-spacing:.06em;border:1.2px solid #000;padding:1mm;background:#000;color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
table.cal td{border:1px solid #000;vertical-align:top;padding:0}
td .in{padding:0.8mm 1.2mm;overflow:hidden}
td .num{font-size:11pt;font-weight:900;float:right;line-height:1;margin:0 0 0.5mm 1mm}
td.hors{background:#fff}
td.hors .num{color:#bbb;font-weight:400}
.ferie{display:inline-block;background:#000;color:#fff;font-weight:900;text-transform:uppercase;font-size:.9em;padding:0 1.2mm;margin-bottom:.5mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.vac{font-size:.86em;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px dotted #000;margin-bottom:.6mm;display:inline-block}
.ev{margin-bottom:.4mm;line-height:1.3}
.ev .type{font-weight:900;text-transform:uppercase;font-size:.86em;border:.8px solid #000;padding:0 .7mm}
.ev .qui{color:#333}
.abs{font-style:italic}
.pres{clear:both;margin-top:.8mm;padding-top:.6mm;border-top:.8px dashed #555;color:#222;font-size:.92em}
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
