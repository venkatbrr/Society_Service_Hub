import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, FlatList } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../context/AuthContext';
import { Colors } from '../../../constants/Colors';
import { OfferingCard } from '../../../components/OfferingCard';
import Toast from 'react-native-toast-message';

export default function BusinessCatalogScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const colors = Colors.light;

  const [offerings, setOfferings] = useState<any[]>([]);
  const [businessName, setBusinessName] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [categories, setCategories] = useState(['All']);
  const [ownerId, setOwnerId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    
    try {
      // 1. Fetch Business Info
      const { data: bizData } = await supabase
        .from('resident_businesses')
        .select('name, owner_id')
        .eq('id', id)
        .single();
      
      if (bizData) {
        setBusinessName(bizData.name);
        setOwnerId(bizData.owner_id);
      }

      // 2. Fetch All Offerings
      const { data: offData, error: offError } = await supabase
        .from('business_offerings')
        .select('*')
        .eq('business_id', id)
        .order('sort_order', { ascending: true });

      if (offError) throw offError;

      const items = offData || [];
      setOfferings(items);

      // 3. Extract Categories
      const cats = Array.from(new Set((items as any[]).map(i => i.category).filter(Boolean))) as string[];
      setCategories(['All', ...cats]);

    } catch (error: any) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to load catalog' });
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredOfferings = selectedCategory === 'All' 
    ? offerings 
    : offerings.filter(o => o.category === selectedCategory);

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isOwner = user?.id === ownerId;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{businessName}</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Full Catalog ({offerings.length} items)</Text>
        </View>
      </View>

      {categories.length > 2 && (
        <View style={styles.filterWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
            {categories.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.catChip,
                  selectedCategory === cat ? { backgroundColor: colors.primary } : { backgroundColor: colors.surface2 }
                ]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text style={[styles.catText, { color: selectedCategory === cat ? 'white' : colors.text }]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <FlatList
        data={filteredOfferings}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <OfferingCard 
            id={item.id}
            name={item.name}
            description={item.description}
            price={item.price}
            priceUnit={item.price_unit}
            photoUrl={item.photo_url}
            availability={item.availability}
            isAvailable={item.is_available}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="search-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No items found in this category.</Text>
          </View>
        }
      />

      {isOwner && (
        <TouchableOpacity 
          style={[styles.fab, { backgroundColor: colors.primary }]}
          onPress={() => router.push(`/business/add-offering?businessId=${id}`)}
        >
          <Ionicons name="add" size={32} color="#FFF" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 60, paddingBottom: 20, gap: 16 },
  backButton: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  headerTitleContainer: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 13, fontWeight: '500' },
  filterWrapper: { marginBottom: 12 },
  filterContent: { paddingHorizontal: 24, gap: 8 },
  catChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  catText: { fontSize: 13, fontWeight: '600' },
  listContent: { padding: 24, paddingBottom: 100 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100, gap: 16 },
  emptyText: { fontSize: 16, fontWeight: '500' },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
});
