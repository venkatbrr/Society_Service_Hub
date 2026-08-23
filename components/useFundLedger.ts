import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import Toast from 'react-native-toast-message';
import { useAuth } from '../context/AuthContext';
import { Tables } from '../lib/database.types';
import { buildFlatMeta } from '../lib/fundLedger';
import { getEffectiveFundRole, getFundPermissions } from '../lib/fundRoles';
import { goBackSmart } from '../lib/navigation';
import { supabase } from '../lib/supabase';
import { getMissingFundSchemaMessage, isMissingFundSchemaError } from '../lib/supabaseErrors';

type FundRow = Tables<'events'> & {
  community?: Pick<Tables<'communities'>, 'funds_enabled' | 'blocks_enabled'> | null;
};

/**
 * The read side of a fund, shared by the detail screen and the two ledger
 * screens split out of it. Kept as a hook rather than context because each
 * screen is reached independently (deep link, browser refresh) and must be
 * able to stand up its own data.
 */
export function useFundLedger(eventId: string | undefined, backRoute: string) {
  const [fund, setFund] = useState<FundRow | null>(null);
  const [transactions, setTransactions] = useState<Tables<'event_transactions'>[]>([]);
  const [fundRoles, setFundRoles] = useState<Tables<'fund_roles'>[]>([]);
  const [members, setMembers] = useState<Pick<Tables<'profiles'>, 'id' | 'full_name' | 'flat_number'>[]>([]);
  const [flats, setFlats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, appRole } = useAuth();
  const router = useRouter();

  const fetchAll = useCallback(async () => {
    if (!eventId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('events')
        .select('*, community:communities!inner(funds_enabled, blocks_enabled)')
        .eq('id', eventId)
        .single();
      if (error) throw error;

      const [transactionsResult, rolesResult, profilesResult, flatsResult] = await Promise.all([
        supabase.from('event_transactions').select('*').eq('event_id', eventId),
        supabase.from('fund_roles').select('*').eq('event_id', eventId),
        supabase.from('profiles').select('id, full_name, flat_number').eq('community_id', data.community_id),
        supabase.rpc('list_community_flats', { p_community_id: data.community_id }),
      ]);

      if (transactionsResult.error && !isMissingFundSchemaError(transactionsResult.error)) {
        throw transactionsResult.error;
      }
      if (profilesResult.error) throw profilesResult.error;

      setFund({ ...data, community: (data as any).community ?? null });
      setTransactions(transactionsResult.data ?? []);
      setFundRoles(rolesResult.data ?? []);
      setMembers(profilesResult.data ?? []);
      setFlats(flatsResult.data ?? []);

      if (transactionsResult.error || rolesResult.error) {
        Toast.show({ type: 'error', text1: 'Funds partially loaded', text2: getMissingFundSchemaMessage() });
      }
    } catch (error: any) {
      console.error(error);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: isMissingFundSchemaError(error) ? getMissingFundSchemaMessage() : 'Fund not found',
      });
      goBackSmart(router, backRoute);
    } finally {
      setLoading(false);
    }
  }, [eventId, router, backRoute]);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  const profileNames = useMemo(
    () => new Map(members.map((m) => [m.id, m.full_name?.trim() || 'Resident'])),
    [members]
  );
  const profileFlats = useMemo(
    () => new Map(members.map((m) => [m.id, m.flat_number?.trim() || ''])),
    [members]
  );
  const flatMeta = useMemo(() => buildFlatMeta(flats), [flats]);
  const flatLabels = useMemo(
    () => new Map(flats.map((f) => [f.id, f.block_name ? `${f.block_name}-${f.flat_number}` : f.flat_number])),
    [flats]
  );

  const fundRole = getEffectiveFundRole(appRole, fundRoles, user?.id);
  const permissions = getFundPermissions(fundRole);

  const income = useMemo(() => transactions.filter((t) => t.type === 'income'), [transactions]);
  const expenses = useMemo(() => transactions.filter((t) => t.type === 'expense'), [transactions]);

  return {
    fund, transactions, income, expenses, flats, flatMeta, flatLabels,
    profileNames, profileFlats, permissions, fundRole, loading, refetch: fetchAll,
  };
}
