import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/Colors';
import { APP_EMOJIS } from '../constants/emojis';

type SearchBarProps = {
  value: string;
  onChangeText: (text: string) => void;
  isLightMode: boolean;
  placeholder?: string;
};

export const SearchBar = ({ value, onChangeText, isLightMode, placeholder = "Search..." }: SearchBarProps) => {
  const colors = isLightMode ? Colors.light : Colors.dark;

  return (
    <View style={[styles.container, { backgroundColor: colors.glass, borderColor: colors.border, shadowColor: colors.primary }]}>
      <Text style={[styles.icon, { fontSize: 20 }]}>{APP_EMOJIS.search}</Text>
      <TextInput
        style={[styles.input, { color: colors.text }]}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText('')} style={styles.clearButton}>
          <Text style={styles.clearIcon}>{APP_EMOJIS.close}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 12,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 0,
  },
  icon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    height: '100%',
  },
  clearButton: {
    padding: 4,
  },
  clearIcon: {
    fontSize: 18,
    lineHeight: 20,
  },
});
