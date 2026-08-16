import { Award01 } from '@untitledui/icons/Award01';
import { BarChart01 } from '@untitledui/icons/BarChart01';
import { Building01 } from '@untitledui/icons/Building01';
import { CalendarDate } from '@untitledui/icons/CalendarDate';
import { ChevronRight } from '@untitledui/icons/ChevronRight';
import { LayersThree01 } from '@untitledui/icons/LayersThree01';
import { Phone01 } from '@untitledui/icons/Phone01';
import { Plus } from '@untitledui/icons/Plus';
import { Share07 } from '@untitledui/icons/Share07';
import { Users01 } from '@untitledui/icons/Users01';
import { Wallet02 } from '@untitledui/icons/Wallet02';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { BaseCard } from '../../components/BaseCard';
import { CommunityEventItem, EventCard } from '../../components/EventCard';
import { Rupees } from '../../components/Rupees';
import { useWebPullToRefresh } from '../../components/useWebPullToRefresh';
import { WebPullIndicator } from '../../components/WebPullIndicator';
import { Verandah } from '../../constants/Colors';
import { VerandahBorder, VerandahRadius, VerandahSpace, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { Tables } from '../../lib/database.types';
import { formatRole } from '../../lib/fundRoles';
import { shareOrCopy } from '../../lib/share';
import { siteUrl } from '../../lib/siteUrl';
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
  const { user, communityId, appRole, isCommunityLead, isEventOrganizer, fundsEnabled, blockLabel, communityHasLead, myFundsAccessRequest, refreshSession } = useAuth();

  const canPostEvents = isEventOrganizer || isCommunityLead;

  const [pulseItems, setPulseItems] = useState<PulseItem[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<CommunityEventItem[]>([]);
  const [overview, setOverview] = useState<FundsOverview | null>(null);
  const [communityDetails, setCommunityDetails] = useState<Pick<Tables<'communities'>, 'name' | 'code' | 'address'> | null>(null);
  const [fundRoles, setFundRoles] = useState<Tables<'fund_roles'>['role'][]>([]);
  const [pendingFundsRequest, setPendingFundsRequest] = useState<PendingFundsRequest | null>(null);
  const [hadHistoricalFunds, setHadHistoricalFunds] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const canCreateFund = fundsEnabled && (appRole === 'president' || appRole === 'vice_president' || appRole === 'admin');

  const loadCommunityData = useCallback(async () => {
    if (!communityId) {
      setPulseItems([]);
      setOverview(null);
      setCommunityDetails(null);
      setFundRoles([]);
      setPendingFundsRequest(null);
      setHadHistoricalFunds(false);
      setUpcomingEvents([]);
      return;
    }

    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const [pulseResult, overviewResult, communityResult, roleResult, pendingRequestResult, fundsHistoryResult, eventsResult] = await Promise.all([
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
        supabase
          .from('community_events')
          .select('id, title, category, image_url, venue, event_date, start_time, registration_last_date, status')
          .eq('community_id', communityId)
          .eq('status', 'published')
          .gte('event_date', todayStr)
          .order('event_date', { ascending: true })
          .order('start_time', { ascending: true })
          .limit(5),
      ]);

      if (pulseResult.error) throw pulseResult.error;
      if (overviewResult.error) throw overviewResult.error;
      if (communityResult.error) throw communityResult.error;
      if (roleResult.error) throw roleResult.error;
      if (pendingRequestResult.error) throw pendingRequestResult.error;
      if (fundsHistoryResult.error) throw fundsHistoryResult.error;
      if (eventsResult.error) throw eventsResult.error;

      setPulseItems((pulseResult.data ?? []) as PulseItem[]);
      setUpcomingEvents((eventsResult.data ?? []) as CommunityEventItem[]);
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

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCommunityData();
    setRefreshing(false);
  };

  const webPullProps = useWebPullToRefresh(onRefresh, refreshing);

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

    const shareUrl = communityId ? siteUrl(`/api/share-community?id=${communityId}&code=${encodeURIComponent(code)}`) : null;
    const message = [
      `Join my community on Wooru!`,
      communityDetails?.name ? `Community: ${communityDetails.name}` : null,
      `Code: ${code}`,
      shareUrl,
    ]
      .filter(Boolean)
      .join('\n');

    await shareOrCopy({ message });
  }, [communityDetails?.code, communityDetails?.name, communityId]);

  return (
    <View style={styles.container}>
      <ScrollView
        {...webPullProps.pullProps}
        contentContainerStyle={[styles.content, { paddingTop: Math.max(16, insets.top + 6) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Verandah.accent} />
        }
      >
        <WebPullIndicator pullDistance={webPullProps.pullDistance} refreshing={refreshing} isPulling={webPullProps.isPulling} />
        <View style={styles.heroBlock}>
          <Text style={styles.heroEyebrow}>Your community</Text>
          <Text style={styles.heroTitle}>{communityDetails?.name ?? 'Your community'}</Text>
          <Text style={styles.heroMeta}>
            {communityDetails?.address ? `${communityDetails.address} · ` : ''}You are a {appRoleLabel}
          </Text>
        </View>

        {/* A community can be approved and full of residents before anyone is
            appointed president. Say so plainly rather than letting lead-only
            sections silently not appear. Neighbourhood features (MCN, providers,
            visits, SOS) work regardless — only money and roles wait. */}
        {!communityHasLead ? (
          <View style={styles.noLeadCard}>
            <View style={styles.noLeadHeaderRow}>
              <Award01 size={16} color={Verandah.goldInk} aria-hidden={true} />
              <Text style={styles.noLeadTitle}>No president yet</Text>
            </View>
            <Text style={styles.noLeadCopy}>
              Funds and block in-charges aren't active yet. They switch on once a president or vice president is appointed.
            </Text>
            <TouchableOpacity onPress={() => router.push('/residents' as any)} activeOpacity={0.8}>
              <Text style={styles.inlineLink}>See who is in your community</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.eventsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Happening soon</Text>
            {canPostEvents ? (
              <TouchableOpacity
                onPress={() => router.push('/events/add' as any)}
                style={styles.createButton}
                activeOpacity={0.85}
              >
                <Plus size={14} color={Verandah.primary} aria-hidden={true} />
                <Text style={styles.createButtonText}>Post event</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {upcomingEvents.length > 0 ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.eventsCarousel}>
                {upcomingEvents.map((event) => (
                  <EventCard key={event.id} event={event} variant="compact" onPress={() => router.push(`/events/${event.id}` as any)} />
                ))}
              </ScrollView>
              <TouchableOpacity onPress={() => router.push('/events' as any)} style={styles.viewAllRow} activeOpacity={0.7}>
                <Text style={styles.viewAllText}>View all events</Text>
                <ChevronRight size={14} color={Verandah.accent} aria-hidden={true} />
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity onPress={() => router.push('/events' as any)} style={styles.eventsEmptyRow} activeOpacity={0.7}>
              <CalendarDate size={16} color={Verandah.textTertiary} aria-hidden={true} />
              <Text style={styles.eventsEmptyText}>
                {canPostEvents ? 'No events scheduled — post the first one' : 'No events scheduled'}
              </Text>
              <ChevronRight size={14} color={Verandah.textTertiary} aria-hidden={true} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.fundsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Community funds</Text>
            {canCreateFund ? (
              <TouchableOpacity
                onPress={() => router.push('/funds/add')}
                style={styles.createButton}
                activeOpacity={0.85}
              >
                <Plus size={14} color={Verandah.primary} aria-hidden={true} />
                <Text style={styles.createButtonText}>Create fund</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {fundsEnabled ? (
            <TouchableOpacity onPress={() => router.push('/funds' as any)} activeOpacity={0.85}>
              <BaseCard padding={14} style={styles.fundsSummaryCard}>
                <View style={styles.fundsSummaryTopRow}>
                  <View style={styles.fundsSummaryBadge}>
                    <BarChart01 size={13} color={Verandah.accent} aria-hidden={true} />
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
                    <Wallet02 size={16} color={Verandah.primary} aria-hidden={true} />
                  </View>
                  <View style={styles.actionCardTextWrap}>
                    <Text style={styles.cardTitle}>Open community funds</Text>
                    <Text style={styles.cardCopy}>View fund health and all fund events in one place.</Text>
                  </View>
                  <ChevronRight size={16} color={Verandah.textMuted} aria-hidden={true} />
                </View>
              </BaseCard>
            </TouchableOpacity>
          ) : pendingFundsRequest ? (
            <View style={styles.pendingCard}>
              <View style={styles.pendingHeaderRow}>
                <Text style={styles.cardTitle}>Funds support</Text>
                <View style={styles.pendingChip}>
                  <Text style={styles.pendingChipText}>Pending review</Text>
                </View>
              </View>
              <Text style={styles.pendingCopy}>
                Submitted by {pendingFundsRequest.requester_name ?? 'Resident'} on {new Date(pendingFundsRequest.created_at).toLocaleDateString('en-IN')}. We'll be in touch on {pendingFundsRequest.contact_phone}.
              </Text>
              {pendingFundsRequest.requested_by === user?.id ? (
                <TouchableOpacity onPress={handleWithdrawFundsRequest}>
                  <Text style={styles.inlineLink}>Withdraw request</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : myFundsAccessRequest?.status === 'rejected' ? (
            <BaseCard padding={14}>
              <Text style={styles.cardTitle}>Funds support</Text>
              <Text style={styles.cardCopy}>Last request was rejected: {myFundsAccessRequest.rejection_reason ?? 'No reason provided'}.</Text>
              <TouchableOpacity style={styles.ctaButton} onPress={() => router.push('/funds-access/request')}>
                <Text style={styles.ctaButtonText}>Request again</Text>
              </TouchableOpacity>
            </BaseCard>
          ) : !communityHasLead ? (
            /* Funds are money held on the community's behalf, with a treasurer
               and per-block collectors appointed by the president. Without one
               there is nobody to appoint them or answer for the balance, so the
               request CTA is withheld rather than shown and then failing. */
            <BaseCard padding={14}>
              <Text style={styles.cardTitle}>Funds support</Text>
              <Text style={styles.cardCopy}>
                Funds aren't active in this community yet. They'll switch on once a president or vice president is appointed.
              </Text>
              {hadHistoricalFunds ? (
                <Text style={styles.cardCopy}>Funds were previously active in this community.</Text>
              ) : null}
            </BaseCard>
          ) : (
            <BaseCard padding={14}>
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


        {(appRole === 'president' || appRole === 'vice_president') ? (
          <View style={styles.compactSection}>
            <TouchableOpacity onPress={() => router.push('/community/blocks')} activeOpacity={0.85}>
              <BaseCard padding={14} style={styles.actionCard}>
                <View style={styles.actionCardRow}>
                  <View style={styles.actionCardIconWrap}>
                    <LayersThree01 size={16} color={Verandah.primary} aria-hidden={true} />
                  </View>
                  <View style={styles.actionCardTextWrap}>
                    <Text style={styles.cardTitle}>{blockLabel}s</Text>
                    <Text style={styles.cardCopy}>See {blockLabel.toLowerCase()}s, residents and in-charges.</Text>
                  </View>
                  <ChevronRight size={16} color={Verandah.textMuted} aria-hidden={true} />
                </View>
              </BaseCard>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push('/community/flats' as any)} activeOpacity={0.85}>
              <BaseCard padding={14} style={styles.actionCard}>
                <View style={styles.actionCardRow}>
                  <View style={styles.actionCardIconWrap}>
                    <Building01 size={16} color={Verandah.primary} aria-hidden={true} />
                  </View>
                  <View style={styles.actionCardTextWrap}>
                    <Text style={styles.cardTitle}>Manage flats</Text>
                    <Text style={styles.cardCopy}>View and add verified flats, review resident requests.</Text>
                  </View>
                  <ChevronRight size={16} color={Verandah.textMuted} aria-hidden={true} />
                </View>
              </BaseCard>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push('/events/coordinators' as any)} activeOpacity={0.85}>
              <BaseCard padding={14} style={styles.actionCard}>
                <View style={styles.actionCardRow}>
                  <View style={styles.actionCardIconWrap}>
                    <CalendarDate size={16} color={Verandah.primary} aria-hidden={true} />
                  </View>
                  <View style={styles.actionCardTextWrap}>
                    <Text style={styles.cardTitle}>Manage events coordinators</Text>
                    <Text style={styles.cardCopy}>Choose who can post cultural, sports & festival events.</Text>
                  </View>
                  <ChevronRight size={16} color={Verandah.textMuted} aria-hidden={true} />
                </View>
              </BaseCard>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.tileGrid}>
          <TouchableOpacity
            style={styles.tile}
            onPress={() => router.push({ pathname: '/residents', params: { returnTo: 'community' } } as any)}
            activeOpacity={0.85}
          >
            <View style={styles.tileIconWrap}>
              <Users01 size={20} color={Verandah.accent} aria-hidden={true} />
            </View>
            <Text style={styles.tileTitle}>Residents{'\n'}directory</Text>
            <Text style={styles.tileCopy}>See who lives here</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tile}
            onPress={() => router.push('/sos' as any)}
            activeOpacity={0.85}
          >
            <View style={[styles.tileIconWrap, { backgroundColor: Verandah.sand }]}>
              <Phone01 size={20} color={Verandah.goldInk} aria-hidden={true} />
            </View>
            <Text style={styles.tileTitle}>Emergency &{'\n'}donors</Text>
            <Text style={styles.tileCopy}>Numbers & blood</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <View style={styles.infoPanel}>
            <View style={styles.infoPanelTopRow}>
              <Text style={styles.infoPanelLabel}>Community code</Text>
              <TouchableOpacity onPress={handleInviteNeighbors} style={styles.invitePanelButton} activeOpacity={0.85}>
                <Share07 size={14} color={Verandah.teal900} aria-hidden={true} />
                <Text style={styles.invitePanelButtonText}>Invite</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.infoPanelCode}>{communityDetails?.code ?? '---'}</Text>

            <View style={styles.infoPanelMetaRow}>
              {communityDetails?.address ? (
                <View style={styles.infoPanelMetaCol}>
                  <Text style={styles.infoPanelLabel}>Address</Text>
                  <Text style={styles.infoPanelValue}>{communityDetails.address}</Text>
                </View>
              ) : null}
              <View style={styles.infoPanelMetaCol}>
                <Text style={styles.infoPanelLabel}>Your role</Text>
                <Text style={styles.infoPanelValue}>{appRoleLabel}</Text>
              </View>
            </View>

            {fundRoles.length > 0 ? (
              <View style={styles.badgeWrap}>
                {fundRoles.map((role) => (
                  <View key={role} style={styles.panelBadge}>
                    <Text style={styles.panelBadgeText}>{formatRole(role)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Verandah.paper,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 30,
    gap: 6,
  },
  section: {
    marginBottom: 0,
  },
  fundsSection: {
    marginBottom: 0,
  },
  eventsSection: {
    marginBottom: 0,
  },
  eventsCarousel: {
    gap: 10,
    paddingBottom: 2,
  },
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 8,
  },
  viewAllText: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 12.5,
    fontWeight: '600',
    color: Verandah.accent,
  },
  eventsEmptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: VerandahBorder.tile,
    borderColor: Verandah.borderHair,
    backgroundColor: Verandah.card,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  eventsEmptyText: {
    flex: 1,
    fontFamily: VerandahType.sansFamily,
    fontSize: 12.5,
    color: Verandah.textSecondary,
  },
  compactSection: {
    gap: 6,
    marginBottom: 0,
  },
  heroCard: {
    marginBottom: 0,
  },
  heroBlock: {
    marginBottom: 2,
  },
  heroEyebrow: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: Verandah.textTertiary,
    marginBottom: 2,
  },
  heroTitle: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '400',
    letterSpacing: -0.4,
    color: Verandah.textPrimary,
  },
  heroMeta: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 3,
    color: Verandah.textSecondary,
  },
  pendingCard: {
    borderRadius: VerandahRadius.card,
    borderWidth: VerandahBorder.tile,
    borderColor: 'rgba(133, 79, 11, 0.18)',
    backgroundColor: Verandah.sand,
    padding: 14,
  },
  pendingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  pendingChip: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: VerandahRadius.pill,
    backgroundColor: 'rgba(133, 79, 11, 0.12)',
  },
  pendingChipText: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 10.5,
    fontWeight: '700',
    color: Verandah.goldInk,
  },
  pendingCopy: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 12.5,
    lineHeight: 17,
    color: Verandah.goldInk,
  },
  tileGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  tile: {
    flex: 1,
    borderRadius: VerandahRadius.card,
    borderWidth: VerandahBorder.tile,
    borderColor: Verandah.borderHair,
    backgroundColor: Verandah.card,
    padding: 14,
    ...Verandah.shadowCard,
  },
  tileIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Verandah.accentSoft,
    marginBottom: 10,
  },
  tileTitle: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
    color: Verandah.textPrimary,
  },
  tileCopy: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 11.5,
    lineHeight: 15,
    marginTop: 3,
    color: Verandah.textSecondary,
  },
  infoPanel: {
    borderRadius: VerandahRadius.card,
    backgroundColor: Verandah.teal900,
    padding: 16,
    ...Verandah.shadowRaised,
  },
  infoPanelTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoPanelLabel: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: 'rgba(240, 237, 227, 0.6)',
  },
  infoPanelCode: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '400',
    letterSpacing: 4,
    color: Verandah.cream,
    marginTop: 2,
  },
  infoPanelMetaRow: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 12,
  },
  infoPanelMetaCol: {
    flexShrink: 1,
  },
  infoPanelValue: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 13.5,
    fontWeight: '500',
    marginTop: 3,
    color: Verandah.cream,
  },
  invitePanelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: VerandahRadius.pill,
    backgroundColor: Verandah.cream,
  },
  invitePanelButtonText: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 12.5,
    fontWeight: '700',
    color: Verandah.teal900,
  },
  panelBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: VerandahRadius.pill,
    borderWidth: 0.5,
    borderColor: 'rgba(240, 237, 227, 0.28)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  panelBadgeText: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 11,
    fontWeight: '600',
    color: Verandah.cream,
  },
  sectionLabel: {
    ...VerandahType.sectionLabel,
    color: Verandah.textTertiary,
    marginBottom: 4,
  },
  sectionHeaderCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
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
    fontFamily: VerandahType.serifFamily,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '400',
    color: Verandah.textPrimary,
  },
  createButton: {
    borderWidth: 0.5,
    borderRadius: 999,
    borderColor: Verandah.borderHair,
    backgroundColor: Verandah.cardMuted,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  createButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: Verandah.primary,
    fontFamily: VerandahType.sansFamily,
  },
  fundsSummaryCard: {
    marginBottom: 0,
  },
  fundsSummaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  fundsOpenRow: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: Verandah.borderHair,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fundsSummaryBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: Verandah.accentSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fundsSummaryBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: Verandah.accent,
    fontFamily: VerandahType.sansFamily,
  },
  pulseRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  pulseDivider: {
    borderBottomWidth: 0.5,
    borderBottomColor: Verandah.borderHair,
  },
  pulseSummary: {
    ...VerandahType.body,
    color: Verandah.textSecondary,
  },
  pulseTime: {
    ...VerandahType.caption,
    color: Verandah.textTertiary,
    marginTop: 2,
  },
  summaryLine: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    color: Verandah.textPrimary,
    fontFamily: VerandahType.sansFamily,
  },
  summarySubline: {
    fontSize: 11.5,
    fontWeight: '500',
    color: Verandah.textSecondary,
    fontFamily: VerandahType.sansFamily,
  },
  summaryStatus: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 16,
    color: Verandah.textSecondary,
    fontFamily: VerandahType.sansFamily,
  },
  moneyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 14.5,
    fontWeight: '600',
    marginBottom: 2,
    color: Verandah.textPrimary,
    fontFamily: VerandahType.sansFamily,
  },
  cardCopy: {
    fontSize: 12,
    marginTop: 1,
    lineHeight: 16,
    color: Verandah.textSecondary,
    fontFamily: VerandahType.sansFamily,
  },
  actionCard: {
    marginBottom: 0,
  },
  sosActionCard: {
    borderColor: 'rgba(15, 110, 86, 0.3)',
  },
  actionCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionCardIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Verandah.cardMuted,
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosIconWrap: {
    backgroundColor: Verandah.cautionSoft,
    borderColor: Verandah.caution,
  },
  actionCardTextWrap: {
    flex: 1,
  },
  infoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  codeTile: {
    borderWidth: VerandahBorder.tile,
    borderColor: Verandah.borderHair,
    backgroundColor: Verandah.cardMuted,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 12,
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
    fontSize: 17,
    fontWeight: '600',
    color: Verandah.textPrimary,
    letterSpacing: 0.8,
    fontFamily: VerandahType.sansFamily,
  },
  inviteButton: {
    borderWidth: 0.5,
    borderRadius: 999,
    borderColor: Verandah.borderHair,
    backgroundColor: Verandah.card,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  inviteButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Verandah.primary,
    fontFamily: VerandahType.sansFamily,
  },
  infoRow: {
    marginTop: 8,
  },
  infoLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 2,
    color: Verandah.textTertiary,
    fontFamily: VerandahType.sansFamily,
    letterSpacing: 0.4,
  },
  infoValue: {
    fontSize: 13.5,
    fontWeight: '400',
    color: Verandah.textPrimary,
    fontFamily: VerandahType.sansFamily,
  },
  badgeWrap: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  badge: {
    borderWidth: 0.5,
    borderRadius: 999,
    borderColor: Verandah.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 10.5,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: Verandah.primary,
    fontFamily: VerandahType.sansFamily,
  },
  ctaButton: {
    marginTop: 12,
    borderRadius: VerandahRadius.button,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: Verandah.primary,
  },
  ctaButtonText: {
    color: Verandah.primaryFg,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: VerandahType.sansFamily,
  },
  inlineLink: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '600',
    color: Verandah.accent,
    fontFamily: VerandahType.sansFamily,
  },
  noLeadCard: {
    borderRadius: VerandahRadius.card,
    borderWidth: VerandahBorder.tile,
    borderColor: Verandah.border,
    backgroundColor: Verandah.sand,
    padding: 14,
    ...Verandah.shadowCard,
  },
  noLeadHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  noLeadTitle: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 14,
    fontWeight: '700',
    color: Verandah.goldInk,
  },
  noLeadCopy: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 12.5,
    lineHeight: 17,
    color: Verandah.goldInk,
  },
});
