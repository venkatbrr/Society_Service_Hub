import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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
import { ImageUploader } from '../../../components/ImageUploader';
import { Verandah } from '../../../constants/Colors';
import { VerandahRadius, VerandahType } from '../../../constants/Verandah';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabase';

interface ItemForm {
  id: string;
  name: string;
  unit: 'piece' | 'kg' | 'box' | 'pack' | 'portion' | 'litre';
  price: string;
  description: string;
  image_url?: string | null;
}

const UNIT_OPTIONS: ('piece' | 'kg' | 'box' | 'pack' | 'portion' | 'litre')[] = [
  'piece',
  'box',
  'portion',
  'kg',
  'pack',
  'litre',
];

export default function CreateOrEditFoodDropScreen() {
  const { dropId } = useLocalSearchParams<{ dropId?: string }>();
  const router = useRouter();
  const { user, communityId } = useAuth();
  const colors = Verandah;

  const [myListings, setMyListings] = useState<{ id: string; name: string }[]>([]);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);

  // Drop Details
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fulfillmentDate, setFulfillmentDate] = useState(''); // YYYY-MM-DD
  const [fulfillmentTime, setFulfillmentTime] = useState('1:00 PM - 3:00 PM');
  const [cutoffDate, setCutoffDate] = useState(''); // YYYY-MM-DD
  const [cutoffTime, setCutoffTime] = useState('21:00'); // HH:mm (e.g. 21:00 for 9 PM)
  const [maxOrders, setMaxOrders] = useState('');

  // Items
  const [items, setItems] = useState<ItemForm[]>([
    { id: '1', name: '', unit: 'piece', price: '', description: '', image_url: null },
  ]);

  const [loadingDrop, setLoadingDrop] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isEditMode = !!dropId;

  useEffect(() => {
    // Set default dates if creating new drop
    if (!dropId) {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      setCutoffDate(todayStr);
      setFulfillmentDate(tomorrowStr);
    }

    // Fetch user's business listings
    async function loadListings() {
      if (!user?.id) return;
      const { data } = await supabase
        .from('mcn_listings')
        .select('id, name')
        .eq('owner_id', user.id);

      if (data && data.length > 0) {
        setMyListings(data);
        if (!dropId) setSelectedListingId(data[0].id);
      }
    }
    loadListings();
  }, [user?.id, dropId]);

  // Load existing drop data if in Edit Mode
  useEffect(() => {
    async function loadExistingDrop() {
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
          setTitle(dropData.title || '');
          setDescription(dropData.description || '');
          setImageUrl(dropData.image_url || null);
          setFulfillmentDate(dropData.fulfillment_date || '');
          setFulfillmentTime(dropData.fulfillment_time || '');
          setSelectedListingId(dropData.listing_id || null);
          setMaxOrders(dropData.max_orders ? String(dropData.max_orders) : '');

          if (dropData.cutoff_at) {
            const cutoffObj = new Date(dropData.cutoff_at);
            setCutoffDate(cutoffObj.toISOString().split('T')[0]);
            const hours = String(cutoffObj.getHours()).padStart(2, '0');
            const mins = String(cutoffObj.getMinutes()).padStart(2, '0');
            setCutoffTime(`${hours}:${mins}`);
          }
        }

        // Load items
        const { data: itemsData, error: itemsErr } = await supabase
          .from('mcn_preorder_items')
          .select('*')
          .eq('drop_id', dropId);

        if (itemsErr) throw itemsErr;

        if (itemsData && itemsData.length > 0) {
          setItems(
            itemsData.map((item: any) => ({
              id: item.id,
              name: item.name,
              unit: item.unit || 'piece',
              price: String(item.price),
              description: item.description || '',
              image_url: item.image_url || null,
            }))
          );
        }
      } catch (err) {
        console.error('Error loading drop for editing:', err);
        Toast.show({ type: 'error', text1: 'Failed to load drop for editing' });
      } finally {
        setLoadingDrop(false);
      }
    }

    loadExistingDrop();
  }, [dropId]);

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { id: Date.now().toString(), name: '', unit: 'piece', price: '', description: '', image_url: null },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length <= 1) {
      Toast.show({ type: 'info', text1: 'Drop must have at least one item' });
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleItemChange = (id: string, field: keyof ItemForm, val: any) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: val } : item))
    );
  };

  const handleSubmit = async () => {
    if (!user?.id || !communityId) {
      Toast.show({ type: 'error', text1: 'Authentication required' });
      return;
    }

    if (!title.trim()) {
      Toast.show({ type: 'error', text1: 'Please enter a drop title' });
      return;
    }

    if (!fulfillmentDate.trim()) {
      Toast.show({ type: 'error', text1: 'Please specify fulfillment date' });
      return;
    }

    if (!cutoffDate.trim() || !cutoffTime.trim()) {
      Toast.show({ type: 'error', text1: 'Please specify pre-order cut-off date & time' });
      return;
    }

    // Validate items
    const validItems = items.filter((i) => i.name.trim() !== '' && parseFloat(i.price) > 0);
    if (validItems.length === 0) {
      Toast.show({
        type: 'error',
        text1: 'Add at least one item with a valid name and price',
      });
      return;
    }

    // Construct cutoff ISO timestamp
    const cutoffDateTimeStr = `${cutoffDate.trim()}T${cutoffTime.trim()}:00`;
    const cutoffAtObj = new Date(cutoffDateTimeStr);

    if (isNaN(cutoffAtObj.getTime())) {
      Toast.show({ type: 'error', text1: 'Invalid cut-off date or time format' });
      return;
    }

    setSubmitting(true);
    try {
      if (isEditMode && dropId) {
        // --- EDIT MODE ---
        // 1. Update drop
        const { error: updateErr } = await supabase
          .from('mcn_preorder_drops')
          .update({
            listing_id: selectedListingId,
            title: title.trim(),
            description: description.trim() || null,
            image_url: imageUrl,
            fulfillment_date: fulfillmentDate.trim(),
            fulfillment_time: fulfillmentTime.trim(),
            cutoff_at: cutoffAtObj.toISOString(),
            max_orders: maxOrders ? parseInt(maxOrders, 10) : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', dropId);

        if (updateErr) throw updateErr;

        // 2. Refresh items: delete existing and re-insert
        await supabase
          .from('mcn_preorder_items')
          .delete()
          .eq('drop_id', dropId);

        const itemsPayload = validItems.map((item) => ({
          drop_id: dropId,
          name: item.name.trim(),
          unit: item.unit,
          price: parseFloat(item.price),
          description: item.description.trim() || null,
          image_url: item.image_url || null,
        }));

        const { error: itemsErr } = await supabase
          .from('mcn_preorder_items')
          .insert(itemsPayload);

        if (itemsErr) throw itemsErr;

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
            listing_id: selectedListingId,
            created_by: user.id,
            title: title.trim(),
            description: description.trim() || null,
            image_url: imageUrl,
            fulfillment_date: fulfillmentDate.trim(),
            fulfillment_time: fulfillmentTime.trim(),
            cutoff_at: cutoffAtObj.toISOString(),
            max_orders: maxOrders ? parseInt(maxOrders, 10) : null,
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

        router.replace(`/network/drops/${dropData.id}` as any);
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

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.surface }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={{
          title: isEditMode ? 'Edit Food Drop' : 'Host a Food Drop',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Linked Listing (if any) */}
        {myListings.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.label}>Linked Food Business (Optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {myListings.map((l) => {
                const active = selectedListingId === l.id;
                return (
                  <TouchableOpacity
                    key={l.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setSelectedListingId(active ? null : l.id)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      🏪 {l.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

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
            placeholder="e.g. Saturday Woodfired Pizza Night, Sunday Dum Biryani"
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
          <Text style={styles.cardSectionTitle}>📅 Delivery / Fulfillment Schedule</Text>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.subLabel}>Fulfillment Date (YYYY-MM-DD) *</Text>
              <TextInput
                style={styles.input}
                placeholder="2026-07-26"
                placeholderTextColor={colors.textMuted}
                value={fulfillmentDate}
                onChangeText={setFulfillmentDate}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.subLabel}>Delivery Time Slot *</Text>
              <TextInput
                style={styles.input}
                placeholder="1:00 PM - 3:00 PM"
                placeholderTextColor={colors.textMuted}
                value={fulfillmentTime}
                onChangeText={setFulfillmentTime}
              />
            </View>
          </View>
        </View>

        {/* Cut-off Deadline */}
        <View style={styles.cardSection}>
          <Text style={styles.cardSectionTitle}>⏰ Pre-Order Cut-off Deadline</Text>
          <Text style={styles.cardSectionSub}>
            Orders automatically close at this time so you can prepare ingredients.
          </Text>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.subLabel}>Cut-off Date (YYYY-MM-DD) *</Text>
              <TextInput
                style={styles.input}
                placeholder="2026-07-25"
                placeholderTextColor={colors.textMuted}
                value={cutoffDate}
                onChangeText={setCutoffDate}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.subLabel}>Cut-off Time (24h HH:mm) *</Text>
              <TextInput
                style={styles.input}
                placeholder="21:00 (for 9 PM)"
                placeholderTextColor={colors.textMuted}
                value={cutoffTime}
                onChangeText={setCutoffTime}
              />
            </View>
          </View>

          <View style={{ marginTop: 10 }}>
            <Text style={styles.subLabel}>Max Total Orders (Optional limit)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 25 orders max"
              placeholderTextColor={colors.textMuted}
              value={maxOrders}
              onChangeText={setMaxOrders}
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Drop Items Menu */}
        <View style={styles.cardSection}>
          <View style={styles.itemsHeader}>
            <Text style={styles.cardSectionTitle}>🍕 Items Offered for this Drop</Text>
            <TouchableOpacity style={styles.addItemBtn} onPress={handleAddItem}>
              <Ionicons name="add" size={16} color={colors.accent} />
              <Text style={styles.addItemBtnText}>Add Item</Text>
            </TouchableOpacity>
          </View>

          {items.map((item, idx) => (
            <View key={item.id} style={styles.itemFormBox}>
              <View style={styles.itemFormHeader}>
                <Text style={styles.itemFormTitle}>Item #{idx + 1}</Text>
                {items.length > 1 ? (
                  <TouchableOpacity onPress={() => handleRemoveItem(item.id)}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
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
                    placeholder="e.g. Margherita Sourdough Pizza"
                    placeholderTextColor={colors.textMuted}
                    value={item.name}
                    onChangeText={(txt) => handleItemChange(item.id, 'name', txt)}
                  />
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
    padding: 20,
    paddingBottom: 60,
  },
  section: {
    marginBottom: 16,
  },
  label: {
    ...VerandahType.bodyBold,
    fontSize: 13,
    color: Verandah.textPrimary,
    marginBottom: 6,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: Verandah.textSecondary,
    marginBottom: 4,
  },
  input: {
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Verandah.textPrimary,
  },
  multiline: {
    minHeight: 64,
  },
  chipRow: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: VerandahRadius.pill,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: Verandah.accent,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
    color: Verandah.textSecondary,
  },
  chipTextActive: {
    color: Verandah.accent,
    fontWeight: '600',
  },
  cardSection: {
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.lg,
    padding: 16,
    marginBottom: 16,
  },
  cardSectionTitle: {
    ...VerandahType.title,
    fontSize: 14,
    color: Verandah.textPrimary,
    marginBottom: 4,
  },
  cardSectionSub: {
    fontSize: 11,
    color: Verandah.textSecondary,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
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
