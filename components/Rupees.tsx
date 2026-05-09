import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahType } from '../constants/Verandah';

type Props = {
  amount: number;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'in' | 'out' | 'neutral';
};

const SIZES = {
  sm: { integer: 13, symbol: 11, decimal: 10 },
  md: { integer: 17, symbol: 14, decimal: 13 },
  lg: { integer: 24, symbol: 18, decimal: 17 },
};

/**
 * Rupees component — renders ₹ amounts with the Verandah treatment.
 *
 * ₹ is slightly smaller and Verandah.textTertiary-toned.
 * Integer part at the base weight.
 * Decimal part at 0.78em and Verandah.textTertiary.
 * Uses toLocaleString('en-IN') for Indian comma grouping (1,00,000).
 * For amounts where the decimal is .00, omits the decimal entirely.
 *
 * Tones: 'in' colors the integer in Verandah.accent.
 *        'out' keeps it Verandah.textPrimary.
 *        'neutral' is the same as 'out'.
 */
export const Rupees = React.memo(({ amount, size = 'md', tone = 'neutral' }: Props) => {
  const s = SIZES[size];

  const integerColor = tone === 'in' ? Verandah.accent : Verandah.textPrimary;

  // Split into integer and decimal
  const abs = Math.abs(amount);
  const integerPart = Math.floor(abs);
  const decimalRaw = Math.round((abs - integerPart) * 100);
  const hasDecimal = decimalRaw > 0;

  // Indian comma grouping
  const formattedInteger = integerPart.toLocaleString('en-IN');

  // Prefix for signed amounts
  const prefix = tone === 'in' ? '+' : amount < 0 ? '−' : '';

  return (
    <View style={styles.container}>
      {prefix ? (
        <Text style={[styles.prefix, { fontSize: s.integer, color: integerColor }]}>
          {prefix}
        </Text>
      ) : null}
      <Text style={[styles.symbol, { fontSize: s.symbol, color: Verandah.textTertiary }]}>
        ₹
      </Text>
      <Text style={[styles.integer, { fontSize: s.integer, color: integerColor }]}>
        {formattedInteger}
      </Text>
      {hasDecimal ? (
        <Text style={[styles.decimal, { fontSize: s.decimal, color: Verandah.textTertiary }]}>
          .{String(decimalRaw).padStart(2, '0')}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  prefix: {
    fontWeight: '500',
    marginRight: 1,
  },
  symbol: {
    fontWeight: '400',
    marginRight: 1,
  },
  integer: {
    fontWeight: '500',
  },
  decimal: {
    fontWeight: '400',
  },
});
