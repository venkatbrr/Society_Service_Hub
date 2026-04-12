import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Share } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/Colors';
import { RatingStars } from '../../components/RatingStars';
import { ProviderWithInteraction } from '../../lib/database.types';
import { CATEGORY_COLORS } from '../../constants/categories';
import Toast from 'react-native-toast-message';

export default function ProviderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const colors = Colors.light;

  const [provider, setProvider] = useState<ProviderWithInteraction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProvider();
  }, [id]);

  const fetchProvider = async () => {
    try {
      const { data, error } = await supabase
        .from('service_providers')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      // Checks favorites and user ratings for this provider
      if (user) {
         const { data: favs } = await supabase
           .from('favorites')
           .select('id')
           .eq('user_id', user.id)
           .eq('provider_id', id);

         const { data: rats } = await supabase
           .from('ratings')
           .select('rating')
           .eq('user_id', user.id)
           .eq('provider_id', id)
           .maybeSingle();

         setProvider({
           ...data,
           is_favorite: favs && favs.length > 0,
           user_rating: rats ? rats.rating : null
         });
      } else {
         setProvider(data);
      }
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Provider not found' });
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleCall = async () => {
    if (!provider) return;
    const url = `tel:${provider.phone}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Phone dialing not supported on this device' });
    }
  };

  const handleShare = async () => {
    if (!provider) return;
    
    // For simplicity, we just share text since it works across all apps natively
    const message = `Check out this service provider on Society Service Hub!\n\nName: ${provider.name}\nCategory: ${provider.category}\nPhone: ${provider.phone}\n${provider.description ? `\nNotes: ${provider.description}` : ''}`;
    
    try {
      await Share.share({
        message,
        title: `Share ${provider.name}'s Contact`
      });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error sharing contact' });
    }
  };

  const handleToggleFavorite = async () => {
    if (!provider || !user) return;
    
    const isCurrentlyFavorite = provider.is_favorite;
    setProvider({ ...provider, is_favorite: !isCurrentlyFavorite });

    try {
      if (isCurrentlyFavorite) {
        await supabase.from('favorites').delete().match({ user_id: user.id, provider_id: provider.id });
      } else {
        await supabase.from('favorites').insert({ user_id: user.id, provider_id: provider.id });
      }
    } catch (error) {
       setProvider({ ...provider, is_favorite: isCurrentlyFavorite });
       Toast.show({ type: 'error', text1: 'Error updating favorite' });
    }
  };

  const handleRating = async (rating: number) => {
    if (!provider || !user) return;
    try {
      // Upsert rating
      const { error } = await supabase
        .from('ratings')
        .upsert({ user_id: user.id, provider_id: provider.id, rating }, { onConflict: 'user_id,provider_id' });
        
      if (error) throw error;
      Toast.show({ type: 'success', text1: 'Rating saved' });
      // Refetch to get new average
      fetchProvider();
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error saving rating' });
    }
  };

  const handleDelete = () => {
    if (!provider) return;
    Alert.alert("Delete Provider", "Are you sure you want to delete this provider?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
         try {
           await supabase.from('service_providers').delete().eq('id', provider.id);
           Toast.show({ type: 'success', text1: 'Deleted successfully' });
           router.back();
         } catch(e) {
           Toast.show({ type: 'error', text1: 'Delete failed' });
         }
      } }
    ]);
  };

  if (loading || !provider) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const categoryColor = CATEGORY_COLORS[provider.category] || colors.primary;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.headerCard, { backgroundColor: colors.primary }]}>
        <View style={styles.headerTop}>
           <View style={[styles.badge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
             <Text style={styles.badgeText}>{provider.category}</Text>
           </View>
           <TouchableOpacity onPress={handleToggleFavorite} style={styles.iconButton}>
             <Ionicons name={provider.is_favorite ? "heart" : "heart-outline"} size={28} color={provider.is_favorite ? colors.accent : "#FFF"} />
           </TouchableOpacity>
        </View>
        <Text style={styles.name}>{provider.name}</Text>
        <View style={styles.ratingRow}>
           <Ionicons name="star" size={20} color={colors.warning} />
           <Text style={styles.ratingText}>{Number(provider.avg_rating).toFixed(1)} ({provider.rating_count} reviews)</Text>
        </View>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.surface }]} onPress={handleCall}>
          <View style={[styles.actionIconArea, { backgroundColor: colors.secondary + '20' }]}>
            <Ionicons name="call" size={24} color={colors.secondary} />
          </View>
          <Text style={[styles.actionText, { color: colors.text }]}>Call</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.surface }]} onPress={handleShare}>
           <View style={[styles.actionIconArea, { backgroundColor: colors.primary + '20' }]}>
            <Ionicons name="share-social" size={24} color={colors.primary} />
          </View>
          <Text style={[styles.actionText, { color: colors.text }]}>Share</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.detailsCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Phone Number</Text>
        <Text style={[styles.detailText, { color: colors.text }]}>{provider.phone}</Text>
        
        {provider.flat_block && (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Usually Works At</Text>
            <Text style={[styles.detailText, { color: colors.textMuted }]}>{provider.flat_block}</Text>
          </>
        )}

        {provider.description && (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Description / Notes</Text>
            <Text style={[styles.detailText, { color: colors.textMuted }]}>{provider.description}</Text>
          </>
        )}
      </View>

      <View style={[styles.detailsCard, { backgroundColor: colors.surface }]}>
         <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 8 }]}>Your Rating</Text>
         <RatingStars rating={provider.user_rating || 0} onRating={handleRating} size={32} isLightMode={true} />
      </View>

      {user?.id === provider.created_by && (
         <View style={styles.adminControls}>
            <TouchableOpacity style={[styles.dangerBtn, { borderColor: colors.accent }]} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={20} color={colors.accent} />
              <Text style={{ color: colors.accent, marginLeft: 8, fontWeight: '600' }}>Delete Provider</Text>
            </TouchableOpacity>
         </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCard: {
    padding: 24,
    paddingTop: 32,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  badgeText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  iconButton: {
    padding: 4,
  },
  name: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 8,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratingText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3.84,
    elevation: 2,
    gap: 12,
  },
  actionIconArea: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: {
    fontSize: 16,
    fontWeight: '600',
  },
  detailsCard: {
    margin: 16,
    marginTop: 0,
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3.84,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  detailText: {
    fontSize: 16,
    lineHeight: 24,
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },
  adminControls: {
    padding: 16,
    paddingBottom: 40,
  },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  }
});
