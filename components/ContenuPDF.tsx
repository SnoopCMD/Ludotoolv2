import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

Font.registerHyphenationCallback((word) => [word]);

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
    minHeight: '20mm', 
    width: '80mm', 
    display: 'flex',
    flexDirection: 'column',
    marginBottom: '4mm', 
  },
  headerBox: {
    padding: '2mm', 
    borderBottom: '1pt solid #000000',
    backgroundColor: '#f8f9fa', 
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
    borderBottom: '0.5pt solid #e2e8f0', 
  },
  listItem: {
    fontSize: 11, 
    lineHeight: 1.3,
  }
});

export const ContenuPDF = ({ contenus }: { contenus: Record<string, any[]> }) => {
  if (!contenus) {
    return <Document><Page size="A4"></Page></Document>;
  }

  const toutesLesFiches: any[] = [];
  Object.entries(contenus).forEach(([couleurId, liste]) => {
    liste.filter(c => c.quantity > 0).forEach(c => {
      for (let i = 0; i < c.quantity; i++) {
        toutesLesFiches.push(c);
      }
    });
  });

  if (toutesLesFiches.length === 0) return <Document><Page size="A4"></Page></Document>;

  const colonnes: any[][] = [[], []];
  toutesLesFiches.forEach((fiche, index) => {
    colonnes[index % 2].push(fiche); 
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {colonnes.map((colonne, colIndex) => (
          <View key={colIndex} style={styles.colonneWrapper}>
            {colonne.map((c, i) => {
              const lignesRaw = c.elements.split('\n');
              
              return (
                <View key={`${c.id}-${i}`} style={styles.box}>
                  {(() => {
                    let indexCouleur = 0; 

                    // Fonction pour générer le design d'une ligne
                    const renderLigne = (ligne: string, indexLigne: number) => {
                      const estVide = ligne.trim() === '';
                      const estTitre = ligne.trim().endsWith(':');
                      const estSousListe = ligne.match(/^\s+[-*•>]/);

                      if (estVide) {
                        return <View key={`sep-${indexLigne}`} style={{ height: '3mm', borderBottom: '0.5pt solid #e2e8f0' }} />;
                      }

                      let bgColor = '#ffffff';
                      if (estTitre) {
                        bgColor = '#f1f5f9';
                      } else {
                        bgColor = indexCouleur % 2 === 0 ? '#f8f9fa' : '#ffffff';
                        indexCouleur++;
                      }

                      return (
                        <View key={`line-${indexLigne}`} style={[
                          styles.listItemContainer, 
                          { backgroundColor: bgColor },
                          estSousListe ? { paddingLeft: '8mm' } : {} 
                        ]}>
                          <Text style={[
                            styles.listItem,
                            estTitre ? { fontWeight: 'bold' } : {},
                            estSousListe ? { color: '#475569' } : {}
                          ]}>
                            {ligne}
                          </Text>
                        </View>
                      );
                    };

                    // ON SÉPARE EN DEUX : Le bloc de tête (Titre + 3 lignes) et le reste
                    const NB_LIGNES_GROUPEES = 3;
                    const groupeTete = lignesRaw.slice(0, NB_LIGNES_GROUPEES);
                    const resteLignes = lignesRaw.slice(NB_LIGNES_GROUPEES);

                    return (
                      <>
                        {/* 1. Le titre et les 3 premières lignes sont SOUDÉS (wrap={false}) */}
                        <View wrap={false}>
                          <View style={styles.headerBox}>
                            <Text style={styles.title}>{c.name}</Text>
                          </View>
                          {groupeTete.map((ligne: string, idx: number) => renderLigne(ligne, idx))}
                        </View>

                        {/* 2. Le reste de la liste peut se couper ligne par ligne */}
                        {resteLignes.map((ligne: string, idx: number) => (
                          <View key={`wrap-${idx}`} wrap={false}>
                            {renderLigne(ligne, idx + NB_LIGNES_GROUPEES)}
                          </View>
                        ))}
                      </>
                    );
                  })()}
                </View>
              );
            })}
          </View>
        ))}
      </Page>
    </Document>
  );
};