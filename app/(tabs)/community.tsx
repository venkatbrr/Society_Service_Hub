import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, ImageBackground } from 'react-native';
import Toast from 'react-native-toast-message';
import { BaseCard } from '../../components/BaseCard';
import { FundsList } from '../../components/FundsList';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../context/AuthContext';
import { Tables } from '../../lib/database.types';
import { formatRole } from '../../lib/fundRoles';
import { supabase } from '../../lib/supabase';

type PulseItem = {
  kind: 'visit_scheduled' | 'fund_created' | 'provider_added' | 'recent_hire';
  happened_at: string;
  summary: string;
  entity_id: string;
};

type FundsOverview = {
  active_funds_count: number;
  total_collected: number;
  total_spent: number;
  total_available: number;
  funds_contributed_to: number;
  your_total_contributed: number;
};

type FundRoleRow = {
  role: Tables<'fund_roles'>['role'];
};

type PendingFundsRequest = {
  id: string;
  requested_by: string;
  created_at: string;
  contact_phone: string;
  requester_name: string | null;
};

const formatMoney = (value: number | null | undefined) => `Rs ${Number(value ?? 0).toLocaleString('en-IN')}`;

const formatRelativePulseTime = (timestamp: string) => {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    if (then.getHours() < 12) {
      return 'this morning';
    }
    if (diffHours <= 1) {
      return 'just now';
    }
    return `${diffHours} hours ago`;
  }

  if (diffDays === 1) {
    return '1 day ago';
  }

  return `${diffDays} days ago`;
};

