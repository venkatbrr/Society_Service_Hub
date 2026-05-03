import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CATEGORIES, CATEGORY_GROUPS, CategoryGroup } from '../constants/categories';
import { Colors } from '../constants/Colors';
import { getServiceCategoryEmoji } from '../constants/emojis';

type CategoryFilterProps = {
  selectedCategory: string | null;
  onSelectCategory: (category: string | null) => void;
  isLightMode: boolean;
  categories?: string[];
};

export const CategoryFilter = ({
  selectedCategory,
  onSelectCategory,
  isLightMode,
  categories = CATEGORIES
}: CategoryFilterProps) => {
  const colors = isLightMode ? Colors.light : Colors.dark;
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

  const renderChip = (label: string, isSelected: boolean, onPress: () => void) => {
    const isServiceCategoryChip = label === 'All' || displayCategories.includes(label);
    const chipLabel = isServiceCategoryChip ? `${getServiceCategoryEmoji(label)} ${label}` : label;

    if (isSelected) {
      return (
        <TouchableOpacity key={label} onPress={onPress}>
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.chip}
          >
            <Text style={[styles.chipText, { color: '#FFF' }]}>{chipLabel}</Text>
          </LinearGradient>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        key={label}
        style={[
          styles.chip,
          { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.border }
        ]}
        onPress={onPress}
      >
        <Text style={[styles.chipText, { color: colors.text }]}>{chipLabel}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.groupScrollContent}
      >
        {renderChip('All Services', selectedGroupId === 'all', () => {
          setSelectedGroupId('all');
          onSelectCategory(null);
        })}
        {groups.map((group) =>
          renderChip(group.label, selectedGroupId === group.id, () => {
            setSelectedGroupId(group.id);
            onSelectCategory(null);
          })
        )}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
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
    gap: 8,
    paddingBottom: 8,
  },
  scrollContent: {
    paddingHorizontal: 24,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
