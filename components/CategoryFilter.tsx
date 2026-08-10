import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CATEGORIES, CATEGORY_GROUPS, CategoryGroup } from '../constants/categories';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahType } from '../constants/Verandah';
import { ChipRowSlider } from './ChipRowSlider';

type CategoryFilterProps = {
  selectedCategory: string | null;
  onSelectCategory: (category: string | null) => void;
  onSelectGroupCategories?: (categories: string[] | null) => void;
  isLightMode?: boolean;
  categories?: string[];
};

export const CategoryFilter = ({
  selectedCategory,
  onSelectCategory,
  onSelectGroupCategories,
  isLightMode,
  categories = CATEGORIES,
}: CategoryFilterProps) => {
  const displayCategories = categories.filter((c) => c !== 'All');

  const groups = useMemo(() => {
    const included = new Set(displayCategories);
    const builtGroups: CategoryGroup[] = CATEGORY_GROUPS
      .map((group) => ({
        ...group,
        categories: group.categories.filter((cat) => included.has(cat)),
      }))
      .filter((group) => group.categories.length > 0);

    const groupedCategories = new Set(builtGroups.flatMap((group) => group.categories));
    const uncategorized = displayCategories.filter((cat) => !groupedCategories.has(cat));

    if (uncategorized.length > 0) {
      builtGroups.push({ id: 'more', label: 'More', categories: uncategorized });
    }

    return builtGroups;
  }, [displayCategories]);

  const findGroupIdForCategory = (category: string | null) => {
    if (!category) return 'all';
    const group = groups.find((item) => item.categories.includes(category));
    return group?.id ?? 'all';
  };

  const [selectedGroupId, setSelectedGroupId] = useState<string>(findGroupIdForCategory(selectedCategory));

  useEffect(() => {
    if (selectedCategory) {
      setSelectedGroupId(findGroupIdForCategory(selectedCategory));
      return;
    }

    // Keep the user's current group selection when no specific category is active.
    // Fall back only if that group no longer exists for the current category source.
    const groupStillExists = selectedGroupId === 'all' || groups.some((group) => group.id === selectedGroupId);
    if (!groupStillExists) {
      setSelectedGroupId('all');
    }
  }, [selectedCategory, groups, selectedGroupId]);

  const categoriesInGroup = useMemo(() => {
    if (selectedGroupId === 'all') {
      return displayCategories;
    }
    return groups.find((group) => group.id === selectedGroupId)?.categories ?? displayCategories;
  }, [selectedGroupId, groups, displayCategories]);

  const groupChips = useMemo(() => {
    return [
      { key: 'all', label: 'All services' },
      ...groups.map((group) => ({ key: group.id, label: group.label })),
    ];
  }, [groups]);

  const categoryChips = useMemo(() => {
    return [
      { key: 'all', label: 'All' },
      ...categoriesInGroup.map((category) => ({ key: category, label: category })),
    ];
  }, [categoriesInGroup]);

  return (
    <View style={styles.container}>
      <ChipRowSlider<string>
        chips={groupChips}
        value={selectedGroupId}
        onChange={(groupId) => {
          setSelectedGroupId(groupId);
          onSelectCategory(null);
          if (groupId === 'all') {
            onSelectGroupCategories?.(null);
          } else {
            const g = groups.find((item) => item.id === groupId);
            onSelectGroupCategories?.(g?.categories ?? null);
          }
        }}
        containerStyle={styles.dragScroll}
        contentContainerStyle={styles.groupScrollContent}
        chipStyle={styles.chip}
        inactiveChipStyle={styles.chipInactive}
        pillStyle={styles.chipActive}
        activeColor={Verandah.primaryFg}
        inactiveColor={Verandah.textPrimary}
        textStyle={styles.chipText}
      />

      <ChipRowSlider<string>
        chips={categoryChips}
        value={selectedCategory ?? 'all'}
        onChange={(catKey) => {
          onSelectCategory(catKey === 'all' ? null : catKey);
        }}
        containerStyle={styles.dragScroll}
        contentContainerStyle={styles.scrollContent}
        chipStyle={styles.chip}
        inactiveChipStyle={styles.chipInactive}
        pillStyle={styles.chipActive}
        activeColor={Verandah.primaryFg}
        inactiveColor={Verandah.textPrimary}
        textStyle={styles.chipText}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 10,
    marginHorizontal: -24,
  },
  groupScrollContent: {
    paddingHorizontal: 24,
    gap: 6,
    paddingBottom: 6,
  },
  scrollContent: {
    paddingHorizontal: 24,
    gap: 6,
  },
  dragScroll: {},
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: VerandahRadius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: Verandah.primary,
    borderColor: Verandah.primary,
  },
  chipInactive: {
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: '500',
    fontFamily: VerandahType.sansFamily,
  },
});
