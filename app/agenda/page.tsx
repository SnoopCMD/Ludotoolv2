"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import NavBar from "../../components/NavBar";
import { format, addMonths, subMonths, addWeeks, subWeeks, startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth, isSameMonth, isToday, subDays, setMonth, setYear, getISOWeek, getYear } from "date-fns";
import { fr } from "date-fns/locale";

type AbsenceHS = { debut: string; fin: string; type: 'conge' | 'rtt' | 'recup' };

type MembreEquipe = {
  id: string;
  nom: string;
  role: string;
  heures_hebdo_base: number;
  groupe?: string;
  solde_conges?: number;
  solde_rtt?: number;
  solde_recup?: number;
  conges_pris_extra?: number;
  rtt_pris_extra?: number;
  recup_pris_extra?: number;
  absences_hs?: AbsenceHS[];
  horaires: any;
};
type Evenement = { id?: string; parent_id?: string; titre: string; type: string; date_debut: string; date_fin: string; heure_debut?: string; heure_fin?: string; membres: string[]; };

type SwapSession = {
  active: boolean;
  step: 1 | 2;
  selectedDates: string[];
  m1Id: string;
  m2Id: string;
};

const JOURS_SEMAINE = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const HEURES_GRILLE = [8, 10, 12, 14, 16, 18, 20, 22]; 
const HEURE_DEBUT = 7;
const HEURE_FIN = 24; 

const ABSENCE_TYPES = ['Congé', 'Demi-Congé', 'RTT', 'Demi-RTT', 'Récupération', 'Demi-Récupération'];

const timeToMins = (t: string, isEnd: boolean = false) => {
  if (!t) return 0;
  let [h, m] = t.split(':').map(Number);
  if (isEnd && h === 0 && m === 0) h = 24;
  return h * 60 + m;
};

const minsToTimeStr = (mins: number) => {
  if (mins === 1440) return "00:00"; 
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const soustraireHeures = (debutA: string, finA: string, debutB: string, finB: string) => {
  const startA = timeToMins(debutA);
  const endA = timeToMins(finA, true);
  const startB = timeToMins(debutB);
  const endB = timeToMins(finB, true);

  if (startB >= endA || endB <= startA) return [{ debut: debutA, fin: finA }];
  
  const res = [];
  if (startA < startB) res.push({ debut: debutA, fin: minsToTimeStr(startB) });
  if (endA > endB) res.push({ debut: minsToTimeStr(endB), fin: finA });
  return res;
};

const mergeIntervals = (intervals: {start: number, end: number}[]) => {
  const valid = intervals.filter(i => i.start < i.end);
  if (!valid.length) return [];
  valid.sort((a, b) => a.start - b.start);
  const merged = [valid[0]];
  for (let i = 1; i < valid.length; i++) {
    const current = valid[i];
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push(current);
    }
  }
  return merged;
};

const getEventStyle = (type: string, isOverlay = false) => {
  const base = isOverlay ? ' backdrop-blur-md bg-opacity-80 border-opacity-90' : '';
  if (type.includes('RTT')) return 'bg-emerald-100 text-emerald-900 border-emerald-400' + base;
  if (type.includes('Congé') || type.includes('Récupération')) return 'bg-rose-100 text-rose-900 border-rose-400' + base;
  if (type === 'Réunion') return 'bg-indigo-200 text-indigo-900 border-indigo-400' + base;
  if (type === 'Animation') return 'bg-amber-200 text-amber-900 border-amber-400' + base; 
  if (type === 'Soirée Jeux') return 'bg-purple-200 text-purple-900 border-purple-400' + base;
  if (type === 'Heures Exceptionnelles') return 'bg-teal-200 text-teal-900 border-teal-400' + base;
  return 'bg-slate-200 text-slate-800 border-slate-300' + base;
};

const getEventDotColor = (type: string) => {
  if (type.includes('RTT')) return 'bg-emerald-500';
  if (type.includes('Congé') || type.includes('Récupération')) return 'bg-rose-500';
  if (type === 'Réunion') return 'bg-indigo-500';
  if (type === 'Animation') return 'bg-amber-500'; 
  if (type === 'Soirée Jeux') return 'bg-purple-500';
  if (type === 'Heures Exceptionnelles') return 'bg-teal-500';
  return 'bg-slate-500';
};

const getEventIcon = (type: string) => {
  if (type.includes('Congé')) return '🏖️';
  if (type.includes('RTT')) return '🌴';
  if (type.includes('Récupération')) return '🛋️';
  if (type === 'Réunion') return '💬';
  if (type === 'Animation') return '🎪';
  if (type === 'Soirée Jeux') return '🌙';
  if (type === 'Heures Exceptionnelles') return '⭐';
  return '📌';
};

function isJourTravaille(membre: MembreEquipe, dateStr: string, feries: Record<string, string>): boolean {
  if (feries[dateStr]) return false;
  const d = new Date(dateStr + 'T12:00:00');
  const nomJour = format(d, 'EEEE', { locale: fr }).toLowerCase();
  const typeSemaine = getISOWeek(d) % 2 !== 0 ? 'semaineA' : 'semaineB';
  const h = membre.horaires?.[typeSemaine]?.[nomJour];
  return !!(h && h.debut && h.fin);
}

function compterJoursTravailles(debut: string, fin: string, membre: MembreEquipe, feries: Record<string, string>): number {
  try {
    const days = eachDayOfInterval({ start: new Date(debut + 'T12:00:00'), end: new Date(fin + 'T12:00:00') });
    return days.filter(d => isJourTravaille(membre, format(d, 'yyyy-MM-dd'), feries)).length;
  } catch { return 0; }
}

const getHoraireForDay = (membre: MembreEquipe, dateKey: string, nomJour: string, typeSemaine: string) => {
  if (membre.horaires?.exceptions?.[dateKey]) {
    const ex = membre.horaires.exceptions[dateKey];
    if (!ex.debut || !ex.fin) return null; 
    return { ...ex, pause: ex.pause !== undefined ? ex.pause : 1, isSwap: ex.isSwap };
  }
  const h = membre.horaires?.[typeSemaine]?.[nomJour];
  if (h && h.debut && h.fin) {
    return { ...h, pause: h.pause !== undefined ? h.pause : 1, isSwap: false };
  }
  return null;
};

const getDailyMinutes = (membre: MembreEquipe, dateKey: string, nomJour: string, typeSemaine: string, evsDuJour: Evenement[], isFerie: boolean) => {
  let expected = 0;
  let actual = 0;
  let amplitude = 0;
  let hasSwap = false;

  if (!isFerie) {
    const hBase = membre.horaires?.[typeSemaine]?.[nomJour];
    if (hBase && hBase.debut && hBase.fin) {
      expected = (timeToMins(hBase.fin, true) - timeToMins(hBase.debut)) - (Number(hBase.pause ?? 1) * 60);
    }
  }

  let pauseDuJour = 0;
  const intervals: {start: number, end: number}[] = [];
  
  const evsAbsence = evsDuJour.filter(e => ABSENCE_TYPES.includes(e.type) && (!e.membres.length || e.membres.includes(membre.id)));
  const evsExtra = evsDuJour.filter(e => (!ABSENCE_TYPES.includes(e.type)) && (!e.membres.length || e.membres.includes(membre.id)) && e.heure_debut && e.heure_fin);

  if (!isFerie) {
    const hDraft = getHoraireForDay(membre, dateKey, nomJour, typeSemaine);
    if (hDraft && hDraft.debut && hDraft.fin) {
       if (hDraft.isSwap) hasSwap = true;
       pauseDuJour = Number(hDraft.pause ?? 1) * 60;
       
       const isFullyAbsent = evsAbsence.some(a => !a.type.startsWith('Demi-') && (!a.heure_debut || !a.heure_fin));
       
       if (!isFullyAbsent) {
           let segments = [{ debut: hDraft.debut, fin: hDraft.fin }];
           evsAbsence.forEach(ev => {
             if (ev.heure_debut && ev.heure_fin) {
               const newSegments: any[] = [];
               segments.forEach(seg => newSegments.push(...soustraireHeures(seg.debut, seg.fin, ev.heure_debut!, ev.heure_fin!)));
               segments = newSegments;
             }
           });
           
           segments.forEach(seg => {
             intervals.push({ start: timeToMins(seg.debut), end: timeToMins(seg.fin, true) });
           });
       }
    }
  }

  evsExtra.forEach(ext => {
     intervals.push({ start: timeToMins(ext.heure_debut!), end: timeToMins(ext.heure_fin!, true) });
  });

  const merged = mergeIntervals(intervals);

  merged.forEach(inter => {
      actual += (inter.end - inter.start);
  });

  if (merged.length > 0) {
      const minStart = merged[0].start;
      const maxEnd = merged[merged.length - 1].end;
      actual = Math.max(0, actual - pauseDuJour);
      amplitude = Math.max(0, (maxEnd - minStart) - pauseDuJour);
  }

  if (evsAbsence.length > 0 && actual < expected) {
      actual = expected;
  }

  return { expected: Math.max(0, expected), actual: Math.max(0, actual), amplitude: Math.max(0, amplitude), hasSwap };
};

