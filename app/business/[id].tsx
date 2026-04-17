import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { BusinessStatusBadge } from '../../components/BusinessStatusBadge';
import { OfferingCard } from '../../components/OfferingCard';
import { RatingStars } from '../../components/RatingStars';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../context/AuthContext';
import { BusinessWithInteraction } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';

export default function BusinessDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const colors = Colors.light;

  const [business, setBusiness] = useState<BusinessWithInteraction | null>(null);
  const [offerings, setOfferings] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!id || id === 'add' || !user?.id) return;

    try {
      // 1. Fetch business detail first (need community_id for nothing else now)
      const { data: bizData, error: bizError } = await supabase
        .from('resident_businesses')
        .select(`
          *,
          profiles:owner_id (full_name, flat_number)
        `)
        .eq('id', id)
        .single();

      if (bizError) throw bizError;

      // 2. Fetch everything else in parallel
      const [offResult, favResult, userRatingResult, reviewsResult, ratingStatsResult, inquiryCountResult] = await Promise.all([
        supabase
          .from('business_offerings')
          .select('*')
          .eq('business_id', id)
          .order('sort_order', { ascending: true }),
        supabase
          .from('favorites')
          .select('id')
          .eq('user_id', user.id)
          .eq('business_id', id)
          .maybeSingle(),
        supabase
          .from('ratings')
          .select('rating, id')
          .eq('user_id', user.id)
          .eq('business_id', id)
          .maybeSingle(),
        supabase
          .from('ratings')
          .select(`
            id,
            rating,
            created_at,
            profiles:user_id (full_name, flat_number)
          `)
          .eq('business_id', id)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('ratings')
          .select('rating')
          .eq('business_id', id),
        supabase
          .from('business_inquiries')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', id),
      ]);

      if (offResult.error) throw offResult.error;

      // Calculate rating stats from direct query instead of fetching ALL businesses via RPC
      const allRatings = ratingStatsResult.data || [];
      const ratingCount = allRatings.length;
      const avgRating = ratingCount > 0
        ? allRatings.reduce((sum, r) => sum + Number(r.rating), 0) / ratingCount
        : 0;

      setBusiness({
        ...bizData,
        owner_name: bizData.profiles?.full_name,
        owner_flat: bizData.profiles?.flat_number,
        avg_rating: avgRating,
        rating_count: ratingCount,
        inquiry_count: inquiryCountResult.count || 0,
        is_favorite: !!favResult.data,
        user_rating: userRatingResult.data?.rating || null
      });

      setOfferings(offResult.data || []);
      setReviews(reviewsResult.data || []);

    } catch (error: any) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Business not found' });
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const logInquiry = async (type: 'whatsapp' | 'call') => {
    if (!business || !user) return;
    try {
      await supabase.from('business_inquiries').insert({
        business_id: business.id,
        user_id: user.id,
        inquiry_type: type
      });
      setBusiness(prev => prev ? { ...prev, inquiry_count: (prev.inquiry_count || 0) + 1 } : null);
    } catch (err) {
      console.error('Error logging inquiry:', err);
    }
  };

  const handleWhatsApp = async () => {
    if (!business?.whatsapp_number) {
        Toast.show({ type: 'error', text1: 'Number not found' });
        return;
    }
    await logInquiry('whatsapp');
    const cleanPhone = business.whatsapp_number.replace(/[^0-9]/g, '');
    const url = `whatsapp://send?phone=${cleanPhone}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      await Linking.openURL(`https://wa.me/${cleanPhone}`);
    }
  };

  const handleCall = async () => {
    if (!business?.phone_number && !business?.whatsapp_number) {
        Toast.show({ type: 'error', text1: 'Number not found' });
        return;
    }
    await logInquiry('call');
    const phone = business.phone_number || business.whatsapp_number;
    const url = `tel:${phone}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Phone dialing not supported' });
    }
  };

  const handleToggleFavorite = async () => {
    if (!business || !user) return;
    const isCurrentlyFavorite = business.is_favorite;
    setBusiness({ ...business, is_favorite: !isCurrentlyFavorite });
    try {
      if (isCurrentlyFavorite) {
        await supabase.from('favorites').delete().match({ user_id: user.id, business_id: business.id });
      } else {
        await supabase.from('favorites').insert({ user_id: user.id, business_id: business.id });
      }
    } catch (error) {
       setBusiness({ ...business, is_favorite: isCurrentlyFavorite });
       Toast.show({ type: 'error', text1: 'Error matching favorite' });
    }
  };

  const handleRating = async (rating: number) => {
    if (!business || !user) return;
    try {
      const { error } = await supabase
        .from('ratings')
        .upsert({ 
          user_id: user.id, 
          business_id: business.id, 
          rating 
        }, { onConflict: 'user_id,business_id' });
      
      if (error) throw error;
      Toast.show({ type: 'success', text1: 'Rating saved' });

      // Only refresh rating stats, not all data
      const [ratingStatsResult, reviewsResult] = await Promise.all([
        supabase.from('ratings').select('rating').eq('business_id', business.id),
        supabase.from('ratings')
          .select('id, rating, created_at, profiles:user_id (full_name, flat_number)')
          .eq('business_id', business.id)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);
      const allRatings = ratingStatsResult.data || [];
      const ratingCount = allRatings.length;
      const avgRating = ratingCount > 0
        ? allRatings.reduce((sum, r) => sum + Number(r.rating), 0) / ratingCount
        : 0;
      setBusiness((prev: BusinessWithInteraction | null) => prev ? { ...prev, avg_rating: avgRating, rating_count: ratingCount, user_rating: rating } : null);
      setReviews(reviewsResult.data || []);
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error saving rating' });
    }
  };

  if (loading || !business) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isOwner = user?.id === business.owner_id;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header/Cover Section */}
        <View style={styles.coverWrapper}>
          {business.cover_photo_url ? (
            <Image source={{ uri: business.cover_photo_url }} style={styles.coverImage} />
          ) : (
            <View style={[styles.coverPlaceholder, { backgroundColor: colors.surface2 }]}>
              <Ionicons name="storefront-outline" size={60} color={colors.primary} />
            </View>
          )}
          <View style={styles.headerOverlay}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleToggleFavorite} style={styles.favButton}>
              <Ionicons name={business.is_favorite ? "heart" : "heart-outline"} size={24} color={business.is_favorite ? colors.accent : "#FFF"} />
            </TouchableOpacity>
          </View>
          <View style={styles.statusBadgeWrapper}>
            <BusinessStatusBadge isAcceptingOrders={business.is_accepting_orders} />
          </View>
        </View>

        {/* Business Info */}
        <View style={styles.content}>
          <View style={styles.mainInfo}>
            <Text style={[styles.name, { color: colors.text }]}>{business.name}</Text>
            <View style={styles.ownerRow}>
              <Text style={[styles.ownerText, { color: colors.textMuted }]}>
                By <Text style={{ color: colors.text, fontWeight: '700' }}>{business.owner_name}</Text> {business.owner_flat ? `• Flat ${business.owner_flat}` : ''}
              </Text>
            </View>
            <View style={[styles.categoryBadge, { backgroundColor: colors.primary + '10' }]}>
              <Text style={[styles.categoryText, { color: colors.primary }]}>{business.category}</Text>
            </View>
          </View>

          {business.description && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>About the Business</Text>
              <Text style={[styles.description, { color: colors.textMuted }]}>{business.description}</Text>
            </View>
          )}

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.text }]}>{Number(business.avg_rating).toFixed(1)}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>{business.rating_count} reviews</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.text }]}>{business.inquiry_count}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Inquiries</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={1}>
                {business.operating_hours || 'Anytime'}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Hours</Text>
            </View>
          </View>

          {/* Offerings Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Offerings</Text>
              {offerings.length > 0 && (
                <TouchableOpacity onPress={() => router.push(`/business/catalog/${id}`)}>
                  <Text style={{ color: colors.primary, fontWeight: '600' }}>See all</Text>
                </TouchableOpacity>
              )}
            </View>
            {offerings.length > 0 ? (
              offerings.slice(0, 3).map((off) => (
                <OfferingCard 
                  key={off.id}
                  id={off.id}
                  name={off.name}
                  description={off.description}
                  price={off.price}
                  priceUnit={off.price_unit}
                  photoUrl={off.photo_url}
                  availability={off.availability}
                  isAvailable={off.is_available}
                />
              ))
            ) : (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No offerings listed yet.</Text>
            )}
          </View>

          {/* Reviews Section */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 16 }]}>Reviews</Text>
            {reviews.length > 0 ? (
              reviews.map((rev) => (
                <View key={rev.id} style={styles.reviewItem}>
                  <View style={styles.reviewHeader}>
                    <Text style={[styles.reviewerName, { color: colors.text }]}>{rev.profiles?.full_name || 'Resident'}</Text>
                    <RatingStars rating={rev.rating} size={12} isLightMode={true} />
                  </View>
                  <Text style={[styles.reviewDate, { color: colors.textMuted }]}>
                    {new Date(rev.created_at).toLocaleDateString()}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No reviews yet. Be the first to rate!</Text>
            )}
          </View>

          {/* Rate Button */}
          <View style={[styles.rateSection, { backgroundColor: colors.surface2 }]}>
            <Text style={[styles.rateTitle, { color: colors.text }]}>How was your experience?</Text>
            <RatingStars rating={business.user_rating || 0} onRating={handleRating} size={32} isLightMode={true} />
          </View>
        </View>
      </ScrollView>

      {/* Action Bar */}
      <View style={[styles.actionBar, { borderTopColor: colors.border }]}>
        {isOwner ? (
          <TouchableOpacity 
            style={[styles.manageBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/business/manage')}
          >
            <Ionicons name="settings-outline" size={20} color="#FFF" />
            <Text style={styles.manageBtnText}>Manage Business</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.contactRow}>
            <TouchableOpacity style={[styles.contactBtn, { backgroundColor: '#10B981' }]} onPress={handleWhatsApp}>
              <Ionicons name="logo-whatsapp" size={20} color="#FFF" />
              <Text style={styles.contactBtnText}>WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.contactBtn, { backgroundColor: '#3B82F6' }]} onPress={handleCall}>
              <Ionicons name="call" size={20} color="#FFF" />
              <Text style={styles.contactBtnText}>Call</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  coverWrapper: { height: 280, position: 'relative' },
  coverImage: { width: '100%', height: '100%' },
  coverPlaceholder: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  headerOverlay: { ...StyleSheet.absoluteFillObject, height: 120, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 60 },
  backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  favButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  statusBadgeWrapper: { position: 'absolute', bottom: 20, left: 20 },
  content: { padding: 24, paddingBottom: 100 },
  mainInfo: { marginBottom: 24 },
  name: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginBottom: 8 },
  ownerRow: { marginBottom: 12 },
  ownerText: { fontSize: 15 },
  categoryBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  categoryText: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  section: { marginBottom: 32 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  description: { fontSize: 15, lineHeight: 22 },
  statsRow: { flexDirection: 'row', backgroundColor: '#F9FAFB', borderRadius: 24, padding: 20, marginBottom: 32 },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 12, marginTop: 2 },
  statDivider: { width: 1, height: '100%', backgroundColor: '#E5E7EB' },
  reviewItem: { marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  reviewerName: { fontSize: 15, fontWeight: '600' },
  reviewDate: { fontSize: 12 },
  rateSection: { padding: 24, borderRadius: 24, alignItems: 'center' },
  rateTitle: { fontSize: 16, fontWeight: '700', marginBottom: 16 },
  actionBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFF', padding: 20, paddingBottom: 34, borderTopWidth: 1 },
  contactRow: { flexDirection: 'row', gap: 12 },
  contactBtn: { flex: 1, height: 54, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  contactBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  manageBtn: { height: 54, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  manageBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  emptyText: { fontSize: 14, fontStyle: 'italic' },
});
