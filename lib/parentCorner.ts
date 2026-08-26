/**
 * Parent Corner grade ladder and intent matching.
 *
 * Parent Corner entries already carry `intents` — a parent stating what they
 * actually want (a carpool, a study group, a playdate). Until now that was only
 * a filter chip: the parent declared a need and then had to scroll a directory
 * and cold-call a stranger. These helpers turn the declaration into a match.
 *
 * Two things make matching possible:
 *
 *  1. `grade_level` — a numeric ladder beside the free-text `grade_class`, so
 *     "Class 7" and "Class 8" can be recognised as one year apart. See the
 *     migration `20260926000000_parent_corner_grade_level_and_matching.sql`;
 *     `parseGradeLevel` below mirrors the SQL parser used for backfill.
 *
 *  2. Per-intent rules — a study group needs the *same school*, a playdate
 *     needs a *similar age*. Matching everyone on everything produces noise.
 */

import { supabase } from './supabase';

export type InstitutionType = 'school' | 'college' | 'preschool';

export interface GradeOption {
  /** Stored in `mcn_parent_corner.grade_level`. */
  level: number;
  label: string;
}

/** -3 .. 0 — pre-school years. */
export const PRESCHOOL_GRADES: GradeOption[] = [
  { level: -3, label: 'Playgroup' },
  { level: -2, label: 'Nursery' },
  { level: -1, label: 'LKG' },
  { level: 0, label: 'UKG' },
];

/** 1 .. 12 — school classes. */
export const SCHOOL_GRADES: GradeOption[] = Array.from({ length: 12 }, (_, i) => ({
  level: i + 1,
  label: `Class ${i + 1}`,
}));

/** 13 .. 17 — college years, offset by 12 so the ladder stays monotonic. */
export const COLLEGE_GRADES: GradeOption[] = [
  { level: 13, label: '1st Year' },
  { level: 14, label: '2nd Year' },
  { level: 15, label: '3rd Year' },
  { level: 16, label: '4th Year' },
  { level: 17, label: '5th Year' },
];

export function gradeOptionsFor(institutionType: InstitutionType): GradeOption[] {
  if (institutionType === 'preschool') return PRESCHOOL_GRADES;
  if (institutionType === 'college') return COLLEGE_GRADES;
  return SCHOOL_GRADES;
}

export function gradeLevelLabel(level: number | null | undefined): string | null {
  if (level === null || level === undefined) return null;
  const all = [...PRESCHOOL_GRADES, ...SCHOOL_GRADES, ...COLLEGE_GRADES];
  return all.find((g) => g.level === level)?.label ?? null;
}

/**
 * Best-effort read of a free-text grade label. Mirrors
 * `public.parse_parent_corner_grade_level` so an entry typed before the picker
 * existed lands on the same rung as its backfilled row.
 *
 * Used to preselect the picker when editing; never to overrule an explicit pick.
 */
export function parseGradeLevel(
  gradeClass: string,
  institutionType: InstitutionType
): number | null {
  const text = (gradeClass || '').toLowerCase().trim();
  if (!text) return null;

  // Pre-school labels first: "LKG - A" has no useful digit, and "Nursery 2"
  // would otherwise read as Class 2.
  if (/playgroup|play group|play-group|pre[ -]?kg|pre[ -]?nursery/.test(text)) return -3;
  if (/nursery/.test(text)) return -2;
  if (/(^|[^a-z])lkg([^a-z]|$)|lower kg/.test(text)) return -1;
  if (/(^|[^a-z])ukg([^a-z]|$)|upper kg/.test(text)) return 0;

  const match = text.match(/([0-9]{1,2})/);
  if (!match) return null;
  const num = parseInt(match[1], 10);

  if (institutionType === 'college') {
    return num >= 1 && num <= 5 ? 12 + num : null;
  }
  return num >= 1 && num <= 12 ? num : null;
}

/**
 * Display labels for the stored intent ids. Kept here so the directory, the
 * add form and the match sheet cannot drift apart. The set is fixed by the
 * `mcn_parent_corner_intents_valid` check constraint.
 */
export const INTENT_LABELS: Record<string, string> = {
  carpool: 'Carpooling',
  study_group: 'Study Group',
  homework_help: 'Homework Help',
  school_info: 'School Info & Updates',
  activities: 'Sports / Activities Buddy',
  playdate: 'Playdate / Hangout',
  other: 'Other',
};

/**
 * Intents that only make sense between families at the *same institution* —
 * a carpool to a different school is not a carpool.
 */
const SCHOOL_BOUND_INTENTS = new Set(['carpool', 'study_group', 'homework_help', 'school_info']);

