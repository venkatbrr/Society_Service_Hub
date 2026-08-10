import { ArrowLeft } from '@untitledui/icons/ArrowLeft';
import { Calendar } from '@untitledui/icons/Calendar';
import { Clock } from '@untitledui/icons/Clock';
import { LogOut01 } from '@untitledui/icons/LogOut01';
import { MessageCircle01 } from '@untitledui/icons/MessageCircle01';
import { Phone01 } from '@untitledui/icons/Phone01';
import { Share07 } from '@untitledui/icons/Share07';
import { XClose } from '@untitledui/icons/XClose';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Avatar } from '../../components/Avatar';
import { JoinerListItem } from '../../components/JoinerListItem';
import { Rupees } from '../../components/Rupees';
import { VisitStatusBadge } from '../../components/VisitStatusBadge';
import { Verandah } from '../../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { VisitJoinerWithProfile, VisitWithJoinerData } from '../../lib/database.types';
import { siteUrl } from '../../lib/siteUrl';
import { supabase } from '../../lib/supabase';
import { goBackSmart } from '../../lib/navigation';

const parseLocalDateOnly = (dateStr: string) => {
  const [year, month, day] = dateStr.split('-').map((part) => Number(part));
  if (!year || !month || !day) return new Date(dateStr);
  return new Date(year, month - 1, day);
};

