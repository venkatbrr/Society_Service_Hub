import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { RatingStars } from '../../components/RatingStars';
import { Rupees } from '../../components/Rupees';
import { Verandah } from '../../constants/Colors';
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
  const colors = {
    background: Verandah.surface,
    surface: Verandah.surface,
    text: Verandah.textPrimary,
    textMuted: Verandah.textSecondary,
    textPrimary: Verandah.textPrimary,
    textSecondary: Verandah.textSecondary,
    primary: Verandah.primary,
    primaryFg: Verandah.primaryFg,
    secondary: Verandah.accent,
    accent: Verandah.danger,
    border: Verandah.border,
    cardMuted: Verandah.cardMuted,
  };

  const [provider, setProvider] = useState<ProviderWithInteraction | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRating, setSelectedRating] = useState<number>(0);
  const [reviewText, setReviewText] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [providerHistory, setProviderHistory] = useState<Array<{ hire_id: string; created_at: string; signal: string | null; note: string | null }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  useEffect(() => {
    fetchProvider();
  }, [id, user]);

  const fetchProviderHistory = async (providerId: string) => {
    if (!user) {
      setProviderHistory([]);
      return;
    }

    setHistoryLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_my_provider_history', { p_provider_id: providerId });
      if (error) throw error;
      setProviderHistory((data ?? []) as Array<{ hire_id: string; created_at: string; signal: string | null; note: string | null }>);
    } catch (err) {
      console.error('Error loading provider history:', err);
      setProviderHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

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
        setHistoryExpanded(false);
        void fetchProviderHistory(String(id));
      } else {
        const { data: providerData, error: providerError } = await providerQuery;
        if (providerError) throw providerError;
        setProvider({ ...providerData, hire_count: 0 });
        setProviderHistory([]);
        setHistoryExpanded(false);
      }
    } catch (error: any) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Provider not found' });
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const logHire = async (): Promise<string | null> => {
    if (!provider || !user) return null;
    try {
      const { data: insertedHire, error } = await supabase
        .from('provider_hires')
        .insert({
          user_id: user.id,
          provider_id: provider.id,
        })
        .select('id')
        .maybeSingle();

      if (error) {
        if (isMissingRelationError(error)) return null;
        throw error;
      }

      const insertedHireId = insertedHire?.id ?? null;

      if (insertedHireId && Platform.OS !== 'web') {
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `How was your visit with ${provider.name}?`,
              body: 'Tap to leave a quick private note for yourself.',
              data: { kind: 'hire_feedback', hire_id: insertedHireId, provider_id: provider.id },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: 24 * 60 * 60,
              repeats: false,
              channelId: 'default',
            },
          });
        } catch (scheduleError) {
          console.warn('Failed to schedule hire feedback notification:', scheduleError);
        }
      }

      setProvider((prev: ProviderWithInteraction | null) => prev ? { ...prev, hire_count: (prev.hire_count || 0) + 1 } : null);
      void fetchProviderHistory(provider.id);
      return insertedHireId;
    } catch (err) {
      console.error('Error logging hire:', err);
      return null;
    }
  };

  const formatSignal = (signal: string | null) => {
    if (signal === 'positive') return '👍';
    if (signal === 'negative') return '👎';
    if (signal === 'skipped') return '⏭';
    return '•';
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
    const effectiveRating = selectedRating || provider?.user_rating || 0;

    if (!provider || !user || effectiveRating === 0) {
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
        rating: effectiveRating,
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
            rating: effectiveRating,
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
        prev ? { ...prev, user_rating: effectiveRating } : null
      );
      setReviewText('');
    } catch (error) {
      console.error('Error saving review:', error);
      const message = error instanceof Error ? error.message : String(error);
      Toast.show({ type: 'error', text1: 'Error saving review', text2: message });
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
      <View style={[styles.centerContainer, { backgroundColor: colors.surface }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={[styles.headerCard, { backgroundColor: colors.primary }]}> 
        <View style={styles.headerTop}>
           <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
             <Ionicons name="arrow-back" size={20} color={colors.primaryFg} />
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
      </View>

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

      <View style={styles.detailsCard}>
        <View style={styles.privateHistoryHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Your history with this provider</Text>
          {providerHistory.length > 0 ? (
            <TouchableOpacity onPress={() => setHistoryExpanded((v) => !v)}>
              <Text style={[styles.privateHistoryToggle, { color: colors.primary }]}>{historyExpanded ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {historyLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />
        ) : providerHistory.length === 0 ? (
          <Text style={[styles.detailText, { color: colors.textMuted, marginTop: 8 }]}>No private visit history yet.</Text>
        ) : (
          <>
            <Text style={[styles.privateHistorySummary, { color: colors.text }]}> 
              {providerHistory
                .slice(0, 5)
                .map((entry) => formatSignal(entry.signal))
                .join(' ')}{' '}
              - {providerHistory.length} visit{providerHistory.length === 1 ? '' : 's'}
            </Text>

            {historyExpanded ? (
              <View style={styles.privateHistoryList}>
                {providerHistory.map((entry) => (
                  <View key={entry.hire_id} style={[styles.privateHistoryRow, { borderTopColor: colors.border }]}> 
                    <Text style={styles.privateHistorySignal}>{formatSignal(entry.signal)}</Text>
                    <View style={styles.privateHistoryBody}>
                      <Text style={[styles.privateHistoryDate, { color: colors.text }]}>
                        {new Date(entry.created_at).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </Text>
                      {entry.note ? (
                        <Text style={[styles.privateHistoryNote, { color: colors.textMuted }]}>{entry.note}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        )}
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

                const isMoneyValue = field.type === 'number';
                const displayValue = Array.isArray(value)
                  ? value.join(', ')
                  : String(value);

                return (
                  <View key={field.key} style={styles.detailMeta}>
                    <Text style={[styles.detailMetaLabel, { color: colors.textMuted }]}>{field.label}</Text>
                    {isMoneyValue ? (
                      <View style={styles.moneyMetaRow}>
                        <Rupees amount={Number(value)} size="sm" />
                        {field.suffix ? <Text style={[styles.detailMetaSuffix, { color: colors.textSecondary }]}>{field.suffix}</Text> : null}
                      </View>
                    ) : (
                      <Text style={[styles.detailMetaValue, { color: colors.textPrimary }]}>{displayValue}</Text>
                    )}
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
           disabled={isSubmittingReview || (selectedRating === 0 && !provider.user_rating)}
           activeOpacity={0.85}
           style={[
             styles.submitReviewBtn,
             { marginTop: 12, backgroundColor: selectedRating > 0 ? colors.primary : colors.cardMuted },
           ]}
         >
           {isSubmittingReview
             ? <ActivityIndicator color={colors.primaryFg} />
             : <Text style={styles.submitReviewText}>Submit review</Text>
           }
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
              <Text style={{ color: colors.accent, marginLeft: 8, fontWeight: '500' }}>Delete provider</Text>
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
  name: { fontSize: 22, fontWeight: '500', color: Verandah.primaryFg, letterSpacing: -0.3 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: Verandah.accentSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, gap: 4 },
  verifiedBadgeIcon: { fontSize: 16, lineHeight: 18 },
  verifiedText: { color: Verandah.accent, fontSize: 10, fontWeight: '500', textTransform: 'uppercase' },
  categoryTextDisp: { fontSize: 13, color: Verandah.primaryFg, fontWeight: '500', marginTop: 2 },
  ratingRowDisp: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  ratingIcon: { fontSize: 16, lineHeight: 18, color: Verandah.caution },
  ratingValueDisp: { color: Verandah.primaryFg, fontSize: 17, fontWeight: '500' },
  ratingCountDisp: { color: Verandah.primaryFg, fontSize: 13 },
  iconButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: Verandah.cardMuted, justifyContent: 'center', alignItems: 'center' },
  favoriteIconButton: { backgroundColor: 'transparent' },
  favoriteHeaderIcon: { fontSize: 28, lineHeight: 32 },
  trustBanner: {
    flexDirection: 'row',
    backgroundColor: Verandah.card,
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Verandah.border,
  },
  trustStat: { flex: 1, alignItems: 'center' },
  trustStatValue: { fontSize: 18, fontWeight: '500' },
  trustStatLabel: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  trustDivider: { width: 1, height: '100%' },
  actionGrid: { flexDirection: 'row', padding: 20, gap: 15 },
  mainActionBtn: { flex: 1, flexDirection: 'row', height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', gap: 10, elevation: 0 },
  mainActionIcon: { fontSize: 24, lineHeight: 28 },
  mainActionText: { color: Verandah.primaryFg, fontSize: 16, fontWeight: '500' },
  detailsCard: {
    backgroundColor: Verandah.card,
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Verandah.border,
  },
  sectionTitle: { fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 },
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
    color: Verandah.primaryFg,
    fontSize: 16,
    fontWeight: '500',
  },
  actionRowAlt: { padding: 20, paddingBottom: 40, alignItems: 'center' },
  altBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  altIcon: { fontSize: 20, lineHeight: 24 },
  altBtnText: { fontSize: 14, fontWeight: '500' },
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
    fontWeight: '500',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  detailMetaValue: {
    fontSize: 15,
    fontWeight: '500',
  },
  moneyMetaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  detailMetaSuffix: {
    fontSize: 12,
    fontWeight: '400',
  },
  privateHistoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  privateHistoryToggle: {
    fontSize: 12,
    fontWeight: '500',
  },
  privateHistorySummary: {
    fontSize: 15,
    fontWeight: '500',
    marginTop: 10,
  },
  privateHistoryList: {
    marginTop: 12,
  },
  privateHistoryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderTopWidth: 1,
    paddingTop: 10,
    paddingBottom: 10,
  },
  privateHistorySignal: {
    fontSize: 18,
    lineHeight: 20,
  },
  privateHistoryBody: {
    flex: 1,
    gap: 4,
  },
  privateHistoryDate: {
    fontSize: 13,
    fontWeight: '500',
  },
  privateHistoryNote: {
    fontSize: 13,
    lineHeight: 18,
  },
});
