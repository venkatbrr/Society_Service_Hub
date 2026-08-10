import { Bookmark } from '@untitledui/icons/Bookmark';
import { CheckVerified01 } from '@untitledui/icons/CheckVerified01';
import { Share07 } from '@untitledui/icons/Share07';
import { Star01 } from '@untitledui/icons/Star01';
import React from 'react';
import { Platform, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahType } from '../constants/Verandah';
import { ProviderWithInteraction } from '../lib/database.types';
import { siteUrl } from '../lib/siteUrl';
import { Avatar } from './Avatar';
import { BaseCard } from './BaseCard';

type ProviderCardProps = {
  provider: ProviderWithInteraction;
  onPress: () => void;
  onToggleFavorite: (id: string, isCurrentlyFavorite: boolean) => void;
  isLightMode?: boolean;
};

export const ProviderCard = React.memo(({ provider, onPress, onToggleFavorite }: ProviderCardProps) => {
  const handleShare = async (e: any) => {
    e.stopPropagation();
    const ratingText = provider.avg_rating ? `${Number(provider.avg_rating).toFixed(1)} (${provider.rating_count} reviews)` : '';
    const shareUrl = siteUrl(`/provider/${provider.id}`);

    const messageLines = [
      `*${provider.name}*`,
      `Category: ${provider.category}`,
      `Phone: ${provider.phone}`,
      ratingText ? `Rating: ${ratingText}` : '',
      provider.flat_block ? `Block/Flat: ${provider.flat_block}` : '',
      provider.description ? `About: "${provider.description}"` : '',
      ``,
      `View Provider Profile:`,
      shareUrl,
    ];

    const message = messageLines.filter(Boolean).join('\n');

    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share({ title: provider.name, text: message });
      } else {
        await Share.share({ message, title: provider.name });
      }
    } catch (err) {
      console.error('Error sharing provider contact:', err);
    }
  };

  return (
    <BaseCard
      onPress={onPress}
      padding={12}
      style={styles.card}
    >
      <View style={styles.content}>
        <Avatar name={provider.name} size={38} />
        
        <View style={styles.mainInfo}>
          <View style={styles.headerRow}>
            <Text style={styles.name} numberOfLines={1}>
              {provider.name}
            </Text>
            {provider.is_verified && (
              <View style={styles.pillVerified}>
                <CheckVerified01 size={11} color={Verandah.accent} aria-hidden={true} style={{ marginRight: 3 }} />
                <Text style={styles.pillVerifiedText}>Verified</Text>
              </View>
            )}
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.categoryText} numberOfLines={1}>
              {provider.category}
            </Text>
            
            <Text style={styles.dot}>·</Text>
            
            <View style={styles.ratingBox}>
              <Star01 size={11} color={Verandah.goldInk} fill={Verandah.goldInk} aria-hidden={true} />
              <Text style={styles.ratingNumber}>
                {Number(provider.avg_rating).toFixed(1)}
              </Text>
              <Text style={styles.ratingCount}>({provider.rating_count})</Text>
            </View>

            <Text style={styles.dot}>·</Text>
            
            <Text style={styles.trustText} numberOfLines={1}>
              {(provider.hire_count ?? 0) === 1 ? '1 contact' : `${provider.hire_count ?? 0} contacts`}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <TouchableOpacity
            style={styles.favoriteBtn}
            onPress={handleShare}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Share07
              size={18}
              color={Verandah.accent}
              aria-hidden={true}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.favoriteBtn}
            onPress={() => onToggleFavorite(provider.id, !!provider.is_favorite)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Bookmark
              size={18}
              color={provider.is_favorite ? Verandah.accent : Verandah.textMuted}
              fill={provider.is_favorite ? Verandah.accent : 'none'}
              aria-hidden={true}
            />
          </TouchableOpacity>
        </View>
      </View>
    </BaseCard>
  );
});

const styles = StyleSheet.create({
  card: {
    marginBottom: 6,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mainInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: '500',
    color: Verandah.textPrimary,
    flexShrink: 1,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  categoryText: {
    fontSize: 12,
    color: Verandah.textSecondary,
    flexShrink: 1,
  },
  dot: {
    fontSize: 12,
    color: Verandah.textMuted,
    marginHorizontal: 1,
  },
  ratingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingNumber: {
    fontSize: 12,
    fontWeight: '500',
    color: Verandah.textPrimary,
  },
  ratingCount: {
    fontSize: 12,
    color: Verandah.textTertiary,
  },
  trustText: {
    fontSize: 12,
    color: Verandah.textTertiary,
    flexShrink: 1,
  },
  pillVerified: {
    backgroundColor: Verandah.accentSoft,
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  pillVerifiedText: {
    fontSize: 10,
    fontWeight: '500',
    color: Verandah.accent,
  },
  favoriteBtn: {
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
