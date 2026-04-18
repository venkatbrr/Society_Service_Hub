import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { RatingStars } from '../../components/RatingStars';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../context/AuthContext';
import { ProviderWithInteraction } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';

const isMissingRelationError = (error: { code?: string; message?: string } | null) =>
  error?.code === 'PGRST205' ||
  error?.message?.includes("Could not find the table 'public.provider_hires'");

export default function ProviderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const colors = Colors.light;

  const [provider, setProvider] = useState<ProviderWithInteraction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProvider();
  }, [id, user]);

  const fetchProvider = async () => {
    try {
      if (!id || id === 'add') return;

      // Fetch provider data and user-specific data in parallel
      const providerQuery = supabase
        .from('service_providers')
        .select('*')
        .eq('id', id)
        .single();

      if (user) {
        const [providerResult, favsResult, ratsResult, hireResult] = await Promise.all([
          providerQuery,
          supabase.from('favorites')
            .select('id')
            .eq('user_id', user.id)
            .eq('provider_id', id),
          supabase.from('ratings')
            .select('rating')
            .eq('user_id', user.id)
            .eq('provider_id', id)
            .maybeSingle(),
          supabase.from('provider_hires')
            .select('*', { count: 'exact', head: true })
            .eq('provider_id', id)
        ]);

        if (providerResult.error) throw providerResult.error;

        const hireCountError = hireResult.error;
        if (hireCountError && !isMissingRelationError(hireCountError)) {
          throw hireCountError;
        }

        setProvider({
          ...providerResult.data,
          is_favorite: !!(favsResult.data && favsResult.data.length > 0),
          user_rating: ratsResult.data ? ratsResult.data.rating : null,
          hire_count: hireResult.count || 0
        });
      } else {
        const { data: providerData, error: providerError } = await providerQuery;
        if (providerError) throw providerError;
        setProvider({ ...providerData, hire_count: 0 });
      }
    } catch (error: any) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Provider not found' });
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const logHire = async () => {
    if (!provider || !user) return;
    try {
      const { error } = await supabase.from('provider_hires').insert({
        user_id: user.id,
        provider_id: provider.id
      });

      if (error) {
        if (isMissingRelationError(error)) return;
        throw error;
      }

      setProvider((prev: ProviderWithInteraction | null) => prev ? { ...prev, hire_count: (prev.hire_count || 0) + 1 } : null);
    } catch (err) {
      console.error('Error logging hire:', err);
    }
  };

  const handleCall = async () => {
    if (!provider) return;
    await logHire();
    const url = `tel:${provider.phone}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Phone dialing not supported' });
    }
  };

  const handleWhatsApp = async () => {
    if (!provider) return;
    await logHire();
    const cleanPhone = provider.phone.replace(/[^0-9]/g, '');
    const url = `whatsapp://send?phone=${cleanPhone}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      await Linking.openURL(`https://wa.me/${cleanPhone}`);
    }
  };

  const handleHireAgain = () => {
    if (!provider) return;
    Alert.alert(
      "Hire Again",
      `Would you like to contact ${provider.name} again?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "WhatsApp", onPress: handleWhatsApp },
        { text: "Call", onPress: handleCall },
      ]
    );
  };

  const handleShare = async () => {
    if (!provider) return;
    const message = `Check out ${provider.name} (${provider.category}) on Society Service Hub!\nPhone: ${provider.phone}`;
    try {
      await Share.share({ message });
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
      const { error } = await supabase
        .from('ratings')
        .upsert({ user_id: user.id, provider_id: provider.id, rating }, { onConflict: 'user_id,provider_id' });
      if (error) throw error;
      Toast.show({ type: 'success', text1: 'Rating saved' });
      // Update rating locally instead of refetching entire provider
      setProvider((prev: ProviderWithInteraction | null) => prev ? { ...prev, user_rating: rating } : null);
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

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        style={styles.headerCard}
      >
        <View style={styles.headerTop}>
           <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
             <Ionicons name="arrow-back" size={24} color="#FFF" />
           </TouchableOpacity>
           <TouchableOpacity onPress={handleToggleFavorite} style={styles.iconButton}>
             <Ionicons name={provider.is_favorite ? "heart" : "heart-outline"} size={28} color={provider.is_favorite ? colors.accent : "#FFF"} />
           </TouchableOpacity>
        </View>

        <View style={styles.headerContent}>
          <View style={styles.imagePlaceholderLarge}>
            <Ionicons name="person" size={48} color="#FFF" />
          </View>
          <View style={styles.headerInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{provider.name}</Text>
              {provider.is_verified && (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={16} color="#FFF" />
                  <Text style={styles.verifiedText}>Verified</Text>
                </View>
              )}
            </View>
            <Text style={styles.categoryTextDisp}>{provider.category}</Text>
            <View style={styles.ratingRowDisp}>
               <Ionicons name="star" size={18} color={colors.warning} />
               <Text style={styles.ratingValueDisp}>{Number(provider.avg_rating || 0).toFixed(1)}</Text>
               <Text style={styles.ratingCountDisp}>({provider.rating_count || 0} reviews)</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.trustBanner}>
         <View style={styles.trustStat}>
            <Text style={[styles.trustStatValue, { color: colors.text }]}>{provider.hire_count || 0}</Text>
            <Text style={[styles.trustStatLabel, { color: colors.textMuted }]}>Homes used</Text>
         </View>
         <View style={[styles.trustDivider, { backgroundColor: colors.border }]} />
         <View style={styles.trustStat}>
            <Text style={[styles.trustStatValue, { color: colors.text }]}>{provider.rating_count || 0}</Text>
            <Text style={[styles.trustStatLabel, { color: colors.textMuted }]}>Community reviews</Text>
         </View>
      </View>

      <View style={styles.actionGrid}>
        <TouchableOpacity style={[styles.mainActionBtn, { backgroundColor: colors.secondary }]} onPress={handleWhatsApp}>
          <Ionicons name="logo-whatsapp" size={24} color="#FFF" />
          <Text style={styles.mainActionText}>WhatsApp</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.mainActionBtn, { backgroundColor: colors.primary }]} onPress={handleCall}>
          <Ionicons name="call" size={24} color="#FFF" />
          <Text style={styles.mainActionText}>Call</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={[styles.hireAgainBtn, { borderColor: colors.border }]} onPress={handleHireAgain}>
        <Ionicons name="refresh" size={20} color={colors.primary} />
        <Text style={[styles.hireAgainText, { color: colors.primary }]}>Hire Again</Text>
      </TouchableOpacity>

      <View style={styles.detailsCard}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Experience Details</Text>
        <Text style={[styles.detailText, { color: colors.textMuted, marginTop: 8 }]}>
          {provider.description || `${provider.name} is a trusted provider in our gated community.`}
        </Text>
        {provider.flat_block ? (
          <View style={[styles.infoRow, { borderTopColor: colors.border }]}>
            <Ionicons name="location-outline" size={20} color={colors.textMuted} />
            <Text style={[styles.infoText, { color: colors.text }]}>Usually works at {provider.flat_block}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.detailsCard}>
         <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 16 }]}>Rate this Provider</Text>
         <RatingStars rating={provider.user_rating || 0} onRating={handleRating} size={36} isLightMode={true} />
         <Text style={[styles.reviewNote, { color: colors.textMuted }]}>Reviews are only visible to our community members.</Text>
      </View>

      <View style={styles.actionRowAlt}>
         <TouchableOpacity style={styles.altBtn} onPress={handleShare}>
            <Ionicons name="share-outline" size={20} color={colors.textMuted} />
            <Text style={[styles.altBtnText, { color: colors.textMuted }]}>Share Contact</Text>
         </TouchableOpacity>
      </View>

      {user?.id === provider.created_by ? (
         <View style={styles.adminControls}>
            <TouchableOpacity style={[styles.dangerBtn, { borderColor: colors.accent }]} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={20} color={colors.accent} />
              <Text style={{ color: colors.accent, marginLeft: 8, fontWeight: '600' }}>Delete Provider</Text>
            </TouchableOpacity>
         </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerCard: { padding: 24, paddingTop: 60, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  headerContent: { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 10 },
  imagePlaceholderLarge: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  headerInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  name: { fontSize: 24, fontWeight: '800', color: '#FFF', letterSpacing: -0.5 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, gap: 4 },
  verifiedText: { color: '#FFF', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  categoryTextDisp: { fontSize: 16, color: 'rgba(255,255,255,0.8)', fontWeight: '600', marginTop: 4 },
  ratingRowDisp: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  ratingValueDisp: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  ratingCountDisp: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },
  trustBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.85)',
    marginHorizontal: 20,
    marginTop: -25,
    borderRadius: 16,
    padding: 20,
    elevation: 4,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  trustStat: { flex: 1, alignItems: 'center' },
  trustStatValue: { fontSize: 20, fontWeight: '800' },
  trustStatLabel: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  trustDivider: { width: 1, height: '100%' },
  actionGrid: { flexDirection: 'row', padding: 20, gap: 15 },
  mainActionBtn: { flex: 1, flexDirection: 'row', height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', gap: 10, elevation: 2 },
  mainActionText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  hireAgainBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 20, marginBottom: 20, padding: 16, borderRadius: 16, borderWidth: 1.5, gap: 8 },
  hireAgainText: { fontSize: 15, fontWeight: '700' },
  detailsCard: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 24,
    borderRadius: 24,
    elevation: 1,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  sectionTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  detailText: { fontSize: 15, lineHeight: 22 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20, paddingTop: 20, borderTopWidth: 1 },
  infoText: { fontSize: 15, fontWeight: '500' },
  reviewNote: { fontSize: 12, marginTop: 12, textAlign: 'center' },
  actionRowAlt: { padding: 20, paddingBottom: 40, alignItems: 'center' },
  altBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  altBtnText: { fontSize: 14, fontWeight: '600' },
  adminControls: { padding: 20, paddingBottom: 60 },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 18, borderRadius: 16, borderWidth: 1 }
});
