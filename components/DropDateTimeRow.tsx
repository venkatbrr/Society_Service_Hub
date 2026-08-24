import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius } from '../constants/Verandah';
import {
  formatDateStr,
  formatDisplayTime,
  formatTimeStr,
  parseDateStr,
  parseTimeStr,
} from '../lib/dropSchedule';

/**
 * One labelled date + time pair for a food drop's schedule — used twice on the
 * publish form (delivery, cut-off) and twice in the republish sheet.
 *
 * It exists because `@react-native-community/datetimepicker` renders `null` on
 * web, so every date field needs a `Platform.OS` branch to an `<input>`. Four
 * hand-written copies of that branch is how one of them ends up without a
 * minimum date. The floor is a prop rather than a constant here: the delivery
 * date's floor is the cut-off date, not today.
 */
export interface DropDateTimeRowProps {
  dateLabel: string;
  timeLabel: string;
  dateValue: string;
  timeValue: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  /** Earliest selectable day, `YYYY-MM-DD`. */
  minDate: string;
  dateError?: boolean;
  timeError?: boolean;
}

export function DropDateTimeRow({
  dateLabel,
  timeLabel,
  dateValue,
  timeValue,
  onDateChange,
  onTimeChange,
  minDate,
  dateError,
  timeError,
}: DropDateTimeRowProps) {
  const colors = Verandah;
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const webInputStyle = (hasError?: boolean) => ({
    height: 42,
    borderRadius: 8,
    border: `1px solid ${hasError ? '#DC2626' : colors.borderHair}`,
    padding: '0 10px',
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: hasError ? '#FEF2F2' : colors.card,
    fontFamily: 'inherit',
  });

  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.subLabel}>{dateLabel}</Text>
        {Platform.OS === 'web' ? (
          <input
            type="date"
            value={dateValue}
            min={minDate}
            onChange={(e) => onDateChange(e.target.value)}
            style={webInputStyle(dateError)}
          />
        ) : (
          <>
            <TouchableOpacity
              style={[styles.input, { justifyContent: 'center' }, dateError && styles.inputError]}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={{ fontSize: 15, color: colors.textPrimary }}>
                {dateValue || 'Select Date'}
              </Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={parseDateStr(dateValue)}
                mode="date"
                display="default"
                minimumDate={parseDateStr(minDate)}
                onChange={(event: DateTimePickerEvent, date?: Date) => {
                  setShowDatePicker(Platform.OS === 'ios');
                  if (date) onDateChange(formatDateStr(date));
                }}
              />
            )}
          </>
        )}
        {dateError ? <Text style={styles.errorText}>Date required</Text> : null}
      </View>

      <View style={{ flex: 1 }}>
        <Text style={styles.subLabel}>{timeLabel}</Text>
        {Platform.OS === 'web' ? (
          <input
            type="time"
            value={timeValue}
            onChange={(e) => onTimeChange(e.target.value)}
            style={webInputStyle(timeError)}
          />
        ) : (
          <>
            <TouchableOpacity
              style={[styles.input, { justifyContent: 'center' }, timeError && styles.inputError]}
              onPress={() => setShowTimePicker(true)}
            >
              <Text style={{ fontSize: 15, color: colors.textPrimary }}>
                {timeValue ? formatDisplayTime(timeValue) : 'Select Time'}
              </Text>
            </TouchableOpacity>
            {showTimePicker && (
              <DateTimePicker
                value={parseTimeStr(timeValue)}
                mode="time"
                display="default"
                onChange={(event: DateTimePickerEvent, date?: Date) => {
                  setShowTimePicker(Platform.OS === 'ios');
                  if (date) onTimeChange(formatTimeStr(date));
                }}
              />
            )}
          </>
        )}
        {timeError ? <Text style={styles.errorText}>Time required</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  subLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: Verandah.textSecondary,
    marginBottom: 2,
  },
  input: {
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    color: Verandah.textPrimary,
  },
  inputError: {
    borderColor: '#DC2626',
    borderWidth: 1,
    backgroundColor: '#FEF2F2',
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    marginTop: 3,
    fontWeight: '500',
  },
});

export default DropDateTimeRow;
