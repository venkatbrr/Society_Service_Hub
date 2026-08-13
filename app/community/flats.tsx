import { Check } from '@untitledui/icons/Check';
import { Plus } from '@untitledui/icons/Plus';
import { Trash01 } from '@untitledui/icons/Trash01';
import { XClose } from '@untitledui/icons/XClose';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { HeaderBackButton } from '../../components/HeaderBackButton';
import { Verandah } from '../../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { goBackSmart } from '../../lib/navigation';
import { supabase } from '../../lib/supabase';

type FlatRow = {
  id: string;
  block_id: string | null;
  block_name: string | null;
  flat_number: string;
  floor_label: string | null;
  resident_count: number;
};

type BlockRow = {
  id: string;
  name: string;
};

type PendingRequest = {
  id: string;
  community_id: string;
  block_id: string;
  block_name: string;
  requested_by: string;
  requester_name: string;
  requester_email: string;
  requester_phone: string;
  flat_number: string;
  created_at: string;
};

export default function CommunityFlatsScreen() {
  const router = useRouter();
  const { communityId, blockLabel } = useAuth();
  const labelLower = blockLabel.toLowerCase();

  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [flats, setFlats] = useState<FlatRow[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Bulk add modal state
  const [showBulkAddModal, setShowBulkAddModal] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [savingFlats, setSavingFlats] = useState(false);

  // Rejection modal state
  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const loadData = useCallback(async () => {
    if (!communityId) return;
    setLoading(true);

    try {
      const [
        { data: blockRows, error: blockErr },
        { data: flatRows, error: flatErr },
        { data: pendingRows, error: pendingErr },
      ] = await Promise.all([
        supabase.rpc('list_community_blocks', { p_community_id: communityId }),
        supabase.rpc('list_community_flats', { p_community_id: communityId }),
        supabase.rpc('list_pending_flat_addition_requests', { p_community_id: communityId }),
      ]);

      if (blockErr) throw blockErr;
      if (flatErr) throw flatErr;

      const loadedBlocks = (blockRows ?? []) as BlockRow[];
      const loadedFlats = (flatRows ?? []) as FlatRow[];

      setBlocks(loadedBlocks);
      setFlats(loadedFlats);
      setPendingRequests((pendingRows ?? []) as PendingRequest[]);

      if (loadedBlocks.length > 0 && !selectedBlockId) {
        setSelectedBlockId(loadedBlocks[0].id);
      }
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Error loading flat data', text2: err.message });
    } finally {
      setLoading(false);
    }
  }, [communityId, selectedBlockId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const selectedBlockFlats = flats.filter((f) => f.block_id === selectedBlockId);

  const handleBulkAdd = async () => {
    if (!selectedBlockId) {
      Toast.show({ type: 'error', text1: `Please select a ${labelLower}` });
      return;
    }

    const rawList = bulkInput
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (rawList.length === 0) {
      Toast.show({ type: 'error', text1: 'Enter at least one flat number' });
      return;
    }

    setSavingFlats(true);
    try {
      const { data, error } = await supabase.rpc('add_community_flats', {
        p_block_id: selectedBlockId,
        p_flat_numbers: rawList,
      });

      if (error) throw error;

      Toast.show({
        type: 'success',
        text1: 'Flats added',
        text2: `Added ${data || rawList.length} flat(s) successfully.`,
      });

      setBulkInput('');
      setShowBulkAddModal(false);
      await loadData();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Failed to add flats', text2: err.message });
    } finally {
      setSavingFlats(false);
    }
  };

  const handleArchiveFlat = (flat: FlatRow) => {
    const perform = async () => {
      try {
        const { error } = await supabase.rpc('archive_community_flat', {
          p_flat_id: flat.id,
        });

        if (error) throw error;

        Toast.show({ type: 'success', text1: `Flat ${flat.flat_number} archived` });
        await loadData();
      } catch (err: any) {
        Toast.show({ type: 'error', text1: 'Unable to archive flat', text2: err.message });
      }
    };

    const confirmMsg = `Archive flat ${flat.flat_number}? Residents assigned to this flat will be disconnected.`;

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(confirmMsg)) {
        perform();
      }
    } else {
      Alert.alert('Archive Flat?', confirmMsg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive', style: 'destructive', onPress: perform },
      ]);
    }
  };

  const handleReviewRequest = async (requestId: string, approve: boolean, reason?: string) => {
    try {
      const { error } = await supabase.rpc('review_flat_addition', {
        p_request_id: requestId,
        p_approve: approve,
        p_reason: reason || null,
      });

      if (error) throw error;

      Toast.show({
        type: 'success',
        text1: approve ? 'Flat addition approved' : 'Flat request rejected',
      });

      setRejectingRequestId(null);
      setRejectionReason('');
      await loadData();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Action failed', text2: err.message });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <HeaderBackButton onPress={() => goBackSmart(router, '/community/flats')} />
        <Text style={styles.title}>Manage Flats</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Pending Requests Banner */}
        {pendingRequests.length > 0 && (
          <View style={styles.pendingSection}>
            <Text style={styles.pendingSectionTitle}>
              Pending Flat Requests ({pendingRequests.length})
            </Text>
            {pendingRequests.map((req) => (
              <View key={req.id} style={styles.requestCard}>
                <View style={styles.requestInfo}>
                  <Text style={styles.requestFlat}>
                    {blockLabel} {req.block_name} — Flat {req.flat_number}
                  </Text>
                  <Text style={styles.requestMeta}>
                    Requested by {req.requester_name || req.requester_email || 'Resident'}
                  </Text>
                </View>
                <View style={styles.requestActions}>
                  <TouchableOpacity
                    style={styles.approveBtn}
                    onPress={() => handleReviewRequest(req.id, true)}
                    activeOpacity={0.85}
                  >
                    <Check size={16} color={Verandah.primaryFg} aria-hidden={true} />
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.rejectBtn}
                    onPress={() => {
                      setRejectingRequestId(req.id);
                      setRejectionReason('');
                    }}
                    activeOpacity={0.85}
                  >
                    <XClose size={16} color={Verandah.danger} aria-hidden={true} />
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Block Selector */}
        {loading && blocks.length === 0 ? (
          <View style={styles.loader}>
            <ActivityIndicator color={Verandah.accent} />
          </View>
        ) : blocks.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No {labelLower}s set up yet</Text>
            <Text style={styles.emptySubtitle}>
              Please set up {labelLower}s in Community Settings before adding flats.
            </Text>
            <TouchableOpacity
              style={styles.setupBtn}
              onPress={() => router.push('/community/blocks' as any)}
            >
              <Text style={styles.setupBtnText}>Manage {blockLabel}s</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.blockRowWrap}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.blockRow}>
                {blocks.map((b) => {
                  const isSelected = selectedBlockId === b.id;
                  const count = flats.filter((f) => f.block_id === b.id).length;
                  return (
                    <TouchableOpacity
                      key={b.id}
                      style={[styles.blockChip, isSelected ? styles.blockChipSelected : styles.blockChipDefault]}
                      onPress={() => setSelectedBlockId(b.id)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.blockChipText,
                          isSelected ? styles.blockChipTextSelected : styles.blockChipTextDefault,
                        ]}
                      >
                        {blockLabel} {b.name} ({count})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <TouchableOpacity
                style={styles.addFlatsBtn}
                onPress={() => setShowBulkAddModal(true)}
                activeOpacity={0.85}
              >
                <Plus size={16} color={Verandah.primaryFg} aria-hidden={true} />
                <Text style={styles.addFlatsBtnText}>Add Flats</Text>
              </TouchableOpacity>
            </View>

            {/* Flat List */}
            <View style={styles.flatsCard}>
              <View style={styles.flatsCardHeader}>
                <Text style={styles.flatsCardTitle}>
                  {blocks.find((b) => b.id === selectedBlockId)?.name
                    ? `${blockLabel} ${blocks.find((b) => b.id === selectedBlockId)?.name} Flats (${selectedBlockFlats.length})`
                    : `Flats (${selectedBlockFlats.length})`}
                </Text>
              </View>

              {loading ? (
                <View style={styles.loader}>
                  <ActivityIndicator color={Verandah.accent} />
                </View>
              ) : selectedBlockFlats.length === 0 ? (
                <View style={styles.emptyBlockFlats}>
                  <Text style={styles.emptyBlockText}>No flats added for this {labelLower} yet.</Text>
                  <TouchableOpacity
                    style={styles.quickAddBtn}
                    onPress={() => setShowBulkAddModal(true)}
                  >
                    <Text style={styles.quickAddBtnText}>+ Add flats now</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.flatGrid}>
                  {selectedBlockFlats.map((flat) => (
                    <View key={flat.id} style={styles.flatPill}>
                      <View style={styles.flatPillInfo}>
                        <Text style={styles.flatPillNumber}>{flat.flat_number}</Text>
                        {flat.resident_count > 0 && (
                          <Text style={styles.flatPillResidents}>
                            {flat.resident_count} {flat.resident_count === 1 ? 'resident' : 'residents'}
                          </Text>
                        )}
                      </View>
                      <TouchableOpacity
                        style={styles.flatArchiveBtn}
                        onPress={() => handleArchiveFlat(flat)}
                        hitSlop={8}
                      >
                        <Trash01 size={14} color={Verandah.danger} aria-hidden={true} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Bulk Add Flats Modal */}
      <Modal
        visible={showBulkAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBulkAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Add Flats to {blockLabel} {blocks.find((b) => b.id === selectedBlockId)?.name || ''}
              </Text>
              <TouchableOpacity onPress={() => setShowBulkAddModal(false)} hitSlop={10}>
                <XClose size={20} color={Verandah.textSecondary} aria-hidden={true} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalHelp}>
              Enter flat numbers separated by commas or new lines (e.g. 101, 102, 103, 201, 202).
            </Text>

            <TextInput
              style={styles.bulkInput}
              value={bulkInput}
              onChangeText={setBulkInput}
              placeholder="101, 102, 103..."
              placeholderTextColor={Verandah.textTertiary}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              autoCapitalize="characters"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowBulkAddModal(false)}
                disabled={savingFlats}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleBulkAdd}
                disabled={savingFlats}
              >
                {savingFlats ? (
                  <ActivityIndicator color={Verandah.primaryFg} size="small" />
                ) : (
                  <Text style={styles.modalSaveText}>Add Flats</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Rejection Modal */}
      <Modal
        visible={!!rejectingRequestId}
        transparent
        animationType="slide"
        onRequestClose={() => setRejectingRequestId(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reject Flat Addition</Text>
              <TouchableOpacity onPress={() => setRejectingRequestId(null)} hitSlop={10}>
                <XClose size={20} color={Verandah.textSecondary} aria-hidden={true} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalHelp}>
              Provide an optional reason for the resident (e.g. "Flat does not exist in this block").
            </Text>

            <TextInput
              style={[styles.bulkInput, { height: 90 }]}
              value={rejectionReason}
              onChangeText={setRejectionReason}
              placeholder="Reason for rejection..."
              placeholderTextColor={Verandah.textTertiary}
              multiline
              maxLength={280}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setRejectingRequestId(null)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: Verandah.danger }]}
                onPress={() => {
                  if (rejectingRequestId) {
                    handleReviewRequest(rejectingRequestId, false, rejectionReason);
                  }
                }}
              >
                <Text style={styles.modalSaveText}>Confirm Rejection</Text>
              </TouchableOpacity>
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
    paddingTop: Platform.select({ web: 16, default: VerandahLayout.screenPaddingTop }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: VerandahSpace.lg,
    paddingBottom: 12,
  },
  title: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 22,
    fontWeight: '500',
    color: Verandah.textPrimary,
  },
  content: {
    paddingHorizontal: VerandahSpace.lg,
    paddingBottom: 40,
    gap: VerandahSpace.md,
  },
  pendingSection: {
    gap: 8,
  },
  pendingSectionTitle: {
    ...VerandahType.captionBold,
    color: Verandah.caution,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  requestCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Verandah.cautionSoft,
    borderColor: Verandah.caution + '50',
    borderWidth: 1,
    borderRadius: VerandahRadius.md,
    padding: 12,
    gap: 8,
  },
  requestInfo: {
    flex: 1,
    gap: 2,
  },
  requestFlat: {
    ...VerandahType.bodyBold,
    color: Verandah.textPrimary,
  },
  requestMeta: {
    ...VerandahType.caption,
    color: Verandah.textSecondary,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 6,
  },
  approveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Verandah.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: VerandahRadius.sm,
  },
  approveBtnText: {
    ...VerandahType.captionBold,
    color: Verandah.primaryFg,
  },
  rejectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: Verandah.dangerSoft,
    backgroundColor: Verandah.card,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: VerandahRadius.sm,
  },
  rejectBtnText: {
    ...VerandahType.captionBold,
    color: Verandah.danger,
  },
  blockRowWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  blockRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  blockChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: VerandahRadius.pill,
    borderWidth: 1,
  },
  blockChipDefault: {
    borderColor: Verandah.borderStrong,
    backgroundColor: Verandah.card,
  },
  blockChipSelected: {
    borderColor: Verandah.primary,
    backgroundColor: Verandah.primary,
  },
  blockChipText: {
    ...VerandahType.captionBold,
  },
  blockChipTextDefault: {
    color: Verandah.textPrimary,
  },
  blockChipTextSelected: {
    color: Verandah.primaryFg,
  },
  addFlatsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Verandah.primary,
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addFlatsBtnText: {
    ...VerandahType.captionBold,
    color: Verandah.primaryFg,
  },
  flatsCard: {
    backgroundColor: Verandah.card,
    borderWidth: 1,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.lg,
    padding: 16,
    gap: 12,
    ...Verandah.shadowCard,
  },
  flatsCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  flatsCardTitle: {
    ...VerandahType.bodyBold,
    color: Verandah.textPrimary,
  },
  loader: {
    paddingVertical: 24,
  },
  emptyBlockFlats: {
    paddingVertical: 20,
    alignItems: 'center',
    gap: 8,
  },
  emptyBlockText: {
    ...VerandahType.caption,
    color: Verandah.textSecondary,
  },
  quickAddBtn: {
    paddingVertical: 4,
  },
  quickAddBtnText: {
    ...VerandahType.captionBold,
    color: Verandah.accent,
  },
  flatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  flatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Verandah.borderStrong,
    backgroundColor: Verandah.paper,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  flatPillInfo: {
    gap: 1,
  },
  flatPillNumber: {
    ...VerandahType.bodyBold,
    color: Verandah.textPrimary,
  },
  flatPillResidents: {
    ...VerandahType.caption,
    color: Verandah.textTertiary,
    fontSize: 10,
  },
  flatArchiveBtn: {
    padding: 2,
  },
  emptyCard: {
    padding: 20,
    backgroundColor: Verandah.card,
    borderWidth: 1,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.lg,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    ...VerandahType.bodyBold,
    color: Verandah.textPrimary,
  },
  emptySubtitle: {
    ...VerandahType.caption,
    color: Verandah.textSecondary,
    textAlign: 'center',
  },
  setupBtn: {
    marginTop: 8,
    backgroundColor: Verandah.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: VerandahRadius.md,
  },
  setupBtnText: {
    ...VerandahType.captionBold,
    color: Verandah.primaryFg,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 55, 50, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Verandah.card,
    borderTopLeftRadius: VerandahRadius.xl,
    borderTopRightRadius: VerandahRadius.xl,
    padding: VerandahSpace.lg,
    paddingBottom: Platform.OS === 'ios' ? 36 : VerandahSpace.lg,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    ...VerandahType.title,
    color: Verandah.textPrimary,
  },
  modalHelp: {
    ...VerandahType.caption,
    color: Verandah.textSecondary,
  },
  bulkInput: {
    borderWidth: 1,
    borderColor: Verandah.borderStrong,
    borderRadius: VerandahRadius.md,
    backgroundColor: Verandah.paper,
    paddingHorizontal: 14,
    paddingVertical: 10,
    height: 120,
    color: Verandah.textPrimary,
    ...VerandahType.body,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Verandah.borderStrong,
    borderRadius: VerandahRadius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Verandah.card,
  },
  modalCancelText: {
    ...VerandahType.captionBold,
    color: Verandah.textPrimary,
  },
  modalSaveBtn: {
    flex: 2,
    borderRadius: VerandahRadius.md,
    backgroundColor: Verandah.primary,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveText: {
    ...VerandahType.captionBold,
    color: Verandah.primaryFg,
  },
});
