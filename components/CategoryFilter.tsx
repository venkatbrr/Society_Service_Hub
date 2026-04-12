import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { CATEGORIES } from '../constants/categories';
import { Colors } from '../constants/Colors';

type CategoryFilterProps = {
  selectedCategory: string | null;
  onSelectCategory: (category: string | null) => void;
  isLightMode: boolean;
};

export const CategoryFilter = ({ selectedCategory, onSelectCategory, isLightMode }: CategoryFilterProps) => {
  const colors = isLightMode ? Colors.light : Colors.dark;

  return (
    <View style={styles.container}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <TouchableOpacity
          style={[
            styles.chip,
            { backgroundColor: selectedCategory === null ? colors.primary : colors.surface },
            selectedCategory === null ? null : { borderWidth: 1, borderColor: colors.border }
          ]}
          onPress={() => onSelectCategory(null)}
        >
          <Text style={[
            styles.chipText,
            { color: selectedCategory === null ? '#FFF' : colors.text }
          ]}>
            All
          </Text>
        </TouchableOpacity>

        {CATEGORIES.map((category) => {
          const isSelected = selectedCategory === category;
          return (
            <TouchableOpacity
              key={category}
              style={[
                styles.chip,
                { backgroundColor: isSelected ? colors.primary : colors.surface },
                isSelected ? null : { borderWidth: 1, borderColor: colors.border }
              ]}
              onPress={() => onSelectCategory(category)}
            >
              <Text style={[
                styles.chipText,
                { color: isSelected ? '#FFF' : colors.text }
              ]}>
                {category}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  scrollContent: {
    paddingHorizontal: 16,
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
