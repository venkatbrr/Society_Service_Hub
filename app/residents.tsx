import { ArrowLeft } from '@untitledui/icons/ArrowLeft';
import { Award01 } from '@untitledui/icons/Award01';
import { ChevronDown } from '@untitledui/icons/ChevronDown';
import { ChevronUp } from '@untitledui/icons/ChevronUp';
import { SearchLg } from '@untitledui/icons/SearchLg';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, RefreshControl, SectionList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Avatar } from '../components/Avatar';
import { HeaderBackButton } from '../components/HeaderBackButton';
import { Verandah } from '../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';
import { useAuth } from '../context/AuthContext';
import { confirmAction } from '../lib/confirm';
import { replaceTracked } from '../lib/navigation';
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
  const { communityId, appRole, isPlatformAdmin, isCommunityLead, blocksEnabled, communityHasLead } = useAuth();

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

    const result: Array<{ title: string; data: DirectoryResident[]; count: number }> = [];

    Array.from(groups.keys()).sort().forEach(blockName => {
      const allRows = groups.get(blockName)!;
      const isExpanded = expandedBlocks.has(blockName) || !!term;
      result.push({
        title: blockName,
        data: isExpanded ? allRows : [],
        count: allRows.length,
      });
    });

    if (unassigned.length > 0) {
      const isExpanded = expandedBlocks.has('Other') || !!term;
      result.push({
        title: 'Other',
        data: isExpanded ? unassigned : [],
        count: unassigned.length,
      });
    }

    return result;
  }, [blocksEnabled, filteredResidents, search, expandedBlocks]);

  const handleBack = () => {
    if (returnTo === 'profile') {
      replaceTracked(router, '/(tabs)/profile');
      return;
    }
    if (returnTo === 'community') {
      replaceTracked(router, '/(tabs)/community');
      return;
    }
    router.back();
  };

  const handleRemoveResident = () => {
    if (!selectedResident) return;
    confirmAction({
      title: 'Remove resident?',
      message: `Remove ${selectedResident.full_name || 'this resident'} from the community? They will need to use a code to rejoin.`,
      confirmLabel: 'Remove',
      onConfirm: async () => {
        setRemoving(true);
        try {
          const { error } = await supabase.rpc('community_lead_remove_resident', {
            p_target_profile_id: selectedResident.id,
          });
          if (error) throw error;

          Toast.show({ type: 'success', text1: 'Resident removed' });
          setSelectedResident(null);
          await loadResidents(false);
        } catch (error: any) {
          Toast.show({ type: 'error', text1: 'Failed to remove resident', text2: error.message });
        } finally {
          setRemoving(false);
        }
      },
    });
  };

  const pullToRefresh = useWebPullToRefresh(() => loadResidents(true), refreshing);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <HeaderBackButton onPress={handleBack} />
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Residents directory</Text>
          <Text style={styles.subtitle}>{residents.length} neighbors in community</Text>
        </View>
      </View>

      {/* The directory is where residents look to find out who is in charge.
          When the seat is empty, say so here rather than leaving them to infer
          it from the absence of a President badge on every row. */}
      {!loading && !communityHasLead ? (
        <View style={styles.noLeadNotice}>
          <Award01 size={15} color={Verandah.goldInk} aria-hidden={true} />
          <Text style={styles.noLeadNoticeText}>
            No president or vice president has been appointed for your community yet.
          </Text>
        </View>
      ) : null}

      <View style={styles.searchWrap}>
        <SearchLg size={16} color={Verandah.textTertiary} aria-hidden={true} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or flat number"
          placeholderTextColor={Verandah.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={Verandah.accent} />
        </View>
      ) : (
        <SectionList
          {...pullToRefresh.pullProps}
          sections={groupedResidents}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadResidents(true)} tintColor={Verandah.accent} />}
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
                style={[styles.blockTile, { backgroundColor: colors.card, borderColor: colors.borderHair }]}
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
                    isExpanded ? (
                      <ChevronUp size={18} color={colors.textSecondary} aria-hidden={true} />
                    ) : (
                      <ChevronDown size={18} color={colors.textSecondary} aria-hidden={true} />
                    )
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
          renderItem={({ item }) => (
            <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.borderHair, marginBottom: 6 }]}>
              <Avatar name={item.full_name || 'Resident'} size={34} />
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

      <Modal
        visible={!!selectedResident}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedResident(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.paper }]}>
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
                style={[styles.modalCloseBtn, { borderColor: colors.borderHair }]}
                onPress={() => setSelectedResident(null)}
              >
                <Text style={[styles.modalCloseText, { color: colors.textPrimary }]}>Close</Text>
              </TouchableOpacity>
              {isCommunityLead && selectedResident?.app_role !== 'president' && selectedResident?.app_role !== 'vice_president' ? (
                <TouchableOpacity
                  style={[styles.modalRemoveBtn, { backgroundColor: colors.danger }]}
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
  container: {
    flex: 1,
    backgroundColor: Verandah.paper,
    paddingHorizontal: 20,
    paddingTop: VerandahLayout.screenPaddingTop,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '400',
    color: Verandah.textPrimary,
  },
  subtitle: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 12.5,
    color: Verandah.textSecondary,
    marginTop: 2,
  },
  noLeadNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.md,
    backgroundColor: Verandah.sand,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  noLeadNoticeText: {
    flex: 1,
    fontFamily: VerandahType.sansFamily,
    fontSize: 12,
    lineHeight: 16,
    color: Verandah.goldInk,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
    borderRadius: VerandahRadius.search,
    paddingHorizontal: 12,
    height: 42,
    backgroundColor: Verandah.card,
    marginBottom: 10,
    ...Verandah.shadowCard,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: VerandahType.sansFamily,
    color: Verandah.textPrimary,
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingBottom: 32,
    gap: 4,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 13,
    fontFamily: VerandahType.sansFamily,
  },
  blockTile: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: VerandahRadius.card,
    borderWidth: 0.5,
    marginTop: 8,
    marginBottom: 6,
    ...Verandah.shadowCard,
  },
  blockTileTitle: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 14.5,
    fontWeight: '600',
  },
  blockTileRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  blockTileCount: {
    fontSize: 12,
    fontFamily: VerandahType.sansFamily,
  },
  row: {
    borderWidth: 0.5,
    borderRadius: VerandahRadius.card,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...Verandah.shadowCard,
  },
  rowCopy: {
    flex: 1,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: VerandahType.sansFamily,
  },
  meta: {
    fontSize: 12,
    marginTop: 1,
    lineHeight: 16,
    fontFamily: VerandahType.sansFamily,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  metaCompact: {
    fontSize: 11.5,
    fontFamily: VerandahType.sansFamily,
  },
  leadBadge: {
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  leadBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: VerandahType.sansFamily,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 8,
  },
  modalTitle: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 20,
    fontWeight: '400',
  },
  modalMeta: {
    fontSize: 13.5,
    fontFamily: VerandahType.sansFamily,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  modalCloseBtn: {
    flex: 1,
    borderWidth: 0.5,
    borderRadius: VerandahRadius.button,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: VerandahType.sansFamily,
  },
  modalRemoveBtn: {
    flex: 1,
    borderRadius: VerandahRadius.button,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalRemoveText: {
    color: Verandah.primaryFg,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: VerandahType.sansFamily,
  },
});
