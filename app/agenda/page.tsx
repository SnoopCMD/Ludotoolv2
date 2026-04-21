"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { format, addMonths, subMonths, addWeeks, subWeeks, startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth, isSameMonth, isToday, subDays, setMonth, setYear, getISOWeek, getYear } from "date-fns";
import { fr } from "date-fns/locale";

type MembreEquipe = { 
  id: string; 
  nom: string; 
  role: string; 
  heures_hebdo_base: number; 
  groupe?: string; 
  solde_conges?: number; 
  solde_rtt?: number;
  solde_recup?: number;
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

  const isAbsenceType = ABSENCE_TYPES.includes(nouvelEvent.type);
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
    const payload = { nom: membreActif.nom, role: membreActif.role, groupe: membreActif.groupe, heures_hebdo_base: membreActif.heures_hebdo_base, solde_conges: membreActif.solde_conges, solde_rtt: membreActif.solde_rtt, solde_recup: membreActif.solde_recup, horaires: membreActif.horaires };
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
          const days = eachDayOfInterval({start: new Date(ev.date_debut), end: new Date(ev.date_fin)});
          const factor = ev.type.startsWith('Demi-') ? 0.5 : 1;
          congesPrisJours += days.filter(d => format(d, 'EEEE', {locale: fr}) !== 'dimanche').length * factor; 
        }
        if (ev.type.includes('RTT')) {
          const days = eachDayOfInterval({start: new Date(ev.date_debut), end: new Date(ev.date_fin)});
          const factor = ev.type.startsWith('Demi-') ? 0.5 : 1;
          rttPrisJours += days.filter(d => format(d, 'EEEE', {locale: fr}) !== 'dimanche').length * factor; 
        }
        if (ev.type.includes('Récupération')) {
          if (ev.heure_debut && ev.heure_fin) recupPriseHeures += (timeToMins(ev.heure_fin, true) - timeToMins(ev.heure_debut)) / 60;
          else recupPriseHeures += (membreActif.heures_hebdo_base / 5);
        }
      }
    });

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
    <div className={`min-h-screen p-4 sm:p-8 bg-[#e5e5e5] font-sans relative ${isDraftMode ? 'pt-32' : ''}`}>
      
      {isDraftMode && (
        <div className="fixed top-0 left-0 right-0 bg-orange-500 text-white z-[9999] px-6 py-3 flex flex-col shadow-xl animate-slide-in-down">
          <div className="flex justify-between items-center">
             <div className="flex items-center gap-4">
               <span className="font-black text-lg flex items-center gap-2">🛠️ MODE PRÉVISION</span>
               {(alertes.amplitude.length > 0 || alertes.heuresSupp.length > 0) && (
                 <span className="bg-white/20 px-3 py-1 rounded text-sm font-bold shadow-sm">
                   ⚠️ {alertes.amplitude.length + alertes.heuresSupp.length} Alerte(s) générée(s)
                 </span>
               )}
             </div>
             <div className="flex gap-3">
               <button onClick={toggleDraftMode} className="px-4 py-1.5 bg-white/20 hover:bg-white/30 rounded font-bold transition-colors">Annuler</button>
               <button onClick={appliquerDraft} className="px-4 py-1.5 bg-white text-orange-600 rounded font-black hover:scale-105 transition-transform shadow-sm">Enregistrer & Publier</button>
             </div>
          </div>
          
          {(alertes.amplitude.length > 0 || alertes.heuresSupp.length > 0) && (
            <div className="mt-4 flex flex-wrap gap-2 max-h-32 overflow-y-auto hide-scrollbar">
              {alertes.amplitude.map((a, i) => <div key={`a-${i}`} className="bg-rose-50 text-rose-600 px-3 py-1 rounded text-xs font-bold border border-rose-200">{a}</div>)}
              {alertes.heuresSupp.map((s, i) => <div key={`s-${i}`} className={`px-3 py-1 rounded text-xs font-bold border ${s.includes('🔄') ? 'bg-purple-50 text-purple-600 border-purple-200' : 'bg-blue-50 text-blue-600 border-blue-200'}`}>{s}</div>)}
            </div>
          )}
        </div>
      )}

      {swapSession.active && swapSession.step === 1 && (
        <div className="fixed bottom-10 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white z-[100] px-8 py-4 rounded-full shadow-2xl flex items-center gap-6 animate-bounce-short">
          <span className="font-black text-sm sm:text-lg">🔄 Sélectionnez le(s) jour(s) à échanger</span>
          <div className="flex gap-2">
            <button onClick={() => setSwapSession({ active: false, step: 1, selectedDates: [], m1Id: '', m2Id: '' })} className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-xl font-bold transition-colors">Annuler</button>
            {swapSession.selectedDates.length > 0 && (
              <button onClick={validerSelectionSwap} className="bg-white text-blue-600 px-6 py-2 rounded-xl font-black shadow-sm hover:scale-105 transition-transform">Valider ({swapSession.selectedDates.length})</button>
            )}
          </div>
        </div>
      )}

      <button onClick={() => setShowSettings(!showSettings)} className="fixed bottom-6 right-6 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center text-xl hover:scale-110 transition-transform z-40 border border-slate-100">
        ⚙️
      </button>

      {showSettings && (
        <div className="fixed bottom-20 right-6 w-64 bg-white rounded-2xl shadow-2xl p-5 z-50 animate-fade-in border border-slate-100">
          <h3 className="font-black text-sm mb-4 uppercase text-slate-500">Couleurs du Planning</h3>
          <div className="space-y-3">
            {[
              { label: 'Principale (Équipe)', key: 'accent' },
              { label: 'Sous-Équipe A', key: 'equipeA' },
              { label: 'Sous-Équipe B', key: 'equipeB' },
              { label: 'Équipe Mixte (Échange)', key: 'swap' },
              { label: 'Vacances Zone A', key: 'zoneA' },
              { label: 'Vacances Zone B', key: 'zoneB' },
              { label: 'Vacances Zone C', key: 'zoneC' }
            ].map(c => (
              <div key={c.key} className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">{c.label}</label>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">{couleurs[c.key as keyof typeof couleurs]}</span>
                  <input type="color" value={couleurs[c.key as keyof typeof couleurs]} onChange={e => setCouleurs({...couleurs, [c.key]: e.target.value})} className="w-6 h-6 rounded cursor-pointer border-0 p-0" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <header className="flex justify-between items-center mb-6 relative w-full max-w-[96%] mx-auto shrink-0">
        <div className="w-10 h-10 bg-black rounded flex items-center justify-center text-white font-black text-xl italic">+</div>
        <nav className="absolute left-1/2 transform -translate-x-1/2 bg-[#2d2d2d] text-white p-1.5 rounded-full flex items-center text-sm font-bold shadow-lg z-10 gap-1">
          <Link href="/" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Accueil</Link>
          <Link href="/inventaire" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Inventaire</Link>
          <Link href="/atelier" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Atelier</Link>
          <Link href="/agenda" className="px-6 py-2.5 rounded-full text-black shadow-sm" style={{ backgroundColor: couleurs.accent }}>Agenda</Link>
          <Link href="/store" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Store</Link>
          <Link href="/export" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Export</Link>
        </nav>
        <div className="w-10"></div>
      </header>

      <main className="w-full max-w-screen-2xl mx-auto bg-white rounded-[3rem] p-6 sm:p-10 shadow-md min-h-[80vh] flex flex-col">
        
        <div className="flex flex-col xl:flex-row xl:justify-between xl:items-end gap-6 mb-8">
          <div className="flex flex-col gap-4">
            <h1 className="text-3xl sm:text-4xl font-black text-black capitalize">
              {vue === "Mois" ? format(dateActuelle, 'MMMM yyyy', { locale: fr }) : `Semaine ${format(startOfWeek(dateActuelle, { weekStartsOn: 1 }), 'w', { locale: fr })}`}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setDateActuelle(vue === "Mois" ? subMonths(dateActuelle, 1) : subWeeks(dateActuelle, 1))} className="p-3 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors font-black text-slate-500 hover:text-black">◀</button>
              <div className="flex bg-slate-100 p-1 rounded-2xl">
                <select value={dateActuelle.getMonth()} onChange={e => setDateActuelle(setMonth(dateActuelle, parseInt(e.target.value)))} className="bg-transparent border-none pl-4 pr-2 py-2 font-bold text-sm text-black cursor-pointer outline-none hover:bg-slate-200 rounded-lg capitalize">
                  {Array.from({ length: 12 }).map((_, i) => <option key={i} value={i}>{format(new Date(2000, i, 1), 'MMMM', { locale: fr })}</option>)}
                </select>
                <select value={dateActuelle.getFullYear()} onChange={e => setDateActuelle(setYear(dateActuelle, parseInt(e.target.value)))} className="bg-transparent border-none pr-4 pl-2 py-2 font-bold text-sm text-black cursor-pointer outline-none hover:bg-slate-200 rounded-lg">
                  {Array.from({ length: 10 }).map((_, i) => <option key={i} value={new Date().getFullYear() - 2 + i}>{new Date().getFullYear() - 2 + i}</option>)}
                </select>
              </div>
              <button onClick={() => setDateActuelle(new Date())} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl font-black text-sm text-slate-500 hover:text-black">Aujourd'hui</button>
              <button onClick={() => setDateActuelle(vue === "Mois" ? addMonths(dateActuelle, 1) : addWeeks(dateActuelle, 1))} className="p-3 bg-slate-100 hover:bg-slate-200 rounded-xl font-black text-slate-500 hover:text-black">▶</button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {!isDraftMode && (
               <button onClick={toggleDraftMode} className="bg-orange-100 hover:bg-orange-200 text-orange-600 px-4 py-3 rounded-2xl font-black transition-colors shadow-sm flex items-center gap-2">
                 🛠️ Mode Prévision
               </button>
            )}
            <div className="bg-slate-100 p-1 rounded-2xl flex font-bold text-sm">
              <button onClick={() => setVue("Mois")} className={`px-5 py-2.5 rounded-xl transition-all ${vue === "Mois" ? "bg-white shadow-sm text-black" : "text-slate-500 hover:text-black"}`}>Mois</button>
              <button onClick={() => setVue("Semaine")} className={`px-5 py-2.5 rounded-xl transition-all ${vue === "Semaine" ? "bg-white shadow-sm text-black" : "text-slate-500 hover:text-black"}`}>Semaine</button>
            </div>
            <button onClick={() => setShowEventsListPanel(true)} className="bg-slate-100 hover:bg-slate-200 text-black px-4 py-3 rounded-2xl font-black transition-colors shadow-sm">📅 Événements</button>
            <button onClick={() => { setOngletMembre("profil"); setShowEquipePanel(true); }} className="bg-slate-100 hover:bg-slate-200 text-black px-4 py-3 rounded-2xl font-black transition-colors shadow-sm">👥 Équipe</button>
            <button onClick={() => { 
              const dStr = format(dateActuelle, 'yyyy-MM-dd');
              setNouvelEvent({...eventParDefaut, date_debut: dStr, date_fin: dStr}); 
              setEditMode('single');
              setRep({ active: false, interval: 1, period: 'weeks', date_limite: format(addMonths(new Date(), 1), 'yyyy-MM-dd'), rotation: false });
              setShowEventModal(true); 
            }} className="bg-black hover:bg-gray-800 text-white px-5 py-3 rounded-2xl font-black transition-colors shadow-md">+ Ajouter</button>
          </div>
        </div>

        <div className="flex-1 border-2 border-slate-100 rounded-3xl flex flex-col relative z-0 bg-white">
          <div className={`grid border-b-2 border-slate-100 bg-slate-50 rounded-t-3xl ${vue === "Semaine" ? "grid-cols-[60px_1fr_1fr_1fr_1fr_1fr_1fr_1fr]" : "grid-cols-7"}`}>
            {vue === "Semaine" && <div className="py-3"></div>}
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(jour => (
              <div key={jour} className="py-3 text-center font-black text-slate-400 uppercase text-sm">{jour}</div>
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
                    className={`border-r-2 border-b-2 border-slate-100 transition-colors relative flex flex-col min-h-[120px] group cursor-pointer hover:bg-slate-50 ${isSameMonth(jour, dateActuelle) ? 'bg-white' : 'bg-slate-50/50'} ${isSelectedForSwap ? 'ring-4 ring-inset ring-blue-500 bg-blue-50/30' : ''}`}>
                    
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
            <div className="flex-1 flex relative min-h-[900px] overflow-hidden bg-slate-50/30">
              <div className="absolute inset-0 z-0 pointer-events-none ml-[60px]">
                {HEURES_GRILLE.map((heure, i) => (
                  <div key={i} className="absolute w-full border-t border-slate-200" style={{ top: `${calculerPositionTop(heure + ':00')}%` }}></div>
                ))}
              </div>
              <div className="w-[60px] border-r-2 border-slate-100 flex flex-col bg-white z-10 relative">
                {HEURES_GRILLE.map((heure, i) => (
                  <div key={i} className="absolute w-full text-xs font-bold text-slate-400 text-center" style={{ top: `${calculerPositionTop(heure + ':00')}%`, marginTop: '-8px' }}>
                    {heure}:00
                  </div>
                ))}
              </div>
              <div className="flex-1 grid grid-cols-7 relative">
                <div className="absolute inset-0 grid grid-cols-7 pointer-events-none">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="border-r border-slate-100"></div>
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
      </main>

      {swapSession.active && swapSession.step === 2 && (
        <div className="fixed inset-0 bg-black/40 z-[9999] flex justify-center items-center backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl p-6 sm:p-8 animate-fade-in max-h-[95vh] overflow-y-auto hide-scrollbar flex flex-col">
            <div className="flex justify-between items-center mb-6 shrink-0">
              <h2 className="text-2xl font-black text-black">🔄 Échange d'horaires</h2>
              <button onClick={() => setSwapSession({ active: false, step: 1, selectedDates: [], m1Id: '', m2Id: '' })} className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-full font-black text-slate-600 transition-colors">✕</button>
            </div>

            <p className="text-sm text-slate-500 font-medium mb-6 shrink-0">Vous allez échanger les horaires des personnes suivantes pour {swapSession.selectedDates.length} jour(s).</p>

            <div className="space-y-4 flex-1">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <label className="text-xs font-black text-slate-500 uppercase block mb-2">Membre 1</label>
                <select value={swapSession.m1Id || ''} onChange={e => setSwapSession({...swapSession, m1Id: e.target.value})} className="w-full p-3 rounded-xl border-2 border-slate-200 font-bold outline-none focus:border-black">
                   <option value="">Sélectionner un collaborateur...</option>
                   {activeEquipe.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
                </select>
              </div>

              <div className="flex justify-center text-2xl opacity-50">⇅</div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <label className="text-xs font-black text-slate-500 uppercase block mb-2">Membre 2</label>
                <select value={swapSession.m2Id || ''} onChange={e => setSwapSession({...swapSession, m2Id: e.target.value})} className="w-full p-3 rounded-xl border-2 border-slate-200 font-bold outline-none focus:border-black">
                   <option value="">Sélectionner un collaborateur...</option>
                   {activeEquipe.filter(m => m.id !== swapSession.m1Id).map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
                </select>
              </div>
            </div>

            <button onClick={executerEchange} disabled={!swapSession.m1Id || !swapSession.m2Id} className="w-full mt-6 bg-black text-white font-black py-4 rounded-2xl transition-colors shadow-sm hover:bg-gray-800 disabled:bg-slate-300 disabled:cursor-not-allowed shrink-0">
               Confirmer l'échange
            </button>
          </div>
        </div>
      )}

      {showEquipePanel && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg h-full shadow-2xl flex flex-col animate-slide-in-right">
            <div className="p-6 border-b-2 border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-2xl font-black">👥 Gestion de l'équipe</h2>
              <button onClick={() => { setShowEquipePanel(false); setMembreActif(null); }} className="w-10 h-10 bg-slate-200 hover:bg-slate-300 rounded-full font-black text-slate-600 transition-colors">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {!membreActif ? (
                <div className="space-y-4">
                  <button onClick={() => { setShowEquipePanel(false); setSwapSession({active: true, step: 1, selectedDates: [], m1Id: '', m2Id: ''}); }} className="w-full bg-slate-100 text-slate-800 font-black py-4 rounded-2xl hover:bg-slate-200 transition-colors shadow-sm border border-slate-200 flex justify-center items-center gap-2">
                    🔄 Échanger des horaires
                  </button>

                  <div className="space-y-3 pt-4 border-t-2 border-slate-100">
                    {activeEquipe.map(membre => (
                      <div key={membre.id} onClick={() => { setMembreActif(membre); setOngletMembre("profil"); }} className="p-4 border-2 border-slate-100 rounded-2xl hover:border-black cursor-pointer transition-colors flex justify-between items-center group">
                        <div>
                          <p className="font-bold text-lg flex items-center gap-2">
                            {membre.nom}
                            {membre.groupe && membre.groupe !== 'Aucun' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-black text-black" style={{ backgroundColor: membre.groupe === 'A' ? couleurs.equipeA : couleurs.equipeB }}>Grp {membre.groupe}</span>
                            )}
                          </p>
                          <p className="text-sm text-slate-500 font-medium">{membre.role} • {membre.heures_hebdo_base}h/sem</p>
                        </div>
                        <span className="text-slate-300 group-hover:text-black transition-colors">▶</span>
                      </div>
                    ))}
                    {activeEquipe.length === 0 && <p className="text-center text-slate-400 py-10 font-medium">L'équipe est vide.</p>}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <button onClick={() => setMembreActif(null)} className="text-sm font-bold text-slate-400 hover:text-black">◀ Retour à la liste</button>
                    <h3 className="font-black text-lg">{membreActif.nom}</h3>
                  </div>

                  <div className="flex bg-slate-100 p-1 rounded-2xl font-bold text-sm">
                    <button onClick={() => setOngletMembre("profil")} className={`flex-1 py-2 rounded-xl transition-all ${ongletMembre === "profil" ? "bg-white shadow-sm text-black" : "text-slate-500 hover:text-black"}`}>Profil & Horaires</button>
                    <button onClick={() => setOngletMembre("suivi")} className={`flex-1 py-2 rounded-xl transition-all ${ongletMembre === "suivi" ? "bg-white shadow-sm text-black" : "text-slate-500 hover:text-black"}`}>Fiche Perso (RH)</button>
                  </div>
                  
                  {ongletMembre === "profil" ? (
                    <div className="animate-fade-in space-y-6">
                      <div className={`px-4 py-3 rounded-xl flex justify-between items-center font-bold text-sm border-2 ${Math.abs(diffHeures) > 0.1 ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-slate-100 border-slate-200 text-black'}`} style={Math.abs(diffHeures) <= 0.1 ? {backgroundColor: couleurs.accent+'33', borderColor: couleurs.accent} : {}}>
                        <span>Moyenne Base : {moyenneHeures.toFixed(1)}h</span>
                        {Math.abs(diffHeures) > 0.1 ? (
                          <span>⚠️ Écart : {diffHeures > 0 ? '+' : ''}{diffHeures.toFixed(1)}h</span>
                        ) : (
                          <span>✅ Objectif atteint</span>
                        )}
                      </div>

                      <div className="space-y-4 bg-slate-50 p-5 rounded-2xl border-2 border-slate-100">
                        <div>
                          <label className="text-xs font-black text-slate-500 uppercase tracking-wide">Nom complet</label>
                          <input type="text" value={membreActif.nom} onChange={e => setMembreActif({...membreActif, nom: e.target.value})} className="w-full mt-1 p-3 rounded-xl border-2 border-slate-200 font-bold outline-none focus:border-black" />
                        </div>
                        <div className="flex gap-4">
                          <div className="flex-1">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-wide">Rôle</label>
                            <input type="text" value={membreActif.role} onChange={e => setMembreActif({...membreActif, role: e.target.value})} className="w-full mt-1 p-3 rounded-xl border-2 border-slate-200 font-bold outline-none focus:border-black" />
                          </div>
                          <div className="w-1/3">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-wide">Équipe</label>
                            <select value={membreActif.groupe || 'Aucun'} onChange={e => setMembreActif({...membreActif, groupe: e.target.value})} className="w-full mt-1 p-3 rounded-xl border-2 border-slate-200 font-bold outline-none focus:border-black">
                              <option value="Aucun">Aucune</option>
                              <option value="A">Équipe A</option>
                              <option value="B">Équipe B</option>
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-black text-slate-500 uppercase tracking-wide">Base (h/sem)</label>
                            <input type="number" step="0.5" min="0" value={membreActif.heures_hebdo_base} onChange={e => setMembreActif({...membreActif, heures_hebdo_base: parseFloat(e.target.value) || 0})} className="w-full mt-1 p-3 rounded-xl border-2 border-slate-200 font-bold outline-none focus:border-black" />
                          </div>
                          <div>
                            <label className="text-xs font-black text-slate-500 uppercase tracking-wide">Solde Récup (h)</label>
                            <input type="number" step="0.5" value={membreActif.solde_recup ?? 0} onChange={e => setMembreActif({...membreActif, solde_recup: parseFloat(e.target.value)})} className="w-full mt-1 p-3 rounded-xl border-2 border-slate-200 font-bold outline-none focus:border-black" />
                          </div>
                          <div>
                            <label className="text-xs font-black text-slate-500 uppercase tracking-wide">Solde Congés (Jrs)</label>
                            <input type="number" step="0.5" value={membreActif.solde_conges ?? 25} onChange={e => setMembreActif({...membreActif, solde_conges: parseFloat(e.target.value)})} className="w-full mt-1 p-3 rounded-xl border-2 border-slate-200 font-bold outline-none focus:border-black" />
                          </div>
                          <div>
                            <label className="text-xs font-black text-slate-500 uppercase tracking-wide">Solde RTT (Jrs)</label>
                            <input type="number" step="0.5" value={membreActif.solde_rtt ?? 0} onChange={e => setMembreActif({...membreActif, solde_rtt: parseFloat(e.target.value)})} className="w-full mt-1 p-3 rounded-xl border-2 border-slate-200 font-bold outline-none focus:border-black" />
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="font-black text-lg">Horaires de la semaine</h3>
                          <button onClick={inverserSemaines} title="Inverser Semaine A et B" className="p-2 bg-slate-100 hover:bg-slate-200 rounded text-slate-500 hover:text-black transition-colors text-xs font-bold">⇅ Inverser A/B</button>
                        </div>
                        <div className="flex bg-slate-100 p-1 rounded-2xl mb-4 font-bold text-sm">
                          <button onClick={() => setSemaineActive("semaineA")} className={`flex-1 py-2 rounded-xl transition-all ${semaineActive === "semaineA" ? "bg-white shadow-sm text-black" : "text-slate-500 hover:text-black"}`}>Semaine A</button>
                          <button onClick={() => setSemaineActive("semaineB")} className={`flex-1 py-2 rounded-xl transition-all ${semaineActive === "semaineB" ? "bg-white shadow-sm text-black" : "text-slate-500 hover:text-black"}`}>Semaine B</button>
                        </div>
                        <div className="space-y-2">
                          {JOURS_SEMAINE.map(jour => {
                            const h = membreActif.horaires?.[semaineActive]?.[jour] || { debut: '', fin: '', pause: 1 };
                            return (
                              <div key={jour} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-white border-2 border-slate-100 rounded-xl hover:border-slate-300 transition-colors gap-2">
                                <span className="w-24 font-bold text-sm capitalize">{jour}</span>
                                <div className="flex items-center gap-1 sm:gap-2">
                                  <input type="time" value={h.debut} onChange={e => updateHoraire(jour, 'debut', e.target.value)} className="p-1 sm:p-2 border-2 border-slate-100 rounded-lg text-xs sm:text-sm font-bold outline-none focus:border-black" />
                                  <span className="text-slate-400 font-bold">à</span>
                                  <input type="time" value={h.fin} onChange={e => updateHoraire(jour, 'fin', e.target.value)} className="p-1 sm:p-2 border-2 border-slate-100 rounded-lg text-xs sm:text-sm font-bold outline-none focus:border-black" />
                                  <div className="flex items-center bg-slate-50 border-2 border-slate-100 rounded-lg ml-1 px-1 sm:px-2">
                                    <span className="text-[10px] sm:text-xs font-bold text-slate-400 mr-1">Repas(h)</span>
                                    <input type="number" step="0.5" min="0" value={h.pause !== undefined ? h.pause : 1} onChange={e => updateHoraire(jour, 'pause', parseFloat(e.target.value) || 0)} className="w-10 sm:w-12 p-1 bg-transparent text-xs sm:text-sm font-bold outline-none text-center" />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6 animate-fade-in">
                      {statsPerso && (
                        <>
                          <div className="bg-slate-50 p-5 rounded-2xl border-2 border-slate-100">
                            <h3 className="text-xs font-black text-slate-500 uppercase tracking-wide mb-4">Bilan Annuel ({dateActuelle.getFullYear()})</h3>
                            <div className="grid grid-cols-3 gap-3">
                              <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col justify-center shadow-sm">
                                <span className="text-[9px] font-bold text-slate-400 uppercase">Congés restants</span>
                                <span className="text-xl font-black mt-1">{(membreActif.solde_conges ?? 25) - statsPerso.congesPrisJours} <span className="text-xs font-bold text-slate-500">jrs</span></span>
                                <span className="text-[9px] font-bold text-slate-400 mt-1">({statsPerso.congesPrisJours} pris)</span>
                              </div>
                              <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col justify-center shadow-sm">
                                <span className="text-[9px] font-bold text-slate-400 uppercase">RTT restants</span>
                                <span className="text-xl font-black mt-1">{(membreActif.solde_rtt ?? 0) - statsPerso.rttPrisJours} <span className="text-xs font-bold text-slate-500">jrs</span></span>
                                <span className="text-[9px] font-bold text-slate-400 mt-1">({statsPerso.rttPrisJours} pris)</span>
                              </div>
                              <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col justify-center shadow-sm">
                                <span className="text-[9px] font-bold text-slate-400 uppercase">Heures Récup.</span>
                                <span className="text-xl font-black mt-1">{(membreActif.solde_recup ?? 0) - statsPerso.recupPriseHeures} <span className="text-xs font-bold text-slate-500">h</span></span>
                                <span className="text-[9px] font-bold text-slate-400 mt-1">({statsPerso.recupPriseHeures}h prises)</span>
                              </div>
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between items-center mb-3">
                              <h3 className="text-xs font-black text-slate-500 uppercase tracking-wide">Bilan Mensuel</h3>
                              <div className="flex items-center gap-1 bg-slate-200/50 p-1 rounded-lg">
                                <button onClick={() => setDateActuelle(subMonths(dateActuelle, 1))} className="px-2 py-1 hover:bg-white rounded-md text-slate-600 font-black text-xs transition-all shadow-sm">◀</button>
                                <span className="text-[10px] font-black uppercase tracking-wide text-slate-700 px-2 min-w-[90px] text-center">
                                  {format(dateActuelle, 'MMMM yyyy', {locale: fr})}
                                </span>
                                <button onClick={() => setDateActuelle(addMonths(dateActuelle, 1))} className="px-2 py-1 hover:bg-white rounded-md text-slate-600 font-black text-xs transition-all shadow-sm">▶</button>
                              </div>
                            </div>
                            
                            <div className={`p-4 rounded-xl border-2 shadow-sm mb-4 flex justify-between items-center ${statsPerso.diffMoisHeures > 0 ? 'bg-blue-50 border-blue-200 text-blue-700' : statsPerso.diffMoisHeures < 0 ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                              <span className="font-bold">Heures Supplémentaires ce mois :</span>
                              <span className="font-black text-xl">{statsPerso.diffMoisHeures > 0 ? '+' : ''}{statsPerso.diffMoisHeures.toFixed(1)} h</span>
                            </div>

                            <div className="bg-white border-2 border-slate-100 rounded-2xl overflow-hidden">
                              <div className="p-4 border-b-2 border-slate-100 bg-slate-50">
                                <span className="font-bold text-sm">Événements du mois ({statsPerso.eventsDuMois.length})</span>
                              </div>
                              <div className="divide-y-2 divide-slate-50 max-h-[300px] overflow-y-auto hide-scrollbar">
                                {statsPerso.eventsDuMois.length === 0 && <p className="p-4 text-sm text-slate-400 italic">Aucun événement ce mois-ci.</p>}
                                {statsPerso.eventsDuMois.map(ev => (
                                  <div key={ev.id} className="p-4 hover:bg-slate-50 transition-colors flex flex-col gap-1">
                                    <div className="flex justify-between items-start">
                                      <span className="font-bold text-sm flex items-center gap-2">{getEventIcon(ev.type)} {ev.titre}</span>
                                      <span className={`text-[10px] font-black px-2 py-1 rounded-md uppercase ${getEventStyle(ev.type)}`}>{ev.type.replace('Demi-', '1/2 ')}</span>
                                    </div>
                                    <span className="text-xs font-medium text-slate-500">
                                      {format(new Date(ev.date_debut), 'dd MMM', {locale: fr})}
                                      {ev.date_debut !== ev.date_fin && ` - ${format(new Date(ev.date_fin), 'dd MMM', {locale: fr})}`}
                                      {ev.heure_debut && ` • ${ev.heure_debut}-${ev.heure_fin}`}
                                    </span>
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
            {membreActif && ongletMembre === "profil" && (
              <div className="p-6 border-t-2 border-slate-100 bg-white shrink-0">
                <button onClick={sauvegarderMembre} disabled={!membreActif.nom} className="w-full bg-black hover:bg-gray-800 disabled:bg-slate-300 text-white font-black py-4 rounded-2xl transition-colors shadow-md">Enregistrer les infos</button>
              </div>
            )}
          </div>
        </div>
      )}

      {showEventsListPanel && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg h-full shadow-2xl flex flex-col animate-slide-in-right">
            <div className="p-6 border-b-2 border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-2xl font-black">📅 Événements</h2>
              <button onClick={() => setShowEventsListPanel(false)} className="w-10 h-10 bg-slate-200 hover:bg-slate-300 rounded-full font-black text-slate-600 transition-colors">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              
              <button onClick={() => { 
                const dStr = format(dateActuelle, 'yyyy-MM-dd');
                setNouvelEvent({...eventParDefaut, date_debut: dStr, date_fin: dStr}); 
                setEditMode('single');
                setRep({ active: false, interval: 1, period: 'weeks', date_limite: format(addMonths(new Date(), 1), 'yyyy-MM-dd'), rotation: false });
                setShowEventsListPanel(false); 
                setShowEventModal(true); 
              }} className="w-full text-black font-black py-4 rounded-2xl mb-6 transition-colors shadow-sm hover:brightness-95" style={{ backgroundColor: couleurs.accent }}>
                + Nouvel événement
              </button>

              <div className="flex bg-slate-100 p-1 rounded-2xl mb-6 font-bold text-sm">
                <button onClick={() => setListTab('ponctuels')} className={`flex-1 py-2.5 rounded-xl transition-all ${listTab === 'ponctuels' ? 'bg-white shadow-sm text-black' : 'text-slate-500 hover:text-black'}`}>Ponctuels</button>
                <button onClick={() => setListTab('series')} className={`flex-1 py-2.5 rounded-xl transition-all ${listTab === 'series' ? 'bg-white shadow-sm text-black' : 'text-slate-500 hover:text-black'}`}>Séries Récurrentes</button>
              </div>

              {listTab === 'ponctuels' && (
                <>
                  <h3 className="font-black text-lg text-slate-800 mb-4">En cours</h3>
                  <div className="space-y-3 mb-8">
                    {eventsEnCours.length === 0 && <p className="text-sm text-slate-400 italic">Rien de prévu en ce moment.</p>}
                    {eventsEnCours.map(ev => (
                      <div key={ev.id} className={`p-4 border-2 border-slate-100 rounded-2xl flex justify-between items-center group shadow-sm ${getEventStyle(ev.type)}`}>
                        <div className="flex-1 cursor-pointer" onClick={() => ouvrirEditionEvenement(ev, 'single')}>
                          <p className="font-bold text-md flex items-center gap-2">{getEventIcon(ev.type)} {ev.titre}</p>
                          <p className="text-xs font-medium mt-1 opacity-80">
                            {format(new Date(ev.date_debut), 'dd MMM yyyy', {locale: fr})} 
                            {ev.date_debut !== ev.date_fin && ` ➔ ${format(new Date(ev.date_fin), 'dd MMM yyyy', {locale: fr})}`}
                            {ev.heure_debut ? ` • ${ev.heure_debut}-${ev.heure_fin}` : ' • Journée entière'}
                          </p>
                          <p className="text-[10px] font-black mt-1 uppercase tracking-wide opacity-90">{getNomsMembresEvent(ev.membres)}</p>
                        </div>
                        <button onClick={() => supprimerEvenement(ev.id!)} className="w-8 h-8 rounded-full bg-white/50 hover:bg-rose-500 hover:text-white transition-colors flex justify-center items-center font-bold">✕</button>
                      </div>
                    ))}
                  </div>

                  <h3 className="font-black text-lg text-slate-800 mb-4">À venir</h3>
                  <div className="space-y-3 mb-8">
                    {eventsAVenir.length === 0 && <p className="text-sm text-slate-400 italic">Aucun événement à venir.</p>}
                    {eventsAVenir.map(ev => (
                      <div key={ev.id} className="p-4 border-2 border-slate-100 rounded-2xl flex justify-between items-center group bg-white shadow-sm">
                        <div className="flex-1 cursor-pointer" onClick={() => ouvrirEditionEvenement(ev, 'single')}>
                          <p className="font-bold text-md flex items-center gap-2">{getEventIcon(ev.type)} {ev.titre}</p>
                          <p className="text-xs text-slate-500 font-medium mt-1">
                            {format(new Date(ev.date_debut), 'dd MMM yyyy', {locale: fr})} 
                            {ev.date_debut !== ev.date_fin && ` ➔ ${format(new Date(ev.date_fin), 'dd MMM yyyy', {locale: fr})}`}
                            {ev.heure_debut ? ` • ${ev.heure_debut}-${ev.heure_fin}` : ' • Journée entière'}
                          </p>
                          <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wide">{getNomsMembresEvent(ev.membres)}</p>
                        </div>
                        <button onClick={() => supprimerEvenement(ev.id!)} className="w-8 h-8 rounded-full bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white transition-colors flex justify-center items-center font-bold">✕</button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {listTab === 'series' && (
                <div className="space-y-4">
                  {Object.keys(groupesSeries).length === 0 && <p className="text-sm text-slate-400 italic">Aucune série répétée.</p>}
                  {Object.entries(groupesSeries).map(([pid, evs]) => {
                    const firstEv = evs[0];
                    const isExpanded = groupesEtendus[pid];
                    return (
                      <div key={pid} className="border-2 border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                        <div className="p-4 bg-slate-50 flex justify-between items-center cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => setGroupesEtendus(p => ({...p, [pid]: !p[pid]}))}>
                          <div>
                            <p className="font-black text-md flex items-center gap-2">{getEventIcon(firstEv.type)} {firstEv.titre}</p>
                            <p className="text-xs text-slate-500 font-medium mt-1">Série de {evs.length} événement(s)</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={(e) => { e.stopPropagation(); ouvrirEditionEvenement(firstEv, 'series'); }} className="px-3 py-1.5 bg-white border border-slate-200 hover:border-black rounded-lg text-xs font-bold transition-colors shadow-sm">
                              ✏️ Série
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); supprimerEvenement(firstEv.id!, true, pid); }} className="w-8 h-8 rounded-full bg-white border border-slate-200 text-rose-500 hover:bg-rose-500 hover:text-white transition-colors flex justify-center items-center font-bold">
                              ✕
                            </button>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="p-3 bg-white space-y-2 border-t border-slate-100 max-h-[300px] overflow-y-auto">
                            {evs.map(occ => (
                              <div key={occ.id} className={`p-3 rounded-xl border flex justify-between items-center group cursor-pointer transition-colors ${occ.date_debut < todayStr ? 'opacity-50 grayscale' : ''} ${getEventStyle(occ.type)}`} onClick={() => ouvrirEditionEvenement(occ, 'single')}>
                                <div>
                                  <p className="font-bold text-sm">{format(new Date(occ.date_debut), 'dd MMM yyyy', {locale: fr})}</p>
                                  <p className="text-[10px] font-medium opacity-80 mt-0.5">{occ.heure_debut ? `${occ.heure_debut}-${occ.heure_fin}` : 'Journée entière'} • {getNomsMembresEvent(occ.membres)}</p>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); supprimerEvenement(occ.id!); }} className="w-6 h-6 rounded-full bg-white/50 hover:bg-rose-500 hover:text-white transition-colors flex justify-center items-center font-bold text-xs opacity-0 group-hover:opacity-100">✕</button>
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
        <div className="fixed inset-0 bg-black/40 z-[9999] flex justify-center items-center backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl p-6 sm:p-8 animate-fade-in max-h-[95vh] overflow-y-auto hide-scrollbar flex flex-col">
            <div className="flex justify-between items-center mb-6 shrink-0">
              <div className="flex items-center">
                 <h2 className="text-2xl font-black text-black">{nouvelEvent.id ? 'Modifier' : 'Nouvel Événement'}</h2>
                 {nouvelEvent.id && (
                    <button onClick={dupliquerEvenement} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-3 py-1.5 rounded-lg ml-3 transition-colors flex items-center gap-1 shadow-sm">
                       📄 Dupliquer
                    </button>
                 )}
              </div>
              <button onClick={() => setShowEventModal(false)} className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-full font-black text-slate-600 transition-colors">✕</button>
            </div>

            <div className="space-y-4 flex-1">
              
              {nouvelEvent.parent_id && (
                <div className="flex bg-slate-100 p-1 rounded-xl font-bold text-xs mb-2">
                  <button onClick={() => setEditMode('single')} className={`flex-1 py-2 rounded-lg transition-all ${editMode === 'single' ? 'bg-white shadow-sm text-black' : 'text-slate-500 hover:text-black'}`}>Cet événement uniquement</button>
                  <button onClick={() => setEditMode('series')} className={`flex-1 py-2 rounded-lg transition-all ${editMode === 'series' ? 'bg-white shadow-sm text-black' : 'text-slate-500 hover:text-black'}`}>Toute la série</button>
                </div>
              )}

              <div>
                <label className="text-xs font-black text-slate-500 uppercase">Titre</label>
                <input type="text" value={nouvelEvent.titre} onChange={e => setNouvelEvent({...nouvelEvent, titre: e.target.value})} className="w-full mt-1 p-3 rounded-xl border-2 border-slate-200 font-bold outline-none focus:border-black" placeholder="Ex: Congés Bernard, Animation Cité..." />
              </div>

              <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
                <div className="flex flex-wrap gap-1 mb-2 bg-white p-1 rounded-lg shadow-sm">
                  <button type="button" onClick={() => setMainType('Absence')} className={`flex-1 py-2 px-1 rounded-md font-bold text-[11px] transition-colors ${mainTypeUI === 'Absence' ? 'bg-rose-50 text-rose-600' : 'text-slate-500 hover:bg-slate-50'}`}>Absence</button>
                  <button type="button" onClick={() => setMainType('Réunion')} className={`flex-1 py-2 px-1 rounded-md font-bold text-[11px] transition-colors ${mainTypeUI === 'Réunion' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}>Réunion</button>
                  <button type="button" onClick={() => setMainType('Animation')} className={`flex-1 py-2 px-1 rounded-md font-bold text-[11px] transition-colors ${mainTypeUI === 'Animation' ? 'bg-amber-50 text-amber-600' : 'text-slate-500 hover:bg-slate-50'}`}>Animation</button>
                  <button type="button" onClick={() => setMainType('Soirée Jeux')} className={`flex-1 py-2 px-1 rounded-md font-bold text-[11px] transition-colors ${mainTypeUI === 'Soirée Jeux' ? 'bg-purple-50 text-purple-600' : 'text-slate-500 hover:bg-slate-50'}`}>Soirée Jeux</button>
                  <button type="button" onClick={() => setMainType('Heures Exceptionnelles')} className={`flex-1 py-2 px-1 rounded-md font-bold text-[11px] transition-colors ${mainTypeUI === 'Heures Exceptionnelles' ? 'bg-teal-50 text-teal-600' : 'text-slate-500 hover:bg-slate-50'}`}>H. Excep.</button>
                </div>

                {mainTypeUI === 'Absence' && (
                  <div className="space-y-3 px-2 pb-2">
                    <div className="flex gap-2 justify-center">
                      <button type="button" onClick={() => setAbsType('Congé')} className={`flex-1 py-1.5 rounded-full font-bold text-[10px] uppercase border transition-colors ${absTypeUI === 'Congé' ? 'border-rose-500 bg-rose-500 text-white shadow-sm' : 'border-slate-300 text-slate-500 hover:bg-white'}`}>Congé</button>
                      <button type="button" onClick={() => setAbsType('RTT')} className={`flex-1 py-1.5 rounded-full font-bold text-[10px] uppercase border transition-colors ${absTypeUI === 'RTT' ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm' : 'border-slate-300 text-slate-500 hover:bg-white'}`}>RTT</button>
                      <button type="button" onClick={() => setAbsType('Récupération')} className={`flex-1 py-1.5 rounded-full font-bold text-[10px] uppercase border transition-colors ${absTypeUI === 'Récupération' ? 'border-rose-500 bg-rose-500 text-white shadow-sm' : 'border-slate-300 text-slate-500 hover:bg-white'}`}>Récupération</button>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setIsDemi(false)} className={`flex-1 py-2 rounded-lg font-bold text-xs border-2 transition-colors ${!isDemiUI ? 'border-black bg-white text-black shadow-sm' : 'border-transparent text-slate-500 hover:bg-white'}`}>Journée entière</button>
                      <button type="button" onClick={() => setIsDemi(true)} className={`flex-1 py-2 rounded-lg font-bold text-xs border-2 transition-colors ${isDemiUI ? 'border-black bg-white text-black shadow-sm' : 'border-transparent text-slate-500 hover:bg-white'}`}>Demi-journée</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-xs font-black text-slate-500 uppercase">Le (Début)</label>
                  <input type="date" value={nouvelEvent.date_debut} onChange={e => handleDateDebutChange(e.target.value)} className="w-full mt-1 p-3 rounded-xl border-2 border-slate-200 font-bold outline-none focus:border-black text-sm" />
                </div>
                {(!rep.active && editMode === 'single') && (
                  <div className="flex-1">
                    <label className="text-xs font-black text-slate-500 uppercase">Au (Fin)</label>
                    <input type="date" value={nouvelEvent.date_fin} min={nouvelEvent.date_debut} onChange={e => setNouvelEvent({...nouvelEvent, date_fin: e.target.value})} className="w-full mt-1 p-3 rounded-xl border-2 border-slate-200 font-bold outline-none focus:border-black text-sm" />
                  </div>
                )}
              </div>

              <div className={`flex gap-4 transition-opacity ${isTimeDisabled ? 'opacity-30 pointer-events-none' : ''}`}>
                <div className="flex-1">
                  <label className="text-xs font-black text-slate-500 uppercase">De (Optionnel)</label>
                  <input type="time" value={nouvelEvent.heure_debut || ''} onChange={e => setNouvelEvent({...nouvelEvent, heure_debut: e.target.value})} className="w-full mt-1 p-3 rounded-xl border-2 border-slate-200 font-bold outline-none focus:border-black text-sm bg-white" />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-black text-slate-500 uppercase">À (Optionnel)</label>
                  <input type="time" value={nouvelEvent.heure_fin || ''} onChange={e => setNouvelEvent({...nouvelEvent, heure_fin: e.target.value})} className="w-full mt-1 p-3 rounded-xl border-2 border-slate-200 font-bold outline-none focus:border-black text-sm bg-white" />
                </div>
              </div>

              <div>
                <label className="text-xs font-black text-slate-500 uppercase block mb-2">Personnes concernées</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  <button type="button" onClick={() => setNouvelEvent({...nouvelEvent, membres: activeEquipe.map(m => m.id)})} className="text-[10px] font-bold px-3 py-1.5 bg-slate-200 hover:bg-slate-300 rounded-full transition-colors text-slate-700">Toute l'équipe</button>
                  <button type="button" onClick={() => setNouvelEvent({...nouvelEvent, membres: activeEquipe.filter(m => m.groupe === 'A').map(m => m.id)})} className="text-[10px] font-bold px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-full transition-colors">Équipe A</button>
                  <button type="button" onClick={() => setNouvelEvent({...nouvelEvent, membres: activeEquipe.filter(m => m.groupe === 'B').map(m => m.id)})} className="text-[10px] font-bold px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-full transition-colors">Équipe B</button>
                  <button type="button" onClick={() => setNouvelEvent({...nouvelEvent, membres: []})} className="text-[10px] font-bold px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full transition-colors">Vider</button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {activeEquipe.map(m => {
                    const isAbsent = membresEnConge.includes(m.id);
                    return (
                      <label key={m.id} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border-2 transition-colors ${nouvelEvent.membres.includes(m.id) ? 'border-black bg-slate-50 shadow-sm' : 'border-transparent hover:bg-slate-50'} ${isAbsent ? 'opacity-50 bg-slate-100 grayscale' : ''}`}>
                        <input type="checkbox" checked={nouvelEvent.membres.includes(m.id)} onChange={() => toggleMembreEvent(m.id)} className="w-4 h-4 accent-black shrink-0" />
                        <div className="flex flex-col overflow-hidden">
                          <span className="font-bold text-sm truncate">{m.nom}</span>
                          {isAbsent && <span className="text-[9px] text-rose-500 font-bold leading-none mt-0.5">🏖️ En congé</span>}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {((mainTypeUI === 'Soirée Jeux' || isDemiUI) && nouvelEvent.membres.length > 0) && (
                <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-200 mt-4 animate-fade-in">
                  <h4 className="text-xs font-black text-slate-800 uppercase mb-3">Horaires de travail exceptionnels</h4>
                  
                  {['A', 'B', 'Aucun'].filter(grp => 
                    mainTypeUI === 'Soirée Jeux' 
                      ? activeEquipe.some(m => (m.groupe || 'Aucun') === grp) 
                      : activeEquipe.some(m => nouvelEvent.membres.includes(m.id) && (m.groupe || 'Aucun') === grp)
                  ).map(grp => (
                    <div key={grp} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-3 rounded-xl mb-2 shadow-sm gap-2 border border-slate-100">
                      <span className="text-xs font-bold text-slate-700">
                        {grp === 'Aucun' ? 'Sans équipe' : `Équipe ${grp}`}
                      </span>
                      <div className="flex items-center gap-1 sm:gap-2">
                        <input type="time" value={horairesException[grp]?.debut || ''} onChange={e => setHorairesException({...horairesException, [grp]: {...horairesException[grp], debut: e.target.value}})} className="p-1.5 rounded-lg border-2 border-slate-100 text-xs font-bold outline-none focus:border-slate-300" />
                        <span className="text-slate-400 font-bold text-xs">à</span>
                        <input type="time" value={horairesException[grp]?.fin || ''} onChange={e => setHorairesException({...horairesException, [grp]: {...horairesException[grp], fin: e.target.value}})} className="p-1.5 rounded-lg border-2 border-slate-100 text-xs font-bold outline-none focus:border-slate-300" />
                        <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg ml-1 px-1">
                          <span className="text-[9px] font-bold text-slate-400 mr-1">Repas</span>
                          <input type="number" step="0.5" min="0" value={horairesException[grp]?.pause !== undefined ? horairesException[grp].pause : 1} onChange={e => setHorairesException({...horairesException, [grp]: {...horairesException[grp], pause: parseFloat(e.target.value) || 0}})} className="w-10 p-1 bg-transparent text-xs font-bold outline-none text-center" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {(!nouvelEvent.id || editMode === 'series') && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={rep.active} onChange={e => setRep({...rep, active: e.target.checked})} className="w-4 h-4 accent-black" />
                    <span className="font-bold text-sm text-slate-700">Répéter cet événement (Série)</span>
                  </label>
                  {rep.active && (
                    <div className="grid grid-cols-2 gap-3 mt-3 animate-fade-in border-t border-slate-200 pt-3">
                       <div className="col-span-2 sm:col-span-1">
                         <label className="text-[10px] font-black text-slate-500 uppercase">Répéter tous les...</label>
                         <div className="flex gap-2 mt-1">
                           <input type="number" min="1" value={rep.interval} onChange={e => setRep({...rep, interval: parseInt(e.target.value) || 1})} className="w-16 p-2 rounded-lg border border-slate-200 text-xs font-bold outline-none focus:border-black text-center" />
                           <select value={rep.period} onChange={e => setRep({...rep, period: e.target.value})} className="flex-1 p-2 rounded-lg border border-slate-200 text-xs font-bold outline-none cursor-pointer focus:border-black">
                             <option value="weeks">Semaine(s)</option>
                             <option value="months">Mois</option>
                           </select>
                         </div>
                       </div>
                       <div className="col-span-2 sm:col-span-1">
                         <label className="text-[10px] font-black text-slate-500 uppercase">Jusqu'au</label>
                         <input type="date" min={nouvelEvent.date_debut} value={rep.date_limite} onChange={e => setRep({...rep, date_limite: e.target.value})} className="w-full p-2 mt-1 rounded-lg border border-slate-200 text-xs font-bold outline-none focus:border-black" />
                       </div>
                       <div className="col-span-2">
                         <label className="text-[10px] font-black text-slate-500 uppercase">Participants</label>
                         <select value={rep.rotation ? 'true' : 'false'} onChange={e => setRep({...rep, rotation: e.target.value === 'true'})} className="w-full p-2 mt-1 rounded-lg border border-slate-200 text-xs font-bold outline-none cursor-pointer focus:border-black">
                           <option value="false">Fixes (Tous les sélectionnés participeront)</option>
                           <option value="true">Chacun son tour (Rotation parmi les sélectionnés)</option>
                         </select>
                       </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button onClick={sauvegarderEvenement} className="w-full mt-6 text-black font-black py-4 rounded-2xl transition-colors shadow-sm hover:brightness-95 shrink-0" style={{ backgroundColor: couleurs.accent }}>
              {nouvelEvent.id ? 'Mettre à jour' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}