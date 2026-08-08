import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Avatar } from '../../../components/Avatar';
import { RatingStars } from '../../../components/RatingStars';
import { Rupees } from '../../../components/Rupees';
import { Verandah } from '../../../constants/Colors';
import { VerandahRadius, VerandahType } from '../../../constants/Verandah';
import { useAuth } from '../../../context/AuthContext';
import { cloudinaryUrl } from '../../../lib/cloudinary';
import { buildMcnHeaderOptions } from '../../../lib/mcnHeader';
import { goBackSmart } from '../../../lib/navigation';
import { buildWhatsAppUrl, toLast10Digits } from '../../../lib/phone';
import { supabase } from '../../../lib/supabase';

interface Product {
  id: string;
  name: string;
  description: string | null;
  unit: 'kg' | 'piece' | 'litre' | 'dozen' | 'box' | 'pack';
  price: number | null;
  item_type: 'product' | 'service';
  image_url: string | null;
  is_available: boolean;
}

interface Listing {
  id: string;
  name: string;
  description: string | null;
  contact_phone: string | null;
  owner_id: string;
  image_url: string | null;
  category: { name: string; emoji: string } | null;
  profiles: { full_name: string; flat_number: string | null; phone_number: string | null } | null;
}

interface CartItem {
  productId: string;
  name: string;
  price: number;
  unit: string;
  quantity: number;
}

