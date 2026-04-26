import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Colors } from '../../../constants/Colors';
import { APP_EMOJIS } from '../../../constants/emojis';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabase';

type CommunityDetail = {
  id: string;
  name: string;
  code: string;
  city: string | null;
  area: string | null;
  pincode: string | null;
  community_type: string | null;
  created_at: string | null;
};

type Resident = {
  id: string;
  full_name: string | null;
  flat_number: string | null;
  phone_number: string | null;
  app_role: string;
  removed_at: string | null;
  created_at: string | null;
  community_id: string | null;
};

export default function PlatformCommunityDetailScreen() {
  const colors = Colors.light;
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isPlatformAdmin } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [community, setCommunity] = useState<CommunityDetail | null>(null);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [processingRemove, setProcessingRemove] = useState(false);

  const counts = useMemo(() => {
    const active = residents.filter((row) => !row.removed_at).length;
    const leads = residents.filter((row) => row.app_role === 'community_lead' && !row.removed_at).length;
    return { active, leads };
  }, [residents]);

  const loadData = useCallback(async (showRefreshing = false) => {
    if (!id || !isPlatformAdmin) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (showRefreshing) setRefreshing(true);
    else setLoading(true);

    try {
      const [{ data: communityData, error: communityError }, { data: residentsData, error: residentsError }] = await Promise.all([
        supabase
          .from('communities')
          .select('id, name, code, city, area, pincode, community_type, created_at')
          .eq('id', id)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('id, full_name, flat_number, phone_number, app_role, removed_at, created_at, community_id')
          .eq('community_id', id)
          .order('created_at', { ascending: false }),
      ]);

      if (communityError) throw communityError;
      if (residentsError) throw residentsError;

      setCommunity(communityData);
      setResidents(residentsData ?? []);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to load community', text2: error.message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, isPlatformAdmin]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const removeResident = async () => {
    if (!selectedResident) return;

    const leadCount = residents.filter((row) => row.app_role === 'community_lead' && !row.removed_at).length;
    if (selectedResident.app_role === 'community_lead' && leadCount <= 1) {
      Toast.show({ type: 'error', text1: 'Cannot remove the only community lead' });
      return;
    }

    Alert.alert('Remove resident?', 'This will soft-remove the resident from this community and reset role to resident.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setProcessingRemove(true);
          try {
            await supabase.rpc('set_audit_actor', { p_actor_id: (await supabase.auth.getUser()).data.user?.id });
            const { error } = await supabase.rpc('platform_soft_remove_resident', {
              p_target_profile_id: selectedResident.id,
              p_reason: 'Platform admin removal',
            });
            if (error) throw error;

            Toast.show({ type: 'success', text1: 'Resident removed' });
            setSelectedResident(null);
            await loadData();
          } catch (error: any) {
            Toast.show({ type: 'error', text1: 'Remove failed', text2: error.message });
          } finally {
            setProcessingRemove(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={[`${colors.primary}14`, `${colors.gradientEnd}10`, 'transparent']} style={styles.gradientOverlay} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <Text style={[styles.backIcon, { color: colors.primary }]}>{APP_EMOJIS.back}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Community detail</Text>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <>
          {community ? (
            <View style={[styles.communityCard, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
              <Text style={[styles.communityName, { color: colors.text }]}>{community.name}</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                {community.community_type || 'Type unavailable'} • {community.city || 'City unavailable'}
              </Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                Pincode: {community.pincode || 'N/A'} • Area: {community.area || 'N/A'}
              </Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>Join code: {community.code}</Text>
              <View style={styles.countRow}>
                <Text style={[styles.count, { color: colors.textMuted }]}>Members: {counts.active}</Text>
                <Text style={[styles.count, { color: colors.textMuted }]}>Leads: {counts.leads}</Text>
              </View>
            </View>
          ) : null}

          <FlatList
            data={residents}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.textMuted }]}>No residents found.</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.row,
                  { backgroundColor: colors.glass, borderColor: colors.glassBorder },
                  item.removed_at ? styles.rowRemoved : null,
                ]}
                onPress={() => !item.removed_at && setSelectedResident(item)}
                activeOpacity={item.removed_at ? 1 : 0.82}
              >
                <View style={styles.rowText}>
                  <Text style={[styles.rowName, { color: item.removed_at ? colors.textMuted : colors.text }]}>
                    {item.full_name || 'Resident'}
                    {item.removed_at ? ' (removed)' : ''}
                  </Text>
                  <Text style={[styles.rowMeta, { color: colors.textMuted }]}>
                    Flat: {item.flat_number || 'N/A'} • {item.phone_number || 'No phone'}
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: item.app_role === 'community_lead' ? `${colors.primary}18` : colors.surface2 }]}>
                  <Text style={[styles.badgeText, { color: item.app_role === 'community_lead' ? colors.primary : colors.textMuted }]}>
                    {item.app_role === 'community_lead' ? 'Lead' : item.app_role}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </>
      )}

      <Modal visible={!!selectedResident} transparent animationType="slide" onRequestClose={() => setSelectedResident(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{selectedResident?.full_name || 'Resident'}</Text>
            <Text style={[styles.modalMeta, { color: colors.textMuted }]}>Flat: {selectedResident?.flat_number || 'N/A'}</Text>
            <Text style={[styles.modalMeta, { color: colors.textMuted }]}>Phone: {selectedResident?.phone_number || 'N/A'}</Text>
            <Text style={[styles.modalMeta, { color: colors.textMuted }]}>
              Role: {selectedResident?.app_role === 'community_lead' ? 'Community Lead' : selectedResident?.app_role}
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalSecondary, { borderColor: colors.border }]} onPress={() => setSelectedResident(null)}>
                <Text style={[styles.modalSecondaryText, { color: colors.text }]}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalDanger, { backgroundColor: colors.accent }]}
                onPress={removeResident}
                disabled={processingRemove}
              >
                {processingRemove ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalDangerText}>Remove from community</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 56 },
  gradientOverlay: { position: 'absolute', top: 0, left: 0, right: 0, height: 240 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  backButton: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 18, lineHeight: 20 },
  title: { fontSize: 24, fontWeight: '800' },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  communityCard: { borderWidth: 1, borderRadius: 22, padding: 16, marginBottom: 14 },
  communityName: { fontSize: 18, fontWeight: '800' },
  meta: { fontSize: 13, marginTop: 4 },
  countRow: { marginTop: 12, flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  count: { fontSize: 12, fontWeight: '700' },
  listContent: { paddingBottom: 32, gap: 10 },
  row: { borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: 'row', gap: 8, alignItems: 'center' },
  rowRemoved: { opacity: 0.5 },
  rowText: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '700' },
  rowMeta: { fontSize: 12, marginTop: 3 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  emptyText: { textAlign: 'center', marginTop: 30, fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 8 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalMeta: { fontSize: 14 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modalSecondary: { flex: 1, borderWidth: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  modalSecondaryText: { fontSize: 14, fontWeight: '700' },
  modalDanger: { flex: 1.4, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  modalDangerText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
});
