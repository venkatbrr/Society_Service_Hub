import { Calendar } from '@untitledui/icons/Calendar';
import { Clock } from '@untitledui/icons/Clock';
import { Plus } from '@untitledui/icons/Plus';
import { ShoppingBag01 } from '@untitledui/icons/ShoppingBag01';
import { Trash01 } from '@untitledui/icons/Trash01';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
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
import { ImageUploader } from '../../../components/ImageUploader';
import { Verandah } from '../../../constants/Colors';
import { DIET_META, DIET_TYPES, DietType } from '../../../constants/diet';
import { MEAL_META, MEAL_TYPES, MealType, suggestMealFromTime } from '../../../constants/meal';
import { VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../../../constants/Verandah';
import { useAuth } from '../../../context/AuthContext';
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
  const { dropId } = useLocalSearchParams<{ dropId?: string }>();
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


  // System Pickers State (Native iOS/Android)
  const [showFulfillDatePicker, setShowFulfillDatePicker] = useState(false);
  const [showFulfillTimePicker, setShowFulfillTimePicker] = useState(false);
  const [showCutoffDatePicker, setShowCutoffDatePicker] = useState(false);
  const [showCutoffTimePicker, setShowCutoffTimePicker] = useState(false);

  const parseDateStr = (str: string): Date => {
    if (!str) return new Date();
    const parts = str.split('-');
    if (parts.length === 3) {
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
    return new Date();
  };

  const formatDateStr = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const parseTimeStr = (str: string): Date => {
    const d = new Date();
    if (!str) return d;
    const parts = str.split(':');
    if (parts.length >= 2) {
      d.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
    }
    return d;
  };

  const formatTimeStr = (d: Date): string => {
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${mins}`;
  };

  const normalizeFulfillmentTime = (raw: string): string => {
    const trimmed = raw.trim();
    if (/^\d{2}:\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    const twelveHour = trimmed.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (twelveHour) {
      const hourRaw = parseInt(twelveHour[1], 10);
      const minuteRaw = parseInt(twelveHour[2], 10);
      const meridiem = twelveHour[3].toUpperCase();
      let hour24 = hourRaw % 12;
      if (meridiem === 'PM') {
        hour24 += 12;
      }
      return `${String(hour24).padStart(2, '0')}:${String(minuteRaw).padStart(2, '0')}`;
    }

    return '13:00';
  };

  const formatDisplayTime = (timeStr: string): string => {
    const parsed = parseTimeStr(timeStr);
    return parsed.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  };

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
  const [loadedSchedule, setLoadedSchedule] = useState<{
    cutoffDate: string;
    cutoffTime: string;
    fulfillmentDate: string;
    fulfillmentTime: string;
  } | null>(null);

  const isEditMode = !!dropId;

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
            text1: 'Drop cannot be edited',
            text2: 'Completed or closed food drops cannot be edited.',
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
      Toast.show({ type: 'error', text1: 'Failed to load drop for editing' });
    } finally {
      setLoadingDrop(false);
    }
  }, [dropId, router]);

  useEffect(() => {
    fetchDropForEdit();
  }, [fetchDropForEdit]);

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
  };

  const handleSubmit = async () => {
    if (!user?.id || !communityId) {
      Toast.show({ type: 'error', text1: 'Missing community / user authentication' });
      return;
    }

    if (!title.trim()) {
      Toast.show({ type: 'error', text1: 'Please enter a drop title' });
      return;
    }

    if (!fulfillmentDate || !fulfillmentTime) {
      Toast.show({ type: 'error', text1: 'Please set delivery date & time' });
      return;
    }

    if (!cutoffDate || !cutoffTime) {
      Toast.show({ type: 'error', text1: 'Please set pre-order cut-off date & time' });
      return;
    }

    const cutoffAtObj = new Date(`${cutoffDate}T${cutoffTime}:00`);
    const fulfillAtObj = new Date(`${fulfillmentDate}T${fulfillmentTime}:00`);

    if (isNaN(cutoffAtObj.getTime())) {
      Toast.show({ type: 'error', text1: 'Invalid cut-off deadline timestamp' });
      return;
    }

    if (isNaN(fulfillAtObj.getTime())) {
      Toast.show({ type: 'error', text1: 'Invalid delivery time timestamp' });
      return;
    }

    // A drop scheduled in the past is dead on arrival: place_mcn_preorder
    // rejects every order once cutoff_at <= now(). Refuse it here rather than
    // publishing a listing nobody can order from.
    const now = new Date();

    const cutoffChanged =
      !loadedSchedule ||
      loadedSchedule.cutoffDate !== cutoffDate ||
      loadedSchedule.cutoffTime !== cutoffTime;

    if (cutoffChanged && cutoffAtObj <= now) {
      Toast.show({
        type: 'error',
        text1: 'Cut-off must be in the future',
        text2: 'Pick a date and time from now onwards — neighbors need time to order.',
      });
      return;
    }

    const fulfillmentChanged =
      !loadedSchedule ||
      loadedSchedule.fulfillmentDate !== fulfillmentDate ||
      loadedSchedule.fulfillmentTime !== fulfillmentTime;

    if (fulfillmentChanged && fulfillAtObj <= now) {
      Toast.show({
        type: 'error',
        text1: 'Delivery time must be in the future',
        text2: 'Pick a date and time from now onwards.',
      });
      return;
    }

    if (fulfillAtObj <= cutoffAtObj) {
      Toast.show({
        type: 'error',
        text1: 'Delivery time must be after cut-off deadline',
        text2: 'Pre-orders must close before delivery begins.',
      });
      return;
    }

    // Validate Items
    const validItems = items.filter((i) => i.name.trim() && i.price.trim());
    if (validItems.length === 0) {
      Toast.show({
        type: 'error',
        text1: 'Add at least one complete item',
        text2: 'Each item requires a name and a valid price.',
      });
      return;
    }

    for (const item of validItems) {
      const p = parseFloat(item.price);
      if (isNaN(p) || p <= 0) {
        Toast.show({
          type: 'error',
          text1: `Invalid price for "${item.name}"`,
          text2: 'Price must be a positive number.',
        });
        return;
      }

      // Max quantity is optional, but a blank-or-valid rule is the only safe
      // one: 0 would publish an item nobody can ever order, and a non-numeric
      // entry reaches the insert as NaN.
      const rawCap = String(item.max_quantity ?? '').trim();
      if (rawCap) {
        const cap = Number(rawCap);
        if (!Number.isInteger(cap) || cap <= 0) {
          Toast.show({
            type: 'error',
            text1: `Invalid max quantity for "${item.name}"`,
            text2: 'Leave it blank for no limit, or enter a whole number above zero.',
          });
          return;
        }
      }
    }

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
          text1: 'Food drop updated successfully!',
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
          text1: 'Food drop published!',
          text2: 'Neighbors can now place pre-orders before the cut-off.',
        });

        replaceTracked(router, `/mcn/drops/${dropData.id}` as any);
      }
    } catch (err: any) {
      console.error(err);
      Toast.show({
        type: 'error',
        text1: isEditMode ? 'Failed to update food drop' : 'Failed to publish food drop',
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
          title: isEditMode ? 'Edit Pre-Order Food' : 'Host Pre-Order Food',
          onBack: handleBack,
        })}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Cover Photo Uploader */}
        <View style={styles.section}>
          <Text style={styles.label}>Drop Banner / Cover Photo (Optional)</Text>
          <ImageUploader
            currentImageUrl={imageUrl}
            onImageUploaded={setImageUrl}
            onImageRemoved={() => setImageUrl(null)}
            subfolder="drops"
            aspectRatio={16 / 9}
            placeholder="Add drop cover photo"
          />
        </View>

        {/* Drop Basics */}
        <View style={styles.section}>
          <Text style={styles.label}>Drop Title *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Saturday dinner special, Sunday dum biryani"
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={setTitle}
            maxLength={80}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Description & Prep Note</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Describe the drop, ingredients, special instructions..."
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Fulfillment Schedule */}
        <View style={styles.cardSection}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Calendar size={16} color={Verandah.primary} aria-hidden={true} />
            <Text style={styles.cardSectionTitle}>Delivery / Fulfillment Schedule</Text>
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.subLabel}>Fulfillment Date *</Text>
              {Platform.OS === 'web' ? (
                <input
                  type="date"
                  value={fulfillmentDate}
                  min={cutoffDate && cutoffDate > todayStr ? cutoffDate : todayStr}
                  onChange={(e) => setFulfillmentDate(e.target.value)}
                  style={{
                    height: 42,
                    borderRadius: 8,
                    border: `0.5px solid ${colors.borderHair}`,
                    padding: '0 10px',
                    fontSize: 14,
                    color: colors.textPrimary,
                    backgroundColor: colors.card,
                    fontFamily: 'inherit',
                  }}
                />
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.input, { justifyContent: 'center' }]}
                    onPress={() => setShowFulfillDatePicker(true)}
                  >
                    <Text style={{ fontSize: 14, color: colors.textPrimary }}>
                      {fulfillmentDate || 'Select Date'}
                    </Text>
                  </TouchableOpacity>
                  {showFulfillDatePicker && (
                    <DateTimePicker
                      value={parseDateStr(fulfillmentDate)}
                      mode="date"
                      display="default"
                      minimumDate={parseDateStr(
                        cutoffDate && cutoffDate > todayStr ? cutoffDate : todayStr
                      )}
                      onChange={(event: DateTimePickerEvent, date?: Date) => {
                        setShowFulfillDatePicker(Platform.OS === 'ios');
                        if (date) setFulfillmentDate(formatDateStr(date));
                      }}
                    />
                  )}
                </>
              )}
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.subLabel}>Delivery Time Slot *</Text>
              {Platform.OS === 'web' ? (
                <input
                  type="time"
                  value={fulfillmentTime}
                  onChange={(e) => setFulfillmentTime(e.target.value)}
                  style={{
                    height: 42,
                    borderRadius: 8,
                    border: `0.5px solid ${colors.borderHair}`,
                    padding: '0 10px',
                    fontSize: 14,
                    color: colors.textPrimary,
                    backgroundColor: colors.card,
                    fontFamily: 'inherit',
                  }}
                />
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.input, { justifyContent: 'center' }]}
                    onPress={() => setShowFulfillTimePicker(true)}
                  >
                    <Text style={{ fontSize: 14, color: colors.textPrimary }}>
                      {fulfillmentTime ? formatDisplayTime(fulfillmentTime) : 'Select Time'}
                    </Text>
                  </TouchableOpacity>
                  {showFulfillTimePicker && (
                    <DateTimePicker
                      value={parseTimeStr(fulfillmentTime)}
                      mode="time"
                      display="default"
                      onChange={(event: DateTimePickerEvent, date?: Date) => {
                        setShowFulfillTimePicker(Platform.OS === 'ios');
                        if (date) setFulfillmentTime(formatTimeStr(date));
                      }}
                    />
                  )}
                </>
              )}
            </View>
          </View>

          {/* Meal slot. Seeded from the delivery time above, but stored as the
              host's own answer — residents filter the catalog on it, and the
              clock cannot tell a late snack from an early dinner. */}
          <View style={{ marginTop: 10 }}>
            <Text style={styles.subLabel}>Which meal is this? *</Text>
            <View style={styles.dietPickerRow}>
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
                    accessibilityLabel={MEAL_META[m].label}
                  >
                    <Text style={[styles.dietText, sel && styles.dietTextSel]}>
                      {MEAL_META[m].label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.hintText}>
              Picked from your delivery time — change it if this is a late snack or an early dinner.
            </Text>
          </View>
        </View>

        {/* Cut-off Deadline */}
        <View style={styles.cardSection}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <Clock size={16} color={Verandah.primary} aria-hidden={true} />
            <Text style={styles.cardSectionTitle}>Pre-Order Cut-off Deadline</Text>
          </View>
          <Text style={styles.cardSectionSub}>
            Orders automatically close at this time so you can prepare ingredients.
          </Text>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.subLabel}>Cut-off Date *</Text>
              {Platform.OS === 'web' ? (
                <input
                  type="date"
                  value={cutoffDate}
                  min={todayStr}
                  onChange={(e) => setCutoffDate(e.target.value)}
                  style={{
                    height: 42,
                    borderRadius: 8,
                    border: `0.5px solid ${colors.borderHair}`,
                    padding: '0 10px',
                    fontSize: 14,
                    color: colors.textPrimary,
                    backgroundColor: colors.card,
                    fontFamily: 'inherit',
                  }}
                />
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.input, { justifyContent: 'center' }]}
                    onPress={() => setShowCutoffDatePicker(true)}
                  >
                    <Text style={{ fontSize: 14, color: colors.textPrimary }}>
                      {cutoffDate || 'Select Date'}
                    </Text>
                  </TouchableOpacity>
                  {showCutoffDatePicker && (
                    <DateTimePicker
                      value={parseDateStr(cutoffDate)}
                      mode="date"
                      display="default"
                      minimumDate={parseDateStr(todayStr)}
                      onChange={(event: DateTimePickerEvent, date?: Date) => {
                        setShowCutoffDatePicker(Platform.OS === 'ios');
                        if (date) setCutoffDate(formatDateStr(date));
                      }}
                    />
                  )}
                </>
              )}
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.subLabel}>Cut-off Time *</Text>
              {Platform.OS === 'web' ? (
                <input
                  type="time"
                  value={cutoffTime}
                  onChange={(e) => setCutoffTime(e.target.value)}
                  style={{
                    height: 42,
                    borderRadius: 8,
                    border: `0.5px solid ${colors.borderHair}`,
                    padding: '0 10px',
                    fontSize: 14,
                    color: colors.textPrimary,
                    backgroundColor: colors.card,
                    fontFamily: 'inherit',
                  }}
                />
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.input, { justifyContent: 'center' }]}
                    onPress={() => setShowCutoffTimePicker(true)}
                  >
                    <Text style={{ fontSize: 14, color: colors.textPrimary }}>
                      {cutoffTime || 'Select Time'}
                    </Text>
                  </TouchableOpacity>
                  {showCutoffTimePicker && (
                    <DateTimePicker
                      value={parseTimeStr(cutoffTime)}
                      mode="time"
                      display="default"
                      onChange={(event: DateTimePickerEvent, date?: Date) => {
                        setShowCutoffTimePicker(Platform.OS === 'ios');
                        if (date) setCutoffTime(formatTimeStr(date));
                      }}
                    />
                  )}
                </>
              )}
            </View>
          </View>

        </View>


        {/* Drop Items Menu */}
        <View style={styles.cardSection}>
          <View style={styles.itemsHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ShoppingBag01 size={16} color={Verandah.primary} aria-hidden={true} />
              <Text style={styles.cardSectionTitle}>Items offered for this drop</Text>
            </View>
            <TouchableOpacity style={styles.addItemBtn} onPress={handleAddItem}>
              <Plus size={16} color={colors.primary} aria-hidden={true} />
              <Text style={styles.addItemBtnText}>Add Item</Text>
            </TouchableOpacity>
          </View>

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
                    style={styles.input}
                    placeholder="e.g. Millet khichdi bowl"
                    placeholderTextColor={colors.textMuted}
                    value={item.name}
                    onChangeText={(txt) => handleItemChange(item.id, 'name', txt)}
                  />
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
                    style={styles.input}
                    placeholder="350"
                    placeholderTextColor={colors.textMuted}
                    value={item.price}
                    onChangeText={(txt) => handleItemChange(item.id, 'price', txt)}
                    keyboardType="numeric"
                  />
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
                    style={styles.input}
                    placeholder="No limit"
                    placeholderTextColor={colors.textMuted}
                    value={item.max_quantity || ''}
                    onChangeText={(txt) => handleItemChange(item.id, 'max_quantity', txt)}
                    keyboardType="numeric"
                  />
                  <Text style={styles.hintText}>
                    This is the total you can prepare, shared across every resident's order — not a per-order limit.
                  </Text>
                </View>
              </View>
            </View>
          ))}
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
              {isEditMode ? 'Save Food Drop Changes' : 'Publish Food Drop to Community'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 12,
    color: Verandah.textPrimary,
    marginBottom: 4,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: Verandah.textSecondary,
    marginBottom: 2,
  },
  hintText: {
    fontSize: 10,
    color: Verandah.textMuted,
    marginTop: 3,
    lineHeight: 13,
  },
  input: {
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: Verandah.textPrimary,
  },
  multiline: {
    minHeight: 52,
  },
  cardSection: {
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.md,
    padding: 10,
    marginBottom: 10,
  },
  cardSectionTitle: {
    ...VerandahType.title,
    fontSize: 13,
    color: Verandah.textPrimary,
    marginBottom: 2,
  },
  cardSectionSub: {
    fontSize: 11,
    color: Verandah.textSecondary,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  itemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  addItemBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Verandah.accent,
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
    fontSize: 12,
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
  mealChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: VerandahRadius.pill,
    backgroundColor: '#FFFFFF',
    borderWidth: 0.5,
    borderColor: '#D1D5DB',
  },
  mealChipSel: {
    backgroundColor: Verandah.primary,
    borderColor: Verandah.primary,
  },
  dietText: {
    fontSize: 11,
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
    fontSize: 10,
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
