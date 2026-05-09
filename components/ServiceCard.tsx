import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';
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
  const category = item.category as ServiceCategory;
  const emoji = SERVICE_CATEGORY_EMOJI[category] ?? '🔧';
  const categoryLabel = SERVICE_CATEGORY_LABELS[category] ?? item.category;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <View style={styles.iconWrap}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={1}>
          {item.service_name}
        </Text>
        <Text style={styles.category}>{categoryLabel}</Text>
        {item.notes ? (
          <Text style={styles.notes} numberOfLines={1}>
            {item.notes}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>
        <UrgencyBadge daysUntilDue={item.days_until_due} />
        <Text style={styles.chevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: VerandahRadius.lg,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    backgroundColor: Verandah.card,
    marginBottom: VerandahSpace.sm + 2,
    gap: VerandahSpace.md,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: VerandahRadius.md,
    backgroundColor: Verandah.cardMuted,
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
    ...VerandahType.bodyBold,
    color: Verandah.textPrimary,
  },
  category: {
    ...VerandahType.caption,
    fontWeight: '500',
    color: Verandah.textTertiary,
  },
  notes: {
    ...VerandahType.micro,
    color: Verandah.textMuted,
    marginTop: 2,
  },
  right: {
    alignItems: 'flex-end',
    gap: VerandahSpace.xs + 2,
  },
  chevron: {
    fontSize: 20,
    fontWeight: '400',
    color: Verandah.textMuted,
  },
});
