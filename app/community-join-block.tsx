import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahType } from '../constants/Verandah';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function CommunityJoinBlockScreen() {
  const router = useRouter();
  const { communityId, blockLabel: routeBlockLabel } = useLocalSearchParams<{ communityId: string; blockLabel?: string }>();
  const label = routeBlockLabel ?? 'Block';
  const labelLower = label.toLowerCase();
  
  const { profile, refreshSession } = useAuth();
  
  const [flatNumber, setFlatNumber] = useState(profile?.flat_number || '');
  const [blockId, setBlockId] = useState<string | null>(profile?.block_id || null);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile?.flat_number) setFlatNumber(profile.flat_number);
    if (profile?.block_id) setBlockId(profile.block_id);
  }, [profile]);

  useEffect(() => {
    let cancelled = false;

    const fetchBlocks = async () => {
      if (!communityId) return;
      setLoading(true);
      const { data, error } = await supabase.rpc('list_community_blocks', { p_community_id: communityId });
      if (!cancelled) {
        if (!error && data) {
          setBlocks(data);
        }
        setLoading(false);
      }
    };

    fetchBlocks();

    return () => {
      cancelled = true;
    };
  }, [communityId]);

  const handleContinue = async () => {
    const normalizedFlat = flatNumber.toUpperCase().replace(/[\s-]/g, '').trim();
    
    if (!normalizedFlat) {
      Toast.show({ type: 'error', text1: 'Flat number is required' });
      return;
    }

    if (!blockId && blocks.length > 0) {
      Toast.show({ type: 'error', text1: `Please select a ${labelLower}` });
      return;
    }

    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('profiles')
        .update({
          flat_number: normalizedFlat,
          block_id: blockId,
        })
        .eq('id', user.id);

      if (error) throw error;

      await refreshSession();
      router.replace('/(tabs)');
    } catch (error: any) {
      Toast.show({ type: 'error', text1: `Unable to save ${labelLower}`, text2: error.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pick your {labelLower}</Text>
      <Text style={styles.subtitle}>This helps your community manage {labelLower}-wise operations.</Text>

      {/* Flat Number Entry */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Flat Number</Text>
        <TextInput
          style={styles.textInput}
          value={flatNumber}
          onChangeText={setFlatNumber}
          placeholder="e.g. A412"
          placeholderTextColor={Verandah.textTertiary}
          autoCapitalize="characters"
          autoCorrect={false}
          onBlur={() => setFlatNumber(prev => prev.toUpperCase().replace(/[\s-]/g, ''))}
        />
      </View>

      {/* Dropdown Selector */}
      {communityId && blocks.length > 0 ? (
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Select {label}</Text>
          <TouchableOpacity
            style={styles.dropdownHeader}
            onPress={() => setDropdownOpen(!dropdownOpen)}
            activeOpacity={0.8}
          >
            <Text style={[styles.dropdownHeaderText, !blockId && { color: Verandah.textTertiary }]}>
              {blockId ? blocks.find(b => b.id === blockId)?.name : `Select ${labelLower}`}
            </Text>
            <Text style={styles.dropdownArrow}>{dropdownOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {dropdownOpen ? (
            <View style={styles.dropdownListContainer}>
              <ScrollView style={styles.dropdownScrollView} nestedScrollEnabled={true}>
                {blocks.map((block) => (
                  <TouchableOpacity
                    key={block.id}
                    style={[styles.dropdownOption, blockId === block.id && styles.dropdownOptionSelected]}
                    onPress={() => {
                      setBlockId(block.id);
                      setDropdownOpen(false);
                    }}
                  >
                    <Text style={[styles.dropdownOptionText, blockId === block.id && styles.dropdownOptionTextSelected]}>
                      {block.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      ) : null}

      <TouchableOpacity style={styles.primaryBtn} onPress={handleContinue} disabled={saving}>
        <Text style={styles.primaryBtnText}>{saving ? 'Saving...' : 'Continue'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Verandah.surface,
    paddingTop: Platform.select({ web: 24, default: 80 }),
    paddingHorizontal: 24,
  },
  title: {
    ...VerandahType.display,
    color: Verandah.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    ...VerandahType.body,
    color: Verandah.textSecondary,
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 20,
    zIndex: 10,
  },
  label: {
    ...VerandahType.captionBold,
    color: Verandah.textSecondary,
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: Verandah.borderStrong,
    backgroundColor: Verandah.card,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 16,
    height: 48,
    color: Verandah.textPrimary,
    ...VerandahType.body,
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Verandah.borderStrong,
    backgroundColor: Verandah.card,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 16,
    height: 48,
  },
  dropdownHeaderText: {
    color: Verandah.textPrimary,
    ...VerandahType.body,
  },
  dropdownArrow: {
    color: Verandah.textSecondary,
    fontSize: 12,
  },
  dropdownListContainer: {
    position: 'absolute',
    top: 76,
    left: 0,
    right: 0,
    backgroundColor: Verandah.card,
    borderWidth: 1,
    borderColor: Verandah.borderStrong,
    borderRadius: VerandahRadius.md,
    zIndex: 1000,
    maxHeight: 200,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  dropdownScrollView: {
    paddingVertical: 4,
  },
  dropdownOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  dropdownOptionSelected: {
    backgroundColor: Verandah.accentSoft,
  },
  dropdownOptionText: {
    color: Verandah.textPrimary,
    ...VerandahType.body,
  },
  dropdownOptionTextSelected: {
    color: Verandah.accent,
    ...VerandahType.bodyBold,
  },
  primaryBtn: {
    marginTop: 12,
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
    marginTop: 16,
    textAlign: 'center',
    ...VerandahType.caption,
    color: Verandah.textSecondary,
  },
});
