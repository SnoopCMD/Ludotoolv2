import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

Font.registerHyphenationCallback((word) => [word]);

// Constantes de hauteur estimée (en mm) - calibrées sur les styles react-pdf ci-dessous
const PAGE_USABLE_HEIGHT = 275; // A4 297mm - padding 10mm*2 - petite marge de sécurité
const BOX_MARGIN = 5;           // marginBottom du box
const HEADER_HEIGHT = 12;       // titre (fontSize 14 + lineHeight) + padding 2mm*2 + bordure
const ITEM_HEIGHT = 9;          // fontSize 11 * lineHeight 1.3 + paddingVertical 1.5mm*2 + bordure (un peu conservateur)
const SEP_HEIGHT = 4;           // separateur de ligne vide

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
  },
  headerBox: {
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
    paddingVertical: '1.5mm',
    paddingHorizontal: '3mm',
    borderBottom: '0.5pt solid #ececec',
  },
  listItem: {
    fontSize: 11,
    lineHeight: 1.3,
  }
});

function estimerHauteur(fiche: any): number {
  const lignes = fiche.elements ? fiche.elements.split('\n') : [];
  let hauteur = HEADER_HEIGHT;
  for (const ligne of lignes) {
    hauteur += ligne.trim() === '' ? SEP_HEIGHT : ITEM_HEIGHT;
  }
  return hauteur + BOX_MARGIN;
}

interface PageLayout {
  gauche: any[];
  droite: any[];
}

// Algorithme de bin-packing glouton : remplit la colonne gauche en premier,
// puis la droite, puis démarre une nouvelle page.
function construireLayout(fiches: any[]): PageLayout[] {
  const pages: PageLayout[] = [];
  let pageActuelle: PageLayout = { gauche: [], droite: [] };
  let hauteurGauche = 0;
  let hauteurDroite = 0;

  for (const fiche of fiches) {
    const h = estimerHauteur(fiche);

    if (hauteurGauche + h <= PAGE_USABLE_HEIGHT) {
      pageActuelle.gauche.push(fiche);
      hauteurGauche += h;
    } else if (hauteurDroite + h <= PAGE_USABLE_HEIGHT) {
      pageActuelle.droite.push(fiche);
      hauteurDroite += h;
    } else {
      // Les deux colonnes sont pleines : nouvelle page
      pages.push(pageActuelle);
      pageActuelle = { gauche: [fiche], droite: [] };
      hauteurGauche = h;
      hauteurDroite = 0;
    }
  }

  if (pageActuelle.gauche.length > 0 || pageActuelle.droite.length > 0) {
    pages.push(pageActuelle);
  }

  return pages;
}

function renderFiche(c: any, cle: string) {
  const lignes = c.elements ? c.elements.split('\n') : [];
  let indexCouleur = 0;

  const renderLigne = (ligne: string, i: number) => {
    const estVide = ligne.trim() === '';
    const estTitre = ligne.trim().endsWith(':');
    const estSousListe = !!ligne.match(/^\s+[-*•>]/);

    if (estVide) {
      return <View key={`sep-${i}`} style={{ height: '3mm', borderBottom: '0.5pt solid #e2e8f0' }} />;
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
        <Text style={styles.title}>{c.nom}</Text>
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
            {page.gauche.map((c, i) => renderFiche(c, `p${pi}-g-${c.id}-${i}`))}
          </View>
          <View style={styles.colonneWrapper}>
            {page.droite.map((c, i) => renderFiche(c, `p${pi}-d-${c.id}-${i}`))}
          </View>
        </Page>
      ))}
    </Document>
  );
};
