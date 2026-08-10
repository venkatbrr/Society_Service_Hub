import { SearchLg } from '@untitledui/icons/SearchLg';
import { XClose } from '@untitledui/icons/XClose';
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
      <SearchLg size={16} color={Verandah.textTertiary} style={styles.icon} aria-hidden={true} />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={Verandah.textTertiary}
        value={value}
        onChangeText={onChangeText}
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText('')} style={styles.clearButton} hitSlop={8}>
          <XClose size={15} color={Verandah.textMuted} aria-hidden={true} />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: VerandahRadius.search, // 13px
    backgroundColor: Verandah.cardMuted,
    borderWidth: 0.5,
    borderColor: Verandah.borderSoft,
  },
  icon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 13,
    color: Verandah.textPrimary,
    height: '100%',
    fontFamily: VerandahType.sansFamily,
  },
  clearButton: {
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
