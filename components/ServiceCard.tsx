import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/Colors';
import { SERVICE_CATEGORY_EMOJI, SERVICE_CATEGORY_LABELS, ServiceCategory } from '../lib/serviceCategories';
import { UrgencyBadge } from './UrgencyBadge';

export interface ServiceCardItem {
  id: string;
  service_name: string;
  category: string;
  next_due_on: string;
  days_until_due: number;
  notes?: string | null;
}

interface ServiceCardProps {
  item: ServiceCardItem;
  onPress: () => void;
}

export function ServiceCard({ item, onPress }: ServiceCardProps) {
  const colors = Colors.light;
  const category = item.category as ServiceCategory;
  const emoji = SERVICE_CATEGORY_EMOJI[category] ?? '🔧';
  const categoryLabel = SERVICE_CATEGORY_LABELS[category] ?? item.category;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.primary + '20', borderColor: colors.primary + '35' }]}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      <View style={styles.content}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {item.service_name}
        </Text>
        <Text style={[styles.category, { color: colors.textMuted }]}>{categoryLabel}</Text>
        {item.notes ? (
          <Text style={[styles.notes, { color: colors.textMuted }]} numberOfLines={1}>
            {item.notes}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>
        <UrgencyBadge daysUntilDue={item.days_until_due} />
        <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 0,
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 22,
  },
  content: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
  },
  category: {
    fontSize: 12,
    fontWeight: '500',
  },
  notes: {
    fontSize: 11,
    marginTop: 2,
  },
  right: {
    alignItems: 'flex-end',
    gap: 6,
  },
  chevron: {
    fontSize: 20,
    fontWeight: '300',
  },
});
