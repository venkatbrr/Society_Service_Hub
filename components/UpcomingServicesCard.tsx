import AsyncStorage from '@react-native-async-storage/async-storage';
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

const DISMISS_KEY = 'serviceReminderHomePromptDismissed';

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
  const [dismissed, setDismissed] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;

    // Check dismissal first
    const dismissedValue = await AsyncStorage.getItem(`${DISMISS_KEY}:${user.id}`);
    if (dismissedValue === 'true') {
      setDismissed(true);
    }

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

  const handleDismiss = async () => {
    if (!user) return;
    await AsyncStorage.setItem(`${DISMISS_KEY}:${user.id}`, 'true');
    setDismissed(true);
  };

  // State: zero + dismissed → hide card entirely
  if (state === 'loading') return null;
  if (state === 'zero' && dismissed) return null;

  // State: zero services, not dismissed
  if (state === 'zero') {
    return (
      <View style={styles.card}>
        <View style={styles.zeroRow}>
          <Text style={styles.zeroEmoji}>🔧</Text>
          <View style={styles.zeroContent}>
            <Text style={styles.zeroTitle}>Never miss maintenance</Text>
            <Text style={styles.zeroBody}>
              Track your AC, RO and other services
            </Text>
          </View>
          <TouchableOpacity onPress={handleDismiss} style={styles.dismissBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.dismissText}>✕</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.zeroCta}
          onPress={() => router.push('/services/add')}
          activeOpacity={0.85}
        >
          <Text style={styles.zeroCtaText}>Add your first service</Text>
        </TouchableOpacity>
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
    borderRadius: VerandahRadius.lg,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    backgroundColor: Verandah.card,
    marginBottom: VerandahSpace.sm + 2,
    padding: VerandahSpace.md,
  },
  // Zero state
  zeroRow: { flexDirection: 'row', alignItems: 'center', gap: VerandahSpace.sm + 2, marginBottom: VerandahSpace.sm },
  zeroEmoji: { fontSize: 22 },
  zeroContent: { flex: 1 },
  zeroTitle: { ...VerandahType.bodyBold, color: Verandah.textPrimary },
  zeroBody: { ...VerandahType.caption, color: Verandah.textSecondary, marginTop: 2 },
  dismissBtn: { padding: 2 },
  dismissText: { color: Verandah.textMuted, fontSize: 16 },
  zeroCta: { borderRadius: VerandahRadius.md, paddingVertical: VerandahSpace.sm, alignItems: 'center', backgroundColor: Verandah.primary },
  zeroCtaText: { ...VerandahType.bodyBold, color: Verandah.primaryFg },
  // All on track
  trackRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  trackText: { ...VerandahType.bodyBold, color: Verandah.accent },
  viewAll: { ...VerandahType.caption, fontWeight: '500', color: Verandah.accent },
  // Has-due
  cardHeader: { marginBottom: VerandahSpace.sm + 2 },
  cardTitle: { ...VerandahType.bodyBold, color: Verandah.textPrimary },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: VerandahSpace.sm,
    borderTopWidth: 0.5,
    borderTopColor: Verandah.border,
    gap: VerandahSpace.sm,
  },
  rowEmoji: { fontSize: 20 },
  rowContent: { flex: 1, gap: VerandahSpace.xs },
  rowName: { ...VerandahType.bodyBold, color: Verandah.textPrimary },
  findTech: { ...VerandahType.caption, fontWeight: '500', color: Verandah.accent },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: VerandahSpace.sm + 2,
    paddingTop: VerandahSpace.sm + 2,
    borderTopWidth: 0.5,
    borderTopColor: Verandah.border,
  },
  footerLink: { ...VerandahType.caption, fontWeight: '500', color: Verandah.accent },
  footerLinkMuted: { ...VerandahType.caption, fontWeight: '500', color: Verandah.textTertiary },
});
