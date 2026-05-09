import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';
import { Rupees } from './Rupees';

type ActiveFundTeaserProps = {
  title: string;
  collected: number;
  goal: number;
  onPress: () => void;
};

export const ActiveFundTeaser = ({ title, collected, goal, onPress }: ActiveFundTeaserProps) => {
  const progress = goal > 0 ? Math.min(collected / goal, 1) : 0;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      style={styles.wrapper}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.titleArea}>
            <Text style={styles.label}>Active fund</Text>
            <Text style={styles.title}>{title}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <Rupees amount={collected} size="md" tone="in" />
          <Text style={styles.goal}>of </Text>
          <Rupees amount={goal} size="sm" />
        </View>

        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 20,
    marginBottom: VerandahSpace.sm + 2,
  },
  container: {
    padding: VerandahSpace.lg,
    borderRadius: VerandahRadius.lg,
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: VerandahSpace.md,
  },
  titleArea: {
    flex: 1,
  },
  label: {
    ...VerandahType.sectionLabel,
    fontSize: 10,
    color: Verandah.textTertiary,
    marginBottom: VerandahSpace.xs,
  },
  title: {
    ...VerandahType.bodyBold,
    color: Verandah.textPrimary,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: VerandahSpace.xs + 2,
    marginBottom: VerandahSpace.md,
  },
  goal: {
    ...VerandahType.caption,
    color: Verandah.textTertiary,
  },
  progressBg: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: Verandah.cardMuted,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: Verandah.accent,
  },
});
