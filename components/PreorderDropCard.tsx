import { Share07 } from '@untitledui/icons/Share07';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahBorder, VerandahRadius, VerandahType, format12HourTime, getTopCropTileImageStyle } from '../constants/Verandah';
import { useAuth } from '../context/AuthContext';
import { cloudinaryUrl } from '../lib/cloudinary';
import { shareOrCopy } from '../lib/share';
import { siteUrl } from '../lib/siteUrl';
import { Avatar } from './Avatar';
import { DietDot } from './DietDot';
import { useReduceMotion } from './useReduceMotion';

/**
 * Cover shown when a host publishes a drop without a photo.
 *
 * An **illustration, not a photograph** — that is the point. A realistic photo
 * of a thali on a paid listing reads as a picture of the food you are about to
 * buy; a drawn tiffin spread cannot be mistaken for the host's actual dish, so
 * it fills the space honestly.
 *
 * Bundled rather than remote so it renders offline and costs no request. The
 * source was 1568×964 PNG / 2.1 MB; it ships at 1200×657 JPEG / 143 KB with the
 * dead background margin trimmed top and bottom, which keeps the food filling
 * the frame once a tile centre-crops it into a wide band. Re-encode rather than
 * dropping the full-size original back in — and keep the `.jpg` extension
 * matching the real file, or Android release builds fail to compile the
 * resource (see docs/CLAUDE.md §9).
 */
export const PLACEHOLDER_COVER = require('../assets/images/food-drop-placeholder.jpg');

/** Width of the travelling highlight, in px. */
const SHEEN_WIDTH = 44;

/**
 * One full traversal. Two bands run half a cycle apart, so a highlight crosses
 * the pill every `SHEEN_DURATION / 2` — slow enough to read as a drifting glow
 * rather than a spinner.
 */
const SHEEN_DURATION = 2600;

/**
 * The drop's call to action, sitting on the bottom-right of the cover photo.
 *
 * While the drop is open a soft highlight sweeps across it every few seconds —
 * enough to catch the eye in a scrolling feed, short of blinking at the user.
 * The button fill stays a flat `Verandah.primary`; the gradient is only the
 * moving highlight, never the surface (see verandah.md's out-of-register note).
 *
 * Closed and completed drops get a muted, static version: there is nothing to
 * reserve, so animating it would be advertising a dead end.
 */
function ReserveButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const reduceMotion = useReduceMotion();
  const [width, setWidth] = useState(0);
  const drive = useRef(new Animated.Value(0)).current;

  const animate = active && !reduceMotion && width > 0;

  useEffect(() => {
    if (!animate) return;

    drive.setValue(0);
    // No pause between passes, and `Easing.linear` — an in/out curve slows at
    // the ends, which reintroduces the stop-start rhythm a delay would.
    const loop = Animated.loop(
      Animated.timing(drive, {
        toValue: 1,
        duration: SHEEN_DURATION,
        easing: Easing.linear,
        useNativeDriver: false,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [animate, drive]);

  const travelStart = -SHEEN_WIDTH;
  const travelEnd = width + SHEEN_WIDTH;
  const travelMid = (travelStart + travelEnd) / 2;

  return (
    <TouchableOpacity
      style={[styles.reserveBtn, !active && styles.reserveBtnMuted]}
      onPress={onPress}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.reserveText, !active && styles.reserveTextMuted]} numberOfLines={1}>
        {label}
      </Text>

      {animate ? (
        <>
          {/* Band A: start -> end across the full cycle. */}
          <SheenBand
            translateX={drive.interpolate({
              inputRange: [0, 1],
              outputRange: [travelStart, travelEnd],
            })}
          />
          {/* Band B: the same travel, offset half a cycle, so light is always
              on the pill. A single band is off-screen for ~40% of its cycle
              (it has to fully clear both edges), which is the gap that reads as
              "the glow is late coming back". The jump from end to start at the
              half-way mark happens beyond the clip, so it is never seen. Same
              trick as the MCN disc's two ping rings. */}
          <SheenBand
            translateX={drive.interpolate({
              inputRange: [0, 0.5, 0.5001, 1],
              outputRange: [travelMid, travelEnd, travelStart, travelMid],
            })}
          />
        </>
      ) : null}
    </TouchableOpacity>
  );
}

function SheenBand({ translateX }: { translateX: Animated.AnimatedInterpolation<number> }) {
  return (
    <Animated.View
      pointerEvents="none"
      aria-hidden={true}
      style={[
        styles.sheen,
        { width: SHEEN_WIDTH, transform: [{ translateX }, { rotate: '18deg' }] },
      ]}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.38)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

export interface PreorderDropItem {
  id: string;
  title: string;
  description: string | null;
  fulfillment_date: string;
  fulfillment_time: string;
  meal_type?: string | null;
  cutoff_at: string;
  max_orders: number | null;
  status: 'open' | 'closed' | 'completed' | 'cancelled';
  image_url?: string | null;
  created_by: string;
  created_at: string;
  profiles?: {
    full_name: string | null;
    flat_number: string | null;
  } | null;
  mcn_listings?: {
    name: string;
    image_url: string | null;
  } | null;
  item_count?: number;
  order_count?: number;
  /** Set while the drop is hidden pending lead review. Only ever populated on
   *  the host's own "Mine" tab and the lead-only "Hidden" tab — the public
   *  catalog filters these rows out entirely. */
  flagged_for_review_at?: string | null;
  /** Derived by the catalog from the drop's menu items — used for filtering
   *  and sorting, and for the diet dots beside the title. Absent on screens
   *  that do not load the menu. */
  min_price?: number | null;
  diet_types?: string[];
}

interface PreorderDropCardProps {
  drop: PreorderDropItem;
  onPress: () => void;
}

export const PreorderDropCard: React.FC<PreorderDropCardProps> = ({
  drop,
  onPress,
}) => {
  const { height: windowHeight } = useWindowDimensions();
  // Natural width/height of the cover photo, learnt on load, so the tile can
  // show the top 40% of *this* picture rather than a fixed slab. Null until
  // the image reports it (and for the bundled placeholder, which keeps the
  // fixed height so every photo-less drop matches).
  const [coverAspect, setCoverAspect] = useState<number | null>(null);
  const coverSizing = getTopCropTileImageStyle(drop.image_url ? coverAspect : null, windowHeight);
  // Read from context rather than taking an `isCreator` prop: the card is the
  // only thing that needs this, and a prop is one a caller can silently forget
  // to pass. `user` is null for the anonymous browse path, which correctly
  // means "not the host".
  const { user } = useAuth();
  const isHost = !!user?.id && user.id === drop.created_by;
  const now = new Date();
  const cutoffDate = new Date(drop.cutoff_at);
  const isCutoffPassed = now >= cutoffDate;
  const isOpen = drop.status === 'open' && !isCutoffPassed;
  const isHiddenForReview = !!drop.flagged_for_review_at;

  const getCutoffBadge = () => {
    // Outranks every lifecycle state: whoever can see this tile at all needs to
    // know the drop is withheld before they read its timing.
    if (isHiddenForReview) {
      return {
        label: 'Hidden for review',
        color: '#92400E',
        bgColor: '#FEF3C7',
      };
    }
    if (drop.status === 'completed') {
      return {
        label: 'Delivered & Completed',
        color: Verandah.green600,
        bgColor: '#D1FAE5',
      };
    }
    if (drop.status === 'cancelled') {
      return {
        label: 'Menu Cancelled',
        color: '#DC2626',
        bgColor: '#FEE2E2',
      };
    }
    if (drop.status === 'closed' || isCutoffPassed) {
      return {
        label: 'Pre-Orders Closed',
        color: '#4B5563',
        bgColor: '#F3F4F6',
      };
    }

    // Time remaining until cut-off
    const diffMs = cutoffDate.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    let timeText = '';
    if (diffDays > 0) {
      timeText = `Closes in ${diffDays}d`;
    } else if (diffHours > 0) {
      timeText = `Closes in ${diffHours}h`;
    } else {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      timeText = `Closes in ${Math.max(1, diffMins)}m`;
    }

    const cutoffFormatted = cutoffDate.toLocaleDateString('en-IN', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

    return {
      label: `${timeText} (${cutoffFormatted})`,
      color: '#854F0B',
      bgColor: '#FBEAD0',
    };
  };

  const badge = getCutoffBadge();

  const cutoffFormatted = cutoffDate.toLocaleDateString('en-IN', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const fulfillDateObj = new Date(drop.fulfillment_date);
  const fulfillFormatted = fulfillDateObj.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  // Delivery reads in the same "Wed, 01:00 pm" shape as the cut-off chip, so the
  // two pills sitting side by side stay comparable at a glance.
  const fulfillDateTime = new Date(`${drop.fulfillment_date}T${drop.fulfillment_time}`);
  const deliveryFormatted = isNaN(fulfillDateTime.getTime())
    ? `${fulfillFormatted} · ${format12HourTime(drop.fulfillment_time)}`
    : fulfillDateTime.toLocaleDateString('en-IN', {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });

  const hostFullName = drop.profiles?.full_name?.trim() || null;
  const listingName = drop.mcn_listings?.name?.trim() || null;
  const rawHostName = hostFullName || listingName || 'Resident Host';
  const creatorName = rawHostName === 'Host' ? 'Resident Host' : rawHostName;
  const flatNo = drop.profiles?.flat_number ? `Flat ${drop.profiles.flat_number}` : null;
  const hostDisplay = flatNo ? `${creatorName} (${flatNo})` : creatorName;

  // Second line: where the food comes from. Prefer a linked business listing,
  // otherwise it is a resident cooking from home.
  const hostSubtitle = [flatNo, listingName && listingName !== creatorName ? listingName : 'Home kitchen']
    .filter(Boolean)
    .join(' · ');


  const handleShare = async (e: any) => {
    e.stopPropagation();
    // Route through the OG-preview endpoint (api/share-drop.ts) so WhatsApp/
    // Facebook/etc. crawlers render the drop's title, description, and photo.
    const shareUrl = siteUrl(`/api/share-drop?id=${drop.id}`);

    const messageLines = [
      `*Menu: ${drop.title}*`,
      `Hosted by ${hostDisplay}`,
      ``,
      `Delivery: ${fulfillFormatted} (${format12HourTime(drop.fulfillment_time)})`,
      `Pre-Orders Close: ${cutoffFormatted}`,
      ``,
      `View Menu & Place Pre-Order:`,
      shareUrl,
    ];

    const message = messageLines.join('\n');
    await shareOrCopy({ title: drop.title, message });
  };

  return (
    <View style={styles.card}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.9}>
        {/* Cover photo with overlaid cut-off badge */}
        <View style={[styles.coverImageWrap, coverSizing]}>
          {/* A host who uploads nothing gets the bundled thali rather than an
              empty grey box reading "food photo", which looked like an
              unfinished screen. Real photos crop from the top (that is where
              the dish usually sits); the placeholder crops from the centre,
              which is where its plate is. */}
          <Image
            source={drop.image_url ? { uri: cloudinaryUrl(drop.image_url) } : PLACEHOLDER_COVER}
            style={styles.coverImage}
            contentFit="cover"
            contentPosition={drop.image_url ? 'top' : 'center'}
            transition={200}
            onLoad={(e) => {
              const { width, height } = e.source ?? {};
              if (width && height) setCoverAspect(width / height);
            }}
          />

          {/* CTA overlays the photo's bottom-right instead of taking a full
              row under the body — it keeps the affordance while costing the
              tile no height.

              Hidden for the host: you cannot pre-order your own drop, so a
              shimmering "Reserve now" on your own card invites a tap that goes
              nowhere useful. Hosts manage the drop from inside it, and tapping
              the card still opens it. */}
          {isHost ? null : (
            <View style={styles.reserveSlot}>
              <ReserveButton
                label={isOpen ? 'Reserve now' : 'View menu'}
                active={isOpen}
                onPress={onPress}
              />
            </View>
          )}
        </View>

        {/* Body */}
        <View style={styles.body}>
          {/* Host row */}
          <View style={styles.header}>
            <Avatar name={creatorName} size={28} />
            <View style={styles.headerText}>
              <Text style={styles.creatorName} numberOfLines={1}>
                {creatorName}
              </Text>
              <Text style={styles.flatNo} numberOfLines={1}>
                {hostSubtitle}
              </Text>
            </View>
            <TouchableOpacity style={styles.shareHeaderBtn} onPress={handleShare} hitSlop={8} activeOpacity={0.85}>
              <Share07 size={14} color={Verandah.primaryFg} aria-hidden={true} />
              <Text style={styles.shareHeaderText}>Share</Text>
            </TouchableOpacity>
          </View>

          {/* Title, preceded by one dot per diet type the menu offers — a
              mixed drop shows green and red together, which is the honest
              summary of a menu the tile has no room to list. */}
          <View style={styles.titleRow}>
            {(drop.diet_types || []).map((d) => (
              <DietDot key={d} value={d} size={11} />
            ))}
            <Text style={[styles.title, { flexShrink: 1 }]} numberOfLines={1}>{drop.title}</Text>
          </View>

          {/* Cut-off + delivery, side by side */}
          <View style={styles.metaRow}>
            <View style={[styles.cutoffBadge, { backgroundColor: badge.bgColor }]}>
              <Text style={[styles.cutoffBadgeText, { color: badge.color }]} numberOfLines={1}>
                {isHiddenForReview
                  ? 'Hidden for review'
                  : drop.status === 'completed'
                  ? 'Completed'
                  : `Closes ${cutoffFormatted}`}
              </Text>
            </View>

            <View style={styles.deliveryChip}>
              <Text style={styles.deliveryText} numberOfLines={1}>
                Delivery {deliveryFormatted}
              </Text>
            </View>
          </View>

          {/* No description on the tile — it is one tap away, and leaving it in
              made card heights inconsistent (many drops have none) as well as
              costing a tile off the fold. */}
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 10,
    borderRadius: VerandahRadius.card,
    borderWidth: VerandahBorder.tile,
    borderColor: Verandah.borderHair,
    backgroundColor: Verandah.card,
    overflow: 'hidden',
    ...Verandah.shadowCard,
  },
  body: {
    padding: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  headerText: {
    flex: 1,
    marginLeft: 10,
  },
  creatorName: {
    ...VerandahType.bodyBold,
    fontSize: 14,
    color: Verandah.textPrimary,
  },
  flatNo: {
    ...VerandahType.caption,
    fontSize: 11.5,
    color: Verandah.textSecondary,
    marginTop: 1,
  },
  shareHeaderBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: VerandahRadius.pill,
    backgroundColor: Verandah.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  shareHeaderText: {
    ...VerandahType.captionBold,
    color: Verandah.primaryFg,
    fontSize: 12.5,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 5,
  },
  reserveSlot: {
    position: 'absolute',
    right: 8,
    bottom: 8,
  },
  reserveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: VerandahRadius.pill,
    backgroundColor: Verandah.primary,
    // Clips the travelling highlight to the pill.
    overflow: 'hidden',
    ...Verandah.shadowRaised,
  },
  reserveBtnMuted: {
    backgroundColor: Verandah.cardMuted,
  },
  reserveText: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 13,
    fontWeight: '700',
    color: Verandah.primaryFg,
  },
  reserveTextMuted: {
    color: Verandah.textSecondary,
  },
  sheen: {
    position: 'absolute',
    // Overshoots vertically so the 18deg rotation still covers the pill's
    // full height at both ends of its travel.
    top: -14,
    bottom: -14,
    left: 0,
  },
  cutoffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: VerandahRadius.pill,
    // Overlaid on the photo now, so the row is width-bounded (left/right: 8).
    // Both chips must shrink or a long cut-off label pushes delivery off-card.
    flexShrink: 1,
  },
  cutoffBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: VerandahType.sansFamily,
    flexShrink: 1,
  },
  deliveryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: VerandahRadius.pill,
    backgroundColor: Verandah.accentSoft,
    flexShrink: 1,
  },
  deliveryText: {
    fontSize: 11,
    fontWeight: '700',
    color: Verandah.green600,
    fontFamily: VerandahType.sansFamily,
    flexShrink: 1,
  },
  coverImageWrap: {
    width: '100%',
    position: 'relative',
    backgroundColor: Verandah.cream,
  },
  coverImage: {
    ...StyleSheet.absoluteFillObject,
  },
  title: {
    ...VerandahType.tileTitle,
    color: Verandah.textPrimary,
  },
});
