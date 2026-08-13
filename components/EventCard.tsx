import { MarkerPin01 } from '@untitledui/icons/MarkerPin01';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahType } from '../constants/Verandah';
import { cloudinaryUrl } from '../lib/cloudinary';
import { eventCategoryMeta, formatEventDateShort, formatEventWhen, isRegistrationOpen } from '../lib/events';

export interface CommunityEventItem {
  id: string;
  title: string;
  category: string;
  image_url: string | null;
  venue: string | null;
  event_date: string;
  start_time: string | null;
  registration_last_date: string | null;
  status: 'published' | 'cancelled';
}

interface EventCardProps {
  event: CommunityEventItem;
  onPress: () => void;
  variant?: 'compact' | 'full';
}

export function EventCard({ event, onPress, variant = 'full' }: EventCardProps) {
  const meta = eventCategoryMeta(event.category);
  const { day, month } = formatEventDateShort(event.event_date);
  const regOpen = isRegistrationOpen(event.registration_last_date);
  const isCancelled = event.status === 'cancelled';

  if (variant === 'compact') {
    return (
      <TouchableOpacity style={styles.compactCard} onPress={onPress} activeOpacity={0.88}>
        <View style={styles.compactImageWrap}>
          {event.image_url ? (
            <Image source={{ uri: cloudinaryUrl(event.image_url) }} style={styles.compactImage} contentFit="cover" transition={200} />
          ) : (
            <View style={[styles.compactPlaceholder, { backgroundColor: meta.tintSoft }]}>
              <meta.Icon size={26} color={meta.tint} aria-hidden={true} />
            </View>
          )}
          <View style={styles.compactDateBadge}>
            <Text style={styles.compactDateDay}>{day}</Text>
            <Text style={styles.compactDateMonth}>{month}</Text>
          </View>
          {isCancelled ? (
            <View style={styles.cancelledBadge}>
              <Text style={styles.cancelledBadgeText}>Cancelled</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.compactBody}>
          <Text style={styles.compactTitle} numberOfLines={2}>{event.title}</Text>
          {event.venue ? (
            <View style={styles.compactMetaRow}>
              <MarkerPin01 size={11} color={Verandah.textTertiary} aria-hidden={true} />
              <Text style={styles.compactMetaText} numberOfLines={1}>{event.venue}</Text>
            </View>
          ) : null}
          {regOpen ? (
            <Text style={styles.compactRegOpen} numberOfLines={1}>Register by {formatEventDateShort(event.registration_last_date!).day} {formatEventDateShort(event.registration_last_date!).month}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.fullCard} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.fullImageWrap}>
        {event.image_url ? (
          <Image source={{ uri: cloudinaryUrl(event.image_url) }} style={styles.fullImage} contentFit="cover" transition={200} />
        ) : (
          <View style={[styles.fullPlaceholder, { backgroundColor: meta.tintSoft }]}>
            <meta.Icon size={30} color={meta.tint} aria-hidden={true} />
          </View>
        )}
      </View>
      <View style={styles.fullBody}>
        <View style={styles.fullTopRow}>
          <View style={[styles.categoryChip, { backgroundColor: meta.tintSoft }]}>
            <meta.Icon size={11} color={meta.tint} aria-hidden={true} />
            <Text style={[styles.categoryChipText, { color: meta.tint }]}>{meta.label}</Text>
          </View>
          {isCancelled ? (
            <View style={styles.cancelledBadgeInline}>
              <Text style={styles.cancelledBadgeText}>Cancelled</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.fullTitle} numberOfLines={2}>{event.title}</Text>
        <Text style={styles.fullWhen}>{formatEventWhen(event.event_date, event.start_time)}</Text>
        {event.venue ? (
          <View style={styles.compactMetaRow}>
            <MarkerPin01 size={12} color={Verandah.textTertiary} aria-hidden={true} />
            <Text style={styles.compactMetaText} numberOfLines={1}>{event.venue}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const COMPACT_WIDTH = 168;
const COMPACT_IMAGE_HEIGHT = 92;

const styles = StyleSheet.create({
  compactCard: {
    width: COMPACT_WIDTH,
    borderRadius: VerandahRadius.card,
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
    backgroundColor: Verandah.card,
    overflow: 'hidden',
    ...Verandah.shadowCard,
  },
  compactImageWrap: {
    width: '100%',
    height: COMPACT_IMAGE_HEIGHT,
    position: 'relative',
    backgroundColor: Verandah.cream,
  },
  compactImage: {
    width: '100%',
    height: '100%',
  },
  compactPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactDateBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: Verandah.card,
    borderRadius: VerandahRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
    alignItems: 'center',
  },
  compactDateDay: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 15,
    color: Verandah.textPrimary,
  },
  compactDateMonth: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 8.5,
    fontWeight: '600',
    color: Verandah.textSecondary,
  },
  cancelledBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: Verandah.dangerSoft,
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  cancelledBadgeInline: {
    backgroundColor: Verandah.dangerSoft,
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  cancelledBadgeText: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 10,
    fontWeight: '700',
    color: Verandah.danger,
  },
  compactBody: {
    padding: 8,
  },
  compactTitle: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 16,
    color: Verandah.textPrimary,
  },
  compactMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  compactMetaText: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 10.5,
    color: Verandah.textSecondary,
    flexShrink: 1,
  },
  compactRegOpen: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 10,
    fontWeight: '600',
    color: Verandah.accent,
    marginTop: 4,
  },
  fullCard: {
    flexDirection: 'row',
    borderRadius: VerandahRadius.card,
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
    backgroundColor: Verandah.card,
    overflow: 'hidden',
    marginBottom: 10,
    ...Verandah.shadowCard,
  },
  fullImageWrap: {
    width: 96,
    height: 96,
    backgroundColor: Verandah.cream,
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  fullPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullBody: {
    flex: 1,
    padding: 10,
    justifyContent: 'center',
    gap: 3,
  },
  fullTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  categoryChipText: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 10,
    fontWeight: '600',
  },
  fullTitle: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 14.5,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  fullWhen: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 12,
    color: Verandah.textSecondary,
  },
});
