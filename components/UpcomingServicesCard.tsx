import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/Colors';
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
  const colors = Colors.light;

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
      <View style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
        <View style={styles.zeroRow}>
          <Text style={styles.zeroEmoji}>🔧</Text>
          <View style={styles.zeroContent}>
            <Text style={[styles.zeroTitle, { color: colors.text }]}>Never miss maintenance</Text>
            <Text style={[styles.zeroBody, { color: colors.textMuted }]}>
              Track your AC, RO and other services
            </Text>
          </View>
          <TouchableOpacity onPress={handleDismiss} style={styles.dismissBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ color: colors.textMuted, fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.zeroCta, { backgroundColor: colors.primary }]}
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
      <View style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
        <View style={styles.trackRow}>
          <Text style={[styles.trackText, { color: colors.secondary }]}>✓ All services on track</Text>
          <TouchableOpacity onPress={() => router.push('/services' as any)} activeOpacity={0.8}>
            <Text style={[styles.viewAll, { color: colors.primary }]}>View all ({totalCount})</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // State: has-due — show up to 2 urgent services
  return (
    <View style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>🔔 Upcoming Services</Text>
      </View>

      {urgentServices.map((s) => {
        const emoji = SERVICE_CATEGORY_EMOJI[s.category as ServiceCategory] ?? '🔧';
        return (
          <View key={s.id} style={[styles.serviceRow, { borderColor: colors.border }]}>
            <Text style={styles.rowEmoji}>{emoji}</Text>
            <View style={styles.rowContent}>
              <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                {s.service_name}
              </Text>
              <UrgencyBadge daysUntilDue={s.days_until_due} />
            </View>
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/services/[id]', params: { id: s.id } })}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text style={[styles.findTech, { color: colors.primary }]}>Find tech</Text>
            </TouchableOpacity>
          </View>
        );
      })}

      <View style={styles.cardFooter}>
        <TouchableOpacity onPress={() => router.push('/services/add')} activeOpacity={0.8}>
          <Text style={[styles.footerLink, { color: colors.primary }]}>+ Add service</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/services' as any)} activeOpacity={0.8}>
          <Text style={[styles.footerLink, { color: colors.textMuted }]}>View all ({totalCount})</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 10,
    padding: 16,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 0,
  },
  // Zero state
  zeroRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  zeroEmoji: { fontSize: 28 },
  zeroContent: { flex: 1 },
  zeroTitle: { fontSize: 14, fontWeight: '700' },
  zeroBody: { fontSize: 12, marginTop: 2 },
  dismissBtn: { padding: 2 },
  zeroCta: { borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  zeroCtaText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  // All on track
  trackRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  trackText: { fontSize: 14, fontWeight: '700' },
  viewAll: { fontSize: 13, fontWeight: '600' },
  // Has-due
  cardHeader: { marginBottom: 10 },
  cardTitle: { fontSize: 14, fontWeight: '800' },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  rowEmoji: { fontSize: 20 },
  rowContent: { flex: 1, gap: 4 },
  rowName: { fontSize: 13, fontWeight: '700' },
  findTech: { fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: 'rgba(108,99,255,0.1)',
  },
  footerLink: { fontSize: 13, fontWeight: '600' },
});
