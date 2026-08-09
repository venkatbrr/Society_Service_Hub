import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { BaseCard } from '../../components/BaseCard';
import { FundsList } from '../../components/FundsList';
import { HeaderBackButton } from '../../components/HeaderBackButton';
import { Rupees } from '../../components/Rupees';
import { Verandah } from '../../constants/Colors';
import { VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { goBackSmart, replaceTracked } from '../../lib/navigation';
import { supabase } from '../../lib/supabase';

type FundsOverview = {
  active_funds_count: number;
  total_collected: number;
  total_spent: number;
  total_available: number;
  funds_contributed_to: number;
  your_total_contributed: number;
};

export default function FundsHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { communityId, appRole, fundsEnabled } = useAuth();
  const [overview, setOverview] = useState<FundsOverview | null>(null);

  const canCreateFund = appRole === 'president' || appRole === 'vice_president' || appRole === 'admin';

  const loadOverview = useCallback(async () => {
    if (!communityId || !fundsEnabled) {
      setOverview(null);
      return;
    }

    try {
      const { data, error } = await supabase.rpc('get_my_community_funds_overview');
      if (error) throw error;
      setOverview(((data ?? [null])[0] ?? null) as FundsOverview | null);
    } catch (error) {
      console.error('Error loading fund overview:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to load fund health' });
    }
  }, [communityId, fundsEnabled]);

  useFocusEffect(
    useCallback(() => {
      loadOverview();
    }, [loadOverview])
  );

  if (!fundsEnabled) {
    return (
      <View style={styles.centerWrap}>
        <Text style={styles.emptyTitle}>Funds are not active in this community.</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => replaceTracked(router, '/(tabs)/community')}>
          <Text style={styles.backButtonText}>Back to community</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: Math.max(20, insets.top + 8) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <HeaderBackButton onPress={() => goBackSmart(router, '/funds')} color={Verandah.primary} style={styles.iconButton} />
          <Text style={styles.headerTitle}>Community funds</Text>
          <View style={{ width: 36 }} />
        </View>

        {overview ? (
          <BaseCard padding={12} style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>Fund health</Text>
            <View style={styles.moneyRow}>
              <Text style={styles.summaryLine}>Collected</Text>
              <Rupees amount={overview.total_collected ?? 0} size="sm" tone="in" />
            </View>
            <View style={styles.moneyRow}>
              <Text style={styles.summaryLine}>Spent</Text>
              <Rupees amount={overview.total_spent ?? 0} size="sm" />
            </View>
            <View style={styles.moneyRow}>
              <Text style={styles.summaryLine}>Available</Text>
              <Rupees amount={overview.total_available ?? 0} size="sm" />
            </View>
            {overview.funds_contributed_to > 0 ? (
              <Text style={styles.summaryStatus}>
                You have contributed to {overview.funds_contributed_to} of {overview.active_funds_count} active funds.
              </Text>
            ) : null}
          </BaseCard>
        ) : null}

        <View style={styles.eventsHeader}>
          <Text style={styles.sectionTitle}>Events and funds</Text>
          {canCreateFund ? (
            <TouchableOpacity style={styles.createButton} onPress={() => router.push('/funds/add')}>
              <Ionicons name="add" size={14} color={Verandah.primary} />
              <Text style={styles.createButtonText}>Create fund</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <FundsList />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Verandah.surface,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
  },
  centerWrap: {
    flex: 1,
    backgroundColor: Verandah.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    ...VerandahType.body,
    color: Verandah.textPrimary,
    textAlign: 'center',
  },
  backButton: {
    marginTop: 12,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Verandah.cardMuted,
  },
  backButtonText: {
    ...VerandahType.caption,
    color: Verandah.primary,
    fontWeight: '500',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
  },
  headerTitle: {
    ...VerandahType.title,
    color: Verandah.textPrimary,
  },
  summaryCard: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: Verandah.textPrimary,
    marginBottom: 10,
  },
  summaryLine: {
    ...VerandahType.body,
    color: Verandah.textPrimary,
  },
  summaryStatus: {
    marginTop: 10,
    ...VerandahType.caption,
    color: Verandah.textSecondary,
  },
  moneyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  eventsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  createButton: {
    borderWidth: 1,
    borderRadius: 999,
    borderColor: Verandah.borderStrong,
    backgroundColor: Verandah.card,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  createButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: Verandah.primary,
  },
});
