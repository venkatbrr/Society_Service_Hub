import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Verandah } from '../../constants/Colors';
import { VerandahRadius, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { Tables } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';

type BlockWithCounts = Tables<'community_blocks'> & {
  residentCount: number;
  inChargeCount: number;
};

export default function CommunityBlocksScreen() {
  const router = useRouter();
  const { communityId, blocksEnabled, refreshSession } = useAuth();

  const [blocks, setBlocks] = useState<BlockWithCounts[]>([]);
  const [newBlockName, setNewBlockName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isBlocksEnabled, setIsBlocksEnabled] = useState(blocksEnabled);

  useEffect(() => {
    setIsBlocksEnabled(blocksEnabled);
  }, [blocksEnabled]);

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
  }, [communityId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggleBlocks = async (enabled: boolean) => {
    const perform = async () => {
      setLoading(true);
      try {
        const { error } = await supabase.rpc('set_community_blocks_enabled', { p_enabled: enabled });
        if (error) throw error;
        setIsBlocksEnabled(enabled);
        await refreshSession();
        Toast.show({ type: 'success', text1: enabled ? 'Blocks enabled' : 'Blocks disabled' });
        await load();
      } catch (error: any) {
        Toast.show({ type: 'error', text1: 'Unable to update', text2: error.message });
      } finally {
        setLoading(false);
      }
    };

    if (!enabled) {
      Alert.alert(
        'Turn off blocks?',
        'Turning blocks off will unscope all residents and block in-charges. Existing fund contributions are kept. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', style: 'destructive', onPress: perform },
        ]
      );
      return;
    }

    perform();
  };

  const addBlock = async () => {
    if (!newBlockName.trim()) return;

    setLoading(true);
    try {
      const { error } = await supabase.rpc('add_community_block', { p_name: newBlockName.trim() });
      if (error) throw error;
      setNewBlockName('');
      await load();
      Toast.show({ type: 'success', text1: 'Block added' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to add block', text2: error.message });
    } finally {
      setLoading(false);
    }
  };

  const renameBlock = async (block: BlockWithCounts) => {
    Alert.prompt('Rename block', 'Enter a new block name', async (value) => {
      if (!value?.trim()) return;
      const { error } = await supabase.rpc('rename_community_block', {
        p_block_id: block.id,
        p_new_name: value.trim(),
      });
      if (error) {
        Toast.show({ type: 'error', text1: 'Unable to rename', text2: error.message });
      } else {
        await load();
      }
    });
  };

  const archiveBlock = async (block: BlockWithCounts) => {
    Alert.alert('Archive block?', `Archive ${block.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('archive_community_block', { p_block_id: block.id });
          if (error) {
            Toast.show({ type: 'error', text1: 'Unable to archive', text2: error.message });
          } else {
            await load();
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}> 
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Manage blocks</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.toggleCard}> 
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Use blocks for fund collection</Text>
            <Switch value={isBlocksEnabled} onValueChange={toggleBlocks} disabled={loading} />
          </View>
        </View>

        {isBlocksEnabled ? (
          <>
            <View style={styles.addRow}>
              <TextInput
                value={newBlockName}
                onChangeText={setNewBlockName}
                placeholder="Add block"
                placeholderTextColor={Verandah.textTertiary}
                style={styles.input}
              />
              <TouchableOpacity style={styles.addBtn} onPress={addBlock}>
                <Text style={styles.addBtnText}>Add block</Text>
              </TouchableOpacity>
            </View>

            {blocks.map((block) => (
              <View key={block.id} style={styles.blockCard}> 
                <Text style={styles.blockName}>{block.name}</Text>
                <Text style={styles.blockMeta}>{block.residentCount} residents · {block.inChargeCount} in-charges</Text>
                <View style={styles.blockActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => renameBlock(block)}>
                    <Text style={styles.actionText}>Rename</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => archiveBlock(block)}>
                    <Text style={[styles.actionText, { color: Verandah.danger }]}>Archive</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        ) : (
          <Text style={styles.disabledText}>Turn on blocks to manage block-wise collection scopes.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Verandah.surface, paddingTop: 60, paddingHorizontal: 20 },
  header: { marginBottom: 12 },
  backText: { ...VerandahType.captionBold, color: Verandah.accent },
  title: { ...VerandahType.display, color: Verandah.textPrimary, marginTop: 6 },
  content: { paddingBottom: 24, gap: 12 },
  toggleCard: { borderWidth: 0.5, borderColor: Verandah.border, backgroundColor: Verandah.card, borderRadius: VerandahRadius.lg, padding: 14 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  toggleLabel: { flex: 1, ...VerandahType.bodyBold, color: Verandah.textPrimary },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, borderWidth: 0.5, borderColor: Verandah.borderStrong, backgroundColor: Verandah.card, color: Verandah.textPrimary, borderRadius: VerandahRadius.md, paddingHorizontal: 12, height: 44, ...VerandahType.body },
  addBtn: { borderRadius: VerandahRadius.md, backgroundColor: Verandah.primary, paddingHorizontal: 12, paddingVertical: 11 },
  addBtnText: { color: Verandah.primaryFg, ...VerandahType.captionBold },
  blockCard: { borderWidth: 0.5, borderColor: Verandah.border, backgroundColor: Verandah.card, borderRadius: VerandahRadius.lg, padding: 14 },
  blockName: { ...VerandahType.bodyBold, color: Verandah.textPrimary },
  blockMeta: { marginTop: 4, ...VerandahType.caption, color: Verandah.textSecondary },
  blockActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: { borderWidth: 0.5, borderColor: Verandah.borderStrong, borderRadius: VerandahRadius.sm + 2, paddingHorizontal: 12, paddingVertical: 8 },
  actionText: { ...VerandahType.captionBold, color: Verandah.textPrimary },
  disabledText: { marginTop: 6, ...VerandahType.body, color: Verandah.textSecondary },
});
