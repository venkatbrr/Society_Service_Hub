import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/Colors';
import { Tables } from '../lib/database.types';
import { supabase } from '../lib/supabase';

type BlockPickerProps = {
  value: string | null;
  onChange: (blockId: string | null) => void;
  communityId: string;
};

export function BlockPicker({ value, onChange, communityId }: BlockPickerProps) {
  const colors = Colors.light;
  const [blocks, setBlocks] = useState<Tables<'community_blocks'>[]>([]);
  const [loading, setLoading] = useState(true);

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
    if (!value) return 'All residents';
    return blocks.find((block) => block.id === value)?.name ?? 'Select block';
  }, [blocks, value]);

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!blocks.length) {
    return (
      <View style={[styles.emptyWrap, { borderColor: colors.border, backgroundColor: colors.surface2 }]}>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>Your community lead hasn't set up blocks yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.listWrap}>
      <Text style={[styles.selectedLabel, { color: colors.textMuted }]}>Selected: {selectedBlockName}</Text>
      <TouchableOpacity
        onPress={() => onChange(null)}
        style={[styles.option, { borderColor: colors.border, backgroundColor: !value ? colors.primary + '14' : colors.surface2 }]}
      >
        <Text style={[styles.optionText, { color: !value ? colors.primary : colors.text }]}>All residents</Text>
      </TouchableOpacity>
      {blocks.map((block) => {
        const selected = block.id === value;
        return (
          <TouchableOpacity
            key={block.id}
            onPress={() => onChange(block.id)}
            style={[styles.option, { borderColor: colors.border, backgroundColor: selected ? colors.primary + '14' : colors.surface2 }]}
          >
            <Text style={[styles.optionText, { color: selected ? colors.primary : colors.text }]}>{block.name}</Text>
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
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 18,
  },
  listWrap: {
    gap: 10,
  },
  selectedLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  option: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  optionText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
