/**
 * Missions du Bureau remontées dans les alertes de l'accueil : priorité haute
 * (2) ou urgente (3), pas encore faites, et seulement chez les membres
 * assignés. Rien n'est copié dans `alertes` : l'alerte disparaît d'elle-même
 * quand la mission est faite, dépriorisée ou réassignée.
 */
export const PRIORITE_ALERTE = 2;

export type MissionAlerte = {
  id: string;
  genre: string;
  titre: string;
  description?: string | null;
  statut: string;
  priorite: number;
  deadline: string | null;
  assignes: string[];
};

export function estMissionAlerte(f: MissionAlerte, equipeId?: string | null): boolean {
  return f.genre === "mission" && f.statut !== "fait" && f.priorite >= PRIORITE_ALERTE
    && Array.isArray(f.assignes) && f.assignes.length > 0
    && (equipeId === undefined || (!!equipeId && f.assignes.includes(equipeId)));
}

/** Lien vers la fiche, ouverte directement sur la page Bureau. */
export const lienMission = (id: string) => `/reunion?fiche=${encodeURIComponent(id)}`;