const formatLocalDateForDb = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatTimeForWeb = (date: Date) => {
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${hours}:${minutes}`;
};

const parseTimeFromWeb = (timeString: string, baseDate: Date) => {
  const [hours, minutes] = timeString.split(':').map(Number);
  const newDate = new Date(baseDate);
  newDate.setHours(hours);
  newDate.setMinutes(minutes);
  return newDate;
};

export default function VisitDetailScreen() {
  const { id, returnTo, visitTab } = useLocalSearchParams<{ id: string; returnTo?: string; visitTab?: 'upcoming' | 'past' }>();
  const router = useRouter();
  const { user, profile, isCommunityLead, isPlatformAdmin } = useAuth();
  const colors = {
    background: Verandah.surface,
    text: Verandah.textPrimary,
    textMuted: Verandah.textSecondary,
    primary: Verandah.primary,
    secondary: Verandah.accent,
    accent: Verandah.danger,
    border: Verandah.border,
    surface: Verandah.card,
    surface2: Verandah.cardMuted,
    icon: Verandah.textSecondary,
  };

  const [visit, setVisit] = useState<VisitWithJoinerData | null>(null);
  const [joiners, setJoiners] = useState<VisitJoinerWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  // Join Modal state
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [flatNo, setFlatNo] = useState(profile?.flat_number || '');
  const [note, setNote] = useState('');

  // Reschedule Modal state
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [newVisitDate, setNewVisitDate] = useState(new Date());
  const [newStartTime, setNewStartTime] = useState(new Date());
  const [newEndTime, setNewEndTime] = useState(new Date());
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [showRescheduleDatePicker, setShowRescheduleDatePicker] = useState(false);
  const [showRescheduleStartTimePicker, setShowRescheduleStartTimePicker] = useState(false);
  const [showRescheduleEndTimePicker, setShowRescheduleEndTimePicker] = useState(false);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const parseTimeSlot = (timeSlotStr: string, baseDate: Date) => {
    const parts = timeSlotStr.split('-');
    const start = new Date(baseDate);
    const end = new Date(baseDate);
    if (parts.length === 2) {
      const parseTimeStr = (str: string, date: Date) => {
        const match = str.trim().toLowerCase().match(/(\d+):(\d+)\s*(am|pm)/);
        if (match) {
          let hours = parseInt(match[1]);
          const minutes = parseInt(match[2]);
          const ampm = match[3];
          if (ampm === 'pm' && hours < 12) hours += 12;
          if (ampm === 'am' && hours === 12) hours = 0;
          date.setHours(hours, minutes, 0, 0);
        }
      };
      parseTimeStr(parts[0], start);
      parseTimeStr(parts[1], end);
    } else {
      start.setHours(10, 0, 0, 0);
      end.setHours(11, 0, 0, 0);
    }
    return { start, end };
  };

  const handleOpenReschedule = () => {
    if (!visit) return;
    const baseDate = parseLocalDateOnly(visit.visit_date);
    setNewVisitDate(baseDate);
    const parsed = parseTimeSlot(visit.visit_time_slot || '', baseDate);
    setNewStartTime(parsed.start);
    setNewEndTime(parsed.end);
    setShowRescheduleModal(true);
  };

  const handleReschedule = async () => {
    if (!id || !newVisitDate || !newStartTime || !newEndTime) return;

    const startMins = newStartTime.getHours() * 60 + newStartTime.getMinutes();
    const endMins = newEndTime.getHours() * 60 + newEndTime.getMinutes();
    if (endMins <= startMins) {
      return Toast.show({
        type: 'error',
        text1: 'Invalid Time Slot',
        text2: 'End time must be greater than start time.',
      });
    }

    setIsRescheduling(true);
    try {
      const formattedDate = formatLocalDateForDb(newVisitDate);
      const timeSlot = `${formatTime(newStartTime)} - ${formatTime(newEndTime)}`;

      const { error } = await supabase
        .from('service_visits')
        .update({
          visit_date: formattedDate,
          visit_time_slot: timeSlot,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      Toast.show({ type: 'success', text1: 'Visit rescheduled!' });
      setShowRescheduleModal(false);
      void fetchVisitData();
    } catch (e: any) {
      console.error(e);
      Toast.show({ type: 'error', text1: 'Error rescheduling', text2: e.message });
    } finally {
      setIsRescheduling(false);
    }
  };

  const parsedEstimatedCost = visit?.estimated_cost ? Number(String(visit.estimated_cost).replace(/[^0-9.]/g, '')) : NaN;

  const fetchVisitData = useCallback(async () => {
    if (!id || !user?.id || !profile?.community_id) return;

    try {
      // 1. Start parallel fetch for visit and joiners
      const [visitsResult, joinersResult] = await Promise.all([
        supabase.rpc('get_community_visits', {
          p_community_id: profile.community_id,
          p_user_id: user.id,
          p_status: 'upcoming,in_progress,completed,cancelled',
          p_time_scope: 'upcoming'
        }),
        supabase.rpc('get_visit_joiners', {
          p_visit_id: id
        })
      ]);

      if (visitsResult.error) throw visitsResult.error;
      if (joinersResult.error) throw joinersResult.error;
      const joinersData = joinersResult.data || [];
      setJoiners(joinersData);

      const currentVisit = (visitsResult.data as VisitWithJoinerData[] || []).find(v => v.id === id);

      if (!currentVisit) {
        // Fallback: If not in the rpc list, fetch direct
        const { data: directData, error: directError } = await supabase
          .from('service_visits')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (directError) throw directError;
        if (!directData) {
          setVisit(null);
          return;
        }

        // Fetch creator profile in parallel (don't waterfall)
        const creatorResult = await supabase
          .from('profiles')
          .select('full_name, flat_number, avatar_url')
          .eq('id', directData.created_by)
          .maybeSingle();

        setVisit({
          ...directData,
          creator_name: creatorResult.data?.full_name || 'Neighbor',
          creator_flat: creatorResult.data?.flat_number,
          creator_avatar_url: creatorResult.data?.avatar_url,
          joiner_count: joinersData.length,
          has_user_joined: joinersData.some((j: VisitJoinerWithProfile) => j.user_id === user.id),
        });
      } else {
          setVisit({
            ...currentVisit,
            joiner_count: joinersData.length
          });
      }

    } catch (e) {
      console.error(e);
      Toast.show({ type: 'error', text1: 'Error loading visit' });
    } finally {
      setLoading(false);
    }
  }, [id, user?.id, profile?.community_id]);

  useEffect(() => {
    fetchVisitData();
  }, [fetchVisitData]);

  const refreshJoiners = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.rpc('get_visit_joiners', { p_visit_id: id });
    const joinersData = data || [];
    setJoiners(joinersData);
    setVisit((prev: VisitWithJoinerData | null) => prev ? { ...prev, joiner_count: joinersData.length, has_user_joined: joinersData.some((j: VisitJoinerWithProfile) => j.user_id === user?.id) } : null);
  }, [id, user?.id]);

  const handleJoin = async () => {
    if (!id || !user?.id) return;

    setJoining(true);
    try {
      const { error } = await supabase.from('visit_joiners').insert({
        visit_id: id,
        user_id: user.id,
        note: note.trim() || null,
        flat_number: (profile?.flat_number || flatNo).trim() || null
      });

      if (error) throw error;

      Toast.show({ type: 'success', text1: 'Joined visit!' });
      setShowJoinModal(false);
      refreshJoiners();
    } catch (e: any) {
      console.error(e);
      Toast.show({ type: 'error', text1: 'Error joining', text2: e.message });
    } finally {
      setJoining(false);
    }
  };

  const performLeave = async () => {
    try {
      const { error } = await supabase
        .from('visit_joiners')
        .delete()
        .match({ visit_id: id, user_id: user?.id });

      if (error) throw error;
      Toast.show({ type: 'success', text1: 'Left visit' });
      refreshJoiners();
    } catch (e) {
      console.error(e);
      Toast.show({ type: 'error', text1: 'Error leaving' });
    }
  };

  const handleLeave = async () => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Are you sure you want to leave this visit?')) {
        await performLeave();
      }
    } else {
      Alert.alert('Leave Visit', 'Are you sure you want to leave this visit?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: performLeave,
        },
      ]);
    }
  };

  const performUpdateStatus = async (status: string) => {
    setIsUpdatingStatus(true);
    try {
      const { error } = await supabase
        .from('service_visits')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      Toast.show({ type: 'success', text1: `Visit marked as ${status}` });
      setVisit((prev: VisitWithJoinerData | null) => prev ? { ...prev, status } : null);
    } catch (e: any) {
      console.error(e);
      Toast.show({ type: 'error', text1: 'Error updating status', text2: e?.message });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const updateStatus = (status: string) => {
    const actionLabel = status === 'completed' ? 'mark this visit as completed' : status === 'cancelled' ? 'cancel this visit' : `mark this visit as ${status}`;
    const promptText = `Are you sure you want to ${actionLabel}?`;

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(promptText)) {
        void performUpdateStatus(status);
      }
    } else {
      Alert.alert('Confirm Action', promptText, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', style: 'destructive', onPress: () => void performUpdateStatus(status) },
      ]);
    }
  };

  const performDeleteVisit = async () => {
    setIsUpdatingStatus(true);
    try {
      const { data, error } = await supabase
        .from('service_visits')
        .delete()
        .eq('id', id)
        .select('id');

      if (error || !data || data.length !== 1) {
        Toast.show({ type: 'error', text1: 'Delete failed', text2: error?.message || 'Could not delete visit' });
        return;
      }
      Toast.show({ type: 'success', text1: 'Visit deleted' });
      goBackSmart(router, `/visits/${id}`);
    } catch (e: any) {
      console.error(e);
      Toast.show({ type: 'error', text1: 'Error deleting visit', text2: e?.message });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleDeleteVisit = () => {
    const promptText = 'Are you sure you want to delete this visit? This cannot be undone.';
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(promptText)) {
        void performDeleteVisit();
      }
    } else {
      Alert.alert('Delete Visit', promptText, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void performDeleteVisit() },
      ]);
    }
  };

  const formatDate = (dateStr: string) => {
    return parseLocalDateOnly(dateStr).toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
  };

  const handleBack = () => {
    goBackSmart(router, `/visits/${id}`);
  };

  const handleShare = async () => {
    if (!visit) return;
    const shareUrl = siteUrl(`/visits/${visit.id}`);

    const message = `Join my service visit on Wooru!\n\n` +
      `• Title: ${visit.title}\n` +
      `• Provider: ${visit.provider_name}\n` +
      `• Date: ${formatDate(visit.visit_date)}\n` +
      `• Time: ${visit.visit_time_slot}\n` +
      (visit.description ? `• Details: ${visit.description}\n` : '') +
      `• Estimated Cost: ${visit.estimated_cost || 'Not specified'}\n\n` +
      `🔗 View Visit:\n${shareUrl}`;

    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share({ title: visit.title, text: message });
      } else {
        await Share.share({ message, title: visit.title });
      }
    } catch (error: any) {
      if (error && (error.name === 'AbortError' || error.message?.includes('abort') || error.message?.includes('cancel'))) {
        return;
      }
      Toast.show({ type: 'error', text1: 'Error sharing visit' });
    }
  };

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!visit) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textMuted, marginBottom: 12, fontSize: 16 }}>This visit is no longer available.</Text>
        <TouchableOpacity onPress={handleBack}>
          <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '500' }}>Back to visits</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isCreator = visit.created_by === user?.id;
  const isFull = visit.max_joiners ? visit.joiner_count! >= visit.max_joiners : false;
  const visitDate = parseLocalDateOnly(visit.visit_date);
  visitDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isPast = visitDate < today;
  const displayStatus =
    isPast && visit.status === 'upcoming'
      ? 'completed'
      : (visit.status as 'upcoming' | 'in_progress' | 'completed' | 'cancelled');

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <ArrowLeft size={22} color={colors.text} aria-hidden={true} />
          </TouchableOpacity>
        </View>

        {/* Creator Identity */}
        <View style={styles.creatorSection}>
          <View style={styles.avatarContainer}>
            <Avatar name={visit.creator_name || 'Neighbor'} size={56} />
          </View>
          <View style={styles.creatorInfo}>
            <View style={styles.nameRow}>
                <Text style={[styles.creatorName, { color: colors.text }]}>{visit.creator_name}</Text>
                {isCreator && (
                    <View style={[styles.hostBadge, { backgroundColor: Verandah.accentSoft }]}>
                        <Text style={[styles.hostBadgeText, { color: colors.secondary }]}>Your visit</Text>
                    </View>
                )}
            </View>
            <Text style={[styles.creatorFlat, { color: colors.textMuted }]}>{visit.creator_flat || 'Neighbor'}</Text>
          </View>
        </View>

        {/* Visit Details Card */}
        <View style={styles.detailCard}>
          <View style={styles.dateChipContainer}>
             <View style={[styles.dateChip, { backgroundColor: Verandah.cardMuted }]}>
                <Text style={[styles.dateChipText, { color: colors.primary }]}>{formatDate(visit.visit_date)}</Text>
             </View>
             <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <VisitStatusBadge status={displayStatus} />
                <TouchableOpacity onPress={handleShare} style={{ padding: 4 }} activeOpacity={0.7}>
                   <Share07 size={18} color={colors.primary} aria-hidden={true} />
                </TouchableOpacity>
             </View>
          </View>

          <Text style={styles.visitTitle}>{visit.title}</Text>
          <View style={styles.timeSlotRow}>
            <Clock size={16} color={colors.icon} aria-hidden={true} />
            <Text style={[styles.timeSlot, { color: colors.text }]}>{visit.visit_time_slot}</Text>
          </View>

          {visit.description && (
            <Text style={[styles.description, { color: colors.textMuted }]}>{visit.description}</Text>
          )}

          <View style={styles.metaGrid}>
            <View style={styles.metaItem}>
                <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Category</Text>
                <Text style={[styles.metaValue, { color: colors.text }]}>{visit.category}</Text>
            </View>
            <View style={styles.metaItem}>
                <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Est. cost</Text>
                <Text style={[styles.metaValue, { color: colors.text }]}>{visit.estimated_cost || 'Not specified'}</Text>
            </View>
          </View>
        </View>

        {/* Provider Profile */}
        <View style={styles.infoCard}>
           <Text style={[styles.cardTitle, { color: colors.textMuted }]}>Provider info</Text>
           <View style={styles.providerHeader}>
              <View style={styles.providerMain}>
                <Text style={[styles.providerName, { color: colors.text }]}>{visit.provider_name}</Text>
                {(visit.provider_phone || visit.provider_whatsapp) && (
                    <View style={styles.contactRow}>
                        {visit.provider_phone && (
                            <TouchableOpacity style={[styles.contactBtn, { backgroundColor: colors.surface2 }]} onPress={() => Linking.openURL(`tel:${visit.provider_phone}`)}>
                                <Phone01 size={16} color={colors.primary} aria-hidden={true} />
                            </TouchableOpacity>
                        )}
                        {visit.provider_whatsapp && (
                            <TouchableOpacity style={[styles.contactBtn, { backgroundColor: colors.surface2 }]} onPress={() => {
                              const digits = (visit.provider_whatsapp || '').replace(/\D/g, '');
                              const intl = digits.length === 10 ? `91${digits}` : digits;
                              void Linking.openURL(`https://wa.me/${intl}`);
                            }}>
                                <MessageCircle01 size={16} color={colors.secondary} aria-hidden={true} />
                            </TouchableOpacity>
                        )}
                    </View>
                )}
              </View>
              {visit.provider_id && (
                  <TouchableOpacity onPress={() => router.push(`/provider/${visit.provider_id}`)}>
                    <Text style={[styles.link, { color: colors.primary }]}>View profile</Text>
                  </TouchableOpacity>
              )}
           </View>
        </View>

        {/* Joiners List */}
        <View style={styles.joinersSection}>
           <Text style={[styles.cardTitle, { paddingHorizontal: 0, color: colors.textMuted }]}>
             Neighbors joining ({joiners.length} {visit.max_joiners ? `/ ${visit.max_joiners}` : ''})
           </Text>

           <View style={styles.joinerList}>
              {/* Host is always first */}
              <JoinerListItem
                userName={visit.creator_name || 'Neighbor'}
                flatNumber={visit.creator_flat || undefined}
                avatarUrl={visit.creator_avatar_url || undefined}
                isHost={true}
              />

              {joiners.length > 0 ? (
                  joiners.map(joiner => (
                    <View key={joiner.id} style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                        <JoinerListItem
                            userName={joiner.user_name || 'Neighbor'}
                            flatNumber={joiner.flat_number || undefined}
                            avatarUrl={joiner.avatar_url || undefined}
                            note={joiner.note || undefined}
                            joinedAt={joiner.joined_at}
                            isHost={false}
                        />
                    </View>
                  ))
              ) : (
                  <View style={styles.emptyJoiners}>
                     <Text style={{ color: colors.textMuted, fontSize: 13 }}>No one else has joined yet.</Text>
                  </View>
              )}
           </View>
        </View>
      </ScrollView>

      {/* Action Buttons */}
      {(!isPast || isCreator) && (
      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        {isCreator ? (
            <View style={styles.creatorActions}>
                {visit.status === 'upcoming' && (
                    <TouchableOpacity style={styles.primaryBtn} onPress={() => updateStatus('completed')} disabled={isUpdatingStatus}>
                      <View style={[styles.primaryBtnGradient, { backgroundColor: colors.primary }]}> 
                        <Text style={styles.primaryBtnText}>Mark as completed</Text>
                      </View>
                    </TouchableOpacity>
                )}
                {visit.status === 'upcoming' && (
                  <TouchableOpacity style={[styles.rescheduleBtn, { borderColor: colors.border }]} onPress={handleOpenReschedule} disabled={isUpdatingStatus}>
                    <Text style={[styles.rescheduleBtnText, { color: colors.primary }]}>Reschedule</Text>
                  </TouchableOpacity>
                )}
                {visit.status === 'upcoming' && (
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => updateStatus('cancelled')} disabled={isUpdatingStatus}>
                    <Text style={styles.cancelBtnText}>Cancel Visit</Text>
                  </TouchableOpacity>
                )}
                {(isPast || visit.status !== 'upcoming') && (
                  <TouchableOpacity style={styles.cancelBtn} onPress={handleDeleteVisit} disabled={isUpdatingStatus}>
                    <Text style={styles.cancelBtnText}>Delete Visit</Text>
                  </TouchableOpacity>
                )}
            </View>
        ) : (isCommunityLead || isPlatformAdmin) ? (
            <View style={styles.creatorActions}>
                {visit.status === 'upcoming' && (
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => updateStatus('cancelled')} disabled={isUpdatingStatus}>
                    <Text style={styles.cancelBtnText}>Cancel Visit</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.cancelBtn} onPress={handleDeleteVisit} disabled={isUpdatingStatus}>
                  <Text style={styles.cancelBtnText}>Delete Visit</Text>
                </TouchableOpacity>
            </View>
        ) : visit.has_user_joined ? (
            <TouchableOpacity style={[styles.leaveBtn, { borderColor: colors.accent, borderWidth: 1, borderRadius: 14 }]} onPress={handleLeave} disabled={isUpdatingStatus}>
                <LogOut01 size={16} color={colors.accent} aria-hidden={true} />
                <Text style={[styles.leaveBtnText, { color: colors.accent }]}>Leave this visit</Text>
            </TouchableOpacity>
        ) : (!isPast && visit.status === 'upcoming' && !isFull) ? (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setShowJoinModal(true)} disabled={isUpdatingStatus}>
              <View style={[styles.primaryBtnGradient, { backgroundColor: colors.primary }]}> 
                <Text style={styles.primaryBtnText}>Join this visit</Text>
              </View>
            </TouchableOpacity>
        ) : (!isPast && isFull) ? (
            <View style={[styles.disabledBtn, { backgroundColor: colors.border }]}>
                <Text style={[styles.disabledBtnText, { color: colors.textMuted }]}>Visit Full</Text>
            </View>
        ) : null}
      </View>
      )}

      {/* Join Modal */}
      <Modal visible={showJoinModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
                <View style={styles.modalHeader}>
                    <Text style={[styles.modalTitle, { color: colors.text }]}>Join Visit</Text>
                    <TouchableOpacity onPress={() => setShowJoinModal(false)}>
                        <XClose size={22} color={colors.text} aria-hidden={true} />
                    </TouchableOpacity>
                </View>

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.modalBody}
                >
                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: colors.text }]}>My flat / unit number</Text>
                        {profile?.flat_number ? (
                          <View style={[styles.input, { justifyContent: 'center', borderColor: colors.border, backgroundColor: colors.surface }]}>
                            <Text style={{ color: colors.text, ...VerandahType.body }}>{profile.flat_number}</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={[styles.input, { justifyContent: 'center', borderColor: Verandah.caution, backgroundColor: Verandah.cautionSoft }]}
                            onPress={() => {
                              setShowJoinModal(false);
                              router.push('/profile/edit' as any);
                            }}
                            activeOpacity={0.85}
                          >
                            <Text style={{ color: Verandah.caution, ...VerandahType.captionBold }}>
                              + Set your flat in profile
                            </Text>
                          </TouchableOpacity>
                        )}
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: colors.text }]}>Note for provider (optional)</Text>
                        <TextInput
                            style={[styles.modalTextArea, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
                            placeholder="e.g. Need 2 ACs cleaned"
                            placeholderTextColor={colors.textMuted}
                            multiline
                            value={note}
                            onChangeText={setNote}
                            textAlignVertical="top"
                        />
                    </View>

                    <TouchableOpacity
                        style={[styles.primaryBtn, { marginTop: 12 }]}
                        onPress={handleJoin}
                        disabled={joining}
                    >
                      <View style={[styles.primaryBtnGradient, { backgroundColor: colors.primary }]}> 
                        {joining ? <ActivityIndicator color={Verandah.primaryFg} /> : <Text style={styles.primaryBtnText}>Confirm join</Text>}
                      </View>
                    </TouchableOpacity>
                </KeyboardAvoidingView>
            </View>
        </View>
      </Modal>

      {/* Reschedule Modal */}
      <Modal visible={showRescheduleModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
                <View style={styles.modalHeader}>
                    <Text style={[styles.modalTitle, { color: colors.text }]}>Reschedule Visit</Text>
                    <TouchableOpacity onPress={() => setShowRescheduleModal(false)}>
                        <XClose size={22} color={colors.text} aria-hidden={true} />
                    </TouchableOpacity>
                </View>

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.modalBody}
                >
                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: colors.text }]}>New date *</Text>
                        {Platform.OS === 'web' ? (
                          <input
                            type="date"
                            value={formatLocalDateForDb(newVisitDate)}
                            onChange={(e) => {
                              if (e.target.value) {
                                setNewVisitDate(new Date(e.target.value));
                              }
                            }}
                            min={formatLocalDateForDb(new Date())}
                            style={{
                              height: 56,
                              borderWidth: 1,
                              borderStyle: 'solid',
                              borderColor: colors.border,
                              borderRadius: 16,
                              paddingLeft: 16,
                              paddingRight: 16,
                              fontSize: 16,
                              color: colors.text,
                              backgroundColor: colors.surface,
                              fontFamily: 'inherit',
                              outline: 'none',
                              width: '100%',
                              boxSizing: 'border-box',
                            }}
                          />
                        ) : (
                          <>
                            <TouchableOpacity
                              style={[styles.input, { borderColor: colors.border, justifyContent: 'center', backgroundColor: colors.surface }]}
                              onPress={() => setShowRescheduleDatePicker(true)}
                            >
                              <Text style={{ fontSize: 16, color: colors.text }}>
                                {newVisitDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </Text>
                            </TouchableOpacity>
                            {showRescheduleDatePicker && (
                              <DateTimePicker
                                value={newVisitDate}
                                mode="date"
                                display="default"
                                onChange={(event, selectedDate) => {
                                  setShowRescheduleDatePicker(Platform.OS === 'ios');
                                  if (selectedDate) setNewVisitDate(selectedDate);
                                }}
                                minimumDate={new Date()}
                              />
                            )}
                          </>
                        )}
                    </View>

                    {Platform.OS === 'web' ? (
                      <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.label, { color: colors.text }]}>Start time *</Text>
                          <input
                            type="time"
                            value={formatTimeForWeb(newStartTime)}
                            onChange={(e) => {
                              if (e.target.value) {
                                setNewStartTime(parseTimeFromWeb(e.target.value, newStartTime));
                              }
                            }}
                            style={{
                              height: 56,
                              borderWidth: 1,
                              borderStyle: 'solid',
                              borderColor: colors.border,
                              borderRadius: 16,
                              paddingLeft: 16,
                              paddingRight: 16,
                              fontSize: 16,
                              color: colors.text,
                              backgroundColor: colors.surface,
                              fontFamily: 'inherit',
                              outline: 'none',
                              width: '100%',
                              boxSizing: 'border-box',
                            }}
                          />
                        </View>
                        <View style={{ width: 12 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.label, { color: colors.text }]}>End time *</Text>
                          <input
                            type="time"
                            value={formatTimeForWeb(newEndTime)}
                            onChange={(e) => {
                              if (e.target.value) {
                                setNewEndTime(parseTimeFromWeb(e.target.value, newEndTime));
                              }
                            }}
                            style={{
                              height: 56,
                              borderWidth: 1,
                              borderStyle: 'solid',
                              borderColor: colors.border,
                              borderRadius: 16,
                              paddingLeft: 16,
                              paddingRight: 16,
                              fontSize: 16,
                              color: colors.text,
                              backgroundColor: colors.surface,
                              fontFamily: 'inherit',
                              outline: 'none',
                              width: '100%',
                              boxSizing: 'border-box',
                            }}
                          />
                        </View>
                      </View>
                    ) : (
                      <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.label, { color: colors.text }]}>Start time *</Text>
                          <TouchableOpacity
                            style={[styles.input, { borderColor: colors.border, justifyContent: 'center', backgroundColor: colors.surface }]}
                            onPress={() => setShowRescheduleStartTimePicker(true)}
                          >
                            <Text style={{ fontSize: 16, color: colors.text }}>{formatTime(newStartTime)}</Text>
                          </TouchableOpacity>
                          {showRescheduleStartTimePicker && (
                            <DateTimePicker
                              value={newStartTime}
                              mode="time"
                              display="default"
                              onChange={(event, selectedTime) => {
                                setShowRescheduleStartTimePicker(Platform.OS === 'ios');
                                if (selectedTime) setNewStartTime(selectedTime);
                              }}
                            />
                          )}
                        </View>
                        <View style={{ width: 12 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.label, { color: colors.text }]}>End time *</Text>
                          <TouchableOpacity
                            style={[styles.input, { borderColor: colors.border, justifyContent: 'center', backgroundColor: colors.surface }]}
                            onPress={() => setShowRescheduleEndTimePicker(true)}
                          >
                            <Text style={{ fontSize: 16, color: colors.text }}>{formatTime(newEndTime)}</Text>
                          </TouchableOpacity>
                          {showRescheduleEndTimePicker && (
                            <DateTimePicker
                              value={newEndTime}
                              mode="time"
                              display="default"
                              onChange={(event, selectedTime) => {
                                setShowRescheduleEndTimePicker(Platform.OS === 'ios');
                                if (selectedTime) setNewEndTime(selectedTime);
                              }}
                            />
                          )}
                        </View>
                      </View>
                    )}

                    <TouchableOpacity
                        style={[styles.primaryBtn, { marginTop: 12 }]}
                        onPress={handleReschedule}
                        disabled={isRescheduling}
                    >
                      <View style={[styles.primaryBtnGradient, { backgroundColor: colors.primary }]}> 
                        {isRescheduling ? <ActivityIndicator color={Verandah.primaryFg} /> : <Text style={styles.primaryBtnText}>Confirm reschedule</Text>}
                      </View>
                    </TouchableOpacity>
                </KeyboardAvoidingView>
            </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingBottom: 24,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: VerandahLayout.screenPaddingTop,
    paddingBottom: 4,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  creatorSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
    marginTop: 2,
  },
  avatarContainer: {
    marginRight: 12,
  },
  creatorInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  creatorName: {
    fontSize: 16,
    fontWeight: '500',
  },
  hostBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  hostBadgeText: {
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  creatorFlat: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 1,
  },
  detailCard: {
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 12,
    marginBottom: 10,
    backgroundColor: Verandah.card,
    borderWidth: 1,
    borderColor: Verandah.border,
  },
  dateChipContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dateChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dateChipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  visitTitle: {
    ...VerandahType.display,
    color: Verandah.textPrimary,
    marginBottom: 6,
  },
  timeSlotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  timeSlot: {
    fontSize: 15,
    fontWeight: '500',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
    opacity: 0.8,
  },
  metaGrid: {
    flexDirection: 'row',
    gap: 24,
  },
  metaItem: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 1,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  infoCard: {
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 20,
    marginBottom: 10,
    backgroundColor: Verandah.card,
    borderWidth: 1,
    borderColor: Verandah.border,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 1.5,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  providerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  providerMain: {
    flex: 1,
  },
  providerName: {
    fontSize: 17,
    fontWeight: '500',
    marginBottom: 8,
  },
  contactRow: {
    flexDirection: 'row',
    gap: 12,
  },
  contactBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  link: {
    fontSize: 14,
    fontWeight: '500',
  },
  joinersSection: {
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  joinerList: {
    borderRadius: 24,
    padding: 16,
    backgroundColor: Verandah.card,
    borderWidth: 1,
    borderColor: Verandah.border,
  },
  emptyJoiners: {
    padding: 20,
    alignItems: 'center',
  },
  footer: {
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    borderTopWidth: 1,
  },
  shareButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  primaryBtnGradient: {
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtnText: {
    color: Verandah.primaryFg,
    fontSize: 14,
    fontWeight: '600',
  },
  leaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
  },
  leaveBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  creatorActions: {
      gap: 12,
  },
  cancelBtn: {
      height: 44,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: Verandah.danger,
      justifyContent: 'center',
      alignItems: 'center',
  },
  cancelBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: Verandah.danger,
  },
  disabledBtn: {
      height: 44,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
  },
  disabledBtnText: {
      fontSize: 14,
      fontWeight: '600',
  },
  modalOverlay: {
      flex: 1,
      backgroundColor: Verandah.borderStrong,
      justifyContent: 'flex-end',
  },
  modalContent: {
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      padding: 32,
      paddingBottom: Platform.OS === 'ios' ? 44 : 32,
  },
  modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 24,
  },
  modalTitle: {
      fontSize: 20,
      fontWeight: '500',
  },
  modalBody: {
      gap: 16,
  },
  inputGroup: {
      marginBottom: 12,
  },
  label: {
      fontSize: 11,
      fontWeight: '500',
      letterSpacing: 1,
      marginBottom: 8,
  },
  input: {
      height: 56,
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 16,
      fontSize: 16,
  },
  modalTextArea: {
      height: 100,
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingTop: 16,
      fontSize: 16,
  },
  row: {
      flexDirection: 'row',
      marginBottom: 12,
  },
  rescheduleBtn: {
      height: 58,
      borderRadius: 18,
      borderWidth: 1,
      justifyContent: 'center',
      alignItems: 'center',
  },
  rescheduleBtnText: {
      fontSize: 16,
      fontWeight: '500',
  },
});
