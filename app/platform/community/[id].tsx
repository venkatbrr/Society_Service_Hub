import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Verandah } from '../../../constants/Colors';
import { useAuth } from '../../../context/AuthContext';
import { Tables } from '../../../lib/database.types';
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
  funds_enabled: boolean;
  blocks_enabled: boolean;
};

type Resident = {
  id: string;
  full_name: string | null;
  email: string | null;
  flat_number: string | null;
  phone_number: string | null;
  app_role: string;
  removed_at: string | null;
  created_at: string | null;
  community_id: string | null;
};

export default function PlatformCommunityDetailScreen() {
  const colors = {
    background: Verandah.surface,
    text: Verandah.textPrimary,
    textMuted: Verandah.textSecondary,
    primary: Verandah.primary,
    accent: Verandah.danger,
    border: Verandah.border,
    card: Verandah.card,
    surface: Verandah.card,
    surface2: Verandah.cardMuted,
  };
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isPlatformAdmin } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [community, setCommunity] = useState<CommunityDetail | null>(null);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [processingRemove, setProcessingRemove] = useState(false);
  const [communityBlocks, setCommunityBlocks] = useState<Tables<'community_blocks'>[]>([]);
  const [fundCollectors, setFundCollectors] = useState<Array<{ id: string; event_id: string; user_id: string; block_id: string | null; fund_title: string | null }>>([]);

  const counts = useMemo(() => {
    const active = residents.filter((row) => !row.removed_at).length;
    const leads = residents.filter((row) => row.app_role === 'community_lead' && !row.removed_at).length;
    return { active, leads };
  }, [residents]);

  const activeLeads = useMemo(
    () => residents.filter((row) => row.app_role === 'community_lead' && !row.removed_at),
    [residents]
  );

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
          .select('id, name, code, city, area, pincode, community_type, created_at, funds_enabled, blocks_enabled')
          .eq('id', id)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('id, full_name, email, flat_number, phone_number, app_role, removed_at, created_at, community_id')
          .eq('community_id', id)
          .order('created_at', { ascending: false }),
      ]);

      if (communityError) throw communityError;
      if (residentsError) throw residentsError;

      setCommunity(communityData);
      setResidents(residentsData ?? []);

      if (communityData?.funds_enabled) {
        const [{ data: blocksData }, { data: collectorsData }] = await Promise.all([
          supabase.rpc('list_community_blocks', { p_community_id: id }),
          supabase
            .from('fund_roles')
            .select('id, event_id, user_id, block_id, events!inner(title, community_id)')
            .eq('role', 'collector')
            .eq('events.community_id', id),
        ]);

        setCommunityBlocks((blocksData ?? []) as Tables<'community_blocks'>[]);
        setFundCollectors(
          ((collectorsData ?? []) as any[]).map((collector) => ({
            id: collector.id,
            event_id: collector.event_id,
            user_id: collector.user_id,
            block_id: collector.block_id,
            fund_title: collector.events?.title ?? null,
          }))
        );
      } else {
        setCommunityBlocks([]);
        setFundCollectors([]);
      }
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

  const revokeFundsAccess = () => {
    if (!community?.id) return;

    Alert.prompt('Revoke funds access', 'Enter a reason to revoke funds access for this community.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async (reason?: string) => {
          if (!reason?.trim()) {
            Toast.show({ type: 'error', text1: 'Reason is required' });
            return;
          }
          const { error } = await supabase.rpc('platform_revoke_funds_access', {
            p_community_id: community.id,
            p_revoke_reason: reason.trim(),
          });
          if (error) {
            Toast.show({ type: 'error', text1: 'Unable to revoke', text2: error.message });
          } else {
            Toast.show({ type: 'success', text1: 'Funds access revoked' });
            await loadData();
          }
        },
      },
    ]);
  };

  const setLead = async (residentId: string) => {
    if (!community?.id) return;
    const { error } = await supabase.rpc('platform_set_community_lead', {
      p_community_id: community.id,
      p_target_user_id: residentId,
    });
    if (error) {
      Toast.show({ type: 'error', text1: 'Unable to set lead', text2: error.message });
    } else {
      await loadData();
    }
  };

  const removeLead = async (residentId: string) => {
    const { error } = await supabase.rpc('platform_remove_community_lead', { p_target_user_id: residentId });
    if (error) {
      Toast.show({ type: 'error', text1: 'Unable to remove lead', text2: error.message });
    } else {
      await loadData();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Community detail</Text>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <>
          <View style={[styles.communityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.communityName, { color: colors.text }]}>Community leads</Text>
            {activeLeads.length > 0 ? (
              activeLeads.map((lead) => (
                <View key={lead.id} style={styles.leadIdentityRow}>
                  <Text style={[styles.meta, { color: colors.text }]}>{lead.full_name || 'Community lead'}</Text>
                  <Text style={[styles.meta, { color: colors.textMuted }]}>{lead.email || 'No email'}</Text>
                </View>
              ))
            ) : (
              <Text style={[styles.meta, { color: colors.text }]}>Not assigned</Text>
            )}
          </View>

          {community ? (
            <View style={[styles.communityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
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

          {community ? (
            <View style={[styles.communityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.communityName, { color: colors.text }]}>Funds activation</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>Status: {community.funds_enabled ? 'Active' : 'Inactive'}</Text>
              {community.funds_enabled ? (
                <TouchableOpacity style={[styles.modalDanger, { backgroundColor: colors.accent, marginTop: 10 }]} onPress={revokeFundsAccess}>
                  <Text style={styles.modalDangerText}>Revoke funds access</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {community?.funds_enabled ? (
            <View style={[styles.communityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.communityName, { color: colors.text }]}>Community lead management</Text>
              {residents.filter((row) => !row.removed_at && row.app_role === 'resident').map((resident) => (
                <TouchableOpacity key={resident.id} style={styles.leadOption} onPress={() => setLead(resident.id)}>
                  <Text style={[styles.meta, { color: colors.text }]}>{resident.full_name ?? 'Resident'}</Text>
                </TouchableOpacity>
              ))}
              {residents.filter((row) => !row.removed_at && row.app_role === 'community_lead').map((lead) => (
                <TouchableOpacity key={lead.id} style={[styles.modalDanger, { backgroundColor: colors.accent, marginTop: 8 }]} onPress={() => removeLead(lead.id)}>
                  <Text style={styles.modalDangerText}>Remove lead: {lead.full_name ?? 'Community lead'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {community?.funds_enabled ? (
            <View style={[styles.communityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.communityName, { color: colors.text }]}>Blocks</Text>
              {communityBlocks.map((block) => (
                <View key={block.id} style={styles.blockRow}>
                  <Text style={[styles.meta, { color: colors.text }]}>{block.name}</Text>
                  <TouchableOpacity
                    style={[styles.modalSecondary, { borderColor: colors.border }]}
                    onPress={async () => {
                      const { error } = await supabase.rpc('platform_archive_community_block', { p_block_id: block.id });
                      if (error) Toast.show({ type: 'error', text1: 'Unable to archive block', text2: error.message });
                      else await loadData();
                    }}
                  >
                    <Text style={[styles.modalSecondaryText, { color: colors.text }]}>Archive</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={[styles.modalSecondary, { borderColor: colors.border, marginTop: 10 }]}
                onPress={() => {
                  Alert.prompt('Add block', 'Enter block name', async (value) => {
                    if (!value?.trim()) return;
                    const { error } = await supabase.rpc('platform_add_community_block', { p_community_id: community.id, p_name: value.trim() });
                    if (error) Toast.show({ type: 'error', text1: 'Unable to add block', text2: error.message });
                    else await loadData();
                  });
                }}
              >
                <Text style={[styles.modalSecondaryText, { color: colors.primary }]}>Add block</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {community?.funds_enabled ? (
            <View style={[styles.communityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.communityName, { color: colors.text }]}>Block in-charges across funds</Text>
              {fundCollectors.map((collector) => (
                <View key={collector.id} style={styles.blockRow}>
                  <Text style={[styles.meta, { color: colors.text }]}>Fund: {collector.fund_title ?? 'Fund'} - {residents.find((row) => row.id === collector.user_id)?.full_name ?? 'Resident'}</Text>
                  <TouchableOpacity
                    style={[styles.modalSecondary, { borderColor: colors.border }]}
                    onPress={async () => {
                      const { error } = await supabase.rpc('platform_remove_block_in_charge', {
                        p_event_id: collector.event_id,
                        p_user_id: collector.user_id,
                      });
                      if (error) Toast.show({ type: 'error', text1: 'Unable to remove in-charge', text2: error.message });
                      else await loadData();
                    }}
                  >
                    <Text style={[styles.modalSecondaryText, { color: colors.accent }]}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ))}
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
                  { backgroundColor: colors.card, borderColor: colors.border },
                  item.removed_at ? styles.rowRemoved : null,
                ]}
                onPress={() => !item.removed_at && setSelectedResident(item)}
                activeOpacity={item.removed_at ? 1 : 0.82}
              >
                <View style={styles.rowText}>
                  <View style={styles.nameRoleRow}>
                    <Text style={[styles.rowName, { color: item.removed_at ? colors.textMuted : colors.text, flex: 1 }]}>
                      {item.full_name || 'Resident'}
                      {item.removed_at ? ' (removed)' : ''}
                    </Text>
                    <View style={[styles.badge, { backgroundColor: item.app_role === 'community_lead' ? `${colors.primary}18` : colors.surface2 }]}>
                      <Text style={[styles.badgeText, { color: item.app_role === 'community_lead' ? colors.primary : colors.textMuted }]}>
                        {item.app_role === 'community_lead' ? 'Lead' : item.app_role}
                      </Text>
                    </View>
                  </View>
                  {item.email ? (
                    <Text style={[styles.rowMeta, { color: colors.textMuted }]}>{item.email}</Text>
                  ) : null}
                  <Text style={[styles.rowMeta, { color: colors.textMuted }]}>
                    Flat: {item.flat_number || 'N/A'} • {item.phone_number || 'No phone'}
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
                {processingRemove ? <ActivityIndicator color={Verandah.primaryFg} /> : <Text style={styles.modalDangerText}>Remove from community</Text>}
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  backButton: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '500' },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  communityCard: { borderWidth: 1, borderRadius: 22, padding: 16, marginBottom: 14 },
  communityName: { fontSize: 18, fontWeight: '500' },
  meta: { fontSize: 13, marginTop: 4 },
  countRow: { marginTop: 12, flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  count: { fontSize: 12, fontWeight: '500' },
  leadOption: { marginTop: 8, paddingVertical: 8 },
  leadIdentityRow: { marginTop: 8 },
  blockRow: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  listContent: { paddingBottom: 32, gap: 10 },
  nameRoleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: 'row', gap: 8, alignItems: 'center' },
  rowRemoved: { opacity: 0.5 },
  rowText: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '500' },
  rowMeta: { fontSize: 12, marginTop: 3 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  badgeText: { fontSize: 11, fontWeight: '500', textTransform: 'capitalize' },
  emptyText: { textAlign: 'center', marginTop: 30, fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 8 },
  modalTitle: { fontSize: 18, fontWeight: '500' },
  modalMeta: { fontSize: 14 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modalSecondary: { flex: 1, borderWidth: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  modalSecondaryText: { fontSize: 14, fontWeight: '500' },
  modalDanger: { flex: 1.4, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  modalDangerText: { color: Verandah.primaryFg, fontSize: 14, fontWeight: '500' },
});