export default function CommunityScreen() {
  const router = useRouter();
  const colors = Colors.light;
  const { user, communityId, appRole, isCommunityLead, fundsEnabled, myFundsAccessRequest, refreshSession } = useAuth();

  const [pulseItems, setPulseItems] = useState<PulseItem[]>([]);
  const [overview, setOverview] = useState<FundsOverview | null>(null);
  const [communityDetails, setCommunityDetails] = useState<Pick<Tables<'communities'>, 'name' | 'code' | 'address'> | null>(null);
  const [fundRoles, setFundRoles] = useState<Tables<'fund_roles'>['role'][]>([]);
  const [pendingFundsRequest, setPendingFundsRequest] = useState<PendingFundsRequest | null>(null);
  const [hadHistoricalFunds, setHadHistoricalFunds] = useState(false);

  const canCreateFund = fundsEnabled && (appRole === 'community_lead' || appRole === 'admin');

  const loadCommunityData = useCallback(async () => {
    if (!communityId) {
      setPulseItems([]);
      setOverview(null);
      setCommunityDetails(null);
      setFundRoles([]);
      setPendingFundsRequest(null);
      setHadHistoricalFunds(false);
      return;
    }

    try {
      const [pulseResult, overviewResult, communityResult, roleResult, pendingRequestResult, fundsHistoryResult] = await Promise.all([
        supabase.rpc('get_community_pulse', { p_limit: 5 }),
        supabase.rpc('get_my_community_funds_overview'),
        supabase
          .from('communities')
          .select('name, code, address')
          .eq('id', communityId)
          .maybeSingle(),
        user?.id
          ? supabase
              .from('fund_roles')
              .select('role, events!inner(community_id)')
              .eq('user_id', user.id)
              .eq('events.community_id', communityId)
          : Promise.resolve({ data: [], error: null } as any),
        supabase
          .from('funds_access_requests')
          .select('id, requested_by, created_at, contact_phone, profiles!funds_access_requests_requested_by_fkey(full_name)')
          .eq('community_id', communityId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('events')
          .select('id', { count: 'exact', head: true })
          .eq('community_id', communityId),
      ]);

      if (pulseResult.error) throw pulseResult.error;
      if (overviewResult.error) throw overviewResult.error;
      if (communityResult.error) throw communityResult.error;
      if (roleResult.error) throw roleResult.error;
      if (pendingRequestResult.error) throw pendingRequestResult.error;
      if (fundsHistoryResult.error) throw fundsHistoryResult.error;

      setPulseItems((pulseResult.data ?? []) as PulseItem[]);
      setOverview(((overviewResult.data ?? [null])[0] ?? null) as FundsOverview | null);
      setCommunityDetails(communityResult.data);
      setFundRoles(Array.from(new Set(((roleResult.data ?? []) as FundRoleRow[]).map((row) => row.role))));

      const pendingRow = pendingRequestResult.data as any;
      setPendingFundsRequest(
        pendingRow
          ? {
              id: pendingRow.id,
              requested_by: pendingRow.requested_by,
              created_at: pendingRow.created_at,
              contact_phone: pendingRow.contact_phone,
              requester_name: pendingRow.profiles?.full_name ?? null,
            }
          : null
      );

      setHadHistoricalFunds((fundsHistoryResult.count ?? 0) > 0);
    } catch (error) {
      console.error('Error loading community tab:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to load community details' });
    }
  }, [communityId, user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadCommunityData();
    }, [loadCommunityData])
  );

  const appRoleLabel = useMemo(() => {
    if (isCommunityLead || appRole === 'community_lead') {
      return 'Community lead';
    }
    return 'Resident';
  }, [appRole, isCommunityLead]);

  const handleWithdrawFundsRequest = async () => {
    if (!pendingFundsRequest?.id) return;

    try {
      const { error } = await supabase.rpc('withdraw_funds_access_request', { p_request_id: pendingFundsRequest.id });
      if (error) throw error;
      await refreshSession();
      await loadCommunityData();
      Toast.show({ type: 'success', text1: 'Request withdrawn' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to withdraw request', text2: error.message });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>


        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Community Funds</Text>
            {canCreateFund ? (
              <TouchableOpacity
                onPress={() => router.push('/funds/add')}
                style={[styles.createButton, { borderColor: colors.primary }]}
                activeOpacity={0.85}
              >
                <Text style={[styles.createButtonText, { color: colors.primary }]}>Create fund</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {fundsEnabled && overview && overview.active_funds_count > 0 ? (
            <ImageBackground 
              source={require('../../assets/images/funds_bg.png')} 
              style={[styles.fundsOverviewBg]}
              imageStyle={{ borderRadius: 16 }}
            >
              <View style={[styles.fundsOverviewOverlay]}>
                <Text style={[styles.summaryLine, { color: '#FFF' }]}>Collected {formatMoney(overview.total_collected)} - Spent {formatMoney(overview.total_spent)} - Available {formatMoney(overview.total_available)}</Text>
                <Text style={[styles.summarySubline, { color: '#EAEAEA' }]}>{overview.active_funds_count} active funds</Text>
                <Text style={[styles.summaryStatus, { color: '#FFF' }]}>{overview.funds_contributed_to > 0
                  ? `You've contributed to ${overview.funds_contributed_to} of ${overview.active_funds_count} active funds - total ${formatMoney(overview.your_total_contributed)}`
                  : "You haven't contributed to any active fund yet."}
                </Text>
              </View>
            </ImageBackground>
          ) : null}

          {fundsEnabled ? (
            <FundsList />
          ) : pendingFundsRequest ? (
            <BaseCard padding={16}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Funds support - pending review</Text>
              <Text style={[styles.cardCopy, { color: colors.textMuted }]}>Submitted by {pendingFundsRequest.requester_name ?? 'Resident'} on {new Date(pendingFundsRequest.created_at).toLocaleDateString('en-IN')}.</Text>
              <Text style={[styles.cardCopy, { color: colors.textMuted }]}>We'll be in touch on {pendingFundsRequest.contact_phone}.</Text>
              {pendingFundsRequest.requested_by === user?.id ? (
                <TouchableOpacity onPress={handleWithdrawFundsRequest}>
                  <Text style={[styles.inlineLink, { color: colors.primary }]}>Withdraw request</Text>
                </TouchableOpacity>
              ) : null}
            </BaseCard>
          ) : myFundsAccessRequest?.status === 'rejected' ? (
            <BaseCard padding={16}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Funds support</Text>
              <Text style={[styles.cardCopy, { color: colors.textMuted }]}>Last request was rejected: {myFundsAccessRequest.rejection_reason ?? 'No reason provided'}.</Text>
              <TouchableOpacity style={[styles.ctaButton, { backgroundColor: colors.primary }]} onPress={() => router.push('/funds-access/request')}>
                <Text style={styles.ctaButtonText}>Request again</Text>
              </TouchableOpacity>
            </BaseCard>
          ) : (
            <BaseCard padding={16}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Funds support</Text>
              <Text style={[styles.cardCopy, { color: colors.textMuted }]}>Your community can request funds support to start collecting and tracking community contributions.</Text>
              {hadHistoricalFunds ? (
                <Text style={[styles.cardCopy, { color: colors.textMuted }]}>Funds were previously active in this community.</Text>
              ) : null}
              <TouchableOpacity style={[styles.ctaButton, { backgroundColor: colors.primary }]} onPress={() => router.push('/funds-access/request')}>
                <Text style={styles.ctaButtonText}>Request funds support</Text>
              </TouchableOpacity>
            </BaseCard>
          )}
        </View>

        {pulseItems.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Going around the community</Text>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 8, gap: 12, paddingHorizontal: 20 }}
              style={{ marginHorizontal: -20 }}
            >
              {pulseItems.map((item) => {
                let icon = '✨';
                if (item.kind === 'visit_scheduled') icon = '📅';
                else if (item.kind === 'fund_created') icon = '💰';
                else if (item.kind === 'provider_added') icon = '👷';
                else if (item.kind === 'recent_hire') icon = '⭐';

                return (
                  <View key={`${item.kind}-${item.entity_id}-${item.happened_at}`} style={styles.flashCard}>
                    <View style={styles.flashCardIconWrap}>
                      <Text style={styles.flashCardIcon}>{icon}</Text>
                    </View>
                    <Text style={[styles.flashCardSummary, { color: colors.text }]} numberOfLines={3}>{item.summary}</Text>
                    <View style={{ flex: 1 }} />
                    <Text style={[styles.flashCardTime, { color: colors.textMuted }]}>{formatRelativePulseTime(item.happened_at)}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {fundsEnabled && appRole === 'community_lead' ? (
          <View style={styles.section}>
            <TouchableOpacity onPress={() => router.push('/community/blocks')} activeOpacity={0.85}>
              <BaseCard padding={16}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Manage blocks</Text>
                <Text style={[styles.cardCopy, { color: colors.textMuted }]}>Set up blocks and block in-charges for fund collection.</Text>
              </BaseCard>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.section}>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/residents', params: { returnTo: 'community' } } as any)}
            activeOpacity={0.85}
          >
            <BaseCard padding={16}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Residents directory</Text>
              <Text style={[styles.cardCopy, { color: colors.textMuted }]}>See who lives in your community</Text>
            </BaseCard>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <BaseCard padding={16}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Community info</Text>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Name</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{communityDetails?.name ?? '---'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Code</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{communityDetails?.code ?? '---'}</Text>
            </View>
            {communityDetails?.address ? (
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Address</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>{communityDetails.address}</Text>
              </View>
            ) : null}
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Your role</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{appRoleLabel}</Text>
            </View>
            {fundRoles.length > 0 ? (
              <View style={styles.badgeWrap}>
                {fundRoles.map((role) => (
                  <View key={role} style={[styles.badge, { borderColor: colors.primary }]}> 
                    <Text style={[styles.badgeText, { color: colors.primary }]}>{formatRole(role)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </BaseCard>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.7,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  createButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  createButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  flashCard: {
    width: 150,
    minHeight: 140,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  flashCardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  flashCardIcon: {
    fontSize: 18,
  },
  flashCardSummary: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginBottom: 8,
  },
  flashCardTime: {
    fontSize: 11,
    fontWeight: '600',
  },
  summaryLine: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  summarySubline: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
  },
  summaryStatus: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  cardCopy: {
    fontSize: 13,
    marginTop: 2,
  },
  infoRow: {
    marginTop: 10,
  },
  infoLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  badgeWrap: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  ctaButton: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  ctaButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
  inlineLink: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '700',
  },
  fundsOverviewBg: {
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  fundsOverviewOverlay: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
});
