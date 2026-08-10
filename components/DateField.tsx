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
import { Calendar } from '@untitledui/icons/Calendar';
import { Verandah } from '@/constants/Colors';
import { VerandahRadius, VerandahType } from '@/constants/Verandah';

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
            borderWidth: 0.5,
            borderStyle: 'solid',
            borderColor: colors.borderHair,
            borderRadius: VerandahRadius.search,
            paddingLeft: 12,
            paddingRight: 12,
            fontSize: 14,
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
          styles.touchable,
          { borderColor: colors.borderHair, backgroundColor: colors.card },
          disabled && styles.disabled,
          touchableStyle,
        ]}
        onPress={() => !disabled && setShowPicker(true)}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <Text style={[styles.text, { color: colors.textPrimary }, textStyle]}>
          {formattedLabel}
        </Text>
        <Calendar size={18} color={colors.textSecondary} aria-hidden={true} />
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
  touchable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
    borderWidth: 0.5,
    borderRadius: VerandahRadius.search,
    paddingHorizontal: 12,
  },
  disabled: {
    opacity: 0.6,
  },
  text: {
    fontSize: 14,
    fontFamily: VerandahType.sansFamily,
  },
});
