import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

Font.registerHyphenationCallback((word) => [word]);

// Constantes de hauteur estimée (en mm) - calibrées sur les styles react-pdf ci-dessous
const PAGE_USABLE_HEIGHT = 275; // A4 297mm - padding 10mm*2 - petite marge de sécurité
const BOX_MARGIN = 5;           // marginBottom du box
const HEADER_HEIGHT = 12;       // titre (fontSize 14 + lineHeight) + padding 2mm*2 + bordure
const HEADER_EXTRA_LINE = 6.5;  // hauteur d'une ligne de titre supplémentaire (retour à la ligne)
const ITEM_HEIGHT = 9;          // fontSize 11 * lineHeight 1.3 + paddingVertical 1.5mm*2 + bordure (un peu conservateur)
const ITEM_EXTRA_LINE = 5.2;    // hauteur d'une ligne de texte supplémentaire (fontSize 11 * 1.3 = 14.3pt ≈ 5mm)
const SEP_HEIGHT = 4;           // separateur de ligne vide
// Nombre de caractères approximatif par ligne avant retour automatique (Helvetica 11pt, largeur utile ~74mm)
const CHARS_PAR_LIGNE = 34;
const CHARS_PAR_LIGNE_SOUS_LISTE = 30; // paddingLeft 8mm au lieu de 3mm
const CHARS_PAR_LIGNE_TITRE = 20;      // fontSize 14, majuscules, largeur utile ~76mm
// Hauteur minimale pour ouvrir un morceau de fiche dans une colonne (titre + 2 lignes)
const MIN_CHUNK_HEIGHT = HEADER_HEIGHT + 2 * ITEM_HEIGHT;

