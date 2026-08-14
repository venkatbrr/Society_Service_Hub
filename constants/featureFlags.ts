/**
 * MCN surface flags.
 *
 * Both features below are **fully built and fully intact** — screens, tables,
 * RLS policies, RPCs, curated data and existing rows are all untouched. Only
 * the entry points that surface them are hidden, so the MCN hub advertises
 * only what the pilot communities are actively using.
 *
 * Flip a flag to `true` to bring the feature back; nothing else needs
 * changing. Full inventory of what each flag hides, and the re-enable
 * checklist, is in `docs/hidden-features/mcn-schools-and-borrow.md`.
 */

/** Schools catalog & compare — `app/mcn/schools/*`. */
export const SCHOOLS_CATALOG_ENABLED = false;

/** Borrow & share posts — `app/mcn/add.tsx` + the My Submissions borrow tab. */
export const BORROW_SHARE_ENABLED = false;

/**
 * True when at least one MCN section is hidden, i.e. the hub should render the
 * "more on the way" teaser card in place of the missing sections.
 */
export const HAS_HIDDEN_MCN_SECTIONS = !SCHOOLS_CATALOG_ENABLED || !BORROW_SHARE_ENABLED;

/**
 * "Most ordered" sort on the pre-order food catalog — `app/mcn/drops/index.tsx`.
 *
 * Built and working: `get_mcn_drop_order_counts` is deployed and the sort
 * comparator is live, the option is simply not offered yet. Flip to `true` to
 * put it back in the sort sheet; nothing else needs changing.
 *
 * The counts themselves are **not** behind this flag — the "spots still left"
 * filter reads them too, so the RPC call stays unconditional.
 */
export const DROP_SORT_MOST_ORDERED_ENABLED = false;
