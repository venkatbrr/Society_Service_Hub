import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { FundCard } from '../../components/FundCard';
import { Colors } from '../../constants/Colors';
import { APP_EMOJIS } from '../../constants/emojis';
import { useAuth } from '../../context/AuthContext';
import { Tables } from '../../lib/database.types';
import { FundAccessRole, getEffectiveFundRole } from '../../lib/fundRoles';
import { supabase } from '../../lib/supabase';
import { getMissingFundSchemaMessage, isMissingFundSchemaError } from '../../lib/supabaseErrors';

type FundWithTotals = Tables<'events'> & {
  totals: {
    income: number;
    expense: number;
    balance: number;
  };
  currentRole: FundAccessRole;
  treasurerNames: string[];
  collectorCount: number;
};

export default function FundsScreen() {
  const [funds, setFunds] = useState<FundWithTotals[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const { user, communityId, appRole } = useAuth();
  const colors = Colors.light;
  const isAdmin = appRole === 'community_admin';
  const hasShownSchemaToastRef = useRef(false);

  const fetchFunds = useCallback(async () => {
    if (!communityId) {
      setFunds([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setLoading(true);

      // Fetch everything for these community funds in parallel
      // We use Supabase resource embedding to get transactions and roles in one go
      const [fundsResult, profilesResult] = await Promise.all([
        supabase.from('events')
          .select('*, event_transactions(amount, type), fund_roles(*)')
          .eq('community_id', communityId)
          .order('created_at', { ascending: false }),
        supabase.from('profiles')
          .select('id, full_name')
          .eq('community_id', communityId)
      ]);

      if (fundsResult.error) {
        if (isMissingFundSchemaError(fundsResult.error)) {
          setFunds([]);
          if (!hasShownSchemaToastRef.current) {
            hasShownSchemaToastRef.current = true;
            Toast.show({ type: 'error', text1: 'Funds unavailable', text2: getMissingFundSchemaMessage() });
          }
          return;
        }
        throw fundsResult.error;
      }

      if (profilesResult.error) throw profilesResult.error;

      const profileNames = new Map(
        (profilesResult.data ?? []).map((profile) => [profile.id, profile.full_name?.trim() || 'Resident'])
      );

      const nextFunds = (fundsResult.data ?? []).map((fund: any) => {
        const fundTransactions = fund.event_transactions || [];
        const fundRoles = fund.fund_roles || [];

        const income = fundTransactions
          .filter((transaction: any) => transaction.type === 'income')
          .reduce((sum: number, transaction: any) => sum + Number(transaction.amount), 0);

        const expense = fundTransactions
          .filter((transaction: any) => transaction.type === 'expense')
          .reduce((sum: number, transaction: any) => sum + Number(transaction.amount), 0);

        return {
          ...fund,
          totals: {
            income,
            expense,
            balance: income - expense,
          },
          currentRole: getEffectiveFundRole(appRole, fundRoles, user?.id),
          treasurerNames: fundRoles
            .filter((assignment: any) => assignment.role === 'treasurer')
            .map((assignment: any) => profileNames.get(assignment.user_id) ?? 'Resident'),
          collectorCount: fundRoles.filter((assignment: any) => assignment.role === 'collector').length,
        };
      });

      setFunds(nextFunds);
      hasShownSchemaToastRef.current = false;
    } catch (error) {
      console.error('Error fetching funds:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to load funds' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [appRole, communityId, user?.id]);

  useFocusEffect(
    useCallback(() => {
      fetchFunds();
    }, [fetchFunds])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchFunds();
  };

  const communityTotals = funds.reduce(
    (acc, fund) => {
      acc.income += fund.totals.income;
      acc.expense += fund.totals.expense;
      acc.balance += fund.totals.balance;
      return acc;
    },
    { income: 0, expense: 0, balance: 0 }
  );

  if (loading && !refreshing) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.background, colors.surface2, colors.background]}
        locations={[0, 0.5, 1]}
        style={styles.headerGradient}
      >
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: colors.textMuted }]}>Community Transparency</Text>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Society Funds</Text>
            <Text style={[styles.headerHint, { color: colors.textMuted }]}>
              {isAdmin ? 'You can create funds and assign treasurers.' : 'Only the admin can create new funds.'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.profileButton, { backgroundColor: colors.glass, borderColor: colors.glassBorder, borderWidth: 1 }]}
            onPress={() => router.push('/(tabs)/profile')}
          >
            <Text style={styles.profileIcon}>{APP_EMOJIS.profile}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <FlatList
        data={funds}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <FundCard
            fund={item}
            totals={item.totals}
            currentRole={item.currentRole}
            treasurerNames={item.treasurerNames}
            collectorCount={item.collectorCount}
            onPress={() => router.push(`/funds/${item.id}`)}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={5}
        initialNumToRender={8}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={
          funds.length > 0 ? (
            <View style={styles.summaryCardWrapper}>
              <LinearGradient
                colors={[colors.gradientStart, colors.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.summaryCard}
              >
                <View style={styles.summaryHeader}>
                  <Text style={styles.summaryTitle}>Fund Snapshot</Text>
                  <Text style={styles.summaryIcon}>{APP_EMOJIS.admin}</Text>
                </View>
                <View style={styles.summaryGrid}>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Total Collected</Text>
                    <Text style={styles.summaryValue}>
                      Rs {communityTotals.income.toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Total Spent</Text>
                    <Text style={styles.summaryValue}>
                      Rs {communityTotals.expense.toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Current Balance</Text>
                    <Text style={[styles.summaryValue, { fontSize: 22 }]}>
                      Rs {communityTotals.balance.toLocaleString()}
                    </Text>
                  </View>
                </View>
              </LinearGradient>
            </View>
          ) : (
            <View style={[styles.noticeCard, { backgroundColor: colors.glass, borderColor: colors.glassBorder, borderWidth: 1 }]}>
              <Text style={styles.noticeIcon}>{APP_EMOJIS.info}</Text>
              <Text style={[styles.noticeText, { color: colors.textMuted }]}>
                {isAdmin
                  ? 'Create the first fund to start transparent role-based tracking.'
                  : 'You can view funds here once the admin creates the first one.'}
              </Text>
            </View>
          )
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIconWrapper, { backgroundColor: colors.glass, borderColor: colors.glassBorder, borderWidth: 1 }]}>
              <Text style={styles.emptyIcon}>{APP_EMOJIS.wallet}</Text>
            </View>
            <Text style={[styles.emptyText, { color: colors.text }]}>No funds created</Text>
            <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
              {isAdmin
                ? 'Create your first fund and assign 1 or 2 treasurers to keep everything transparent.'
                : 'Once the admin creates a fund, you will be able to review every contribution and expense here.'}
            </Text>
          </View>
        }
      />

      {isAdmin ? (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push('/funds/add')}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fabGradient}
          >
            <Text style={styles.fabIcon}>{APP_EMOJIS.add}</Text>
          </LinearGradient>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerGradient: {
    paddingHorizontal: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  greeting: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  headerHint: {
    marginTop: 6,
    maxWidth: 260,
    fontSize: 13,
    lineHeight: 18,
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileIcon: {
    fontSize: 20,
    lineHeight: 24,
  },
  summaryCardWrapper: {
    marginHorizontal: 4,
    marginBottom: 24,
    borderRadius: 32,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },
  summaryCard: {
    padding: 24,
    borderRadius: 32,
    overflow: 'hidden',
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.7)',
  },
  summaryIcon: {
    fontSize: 18,
    lineHeight: 20,
  },
  summaryGrid: {
    gap: 16,
  },
  summaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 4,
    marginBottom: 16,
    padding: 16,
    borderRadius: 20,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  noticeIcon: {
    fontSize: 18,
    lineHeight: 20,
  },
  listContent: {
    padding: 20,
    paddingBottom: 100,
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 32,
    width: 64,
    height: 64,
    borderRadius: 32,
    elevation: 8,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    zIndex: 10,
  },
  fabGradient: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabIcon: {
    fontSize: 32,
    lineHeight: 34,
    color: '#FFF',
  },
  emptyContainer: {
    marginTop: 80,
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyIcon: {
    fontSize: 40,
    lineHeight: 46,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
