import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../context/AuthContext';
import { Tables } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';

type BlockWithCounts = Tables<'community_blocks'> & {
  residentCount: number;
  inChargeCount: number;
};

export default function CommunityBlocksScreen() {
  const router = useRouter();
  const colors = Colors.light;
  const { communityId, blocksEnabled } = useAuth();

  const [blocks, setBlocks] = useState<BlockWithCounts[]>([]);
  const [newBlockName, setNewBlockName] = useState('');
  const [loading, setLoading] = useState(false);

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
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.backText, { color: colors.primary }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Manage blocks</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.toggleCard, { borderColor: colors.border, backgroundColor: colors.glass }]}> 
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: colors.text }]}>Use blocks for fund collection</Text>
            <Switch value={blocksEnabled} onValueChange={toggleBlocks} disabled={loading} />
          </View>
        </View>

        {blocksEnabled ? (
          <>
            <View style={styles.addRow}>
              <TextInput
                value={newBlockName}
                onChangeText={setNewBlockName}
                placeholder="Add block"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface2 }]}
              />
              <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={addBlock}>
                <Text style={styles.addBtnText}>Add block</Text>
              </TouchableOpacity>
            </View>

            {blocks.map((block) => (
              <View key={block.id} style={[styles.blockCard, { borderColor: colors.border, backgroundColor: colors.glass }]}> 
                <Text style={[styles.blockName, { color: colors.text }]}>{block.name}</Text>
                <Text style={[styles.blockMeta, { color: colors.textMuted }]}>{block.residentCount} residents - {block.inChargeCount} in-charges</Text>
                <View style={styles.blockActions}>
                  <TouchableOpacity style={[styles.actionBtn, { borderColor: colors.border }]} onPress={() => renameBlock(block)}>
                    <Text style={[styles.actionText, { color: colors.text }]}>Rename</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, { borderColor: colors.border }]} onPress={() => archiveBlock(block)}>
                    <Text style={[styles.actionText, { color: colors.accent }]}>Archive</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        ) : (
          <Text style={[styles.disabledText, { color: colors.textMuted }]}>Turn on blocks to manage block-wise collection scopes.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, paddingHorizontal: 20 },
  header: { marginBottom: 12 },
  backText: { fontSize: 13, fontWeight: '700' },
  title: { fontSize: 26, fontWeight: '800', marginTop: 6 },
  content: { paddingBottom: 24, gap: 12 },
  toggleCard: { borderWidth: 1, borderRadius: 16, padding: 14 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  toggleLabel: { flex: 1, fontSize: 15, fontWeight: '700' },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 42, fontSize: 14 },
  addBtn: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11 },
  addBtnText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  blockCard: { borderWidth: 1, borderRadius: 16, padding: 14 },
  blockName: { fontSize: 16, fontWeight: '800' },
  blockMeta: { marginTop: 4, fontSize: 12 },
  blockActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  actionText: { fontSize: 12, fontWeight: '700' },
  disabledText: { marginTop: 6, fontSize: 13 },
});
