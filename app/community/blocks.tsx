import { InfoCircle } from '@untitledui/icons/InfoCircle';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Verandah } from '../../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { Tables } from '../../lib/database.types';
import { goBackSmart } from '../../lib/navigation';
import { supabase } from '../../lib/supabase';

type BlockWithCounts = Tables<'community_blocks'> & {
  residentCount: number;
  inChargeCount: number;
};

/**
 * Block inventory is structural: residents' flats, fund collection scopes and
 * collector caps all hang off it. Creating, archiving and switching blocks on
 * or off is therefore a platform-admin action (admin console -> community ->
 * blocks), not something a president can do mid-year. This screen shows the
 * president what exists and lets them correct a name; everything else is a
 * support request.
 */
export default function CommunityBlocksScreen() {
  const router = useRouter();
  const { communityId, blocksEnabled, blockLabel } = useAuth();
  const labelLower = blockLabel.toLowerCase();

  const [blocks, setBlocks] = useState<BlockWithCounts[]>([]);
  const [blocksLoaded, setBlocksLoaded] = useState(false);
  const [renameBlockId, setRenameBlockId] = useState<string | null>(null);
  const [renameBlockName, setRenameBlockName] = useState('');
  const [renaming, setRenaming] = useState(false);

  const load = useCallback(async () => {
    if (!communityId) return;

    const [{ data: blockRows, error: blockError }, { data: profiles }, { data: collectorRows }] = await Promise.all([
      supabase.rpc('list_community_blocks', { p_community_id: communityId }),
      supabase.from('profiles').select('id, block_id').eq('community_id', communityId).is('removed_at', null),
      supabase
        .from('fund_roles')
        .select('id, block_id, events!inner(community_id)')
        .eq('role', 'collector')
        .eq('events.community_id', communityId),
    ]);

    if (blockError) {
      Toast.show({ type: 'error', text1: 'Unable to load blocks', text2: blockError.message });
      setBlocksLoaded(true);
      return;
    }

    const residentsByBlock = new Map<string, number>();
    (profiles ?? []).forEach((profile: any) => {
      if (!profile.block_id) return;
      residentsByBlock.set(profile.block_id, (residentsByBlock.get(profile.block_id) ?? 0) + 1);
    });

    const inChargesByBlock = new Map<string, number>();
    (collectorRows ?? []).forEach((row: any) => {
      if (!row.block_id) return;
      inChargesByBlock.set(row.block_id, (inChargesByBlock.get(row.block_id) ?? 0) + 1);
    });

    setBlocks(
      ((blockRows ?? []) as Tables<'community_blocks'>[]).map((block) => ({
        ...block,
        residentCount: residentsByBlock.get(block.id) ?? 0,
        inChargeCount: inChargesByBlock.get(block.id) ?? 0,
      }))
    );
    setBlocksLoaded(true);
  }, [communityId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const submitRename = async () => {
    if (!renameBlockName.trim() || !renameBlockId) return;

    setRenaming(true);
    const { error } = await supabase.rpc('rename_community_block', {
      p_block_id: renameBlockId,
      p_new_name: renameBlockName.trim(),
    });
    setRenaming(false);
    setRenameBlockId(null);
    setRenameBlockName('');

    if (error) {
      Toast.show({ type: 'error', text1: 'Unable to rename', text2: error.message });
    } else {
      Toast.show({ type: 'success', text1: `${blockLabel} renamed` });
      await load();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBackSmart(router, '/community/blocks')}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{blockLabel}s</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.noticeCard}>
          <InfoCircle size={16} color={Verandah.accent} aria-hidden={true} />
          <Text style={styles.noticeText}>
            {blockLabel}s are set up by the Wooru team so resident flats, fund scopes and in-charge limits stay
            consistent. To add a {labelLower}, remove one, or turn {labelLower}s off, contact support. You can
            correct a name here.
          </Text>
        </View>

        {!blocksLoaded ? (
          <ActivityIndicator color={Verandah.accent} style={{ marginTop: 12 }} />
        ) : blocks.length === 0 ? (
          <Text style={styles.emptyText}>
            {blocksEnabled
              ? `No ${labelLower}s have been set up for your community yet. Contact support to add them.`
              : `${blockLabel}s are turned off for your community. Contact support if you want ${labelLower}-wise fund collection.`}
          </Text>
        ) : (
          blocks.map((block) => (
            <View key={block.id} style={styles.blockCard}>
              <View style={styles.blockRow}>
                <View style={styles.blockInfo}>
                  <Text style={styles.blockName}>{block.name}</Text>
                  <Text style={styles.blockMeta}>
                    {block.residentCount} residents · {block.inChargeCount} in-charges
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => {
                    setRenameBlockId(block.id);
                    setRenameBlockName(block.name);
                  }}
                >
                  <Text style={styles.actionText}>Rename</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={!!renameBlockId} transparent animationType="slide" onRequestClose={() => setRenameBlockId(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rename {blockLabel}</Text>
            <TextInput
              style={styles.modalInput}
              value={renameBlockName}
              onChangeText={setRenameBlockName}
              placeholder={`Enter new ${labelLower} name`}
              placeholderTextColor={Verandah.textTertiary}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalSecondaryBtn}
                onPress={() => { setRenameBlockId(null); setRenameBlockName(''); }}
              >
                <Text style={styles.modalSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalPrimaryBtn} onPress={submitRename} disabled={renaming}>
                {renaming
                  ? <ActivityIndicator color={Verandah.primaryFg} />
                  : <Text style={styles.modalPrimaryText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Verandah.surface, paddingTop: VerandahLayout.screenPaddingTop, paddingHorizontal: 20 },
  header: { marginBottom: 12 },
  backText: { ...VerandahType.captionBold, color: Verandah.accent },
  title: { ...VerandahType.display, color: Verandah.textPrimary, marginTop: 6 },
  content: { paddingBottom: 24, gap: 12 },
  noticeCard: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    borderWidth: 0.5,
    borderColor: Verandah.border,
    backgroundColor: Verandah.accentSoft,
    borderRadius: VerandahRadius.lg,
    padding: 14,
  },
  noticeText: { flex: 1, ...VerandahType.caption, color: Verandah.textPrimary, lineHeight: 17 },
  blockCard: {
    borderWidth: 0.5,
    borderColor: Verandah.border,
    backgroundColor: Verandah.card,
    borderRadius: VerandahRadius.lg,
    padding: 14,
    ...Verandah.shadowCard,
  },
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  blockInfo: { flex: 1 },
  blockName: { ...VerandahType.bodyBold, color: Verandah.textPrimary },
  blockMeta: { marginTop: 4, ...VerandahType.caption, color: Verandah.textSecondary },
  actionBtn: { borderWidth: 0.5, borderColor: Verandah.borderStrong, borderRadius: VerandahRadius.sm + 2, paddingHorizontal: 12, paddingVertical: 8 },
  actionText: { ...VerandahType.captionBold, color: Verandah.textPrimary },
  emptyText: { marginTop: 6, ...VerandahType.body, color: Verandah.textSecondary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12, backgroundColor: Verandah.card },
  modalTitle: { ...VerandahType.bodyBold, color: Verandah.textPrimary, fontSize: 18 },
  modalInput: { borderWidth: 0.5, borderColor: Verandah.borderStrong, borderRadius: VerandahRadius.md, paddingHorizontal: 12, height: 44, color: Verandah.textPrimary, backgroundColor: Verandah.surface, ...VerandahType.body, marginTop: 6 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalSecondaryBtn: { flex: 1, borderWidth: 1, borderColor: Verandah.border, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  modalSecondaryText: { ...VerandahType.bodyBold, color: Verandah.textPrimary },
  modalPrimaryBtn: { flex: 1, borderRadius: 16, backgroundColor: Verandah.primary, paddingVertical: 14, alignItems: 'center' },
  modalPrimaryText: { ...VerandahType.bodyBold, color: Verandah.primaryFg },
});
