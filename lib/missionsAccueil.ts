/**
 * Une mission à plusieurs se valide personne par personne depuis l'accueil :
 * celui qui a validé ne la voit plus dans ses alertes, les autres si.
 *
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
  /** Assignés ayant validé leur part depuis l'accueil. */
  valide_par?: string[];
};

/** Validations encore valables : celles des membres toujours assignés. */
export const validations = (f: MissionAlerte) => (f.valide_par ?? []).filter(id => f.assignes.includes(id));

export function estMissionAlerte(f: MissionAlerte, equipeId?: string | null): boolean {
  return f.genre === "mission" && f.statut !== "fait" && f.priorite >= PRIORITE_ALERTE
    && Array.isArray(f.assignes) && f.assignes.length > 0
    && (equipeId === undefined || (!!equipeId && f.assignes.includes(equipeId) && !validations(f).includes(equipeId)));
}

/** Lien vers la fiche, ouverte directement sur la page Bureau. */
export const lienMission = (id: string) => `/reunion?fiche=${encodeURIComponent(id)}`;
