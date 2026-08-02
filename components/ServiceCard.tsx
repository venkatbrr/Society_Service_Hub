import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';
import { SERVICE_CATEGORY_ICONS, SERVICE_CATEGORY_LABELS, ServiceCategory } from '../lib/serviceCategories';
import { parseNotesAndImages } from '../lib/serviceReminderHelpers';
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
  const iconName = (SERVICE_CATEGORY_ICONS[category] as any) ?? 'build-outline';
  const categoryLabel = SERVICE_CATEGORY_LABELS[category] ?? item.category;
  const { cleanNotes } = parseNotesAndImages(item.notes);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={iconName} size={20} color={Verandah.primary} />
      </View>
      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={1}>
          {item.service_name}
        </Text>
        <Text style={styles.category}>{categoryLabel}</Text>
        {cleanNotes ? (
          <Text style={styles.notes} numberOfLines={1}>
            {cleanNotes}
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
    padding: 10,
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
    borderColor: Verandah.borderStrong,
    backgroundColor: Verandah.card,
    marginBottom: 6,
    gap: VerandahSpace.sm + 2,
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
