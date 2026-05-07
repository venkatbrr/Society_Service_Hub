import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { BlockPicker } from '../components/BlockPicker';
import { Colors } from '../constants/Colors';
import { supabase } from '../lib/supabase';

export default function CommunityJoinBlockScreen() {
  const router = useRouter();
  const { communityId } = useLocalSearchParams<{ communityId: string }>();
  const colors = Colors.light;
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Pick your block</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>This helps your community collect block-wise fund contributions.</Text>

      {communityId ? <BlockPicker value={blockId} onChange={setBlockId} communityId={communityId} /> : null}

      <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={handleContinue} disabled={saving}>
        <Text style={styles.primaryBtnText}>{saving ? 'Saving...' : 'Continue'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.replace('/(tabs)')}>
        <Text style={[styles.skipText, { color: colors.textMuted }]}>Skip for now</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 80,
    paddingHorizontal: 24,
    gap: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  primaryBtn: {
    marginTop: 14,
    borderRadius: 16,
    alignItems: 'center',
    paddingVertical: 14,
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
  },
  skipText: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
  },
});
