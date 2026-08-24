import { DietType } from '../constants/diet';
import { MealType } from '../constants/meal';
import { formatTimeStr, normalizeFulfillmentTime } from './dropSchedule';
import { supabase } from './supabase';

/**
 * Turning an existing drop back into an unpublished draft, so a host who cooks
 * the same menu every week does not retype it every week.
 *
 * The draft carries everything about *what* is being sold and nothing about
 * *when*: the schedule is the one thing the host must answer again, and a
 * copied cut-off would be in the past by definition.
 */

export interface DropDraftItem {
  id: string;
  name: string;
  unit: string;
  price: string;
  description: string;
  image_url?: string | null;
  max_quantity?: string;
  diet_type: DietType;
}

export interface DropDraft {
  title: string;
  description: string;
  imageUrl: string | null;
  mealType: MealType;
  listingId: string | null;
  items: DropDraftItem[];
  /** The source drop's times of day — seeds the pickers; the dates do not. */
  defaultCutoffTime?: string;
  defaultFulfillmentTime?: string;
}

export class DropDraftError extends Error {}

/**
 * Build a draft from one of the host's own past drops.
 *
 * Refuses a drop that is hidden for review. Hiding force-closes a drop and
 * pulls it from the catalogue precisely so a lead can look at it; letting its
 * host republish byte-identical content — and re-broadcast it to the whole
 * community, since `on_drop_published` fires on every INSERT — would make
 * moderation one tap to undo.
 */
export async function loadDraftFromDrop(dropId: string): Promise<DropDraft> {
  const { data: drop, error: dropErr } = await supabase
    .from('mcn_preorder_drops')
    .select('*')
    .eq('id', dropId)
    .maybeSingle();

  if (dropErr) throw dropErr;
  if (!drop) throw new DropDraftError('That menu could not be found.');

  if (drop.flagged_for_review_at) {
    throw new DropDraftError('A menu hidden for review cannot be published again.');
  }

  const { data: itemRows, error: itemsErr } = await supabase
    .from('mcn_preorder_items')
    .select('*')
    .eq('drop_id', dropId);

  if (itemsErr) throw itemsErr;

  // Fresh client-side ids: these become brand new rows, and reusing the source
  // ids would make the edit path treat them as existing items to upsert.
  const items: DropDraftItem[] = (itemRows || []).map((item: any, index: number) => ({
    id: `draft-${index}-${Date.now()}`,
    name: item.name || '',
    unit: item.unit || 'piece',
    price: String(item.price ?? ''),
    description: item.description || '',
    image_url: item.image_url || null,
    // A total shared across every buyer, so it restarts at zero on a new drop.
    max_quantity: item.max_quantity ? String(item.max_quantity) : '',
    diet_type: (item.diet_type as DietType) || 'veg',
  }));

  if (items.length === 0) {
    throw new DropDraftError('That menu has no items left to copy.');
  }

  const defaultFulfillmentTime = normalizeFulfillmentTime(drop.fulfillment_time || '13:00');
  const defaultCutoffTime = drop.cutoff_at ? formatTimeStr(new Date(drop.cutoff_at)) : undefined;

  return {
    title: drop.title || '',
    description: drop.description || '',
    imageUrl: drop.image_url || null,
    mealType: (drop.meal_type as MealType) || 'lunch',
    listingId: drop.listing_id || null,
    items,
    defaultCutoffTime,
    defaultFulfillmentTime,
  };
}

/**
 * Publish a draft as a brand new drop.
 *
 * NOTE: the drop row and its items go in two statements, matching the existing
 * create path in `app/mcn/drops/add.tsx`. A failure between them leaves a
 * published, item-less drop that has already broadcast to the community —
 * folding both into one `SECURITY DEFINER` RPC is the real fix and is tracked
 * separately; this deliberately does not diverge from the path it mirrors.
 */
export async function publishDropFromDraft(params: {
  draft: DropDraft;
  communityId: string;
  userId: string;
  cutoffAt: Date;
  fulfillmentDate: string;
  fulfillmentTime: string;
}): Promise<string> {
  const { draft, communityId, userId, cutoffAt, fulfillmentDate, fulfillmentTime } = params;

  const { data: dropData, error: dropErr } = await supabase
    .from('mcn_preorder_drops')
    .insert({
      community_id: communityId,
      listing_id: draft.listingId,
      created_by: userId,
      title: draft.title,
      description: draft.description || null,
      image_url: draft.imageUrl,
      fulfillment_date: fulfillmentDate,
      fulfillment_time: fulfillmentTime,
      meal_type: draft.mealType,
      cutoff_at: cutoffAt.toISOString(),
      status: 'open',
    })
    .select()
    .single();

  if (dropErr) throw dropErr;

  const itemsPayload = draft.items.map((item) => ({
    drop_id: dropData.id,
    name: item.name.trim(),
    unit: item.unit,
    price: parseFloat(item.price),
    description: item.description.trim() || null,
    image_url: item.image_url || null,
    max_quantity: item.max_quantity ? parseInt(String(item.max_quantity), 10) : null,
    diet_type: item.diet_type || 'veg',
  }));

  const { error: itemsErr } = await supabase.from('mcn_preorder_items').insert(itemsPayload);
  if (itemsErr) throw itemsErr;

  return dropData.id;
}

/** A host may hold at most 3 drops open at once — `enforce_max_open_drops_per_host`. */
export const MAX_OPEN_DROPS_PER_HOST = 3;

/**
 * How many drops this host currently has open.
 *
 * The cap is a database trigger, so without this the 4th republish fails with a
 * raw Postgres exception after the host has already filled in a schedule.
 */
export async function countOpenDropsForHost(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('mcn_preorder_drops')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', userId)
    .eq('status', 'open')
    .gt('cutoff_at', new Date().toISOString());

  if (error) throw error;
  return count ?? 0;
}
