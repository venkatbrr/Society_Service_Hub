import { CheckCircle } from '@untitledui/icons/CheckCircle';
import { Clock } from '@untitledui/icons/Clock';
import { Edit01 } from '@untitledui/icons/Edit01';
import { InfoCircle } from '@untitledui/icons/InfoCircle';
import { Lock01 } from '@untitledui/icons/Lock01';
import { Share07 } from '@untitledui/icons/Share07';
import { Trash01 } from '@untitledui/icons/Trash01';
import { XCircle } from '@untitledui/icons/XCircle';
import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { goBackSmart, replaceTracked } from '../../../lib/navigation';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Avatar } from '../../../components/Avatar';
import { DangerZone } from '../../../components/DangerZone';
import { DietDot } from '../../../components/DietDot';
import { PLACEHOLDER_COVER } from '../../../components/PreorderDropCard';
import { Rupees } from '../../../components/Rupees';
import { Verandah } from '../../../constants/Colors';
import { dietMeta } from '../../../constants/diet';
import { VerandahBorder, VerandahLayout, VerandahRadius, VerandahSpace, VerandahType, format12HourTime, getMediaHeroHeight } from '../../../constants/Verandah';
import { useAuth } from '../../../context/AuthContext';
import { buildMcnHeaderOptions } from '../../../lib/mcnHeader';
import { cloudinaryUrl } from '../../../lib/cloudinary';
import { confirmAction } from '../../../lib/confirm';
import { shareOrCopy } from '../../../lib/share';
import { siteUrl } from '../../../lib/siteUrl';
import { supabase } from '../../../lib/supabase';

interface DropItem {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  price: number;
  image_url?: string | null;
  max_quantity?: number | null;
  diet_type?: string | null;
}

interface DropDetails {
  id: string;
  community_id: string;
  title: string;
  description: string | null;
  image_url?: string | null;
  fulfillment_date: string;
  fulfillment_time: string;
  cutoff_at: string;
  max_orders: number | null;
  status: 'open' | 'closed' | 'completed' | 'cancelled';
  created_by: string;
  profiles?: {
    full_name: string | null;
    flat_number: string | null;
    phone_number: string | null;
  } | null;
  mcn_listings?: {
    name: string;
  } | null;
}