/**
 * Intents that turn on the child's *age*, not their school. Two 8-year-olds at
 * different schools are a fine playdate; a Class 2 and a Class 11 at the same
 * school are not.
 */
const AGE_BOUND_INTENTS = new Set(['playdate', 'activities']);

/** How many school years apart two children can be and still match. */
export const GRADE_BAND = 1;

export interface ParentCornerEntryLike {
  id: string;
  user_id: string;
  student_name: string;
  institution_type: string;
  school_name: string;
  school_catalog_id?: string | null;
  grade_class: string;
  grade_level?: number | null;
  parent_name: string;
  flat_number: string;
  contact_phone: string;
  intents: string[];
}

export interface ParentMatch extends ParentCornerEntryLike {
  /** Intents both entries asked for — what the match is actually *about*. */
  sharedIntents: string[];
  sameSchool: boolean;
  /** School years between the two children, when both are known. */
  gradeGap: number | null;
}

function normalizeSchool(name: string): string {
  return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isSameSchool(a: ParentCornerEntryLike, b: ParentCornerEntryLike): boolean {
  if (a.school_catalog_id && b.school_catalog_id) {
    return a.school_catalog_id === b.school_catalog_id;
  }
  return normalizeSchool(a.school_name) === normalizeSchool(b.school_name);
}

/**
 * Does this shared intent justify surfacing the pair?
 *
 * When a grade is unknown on either side — a legacy row the backfill could not
 * parse — age-bound intents fall back to the school check rather than dropping
 * the match silently.
 */
function intentQualifies(
  intent: string,
  sameSchool: boolean,
  gradeGap: number | null
): boolean {
  const gradeClose = gradeGap !== null && gradeGap <= GRADE_BAND;

  if (SCHOOL_BOUND_INTENTS.has(intent)) return sameSchool;
  if (AGE_BOUND_INTENTS.has(intent)) return gradeGap === null ? sameSchool : gradeClose;
  return sameSchool || gradeClose;
}

/** Best matches first: more shared intents, then same school, then closer in age. */
function scoreMatch(match: ParentMatch): number {
  return (
    match.sharedIntents.length * 100 +
    (match.sameSchool ? 20 : 0) +
    (match.gradeGap === null ? 0 : Math.max(0, 10 - match.gradeGap))
  );
}

export const MAX_MATCHES = 25;

/**
 * Find other children in the same community whose parents declared at least one
 * of the same intents, filtered by the per-intent rules above.
 *
 * Runs under the caller's own RLS — a Parent Corner row is already readable by
 * everyone in the community, so this needs no elevated privilege. Only the
 * notify step does.
 */
export async function findParentMatches(
  entry: ParentCornerEntryLike,
  communityId: string
): Promise<ParentMatch[]> {
  if (!entry.intents || entry.intents.length === 0) return [];

  const { data, error } = await supabase
    .from('mcn_parent_corner')
    .select(
      'id, user_id, student_name, institution_type, school_name, school_catalog_id, grade_class, grade_level, parent_name, flat_number, contact_phone, intents'
    )
    .eq('community_id', communityId)
    .neq('user_id', entry.user_id)
    .overlaps('intents', entry.intents)
    .limit(200);

  if (error) throw error;

  const matches: ParentMatch[] = [];

  for (const row of (data || []) as ParentCornerEntryLike[]) {
    const sameSchool = isSameSchool(entry, row);
    const gradeGap =
      entry.grade_level !== null &&
      entry.grade_level !== undefined &&
      row.grade_level !== null &&
      row.grade_level !== undefined
        ? Math.abs(entry.grade_level - row.grade_level)
        : null;

    const sharedIntents = (row.intents || []).filter(
      (i) => entry.intents.includes(i) && intentQualifies(i, sameSchool, gradeGap)
    );

    if (sharedIntents.length === 0) continue;

    matches.push({ ...row, sharedIntents, sameSchool, gradeGap });
  }

  return matches.sort((a, b) => scoreMatch(b) - scoreMatch(a)).slice(0, MAX_MATCHES);
}

/**
 * Notify the selected matches that a neighbour is looking for the same thing.
 *
 * The notification body is composed server-side from stored rows — see the
 * migration. Returns how many were actually sent: the RPC skips anyone who
 * muted the Parent Corner channel or was already nudged about this entry in the
 * last 30 days, so this can legitimately come back lower than requested.
 */
export async function notifyParentMatches(
  entryId: string,
  targetEntryIds: string[]
): Promise<number> {
  if (targetEntryIds.length === 0) return 0;

  const { data, error } = await supabase.rpc('notify_parent_corner_matches', {
    p_entry_id: entryId,
    p_target_entry_ids: targetEntryIds,
  });

  if (error) throw error;
  return (data as number) ?? 0;
}
