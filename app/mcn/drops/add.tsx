import { Calendar } from '@untitledui/icons/Calendar';
import { Clock } from '@untitledui/icons/Clock';
import { Sun } from '@untitledui/icons/Sun';
import { Plus } from '@untitledui/icons/Plus';
import { ShoppingBag01 } from '@untitledui/icons/ShoppingBag01';
import { Trash01 } from '@untitledui/icons/Trash01';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { goBackSmart, replaceTracked } from '../../../lib/navigation';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { DietDot } from '../../../components/DietDot';
import { DropDateTimeRow } from '../../../components/DropDateTimeRow';
import { ImageUploader } from '../../../components/ImageUploader';
import { Verandah } from '../../../constants/Colors';
import { DIET_META, DIET_TYPES, DietType } from '../../../constants/diet';
import { MEAL_META, MEAL_TYPES, MealType, suggestMealFromTime } from '../../../constants/meal';
import { VerandahBorder, VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../../../constants/Verandah';
import { useAuth } from '../../../context/AuthContext';
import { DropDraftError, loadDraftFromDrop } from '../../../lib/dropDraft';
import {
    formatDateStr,
    formatTimeStr,
    LoadedDropSchedule,
    normalizeFulfillmentTime,
    validateDropSchedule,
} from '../../../lib/dropSchedule';
import { buildMcnHeaderOptions } from '../../../lib/mcnHeader';
import { supabase } from '../../../lib/supabase';

export type UnitOption = '250g' | '500g' | 'piece' | 'kg' | 'box' | 'pack' | 'portion' | 'litre';

interface ItemForm {
  id: string;
  name: string;
  unit: UnitOption;
  price: string;
  description: string;
  image_url?: string | null;
  max_quantity?: string;
  diet_type: DietType;
}

const UNIT_OPTIONS: UnitOption[] = [
  '250g',
  '500g',
  'piece',
  'kg',
  'portion',
  'box',
  'pack',
  'litre',
];

export default function CreateOrEditFoodDropScreen() {
  // `dropId` edits that drop in place. `fromDropId` copies it into a brand new
  // one ("Republish") — a different operation, and deliberately a different
  // param, so nothing downstream can mistake a duplicate for an edit.
  const { dropId, fromDropId } = useLocalSearchParams<{ dropId?: string; fromDropId?: string }>();
  const router = useRouter();
  const { user, communityId } = useAuth();
  const colors = Verandah;

  // Drop Details
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fulfillmentDate, setFulfillmentDate] = useState(''); // YYYY-MM-DD
  const [fulfillmentTime, setFulfillmentTime] = useState('13:00'); // HH:mm
  const [cutoffDate, setCutoffDate] = useState(''); // YYYY-MM-DD
  const [cutoffTime, setCutoffTime] = useState('21:00'); // HH:mm (e.g. 21:00 for 9 PM)
  const [mealType, setMealType] = useState<MealType>('lunch');

  // The meal follows the delivery time until the host picks one themselves.
  // Most drops are the obvious meal for their slot, so tracking a live guess
  // saves a tap — but once the host has said "this is a snack", moving the
  // time must not silently overrule them.
  const mealTouchedRef = React.useRef(false);

  useEffect(() => {
    if (mealTouchedRef.current) return;
    setMealType(suggestMealFromTime(fulfillmentTime));
  }, [fulfillmentTime]);



  // Field validation errors
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: boolean }>({});
  const [itemErrors, setItemErrors] = useState<{ [id: string]: { name?: boolean; price?: boolean; max_quantity?: boolean } }>({});

  // Items
  const [items, setItems] = useState<ItemForm[]>([
    { id: '1', name: '', unit: 'piece', price: '', description: '', image_url: null, max_quantity: '', diet_type: 'veg' },
  ]);

  const [loadingDrop, setLoadingDrop] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // The schedule the drop was loaded with, in edit mode. A drop that has been
  // sitting open past its own cut-off must stay editable (the host may only
  // want to fix a typo), so the "no past times" rule is enforced against the
  // values the host actually changed.
  const [loadedSchedule, setLoadedSchedule] = useState<LoadedDropSchedule | null>(null);

  const isEditMode = !!dropId;
  // A duplicate is a create, not an edit: `isEditMode` stays false, and
  // `loadedSchedule` stays null so both timestamps are checked against now().
  const isDuplicateMode = !dropId && !!fromDropId;

  // Today's local calendar day — the floor for every date picker on this form.
  const todayStr = formatDateStr(new Date());

  useEffect(() => {
    // Set default dates if creating new drop. formatDateStr (local calendar
    // day) rather than toISOString — the UTC day is behind the IST day before
    // 5:30 AM, which would seed a cut-off date that is already in the past.
    if (!dropId) {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      setCutoffDate(formatDateStr(now));
      setFulfillmentDate(formatDateStr(tomorrow));
    }

  }, [dropId]);

  // Load existing drop data if in Edit Mode
  const fetchDropForEdit = useCallback(async () => {
    if (!dropId) return;
    setLoadingDrop(true);
    try {
      const { data: dropData, error: dropErr } = await supabase
        .from('mcn_preorder_drops')
        .select('*')
        .eq('id', dropId)
        .maybeSingle();

      if (dropErr) throw dropErr;

      if (dropData) {
        if (dropData.status === 'completed' || dropData.status === 'closed') {
          Toast.show({
            type: 'error',
            text1: 'Menu cannot be edited',
            text2: 'Completed or closed menus cannot be edited.',
          });
          router.back();
          return;
        }

        const loadedFulfillmentDate = dropData.fulfillment_date || '';
        const loadedFulfillmentTime = normalizeFulfillmentTime(dropData.fulfillment_time || '13:00');

        setTitle(dropData.title || '');
        setDescription(dropData.description || '');
        setImageUrl(dropData.image_url || null);
        setFulfillmentDate(loadedFulfillmentDate);
        setFulfillmentTime(loadedFulfillmentTime);

        // An existing drop already has a host-chosen meal — treat it as
        // touched so loading the form does not re-guess over their answer.
        mealTouchedRef.current = true;
        setMealType((dropData.meal_type as MealType) || suggestMealFromTime(loadedFulfillmentTime));

        let loadedCutoffDate = '';
        let loadedCutoffTime = '';
        if (dropData.cutoff_at) {
          const cutoffObj = new Date(dropData.cutoff_at);
          // formatDateStr, not toISOString — the date and the time below must
          // come from the same (local) clock or they describe different moments.
          loadedCutoffDate = formatDateStr(cutoffObj);
          loadedCutoffTime = formatTimeStr(cutoffObj);
          setCutoffDate(loadedCutoffDate);
          setCutoffTime(loadedCutoffTime);
        }

        setLoadedSchedule({
          cutoffDate: loadedCutoffDate,
          cutoffTime: loadedCutoffTime,
          fulfillmentDate: loadedFulfillmentDate,
          fulfillmentTime: loadedFulfillmentTime,
        });
      }

      // Load items
      const { data: itemsData, error: itemsErr } = await supabase
        .from('mcn_preorder_items')
        .select('*')
        .eq('drop_id', dropId);

      if (itemsErr) throw itemsErr;

      if (itemsData && itemsData.length > 0) {
        // Deduplicate items by signature when loading into edit form
        const uniqueItemsMap = new Map<string, any>();
        itemsData.forEach((item: any) => {
          const key = `${item.name?.trim().toLowerCase()}_${item.unit}_${item.price}`;
          if (!uniqueItemsMap.has(key)) {
            uniqueItemsMap.set(key, item);
          }
        });
        const itemsToLoad = Array.from(uniqueItemsMap.values());

        setItems(
          itemsToLoad.map((item: any) => ({
            id: item.id,
            name: item.name,
            unit: item.unit || 'piece',
            price: String(item.price),
            description: item.description || '',
            image_url: item.image_url || null,
            max_quantity: item.max_quantity ? String(item.max_quantity) : '',
            diet_type: (item.diet_type as DietType) || 'veg',
          }))
        );
      }
    } catch (err) {
      console.error('Error loading drop for editing:', err);
      Toast.show({ type: 'error', text1: 'Failed to load menu for editing' });
    } finally {
      setLoadingDrop(false);
    }
  }, [dropId, router]);

  useEffect(() => {
    fetchDropForEdit();
  }, [fetchDropForEdit]);

  // "Republish": copy an existing drop's menu into a fresh, unpublished form.
  // Everything about what is sold is carried over; nothing about when. The
  // schedule fields keep their seeded defaults (today / tomorrow) so the host
  // has to answer the only two questions that actually change between runs.
  const loadDuplicateDraft = useCallback(async () => {
    if (!fromDropId || dropId) return;
    setLoadingDrop(true);
    try {
      const draft = await loadDraftFromDrop(fromDropId);

      setTitle(draft.title);
      setDescription(draft.description);
      setImageUrl(draft.imageUrl);
      setItems(draft.items as any);

      // The source drop already carries a host-chosen meal — mark it touched so
      // picking a delivery time does not re-guess over their answer.
      mealTouchedRef.current = true;
      setMealType(draft.mealType);

      if (draft.defaultFulfillmentTime) setFulfillmentTime(draft.defaultFulfillmentTime);
      if (draft.defaultCutoffTime) setCutoffTime(draft.defaultCutoffTime);

      Toast.show({
        type: 'info',
        text1: 'Menu copied',
        text2: 'Set a new closing and delivery time, then publish.',
      });
    } catch (err: any) {
      console.error('Error copying drop:', err);
      Toast.show({
        type: 'error',
        text1: 'Could not copy that menu',
        text2: err instanceof DropDraftError ? err.message : err?.message,
      });
      router.back();
    } finally {
      setLoadingDrop(false);
    }
  }, [fromDropId, dropId, router]);

  useEffect(() => {
    loadDuplicateDraft();
  }, [loadDuplicateDraft]);

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { id: String(Date.now()), name: '', unit: 'piece', price: '', description: '', image_url: null, max_quantity: '', diet_type: 'veg' },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length <= 1) {
      Toast.show({ type: 'error', text1: 'At least one menu item is required' });
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleItemChange = (id: string, field: keyof ItemForm, value: any) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
    if (itemErrors[id]?.[field as 'name' | 'price' | 'max_quantity']) {
      setItemErrors((prev) => ({
        ...prev,
        [id]: { ...prev[id], [field]: false },
      }));
    }
  };

  const handleSubmit = async () => {
    if (!user?.id || !communityId) {
      Toast.show({ type: 'error', text1: 'Missing community / user authentication' });
      return;
    }

    const errors: { [key: string]: boolean } = {};
    const newItemErrors: { [id: string]: { name?: boolean; price?: boolean; max_quantity?: boolean } } = {};

    if (!title.trim()) {
      errors.title = true;
    }

    let hasItemError = false;
    items.forEach((item) => {
      const err: { name?: boolean; price?: boolean; max_quantity?: boolean } = {};
      if (!item.name.trim()) {
        err.name = true;
        hasItemError = true;
      }
      const p = parseFloat(item.price);
      if (!item.price.trim() || isNaN(p) || p <= 0) {
        err.price = true;
        hasItemError = true;
      }
      const rawCap = String(item.max_quantity ?? '').trim();
      if (rawCap) {
        const cap = Number(rawCap);
        if (!Number.isInteger(cap) || cap <= 0) {
          err.max_quantity = true;
          hasItemError = true;
        }
      }
      if (err.name || err.price || err.max_quantity) {
        newItemErrors[item.id] = err;
      }
    });

    setFieldErrors(errors);
    setItemErrors(newItemErrors);

    if (errors.title) {
      Toast.show({ type: 'error', text1: 'Please enter a menu title' });
      return;
    }

    // A drop scheduled in the past is dead on arrival: place_mcn_preorder
    // rejects every order once cutoff_at <= now(). `loadedSchedule` is null for
    // create and duplicate, so both timestamps are checked against now() there;
    // in edit mode only the values the host actually changed are.
    const schedule = validateDropSchedule({
      cutoffDate,
      cutoffTime,
      fulfillmentDate,
      fulfillmentTime,
      loadedSchedule,
    });

    if (!schedule.ok) {
      setFieldErrors((prev) => ({ ...prev, ...schedule.fieldErrors }));
      Toast.show({ type: 'error', text1: schedule.text1, text2: schedule.text2 });
      return;
    }

    const cutoffAtObj = schedule.cutoffAt;

    if (hasItemError) {
      Toast.show({
        type: 'error',
        text1: 'Please fill all mandatory item fields',
        text2: 'Each item requires a name and a valid positive price.',
      });
      return;
    }

    const validItems = items.filter((i) => i.name.trim() && i.price.trim());

    setSubmitting(true);
    try {
      if (isEditMode && dropId) {
        // --- EDIT MODE ---
        // 1. Update drop details
        const { error: updateErr } = await supabase
          .from('mcn_preorder_drops')
          .update({
            title: title.trim(),
            description: description.trim() || null,
            image_url: imageUrl,
            fulfillment_date: fulfillmentDate.trim(),
            fulfillment_time: fulfillmentTime.trim(),
            meal_type: mealType,
            cutoff_at: cutoffAtObj.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', dropId);

        if (updateErr) throw updateErr;

        // 2. Refresh items: Upsert existing items and delete unused ones safely
        const { data: existingDbItems } = await supabase
          .from('mcn_preorder_items')
          .select('id')
          .eq('drop_id', dropId);

        const existingDbIds = (existingDbItems || []).map((i: any) => i.id);
        const currentFormIds = validItems.map((i) => i.id).filter((id) => existingDbIds.includes(id));
        const idsToDelete = existingDbIds.filter((id: string) => !currentFormIds.includes(id));

        // Removing an item residents have already pre-ordered is refused by
        // prevent_mcn_item_delete_with_orders. Surface that instead of
        // reporting success on a change the database rejected.
        if (idsToDelete.length > 0) {
          for (const delId of idsToDelete) {
            const { error: delErr } = await supabase
              .from('mcn_preorder_items')
              .delete()
              .eq('id', delId);

            if (delErr) throw delErr;
          }
        }

        // Upsert current items
        for (const item of validItems) {
          const isExisting = existingDbIds.includes(item.id);
          const itemPayload: any = {
            drop_id: dropId,
            name: item.name.trim(),
            unit: item.unit,
            price: parseFloat(item.price),
            description: item.description.trim() || null,
            image_url: item.image_url || null,
            max_quantity: item.max_quantity ? parseInt(String(item.max_quantity), 10) : null,
            diet_type: item.diet_type || 'veg',
          };

          // Lowering max_quantity below what is already pre-ordered is refused
          // by enforce_mcn_item_max_quantity_floor — that error must reach the
          // host rather than being swallowed under a success toast.
          if (isExisting) {
            itemPayload.id = item.id;
            const { error: upsertErr } = await supabase
              .from('mcn_preorder_items')
              .upsert(itemPayload);

            if (upsertErr) throw upsertErr;
          } else {
            const { error: insertErr } = await supabase
              .from('mcn_preorder_items')
              .insert(itemPayload);

            if (insertErr) throw insertErr;
          }
        }

        Toast.show({
          type: 'success',
          text1: 'Menu updated successfully!',
        });

        router.back();
      } else {
        // --- CREATE MODE ---
        // 1. Insert drop
        const { data: dropData, error: dropErr } = await supabase
          .from('mcn_preorder_drops')
          .insert({
            community_id: communityId,
            listing_id: null,
            created_by: user.id,
            title: title.trim(),
            description: description.trim() || null,
            image_url: imageUrl,
            fulfillment_date: fulfillmentDate.trim(),
            fulfillment_time: fulfillmentTime.trim(),
            meal_type: mealType,
            cutoff_at: cutoffAtObj.toISOString(),

            status: 'open',
          })
          .select()
          .single();

        if (dropErr) throw dropErr;

        // 2. Insert items
        const itemsPayload = validItems.map((item) => ({
          drop_id: dropData.id,
          name: item.name.trim(),
          unit: item.unit,
          price: parseFloat(item.price),
          description: item.description.trim() || null,
          image_url: item.image_url || null,
          max_quantity: item.max_quantity ? parseInt(String(item.max_quantity), 10) : null,
          diet_type: item.diet_type || 'veg',
        }));

        const { error: itemsErr } = await supabase
          .from('mcn_preorder_items')
          .insert(itemsPayload);

        if (itemsErr) throw itemsErr;

        Toast.show({
          type: 'success',
          text1: 'Menu published!',
          text2: 'Neighbors can now place pre-orders before it closes.',
        });

        replaceTracked(router, `/mcn/drops/${dropData.id}` as any);
      }
    } catch (err: any) {
      console.error(err);
      Toast.show({
        type: 'error',
        text1: isEditMode ? 'Failed to update menu' : 'Failed to publish menu',
        text2: err.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingDrop) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const handleBack = () => {
    goBackSmart(router, '/mcn/drops/add');
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.paper }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={buildMcnHeaderOptions({
          title: isEditMode ? 'Edit Pre-Order Food' : isDuplicateMode ? 'Republish Menu' : 'Host Pre-Order Food',
          onBack: handleBack,
        })}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Cover Photo Uploader */}
        <View style={styles.section}>
          <Text style={styles.label}>Menu Banner / Cover Photo (Optional)</Text>
          <ImageUploader
            currentImageUrl={imageUrl}
            onImageUploaded={setImageUrl}
            onImageRemoved={() => setImageUrl(null)}
            subfolder="drops"
            aspectRatio={16 / 9}
            placeholder="Add menu cover photo"
          />
        </View>

        {/* Drop Basics */}
        <View style={styles.section}>
          <Text style={styles.label}>Menu Title *</Text>
          <TextInput
            style={[styles.input, fieldErrors.title && styles.inputError]}
            placeholder="e.g. Saturday dinner special, Sunday dum biryani"
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={(txt) => {
              setTitle(txt);
              if (fieldErrors.title) setFieldErrors((prev) => ({ ...prev, title: false }));
            }}
            maxLength={80}
          />
          {fieldErrors.title ? <Text style={styles.errorText}>Please enter a menu title</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Description & Prep Note</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Describe the menu, ingredients, special instructions..."
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Delivery time */}
        <View style={styles.cardSection}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderTitleRow}>
              <Calendar size={16} color={Verandah.primary} aria-hidden={true} />
              <Text style={styles.cardSectionTitle}>Delivery time</Text>
            </View>
          </View>

          <View style={styles.cardBody}>
            <DropDateTimeRow
              dateLabel="Delivery date *"
              timeLabel="Delivery time *"
              dateValue={fulfillmentDate}
              timeValue={fulfillmentTime}
              // The delivery date can never precede the cut-off date, so the
              // cut-off is its floor once that is the later of the two.
              minDate={cutoffDate && cutoffDate > todayStr ? cutoffDate : todayStr}
              dateError={fieldErrors.fulfillmentDate}
              timeError={fieldErrors.fulfillmentTime}
              onDateChange={(value) => {
                setFulfillmentDate(value);
                if (fieldErrors.fulfillmentDate) setFieldErrors((prev) => ({ ...prev, fulfillmentDate: false }));
              }}
              onTimeChange={(value) => {
                setFulfillmentTime(value);
                if (fieldErrors.fulfillmentTime) setFieldErrors((prev) => ({ ...prev, fulfillmentTime: false }));
              }}
            />
          </View>
        </View>

        {/* Meal slot. Seeded from the delivery time above, but stored as the
            host's own answer — residents filter the catalog on it, and the
            clock cannot tell a late snack from an early dinner.
            It sits in its own card rather than tucked under the schedule
            fields: as a sub-label it was the one required choice a host could
            scroll past without noticing, because it was pre-filled and looked
            answered. A full section with its own title and full-width chips
            makes the wrong guess visible instead of silently shipping. */}
        <View style={styles.cardSection}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderTitleRow}>
              <Sun size={16} color={Verandah.primary} aria-hidden={true} />
              <Text style={styles.cardSectionTitle}>Which meal is this? *</Text>
            </View>
          </View>

          <View style={styles.cardBody}>
            <Text style={styles.cardSectionSub}>
              We pre-fill this from your delivery time. Change it if this is a late snack or an
              early dinner — residents filter the food list by meal.
            </Text>

            <View style={styles.mealPickerRow}>
              {MEAL_TYPES.map((m) => {
                const sel = mealType === m;
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.mealChip, sel && styles.mealChipSel]}
                    onPress={() => {
                      mealTouchedRef.current = true;
                      setMealType(m);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: sel }}
                    accessibilityLabel={`${MEAL_META[m].label} — ${MEAL_META[m].hint}`}
                  >
                    <Text style={[styles.mealChipText, sel && styles.mealChipTextSel]}>
                      {MEAL_META[m].label}
                    </Text>
                    <Text style={[styles.mealChipHint, sel && styles.mealChipHintSel]}>
                      {MEAL_META[m].hint}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {/* Pre-order closing time */}
        <View style={styles.cardSection}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderTitleRow}>
              <Clock size={16} color={Verandah.primary} aria-hidden={true} />
              <Text style={styles.cardSectionTitle}>Pre-order closing time</Text>
            </View>
          </View>

          <View style={styles.cardBody}>
            <Text style={styles.cardSectionSub}>
              Orders automatically close at this time so you can prepare ingredients.
            </Text>
            <DropDateTimeRow
              dateLabel="Closing date *"
              timeLabel="Closing time *"
              dateValue={cutoffDate}
              timeValue={cutoffTime}
              minDate={todayStr}
              dateError={fieldErrors.cutoffDate}
              timeError={fieldErrors.cutoffTime}
              onDateChange={(value) => {
                setCutoffDate(value);
                if (fieldErrors.cutoffDate) setFieldErrors((prev) => ({ ...prev, cutoffDate: false }));
              }}
              onTimeChange={(value) => {
                setCutoffTime(value);
                if (fieldErrors.cutoffTime) setFieldErrors((prev) => ({ ...prev, cutoffTime: false }));
              }}
            />
          </View>
        </View>

        {/* Drop Items Menu */}
        <View style={styles.cardSection}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderTitleRow}>
              <ShoppingBag01 size={16} color={Verandah.primary} aria-hidden={true} />
              <Text style={styles.cardSectionTitle}>Items offered for this menu</Text>
            </View>
            <TouchableOpacity style={styles.addItemBtn} onPress={handleAddItem}>
              <Plus size={15} color={colors.primary} aria-hidden={true} />
              <Text style={styles.addItemBtnText}>Add Item</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.cardBody}>

          {items.map((item, idx) => (
            <View key={item.id} style={styles.itemFormBox}>
              <View style={styles.itemFormHeader}>
                <Text style={styles.itemFormTitle}>Item #{idx + 1}</Text>
                {items.length > 1 ? (
                  <TouchableOpacity onPress={() => handleRemoveItem(item.id)}>
                    <Trash01 size={18} color={colors.danger} aria-hidden={true} />
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <ImageUploader
                  compact
                  currentImageUrl={item.image_url || null}
                  onImageUploaded={(url) => handleItemChange(item.id, 'image_url', url)}
                  onImageRemoved={() => handleItemChange(item.id, 'image_url', null)}
                  subfolder="drop_items"
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.subLabel}>Item Name *</Text>
                  <TextInput
                    style={[styles.input, itemErrors[item.id]?.name && styles.inputError]}
                    placeholder="e.g. Millet khichdi bowl"
                    placeholderTextColor={colors.textMuted}
                    value={item.name}
                    onChangeText={(txt) => handleItemChange(item.id, 'name', txt)}
                  />
                  {itemErrors[item.id]?.name ? (
                    <Text style={styles.errorText}>Item name required</Text>
                  ) : null}
                </View>
              </View>

              {/* Diet type — defaults to veg, so a host who never touches this
                  row publishes a veg menu. Residents filter the catalog on it,
                  so a wrong value here is worse than a missing photo. */}
              <View style={{ marginTop: 8 }}>
                <Text style={styles.subLabel}>Veg / Non-veg *</Text>
                <View style={styles.dietPickerRow}>
                  {DIET_TYPES.map((d) => {
                    const sel = item.diet_type === d;
                    const meta = DIET_META[d];
                    return (
                      <TouchableOpacity
                        key={d}
                        style={[
                          styles.dietChip,
                          sel && { backgroundColor: meta.color, borderColor: meta.color },
                        ]}
                        onPress={() => handleItemChange(item.id, 'diet_type', d)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: sel }}
                        accessibilityLabel={meta.label}
                      >
                        {sel ? null : <DietDot value={d} size={11} />}
                        <Text style={[styles.dietText, sel && styles.dietTextSel]}>{meta.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={[styles.row, { marginTop: 8 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subLabel}>Price (₹) *</Text>
                  <TextInput
                    style={[styles.input, itemErrors[item.id]?.price && styles.inputError]}
                    placeholder="350"
                    placeholderTextColor={colors.textMuted}
                    value={item.price}
                    onChangeText={(txt) => handleItemChange(item.id, 'price', txt)}
                    keyboardType="numeric"
                  />
                  {itemErrors[item.id]?.price ? (
                    <Text style={styles.errorText}>Valid price required</Text>
                  ) : null}
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.subLabel}>Unit *</Text>
                  <View style={styles.unitPickerRow}>
                    {UNIT_OPTIONS.map((u) => {
                      const sel = item.unit === u;
                      return (
                        <TouchableOpacity
                          key={u}
                          style={[styles.unitChip, sel && styles.unitChipSel]}
                          onPress={() => handleItemChange(item.id, 'unit', u)}
                        >
                          <Text style={[styles.unitText, sel && styles.unitTextSel]}>{u}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>

              <View style={[styles.row, { marginTop: 8 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subLabel}>Max quantity — total for all orders combined (optional)</Text>
                  <TextInput
                    style={[styles.input, itemErrors[item.id]?.max_quantity && styles.inputError]}
                    placeholder="No limit"
                    placeholderTextColor={colors.textMuted}
                    value={item.max_quantity || ''}
                    onChangeText={(txt) => handleItemChange(item.id, 'max_quantity', txt)}
                    keyboardType="numeric"
                  />
                  {itemErrors[item.id]?.max_quantity ? (
                    <Text style={styles.errorText}>Enter a valid number above 0</Text>
                  ) : null}
                  <Text style={styles.hintText}>
                    This is the total you can prepare, shared across every resident's order — not a per-order limit.
                  </Text>
                </View>
              </View>
            </View>
          ))}
          </View>
        </View>

        {/* Submit CTA */}
        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitBtnText}>
              {isEditMode ? 'Save Menu Changes' : 'Publish Menu to Community'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  cardSectionSub: {
    fontSize: 13,
    color: Verandah.textSecondary,
    marginBottom: 8,
  },
  mealPickerRow: {
    flexDirection: 'row',
    gap: 6,
  },
  mealChip: {
    flex: 1,
    flexBasis: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 9,
    borderRadius: VerandahRadius.md,
    backgroundColor: '#FFFFFF',
    borderWidth: VerandahBorder.control,
    borderColor: '#D1D5DB',
  },
  mealChipSel: {
    backgroundColor: Verandah.primary,
    borderColor: Verandah.primary,
  },
  mealChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Verandah.textSecondary,
    textAlign: 'center',
  },
  mealChipTextSel: {
    color: '#FFFFFF',
  },
  mealChipHint: {
    fontSize: 10,
    color: Verandah.textMuted,
    marginTop: 1,
    textAlign: 'center',
  },
  mealChipHintSel: {
    color: 'rgba(255, 255, 255, 0.75)',
  },
  container: {
    flex: 1,
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 0,
    paddingBottom: 24,
  },
  section: {
    marginBottom: 10,
  },
  label: {
    ...VerandahType.bodyBold,
    fontSize: 14,
    color: Verandah.textPrimary,
    marginBottom: 4,
  },
  subLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: Verandah.textSecondary,
    marginBottom: 2,
  },
  hintText: {
    fontSize: 12,
    color: Verandah.textMuted,
    marginTop: 3,
    lineHeight: 16,
  },
  input: {
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    color: Verandah.textPrimary,
  },
  inputError: {
    borderColor: '#DC2626',
    borderWidth: 1,
    backgroundColor: '#FEF2F2',
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    marginTop: 3,
    fontWeight: '500',
  },
  multiline: {
    minHeight: 52,
  },
  cardSection: {
    backgroundColor: Verandah.card,
    borderWidth: 1,
    borderColor: '#CBE5D9',
    borderRadius: VerandahRadius.md,
    overflow: 'hidden',
    marginBottom: 12,
  },
  cardHeader: {
    backgroundColor: '#D8EFE4',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#C2E2D2',
  },
  cardHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardSectionTitle: {
    ...VerandahType.title,
    fontSize: 14,
    fontWeight: '700',
    color: Verandah.primary,
  },
  cardBody: {
    padding: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A8D6C0',
  },
  addItemBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Verandah.primary,
  },
  itemFormBox: {
    backgroundColor: '#F9FAFB',
    borderWidth: 0.5,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  itemFormHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemFormTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  unitPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  dietPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  dietChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: VerandahRadius.pill,
    backgroundColor: '#FFFFFF',
    borderWidth: 0.5,
    borderColor: '#D1D5DB',
  },
  // Four chips sharing the row equally (`flex: 1` + `flexBasis: 0`), so the
  // meal picker reads as one deliberate control the width of the card rather
  // than four small pills the host's eye can skate over.
  dietText: {
    fontSize: 13,
    fontWeight: '600',
    color: Verandah.textSecondary,
  },
  dietTextSel: {
    color: '#FFFFFF',
  },
  unitChip: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 0.5,
    borderColor: '#D1D5DB',
  },
  unitChipSel: {
    backgroundColor: Verandah.accent,
    borderColor: Verandah.accent,
  },
  unitText: {
    fontSize: 12,
    fontWeight: '500',
    color: Verandah.textSecondary,
  },
  unitTextSel: {
    color: '#FFFFFF',
  },
  submitBtn: {
    backgroundColor: Verandah.accent,
    paddingVertical: 14,
    borderRadius: VerandahRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
