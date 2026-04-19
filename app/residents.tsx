import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Colors } from '../constants/Colors';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

type DirectoryResident = {
  id: string;
  full_name: string | null;
  flat_number: string | null;
  phone_number: string | null;
  app_role: 'admin' | 'community_admin' | 'resident';
};

type PromotionRequest = {
  id: string;
  target_user_id: string;
  requested_by: string;
  status: string;
};

export default function ResidentsScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const colors = Colors.light;
  const { user, communityId, approvalStatus, isCommunityAdmin } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [residents, setResidents] = useState<DirectoryResident[]>([]);
  const [promotionRequests, setPromotionRequests] = useState<PromotionRequest[]>([]);
  const [selectedResident, setSelectedResident] = useState<DirectoryResident | null>(null);

  const loadResidents = useCallback(async (showRefreshing = false) => {
    if (!communityId || approvalStatus !== 'approved') {
      setResidents([]);
      setPromotionRequests([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (showRefreshing) setRefreshing(true);
    else setLoading(true);

    try {
      const { data, error } = await supabase.rpc('get_residents_directory', {
        p_include_phone: isCommunityAdmin,
      });

      if (error) throw error;

      setResidents((data ?? []) as DirectoryResident[]);

      if (isCommunityAdmin) {
        const { data: pendingData, error: pendingError } = await supabase
          .from('community_admin_requests')
          .select('id, target_user_id, requested_by, status')
          .eq('community_id', communityId)
          .eq('status', 'pending');

        if (pendingError) throw pendingError;
        setPromotionRequests(pendingData ?? []);
      } else {
        setPromotionRequests([]);
      }
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to load residents', text2: error.message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [approvalStatus, communityId, isCommunityAdmin]);

  useFocusEffect(
    useCallback(() => {
      loadResidents();
    }, [loadResidents])
  );

  const filteredResidents = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return residents;
    return residents.filter((row) => (row.full_name || '').toLowerCase().includes(term) || (row.flat_number || '').toLowerCase().includes(term));
  }, [residents, search]);

  const pendingMap = useMemo(() => {
    const map = new Map<string, PromotionRequest>();
    promotionRequests.forEach((row) => map.set(row.target_user_id, row));
    return map;
  }, [promotionRequests]);

  const handlePromote = async (targetUserId: string) => {
    setProcessingId(targetUserId);
    try {
      const { error } = await supabase.rpc('create_community_admin_request', { p_target_user_id: targetUserId });
      if (error) throw error;
      Toast.show({ type: 'success', text1: 'Promotion request sent' });
      await loadResidents();
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Promotion failed', text2: error.message });
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancel = async (requestId: string) => {
    setProcessingId(requestId);
    try {
      const { error } = await supabase.rpc('cancel_community_admin_request', { p_request_id: requestId });
      if (error) throw error;
      Toast.show({ type: 'success', text1: 'Promotion request cancelled' });
      await loadResidents();
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Cancel failed', text2: error.message });
    } finally {
      setProcessingId(null);
    }
  };

  const handleBack = () => {
    if (returnTo === 'profile') {
      router.push('/(tabs)/profile');
      return;
    }

    router.back();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={[styles.backButton, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.text }]}>Community directory</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Approved residents in your community</Text>
        </View>
      </View>

      <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search by name or flat"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <View style={styles.loaderWrap}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={filteredResidents}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadResidents(true)} />}
          contentContainerStyle={filteredResidents.length ? styles.listContent : styles.emptyContent}
          ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.textMuted }]}>No residents found.</Text>}
          renderItem={({ item }) => {
            const pending = pendingMap.get(item.id);
            const canPromote = isCommunityAdmin && item.app_role === 'resident';
            const canCancel = pending && pending.requested_by === user?.id;
            const busy = processingId === item.id || (pending && processingId === pending.id);

            return (
              <View style={[styles.row, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}> 
                <View style={styles.rowCopy}>
                  <View style={styles.rowTop}>
                    {isCommunityAdmin ? (
                      <TouchableOpacity onPress={() => setSelectedResident(item)} activeOpacity={0.75}>
                        <Text style={[styles.name, { color: colors.text }]}>{item.full_name || 'Resident'}</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={[styles.name, { color: colors.text }]}>{item.full_name || 'Resident'}</Text>
                    )}
                    {item.app_role === 'community_admin' ? (
                      <View style={[styles.adminBadge, { backgroundColor: `${colors.primary}18` }]}> 
                        <Text style={[styles.adminBadgeText, { color: colors.primary }]}>Admin</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.meta, { color: colors.textMuted }]}>Flat: {item.flat_number || 'N/A'}</Text>
                  {isCommunityAdmin ? <Text style={[styles.meta, { color: colors.textMuted }]}>Phone: {item.phone_number || 'N/A'}</Text> : null}
                </View>

                {canPromote ? (
                  pending ? (
                    canCancel ? (
                      <TouchableOpacity style={[styles.actionBtn, { borderColor: colors.border }]} onPress={() => handleCancel(pending.id)} disabled={busy}>
                        {busy ? <ActivityIndicator color={colors.text} /> : <Text style={[styles.actionText, { color: colors.text }]}>Cancel</Text>}
                      </TouchableOpacity>
                    ) : (
                      <View style={[styles.pendingPill, { backgroundColor: `${colors.warning}20` }]}> 
                        <Text style={[styles.pendingText, { color: colors.warning }]}>Pending</Text>
                      </View>
                    )
                  ) : (
                    <TouchableOpacity style={[styles.actionBtn, { borderColor: colors.primary }]} onPress={() => handlePromote(item.id)} disabled={busy}>
                      {busy ? <ActivityIndicator color={colors.primary} /> : <Text style={[styles.actionText, { color: colors.primary }]}>Promote</Text>}
                    </TouchableOpacity>
                  )
                ) : null}
              </View>
            );
          }}
        />
      )}

      <Modal visible={!!selectedResident} transparent animationType="slide" onRequestClose={() => setSelectedResident(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}> 
            <Text style={[styles.modalTitle, { color: colors.text }]}>{selectedResident?.full_name || 'Resident'}</Text>
            <Text style={[styles.modalMeta, { color: colors.textMuted }]}>Flat: {selectedResident?.flat_number || 'N/A'}</Text>
            <Text style={[styles.modalMeta, { color: colors.textMuted }]}>Phone: {selectedResident?.phone_number || 'N/A'}</Text>
            <Text style={[styles.modalMeta, { color: colors.textMuted }]}>Role: {selectedResident?.app_role || 'resident'}</Text>

            <TouchableOpacity style={[styles.modalCloseBtn, { borderColor: colors.border }]} onPress={() => setSelectedResident(null)}>
              <Text style={[styles.modalCloseText, { color: colors.text }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 56 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  backButton: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { fontSize: 13, marginTop: 2 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 14, height: 48, marginBottom: 14 },
  searchInput: { flex: 1, fontSize: 14 },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingBottom: 30, gap: 10 },
  emptyContent: { flexGrow: 1, justifyContent: 'center' },
  emptyText: { textAlign: 'center', fontSize: 14 },
  row: { borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowCopy: { flex: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 3 },
  adminBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  adminBadgeText: { fontSize: 11, fontWeight: '700' },
  actionBtn: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, minWidth: 72, alignItems: 'center' },
  actionText: { fontSize: 12, fontWeight: '700' },
  pendingPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  pendingText: { fontSize: 11, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 8 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalMeta: { fontSize: 14 },
  modalCloseBtn: { marginTop: 14, borderWidth: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  modalCloseText: { fontSize: 14, fontWeight: '700' },
});
