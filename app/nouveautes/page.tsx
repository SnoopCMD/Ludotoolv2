"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../lib/supabase";
import Link from "next/link";

type JeuNouveaute = {
  id: string | number;
  nom: string;
  ean: string;
  couleur?: string;
  date_entree?: string | null;
  date_sortie?: string | null;
};

const COULEURS: { id: string; hex: string }[] = [
  { id: 'vert',  hex: '#a8e063' },
  { id: 'rose',  hex: '#f472b6' },
  { id: 'bleu',  hex: '#60a5fa' },
  { id: 'rouge', hex: '#f87171' },
  { id: 'jaune', hex: '#fb923c' },
];

const MAX_SALLE_JEUX = 12;
const MAX_PREMIERS_JEUX = 10;

const formaterDate = (dateStr?: string | null) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
};

const estDepassee = (dateStr?: string | null) => {
  if (!dateStr) return false;
  const sortie = new Date(dateStr);
  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  return sortie <= aujourdhui;
};

export default function NouveautesPage() {
  const [jeux, setJeux] = useState<JeuNouveaute[]>([]);
  const [jeuxDispos, setJeuxDispos] = useState<JeuNouveaute[]>([]);
  const [rechercheAjout, setRechercheAjout] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const fetchDatas = async () => {
    setIsLoading(true);
    const { data: stockData, error } = await supabase
      .from('jeux')
      .select('id, nom, ean, etape_nouveaute, date_entree, date_sortie')
      .eq('statut', 'En stock')
      .order('id', { ascending: true });

    if (error) { setIsLoading(false); return; }

    const bruts = stockData as any[];
    let colorMap: Record<string, string> = {};
    const { data: catData } = await supabase.from('catalogue').select('ean, couleur');
    if (catData) catData.forEach(item => { if (item.couleur) colorMap[item.ean] = item.couleur; });

    const tousLesJeux = bruts.map(j => ({ ...j, couleur: colorMap[j.ean] || "" }));
    setJeux(tousLesJeux.filter(j => j.etape_nouveaute));
    setJeuxDispos(tousLesJeux.filter(j => !j.etape_nouveaute));
    setIsLoading(false);
  };

  useEffect(() => { fetchDatas(); }, []);

  const mettreEnAttente = async (id: string | number) => {
    setRechercheAjout("");
    const { error } = await supabase.from('jeux').update({ etape_nouveaute: true }).eq('id', id);
    if (error) alert("Erreur d'ajout à la file.");
    fetchDatas();
  };

  const validerEntreeEnSalle = async (id: string | number) => {
    const aujourdhui = new Date();
    const sortie = new Date();
    sortie.setDate(aujourdhui.getDate() + 14);
    const { error } = await supabase.from('jeux').update({
      date_entree: aujourdhui.toISOString().split('T')[0],
      date_sortie: sortie.toISOString().split('T')[0],
    }).eq('id', id);
    if (error) alert("Erreur lors de l'entrée en salle.");
    fetchDatas();
  };

  const retirerDesNouveautes = async (id: string | number) => {
    const { error } = await supabase.from('jeux').update({ etape_nouveaute: false, date_entree: null, date_sortie: null }).eq('id', id);
    if (error) alert("Erreur lors du retrait.");
    fetchDatas();
  };

  const premiersJeuxAttente = useMemo(() => jeux.filter(j => j.couleur === 'vert' && !j.date_entree), [jeux]);
  const premiersJeuxEnSalle = useMemo(() => jeux.filter(j => j.couleur === 'vert' && j.date_entree).sort((a, b) => new Date(a.date_sortie!).getTime() - new Date(b.date_sortie!).getTime()), [jeux]);
  const salleJeuxAttente = useMemo(() => jeux.filter(j => j.couleur !== 'vert' && !j.date_entree), [jeux]);
  const salleJeuxEnSalle = useMemo(() => jeux.filter(j => j.couleur !== 'vert' && j.date_entree).sort((a, b) => new Date(a.date_sortie!).getTime() - new Date(b.date_sortie!).getTime()), [jeux]);

  const resultatsRecherche = useMemo(() => {
    if (!rechercheAjout) return [];
    const termNormalise = rechercheAjout.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    return jeuxDispos.filter(j => {
      const nomNormalise = j.nom.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      return nomNormalise.includes(termNormalise) || j.ean.includes(rechercheAjout);
    }).slice(0, 5);
  }, [rechercheAjout, jeuxDispos]);

  const couleurHex = (id?: string) => COULEURS.find(c => c.id === id)?.hex ?? 'var(--cream2)';

  const cardStyle: React.CSSProperties = {
    background: 'var(--white)', border: '2.5px solid var(--ink)', borderRadius: 10,
    padding: '12px 16px', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', gap: 12, boxShadow: '4px 4px 0 var(--ink)',
    marginBottom: 8,
  };

  const renderJeuCard = (
    jeu: JeuNouveaute,
    onRetirer: () => void,
    onValider?: () => void,
    isFull?: boolean,
  ) => {
    const hex = couleurHex(jeu.couleur);
    const depasse = estDepassee(jeu.date_sortie);
    return (
      <div key={jeu.id} style={{ ...cardStyle, borderColor: depasse ? 'var(--rouge)' : 'var(--ink)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{ width: 14, height: 14, borderRadius: '50%', background: hex, border: '2px solid var(--ink)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 800, fontSize: 15 }}>{jeu.nom}</span>
            {jeu.date_entree && (
              <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', fontWeight: 500 }}>
                Entré le {formaterDate(jeu.date_entree)}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {jeu.date_sortie && (
            <span className="pop-sticker" style={{
              background: depasse ? 'var(--rouge)' : 'var(--cream2)',
              color: depasse ? 'var(--white)' : 'var(--ink)',
              fontSize: 11,
            }}>
              ↩ {formaterDate(jeu.date_sortie)}
            </span>
          )}
          {onValider && (
            <button
              onClick={onValider}
              disabled={isFull}
              className="pop-btn pop-btn-green"
              style={{ padding: '5px 14px', fontSize: 13, opacity: isFull ? 0.4 : 1, cursor: isFull ? 'not-allowed' : 'pointer' }}
            >
              {isFull ? 'Plein' : 'Valider ✓'}
            </button>
          )}
          {depasse && !onValider && (
            <button onClick={onRetirer} className="pop-btn pop-btn-dark" style={{ padding: '5px 14px', fontSize: 13, background: 'var(--rouge)' }}>
              Terminer !
            </button>
          )}
          {(!depasse || onValider) && (
            <button onClick={onRetirer} style={{
              background: 'none', border: '2px solid var(--ink)', borderRadius: 8,
              padding: '5px 10px', cursor: 'pointer', fontSize: 14,
              boxShadow: '2px 2px 0 var(--ink)',
            }}>✕</button>
          )}
        </div>
      </div>
    );
  };

  const renderEmptySlot = (key: string, isVert = false) => (
    <div key={key} style={{
      border: '2px dashed var(--cream2)', borderRadius: 10, padding: '14px 16px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: isVert ? 'rgba(168,224,99,0.08)' : 'var(--cream)',
      marginBottom: 8,
    }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(0,0,0,0.3)', fontStyle: 'italic' }}>
        Place disponible
      </span>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', flexDirection: 'column' }}>

      {/* Mini sticky header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 200, height: 56,
        background: 'var(--cream)', borderBottom: '2.5px solid var(--ink)',
        display: 'flex', alignItems: 'center', padding: '0 24px', gap: 16,
      }}>
        <Link href="/inventaire" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--ink)', color: 'var(--cream)',
          border: '2px solid var(--ink)', borderRadius: 6,
          padding: '4px 12px', fontWeight: 700, fontSize: 14,
          textDecoration: 'none', boxShadow: '2px 2px 0 rgba(0,0,0,0.3)',
          fontFamily: 'inherit',
        }}>← Inventaire</Link>
        <h1 className="bc" style={{
          fontSize: 24, letterSpacing: '0.03em', margin: 0,
          background: 'linear-gradient(90deg, var(--vert), var(--bleu))',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>Nouveautés</h1>
      </header>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1200, width: '100%' }}>
        {/* Titre + recherche */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div />

          {/* Barre de recherche */}
          <div style={{ position: 'relative', width: 320, zIndex: 20 }}>
            <input
              type="text"
              placeholder="Ajouter par nom ou EAN…"
              value={rechercheAjout}
              onChange={e => setRechercheAjout(e.target.value)}
              className="pop-input"
              style={{ width: '100%', paddingLeft: 36 }}
            />
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.4, pointerEvents: 'none' }}>➕</span>
            {rechercheAjout && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
                background: 'var(--white)', border: '2.5px solid var(--ink)',
                borderRadius: 10, boxShadow: '4px 4px 0 var(--ink)', overflow: 'hidden',
              }}>
                {resultatsRecherche.length === 0 ? (
                  <div style={{ padding: '12px 16px', fontSize: 14, color: 'rgba(0,0,0,0.4)', fontWeight: 600, textAlign: 'center' }}>
                    Aucun jeu disponible trouvé
                  </div>
                ) : resultatsRecherche.map(r => (
                  <button key={r.id} onClick={() => mettreEnAttente(r.id)} style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 16px', cursor: 'pointer', background: 'none', border: 'none',
                    borderBottom: '1px solid var(--cream2)', textAlign: 'left', fontFamily: 'inherit',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--cream)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: couleurHex(r.couleur), border: '1.5px solid var(--ink)', flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{r.nom}</span>
                    <span className="pop-sticker" style={{ background: 'var(--ink)', color: 'var(--cream)', fontSize: 10 }}>Ajouter</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(0,0,0,0.35)', fontWeight: 700, fontSize: 16 }}>
            Chargement…
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

            {/* ── Salle Jeux ── */}
            <section>
              <div className="pop-sec-head">
                <span>🎲 Salle Jeux</span>
                <div />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

                {/* File d'attente */}
                <div className="pop-card" style={{ padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <span className="bc" style={{ fontSize: 16 }}>⏳ File d'attente</span>
                    <span className="pop-sticker" style={{ background: 'var(--cream2)' }}>{salleJeuxAttente.length}</span>
                  </div>
                  <div style={{ overflow: 'auto', maxHeight: 480 }}>
                    {salleJeuxAttente.length === 0 && (
                      <p style={{ textAlign: 'center', color: 'rgba(0,0,0,0.3)', fontWeight: 600, padding: '30px 0', fontSize: 14 }}>La file est vide</p>
                    )}
                    {salleJeuxAttente.map(jeu =>
                      renderJeuCard(jeu, () => retirerDesNouveautes(jeu.id), () => validerEntreeEnSalle(jeu.id), salleJeuxEnSalle.length >= MAX_SALLE_JEUX)
                    )}
                  </div>
                </div>

                {/* En salle */}
                <div className="pop-card" style={{ padding: 20, background: 'rgba(168,224,99,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <span className="bc" style={{ fontSize: 16 }}>👁️ En salle (14 jours)</span>
                    <span className="pop-sticker" style={{ background: 'var(--vert)' }}>{salleJeuxEnSalle.length} / {MAX_SALLE_JEUX}</span>
                  </div>
                  <div style={{ overflow: 'auto', maxHeight: 480 }}>
                    {Array.from({ length: MAX_SALLE_JEUX }).map((_, i) => {
                      const jeu = salleJeuxEnSalle[i];
                      if (jeu) return renderJeuCard(jeu, () => retirerDesNouveautes(jeu.id));
                      return renderEmptySlot(`sj-empty-${i}`);
                    })}
                  </div>
                </div>
              </div>
            </section>

            {/* ── Salle Premiers Jeux ── */}
            <section>
              <div className="pop-sec-head">
                <span>🟢 Salle Premiers Jeux</span>
                <div />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

                {/* File d'attente */}
                <div className="pop-card" style={{ padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <span className="bc" style={{ fontSize: 16 }}>⏳ File d'attente</span>
                    <span className="pop-sticker" style={{ background: 'var(--cream2)' }}>{premiersJeuxAttente.length}</span>
                  </div>
                  <div style={{ overflow: 'auto', maxHeight: 480 }}>
                    {premiersJeuxAttente.length === 0 && (
                      <p style={{ textAlign: 'center', color: 'rgba(0,0,0,0.3)', fontWeight: 600, padding: '30px 0', fontSize: 14 }}>La file est vide</p>
                    )}
                    {premiersJeuxAttente.map(jeu =>
                      renderJeuCard(jeu, () => retirerDesNouveautes(jeu.id), () => validerEntreeEnSalle(jeu.id), premiersJeuxEnSalle.length >= MAX_PREMIERS_JEUX)
                    )}
                  </div>
                </div>

                {/* En salle */}
                <div className="pop-card" style={{ padding: 20, background: 'rgba(168,224,99,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <span className="bc" style={{ fontSize: 16 }}>👁️ En salle (14 jours)</span>
                    <span className="pop-sticker" style={{ background: 'var(--vert)' }}>{premiersJeuxEnSalle.length} / {MAX_PREMIERS_JEUX}</span>
                  </div>
                  <div style={{ overflow: 'auto', maxHeight: 480 }}>
                    {Array.from({ length: MAX_PREMIERS_JEUX }).map((_, i) => {
                      const jeu = premiersJeuxEnSalle[i];
                      if (jeu) return renderJeuCard(jeu, () => retirerDesNouveautes(jeu.id));
                      return renderEmptySlot(`pj-empty-${i}`, true);
                    })}
                  </div>
                </div>
              </div>
            </section>

          </div>
        )}
      </div>
    </div>
  );
}

