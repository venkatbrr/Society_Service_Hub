import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { BaseCard } from '../../components/BaseCard';
import { Rupees } from '../../components/Rupees';
import { Verandah } from '../../constants/Colors';
import { VerandahRadius, VerandahType } from '../../constants/Verandah';
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
  const insets = useSafeAreaInsets();
  const { user, communityId, appRole, isCommunityLead, fundsEnabled, myFundsAccessRequest, refreshSession } = useAuth();

  const [pulseItems, setPulseItems] = useState<PulseItem[]>([]);
  const [overview, setOverview] = useState<FundsOverview | null>(null);
  const [communityDetails, setCommunityDetails] = useState<Pick<Tables<'communities'>, 'name' | 'code' | 'address'> | null>(null);
  const [fundRoles, setFundRoles] = useState<Tables<'fund_roles'>['role'][]>([]);
  const [pendingFundsRequest, setPendingFundsRequest] = useState<PendingFundsRequest | null>(null);
  const [hadHistoricalFunds, setHadHistoricalFunds] = useState(false);

  const canCreateFund = fundsEnabled && (appRole === 'president' || appRole === 'vice_president' || appRole === 'admin');

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
    if (appRole === 'president') return 'President';
    if (appRole === 'vice_president') return 'Vice President';
    if (isCommunityLead) return 'Lead';
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

  const handleInviteNeighbors = useCallback(async () => {
    const code = communityDetails?.code ?? null;
    if (!code) {
      Toast.show({ type: 'error', text1: 'Invite code unavailable', text2: 'Community code is not ready yet.' });
      return;
    }

    try {
      await Share.share({
        message: `Join my community on Society Service Hub!${communityDetails?.name ? `\nCommunity: ${communityDetails.name}` : ''}\nCode: ${code}`,
      });
    } catch (error) {
      const err = error as any;
      if (err && (err.name === 'AbortError' || err.message?.includes('abort') || err.message?.includes('cancel'))) {
        return;
      }
      Toast.show({ type: 'error', text1: 'Share failed', text2: 'Could not open share options.' });
    }
  }, [communityDetails?.code, communityDetails?.name]);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: Math.max(28, insets.top + 12) }]}
        showsVerticalScrollIndicator={false}
      >
        <BaseCard padding={18} style={styles.heroCard}>
          <Text style={styles.heroTitle}>{communityDetails?.name ?? 'Your community'}</Text>
        </BaseCard>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Community funds</Text>
            {canCreateFund ? (
              <TouchableOpacity
                onPress={() => router.push('/funds/add')}
                style={styles.createButton}
                activeOpacity={0.85}
              >
                <Ionicons name="add" size={14} color={Verandah.primary} />
                <Text style={styles.createButtonText}>Create fund</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {fundsEnabled ? (
            <TouchableOpacity onPress={() => router.push('/funds' as any)} activeOpacity={0.85}>
              <BaseCard padding={16} style={styles.fundsSummaryCard}>
                <View style={styles.fundsSummaryTopRow}>
                  <View style={styles.fundsSummaryBadge}>
                    <Ionicons name="stats-chart-outline" size={14} color={Verandah.accent} />
                    <Text style={styles.fundsSummaryBadgeText}>Live summary</Text>
                  </View>
                  <Text style={styles.summarySubline}>{overview?.active_funds_count ?? 0} active funds</Text>
                </View>

                <View style={styles.moneyRow}>
                  <Text style={styles.summaryLine}>Collected</Text>
                  <Rupees amount={overview?.total_collected ?? 0} size="sm" tone="in" />
                </View>
                <View style={styles.moneyRow}>
                  <Text style={styles.summaryLine}>Spent</Text>
                  <Rupees amount={overview?.total_spent ?? 0} size="sm" />
                </View>
                <View style={styles.moneyRow}>
                  <Text style={styles.summaryLine}>Available</Text>
                  <Rupees amount={overview?.total_available ?? 0} size="sm" />
                </View>
                <Text style={styles.summaryStatus}>{(overview?.funds_contributed_to ?? 0) > 0
                  ? `You have contributed to ${overview?.funds_contributed_to ?? 0} of ${overview?.active_funds_count ?? 0} active funds.`
                  : 'You have not contributed to any active fund yet.'}
                </Text>

                <View style={styles.fundsOpenRow}>
                  <View style={styles.actionCardIconWrap}>
                    <Ionicons name="wallet-outline" size={18} color={Verandah.primary} />
                  </View>
                  <View style={styles.actionCardTextWrap}>
                    <Text style={styles.cardTitle}>Open community funds</Text>
                    <Text style={styles.cardCopy}>View fund health and all fund events in one place.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Verandah.textMuted} />
                </View>
              </BaseCard>
            </TouchableOpacity>
          ) : pendingFundsRequest ? (
            <BaseCard padding={16}>
              <Text style={styles.cardTitle}>Funds support - pending review</Text>
              <Text style={styles.cardCopy}>Submitted by {pendingFundsRequest.requester_name ?? 'Resident'} on {new Date(pendingFundsRequest.created_at).toLocaleDateString('en-IN')}.</Text>
              <Text style={styles.cardCopy}>We'll be in touch on {pendingFundsRequest.contact_phone}.</Text>
              {pendingFundsRequest.requested_by === user?.id ? (
                <TouchableOpacity onPress={handleWithdrawFundsRequest}>
                  <Text style={styles.inlineLink}>Withdraw request</Text>
                </TouchableOpacity>
              ) : null}
            </BaseCard>
          ) : myFundsAccessRequest?.status === 'rejected' ? (
            <BaseCard padding={16}>
              <Text style={styles.cardTitle}>Funds support</Text>
              <Text style={styles.cardCopy}>Last request was rejected: {myFundsAccessRequest.rejection_reason ?? 'No reason provided'}.</Text>
              <TouchableOpacity style={styles.ctaButton} onPress={() => router.push('/funds-access/request')}>
                <Text style={styles.ctaButtonText}>Request again</Text>
              </TouchableOpacity>
            </BaseCard>
          ) : (
            <BaseCard padding={16}>
              <Text style={styles.cardTitle}>Funds support</Text>
              <Text style={styles.cardCopy}>Your community can request funds support to start collecting and tracking community contributions.</Text>
              {hadHistoricalFunds ? (
                <Text style={styles.cardCopy}>Funds were previously active in this community.</Text>
              ) : null}
              <TouchableOpacity style={styles.ctaButton} onPress={() => router.push('/funds-access/request')}>
                <Text style={styles.ctaButtonText}>Request funds support</Text>
              </TouchableOpacity>
            </BaseCard>
          )}
        </View>


        {fundsEnabled && (appRole === 'president' || appRole === 'vice_president') ? (
          <View style={styles.section}>
            <TouchableOpacity onPress={() => router.push('/community/blocks')} activeOpacity={0.85}>
              <BaseCard padding={16} style={styles.actionCard}>
                <View style={styles.actionCardRow}>
                  <View style={styles.actionCardIconWrap}>
                    <Ionicons name="layers-outline" size={18} color={Verandah.primary} />
                  </View>
                  <View style={styles.actionCardTextWrap}>
                    <Text style={styles.cardTitle}>Manage blocks</Text>
                    <Text style={styles.cardCopy}>Set up blocks and block in-charges for fund collection.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Verandah.textMuted} />
                </View>
              </BaseCard>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.section}>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/residents', params: { returnTo: 'community' } } as any)}
            activeOpacity={0.85}
          >
            <BaseCard padding={16} style={styles.actionCard}>
              <View style={styles.actionCardRow}>
                <View style={styles.actionCardIconWrap}>
                  <Ionicons name="people-outline" size={18} color={Verandah.primary} />
                </View>
                <View style={styles.actionCardTextWrap}>
                  <Text style={styles.cardTitle}>Residents directory</Text>
                  <Text style={styles.cardCopy}>See who lives in your community.</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Verandah.textMuted} />
              </View>
            </BaseCard>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <BaseCard padding={16}>
            <View style={styles.infoHeaderRow}>
              <Text style={styles.cardTitle}>Community info</Text>
              <Ionicons name="information-circle-outline" size={18} color={Verandah.textTertiary} />
            </View>
            <View style={styles.codeTile}>
              <View style={styles.codeTileLeft}>
                <Text style={styles.infoLabel}>Community code</Text>
                <Text style={styles.codeTileValue}>{communityDetails?.code ?? '---'}</Text>
              </View>
              <TouchableOpacity onPress={handleInviteNeighbors} style={styles.inviteButton} activeOpacity={0.85}>
                <Ionicons name="share-social-outline" size={14} color={Verandah.primary} />
                <Text style={styles.inviteButtonText}>Invite neighbors</Text>
              </TouchableOpacity>
            </View>
            {communityDetails?.address ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Address</Text>
                <Text style={styles.infoValue}>{communityDetails.address}</Text>
              </View>
            ) : null}
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Your role</Text>
              <Text style={styles.infoValue}>{appRoleLabel}</Text>
            </View>
            {fundRoles.length > 0 ? (
              <View style={styles.badgeWrap}>
                {fundRoles.map((role) => (
                  <View key={role} style={styles.badge}> 
                    <Text style={styles.badgeText}>{formatRole(role)}</Text>
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
    backgroundColor: Verandah.surface,
    borderTopWidth: 3,
    borderTopColor: Verandah.primary,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 14,
  },
  heroCard: {
    marginBottom: 14,
  },
  heroTitle: {
    ...VerandahType.display,
    color: Verandah.textPrimary,
  },
  sectionLabel: {
    ...VerandahType.sectionLabel,
    color: Verandah.textTertiary,
    marginBottom: 8,
  },
  sectionHeaderCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sectionSubtle: {
    fontSize: 12,
    fontWeight: '500',
    color: Verandah.textMuted,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '500',
    color: Verandah.textPrimary,
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
  fundsSummaryCard: {
    marginBottom: 10,
  },
  fundsSummaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  fundsOpenRow: {
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: Verandah.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fundsSummaryBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: Verandah.accentSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  fundsSummaryBadgeText: {
    fontSize: 11,
    fontWeight: '500',
    color: Verandah.accent,
  },
  pulseRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pulseDivider: {
    borderBottomWidth: 0.5,
    borderBottomColor: Verandah.border,
  },
  pulseSummary: {
    ...VerandahType.body,
    color: Verandah.textSecondary,
  },
  pulseTime: {
    ...VerandahType.caption,
    color: Verandah.textTertiary,
    marginTop: 4,
  },
  summaryLine: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    color: Verandah.textPrimary,
  },
  summarySubline: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '400',
    color: Verandah.textSecondary,
  },
  summaryStatus: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
    color: Verandah.textSecondary,
  },
  moneyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
    color: Verandah.textPrimary,
  },
  cardCopy: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 19,
    color: Verandah.textSecondary,
  },
  actionCard: {
    marginBottom: 0,
  },
  actionCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionCardIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Verandah.cardMuted,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCardTextWrap: {
    flex: 1,
  },
  infoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  codeTile: {
    borderWidth: 0.5,
    borderColor: Verandah.border,
    backgroundColor: Verandah.cardMuted,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  codeTileLeft: {
    flex: 1,
  },
  codeTileValue: {
    fontSize: 18,
    fontWeight: '500',
    color: Verandah.textPrimary,
    letterSpacing: 0.8,
  },
  inviteButton: {
    borderWidth: 1,
    borderRadius: 999,
    borderColor: Verandah.borderStrong,
    backgroundColor: Verandah.card,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  inviteButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: Verandah.primary,
  },
  infoRow: {
    marginTop: 10,
  },
  infoLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '500',
    marginBottom: 2,
    color: Verandah.textTertiary,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '400',
    color: Verandah.textPrimary,
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
    borderColor: Verandah.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    color: Verandah.primary,
  },
  ctaButton: {
    marginTop: 12,
    borderRadius: VerandahRadius.md,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: Verandah.primary,
  },
  ctaButtonText: {
    color: Verandah.primaryFg,
    fontSize: 14,
    fontWeight: '500',
  },
  inlineLink: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '500',
    color: Verandah.accent,
  },
});
