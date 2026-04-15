import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/Colors';
import { Tables } from '../../lib/database.types';
import { FundCard } from '../../components/FundCard';
import { useAuth } from '../../context/AuthContext';
import { FundAccessRole, getEffectiveFundRole } from '../../lib/fundRoles';
import Toast from 'react-native-toast-message';
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
  const isAdmin = appRole === 'admin';
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

      const [fundsResult, transactionsResult, rolesResult, profilesResult] = await Promise.all([
        supabase.from('events').select('*').eq('community_id', communityId).order('created_at', { ascending: false }),
        supabase.from('event_transactions').select('event_id, amount, type'),
        supabase.from('fund_roles').select('*'),
        supabase.from('profiles').select('id, full_name'),
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

      const transactions = isMissingFundSchemaError(transactionsResult.error) ? [] : (transactionsResult.data ?? []);
      const roles = isMissingFundSchemaError(rolesResult.error) ? [] : (rolesResult.data ?? []);

      if ((transactionsResult.error || rolesResult.error) && !hasShownSchemaToastRef.current) {
        hasShownSchemaToastRef.current = true;
        Toast.show({ type: 'error', text1: 'Funds partially loaded', text2: getMissingFundSchemaMessage() });
      }

      if (transactionsResult.error && !isMissingFundSchemaError(transactionsResult.error)) {
        throw transactionsResult.error;
      }

      if (rolesResult.error && !isMissingFundSchemaError(rolesResult.error)) {
        throw rolesResult.error;
      }

      if (profilesResult.error) throw profilesResult.error;

      const profileNames = new Map(
        (profilesResult.data ?? []).map((profile) => [profile.id, profile.full_name?.trim() || 'Resident'])
      );

      const nextFunds = (fundsResult.data ?? []).map((fund) => {
        const fundTransactions = transactions.filter((transaction) => transaction.event_id === fund.id);
        const fundRoles = roles.filter((assignment) => assignment.event_id === fund.id);
        const income = fundTransactions
          .filter((transaction) => transaction.type === 'income')
          .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
        const expense = fundTransactions
          .filter((transaction) => transaction.type === 'expense')
          .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

        return {
          ...fund,
          totals: {
            income,
            expense,
            balance: income - expense,
          },
          currentRole: getEffectiveFundRole(appRole, fundRoles, user?.id),
          treasurerNames: fundRoles
            .filter((assignment) => assignment.role === 'treasurer')
            .map((assignment) => profileNames.get(assignment.user_id) ?? 'Resident'),
          collectorCount: fundRoles.filter((assignment) => assignment.role === 'collector').length,
        };
      });

      setFunds(nextFunds);
      if (!transactionsResult.error && !rolesResult.error) {
        hasShownSchemaToastRef.current = false;
      }
    } catch (error) {
      console.error('Error fetching funds:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to load funds' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [appRole, communityId, user?.id]);

  useEffect(() => {
    fetchFunds();
  }, [fetchFunds]);

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
      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: colors.textMuted }]}>Community Transparency</Text>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Society Funds</Text>
          <Text style={[styles.headerHint, { color: colors.textMuted }]}>
            {isAdmin ? 'You can create funds and assign treasurers.' : 'Only the admin can create new funds.'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.profileButton, { backgroundColor: colors.surface2 }]}
          onPress={() => router.push('/(tabs)/profile')}
        >
          <Ionicons name="person" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={
          funds.length > 0 ? (
            <View style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <Text style={styles.summaryTitle}>Fund Snapshot</Text>
                <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
              </View>
              <View style={styles.summaryGrid}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Total Collected</Text>
                  <Text style={[styles.summaryValue, { color: '#10B981' }]}>
                    Rs {communityTotals.income.toLocaleString()}
                  </Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Total Spent</Text>
                  <Text style={[styles.summaryValue, { color: '#F43F5E' }]}>
                    Rs {communityTotals.expense.toLocaleString()}
                  </Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Current Balance</Text>
                  <Text style={[styles.summaryValue, { color: colors.primary }]}>
                    Rs {communityTotals.balance.toLocaleString()}
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={[styles.noticeCard, { backgroundColor: colors.surface }]}>
              <Ionicons name="information-circle" size={18} color={colors.primary} />
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
            <View style={[styles.emptyIconWrapper, { backgroundColor: colors.surface2 }]}>
              <Ionicons name="wallet" size={40} color={colors.icon} />
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
          style={[styles.fab, { backgroundColor: colors.primary }]}
          onPress={() => router.push('/funds/add')}
          activeOpacity={0.9}
        >
          <Ionicons name="add" size={32} color="#FFF" />
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
  summaryCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 4,
    marginBottom: 24,
    padding: 24,
    borderRadius: 32,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
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
    color: '#718096',
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
    color: '#718096',
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '800',
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
  listContent: {
    padding: 20,
    paddingBottom: 100,
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
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
