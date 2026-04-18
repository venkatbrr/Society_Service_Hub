import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CATEGORIES } from '../constants/categories';
import { Colors } from '../constants/Colors';

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

  const renderChip = (label: string, isSelected: boolean, onPress: () => void) => {
    if (isSelected) {
      return (
        <TouchableOpacity key={label} onPress={onPress}>
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.chip}
          >
            <Text style={[styles.chipText, { color: '#FFF' }]}>{label}</Text>
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
        <Text style={[styles.chipText, { color: colors.text }]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {renderChip('All', selectedCategory === null, () => onSelectCategory(null))}

        {displayCategories.map((category) =>
          renderChip(category, selectedCategory === category, () => onSelectCategory(category))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    marginHorizontal: -24,
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
