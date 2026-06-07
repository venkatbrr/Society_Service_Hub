import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahType } from '../constants/Verandah';
import { Tables } from '../lib/database.types';
import { supabase } from '../lib/supabase';

type BlockPickerProps = {
  value: string | null;
  onChange: (blockId: string | null) => void;
  communityId: string;
  label?: string;
  hideAllResidents?: boolean;
};

export function BlockPicker({ value, onChange, communityId, label = 'Block', hideAllResidents = false }: BlockPickerProps) {
  const [blocks, setBlocks] = useState<Tables<'community_blocks'>[]>([]);
  const [loading, setLoading] = useState(true);
  const labelLower = label.toLowerCase();

  useEffect(() => {
    let cancelled = false;

    const loadBlocks = async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('list_community_blocks', { p_community_id: communityId });

      if (!cancelled) {
        if (error) {
          setBlocks([]);
        } else {
          setBlocks((data ?? []) as Tables<'community_blocks'>[]);
        }
        setLoading(false);
      }
    };

    if (communityId) {
      loadBlocks();
    }

    return () => {
      cancelled = true;
    };
  }, [communityId]);

  const selectedBlockName = useMemo(() => {
    if (!value) return hideAllResidents ? `Select ${labelLower}` : 'All residents';
    return blocks.find((block) => block.id === value)?.name ?? `Select ${labelLower}`;
  }, [blocks, value, labelLower, hideAllResidents]);

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator color={Verandah.accent} />
      </View>
    );
  }

  if (!blocks.length) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>Your community lead has not set up {labelLower}s yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.listWrap}>
      <Text style={styles.selectedLabel}>Selected: {selectedBlockName}</Text>
      {!hideAllResidents && (
        <TouchableOpacity
          onPress={() => onChange(null)}
          style={[styles.option, !value ? styles.optionSelected : styles.optionDefault]}
        >
          <Text style={[styles.optionText, !value ? styles.optionTextSelected : styles.optionTextDefault]}>All residents</Text>
        </TouchableOpacity>
      )}
      {blocks.map((block) => {
        const selected = block.id === value;
        return (
          <TouchableOpacity
            key={block.id}
            onPress={() => onChange(block.id)}
            style={[styles.option, selected ? styles.optionSelected : styles.optionDefault]}
          >
            <Text style={[styles.optionText, selected ? styles.optionTextSelected : styles.optionTextDefault]}>{block.name}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  loaderWrap: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyWrap: {
    borderWidth: 0.5,
    borderColor: Verandah.border,
    backgroundColor: Verandah.cardMuted,
    borderRadius: VerandahRadius.lg,
    padding: 14,
  },
  emptyText: {
    ...VerandahType.caption,
    color: Verandah.textSecondary,
  },
  listWrap: {
    gap: 10,
  },
  selectedLabel: {
    ...VerandahType.caption,
    color: Verandah.textTertiary,
  },
  option: {
    borderWidth: 0.5,
    borderRadius: VerandahRadius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  optionDefault: {
    borderColor: Verandah.borderStrong,
    backgroundColor: Verandah.card,
  },
  optionSelected: {
    borderColor: Verandah.accent,
    backgroundColor: Verandah.accentSoft,
  },
  optionText: {
    ...VerandahType.bodyBold,
  },
  optionTextDefault: {
    color: Verandah.textPrimary,
  },
  optionTextSelected: {
    color: Verandah.accent,
  },
});
