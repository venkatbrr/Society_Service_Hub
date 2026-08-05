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
import { buildMcnHeaderOptions } from '../../../lib/mcnHeader';
import { goBackSmart } from '../../../lib/navigation';
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

  // Review & Rating state
  const [publicReviews, setPublicReviews] = useState<any[]>([]);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [selectedRating, setSelectedRating] = useState<number>(0);
  const [reviewText, setReviewText] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);

  const handleGoBack = () => {
    goBackSmart(router, `/network/listing/${listingId}`);
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
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error loading business details' });
    } finally {
      setLoading(false);
    }
  }, [listingId, user?.id, profile?.phone_number, fetchPublicReviews]);

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
    const text = encodeURIComponent(
      `Hi ${listing?.profiles?.full_name || 'there'}, I found your business "${listing?.name}" on Society Hub and wanted to enquire about your services.`
    );
    Linking.openURL(`whatsapp://send?phone=91${contactPhone}&text=${text}`);
  };

  const handleRating = (rating: number) => {
    setSelectedRating(rating);
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

  return (
    <ScrollView
      ref={scrollViewRef}
      style={[styles.container, { backgroundColor: colors.surface }]}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen
        options={buildMcnHeaderOptions({
          title: listing.name,
          onBack: handleGoBack,
          headerRight: user?.id === listing.owner_id || isCommunityLead ? () => (
            <TouchableOpacity
              onPress={() => router.push(`/network/listing/manage/${listing.id}` as any)}
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
            source={{ uri: listing.image_url }}
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
                          source={{ uri: (product as any).image_url }}
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

                    {!product.is_available && (
                      <View style={styles.unavailableBadge}>
                        <Text style={[styles.unavailableText, { color: colors.textMuted }]}>Not available</Text>
                      </View>
                    )}
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
                          source={{ uri: (product as any).image_url }}
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

                    {!product.is_available && (
                      <View style={styles.unavailableBadge}>
                        <Text style={[styles.unavailableText, { color: colors.textMuted }]}>Not available</Text>
                      </View>
                    )}
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
              source={{ uri: selectedImageUrl || '' }}
              style={styles.viewerImage}
              contentFit="contain"
              transition={200}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
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
});
