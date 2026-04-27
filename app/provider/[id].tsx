import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { RatingStars } from '../../components/RatingStars';
import { Colors } from '../../constants/Colors';
import { APP_EMOJIS, getServiceCategoryEmoji } from '../../constants/emojis';
import { getDetailFieldsForCategory } from '../../constants/providerDetails';
import { useAuth } from '../../context/AuthContext';
import { ProviderWithInteraction } from '../../lib/database.types';
import { actionToFraudStatus, checkReviewFraud, getFraudActionMessage } from '../../lib/fraudCheck';
import { supabase } from '../../lib/supabase';

const isMissingRelationError = (error: { code?: string; message?: string } | null) =>
  error?.code === 'PGRST205' ||
  error?.message?.includes("Could not find the table 'public.provider_hires'");

export default function ProviderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const colors = Colors.light;

  const [provider, setProvider] = useState<ProviderWithInteraction | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRating, setSelectedRating] = useState<number>(0);
  const [reviewText, setReviewText] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  useEffect(() => {
    fetchProvider();
  }, [id, user]);

  const fetchProvider = async () => {
    try {
      if (!id || id === 'add') return;

      // Fetch provider data and user-specific data in parallel
      const providerQuery = supabase
        .from('service_providers')
        .select('*')
        .eq('id', id)
        .single();

      if (user) {
        const [providerResult, favsResult, ratsResult, hireResult] = await Promise.all([
          providerQuery,
          supabase.from('favorites')
            .select('id')
            .eq('user_id', user.id)
            .eq('provider_id', id),
          supabase.from('ratings')
            .select('rating')
            .eq('user_id', user.id)
            .eq('provider_id', id)
            .maybeSingle(),
          supabase.from('provider_hires')
            .select('*', { count: 'exact', head: true })
            .eq('provider_id', id)
        ]);

        if (providerResult.error) throw providerResult.error;

        const hireCountError = hireResult.error;
        if (hireCountError && !isMissingRelationError(hireCountError)) {
          throw hireCountError;
        }

        setProvider({
          ...providerResult.data,
          is_favorite: !!(favsResult.data && favsResult.data.length > 0),
          user_rating: ratsResult.data ? ratsResult.data.rating : null,
          hire_count: hireResult.count || 0
        });
      } else {
        const { data: providerData, error: providerError } = await providerQuery;
        if (providerError) throw providerError;
        setProvider({ ...providerData, hire_count: 0 });
      }
    } catch (error: any) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Provider not found' });
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const logHire = async () => {
    if (!provider || !user) return;
    try {
      const { error } = await supabase.from('provider_hires').insert({
        user_id: user.id,
        provider_id: provider.id
      });

      if (error) {
        if (isMissingRelationError(error)) return;
        throw error;
      }

      setProvider((prev: ProviderWithInteraction | null) => prev ? { ...prev, hire_count: (prev.hire_count || 0) + 1 } : null);
    } catch (err) {
      console.error('Error logging hire:', err);
    }
  };

  const handleCall = async () => {
    if (!provider) return;
    await logHire();
    const url = `tel:${provider.phone}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Phone dialing not supported' });
    }
  };

  const handleWhatsApp = async () => {
    if (!provider) return;
    await logHire();
    const cleanPhone = provider.phone.replace(/[^0-9]/g, '');
    const url = `whatsapp://send?phone=${cleanPhone}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      await Linking.openURL(`https://wa.me/${cleanPhone}`);
    }
  };

  const handleShare = async () => {
    if (!provider) return;
    const message = `Check out ${provider.name} (${provider.category}) on Society Service Hub!\nPhone: ${provider.phone}`;
    try {
      await Share.share({ message });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error sharing contact' });
    }
  };

  const handleToggleFavorite = async () => {
    if (!provider || !user) return;
    const isCurrentlyFavorite = provider.is_favorite;
    setProvider({ ...provider, is_favorite: !isCurrentlyFavorite });
    try {
      if (isCurrentlyFavorite) {
        await supabase.from('favorites').delete().match({ user_id: user.id, provider_id: provider.id });
      } else {
        await supabase.from('favorites').insert({ user_id: user.id, provider_id: provider.id });
      }
    } catch (error) {
       setProvider({ ...provider, is_favorite: isCurrentlyFavorite });
       Toast.show({ type: 'error', text1: 'Error updating favorite' });
    }
  };

  const handleRating = (rating: number) => {
    setSelectedRating(rating);
  };

  const handleSubmitReview = async () => {
    if (!provider || !user || selectedRating === 0) {
      Toast.show({ type: 'error', text1: 'Rating required', text2: 'Please tap a star to rate this provider' });
      return;
    }

    setIsSubmittingReview(true);
    try {
      // Run fraud check before submitting
      const verdict = await checkReviewFraud({
        reviewerId: user.id,
        providerId: provider.id,
        reviewText: reviewText.trim(),
        rating: selectedRating,
      });

      if (verdict.action === 'BLOCK') {
        const msg = getFraudActionMessage(verdict);
        Toast.show({ type: msg.type, text1: msg.title, text2: msg.message });
        return;
      }

      const fraudStatus = actionToFraudStatus(verdict.action);

      const { error } = await supabase
        .from('ratings')
        .upsert(
          {
            user_id: user.id,
            provider_id: provider.id,
            rating: selectedRating,
            review_text: reviewText.trim() || null,
            fraud_status: fraudStatus,
            fraud_rules_triggered: verdict.triggered_rules,
          },
          { onConflict: 'user_id,provider_id' }
        );
      if (error) throw error;

      if (verdict.action === 'PASS') {
        Toast.show({ type: 'success', text1: 'Review submitted' });
      } else {
        const msg = getFraudActionMessage(verdict);
        Toast.show({ type: msg.type, text1: msg.title, text2: msg.message });
      }

      // Update rating locally
      setProvider((prev: ProviderWithInteraction | null) =>
        prev ? { ...prev, user_rating: selectedRating } : null
      );
      setReviewText('');
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error saving review' });
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleDelete = () => {
    if (!provider) return;
    Alert.alert("Delete Provider", "Are you sure you want to delete this provider?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
         try {
           await supabase.from('service_providers').delete().eq('id', provider.id);
           Toast.show({ type: 'success', text1: 'Deleted successfully' });
           router.back();
         } catch(e) {
           Toast.show({ type: 'error', text1: 'Delete failed' });
         }
      } }
    ]);
  };

  if (loading || !provider) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        style={styles.headerCard}
      >
        <View style={styles.headerTop}>
           <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
             <Ionicons name="arrow-back" size={20} color="#FFF" />
           </TouchableOpacity>
           <TouchableOpacity onPress={handleToggleFavorite} style={[styles.iconButton, styles.favoriteIconButton]}>
             <Text style={styles.favoriteHeaderIcon}>{provider.is_favorite ? APP_EMOJIS.favoritesFilled : APP_EMOJIS.favoritesEmpty}</Text>
           </TouchableOpacity>
        </View>

        <View style={styles.headerContent}>
          <View style={styles.imagePlaceholderLarge}>
            <Text style={styles.headerEmoji}>{getServiceCategoryEmoji(provider.category)}</Text>
          </View>
          <View style={styles.headerInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{provider.name}</Text>
              {provider.is_verified && (
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedBadgeIcon}>{APP_EMOJIS.verified}</Text>
                  <Text style={styles.verifiedText}>Verified</Text>
                </View>
              )}
            </View>
            <Text style={styles.categoryTextDisp}>{`${getServiceCategoryEmoji(provider.category)} ${provider.category}`}</Text>
            <View style={styles.ratingRowDisp}>
               <Text style={styles.ratingIcon}>{APP_EMOJIS.starFilled}</Text>
               <Text style={styles.ratingValueDisp}>{Number(provider.avg_rating || 0).toFixed(1)}</Text>
               <Text style={styles.ratingCountDisp}>({provider.rating_count || 0} reviews)</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.trustBanner}>
         <View style={styles.trustStat}>
            <Text style={[styles.trustStatValue, { color: colors.text }]}>{provider.hire_count || 0}</Text>
            <Text style={[styles.trustStatLabel, { color: colors.textMuted }]}>Homes used</Text>
         </View>
         <View style={[styles.trustDivider, { backgroundColor: colors.border }]} />
         <View style={styles.trustStat}>
            <Text style={[styles.trustStatValue, { color: colors.text }]}>{provider.rating_count || 0}</Text>
          <Text style={[styles.trustStatLabel, { color: colors.textMuted }]}>Reviews</Text>
         </View>
      </View>

      <View style={styles.actionGrid}>
        <TouchableOpacity style={[styles.mainActionBtn, { backgroundColor: colors.secondary }]} onPress={handleWhatsApp}>
          <Text style={styles.mainActionIcon}>{APP_EMOJIS.whatsapp}</Text>
          <Text style={styles.mainActionText}>WhatsApp</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.mainActionBtn, { backgroundColor: colors.primary }]} onPress={handleCall}>
          <Text style={styles.mainActionIcon}>{APP_EMOJIS.call}</Text>
          <Text style={styles.mainActionText}>Call</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.detailsCard}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Experience Details</Text>
        <Text style={[styles.detailText, { color: colors.textMuted, marginTop: 8 }]}>
          {provider.description || `${provider.name} is a trusted provider in our gated community.`}
        </Text>
        {provider.flat_block ? (
          <View style={[styles.infoRow, { borderTopColor: colors.border }]}>
            <Text style={styles.infoIcon}>{APP_EMOJIS.house}</Text>
            <Text style={[styles.infoText, { color: colors.text }]}>Usually works at {provider.flat_block}</Text>
          </View>
        ) : null}

        {/* Category-specific details */}
        {(() => {
          const providerDetails = (provider as any).details;
          if (!providerDetails || typeof providerDetails !== 'object' || Object.keys(providerDetails).length === 0) return null;
          const fields = getDetailFieldsForCategory(provider.category);
          if (fields.length === 0) return null;

          return (
            <View style={[styles.detailsMetaSection, { borderTopColor: colors.border }]}>
              {fields.map(field => {
                const value = providerDetails[field.key];
                if (!value || (Array.isArray(value) && value.length === 0)) return null;

                const displayValue = Array.isArray(value)
                  ? value.join(', ')
                  : field.type === 'number'
                    ? `₹${Number(value).toLocaleString('en-IN')}${field.suffix ? ` ${field.suffix}` : ''}`
                    : String(value);

                return (
                  <View key={field.key} style={styles.detailMeta}>
                    <Text style={[styles.detailMetaLabel, { color: colors.textMuted }]}>{field.label}</Text>
                    <Text style={[styles.detailMetaValue, { color: colors.text }]}>{displayValue}</Text>
                  </View>
                );
              })}
            </View>
          );
        })()}
      </View>

      <View style={styles.detailsCard}>
         <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 16 }]}>Rate this Provider</Text>
         <RatingStars rating={selectedRating || provider.user_rating || 0} onRating={handleRating} size={36} isLightMode={true} />
         {selectedRating === 0 && !provider.user_rating && (
           <Text style={[styles.tapHint, { color: colors.accent }]}>⬆ Tap a star above to rate (required)</Text>
         )}
         <TextInput
           style={[styles.reviewInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
           placeholder="Share your experience... (optional)"
           placeholderTextColor={colors.textMuted}
           value={reviewText}
           onChangeText={setReviewText}
           multiline
           numberOfLines={3}
           textAlignVertical="top"
         />
         <TouchableOpacity
           onPress={handleSubmitReview}
           disabled={isSubmittingReview || selectedRating === 0}
           activeOpacity={0.85}
           style={{ marginTop: 12 }}
         >
           <LinearGradient
             colors={selectedRating > 0 ? [colors.gradientStart, colors.gradientEnd] : ['#CCC', '#AAA']}
             start={{ x: 0, y: 0 }}
             end={{ x: 1, y: 0 }}
             style={styles.submitReviewBtn}
           >
             {isSubmittingReview
               ? <ActivityIndicator color="#FFF" />
               : <Text style={styles.submitReviewText}>Submit Review</Text>
             }
           </LinearGradient>
         </TouchableOpacity>
         <Text style={[styles.reviewNote, { color: colors.textMuted }]}>Reviews are only visible to our community members.</Text>
      </View>

      <View style={styles.actionRowAlt}>
         <TouchableOpacity style={styles.altBtn} onPress={handleShare}>
          <Text style={styles.altIcon}>{APP_EMOJIS.share}</Text>
            <Text style={[styles.altBtnText, { color: colors.textMuted }]}>Share Contact</Text>
         </TouchableOpacity>
      </View>

      {user?.id === provider.created_by ? (
         <View style={styles.adminControls}>
            <TouchableOpacity style={[styles.dangerBtn, { borderColor: colors.accent }]} onPress={handleDelete}>
            <Text style={styles.dangerIcon}>{APP_EMOJIS.close}</Text>
              <Text style={{ color: colors.accent, marginLeft: 8, fontWeight: '600' }}>Delete Provider</Text>
            </TouchableOpacity>
         </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerCard: {
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 16,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerContent: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 2 },
  imagePlaceholderLarge: { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  headerEmoji: { fontSize: 38, lineHeight: 42 },
  headerInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  name: { fontSize: 22, fontWeight: '800', color: '#FFF', letterSpacing: -0.3 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, gap: 4 },
  verifiedBadgeIcon: { fontSize: 16, lineHeight: 18 },
  verifiedText: { color: '#FFF', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  categoryTextDisp: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '600', marginTop: 2 },
  ratingRowDisp: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  ratingIcon: { fontSize: 16, lineHeight: 18, color: '#FFB347' },
  ratingValueDisp: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  ratingCountDisp: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  iconButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },
  favoriteIconButton: { backgroundColor: 'transparent' },
  favoriteHeaderIcon: { fontSize: 28, lineHeight: 32 },
  trustBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.85)',
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    elevation: 0,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  trustStat: { flex: 1, alignItems: 'center' },
  trustStatValue: { fontSize: 18, fontWeight: '800' },
  trustStatLabel: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  trustDivider: { width: 1, height: '100%' },
  actionGrid: { flexDirection: 'row', padding: 20, gap: 15 },
  mainActionBtn: { flex: 1, flexDirection: 'row', height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', gap: 10, elevation: 0 },
  mainActionIcon: { fontSize: 24, lineHeight: 28 },
  mainActionText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  detailsCard: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 24,
    borderRadius: 24,
    elevation: 0,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  sectionTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  detailText: { fontSize: 15, lineHeight: 22 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20, paddingTop: 20, borderTopWidth: 1 },
  infoIcon: { fontSize: 20, lineHeight: 24 },
  infoText: { fontSize: 15, fontWeight: '500' },
  reviewNote: { fontSize: 12, marginTop: 12, textAlign: 'center' },
  tapHint: { fontSize: 12, marginTop: 6, fontWeight: '500' },
  reviewInput: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 16,
    minHeight: 80,
  },
  submitReviewBtn: {
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitReviewText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  actionRowAlt: { padding: 20, paddingBottom: 40, alignItems: 'center' },
  altBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  altIcon: { fontSize: 20, lineHeight: 24 },
  altBtnText: { fontSize: 14, fontWeight: '600' },
  adminControls: { padding: 20, paddingBottom: 60 },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 18, borderRadius: 16, borderWidth: 1 },
  dangerIcon: { fontSize: 20, lineHeight: 24 },
  detailsMetaSection: {
    borderTopWidth: 1,
    marginTop: 16,
    paddingTop: 16,
  },
  detailMeta: {
    marginBottom: 12,
  },
  detailMetaLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  detailMetaValue: {
    fontSize: 15,
    fontWeight: '600',
  },
});
