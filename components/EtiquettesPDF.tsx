/* eslint-disable jsx-a11y/alt-text */
import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image, Font } from '@react-pdf/renderer';

Font.registerHyphenationCallback((word) => [word]);

type EtiquetteType = {
  id: string | number;
  ean: string;
  quantity: number;
  nom: string;
  mecanique: string;
  nb_de_joueurs: string;
  coop_versus: string;
  temps_de_jeu: string;
  etoiles: number | ""; // <-- On autorise le vide ici
};

const styles = StyleSheet.create({
  page: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingTop: '12mm',
    paddingLeft: '4.5mm',
    paddingRight: '4.5mm',
    backgroundColor: '#ffffff',
    alignContent: 'flex-start',
  },
  etiquette: {
    width: '67mm',
    height: '30mm',
    border: '0.5pt solid #000000', 
    paddingTop: '1mm',
    paddingLeft: '1.5mm',
    paddingRight: '1.5mm',
    paddingBottom: '3mm', // C'EST ICI LA MAGIE : Pousse les éléments vers le haut !
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    margin: 0, 
  },
  titleContainer: {
    height: '9mm', 
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: '0.6mm',
  },
  titre: {
    fontWeight: 'bold',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  bottomRow: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    width: '100%',
    height: '16mm', // Contraint la hauteur de la ligne du bas
  },
  colSide: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '20%',
  },
  colCenter: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '60%', 
  },
  iconBox: {
    height: '12mm', // Laisse les images s'adapter à cette hauteur sans déborder
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center', 
    marginBottom: '1mm', 
  },
  textePetit: {
    fontSize: 10,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  texteMecanique: {
    fontSize: 9.5,
    textAlign: 'center',
    fontWeight: 'bold',
    textTransform: 'capitalize', 
    position: 'relative', // NOUVEAU : Permet de décaler l'élément
    top: '1.5mm',         // NOUVEAU : Le pousse vers le bas (ajustez la valeur si besoin)
  }
});

export const EtiquettesPDF = ({ etiquettesParCouleur }: { etiquettesParCouleur: Record<string, EtiquetteType[]> }) => {
  
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const getTitleStyle = (nom: string) => {
    let size = 10;
    const nomSecurise = nom || ""; // Empêche le plantage si le nom est vide
    if (nomSecurise.length > 30) size = 8;
    else if (nomSecurise.length > 20) size = 9;
    return { ...styles.titre, fontSize: size };
  };

  const renderType = (type: string) => {
    if (type === 'Coop') return <Image src={`${baseUrl}/coop.jpg`} style={{ width: 35, height: 35, objectFit: 'contain' }} />;
    if (type === 'Versus') return <Image src={`${baseUrl}/versus.png`} style={{ width: 35, height: 35, objectFit: 'contain' }} />;
    if (type === 'Solo') return <Image src={`${baseUrl}/solo.png`} style={{ width: 35, height: 35, objectFit: 'contain' }} />;
    return null;
  };

  const renderEtoiles = (nb: number | "") => {
    if (nb === 3) {
      return <Image src={`${baseUrl}/etoiles3.png`} style={{ width: 135, height: 45, objectFit: 'contain' }} />;
    }
    if (nb === 2) {
      return <Image src={`${baseUrl}/etoiles2.png`} style={{ width: 90, height: 45, objectFit: 'contain' }} />;
    }
    if (nb === 1) {
      return <Image src={`${baseUrl}/etoile.png`} style={{ width: 25, height: 25, objectFit: 'contain' }} />;
    }
    return null; // N'affiche rien si c'est vide
  };

  if (!etiquettesParCouleur) {
    return <Document><Page size="A4"></Page></Document>;
  }

  return (
    <Document>
      {Object.entries(etiquettesParCouleur).map(([couleurId, liste]) => {
        const etiquettesDeCetteCouleur = Array.isArray(liste) ? liste : [];
        const aImprimer = etiquettesDeCetteCouleur.filter(e => e.quantity > 0);
        
        if (aImprimer.length === 0) return null;

        return (
          <Page key={couleurId} size="A4" style={styles.page}>
            {aImprimer.map((eti) => {
              const elements = [];
              for (let i = 0; i < eti.quantity; i++) {
                elements.push(
                  <View key={`${eti.id}-${i}`} style={styles.etiquette}>
                    
                    <View style={styles.titleContainer}>
                      <Text style={getTitleStyle(eti.nom)}>{eti.nom}</Text>
                    </View>
                    
                    <View style={styles.bottomRow}>
                      
                      <View style={styles.colSide}>
                        <View style={styles.iconBox}>{renderType(eti.coop_versus)}</View>
                        <Text style={styles.textePetit}>{eti.nb_de_joueurs}</Text>
                      </View>

                      <View style={styles.colCenter}>
                        <View style={styles.iconBox}>{renderEtoiles(eti.etoiles)}</View>
                        <Text style={styles.texteMecanique}>{eti.mecanique}</Text>
                      </View>
                      
                      <View style={styles.colSide}>
                        <View style={styles.iconBox}>
                          <Image src={`${baseUrl}/timer.jpg`} style={{ width: 25, height: 40, objectFit: 'contain' }} />
                        </View>
                        <Text style={styles.textePetit}>{eti.temps_de_jeu}</Text>
                      </View>

                    </View>
                  </View>
                );
              }
              return elements;
            })}
          </Page>
        );
      })}
    </Document>
  );
};