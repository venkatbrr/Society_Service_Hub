import { ChevronDown } from '@untitledui/icons/ChevronDown';
import { ChevronUp } from '@untitledui/icons/ChevronUp';
import { HelpCircle } from '@untitledui/icons/HelpCircle';
import { SearchLg } from '@untitledui/icons/SearchLg';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';
import { supabase } from '../lib/supabase';
import { FlatAdditionRequestModal } from './FlatAdditionRequestModal';

export type FlatOption = {
  id: string;
  block_id: string | null;
  block_name: string | null;
  flat_number: string;
  floor_label: string | null;
  resident_count: number;
};

type BlockOption = {
  id: string;
  name: string;
};

type FlatPickerProps = {
  communityId: string;
  value: string | null; // flat_id
  onChange: (flatId: string | null, flatDisplay?: string) => void;
  blockLabel?: string;
  disabled?: boolean;
  allowClear?: boolean;
  required?: boolean;
};

export function FlatPicker({
  communityId,
  value,
  onChange,
  blockLabel = 'Block',
  disabled = false,
  allowClear = false,
  required = true,
}: FlatPickerProps) {
  const [flats, setFlats] = useState<FlatOption[]>([]);
  const [blocks, setBlocks] = useState<BlockOption[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [flatSearch, setFlatSearch] = useState('');
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [blockDropdownOpen, setBlockDropdownOpen] = useState(false);

  const labelLower = blockLabel.toLowerCase();

  // Load flats and blocks for community
  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      if (!communityId) return;
      setLoading(true);

      const [{ data: flatData, error: flatError }, { data: blockData }] = await Promise.all([
        supabase.rpc('list_community_flats', { p_community_id: communityId }),
        supabase.rpc('list_community_blocks', { p_community_id: communityId }),
      ]);

      if (!cancelled) {
        if (!flatError && flatData) {
          const loadedFlats = flatData as FlatOption[];
          setFlats(loadedFlats);

          // Extract blocks
          if (blockData && (blockData as any[]).length > 0) {
            setBlocks((blockData as any[]).map((b) => ({ id: b.id, name: b.name })));
          } else {
            // Derive unique blocks from flats
            const blockMap = new Map<string, string>();
            loadedFlats.forEach((f) => {
              if (f.block_id && f.block_name) {
                blockMap.set(f.block_id, f.block_name);
              }
            });
            const derivedBlocks = Array.from(blockMap.entries()).map(([id, name]) => ({ id, name }));
            setBlocks(derivedBlocks);
          }

          // If current flat value is set, find its block
          if (value) {
            const currentFlat = loadedFlats.find((f) => f.id === value);
            if (currentFlat?.block_id) {
              setSelectedBlockId(currentFlat.block_id);
            }
          }
        }
        setLoading(false);
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [communityId]);

  // Set default block when blocks load and none selected
  useEffect(() => {
    if (blocks.length > 0 && !selectedBlockId) {
      if (value) {
        const matchingFlat = flats.find((f) => f.id === value);
        if (matchingFlat?.block_id) {
          setSelectedBlockId(matchingFlat.block_id);
          return;
        }
      }
      setSelectedBlockId(blocks[0].id);
    }
  }, [blocks, selectedBlockId, value, flats]);

  // Selected flat metadata
  const selectedFlat = useMemo(() => {
    if (!value) return null;
    return flats.find((f) => f.id === value) ?? null;
  }, [flats, value]);

  const selectedDisplay = useMemo(() => {
    if (!selectedFlat) return 'None';
    if (selectedFlat.block_name) {
      return `${selectedFlat.block_name}-${selectedFlat.flat_number}`;
    }
    return selectedFlat.flat_number;
  }, [selectedFlat]);

  // Filter flats for selected block and search term
  const filteredFlats = useMemo(() => {
    return flats.filter((f) => {
      if (selectedBlockId && f.block_id !== selectedBlockId) return false;
      if (flatSearch.trim()) {
        const q = flatSearch.trim().toUpperCase();
        return f.flat_number.includes(q);
      }
      return true;
    });
  }, [flats, selectedBlockId, flatSearch]);

  // Group filtered flats by floor_label
  const groupedByFloor = useMemo(() => {
    const groups = new Map<string, FlatOption[]>();

    filteredFlats.forEach((f) => {
      const floorKey = f.floor_label ? (f.floor_label.toUpperCase().startsWith('G') ? 'Ground Floor' : `Floor ${f.floor_label}`) : 'Units';
      if (!groups.has(floorKey)) {
        groups.set(floorKey, []);
      }
      groups.get(floorKey)!.push(f);
    });

    return Array.from(groups.entries());
  }, [filteredFlats]);

  const handleSelectFlat = (flat: FlatOption) => {
    if (disabled) return;
    const display = flat.block_name ? `${flat.block_name}-${flat.flat_number}` : flat.flat_number;
    onChange(flat.id, display);
  };

  const handleBlockChange = (blockId: string) => {
    setSelectedBlockId(blockId);
    setFlatSearch('');
    setBlockDropdownOpen(false);
  };

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator color={Verandah.accent} />
        <Text style={styles.loadingText}>Loading flat inventory...</Text>
      </View>
    );
  }

  if (flats.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>No flats set up yet</Text>
        <Text style={styles.emptySubtitle}>
          Your community administrator hasn't added flat numbers yet. You can request your flat to be added.
        </Text>
        <TouchableOpacity
          style={styles.requestLinkBtn}
          onPress={() => setShowRequestModal(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.requestLinkText}>+ Request to add my flat</Text>
        </TouchableOpacity>

        <FlatAdditionRequestModal
          visible={showRequestModal}
          onClose={() => setShowRequestModal(false)}
          communityId={communityId}
          blocks={blocks}
          selectedBlockId={selectedBlockId}
          blockLabel={blockLabel}
          onFlatAdded={(newFlatId) => {
            onChange(newFlatId);
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Selected Value Bar */}
      {selectedFlat && (
        <View style={styles.selectedBanner}>
          <Text style={styles.selectedBannerLabel}>Selected Flat:</Text>
          <Text style={styles.selectedBannerValue}>{selectedDisplay}</Text>
          {allowClear && (
            <TouchableOpacity onPress={() => onChange(null)} style={styles.clearBtn}>
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Block Selector */}
      {blocks.length > 0 && (
        <View style={styles.blockSection}>
          <Text style={styles.sectionLabel}>
            Step 1: Choose {blockLabel} {required && '*'}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.blockRow}
          >
            {blocks.map((b) => {
              const isSelected = selectedBlockId === b.id;
              return (
                <TouchableOpacity
                  key={b.id}
                  style={[styles.blockChip, isSelected ? styles.blockChipSelected : styles.blockChipDefault]}
                  onPress={() => handleBlockChange(b.id)}
                  activeOpacity={0.8}
                  disabled={disabled}
                >
                  <Text
                    style={[
                      styles.blockChipText,
                      isSelected ? styles.blockChipTextSelected : styles.blockChipTextDefault,
                    ]}
                  >
                    {blockLabel} {b.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Flat Selector */}
      <View style={styles.flatSection}>
        <View style={styles.flatHeaderRow}>
          <Text style={styles.sectionLabel}>
            {blocks.length > 0 ? 'Step 2: Choose Flat Number' : 'Choose Flat Number'} {required && '*'}
          </Text>
          <TouchableOpacity
            style={styles.missingLink}
            onPress={() => setShowRequestModal(true)}
            activeOpacity={0.7}
          >
            <HelpCircle size={14} color={Verandah.accent} aria-hidden={true} />
            <Text style={styles.missingLinkText}>Can't find flat?</Text>
          </TouchableOpacity>
        </View>

        {/* Search Input */}
        <View style={styles.searchWrap}>
          <SearchLg size={16} color={Verandah.textTertiary} aria-hidden={true} />
          <TextInput
            style={styles.searchInput}
            value={flatSearch}
            onChangeText={setFlatSearch}
            placeholder={`Search flats in ${blocks.find((b) => b.id === selectedBlockId)?.name ? `${blockLabel} ${blocks.find((b) => b.id === selectedBlockId)?.name}` : 'community'}...`}
            placeholderTextColor={Verandah.textTertiary}
            autoCapitalize="characters"
            clearButtonMode="while-editing"
            editable={!disabled}
          />
        </View>

        {/* Flat Grid grouped by floor */}
        {groupedByFloor.length === 0 ? (
          <View style={styles.noMatchBox}>
            <Text style={styles.noMatchText}>No matching flat numbers found.</Text>
            <TouchableOpacity
              style={styles.requestLinkInline}
              onPress={() => setShowRequestModal(true)}
            >
              <Text style={styles.requestLinkInlineText}>Request to add "{flatSearch.trim() || 'my flat'}"</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.floorsContainer}>
            {groupedByFloor.map(([floorTitle, floorFlats]) => (
              <View key={floorTitle} style={styles.floorGroup}>
                <Text style={styles.floorTitle}>{floorTitle}</Text>
                <View style={styles.flatGrid}>
                  {floorFlats.map((flat) => {
                    const isSelected = value === flat.id;
                    return (
                      <TouchableOpacity
                        key={flat.id}
                        style={[
                          styles.flatChip,
                          isSelected ? styles.flatChipSelected : styles.flatChipDefault,
                        ]}
                        onPress={() => handleSelectFlat(flat)}
                        activeOpacity={0.8}
                        disabled={disabled}
                      >
                        <Text
                          style={[
                            styles.flatNumberText,
                            isSelected ? styles.flatNumberSelected : styles.flatNumberDefault,
                          ]}
                        >
                          {flat.flat_number}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Escape Hatch Modal */}
      <FlatAdditionRequestModal
        visible={showRequestModal}
        onClose={() => setShowRequestModal(false)}
        communityId={communityId}
        blocks={blocks}
        selectedBlockId={selectedBlockId}
        blockLabel={blockLabel}
        onFlatAdded={(newFlatId) => {
          onChange(newFlatId);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: VerandahSpace.md,
  },
  loaderWrap: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    ...VerandahType.caption,
    color: Verandah.textSecondary,
  },
  emptyCard: {
    borderWidth: 0.5,
    borderColor: Verandah.border,
    backgroundColor: Verandah.cardMuted,
    borderRadius: VerandahRadius.lg,
    padding: VerandahSpace.md,
    gap: 8,
  },
  emptyTitle: {
    ...VerandahType.bodyBold,
    color: Verandah.textPrimary,
  },
  emptySubtitle: {
    ...VerandahType.caption,
    color: Verandah.textSecondary,
  },
  requestLinkBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  requestLinkText: {
    ...VerandahType.captionBold,
    color: Verandah.accent,
  },
  selectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Verandah.accentSoft,
    borderColor: Verandah.accent + '40',
    borderWidth: 1,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  selectedBannerLabel: {
    ...VerandahType.caption,
    color: Verandah.textSecondary,
  },
  selectedBannerValue: {
    ...VerandahType.bodyBold,
    color: Verandah.accent,
    flex: 1,
  },
  clearBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  clearText: {
    ...VerandahType.caption,
    color: Verandah.textTertiary,
  },
  sectionLabel: {
    ...VerandahType.captionBold,
    color: Verandah.textPrimary,
  },
  blockSection: {
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
  flatSection: {
    gap: 8,
  },
  flatHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  missingLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  missingLinkText: {
    ...VerandahType.captionBold,
    color: Verandah.accent,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Verandah.card,
    borderWidth: 1,
    borderColor: Verandah.borderStrong,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: {
    flex: 1,
    color: Verandah.textPrimary,
    ...VerandahType.body,
    height: '100%',
  },
  floorsContainer: {
    gap: 12,
    maxHeight: 280,
  },
  floorGroup: {
    gap: 6,
  },
  floorTitle: {
    ...VerandahType.caption,
    color: Verandah.textSecondary,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  flatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  flatChip: {
    minWidth: 54,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: VerandahRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flatChipDefault: {
    borderColor: Verandah.borderStrong,
    backgroundColor: Verandah.card,
  },
  flatChipSelected: {
    borderColor: Verandah.primary,
    backgroundColor: Verandah.primary,
  },
  flatNumberText: {
    ...VerandahType.bodyBold,
  },
  flatNumberDefault: {
    color: Verandah.textPrimary,
  },
  flatNumberSelected: {
    color: Verandah.primaryFg,
  },
  noMatchBox: {
    padding: 16,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.md,
    backgroundColor: Verandah.cardMuted,
    alignItems: 'center',
    gap: 8,
  },
  noMatchText: {
    ...VerandahType.caption,
    color: Verandah.textSecondary,
  },
  requestLinkInline: {
    paddingVertical: 4,
  },
  requestLinkInlineText: {
    ...VerandahType.captionBold,
    color: Verandah.accent,
  },
});
