import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';
import { useAuth } from '../context/AuthContext';
import {
    SERVICE_CATEGORY_EMOJI,
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

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (state === 'loading') return null;

  // State: zero services
  if (state === 'zero') {
    return (
      <View style={styles.card}>
        <View style={styles.zeroRow}>
          <Text style={styles.zeroEmoji}>🔧</Text>
          <View style={styles.zeroContent}>
            <Text style={styles.zeroTitle} numberOfLines={1}>Never miss maintenance</Text>
            <Text style={styles.zeroBody} numberOfLines={1}>
              Track AC, RO and other services
            </Text>
          </View>
          <TouchableOpacity
            style={styles.zeroCtaCompact}
            onPress={() => router.push('/services/add')}
            activeOpacity={0.85}
          >
            <Text style={styles.zeroCtaTextCompact}>Add service</Text>
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
          <Text style={styles.trackText}>✓ All services on track</Text>
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
        const emoji = SERVICE_CATEGORY_EMOJI[s.category as ServiceCategory] ?? '🔧';
        return (
          <View key={s.id} style={styles.serviceRow}>
            <Text style={styles.rowEmoji}>{emoji}</Text>
            <View style={styles.rowContent}>
              <Text style={styles.rowName} numberOfLines={1}>
                {s.service_name}
              </Text>
              <UrgencyBadge daysUntilDue={s.days_until_due} />
            </View>
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/services/[id]', params: { id: s.id } })}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text style={styles.findTech}>Find tech</Text>
            </TouchableOpacity>
          </View>
        );
      })}

      <View style={styles.cardFooter}>
        <TouchableOpacity onPress={() => router.push('/services/add')} activeOpacity={0.8}>
          <Text style={styles.footerLink}>+ Add service</Text>
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
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
    borderColor: Verandah.borderStrong,
    backgroundColor: Verandah.card,
    marginBottom: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  // Zero state
  zeroRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  zeroEmoji: { fontSize: 18 },
  zeroContent: { flex: 1 },
  zeroTitle: { fontSize: 13, fontWeight: '500', color: Verandah.textPrimary },
  zeroBody: { fontSize: 11, color: Verandah.textSecondary, marginTop: 1 },
  zeroCtaCompact: { borderRadius: VerandahRadius.sm, paddingVertical: 5, paddingHorizontal: 10, backgroundColor: Verandah.primary },
  zeroCtaTextCompact: { fontSize: 12, fontWeight: '500', color: Verandah.primaryFg },
  // All on track
  trackRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  trackText: { fontSize: 13, fontWeight: '500', color: Verandah.accent },
  viewAll: { fontSize: 12, fontWeight: '500', color: Verandah.accent },
  // Has-due
  cardHeader: { marginBottom: 4 },
  cardTitle: { fontSize: 13, fontWeight: '500', color: Verandah.textPrimary },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 0.5,
    borderTopColor: Verandah.border,
    gap: 8,
  },
  rowEmoji: { fontSize: 18 },
  rowContent: { flex: 1, gap: 2 },
  rowName: { fontSize: 13, fontWeight: '500', color: Verandah.textPrimary },
  findTech: { fontSize: 12, fontWeight: '500', color: Verandah.accent },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: Verandah.border,
  },
  footerLink: { fontSize: 12, fontWeight: '500', color: Verandah.accent },
  footerLinkMuted: { fontSize: 12, fontWeight: '500', color: Verandah.textTertiary },
});
