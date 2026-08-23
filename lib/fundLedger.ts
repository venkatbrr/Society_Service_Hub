import { Tables } from './database.types';

export type FundTransaction = Tables<'event_transactions'>;

/**
 * Mirrors the ledger's own flat ordering — `length(flat_number), flat_number`
 * in list_collection_targets_for_collector — so a flat sits in the same place
 * whether the list came out of Postgres or was grouped here on the client.
 * Ground-floor numbers (G1) sort ahead of 102 because they are shorter, which
 * is the order a collection sheet is read in.
 */
export const compareFlatNumbers = (a: string, b: string) => a.length - b.length || a.localeCompare(b);

export const getCreatedAtTime = (value: string | null) => (value ? new Date(value).getTime() : 0);

/**
 * NULL is not cash. Rows predating 20260919000000 — and any written by a client
 * on an older bundle — genuinely have no recorded method, and a treasurer
 * reconciling the cash box has to be able to see that gap rather than have it
 * quietly folded into the cash total.
 */
export const paymentMethodOf = (transaction: FundTransaction) =>
  ((transaction as any).payment_method as string | null) ?? null;

export const formatPaymentMethod = (value: string | null | undefined) => {
  if (value === 'cash') return 'Cash';
  if (value === 'online') return 'Online';
  return null;
};

/** 'unrecorded' is a first-class bucket, not an absence — see the column comment. */
export type MethodFilter = 'all' | 'cash' | 'online' | 'unrecorded';

export const methodBucketOf = (transaction: FundTransaction): Exclude<MethodFilter, 'all'> => {
  const method = paymentMethodOf(transaction);
  return method === 'cash' ? 'cash' : method === 'online' ? 'online' : 'unrecorded';
};

export const METHOD_FILTERS: { key: MethodFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'cash', label: 'Cash' },
  { key: 'online', label: 'Online' },
  { key: 'unrecorded', label: 'Not recorded' },
];

export const matchesMethod = (transaction: FundTransaction, filter: MethodFilter) =>
  filter === 'all' || methodBucketOf(transaction) === filter;

/** What the treasurer needs to reconcile: how much of it should be in hand. */
export const splitByMethod = (rows: FundTransaction[]) =>
  rows.reduce(
    (acc, row) => {
      acc[methodBucketOf(row)] += Number(row.amount);
      return acc;
    },
    { cash: 0, online: 0, unrecorded: 0 }
  );

export const countByMethod = (rows: FundTransaction[]) =>
  rows.reduce(
    (acc, row) => {
      acc[methodBucketOf(row)] += 1;
      acc.all += 1;
      return acc;
    },
    { all: 0, cash: 0, online: 0, unrecorded: 0 } as Record<MethodFilter, number>
  );

/**
 * Who handled the money. The sheet's literal 'Self' means the resident paid
 * directly rather than through a collector, which is worth showing as such —
 * it is the difference between "nobody collected this" and "we never captured
 * who did".
 */
export const collectedByOf = (transaction: FundTransaction) =>
  ((transaction as any).collected_by_name as string | null)?.trim() || null;

export const formatCollectedBy = (value: string | null) => {
  if (!value) return null;
  return value.toLowerCase() === 'self' ? 'paid directly' : `by ${value}`;
};

export const sponsorNameOf = (transaction: FundTransaction) =>
  ((transaction as any).sponsor_name as string | null) ?? null;

export const contributorFlatIdOf = (transaction: FundTransaction) =>
  ((transaction as any).contributor_flat_id as string | null) ?? null;

export type FlatMeta = { blockName: string | null; flatNumber: string };

export type ContributionGroup = {
  key: string;
  title: string;
  isBlock: boolean;
  rows: FundTransaction[];
  total: number;
};

/**
 * Contributions read the way the collection sheet does: one section per block,
 * flats in flat-number order inside it. Rows with no block — outside sponsors,
 * a member in a community with no flat inventory, or a flat archived after it
 * paid — fall into a trailing group rather than vanishing.
 */
export function groupContributionsByBlock(
  rows: FundTransaction[],
  flatMeta: Map<string, FlatMeta>
): ContributionGroup[] {
  const flatNumberOf = (transaction: FundTransaction) => {
    const flatId = contributorFlatIdOf(transaction);
    return (flatId ? flatMeta.get(flatId)?.flatNumber : '') ?? '';
  };
  const blockNameOf = (transaction: FundTransaction) => {
    const flatId = contributorFlatIdOf(transaction);
    return (flatId ? flatMeta.get(flatId)?.blockName : null) ?? null;
  };

  const byBlock = new Map<string, FundTransaction[]>();
  const unplaced: FundTransaction[] = [];

  rows.forEach((transaction) => {
    const blockName = blockNameOf(transaction);
    if (!blockName) {
      unplaced.push(transaction);
      return;
    }
    const existing = byBlock.get(blockName);
    if (existing) existing.push(transaction);
    else byBlock.set(blockName, [transaction]);
  });

  const groups = Array.from(byBlock.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([blockName, blockRows]) => ({
      key: blockName,
      title: `Block ${blockName}`,
      isBlock: true,
      rows: [...blockRows].sort((a, b) => compareFlatNumbers(flatNumberOf(a), flatNumberOf(b))),
    }));

  if (unplaced.length > 0) {
    // Flat-numbered rows still sort by flat; sponsors have nothing to sort by
    // and keep newest-first behind them.
    const withFlat = unplaced.filter((transaction) => flatNumberOf(transaction));
    const withoutFlat = unplaced.filter((transaction) => !flatNumberOf(transaction));

    groups.push({
      key: '__unplaced__',
      title: groups.length > 0 ? 'Other contributions' : 'All contributions',
      isBlock: false,
      rows: [
        ...withFlat.sort((a, b) => compareFlatNumbers(flatNumberOf(a), flatNumberOf(b))),
        ...withoutFlat.sort((a, b) => getCreatedAtTime(b.created_at) - getCreatedAtTime(a.created_at)),
      ],
    });
  }

  return groups.map((group) => ({
    ...group,
    total: group.rows.reduce((sum, row) => sum + Number(row.amount), 0),
  }));
}

export const buildFlatMeta = (flats: any[]) =>
  new Map<string, FlatMeta>(
    flats.map((flat) => [
      flat.id as string,
      {
        blockName: (flat.block_name as string | null) ?? null,
        flatNumber: ((flat.flat_number as string | null) ?? '').trim(),
      },
    ])
  );
