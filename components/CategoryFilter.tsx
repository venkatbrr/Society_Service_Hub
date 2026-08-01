import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CATEGORIES, CATEGORY_GROUPS, CategoryGroup } from '../constants/categories';
import { Verandah } from '../constants/Colors';
import { VerandahRadius } from '../constants/Verandah';

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
  categories = CATEGORIES
}: CategoryFilterProps) => {
  const groupScrollRef = useRef<ScrollView | null>(null);
  const categoryScrollRef = useRef<ScrollView | null>(null);
  const groupOffsetRef = useRef(0);
  const categoryOffsetRef = useRef(0);
  const dragStateRef = useRef<{ active: boolean; startX: number; startOffset: number }>({
    active: false,
    startX: 0,
    startOffset: 0,
  });
  const suppressPressRef = useRef(false);

  const displayCategories = categories.filter(c => c !== 'All');

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

  const runChipPress = (onPress: () => void) => {
    if (suppressPressRef.current) return;
    onPress();
  };

  const buildWebDragHandlers = (scrollRef: React.RefObject<ScrollView | null>, offsetRef: React.MutableRefObject<number>) => {
    if (Platform.OS !== 'web') {
      return {};
    }

    return {
      onMouseDown: (event: any) => {
        dragStateRef.current = {
          active: true,
          startX: event.nativeEvent.pageX,
          startOffset: offsetRef.current,
        };
      },
      onMouseMove: (event: any) => {
        if (!dragStateRef.current.active) return;

        const delta = event.nativeEvent.pageX - dragStateRef.current.startX;
        if (Math.abs(delta) > 4) {
          suppressPressRef.current = true;
        }

        const nextX = Math.max(0, dragStateRef.current.startOffset - delta);
        scrollRef.current?.scrollTo({ x: nextX, animated: false });
      },
      onMouseUp: () => {
        dragStateRef.current.active = false;
        if (suppressPressRef.current) {
          setTimeout(() => {
            suppressPressRef.current = false;
          }, 0);
        }
      },
      onMouseLeave: () => {
        dragStateRef.current.active = false;
      },
    };
  };

  const renderChip = (label: string, isSelected: boolean, onPress: () => void) => {
    return (
      <TouchableOpacity
        key={label}
        style={[
          styles.chip,
          isSelected
            ? styles.chipActive
            : styles.chipInactive,
        ]}
        onPress={() => runChipPress(onPress)}
      >
        <Text
          style={[
            styles.chipText,
            isSelected ? styles.chipTextActive : styles.chipTextInactive,
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        ref={groupScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.groupScrollContent}
        onScroll={(event) => {
          groupOffsetRef.current = event.nativeEvent.contentOffset.x;
        }}
        scrollEventThrottle={16}
        style={styles.dragScroll}
        {...(buildWebDragHandlers(groupScrollRef, groupOffsetRef) as any)}
      >
        {renderChip('All services', selectedGroupId === 'all', () => {
          setSelectedGroupId('all');
          onSelectCategory(null);
          onSelectGroupCategories?.(null);
        })}
        {groups.map((group) =>
          renderChip(group.label, selectedGroupId === group.id, () => {
            setSelectedGroupId(group.id);
            onSelectCategory(null);
            onSelectGroupCategories?.(group.categories);
          })
        )}
      </ScrollView>

      <ScrollView
        ref={categoryScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onScroll={(event) => {
          categoryOffsetRef.current = event.nativeEvent.contentOffset.x;
        }}
        scrollEventThrottle={16}
        style={styles.dragScroll}
        {...(buildWebDragHandlers(categoryScrollRef, categoryOffsetRef) as any)}
      >
        {renderChip('All', selectedCategory === null, () => onSelectCategory(null))}

        {categoriesInGroup.map((category) =>
          renderChip(category, selectedCategory === category, () => onSelectCategory(category))
        )}
      </ScrollView>
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
    paddingBottom: 8,
  },
  scrollContent: {
    paddingHorizontal: 24,
    gap: 6,
  },
  dragScroll: {
    cursor: 'grab' as any,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: VerandahRadius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: Verandah.primary,
  },
  chipInactive: {
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  chipTextActive: {
    color: Verandah.primaryFg,
  },
  chipTextInactive: {
    color: Verandah.textPrimary,
  },
});
