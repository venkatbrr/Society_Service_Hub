import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Switch, Image, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/Colors';
import { OfferingCard } from '../../components/OfferingCard';
import { RatingStars } from '../../components/RatingStars';
import { BusinessWithInteraction } from '../../lib/database.types';
import Toast from 'react-native-toast-message';

export default function BusinessManageScreen() {
  const { user, communityId } = useAuth();
  const router = useRouter();
  const colors = Colors.light;

  const [business, setBusiness] = useState<BusinessWithInteraction | null>(null);
  const [offerings, setOfferings] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user?.id || !communityId) return;

    try {
      // 1. Fetch User's Business
      const { data: bizData, error: bizError } = await supabase
        .from('resident_businesses')
        .select('*')
        .eq('owner_id', user.id)
        .eq('community_id', communityId)
        .maybeSingle();

      if (bizError) throw bizError;

      if (!bizData) {
        router.replace('/business/add');
        return;
      }

      // 2. Fetch Offerings
      const { data: offData } = await supabase
        .from('business_offerings')
        .select('*')
        .eq('business_id', bizData.id)
        .order('sort_order', { ascending: true });

      // 3. Fetch Aggregate Stats from RPC
      const { data: statsData } = await supabase.rpc('get_community_businesses', {
        p_community_id: communityId
      });
      
      const stats = (statsData as any[])?.find(s => s.id === bizData.id);

      // 4. Fetch Recent Reviews
      const { data: reviewsData } = await supabase
        .from('ratings')
        .select(`
          id,
          rating,
          created_at,
          profiles:user_id (full_name, flat_number)
        `)
        .eq('business_id', bizData.id)
        .order('created_at', { ascending: false })
        .limit(5);

      setBusiness({
        ...bizData,
        avg_rating: stats?.avg_rating || 0,
        rating_count: stats?.rating_count || 0,
        inquiry_count: stats?.inquiry_count || 0,
      });

      setOfferings(offData || []);
      setReviews(reviewsData || []);

    } catch (error: any) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to load business data' });
    } finally {
      setLoading(false);
    }
  }, [user?.id, communityId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleAcceptingOrders = async () => {
    if (!business || isUpdatingStatus) return;

    const newValue = !business.is_accepting_orders;
    
    // Optimistic UI
    setBusiness({ ...business, is_accepting_orders: newValue });
    setIsUpdatingStatus(true);

    try {
      const { error } = await supabase
        .from('resident_businesses')
        .update({ is_accepting_orders: newValue })
        .eq('id', business.id);

      if (error) throw error;
      
      Toast.show({ 
        type: 'success', 
        text1: newValue ? 'Business is now OPEN' : 'Business is now CLOSED',
        text2: newValue ? 'Your neighbors can now place orders' : 'You will not receive new inquiries'
      });
    } catch (err: any) {
      // Revert
      setBusiness({ ...business, is_accepting_orders: !newValue });
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to update status' });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleDeleteOffering = (offeringId: string) => {
    Alert.alert(
      "Delete Offering",
      "Are you sure you want to remove this item from your catalog?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive", 
          onPress: async () => {
            try {
              const { error } = await supabase.from('business_offerings').delete().eq('id', offeringId);
              if (error) throw error;
              setOfferings(prev => prev.filter(o => o.id !== offeringId));
              Toast.show({ type: 'success', text1: 'Item deleted' });
            } catch (err: any) {
              Toast.show({ type: 'error', text1: 'Delete failed', text2: err.message });
            }
          }
        }
      ]
    );
  };

  if (loading || !business) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Manage Business</Text>
        </View>

        {/* Business Overview Card */}
        <View style={[styles.businessCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.bizHeader}>
            <View style={styles.bizImage}>
              {business.cover_photo_url ? (
                <Image source={{ uri: business.cover_photo_url }} style={styles.image} />
              ) : (
                <Ionicons name="storefront-outline" size={32} color={colors.primary} />
              )}
            </View>
            <View style={styles.bizInfo}>
              <Text style={[styles.bizName, { color: colors.text }]}>{business.name}</Text>
              <Text style={[styles.bizCategory, { color: colors.textMuted }]}>{business.category}</Text>
            </View>
            <TouchableOpacity onPress={() => router.push(`/business/add`)}> 
              <Text style={{ color: colors.primary, fontWeight: '700' }}>Edit</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.statusRow, { borderTopColor: colors.border }]}>
            <View>
              <Text style={[styles.statusLabel, { color: colors.text }]}>Accepting Orders</Text>
              <Text style={[styles.statusSub, { color: colors.textMuted }]}>
                {business.is_accepting_orders ? 'Open for business' : 'Closed for now'}
              </Text>
            </View>
            <Switch
              value={business.is_accepting_orders}
              onValueChange={toggleAcceptingOrders}
              trackColor={{ false: '#767577', true: colors.primary + '80' }}
              thumbColor={business.is_accepting_orders ? colors.primary : '#f4f3f4'}
              disabled={isUpdatingStatus}
            />
          </View>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
            <Text style={[styles.statNum, { color: colors.text }]}>{business.inquiry_count}</Text>
            <Text style={[styles.statLabelText, { color: colors.textMuted }]}>Inquiries</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
            <Text style={[styles.statNum, { color: colors.text }]}>{Number(business.avg_rating).toFixed(1)}</Text>
            <Text style={[styles.statLabelText, { color: colors.textMuted }]}>Rating ({business.rating_count})</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
            <Text style={[styles.statNum, { color: colors.text }]}>{offerings.length}</Text>
            <Text style={[styles.statLabelText, { color: colors.textMuted }]}>Products</Text>
          </View>
        </View>

        {/* Offerings Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Your Offerings</Text>
            <TouchableOpacity 
              style={[styles.addButton, { backgroundColor: colors.primary + '15' }]}
              onPress={() => router.push(`/business/add-offering?businessId=${business.id}`)}
            >
              <Ionicons name="add" size={20} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: '700' }}>Add New</Text>
            </TouchableOpacity>
          </View>

          {offerings.length > 0 ? (
            offerings.map(off => (
              <View key={off.id} style={styles.offeringWrapper}>
                <OfferingCard 
                  id={off.id}
                  name={off.name}
                  price={off.price}
                  priceUnit={off.price_unit}
                  photoUrl={off.photo_url}
                  availability={off.availability}
                  isAvailable={off.is_available}
                />
                <View style={styles.offeringActions}>
                  <TouchableOpacity 
                    style={[styles.actionBtn, { backgroundColor: colors.surface2 }]}
                    onPress={() => router.push(`/business/add-offering?businessId=${business.id}&offeringId=${off.id}`)}
                  >
                    <Ionicons name="create-outline" size={18} color={colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.actionBtn, { backgroundColor: '#EF444415' }]}
                    onPress={() => handleDeleteOffering(off.id)}
                  >
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          ) : (
            <View style={[styles.emptyState, { backgroundColor: colors.surface2 }]}>
              <Ionicons name="cart-outline" size={32} color={colors.textMuted} />
              <Text style={[styles.emptyStateText, { color: colors.textMuted }]}>No products in your catalog</Text>
            </View>
          )}
        </View>

        {/* Recent Reviews */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 16 }]}>Recent Reviews</Text>
          {reviews.length > 0 ? (
            reviews.map(rev => (
              <View key={rev.id} style={[styles.reviewRow, { borderBottomColor: colors.border }]}>
                <View style={styles.reviewMain}>
                   <Text style={[styles.reviewer, { color: colors.text }]}>
                     {rev.profiles?.full_name} {rev.profiles?.flat_number ? `(${rev.profiles.flat_number})` : ''}
                   </Text>
                   <RatingStars rating={rev.rating} size={10} isLightMode={true} readonly={true} />
                </View>
                <Text style={[styles.reviewDate, { color: colors.textMuted }]}>
                  {new Date(rev.created_at).toLocaleDateString()}
                </Text>
              </View>
            ))
          ) : (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No reviews yet.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 24, paddingTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 32 },
  backButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800' },
  businessCard: { padding: 20, borderRadius: 24, borderWidth: 1, marginBottom: 24 },
  bizHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  bizImage: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  bizInfo: { flex: 1, marginLeft: 16 },
  bizName: { fontSize: 18, fontWeight: '700' },
  bizCategory: { fontSize: 13, fontWeight: '500' },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 20, borderTopWidth: 1 },
  statusLabel: { fontSize: 15, fontWeight: '700' },
  statusSub: { fontSize: 12, marginTop: 2 },
  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 32 },
  statBox: { flex: 1, padding: 16, borderRadius: 20, alignItems: 'center' },
  statNum: { fontSize: 18, fontWeight: '800' },
  statLabelText: { fontSize: 11, fontWeight: '600', marginTop: 4, textAlign: 'center' },
  section: { marginBottom: 32 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  offeringWrapper: { marginBottom: 16 },
  offeringActions: { flexDirection: 'row', position: 'absolute', right: 8, bottom: 8, gap: 8 },
  actionBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  emptyState: { padding: 40, borderRadius: 24, alignItems: 'center', gap: 12 },
  emptyStateText: { fontSize: 14, fontWeight: '600' },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1 },
  reviewMain: { gap: 4 },
  reviewer: { fontSize: 14, fontWeight: '600' },
  reviewDate: { fontSize: 12 },
  emptyText: { fontSize: 14, fontStyle: 'italic' },
});
