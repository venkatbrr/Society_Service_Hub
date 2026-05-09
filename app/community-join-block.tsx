import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { BlockPicker } from '../components/BlockPicker';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahType } from '../constants/Verandah';
import { supabase } from '../lib/supabase';

export default function CommunityJoinBlockScreen() {
  const router = useRouter();
  const { communityId } = useLocalSearchParams<{ communityId: string }>();
  const [blockId, setBlockId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleContinue = async () => {
    try {
      setSaving(true);
      if (blockId) {
        const { error } = await supabase.rpc('set_my_block', { p_block_id: blockId });
        if (error) throw error;
      }
      router.replace('/(tabs)');
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to save block', text2: error.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pick your block</Text>
      <Text style={styles.subtitle}>This helps your community collect block-wise fund contributions.</Text>

      {communityId ? <BlockPicker value={blockId} onChange={setBlockId} communityId={communityId} /> : null}

      <TouchableOpacity style={styles.primaryBtn} onPress={handleContinue} disabled={saving}>
        <Text style={styles.primaryBtnText}>{saving ? 'Saving...' : 'Continue'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.replace('/(tabs)')}>
        <Text style={styles.skipText}>Skip for now</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Verandah.surface,
    paddingTop: 80,
    paddingHorizontal: 24,
    gap: 14,
  },
  title: {
    ...VerandahType.display,
    color: Verandah.textPrimary,
  },
  subtitle: {
    ...VerandahType.body,
    color: Verandah.textSecondary,
    marginBottom: 8,
  },
  primaryBtn: {
    marginTop: 14,
    borderRadius: VerandahRadius.lg,
    backgroundColor: Verandah.primary,
    alignItems: 'center',
    paddingVertical: 14,
  },
  primaryBtnText: {
    color: Verandah.primaryFg,
    ...VerandahType.bodyBold,
  },
  skipText: {
    marginTop: 8,
    textAlign: 'center',
    ...VerandahType.caption,
    color: Verandah.textSecondary,
  },
});
