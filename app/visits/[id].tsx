import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { JoinerListItem } from '../../components/JoinerListItem';
import { VisitStatusBadge } from '../../components/VisitStatusBadge';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../context/AuthContext';
import { VisitJoinerWithProfile, VisitWithJoinerData } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';

export default function VisitDetailScreen() {
  const { id, returnTo, visitTab } = useLocalSearchParams<{ id: string; returnTo?: string; visitTab?: 'upcoming' | 'past' }>();
  const router = useRouter();
  const { user, profile } = useAuth();
  const colors = Colors.light;

  const [visit, setVisit] = useState<VisitWithJoinerData | null>(null);
  const [joiners, setJoiners] = useState<VisitJoinerWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  // Join Modal state
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [flatNo, setFlatNo] = useState(profile?.flat_number || '');
  const [note, setNote] = useState('');

  const fetchVisitData = useCallback(async () => {
    if (!id || !user?.id) return;

    try {
      // 1. Start parallel fetch for visit and joiners
      // 'get_community_visits' fetches upcoming visits, but may not include full details for direct link
      const [visitsResult, joinersResult] = await Promise.all([
        supabase.rpc('get_community_visits', {
          p_community_id: profile?.community_id || '',
          p_user_id: user.id
        }),
        supabase.rpc('get_visit_joiners', {
          p_visit_id: id
        })
      ]);

      if (joinersResult.error) throw joinersResult.error;
      const joinersData = joinersResult.data || [];
      setJoiners(joinersData);

      const currentVisit = (visitsResult.data as VisitWithJoinerData[] || []).find(v => v.id === id);

      if (!currentVisit) {
        // Fallback: If not in the "upcoming/active rpc" list, fetch direct
        const { data: directData, error: directError } = await supabase
          .from('service_visits')
          .select('*')
          .eq('id', id)
          .single();

        if (directError) throw directError;

        // Fetch creator profile in parallel (don't waterfall)
        const [creatorResult] = await Promise.all([
          supabase
            .from('profiles')
            .select('full_name, flat_number, avatar_url')
            .eq('id', directData.created_by)
            .maybeSingle()
        ]);

        setVisit({
          ...directData,
          creator_name: creatorResult.data?.full_name || 'Unknown',
          creator_flat: creatorResult.data?.flat_number,
          creator_avatar_url: creatorResult.data?.avatar_url,
          joiner_count: joinersData.length
        });
      } else {
          setVisit({
            ...currentVisit,
            joiner_count: joinersData.length // Ensure accurate count from dedicated joiners fetch
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
        flat_number: flatNo.trim() || null
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

  const handleLeave = async () => {
    Alert.alert('Leave Visit', 'Are you sure you want to leave this visit?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
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
        }
      }
    ]);
  };

  const updateStatus = async (status: string) => {
      try {
          const { error } = await supabase
            .from('service_visits')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id);

          if (error) throw error;
          Toast.show({ type: 'success', text1: `Visit marked as ${status}` });
          setVisit((prev: VisitWithJoinerData | null) => prev ? { ...prev, status } : null);
      } catch (e) {
          console.error(e);
          Toast.show({ type: 'error', text1: 'Error updating status' });
      }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
  };

  const handleBack = () => {
    if (returnTo === 'visits') {
      router.replace({
        pathname: '/',
        params: { segment: 'visits', visitTab: visitTab === 'past' ? 'past' : 'upcoming' },
      });
      return;
    }

    router.back();
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
        <Text style={{ color: colors.textMuted }}>Visit not found</Text>
      </View>
    );
  }

  const isCreator = visit.created_by === user?.id;
  const isFull = visit.max_joiners ? visit.joiner_count! >= visit.max_joiners : false;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Creator Identity */}
        <View style={styles.creatorSection}>
          <View style={styles.avatarContainer}>
            {visit.creator_avatar_url ? (
               <Image source={{ uri: visit.creator_avatar_url }} style={styles.creatorAvatar} />
            ) : (
                <View style={[styles.creatorAvatarPlaceholder, { backgroundColor: colors.primary + '12' }]}>
                    <Text style={[styles.creatorInitials, { color: colors.primary }]}>
                        {visit.creator_name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().substring(0, 2)}
                    </Text>
                </View>
            )}
          </View>
          <View style={styles.creatorInfo}>
            <View style={styles.nameRow}>
                <Text style={[styles.creatorName, { color: colors.text }]}>{visit.creator_name}</Text>
                {isCreator && (
                    <View style={[styles.hostBadge, { backgroundColor: '#10B98112' }]}>
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
             <View style={[styles.dateChip, { backgroundColor: colors.primary + '10' }]}>
                <Text style={[styles.dateChipText, { color: colors.primary }]}>{formatDate(visit.visit_date)}</Text>
             </View>
             <VisitStatusBadge status={visit.status as 'upcoming' | 'in_progress' | 'completed' | 'cancelled'} />
          </View>

          <Text style={[styles.visitTitle, { color: colors.text }]}>{visit.title}</Text>
          <View style={styles.timeSlotRow}>
            <Ionicons name="time-outline" size={18} color={colors.icon} />
            <Text style={[styles.timeSlot, { color: colors.text }]}>{visit.visit_time_slot}</Text>
          </View>

          {visit.description && (
            <Text style={[styles.description, { color: colors.textMuted }]}>{visit.description}</Text>
          )}

          <View style={styles.metaGrid}>
            <View style={styles.metaItem}>
                <Text style={[styles.metaLabel, { color: colors.textMuted }]}>CATEGORY</Text>
                <Text style={[styles.metaValue, { color: colors.text }]}>{visit.category}</Text>
            </View>
            <View style={styles.metaItem}>
                <Text style={[styles.metaLabel, { color: colors.textMuted }]}>EST. COST</Text>
                <Text style={[styles.metaValue, { color: colors.text }]}>{visit.estimated_cost || 'Not specified'}</Text>
            </View>
          </View>
        </View>

        {/* Provider Profile */}
        <View style={styles.infoCard}>
           <Text style={[styles.cardTitle, { color: colors.textMuted }]}>PROVIDER INFO</Text>
           <View style={styles.providerHeader}>
              <View style={styles.providerMain}>
                <Text style={[styles.providerName, { color: colors.text }]}>{visit.provider_name}</Text>
                {(visit.provider_phone || visit.provider_whatsapp) && (
                    <View style={styles.contactRow}>
                        {visit.provider_phone && (
                            <TouchableOpacity style={[styles.contactBtn, { backgroundColor: colors.surface2 }]} onPress={() => Linking.openURL(`tel:${visit.provider_phone}`)}>
                                <Ionicons name="call" size={18} color={colors.primary} />
                            </TouchableOpacity>
                        )}
                        {visit.provider_whatsapp && (
                            <TouchableOpacity style={[styles.contactBtn, { backgroundColor: colors.surface2 }]} onPress={() => Linking.openURL(`https://wa.me/${visit.provider_whatsapp}`)}>
                                <Ionicons name="logo-whatsapp" size={18} color={colors.secondary} />
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
             NEIGHBORS JOINING ({joiners.length} {visit.max_joiners ? `/ ${visit.max_joiners}` : ''})
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
      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        {isCreator ? (
            <View style={styles.creatorActions}>
                {visit.status === 'upcoming' && (
                    <TouchableOpacity style={styles.primaryBtn} onPress={() => updateStatus('completed')}>
                        <LinearGradient
                          colors={[colors.gradientStart, colors.gradientEnd]}
                          style={styles.primaryBtnGradient}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                        >
                            <Text style={styles.primaryBtnText}>Mark as Completed</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.cancelBtn} onPress={() => updateStatus('cancelled')}>
                    <Text style={[styles.cancelBtnText, { color: colors.accent }]}>Cancel Visit</Text>
                </TouchableOpacity>
            </View>
        ) : visit.has_user_joined ? (
            <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
                <Ionicons name="exit-outline" size={20} color={colors.accent} />
                <Text style={[styles.leaveBtnText, { color: colors.accent }]}>Leave this visit</Text>
            </TouchableOpacity>
        ) : visit.status === 'upcoming' && !isFull ? (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setShowJoinModal(true)}>
                <LinearGradient
                  colors={[colors.gradientStart, colors.gradientEnd]}
                  style={styles.primaryBtnGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                    <Text style={styles.primaryBtnText}>Join this visit</Text>
                </LinearGradient>
            </TouchableOpacity>
        ) : isFull ? (
            <View style={[styles.disabledBtn, { backgroundColor: colors.border }]}>
                <Text style={[styles.disabledBtnText, { color: colors.textMuted }]}>Visit Full</Text>
            </View>
        ) : null}
      </View>

      {/* Join Modal */}
      <Modal visible={showJoinModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
                <View style={styles.modalHeader}>
                    <Text style={[styles.modalTitle, { color: colors.text }]}>Join Visit</Text>
                    <TouchableOpacity onPress={() => setShowJoinModal(false)}>
                        <Ionicons name="close" size={24} color={colors.text} />
                    </TouchableOpacity>
                </View>

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.modalBody}
                >
                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: colors.text }]}>MY FLAT NUMBER</Text>
                        <TextInput
                            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
                            placeholder="e.g. A-204"
                            placeholderTextColor={colors.textMuted}
                            value={flatNo}
                            onChangeText={setFlatNo}
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: colors.text }]}>NOTE FOR PROVIDER (OPTIONAL)</Text>
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
                        <LinearGradient
                          colors={[colors.gradientStart, colors.gradientEnd]}
                          style={styles.primaryBtnGradient}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                        >
                            {joining ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>Confirm Join</Text>}
                        </LinearGradient>
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
    paddingBottom: 120,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  creatorSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 24,
    marginTop: 10,
  },
  avatarContainer: {
    marginRight: 16,
  },
  creatorAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  creatorAvatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  creatorInitials: {
    fontSize: 20,
    fontWeight: '700',
  },
  creatorInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  creatorName: {
    fontSize: 18,
    fontWeight: '800',
  },
  hostBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  hostBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  creatorFlat: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
  },
  detailCard: {
    marginHorizontal: 24,
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  dateChipContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  dateChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  dateChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  visitTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  timeSlotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  timeSlot: {
    fontSize: 16,
    fontWeight: '600',
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
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
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  infoCard: {
    marginHorizontal: 24,
    padding: 20,
    borderRadius: 24,
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 16,
    paddingHorizontal: 24,
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
    fontWeight: '700',
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
    fontWeight: '700',
  },
  joinersSection: {
    paddingHorizontal: 24,
    marginBottom: 40,
  },
  joinerList: {
    borderRadius: 24,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  emptyJoiners: {
    padding: 20,
    alignItems: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    borderTopWidth: 1,
  },
  primaryBtn: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  primaryBtnGradient: {
    height: 58,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  leaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 58,
  },
  leaveBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  creatorActions: {
      gap: 12,
  },
  cancelBtn: {
      height: 50,
      justifyContent: 'center',
      alignItems: 'center',
  },
  cancelBtnText: {
      fontSize: 14,
      fontWeight: '700',
  },
  disabledBtn: {
      height: 58,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
  },
  disabledBtnText: {
      fontSize: 16,
      fontWeight: '700',
  },
  modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(45, 43, 85, 0.5)',
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
      fontWeight: '800',
  },
  modalBody: {
      gap: 16,
  },
  inputGroup: {
      marginBottom: 12,
  },
  label: {
      fontSize: 11,
      fontWeight: '700',
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
});
