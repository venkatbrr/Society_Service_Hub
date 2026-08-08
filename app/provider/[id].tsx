import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Avatar } from '../../components/Avatar';
import { BaseCard } from '../../components/BaseCard';
import { HeaderBackButton } from '../../components/HeaderBackButton';
import { RatingStars } from '../../components/RatingStars';
import { Verandah } from '../../constants/Colors';
import { VerandahRadius, VerandahType } from '../../constants/Verandah';
import { APP_EMOJIS } from '../../constants/emojis';
import { useAuth } from '../../context/AuthContext';
import { ProviderWithInteraction } from '../../lib/database.types';
import { actionToFraudStatus, checkReviewFraud, getFraudActionMessage } from '../../lib/fraudCheck';
import { siteUrl } from '../../lib/siteUrl';
import { supabase } from '../../lib/supabase';
import { goBackSmart } from '../../lib/navigation';

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
  const [hasSavedPersonalNote, setHasSavedPersonalNote] = useState(false);
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
        .maybeSingle();

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

        setProvider(providerResult.data ? {
          ...providerResult.data,
          is_favorite: !!(favsResult.data && favsResult.data.length > 0),
          user_rating: ratsResult.data ? ratsResult.data.rating : null,
          hire_count: hireResult.count || 0
        } : null);
      } else {
        const { data: providerData, error: providerError } = await providerQuery;
        if (providerError) throw providerError;
        setProvider(providerData ? { ...providerData, hire_count: 0 } : null);
      }
    } catch (error: any) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to load provider' });
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
    const intlPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const url = `whatsapp://send?phone=${intlPhone}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      await Linking.openURL(`https://wa.me/${intlPhone}`);
    }
  };

  const handleShare = async () => {
    if (!provider) return;
    const ratingText = provider.avg_rating ? `★ ${Number(provider.avg_rating).toFixed(1)} (${provider.rating_count} reviews)` : '';
    const shareUrl = siteUrl(`/provider/${provider.id}`);

    const messageLines = [
      `👤 *Service Provider Contact*`,
      `Name: ${provider.name}`,
      `Category: ${provider.category}`,
      `Phone: ${provider.phone}`,
      ratingText ? `Rating: ${ratingText}` : '',
      provider.flat_block ? `Block/Flat: ${provider.flat_block}` : '',
      provider.hire_count ? `Contacted by neighbours: ${provider.hire_count} time${provider.hire_count === 1 ? '' : 's'}` : '',
      provider.description ? `About: "${provider.description}"` : '',
      ``,
      `🔗 View Profile & Contact Details:`,
      shareUrl,
    ];

    const message = messageLines.filter(Boolean).join('\n');
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share({ title: provider.name, text: message });
      } else {
        await Share.share({ message, title: provider.name });
      }
    } catch (error) {
      const err = error as any;
      if (err && (err.name === 'AbortError' || err.message?.includes('abort') || err.message?.includes('cancel'))) {
        return;
      }
      Toast.show({ type: 'error', text1: 'Error sharing contact' });
    }
  };

  const handleToggleFavorite = async () => {
    if (!provider || !user) return;
    const isCurrentlyFavorite = provider.is_favorite;
    setProvider({ ...provider, is_favorite: !isCurrentlyFavorite });
    const { error } = isCurrentlyFavorite
      ? await supabase.from('favorites').delete().match({ user_id: user.id, provider_id: provider.id })
      : await supabase.from('favorites').insert({ user_id: user.id, provider_id: provider.id });

    if (error) {
      setProvider(prev => prev ? { ...prev, is_favorite: isCurrentlyFavorite } : null);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to update favorites' });
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
      const loadedNote = data?.note ?? '';
      setPersonalNote(loadedNote);
      setHasSavedPersonalNote(loadedNote.trim().length > 0);
    } catch (err) {
      console.error('Error loading personal note:', err);
      setPersonalNote('');
      setHasSavedPersonalNote(false);
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
        setHasSavedPersonalNote(false);
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
      setHasSavedPersonalNote(true);
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

  const performDelete = async () => {
    if (!provider) return;
    const { data, error } = await supabase
      .from('service_providers')
      .delete()
      .eq('id', provider.id)
      .select('id');

    if (error || !data || data.length !== 1) {
      Toast.show({ type: 'error', text1: 'Delete failed', text2: error?.message || 'Could not delete provider' });
      return;
    }
    Toast.show({ type: 'success', text1: 'Provider deleted' });
    goBackSmart(router, '/provider/' + provider.id);
  };

  const handleDelete = () => {
    if (!provider || !canDelete) return;
    const promptText = 'Are you sure you want to delete this provider? This cannot be undone.';
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(promptText)) {
        void performDelete();
      }
    } else {
      Alert.alert('Delete provider', promptText, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: performDelete },
      ]);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.surface }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!provider) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.surface }]}>
        <Text style={{ color: colors.textMuted, marginBottom: 12, fontSize: 16 }}>
          This provider is no longer available.
        </Text>
        <TouchableOpacity onPress={() => goBackSmart(router, '/provider/' + id)}>
          <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '500' }}>Back to providers</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={styles.headerCard}> 
        <View style={styles.headerTop}>
           <HeaderBackButton onPress={() => goBackSmart(router, '/provider/' + id)} color={Verandah.textPrimary} style={styles.backButtonInline} />
           <TouchableOpacity onPress={handleToggleFavorite} style={styles.iconButton}>
             <Ionicons 
               name={provider.is_favorite ? 'bookmark' : 'bookmark-outline'} 
               size={18} 
               color={provider.is_favorite ? Verandah.accent : Verandah.textPrimary} 
             />
           </TouchableOpacity>
        </View>

        <View style={styles.headerContent}>
          <Avatar name={provider.name} size={56} shape="square" />
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
                  contacted {provider.hire_count || 0} time{provider.hire_count === 1 ? '' : 's'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      <BaseCard padding={10} style={styles.trustBanner}>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Rating</Text>
            <Text style={styles.statValue}>★ {Number(provider.avg_rating || 0).toFixed(1)}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Contacts</Text>
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
                { marginTop: 8, backgroundColor: colors.secondary },
                isSavingPersonalNote && [styles.submitReviewBtnDisabled, { borderColor: colors.border }],
              ]}
            >
              {isSavingPersonalNote ? (
                <ActivityIndicator color={colors.primaryFg} />
              ) : (
                <Text style={[styles.submitReviewText, { color: colors.primaryFg }]}>
                  {hasSavedPersonalNote ? 'Update personal note' : 'Save personal note'}
                </Text>
              )}
            </TouchableOpacity>
            <Text style={[styles.reviewNote, { color: colors.textMuted, fontWeight: '700' }]}>This note is visible only to you.</Text>
          </>
        )}
      </View>

      <View style={styles.actionGrid}>
        <TouchableOpacity style={[styles.mainActionBtn, { backgroundColor: colors.secondary }]} onPress={handleWhatsApp}>
          <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.mainActionText}>WhatsApp</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.mainActionBtn, { backgroundColor: colors.primary }]} onPress={handleCall}>
          <Ionicons name="call-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.mainActionText}>Call</Text>
        </TouchableOpacity>
      </View>

      {/* Community Reviews List */}
      <View style={styles.detailsCard}>
        <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 8 }]}>Community Reviews</Text>
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
                  <Text style={[styles.publicReviewText, { color: colors.textMuted, marginTop: 6 }]}>{review.review_text}</Text>
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
          <Text style={[styles.sectionTitle, { color: colors.accent, marginBottom: 8 }]}>
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
                  <View style={{ marginTop: 6, gap: 2 }}>
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
        <Text style={[styles.sectionTitle, styles.rateTitleCompact, { color: colors.text, marginBottom: 0 }]}>Rate this Provider</Text>
         <RatingStars rating={selectedRating || provider.user_rating || 0} onRating={handleRating} size={30} isLightMode={true} />
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
             { marginTop: 8, backgroundColor: isReviewSubmitDisabled ? colors.cardMuted : colors.primary },
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
          <Ionicons name="share-social-outline" size={16} color={colors.primary} style={{ marginRight: 6 }} />
            <Text style={[styles.altBtnText, { color: colors.textMuted }]}>Share Contact</Text>
         </TouchableOpacity>
      </View>

      <View style={styles.adminControls}>
        <TouchableOpacity
          style={[styles.reportBtn, { borderColor: hasReported ? colors.border : colors.accent, marginBottom: canDelete ? 10 : 0 }]}
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
        {canDelete && (
          <TouchableOpacity style={[styles.dangerBtn, { borderColor: colors.accent }]} onPress={handleDelete}>
            <Ionicons name="close-circle-outline" size={16} color={colors.accent} style={{ marginRight: 6 }} />
            <Text style={{ color: colors.accent, marginLeft: 8, fontWeight: '500' }}>Delete provider</Text>
          </TouchableOpacity>
        )}
      </View>

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
    paddingHorizontal: 16,
    paddingTop: Platform.select({ web: 12, default: 28 }),
    paddingBottom: 2,
    backgroundColor: Verandah.surface,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  headerContent: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 0 },
  headerInfo: { flex: 1, gap: 2 },
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
    gap: 6,
    marginTop: 1,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: VerandahRadius.sm,
  },
  pillText: {
    ...VerandahType.micro,
    fontWeight: '500',
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonInline: {
    marginLeft: 2,
  },
  trustBanner: {
    marginHorizontal: 16,
    marginTop: 2,
    marginBottom: 6,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    ...VerandahType.sectionLabel,
    fontSize: 9,
    color: Verandah.textTertiary,
    marginBottom: 1,
  },
  statValue: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '500',
    color: Verandah.textPrimary,
  },
  statDivider: {
    width: 0.5,
    backgroundColor: Verandah.border,
    alignSelf: 'stretch',
  },
  actionGrid: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 0, paddingBottom: 0, marginBottom: 6, gap: 8 },
  mainActionBtn: { flex: 1, flexDirection: 'row', height: 46, borderRadius: 12, justifyContent: 'center', alignItems: 'center', gap: 6, elevation: 0 },
  mainActionIcon: { fontSize: 18, lineHeight: 20 },
  mainActionText: { color: Verandah.primaryFg, fontSize: 13, fontWeight: '500' },
  detailsCard: {
    backgroundColor: Verandah.card,
    marginHorizontal: 16,
    marginBottom: 6,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Verandah.border,
  },
  historyCard: {
    marginBottom: 6,
  },
  personalNoteCard: {
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 12,
  },
  sectionTitle: { fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 },
  rateTitleCompact: {
    fontSize: 11,
    letterSpacing: 0.6,
    lineHeight: 16,
  },
  sectionTitleSentenceCase: {
    ...VerandahType.bodyBold,
    color: Verandah.textPrimary,
  },
  detailText: { fontSize: 15, lineHeight: 22 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20, paddingTop: 20, borderTopWidth: 1 },
  infoIcon: { fontSize: 20, lineHeight: 24 },
  infoText: { fontSize: 15, fontWeight: '500' },
  reviewNote: { fontSize: 11, marginTop: 6, textAlign: 'center' },
  tapHint: { fontSize: 11, marginTop: 4, fontWeight: '500' },
  reviewInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: 15,
    lineHeight: 18,
    marginTop: 8,
    minHeight: 64,
  },
  personalNoteInput: {
    marginTop: 6,
    minHeight: 52,
    paddingTop: 8,
    paddingBottom: 8,
  },
  submitReviewBtn: {
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitReviewText: {
    color: Verandah.primaryFg,
    fontSize: 14,
    fontWeight: '500',
  },
  actionRowAlt: { paddingHorizontal: 16, paddingTop: 0, paddingBottom: 0, marginBottom: 6, alignItems: 'center' },
  altBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  altIcon: { fontSize: 20, lineHeight: 24 },
  altBtnText: { fontSize: 14, fontWeight: '500' },
  adminControls: { paddingHorizontal: 16, paddingTop: 0, paddingBottom: 28 },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 10, borderWidth: 1 },
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
  reportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 10, borderWidth: 1 },
  submitReviewBtnDisabled: {
    borderWidth: 1,
  },
  publicReviewList: {
    gap: 0,
    marginTop: 4,
  },
  publicReviewItem: {
    paddingVertical: 8,
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
    fontSize: 11,
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
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreReviewsText: {
    fontSize: 14,
    fontWeight: '500',
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
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '500',
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
