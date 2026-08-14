import { MarkerPin01 } from '@untitledui/icons/MarkerPin01';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { getNetworkTileImageHeight, VerandahRadius, VerandahType } from '../constants/Verandah';
import { cloudinaryUrl } from '../lib/cloudinary';
import {
  eventCategoryMeta,
  eventDayLabel,
  formatEventDateShort,
  formatEventWhen,
  isRegistrationOpen,
} from '../lib/events';

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
  const { height: windowHeight } = useWindowDimensions();
  const meta = eventCategoryMeta(event.category);
  const { day, month } = formatEventDateShort(event.event_date);
  const regOpen = isRegistrationOpen(event.registration_last_date);
  const isCancelled = event.status === 'cancelled';
  const dayLabel = eventDayLabel(event.event_date);

  if (variant === 'compact') {
    return (
      <TouchableOpacity style={styles.compactCard} onPress={onPress} activeOpacity={0.88}>
        <View style={styles.compactImageWrap}>
          {event.image_url ? (
            <Image
              source={{ uri: cloudinaryUrl(event.image_url) }}
              style={styles.fillImage}
              contentFit="cover"
              contentPosition="top"
              transition={200}
            />
          ) : (
            <View style={[styles.placeholder, { backgroundColor: meta.tintSoft }]}>
              <meta.Icon size={26} color={meta.tint} aria-hidden={true} />
            </View>
          )}
          <View style={styles.dateBadge}>
            <Text style={styles.dateBadgeDay}>{day}</Text>
            <Text style={styles.dateBadgeMonth}>{month}</Text>
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
            <View style={styles.metaRow}>
              <MarkerPin01 size={11} color={Verandah.textTertiary} aria-hidden={true} />
              <Text style={styles.metaText} numberOfLines={1}>{event.venue}</Text>
            </View>
          ) : null}
          {regOpen ? (
            <Text style={styles.compactRegOpen} numberOfLines={1}>
              Register by {formatEventDateShort(event.registration_last_date!).day} {formatEventDateShort(event.registration_last_date!).month}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  }

  // Full variant: a poster card. An event is a thing residents decide to attend
  // from a photo and a date, so the cover leads and the date badge sits on it —
  // the old 96px thumbnail row read as a settings list, not a "what's on" feed.
  const coverHeight = getNetworkTileImageHeight(windowHeight);

  return (
    <TouchableOpacity
      style={[styles.fullCard, isCancelled && styles.fullCardCancelled]}
      onPress={onPress}
      activeOpacity={0.92}
    >
      <View style={[styles.fullImageWrap, { height: coverHeight }]}>
        {event.image_url ? (
          <Image
            source={{ uri: cloudinaryUrl(event.image_url) }}
            style={styles.fillImage}
            contentFit="cover"
            contentPosition="top"
            transition={200}
          />
        ) : (
          <View style={[styles.placeholder, { backgroundColor: meta.tintSoft }]}>
            <meta.Icon size={44} color={meta.tint} aria-hidden={true} />
          </View>
        )}

        <View style={styles.dateBadge}>
          <Text style={styles.dateBadgeDay}>{day}</Text>
          <Text style={styles.dateBadgeMonth}>{month}</Text>
        </View>

        <View style={styles.overlayRight}>
          {isCancelled ? (
            <View style={styles.cancelledBadge}>
              <Text style={styles.cancelledBadgeText}>Cancelled</Text>
            </View>
          ) : dayLabel ? (
            <View style={styles.dayLabelBadge}>
              <Text style={styles.dayLabelText}>{dayLabel}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.fullBody}>
        <View style={styles.fullTopRow}>
          <View style={[styles.categoryChip, { backgroundColor: meta.tintSoft }]}>
            <meta.Icon size={11} color={meta.tint} aria-hidden={true} />
            <Text style={[styles.categoryChipText, { color: meta.tint }]}>{meta.label}</Text>
          </View>
          {!isCancelled && regOpen ? (
            <View style={styles.regChip}>
              <Text style={styles.regChipText}>
                Register by {formatEventDateShort(event.registration_last_date!).day} {formatEventDateShort(event.registration_last_date!).month}
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.fullTitle} numberOfLines={2}>{event.title}</Text>
        <Text style={styles.fullWhen}>{formatEventWhen(event.event_date, event.start_time)}</Text>

        {event.venue ? (
          <View style={styles.metaRow}>
            <MarkerPin01 size={12} color={Verandah.textTertiary} aria-hidden={true} />
            <Text style={styles.metaText} numberOfLines={1}>{event.venue}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const COMPACT_WIDTH = 168;
const COMPACT_IMAGE_HEIGHT = 92;

const styles = StyleSheet.create({
  fillImage: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: Verandah.card,
    borderRadius: VerandahRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    ...Verandah.shadowCard,
  },
  dateBadgeDay: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 17,
    color: Verandah.textPrimary,
  },
  dateBadgeMonth: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.4,
    color: Verandah.textSecondary,
  },
  overlayRight: {
    position: 'absolute',
    top: 8,
    right: 8,
    alignItems: 'flex-end',
  },
  dayLabelBadge: {
    backgroundColor: Verandah.primary,
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dayLabelText: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 10.5,
    fontWeight: '700',
    color: Verandah.primaryFg,
  },
  cancelledBadge: {
    backgroundColor: Verandah.dangerSoft,
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  cancelledBadgeText: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 10,
    fontWeight: '700',
    color: Verandah.danger,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  metaText: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 11.5,
    color: Verandah.textSecondary,
    flexShrink: 1,
  },

  // Compact (horizontal rail on the Community tab)
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
  compactRegOpen: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 10,
    fontWeight: '600',
    color: Verandah.accent,
    marginTop: 4,
  },

  // Full (events feed)
  fullCard: {
    borderRadius: VerandahRadius.card,
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
    backgroundColor: Verandah.card,
    overflow: 'hidden',
    marginBottom: 10,
    ...Verandah.shadowCard,
  },
  fullCardCancelled: {
    opacity: 0.72,
  },
  fullImageWrap: {
    width: '100%',
    position: 'relative',
    backgroundColor: Verandah.cream,
  },
  fullBody: {
    padding: 10,
  },
  fullTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 5,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  categoryChipText: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 10,
    fontWeight: '600',
  },
  regChip: {
    borderRadius: VerandahRadius.pill,
    backgroundColor: Verandah.sand,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 1,
  },
  regChipText: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 10,
    fontWeight: '600',
    color: Verandah.goldInk,
  },
  fullTitle: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '400',
    letterSpacing: -0.3,
    color: Verandah.textPrimary,
  },
  fullWhen: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 12.5,
    fontWeight: '600',
    color: Verandah.accent,
    marginTop: 3,
  },
});
