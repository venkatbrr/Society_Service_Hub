import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, RefreshControl, SectionList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Avatar } from '../components/Avatar';
import { Verandah } from '../constants/Colors';
import { VerandahLayout, VerandahRadius } from '../constants/Verandah';
import { APP_EMOJIS } from '../constants/emojis';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useWebPullToRefresh } from '../components/useWebPullToRefresh';
import { WebPullIndicator } from '../components/WebPullIndicator';

type DirectoryResident = {
  id: string;
  full_name: string | null;
  flat_number: string | null;
  phone_number: string | null;
  email: string | null;
  app_role: 'admin' | 'resident' | 'president' | 'vice_president';
  block_id: string | null;
  block_name: string | null;
};

export default function ResidentsScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const colors = Verandah;
  const { communityId, appRole, isPlatformAdmin, isCommunityLead, blocksEnabled } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [residents, setResidents] = useState<DirectoryResident[]>([]);
  const [selectedResident, setSelectedResident] = useState<DirectoryResident | null>(null);
  const [removing, setRemoving] = useState(false);
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());

  const canViewPhone = isCommunityLead || isPlatformAdmin;

  const loadResidents = useCallback(async (showRefreshing = false) => {
    if (!communityId) {
      setResidents([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (showRefreshing) setRefreshing(true);
    else setLoading(true);

    try {
      const { data, error } = await supabase.rpc('get_residents_directory', {
        p_include_phone: canViewPhone,
      });

      if (error) throw error;

      setResidents((data ?? []) as DirectoryResident[]);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to load residents', text2: error.message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [communityId, canViewPhone]);

  useFocusEffect(
    useCallback(() => {
      loadResidents();
    }, [loadResidents])
  );

  const filteredResidents = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return residents;
    return residents.filter(
      (row) =>
        (row.full_name || '').toLowerCase().includes(term) ||
        (row.flat_number || '').toLowerCase().includes(term)
    );
  }, [residents, search]);

  const groupedResidents = useMemo(() => {
    if (!blocksEnabled) return [{ title: '', data: filteredResidents, count: filteredResidents.length }];

    const groups = new Map<string, DirectoryResident[]>();
    const unassigned: DirectoryResident[] = [];
    const term = search.trim();

    filteredResidents.forEach(res => {
      if (res.block_name) {
        if (!groups.has(res.block_name)) groups.set(res.block_name, []);
        groups.get(res.block_name)!.push(res);
      } else {
        unassigned.push(res);
      }
    });

    const sortedGroups = Array.from(groups.keys()).sort().map(key => ({
      title: key,
      data: (expandedBlocks.has(key) || term) ? groups.get(key)! : [],
      count: groups.get(key)!.length,
    }));

    if (unassigned.length > 0) {
      sortedGroups.push({ 
        title: 'Unassigned', 
        data: (expandedBlocks.has('Unassigned') || term) ? unassigned : [],
        count: unassigned.length
      });
    }

    return sortedGroups;
  }, [filteredResidents, blocksEnabled, expandedBlocks, search]);

  const handleBack = () => {
    if (returnTo === 'profile') {
      router.replace('/(tabs)/profile');
      return;
    }
    if (returnTo === 'community') {
      router.replace('/(tabs)/community');
      return;
    }
    router.back();
  };

  const pullToRefresh = useWebPullToRefresh(() => loadResidents(true), refreshing);

  const handleRemoveResident = () => {
    if (!selectedResident) return;
    Alert.alert(
      'Remove resident?',
      `Remove ${selectedResident.full_name || 'this resident'} from the community? They will need to use a code to rejoin.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemoving(true);
            try {
              const { error } = await supabase.rpc('community_lead_remove_resident', {
                p_target_profile_id: selectedResident.id,
              });
              if (error) throw error;
              Toast.show({ type: 'success', text1: 'Resident removed' });
              setSelectedResident(null);
              await loadResidents();
            } catch (error: any) {
              Toast.show({ type: 'error', text1: 'Remove failed', text2: error.message });
            } finally {
              setRemoving(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBack}
          style={[styles.backButton, { backgroundColor: colors.cardMuted, borderColor: colors.border }]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Community directory</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Active residents in your community</Text>
        </View>
      </View>

      <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Text style={styles.searchIcon}>{APP_EMOJIS.search}</Text>
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder="Search by name or flat"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <SectionList
          sections={groupedResidents}
          keyExtractor={(item) => item.id}
          {...pullToRefresh.pullProps}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadResidents(true)} />}
          ListHeaderComponent={<WebPullIndicator pullDistance={pullToRefresh.pullDistance} refreshing={refreshing} isPulling={pullToRefresh.isPulling} />}
          contentContainerStyle={filteredResidents.length ? styles.listContent : styles.emptyContent}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No residents found.</Text>
          }
          renderSectionHeader={({ section }) => {
            if (!section.title) return null;
            const isExpanded = expandedBlocks.has(section.title) || !!search.trim();
            return (
              <TouchableOpacity
                style={[styles.blockTile, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => {
                  setExpandedBlocks(prev => {
                    const next = new Set(prev);
                    if (next.has(section.title)) next.delete(section.title);
                    else next.add(section.title);
                    return next;
                  });
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.blockTileTitle, { color: colors.textPrimary }]}>{section.title}</Text>
                <View style={styles.blockTileRight}>
                  <Text style={[styles.blockTileCount, { color: colors.textSecondary }]}>{section.count} residents</Text>
                  {!search.trim() && (
                    <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} />
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
          renderItem={({ item }) => (
            <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 6 }]}>
              <Avatar name={item.full_name || 'Resident'} size={32} />
              <View style={styles.rowCopy}>
                <View style={styles.rowTop}>
                  {canViewPhone ? (
                    <TouchableOpacity onPress={() => setSelectedResident(item)} activeOpacity={0.75}>
                      <Text style={[styles.name, { color: colors.textPrimary }]}>{item.full_name || 'Resident'}</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={[styles.name, { color: colors.textPrimary }]}>{item.full_name || 'Resident'}</Text>
                  )}
                  {item.app_role === 'president' || item.app_role === 'vice_president' ? (
                    <View style={[styles.leadBadge, { backgroundColor: colors.accentSoft }]}>
                      <Text style={[styles.leadBadgeText, { color: colors.accent }]}>
                        {item.app_role === 'president' ? 'President' : 'Vice President'}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.meta, { color: colors.textSecondary }]}>{item.email || 'No email'}</Text>
                <View style={styles.metaRow}>
                  <Text style={[styles.metaCompact, { color: colors.textSecondary }]}>Flat: {item.flat_number || 'N/A'}</Text>
                  {canViewPhone ? (
                    <Text style={[styles.metaCompact, { color: colors.textSecondary }]}>Phone: {item.phone_number || 'N/A'}</Text>
                  ) : null}
                </View>
              </View>
            </View>
          )}
        />
      )}

      {/* Resident detail modal — visible to community leads */}
      <Modal
        visible={!!selectedResident}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedResident(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              {selectedResident?.full_name || 'Resident'}
            </Text>
            <Text style={[styles.modalMeta, { color: colors.textSecondary }]}>
              Email: {selectedResident?.email || 'N/A'}
            </Text>
            <Text style={[styles.modalMeta, { color: colors.textSecondary }]}>
              Flat: {selectedResident?.flat_number || 'N/A'}
            </Text>
            <Text style={[styles.modalMeta, { color: colors.textSecondary }]}>
              Phone: {selectedResident?.phone_number || 'N/A'}
            </Text>
            <Text style={[styles.modalMeta, { color: colors.textSecondary }]}>
              Role: {selectedResident?.app_role === 'president' ? 'President' : selectedResident?.app_role === 'vice_president' ? 'Vice President' : 'Resident'}
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalCloseBtn, { borderColor: colors.border }]}
                onPress={() => setSelectedResident(null)}
              >
                <Text style={[styles.modalCloseText, { color: colors.textPrimary }]}>Close</Text>
              </TouchableOpacity>
              {isCommunityLead && selectedResident?.app_role !== 'president' && selectedResident?.app_role !== 'vice_president' ? (
                <TouchableOpacity
                  style={[styles.modalRemoveBtn, { backgroundColor: colors.accent }]}
                  onPress={handleRemoveResident}
                  disabled={removing}
                >
                  {removing ? (
                    <ActivityIndicator color={Verandah.primaryFg} />
                  ) : (
                    <Text style={styles.modalRemoveText}>Remove</Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: VerandahLayout.screenPaddingTop },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  backButton: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  title: { fontSize: 24, fontWeight: '500', letterSpacing: -0.4 },
  subtitle: { fontSize: 13, marginTop: 2 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 40, marginBottom: 10 },
  searchIcon: { fontSize: 15, lineHeight: 16 },
  searchInput: { flex: 1, fontSize: 13 },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingBottom: 24, gap: 6 },
  emptyContent: { flexGrow: 1, justifyContent: 'center' },
  emptyText: { textAlign: 'center', fontSize: 13 },
  blockTile: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, marginTop: 8, marginBottom: 6 },
  blockTileTitle: { fontSize: 15, fontWeight: '600' },
  blockTileRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  blockTileCount: { fontSize: 12 },
  row: { borderWidth: 1, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowCopy: { flex: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 14, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 1, lineHeight: 16 },
  metaRow: { flexDirection: 'row', gap: 10, marginTop: 2 },
  metaCompact: { fontSize: 11 },
  leadBadge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  leadBadgeText: { fontSize: 10, fontWeight: '500' },
  modalOverlay: { flex: 1, backgroundColor: Verandah.borderStrong, justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 8 },
  modalTitle: { fontSize: 18, fontWeight: '500' },
  modalMeta: { fontSize: 14 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modalCloseBtn: { flex: 1, borderWidth: 1, borderRadius: VerandahRadius.md, paddingVertical: 12, alignItems: 'center' },
  modalCloseText: { fontSize: 14, fontWeight: '500' },
  modalRemoveBtn: { flex: 1, borderRadius: VerandahRadius.md, paddingVertical: 12, alignItems: 'center' },
  modalRemoveText: { color: Verandah.primaryFg, fontSize: 14, fontWeight: '500' },
});