export default function ListingDetailScreen() {
  const { id: listingId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, communityId, profile, refreshSession, isCommunityLead } = useAuth();
  const colors = Verandah;
  const scrollViewRef = useRef<ScrollView>(null);

  const [listing, setListing] = useState<Listing | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [existingOrder, setExistingOrder] = useState<any | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [buyerNote, setBuyerNote] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  // Review & Rating state
  const [publicReviews, setPublicReviews] = useState<any[]>([]);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [selectedRating, setSelectedRating] = useState<number>(0);
  const [reviewText, setReviewText] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);

  // Report state
  const [hasReported, setHasReported] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedReportReason, setSelectedReportReason] = useState<string | null>(null);
  const [reportDetails, setReportDetails] = useState('');
  const [isReporting, setIsReporting] = useState(false);

  const REPORT_REASONS = [
    { key: 'wrong_info', label: 'Wrong info' },
    { key: 'spam', label: 'Spam' },
    { key: 'inappropriate', label: 'Inappropriate' },
    { key: 'unavailable', label: 'No longer available' },
    { key: 'other', label: 'Other' },
  ];

  const handleGoBack = () => {
    goBackSmart(router, `/mcn/listing/${listingId}`);
  };

  const fetchPublicReviews = useCallback(async () => {
    if (!listingId) return;
    setReviewsLoading(true);
    try {
      const { data, error } = await supabase
        .from('ratings')
        .select('id, rating, review_text, created_at, user_id')
        .eq('listing_id', listingId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        const userIds = data.map((r: any) => r.user_id);
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name, flat_number')
          .in('id', userIds);
        if (profilesError) throw profilesError;

        const formatted = data.map((r: any) => {
          const p = profiles?.find((prof: any) => prof.id === r.user_id);
          return {
            id: r.id,
            reviewer_name: p?.full_name || 'Resident',
            reviewer_flat: p?.flat_number || null,
            rating: r.rating,
            review_text: r.review_text,
            created_at: r.created_at,
          };
        });
        setPublicReviews(formatted);
      } else {
        setPublicReviews([]);
      }
    } catch (e) {
      console.error('Error fetching public reviews:', e);
    } finally {
      setReviewsLoading(false);
    }
  }, [listingId]);

  const fetchListingData = useCallback(async () => {
    if (!listingId || !user?.id) return;
    try {
      // 1. Fetch listing details and owner profile
      const { data: listingData, error: listingError } = await supabase
        .from('mcn_listings')
        .select(`
          id, name, description, contact_phone, owner_id, image_url,
          category:mcn_business_categories(name, emoji),
          profiles!owner_id(full_name, flat_number, phone_number)
        `)
        .eq('id', listingId)
        .maybeSingle();

      if (listingError) throw listingError;
      if (!listingData) throw new Error('Listing not found');
      const categoryRel = Array.isArray((listingData as any).category)
        ? (listingData as any).category[0] || null
        : (listingData as any).category || null;
      setListing({ ...(listingData as any), category: categoryRel } as Listing);

      // 2. Fetch products for this listing
      const { data: productsData, error: productsError } = await supabase
        .from('mcn_products')
        .select('*')
        .eq('listing_id', listingId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (productsError) throw productsError;
      setProducts(productsData as Product[]);

      // 3. Fetch existing pending order (if any)
      const { data: orderData, error: orderError } = await supabase
        .from('mcn_orders')
        .select('*, mcn_order_items(*)')
        .eq('listing_id', listingId)
        .eq('buyer_id', user.id)
        .eq('status', 'pending')
        .maybeSingle();

      if (orderError) throw orderError;
      setExistingOrder(orderData);

      if (orderData) {
        setBuyerNote(orderData.buyer_note || '');
        setBuyerPhone(orderData.buyer_phone || '');
        const existingQuantities: Record<string, number> = {};
        orderData.mcn_order_items.forEach((item: any) => {
          existingQuantities[item.product_id] = Number(item.quantity);
        });
        setQuantities(existingQuantities);
      } else {
        setBuyerPhone(profile?.phone_number || '');
      }

      // 4. Fetch user's rating for this listing
      const { data: myRatingData, error: myRatingError } = await supabase
        .from('ratings')
        .select('rating, review_text')
        .eq('listing_id', listingId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!myRatingError && myRatingData) {
        setUserRating(myRatingData.rating);
        setSelectedRating(myRatingData.rating);
        setReviewText(myRatingData.review_text || '');
      } else {
        setUserRating(null);
        setSelectedRating(0);
        setReviewText('');
      }

      // 5. Fetch public reviews
      await fetchPublicReviews();

      // 6. Has the current user already reported this listing?
      const { data: reportData } = await supabase
        .from('mcn_listing_reports')
        .select('id')
        .eq('listing_id', listingId)
        .eq('reported_by', user.id)
        .maybeSingle();
      setHasReported(!!reportData);
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error loading business details' });
    } finally {
      setLoading(false);
    }
  }, [listingId, user?.id, profile?.phone_number, fetchPublicReviews]);

  const handleSubmitReport = async () => {
    if (!listingId || !user || !selectedReportReason) return;
    setIsReporting(true);
    try {
      const detailsValue = selectedReportReason === 'other' ? reportDetails.trim() : null;
      if (selectedReportReason === 'other' && !detailsValue) {
        Toast.show({ type: 'error', text1: 'Details required', text2: 'Please explain the issue.' });
        setIsReporting(false);
        return;
      }

      const { error } = await supabase.from('mcn_listing_reports').insert({
        listing_id: listingId,
        reported_by: user.id,
        reason: selectedReportReason,
        details: detailsValue,
      });

      if (error) {
        if (error.code === '23505') {
          setHasReported(true);
          Toast.show({ type: 'info', text1: 'Already reported', text2: 'You have already reported this listing.' });
          setShowReportModal(false);
        } else {
          throw error;
        }
      } else {
        setHasReported(true);
        Toast.show({ type: 'success', text1: 'Report submitted', text2: 'Community leads will review this listing.' });
        setShowReportModal(false);
        setSelectedReportReason(null);
        setReportDetails('');
      }
    } catch (error) {
      console.error('Error submitting report:', error);
      Toast.show({ type: 'error', text1: 'Failed to submit report' });
    } finally {
      setIsReporting(false);
    }
  };

  useEffect(() => {
    fetchListingData();
  }, [fetchListingData]);

  const contactPhone = listing?.contact_phone || listing?.profiles?.phone_number;

  const handleCall = () => {
    if (!contactPhone) return;
    Linking.openURL(`tel:${contactPhone}`);
  };

  const handleWhatsApp = () => {
    if (!contactPhone) return;
    const text = `Hi ${listing?.profiles?.full_name || 'there'}, I found your business "${listing?.name}" on Wooru and wanted to enquire about your services.`;
    const url = buildWhatsAppUrl(contactPhone, text);
    if (url) {
      Linking.openURL(url);
    } else {
      Toast.show({ type: 'error', text1: 'Invalid phone number for WhatsApp' });
    }
  };

  const handleRating = (rating: number) => {
    setSelectedRating(rating);
  };

  const handleQuantityChange = (productId: string, delta: number, unit: string) => {
    const isDecimal = unit === 'kg' || unit === 'litre';
    const step = isDecimal ? 0.5 : 1;
    const current = quantities[productId] || 0;
    const next = Math.max(0, Math.round((current + delta * step) * 10) / 10);

    setQuantities((prev) => {
      const updated = { ...prev };
      if (next === 0) {
        delete updated[productId];
      } else {
        updated[productId] = next;
      }
      return updated;
    });
  };

  const handleSubmitOrder = async () => {
    if (!listingId || !user) return;
    if (!buyerPhone || toLast10Digits(buyerPhone).length !== 10) {
      Toast.show({ type: 'error', text1: 'Valid phone required', text2: 'Please enter a 10-digit contact number' });
      return;
    }

    const itemsPayload = Object.entries(quantities)
      .filter(([_, q]) => q > 0)
      .map(([product_id, quantity]) => ({ product_id, quantity }));

    if (itemsPayload.length === 0) {
      Toast.show({ type: 'error', text1: 'No items selected', text2: 'Please select at least one item' });
      return;
    }

    setIsPlacingOrder(true);
    try {
      const { data, error } = await supabase.rpc('place_mcn_order', {
        p_listing_id: listingId,
        p_items: itemsPayload,
        p_buyer_phone: buyerPhone.trim(),
        p_buyer_note: buyerNote.trim() || null,
        p_order_id: existingOrder?.id || null,
      });

      if (error) throw error;

      Toast.show({
        type: 'success',
        text1: existingOrder ? 'Order updated!' : 'Order placed successfully!',
        text2: 'The seller has received your order.',
      });

      setShowOrderModal(false);
      fetchListingData();
    } catch (error: any) {
      console.error('Error placing order:', error);
      Toast.show({ type: 'error', text1: 'Failed to place order', text2: error?.message });
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const handleSubmitReview = async () => {
    const effectiveRating = selectedRating || userRating || 0;
    const hadExistingReview = userRating != null;

    if (!listingId || !user || effectiveRating === 0) {
      Toast.show({ type: 'error', text1: 'Rating required', text2: 'Please tap a star to rate this business' });
      return;
    }

    setIsSubmittingReview(true);
    try {
      const { error } = await supabase
        .from('ratings')
        .upsert(
          {
            user_id: user.id,
            listing_id: listingId,
            rating: effectiveRating,
            review_text: reviewText.trim() || null,
            fraud_status: 'pass',
            fraud_rules_triggered: [],
          },
          { onConflict: 'user_id,listing_id' }
        );

      if (error) throw error;

      Toast.show({ type: 'success', text1: hadExistingReview ? 'Review updated' : 'Review submitted' });

      // Update local rating
      setUserRating(effectiveRating);
      setSelectedRating(effectiveRating);
      setReviewText(reviewText.trim());
      await fetchPublicReviews();
      scrollViewRef.current?.scrollToEnd({ animated: true });
    } catch (error) {
      console.error('Error saving review:', error);
      const message = error instanceof Error ? error.message : String(error);
      Toast.show({ type: 'error', text1: 'Error saving review', text2: message });
    } finally {
      setIsSubmittingReview(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!listing) {
    return (
      <View style={styles.loaderWrap}>
        <Text style={{ color: colors.textSecondary }}>Business listing not found.</Text>
      </View>
    );
  }

  const ratingCount = publicReviews.length;
  const avgRating = ratingCount > 0 ? publicReviews.reduce((sum, r) => sum + r.rating, 0) / ratingCount : 0;
  const isReviewSubmitDisabled = isSubmittingReview || (selectedRating === 0 && !userRating);
  const hasExistingReview = userRating != null;
  const visibleReviews = showAllReviews ? publicReviews : publicReviews.slice(0, 3);
  const productItems = products.filter((item) => item.item_type !== 'service');
  const serviceItems = products.filter((item) => item.item_type === 'service');

  const totalOrderUnits = Object.values(quantities).reduce((a, b) => a + b, 0);
  const totalOrderAmount = Object.entries(quantities).reduce((sum, [productId, qty]) => {
    const p = products.find((prod) => prod.id === productId);
    return sum + (p?.price ? Number(p.price) * qty : 0);
  }, 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.scroll}
        contentContainerStyle={[styles.contentContainer, totalOrderUnits > 0 && { paddingBottom: 80 }]}
        keyboardShouldPersistTaps="handled"
      >
      <Stack.Screen
        options={buildMcnHeaderOptions({
          title: listing.name,
          onBack: handleGoBack,
          headerRight: user?.id === listing.owner_id || isCommunityLead ? () => (
            <TouchableOpacity
              onPress={() => router.push(`/mcn/listing/manage/${listing.id}` as any)}
              style={{
                backgroundColor: colors.primary,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: VerandahRadius.pill,
                marginRight: 6,
              }}
            >
              <Text style={{ color: colors.primaryFg, fontSize: 12, fontWeight: '600' }}>Edit details</Text>
            </TouchableOpacity>
          ) : undefined,
        })}
      />

      {listing.image_url ? (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => setSelectedImageUrl(listing.image_url || null)}
        >
          <Image
            source={{ uri: cloudinaryUrl(listing.image_url) }}
            style={styles.heroImage}
            contentFit="cover"
            transition={300}
          />
        </TouchableOpacity>
      ) : null}

      <View style={styles.ownerCard}>
        <Avatar name={listing.profiles?.full_name || 'Resident'} size={48} />
        <View style={styles.ownerInfo}>
          <Text style={[styles.ownerName, { color: colors.textPrimary }]}>
            {listing.profiles?.full_name || 'Resident'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
            <Text style={[styles.ownerFlat, { color: colors.textTertiary, marginRight: 8 }]}>
              {listing.profiles?.flat_number ? `Flat ${listing.profiles.flat_number}` : 'Resident'}
            </Text>
            {ratingCount > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="star" size={14} color="#F59E0B" />
                <Text style={{ fontSize: 13, color: colors.textPrimary, marginLeft: 2, fontWeight: '500' }}>
                  {avgRating.toFixed(1)}
                </Text>
                <Text style={{ fontSize: 13, color: colors.textTertiary, marginLeft: 1 }}>
                  ({ratingCount})
                </Text>
              </View>
            )}
          </View>
          {listing.category ? (
            <View style={styles.categoryBadge}>
              <Text style={[styles.categoryBadgeText, { color: colors.textSecondary }]}>
                {listing.category.emoji} {listing.category.name}
              </Text>
            </View>
          ) : null}
        </View>

        {contactPhone ? (
          <View style={styles.contactActions}>
            <TouchableOpacity onPress={handleCall} style={[styles.contactIconBtn, { borderColor: colors.border }]}>
              <Ionicons name="call-outline" size={20} color={colors.accent} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleWhatsApp} style={[styles.contactIconBtn, { borderColor: colors.border }]}>
              <Ionicons name="logo-whatsapp" size={20} color={colors.accent} />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {listing.description ? (
        <View style={styles.descriptionSection}>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {listing.description}
          </Text>
        </View>
      ) : null}

      {user?.id !== listing.owner_id ? (
        <TouchableOpacity
          style={styles.reportLink}
          onPress={() => (hasReported ? undefined : setShowReportModal(true))}
          disabled={hasReported}
          activeOpacity={0.7}
        >
          <Ionicons name="flag-outline" size={13} color={hasReported ? colors.textMuted : colors.textTertiary} />
          <Text style={[styles.reportLinkText, { color: hasReported ? colors.textMuted : colors.textTertiary }]}>
            {hasReported ? 'Reported' : 'Report this listing'}
          </Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.divider} />

      {products.length === 0 ? (
        <Text style={[styles.emptyProducts, { color: colors.textMuted }]}>
          No offerings listed by this business yet.
        </Text>
      ) : (
        <>
          {productItems.length > 0 ? (
            <View style={styles.offeringsSection}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Products</Text>
              <View style={styles.productsList}>
                {productItems.map((product) => (
                  <View
                    key={product.id}
                    style={[
                      styles.productRow,
                      { borderColor: colors.border },
                      !product.is_available && styles.productUnavailable,
                    ]}
                  >
                    {(product as any).image_url ? (
                      <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() => setSelectedImageUrl((product as any).image_url || null)}
                      >
                        <Image
                          source={{
                            uri: cloudinaryUrl((product as any).image_url, {
                              width: 120,
                              height: 120,
                              crop: 'fill',
                            }),
                          }}
                          style={styles.productThumb}
                          contentFit="cover"
                          transition={200}
                        />
                      </TouchableOpacity>
                    ) : null}
                    <View style={styles.productLeft}>
                      <Text style={[styles.productName, { color: colors.textPrimary }]}>{product.name}</Text>
                      {product.description ? (
                        <Text style={[styles.productDesc, { color: colors.textSecondary }]}>{product.description}</Text>
                      ) : null}
                      <View style={styles.priceContainer}>
                        {product.price == null ? (
                          <Text style={[styles.priceOnRequestText, { color: colors.textTertiary }]}>Price on request</Text>
                        ) : (
                          <>
                            <Rupees amount={Number(product.price)} size="sm" />
                            <Text style={[styles.unitText, { color: colors.textTertiary }]}> / {product.unit}</Text>
                          </>
                        )}
                      </View>
                    </View>

                    {!product.is_available ? (
                      <View style={styles.unavailableBadge}>
                        <Text style={[styles.unavailableText, { color: colors.textMuted }]}>Not available</Text>
                      </View>
                    ) : user?.id !== listing.owner_id && product.price != null ? (
                      <View style={styles.qtyControls}>
                        {quantities[product.id] ? (
                          <>
                            <TouchableOpacity
                              style={[styles.qtyBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                              onPress={() => handleQuantityChange(product.id, -1, product.unit)}
                            >
                              <Ionicons name="remove" size={16} color={colors.textPrimary} />
                            </TouchableOpacity>
                            <Text style={[styles.qtyDisplay, { color: colors.textPrimary }]}>
                              {quantities[product.id]} {product.unit}
                            </Text>
                          </>
                        ) : null}
                        <TouchableOpacity
                          style={[styles.qtyBtn, { borderColor: colors.primary, backgroundColor: colors.primary }]}
                          onPress={() => handleQuantityChange(product.id, 1, product.unit)}
                        >
                          <Ionicons name="add" size={16} color={colors.primaryFg} />
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {serviceItems.length > 0 ? (
            <View style={styles.offeringsSection}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Services</Text>
              <View style={styles.productsList}>
                {serviceItems.map((product) => (
                  <View
                    key={product.id}
                    style={[
                      styles.productRow,
                      { borderColor: colors.border },
                      !product.is_available && styles.productUnavailable,
                    ]}
                  >
                    {(product as any).image_url ? (
                      <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() => setSelectedImageUrl((product as any).image_url || null)}
                      >
                        <Image
                          source={{
                            uri: cloudinaryUrl((product as any).image_url, {
                              width: 120,
                              height: 120,
                              crop: 'fill',
                            }),
                          }}
                          style={styles.productThumb}
                          contentFit="cover"
                          transition={200}
                        />
                      </TouchableOpacity>
                    ) : null}
                    <View style={styles.productLeft}>
                      <Text style={[styles.productName, { color: colors.textPrimary }]}>{product.name}</Text>
                      {product.description ? (
                        <Text style={[styles.productDesc, { color: colors.textSecondary }]}>{product.description}</Text>
                      ) : null}
                      <View style={styles.priceContainer}>
                        {product.price == null ? (
                          <Text style={[styles.priceOnRequestText, { color: colors.textTertiary }]}>Price on request</Text>
                        ) : (
                          <>
                            <Rupees amount={Number(product.price)} size="sm" />
                            <Text style={[styles.unitText, { color: colors.textTertiary }]}> / {product.unit}</Text>
                          </>
                        )}
                      </View>
                    </View>

                    {!product.is_available ? (
                      <View style={styles.unavailableBadge}>
                        <Text style={[styles.unavailableText, { color: colors.textMuted }]}>Not available</Text>
                      </View>
                    ) : user?.id !== listing.owner_id && product.price != null ? (
                      <View style={styles.qtyControls}>
                        {quantities[product.id] ? (
                          <>
                            <TouchableOpacity
                              style={[styles.qtyBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                              onPress={() => handleQuantityChange(product.id, -1, product.unit)}
                            >
                              <Ionicons name="remove" size={16} color={colors.textPrimary} />
                            </TouchableOpacity>
                            <Text style={[styles.qtyDisplay, { color: colors.textPrimary }]}>
                              {quantities[product.id]} {product.unit}
                            </Text>
                          </>
                        ) : null}
                        <TouchableOpacity
                          style={[styles.qtyBtn, { borderColor: colors.primary, backgroundColor: colors.primary }]}
                          onPress={() => handleQuantityChange(product.id, 1, product.unit)}
                        >
                          <Ionicons name="add" size={16} color={colors.primaryFg} />
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </>
      )}

      <View style={styles.divider} />

      {/* Community Reviews List */}
      <View style={styles.detailsCard}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 12 }]}>Community Reviews</Text>
        {reviewsLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : publicReviews.length === 0 ? (
          <Text style={[styles.emptyProducts, { color: colors.textMuted, marginTop: 8 }]}>No community reviews yet.</Text>
        ) : (
          <View style={styles.publicReviewList}>
            {visibleReviews.map((review, index) => (
              <View
                key={review.id}
                style={[
                  styles.publicReviewItem,
                  index > 0 && { borderTopColor: colors.border, borderTopWidth: 0.5 },
                ]}
              >
                <View style={styles.publicReviewHeader}>
                  <View style={styles.publicReviewIdentity}>
                    <Text style={[styles.publicReviewName, { color: colors.textPrimary }]}>
                      {review.reviewer_name}
                      {review.reviewer_flat ? ` · ${review.reviewer_flat}` : ''}
                    </Text>
                    <Text style={[styles.publicReviewDate, { color: colors.textTertiary }]}>
                      {new Date(review.created_at).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>
                  <Text style={styles.publicReviewStars}>
                    {'★'.repeat(review.rating)}{'☆'.repeat(Math.max(0, 5 - review.rating))}
                  </Text>
                </View>
                {review.review_text ? (
                  <Text style={[styles.publicReviewText, { color: colors.textSecondary, marginTop: 8 }]}>{review.review_text}</Text>
                ) : null}
              </View>
            ))}
            {publicReviews.length > 3 ? (
              <TouchableOpacity
                onPress={() => setShowAllReviews((prev) => !prev)}
                style={[styles.loadMoreReviewsBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.loadMoreReviewsText, { color: colors.accent }]}>
                  {showAllReviews ? 'Show less' : `Load more (${publicReviews.length - 3})`}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </View>

      {/* Rate Business Card - Only for non-owners */}
      {user?.id !== listing.owner_id && (
        <View style={styles.detailsCard}>
           <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 6 }]}>Rate this Business</Text>
           <RatingStars rating={selectedRating || userRating || 0} onRating={handleRating} size={32} isLightMode={true} />
           {selectedRating === 0 && !userRating && (
             <Text style={[styles.tapHint, { color: colors.accent, marginTop: 4, marginBottom: 4 }]}>⬆ Tap a star above to rate (required)</Text>
           )}
           <TextInput
             style={[styles.reviewInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface, marginTop: 6, minHeight: 60 }]}
             placeholder="Share your experience... (optional)"
             placeholderTextColor={colors.textMuted}
             value={reviewText}
             onChangeText={setReviewText}
             multiline
             numberOfLines={2}
             textAlignVertical="top"
           />
           <TouchableOpacity
             onPress={handleSubmitReview}
             disabled={isReviewSubmitDisabled}
             activeOpacity={0.85}
             style={[
               styles.submitReviewBtn,
               { marginTop: 8, height: 42, backgroundColor: isReviewSubmitDisabled ? colors.cardMuted : colors.primary },
               isReviewSubmitDisabled && [styles.submitReviewBtnDisabled, { borderColor: colors.border }],
             ]}
           >
             {isSubmittingReview
               ? <ActivityIndicator color={colors.primaryFg} />
               : (
                 <Text style={[styles.submitReviewText, { color: isReviewSubmitDisabled ? colors.textMuted : colors.primaryFg }]}>
                   {hasExistingReview ? 'Update review' : 'Submit review'}
                 </Text>
               )
             }
           </TouchableOpacity>
           <Text style={[styles.reviewNote, { color: colors.textSecondary, marginTop: 6 }]}>Reviews are only visible to our community members.</Text>
        </View>
      )}

      <Modal
        visible={!!selectedImageUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedImageUrl(null)}
      >
        <Pressable style={styles.viewerOverlay} onPress={() => setSelectedImageUrl(null)}>
          <TouchableOpacity
            style={styles.viewerCloseBtn}
            onPress={(e) => {
              e.stopPropagation();
              setSelectedImageUrl(null);
            }}
          >
            <Ionicons name="close" size={24} color={colors.surface} />
          </TouchableOpacity>
          <Pressable onPress={(e) => e.stopPropagation()} style={styles.viewerImageWrap}>
            <Image
              source={{ uri: cloudinaryUrl(selectedImageUrl || '') }}
              style={styles.viewerImage}
              contentFit="contain"
              transition={200}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showReportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReportModal(false)}
      >
        <Pressable style={styles.reportOverlay} onPress={() => setShowReportModal(false)}>
          <Pressable style={[styles.reportCard, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Report this listing</Text>
            <View style={styles.reportReasonList}>
              {REPORT_REASONS.map((reason) => {
                const isSelected = selectedReportReason === reason.key;
                return (
                  <TouchableOpacity
                    key={reason.key}
                    style={[
                      styles.reportReasonChip,
                      { borderColor: colors.border },
                      isSelected && { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
                    ]}
                    onPress={() => setSelectedReportReason(reason.key)}
                  >
                    <Text style={[styles.reportReasonText, { color: isSelected ? colors.danger : colors.textSecondary }]}>
                      {reason.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {selectedReportReason === 'other' ? (
              <TextInput
                style={[styles.reviewInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface, marginTop: 10, minHeight: 60 }]}
                placeholder="Briefly explain the issue"
                placeholderTextColor={colors.textMuted}
                value={reportDetails}
                onChangeText={setReportDetails}
                multiline
              />
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.reportCancelBtn, { borderColor: colors.border }]}
                onPress={() => setShowReportModal(false)}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '500' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.reportSubmitBtn, { backgroundColor: selectedReportReason ? colors.danger : colors.cardMuted }]}
                onPress={handleSubmitReport}
                disabled={!selectedReportReason || isReporting}
              >
                {isReporting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={{ color: selectedReportReason ? '#FFFFFF' : colors.textMuted, fontSize: 14, fontWeight: '600' }}>
                    Submit report
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      </ScrollView>

      {/* Floating Cart Bar for Non-Owners */}
      {user?.id !== listing.owner_id && totalOrderUnits > 0 && (
        <View style={[styles.cartBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cartBarInfo}>
            <Text style={[styles.cartBarLabel, { color: colors.textSecondary }]}>
              {totalOrderUnits} {totalOrderUnits === 1 ? 'item' : 'items'}
            </Text>
            <Rupees amount={totalOrderAmount} size="md" tone="in" />
          </View>
          <TouchableOpacity
            style={[styles.cartBarBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
            onPress={() => setShowOrderModal(true)}
          >
            <Ionicons name="bag-check-outline" size={18} color={colors.primaryFg} />
            <Text style={[styles.cartBarBtnText, { color: colors.primaryFg }]}>
              {existingOrder ? 'Update Order' : 'Review & Order'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Order Confirmation Modal */}
      <Modal
        visible={showOrderModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowOrderModal(false)}
      >
        <Pressable style={styles.orderOverlay} onPress={() => setShowOrderModal(false)}>
          <Pressable style={[styles.orderModalCard, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {existingOrder ? 'Update Your Order' : 'Confirm Your Order'}
            </Text>
            <Text style={[styles.orderModalSubtitle, { color: colors.textSecondary }]}>
              Ordering from {listing.name}
            </Text>

            {/* Items Summary in Modal */}
            <ScrollView style={styles.modalItemsList} showsVerticalScrollIndicator={false}>
              {Object.entries(quantities).filter(([_, q]) => q > 0).map(([productId, qty]) => {
                const prod = products.find((p) => p.id === productId);
                const subtotal = prod?.price ? Number(prod.price) * qty : 0;
                return (
                  <View key={productId} style={styles.modalItemRow}>
                    <Text style={[styles.modalItemName, { color: colors.textPrimary }]}>
                      {prod?.name || 'Item'} × {qty} {prod?.unit || ''}
                    </Text>
                    <Rupees amount={subtotal} size="sm" />
                  </View>
                );
              })}
              <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
              <View style={styles.modalTotalRow}>
                <Text style={[styles.totalLabel, { color: colors.textPrimary }]}>Total Amount</Text>
                <Rupees amount={totalOrderAmount} size="md" tone="in" />
              </View>
            </ScrollView>

            {/* Buyer Contact & Note */}
            <View style={styles.orderInputsWrap}>
              <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Contact Phone (10 digits)</Text>
              <TextInput
                style={[styles.inputField, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary }]}
                placeholder="10-digit mobile number"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                value={buyerPhone}
                onChangeText={setBuyerPhone}
              />

              <Text style={[styles.inputLabel, { color: colors.textPrimary, marginTop: 8 }]}>Note for seller (optional)</Text>
              <TextInput
                style={[styles.inputField, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary, minHeight: 44 }]}
                placeholder="Special instructions or timing..."
                placeholderTextColor={colors.textMuted}
                value={buyerNote}
                onChangeText={setBuyerNote}
                multiline
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.reportCancelBtn, { borderColor: colors.border }]}
                onPress={() => setShowOrderModal(false)}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '500' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.reportSubmitBtn, { backgroundColor: colors.primary }]}
                onPress={handleSubmitOrder}
                disabled={isPlacingOrder}
              >
                {isPlacingOrder ? (
                  <ActivityIndicator color={colors.primaryFg} size="small" />
                ) : (
                  <Text style={{ color: colors.primaryFg, fontSize: 14, fontWeight: '600' }}>
                    {existingOrder ? 'Update Order' : 'Place Order'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 14,
    paddingTop: 0,
    paddingBottom: 24,
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroImage: {
    width: '100%',
    height: 105,
    borderRadius: VerandahRadius.md,
    marginBottom: 6,
  },
  productThumb: {
    width: 40,
    height: 40,
    borderRadius: VerandahRadius.md,
    marginRight: 8,
  },
  ownerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  ownerInfo: {
    flex: 1,
    marginLeft: 8,
  },
  ownerName: {
    ...VerandahType.bodyBold,
  },
  ownerFlat: {
    ...VerandahType.caption,
    marginTop: 1,
  },
  categoryBadge: {
    marginTop: 2,
    alignSelf: 'flex-start',
    borderRadius: VerandahRadius.pill,
    backgroundColor: Verandah.cardMuted,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  categoryBadgeText: {
    ...VerandahType.caption,
  },
  contactActions: {
    flexDirection: 'row',
    gap: 8,
  },
  contactIconBtn: {
    borderWidth: 1,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  descriptionSection: {
    marginBottom: 6,
  },
  description: {
    ...VerandahType.body,
    lineHeight: 18,
  },
  divider: {
    height: 0.5,
    backgroundColor: Verandah.border,
    marginVertical: 6,
  },
  sectionTitle: {
    ...VerandahType.title,
    fontSize: 15,
    marginBottom: 8,
  },
  offeringsSection: {
    marginBottom: 10,
  },
  productsList: {
    gap: 8,
  },
  emptyProducts: {
    ...VerandahType.body,
    fontStyle: 'italic',
  },
  productRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
  },
  productUnavailable: {
    opacity: 0.55,
  },
  productLeft: {
    flex: 1,
    marginRight: 12,
  },
  productName: {
    ...VerandahType.bodyBold,
  },
  productDesc: {
    ...VerandahType.caption,
    marginTop: 2,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  priceOnRequestText: {
    ...VerandahType.caption,
    fontStyle: 'italic',
  },
  unitText: {
    ...VerandahType.caption,
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyDisplay: {
    ...VerandahType.captionBold,
    minWidth: 50,
    textAlign: 'center',
  },
  unavailableBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  unavailableText: {
    ...VerandahType.caption,
  },
  detailsCard: {
    padding: 10,
    borderRadius: VerandahRadius.lg,
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    marginBottom: 10,
  },
  viewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
  viewerImageWrap: {
    width: '100%',
    height: '100%',
  },
  viewerCloseBtn: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 2,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  publicReviewList: {
    gap: 12,
    marginTop: 8,
  },
  publicReviewItem: {
    paddingVertical: 12,
  },
  publicReviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  publicReviewIdentity: {
    flex: 1,
    marginRight: 8,
  },
  publicReviewName: {
    ...VerandahType.bodyBold,
  },
  publicReviewDate: {
    ...VerandahType.caption,
    marginTop: 2,
  },
  publicReviewStars: {
    fontSize: 14,
    color: '#F59E0B',
  },
  publicReviewText: {
    ...VerandahType.body,
    lineHeight: 18,
  },
  loadMoreReviewsBtn: {
    borderWidth: 0.5,
    borderRadius: VerandahRadius.pill,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  loadMoreReviewsText: {
    fontSize: 13,
    fontWeight: '500',
  },
  tapHint: {
    ...VerandahType.caption,
    marginBottom: 12,
  },
  reviewInput: {
    borderWidth: 1,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 80,
    marginTop: 12,
  },
  submitReviewBtn: {
    height: 48,
    borderRadius: VerandahRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitReviewBtnDisabled: {
    opacity: 0.5,
  },
  submitReviewText: {
    fontSize: 14,
    fontWeight: '600',
  },
  reviewNote: {
    ...VerandahType.caption,
    textAlign: 'center',
    marginTop: 8,
  },
  headerBackBtn: {
    marginLeft: 2,
    padding: 6,
  },
  reportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  reportLinkText: {
    fontSize: 11,
    fontWeight: '500',
  },
  reportOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  reportCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: VerandahRadius.lg,
    padding: 16,
  },
  reportReasonList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  reportReasonChip: {
    borderWidth: 1,
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  reportReasonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  reportCancelBtn: {
    flex: 1,
    height: 42,
    borderRadius: VerandahRadius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportSubmitBtn: {
    flex: 1,
    height: 42,
    borderRadius: VerandahRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    elevation: 8,
  },
  cartBarInfo: {
    flex: 1,
  },
  cartBarLabel: {
    ...VerandahType.caption,
    fontSize: 12,
  },
  cartBarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: VerandahRadius.pill,
    gap: 6,
  },
  cartBarBtnText: {
    ...VerandahType.bodyBold,
    fontSize: 13,
  },
  orderOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  orderModalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: VerandahRadius.lg,
    padding: 20,
    maxHeight: '85%',
  },
  orderModalSubtitle: {
    ...VerandahType.caption,
    fontSize: 13,
    marginBottom: 12,
  },
  modalItemsList: {
    maxHeight: 180,
    marginVertical: 6,
  },
  modalItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  modalItemName: {
    ...VerandahType.body,
    fontSize: 13,
  },
  modalTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  rowDivider: {
    height: 1,
    marginVertical: 8,
  },
  totalLabel: {
    ...VerandahType.bodyBold,
    fontSize: 14,
  },
  orderInputsWrap: {
    marginTop: 8,
  },
  inputLabel: {
    ...VerandahType.captionBold,
    fontSize: 12,
    marginBottom: 4,
  },
  inputField: {
    borderWidth: 1,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
});
