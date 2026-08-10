import { CheckVerified01 } from '@untitledui/icons/CheckVerified01';
import { Plus } from '@untitledui/icons/Plus';
import { Tool01 } from '@untitledui/icons/Tool01';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';
import { useAuth } from '../context/AuthContext';
import {
    getServiceCategoryIcon,
    mapServiceCategoryToProviderCategory,
    ServiceCategory,
} from '../lib/serviceCategories';
import { supabase } from '../lib/supabase';
import { UrgencyBadge } from './UrgencyBadge';

interface UpcomingService {
  id: string;
  service_name: string;
  category: string;
  days_until_due: number;
  next_due_on: string;
}

export function UpcomingServicesCard() {
  const router = useRouter();
  const { user } = useAuth();

  const [state, setState] = useState<'loading' | 'zero' | 'all-on-track' | 'has-due'>('loading');
  const [urgentServices, setUrgentServices] = useState<UpcomingService[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  const loadData = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase.rpc('get_my_upcoming_services');
      if (error) throw error;

      const all = (data ?? []) as UpcomingService[];
      setTotalCount(all.length);

      if (all.length === 0) {
        setState('zero');
        return;
      }

      // Due within 30 days
      const dueSoon = all.filter((s) => s.days_until_due <= 30);
      if (dueSoon.length === 0) {
        setState('all-on-track');
      } else {
        setUrgentServices(dueSoon.slice(0, 2));
        setState('has-due');
      }
    } catch {
      // Non-critical; silently fail
      setState('zero');
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  if (state === 'loading') return null;

  // State: zero services
  if (state === 'zero') {
    return (
      <View style={styles.promoCard}>
        <View style={styles.zeroRow}>
          <View style={styles.promoIconBox}>
            <Tool01 size={16} color={Verandah.gold} aria-hidden={true} />
          </View>
          <View style={styles.zeroContent}>
            <Text style={styles.promoTitle} numberOfLines={1}>Never miss maintenance</Text>
            <Text style={styles.promoBody} numberOfLines={1}>
              Track AC, RO &amp; other services
            </Text>
          </View>
          <TouchableOpacity
            style={styles.promoCta}
            onPress={() => router.push('/services/add')}
            activeOpacity={0.85}
          >
            <Text style={styles.promoCtaText}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // State: all-on-track
  if (state === 'all-on-track') {
    return (
      <View style={styles.card}>
        <View style={styles.trackRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <CheckVerified01 size={14} color={Verandah.accent} aria-hidden={true} />
            <Text style={styles.trackText}>All services on track</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/services' as any)} activeOpacity={0.8}>
            <Text style={styles.viewAll}>View all ({totalCount})</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // State: has-due — show up to 2 urgent services
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Upcoming services</Text>
      </View>

      {urgentServices.map((s) => {
        const CategoryIcon = getServiceCategoryIcon(s.category);
        return (
          <View key={s.id} style={styles.serviceRow}>
            <View style={styles.iconBox}>
              <CategoryIcon size={14} color={Verandah.accent} aria-hidden={true} />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowName} numberOfLines={1}>
                {s.service_name}
              </Text>
              <UrgencyBadge daysUntilDue={s.days_until_due} />
            </View>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/',
                  params: {
                    segment: 'providers',
                    filterCategory: mapServiceCategoryToProviderCategory(
                      s.category as ServiceCategory
                    ),
                  },
                } as any)
              }
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text style={styles.findTech}>Find tech</Text>
            </TouchableOpacity>
          </View>
        );
      })}

      <View style={styles.cardFooter}>
        <TouchableOpacity onPress={() => router.push('/services/add')} activeOpacity={0.8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Plus size={12} color={Verandah.accent} aria-hidden={true} />
          <Text style={styles.footerLink}>Add service</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/services' as any)} activeOpacity={0.8}>
          <Text style={styles.footerLinkMuted}>View all ({totalCount})</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: VerandahRadius.card,
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
    backgroundColor: Verandah.card,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    ...Verandah.shadowCard,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Verandah.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Zero state — dark teal promo
  promoCard: {
    borderRadius: VerandahRadius.card,
    backgroundColor: Verandah.teal900,
    marginBottom: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    ...Verandah.shadowRaised,
  },
  promoIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(221, 169, 74, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoTitle: { fontSize: 13.5, fontWeight: '700', color: Verandah.cream, fontFamily: VerandahType.sansFamily },
  promoBody: { fontSize: 11.5, color: 'rgba(240, 237, 227, 0.68)', marginTop: 2, fontFamily: VerandahType.sansFamily },
  promoCta: { borderRadius: VerandahRadius.pill, paddingVertical: 7, paddingHorizontal: 16, backgroundColor: Verandah.gold },
  promoCtaText: { fontSize: 12.5, fontWeight: '700', color: Verandah.teal900, fontFamily: VerandahType.sansFamily },
  zeroRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  zeroContent: { flex: 1 },
  zeroTitle: { fontSize: 13, fontWeight: '500', color: Verandah.textPrimary, fontFamily: VerandahType.sansFamily },
  zeroBody: { fontSize: 11, color: Verandah.textSecondary, marginTop: 1, fontFamily: VerandahType.sansFamily },
  zeroCtaCompact: { borderRadius: VerandahRadius.button, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: Verandah.primary },
  zeroCtaTextCompact: { fontSize: 12, fontWeight: '600', color: Verandah.primaryFg, fontFamily: VerandahType.sansFamily },
  // All on track
  trackRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  trackText: { fontSize: 13, fontWeight: '500', color: Verandah.accent, fontFamily: VerandahType.sansFamily },
  viewAll: { fontSize: 12, fontWeight: '500', color: Verandah.accent, fontFamily: VerandahType.sansFamily },
  // Has-due
  cardHeader: { marginBottom: 6 },
  cardTitle: { fontSize: 13, fontWeight: '600', color: Verandah.textPrimary, fontFamily: VerandahType.sansFamily },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 0.5,
    borderTopColor: Verandah.borderHair,
    gap: 8,
  },
  rowContent: { flex: 1, gap: 2 },
  rowName: { fontSize: 13, fontWeight: '500', color: Verandah.textPrimary, fontFamily: VerandahType.sansFamily },
  findTech: { fontSize: 12, fontWeight: '500', color: Verandah.accent, fontFamily: VerandahType.sansFamily },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: Verandah.borderHair,
  },
  footerLink: { fontSize: 12, fontWeight: '600', color: Verandah.accent, fontFamily: VerandahType.sansFamily },
  footerLinkMuted: { fontSize: 12, fontWeight: '500', color: Verandah.textTertiary, fontFamily: VerandahType.sansFamily },
});
