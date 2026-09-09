"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import NavBar from "../../components/NavBar";
import { format, addMonths, subMonths, addWeeks, subWeeks, startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth, isSameMonth, isToday, subDays, setMonth, setYear, getISOWeek, getYear, addDays } from "date-fns";
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
type PlanningSlot = { id: string; dateKey: string; debut: string; fin: string; membreIds: string[]; room?: 'principale' | 'jv' };
type Vacataire = { id: string; nom: string; couleur: string };
const VAC_COLORS = ['#fb923c', '#c084fc', '#f472b6', '#34d399', '#facc15'];

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

const ABSENCE_TYPES = ['Congé', 'Demi-Congé', 'RTT', 'Demi-RTT', 'Récupération', 'Demi-Récupération', 'Formation', 'Demi-Formation'];

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

const PLANNING_START = 9;
const PLANNING_END = 20;
const PLANNING_HEURES = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const planningTopPct = (t: string) =>
  Math.max(0, Math.min(100, (timeToMins(t) - PLANNING_START * 60) / ((PLANNING_END - PLANNING_START) * 60) * 100));
const planningHPct = (d: string, f: string) => planningTopPct(f) - planningTopPct(d);
const PLANNING_SLOTS_MAP: Record<number, string[]> = {
  2: ['09:30|11:30', '13:00|16:00', '16:00|18:00', '18:00|19:00'],
  3: ['10:00|13:00', '13:00|15:00', '15:00|17:00', '17:00|18:00'],
  4: ['13:00|15:00', '15:00|17:00', '17:00|19:00'],
  5: ['09:30|11:30', '13:00|16:00', '16:00|18:00', '18:00|20:00'],
  6: ['10:00|12:00', '12:00|13:00', '13:00|14:00', '14:00|18:00'],
};
const JV_SLOTS_MAP: Record<number, string[]> = {
  2: ['16:00|18:00'],
  3: ['15:00|17:00'],
  4: ['15:00|17:00'],
  5: ['16:00|18:00'],
};
function getEasterDate(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}
function getJoursFeriesLocaux(year: number): Record<string, string> {
  const easter = getEasterDate(year);
  const add = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const key = (d: Date) => format(d, 'yyyy-MM-dd');
  return {
    [key(new Date(year, 0, 1))]:   "Jour de l'An",
    [key(add(easter, 1))]:         "Lundi de Pâques",
    [key(new Date(year, 4, 1))]:   "Fête du Travail",
    [key(new Date(year, 4, 8))]:   "Victoire 1945",
    [key(add(easter, 39))]:        "Ascension",
    [key(add(easter, 50))]:        "Lundi de Pentecôte",
    [key(new Date(year, 6, 14))]:  "Fête Nationale",
    [key(new Date(year, 7, 15))]:  "Assomption",
    [key(new Date(year, 10, 1))]:  "Toussaint",
    [key(new Date(year, 10, 11))]: "Armistice",
    [key(new Date(year, 11, 25))]: "Noël",
  };
}

const getDefaultPlanningSlots = (days: Date[]): PlanningSlot[] => {
  const slots: PlanningSlot[] = [];
  days.forEach(jour => {
    const dow = jour.getDay();
    const dk = format(jour, 'yyyy-MM-dd');
    const ranges = PLANNING_SLOTS_MAP[dow];
    if (ranges) ranges.forEach(r => {
      const [d, f] = r.split('|');
      slots.push({ id: `${dk}-${d}`, dateKey: dk, debut: d, fin: f, membreIds: [], room: 'principale' });
    });
    const jvRanges = JV_SLOTS_MAP[dow];
    if (jvRanges) jvRanges.forEach(r => {
      const [d, f] = r.split('|');
      slots.push({ id: `${dk}-${d}-jv`, dateKey: dk, debut: d, fin: f, membreIds: [], room: 'jv' });
    });
  });
  return slots;
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

const getEventColor = (type: string): string => {
  if (type.includes('Formation')) return 'var(--turquoise)';
  if (type.includes('RTT')) return 'var(--vert)';
  if (type.includes('Congé') || type.includes('Récupération')) return 'var(--rose)';
  if (type === 'Réunion') return 'var(--bleu)';
  if (type === 'Animation') return 'var(--orange)';
  if (type === 'Soirée Jeux') return 'var(--purple)';
  if (type === 'Heures Exceptionnelles') return 'var(--yellow)';
  return 'var(--cream2)';
};

const getEventStyle = (type: string, _isOverlay = false) => getEventColor(type);
const getEventDotColor = (type: string) => getEventColor(type);

const getEventIcon = (type: string) => {
  if (type.includes('Formation')) return '🎓';
  if (type.includes('Congé')) return '🏖️';
  if (type.includes('RTT')) return '🌴';
  if (type.includes('Récupération')) return '🛋️';
  if (type === 'Réunion') return '💬';
  if (type === 'Animation') return '🎪';
  if (type === 'Soirée Jeux') return '🌙';
  if (type === 'Heures Exceptionnelles') return '⭐';
  return '📌';
};

const getPlanningHatches = (debut: string, fin: string, dateKey: string, memberIds: string[], slots: PlanningSlot[]) => {
  const bStart = timeToMins(debut);
  const bEnd = timeToMins(fin, true);
  const dur = bEnd - bStart;
  if (dur <= 0) return [];
  return slots
    .filter(s => s.dateKey === dateKey && s.membreIds.some(mid => memberIds.includes(mid)))
    .flatMap(s => {
      const oStart = Math.max(bStart, timeToMins(s.debut));
      const oEnd = Math.min(bEnd, timeToMins(s.fin, true));
      if (oStart >= oEnd) return [];
      return [{ topPct: (oStart - bStart) / dur * 100, heightPct: (oEnd - oStart) / dur * 100 }];
    });
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
    accent: '#baff29', equipeA: '#FD495B', equipeB: '#5BE0FB', swap: '#a855f7', zoneA: '#FF7A00', zoneB: '#1D6BFF', zoneC: '#8A2BE2'
  });

