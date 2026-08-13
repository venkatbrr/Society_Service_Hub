import { Plus } from '@untitledui/icons/Plus';
import { SearchLg } from '@untitledui/icons/SearchLg';
import { XClose } from '@untitledui/icons/XClose';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Avatar } from '../../components/Avatar';
import { EmptyState } from '../../components/EmptyState';
import { HeaderBackButton } from '../../components/HeaderBackButton';
import { Verandah } from '../../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { confirmAction } from '../../lib/confirm';
import { goBackSmart } from '../../lib/navigation';
import { supabase } from '../../lib/supabase';

interface OrganizerRow {
  id: string;
  user_id: string;
  full_name: string | null;
  flat_number: string | null;
}

interface ResidentRow {
  id: string;
  full_name: string | null;
  flat_number: string | null;
}

export default function EventCoordinatorsScreen() {
  const router = useRouter();
  const { user, communityId } = useAuth();

  const [organizers, setOrganizers] = useState<OrganizerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [residents, setResidents] = useState<ResidentRow[]>([]);
  const [residentsLoading, setResidentsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);

  const loadOrganizers = useCallback(async () => {
    if (!communityId) {
      setOrganizers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('community_event_organizers')
        .select('id, user_id, profiles!community_event_organizers_user_id_fkey(full_name, flat_number)')
        .eq('community_id', communityId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setOrganizers(
        (data ?? []).map((row: any) => ({
          id: row.id,
          user_id: row.user_id,
          full_name: row.profiles?.full_name ?? null,
          flat_number: row.profiles?.flat_number ?? null,
        }))
      );
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to load coordinators', text2: error.message });
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useFocusEffect(
    useCallback(() => {
      loadOrganizers();
    }, [loadOrganizers])
  );

  const handleBack = () => goBackSmart(router, '/events/coordinators');

  const handleRemove = (row: OrganizerRow) => {
    confirmAction({
      title: `Remove ${row.full_name || 'this coordinator'}?`,
      message: 'They will no longer be able to post events. Events they already posted stay published.',
      confirmLabel: 'Remove',
      onConfirm: async () => {
        setBusyId(row.id);
        try {
          const { error } = await supabase.from('community_event_organizers').delete().eq('id', row.id);
          if (error) throw error;
          Toast.show({ type: 'success', text1: 'Coordinator removed' });
          await loadOrganizers();
        } catch (error: any) {
          Toast.show({ type: 'error', text1: 'Could not remove coordinator', text2: error.message });
        } finally {
          setBusyId(null);
        }
      },
    });
  };

  const openPicker = async () => {
    setPickerVisible(true);
    setResidentsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_residents_directory', { p_include_phone: false });
      if (error) throw error;
      const existingIds = new Set(organizers.map((o) => o.user_id));
      setResidents(((data ?? []) as any[]).filter((r) => !existingIds.has(r.id) && r.id !== user?.id));
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to load residents', text2: error.message });
    } finally {
      setResidentsLoading(false);
    }
  };

  const filteredResidents = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return residents;
    return residents.filter(
      (r) => (r.full_name || '').toLowerCase().includes(term) || (r.flat_number || '').toLowerCase().includes(term)
    );
  }, [residents, search]);

  const handleAdd = async (resident: ResidentRow) => {
    if (!communityId || !user?.id) return;
    setAdding(true);
    try {
      const { error } = await supabase
        .from('community_event_organizers')
        .insert({ community_id: communityId, user_id: resident.id, granted_by: user.id });
      if (error) throw error;
      Toast.show({ type: 'success', text1: `${resident.full_name || 'Resident'} can now post events` });
      setPickerVisible(false);
      setSearch('');
      await loadOrganizers();
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Could not add coordinator', text2: error.message });
    } finally {
      setAdding(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <HeaderBackButton onPress={handleBack} />
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Events coordinators</Text>
          <Text style={styles.subtitle}>They can post and manage community events</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={Verandah.accent} />
        </View>
      ) : (
        <FlatList
          data={organizers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={organizers.length ? styles.listContent : styles.emptyList}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Avatar name={item.full_name || 'Resident'} size={34} />
              <View style={styles.rowCopy}>
                <Text style={styles.rowName}>{item.full_name || 'Resident'}</Text>
                {item.flat_number ? <Text style={styles.rowMeta}>Flat {item.flat_number}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => handleRemove(item)} disabled={busyId === item.id} hitSlop={8}>
                {busyId === item.id ? (
                  <ActivityIndicator color={Verandah.danger} size="small" />
                ) : (
                  <XClose size={18} color={Verandah.danger} aria-hidden={true} />
                )}
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <EmptyState title="No coordinators yet" message="Add a resident to let them post cultural, sports and festival events." />
          }
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={openPicker} activeOpacity={0.85}>
        <Plus size={20} color={Verandah.primaryFg} aria-hidden={true} />
        <Text style={styles.fabText}>Add coordinator</Text>
      </TouchableOpacity>

      <Modal visible={pickerVisible} transparent animationType="slide" onRequestClose={() => setPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add events coordinator</Text>

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

            {residentsLoading ? (
              <ActivityIndicator color={Verandah.accent} style={{ marginVertical: 20 }} />
            ) : (
              <FlatList
                data={filteredResidents}
                keyExtractor={(item) => item.id}
                style={styles.pickerList}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.pickerRow} onPress={() => handleAdd(item)} disabled={adding} activeOpacity={0.8}>
                    <Avatar name={item.full_name || 'Resident'} size={30} />
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowName}>{item.full_name || 'Resident'}</Text>
                      {item.flat_number ? <Text style={styles.rowMeta}>Flat {item.flat_number}</Text> : null}
                    </View>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={styles.emptyPickerText}>No residents found.</Text>}
              />
            )}

            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setPickerVisible(false)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
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
    marginBottom: 14,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 24,
    lineHeight: 28,
    color: Verandah.textPrimary,
  },
  subtitle: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 12.5,
    color: Verandah.textSecondary,
    marginTop: 2,
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingBottom: 90,
    gap: 6,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
    backgroundColor: Verandah.card,
    borderRadius: VerandahRadius.card,
    padding: 10,
  },
  rowCopy: {
    flex: 1,
  },
  rowName: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 13.5,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  rowMeta: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 11.5,
    color: Verandah.textSecondary,
    marginTop: 1,
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Verandah.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: VerandahRadius.pill,
    ...Verandah.shadowRaised,
  },
  fabText: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 13.5,
    fontWeight: '700',
    color: Verandah.primaryFg,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Verandah.paper,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 20,
    color: Verandah.textPrimary,
    marginBottom: 12,
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
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: VerandahType.sansFamily,
    color: Verandah.textPrimary,
  },
  pickerList: {
    maxHeight: 320,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Verandah.borderHair,
  },
  emptyPickerText: {
    textAlign: 'center',
    fontSize: 13,
    color: Verandah.textSecondary,
    fontFamily: VerandahType.sansFamily,
    paddingVertical: 20,
  },
  modalCloseBtn: {
    marginTop: 12,
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
    borderRadius: VerandahRadius.button,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCloseText: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 14,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
});
