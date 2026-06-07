import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Avatar } from '../../components/Avatar';
import { BaseCard } from '../../components/BaseCard';
import { RatingStars } from '../../components/RatingStars';
import { Verandah } from '../../constants/Colors';
import { VerandahRadius, VerandahType } from '../../constants/Verandah';
import { APP_EMOJIS } from '../../constants/emojis';
import { useAuth } from '../../context/AuthContext';
import { ProviderWithInteraction } from '../../lib/database.types';
import { actionToFraudStatus, checkReviewFraud, getFraudActionMessage } from '../../lib/fraudCheck';
import { supabase } from '../../lib/supabase';

const getDaysOnPlatform = (createdAtStr: string | null) => {
  if (!createdAtStr) return '0 days';

  const createdDate = new Date(createdAtStr);
  if (Number.isNaN(createdDate.getTime())) {
    return '0 days';
  }

  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - createdDate.getTime());
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'today';
  }

  return `${diffDays} day${diffDays === 1 ? '' : 's'}`;
};

type PublicReview = {
  id: string;
  reviewer_name: string;
  reviewer_flat: string | null;
  rating: number;
  review_text: string | null;
  created_at: string;
};

const isMissingRelationError = (error: { code?: string; message?: string } | null) =>
  error?.code === 'PGRST205' ||
  error?.message?.includes("Could not find the table 'public.provider_hires'");

