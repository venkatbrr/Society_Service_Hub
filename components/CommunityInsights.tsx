import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { ComponentProps } from 'react';

type Insight = {
  title: string;
  value: string | number;
  icon: ComponentProps<typeof Ionicons>['name'];
  color: string;
};

type CommunityInsightsProps = {
  insights: Insight[];
};

export const CommunityInsights = ({ insights }: CommunityInsightsProps) => {
  const colors = Colors.light;

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Community Insights</Text>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        contentContainerStyle={styles.scrollContent}
      >
        {insights.map((insight, index) => (
          <View 
            key={index} 
            style={[styles.card, { backgroundColor: insight.color + '15' }]}
          >
            <View style={[styles.iconContainer, { backgroundColor: insight.color }]}>
              <Ionicons name={insight.icon} size={18} color="#FFF" />
            </View>
            <View>
              <Text style={[styles.insightValue, { color: colors.text }]}>{insight.value}</Text>
              <Text style={[styles.insightTitle, { color: colors.textMuted }]}>{insight.title}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginLeft: 24,
    marginBottom: 12,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    minWidth: 180,
    gap: 12,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  insightValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  insightTitle: {
    fontSize: 12,
    fontWeight: '500',
  },
});