useEffect(() => {
    console.log("URL SUPABASE UTILISÉE :", process.env.NEXT_PUBLIC_SUPABASE_URL);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('agenda_couleurs');
    if (saved) try {
      const parsed = JSON.parse(saved);
      // Les anciennes couleurs de vacances étaient trop pastel : on les réinitialise une fois.
      if (!localStorage.getItem('agenda_zones_vives')) {
        delete parsed.zoneA; delete parsed.zoneB; delete parsed.zoneC;
        localStorage.setItem('agenda_zones_vives', '1');
      }
      setCouleurs(c => ({...c, ...parsed}));
    } catch(e) {}
  }, []);
  useEffect(() => { localStorage.setItem('agenda_couleurs', JSON.stringify(couleurs)); }, [couleurs]);

  const ZONES_DEF = [
    { zone: 'Zone A', lettre: 'A', key: 'zoneA' as const },
    { zone: 'Zone B', lettre: 'B', key: 'zoneB' as const },
    { zone: 'Zone C', lettre: 'C', key: 'zoneC' as const },
  ];

  const texteSurCouleur = (hex: string) => {
    const h = (hex || '').replace('#', '');
    if (h.length !== 6) return '#0d0d0d';
    const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return lum > 0.55 ? '#0d0d0d' : '#ffffff';
  };

  const VacancePastilles = ({ zones, size = 17, style }: { zones: string[]; size?: number; style?: React.CSSProperties }) => {
    const actives = ZONES_DEF.filter(z => zones.includes(z.zone));
    if (actives.length === 0) return null;
    return (
      <div style={{ display: "flex", gap: 3, alignItems: "center", pointerEvents: "none", ...style }}>
        {actives.map(z => (
          <span key={z.zone} title={`Vacances ${z.zone}`} className="bc" style={{
            width: size, height: size, borderRadius: "50%",
            background: couleurs[z.key], color: texteSurCouleur(couleurs[z.key]),
            border: "2px solid var(--ink)", boxShadow: "1.5px 1.5px 0 var(--ink)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: Math.round(size * 0.62), fontWeight: 900, lineHeight: 1, flexShrink: 0,
          }}>{z.lettre}</span>
        ))}
      </div>
    );
  };

  const getMemberColor = (m: { groupe?: string; couleur?: string }) =>
    m.couleur || (m.groupe === 'A' ? couleurs.equipeA : m.groupe === 'B' ? couleurs.equipeB : couleurs.accent);

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

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [viewPlanningSlots, setViewPlanningSlots] = useState<PlanningSlot[]>([]);
  const [showPlanningModal, setShowPlanningModal] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedSlotIds, setSelectedSlotIds] = useState<Set<string>>(new Set());
  const [rubberBand, setRubberBand] = useState<{x1:number;y1:number;x2:number;y2:number}|null>(null);
  const [showPasteCalendar, setShowPasteCalendar] = useState(false);
  const [pasteCalMonth, setPasteCalMonth] = useState(new Date());
  const [hoveredPasteWeek, setHoveredPasteWeek] = useState<string|null>(null);
  const [showPdfSelector, setShowPdfSelector] = useState(false);
  const [pdfSemaines, setPdfSemaines] = useState<Date[]>([]);
  const [pdfNavDate, setPdfNavDate] = useState(new Date());
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [planningDate, setPlanningDate] = useState(new Date());
  const [planningSlots, setPlanningSlots] = useState<PlanningSlot[]>([]);
  const [dragSelectionIds, setDragSelectionIds] = useState<string[]>([]);
  const [hoveringSlotId, setHoveringSlotId] = useState<string | null>(null);
  const [dragAbsentDays, setDragAbsentDays] = useState<Set<string>>(new Set());
  const [vacataires, setVacataires] = useState<Vacataire[]>([]);
  const [editingVacId, setEditingVacId] = useState<string | null>(null);
  const addVacataire = () => {
    const id = `vac-${Date.now()}`;
    const couleur = VAC_COLORS[vacataires.length % VAC_COLORS.length];
    setVacataires(prev => [...prev, { id, nom: 'Vacataire', couleur }]);
    setEditingVacId(id);
  };
  const removeVacataire = (id: string) => {
    setVacataires(prev => prev.filter(v => v.id !== id));
    setPlanningSlots(prev => prev.map(s => ({ ...s, membreIds: s.membreIds.filter(m => m !== id) })));
  };
  const planningGridRef = useRef<HTMLDivElement>(null);
  const resizingRef = useRef<{ slotId: string; edge: 'top' | 'bottom'; startY: number; origDebut: string; origFin: string } | null>(null);
  const lastLoadedPlanningRef = useRef<{ slots: PlanningSlot[]; vacataires: Vacataire[] } | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const multiDragRef = useRef<{ ids: string[] } | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const memberDataRef = useRef<Record<string, { initial: string; color: string }>>({});
  const selectionModeRef = useRef(false);
  const rbStartRef = useRef<{ x: number; y: number } | null>(null);
  const evenementsRef = useRef<Evenement[]>([]);
  const planningFeriesRef = useRef<Record<string, string>>({});
  const openPlanningModal = () => { setPlanningDate(dateActuelle); setShowPlanningModal(true); };

  const isAbsenceType = ABSENCE_TYPES.includes(nouvelEvent.type);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selectedDay) { setSelectedDay(null); return; }
      if (quickEditEv) { setQuickEditEv(null); return; }
      if (showEventModal) { setShowEventModal(false); return; }
      if (swapSession.active && swapSession.step === 2) { setSwapSession({ active: false, step: 1, selectedDates: [], m1Id: '', m2Id: '' }); return; }
      if (showEquipePanel) { setShowEquipePanel(false); return; }
      if (showEventsListPanel) { setShowEventsListPanel(false); return; }
      if (showPlanningModal) { setShowPlanningModal(false); return; }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [quickEditEv, showEventModal, swapSession, showEquipePanel, showEventsListPanel, showPlanningModal]);

  // Keep memberDataRef in sync so ghost element can read colors without stale closures
  useEffect(() => {
    const map: Record<string, { initial: string; color: string }> = {};
    activeEquipe.forEach(m => {
      const nom = m.nom.trim() || '?';
      map[m.id] = { initial: nom[0].toUpperCase(), color: getMemberColor({ groupe: m.groupe, couleur: m.horaires?.couleur }) };
    });
    vacataires.forEach(v => {
      const nom = v.nom.trim() || '?';
      map[v.id] = { initial: nom[0].toUpperCase(), color: v.couleur };
    });
    memberDataRef.current = map;
  }, [activeEquipe, vacataires]);

  useEffect(() => { selectionModeRef.current = selectionMode; }, [selectionMode]);
  useEffect(() => { evenementsRef.current = evenements; }, [evenements]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (selectionModeRef.current && rbStartRef.current) {
        setRubberBand({ x1: rbStartRef.current.x, y1: rbStartRef.current.y, x2: e.clientX, y2: e.clientY });
        return;
      }
      if (resizingRef.current && planningGridRef.current) {
        // Resize logic
        const { slotId, edge, startY, origDebut, origFin } = resizingRef.current;
        const rect = planningGridRef.current.getBoundingClientRect();
        const pxPerMin = rect.height / ((PLANNING_END - PLANNING_START) * 60);
        const deltaMins = Math.round((e.clientY - startY) / pxPerMin / 30) * 30;
        setPlanningSlots(prev => prev.map(s => {
          if (s.id !== slotId) return s;
          if (edge === 'top') {
            const nd = timeToMins(origDebut) + deltaMins;
            if (nd < PLANNING_START * 60 || nd >= timeToMins(origFin) - 30) return s;
            return { ...s, debut: minsToTimeStr(nd) };
          } else {
            const nf = timeToMins(origFin) + deltaMins;
            if (nf <= timeToMins(origDebut) + 30 || nf > PLANNING_END * 60) return s;
            return { ...s, fin: minsToTimeStr(nf) };
          }
        }));
        return;
      }

      if (!multiDragRef.current) return;

      // Move ghost
      if (ghostRef.current) {
        ghostRef.current.style.left = `${e.clientX + 14}px`;
        ghostRef.current.style.top = `${e.clientY + 14}px`;
      }

      // Detect hover over another member
      const elAt = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const memberEl = elAt?.closest('[data-member-id]') as HTMLElement | null;
      if (memberEl) {
        const mid = memberEl.dataset.memberId!;
        if (!multiDragRef.current.ids.includes(mid)) {
          multiDragRef.current.ids.push(mid);
          setDragSelectionIds([...multiDragRef.current.ids]);
          // Append new avatar to ghost
          const d = memberDataRef.current[mid];
          if (d && ghostRef.current) {
            const span = document.createElement('span');
            span.style.cssText = `font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:28px;line-height:1;color:${d.color};-webkit-text-stroke:1.5px #0d0d0d;filter:drop-shadow(1.5px 1.5px 0 #0d0d0d);display:inline-block`;
            span.textContent = d.initial;
            ghostRef.current.appendChild(span);
          }
        }
      }

      // Highlight hovered slot
      const slotEl = elAt?.closest('[data-slot-id]') as HTMLElement | null;
      setHoveringSlotId(slotEl?.dataset.slotId ?? null);
    };

    const onUp = (e: MouseEvent) => {
      if (selectionModeRef.current && rbStartRef.current) {
        const x1 = Math.min(rbStartRef.current.x, e.clientX);
        const x2 = Math.max(rbStartRef.current.x, e.clientX);
        const y1 = Math.min(rbStartRef.current.y, e.clientY);
        const y2 = Math.max(rbStartRef.current.y, e.clientY);
        const ids = new Set<string>();
        document.querySelectorAll('[data-slot-id]').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.right > x1 && r.left < x2 && r.bottom > y1 && r.top < y2) {
            const id = (el as HTMLElement).dataset.slotId;
            if (id) ids.add(id);
          }
        });
        setSelectedSlotIds(ids);
        rbStartRef.current = null;
        setRubberBand(null);
        return;
      }
      if (multiDragRef.current) {
        const elAt = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        const slotEl = elAt?.closest('[data-slot-id]') as HTMLElement | null;
        let blocked = false;
        if (slotEl) {
          const slotId = slotEl.dataset.slotId!;
          const slotDateKey = (slotEl as HTMLElement).dataset.dateKey ?? '';
          if (planningFeriesRef.current[slotDateKey]) {
            blocked = true;
          } else {
            const allIds = multiDragRef.current.ids;
            const ids = allIds.filter(mid => !evenementsRef.current.some(ev =>
              ABSENCE_TYPES.includes(ev.type) &&
              ev.date_debut <= slotDateKey && ev.date_fin >= slotDateKey &&
              (!ev.membres || ev.membres.length === 0 || ev.membres.includes(mid))
            ));
            if (ids.length > 0) {
              setPlanningSlots(prev => prev.map(s => s.id === slotId ? { ...s, membreIds: [...new Set([...s.membreIds, ...ids])] } : s));
            } else {
              blocked = true;
            }
          }
        }
        multiDragRef.current = null;
        setDragSelectionIds([]);
        setHoveringSlotId(null);
        setDragAbsentDays(new Set());
        if (blocked && ghostRef.current) {
          const g = ghostRef.current;
          ghostRef.current = null;
          g.style.animation = 'shake 0.35s ease';
          setTimeout(() => { try { document.body.removeChild(g); } catch (_) {} }, 380);
        } else if (ghostRef.current) {
          document.body.removeChild(ghostRef.current);
          ghostRef.current = null;
        }
      }
      resizingRef.current = null;
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);


  useEffect(() => {
    const key = format(startOfWeek(dateActuelle, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    fetch(`/api/planning-semaine?key=${key}`).then(r => r.json() as Promise<{ slots?: PlanningSlot[] }>)
      .then(data => setViewPlanningSlots((data?.slots ?? []) as PlanningSlot[]));
  }, [dateActuelle]);

  const planningWeekKey = (d: Date) => format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');

  useEffect(() => {
    const days = eachDayOfInterval({ start: startOfWeek(planningDate, { weekStartsOn: 1 }), end: endOfWeek(planningDate, { weekStartsOn: 1 }) });
    const key = planningWeekKey(planningDate);
    (async () => {
      const data = await fetch(`/api/planning-semaine?key=${key}`).then(r => r.json() as Promise<any>).catch(() => null);
      let slots: PlanningSlot[];
      let vacs: Vacataire[];
      if (data?.slots?.length) {
        slots = data.slots as PlanningSlot[];
        vacs = (data.vacataires ?? []) as Vacataire[];
      } else {
        slots = getDefaultPlanningSlots(days);
        vacs = [];
      }
      lastLoadedPlanningRef.current = { slots, vacataires: vacs };
      setPlanningSlots(slots);
      setVacataires(vacs);
    })();
  }, [planningDate]);

  useEffect(() => {
    const last = lastLoadedPlanningRef.current;
    // Ne pas sauvegarder avant que le chargement initial soit terminé
    if (!last) return;
    if (last.slots === planningSlots && last.vacataires === vacataires) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      const key = planningWeekKey(planningDate);
      fetch('/api/planning-semaine', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ semaine_key: key, slots: planningSlots, vacataires, updated_at: new Date().toISOString() }) });
      lastLoadedPlanningRef.current = { slots: planningSlots, vacataires };
    }, 800);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [planningSlots, vacataires]);

  const [savingPlanning, setSavingPlanning] = useState(false);
  const savePlanningWeek = async () => {
    setSavingPlanning(true);
    const key = planningWeekKey(planningDate);
    await fetch('/api/planning-semaine', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ semaine_key: key, slots: planningSlots, vacataires, updated_at: new Date().toISOString() }) });
    lastLoadedPlanningRef.current = { slots: planningSlots, vacataires };
    setSavingPlanning(false);
  };

  const buildPlanningHTML = (semainesData: Array<{ semaine: Date; slots: PlanningSlot[]; vacataires: Vacataire[] }>): string => {
    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const getMemName = (mid: string, vacs: Vacataire[]) => {
      const m = activeEquipe.find(e => e.id === mid);
      if (m) return m.nom.split(' ')[0];
      const v = vacs.find(v => v.id === mid);
      if (v) return v.nom;
      return '?';
    };

    const sectionsHTML = semainesData.map(({ semaine, slots, vacataires: vacs }) => {
      const wStart = startOfWeek(semaine, { weekStartsOn: 1 });
      const wEnd   = endOfWeek(semaine, { weekStartsOn: 1 });
      const days   = eachDayOfInterval({ start: wStart, end: wEnd }).filter(d => d.getDay() !== 0);
      const weekLabel = `Semaine S${getISOWeek(semaine)} · ${format(wStart, 'd', { locale: fr })} au ${format(wEnd, 'd MMMM yyyy', { locale: fr })}`;

      const daysHTML = days.map(day => {
        const dk = format(day, 'yyyy-MM-dd');
        const daySlots = slots.filter(s => s.dateKey === dk && s.membreIds.length > 0);
        if (daySlots.length === 0) return '';

        const timeMap = new Map<string, { principale: string[]; jv: string[] }>();
        daySlots.forEach(s => {
          const k = `${s.debut}|${s.fin}`;
          if (!timeMap.has(k)) timeMap.set(k, { principale: [], jv: [] });
          const entry = timeMap.get(k)!;
          const names = s.membreIds.map(mid => getMemName(mid, vacs));
          if (s.room === 'jv') entry.jv.push(...names); else entry.principale.push(...names);
        });

        const sortedTimes = Array.from(timeMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        const dayLabel = capitalize(format(day, 'EEEE d MMMM', { locale: fr }));

        const rowsHTML = sortedTimes.map(([timeKey, { principale, jv }]) => {
          const [debut, fin] = timeKey.split('|');
          const total = principale.length + jv.length;
          return `<tr>
            <td class="col-n">${total}</td>
            <td class="col-h">${debut} – ${fin}</td>
            <td class="col-salle">${principale.join(', ') || '–'}</td>
            <td class="col-jv">${jv.join(', ') || ''}</td>
          </tr>`;
        }).join('');

        return `<div class="day-block">
          <div class="day-header">${dayLabel}</div>
          <table class="day-table">
            <thead><tr>
              <th class="col-n">N</th>
              <th class="col-h">Horaires</th>
              <th class="col-salle">Salle principale</th>
              <th class="col-jv">Jeux vidéo</th>
            </tr></thead>
            <tbody>${rowsHTML}</tbody>
          </table>
        </div>`;
      }).join('');

      return `<div class="week-section">
        <h1 class="week-title">${weekLabel}</h1>
        ${daysHTML}
      </div>`;
    }).join('');

    return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Planning Ludothèque</title>
<style>
@page{size:A4 portrait;margin:12mm 10mm}
*{box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#111;margin:0;padding:0}
.week-section{margin-bottom:8mm}
.week-title{font-size:14pt;font-weight:900;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4mm;padding-bottom:2mm;border-bottom:2.5px solid #111}
.day-block{margin-bottom:4mm;border:1.5px solid #111;border-radius:2px;overflow:hidden}
.day-header{background:#222;color:#fff;padding:5px 10px;font-weight:700;font-size:10pt;text-transform:uppercase;letter-spacing:.04em}
.day-table{width:100%;border-collapse:collapse}
.day-table thead tr{background:#f0f0f0}
.day-table th{padding:3px 8px;font-size:7.5pt;font-weight:700;border-bottom:1.5px solid #bbb;text-align:left;color:#444}
.day-table tbody tr:nth-child(even) td{background:#f8f8f8}
.day-table td{border-bottom:1px solid #e4e4e4;padding:4px 8px;vertical-align:middle;line-height:1.4}
.col-n{width:24px;text-align:center;font-weight:700;color:#777;font-size:8pt}
.col-h{width:110px;font-size:8.5pt;font-weight:600;color:#444;white-space:nowrap}
.col-salle{font-weight:700;font-size:9pt}
.col-jv{font-weight:600;font-size:9pt;color:#555;border-left:1.5px solid #ddd;width:110px}
@media print{
  .week-section{page-break-after:always}
  .week-section:last-child{page-break-after:auto}
  .day-header,.day-table thead tr{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style></head><body>${sectionsHTML}</body></html>`;
  };

  const genererPDF = async () => {
    if (pdfSemaines.length === 0) return;
    setIsGeneratingPdf(true);
    const currentKey = planningWeekKey(planningDate);
    if (pdfSemaines.some(s => planningWeekKey(s) === currentKey)) {
      await fetch('/api/planning-semaine', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ semaine_key: currentKey, slots: planningSlots, vacataires, updated_at: new Date().toISOString() }) });
    }
    const semainesData: Array<{ semaine: Date; slots: PlanningSlot[]; vacataires: Vacataire[] }> = [];
    for (const sem of pdfSemaines) {
      const key = planningWeekKey(sem);
      const data = await fetch(`/api/planning-semaine?key=${key}`).then(r => r.json() as Promise<any>).catch(() => null);
      semainesData.push({ semaine: sem, slots: (data?.slots ?? []) as PlanningSlot[], vacataires: (data?.vacataires ?? []) as Vacataire[] });
    }
    const html = buildPlanningHTML(semainesData);
    const w = window.open('', '_blank', 'width=1100,height=750');
    if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 700); }
    setIsGeneratingPdf(false);
  };
  const mainTypeUI = isAbsenceType ? 'Absence' : (['Réunion', 'Animation', 'Soirée Jeux', 'Heures Exceptionnelles'].includes(nouvelEvent.type) ? nouvelEvent.type : 'Autre');
  const absTypeUI = nouvelEvent.type.includes('RTT') ? 'RTT' : nouvelEvent.type.includes('Récupération') ? 'Récupération' : nouvelEvent.type.includes('Formation') ? 'Formation' : 'Congé';
  const isDemiUI = nouvelEvent.type.startsWith('Demi-');

  const isTimeDisabled = mainTypeUI === 'Absence' && !isDemiUI && ['Congé', 'RTT', 'Formation'].includes(absTypeUI);

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
    const data = await fetch('/api/equipe').then(r => r.json() as Promise<any>).then(d => Array.isArray(d) ? d : []).catch(() => []);
    setEquipe(data);
  };

  const chargerEvenements = async () => {
    const data = await fetch('/api/evenements').then(r => r.json() as Promise<any>).then(d => Array.isArray(d) ? d : []).catch(() => []);
    setEvenements(data);
  };

  useEffect(() => {
    chargerEquipe(); 
    chargerEvenements();
    
    fetch(`https://calendrier.api.gouv.fr/jours-feries/metropole/${dateActuelle.getFullYear()}.json`)
      .then(res => res.json())
      .then(data => setJoursFeries(data as Record<string, string>))
      .catch(console.error);
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
          await fetch('/api/equipe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rest) });
        } else {
          await fetch(`/api/equipe/${m.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nom: m.nom, role: m.role, groupe: m.groupe, heures_hebdo_base: m.heures_hebdo_base, solde_conges: m.solde_conges, solde_rtt: m.solde_rtt, solde_recup: m.solde_recup, horaires: m.horaires }) });
        }
      }
      for (const ev of draftEvenements) {
        if (ev.id && ev.id.startsWith('draft-')) {
          const { id, ...rest } = ev;
          await fetch('/api/evenements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rest) });
        } else if (ev.id) {
          await fetch(`/api/evenements/${ev.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ titre: ev.titre, type: ev.type, date_debut: ev.date_debut, date_fin: ev.date_fin, heure_debut: ev.heure_debut, heure_fin: ev.heure_fin, membres: ev.membres, parent_id: ev.parent_id }) });
        }
      }
      for (const delId of draftDeletedEvents) await fetch(`/api/evenements/${delId}`, { method: 'DELETE' });
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
      if (membreActif.id === 'nouveau') {
        await fetch('/api/equipe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      } else {
        await fetch(`/api/equipe/${membreActif.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }
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
    const res = await fetch(`/api/equipe/${membreActif.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).then(r => r.json() as Promise<any>).catch(() => ({ error: 'réseau' }));
    if (res.error) { alert('Erreur sauvegarde soldes : ' + res.error); return; }
    chargerEquipe();
  };

  const sauvegarderQuickEdit = async () => {
    if (!quickEditEv?.id) return;
    await fetch(`/api/evenements/${quickEditEv.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: quickEditEv.type, titre: quickEditEv.titre, date_debut: quickEditEv.date_debut, date_fin: quickEditEv.date_fin }),
    });
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
        const idsToDelete = evenements.filter(e => e.parent_id === nouvelEvent.parent_id && e.id !== (nouvelEvent.id || '')).map(e => e.id!);
        await Promise.all(idsToDelete.map(id => fetch(`/api/evenements/${id}`, { method: 'DELETE' })));
      }

      const toUpdate = occurrences.filter(o => o.id);
      const toInsert = occurrences.filter(o => !o.id);

      for (const upd of toUpdate) {
        const res = await fetch(`/api/evenements/${upd.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(upd),
        }).then(r => r.json() as Promise<any>).catch(() => ({ error: 'réseau' }));
        if (res.error) { console.error("Erreur mise à jour événement:", res.error); alert("Erreur lors de la mise à jour : " + res.error); return; }
      }
      for (const occ of toInsert) {
        const { id, ...rest } = occ as Record<string, unknown>;
        const payload = (rest.parent_id === undefined || rest.parent_id === null) ? (() => { const { parent_id, ...r } = rest; return r; })() : rest;
        const res = await fetch('/api/evenements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).then(r => r.json() as Promise<any>).catch(() => ({ error: 'réseau' }));
        if (res.error) { console.error("Erreur insertion événement:", res.error); alert("Erreur lors de la création : " + res.error); return; }
      }

      if (hasEquipeChanges) {
        await Promise.all(
          newEquipeState.filter(m => membresToUpdate.includes(m.id)).map(m =>
            fetch(`/api/equipe/${m.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ horaires: m.horaires }) })
          )
        );
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
        const idsToDelete = evenements.filter(e => e.parent_id === parentId).map(e => e.id!);
        await Promise.all(idsToDelete.map(id => fetch(`/api/evenements/${id}`, { method: 'DELETE' })));
      } else {
        await fetch(`/api/evenements/${id}`, { method: 'DELETE' });
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
        fetch(`/api/equipe/${eq1.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ horaires: eq1.horaires }) }),
        fetch(`/api/equipe/${eq2.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ horaires: eq2.horaires }) }),
      ]);

      const evsToUpdate = newEvenements.filter(ev => ev.id && JSON.stringify(ev.membres) !== JSON.stringify(evenements.find(e => e.id === ev.id)?.membres));
      await Promise.all(evsToUpdate.map(ev => fetch(`/api/evenements/${ev.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ membres: ev.membres }) })));

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

  const planningDays = useMemo(() =>
    eachDayOfInterval({ start: startOfWeek(planningDate, { weekStartsOn: 1 }), end: endOfWeek(planningDate, { weekStartsOn: 1 }) }).slice(1, 6),
  [planningDate]);

  const planningJoursFeries = useMemo(() => {
    const years = [...new Set(planningDays.map(d => d.getFullYear()))];
    const merged = Object.assign({}, ...years.map(y => getJoursFeriesLocaux(y)));
    planningFeriesRef.current = merged;
    return merged;
  }, [planningDays]);
  
  const [alertes, setAlertes] = useState<{amplitude: string[], heuresSupp: string[]}>({amplitude: [], heuresSupp: []});
  const [currentTimePct, setCurrentTimePct] = useState(() => {
    const now = new Date();
    return Math.max(0, Math.min(100, (((now.getHours() - HEURE_DEBUT) * 60 + now.getMinutes()) / ((HEURE_FIN - HEURE_DEBUT) * 60)) * 100));
  });
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setCurrentTimePct(Math.max(0, Math.min(100, (((now.getHours() - HEURE_DEBUT) * 60 + now.getMinutes()) / ((HEURE_FIN - HEURE_DEBUT) * 60)) * 100)));
    };
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, []);
  
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
            <div>
              <div className="bc" style={{ fontSize: 80, lineHeight: 0.9, textTransform: "uppercase", letterSpacing: "-1px", background: "linear-gradient(135deg, #0d0d0d 40%, var(--purple))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Agenda</div>
              <div className="bc" style={{ fontSize: 16, color: "rgba(0,0,0,0.35)", marginTop: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {vue === "Mois"
                  ? `${format(dateActuelle, 'MMMM yyyy', { locale: fr })} · Vue Stickers`
                  : `Semaine ${getISOWeek(dateActuelle)} · ${format(startOfWeek(dateActuelle, { weekStartsOn: 1 }), 'd', { locale: fr })}–${format(endOfWeek(dateActuelle, { weekStartsOn: 1 }), 'd MMM yyyy', { locale: fr })}`
                }
              </div>
            </div>
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
              <div className="pop-card" style={{ display: "flex", padding: 4, gap: 0 }}>
                <button onClick={() => setVue("Mois")} className="pop-btn" style={{ fontSize: 13, padding: "6px 16px", background: vue === "Mois" ? "var(--yellow)" : "transparent", boxShadow: vue === "Mois" ? "2px 2px 0 var(--ink)" : "none", border: vue === "Mois" ? "2px solid var(--ink)" : "2px solid transparent" }}>Mois</button>
                <button onClick={() => setVue("Semaine")} className="pop-btn" style={{ fontSize: 13, padding: "6px 16px", background: vue === "Semaine" ? "var(--yellow)" : "transparent", boxShadow: vue === "Semaine" ? "2px 2px 0 var(--ink)" : "none", border: vue === "Semaine" ? "2px solid var(--ink)" : "2px solid transparent" }}>Semaine</button>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            {!isDraftMode && (
              <button onClick={toggleDraftMode} className="pop-btn pop-btn-outline" style={{ fontSize: 13, background: "#fff7ed", borderColor: "#fb923c", color: "#ea580c" }}>
                🛠️ Prévision
              </button>
            )}
            <button onClick={() => setShowEventsListPanel(true)} className="pop-btn pop-btn-outline" style={{ fontSize: 13 }}>Événements</button>
            <button onClick={() => { setOngletMembre("profil"); setShowEquipePanel(true); }} className="pop-btn pop-btn-outline" style={{ fontSize: 13 }}>Équipe</button>
            <button onClick={() => setShowSettings(!showSettings)} className="pop-btn pop-btn-outline" style={{ fontSize: 13, padding: "6px 10px" }}>Réglages</button>
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
          <div style={{ display: "grid", borderBottom: "2px solid var(--ink)", background: "var(--ink)", borderRadius: "10px 10px 0 0", gridTemplateColumns: vue === "Semaine" ? "60px 1fr 1fr 1fr 1fr 1fr 1fr 1fr" : "repeat(7, 1fr)" }}>
            {vue === "Semaine" && <div style={{ padding: "10px 0" }}></div>}
            {vue === "Semaine"
              ? joursAffiches.map((jour) => {
                  const today = isToday(jour);
                  return (
                    <div key={format(jour, 'yyyy-MM-dd')} style={{ padding: "8px 0", textAlign: "center", background: today ? couleurs.accent : "transparent", borderBottom: today ? "2px solid var(--ink)" : "none", marginBottom: today ? -2 : 0, borderRadius: today ? "0" : "0" }}>
                      <div className="bc" style={{ fontSize: 10, letterSpacing: "0.08em", color: today ? "var(--ink)" : "rgba(255,255,255,0.6)", textTransform: "uppercase" }}>{format(jour, 'EEE', { locale: fr })}</div>
                      <div className="bc" style={{ fontSize: 22, lineHeight: 1, fontWeight: 900, color: today ? "var(--ink)" : "var(--white)", marginTop: 1 }}>{format(jour, 'd')}</div>
                    </div>
                  );
                })
              : ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(jour => (
                  <div key={jour} className="bc" style={{ padding: "10px 0", textAlign: "center", color: "rgba(255,255,255,0.6)", fontSize: 11, letterSpacing: "0.08em" }}>{jour}</div>
                ))
            }
          </div>

          {/* Rainbow colour stripe — echo of the navbar arc-en-ciel */}
          <div style={{ height: 6, background: "linear-gradient(90deg,#a8e063 0%,#a8e063 16.6%,#f472b6 16.6%,#f472b6 33.2%,#60a5fa 33.2%,#60a5fa 49.8%,#f87171 49.8%,#f87171 66.4%,#fb923c 66.4%,#fb923c 83%,#c084fc 83%,#c084fc 100%)", flexShrink: 0 }}></div>

          {vue === "Mois" ? (
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gridAutoRows: "1fr" }}>
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

                      segments.forEach(seg => presencesDuJour.push({ nom: m.nom, groupe: m.groupe, debut: seg.debut, fin: seg.fin, id: m.id, couleur: m.horaires?.couleur }));
                    }
                  });
                }

                const blocsHoraires = genererBlocsMensuels(presencesDuJour);
                const specialEvsDuJour = evenementsDuJour.filter(e => ['Soirée Jeux', 'Heures Exceptionnelles'].includes(e.type));
                const blocsToShowMois = blocsHoraires.filter((bloc: any) =>
                  !specialEvsDuJour.some(ev => {
                    const coversMembers = !ev.membres.length || bloc.membresInfos.every((m: any) => ev.membres.includes(m.id));
                    if (!ev.heure_debut || !ev.heure_fin) return coversMembers;
                    const evS = timeToMins(ev.heure_debut); const evE = timeToMins(ev.heure_fin, true);
                    const bS = timeToMins(bloc.debut);      const bE = timeToMins(bloc.fin, true);
                    return coversMembers && evS <= bS && evE >= bE;
                  })
                );

                return (
                  <div key={i}
                    className={!isSelectedForSwap && isToday(jour) ? 'today-hatch' : ''}
                    onClick={() => {
                      if (swapSession.active && swapSession.step === 1) toggleSwapDate(dateKey);
                      else setSelectedDay(dateKey);
                    }}
                    onMouseEnter={e => {
                      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                      const rect = e.currentTarget.getBoundingClientRect();
                      hoverTimerRef.current = setTimeout(() => {
                        setHoveredDay(dateKey);
                        setHoverPos({ x: rect.right, y: rect.top });
                      }, 350);
                    }}
                    onMouseLeave={() => {
                      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                      setHoveredDay(null);
                    }}
                    style={{
                      borderRight: "1.5px solid rgba(0,0,0,0.09)",
                      borderBottom: "1.5px solid rgba(0,0,0,0.09)",
                      background: isSelectedForSwap ? "rgba(96,165,250,0.12)" : isToday(jour) ? undefined : isSameMonth(jour, dateActuelle) ? "var(--white)" : "rgba(0,0,0,0.025)",
                      outline: isSelectedForSwap ? "3px solid var(--bleu)" : "none",
                      outlineOffset: -3,
                      position: "relative",
                      display: "flex",
                      flexDirection: "column",
                      minHeight: 120,
                      cursor: "pointer",
                    }}>

                    {/* Vacation band */}
                    {zonesVacances.length > 0 && (
                      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 6, display: "flex", zIndex: 20, pointerEvents: "none", borderBottom: "1.5px solid var(--ink)" }}>
                        {zonesVacances.includes("Zone A") && <div style={{ flex: 1, backgroundColor: couleurs.zoneA }}></div>}
                        {zonesVacances.includes("Zone B") && <div style={{ flex: 1, backgroundColor: couleurs.zoneB }}></div>}
                        {zonesVacances.includes("Zone C") && <div style={{ flex: 1, backgroundColor: couleurs.zoneC }}></div>}
                      </div>
                    )}

                    {/* Header row: event dots + vacation pastilles + day number */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "9px 7px 4px", zIndex: 20, pointerEvents: "none" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 3, flex: 1, marginRight: 4, marginTop: 2 }}>
                        {!nomFerie && evenementsDuJour.filter(e => !['Soirée Jeux', 'Heures Exceptionnelles'].includes(e.type)).map((ev, idx) => (
                          <div key={`dot-${idx}`} style={{ width: 9, height: 9, borderRadius: "50%", backgroundColor: getEventColor(ev.type), border: "1.5px solid var(--ink)", flexShrink: 0 }}></div>
                        ))}
                      </div>
                      <VacancePastilles zones={zonesVacances} size={17} style={{ flexShrink: 0, marginRight: 4, marginTop: 1 }} />
                      {isToday(jour) ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                          <span className="bc" style={{ fontSize: 20, lineHeight: 1, letterSpacing: "-0.5px" }}>
                            {format(jour, 'd')}
                          </span>
                          <span style={{ background: "var(--ink)", color: "var(--yellow)", borderRadius: 4, padding: "1px 5px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>
                            AUJ.
                          </span>
                        </div>
                      ) : (
                        <span style={{
                          fontWeight: 900, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center",
                          width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                          background: "transparent",
                          color: nomFerie ? "var(--rouge)" : "var(--ink)",
                        }}>
                          {format(jour, 'd')}
                        </span>
                      )}
                    </div>

                    {/* Event blocks — overflow:visible so rotated stickers aren't clipped by the header */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "0 5px 5px", gap: 4, zIndex: 10 }}>
                      {nomFerie && (
                        <div className="bc" style={{ background: "var(--yellow)", border: "2px solid var(--ink)", borderRadius: 6, padding: "4px 7px", fontWeight: 900, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", boxShadow: "2px 2px 0 var(--ink)", transform: "rotate(-2deg)", transformOrigin: "center", alignSelf: "stretch", lineHeight: 1.2 }}>
                          {nomFerie}
                        </div>
                      )}
                      {blocsToShowMois.map((bloc: any, idx: number) => {
                        const bgColor = getBlocColor(bloc.membresInfos, activeEquipe);
                        const absInBloc = evenementsDuJour.filter(e => ABSENCE_TYPES.includes(e.type) && e.membres.some(mId => bloc.membresInfos.find((m:any) => m.id === mId)));
                        const isSingleBloc = blocsToShowMois.length === 1;
                        return (
                          <div key={idx} style={{ background: bgColor, border: "2px solid var(--ink)", borderRadius: 6, padding: isSingleBloc ? "5px 8px" : "3px 6px", display: "flex", flexDirection: "column", gap: isSingleBloc ? 2 : 1, boxShadow: "2px 2px 0 var(--ink)", transform: idx % 2 === 0 ? "rotate(-1.5deg)" : "rotate(1deg)", transformOrigin: "center" }}>
                            <div style={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "flex-end" }}>
                              {bloc.membresInfos.map((m: any, mIdx: number) => {
                                const tilt = (((m.nom.charCodeAt(0) + mIdx * 7) % 9) - 4) * 0.8;
                                return (
                                  <span key={mIdx} className="bc" style={{ fontSize: isSingleBloc ? 14 : 12, lineHeight: 1, display: "inline-block", flexShrink: 0, color: getMemberColor(m), WebkitTextStroke: "1px var(--ink)", filter: "drop-shadow(1px 1px 0 #0d0d0d)", transform: `rotate(${tilt}deg)` }}>
                                    {m.nom.trim()[0].toUpperCase()}
                                  </span>
                                );
                              })}
                            </div>
                            {absInBloc.map((abs, aIdx) => (
                              <span key={aIdx} style={{ fontSize: 8, fontWeight: 800, background: "var(--rose)", color: "var(--ink)", border: "1px solid var(--ink)", borderRadius: 3, padding: "0 3px" }}>{abs.type.replace('Demi-', '½ ')}</span>
                            ))}
                            <span style={{ fontSize: isSingleBloc ? 10 : 9, fontWeight: 600, opacity: 0.65 }}>{bloc.debut}–{bloc.fin}</span>
                          </div>
                        );
                      })}
                      {evenementsDuJour.filter(e => ['Soirée Jeux', 'Heures Exceptionnelles'].includes(e.type)).map((ev, idx) => {
                        const membresEv = ev.membres.length > 0 ? activeEquipe.filter(m => ev.membres.includes(m.id)) : [];
                        return (
                          <div key={`ev-m-${idx}`}
                            onClick={(e) => { e.stopPropagation(); ouvrirEditionEvenement(ev, 'single'); }}
                            style={{ background: getEventColor(ev.type), border: "2px solid var(--ink)", borderRadius: 6, padding: "3px 6px", display: "flex", flexDirection: "column", gap: 1, cursor: "pointer", pointerEvents: "auto", boxShadow: "2px 2px 0 var(--ink)", transform: idx % 2 === 0 ? "rotate(1.5deg)" : "rotate(-1deg)", transformOrigin: "center" }}>
                            {membresEv.length > 0 && (
                              <div style={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 1 }}>
                                {membresEv.map((m, mIdx) => {
                                  const tilt = (((m.nom.charCodeAt(0) + mIdx * 7) % 9) - 4) * 0.8;
                                  return (
                                    <span key={m.id} className="bc" style={{ fontSize: 12, lineHeight: 1, display: "inline-block", flexShrink: 0, color: getMemberColor({ groupe: m.groupe, couleur: m.horaires?.couleur }), WebkitTextStroke: "1px var(--ink)", filter: "drop-shadow(1px 1px 0 #0d0d0d)", transform: `rotate(${tilt}deg)` }}>
                                      {m.nom.trim()[0].toUpperCase()}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                            <span style={{ fontWeight: 800, fontSize: 10, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getEventIcon(ev.type)} {ev.titre}</span>
                            {ev.heure_debut && <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.65 }}>{ev.heure_debut}–{ev.heure_fin}</span>}
                          </div>
                        );
                      })}
                    </div>
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
              {joursAffiches.some(j => isToday(j)) && (
                <div style={{ position: "absolute", left: 60, right: 0, top: `${currentTimePct}%`, zIndex: 90, pointerEvents: "none", display: "flex", alignItems: "center" }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--rouge)", border: "2px solid white", flexShrink: 0, marginLeft: -5 }}></div>
                  <div style={{ flex: 1, height: 2, background: "var(--rouge)", opacity: 0.75 }}></div>
                </div>
              )}
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
                        segments.forEach(seg => presencesDuJour.push({ nom: m.nom, groupe: m.groupe, debut: seg.debut, fin: seg.fin, id: m.id, couleur: m.horaires?.couleur }));
                      }
                    });
                  }

                  const blocsHoraires = genererBlocsHoraires(presencesDuJour);
                  const blocsToShow = blocsHoraires.filter((bloc: any) =>
                    !eventsGrille.some(ev => {
                      const coversMembers = !ev.membres.length || bloc.membresInfos.every((m: any) => ev.membres.includes(m.id));
                      const evS = timeToMins(ev.heure_debut!); const evE = timeToMins(ev.heure_fin!, true);
                      const bS = timeToMins(bloc.debut);       const bE = timeToMins(bloc.fin, true);
                      return coversMembers && evS <= bS && evE >= bE;
                    })
                  );

                  return (
                    <div key={i}
                         className={!isSelectedForSwap && isToday(jour) ? 'today-hatch' : ''}
                         onClick={() => { if (swapSession.active && swapSession.step === 1) toggleSwapDate(dateKey); }}
                         style={{ position: "relative", background: isSelectedForSwap ? "rgba(96,165,250,0.06)" : isToday(jour) ? undefined : "transparent", zIndex: 10, cursor: swapSession.active ? "pointer" : "default", outline: isSelectedForSwap ? "3px solid var(--bleu)" : "none", outlineOffset: -3 }}>

                      {/* Vacation band */}
                      {zonesVacances.length > 0 && (
                        <>
                          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 6, display: "flex", zIndex: 20, pointerEvents: "none", borderBottom: "1.5px solid var(--ink)" }}>
                            {zonesVacances.includes("Zone A") && <div style={{ flex: 1, backgroundColor: couleurs.zoneA }}></div>}
                            {zonesVacances.includes("Zone B") && <div style={{ flex: 1, backgroundColor: couleurs.zoneB }}></div>}
                            {zonesVacances.includes("Zone C") && <div style={{ flex: 1, backgroundColor: couleurs.zoneC }}></div>}
                          </div>
                          <VacancePastilles zones={zonesVacances} size={16} style={{ position: "absolute", top: 10, right: 6, zIndex: 30 }} />
                        </>
                      )}

                      {/* Ferie block — full column */}
                      {nomFerie && (
                        <div style={{ position: "absolute", top: 6, left: 4, right: 4, bottom: 6, zIndex: 25, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <div className="bc" style={{ width: "100%", height: "100%", background: "var(--yellow)", border: "2px solid var(--ink)", borderRadius: 8, boxShadow: "2px 2px 0 var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(-2deg)", padding: 8 }}>
                            <span style={{ fontWeight: 900, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.07em", textAlign: "center", lineHeight: 1.3 }}>{nomFerie}</span>
                          </div>
                        </div>
                      )}

                      {blocsToShow.map((bloc: any, idx: number) => {
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
                          <div key={idx} style={{ position: "absolute", left: 6, right: 6, top: `${top}%`, height: `${height}%`, zIndex: 10 + idx }}>
                            <div style={{
                              position: "absolute", inset: 0,
                              backgroundColor: bgColor,
                              border: "2px solid var(--ink)",
                              borderRadius: 8,
                              boxShadow: "2px 2px 0 var(--ink)",
                              padding: "6px 8px",
                              display: "flex", flexDirection: "column",
                              overflow: "hidden",
                              opacity: isDayFullTeam ? 1 : 0.82,
                              transform: idx % 2 === 0 ? "rotate(-0.8deg)" : "rotate(0.6deg)",
                              transformOrigin: "center",
                            }}>
                              {/* Member letters */}
                              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 4, alignItems: "flex-end" }}>
                                {bloc.membresInfos.map((m: any, mIdx: number) => {
                                  const tilt = (((m.nom.charCodeAt(0) + mIdx * 7) % 9) - 4) * 0.8;
                                  return (
                                    <span key={mIdx} className="bc" style={{ fontSize: 20, lineHeight: 1, display: "inline-block", flexShrink: 0, color: getMemberColor(m), WebkitTextStroke: "1.5px var(--ink)", filter: "drop-shadow(1.5px 1.5px 0 #0d0d0d)", transform: `rotate(${tilt}deg)` }}>
                                      {m.nom.trim()[0].toUpperCase()}
                                    </span>
                                  );
                                })}
                              </div>
                              {absencesDuBloc.map((abs, aIdx) => (
                                <span key={aIdx} style={{ marginTop: 2, fontSize: 9, fontWeight: 800, background: "var(--rose)", border: "1px solid var(--ink)", borderRadius: 3, padding: "1px 4px", width: "fit-content" }}>{abs.type.replace('Demi-', '½ ')} : {getNomsMembresEvent(abs.membres)}</span>
                              ))}
                              <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.6, marginTop: "auto", paddingTop: 2 }}>{bloc.debut}–{bloc.fin}</span>
                            </div>
                          </div>
                        );
                      })}

                      {/* Planning blocks overlay */}
                      {(() => {
                        const dayPlanSlots = viewPlanningSlots.filter(s => s.dateKey === dateKey && s.membreIds.length > 0);
                        const byTime = new Map<string, { main: PlanningSlot | null; jv: PlanningSlot | null }>();
                        dayPlanSlots.forEach(s => {
                          const k = `${s.debut}|${s.fin}`;
                          if (!byTime.has(k)) byTime.set(k, { main: null, jv: null });
                          const e = byTime.get(k)!;
                          if (s.room === 'jv') e.jv = s; else e.main = s;
                        });
                        const getMembers = (slot: PlanningSlot | null) => slot ? slot.membreIds.flatMap(mid => {
                          const eq = activeEquipe.find(m => m.id === mid);
                          const vac = vacataires.find(v => v.id === mid);
                          if (!eq && !vac) return [];
                          const nom = (eq?.nom ?? vac?.nom ?? '?').trim() || '?';
                          const col = vac ? vac.couleur : getMemberColor({ groupe: eq?.groupe, couleur: eq?.horaires?.couleur });
                          return [{ nom, col }];
                        }) : [];
                        return Array.from(byTime.entries()).map(([k, { main, jv }]) => {
                          const ref = main ?? jv!;
                          const top = calculerPositionTop(ref.debut);
                          const height = Math.max(calculerPositionTop(ref.fin, true) - top, 1);
                          const mainMembers = getMembers(main);
                          const jvMembers = getMembers(jv);
                          return (
                            <div key={`pl-${k}`} style={{ position: "absolute", left: 9, right: 9, top: `${top}%`, height: `${height}%`, zIndex: 30, pointerEvents: "none", overflow: "visible", background: "repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(248,113,113,0.13) 5px, rgba(248,113,113,0.13) 8px)", borderTop: "3px solid var(--rouge)", borderBottom: "3px solid var(--rouge)", display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 6, padding: "4px 8px" }}>
                              {mainMembers.map((m, mi) => {
                                const seed = m.nom.charCodeAt(0) + mi * 37;
                                const tilt = ((seed % 26) - 13) * 1.4;
                                const dy = ((seed * 11) % 12) - 6;
                                return (
                                  <span key={mi} className="bc" style={{ fontSize: 22, lineHeight: 1, color: m.col, WebkitTextStroke: "1.5px var(--ink)", filter: "drop-shadow(1.5px 1.5px 0 #0d0d0d)", transform: `rotate(${tilt}deg) translateY(${dy}px)`, flexShrink: 0, display: "inline-block" }}>
                                    {m.nom[0].toUpperCase()}
                                  </span>
                                );
                              })}
                              {jvMembers.length > 0 && (
                                <div style={{ position: "absolute", top: "50%", right: 2, width: 52, height: 52, display: "flex", alignItems: "center", justifyContent: "center", transform: "translateY(-50%) rotate(-9deg)", zIndex: 3 }}>
                                  <svg width={52} height={52} viewBox="0 0 100 100" style={{ position: "absolute", inset: 0 }}>
                                    {(() => {
                                      const n = 20, cx = 50, cy = 50, R = 47, r = 37;
                                      const pts = Array.from({ length: n * 2 }, (_, i) => {
                                        const a = (i * Math.PI / n) - Math.PI / 2;
                                        return [cx + (i % 2 === 0 ? R : r) * Math.cos(a), cy + (i % 2 === 0 ? R : r) * Math.sin(a)];
                                      });
                                      const s = [(pts[0][0] + pts[pts.length - 1][0]) / 2, (pts[0][1] + pts[pts.length - 1][1]) / 2];
                                      let d = `M ${s[0].toFixed(1)} ${s[1].toFixed(1)}`;
                                      for (let i = 0; i < pts.length; i++) {
                                        const p = pts[i], nx = pts[(i + 1) % pts.length];
                                        d += ` Q ${p[0].toFixed(1)} ${p[1].toFixed(1)} ${((p[0] + nx[0]) / 2).toFixed(1)} ${((p[1] + nx[1]) / 2).toFixed(1)}`;
                                      }
                                      return <path d={d + ' Z'} fill="var(--yellow)" stroke="var(--ink)" strokeWidth="2.5" />;
                                    })()}
                                  </svg>
                                  <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 2 }}>
                                    <span className="bc" style={{ fontSize: 14, lineHeight: 1 }}>🎮</span>
                                    {jvMembers.map((m, mi) => {
                                      const seed = m.nom.charCodeAt(0) + mi * 19;
                                      const tilt = ((seed % 14) - 7) * 1.2;
                                      return (
                                        <span key={mi} className="bc" style={{ fontSize: 19, lineHeight: 1, color: m.col, WebkitTextStroke: "1.5px var(--ink)", filter: "drop-shadow(1.5px 1.5px 0 #0d0d0d)", transform: `rotate(${tilt}deg)`, flexShrink: 0, display: "inline-block" }}>
                                          {m.nom[0].toUpperCase()}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        });
                      })()}

                      {blocsHoraires.length === 0 && absencesDay.length > 0 && !nomFerie && (
                        <div style={{ position: "absolute", top: 44, left: 6, right: 6, display: "flex", flexDirection: "column", gap: 4, zIndex: 20, pointerEvents: "none" }}>
                          {absencesDay.map((abs, aIdx) => (
                            <span key={`abs-f-${aIdx}`} style={{ fontSize: 9, fontWeight: 800, background: "var(--rose)", color: "var(--ink)", border: "1.5px solid var(--ink)", borderRadius: 4, padding: "2px 6px", boxShadow: "1px 1px 0 var(--ink)" }}>
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
                          <div key={`ev-h-${idx}`} onClick={(e) => { e.stopPropagation(); ouvrirEditionEvenement(ev, 'single'); }}
                            style={{ position: "absolute", left: 6, right: 6, top: `${top}%`, height: `${height}%`, zIndex: 40 + idx, cursor: "pointer", pointerEvents: "auto" }}>
                            <div style={{ position: "absolute", inset: 0, backgroundColor: getEventColor(ev.type), border: "2px solid var(--ink)", borderRadius: 8, boxShadow: "2px 2px 0 var(--ink)", padding: "6px 8px", display: "flex", flexDirection: "column", overflow: "hidden", transform: idx % 2 === 0 ? "rotate(0.8deg)" : "rotate(-0.6deg)", transformOrigin: "center" }}>
                              {ev.membres.length > 0 && (
                                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 4 }}>
                                  {activeEquipe.filter(m => ev.membres.includes(m.id)).map((m, mIdx) => {
                                    const tilt = (((m.nom.charCodeAt(0) + mIdx * 7) % 9) - 4) * 0.8;
                                    return (
                                      <span key={m.id} className="bc" style={{ fontSize: 20, lineHeight: 1, display: "inline-block", flexShrink: 0, color: getMemberColor({ groupe: m.groupe, couleur: m.horaires?.couleur }), WebkitTextStroke: "1.5px var(--ink)", filter: "drop-shadow(1.5px 1.5px 0 #0d0d0d)", transform: `rotate(${tilt}deg)` }}>
                                        {m.nom.trim()[0].toUpperCase()}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                              <span style={{ fontWeight: 800, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getEventIcon(ev.type)} {ev.titre}</span>
                              <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.6, marginTop: "auto" }}>{ev.heure_debut}–{ev.heure_fin}</span>
                            </div>
                          </div>
                        );
                      })}

                      <div style={{ position: "absolute", bottom: 6, left: 4, right: 4, display: "flex", flexDirection: "column", gap: 3, zIndex: 50, pointerEvents: "auto" }}>
                        {eventsBottom.map((ev, idx) => (
                           <div key={`ev-b-${idx}`} onClick={(e) => { e.stopPropagation(); ouvrirEditionEvenement(ev, 'single'); }}
                             style={{ fontSize: 9, fontWeight: 800, background: getEventColor(ev.type), border: "1.5px solid var(--ink)", borderRadius: 5, padding: "3px 6px", display: "flex", flexDirection: "column", cursor: "pointer", boxShadow: "1px 1px 0 var(--ink)" }}>
                             <span style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getNomsMembresEvent(ev.membres)}</span>
                             <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getEventIcon(ev.type)} {ev.titre}</span>
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
                  <button onClick={() => { openPlanningModal(); setShowEquipePanel(false); }} className="pop-btn pop-btn-dark" style={{ width: "100%", justifyContent: "center", fontSize: 14, padding: "12px 0" }}>
                    Planning
                  </button>
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
                        <div>
                          <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(0,0,0,0.4)", display: "block", marginBottom: 5 }}>Couleur de la pastille</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <input type="color" value={membreActif.horaires?.couleur || '#baff29'} onChange={e => setMembreActif({...membreActif, horaires: {...(membreActif.horaires || {}), couleur: e.target.value}})} style={{ width: 36, height: 36, borderRadius: 6, cursor: "pointer", border: "2px solid var(--ink)", padding: 2, background: "var(--white)" }} />
                            <div style={{ width: 22, height: 22, borderRadius: "50%", background: membreActif.horaires?.couleur || '#baff29', border: "2px solid var(--ink)", boxShadow: "2px 2px 0 var(--ink)", flexShrink: 0 }}></div>
                            <span style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(0,0,0,0.4)", textTransform: "uppercase" }}>{membreActif.horaires?.couleur || '#baff29'}</span>
                            {membreActif.horaires?.couleur && (
                              <button onClick={() => setMembreActif({...membreActif, horaires: {...(membreActif.horaires || {}), couleur: undefined}})} style={{ fontSize: 10, fontWeight: 700, color: "rgba(0,0,0,0.35)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Réinitialiser</button>
                            )}
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
                      <div key={ev.id} className="pop-card pop-card-hover" style={{ padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, background: getEventStyle(ev.type) }}>
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
                              <div key={occ.id} style={{ padding: "10px 12px", borderRadius: 8, border: "1.5px solid rgba(0,0,0,0.12)", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", opacity: occ.date_debut < todayStr ? 0.5 : 1, background: getEventStyle(occ.type) }} onClick={() => ouvrirEditionEvenement(occ, 'single')}>
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
                    Dupliquer
                  </button>
                )}
              </div>
              <button onClick={() => setShowEventModal(false)} className="pop-btn pop-btn-outline" style={{ width: 34, height: 34, padding: 0, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>✕</button>
            </div>
            <div className="hide-scrollbar" style={{ flex: 1, padding: "18px 22px", overflowY: "auto" }}>

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
                      {(['Congé', 'RTT', 'Récupération', 'Formation'] as const).map(a => (
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

      {showPlanningModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px 16px" }}
          onClick={e => { if (e.target === e.currentTarget) setShowPlanningModal(false); }}>
          <div className="pop-card" style={{ width: "100%", maxWidth: 1400, height: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Header */}
            <div style={{ background: "var(--ink)", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <span className="bc" style={{ fontSize: 22, color: "var(--cream)" }}>Planning</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={() => setPlanningDate(subWeeks(planningDate, 1))} className="pop-btn" style={{ padding: "6px 10px", background: "rgba(255,255,255,0.1)", color: "var(--white)", border: "1.5px solid rgba(255,255,255,0.2)" }}>◀</button>
                <span style={{ color: "var(--white)", fontSize: 13, fontWeight: 700, minWidth: 220, textAlign: "center" }}>
                  S{getISOWeek(planningDate)} · {format(startOfWeek(planningDate, { weekStartsOn: 1 }), 'd', { locale: fr })}–{format(endOfWeek(planningDate, { weekStartsOn: 1 }), 'd MMM yyyy', { locale: fr })}
                </span>
                <button onClick={() => setPlanningDate(addWeeks(planningDate, 1))} className="pop-btn" style={{ padding: "6px 10px", background: "rgba(255,255,255,0.1)", color: "var(--white)", border: "1.5px solid rgba(255,255,255,0.2)" }}>▶</button>
                <button onClick={() => setPlanningDate(new Date())} className="pop-btn" style={{ fontSize: 11, padding: "6px 10px", background: "rgba(255,255,255,0.1)", color: "var(--white)", border: "1.5px solid rgba(255,255,255,0.2)" }}>Auj.</button>
                <button onClick={savePlanningWeek} disabled={savingPlanning} className="pop-btn" style={{ fontSize: 12, padding: "6px 16px", background: savingPlanning ? "rgba(168,224,99,0.3)" : "var(--vert)", color: "var(--ink)", border: "2px solid rgba(255,255,255,0.4)", fontWeight: 900, marginLeft: 8 }}>{savingPlanning ? '…' : '✓ Enregistrer'}</button>
                <button onClick={() => { setPdfSemaines([planningDate]); setPdfNavDate(planningDate); setShowPdfSelector(true); }} className="pop-btn" style={{ fontSize: 12, padding: "6px 14px", background: "rgba(255,255,255,0.1)", color: "var(--white)", border: "1.5px solid rgba(255,255,255,0.3)" }}>PDF</button>
                <button onClick={() => { setSelectionMode(prev => !prev); setSelectedSlotIds(new Set()); setShowPasteCalendar(false); }} className="pop-btn" style={{ fontSize: 12, padding: "6px 14px", background: selectionMode ? "var(--yellow)" : "rgba(255,255,255,0.1)", color: selectionMode ? "var(--ink)" : "var(--white)", border: selectionMode ? "2px solid rgba(0,0,0,0.3)" : "1.5px solid rgba(255,255,255,0.3)" }}>Sélect.</button>
                <button onClick={() => setShowPlanningModal(false)} style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "none", cursor: "pointer", color: "var(--white)", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              </div>
            </div>
            <div style={{ height: 5, background: "linear-gradient(90deg,#a8e063 0%,#a8e063 16.6%,#f472b6 16.6%,#f472b6 33.2%,#60a5fa 33.2%,#60a5fa 49.8%,#f87171 49.8%,#f87171 66.4%,#fb923c 66.4%,#fb923c 83%,#c084fc 83%,#c084fc 100%)", flexShrink: 0 }} />
            {/* Body */}
            <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
              {/* Member sidebar */}
              <div style={{ width: 100, borderRight: "2.5px solid var(--ink)", padding: "16px 8px", display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", background: "var(--cream)", flexShrink: 0 }}>
                <span className="bc" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(0,0,0,0.35)", paddingBottom: 6, borderBottom: "1.5px solid rgba(0,0,0,0.1)", display: "block" }}>Équipe</span>
                {activeEquipe.map(m => {
                  const col = getMemberColor({ groupe: m.groupe, couleur: m.horaires?.couleur });
                  const tilt = (m.nom.charCodeAt(0) % 9 - 4) * 0.6;
                  return (
                    <div key={m.id} data-member-id={m.id}
                      onMouseDown={e => {
                        e.preventDefault();
                        multiDragRef.current = { ids: [m.id] };
                        setDragSelectionIds([m.id]);
                        const absentSet = new Set(planningDays.filter(jour => {
                          const dk = format(jour, 'yyyy-MM-dd');
                          return evenements.some(ev => ABSENCE_TYPES.includes(ev.type) && ev.date_debut <= dk && ev.date_fin >= dk && (!ev.membres || ev.membres.length === 0 || ev.membres.includes(m.id)));
                        }).map(j => format(j, 'yyyy-MM-dd')));
                        setDragAbsentDays(absentSet);
                        const ghost = document.createElement('div');
                        ghost.style.cssText = `position:fixed;left:${e.clientX + 14}px;top:${e.clientY + 14}px;pointer-events:none;z-index:9999;display:flex;gap:4px;background:rgba(255,255,255,0.92);border:2px solid #0d0d0d;border-radius:10px;padding:6px 8px;box-shadow:3px 3px 0 #0d0d0d`;
                        const d = memberDataRef.current[m.id];
                        if (d) { const span = document.createElement('span'); span.style.cssText = `font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:28px;line-height:1;color:${d.color};-webkit-text-stroke:1.5px #0d0d0d;filter:drop-shadow(1.5px 1.5px 0 #0d0d0d);display:inline-block`; span.textContent = d.initial; ghost.appendChild(span); }
                        document.body.appendChild(ghost);
                        ghostRef.current = ghost;
                      }}
                      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "grab", padding: "6px 4px", borderRadius: 8, background: dragSelectionIds.includes(m.id) ? "rgba(0,0,0,0.06)" : "transparent", userSelect: "none", transition: "background 0.1s" }}>
                      <span className="bc" style={{ fontSize: 34, lineHeight: 1, display: "inline-block", color: col, WebkitTextStroke: "1.5px var(--ink)", filter: "drop-shadow(1.5px 1.5px 0 #0d0d0d)", transform: `rotate(${tilt}deg)` }}>
                        {m.nom.trim()[0].toUpperCase()}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(0,0,0,0.45)", textAlign: "center", lineHeight: 1.2 }}>{m.nom.split(' ')[0]}</span>
                    </div>
                  );
                })}
                {/* Vacataires */}
                <div style={{ borderTop: "1.5px solid rgba(0,0,0,0.1)", paddingTop: 8, marginTop: 2, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span className="bc" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(0,0,0,0.35)" }}>Vacataires</span>
                    <button onClick={addVacataire} style={{ width: 18, height: 18, borderRadius: "50%", background: "var(--ink)", color: "var(--white)", border: "none", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, flexShrink: 0 }}>+</button>
                  </div>
                  {vacataires.map(vac => {
                    const label = vac.nom.trim() || '?';
                    const tilt = (label.charCodeAt(0) % 9 - 4) * 0.6;
                    return (
                      <div key={vac.id} style={{ position: "relative" }}>
                        <div data-member-id={vac.id}
                          onMouseDown={e => {
                            e.preventDefault();
                            multiDragRef.current = { ids: [vac.id] };
                            setDragSelectionIds([vac.id]);
                            setDragAbsentDays(new Set());
                            const ghost = document.createElement('div');
                            ghost.style.cssText = `position:fixed;left:${e.clientX + 14}px;top:${e.clientY + 14}px;pointer-events:none;z-index:9999;display:flex;gap:4px;background:rgba(255,255,255,0.92);border:2px solid #0d0d0d;border-radius:10px;padding:6px 8px;box-shadow:3px 3px 0 #0d0d0d`;
                            const d = memberDataRef.current[vac.id];
                            if (d) { const span = document.createElement('span'); span.style.cssText = `font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:28px;line-height:1;color:${d.color};-webkit-text-stroke:1.5px #0d0d0d;filter:drop-shadow(1.5px 1.5px 0 #0d0d0d);display:inline-block`; span.textContent = d.initial; ghost.appendChild(span); }
                            document.body.appendChild(ghost);
                            ghostRef.current = ghost;
                          }}
                          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "grab", padding: "6px 4px", borderRadius: 8, background: dragSelectionIds.includes(vac.id) ? "rgba(0,0,0,0.06)" : "transparent", userSelect: "none" }}>
                          <span className="bc" style={{ fontSize: 34, lineHeight: 1, display: "inline-block", color: vac.couleur, WebkitTextStroke: "1.5px var(--ink)", filter: "drop-shadow(1.5px 1.5px 0 #0d0d0d)", transform: `rotate(${tilt}deg)` }}>
                            {label[0].toUpperCase()}
                          </span>
                          {editingVacId === vac.id ? (
                            <input autoFocus value={vac.nom}
                              onChange={e => setVacataires(prev => prev.map(v => v.id === vac.id ? { ...v, nom: e.target.value } : v))}
                              onBlur={() => setEditingVacId(null)}
                              onKeyDown={e => { if (e.key === 'Enter') setEditingVacId(null); }}
                              style={{ width: 76, fontSize: 10, textAlign: "center", border: "1.5px solid var(--ink)", borderRadius: 3, padding: "2px 4px", fontFamily: "inherit", fontWeight: 700, outline: "none" }} />
                          ) : (
                            <span onClick={() => setEditingVacId(vac.id)} title="Cliquer pour renommer" style={{ fontSize: 10, fontWeight: 700, color: "rgba(0,0,0,0.45)", textAlign: "center", lineHeight: 1.2, cursor: "text", borderBottom: "1px dashed rgba(0,0,0,0.2)" }}>
                              {vac.nom.split(' ')[0]}
                            </span>
                          )}
                        </div>
                        <button onClick={() => removeVacataire(vac.id)} title="Supprimer"
                          style={{ position: "absolute", top: 2, right: 2, width: 14, height: 14, borderRadius: "50%", background: "rgba(0,0,0,0.12)", color: "var(--ink)", border: "none", cursor: "pointer", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>✕</button>
                      </div>
                    );
                  })}
                  {vacataires.length === 0 && (
                    <span style={{ fontSize: 10, color: "rgba(0,0,0,0.3)", textAlign: "center", fontStyle: "italic" }}>Aucun</span>
                  )}
                </div>
              </div>
              {/* Grid */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                {/* Day headers */}
                <div style={{ display: "grid", gridTemplateColumns: "44px repeat(5, 1fr)", background: "var(--white)", borderBottom: "2px solid var(--ink)", flexShrink: 0 }}>
                  <div />
                  {planningDays.map(jour => {
                    const today = isToday(jour);
                    const dk2 = format(jour, 'yyyy-MM-dd');
                    const ferieLabel = planningJoursFeries[dk2];
                    return (
                      <div key={dk2} style={{ padding: "6px 4px", display: "flex", flexDirection: "column", alignItems: "center", gap: 1, background: ferieLabel ? "rgba(250,204,21,0.18)" : today ? "var(--yellow)" : "transparent" }}>
                        <span style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(0,0,0,0.4)" }}>{format(jour, "EEE", { locale: fr })}</span>
                        <span className="bc" style={{ fontSize: 18, lineHeight: 1 }}>{format(jour, "d")}</span>
                        {ferieLabel && <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(0,0,0,0.5)", textAlign: "center", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{ferieLabel}</span>}
                      </div>
                    );
                  })}
                </div>
                {/* Scrollable time grid */}
                <div style={{ flex: 1, overflowY: "auto" }}>
                  <div style={{ display: "flex", minHeight: 660, position: "relative" }}>
                    {/* Rubber-band selection overlay */}
                    {selectionMode && (
                      <div
                        style={{ position: "absolute", left: 44, right: 0, top: 0, bottom: 0, zIndex: 50, cursor: "crosshair" }}
                        onMouseDown={e => {
                          if (!selectionModeRef.current) return;
                          e.preventDefault();
                          rbStartRef.current = { x: e.clientX, y: e.clientY };
                          setRubberBand({ x1: e.clientX, y1: e.clientY, x2: e.clientX, y2: e.clientY });
                        }}
                      />
                    )}
                    {/* Hour labels */}
                    <div style={{ width: 44, flexShrink: 0, position: "relative", borderRight: "1.5px solid rgba(0,0,0,0.1)", background: "var(--white)" }}>
                      {PLANNING_HEURES.map(h => (
                        <div key={h} style={{ position: "absolute", top: `${planningTopPct(`${h}:00`)}%`, right: 6, fontSize: 10, fontWeight: 700, color: "rgba(0,0,0,0.3)", transform: "translateY(-50%)" }}>{h}h</div>
                      ))}
                    </div>
                    {/* Grid lines */}
                    <div style={{ position: "absolute", left: 44, right: 0, top: 0, bottom: 0, pointerEvents: "none" }}>
                      {PLANNING_HEURES.map(h => (
                        <div key={h} style={{ position: "absolute", width: "100%", borderTop: "1px solid rgba(0,0,0,0.06)", top: `${planningTopPct(`${h}:00`)}%` }} />
                      ))}
                    </div>
                    {/* Day columns */}
                    <div ref={planningGridRef} style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(5, 1fr)" }}>
                      {planningDays.map(jour => {
                        const dk = format(jour, 'yyyy-MM-dd');
                        const ferie = planningJoursFeries[dk];
                        const daySlots = planningSlots.filter(s => s.dateKey === dk);
                        const jvTimes = new Set(daySlots.filter(s => s.room === 'jv').map(s => `${s.debut}|${s.fin}`));
                        const today = isToday(jour);
                        const allDebuts = daySlots.map(s => timeToMins(s.debut));
                        const allFins = daySlots.map(s => timeToMins(s.fin));
                        const earliestDebut = allDebuts.length ? Math.min(...allDebuts) : -1;
                        const latestFin = allFins.length ? Math.max(...allFins) : -1;
                        const addSlotToDay = (dMins: number, fMins: number) => {
                          const d = minsToTimeStr(dMins); const f = minsToTimeStr(fMins);
                          setPlanningSlots(prev => [...prev, { id: `${dk}-${d}-${Date.now()}`, dateKey: dk, debut: d, fin: f, membreIds: [], room: 'principale' }]);
                        };
                        return (
                          <div key={dk} className={today ? 'today-hatch' : ''} style={{ position: "relative", borderRight: "1px solid rgba(0,0,0,0.08)", background: ferie && !today ? "repeating-linear-gradient(-45deg, rgba(0,0,0,0.025) 0 4px, transparent 4px 10px)" : undefined }}>
                            {ferie && (
                              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, zIndex: 30, pointerEvents: "none" }}>
                                <span className="bc" style={{ fontSize: 11, fontWeight: 900, color: "rgba(0,0,0,0.25)", textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center", padding: "0 4px" }}>Jour férié</span>
                                <span style={{ fontSize: 10, color: "rgba(0,0,0,0.18)", fontWeight: 700, textAlign: "center", padding: "0 4px" }}>{ferie}</span>
                              </div>
                            )}
                            {!ferie && dragAbsentDays.has(dk) && (
                              <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(-45deg, rgba(248,113,113,0.22) 0 5px, transparent 5px 12px)", pointerEvents: "none", zIndex: 40, borderRadius: 0 }}>
                                <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
                                  <span style={{ fontSize: 9, fontWeight: 800, color: "var(--rouge)", background: "rgba(255,255,255,0.9)", padding: "2px 6px", borderRadius: 4, border: "1.5px solid var(--rouge)" }}>Absent</span>
                                </div>
                              </div>
                            )}
                            {!ferie && daySlots.map(slot => {
                              const top = planningTopPct(slot.debut);
                              const height = planningHPct(slot.debut, slot.fin);
                              const isEmpty = slot.membreIds.length === 0;
                              const hovering = hoveringSlotId === slot.id;
                              const isJV = slot.room === 'jv';
                              const hasJVSibling = !isJV && jvTimes.has(`${slot.debut}|${slot.fin}`);
                              const leftVal = isJV ? "50%" : 4;
                              const rightVal = (!isJV && hasJVSibling) ? "50%" : 4;
                              const jvBg = isEmpty ? "rgba(168,224,99,0.07)" : "rgba(168,224,99,0.18)";
                              return (
                                <div key={slot.id} data-slot-id={slot.id} data-date-key={dk}
                                  style={{ position: "absolute", left: leftVal, right: rightVal, top: `${top}%`, height: `${height}%`, borderRadius: 7, border: selectedSlotIds.has(slot.id) ? "2.5px solid var(--bleu)" : hovering ? "2.5px dashed var(--bleu)" : isEmpty ? "2px dashed rgba(0,0,0,0.18)" : "2px solid var(--ink)", background: selectedSlotIds.has(slot.id) ? "rgba(96,165,250,0.18)" : hovering ? "rgba(96,165,250,0.08)" : isJV ? jvBg : isEmpty ? "rgba(0,0,0,0.015)" : "var(--white)", boxShadow: selectedSlotIds.has(slot.id) ? "2px 2px 0 var(--bleu)" : isEmpty ? "none" : "2px 2px 0 var(--ink)", display: "flex", flexDirection: "column", overflow: "visible", transition: "border-color 0.1s, background 0.1s", zIndex: selectedSlotIds.has(slot.id) ? 20 : undefined }}>
                                  {/* Top resize handle */}
                                  <div onMouseDown={e => { e.preventDefault(); resizingRef.current = { slotId: slot.id, edge: 'top', startY: e.clientY, origDebut: slot.debut, origFin: slot.fin }; }}
                                    style={{ position: "absolute", top: 0, left: 0, right: 0, height: 8, cursor: "n-resize", borderRadius: "7px 7px 0 0", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
                                    <div style={{ width: 18, height: 2, borderRadius: 1, background: "rgba(0,0,0,0.2)" }} />
                                  </div>
                                  {/* Delete button */}
                                  <button onClick={e => { e.stopPropagation(); setPlanningSlots(prev => prev.filter(s => s.id !== slot.id)); }}
                                    style={{ position: "absolute", top: 3, right: 3, width: 14, height: 14, borderRadius: "50%", background: "rgba(0,0,0,0.1)", color: "rgba(0,0,0,0.35)", border: "none", cursor: "pointer", fontSize: 8, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, zIndex: 5 }}>✕</button>
                                  {/* Content */}
                                  <div style={{ flex: 1, padding: "10px 6px 6px", display: "flex", flexDirection: "column", gap: 4, overflow: "hidden" }}>
                                    <span style={{ fontSize: 9, fontWeight: 800, color: "rgba(0,0,0,0.35)", lineHeight: 1, letterSpacing: "0.04em" }}>{isJV ? 'JV · ' : ''}{slot.debut}–{slot.fin}</span>
                                    {slot.membreIds.length > 0 && (
                                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "flex-end" }}>
                                        {slot.membreIds.map(mid => {
                                          const vac = vacataires.find(v => v.id === mid);
                                          const membre = activeEquipe.find(mb => mb.id === mid);
                                          const nomRaw = vac?.nom ?? membre?.nom ?? '';
                                          const nom = nomRaw.trim() || '?';
                                          if (!nomRaw && !membre) return null;
                                          const col = vac ? vac.couleur : getMemberColor({ groupe: membre?.groupe, couleur: membre?.horaires?.couleur });
                                          const tilt = (nom.charCodeAt(0) % 9 - 4) * 0.6;
                                          return (
                                            <div key={mid} style={{ position: "relative" }}>
                                              <span className="bc" style={{ fontSize: 44, lineHeight: 1, display: "inline-block", color: col, WebkitTextStroke: "1.5px var(--ink)", filter: "drop-shadow(1.5px 1.5px 0 #0d0d0d)", transform: `rotate(${tilt}deg)` }}>
                                                {nom[0].toUpperCase()}
                                              </span>
                                              <button onClick={() => setPlanningSlots(prev => prev.map(s => s.id === slot.id ? { ...s, membreIds: s.membreIds.filter(id => id !== mid) } : s))}
                                                style={{ position: "absolute", top: -3, right: -5, width: 13, height: 13, borderRadius: "50%", background: "var(--ink)", color: "var(--white)", border: "none", cursor: "pointer", fontSize: 8, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>✕</button>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                  {/* Bottom resize handle */}
                                  <div onMouseDown={e => { e.preventDefault(); resizingRef.current = { slotId: slot.id, edge: 'bottom', startY: e.clientY, origDebut: slot.debut, origFin: slot.fin }; }}
                                    style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 8, cursor: "s-resize", borderRadius: "0 0 7px 7px", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
                                    <div style={{ width: 18, height: 2, borderRadius: 1, background: "rgba(0,0,0,0.2)" }} />
                                  </div>
                                </div>
                              );
                            })}
                            {/* + before first slot */}
                            {!ferie && earliestDebut > PLANNING_START * 60 && (
                              <button onClick={() => addSlotToDay(Math.max(PLANNING_START * 60, earliestDebut - 60), earliestDebut)}
                                style={{ position: "absolute", top: `${planningTopPct(minsToTimeStr(earliestDebut))}%`, left: "50%", transform: "translate(-50%, -110%)", zIndex: 10, width: 16, height: 16, borderRadius: "50%", background: "rgba(0,0,0,0.18)", color: "var(--white)", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>+</button>
                            )}
                            {/* + after last slot */}
                            {!ferie && latestFin >= 0 && latestFin < PLANNING_END * 60 && (
                              <button onClick={() => addSlotToDay(latestFin, Math.min(PLANNING_END * 60, latestFin + 60))}
                                style={{ position: "absolute", top: `${planningTopPct(minsToTimeStr(latestFin))}%`, left: "50%", transform: "translate(-50%, 10%)", zIndex: 10, width: 16, height: 16, borderRadius: "50%", background: "rgba(0,0,0,0.18)", color: "var(--white)", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>+</button>
                            )}
                            {/* + to start if empty day */}
                            {!ferie && daySlots.length === 0 && (
                              <button onClick={() => addSlotToDay(13 * 60, 14 * 60)}
                                style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 10, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.12)", color: "var(--ink)", border: "2px dashed rgba(0,0,0,0.2)", cursor: "pointer", fontSize: 15, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>+</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                {/* Action bar for selection mode */}
                {selectionMode && selectedSlotIds.size > 0 && (
                  <div style={{ background: "var(--ink)", display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", zIndex: 60, flexShrink: 0, borderTop: "2.5px solid var(--ink)" }}>
                    <span style={{ color: "var(--white)", fontSize: 13, fontWeight: 700 }}>{selectedSlotIds.size} créneau{selectedSlotIds.size > 1 ? 'x' : ''} sélectionné{selectedSlotIds.size > 1 ? 's' : ''}</span>
                    <button className="pop-btn" onClick={() => { setShowPasteCalendar(true); setPasteCalMonth(planningDate); }}
                      style={{ background: "var(--vert)", color: "var(--ink)", fontSize: 13, padding: "6px 14px" }}>Copier</button>
                    <button className="pop-btn" onClick={() => { setPlanningSlots(prev => prev.map(s => selectedSlotIds.has(s.id) ? { ...s, membreIds: [] } : s)); setSelectedSlotIds(new Set()); }}
                      style={{ background: "var(--rouge)", color: "var(--white)", fontSize: 13, padding: "6px 14px" }}>Supprimer</button>
                    <button onClick={() => { setSelectedSlotIds(new Set()); setShowPasteCalendar(false); }} style={{ marginLeft: "auto", background: "transparent", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 13 }}>Annuler</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rubber-band visual */}
      {rubberBand && (
        <div style={{ position: "fixed", left: Math.min(rubberBand.x1, rubberBand.x2), top: Math.min(rubberBand.y1, rubberBand.y2), width: Math.abs(rubberBand.x2 - rubberBand.x1), height: Math.abs(rubberBand.y2 - rubberBand.y1), border: "2px solid var(--bleu)", background: "rgba(96,165,250,0.12)", pointerEvents: "none", zIndex: 9999, borderRadius: 4 }} />
      )}

      {/* Paste calendar overlay */}
      {showPasteCalendar && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={e => { if (e.target === e.currentTarget) setShowPasteCalendar(false); }}>
          <div className="pop-card" style={{ width: 360, overflow: "hidden" }}>
            <div style={{ background: "var(--ink)", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="bc" style={{ fontSize: 18, color: "var(--cream)" }}>Coller sur…</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={() => setPasteCalMonth(m => addMonths(m, -1))} style={{ background: "transparent", border: "none", color: "var(--white)", cursor: "pointer", fontSize: 16 }}>◀</button>
                <span style={{ color: "var(--white)", fontSize: 13, fontWeight: 700, minWidth: 120, textAlign: "center" }}>{format(pasteCalMonth, 'MMMM yyyy', { locale: fr })}</span>
                <button onClick={() => setPasteCalMonth(m => addMonths(m, 1))} style={{ background: "transparent", border: "none", color: "var(--white)", cursor: "pointer", fontSize: 16 }}>▶</button>
              </div>
            </div>
            <div style={{ padding: 12 }}>
              {/* Day headers */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
                {['L','M','M','J','V','S','D'].map((d, i) => (
                  <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "rgba(0,0,0,0.35)", padding: "2px 0" }}>{d}</div>
                ))}
              </div>
              {/* Weeks */}
              {(() => {
                const monthStart = startOfMonth(pasteCalMonth);
                const monthEnd = endOfMonth(pasteCalMonth);
                const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
                const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
                const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
                const weeks: Date[][] = [];
                for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
                return weeks.map((week, wi) => {
                  const weekKey = format(week[0], 'yyyy-MM-dd');
                  const isCurrentPlanningWeek = weekKey === planningWeekKey(planningDate);
                  const isHovered = hoveredPasteWeek === weekKey;
                  return (
                    <div key={wi}
                      style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2, borderRadius: 6, background: isCurrentPlanningWeek ? "rgba(0,0,0,0.06)" : isHovered ? "rgba(96,165,250,0.12)" : "transparent", cursor: isCurrentPlanningWeek ? "default" : "pointer", outline: isHovered ? "2px solid var(--bleu)" : "none", transition: "background 0.1s" }}
                      onMouseEnter={() => !isCurrentPlanningWeek && setHoveredPasteWeek(weekKey)}
                      onMouseLeave={() => setHoveredPasteWeek(null)}
                      onClick={async () => {
                        if (isCurrentPlanningWeek) return;
                        const targetWeekStart = week[0];
                        const targetKey = weekKey;
                        const selectedSlots = planningSlots.filter(s => selectedSlotIds.has(s.id));
                        const data = await fetch(`/api/planning-semaine?key=${targetKey}`).then(r => r.json() as Promise<any>).catch(() => null);
                        const existingSlots: PlanningSlot[] = (data?.slots?.length > 0)
                          ? (data.slots as PlanningSlot[])
                          : getDefaultPlanningSlots(eachDayOfInterval({ start: targetWeekStart, end: addDays(targetWeekStart, 6) }));
                        // Index existing target slots by "dateKey|debut|room" to allow both merge and insert
                        const resultSlots: PlanningSlot[] = [...existingSlots];
                        const slotMap = new Map<string, number>();
                        existingSlots.forEach((s, i) => slotMap.set(`${s.dateKey}|${s.debut}|${s.room ?? 'principale'}`, i));
                        for (const src of selectedSlots) {
                          const srcDow = (new Date(src.dateKey).getDay() + 6) % 7;
                          const targetDay = week[srcDow];
                          if (!targetDay) continue;
                          const targetDateKey = format(targetDay, 'yyyy-MM-dd');
                          const room = src.room ?? 'principale';
                          const key = `${targetDateKey}|${src.debut}|${room}`;
                          if (slotMap.has(key)) {
                            const idx = slotMap.get(key)!;
                            resultSlots[idx] = { ...resultSlots[idx], membreIds: [...new Set([...resultSlots[idx].membreIds, ...src.membreIds])] };
                          } else {
                            // Custom-duration slot: add it to the target with adjusted dateKey/id
                            slotMap.set(key, resultSlots.length);
                            resultSlots.push({ ...src, id: `${targetDateKey}-${src.debut}${room === 'jv' ? '-jv' : ''}`, dateKey: targetDateKey });
                          }
                        }
                        const updatedSlots = resultSlots;
                        const targetVacataires: Vacataire[] = (data?.vacataires ?? []) as Vacataire[];
                        const mergedVacataires = [...targetVacataires, ...vacataires.filter(v => !targetVacataires.some(tv => tv.id === v.id))];
                        await fetch('/api/planning-semaine', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ semaine_key: targetKey, slots: updatedSlots, vacataires: mergedVacataires, updated_at: new Date().toISOString() }) });
                        setShowPasteCalendar(false);
                        setSelectedSlotIds(new Set());
                        setSelectionMode(false);
                      }}>
                      {week.map((day, di) => {
                        const inMonth = isSameMonth(day, pasteCalMonth);
                        return (
                          <div key={di} style={{ textAlign: "center", padding: "5px 0", fontSize: 12, fontWeight: inMonth ? 700 : 400, color: inMonth ? "var(--ink)" : "rgba(0,0,0,0.25)", borderRadius: 4, background: isToday(day) ? "var(--yellow)" : "transparent" }}>{format(day, 'd')}</div>
                        );
                      })}
                    </div>
                  );
                });
              })()}
            </div>
            <div style={{ padding: "8px 16px 14px", borderTop: "1.5px solid rgba(0,0,0,0.1)" }}>
              <p style={{ fontSize: 11, color: "rgba(0,0,0,0.45)", margin: 0 }}>Cliquez sur une semaine pour coller les {selectedSlotIds.size} créneaux sélectionnés.</p>
            </div>
          </div>
        </div>
      )}

      {showPdfSelector && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px 16px" }}
          onClick={e => { if (e.target === e.currentTarget) setShowPdfSelector(false); }}>
          <div className="pop-card" style={{ width: "100%", maxWidth: 440, overflow: "hidden" }}>
            <div style={{ background: "var(--ink)", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="bc" style={{ fontSize: 20, color: "var(--cream)" }}>Export PDF Planning</span>
              <button onClick={() => setShowPdfSelector(false)} style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "none", cursor: "pointer", color: "var(--white)", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Week navigator to add */}
              <div>
                <p style={{ fontSize: 10, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Ajouter une semaine</p>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button onClick={() => setPdfNavDate(subWeeks(pdfNavDate, 1))} className="pop-btn pop-btn-outline" style={{ padding: "6px 10px" }}>◀</button>
                  <div style={{ flex: 1, textAlign: "center", fontWeight: 700, fontSize: 13, background: "var(--cream2)", borderRadius: 8, padding: "8px 12px", border: "2px solid var(--ink)" }}>
                    S{getISOWeek(pdfNavDate)} · {format(startOfWeek(pdfNavDate, { weekStartsOn: 1 }), 'd', { locale: fr })}–{format(endOfWeek(pdfNavDate, { weekStartsOn: 1 }), 'd MMM yyyy', { locale: fr })}
                  </div>
                  <button onClick={() => setPdfNavDate(addWeeks(pdfNavDate, 1))} className="pop-btn pop-btn-outline" style={{ padding: "6px 10px" }}>▶</button>
                  <button
                    onClick={() => {
                      const navKey = planningWeekKey(pdfNavDate);
                      if (!pdfSemaines.some(s => planningWeekKey(s) === navKey)) {
                        setPdfSemaines(prev => [...prev, pdfNavDate].sort((a, b) => a.getTime() - b.getTime()));
                      }
                    }}
                    className="pop-btn pop-btn-dark" style={{ padding: "6px 12px", fontSize: 13, whiteSpace: "nowrap" }}>
                    + Ajouter
                  </button>
                </div>
              </div>

              {/* Selected weeks list */}
              <div>
                <p style={{ fontSize: 10, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                  Semaines sélectionnées ({pdfSemaines.length})
                </p>
                {pdfSemaines.length === 0 ? (
                  <p style={{ fontSize: 13, color: "rgba(0,0,0,0.35)", textAlign: "center", padding: "12px 0" }}>Aucune semaine sélectionnée</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {pdfSemaines.map((sem, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--cream2)", border: "2px solid var(--ink)", borderRadius: 8, padding: "6px 10px 6px 14px", boxShadow: "2px 2px 0 var(--ink)" }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>
                          S{getISOWeek(sem)} · {format(startOfWeek(sem, { weekStartsOn: 1 }), 'd', { locale: fr })}–{format(endOfWeek(sem, { weekStartsOn: 1 }), 'd MMM yyyy', { locale: fr })}
                        </span>
                        <button onClick={() => setPdfSemaines(prev => prev.filter((_, i) => i !== idx))}
                          style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.1)", border: "none", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink)", flexShrink: 0 }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ borderTop: "1.5px solid rgba(0,0,0,0.08)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                <p style={{ fontSize: 10, color: "rgba(0,0,0,0.4)", fontWeight: 600, lineHeight: 1.4 }}>
                  Chaque semaine = une page A4 paysage. La semaine courante sera sauvegardée automatiquement avant export.
                </p>
                <button
                  onClick={genererPDF}
                  disabled={isGeneratingPdf || pdfSemaines.length === 0}
                  className="pop-btn pop-btn-dark"
                  style={{ width: "100%", justifyContent: "center", fontSize: 14, padding: "10px", opacity: pdfSemaines.length === 0 ? 0.4 : 1 }}>
                  {isGeneratingPdf ? '⏳ Génération…' : `🖨️ Générer${pdfSemaines.length > 1 ? ` (${pdfSemaines.length} semaines)` : ''} → Imprimer / PDF`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {hoveredDay && hoverPos && !selectedDay && (() => {
        const jourHov = new Date(hoveredDay + 'T12:00:00');
        const nomFerieHov = joursFeries[hoveredDay];
        const zonesVacancesHov = vacances[hoveredDay] || [];
        const typeSemaineHov = getISOWeek(jourHov) % 2 !== 0 ? 'semaineA' : 'semaineB';
        const nomJourHov = format(jourHov, 'EEEE', { locale: fr }).toLowerCase();
        const evsHov = activeEvenements.filter(e => e.date_debut <= hoveredDay && e.date_fin >= hoveredDay);

        let presencesHov: any[] = [];
        if (!nomFerieHov) {
          activeEquipe.forEach(m => {
            const h = getHoraireForDay(m, hoveredDay, nomJourHov, typeSemaineHov);
            if (h && h.debut && h.fin) {
              let segs = [{ debut: h.debut, fin: h.fin }];
              evsHov.filter(e => ABSENCE_TYPES.includes(e.type) && (!e.membres || e.membres.length === 0 || e.membres.includes(m.id))).forEach(ev => {
                if (!ev.heure_debut || !ev.heure_fin) { segs = []; }
                else { const ns: any[] = []; segs.forEach(s => ns.push(...soustraireHeures(s.debut, s.fin, ev.heure_debut!, ev.heure_fin!))); segs = ns; }
              });
              segs.forEach(seg => presencesHov.push({ nom: m.nom, groupe: m.groupe, debut: seg.debut, fin: seg.fin, id: m.id, couleur: m.horaires?.couleur }));
            }
          });
        }

        const blocsHov = genererBlocsMensuels(presencesHov);
        const nonSpecialEvsHov = evsHov.filter(e => !['Soirée Jeux', 'Heures Exceptionnelles'].includes(e.type));
        const specialEvsHov = evsHov.filter(e => ['Soirée Jeux', 'Heures Exceptionnelles'].includes(e.type));
        const allCards = [...blocsHov, ...nonSpecialEvsHov, ...specialEvsHov];
        if (allCards.length === 0 && !nomFerieHov) return null;

        const TOOLTIP_W = 260;
        const TOOLTIP_APPROX_H = 80 + allCards.length * 60;
        const showLeft = hoverPos.x + TOOLTIP_W + 12 > window.innerWidth;
        const left = showLeft ? hoverPos.x - TOOLTIP_W - 4 : hoverPos.x + 4;
        const top = Math.min(hoverPos.y, window.innerHeight - TOOLTIP_APPROX_H - 16);

        return (
          <div key="day-hover" style={{ position: "fixed", left, top, width: TOOLTIP_W, zIndex: 190, pointerEvents: "none", animation: "fadeInUp 0.15s ease" }}>
            <div className="pop-card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ background: "var(--ink)", padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span className="bc" style={{ fontSize: 13, color: "var(--cream)" }}>
                  {format(jourHov, 'EEEE d MMMM', { locale: fr })}
                </span>
                <VacancePastilles zones={zonesVacancesHov} size={16} />
              </div>
              <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                {nomFerieHov && (
                  <div className="bc" style={{ background: "var(--yellow)", border: "2px solid var(--ink)", borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em", boxShadow: "2px 2px 0 var(--ink)", transform: "rotate(-1deg)", alignSelf: "flex-start" }}>
                    🎉 {nomFerieHov}
                  </div>
                )}
                {blocsHov.map((bloc: any, idx: number) => {
                  const bgColor = getBlocColor(bloc.membresInfos, activeEquipe);
                  const rot = idx % 2 === 0 ? -1.5 : 1;
                  return (
                    <div key={`bh-${idx}`} style={{ background: bgColor, border: "2px solid var(--ink)", borderRadius: 7, padding: "6px 10px", display: "flex", alignItems: "center", gap: 6, boxShadow: "2px 2px 0 var(--ink)", transform: `rotate(${rot}deg)` }}>
                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "flex-end", flex: 1 }}>
                        {bloc.membresInfos.map((m: any, mIdx: number) => {
                          const tilt = (((m.nom.charCodeAt(0) + mIdx * 7) % 9) - 4) * 0.8;
                          return (
                            <span key={mIdx} className="bc" style={{ fontSize: 18, lineHeight: 1, color: getMemberColor(m), WebkitTextStroke: "1px var(--ink)", filter: "drop-shadow(1px 1px 0 #0d0d0d)", transform: `rotate(${tilt}deg)` }}>
                              {m.nom.trim()[0].toUpperCase()}
                            </span>
                          );
                        })}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.6, whiteSpace: "nowrap" }}>{bloc.debut}–{bloc.fin}</span>
                    </div>
                  );
                })}
                {[...nonSpecialEvsHov, ...specialEvsHov].map((ev, idx) => {
                  const rot = idx % 2 === 0 ? 1 : -0.7;
                  return (
                    <div key={`eh-${idx}`} style={{ background: getEventColor(ev.type), border: "2px solid var(--ink)", borderRadius: 7, padding: "5px 10px", display: "flex", gap: 6, alignItems: "center", boxShadow: "2px 2px 0 var(--ink)", transform: `rotate(${rot}deg)` }}>
                      <span style={{ fontSize: 13 }}>{getEventIcon(ev.type)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.titre || ev.type}</div>
                        {ev.heure_debut && <div style={{ fontSize: 10, opacity: 0.65, fontWeight: 600 }}>{ev.heure_debut}–{ev.heure_fin}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {selectedDay && (() => {
        const jourSel = new Date(selectedDay + 'T12:00:00');
        const nomFerieSel = joursFeries[selectedDay];
        const zonesVacancesSel = vacances[selectedDay] || [];
        const typeSemaineSel = getISOWeek(jourSel) % 2 !== 0 ? 'semaineA' : 'semaineB';
        const nomJourSel = format(jourSel, 'EEEE', { locale: fr }).toLowerCase();
        const evsDuJour = activeEvenements.filter(e => e.date_debut <= selectedDay && e.date_fin >= selectedDay);

        let presencesSel: any[] = [];
        if (!nomFerieSel) {
          activeEquipe.forEach(m => {
            const h = getHoraireForDay(m, selectedDay, nomJourSel, typeSemaineSel);
            if (h && h.debut && h.fin) {
              let segs = [{ debut: h.debut, fin: h.fin }];
              evsDuJour.filter(e => ABSENCE_TYPES.includes(e.type) && (!e.membres || e.membres.length === 0 || e.membres.includes(m.id))).forEach(ev => {
                if (!ev.heure_debut || !ev.heure_fin) { segs = []; }
                else { const ns: any[] = []; segs.forEach(s => ns.push(...soustraireHeures(s.debut, s.fin, ev.heure_debut!, ev.heure_fin!))); segs = ns; }
              });
              segs.forEach(seg => presencesSel.push({ nom: m.nom, groupe: m.groupe, debut: seg.debut, fin: seg.fin, id: m.id, couleur: m.horaires?.couleur }));
            }
          });
        }

        const blocsSelJour = genererBlocsMensuels(presencesSel);
        const specialEvsSel = evsDuJour.filter(e => ['Soirée Jeux', 'Heures Exceptionnelles'].includes(e.type));
        const absencesSel = evsDuJour.filter(e => !['Soirée Jeux', 'Heures Exceptionnelles'].includes(e.type));
        const isEmpty = !nomFerieSel && blocsSelJour.length === 0 && evsDuJour.length === 0;

        return (
          <div key="day-popup" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px 16px" }}
            onClick={e => { if (e.target === e.currentTarget) setSelectedDay(null); }}>
            <div style={{ position: "relative", width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 120px)" }}>
              <VacancePastilles zones={zonesVacancesSel} size={30} style={{ position: "absolute", top: -16, right: -12, zIndex: 10, gap: 5 }} />
              <div className="pop-card" style={{ width: "100%", maxHeight: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ background: "var(--ink)", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <div>
                  <div className="bc" style={{ fontSize: 36, color: "var(--cream)", lineHeight: 1 }}>
                    {format(jourSel, 'd')}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>
                    {format(jourSel, 'EEEE d MMMM yyyy', { locale: fr })}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button onClick={() => { setDateActuelle(jourSel); setVue("Semaine"); setSelectedDay(null); }} className="pop-btn pop-btn-outline" style={{ fontSize: 12, padding: "5px 10px", background: "rgba(255,255,255,0.1)", borderColor: "rgba(255,255,255,0.4)", color: "#fff" }}>Semaine →</button>
                  <button onClick={() => setSelectedDay(null)} style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "none", cursor: "pointer", color: "var(--cream)", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                </div>
              </div>

              <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
                {nomFerieSel && (
                  <div className="bc" style={{ background: "var(--yellow)", border: "2.5px solid var(--ink)", borderRadius: 8, padding: "8px 14px", fontWeight: 900, fontSize: 14, textTransform: "uppercase", letterSpacing: "0.06em", boxShadow: "3px 3px 0 var(--ink)", transform: "rotate(-1.5deg)", alignSelf: "flex-start" }}>
                    🎉 {nomFerieSel}
                  </div>
                )}

                {blocsSelJour.length > 0 && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Présences</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {blocsSelJour.map((bloc: any, idx: number) => {
                        const bgColor = getBlocColor(bloc.membresInfos, activeEquipe);
                        const absInBloc = evsDuJour.filter(e => ABSENCE_TYPES.includes(e.type) && e.membres.some((mId: string) => bloc.membresInfos.find((m: any) => m.id === mId)));
                        const rot = idx % 2 === 0 ? -1.5 : 1;
                        return (
                          <div key={idx} style={{ background: bgColor, border: "2.5px solid var(--ink)", borderRadius: 10, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6, boxShadow: "3px 3px 0 var(--ink)", transform: `rotate(${rot}deg)`, transformOrigin: "center" }}>
                            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "flex-end" }}>
                              {bloc.membresInfos.map((m: any, mIdx: number) => {
                                const tilt = (((m.nom.charCodeAt(0) + mIdx * 7) % 9) - 4) * 0.8;
                                return (
                                  <span key={mIdx} className="bc" style={{ fontSize: 28, lineHeight: 1, display: "inline-block", flexShrink: 0, color: getMemberColor(m), WebkitTextStroke: "1.5px var(--ink)", filter: "drop-shadow(1.5px 1.5px 0 #0d0d0d)", transform: `rotate(${tilt}deg)` }}>
                                    {m.nom.trim()[0].toUpperCase()}
                                  </span>
                                );
                              })}
                            </div>
                            {absInBloc.length > 0 && (
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                {absInBloc.map((abs: any, aIdx: number) => (
                                  <span key={aIdx} style={{ fontSize: 10, fontWeight: 800, background: "var(--rose)", color: "var(--ink)", border: "1.5px solid var(--ink)", borderRadius: 4, padding: "1px 6px" }}>{abs.type.replace('Demi-', '½ ')}</span>
                                ))}
                              </div>
                            )}
                            <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.65 }}>{bloc.debut} – {bloc.fin}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {absencesSel.length > 0 && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Événements</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {absencesSel.map((ev, idx) => {
                        const rot = idx % 2 === 0 ? 1.2 : -0.8;
                        const membresEv = ev.membres.length > 0 ? activeEquipe.filter(m => ev.membres.includes(m.id)) : [];
                        return (
                          <div key={ev.id || idx}
                            onClick={() => { ouvrirEditionEvenement(ev, 'single'); setSelectedDay(null); }}
                            style={{ background: getEventColor(ev.type), border: "2.5px solid var(--ink)", borderRadius: 10, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 5, boxShadow: "3px 3px 0 var(--ink)", transform: `rotate(${rot}deg)`, cursor: "pointer" }}>
                            {membresEv.length > 0 && (
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "flex-end" }}>
                                {membresEv.map((m, mIdx) => {
                                  const tilt = (((m.nom.charCodeAt(0) + mIdx * 7) % 9) - 4) * 0.8;
                                  return (
                                    <span key={m.id} className="bc" style={{ fontSize: 22, lineHeight: 1, display: "inline-block", flexShrink: 0, color: getMemberColor({ groupe: m.groupe, couleur: m.horaires?.couleur }), WebkitTextStroke: "1.5px var(--ink)", filter: "drop-shadow(1.5px 1.5px 0 #0d0d0d)", transform: `rotate(${tilt}deg)` }}>
                                      {m.nom.trim()[0].toUpperCase()}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                            <span style={{ fontWeight: 900, fontSize: 14, lineHeight: 1.2 }}>{getEventIcon(ev.type)} {ev.type}</span>
                            {ev.titre && ev.titre !== ev.type && <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.75 }}>{ev.titre}</span>}
                            {ev.heure_debut && <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.65 }}>{ev.heure_debut} – {ev.heure_fin}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {specialEvsSel.length > 0 && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Événements spéciaux</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {specialEvsSel.map((ev, idx) => {
                        const rot = idx % 2 === 0 ? -1 : 1.5;
                        const membresEv = ev.membres.length > 0 ? activeEquipe.filter(m => ev.membres.includes(m.id)) : [];
                        return (
                          <div key={ev.id || idx}
                            onClick={() => { ouvrirEditionEvenement(ev, 'single'); setSelectedDay(null); }}
                            style={{ background: getEventColor(ev.type), border: "2.5px solid var(--ink)", borderRadius: 10, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 5, boxShadow: "3px 3px 0 var(--ink)", transform: `rotate(${rot}deg)`, cursor: "pointer" }}>
                            {membresEv.length > 0 && (
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "flex-end" }}>
                                {membresEv.map((m, mIdx) => {
                                  const tilt = (((m.nom.charCodeAt(0) + mIdx * 7) % 9) - 4) * 0.8;
                                  return (
                                    <span key={m.id} className="bc" style={{ fontSize: 22, lineHeight: 1, display: "inline-block", flexShrink: 0, color: getMemberColor({ groupe: m.groupe, couleur: m.horaires?.couleur }), WebkitTextStroke: "1.5px var(--ink)", filter: "drop-shadow(1.5px 1.5px 0 #0d0d0d)", transform: `rotate(${tilt}deg)` }}>
                                      {m.nom.trim()[0].toUpperCase()}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                            <span style={{ fontWeight: 900, fontSize: 14, lineHeight: 1.2 }}>{getEventIcon(ev.type)} {ev.titre}</span>
                            {ev.heure_debut && <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.65 }}>{ev.heure_debut} – {ev.heure_fin}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {isEmpty && (
                  <div style={{ textAlign: "center", padding: "30px 0", color: "rgba(0,0,0,0.35)", fontSize: 13, fontWeight: 600 }}>
                    Aucune activité ce jour
                  </div>
                )}

                <button
                  onClick={() => {
                    setNouvelEvent({ ...eventParDefaut, date_debut: selectedDay, date_fin: selectedDay });
                    setEditMode('single');
                    setRep({ active: false, interval: 1, period: 'weeks', date_limite: format(addMonths(new Date(), 1), 'yyyy-MM-dd'), rotation: false });
                    setSelectedDay(null);
                    setShowEventModal(true);
                  }}
                  className="pop-btn pop-btn-dark"
                  style={{ width: "100%", justifyContent: "center", fontSize: 13 }}>
                  + Ajouter un événement
                </button>
              </div>
              </div>
            </div>
          </div>
        );
      })()}

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
                  {(['Congé', 'RTT', 'Récupération', 'Formation'] as const).map(base => {
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