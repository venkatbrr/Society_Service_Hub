import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahType } from '../constants/Verandah';

type SearchBarProps = {
  value: string;
  onChangeText: (text: string) => void;
  isLightMode?: boolean;
  placeholder?: string;
};

export const SearchBar = ({ value, onChangeText, isLightMode, placeholder = "Search..." }: SearchBarProps) => {
  return (
    <View style={styles.container}>
      <Ionicons name="search-outline" size={18} color={Verandah.textTertiary} style={styles.icon} />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={Verandah.textTertiary}
        value={value}
        onChangeText={onChangeText}
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText('')} style={styles.clearButton}>
          <Ionicons name="close-circle" size={18} color={Verandah.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: VerandahRadius.md,
    backgroundColor: Verandah.cardMuted,
  },
  icon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    ...VerandahType.body,
    color: Verandah.textPrimary,
    height: '100%',
  },
  clearButton: {
    padding: 4,
  },
});