const styles = StyleSheet.create({
  page: {
    flexDirection: 'row',
    padding: '10mm',
    backgroundColor: '#ffffff',
  },
  colonneWrapper: {
    width: '50%',
    flexDirection: 'column',
    paddingHorizontal: '2mm',
    alignItems: 'center',
  },
  box: {
    border: '1pt solid #000000',
    width: '80mm',
    display: 'flex',
    flexDirection: 'column',
    marginBottom: '4mm',
    flexShrink: 0,
  },
  headerBox: {
    flexShrink: 0,
    padding: '2mm',
    borderBottom: '1pt solid #000000',
    backgroundColor: '#f6f6f6',
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  listItemContainer: {
    flexShrink: 0,
    paddingVertical: '1.5mm',
    paddingHorizontal: '3mm',
    borderBottom: '0.5pt solid #ececec',
  },
  listItem: {
    fontSize: 11,
    lineHeight: 1.3,
  }
});

function nbLignesVisuelles(texte: string, charsParLigne: number): number {
  return Math.max(1, Math.ceil(texte.trim().length / charsParLigne));
}

function hauteurTitre(nom: string): number {
  return HEADER_HEIGHT + (nbLignesVisuelles(nom || '', CHARS_PAR_LIGNE_TITRE) - 1) * HEADER_EXTRA_LINE;
}

function hauteurLigne(ligne: string): number {
  if (ligne.trim() === '') return SEP_HEIGHT;
  const estSousListe = !!ligne.match(/^\s+[-*•>]/);
  const chars = estSousListe ? CHARS_PAR_LIGNE_SOUS_LISTE : CHARS_PAR_LIGNE;
  return ITEM_HEIGHT + (nbLignesVisuelles(ligne, chars) - 1) * ITEM_EXTRA_LINE;
}

function decouperLignes(fiche: any): string[] {
  return fiche.elements ? fiche.elements.split('\n') : [];
}

function estimerHauteur(fiche: any): number {
  let hauteur = hauteurTitre(fiche.nom);
  for (const ligne of decouperLignes(fiche)) {
    hauteur += hauteurLigne(ligne);
  }
  return hauteur + BOX_MARGIN;
}

// Un morceau de fiche à afficher : soit la fiche entière, soit une partie
// (les fiches trop grandes pour une colonne sont découpées en plusieurs cadres "suite").
interface Morceau {
  fiche: any;
  nom: string;
  lignes: string[];
}

interface PageLayout {
  gauche: Morceau[];
  droite: Morceau[];
}

// Algorithme de bin-packing glouton : remplit la colonne gauche en premier,
// puis la droite, puis démarre une nouvelle page.
function construireLayout(fiches: any[]): PageLayout[] {
  const pages: PageLayout[] = [];
  let pageActuelle: PageLayout = { gauche: [], droite: [] };
  let hauteurGauche = 0;
  let hauteurDroite = 0;

  const nouvellePage = () => {
    pages.push(pageActuelle);
    pageActuelle = { gauche: [], droite: [] };
    hauteurGauche = 0;
    hauteurDroite = 0;
  };

  for (const fiche of fiches) {
    const h = estimerHauteur(fiche);

    if (h <= PAGE_USABLE_HEIGHT) {
      // Fiche qui tient dans une colonne : on la place entière
      const morceau: Morceau = { fiche, nom: fiche.nom, lignes: decouperLignes(fiche) };
      if (hauteurGauche + h <= PAGE_USABLE_HEIGHT) {
        pageActuelle.gauche.push(morceau);
        hauteurGauche += h;
      } else if (hauteurDroite + h <= PAGE_USABLE_HEIGHT) {
        pageActuelle.droite.push(morceau);
        hauteurDroite += h;
      } else {
        // Les deux colonnes sont pleines : nouvelle page
        nouvellePage();
        pageActuelle.gauche.push(morceau);
        hauteurGauche = h;
      }
      continue;
    }

    // Fiche trop grande pour une colonne : on la découpe en plusieurs cadres
    // en remplissant l'espace restant de chaque colonne.
    const lignes = decouperLignes(fiche);
    let index = 0;
    let partie = 0;
    while (index < lignes.length) {
      const nom = partie === 0 ? fiche.nom : `${fiche.nom} (suite)`;
      const hTitre = hauteurTitre(nom);

      // Choix de la colonne : celle qui a au moins la place pour un titre + 2 lignes
      let colonne: 'gauche' | 'droite';
      if (PAGE_USABLE_HEIGHT - hauteurGauche >= MIN_CHUNK_HEIGHT + BOX_MARGIN) {
        colonne = 'gauche';
      } else if (PAGE_USABLE_HEIGHT - hauteurDroite >= MIN_CHUNK_HEIGHT + BOX_MARGIN) {
        colonne = 'droite';
      } else {
        nouvellePage();
        colonne = 'gauche';
      }
      const dispo = PAGE_USABLE_HEIGHT - (colonne === 'gauche' ? hauteurGauche : hauteurDroite) - BOX_MARGIN;

      let hauteur = hTitre;
      const morceauLignes: string[] = [];
      while (index < lignes.length) {
        const hl = hauteurLigne(lignes[index]);
        if (hauteur + hl > dispo && morceauLignes.length > 0) break;
        hauteur += hl;
        morceauLignes.push(lignes[index]);
        index++;
      }

      const morceau: Morceau = { fiche, nom, lignes: morceauLignes };
      if (colonne === 'gauche') {
        pageActuelle.gauche.push(morceau);
        hauteurGauche += hauteur + BOX_MARGIN;
      } else {
        pageActuelle.droite.push(morceau);
        hauteurDroite += hauteur + BOX_MARGIN;
      }
      partie++;
    }
  }

  if (pageActuelle.gauche.length > 0 || pageActuelle.droite.length > 0) {
    pages.push(pageActuelle);
  }

  return pages;
}

function renderFiche(m: Morceau, cle: string) {
  const lignes = m.lignes;
  let indexCouleur = 0;

  const renderLigne = (ligne: string, i: number) => {
    const estVide = ligne.trim() === '';
    const estTitre = ligne.trim().endsWith(':');
    const estSousListe = !!ligne.match(/^\s+[-*•>]/);

    if (estVide) {
      return <View key={`sep-${i}`} style={{ height: '3mm', flexShrink: 0, borderBottom: '0.5pt solid #e2e8f0' }} />;
    }

    let bgColor: string;
    if (estTitre) {
      bgColor = '#f1f5f9';
    } else {
      bgColor = indexCouleur % 2 === 0 ? '#f9f9f981' : '#ffffff';
      indexCouleur++;
    }

    return (
      <View
        key={`line-${i}`}
        style={[
          styles.listItemContainer,
          { backgroundColor: bgColor },
          estSousListe ? { paddingLeft: '8mm' } : {},
        ]}
      >
        <Text style={[
          styles.listItem,
          estTitre ? { fontWeight: 'bold' } : {},
          estSousListe ? { color: '#475569' } : {},
        ]}>
          {ligne}
        </Text>
      </View>
    );
  };

  return (
    // wrap={false} : sécurité supplémentaire pour éviter toute coupure résiduelle
    <View key={cle} style={styles.box} wrap={false}>
      <View style={styles.headerBox}>
        <Text style={styles.title}>{m.nom}</Text>
      </View>
      {lignes.map((ligne: string, i: number) => renderLigne(ligne, i))}
    </View>
  );
}

export const ContenuPDF = ({ contenus }: { contenus: Record<string, any[]> }) => {
  if (!contenus) return <Document><Page size="A4"></Page></Document>;

  const toutesLesFiches: any[] = [];
  Object.entries(contenus).forEach(([, liste]) => {
    liste.filter(c => c.quantity > 0).forEach(c => {
      for (let i = 0; i < c.quantity; i++) {
        toutesLesFiches.push(c);
      }
    });
  });

  if (toutesLesFiches.length === 0) return <Document><Page size="A4"></Page></Document>;

  const pages = construireLayout(toutesLesFiches);

  return (
    <Document>
      {pages.map((page, pi) => (
        <Page key={pi} size="A4" style={styles.page}>
          <View style={styles.colonneWrapper}>
            {page.gauche.map((m, i) => renderFiche(m, `p${pi}-g-${m.fiche.id}-${i}`))}
          </View>
          <View style={styles.colonneWrapper}>
            {page.droite.map((m, i) => renderFiche(m, `p${pi}-d-${m.fiche.id}-${i}`))}
          </View>
        </Page>
      ))}
    </Document>
  );
};
