import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahBorder, VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';

type Insight = {
  title: string;
  value: string | number;
  icon: string;
  color: string;
};

type CommunityInsightsProps = {
  insights: Insight[];
};

export const CommunityInsights = ({ insights }: CommunityInsightsProps) => {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Community insights</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {insights.map((insight, index) => (
          <View
            key={index}
            style={styles.card}
          >
            <View style={[styles.iconContainer, { backgroundColor: Verandah.cardMuted }]}>
              <Text style={styles.iconText}>{insight.icon}</Text>
            </View>
            <View>
              <Text style={styles.insightValue}>{insight.value}</Text>
              <Text style={styles.insightTitle}>{insight.title}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: VerandahSpace.md,
  },
  sectionTitle: {
    ...VerandahType.sectionLabel,
    color: Verandah.textTertiary,
    marginLeft: VerandahSpace.xxl,
    marginBottom: VerandahSpace.sm + 2,
  },
  scrollContent: {
    paddingHorizontal: VerandahSpace.xl,
    gap: VerandahSpace.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: VerandahSpace.lg,
    borderRadius: VerandahRadius.lg,
    minWidth: 180,
    gap: VerandahSpace.md,
    backgroundColor: Verandah.card,
    borderWidth: VerandahBorder.tile,
    borderColor: Verandah.border,
    ...Verandah.shadowCard,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: VerandahRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 18,
    lineHeight: 20,
  },
  insightValue: {
    ...VerandahType.bodyBold,
    color: Verandah.textPrimary,
  },
  insightTitle: {
    ...VerandahType.caption,
    color: Verandah.textTertiary,
  },
});
