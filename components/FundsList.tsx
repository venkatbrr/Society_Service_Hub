import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Colors } from '../constants/Colors';
import { APP_EMOJIS } from '../constants/emojis';
import { useAuth } from '../context/AuthContext';
import { Tables } from '../lib/database.types';
import { FundAccessRole, getEffectiveFundRole } from '../lib/fundRoles';
import { supabase } from '../lib/supabase';
import { getMissingFundSchemaMessage, isMissingFundSchemaError } from '../lib/supabaseErrors';
import { BaseCard } from './BaseCard';
import { FundCard } from './FundCard';

export type FundWithTotals = Tables<'events'> & {
  totals: {
    income: number;
    expense: number;
    balance: number;
  };
  currentRole: FundAccessRole;
  treasurerNames: string[];
  collectorCount: number;
};

export function FundsList() {
  const [funds, setFunds] = useState<FundWithTotals[]>([]);
  const [loading, setLoading] = useState(true);
  const hasShownSchemaToastRef = useRef(false);

  const router = useRouter();
  const { user, communityId, appRole } = useAuth();
  const colors = Colors.light;
  const canCreate = appRole === 'community_admin' || appRole === 'admin';

  const fetchFunds = useCallback(async () => {
    if (!communityId) {
      setFunds([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [fundsResult, profilesResult] = await Promise.all([
        supabase
          .from('events')
          .select('*, event_transactions(amount, type), fund_roles(*)')
          .eq('community_id', communityId)
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('id, full_name')
          .eq('community_id', communityId),
      ]);

      if (fundsResult.error) {
        if (isMissingFundSchemaError(fundsResult.error)) {
          setFunds([]);
          if (!hasShownSchemaToastRef.current) {
            hasShownSchemaToastRef.current = true;
            Toast.show({
              type: 'error',
              text1: 'Funds unavailable',
              text2: getMissingFundSchemaMessage(),
            });
          }
          return;
        }

        throw fundsResult.error;
      }

      if (profilesResult.error) {
        throw profilesResult.error;
      }

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

      hasShownSchemaToastRef.current = false;
      setFunds(nextFunds);
    } catch (error) {
      console.error('Error fetching funds:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to load funds' });
    } finally {
      setLoading(false);
    }
  }, [appRole, communityId, user?.id]);

  useFocusEffect(
    useCallback(() => {
      fetchFunds();
    }, [fetchFunds])
  );

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (funds.length === 0) {
    return (
      <BaseCard padding={16}>
        <View style={styles.emptyHeader}>
          <Text style={styles.emptyIcon}>{APP_EMOJIS.wallet}</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No funds created</Text>
        </View>
        <Text style={[styles.emptyCopy, { color: colors.textMuted }]}>
          {canCreate
            ? 'Create your first fund and assign 1 or 2 treasurers to keep everything transparent.'
            : 'Once the admin creates a fund, you will be able to review every contribution and expense here.'}
        </Text>
      </BaseCard>
    );
  }

  return (
    <View style={styles.listWrap}>
      {funds.map((fund) => (
        <FundCard
          key={fund.id}
          fund={fund}
          totals={fund.totals}
          currentRole={fund.currentRole}
          treasurerNames={fund.treasurerNames}
          collectorCount={fund.collectorCount}
          onPress={() => router.push(`/funds/${fund.id}`)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  loaderWrap: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listWrap: {
    marginTop: 10,
  },
  emptyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  emptyIcon: {
    fontSize: 18,
    lineHeight: 20,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  emptyCopy: {
    fontSize: 13,
    lineHeight: 18,
  },
});
