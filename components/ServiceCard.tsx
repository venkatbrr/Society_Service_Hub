import { ChevronRight } from '@untitledui/icons/ChevronRight';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahBorder, VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';
import { SERVICE_CATEGORY_LABELS, ServiceCategory, getServiceCategoryIcon } from '../lib/serviceCategories';
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
  const categoryLabel = SERVICE_CATEGORY_LABELS[category] ?? item.category;
  const CategoryIcon = getServiceCategoryIcon(item.category);
  const { cleanNotes } = parseNotesAndImages(item.notes);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <View style={styles.iconWrap}>
        <CategoryIcon size={20} color={Verandah.primary} aria-hidden={true} />
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
        <ChevronRight size={16} color={Verandah.textTertiary} aria-hidden={true} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: VerandahRadius.card,
    borderWidth: VerandahBorder.tile,
    borderColor: Verandah.borderHair,
    backgroundColor: Verandah.card,
    marginBottom: 8,
    gap: VerandahSpace.sm + 2,
    ...Verandah.shadowCard,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: VerandahRadius.md,
    backgroundColor: Verandah.cardMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...VerandahType.bodyBold,
    color: Verandah.textPrimary,
    fontFamily: VerandahType.sansFamily,
  },
  category: {
    ...VerandahType.caption,
    fontWeight: '500',
    color: Verandah.textTertiary,
    fontFamily: VerandahType.sansFamily,
  },
  notes: {
    ...VerandahType.micro,
    color: Verandah.textMuted,
    marginTop: 2,
    fontFamily: VerandahType.sansFamily,
  },
  right: {
    alignItems: 'flex-end',
    gap: 6,
  },
});