export default function ProviderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, isPlatformAdmin, isCommunityLead } = useAuth();
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
  const [personalNote, setPersonalNote] = useState('');
  const [personalNoteLoading, setPersonalNoteLoading] = useState(false);
  const [isSavingPersonalNote, setIsSavingPersonalNote] = useState(false);
  const [publicReviews, setPublicReviews] = useState<PublicReview[]>([]);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [hasReported, setHasReported] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [reportDetails, setReportDetails] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [reports, setReports] = useState<any[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const isReviewSubmitDisabled = isSubmittingReview || (selectedRating === 0 && !provider?.user_rating);
  const hasExistingReview = provider?.user_rating != null;
  const canDelete = isPlatformAdmin || isCommunityLead;
  const visibleReviews = showAllReviews ? publicReviews : publicReviews.slice(0, 3);

  useEffect(() => {
    fetchProvider();
    fetchReportStatus();
    if (id && id !== 'add') {
      void fetchPublicReviews(String(id));
      void fetchPersonalNote(String(id));
      void fetchAllReports();
    }
    setShowAllReviews(false);
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
      return insertedHireId;
    } catch (err) {
      console.error('Error logging hire:', err);
      return null;
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
    const effectiveRating = selectedRating || provider?.user_rating || 0;
    const hadExistingReview = provider?.user_rating != null;

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
        Toast.show({ type: 'success', text1: hadExistingReview ? 'Review updated' : 'Review submitted' });
      } else {
        const msg = getFraudActionMessage(verdict);
        Toast.show({ type: msg.type, text1: msg.title, text2: msg.message });
      }

      // Update rating locally
      setProvider((prev: ProviderWithInteraction | null) =>
        prev ? { ...prev, user_rating: effectiveRating } : null
      );
      setSelectedRating(effectiveRating);
      setReviewText(reviewText.trim());
      void fetchPublicReviews(provider.id);
    } catch (error) {
      console.error('Error saving review:', error);
      const message = error instanceof Error ? error.message : String(error);
      Toast.show({ type: 'error', text1: 'Error saving review', text2: message });
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const fetchReportStatus = async () => {
    if (!id || !user) return;
    const { data } = await supabase
      .from('provider_reports')
      .select('id')
      .eq('provider_id', id)
      .eq('reported_by', user.id)
      .maybeSingle();
    setHasReported(!!data);
  };

  const fetchPersonalNote = async (providerId: string) => {
    if (!user) {
      setPersonalNote('');
      return;
    }

    setPersonalNoteLoading(true);
    try {
      const { data, error } = await supabase
        .from('provider_personal_notes')
        .select('note')
        .eq('provider_id', providerId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      setPersonalNote(data?.note ?? '');
    } catch (err) {
      console.error('Error loading personal note:', err);
      setPersonalNote('');
    } finally {
      setPersonalNoteLoading(false);
    }
  };

  const handleSavePersonalNote = async () => {
    if (!provider || !user) return;

    setIsSavingPersonalNote(true);
    try {
      const trimmedNote = personalNote.trim();
      if (!trimmedNote) {
        const { error: deleteError } = await supabase
          .from('provider_personal_notes')
          .delete()
          .match({ provider_id: provider.id, user_id: user.id });
        if (deleteError) throw deleteError;
        setPersonalNote('');
        Toast.show({ type: 'success', text1: 'Personal note cleared' });
        return;
      }

      const { error } = await supabase
        .from('provider_personal_notes')
        .upsert(
          {
            provider_id: provider.id,
            user_id: user.id,
            note: trimmedNote,
          },
          { onConflict: 'user_id,provider_id' }
        );

      if (error) throw error;
      setPersonalNote(trimmedNote);
      Toast.show({ type: 'success', text1: 'Personal note saved' });
    } catch (err) {
      console.error('Error saving personal note:', err);
      Toast.show({ type: 'error', text1: 'Error saving personal note' });
    } finally {
      setIsSavingPersonalNote(false);
    }
  };

  const fetchPublicReviews = async (providerId: string) => {
    setReviewsLoading(true);
    try {
      const { data, error } = await supabase
        .from('ratings')
        .select('id, rating, review_text, created_at, user_id')
        .eq('provider_id', providerId)
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
  };

  const REPORT_REASONS = [
    { key: 'wrong_info', label: 'Wrong info' },
    { key: 'spam', label: 'Spam' },
    { key: 'inappropriate', label: 'Inappropriate' },
    { key: 'unavailable', label: 'No longer available' },
    { key: 'other', label: 'Other' },
  ];

  const handleReport = () => {
    if (!provider || !user || hasReported) return;
    setShowReportModal(true);
  };

  const submitReport = async () => {
    if (!provider || !user || !selectedReason) return;
    setIsReporting(true);
    try {
      const detailsValue = selectedReason === 'other' ? reportDetails.trim() : null;
      if (selectedReason === 'other' && !detailsValue) {
        Toast.show({ type: 'error', text1: 'Details required', text2: 'Please explain the issue.' });
        setIsReporting(false);
        return;
      }
      const { error } = await supabase.from('provider_reports').insert({
        provider_id: provider.id,
        reported_by: user.id,
        reason: selectedReason,
        details: detailsValue,
      });
      if (error) {
        if (error.code === '23505') {
          setHasReported(true);
          Toast.show({ type: 'info', text1: 'Already reported', text2: 'You have already reported this provider.' });
          setShowReportModal(false);
        } else {
          throw error;
        }
      } else {
        setHasReported(true);
        Toast.show({ type: 'success', text1: 'Report submitted', text2: 'Community leads will review this provider.' });
        setShowReportModal(false);
        setSelectedReason(null);
        setReportDetails('');
        setIsDropdownOpen(false);
        void fetchAllReports();
      }
    } catch (e) {
      console.error('Error submitting report:', e);
      Toast.show({ type: 'error', text1: 'Failed to submit report' });
    } finally {
      setIsReporting(false);
    }
  };

  const fetchAllReports = async () => {
    if (!id) return;
    setReportsLoading(true);
    try {
      const { data, error } = await supabase
        .from('provider_reports')
        .select('id, reason, details, created_at')
        .eq('provider_id', id);
      if (error) throw error;
      setReports(data || []);
    } catch (e) {
      console.error('Error fetching reports:', e);
    } finally {
      setReportsLoading(false);
    }
  };

  const getGroupedReports = () => {
    const groups: Record<string, { count: number; details: string[] }> = {};
    reports.forEach((rep) => {
      const reasonLabel = REPORT_REASONS.find(r => r.key === rep.reason)?.label || rep.reason;
      if (!groups[reasonLabel]) {
        groups[reasonLabel] = { count: 0, details: [] };
      }
      groups[reasonLabel].count += 1;
      if (rep.details?.trim()) {
        groups[reasonLabel].details.push(rep.details.trim());
      }
    });
    return groups;
  };

  const handleDelete = () => {
    if (!provider || !canDelete) return;
    Alert.alert('Delete Provider', 'Are you sure you want to delete this provider? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
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
      <View style={styles.headerCard}> 
        <View style={styles.headerTop}>
           <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
             <Ionicons name="arrow-back" size={20} color={Verandah.textPrimary} />
           </TouchableOpacity>
           <TouchableOpacity onPress={handleToggleFavorite} style={styles.iconButton}>
             <Ionicons 
               name={provider.is_favorite ? 'bookmark' : 'bookmark-outline'} 
               size={18} 
               color={provider.is_favorite ? Verandah.accent : Verandah.textPrimary} 
             />
           </TouchableOpacity>
        </View>

        <View style={styles.headerContent}>
          <Avatar name={provider.name} size={64} shape="square" />
          <View style={styles.headerInfo}>
            <Text style={styles.name}>{provider.name}</Text>
            <Text style={styles.categoryTextDisp}>
              {provider.category} · {getDaysOnPlatform(provider.created_at)} on platform
            </Text>
            <View style={styles.pillRow}>
              {provider.is_verified && (
                <View style={[styles.pill, { backgroundColor: Verandah.accentSoft }]}>
                  <Text style={[styles.pillText, { color: Verandah.accent }]}>Verified</Text>
                </View>
              )}
              <View style={[styles.pill, { backgroundColor: Verandah.cautionSoft }]}>
                <Text style={[styles.pillText, { color: Verandah.caution }]}>
                  {provider.hire_count || 0} hire{provider.hire_count === 1 ? '' : 's'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      <BaseCard padding={16} style={styles.trustBanner}>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Rating</Text>
            <Text style={styles.statValue}>★ {Number(provider.avg_rating || 0).toFixed(1)}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Homes used</Text>
            <Text style={styles.statValue}>{provider.hire_count || 0}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Reviews</Text>
            <Text style={styles.statValue}>{provider.rating_count || 0}</Text>
          </View>
        </View>
      </BaseCard>

      <View style={[styles.detailsCard, styles.historyCard, styles.personalNoteCard]}>
        <Text style={styles.sectionTitleSentenceCase}>Personal note</Text>
        {personalNoteLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />
        ) : (
          <>
            <TextInput
              style={[styles.reviewInput, styles.personalNoteInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="This note is visible only to you."
              placeholderTextColor={colors.textMuted}
              value={personalNote}
              onChangeText={setPersonalNote}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <TouchableOpacity
              onPress={handleSavePersonalNote}
              disabled={isSavingPersonalNote}
              activeOpacity={0.85}
              style={[
                styles.submitReviewBtn,
                { marginTop: 12, backgroundColor: colors.secondary },
                isSavingPersonalNote && [styles.submitReviewBtnDisabled, { borderColor: colors.border }],
              ]}
            >
              {isSavingPersonalNote ? (
                <ActivityIndicator color={colors.primaryFg} />
              ) : (
                <Text style={[styles.submitReviewText, { color: colors.primaryFg }]}>Save personal note</Text>
              )}
            </TouchableOpacity>
            <Text style={[styles.reviewNote, { color: colors.textMuted, fontWeight: '700' }]}>This note is visible only to you.</Text>
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

      {/* Community Reviews List */}
      <View style={styles.detailsCard}>
        <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 12 }]}>Community Reviews</Text>
        {reviewsLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : publicReviews.length === 0 ? (
          <Text style={[styles.detailText, { color: colors.textMuted, marginTop: 8 }]}>No community reviews yet.</Text>
        ) : (
          <View style={styles.publicReviewList}>
            {visibleReviews.map((review, index) => (
              <View
                key={review.id}
                style={[
                  styles.publicReviewItem,
                  index > 0 && { borderTopColor: colors.border, borderTopWidth: 1 },
                ]}
              >
                <View style={styles.publicReviewHeader}>
                  <View style={styles.publicReviewIdentity}>
                    <Text style={[styles.publicReviewName, { color: colors.text }]}> 
                      {review.reviewer_name}
                      {review.reviewer_flat ? ` · ${review.reviewer_flat}` : ''}
                    </Text>
                    <Text style={[styles.publicReviewDate, { color: colors.textMuted }]}>
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
                  <Text style={[styles.publicReviewText, { color: colors.textMuted, marginTop: 8 }]}>{review.review_text}</Text>
                ) : null}
              </View>
            ))}
            {publicReviews.length > 3 ? (
              <TouchableOpacity
                onPress={() => setShowAllReviews((prev) => !prev)}
                style={[styles.loadMoreReviewsBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.loadMoreReviewsText, { color: colors.primary }]}>
                  {showAllReviews ? 'Show less' : `Load more (${publicReviews.length - 3})`}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </View>

      {/* Community Reports Summary */}
      {reports.length > 0 && (
        <View style={styles.detailsCard}>
          <Text style={[styles.sectionTitle, { color: colors.accent, marginBottom: 12 }]}>
            Community Reports ({reports.length})
          </Text>
          <View style={styles.publicReviewList}>
            {Object.entries(getGroupedReports()).map(([reasonLabel, group], index) => (
              <View
                key={reasonLabel}
                style={[
                  styles.publicReviewItem,
                  index > 0 && { borderTopColor: colors.border, borderTopWidth: 1 },
                ]}
              >
                <View style={styles.publicReviewHeader}>
                  <Text style={[styles.publicReviewName, { color: colors.text }]}>
                    {reasonLabel}
                  </Text>
                  <Text style={[styles.publicReviewDate, { color: colors.textMuted, marginTop: 0 }]}>
                    reported by {group.count} member{group.count === 1 ? '' : 's'}
                  </Text>
                </View>
                {group.details.length > 0 && (
                  <View style={{ marginTop: 8, gap: 4 }}>
                    {group.details.map((detail, idx) => (
                      <Text key={idx} style={[styles.publicReviewText, { color: colors.textMuted }]}>
                        • "{detail}"
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        </View>
      )}

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
           disabled={isReviewSubmitDisabled}
           activeOpacity={0.85}
           style={[
             styles.submitReviewBtn,
             { marginTop: 12, backgroundColor: isReviewSubmitDisabled ? colors.cardMuted : colors.primary },
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
         <Text style={[styles.reviewNote, { color: colors.textMuted }]}>Reviews are only visible to our community members.</Text>
      </View>

      <View style={styles.actionRowAlt}>
         <TouchableOpacity style={styles.altBtn} onPress={handleShare}>
          <Text style={styles.altIcon}>{APP_EMOJIS.share}</Text>
            <Text style={[styles.altBtnText, { color: colors.textMuted }]}>Share Contact</Text>
         </TouchableOpacity>
      </View>

      {canDelete ? (
         <View style={styles.adminControls}>
            <TouchableOpacity style={[styles.dangerBtn, { borderColor: colors.accent }]} onPress={handleDelete}>
              <Text style={styles.dangerIcon}>{APP_EMOJIS.close}</Text>
              <Text style={{ color: colors.accent, marginLeft: 8, fontWeight: '500' }}>Delete provider</Text>
            </TouchableOpacity>
         </View>
      ) : (
         <View style={styles.adminControls}>
            <TouchableOpacity
              style={[styles.reportBtn, { borderColor: hasReported ? colors.border : colors.accent }]}
              onPress={handleReport}
              disabled={hasReported || isReporting}
              activeOpacity={0.7}
            >
              {isReporting ? (
                <ActivityIndicator color={colors.accent} size="small" />
              ) : (
                <>
                  <Ionicons name={hasReported ? 'checkmark-circle' : 'flag-outline'} size={18} color={hasReported ? colors.textMuted : colors.accent} />
                  <Text style={{ color: hasReported ? colors.textMuted : colors.accent, marginLeft: 8, fontWeight: '500' }}>
                    {hasReported ? 'Reported' : 'Report provider'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
         </View>
      )}

      <Modal
        visible={showReportModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowReportModal(false);
          setIsDropdownOpen(false);
        }}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => {
            setIsDropdownOpen(false);
            setShowReportModal(false);
          }}
        >
          <Pressable 
            style={[styles.modalContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>Report Provider</Text>
            
            <Text style={[styles.modalLabel, { color: colors.textMuted }]}>Reason</Text>
            
            <TouchableOpacity
              style={[styles.dropdownTrigger, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={() => setIsDropdownOpen(!isDropdownOpen)}
              activeOpacity={0.8}
            >
              <Text style={[styles.dropdownTriggerText, { color: selectedReason ? colors.text : colors.textMuted }]}>
                {selectedReason 
                  ? REPORT_REASONS.find(r => r.key === selectedReason)?.label 
                  : 'Select a reason...'}
              </Text>
              <Ionicons 
                name={isDropdownOpen ? 'chevron-up' : 'chevron-down'} 
                size={20} 
                color={colors.textMuted} 
              />
            </TouchableOpacity>

            {isDropdownOpen && (
              <View style={[styles.dropdownList, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                  {REPORT_REASONS.map((reason) => (
                    <TouchableOpacity
                      key={reason.key}
                      style={[
                        styles.dropdownItem,
                        { borderBottomColor: colors.border, borderBottomWidth: 0.5 },
                        selectedReason === reason.key && { backgroundColor: colors.primary + '14' }
                      ]}
                      onPress={() => {
                        setSelectedReason(reason.key);
                        setIsDropdownOpen(false);
                      }}
                    >
                      <Text 
                        style={[
                          styles.dropdownItemText, 
                          { color: selectedReason === reason.key ? colors.primary : colors.text }
                        ]}
                      >
                        {reason.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {selectedReason === 'other' && (
              <>
                <Text style={[styles.modalLabel, { color: colors.textMuted }]}>Details *</Text>
                <TextInput
                  style={[styles.modalInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
                  placeholder="Please describe the issue..."
                  placeholderTextColor={colors.textMuted}
                  numberOfLines={4}
                  multiline
                  value={reportDetails}
                  onChangeText={setReportDetails}
                />
              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.cardMuted }]}
                onPress={() => {
                  setShowReportModal(false);
                  setIsDropdownOpen(false);
                  setSelectedReason(null);
                  setReportDetails('');
                }}
                disabled={isReporting}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalButton, 
                  { 
                    backgroundColor: (!selectedReason || (selectedReason === 'other' && !reportDetails.trim())) 
                      ? colors.cardMuted 
                      : colors.primary 
                  }
                ]}
                onPress={submitReport}
                disabled={!selectedReason || (selectedReason === 'other' && !reportDetails.trim()) || isReporting}
              >
                {isReporting ? (
                  <ActivityIndicator color={colors.primaryFg} size="small" />
                ) : (
                  <Text 
                    style={[
                      styles.modalButtonText, 
                      { 
                        color: (!selectedReason || (selectedReason === 'other' && !reportDetails.trim())) 
                          ? colors.textMuted 
                          : colors.primaryFg 
                      }
                    ]}
                  >
                    Submit
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
    backgroundColor: Verandah.surface,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerContent: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 2 },
  headerInfo: { flex: 1, gap: 4 },
  name: {
    ...VerandahType.display,
    color: Verandah.textPrimary,
  },
  categoryTextDisp: {
    ...VerandahType.body,
    color: Verandah.textSecondary,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: VerandahRadius.sm,
  },
  pillText: {
    ...VerandahType.micro,
    fontWeight: '500',
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trustBanner: {
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    ...VerandahType.sectionLabel,
    fontSize: 10,
    color: Verandah.textTertiary,
    marginBottom: 4,
  },
  statValue: {
    ...VerandahType.title,
    color: Verandah.textPrimary,
  },
  statDivider: {
    width: 0.5,
    backgroundColor: Verandah.border,
    alignSelf: 'stretch',
  },
  actionGrid: { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 0, paddingBottom: 0, marginBottom: 12, gap: 12 },
  mainActionBtn: { flex: 1, flexDirection: 'row', height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', gap: 10, elevation: 0 },
  mainActionIcon: { fontSize: 24, lineHeight: 28 },
  mainActionText: { color: Verandah.primaryFg, fontSize: 16, fontWeight: '500' },
  detailsCard: {
    backgroundColor: Verandah.card,
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Verandah.border,
  },
  historyCard: {
    marginBottom: 12,
  },
  personalNoteCard: {
    paddingTop: 18,
    paddingBottom: 14,
    paddingHorizontal: 20,
  },
  sectionTitle: { fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 },
  sectionTitleSentenceCase: {
    ...VerandahType.bodyBold,
    color: Verandah.textPrimary,
  },
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
  personalNoteInput: {
    marginTop: 10,
    minHeight: 66,
    paddingTop: 10,
    paddingBottom: 10,
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
  actionRowAlt: { paddingHorizontal: 20, paddingTop: 0, paddingBottom: 0, marginBottom: 12, alignItems: 'center' },
  altBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  altIcon: { fontSize: 20, lineHeight: 24 },
  altBtnText: { fontSize: 14, fontWeight: '500' },
  adminControls: { paddingHorizontal: 20, paddingTop: 0, paddingBottom: 60 },
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
  reportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 18, borderRadius: 16, borderWidth: 1 },
  submitReviewBtnDisabled: {
    borderWidth: 1,
  },
  publicReviewList: {
    gap: 0,
    marginTop: 8,
  },
  publicReviewItem: {
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  publicReviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  publicReviewIdentity: {
    flex: 1,
  },
  publicReviewName: {
    fontSize: 14,
    fontWeight: '500',
  },
  publicReviewDate: {
    marginTop: 2,
    fontSize: 12,
  },
  publicReviewStars: {
    fontSize: 14,
    color: Verandah.caution,
    letterSpacing: 0.5,
  },
  publicReviewText: {
    fontSize: 14,
    lineHeight: 20,
  },
  loadMoreReviewsBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreReviewsText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
    marginTop: 8,
  },
  dropdownTrigger: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dropdownTriggerText: {
    fontSize: 15,
  },
  dropdownList: {
    borderWidth: 1,
    borderRadius: 12,
    marginTop: -8,
    marginBottom: 16,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  dropdownItemText: {
    fontSize: 15,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    height: 100,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  modalButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  reportGroupItem: {
    marginBottom: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: Verandah.border,
    paddingBottom: 12,
  },
  reportGroupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reportGroupLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  reportCountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  reportCountText: {
    fontSize: 12,
    fontWeight: '600',
  },
  reportDetailsContainer: {
    paddingLeft: 8,
    gap: 4,
  },
  reportDetailText: {
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
});
