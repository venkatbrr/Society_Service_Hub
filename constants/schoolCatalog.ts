/**
 * Shared vocabulary for the schools catalog (`app/mcn/schools/*`).
 *
 * These lists used to be duplicated between the **read** screen (the board and
 * locality filter chips on `index.tsx`) and the **write** screen (the syllabus
 * picker on `add.tsx`), and they had drifted apart:
 *
 *   - the board chip read `Cambridge (CAIE)` and matched by substring, so it
 *     found only the 6 curated schools whose `syllabus` string happens to spell
 *     the board that exact way and missed the other 6 (`Cambridge`,
 *     `CBSE / Cambridge`, `CBSE, Cambridge (IGCSE)`);
 *   - the picker offered `Cambridge / IGCSE`, which matched neither;
 *   - the `Mokila` locality chip matched zero schools in
 *     `data/westHyderabadSchools.ts`, so selecting it always emptied the list;
 *   - `Ramachandrapuram` and `R C Puram` are the same place written two ways and
 *     a single substring could never cover both.
 *
 * So both screens now read from here, and every chip carries the list of
 * keywords that decides a match instead of matching on its own label.
 */

/** One filter chip plus the substrings that make a school match it. */
export interface CatalogFilterOption {
  /** Label shown on the chip, and the value stored in filter state. */
  label: string;
  /**
   * Lower-cased keywords tested against the school's field as whole words. A
   * school matches when ANY keyword is present. Empty means "match everything"
   * — that is the "All …" chip.
   *
   * Whole-word, not substring: plain `includes()` made `IB` match nothing at all
   * for the one school whose syllabus is exactly `"IB"` while any looser rule
   * risks `ICSE` matching `IGCSE`. See `matchesFilter`.
   */
  keywords: string[];
}

export const ALL_BOARDS = 'All Boards';
export const ALL_AREAS = 'All Areas';

/**
 * Curriculum boards. Keywords are checked against `school.syllabus`, which is a
 * free-text string in both the curated catalog and the `schools` table, and
 * routinely names more than one board ("CBSE, Cambridge (CAIE)").
 */
export const BOARD_FILTERS: CatalogFilterOption[] = [
  { label: ALL_BOARDS, keywords: [] },
  { label: 'CBSE', keywords: ['cbse'] },
  { label: 'ICSE', keywords: ['icse'] },
  { label: 'IB', keywords: ['ib', 'international baccalaureate'] },
  { label: 'Cambridge', keywords: ['cambridge', 'caie', 'igcse'] },
  { label: 'State Board', keywords: ['state board'] },
  { label: 'International', keywords: ['international', 'finnish'] },
  { label: 'Preschool', keywords: ['preschool', 'pre-school', 'daycare'] },
];

/**
 * Localities. Keywords are checked against `school.area_locality`, which is
 * often a compound ("Kollur / Patighanpur", "Isnapur (near Patancheru)"), so a
 * school can legitimately match more than one chip.
 *
 * The list covers every cluster that actually appears in
 * `data/westHyderabadSchools.ts`; re-derive it if the curated data changes.
 */
export const LOCALITY_FILTERS: CatalogFilterOption[] = [
  { label: ALL_AREAS, keywords: [] },
  { label: 'Kokapet', keywords: ['kokapet'] },
  { label: 'Kollur', keywords: ['kollur'] },
  { label: 'Tellapur', keywords: ['tellapur', 'osman nagar'] },
  { label: 'Nallagandla', keywords: ['nallagandla'] },
  { label: 'Gopanpally', keywords: ['gopanpally'] },
  { label: 'Financial District', keywords: ['financial district', 'nanakramguda', 'gachibowli'] },
  { label: 'Narsingi', keywords: ['narsingi'] },
  { label: 'Gandipet', keywords: ['gandipet'] },
  { label: 'Ameenpur', keywords: ['ameenpur'] },
  { label: 'Beeramguda', keywords: ['beeramguda'] },
  { label: 'Chandanagar', keywords: ['chandanagar'] },
  // "Madinaguda" and "Madeenaguda" are the same place, spelled both ways in the
  // curated data.
  { label: 'Madinaguda', keywords: ['madinaguda', 'madeenaguda', 'hafeezpet'] },
  // "R C Puram" and "Ramachandrapuram" are the same place; both spellings are in
  // the curated data, and no single substring covers both.
  { label: 'Ramachandrapuram', keywords: ['ramachandrapuram', 'r c puram', 'bhel'] },
  { label: 'Patancheru', keywords: ['patancheru', 'isnapur', 'muthangi'] },
];

/**
 * Board options offered when a resident adds a school. Deliberately the same
 * labels as `BOARD_FILTERS` (minus the "All" chip) plus a free-form escape
 * hatch, so a school a resident adds is always findable under the chip they
 * picked. `Other` matches no board chip by design — the resident is saying the
 * board is not one of these.
 */
export const SYLLABUS_OPTIONS: string[] = [
  ...BOARD_FILTERS.filter((b) => b.label !== ALL_BOARDS).map((b) => b.label),
  'Other',
];

/**
 * Facilities offered on the add form and compared side by side on
 * `compare.tsx`. One list, so a facility a resident ticks always has a row in
 * the comparison table. `Robotics Lab` was present in 19 curated schools with no
 * row to show it in until this list was shared.
 */
export const FACILITY_OPTIONS: string[] = [
  'Transport / Bus Service',
  'Playground',
  'Science Labs',
  'Smart Classes',
  'Library',
  'Computer Lab',
  'Robotics Lab',
  'Indoor Sports Arena',
  'Music & Art Studios',
  'Swimming Pool',
  'CCTV Surveillance',
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True when `value` contains any of `keywords` as a whole word. An empty list
 * matches everything.
 *
 * Whole-word matching is what makes `IB` find the school whose syllabus is the
 * bare string `"IB"` while keeping `ICSE` from matching `IGCSE`.
 */
export function matchesFilter(value: string | null | undefined, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const haystack = (value || '').toLowerCase();
  return keywords.some((k) => new RegExp(`\\b${escapeRegExp(k)}\\b`).test(haystack));
}

/** Looks a chip label back up in its option list. */
export function findFilter(options: CatalogFilterOption[], label: string): CatalogFilterOption | undefined {
  return options.find((o) => o.label === label);
}

/**
 * `NUMERIC(4,1)` on `schools.distance` — four significant digits, one after the
 * decimal point. Anything larger is rejected by Postgres with a numeric field
 * overflow, which the add form would otherwise surface as a generic failure.
 */
export const MAX_SCHOOL_DISTANCE_KM = 999.9;
