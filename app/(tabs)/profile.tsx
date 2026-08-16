import { Bell01 } from '@untitledui/icons/Bell01';
import { Building05 } from '@untitledui/icons/Building05';
import { ChevronRight } from '@untitledui/icons/ChevronRight';
import { Edit01 } from '@untitledui/icons/Edit01';
import { File06 } from '@untitledui/icons/File06';
import { ShieldTick } from '@untitledui/icons/ShieldTick';
import { LogOut01 } from '@untitledui/icons/LogOut01';
import { ShoppingBag01 } from '@untitledui/icons/ShoppingBag01';
import { Tool01 } from '@untitledui/icons/Tool01';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { BlockPicker } from '../../components/BlockPicker';
import { Rupees } from '../../components/Rupees';
import { useWebPullToRefresh } from '../../components/useWebPullToRefresh';
import { WebPullIndicator } from '../../components/WebPullIndicator';
import { Verandah } from '../../constants/Colors';
import { VerandahBorder, VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { linkGoogleIdentity } from '../../lib/auth';
import { replaceTracked } from '../../lib/navigation';
import { goToLanding } from '../../lib/siteUrl';
import { supabase } from '../../lib/supabase';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, profile, signOut, appRole, communityId, fundsEnabled, blocksEnabled, blockLabel, myBlockId, refreshSession } = useAuth();
  const blockLabelLower = blockLabel.toLowerCase();
  const [dueSoonCount, setDueSoonCount] = useState<number>(0);
  const [recentServices, setRecentServices] = useState<Array<{
    id: string;
    service_id: string;
    service_name: string;
    serviced_on: string;
    provider_name: string | null;
    cost_paid: number | null;
  }>>([]);
  const [blockPickerVisible, setBlockPickerVisible] = useState(false);
  const [nextBlockId, setNextBlockId] = useState<string | null>(myBlockId);
  const [blockName, setBlockName] = useState<string>('not set');
  const [fundRoleLabel, setFundRoleLabel] = useState<'Treasurer' | 'Collector' | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const colors = Verandah;
  const roleLabel = (appRole ?? 'resident').charAt(0).toUpperCase() + (appRole ?? 'resident').slice(1);

  useEffect(() => {
    async function fetchDueSoon() {
      if (!user) return;
      try {
        const { data } = await supabase.rpc('get_my_due_soon_count');
        setDueSoonCount(data ?? 0);
      } catch {
        // Non-critical; badge stays at 0
      }
    }
    fetchDueSoon();
  }, [user]);

  useEffect(() => {
    setNextBlockId(myBlockId ?? null);
  }, [myBlockId]);

  useEffect(() => {
    const loadBlockName = async () => {
      if (!communityId || !blocksEnabled || !myBlockId) {
        setBlockName('not set');
        return;
      }

      const { data } = await supabase.rpc('list_community_blocks', { p_community_id: communityId });
      const matched = (data ?? []).find((block: any) => block.id === myBlockId);
      setBlockName(matched?.name ?? 'not set');
    };

    loadBlockName();
  }, [blocksEnabled, communityId, myBlockId]);

  useEffect(() => {
    async function fetchRecentServices() {
      if (!user) return;
      try {
        const { data, error } = await supabase.rpc('get_my_recent_service_history', { p_limit: 5 });
        if (error) throw error;
        setRecentServices((data ?? []) as Array<{
          id: string;
          service_id: string;
          service_name: string;
          serviced_on: string;
          provider_name: string | null;
          cost_paid: number | null;
        }>);
      } catch {
        setRecentServices([]);
      }
    }

    fetchRecentServices();
  }, [user]);

  useEffect(() => {
    const loadFundRole = async () => {
      if (!user?.id || !communityId || !fundsEnabled) {
        setFundRoleLabel(null);
        return;
      }

      const { data, error } = await supabase
        .from('fund_roles')
        .select('role, events!inner(community_id)')
        .eq('user_id', user.id)
        .eq('events.community_id', communityId);

      if (error) {
        setFundRoleLabel(null);
        return;
      }

      const roles = new Set((data ?? []).map((row: any) => row.role));
      if (roles.has('treasurer')) {
        setFundRoleLabel('Treasurer');
      } else if (roles.has('collector')) {
        setFundRoleLabel('Collector');
      } else {
        setFundRoleLabel(null);
      }
    };

    loadFundRole();
  }, [communityId, fundsEnabled, user?.id]);

  const handleSignOut = async () => {
    await signOut();
    // Web users land on the public home page, not the login form — signing out
    // means "I'm done", not "log me in as someone else". Native has no landing
    // page, so it goes to /login.
    if (!goToLanding()) replaceTracked(router, '/login');
  };

  const saveMyBlock = async () => {
    if (!nextBlockId) {
      Toast.show({ type: 'error', text1: `Please select a ${blockLabelLower}` });
      return;
    }
    try {
      const { error } = await supabase.rpc('set_my_block', { p_block_id: nextBlockId });
      if (error) throw error;
      await refreshSession();
      setBlockPickerVisible(false);
      Toast.show({ type: 'success', text1: `${blockLabel} updated` });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: `Unable to update ${blockLabelLower}`, text2: error.message });
    }
  };

  const refreshAllProfileData = useCallback(async () => {
    if (user) {
      try {
        const { data } = await supabase.rpc('get_my_due_soon_count');
        setDueSoonCount(data ?? 0);
      } catch {}
      try {
        const { data } = await supabase.rpc('get_my_recent_service_history', { p_limit: 5 });
        setRecentServices((data ?? []) as any);
      } catch {}
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refreshAllProfileData();
    }, [refreshAllProfileData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAllProfileData();
    setRefreshing(false);
  };

  const webPullProps = useWebPullToRefresh(onRefresh, refreshing);

  return (
    <View style={styles.container}>
      <View style={styles.headerWrapper}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>
      </View>

      <ScrollView
        {...webPullProps.pullProps}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Verandah.accent} />
        }
      >
        <WebPullIndicator pullDistance={webPullProps.pullDistance} refreshing={refreshing} isPulling={webPullProps.isPulling} />
        {/* Dark teal identity card */}
        <View style={styles.identityCard}>
          <View style={styles.profileInfo}>
            <Text style={styles.identityName}>
              {user?.user_metadata?.full_name || 'Resident'}
            </Text>
            <Text style={styles.identityEmail}>
              {user?.email && !user.email.endsWith('@auth.wooru.in')
                ? user.email
                : profile?.phone_number
                  ? `+91 ${profile.phone_number}`
                  : user?.phone || user?.email}
            </Text>
            {profile?.flat_number ? (
              <Text style={styles.identityFlat}>
                Flat / Unit: {profile.flat_number}
              </Text>
            ) : null}
            <View style={styles.identityRoleBadge}>
              <Text style={styles.identityRoleText}>{roleLabel}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => router.push('/profile/edit' as any)} style={{ padding: 8, alignSelf: 'flex-start' }}>
            <Edit01 size={18} color="rgba(240, 237, 227, 0.65)" aria-hidden={true} />
          </TouchableOpacity>
        </View>

        {/* Grouped menu card */}
        <View style={styles.menuCard}>
          <TouchableOpacity
            onPress={() => router.push('/services' as any)}
            style={styles.menuRow}
            activeOpacity={0.82}
          >
            <View style={styles.adminIconWrap}>
              <Tool01 size={18} color={Verandah.accent} aria-hidden={true} />
            </View>
            <View style={styles.adminContent}>
              <Text style={styles.adminTitle}>Service reminders</Text>
              {dueSoonCount > 0 ? (
                <Text style={[styles.adminCopy, { color: Verandah.caution }]}>{dueSoonCount} due or overdue</Text>
              ) : (
                <Text style={styles.adminCopy}>Track appliances &amp; maintenance</Text>
              )}
            </View>
            {dueSoonCount > 0 ? (
              <View style={[styles.pendingBadge, { backgroundColor: Verandah.caution }]}>
                <Text style={styles.pendingBadgeText}>{dueSoonCount}</Text>
              </View>
            ) : (
              <ChevronRight size={18} color={Verandah.textMuted} aria-hidden={true} />
            )}
          </TouchableOpacity>

          <View style={styles.menuDivider} />

          <TouchableOpacity
            onPress={() => router.push('/mcn/my-posts' as any)}
            style={styles.menuRow}
            activeOpacity={0.82}
          >
            <View style={[styles.adminIconWrap, { backgroundColor: Verandah.avatarTints[2].bg }]}>
              <ShoppingBag01 size={18} color={Verandah.avatarTints[2].fg} aria-hidden={true} />
            </View>
            <View style={styles.adminContent}>
              <Text style={styles.adminTitle}>My community posts</Text>
              <Text style={styles.adminCopy}>Business &amp; borrow listings</Text>
            </View>
            <ChevronRight size={18} color={Verandah.textMuted} aria-hidden={true} />
          </TouchableOpacity>

          <View style={styles.menuDivider} />

          <TouchableOpacity
            onPress={() => router.push('/notifications' as any)}
            style={styles.menuRow}
            activeOpacity={0.82}
          >
            <View style={[styles.adminIconWrap, { backgroundColor: Verandah.sand }]}>
              <Bell01 size={18} color={Verandah.goldInk} aria-hidden={true} />
            </View>
            <View style={styles.adminContent}>
              <Text style={styles.adminTitle}>Notifications</Text>
              <Text style={styles.adminCopy}>Drops, visits &amp; funds</Text>
            </View>
            <ChevronRight size={18} color={Verandah.textMuted} aria-hidden={true} />
          </TouchableOpacity>

          {!((user?.app_metadata?.providers || []) as string[]).includes('google') && (
            <>
              <View style={styles.menuDivider} />
              <TouchableOpacity
                onPress={async () => {
                  try {
                    const { error } = await linkGoogleIdentity();
                    if (error) {
                      Toast.show({
                        type: 'error',
                        text1: 'Google Linking Failed',
                        text2: error.message || 'Make sure manual linking is enabled in Supabase settings.',
                      });
                    }
                  } catch (err: any) {
                    Toast.show({
                      type: 'error',
                      text1: 'Linking Error',
                      text2: err?.message || 'Could not link Google account.',
                    });
                  }
                }}
                style={styles.menuRow}
                activeOpacity={0.82}
              >
                <View style={[styles.adminIconWrap, { backgroundColor: 'rgba(234, 67, 53, 0.12)' }]}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#EA4335' }}>G</Text>
                </View>
                <View style={styles.adminContent}>
                  <Text style={styles.adminTitle}>Link Google account</Text>
                  <Text style={styles.adminCopy}>Attach Gmail for one-tap sign-in</Text>
                </View>
                <ChevronRight size={18} color={Verandah.textMuted} aria-hidden={true} />
              </TouchableOpacity>
            </>
          )}

          <View style={styles.menuDivider} />

          {/* Two rows, not one combined "Terms & privacy": each document has
              its own public URL (wooru.in/terms, wooru.in/privacy) and residents
              look for them by name. `?doc=` opens the right tab directly. */}
          <TouchableOpacity
            onPress={() => router.push('/legal?doc=terms' as any)}
            style={styles.menuRow}
            activeOpacity={0.82}
          >
            <View style={[styles.adminIconWrap, { backgroundColor: Verandah.accentSoft }]}>
              <File06 size={18} color={Verandah.accent} aria-hidden={true} />
            </View>
            <View style={styles.adminContent}>
              <Text style={styles.adminTitle}>Terms of service</Text>
              <Text style={styles.adminCopy}>What you agree to by using Wooru</Text>
            </View>
            <ChevronRight size={18} color={Verandah.textMuted} aria-hidden={true} />
          </TouchableOpacity>

          <View style={styles.menuDivider} />

          <TouchableOpacity
            onPress={() => router.push('/legal?doc=privacy' as any)}
            style={styles.menuRow}
            activeOpacity={0.82}
          >
            <View style={[styles.adminIconWrap, { backgroundColor: Verandah.accentSoft }]}>
              <ShieldTick size={18} color={Verandah.accent} aria-hidden={true} />
            </View>
            <View style={styles.adminContent}>
              <Text style={styles.adminTitle}>Privacy policy</Text>
              <Text style={styles.adminCopy}>What we collect and why</Text>
            </View>
            <ChevronRight size={18} color={Verandah.textMuted} aria-hidden={true} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
        >
          <LogOut01 size={18} color={Verandah.danger} aria-hidden={true} />
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>Wooru v1.0.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Verandah.paper,
  },
  headerWrapper: {
    backgroundColor: Verandah.paper,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: VerandahLayout.screenPaddingTop,
    paddingBottom: 6,
  },
  headerTitle: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '400',
    color: Verandah.textPrimary,
    marginTop: 10,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 14,
  },
  card: {
    padding: 14,
    borderRadius: VerandahRadius.card,
    marginBottom: 0,
    borderWidth: VerandahBorder.tile,
    borderColor: Verandah.borderHair,
    backgroundColor: Verandah.card,
    ...Verandah.shadowCard,
  },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: VerandahRadius.card,
    backgroundColor: Verandah.teal900,
    ...Verandah.shadowRaised,
  },
  identityName: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 23,
    color: Verandah.cream,
  },
  identityEmail: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 13,
    fontWeight: '400',
    marginTop: 1,
    color: 'rgba(240, 237, 227, 0.7)',
  },
  identityFlat: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 12.5,
    fontWeight: '500',
    marginTop: 2,
    color: 'rgba(240, 237, 227, 0.7)',
  },
  identityRoleBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: VerandahRadius.pill,
    borderWidth: 0.5,
    borderColor: 'rgba(240, 237, 227, 0.28)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  identityRoleText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: Verandah.cream,
    fontFamily: VerandahType.sansFamily,
  },
  menuCard: {
    borderRadius: VerandahRadius.card,
    borderWidth: VerandahBorder.tile,
    borderColor: Verandah.borderHair,
    backgroundColor: Verandah.card,
    overflow: 'hidden',
    ...Verandah.shadowCard,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 68,
    backgroundColor: Verandah.borderHair,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileInfo: {
    flex: 1,
  },
  name: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 1,
    color: Verandah.textPrimary,
  },
  email: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 13,
    fontWeight: '400',
    color: Verandah.textSecondary,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: VerandahRadius.pill,
    backgroundColor: Verandah.accentSoft,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: Verandah.accent,
    fontFamily: VerandahType.sansFamily,
  },
  section: {
    padding: 14,
    borderRadius: VerandahRadius.card,
    marginBottom: 0,
    borderWidth: VerandahBorder.tile,
    borderColor: Verandah.borderHair,
    backgroundColor: Verandah.card,
    ...Verandah.shadowCard,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  sectionTitle: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 15,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  infoRow: {
    marginVertical: 2,
  },
  label: {
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 4,
    color: Verandah.textTertiary,
    textTransform: 'uppercase',
    fontFamily: VerandahType.sansFamily,
  },
  value: {
    fontSize: 15,
    fontWeight: '400',
    color: Verandah.textPrimary,
    fontFamily: VerandahType.sansFamily,
  },
  codeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  divider: {
    height: 0.5,
    marginVertical: 8,
    backgroundColor: Verandah.borderHair,
  },
  hint: {
    fontSize: 12,
    marginTop: 8,
    lineHeight: 16,
    color: Verandah.textTertiary,
    fontFamily: VerandahType.sansFamily,
  },
  adminCard: {
    borderWidth: VerandahBorder.tile,
    borderColor: Verandah.borderHair,
    borderRadius: VerandahRadius.card,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Verandah.card,
    ...Verandah.shadowCard,
  },
  adminIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Verandah.accentSoft,
  },
  adminIcon: {
    fontSize: 20,
    lineHeight: 22,
  },
  adminContent: {
    flex: 1,
  },
  adminTitle: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 14.5,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  adminCopy: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
    color: Verandah.textSecondary,
  },
  pendingBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  pendingBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: VerandahType.sansFamily,
  },
  chevronIcon: {
    fontSize: 16,
    lineHeight: 18,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Verandah.borderHair,
    gap: 8,
  },
  recentRowMain: {
    flex: 1,
  },
  recentServiceName: {
    fontSize: 13.5,
    fontWeight: '600',
    color: Verandah.textPrimary,
    fontFamily: VerandahType.sansFamily,
  },
  recentServiceMeta: {
    fontSize: 11.5,
    marginTop: 2,
    color: Verandah.textSecondary,
    fontFamily: VerandahType.sansFamily,
  },
  spacer: {
    flex: 1,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: VerandahRadius.button,
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
    borderWidth: 0.5,
    borderColor: 'rgba(217, 45, 32, 0.2)',
    backgroundColor: Verandah.dangerSoft,
  },
  signOutIcon: {
    fontSize: 18,
    lineHeight: 20,
  },
  signOutText: {
    fontSize: 14,
    fontWeight: '600',
    color: Verandah.danger,
    fontFamily: VerandahType.sansFamily,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  codeValue: {
    fontSize: 20,
    fontWeight: '500',
    letterSpacing: 3,
    color: Verandah.textPrimary,
  },
  shareBtn: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  shareBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: Verandah.accent,
  },
  version: {
    textAlign: 'center',
    marginBottom: 40,
    fontSize: 12,
    fontWeight: '400',
    color: Verandah.textMuted,
    fontFamily: VerandahType.sansFamily,
  },
  blockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  blockValue: {
    fontSize: 14,
    fontWeight: '400',
    color: Verandah.textPrimary,
  },
  blockAction: {
    borderWidth: 0.5,
    borderRadius: VerandahRadius.button,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderColor: Verandah.borderHair,
  },
  blockActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: Verandah.primary,
    fontFamily: VerandahType.sansFamily,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    gap: 12,
  },
  modalTitle: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 20,
    fontWeight: '400',
    color: Verandah.textPrimary,
  },
  modalActions: {
    marginTop: 6,
    flexDirection: 'row',
    gap: 10,
  },
  modalSecondary: {
    flex: 1,
    borderWidth: 0.5,
    borderRadius: VerandahRadius.button,
    alignItems: 'center',
    paddingVertical: 12,
    borderColor: Verandah.borderHair,
  },
  modalSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: Verandah.textPrimary,
    fontFamily: VerandahType.sansFamily,
  },
  modalPrimary: {
    flex: 1,
    borderRadius: VerandahRadius.button,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: Verandah.primary,
  },
  modalPrimaryText: {
    color: Verandah.primaryFg,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: VerandahType.sansFamily,
  },
});