export default function AgendaPage() {
  const [vue, setVue] = useState<"Mois" | "Semaine">("Mois");
  const [dateActuelle, setDateActuelle] = useState(new Date());
  const [joursFeries, setJoursFeries] = useState<Record<string, string>>({});
  const [vacances, setVacances] = useState<Record<string, string[]>>({});
  
  const [showSettings, setShowSettings] = useState(false);
  const [couleurs, setCouleurs] = useState({
    accent: '#baff29', equipeA: '#FD495B', equipeB: '#5BE0FB', swap: '#a855f7', zoneA: '#ffaa00', zoneB: '#6ba4ff', zoneC: '#9b51e0'
  });

useEffect(() => {
    console.log("URL SUPABASE UTILISÉE :", process.env.NEXT_PUBLIC_SUPABASE_URL);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('agenda_couleurs');
    if (saved) try { setCouleurs({...couleurs, ...JSON.parse(saved)}); } catch(e) {}
  }, []);
  useEffect(() => { localStorage.setItem('agenda_couleurs', JSON.stringify(couleurs)); }, [couleurs]);

  const getBlocColor = (membresBloc: any[], currentEquipe: MembreEquipe[]) => {
    if (currentEquipe.length === 0) return couleurs.accent;
    const countA = membresBloc.filter(m => m.groupe === 'A').length;
    const countB = membresBloc.filter(m => m.groupe === 'B').length;

    if (countA > 0 && countB > 0) {
      const totalA = currentEquipe.filter(m => m.groupe === 'A').length;
      const totalB = currentEquipe.filter(m => m.groupe === 'B').length;
      const seuilMax = Math.max(totalA, totalB);
      if (membresBloc.length > seuilMax) return couleurs.accent; 
      return couleurs.swap; 
    }
    if (countA > 0) return couleurs.equipeA;
    if (countB > 0) return couleurs.equipeB;
    return couleurs.accent;
  };

  const [equipe, setEquipe] = useState<MembreEquipe[]>([]);
  const [evenements, setEvenements] = useState<Evenement[]>([]);

  const [isDraftMode, setIsDraftMode] = useState(false);
  const [draftEquipe, setDraftEquipe] = useState<MembreEquipe[]>([]);
  const [draftEvenements, setDraftEvenements] = useState<Evenement[]>([]);
  const [draftDeletedEvents, setDraftDeletedEvents] = useState<string[]>([]);
  
  const activeEquipe = isDraftMode ? draftEquipe : equipe;
  const activeEvenements = isDraftMode ? draftEvenements : evenements;

  const [showEquipePanel, setShowEquipePanel] = useState(false);
  const [membreActif, setMembreActif] = useState<MembreEquipe | null>(null);
  const [ongletMembre, setOngletMembre] = useState<"profil" | "suivi">("profil");
  const [semaineActive, setSemaineActive] = useState<"semaineA" | "semaineB">("semaineA");
  
  const [swapSession, setSwapSession] = useState<SwapSession>({ active: false, step: 1, selectedDates: [], m1Id: '', m2Id: '' });

  const [showEventModal, setShowEventModal] = useState(false);
  const [showEventsListPanel, setShowEventsListPanel] = useState(false);
  const [listTab, setListTab] = useState<'ponctuels' | 'series'>('ponctuels');
  const [groupesEtendus, setGroupesEtendus] = useState<Record<string, boolean>>({});

  const eventParDefaut: Evenement = { titre: '', type: 'Congé', date_debut: format(new Date(), 'yyyy-MM-dd'), date_fin: format(new Date(), 'yyyy-MM-dd'), heure_debut: '', heure_fin: '', membres: [] };
  const [nouvelEvent, setNouvelEvent] = useState<Evenement>(eventParDefaut);
  const [editMode, setEditMode] = useState<'single' | 'series'>('single');
  
  const [horairesException, setHorairesException] = useState<Record<string, {debut: string, fin: string, pause: number}>>({
    A: {debut: '', fin: '', pause: 1}, B: {debut: '', fin: '', pause: 1}, Aucun: {debut: '', fin: '', pause: 1}
  });

  // NOUVEAU: Modification de rep.interval et rep.period
  const [rep, setRep] = useState({ active: false, interval: 1, period: 'weeks', date_limite: format(addMonths(new Date(), 1), 'yyyy-MM-dd'), rotation: false });
  const [quickEditEv, setQuickEditEv] = useState<Evenement | null>(null);
  const [newAbsHS, setNewAbsHS] = useState<AbsenceHS | null>(null);

  const isAbsenceType = ABSENCE_TYPES.includes(nouvelEvent.type);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (quickEditEv) { setQuickEditEv(null); return; }
      if (showEventModal) { setShowEventModal(false); return; }
      if (swapSession.active && swapSession.step === 2) { setSwapSession({ active: false, step: 1, selectedDates: [], m1Id: '', m2Id: '' }); return; }
      if (showEquipePanel) { setShowEquipePanel(false); return; }
      if (showEventsListPanel) { setShowEventsListPanel(false); return; }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [quickEditEv, showEventModal, swapSession, showEquipePanel, showEventsListPanel]);
  const mainTypeUI = isAbsenceType ? 'Absence' : (['Réunion', 'Animation', 'Soirée Jeux', 'Heures Exceptionnelles'].includes(nouvelEvent.type) ? nouvelEvent.type : 'Autre');
  const absTypeUI = nouvelEvent.type.includes('RTT') ? 'RTT' : nouvelEvent.type.includes('Récupération') ? 'Récupération' : 'Congé';
  const isDemiUI = nouvelEvent.type.startsWith('Demi-');

  const isTimeDisabled = mainTypeUI === 'Absence' && !isDemiUI && ['Congé', 'RTT'].includes(absTypeUI);

  const membresEnConge = useMemo(() => {
    if (!nouvelEvent.date_debut || !nouvelEvent.date_fin) return [];
    const start = nouvelEvent.date_debut;
    const end = nouvelEvent.date_fin;
    const absents = new Set<string>();
    
    activeEvenements.forEach(ev => {
      if (ev.id === nouvelEvent.id) return; 
      if (ABSENCE_TYPES.includes(ev.type)) {
        if (ev.date_debut <= end && ev.date_fin >= start) {
          if (!ev.membres || ev.membres.length === 0) {
            activeEquipe.forEach(m => absents.add(m.id)); 
          } else {
            ev.membres.forEach(mId => absents.add(mId));
          }
        }
      }
    });
    return Array.from(absents);
  }, [nouvelEvent.date_debut, nouvelEvent.date_fin, nouvelEvent.id, activeEvenements, activeEquipe]);

  const fillHorairesException = (dateStr: string) => {
    const dateObj = new Date(dateStr);
    const nomJour = format(dateObj, 'EEEE', { locale: fr }).toLowerCase();
    const typeSemaine = getISOWeek(dateObj) % 2 !== 0 ? 'semaineA' : 'semaineB';
    
    const newHoraires: Record<string, any> = {
      A: {debut: '', fin: '', pause: 1}, B: {debut: '', fin: '', pause: 1}, Aucun: {debut: '', fin: '', pause: 1}
    };
    
    ['A', 'B', 'Aucun'].forEach(grp => {
       const m = activeEquipe.find(e => (e.groupe || 'Aucun') === grp);
       if (m) {
         const hBase = getHoraireForDay(m, dateStr, nomJour, typeSemaine); 
         if (hBase && hBase.debut && hBase.fin) newHoraires[grp] = { debut: hBase.debut, fin: hBase.fin, pause: hBase.pause ?? 1 };
       }
    });
    setHorairesException(newHoraires);
  };

  const setMainType = (val: string) => {
    if (val === 'Absence') { setNouvelEvent({...nouvelEvent, type: 'Congé', heure_debut: '', heure_fin: ''}); }
    else {
      setNouvelEvent({...nouvelEvent, type: val});
      if (val === 'Soirée Jeux') fillHorairesException(nouvelEvent.date_debut);
    }
  };
  const setAbsType = (val: string) => setNouvelEvent({...nouvelEvent, type: `${isDemiUI ? 'Demi-' : ''}${val}`});
  const setIsDemi = (demi: boolean) => {
    if (!demi) setNouvelEvent({...nouvelEvent, type: absTypeUI, heure_debut: '', heure_fin: ''});
    else {
      setNouvelEvent({...nouvelEvent, type: `Demi-${absTypeUI}`});
      fillHorairesException(nouvelEvent.date_debut);
    }
  };

  const handleDateDebutChange = (newDebut: string) => {
    let newFin = nouvelEvent.date_fin;
    if (newDebut > newFin) newFin = newDebut;
    if (mainTypeUI === 'Soirée Jeux' || isDemiUI) fillHorairesException(newDebut);
    setNouvelEvent({...nouvelEvent, date_debut: newDebut, date_fin: newFin});
  };

  const chargerEquipe = async () => { 
    const { data, error } = await supabase.from('equipe').select('*').order('nom'); 
    if (error) console.error("Erreur Equipe:", error.message);
    if (data) setEquipe(data); 
  };

  const chargerEvenements = async () => { 
    const { data, error } = await supabase.from('evenements').select('*').order('date_debut'); 
    if (error) console.error("Erreur Événements:", error.message);
    if (data) setEvenements(data); 
  };

  useEffect(() => {
    chargerEquipe(); 
    chargerEvenements();
    
    fetch(`https://calendrier.api.gouv.fr/jours-feries/metropole/${dateActuelle.getFullYear()}.json`)
      .then(res => res.json())
      .then(data => setJoursFeries(data))
      .catch(console.error);

    const channel = supabase.channel('agenda_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipe' }, () => { chargerEquipe(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'evenements' }, () => { chargerEvenements(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [dateActuelle.getFullYear()]);

  useEffect(() => {
    fetch('https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/exports/json').then(res => res.json()).then(data => {
      if (!Array.isArray(data)) return;
      const mapVacances: Record<string, string[]> = {};
      data.forEach((r: any) => {
        if (r.population === "Enseignants" || !r.zones || !["Zone A", "Zone B", "Zone C"].includes(r.zones) || !r.start_date) return;
        eachDayOfInterval({ start: new Date(r.start_date), end: subDays(new Date(r.end_date), 1) }).forEach(d => {
          const dStr = format(d, 'yyyy-MM-dd');
          if (!mapVacances[dStr]) mapVacances[dStr] = [];
          if (!mapVacances[dStr].includes(r.zones)) mapVacances[dStr].push(r.zones);
        });
      });
      setVacances(mapVacances);
    }).catch(console.error);
  }, []);

  const toggleDraftMode = () => {
    if (!isDraftMode) {
      setDraftEquipe(JSON.parse(JSON.stringify(equipe)));
      setDraftEvenements(JSON.parse(JSON.stringify(evenements)));
      setDraftDeletedEvents([]); setIsDraftMode(true);
    } else {
      if(confirm("Annuler toutes les modifications non enregistrées ?")) setIsDraftMode(false);
    }
  };

  const appliquerDraft = async () => {
    try {
      for (const m of draftEquipe) {
        if (m.id.startsWith('draft-')) {
          const { id, ...rest } = m;
          await supabase.from('equipe').insert([rest]);
        } else await supabase.from('equipe').update({ nom: m.nom, role: m.role, groupe: m.groupe, heures_hebdo_base: m.heures_hebdo_base, solde_conges: m.solde_conges, solde_rtt: m.solde_rtt, solde_recup: m.solde_recup, horaires: m.horaires }).eq('id', m.id);
      }
      for (const ev of draftEvenements) {
        if (ev.id && ev.id.startsWith('draft-')) {
          const { id, ...rest } = ev;
          await supabase.from('evenements').insert([rest]);
        } else if (ev.id) {
          await supabase.from('evenements').update({ titre: ev.titre, type: ev.type, date_debut: ev.date_debut, date_fin: ev.date_fin, heure_debut: ev.heure_debut, heure_fin: ev.heure_fin, membres: ev.membres, parent_id: ev.parent_id }).eq('id', ev.id);
        }
      }
      for (const delId of draftDeletedEvents) await supabase.from('evenements').delete().eq('id', delId);
      setIsDraftMode(false); await chargerEquipe(); await chargerEvenements(); alert("✅ Le planning a été mis à jour avec succès !");
    } catch (e: any) { alert("Erreur lors de la sauvegarde : " + e.message); }
  };

  const sauvegarderMembre = async () => {
    if (!membreActif || !membreActif.nom) return;
    const payload = { nom: membreActif.nom, role: membreActif.role, groupe: membreActif.groupe, heures_hebdo_base: membreActif.heures_hebdo_base, solde_conges: membreActif.solde_conges, solde_rtt: membreActif.solde_rtt, solde_recup: membreActif.solde_recup, absences_hs: membreActif.absences_hs ?? [], horaires: membreActif.horaires };
    if (isDraftMode) {
      const idx = draftEquipe.findIndex(e => e.id === membreActif.id);
      if (idx >= 0) draftEquipe[idx] = membreActif;
      else setDraftEquipe([...draftEquipe, { ...membreActif, id: `draft-${Date.now()}` }]);
      setMembreActif(null);
    } else {
      if (membreActif.id === 'nouveau') await supabase.from('equipe').insert([payload]);
      else await supabase.from('equipe').update(payload).eq('id', membreActif.id);
      setMembreActif(null);
      chargerEquipe();
    }
  };

  const sauvegarderSoldes = async () => {
    if (!membreActif) return;
    const patch = {
      solde_conges: membreActif.solde_conges ?? 25,
      solde_rtt: membreActif.solde_rtt ?? 0,
      solde_recup: membreActif.solde_recup ?? 0,
      absences_hs: membreActif.absences_hs ?? [],
    };
    if (isDraftMode) {
      setDraftEquipe(prev => prev.map(m => m.id === membreActif.id ? { ...m, ...patch } : m));
      return;
    }
    const { error } = await supabase.from('equipe').update(patch).eq('id', membreActif.id);
    if (error) { alert('Erreur sauvegarde soldes : ' + error.message); return; }
    chargerEquipe();
  };

  const sauvegarderQuickEdit = async () => {
    if (!quickEditEv?.id) return;
    await supabase.from('evenements').update({
      type: quickEditEv.type,
      titre: quickEditEv.titre,
      date_debut: quickEditEv.date_debut,
      date_fin: quickEditEv.date_fin,
    }).eq('id', quickEditEv.id);
    setQuickEditEv(null);
    chargerEvenements();
  };

  const sauvegarderEvenement = async () => {
    if (!nouvelEvent.titre || !nouvelEvent.date_debut) return alert("Veuillez remplir au moins le titre et la date de début.");
    
    const occurrences: any[] = [];
    const isActiveSeries = editMode === 'series' || (rep.active && !nouvelEvent.id);
    const parentId = isActiveSeries ? (nouvelEvent.parent_id || `grp-${Date.now()}`) : (editMode === 'single' ? nouvelEvent.parent_id : undefined);

    if (rep.active && (!nouvelEvent.id || editMode === 'series')) {
      let currentDeb = new Date(nouvelEvent.date_debut);
      let currentFin = new Date(nouvelEvent.date_fin);
      
      let strDeb = nouvelEvent.date_debut;
      let strFin = nouvelEvent.date_fin;
      let i = 0;

      while (strDeb <= rep.date_limite && i < 156) {
         let occMembres = nouvelEvent.membres;
         if (rep.rotation && nouvelEvent.membres.length > 0) {
            occMembres = [nouvelEvent.membres[i % nouvelEvent.membres.length]];
         }
         
         occurrences.push({
           id: (i === 0 && nouvelEvent.id) ? nouvelEvent.id : undefined,
           parent_id: parentId,
           titre: nouvelEvent.titre,
           type: nouvelEvent.type,
           date_debut: strDeb,
           date_fin: strFin,
           heure_debut: nouvelEvent.heure_debut || null,
           heure_fin: nouvelEvent.heure_fin || null,
           membres: occMembres
         });
         
         if (rep.period === 'weeks') {
            currentDeb = addWeeks(currentDeb, rep.interval);
            currentFin = addWeeks(currentFin, rep.interval);
         } else if (rep.period === 'months') {
            currentDeb = addMonths(currentDeb, rep.interval);
            currentFin = addMonths(currentFin, rep.interval);
         }
         strDeb = format(currentDeb, 'yyyy-MM-dd');
         strFin = format(currentFin, 'yyyy-MM-dd');
         i++;
      }
    } else {
       occurrences.push({
           id: nouvelEvent.id, 
           parent_id: parentId,
           titre: nouvelEvent.titre,
           type: nouvelEvent.type,
           date_debut: nouvelEvent.date_debut,
           date_fin: nouvelEvent.date_fin,
           heure_debut: nouvelEvent.heure_debut || null,
           heure_fin: nouvelEvent.heure_fin || null,
           membres: nouvelEvent.membres
       });
    }

    let newEquipeState = isDraftMode ? [...draftEquipe] : [...equipe];
    let hasEquipeChanges = false;
    const membresToUpdate: string[] = [];

    if (mainTypeUI === 'Soirée Jeux' || isDemiUI) {
      const allDays: Date[] = [];
      occurrences.forEach(occ => {
         allDays.push(...eachDayOfInterval({start: new Date(occ.date_debut), end: new Date(occ.date_fin)}));
      });
      
      newEquipeState = newEquipeState.map(m => {
        const grp = m.groupe || 'Aucun';
        const h = horairesException[grp];
        const isAffected = mainTypeUI === 'Soirée Jeux' ? true : occurrences.some(occ => occ.membres.includes(m.id));

        if (h && h.debut && h.fin && isAffected) {
          hasEquipeChanges = true;
          if (!membresToUpdate.includes(m.id)) membresToUpdate.push(m.id);
          const newHoraires = JSON.parse(JSON.stringify(m.horaires || {}));
          if (!newHoraires.exceptions) newHoraires.exceptions = {};
          
          allDays.forEach(d => {
             const dStr = format(d, 'yyyy-MM-dd');
             const isMemberInOcc = mainTypeUI === 'Soirée Jeux' || occurrences.some(occ => occ.membres.includes(m.id) && occ.date_debut <= dStr && occ.date_fin >= dStr);
             if (isMemberInOcc) {
               newHoraires.exceptions[dStr] = { debut: h.debut, fin: h.fin, pause: h.pause !== undefined ? h.pause : 1, isSwap: false };
             }
          });
          return { ...m, horaires: newHoraires };
        }
        return m;
      });
    }

    if (isDraftMode) {
      const newDraftEvs = [...draftEvenements];
      
      if (editMode === 'series' && nouvelEvent.parent_id) {
         const idsToDelete = newDraftEvs.filter(e => e.parent_id === nouvelEvent.parent_id && e.id !== nouvelEvent.id).map(e => e.id!);
         setDraftDeletedEvents([...draftDeletedEvents, ...idsToDelete]);
         for (const dId of idsToDelete) {
           const idx = newDraftEvs.findIndex(e => e.id === dId);
           if(idx >= 0) newDraftEvs.splice(idx, 1);
         }
      }

      occurrences.forEach(occ => {
         if (occ.id) {
           const idx = newDraftEvs.findIndex(e => e.id === occ.id);
           if (idx >= 0) newDraftEvs[idx] = occ;
         } else {
           newDraftEvs.push({ ...occ, id: `draft-${Date.now()}-${Math.random()}` });
         }
      });
      setDraftEvenements(newDraftEvs);
      if (hasEquipeChanges) setDraftEquipe(newEquipeState);
      setShowEventModal(false); setNouvelEvent(eventParDefaut); setRep({...rep, active: false});
    } else {
      
      if (editMode === 'series' && nouvelEvent.parent_id) {
         await supabase.from('evenements').delete().eq('parent_id', nouvelEvent.parent_id).neq('id', nouvelEvent.id || '0');
      }

      const toUpdate = occurrences.filter(o => o.id);
      const toInsert = occurrences.filter(o => !o.id);

      if (toUpdate.length > 0) {
         for (const upd of toUpdate) {
           const { error } = await supabase.from('evenements').update(upd).eq('id', upd.id);
           if (error) { console.error("Erreur mise à jour événement:", error); alert("Erreur lors de la mise à jour : " + error.message); return; }
         }
      }
      if (toInsert.length > 0) {
         const toInsertClean = toInsert.map(occ => {
           // eslint-disable-next-line @typescript-eslint/no-unused-vars
           const { id, ...rest } = occ as Record<string, unknown>;
           if (rest.parent_id === undefined || rest.parent_id === null) {
             // eslint-disable-next-line @typescript-eslint/no-unused-vars
             const { parent_id, ...restWithoutParent } = rest;
             return restWithoutParent;
           }
           return rest;
         });
         const { error } = await supabase.from('evenements').insert(toInsertClean);
         if (error) { console.error("Erreur insertion événement:", error); alert("Erreur lors de la création : " + error.message); return; }
      }

      if (hasEquipeChanges) {
        const results = await Promise.all(
          newEquipeState.filter(m => membresToUpdate.includes(m.id)).map(m => supabase.from('equipe').update({ horaires: m.horaires }).eq('id', m.id))
        );
        const equipeError = results.find(r => r.error);
        if (equipeError?.error) console.error("Erreur mise à jour équipe:", equipeError.error);
        chargerEquipe();
      }
      setShowEventModal(false); setNouvelEvent(eventParDefaut); setRep({...rep, active: false}); chargerEvenements();
    }
  };

  const supprimerEvenement = async (id: string, deleteSeries: boolean = false, parentId?: string) => {
    const msg = deleteSeries ? "Voulez-vous vraiment supprimer TOUTE LA SÉRIE d'événements ?" : "Voulez-vous vraiment supprimer cet événement ?";
    if (!confirm(msg)) return;
    
    if (isDraftMode) {
      if (deleteSeries && parentId) {
         const idsToDelete = draftEvenements.filter(e => e.parent_id === parentId).map(e => e.id!);
         setDraftEvenements(draftEvenements.filter(e => e.parent_id !== parentId));
         setDraftDeletedEvents([...draftDeletedEvents, ...idsToDelete.filter(i => !i.startsWith('draft-'))]);
      } else {
         setDraftEvenements(draftEvenements.filter(e => e.id !== id));
         if (!id.startsWith('draft-')) setDraftDeletedEvents([...draftDeletedEvents, id]);
      }
    } else {
      if (deleteSeries && parentId) {
         await supabase.from('evenements').delete().eq('parent_id', parentId);
      } else {
         await supabase.from('evenements').delete().eq('id', id);
      }
      chargerEvenements();
    }
  };

  const ouvrirEditionEvenement = (ev: Evenement, mode: 'single' | 'series' = 'single') => { 
    setNouvelEvent(ev); 
    setEditMode(mode);
    if (mode === 'series' || (ev.parent_id && mode === 'single')) {
        const seriesEvs = activeEvenements.filter(e => e.parent_id === ev.parent_id);
        seriesEvs.sort((a,b) => a.date_debut.localeCompare(b.date_debut));
        const lastEv = seriesEvs[seriesEvs.length - 1];

        // Tentative de deviner l'intervalle si la série a au moins 2 dates
        let calcInterval = 1;
        let calcPeriod = 'weeks';
        if (seriesEvs.length > 1) {
            const d1 = new Date(seriesEvs[0].date_debut);
            const d2 = new Date(seriesEvs[1].date_debut);
            const diffDays = Math.round((d2.getTime() - d1.getTime()) / 86400000);
            if (diffDays % 7 === 0 && diffDays < 28) {
                calcInterval = diffDays / 7;
                calcPeriod = 'weeks';
            } else {
                calcPeriod = 'months';
                calcInterval = Math.round(diffDays / 30) || 1;
            }
        }

        setRep({ active: true, interval: calcInterval, period: calcPeriod, date_limite: lastEv.date_debut, rotation: false });
    } else {
        setRep({ active: false, interval: 1, period: 'weeks', date_limite: format(addMonths(new Date(ev.date_debut), 1), 'yyyy-MM-dd'), rotation: false });
    }
    if (ev.type === 'Soirée Jeux' || ev.type.startsWith('Demi-')) fillHorairesException(ev.date_debut);
    setShowEventsListPanel(false); 
    setShowEventModal(true); 
  };
  
  const dupliquerEvenement = () => {
    const duplicated = { ...nouvelEvent, id: undefined, parent_id: undefined, titre: nouvelEvent.titre + ' (Copie)' };
    setNouvelEvent(duplicated);
    setEditMode('single');
  };

  const toggleMembreEvent = (id: string) => setNouvelEvent(prev => ({ ...prev, membres: prev.membres.includes(id) ? prev.membres.filter(m => m !== id) : [...prev.membres, id] }));
  const updateHoraire = (jour: string, type: 'debut' | 'fin' | 'pause', valeur: string | number) => {
    if (!membreActif) return;
    const newHoraires = { ...membreActif.horaires };
    if (!newHoraires[semaineActive]) newHoraires[semaineActive] = {};
    if (!newHoraires[semaineActive][jour]) newHoraires[semaineActive][jour] = { debut: '', fin: '', pause: 1 };
    newHoraires[semaineActive][jour][type] = valeur;
    setMembreActif({ ...membreActif, horaires: newHoraires });
  };
  const inverserSemaines = () => setMembreActif(membreActif ? { ...membreActif, horaires: { semaineA: JSON.parse(JSON.stringify(membreActif.horaires?.semaineB || {})), semaineB: JSON.parse(JSON.stringify(membreActif.horaires?.semaineA || {})) } } : null);

  const toggleSwapDate = (dateKey: string) => setSwapSession(prev => ({...prev, selectedDates: prev.selectedDates.includes(dateKey) ? prev.selectedDates.filter(d => d !== dateKey) : [...prev.selectedDates, dateKey]}));

  const validerSelectionSwap = () => {
    let newDates = [...swapSession.selectedDates];
    const samedis = newDates.filter(d => format(new Date(d), 'EEEE', { locale: fr }).toLowerCase() === 'samedi');
    if (samedis.length > 0) {
      if (confirm("Vous avez sélectionné un ou plusieurs samedi(s). Souhaitez-vous également échanger le(s) vendredi(s) précédent(s) ?")) {
        samedis.forEach(samedi => {
          const vendredi = format(subDays(new Date(samedi), 1), 'yyyy-MM-dd');
          if (!newDates.includes(vendredi)) newDates.push(vendredi);
        });
      }
    }
    setSwapSession(prev => ({...prev, step: 2, selectedDates: newDates}));
  };

  const executerEchange = async () => {
    if (!swapSession.m1Id || !swapSession.m2Id) return alert("Sélectionnez deux membres.");
    if (!isDraftMode && !confirm("Cet échange va être appliqué définitivement. Confirmer ?")) return;
    
    let newEquipe = isDraftMode ? [...draftEquipe] : [...equipe];
    let newEvenements = isDraftMode ? [...draftEvenements] : [...evenements];

    const idx1 = newEquipe.findIndex(e => e.id === swapSession.m1Id);
    const idx2 = newEquipe.findIndex(e => e.id === swapSession.m2Id);
    if (idx1 < 0 || idx2 < 0) return;
    
    const eq1 = JSON.parse(JSON.stringify(newEquipe[idx1]));
    const eq2 = JSON.parse(JSON.stringify(newEquipe[idx2]));
    
    if (!eq1.horaires) eq1.horaires = {}; if (!eq1.horaires.exceptions) eq1.horaires.exceptions = {};
    if (!eq2.horaires) eq2.horaires = {}; if (!eq2.horaires.exceptions) eq2.horaires.exceptions = {};

    swapSession.selectedDates.forEach(dateKey => {
      const nomJour = format(new Date(dateKey), 'EEEE', { locale: fr }).toLowerCase();
      const typeSemaine = getISOWeek(new Date(dateKey)) % 2 !== 0 ? 'semaineA' : 'semaineB';
      
      const h1 = getHoraireForDay(eq1, dateKey, nomJour, typeSemaine);
      const h2 = getHoraireForDay(eq2, dateKey, nomJour, typeSemaine);

      eq1.horaires.exceptions[dateKey] = h2 ? { ...h2, isSwap: true } : { debut: '', fin: '', pause: 1, isSwap: true };
      eq2.horaires.exceptions[dateKey] = h1 ? { ...h1, isSwap: true } : { debut: '', fin: '', pause: 1, isSwap: true };

      newEvenements = newEvenements.map(ev => {
        if (ev.date_debut <= dateKey && ev.date_fin >= dateKey) {
          // Les absences (Congé, RTT…) restent attachées à la personne d'origine.
          // On ne les redistribue pas lors d'un échange de jours.
          if (ABSENCE_TYPES.includes(ev.type)) return ev;
          const hasM1 = ev.membres.includes(swapSession.m1Id);
          const hasM2 = ev.membres.includes(swapSession.m2Id);
          if (hasM1 !== hasM2) {
             let newMembres = [...ev.membres];
             if (hasM1) {
               newMembres = newMembres.filter(id => id !== swapSession.m1Id);
               newMembres.push(swapSession.m2Id);
             } else {
               newMembres = newMembres.filter(id => id !== swapSession.m2Id);
               newMembres.push(swapSession.m1Id);
             }
             return { ...ev, membres: newMembres };
          }
        }
        return ev;
      });
    });

    newEquipe[idx1] = eq1; newEquipe[idx2] = eq2;

    if (isDraftMode) {
      setDraftEquipe(newEquipe);
      setDraftEvenements(newEvenements);
      setSwapSession({ active: false, step: 1, selectedDates: [], m1Id: '', m2Id: '' });
    } else {
      await Promise.all([
        supabase.from('equipe').update({ horaires: eq1.horaires }).eq('id', eq1.id),
        supabase.from('equipe').update({ horaires: eq2.horaires }).eq('id', eq2.id)
      ]);
      
      const evsToUpdate = newEvenements.filter(ev => ev.id && JSON.stringify(ev.membres) !== JSON.stringify(evenements.find(e => e.id === ev.id)?.membres));
      await Promise.all(evsToUpdate.map(ev => supabase.from('evenements').update({ membres: ev.membres }).eq('id', ev.id)));

      chargerEquipe(); chargerEvenements();
      setSwapSession({ active: false, step: 1, selectedDates: [], m1Id: '', m2Id: '' });
    }
  };

  const genererBlocsHoraires = (membresDuJour: any[]) => {
    const points = new Set<string>();
    membresDuJour.forEach(m => { if(m.debut && m.fin) { points.add(m.debut); points.add(m.fin); } });
    const timepoints = Array.from(points).sort((a, b) => timeToMins(a, true) - timeToMins(b, true)); 
    
    const blocs = [];
    for (let i = 0; i < timepoints.length - 1; i++) {
      const start = timepoints[i];
      const end = timepoints[i+1];
      const startMins = timeToMins(start, true);
      const endMins = timeToMins(end, true);
      
      const presents = membresDuJour.filter(m => timeToMins(m.debut) <= startMins && timeToMins(m.fin, true) >= endMins);
      if (presents.length > 0) blocs.push({ debut: start, fin: end, membresInfos: presents, noms: presents.map(p => p.nom).sort() });
    }
    return blocs;
  };

  const genererBlocsMensuels = (membresDuJour: any[]) => {
    const groupes: Record<string, any> = {};
    membresDuJour.forEach(m => {
      const key = `${m.debut}-${m.fin}`;
      if (!groupes[key]) groupes[key] = { debut: m.debut, fin: m.fin, membresInfos: [], noms: [] };
      groupes[key].membresInfos.push(m);
      groupes[key].noms.push(m.nom);
    });
    return Object.values(groupes).sort((a: any, b: any) => timeToMins(a.debut) - timeToMins(b.debut));
  };

  const calculerHeuresSemaine = (horairesSemaine: any) => {
    let totalMinutes = 0;
    Object.values(horairesSemaine || {}).forEach((h: any) => {
      if (h.debut && h.fin) {
        const diff = (timeToMins(h.fin, true) - timeToMins(h.debut)) - ((h.pause !== undefined ? h.pause : 1) * 60);
        if (diff > 0) totalMinutes += diff;
      }
    });
    return totalMinutes / 60;
  };

  const calculerPositionTop = (heureString: string, isEnd = false) => {
    if (!heureString) return 0;
    let [h, m] = heureString.split(':').map(Number);
    if (isEnd && h === 0 && m === 0) h = 24;
    return Math.max(0, Math.min(100, (((h - HEURE_DEBUT) * 60 + m) / ((HEURE_FIN - HEURE_DEBUT) * 60)) * 100));
  };

  const getNomsMembresEvent = (membresIds: string[]) => (!membresIds || membresIds.length === 0 || membresIds.length === activeEquipe.length) ? "Toute l'équipe" : membresIds.map(id => activeEquipe.find(e => e.id === id)?.nom).filter(Boolean).join(', ');

  const joursAffiches = useMemo(() => {
    const debutMois = startOfMonth(dateActuelle);
    const finMois = endOfMonth(debutMois);
    return vue === "Mois" ? eachDayOfInterval({ start: startOfWeek(debutMois, { weekStartsOn: 1 }), end: endOfWeek(finMois, { weekStartsOn: 1 }) }) : eachDayOfInterval({ start: startOfWeek(dateActuelle, { weekStartsOn: 1 }), end: endOfWeek(dateActuelle, { weekStartsOn: 1 }) });
  }, [dateActuelle, vue]);
  
  const [alertes, setAlertes] = useState<{amplitude: string[], heuresSupp: string[]}>({amplitude: [], heuresSupp: []});
  
  useEffect(() => {
    if (!isDraftMode) return;
    const amps: string[] = [];
    const supps: string[] = [];

    if (vue === "Semaine") {
      activeEquipe.forEach(m => {
        let draftWeekMins = 0;
        let baseWeekMins = 0;
        let hasSwapThisWeek = false;

        joursAffiches.forEach(jour => {
          const dateKey = format(jour, 'yyyy-MM-dd');
          const nomJour = format(jour, 'EEEE', { locale: fr }).toLowerCase();
          const typeSemaine = getISOWeek(jour) % 2 !== 0 ? 'semaineA' : 'semaineB';
          const evsDuJour = activeEvenements.filter(e => e.date_debut <= dateKey && e.date_fin >= dateKey);

          const { expected, actual, amplitude, hasSwap } = getDailyMinutes(m, dateKey, nomJour, typeSemaine, evsDuJour, !!joursFeries[dateKey]);
          baseWeekMins += expected;
          draftWeekMins += actual;
          
          if (hasSwap) hasSwapThisWeek = true;
          if (amplitude > 10 * 60) amps.push(`⚠️ ${m.nom} dépasse 10h d'amplitude le ${format(jour, 'dd/MM')}`);
        });

        const diffMins = draftWeekMins - baseWeekMins;
        if (diffMins > 10) {
           if (hasSwapThisWeek) supps.push(`🔄 ${m.nom} : +${(diffMins / 60).toFixed(1)}h (Échange de jours)`);
           else supps.push(`📈 ${m.nom} : +${(diffMins / 60).toFixed(1)}h / prévu`);
        }
      });
    }

    setAlertes(prev => {
      const sameAmps = prev.amplitude.length === amps.length && prev.amplitude.every((a, i) => a === amps[i]);
      const sameSupps = prev.heuresSupp.length === supps.length && prev.heuresSupp.every((s, i) => s === supps[i]);
      if (sameAmps && sameSupps) return prev;
      return { amplitude: amps, heuresSupp: supps };
    });
  }, [activeEquipe, activeEvenements, joursAffiches, isDraftMode, vue, joursFeries]);

  const statsPerso = useMemo(() => {
    if (!membreActif || ongletMembre !== "suivi") return null;

    const currentYear = dateActuelle.getFullYear();
    let congesPrisJours = 0;
    let rttPrisJours = 0;
    let recupPriseHeures = 0;

    activeEvenements.forEach(ev => {
      if (getYear(new Date(ev.date_debut)) === currentYear && (!ev.membres.length || ev.membres.includes(membreActif.id))) {
        if (ev.type.includes('Congé')) {
          const factor = ev.type.startsWith('Demi-') ? 0.5 : 1;
          congesPrisJours += compterJoursTravailles(ev.date_debut, ev.date_fin, membreActif, joursFeries) * factor;
        }
        if (ev.type.includes('RTT')) {
          const factor = ev.type.startsWith('Demi-') ? 0.5 : 1;
          rttPrisJours += compterJoursTravailles(ev.date_debut, ev.date_fin, membreActif, joursFeries) * factor;
        }
        if (ev.type.includes('Récupération')) {
          if (ev.heure_debut && ev.heure_fin) recupPriseHeures += (timeToMins(ev.heure_fin, true) - timeToMins(ev.heure_debut)) / 60;
          else recupPriseHeures += (membreActif.heures_hebdo_base / 5);
        }
      }
    });

    // Absences hors système (périodes datées)
    for (const ab of (membreActif.absences_hs ?? [])) {
      const jours = compterJoursTravailles(ab.debut, ab.fin, membreActif, joursFeries);
      if (ab.type === 'conge') congesPrisJours += jours;
      else if (ab.type === 'rtt') rttPrisJours += jours;
      else recupPriseHeures += jours * (membreActif.heures_hebdo_base / 5);
    }

    const joursMois = eachDayOfInterval({ start: startOfMonth(dateActuelle), end: endOfMonth(dateActuelle) });
    let totalExpectedMois = 0;
    let totalActualMois = 0;

    joursMois.forEach(jour => {
      const dateKey = format(jour, 'yyyy-MM-dd');
      const nomJour = format(jour, 'EEEE', { locale: fr }).toLowerCase();
      const typeSemaine = getISOWeek(jour) % 2 !== 0 ? 'semaineA' : 'semaineB';
      const evsDuJour = activeEvenements.filter(e => e.date_debut <= dateKey && e.date_fin >= dateKey);
      
      const { expected, actual } = getDailyMinutes(membreActif, dateKey, nomJour, typeSemaine, evsDuJour, !!joursFeries[dateKey]);
      totalExpectedMois += expected;
      totalActualMois += actual;
    });

    const diffMoisHeures = (totalActualMois - totalExpectedMois) / 60;
    const eventsDuMois = activeEvenements.filter(e => 
      (!e.membres.length || e.membres.includes(membreActif.id)) &&
      (isSameMonth(new Date(e.date_debut), dateActuelle) || isSameMonth(new Date(e.date_fin), dateActuelle))
    ).sort((a,b) => a.date_debut.localeCompare(b.date_debut));

    return { congesPrisJours, rttPrisJours, recupPriseHeures, diffMoisHeures, eventsDuMois };
  }, [membreActif, dateActuelle, activeEvenements, joursFeries, ongletMembre]);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const eventsEnCours = activeEvenements.filter(e => !e.parent_id && e.date_debut <= todayStr && e.date_fin >= todayStr).sort((a,b) => a.date_debut.localeCompare(b.date_debut));
  const eventsAVenir = activeEvenements.filter(e => !e.parent_id && e.date_debut > todayStr).sort((a,b) => a.date_debut.localeCompare(b.date_debut));
  const eventsPasses = activeEvenements.filter(e => !e.parent_id && e.date_fin < todayStr).sort((a,b) => b.date_debut.localeCompare(a.date_debut));

  const groupesSeries = useMemo(() => {
     const groupes: Record<string, Evenement[]> = {};
     activeEvenements.forEach(ev => {
        if (ev.parent_id) {
           if (!groupes[ev.parent_id]) groupes[ev.parent_id] = [];
           groupes[ev.parent_id].push(ev);
        }
     });
     Object.values(groupes).forEach(arr => arr.sort((a,b) => a.date_debut.localeCompare(b.date_debut)));
     return groupes;
  }, [activeEvenements]);

  const heuresA = membreActif ? calculerHeuresSemaine(membreActif.horaires?.semaineA) : 0;
  const heuresB = membreActif ? calculerHeuresSemaine(membreActif.horaires?.semaineB) : 0;
  const moyenneHeures = (heuresA + heuresB) / 2;
  const diffHeures = membreActif ? moyenneHeures - membreActif.heures_hebdo_base : 0;

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      <NavBar current="agenda" />

      {isDraftMode && (
        <div style={{ position: "fixed", top: 64, left: 0, right: 0, background: "#f97316", color: "#fff", zIndex: 9999, padding: "12px 24px", display: "flex", flexDirection: "column", boxShadow: "0 4px 0 var(--ink)", borderBottom: "2.5px solid var(--ink)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: "96%", margin: "0 auto", width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className="bc" style={{ fontSize: 15 }}>🛠️ Mode Prévision</span>
              {(alertes.amplitude.length > 0 || alertes.heuresSupp.length > 0) && (
                <span style={{ background: "rgba(255,255,255,0.2)", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                  ⚠️ {alertes.amplitude.length + alertes.heuresSupp.length} alerte(s)
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={toggleDraftMode} className="pop-btn pop-btn-outline" style={{ fontSize: 13, padding: "6px 14px", background: "rgba(255,255,255,0.15)", borderColor: "rgba(255,255,255,0.6)", color: "#fff" }}>Annuler</button>
              <button onClick={appliquerDraft} className="pop-btn" style={{ fontSize: 13, padding: "6px 14px", background: "#fff", color: "#f97316", borderColor: "rgba(255,255,255,0.8)" }}>Publier</button>
            </div>
          </div>
          {(alertes.amplitude.length > 0 || alertes.heuresSupp.length > 0) && (
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 120, overflowY: "auto" }} className="hide-scrollbar">
              {alertes.amplitude.map((a, i) => <div key={`a-${i}`} style={{ background: "#fff1f2", color: "#e11d48", padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, border: "1.5px solid #fda4af" }}>{a}</div>)}
              {alertes.heuresSupp.map((s, i) => <div key={`s-${i}`} style={{ background: s.includes('🔄') ? "#f3e8ff" : "#eff6ff", color: s.includes('🔄') ? "#9333ea" : "#2563eb", padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, border: `1.5px solid ${s.includes('🔄') ? '#d8b4fe' : '#93c5fd'}` }}>{s}</div>)}
            </div>
          )}
        </div>
      )}

      {swapSession.active && swapSession.step === 1 && (
        <div style={{ position: "fixed", bottom: 40, left: "50%", transform: "translateX(-50%)", background: "var(--bleu)", color: "var(--ink)", zIndex: 100, padding: "14px 28px", borderRadius: 50, display: "flex", alignItems: "center", gap: 24, border: "2.5px solid var(--ink)", boxShadow: "4px 4px 0 var(--ink)" }}>
          <span className="bc" style={{ fontSize: 15 }}>🔄 Sélectionnez le(s) jour(s) à échanger</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setSwapSession({ active: false, step: 1, selectedDates: [], m1Id: '', m2Id: '' })} className="pop-btn pop-btn-outline" style={{ fontSize: 13, padding: "6px 14px" }}>Annuler</button>
            {swapSession.selectedDates.length > 0 && (
              <button onClick={validerSelectionSwap} className="pop-btn pop-btn-dark" style={{ fontSize: 13, padding: "6px 16px" }}>Valider ({swapSession.selectedDates.length})</button>
            )}
          </div>
        </div>
      )}

      {showSettings && (
        <div className="pop-card" style={{ position: "fixed", bottom: 24, right: 24, width: 260, padding: 20, zIndex: 50 }}>
          <p className="bc" style={{ fontSize: 13, marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.06em" }}>Couleurs du Planning</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { label: 'Principale (Équipe)', key: 'accent' },
              { label: 'Sous-Équipe A', key: 'equipeA' },
              { label: 'Sous-Équipe B', key: 'equipeB' },
              { label: 'Équipe Mixte (Échange)', key: 'swap' },
              { label: 'Vacances Zone A', key: 'zoneA' },
              { label: 'Vacances Zone B', key: 'zoneB' },
              { label: 'Vacances Zone C', key: 'zoneC' }
            ].map(c => (
              <div key={c.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>{c.label}</label>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(0,0,0,0.4)", textTransform: "uppercase" }}>{couleurs[c.key as keyof typeof couleurs]}</span>
                  <input type="color" value={couleurs[c.key as keyof typeof couleurs]} onChange={e => setCouleurs({...couleurs, [c.key]: e.target.value})} style={{ width: 24, height: 24, borderRadius: 4, cursor: "pointer", border: "none", padding: 0 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pop-page" style={{ display: "flex", flexDirection: "column", gap: 20, paddingTop: isDraftMode ? 160 : undefined }}>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h1 className="bc" style={{ fontSize: 36, margin: 0, lineHeight: 1.1 }}>
              Agenda <span style={{ color: "rgba(0,0,0,0.35)", fontWeight: 900 }} className="capitalize">
                {vue === "Mois" ? format(dateActuelle, 'MMMM yyyy', { locale: fr }) : `Sem. ${format(startOfWeek(dateActuelle, { weekStartsOn: 1 }), 'w', { locale: fr })}`}
              </span>
            </h1>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
              <button onClick={() => setDateActuelle(vue === "Mois" ? subMonths(dateActuelle, 1) : subWeeks(dateActuelle, 1))} className="pop-btn pop-btn-outline" style={{ padding: "8px 12px", fontSize: 14 }}>◀</button>
              <div className="pop-card" style={{ display: "flex", padding: "4px 6px", gap: 0 }}>
                <select value={dateActuelle.getMonth()} onChange={e => setDateActuelle(setMonth(dateActuelle, parseInt(e.target.value)))} style={{ background: "transparent", border: "none", padding: "6px 8px", fontWeight: 700, fontSize: 13, color: "var(--ink)", cursor: "pointer", outline: "none", fontFamily: "inherit" }} className="capitalize">
                  {Array.from({ length: 12 }).map((_, i) => <option key={i} value={i}>{format(new Date(2000, i, 1), 'MMMM', { locale: fr })}</option>)}
                </select>
                <select value={dateActuelle.getFullYear()} onChange={e => setDateActuelle(setYear(dateActuelle, parseInt(e.target.value)))} style={{ background: "transparent", border: "none", padding: "6px 8px", fontWeight: 700, fontSize: 13, color: "var(--ink)", cursor: "pointer", outline: "none", fontFamily: "inherit" }}>
                  {Array.from({ length: 10 }).map((_, i) => <option key={i} value={new Date().getFullYear() - 2 + i}>{new Date().getFullYear() - 2 + i}</option>)}
                </select>
              </div>
              <button onClick={() => setDateActuelle(new Date())} className="pop-btn pop-btn-outline" style={{ fontSize: 13, padding: "8px 14px" }}>Aujourd'hui</button>
              <button onClick={() => setDateActuelle(vue === "Mois" ? addMonths(dateActuelle, 1) : addWeeks(dateActuelle, 1))} className="pop-btn pop-btn-outline" style={{ padding: "8px 12px", fontSize: 14 }}>▶</button>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            {!isDraftMode && (
              <button onClick={toggleDraftMode} className="pop-btn pop-btn-outline" style={{ fontSize: 13, background: "#fff7ed", borderColor: "#fb923c", color: "#ea580c" }}>
                🛠️ Prévision
              </button>
            )}
            <div className="pop-card" style={{ display: "flex", padding: 4, gap: 0 }}>
              <button onClick={() => setVue("Mois")} className="pop-btn" style={{ fontSize: 13, padding: "6px 16px", background: vue === "Mois" ? "var(--yellow)" : "transparent", boxShadow: vue === "Mois" ? "2px 2px 0 var(--ink)" : "none", border: vue === "Mois" ? "2px solid var(--ink)" : "2px solid transparent" }}>Mois</button>
              <button onClick={() => setVue("Semaine")} className="pop-btn" style={{ fontSize: 13, padding: "6px 16px", background: vue === "Semaine" ? "var(--yellow)" : "transparent", boxShadow: vue === "Semaine" ? "2px 2px 0 var(--ink)" : "none", border: vue === "Semaine" ? "2px solid var(--ink)" : "2px solid transparent" }}>Semaine</button>
            </div>
            <button onClick={() => setShowEventsListPanel(true)} className="pop-btn pop-btn-outline" style={{ fontSize: 13 }}>📅 Événements</button>
            <button onClick={() => { setOngletMembre("profil"); setShowEquipePanel(true); }} className="pop-btn pop-btn-outline" style={{ fontSize: 13 }}>👥 Équipe</button>
            <button onClick={() => setShowSettings(!showSettings)} className="pop-btn pop-btn-outline" style={{ fontSize: 18, padding: "6px 10px" }}>⚙️</button>
            <button onClick={() => {
              const dStr = format(dateActuelle, 'yyyy-MM-dd');
              setNouvelEvent({...eventParDefaut, date_debut: dStr, date_fin: dStr});
              setEditMode('single');
              setRep({ active: false, interval: 1, period: 'weeks', date_limite: format(addMonths(new Date(), 1), 'yyyy-MM-dd'), rotation: false });
              setShowEventModal(true);
            }} className="pop-btn pop-btn-dark" style={{ fontSize: 13 }}>+ Ajouter</button>
          </div>
        </div>

        <div className="pop-card" style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1 }}>
          <div style={{ display: "grid", borderBottom: "2px solid var(--ink)", background: "var(--cream2)", borderRadius: "10px 10px 0 0", gridTemplateColumns: vue === "Semaine" ? "60px 1fr 1fr 1fr 1fr 1fr 1fr 1fr" : "repeat(7, 1fr)" }}>
            {vue === "Semaine" && <div style={{ padding: "10px 0" }}></div>}
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(jour => (
              <div key={jour} className="bc" style={{ padding: "10px 0", textAlign: "center", color: "rgba(0,0,0,0.45)", fontSize: 11, letterSpacing: "0.08em" }}>{jour}</div>
            ))}
          </div>

          {vue === "Mois" ? (
            <div className="flex-1 grid grid-cols-7 auto-rows-fr">
              {joursAffiches.map((jour, i) => {
                const dateKey = format(jour, 'yyyy-MM-dd');
                const nomFerie = joursFeries[dateKey];
                const zonesVacances = vacances[dateKey] || [];
                const typeSemaine = getISOWeek(jour) % 2 !== 0 ? 'semaineA' : 'semaineB';
                const nomJour = format(jour, 'EEEE', { locale: fr }).toLowerCase();
                const isSelectedForSwap = swapSession.selectedDates.includes(dateKey);
                
                const evenementsDuJour = activeEvenements.filter(e => e.date_debut <= dateKey && e.date_fin >= dateKey);
                let presencesDuJour: any[] = [];

                if (!nomFerie) {
                  activeEquipe.forEach(m => {
                    const h = getHoraireForDay(m, dateKey, nomJour, typeSemaine);
                    if (h && h.debut && h.fin) {
                      let segments = [{ debut: h.debut, fin: h.fin }];
                      const eventsMembre = evenementsDuJour.filter(e => ABSENCE_TYPES.includes(e.type) && (!e.membres || e.membres.length === 0 || e.membres.includes(m.id)));
                      
                      eventsMembre.forEach(ev => {
                        if (!ev.heure_debut || !ev.heure_fin) {
                          segments = [];
                        } else {
                          const newSegments: any[] = [];
                          segments.forEach(seg => {
                            newSegments.push(...soustraireHeures(seg.debut, seg.fin, ev.heure_debut!, ev.heure_fin!));
                          });
                          segments = newSegments;
                        }
                      });

                      segments.forEach(seg => presencesDuJour.push({ nom: m.nom, groupe: m.groupe, debut: seg.debut, fin: seg.fin }));
                    }
                  });
                }

                const blocsHoraires = genererBlocsMensuels(presencesDuJour);

                return (
                  <div key={i}
                    onClick={() => {
                      if (swapSession.active && swapSession.step === 1) toggleSwapDate(dateKey);
                      else { setDateActuelle(jour); setVue("Semaine"); }
                    }}
                    style={{
                      borderRight: "1.5px solid rgba(0,0,0,0.08)",
                      borderBottom: "1.5px solid rgba(0,0,0,0.08)",
                      background: isSelectedForSwap ? "rgba(96,165,250,0.15)" : isSameMonth(jour, dateActuelle) ? "var(--white)" : "rgba(0,0,0,0.02)",
                      outline: isSelectedForSwap ? "3px solid var(--bleu)" : "none",
                      outlineOffset: -3,
                    }}
                    className="transition-colors relative flex flex-col min-h-[120px] group cursor-pointer hover:bg-[#fafafa]">
                    
                    <div className="absolute top-0 left-0 right-0 flex h-1.5 z-20">
                      {zonesVacances.includes("Zone A") && <div className="flex-1 opacity-30" style={{backgroundColor: couleurs.zoneA}}></div>}
                      {zonesVacances.includes("Zone B") && <div className="flex-1 opacity-30" style={{backgroundColor: couleurs.zoneB}}></div>}
                      {zonesVacances.includes("Zone C") && <div className="flex-1 opacity-80" style={{backgroundColor: couleurs.zoneC}}></div>}
                    </div>

                    <div className="flex justify-between items-start pt-2 px-2 z-20 pointer-events-none">
                      <div className="flex flex-col gap-1 w-full mr-2">
                        {nomFerie && <span className="text-[10px] font-black text-rose-500 uppercase leading-none bg-white/90 px-1.5 py-0.5 rounded shadow-sm backdrop-blur-sm line-clamp-1">{nomFerie}</span>}
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {evenementsDuJour.filter(e => !['Soirée Jeux', 'Heures Exceptionnelles'].includes(e.type)).map((ev, idx) => (
                            <div key={`dot-${idx}`} className={`w-2.5 h-2.5 rounded-full shadow-sm ${getEventDotColor(ev.type)}`}></div>
                          ))}
                        </div>
                      </div>
                      <span className={`font-bold flex items-center justify-center w-7 h-7 rounded-full shrink-0 shadow-sm backdrop-blur-sm ${isToday(jour) ? 'text-black' : nomFerie ? 'bg-white/90 text-rose-600' : 'bg-white/80 text-slate-700'}`} style={isToday(jour) ? {backgroundColor: couleurs.accent} : {}}>
                        {format(jour, 'd')}
                      </span>
                    </div>

                    <div className="flex-1 flex flex-col w-full h-full pt-2 pb-1 px-1 gap-1 z-10 overflow-y-auto hide-scrollbar pointer-events-none">
                      {blocsHoraires.map((bloc: any, idx: number) => {
                        const bgColor = getBlocColor(bloc.membresInfos, activeEquipe);
                        const absInBloc = evenementsDuJour.filter(e => ABSENCE_TYPES.includes(e.type) && e.membres.some(mId => bloc.membresInfos.find((m:any) => m.id === mId)));
                        
                        return (
                          <div key={idx} className="flex-1 border-l-4 rounded p-1.5 flex flex-col justify-center min-h-[30px] hover:brightness-95 text-black" style={{ backgroundColor: bgColor, borderColor: bgColor }}>
                            <span className="font-bold text-[10px] leading-tight line-clamp-1">{bloc.noms.join(', ')}</span>
                            {absInBloc.length > 0 && (
                                <div className="mt-0.5 flex flex-wrap gap-0.5">
                                  {absInBloc.map((abs, aIdx) => (
                                    <span key={`a-${aIdx}`} className="text-[8px] font-bold text-white bg-rose-500/90 px-1 py-0.5 rounded-sm leading-none">{abs.type.replace('Demi-', '1/2 ')} : {getNomsMembresEvent(abs.membres)}</span>
                                  ))}
                                </div>
                            )}
                            <span className="text-[9px] font-medium opacity-80 mt-auto">{bloc.debut}-{bloc.fin}</span>
                          </div>
                        )
                      })}

                      {evenementsDuJour.filter(e => ['Soirée Jeux', 'Heures Exceptionnelles'].includes(e.type)).map((ev, idx) => (
                        <div key={`ev-m-${idx}`} onClick={(e) => { e.stopPropagation(); ouvrirEditionEvenement(ev, 'single'); }} className={`flex-1 border-l-4 rounded p-1.5 flex flex-col justify-center min-h-[30px] shadow-sm mt-1 cursor-pointer pointer-events-auto hover:scale-105 transition-transform ${getEventStyle(ev.type, false)}`}>
                          <span className="font-bold text-[10px] leading-tight line-clamp-1 flex items-center gap-1">
                            {getEventIcon(ev.type)} {ev.titre}
                          </span>
                          {ev.heure_debut && ev.heure_fin && (
                            <span className="text-[9px] font-medium opacity-80">{ev.heure_debut} - {ev.heure_fin}</span>
                          )}
                        </div>
                      ))}
                    </div>

                    {!swapSession.active && (
                      <div className="absolute left-8 top-8 w-80 bg-white border border-slate-200 shadow-2xl rounded-3xl p-5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-0 group-hover:duration-200 group-hover:delay-700 delay-0 z-[999] pointer-events-none flex flex-col gap-3">
                        <p className="font-black text-sm capitalize border-b pb-2">{format(jour, 'EEEE d MMMM', { locale: fr })}</p>
                        
                        {evenementsDuJour.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Événements</p>
                            {evenementsDuJour.map((e, i) => (
                              <div key={i} className="text-xs font-bold flex flex-col gap-0.5">
                                <span className="truncate">{getEventIcon(e.type)} {e.titre}</span>
                                <span className="text-[9px] text-slate-500">{e.heure_debut ? `${e.heure_debut} - ${e.heure_fin}` : 'Journée entière'}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Présences confirmées</p>
                          {nomFerie ? (
                            <span className="text-xs text-rose-500 font-bold italic">Jour Férié</span>
                          ) : blocsHoraires.length === 0 ? (
                            <span className="text-xs text-slate-400 italic">Aucune présence prévue</span>
                          ) : (
                            blocsHoraires.map((c: any, i: number) => (
                              <div key={i} className="text-xs flex justify-between border-b border-slate-50 pb-1">
                                <span className="font-bold truncate pr-2">{c.noms.join(', ')}</span>
                                <span className="text-slate-500 whitespace-nowrap">{c.debut} - {c.fin}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", position: "relative", minHeight: 900, overflow: "hidden", background: "rgba(0,0,0,0.01)" }}>
              <div style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none", marginLeft: 60 }}>
                {HEURES_GRILLE.map((heure, i) => (
                  <div key={i} style={{ position: "absolute", width: "100%", borderTop: "1px solid rgba(0,0,0,0.07)", top: `${calculerPositionTop(heure + ':00')}%` }}></div>
                ))}
              </div>
              <div style={{ width: 60, borderRight: "1.5px solid rgba(0,0,0,0.1)", display: "flex", flexDirection: "column", background: "var(--white)", zIndex: 10, position: "relative" }}>
                {HEURES_GRILLE.map((heure, i) => (
                  <div key={i} style={{ position: "absolute", width: "100%", fontSize: 11, fontWeight: 700, color: "rgba(0,0,0,0.35)", textAlign: "center", top: `${calculerPositionTop(heure + ':00')}%`, marginTop: -7 }}>
                    {heure}:00
                  </div>
                ))}
              </div>
              <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", position: "relative" }}>
                <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", pointerEvents: "none" }}>
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} style={{ borderRight: "1px solid rgba(0,0,0,0.07)" }}></div>
                  ))}
                </div>

                {joursAffiches.map((jour, i) => {
                  const dateKey = format(jour, 'yyyy-MM-dd');
                  const nomFerie = joursFeries[dateKey];
                  const zonesVacances = vacances[dateKey] || [];
                  const typeSemaine = getISOWeek(jour) % 2 !== 0 ? 'semaineA' : 'semaineB';
                  const nomJour = format(jour, 'EEEE', { locale: fr }).toLowerCase();
                  const isSelectedForSwap = swapSession.selectedDates.includes(dateKey);
                  
                  const evenementsDuJour = activeEvenements.filter(e => e.date_debut <= dateKey && e.date_fin >= dateKey);
                  
                  const absencesDay = evenementsDuJour.filter(e => ABSENCE_TYPES.includes(e.type));
                  const eventsGrille = evenementsDuJour.filter(e => !ABSENCE_TYPES.includes(e.type) && e.date_debut === e.date_fin && e.heure_debut && e.heure_fin);
                  const eventsBottom = evenementsDuJour.filter(e => !ABSENCE_TYPES.includes(e.type) && (e.date_debut !== e.date_fin || (!e.heure_debut && !e.heure_fin)));

                  let presencesDuJour: any[] = [];
                  let attendusDuJour = 0;

                  if (!nomFerie) {
                    activeEquipe.forEach(m => {
                      const h = getHoraireForDay(m, dateKey, nomJour, typeSemaine);
                      if (h && h.debut && h.fin) {
                        attendusDuJour++;
                        let segments = [{ debut: h.debut, fin: h.fin }];
                        const eventsMembre = absencesDay.filter(e => (!e.membres || e.membres.length === 0 || e.membres.includes(m.id)));
                        eventsMembre.forEach(ev => {
                          if (!ev.heure_debut || !ev.heure_fin) segments = []; 
                          else {
                            const newSegments: any[] = [];
                            segments.forEach(seg => newSegments.push(...soustraireHeures(seg.debut, seg.fin, ev.heure_debut!, ev.heure_fin!)));
                            segments = newSegments;
                          }
                        });
                        segments.forEach(seg => presencesDuJour.push({ nom: m.nom, groupe: m.groupe, debut: seg.debut, fin: seg.fin, id: m.id }));
                      }
                    });
                  }

                  const blocsHoraires = genererBlocsHoraires(presencesDuJour);

                  return (
                    <div key={i} 
                         onClick={() => { if (swapSession.active && swapSession.step === 1) toggleSwapDate(dateKey); }}
                         className={`relative bg-transparent z-10 overflow-hidden ${swapSession.active ? 'cursor-pointer' : ''} ${isSelectedForSwap ? 'ring-4 ring-inset ring-blue-500 bg-blue-50/30' : ''}`}>
                      
                      <div className="absolute top-0 left-0 right-0 flex h-1.5 z-20 pointer-events-none">
                        {zonesVacances.includes("Zone A") && <div className="flex-1 opacity-30" style={{backgroundColor: couleurs.zoneA}}></div>}
                        {zonesVacances.includes("Zone B") && <div className="flex-1 opacity-30" style={{backgroundColor: couleurs.zoneB}}></div>}
                        {zonesVacances.includes("Zone C") && <div className="flex-1 opacity-80" style={{backgroundColor: couleurs.zoneC}}></div>}
                      </div>

                      <div className="absolute top-2 left-2 right-2 flex justify-between items-start z-30 pointer-events-none">
                        <div className="flex-1 mr-2 pointer-events-auto">
                          {nomFerie && <span className="text-[10px] font-black text-rose-500 uppercase leading-none bg-white/90 px-1.5 py-0.5 rounded shadow-sm backdrop-blur-sm line-clamp-2">{nomFerie}</span>}
                        </div>
                        <span className={`font-bold flex items-center justify-center w-7 h-7 rounded-full shrink-0 shadow-sm backdrop-blur-sm pointer-events-auto ${isToday(jour) ? 'text-black' : nomFerie ? 'bg-white/90 text-rose-600' : 'bg-white/80 text-slate-700'}`} style={isToday(jour) ? {backgroundColor: couleurs.accent} : {}}>
                          {format(jour, 'd')}
                        </span>
                      </div>

                      {blocsHoraires.map((bloc: any, idx: number) => {
                        const top = calculerPositionTop(bloc.debut);
                        const bottom = calculerPositionTop(bloc.fin, true);
                        const height = bottom - top;
                        
                        const isDayFullTeam = bloc.noms.length === attendusDuJour && attendusDuJour > 0;
                        const bgColor = getBlocColor(bloc.membresInfos, activeEquipe);

                        const absencesDuBloc = absencesDay.filter(abs => {
                          if (!abs.heure_debut || !abs.heure_fin) return true;
                          return timeToMins(abs.heure_debut) < timeToMins(bloc.fin, true) && timeToMins(abs.heure_fin, true) > timeToMins(bloc.debut);
                        });

                        return (
                          <div key={idx} className="absolute left-1.5 right-1.5 hover:z-[999] group/wrapper" style={{ top: `${top}%`, height: `${height}%`, zIndex: 10 + idx }}>
                            <div className="absolute inset-x-0 top-0 h-full min-h-full group-hover/wrapper:h-max overflow-hidden group-hover/wrapper:overflow-visible border-l-4 rounded-md p-2 flex flex-col shadow-sm transition-all text-black group-hover/wrapper:z-[999] group-hover/wrapper:shadow-2xl" style={{ backgroundColor: bgColor, borderColor: bgColor, opacity: isDayFullTeam ? 1 : 0.8 }}>
                              <span className="font-bold text-xs leading-tight break-words line-clamp-2 group-hover/wrapper:line-clamp-none">{bloc.noms.join(', ')}</span>
                              
                              {absencesDuBloc.length > 0 && (
                                <div className="mt-1 flex flex-col gap-1 items-start">
                                  {absencesDuBloc.map((abs, aIdx) => (
                                    <span key={`abs-${aIdx}`} className="text-[9px] font-bold text-white bg-rose-500/90 px-2 py-0.5 rounded-full w-fit shadow-sm leading-none line-clamp-1 group-hover/wrapper:line-clamp-none">
                                      {abs.type.replace('Demi-', '1/2 ')} : {getNomsMembresEvent(abs.membres)}
                                    </span>
                                  ))}
                                </div>
                              )}

                              <span className="text-[10px] font-black opacity-60 mt-auto bg-white/40 rounded px-1.5 py-0.5 w-fit shrink-0 pt-0.5">{bloc.debut} - {bloc.fin}</span>
                            </div>
                          </div>
                        );
                      })}

                      {blocsHoraires.length === 0 && absencesDay.length > 0 && !nomFerie && (
                        <div className="absolute top-12 left-1.5 right-1.5 flex flex-col gap-1 z-20 pointer-events-none">
                          {absencesDay.map((abs, aIdx) => (
                            <span key={`abs-f-${aIdx}`} className="text-[9px] font-bold text-white bg-rose-500/90 px-2 py-1 rounded-full shadow-sm w-fit leading-tight text-center pointer-events-auto">
                              {abs.type} : {getNomsMembresEvent(abs.membres)}
                            </span>
                          ))}
                        </div>
                      )}

                      {eventsGrille.map((ev: any, idx: number) => {
                        const top = calculerPositionTop(ev.heure_debut);
                        const bottom = calculerPositionTop(ev.heure_fin, true);
                        const height = bottom - top;
                        return (
                          <div key={`ev-h-${idx}`} onClick={(e) => { e.stopPropagation(); ouvrirEditionEvenement(ev, 'single'); }} className="absolute left-2 right-2 hover:z-[999] group/evwrapper pointer-events-auto cursor-pointer" style={{ top: `${top}%`, height: `${height}%`, zIndex: 40 + idx }}>
                            <div className={`absolute inset-x-0 top-0 h-full min-h-full group-hover/evwrapper:h-max overflow-hidden group-hover/evwrapper:overflow-visible border-l-4 rounded-md p-1.5 flex flex-col shadow-md hover:shadow-2xl transition-all group-hover/evwrapper:z-[999] ${getEventStyle(ev.type, true)}`}>
                              <span className="text-[10px] font-black opacity-90 truncate leading-tight mb-0.5 group-hover/evwrapper:line-clamp-none group-hover/evwrapper:whitespace-normal">{getNomsMembresEvent(ev.membres)}</span>
                              <span className="font-bold text-xs leading-tight break-words line-clamp-1 group-hover/evwrapper:line-clamp-none">{getEventIcon(ev.type)} {ev.titre}</span>
                              <span className="text-[10px] font-bold opacity-80 mt-auto shrink-0 pt-0.5">{ev.heure_debut} - {ev.heure_fin}</span>
                            </div>
                          </div>
                        );
                      })}

                      <div className="absolute bottom-2 left-1 right-1 flex flex-col justify-end gap-1 z-50 pointer-events-auto">
                        {eventsBottom.map((ev, idx) => (
                           <div key={`ev-b-${idx}`} onClick={(e) => { e.stopPropagation(); ouvrirEditionEvenement(ev, 'single'); }} className={`text-[9px] font-bold px-1.5 py-1 rounded border shadow-sm flex flex-col leading-tight hover:scale-105 transition-transform cursor-pointer ${getEventStyle(ev.type)}`}>
                             <span className="text-[9px] font-black opacity-90 truncate">{getNomsMembresEvent(ev.membres)}</span>
                             <span className="truncate">{getEventIcon(ev.type)} {ev.titre}</span>
                           </div>
                        ))}
                      </div>

                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      </div>

      {swapSession.active && swapSession.step === 2 && (
        <div style={{ position: "fixed", top: 64, bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", justifyContent: "center", alignItems: "center", backdropFilter: "blur(4px)", padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setSwapSession({ active: false, step: 1, selectedDates: [], m1Id: '', m2Id: '' }); }}>
          <div className="pop-card animate-fade-in" style={{ width: "100%", maxWidth: 440, padding: "28px 32px", maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 20 }} >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 className="bc" style={{ fontSize: 24, margin: 0 }}>🔄 Échange d'horaires</h2>
              <button onClick={() => setSwapSession({ active: false, step: 1, selectedDates: [], m1Id: '', m2Id: '' })} className="pop-btn pop-btn-outline" style={{ width: 36, height: 36, padding: 0, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            <p style={{ fontSize: 13, color: "rgba(0,0,0,0.5)", fontWeight: 500 }}>Vous allez échanger les horaires des personnes suivantes pour {swapSession.selectedDates.length} jour(s).</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ padding: "12px 14px", background: "var(--cream)", borderRadius: 8, border: "1.5px solid rgba(0,0,0,0.12)" }}>
                <label className="bc" style={{ fontSize: 11, display: "block", marginBottom: 6 }}>Membre 1</label>
                <select value={swapSession.m1Id || ''} onChange={e => setSwapSession({...swapSession, m1Id: e.target.value})} className="pop-input" style={{ width: "100%" }}>
                   <option value="">Sélectionner un collaborateur...</option>
                   {activeEquipe.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
                </select>
              </div>

              <div style={{ textAlign: "center", fontSize: 22, opacity: 0.4 }}>⇅</div>

              <div style={{ padding: "12px 14px", background: "var(--cream)", borderRadius: 8, border: "1.5px solid rgba(0,0,0,0.12)" }}>
                <label className="bc" style={{ fontSize: 11, display: "block", marginBottom: 6 }}>Membre 2</label>
                <select value={swapSession.m2Id || ''} onChange={e => setSwapSession({...swapSession, m2Id: e.target.value})} className="pop-input" style={{ width: "100%" }}>
                   <option value="">Sélectionner un collaborateur...</option>
                   {activeEquipe.filter(m => m.id !== swapSession.m1Id).map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
                </select>
              </div>
            </div>

            <button onClick={executerEchange} disabled={!swapSession.m1Id || !swapSession.m2Id} className="pop-btn pop-btn-dark" style={{ width: "100%", justifyContent: "center", fontSize: 15, padding: "14px 0", opacity: (!swapSession.m1Id || !swapSession.m2Id) ? 0.4 : 1, cursor: (!swapSession.m1Id || !swapSession.m2Id) ? "not-allowed" : "pointer" }}>
               Confirmer l'échange
            </button>
          </div>
        </div>
      )}

      {showEquipePanel && (
        <div style={{ position: "fixed", top: 64, bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", justifyContent: "flex-end", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) { setShowEquipePanel(false); setMembreActif(null); } }}>
          <div style={{ background: "var(--white)", width: "100%", maxWidth: 520, height: "100%", display: "flex", flexDirection: "column", border: "2.5px solid var(--ink)", borderRight: "none", boxShadow: "-6px 0 0 var(--ink)" }} className="animate-slide-in-right">
            <div style={{ padding: "20px 24px", borderBottom: "2px solid rgba(0,0,0,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--white)" }}>
              <div>
                <h2 className="bc" style={{ fontSize: 26, margin: 0 }}>Équipe</h2>
                <p style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", fontWeight: 500, marginTop: 2 }}>Profils, horaires et suivi RH</p>
              </div>
              <button onClick={() => { setShowEquipePanel(false); setMembreActif(null); }} className="pop-btn pop-btn-outline" style={{ width: 36, height: 36, padding: 0, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
            
            <div style={{ flex: 1, overflowY: "auto", padding: 24 }} className="hide-scrollbar">
              {!membreActif ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <button onClick={() => { setShowEquipePanel(false); setSwapSession({active: true, step: 1, selectedDates: [], m1Id: '', m2Id: ''}); }} className="pop-btn pop-btn-outline" style={{ width: "100%", justifyContent: "center", fontSize: 14, padding: "12px 0" }}>
                    🔄 Échanger des horaires
                  </button>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 12, borderTop: "2px solid rgba(0,0,0,0.08)" }}>
                    {activeEquipe.map(membre => (
                      <div key={membre.id} onClick={() => { setMembreActif(membre); setOngletMembre("profil"); }} className="pop-card pop-card-hover" style={{ padding: "12px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <p style={{ fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
                            {membre.nom}
                            {membre.groupe && membre.groupe !== 'Aucun' && (
                              <span className="pop-sticker" style={{ backgroundColor: membre.groupe === 'A' ? couleurs.equipeA : couleurs.equipeB, fontSize: 10, padding: "2px 7px" }}>Grp {membre.groupe}</span>
                            )}
                          </p>
                          <p style={{ fontSize: 13, color: "rgba(0,0,0,0.4)", fontWeight: 500 }}>{membre.role} · {membre.heures_hebdo_base}h/sem</p>
                        </div>
                        <span style={{ color: "rgba(0,0,0,0.3)", fontWeight: 900, fontSize: 18 }}>›</span>
                      </div>
                    ))}
                    {activeEquipe.length === 0 && <p style={{ textAlign: "center", color: "rgba(0,0,0,0.3)", padding: "40px 0", fontWeight: 500 }}>L'équipe est vide.</p>}
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <button onClick={() => setMembreActif(null)} style={{ fontSize: 13, fontWeight: 700, color: "rgba(0,0,0,0.4)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>◀ Retour à la liste</button>
                    <h3 className="bc" style={{ fontSize: 18, margin: 0 }}>{membreActif.nom}</h3>
                  </div>

                  <div className="pop-card" style={{ display: "flex", padding: 4, gap: 0 }}>
                    <button onClick={() => setOngletMembre("profil")} className="pop-btn" style={{ flex: 1, justifyContent: "center", fontSize: 13, padding: "7px 0", background: ongletMembre === "profil" ? "var(--yellow)" : "transparent", boxShadow: ongletMembre === "profil" ? "2px 2px 0 var(--ink)" : "none", border: ongletMembre === "profil" ? "2px solid var(--ink)" : "2px solid transparent" }}>Profil & Horaires</button>
                    <button onClick={() => setOngletMembre("suivi")} className="pop-btn" style={{ flex: 1, justifyContent: "center", fontSize: 13, padding: "7px 0", background: ongletMembre === "suivi" ? "var(--yellow)" : "transparent", boxShadow: ongletMembre === "suivi" ? "2px 2px 0 var(--ink)" : "none", border: ongletMembre === "suivi" ? "2px solid var(--ink)" : "2px solid transparent" }}>Fiche Perso (RH)</button>
                  </div>
                  
                  {ongletMembre === "profil" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {/* Bilan hebdo */}
                      <div className="pop-card" style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `4px solid ${Math.abs(diffHeures) > 0.1 ? "var(--rouge)" : "var(--vert)"}` }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>Moyenne Base : <strong>{moyenneHeures.toFixed(1)}h</strong></span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: Math.abs(diffHeures) > 0.1 ? "var(--rouge)" : "var(--vert)" }}>
                          {Math.abs(diffHeures) > 0.1 ? `⚠️ Écart : ${diffHeures > 0 ? '+' : ''}${diffHeures.toFixed(1)}h` : "✅ Objectif atteint"}
                        </span>
                      </div>

                      {/* Identité */}
                      <div className="pop-card" style={{ padding: "16px 18px", borderTop: "4px solid var(--bleu)", display: "flex", flexDirection: "column", gap: 12 }}>
                        <p className="bc" style={{ fontSize: 14, letterSpacing: "0.04em", marginBottom: 2 }}>Identité</p>
                        <div>
                          <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(0,0,0,0.4)", display: "block", marginBottom: 5 }}>Nom complet</span>
                          <input type="text" value={membreActif.nom} onChange={e => setMembreActif({...membreActif, nom: e.target.value})} className="pop-input" style={{ width: "100%" }} />
                        </div>
                        <div style={{ display: "flex", gap: 10 }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(0,0,0,0.4)", display: "block", marginBottom: 5 }}>Rôle</span>
                            <input type="text" value={membreActif.role} onChange={e => setMembreActif({...membreActif, role: e.target.value})} className="pop-input" style={{ width: "100%" }} />
                          </div>
                          <div style={{ width: "30%" }}>
                            <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(0,0,0,0.4)", display: "block", marginBottom: 5 }}>Équipe</span>
                            <select value={membreActif.groupe || 'Aucun'} onChange={e => setMembreActif({...membreActif, groupe: e.target.value})} className="pop-input" style={{ width: "100%", cursor: "pointer" }}>
                              <option value="Aucun">Aucune</option>
                              <option value="A">Équipe A</option>
                              <option value="B">Équipe B</option>
                            </select>
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          {[
                            { label: "Base (h/sem)", value: membreActif.heures_hebdo_base, onChange: (v: string) => setMembreActif({...membreActif, heures_hebdo_base: parseFloat(v) || 0}) },
                            { label: "Solde Récup (h)", value: membreActif.solde_recup ?? 0, onChange: (v: string) => setMembreActif({...membreActif, solde_recup: parseFloat(v)}) },
                            { label: "Solde Congés (jrs)", value: membreActif.solde_conges ?? 25, onChange: (v: string) => setMembreActif({...membreActif, solde_conges: parseFloat(v)}) },
                            { label: "Solde RTT (jrs)", value: membreActif.solde_rtt ?? 0, onChange: (v: string) => setMembreActif({...membreActif, solde_rtt: parseFloat(v)}) },
                          ].map(f => (
                            <div key={f.label}>
                              <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(0,0,0,0.4)", display: "block", marginBottom: 5 }}>{f.label}</span>
                              <input type="number" step="0.5" min="0" value={f.value} onChange={e => f.onChange(e.target.value)} className="pop-input" style={{ width: "100%" }} />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Horaires */}
                      <div className="pop-card" style={{ padding: "16px 18px", borderTop: "4px solid var(--yellow)", display: "flex", flexDirection: "column", gap: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <p className="bc" style={{ fontSize: 14, letterSpacing: "0.04em", margin: 0 }}>Horaires de la semaine</p>
                          <button onClick={inverserSemaines} className="pop-btn pop-btn-outline" style={{ fontSize: 11, padding: "4px 10px" }}>⇅ Inverser A/B</button>
                        </div>
                        <div className="pop-card" style={{ display: "flex", padding: 4, gap: 0 }}>
                          <button onClick={() => setSemaineActive("semaineA")} className="pop-btn" style={{ flex: 1, justifyContent: "center", fontSize: 13, padding: "6px 0", background: semaineActive === "semaineA" ? "var(--yellow)" : "transparent", boxShadow: semaineActive === "semaineA" ? "2px 2px 0 var(--ink)" : "none", border: semaineActive === "semaineA" ? "2px solid var(--ink)" : "2px solid transparent" }}>Semaine A</button>
                          <button onClick={() => setSemaineActive("semaineB")} className="pop-btn" style={{ flex: 1, justifyContent: "center", fontSize: 13, padding: "6px 0", background: semaineActive === "semaineB" ? "var(--yellow)" : "transparent", boxShadow: semaineActive === "semaineB" ? "2px 2px 0 var(--ink)" : "none", border: semaineActive === "semaineB" ? "2px solid var(--ink)" : "2px solid transparent" }}>Semaine B</button>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {JOURS_SEMAINE.map(jour => {
                            const h = membreActif.horaires?.[semaineActive]?.[jour] || { debut: '', fin: '', pause: 1 };
                            const actif = !!(h.debut && h.fin);
                            return (
                              <div key={jour} className="pop-card" style={{ padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: actif ? "var(--white)" : "var(--cream2)", opacity: actif ? 1 : 0.6 }}>
                                <span style={{ width: 70, fontWeight: 800, fontSize: 13, textTransform: "capitalize", flexShrink: 0 }}>{jour}</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                  <input type="time" value={h.debut} onChange={e => updateHoraire(jour, 'debut', e.target.value)} className="pop-input" style={{ padding: "5px 8px", fontSize: 12, width: 90 }} />
                                  <span style={{ fontWeight: 700, color: "rgba(0,0,0,0.35)", fontSize: 12 }}>→</span>
                                  <input type="time" value={h.fin} onChange={e => updateHoraire(jour, 'fin', e.target.value)} className="pop-input" style={{ padding: "5px 8px", fontSize: 12, width: 90 }} />
                                  <div style={{ display: "flex", alignItems: "center", background: "var(--cream2)", border: "1.5px solid rgba(0,0,0,0.12)", borderRadius: 6, padding: "4px 8px", gap: 4 }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(0,0,0,0.4)" }}>🍽</span>
                                    <input type="number" step="0.5" min="0" value={h.pause !== undefined ? h.pause : 1} onChange={e => updateHoraire(jour, 'pause', parseFloat(e.target.value) || 0)} style={{ width: 36, padding: 0, background: "transparent", border: "none", fontSize: 12, fontWeight: 700, outline: "none", textAlign: "center", fontFamily: "inherit" }} />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {statsPerso && (
                        <>
                          {/* Bilan annuel KPIs */}
                          <div className="pop-card" style={{ padding: "16px 18px", borderTop: "4px solid var(--bleu)" }}>
                            <p className="bc" style={{ fontSize: 14, letterSpacing: "0.04em", marginBottom: 12 }}>Bilan Annuel ({dateActuelle.getFullYear()})</p>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                              {[
                                { label: "Congés restants", value: (membreActif.solde_conges ?? 25) - statsPerso.congesPrisJours, unit: "jrs", sub: `${statsPerso.congesPrisJours} pris`, color: "var(--rose)" },
                                { label: "RTT restants", value: (membreActif.solde_rtt ?? 0) - statsPerso.rttPrisJours, unit: "jrs", sub: `${statsPerso.rttPrisJours} pris`, color: "var(--vert)" },
                                { label: "Heures Récup.", value: (membreActif.solde_recup ?? 0) - statsPerso.recupPriseHeures, unit: "h", sub: `${statsPerso.recupPriseHeures}h prises`, color: "var(--bleu)" },
                              ].map(k => (
                                <div key={k.label} className="pop-card" style={{ padding: "10px 12px", borderTop: `3px solid ${k.color}` }}>
                                  <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(0,0,0,0.4)", display: "block" }}>{k.label}</span>
                                  <span style={{ fontSize: 22, fontWeight: 900, display: "block", marginTop: 4 }}>{k.value} <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(0,0,0,0.45)" }}>{k.unit}</span></span>
                                  <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(0,0,0,0.35)", marginTop: 2, display: "block" }}>({k.sub})</span>
                                </div>
                              ))}
                            </div>

                            {/* Soldes initiaux */}
                            <div style={{ borderTop: "1.5px solid rgba(0,0,0,0.08)", paddingTop: 12 }}>
                              <p className="bc" style={{ fontSize: 11, letterSpacing: "0.06em", color: "rgba(0,0,0,0.4)", marginBottom: 8 }}>Soldes initiaux</p>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                                {[
                                  { label: "Congés (jrs)", value: membreActif.solde_conges ?? 25, onChange: (v: string) => setMembreActif({...membreActif, solde_conges: parseFloat(v) || 0}) },
                                  { label: "RTT (jrs)", value: membreActif.solde_rtt ?? 0, onChange: (v: string) => setMembreActif({...membreActif, solde_rtt: parseFloat(v) || 0}) },
                                  { label: "Récup (h)", value: membreActif.solde_recup ?? 0, onChange: (v: string) => setMembreActif({...membreActif, solde_recup: parseFloat(v) || 0}) },
                                ].map(f => (
                                  <div key={f.label}>
                                    <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(0,0,0,0.4)", display: "block", marginBottom: 4 }}>{f.label}</span>
                                    <input type="number" step="0.5" value={f.value} onChange={e => f.onChange(e.target.value)} className="pop-input" style={{ width: "100%", textAlign: "center", fontSize: 13 }} />
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Périodes hors système */}
                            <div style={{ borderTop: "1.5px solid rgba(0,0,0,0.08)", paddingTop: 12, marginTop: 12 }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                                <p className="bc" style={{ fontSize: 11, letterSpacing: "0.06em", color: "rgba(0,0,0,0.4)", margin: 0 }}>Périodes hors système</p>
                                {!newAbsHS && (
                                  <button onClick={() => setNewAbsHS({ debut: format(new Date(), 'yyyy-MM-dd'), fin: format(new Date(), 'yyyy-MM-dd'), type: 'conge' })}
                                    className="pop-btn pop-btn-dark" style={{ fontSize: 10, padding: "4px 10px" }}>
                                    + Ajouter
                                  </button>
                                )}
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {(membreActif.absences_hs ?? []).length === 0 && !newAbsHS && (
                                  <p style={{ fontSize: 11, color: "rgba(0,0,0,0.35)", fontStyle: "italic" }}>Aucune période saisie</p>
                                )}
                                {(membreActif.absences_hs ?? []).map((ab, idx) => {
                                  const jours = compterJoursTravailles(ab.debut, ab.fin, membreActif, joursFeries);
                                  const label = ab.type === 'conge' ? '🏖️ Congé' : ab.type === 'rtt' ? '🌴 RTT' : '🛋️ Récup';
                                  const bg = ab.type === 'rtt' ? "var(--vert)" : ab.type === 'recup' ? "var(--bleu)" : "var(--rose)";
                                  return (
                                    <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", borderRadius: 6, border: "1.5px solid var(--ink)", background: "var(--white)" }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <span className="pop-sticker" style={{ background: bg, fontSize: 9, padding: "2px 7px" }}>{label}</span>
                                        <span style={{ fontSize: 11, fontWeight: 700 }}>{format(new Date(ab.debut + 'T12:00:00'), 'dd/MM')} – {format(new Date(ab.fin + 'T12:00:00'), 'dd/MM/yy')}</span>
                                      </div>
                                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(0,0,0,0.4)" }}>{jours}j{ab.type === 'recup' ? ` × ${(membreActif.heures_hebdo_base/5).toFixed(1)}h` : ''}</span>
                                        <button onClick={() => setMembreActif({...membreActif, absences_hs: (membreActif.absences_hs ?? []).filter((_, i) => i !== idx)})}
                                          className="pop-btn pop-btn-outline" style={{ width: 22, height: 22, padding: 0, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>✕</button>
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                              {newAbsHS && (
                                <div className="pop-card" style={{ padding: "12px 14px", marginTop: 8, display: "flex", flexDirection: "column", gap: 8, background: "var(--cream2)" }}>
                                  <div style={{ display: "flex", gap: 6 }}>
                                    {(['conge', 'rtt', 'recup'] as const).map(t => (
                                      <button key={t}
                                        onClick={() => setNewAbsHS({...newAbsHS, type: t})}
                                        className={`pop-btn ${newAbsHS.type === t ? 'pop-btn-dark' : 'pop-btn-outline'}`}
                                        style={{ flex: 1, justifyContent: "center", fontSize: 11, padding: "5px 0" }}>
                                        {t === 'conge' ? '🏖️ Congé' : t === 'rtt' ? '🌴 RTT' : '🛋️ Récup'}
                                      </button>
                                    ))}
                                  </div>
                                  <div style={{ display: "flex", gap: 8 }}>
                                    <div style={{ flex: 1 }}>
                                      <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(0,0,0,0.4)", display: "block", marginBottom: 4 }}>Début</span>
                                      <input type="date" value={newAbsHS.debut}
                                        onChange={e => setNewAbsHS({...newAbsHS, debut: e.target.value, fin: e.target.value > newAbsHS.fin ? e.target.value : newAbsHS.fin})}
                                        className="pop-input" style={{ width: "100%", fontSize: 12 }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                      <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(0,0,0,0.4)", display: "block", marginBottom: 4 }}>Fin</span>
                                      <input type="date" value={newAbsHS.fin} min={newAbsHS.debut}
                                        onChange={e => setNewAbsHS({...newAbsHS, fin: e.target.value})}
                                        className="pop-input" style={{ width: "100%", fontSize: 12 }} />
                                    </div>
                                  </div>
                                  <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(0,0,0,0.5)", textAlign: "center" }}>
                                    {compterJoursTravailles(newAbsHS.debut, newAbsHS.fin, membreActif, joursFeries)} jour(s) travaillé(s) dans la période
                                  </p>
                                  <div style={{ display: "flex", gap: 8 }}>
                                    <button onClick={() => setNewAbsHS(null)}
                                      className="pop-btn pop-btn-outline" style={{ flex: 1, justifyContent: "center", fontSize: 13 }}>
                                      Annuler
                                    </button>
                                    <button onClick={() => {
                                      setMembreActif({...membreActif, absences_hs: [...(membreActif.absences_hs ?? []), newAbsHS]});
                                      setNewAbsHS(null);
                                    }}
                                      className="pop-btn pop-btn-dark" style={{ flex: 1, justifyContent: "center", fontSize: 13 }}>
                                      Ajouter
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Bilan mensuel */}
                          <div className="pop-card" style={{ padding: "16px 18px", borderTop: "4px solid var(--orange)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                              <p className="bc" style={{ fontSize: 14, letterSpacing: "0.04em", margin: 0 }}>Bilan Mensuel</p>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <button onClick={() => setDateActuelle(subMonths(dateActuelle, 1))} className="pop-btn pop-btn-outline" style={{ padding: "4px 8px", fontSize: 11 }}>◀</button>
                                <span className="bc" style={{ fontSize: 11, color: "var(--ink)", padding: "0 6px", minWidth: 90, textAlign: "center", textTransform: "capitalize" }}>
                                  {format(dateActuelle, 'MMMM yyyy', {locale: fr})}
                                </span>
                                <button onClick={() => setDateActuelle(addMonths(dateActuelle, 1))} className="pop-btn pop-btn-outline" style={{ padding: "4px 8px", fontSize: 11 }}>▶</button>
                              </div>
                            </div>

                            <div className="pop-card" style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, borderTop: `3px solid ${statsPerso.diffMoisHeures > 0 ? "var(--bleu)" : statsPerso.diffMoisHeures < 0 ? "var(--rouge)" : "var(--cream2)"}` }}>
                              <span style={{ fontSize: 13, fontWeight: 700 }}>Heures Supplémentaires</span>
                              <span style={{ fontSize: 20, fontWeight: 900, color: statsPerso.diffMoisHeures > 0 ? "var(--bleu)" : statsPerso.diffMoisHeures < 0 ? "var(--rouge)" : "var(--ink)" }}>
                                {statsPerso.diffMoisHeures > 0 ? '+' : ''}{statsPerso.diffMoisHeures.toFixed(1)} h
                              </span>
                            </div>

                            <div className="pop-card" style={{ overflow: "hidden" }}>
                              <div style={{ padding: "10px 14px", background: "var(--cream2)", borderBottom: "1.5px solid rgba(0,0,0,0.08)" }}>
                                <span style={{ fontSize: 13, fontWeight: 800 }}>Événements du mois ({statsPerso.eventsDuMois.length})</span>
                              </div>
                              <div style={{ maxHeight: 280, overflowY: "auto" }} className="hide-scrollbar">
                                {statsPerso.eventsDuMois.length === 0 && <p style={{ padding: 14, fontSize: 13, color: "rgba(0,0,0,0.35)", fontStyle: "italic" }}>Aucun événement ce mois-ci.</p>}
                                {statsPerso.eventsDuMois.map(ev => (
                                  <div key={ev.id} style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                        <span style={{ fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 5 }}>{getEventIcon(ev.type)} {ev.titre}</span>
                                        <span className="pop-sticker" style={{ fontSize: 9, padding: "2px 7px" }}>{ev.type.replace('Demi-', '1/2 ')}</span>
                                      </div>
                                      <span style={{ fontSize: 11, fontWeight: 500, color: "rgba(0,0,0,0.45)", marginTop: 2, display: "block" }}>
                                        {format(new Date(ev.date_debut), 'dd MMM', {locale: fr})}
                                        {ev.date_debut !== ev.date_fin && ` - ${format(new Date(ev.date_fin), 'dd MMM', {locale: fr})}`}
                                        {ev.heure_debut && ` • ${ev.heure_debut}-${ev.heure_fin}`}
                                      </span>
                                    </div>
                                    {ABSENCE_TYPES.includes(ev.type) && (
                                      <button onClick={() => setQuickEditEv(ev)} className="pop-btn pop-btn-outline" style={{ width: 30, height: 30, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>✏️</button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            {membreActif && (
              <div style={{ padding: "16px 24px", borderTop: "2px solid rgba(0,0,0,0.08)", background: "var(--white)", flexShrink: 0 }}>
                {ongletMembre === "profil"
                  ? <button onClick={sauvegarderMembre} disabled={!membreActif.nom} className="pop-btn pop-btn-dark" style={{ width: "100%", justifyContent: "center", fontSize: 15, padding: "14px 0", opacity: !membreActif.nom ? 0.4 : 1, cursor: !membreActif.nom ? "not-allowed" : "pointer" }}>Enregistrer le profil</button>
                  : <button onClick={sauvegarderSoldes} className="pop-btn pop-btn-dark" style={{ width: "100%", justifyContent: "center", fontSize: 15, padding: "14px 0" }}>Enregistrer les soldes</button>
                }
              </div>
            )}
          </div>
        </div>
      )}

      {showEventsListPanel && (
        <div style={{ position: "fixed", top: 64, bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", justifyContent: "flex-end", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) setShowEventsListPanel(false); }}>
          <div style={{ background: "var(--white)", width: "100%", maxWidth: 520, height: "100%", display: "flex", flexDirection: "column", border: "2.5px solid var(--ink)", borderRight: "none", boxShadow: "-6px 0 0 var(--ink)" }} className="animate-slide-in-right">
            <div style={{ padding: "20px 24px", borderBottom: "2px solid rgba(0,0,0,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--white)" }}>
              <div>
                <h2 className="bc" style={{ fontSize: 26, margin: 0 }}>Événements</h2>
                <p style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", fontWeight: 500, marginTop: 2 }}>Ponctuels et séries récurrentes</p>
              </div>
              <button onClick={() => setShowEventsListPanel(false)} className="pop-btn pop-btn-outline" style={{ width: 36, height: 36, padding: 0, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 24 }} className="hide-scrollbar">

              <button onClick={() => {
                const dStr = format(dateActuelle, 'yyyy-MM-dd');
                setNouvelEvent({...eventParDefaut, date_debut: dStr, date_fin: dStr});
                setEditMode('single');
                setRep({ active: false, interval: 1, period: 'weeks', date_limite: format(addMonths(new Date(), 1), 'yyyy-MM-dd'), rotation: false });
                setShowEventsListPanel(false);
                setShowEventModal(true);
              }} className="pop-btn pop-btn-dark" style={{ width: "100%", justifyContent: "center", fontSize: 15, padding: "13px 0", marginBottom: 20 }}>
                + Nouvel événement
              </button>

              <div className="pop-card" style={{ display: "flex", padding: 4, gap: 0, marginBottom: 20 }}>
                <button onClick={() => setListTab('ponctuels')} className="pop-btn" style={{ flex: 1, justifyContent: "center", fontSize: 13, padding: "7px 0", background: listTab === 'ponctuels' ? "var(--yellow)" : "transparent", boxShadow: listTab === 'ponctuels' ? "2px 2px 0 var(--ink)" : "none", border: listTab === 'ponctuels' ? "2px solid var(--ink)" : "2px solid transparent" }}>Ponctuels</button>
                <button onClick={() => setListTab('series')} className="pop-btn" style={{ flex: 1, justifyContent: "center", fontSize: 13, padding: "7px 0", background: listTab === 'series' ? "var(--yellow)" : "transparent", boxShadow: listTab === 'series' ? "2px 2px 0 var(--ink)" : "none", border: listTab === 'series' ? "2px solid var(--ink)" : "2px solid transparent" }}>Séries Récurrentes</button>
              </div>

              {listTab === 'ponctuels' && (
                <>
                  <p className="bc" style={{ fontSize: 16, marginBottom: 10 }}>En cours</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                    {eventsEnCours.length === 0 && <p style={{ fontSize: 13, color: "rgba(0,0,0,0.4)", fontStyle: "italic" }}>Rien de prévu en ce moment.</p>}
                    {eventsEnCours.map(ev => (
                      <div key={ev.id} className={`pop-card pop-card-hover ${getEventStyle(ev.type)}`} style={{ padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, cursor: "pointer" }} onClick={() => ouvrirEditionEvenement(ev, 'single')}>
                          <p style={{ fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>{getEventIcon(ev.type)} {ev.titre}</p>
                          <p style={{ fontSize: 12, fontWeight: 500, marginTop: 3, opacity: 0.8 }}>
                            {format(new Date(ev.date_debut), 'dd MMM yyyy', {locale: fr})}
                            {ev.date_debut !== ev.date_fin && ` ➔ ${format(new Date(ev.date_fin), 'dd MMM yyyy', {locale: fr})}`}
                            {ev.heure_debut ? ` • ${ev.heure_debut}-${ev.heure_fin}` : ' • Journée entière'}
                          </p>
                          <p style={{ fontSize: 10, fontWeight: 800, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.04em", opacity: 0.9 }}>{getNomsMembresEvent(ev.membres)}</p>
                        </div>
                        <button onClick={() => supprimerEvenement(ev.id!)} className="pop-btn pop-btn-outline" style={{ width: 32, height: 32, padding: 0, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, borderColor: "rgba(220,38,38,0.4)", color: "#dc2626" }}>✕</button>
                      </div>
                    ))}
                  </div>

                  <p className="bc" style={{ fontSize: 16, marginBottom: 10 }}>À venir</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                    {eventsAVenir.length === 0 && <p style={{ fontSize: 13, color: "rgba(0,0,0,0.4)", fontStyle: "italic" }}>Aucun événement à venir.</p>}
                    {eventsAVenir.map(ev => (
                      <div key={ev.id} className="pop-card pop-card-hover" style={{ padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, cursor: "pointer" }} onClick={() => ouvrirEditionEvenement(ev, 'single')}>
                          <p style={{ fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>{getEventIcon(ev.type)} {ev.titre}</p>
                          <p style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", fontWeight: 500, marginTop: 3 }}>
                            {format(new Date(ev.date_debut), 'dd MMM yyyy', {locale: fr})}
                            {ev.date_debut !== ev.date_fin && ` ➔ ${format(new Date(ev.date_fin), 'dd MMM yyyy', {locale: fr})}`}
                            {ev.heure_debut ? ` • ${ev.heure_debut}-${ev.heure_fin}` : ' • Journée entière'}
                          </p>
                          <p style={{ fontSize: 10, color: "rgba(0,0,0,0.35)", fontWeight: 700, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.04em" }}>{getNomsMembresEvent(ev.membres)}</p>
                        </div>
                        <button onClick={() => supprimerEvenement(ev.id!)} className="pop-btn pop-btn-outline" style={{ width: 32, height: 32, padding: 0, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, borderColor: "rgba(220,38,38,0.4)", color: "#dc2626" }}>✕</button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {listTab === 'series' && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {Object.keys(groupesSeries).length === 0 && <p style={{ fontSize: 13, color: "rgba(0,0,0,0.4)", fontStyle: "italic" }}>Aucune série répétée.</p>}
                  {Object.entries(groupesSeries).map(([pid, evs]) => {
                    const firstEv = evs[0];
                    const isExpanded = groupesEtendus[pid];
                    return (
                      <div key={pid} className="pop-card" style={{ overflow: "hidden" }}>
                        <div style={{ padding: "12px 14px", background: "var(--cream2)", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setGroupesEtendus(p => ({...p, [pid]: !p[pid]}))}>
                          <div>
                            <p style={{ fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>{getEventIcon(firstEv.type)} {firstEv.titre}</p>
                            <p style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", fontWeight: 500, marginTop: 3 }}>Série de {evs.length} événement(s)</p>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <button onClick={(e) => { e.stopPropagation(); ouvrirEditionEvenement(firstEv, 'series'); }} className="pop-btn pop-btn-outline" style={{ fontSize: 11, padding: "5px 10px" }}>
                              ✏️ Série
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); supprimerEvenement(firstEv.id!, true, pid); }} className="pop-btn pop-btn-outline" style={{ width: 32, height: 32, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", borderColor: "rgba(220,38,38,0.4)", color: "#dc2626" }}>
                              ✕
                            </button>
                          </div>
                        </div>
                        {isExpanded && (
                          <div style={{ padding: 10, background: "var(--white)", borderTop: "1.5px solid rgba(0,0,0,0.08)", maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }} className="hide-scrollbar">
                            {evs.map(occ => (
                              <div key={occ.id} className={`${getEventStyle(occ.type)}`} style={{ padding: "10px 12px", borderRadius: 8, border: "1.5px solid rgba(0,0,0,0.12)", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", opacity: occ.date_debut < todayStr ? 0.5 : 1 }} onClick={() => ouvrirEditionEvenement(occ, 'single')}>
                                <div>
                                  <p style={{ fontWeight: 700, fontSize: 13 }}>{format(new Date(occ.date_debut), 'dd MMM yyyy', {locale: fr})}</p>
                                  <p style={{ fontSize: 10, fontWeight: 500, opacity: 0.8, marginTop: 2 }}>{occ.heure_debut ? `${occ.heure_debut}-${occ.heure_fin}` : 'Journée entière'} • {getNomsMembresEvent(occ.membres)}</p>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); supprimerEvenement(occ.id!); }} className="pop-btn pop-btn-outline" style={{ width: 24, height: 24, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, borderColor: "rgba(220,38,38,0.4)", color: "#dc2626" }}>✕</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showEventModal && (
        <div style={{ position: "fixed", top: 64, bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", justifyContent: "center", alignItems: "center", backdropFilter: "blur(4px)", padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setShowEventModal(false); }}>
          <div className="pop-card animate-fade-in" style={{ width: "100%", maxWidth: 460, maxHeight: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 22px", borderBottom: "1.5px solid rgba(0,0,0,0.08)", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h2 className="bc" style={{ fontSize: 22, margin: 0 }}>{nouvelEvent.id ? 'Modifier' : 'Nouvel Événement'}</h2>
                {nouvelEvent.id && (
                  <button onClick={dupliquerEvenement} className="pop-btn pop-btn-outline" style={{ fontSize: 12, padding: "4px 10px" }}>
                    📄 Dupliquer
                  </button>
                )}
              </div>
              <button onClick={() => setShowEventModal(false)} className="pop-btn pop-btn-outline" style={{ width: 34, height: 34, padding: 0, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>✕</button>
            </div>
            <div className="overflow-y-auto hide-scrollbar" style={{ flex: 1, padding: "18px 22px" }}>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Scope série */}
              {nouvelEvent.parent_id && (
                <div className="pop-card" style={{ display: "flex", padding: 4, gap: 0 }}>
                  <button onClick={() => setEditMode('single')} className="pop-btn" style={{ flex: 1, justifyContent: "center", fontSize: 12, padding: "6px 0", background: editMode === 'single' ? "var(--yellow)" : "transparent", boxShadow: editMode === 'single' ? "2px 2px 0 var(--ink)" : "none", border: editMode === 'single' ? "2px solid var(--ink)" : "2px solid transparent" }}>Cet événement uniquement</button>
                  <button onClick={() => setEditMode('series')} className="pop-btn" style={{ flex: 1, justifyContent: "center", fontSize: 12, padding: "6px 0", background: editMode === 'series' ? "var(--yellow)" : "transparent", boxShadow: editMode === 'series' ? "2px 2px 0 var(--ink)" : "none", border: editMode === 'series' ? "2px solid var(--ink)" : "2px solid transparent" }}>Toute la série</button>
                </div>
              )}

              {/* Titre */}
              <div>
                <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(0,0,0,0.4)", display: "block", marginBottom: 6 }}>Titre</span>
                <input type="text" value={nouvelEvent.titre} onChange={e => setNouvelEvent({...nouvelEvent, titre: e.target.value})} className="pop-input" style={{ width: "100%" }} placeholder="Ex: Congés Bernard, Animation Cité..." />
              </div>

              {/* Type */}
              <div className="pop-card" style={{ padding: "10px 12px", background: "var(--cream2)", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, background: "var(--white)", padding: 6, borderRadius: 8, border: "1.5px solid rgba(0,0,0,0.1)" }}>
                  {([
                    { key: 'Absence', color: "var(--rose)" },
                    { key: 'Réunion', color: "var(--bleu)" },
                    { key: 'Animation', color: "var(--orange)" },
                    { key: 'Soirée Jeux', color: "var(--purple)" },
                    { key: 'Heures Exceptionnelles', label: 'H. Excep.', color: "var(--vert)" },
                  ] as const).map(t => (
                    <button key={t.key} type="button" onClick={() => setMainType(t.key as any)}
                      className="pop-btn"
                      style={{ flex: 1, justifyContent: "center", fontSize: 11, padding: "5px 4px", background: mainTypeUI === t.key ? t.color : "transparent", boxShadow: mainTypeUI === t.key ? "2px 2px 0 var(--ink)" : "none", border: mainTypeUI === t.key ? "2px solid var(--ink)" : "2px solid transparent", color: "var(--ink)" }}>
                      {'label' in t ? t.label : t.key}
                    </button>
                  ))}
                </div>

                {mainTypeUI === 'Absence' && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "0 2px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      {(['Congé', 'RTT', 'Récupération'] as const).map(a => (
                        <button key={a} type="button" onClick={() => setAbsType(a)}
                          className={`pop-btn ${absTypeUI === a ? 'pop-btn-dark' : 'pop-btn-outline'}`}
                          style={{ flex: 1, justifyContent: "center", fontSize: 11, padding: "6px 0" }}>
                          {a}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" onClick={() => setIsDemi(false)} className="pop-btn" style={{ flex: 1, justifyContent: "center", fontSize: 12, padding: "7px 0", background: !isDemiUI ? "var(--white)" : "transparent", boxShadow: !isDemiUI ? "2px 2px 0 var(--ink)" : "none", border: !isDemiUI ? "2.5px solid var(--ink)" : "2px solid rgba(0,0,0,0.15)" }}>Journée entière</button>
                      <button type="button" onClick={() => setIsDemi(true)} className="pop-btn" style={{ flex: 1, justifyContent: "center", fontSize: 12, padding: "7px 0", background: isDemiUI ? "var(--yellow)" : "transparent", boxShadow: isDemiUI ? "2px 2px 0 var(--ink)" : "none", border: isDemiUI ? "2.5px solid var(--ink)" : "2px solid rgba(0,0,0,0.15)" }}>Demi-journée</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Dates */}
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(0,0,0,0.4)", display: "block", marginBottom: 6 }}>Le (Début)</span>
                  <input type="date" value={nouvelEvent.date_debut} onChange={e => handleDateDebutChange(e.target.value)} className="pop-input" style={{ width: "100%", fontSize: 13 }} />
                </div>
                {(!rep.active && editMode === 'single') && (
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(0,0,0,0.4)", display: "block", marginBottom: 6 }}>Au (Fin)</span>
                    <input type="date" value={nouvelEvent.date_fin} min={nouvelEvent.date_debut} onChange={e => setNouvelEvent({...nouvelEvent, date_fin: e.target.value})} className="pop-input" style={{ width: "100%", fontSize: 13 }} />
                  </div>
                )}
              </div>

              {/* Heures */}
              <div style={{ display: "flex", gap: 10, opacity: isTimeDisabled ? 0.3 : 1, pointerEvents: isTimeDisabled ? "none" : "auto" }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(0,0,0,0.4)", display: "block", marginBottom: 6 }}>De (optionnel)</span>
                  <input type="time" value={nouvelEvent.heure_debut || ''} onChange={e => setNouvelEvent({...nouvelEvent, heure_debut: e.target.value})} className="pop-input" style={{ width: "100%", fontSize: 13 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(0,0,0,0.4)", display: "block", marginBottom: 6 }}>À (optionnel)</span>
                  <input type="time" value={nouvelEvent.heure_fin || ''} onChange={e => setNouvelEvent({...nouvelEvent, heure_fin: e.target.value})} className="pop-input" style={{ width: "100%", fontSize: 13 }} />
                </div>
              </div>

              {/* Personnes */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(0,0,0,0.4)" }}>Personnes concernées</span>
                  <div style={{ display: "flex", gap: 5 }}>
                    <button type="button" onClick={() => setNouvelEvent({...nouvelEvent, membres: activeEquipe.map(m => m.id)})} className="pop-sticker" style={{ cursor: "pointer", background: "var(--cream2)", fontSize: 9 }}>Tous</button>
                    <button type="button" onClick={() => setNouvelEvent({...nouvelEvent, membres: activeEquipe.filter(m => m.groupe === 'A').map(m => m.id)})} className="pop-sticker" style={{ cursor: "pointer", background: couleurs.equipeA, fontSize: 9 }}>Éq. A</button>
                    <button type="button" onClick={() => setNouvelEvent({...nouvelEvent, membres: activeEquipe.filter(m => m.groupe === 'B').map(m => m.id)})} className="pop-sticker" style={{ cursor: "pointer", background: couleurs.equipeB, fontSize: 9 }}>Éq. B</button>
                    <button type="button" onClick={() => setNouvelEvent({...nouvelEvent, membres: []})} className="pop-sticker" style={{ cursor: "pointer", background: "var(--white)", fontSize: 9 }}>Vider</button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {activeEquipe.map(m => {
                    const isAbsent = membresEnConge.includes(m.id);
                    const isSelected = nouvelEvent.membres.includes(m.id);
                    return (
                      <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, cursor: "pointer", border: isSelected ? "2.5px solid var(--ink)" : "1.5px solid rgba(0,0,0,0.12)", background: isSelected ? "var(--yellow)" : "var(--white)", boxShadow: isSelected ? "2px 2px 0 var(--ink)" : "none", opacity: isAbsent ? 0.5 : 1 }}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleMembreEvent(m.id)} style={{ width: 14, height: 14, accentColor: "var(--ink)", flexShrink: 0 }} />
                        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                          <span style={{ fontWeight: 800, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.nom}</span>
                          {isAbsent && <span style={{ fontSize: 9, color: "var(--rouge)", fontWeight: 700 }}>🏖️ En congé</span>}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Horaires exceptionnels */}
              {((mainTypeUI === 'Soirée Jeux' || isDemiUI) && nouvelEvent.membres.length > 0) && (
                <div className="pop-card" style={{ padding: "12px 14px", background: "var(--cream2)" }}>
                  <p className="bc" style={{ fontSize: 12, letterSpacing: "0.05em", marginBottom: 10 }}>Horaires de travail exceptionnels</p>
                  {['A', 'B', 'Aucun'].filter(grp =>
                    mainTypeUI === 'Soirée Jeux'
                      ? activeEquipe.some(m => (m.groupe || 'Aucun') === grp)
                      : activeEquipe.some(m => nouvelEvent.membres.includes(m.id) && (m.groupe || 'Aucun') === grp)
                  ).map(grp => (
                    <div key={grp} className="pop-card" style={{ padding: "8px 10px", marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, fontWeight: 800 }}>{grp === 'Aucun' ? 'Sans équipe' : `Équipe ${grp}`}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input type="time" value={horairesException[grp]?.debut || ''} onChange={e => setHorairesException({...horairesException, [grp]: {...horairesException[grp], debut: e.target.value}})} className="pop-input" style={{ padding: "5px 7px", fontSize: 12, width: 85 }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(0,0,0,0.35)" }}>→</span>
                        <input type="time" value={horairesException[grp]?.fin || ''} onChange={e => setHorairesException({...horairesException, [grp]: {...horairesException[grp], fin: e.target.value}})} className="pop-input" style={{ padding: "5px 7px", fontSize: 12, width: 85 }} />
                        <div style={{ display: "flex", alignItems: "center", background: "var(--cream2)", border: "1.5px solid rgba(0,0,0,0.1)", borderRadius: 6, padding: "4px 7px", gap: 3 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(0,0,0,0.4)" }}>🍽</span>
                          <input type="number" step="0.5" min="0" value={horairesException[grp]?.pause !== undefined ? horairesException[grp].pause : 1} onChange={e => setHorairesException({...horairesException, [grp]: {...horairesException[grp], pause: parseFloat(e.target.value) || 0}})} style={{ width: 32, padding: 0, background: "transparent", border: "none", fontSize: 12, fontWeight: 700, outline: "none", textAlign: "center", fontFamily: "inherit" }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Récurrence */}
              {(!nouvelEvent.id || editMode === 'series') && (
                <div className="pop-card" style={{ padding: "12px 14px", background: "var(--cream2)" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={rep.active} onChange={e => setRep({...rep, active: e.target.checked})} style={{ width: 15, height: 15, accentColor: "var(--ink)" }} />
                    <span style={{ fontWeight: 700, fontSize: 13 }}>Répéter cet événement (Série)</span>
                  </label>
                  {rep.active && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12, paddingTop: 12, borderTop: "1.5px solid rgba(0,0,0,0.08)" }}>
                      <div>
                        <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(0,0,0,0.4)", display: "block", marginBottom: 5 }}>Répéter tous les…</span>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input type="number" min="1" value={rep.interval} onChange={e => setRep({...rep, interval: parseInt(e.target.value) || 1})} className="pop-input" style={{ width: 52, textAlign: "center", fontSize: 13 }} />
                          <select value={rep.period} onChange={e => setRep({...rep, period: e.target.value})} className="pop-input" style={{ flex: 1, cursor: "pointer", fontSize: 13 }}>
                            <option value="weeks">Semaine(s)</option>
                            <option value="months">Mois</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(0,0,0,0.4)", display: "block", marginBottom: 5 }}>Jusqu'au</span>
                        <input type="date" min={nouvelEvent.date_debut} value={rep.date_limite} onChange={e => setRep({...rep, date_limite: e.target.value})} className="pop-input" style={{ width: "100%", fontSize: 13 }} />
                      </div>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(0,0,0,0.4)", display: "block", marginBottom: 5 }}>Participants</span>
                        <select value={rep.rotation ? 'true' : 'false'} onChange={e => setRep({...rep, rotation: e.target.value === 'true'})} className="pop-input" style={{ width: "100%", cursor: "pointer", fontSize: 13 }}>
                          <option value="false">Fixes (Tous les sélectionnés participeront)</option>
                          <option value="true">Chacun son tour (Rotation parmi les sélectionnés)</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button onClick={sauvegarderEvenement} className="pop-btn" style={{ width: "100%", justifyContent: "center", fontSize: 15, padding: "13px 0", marginTop: 16, flexShrink: 0, background: couleurs.accent, color: "var(--ink)", border: "2.5px solid var(--ink)", boxShadow: "3px 3px 0 var(--ink)" }}>
              {nouvelEvent.id ? 'Mettre à jour' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
      )}

      {quickEditEv && (
        <div style={{ position: "fixed", top: 64, bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setQuickEditEv(null); }}>
          <div className="pop-card" style={{ width: "100%", maxWidth: 380 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1.5px solid rgba(0,0,0,0.08)" }}>
              <h2 className="bc" style={{ fontSize: 18, margin: 0 }}>Modifier l'absence</h2>
              <button onClick={() => setQuickEditEv(null)} className="pop-btn pop-btn-outline" style={{ width: 32, height: 32, padding: 0, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>✕</button>
            </div>
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label className="bc" style={{ fontSize: 10, letterSpacing: "0.08em" }}>Type d'absence</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {(['Congé', 'RTT', 'Récupération'] as const).map(base => {
                    const isActive = quickEditEv.type === base || quickEditEv.type === `Demi-${base}`;
                    return (
                      <button key={base}
                        onClick={() => {
                          const isDemi = quickEditEv.type.startsWith('Demi-');
                          const newType = isDemi ? `Demi-${base}` : base;
                          setQuickEditEv({...quickEditEv, type: newType, titre: newType});
                        }}
                        className={`pop-btn ${isActive ? 'pop-btn-dark' : 'pop-btn-outline'}`}
                        style={{ flex: 1, justifyContent: "center", fontSize: 11, padding: "6px 0" }}>
                        {getEventIcon(base)} {base}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => {
                    const isDemi = quickEditEv.type.startsWith('Demi-');
                    const base = isDemi ? quickEditEv.type.replace('Demi-', '') : quickEditEv.type;
                    const newType = isDemi ? base : `Demi-${base}`;
                    setQuickEditEv({...quickEditEv, type: newType, titre: newType});
                  }}
                  className="pop-btn pop-btn-outline"
                  style={{ width: "100%", justifyContent: "center", fontSize: 12, padding: "8px 0", background: quickEditEv.type.startsWith('Demi-') ? "var(--yellow)" : "transparent" }}>
                  {quickEditEv.type.startsWith('Demi-') ? '✓ Demi-journée activée' : 'Basculer en demi-journée'}
                </button>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label className="bc" style={{ fontSize: 10, letterSpacing: "0.08em", display: "block", marginBottom: 5 }}>Début</label>
                  <input type="date" value={quickEditEv.date_debut}
                    onChange={e => setQuickEditEv({...quickEditEv, date_debut: e.target.value, date_fin: e.target.value > quickEditEv.date_fin ? e.target.value : quickEditEv.date_fin})}
                    className="pop-input" style={{ width: "100%", fontSize: 13 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="bc" style={{ fontSize: 10, letterSpacing: "0.08em", display: "block", marginBottom: 5 }}>Fin</label>
                  <input type="date" value={quickEditEv.date_fin} min={quickEditEv.date_debut}
                    onChange={e => setQuickEditEv({...quickEditEv, date_fin: e.target.value})}
                    className="pop-input" style={{ width: "100%", fontSize: 13 }} />
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, padding: "14px 20px", borderTop: "1.5px solid rgba(0,0,0,0.08)" }}>
              <button onClick={() => { supprimerEvenement(quickEditEv.id!); setQuickEditEv(null); }}
                className="pop-btn pop-btn-outline" style={{ fontSize: 12, padding: "8px 12px", borderColor: "rgba(220,38,38,0.4)", color: "#dc2626" }}>
                Supprimer
              </button>
              <button onClick={() => setQuickEditEv(null)}
                className="pop-btn pop-btn-outline" style={{ flex: 1, justifyContent: "center", fontSize: 14 }}>
                Annuler
              </button>
              <button onClick={sauvegarderQuickEdit}
                className="pop-btn pop-btn-dark" style={{ flex: 1, justifyContent: "center", fontSize: 14 }}>
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}