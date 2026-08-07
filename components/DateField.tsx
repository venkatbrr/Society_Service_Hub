import React, { useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Verandah } from '@/constants/Colors';

export function formatLocalDateForDb(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface DateFieldProps {
  value: Date;
  onChange: (date: Date) => void;
  maximumDate?: Date;
  minimumDate?: Date;
  style?: StyleProp<ViewStyle>;
  touchableStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  disabled?: boolean;
}

export const DateField: React.FC<DateFieldProps> = ({
  value,
  onChange,
  maximumDate,
  minimumDate,
  style,
  touchableStyle,
  textStyle,
  disabled = false,
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const colors = Verandah;

  if (Platform.OS === 'web') {
    const minStr = minimumDate ? formatLocalDateForDb(minimumDate) : undefined;
    const maxStr = maximumDate ? formatLocalDateForDb(maximumDate) : undefined;
    const valueStr = formatLocalDateForDb(value);

    return (
      <View style={[styles.container, style]}>
        <input
          type="date"
          value={valueStr}
          disabled={disabled}
          min={minStr}
          max={maxStr}
          onChange={(e) => {
            if (e.target.value) {
              const [y, m, d] = e.target.value.split('-').map(Number);
              if (y && m && d) {
                const newDate = new Date(y, m - 1, d);
                onChange(newDate);
              }
            }
          }}
          style={{
            height: 48,
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: colors.border,
            borderRadius: 12,
            paddingLeft: 12,
            paddingRight: 12,
            fontSize: 15,
            color: colors.textPrimary,
            backgroundColor: colors.card,
            fontFamily: 'inherit',
            outline: 'none',
            boxSizing: 'border-box',
            width: '100%',
            opacity: disabled ? 0.6 : 1,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        />
      </View>
    );
  }

  const formattedLabel = value.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <View style={[styles.container, style]}>
      <TouchableOpacity
        style={[
          styles.dateButton,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
          touchableStyle,
          disabled && styles.disabledButton,
        ]}
        onPress={() => !disabled && setShowPicker(true)}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} />
        <Text style={[styles.dateText, { color: colors.textPrimary }, textStyle]}>
          {formattedLabel}
        </Text>
      </TouchableOpacity>

      {showPicker && (
        <DateTimePicker
          value={value}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={maximumDate}
          minimumDate={minimumDate}
          onChange={(_event, selectedDate) => {
            setShowPicker(Platform.OS === 'ios');
            if (selectedDate) {
              onChange(selectedDate);
            }
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  dateText: {
    fontSize: 15,
    fontWeight: '400',
  },
  disabledButton: {
    opacity: 0.6,
  },
});