export default function PreorderDropDetailScreen() {
  const { id: dropId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, profile, isCommunityLead } = useAuth();
  const { height: windowHeight } = useWindowDimensions();
  const heroHeight = getMediaHeroHeight(windowHeight);
  const colors = Verandah;

  const [drop, setDrop] = useState<DropDetails | null>(null);
  const [items, setItems] = useState<DropItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // Resident Pre-Order Form
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [flatNumber, setFlatNumber] = useState('');
  const [buyerNote, setBuyerNote] = useState('');

  const [userOrders, setUserOrders] = useState<any[]>([]);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [itemAvailability, setItemAvailability] = useState<
    Record<string, { remaining: number | null; sold: number }>
  >({});
  const [editingOriginalQuantities, setEditingOriginalQuantities] = useState<Record<string, number>>({});

  const fetchDropDetails = useCallback(async () => {
    if (!dropId) return;
    try {
      // 1. Fetch drop metadata
      const { data: dropData, error: dropErr } = await supabase
        .from('mcn_preorder_drops')
        .select('*')
        .eq('id', dropId)
        .maybeSingle();

      if (dropErr || !dropData) throw dropErr || new Error('Drop not found');

      // Fetch host profile
      let hostProfile: any = null;
      if (dropData.created_by) {
        const { data: hosts } = await supabase.rpc('get_public_host_profiles', {
          p_user_ids: [dropData.created_by],
        });
        hostProfile = hosts?.[0] ?? null;

        if (hostProfile && user?.id) {
          const { data: contact } = await supabase
            .from('profiles')
            .select('phone_number')
            .eq('id', dropData.created_by)
            .maybeSingle();
          hostProfile = { ...hostProfile, phone_number: contact?.phone_number ?? null };
        }
      }

      // Fetch linked business listing if any
      let listingMeta = null;
      if (dropData.listing_id) {
        const { data: lData } = await supabase
          .from('mcn_listings')
          .select('name')
          .eq('id', dropData.listing_id)
          .maybeSingle();
        listingMeta = lData;
      }

      setDrop({
        ...dropData,
        profiles: hostProfile,
        mcn_listings: listingMeta,
      } as DropDetails);

      // 2. Fetch drop items
      const { data: itemsData, error: itemsErr } = await supabase
        .from('mcn_preorder_items')
        .select('*')
        .eq('drop_id', dropId);

      if (itemsErr) throw itemsErr;

      // Deduplicate items by signature to prevent duplicate entries from showing
      const uniqueItemsMap = new Map<string, DropItem>();
      (itemsData || []).forEach((row: any) => {
        const key = `${row.name?.trim().toLowerCase()}_${row.unit}_${row.price}`;
        if (!uniqueItemsMap.has(key)) {
          uniqueItemsMap.set(key, row as DropItem);
        }
      });
      setItems(Array.from(uniqueItemsMap.values()));

      // 2b. Fetch shared capacity already sold per item (across every buyer)
      const { data: availabilityData } = await supabase.rpc('get_mcn_drop_item_availability', {
        p_drop_id: dropId,
      });
      const availabilityMap: Record<string, { remaining: number | null; sold: number }> = {};
      (availabilityData || []).forEach((row: any) => {
        availabilityMap[row.item_id] = {
          remaining: row.remaining_quantity === null ? null : Number(row.remaining_quantity),
          sold: Number(row.sold_quantity || 0),
        };
      });
      setItemAvailability(availabilityMap);

      // 3. Fetch all existing orders for this drop by current user
      if (user?.id) {
        const { data: ordersData, error: ordersErr } = await supabase
          .from('mcn_preorder_orders')
          .select('*, mcn_preorder_order_items(*)')
          .eq('drop_id', dropId)
          .eq('buyer_id', user.id)
          .order('created_at', { ascending: false });

        if (!ordersErr && ordersData) {
          setUserOrders(ordersData);

          // Verify if currently editing order is still valid and confirmed
          if (editingOrderId) {
            const activeOrd = ordersData.find((o) => o.id === editingOrderId && o.status === 'confirmed');
            if (!activeOrd) {
              setEditingOrderId(null);
              setQuantities({});
            }
          }
        } else {
          setUserOrders([]);
        }
      }
    } catch (err) {
      console.error('Error fetching drop details:', err);
      Toast.show({ type: 'error', text1: 'Failed to load food drop details' });
    } finally {
      setLoading(false);
    }
  }, [dropId, user?.id, editingOrderId]);

  useEffect(() => {
    fetchDropDetails();
  }, [fetchDropDetails]);

  // Remaining stock is shared across every resident, so it goes stale as soon as
  // someone else orders. Re-read just the availability whenever this screen is
  // focused, without disturbing the rest of the page state.
  const refreshAvailability = useCallback(async () => {
    if (!dropId) return;
    const { data, error } = await supabase.rpc('get_mcn_drop_item_availability', {
      p_drop_id: dropId,
    });
    if (error) return;
    const availabilityMap: Record<string, { remaining: number | null; sold: number }> = {};
    (data || []).forEach((row: any) => {
      availabilityMap[row.item_id] = {
        remaining: row.remaining_quantity === null ? null : Number(row.remaining_quantity),
        sold: Number(row.sold_quantity || 0),
      };
    });
    setItemAvailability(availabilityMap);
  }, [dropId]);

  useFocusEffect(
    useCallback(() => {
      refreshAvailability();
    }, [refreshAvailability])
  );

  // Pre-fill resident info from profile
  useEffect(() => {
    if (profile) {
      if (profile.full_name) setBuyerName(profile.full_name);
      if (profile.flat_number) setFlatNumber(profile.flat_number);
    }
  }, [profile]);

  // max_quantity is a cap shared across every buyer's orders, not a per-order
  // allowance — so "how many more can this buyer add" must account for what
  // has already been sold to everyone else (see get_mcn_drop_item_availability).
  const getEffectiveRemaining = useCallback(
    (itemId: string): number | null => {
      const avail = itemAvailability[itemId];
      if (!avail || avail.remaining === null) return null;
      const selfPrior = editingOrderId ? editingOriginalQuantities[itemId] || 0 : 0;
      return avail.remaining + selfPrior;
    },
    [itemAvailability, editingOrderId, editingOriginalQuantities]
  );

  const handleQtyChange = (itemId: string, delta: number) => {
    const remaining = getEffectiveRemaining(itemId);

    setQuantities((prev) => {
      const current = prev[itemId] || 0;
      let updated = Math.max(0, current + delta);

      if (remaining !== null && updated > remaining) {
        updated = remaining;
        Toast.show({
          type: 'info',
          text1: 'Shared capacity reached',
          text2: 'This item is capped across all residents’ orders, not just yours.',
        });
      }

      return { ...prev, [itemId]: updated };
    });
  };

  const handleStartEditOrder = (order: any) => {
    if (order.status !== 'confirmed') {
      Toast.show({ type: 'info', text1: 'Delivered or cancelled orders cannot be edited' });
      return;
    }
    setEditingOrderId(order.id);
    const qMap: Record<string, number> = {};
    (order.mcn_preorder_order_items || []).forEach((row: any) => {
      qMap[row.item_id] = row.quantity;
    });
    setQuantities(qMap);
    setEditingOriginalQuantities(qMap);
    if (order.buyer_name) setBuyerName(order.buyer_name);
    if (order.buyer_phone) setBuyerPhone(order.buyer_phone);
    if (order.flat_number) setFlatNumber(order.flat_number);
    if (order.buyer_note) setBuyerNote(order.buyer_note);
    Toast.show({ type: 'info', text1: 'Editing active pre-order items' });
  };

  const handleCancelEdit = () => {
    setEditingOrderId(null);
    setQuantities({});
    setEditingOriginalQuantities({});
    if (profile) {
      if (profile.full_name) setBuyerName(profile.full_name);
      if (profile.flat_number) setFlatNumber(profile.flat_number);
    }
    setBuyerNote('');
  };

  // Display only — place_mcn_preorder prices the order from the item table and
  // writes the authoritative total_amount itself.
  const subtotal = items.reduce((acc, item) => {
    const qty = quantities[item.id] || 0;
    return acc + qty * item.price;
  }, 0);

  const now = new Date();
  const cutoffDate = drop ? new Date(drop.cutoff_at) : now;
  const isCutoffPassed = now >= cutoffDate;
  const isOpen = drop?.status === 'open' && !isCutoffPassed;

  const handleSubmitOrder = async () => {
    if (!dropId) {
      Toast.show({ type: 'error', text1: 'Drop is unavailable' });
      return;
    }

    if (!user?.id) {
      Toast.show({
        type: 'info',
        text1: 'Login required',
        text2: 'You can place an order after login.',
      });
      router.push('/login' as any);
      return;
    }

    if (isCreator) {
      Toast.show({
        type: 'error',
        text1: 'Hosts cannot place pre-orders',
        text2: 'You are the host of this food drop.',
      });
      return;
    }

    if (isCutoffPassed || drop?.status !== 'open') {
      Toast.show({
        type: 'error',
        text1: 'Pre-orders are closed for this drop',
        text2: 'The cut-off deadline has passed.',
      });
      return;
    }

    const selectedItems = items.filter((item) => (quantities[item.id] || 0) > 0);
    if (selectedItems.length === 0) {
      Toast.show({ type: 'error', text1: 'Please select at least one item' });
      return;
    }

    const effectiveFlat = profile?.flat_number || flatNumber;
    if (!effectiveFlat.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Flat number required',
        text2: 'Please set your flat in profile before placing an order.',
      });
      router.push('/profile/edit' as any);
      return;
    }

    if (!buyerPhone.trim()) {
      Toast.show({ type: 'error', text1: 'Please enter your contact phone number' });
      return;
    }

    setSubmitting(true);
    try {
      // One transaction on the server: it re-checks every cap under a row lock,
      // prices the lines from the item table, and writes the order plus its line
      // items together. Placing these as two client round trips is what used to
      // leave a "confirmed" order with a total and no items behind whenever the
      // cap rejected the second call.
      const { error: rpcErr } = await supabase.rpc('place_mcn_preorder', {
        p_drop_id: dropId,
        p_items: selectedItems.map((item) => ({
          item_id: item.id,
          quantity: quantities[item.id],
        })),
        p_buyer_name: buyerName.trim() || profile?.full_name || 'Resident',
        p_buyer_phone: buyerPhone.trim(),
        p_flat_number: (profile?.flat_number || flatNumber).trim().toUpperCase(),
        p_buyer_note: buyerNote.trim() || null,
        p_order_id: editingOrderId || null,
      });

      if (rpcErr) throw rpcErr;

      Toast.show(
        editingOrderId
          ? {
              type: 'success',
              text1: 'Pre-order updated successfully',
              text2: 'Your updated food choices have been saved.',
            }
          : {
              type: 'success',
              text1: 'Order placed successfully',
            }
      );

      setEditingOrderId(null);
      setQuantities({});
      setEditingOriginalQuantities({});
      setBuyerNote('');
      fetchDropDetails();
    } catch (err: any) {
      console.error(err);
      Toast.show({
        type: 'error',
        text1: editingOrderId ? 'Failed to update pre-order' : 'Failed to place pre-order',
        text2: err.message,
      });
      // Availability is read once on load, so a rejection usually means another
      // resident consumed the capacity — re-sync so the steppers clamp correctly.
      fetchDropDetails();
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelOrder = async (targetOrderId: string) => {
    confirmAction({
      title: 'Cancel pre-order?',
      message: 'Are you sure you want to cancel your food pre-order?',
      confirmLabel: 'Yes, cancel',
      destructive: true,
      onConfirm: async () => {
        try {
          const { data, error } = await supabase
            .from('mcn_preorder_orders')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', targetOrderId)
            .eq('buyer_id', user?.id)
            .eq('status', 'confirmed')
            .select('id')
            .maybeSingle();

          if (error) throw error;
          if (!data) {
            Toast.show({
              type: 'info',
              text1: 'Nothing to cancel',
              text2: 'This pre-order was already delivered or cancelled.',
            });
          } else {
            Toast.show({ type: 'success', text1: 'Pre-order cancelled' });
          }

          if (editingOrderId === targetOrderId) {
            setEditingOrderId(null);
            setQuantities({});
            setEditingOriginalQuantities({});
          }
          fetchDropDetails();
        } catch (err: any) {
          console.error(err);
          Toast.show({ type: 'error', text1: 'Failed to cancel pre-order', text2: err?.message });
        }
      },
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface }]}>
        <Stack.Screen
          options={buildMcnHeaderOptions({
            title: 'Food drop details',
            // A bare Stack.Screen here would fall back to React Navigation's
            // default back button, which calls navigation.goBack() and pops the
            // navigator instead of running goBackSmart() — on a deep-linked or
            // freshly-loaded screen that lands on the tabs (/network), not the
            // drops list. Clicking back while this state is on screen is common.
            onBack: () => goBackSmart(router, `/mcn/drops/${dropId}`),
          })}
        />
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </View>
    );
  }

  if (!drop) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface }]}>
        <Stack.Screen
          options={buildMcnHeaderOptions({
            title: 'Food drop details',
            // A bare Stack.Screen here would fall back to React Navigation's
            // default back button, which calls navigation.goBack() and pops the
            // navigator instead of running goBackSmart() — on a deep-linked or
            // freshly-loaded screen that lands on the tabs (/network), not the
            // drops list. Clicking back while this state is on screen is common.
            onBack: () => goBackSmart(router, `/mcn/drops/${dropId}`),
          })}
        />
        <View style={styles.loaderWrap}>
          <Text style={{ color: colors.textSecondary }}>Food drop not found.</Text>
        </View>
      </View>
    );
  }

  const isCreator = drop?.created_by === user?.id;
  const canManageDrop = isCreator || isCommunityLead;
  const rawHostName = drop?.profiles?.full_name?.trim() || drop?.mcn_listings?.name?.trim() || 'Local Food Host';
  const hostName = rawHostName === 'Host' ? 'Local Food Host' : rawHostName;
  const hostFlat = drop?.profiles?.flat_number ? `Flat ${drop.profiles.flat_number}` : '';

  const fulfillDateObj = new Date(drop?.fulfillment_date || Date.now());
  const fulfillFormatted = fulfillDateObj.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const cutoffFormatted = cutoffDate.toLocaleDateString('en-IN', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  // `DangerZone` owns the confirmation (consequence + spam caution, platform-split
  // via `confirmAction`), so this only runs once the host has already confirmed.
  const handleDeleteDrop = async () => {
    if (!drop) return;
    try {
      const { error } = await supabase.from('mcn_preorder_drops').delete().eq('id', drop.id);
      if (error) throw error;
      Toast.show({ type: 'success', text1: 'Food drop deleted' });
      replaceTracked(router, '/mcn/drops' as any);
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Failed to delete food drop', text2: err.message });
    }
  };

  const handleShareDrop = async () => {
    if (!drop) return;
    // Route the share link through the OG-preview endpoint (see api/share-drop.ts)
    // so WhatsApp/Facebook/etc. crawlers can fetch this drop's title, description,
    // and photo and render a real link-preview card — a bare app URL has no
    // server-rendered meta tags for them to read.
    const shareUrl = siteUrl(`/api/share-drop?id=${drop.id}`);

    const messageLines = [
      `🍲 *Food Drop: ${drop.title}*`,
      `Hosted by ${hostName}${hostFlat ? ` (${hostFlat})` : ''}`,
      ``,
      `📅 Delivery: ${fulfillFormatted} (${format12HourTime(drop.fulfillment_time)})`,
      `⏰ Pre-Orders Close: ${cutoffFormatted}`,
      ``,
      `🔗 View Menu & Place Pre-Order:`,
      shareUrl,
    ];

    const message = messageLines.join('\n');
    await shareOrCopy({ title: drop.title, message });
  };

  const handleBack = () => {
    if (selectedImageUrl) {
      setSelectedImageUrl(null);
      return;
    }
    goBackSmart(router, `/mcn/drops/${dropId}`);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.paper }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={buildMcnHeaderOptions({
          title: drop.title,
          onBack: handleBack,
          headerRight: canManageDrop && !isCreator
            ? () => (
                <TouchableOpacity
                  onPress={() => router.push(`/mcn/drops/manage/${drop.id}` as any)}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>
                    Dashboard
                  </Text>
                </TouchableOpacity>
              )
            : undefined,
        })}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Cover Hero Banner */}
        {drop.image_url ? (
          <TouchableOpacity
            style={[styles.heroImageWrap, { height: heroHeight }]}
            onPress={() => setSelectedImageUrl(drop.image_url || null)}
            activeOpacity={0.9}
          >
            <Image
              source={{ uri: cloudinaryUrl(drop.image_url) }}
              style={styles.heroImage}
              contentFit="cover"
              contentPosition="top"
              transition={200}
            />
          </TouchableOpacity>
        ) : (
          /* Same illustrated fallback the feed tile uses, so a photoless drop
             does not open to a blank slab of text. Not tappable — there is no
             real photo to inspect full-screen. */
          <View style={[styles.heroImageWrap, { height: heroHeight }]}>
            <Image
              source={PLACEHOLDER_COVER}
              style={styles.heroImage}
              contentFit="cover"
              contentPosition="center"
              transition={200}
            />
          </View>
        )}

        {/* Host Header */}
        <View style={styles.hostCard}>
          <Avatar name={hostName} size={44} />
          <View style={styles.hostMeta}>
            <Text style={styles.hostTitle}>{drop.title}</Text>
            <Text style={styles.hostSub}>
              Hosted by {hostName} {hostFlat ? `(${hostFlat})` : ''}
            </Text>
          </View>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShareDrop} activeOpacity={0.8}>
            <Share07 size={15} color={Verandah.primaryFg} aria-hidden={true} />
            <Text style={styles.shareBtnText}>Share</Text>
          </TouchableOpacity>
        </View>

        {/* Schedule & Cut-off Banner */}
        <View style={[styles.statusBanner, isOpen ? styles.bannerOpen : styles.bannerClosed]}>
          {isOpen ? <Clock size={16} color={colors.primary} aria-hidden={true} /> : <Lock01 size={16} color={colors.textMuted} aria-hidden={true} />}
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.bannerMainText}>
              {isOpen ? `Pre-Orders Open until ${cutoffFormatted}` : 'Pre-Orders Closed'}
            </Text>
            <Text style={styles.bannerSubText}>
              Delivery: <Text style={{ fontWeight: '600' }}>{fulfillFormatted}</Text> ({format12HourTime(drop.fulfillment_time)})
            </Text>
          </View>
        </View>

        {drop.description ? (
          <Text style={styles.description}>{drop.description}</Text>
        ) : null}

        {/* Host Notice Banner if current user is the host */}
        {isCreator ? (
          <View style={styles.hostNoticeBox}>
            <InfoCircle size={22} color={colors.primary} aria-hidden={true} />
            <View style={{ flex: 1 }}>
              <Text style={styles.hostNoticeTitle}>You are hosting this food drop</Text>
              <Text style={styles.hostNoticeSub}>
                Hosts cannot place pre-orders on their own drop. Use the Manage Dashboard to track resident orders and kitchen prep totals.
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <TouchableOpacity
                  style={styles.hostManageBtn}
                  onPress={() => router.push(`/mcn/drops/manage/${drop.id}` as any)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.hostManageBtnText}>Open Manage Dashboard →</Text>
                </TouchableOpacity>

                {isOpen ? (
                  <TouchableOpacity
                    style={[styles.hostManageBtn, { backgroundColor: '#FFFFFF', borderWidth: 0.5, borderColor: Verandah.primary }]}
                    onPress={() => router.push(`/mcn/drops/add?dropId=${drop.id}` as any)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.hostManageBtnText, { color: Verandah.primary }]}>Edit Drop</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}

        {/* Existing User Orders Status Cards */}
        {userOrders.length > 0 && !isCreator ? (
          <View style={{ marginBottom: 8 }}>
            <Text style={styles.sectionHeader}>Your Orders for this Drop</Text>
            {userOrders.map((ord: any, index: number) => {
              const isFulfilled = ord.status === 'fulfilled';
              const isCancelled = ord.status === 'cancelled';
              const isConfirmed = ord.status === 'confirmed';
              const cancelledByHost = isCancelled && !!ord.cancelled_by && ord.cancelled_by !== user?.id;
              const orderItems = ord.mcn_preorder_order_items || [];

              return (
                <View
                  key={ord.id}
                  style={[
                    styles.existingOrderBox,
                    isFulfilled && { backgroundColor: Verandah.accentSoft, borderColor: Verandah.green600 },
                    isCancelled && { backgroundColor: '#F9FAFB', borderColor: '#D1D5DB' },
                  ]}
                >
                  <View style={styles.existingHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.orderLabelText}>Order #{userOrders.length - index}</Text>
                      {isFulfilled ? (
                        <View style={styles.fulfilledBadgeInline}>
                          <CheckCircle size={14} color={Verandah.green600} aria-hidden={true} />
                          <Text style={styles.fulfilledBadgeText}>Delivered</Text>
                        </View>
                      ) : isConfirmed ? (
                        <View style={styles.confirmedBadgeInline}>
                          <Clock size={14} color={colors.primary} aria-hidden={true} />
                          <Text style={styles.confirmedBadgeText}>Confirmed</Text>
                        </View>
                      ) : (
                        <View style={[styles.cancelledBadgeInline, cancelledByHost && { backgroundColor: '#FEE2E2' }]}>
                          <Text style={[styles.cancelledBadgeText, cancelledByHost && { color: '#DC2626' }]}>
                            {cancelledByHost ? 'Cancelled by host' : 'Cancelled'}
                          </Text>
                        </View>
                      )}
                    </View>

                    <Text style={styles.existingDateText}>
                      {new Date(ord.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>

                  {orderItems.map((item: any) => (
                    <View key={item.id} style={styles.existingItemRow}>
                      <Text style={styles.existingItemName}>
                        {item.quantity}x {item.item_name}
                      </Text>
                      <Rupees amount={item.quantity * item.unit_price} size="sm" />
                    </View>
                  ))}

                  <View style={styles.existingTotalRow}>
                    <Text style={styles.existingTotalLabel}>
                      {isFulfilled ? 'Total Paid / Due:' : 'Total Amount (Pay on Delivery):'}
                    </Text>
                    <Rupees amount={ord.total_amount} size="md" tone="in" />
                  </View>

                  {ord.buyer_note ? (
                    <Text style={styles.buyerNoteText}>Your note: "{ord.buyer_note}"</Text>
                  ) : null}

                  {cancelledByHost && ord.cancellation_note ? (
                    <View style={styles.cancellationNoticeBox}>
                      <Text style={styles.cancellationNoticeLabel}>Host cancellation note:</Text>
                      <Text style={styles.cancellationNoticeText}>"{ord.cancellation_note}"</Text>
                    </View>
                  ) : null}

                  {isFulfilled ? (
                    <View style={styles.deliveredNoticeBox}>
                      <CheckCircle size={16} color={Verandah.green600} aria-hidden={true} />
                      <Text style={styles.deliveredNoticeText}>
                        Food marked as delivered by host. Enjoy your meal!
                      </Text>
                    </View>
                  ) : isConfirmed && isOpen ? (
                    <View style={styles.orderActionRow}>
                      <TouchableOpacity
                        style={[
                          styles.editOrderBtn,
                          editingOrderId === ord.id && styles.editingOrderBtnActive,
                        ]}
                        onPress={() => handleStartEditOrder(ord)}
                      >
                        <Edit01
                          size={14}
                          color={editingOrderId === ord.id ? '#FFFFFF' : colors.primary}
                          aria-hidden={true}
                        />
                        <Text
                          style={[
                            styles.editOrderBtnText,
                            editingOrderId === ord.id && { color: '#FFFFFF' },
                          ]}
                        >
                          {editingOrderId === ord.id ? 'Currently Editing' : 'Update / Edit Items'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.cancelOrderBtn}
                        onPress={() => handleCancelOrder(ord.id)}
                      >
                        <Trash01 size={14} color={Verandah.danger} aria-hidden={true} />
                        <Text style={styles.cancelOrderBtnText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Menu Items Picker Header & Items */}
        <Text style={styles.sectionHeader}>
          {isCreator
            ? 'Items Offered in Your Drop'
            : editingOrderId
            ? 'Update Selected Items'
            : userOrders.length > 0
            ? 'Select Items for New Pre-Order'
            : 'Select Pre-Order Items'}
        </Text>

        {items.map((item) => {
          const qty = quantities[item.id] || 0;
          const remaining = getEffectiveRemaining(item.id);
          const soldOut = remaining !== null && remaining <= 0;
          const atLimit = remaining !== null && qty >= remaining;
          return (
            <View key={item.id} style={styles.itemRow}>
              {item.image_url ? (
                <TouchableOpacity
                  onPress={() => setSelectedImageUrl(item.image_url || null)}
                  activeOpacity={0.8}
                >
                  <Image
                    source={{ uri: cloudinaryUrl(item.image_url, { width: 144, height: 144, crop: 'fill' }) }}
                    style={styles.itemThumb}
                    contentFit="cover"
                    transition={200}
                  />
                </TouchableOpacity>
              ) : null}

              <View style={{ flex: 1 }}>
                <View style={styles.itemNameRow}>
                  <DietDot value={item.diet_type} size={12} />
                  <Text style={[styles.itemName, { flexShrink: 1 }]}>{item.name}</Text>
                </View>
                {item.description ? (
                  <Text style={styles.itemDesc}>{item.description}</Text>
                ) : null}
                <View style={styles.priceRow}>
                  <Rupees amount={item.price} size="sm" />
                  <Text style={styles.itemUnit}> / {item.unit}</Text>
                </View>
                {item.max_quantity != null ? (
                  <Text style={[styles.itemCapText, soldOut ? styles.itemCapTextOut : null]}>
                    {remaining === null
                      ? `Limited to ${item.max_quantity} in total, shared across all residents`
                      : soldOut
                      ? `Sold out — all ${item.max_quantity} claimed`
                      : `${remaining} of ${item.max_quantity} left — shared across all residents`}
                  </Text>
                ) : null}
              </View>

              {/* Quantity Counter (Only for residents, not the host) */}
              {isOpen && !isCreator ? (
                <View style={styles.counterRow}>
                  <TouchableOpacity
                    style={[styles.counterBtn, qty === 0 && styles.counterBtnDisabled]}
                    onPress={() => handleQtyChange(item.id, -1)}
                    disabled={qty === 0}
                  >
                    <Text style={styles.counterBtnText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.counterVal}>{qty}</Text>
                  <TouchableOpacity
                    style={[styles.counterBtn, atLimit && styles.counterBtnDisabled]}
                    onPress={() => handleQtyChange(item.id, 1)}
                    disabled={atLimit}
                  >
                    <Text style={styles.counterBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          );
        })}

        {/* Resident Order Form (if open and not creator) */}
        {isOpen && !isCreator && user?.id ? (
          <View style={styles.formSection}>
            {editingOrderId ? (
              <View style={styles.editingModeBanner}>
                <Edit01 size={16} color={Verandah.primary} aria-hidden={true} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.editingBannerTitle}>Updating Active Pre-Order</Text>
                  <Text style={styles.editingBannerSub}>
                    Modify item quantities above and click Update Pre-Order below to save.
                  </Text>
                </View>
                <TouchableOpacity style={styles.cancelEditBtn} onPress={handleCancelEdit}>
                  <Text style={styles.cancelEditBtnText}>+ Place New Order</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <Text style={styles.sectionHeader}>Delivery Information</Text>

            <Text style={styles.subLabel}>Your Full Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Full Name"
              placeholderTextColor={colors.textMuted}
              value={buyerName}
              onChangeText={setBuyerName}
            />

            <Text style={[styles.subLabel, { marginTop: 10 }]}>Flat / Unit Number *</Text>
            {profile?.flat_number ? (
              <View style={[styles.input, { justifyContent: 'center', backgroundColor: colors.card }]}>
                <Text style={{ color: colors.textPrimary, ...VerandahType.body }}>{profile.flat_number}</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.input, { justifyContent: 'center', borderColor: Verandah.caution, backgroundColor: Verandah.cautionSoft }]}
                onPress={() => router.push('/profile/edit' as any)}
                activeOpacity={0.85}
              >
                <Text style={{ color: Verandah.caution, ...VerandahType.captionBold }}>
                  + Set your flat in profile to order
                </Text>
              </TouchableOpacity>
            )}

            <Text style={[styles.subLabel, { marginTop: 10 }]}>Contact Phone Number *</Text>
            <TextInput
              style={styles.input}
              placeholder="10-digit mobile number"
              placeholderTextColor={colors.textMuted}
              value={buyerPhone}
              onChangeText={setBuyerPhone}
              keyboardType="phone-pad"
            />

            <Text style={[styles.subLabel, { marginTop: 10 }]}>Delivery Note (Optional)</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="e.g. Less spicy, extra sauce..."
              placeholderTextColor={colors.textMuted}
              value={buyerNote}
              onChangeText={setBuyerNote}
              multiline
            />

            {/* Subtotal & Submit CTA */}
            <View style={styles.summaryBox}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal:</Text>
                <Rupees amount={subtotal} size="md" tone="in" />
              </View>
              <Text style={styles.paymentNote}>Payment mode: Pay on Delivery (UPI / Cash)</Text>
            </View>

            <TouchableOpacity
              style={[
                styles.submitBtn,
                (subtotal === 0 || submitting) && styles.submitBtnDisabled,
              ]}
              onPress={handleSubmitOrder}
              disabled={subtotal === 0 || submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {editingOrderId
                    ? 'Update Pre-Order'
                    : userOrders.length > 0
                    ? 'Place Additional Pre-Order'
                    : 'Submit Pre-Order'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        {!isCreator && !user?.id ? (
          <View style={styles.loginPromptCard}>
            <Text style={styles.loginPromptTitle}>Login to place pre-order</Text>
            <Text style={styles.loginPromptSub}>
              You can browse this menu without login. Sign in to place pre-orders and track your orders.
            </Text>
            <TouchableOpacity
              style={styles.loginPromptBtn}
              onPress={() => router.push('/login' as any)}
              activeOpacity={0.85}
            >
              <Text style={styles.loginPromptBtnText}>Go to login</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {canManageDrop ? (
          <DangerZone
            title="Delete this food drop"
            consequence={`"${drop.title}" and every pre-order placed on it will be permanently removed. Buyers are not notified, and this cannot be undone.`}
            actionLabel="Delete food drop"
            onDelete={handleDeleteDrop}
          />
        ) : null}
      </ScrollView>

      {/* Fullscreen Image Preview Modal */}
      <Modal
        visible={!!selectedImageUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedImageUrl(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedImageUrl(null)}
        >
          {selectedImageUrl ? (
            <Image
              source={{ uri: cloudinaryUrl(selectedImageUrl) }}
              style={styles.modalImage}
              contentFit="contain"
            />
          ) : null}
          <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setSelectedImageUrl(null)}>
            <XCircle size={32} color="#FFFFFF" />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
    padding: 10,
    paddingBottom: 30,
  },
  hostCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Verandah.card,
    borderWidth: VerandahBorder.tile,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.lg,
    padding: 8,
    marginBottom: 8,
    ...Verandah.shadowCard,
  },
  hostMeta: {
    flex: 1,
    marginLeft: 10,
  },
  hostTitle: {
    ...VerandahType.title,
    fontSize: 15,
    color: Verandah.textPrimary,
    marginBottom: 1,
  },
  hostSub: {
    fontSize: 11,
    color: Verandah.textSecondary,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Verandah.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: VerandahRadius.pill,
  },
  shareBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    borderWidth: 0.5,
    marginBottom: 8,
    gap: 8,
  },
  bannerOpen: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  bannerClosed: {
    backgroundColor: '#F3F4F6',
    borderColor: '#D1D5DB',
  },
  bannerIcon: {
    fontSize: 18,
  },
  bannerMainText: {
    fontSize: 12,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  bannerSubText: {
    fontSize: 10,
    color: Verandah.textSecondary,
    marginTop: 1,
  },
  description: {
    ...VerandahType.body,
    fontSize: 12,
    color: Verandah.textSecondary,
    lineHeight: 16,
    marginBottom: 8,
  },
  existingOrderBox: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: Verandah.accent,
    borderRadius: VerandahRadius.lg,
    padding: 8,
    marginBottom: 8,
  },
  existingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  existingTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Verandah.accent,
  },
  existingStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: Verandah.accent,
  },
  existingItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 1,
  },
  existingItemName: {
    fontSize: 12,
    color: Verandah.textPrimary,
  },
  existingItemPrice: {
    fontSize: 12,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  existingTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#C7D2FE',
    marginTop: 4,
    paddingTop: 4,
  },
  existingTotalLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  existingTotalVal: {
    fontSize: 12,
    fontWeight: '700',
    color: Verandah.accent,
  },
  cancelBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  cancelBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Verandah.danger,
  },
  orderLabelText: {
    fontSize: 12,
    fontWeight: '700',
    color: Verandah.textPrimary,
  },
  fulfilledBadgeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Verandah.accentSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  fulfilledBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: Verandah.green600,
  },
  confirmedBadgeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  confirmedBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#2563EB',
  },
  cancelledBadgeInline: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  cancelledBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
  },
  existingDateText: {
    fontSize: 10,
    color: Verandah.textTertiary,
  },
  buyerNoteText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: Verandah.textSecondary,
    marginTop: 4,
  },
  cancellationNoticeBox: {
    backgroundColor: '#FEE2E2',
    borderWidth: 0.5,
    borderColor: '#F87171',
    borderRadius: 6,
    padding: 6,
    marginTop: 6,
    gap: 2,
  },
  cancellationNoticeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#DC2626',
  },
  cancellationNoticeText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#991B1B',
  },
  deliveredNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Verandah.accentSoft,
    padding: 6,
    borderRadius: 6,
    marginTop: 4,
  },
  deliveredNoticeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Verandah.green600,
    flex: 1,
  },
  orderActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: '#C7D2FE',
  },
  editOrderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Verandah.accentSoft,
    borderWidth: 1,
    borderColor: Verandah.accent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  editingOrderBtnActive: {
    backgroundColor: Verandah.accent,
  },
  editOrderBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Verandah.accent,
  },
  cancelOrderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  cancelOrderBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Verandah.danger,
  },
  editingModeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: `${Verandah.primary}0D`,
    borderWidth: 1,
    borderColor: `${Verandah.primary}30`,
    borderRadius: VerandahRadius.md,
    padding: 10,
    marginBottom: 8,
  },
  editingBannerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Verandah.primary,
  },
  editingBannerSub: {
    fontSize: 10,
    color: Verandah.textSecondary,
    marginTop: 1,
  },
  cancelEditBtn: {
    backgroundColor: Verandah.card,
    borderWidth: 1,
    borderColor: Verandah.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: VerandahRadius.md,
    marginLeft: 'auto' as any,
  },
  cancelEditBtnText: {
    fontSize: 10,
    fontWeight: '600',
    color: Verandah.primary,
  },
  sectionHeader: {
    ...VerandahType.sectionLabel,
    color: Verandah.textPrimary,
    marginBottom: 4,
    marginTop: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.md,
    padding: 8,
    marginBottom: 6,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  itemDesc: {
    fontSize: 11,
    color: Verandah.textSecondary,
    marginTop: 1,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  itemPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: Verandah.textPrimary,
  },
  itemUnit: {
    fontSize: 10,
    color: Verandah.textSecondary,
  },
  itemCapText: {
    fontSize: 10,
    color: Verandah.caution,
    marginTop: 2,
  },
  itemCapTextOut: {
    color: Verandah.danger,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: VerandahRadius.pill,
    padding: 3,
  },
  counterBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: '#D1D5DB',
  },
  counterBtnDisabled: {
    opacity: 0.4,
  },
  counterBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  counterVal: {
    fontSize: 13,
    fontWeight: '700',
    color: Verandah.textPrimary,
    minWidth: 14,
    textAlign: 'center',
  },
  formSection: {
    marginTop: 8,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: Verandah.textSecondary,
    marginBottom: 2,
  },
  input: {
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: Verandah.textPrimary,
  },
  multiline: {
    minHeight: 44,
  },
  summaryBox: {
    backgroundColor: '#F9FAFB',
    borderWidth: 0.5,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 8,
    marginVertical: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  summaryVal: {
    fontSize: 15,
    fontWeight: '700',
    color: Verandah.accent,
  },
  paymentNote: {
    fontSize: 10,
    color: Verandah.textSecondary,
    marginTop: 2,
  },
  loginPromptCard: {
    marginTop: 10,
    backgroundColor: '#F9FAFB',
    borderWidth: VerandahBorder.tile,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.lg,
    padding: 10,
    gap: 6,
  },
  loginPromptTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  loginPromptSub: {
    fontSize: 11,
    color: Verandah.textSecondary,
    lineHeight: 16,
  },
  loginPromptBtn: {
    alignSelf: 'flex-start',
    marginTop: 2,
    backgroundColor: Verandah.accent,
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  loginPromptBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  hostNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: VerandahRadius.lg,
    padding: 10,
    marginBottom: 8,
    gap: 8,
  },
  hostNoticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Verandah.accent,
    marginBottom: 2,
  },
  hostNoticeSub: {
    fontSize: 11,
    color: Verandah.textSecondary,
    lineHeight: 15,
    marginBottom: 6,
  },
  hostManageBtn: {
    alignSelf: 'flex-start',
    backgroundColor: Verandah.accent,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: VerandahRadius.pill,
  },
  hostManageBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  submitBtn: {
    backgroundColor: Verandah.accent,
    paddingVertical: 12,
    borderRadius: VerandahRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  heroImageWrap: {
    borderRadius: VerandahRadius.lg,
    overflow: 'hidden',
    marginBottom: 8,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  itemThumb: {
    width: 48,
    height: 48,
    borderRadius: VerandahRadius.md,
    marginRight: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalImage: {
    width: '90%',
    height: '80%',
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 40,
    right: 20,
  },
});
