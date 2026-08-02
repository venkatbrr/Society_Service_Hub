import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Avatar } from '../../components/Avatar';
import { BlockPicker } from '../../components/BlockPicker';
import { Rupees } from '../../components/Rupees';
import { useWebPullToRefresh } from '../../components/useWebPullToRefresh';
import { WebPullIndicator } from '../../components/WebPullIndicator';
import { Verandah } from '../../constants/Colors';
import { VerandahRadius, VerandahType , VerandahLayout } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut, appRole, communityId, fundsEnabled, blocksEnabled, blockLabel, myBlockId, refreshSession } = useAuth();
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

  const handleSignOut = () => {
    signOut();
    router.replace('/login');
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

  const refreshAllProfileData = async () => {
    await refreshSession();
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
  };

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
          <Text style={styles.headerTitle}>Settings</Text>
        </View>
      </View>

      <ScrollView
        {...webPullProps.pullProps}
        style={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Verandah.accent} />
        }
      >
        <WebPullIndicator pullDistance={webPullProps.pullDistance} refreshing={refreshing} isPulling={webPullProps.isPulling} />
        <View style={styles.card}>
          <View style={styles.profileHeader}>
            <Avatar name={String(user?.user_metadata?.full_name || 'User')} size={52} />
            <View style={styles.profileInfo}>
              <Text style={styles.name}>
                {user?.user_metadata?.full_name || 'User'}
              </Text>
              <Text style={styles.email}>
                {user?.email}
              </Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>
                  You are: {roleLabel}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => router.push('/profile/edit' as any)} style={{ padding: 8, alignSelf: 'flex-start' }}>
              <Ionicons name="pencil" size={20} color={Verandah.textTertiary} />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => router.push('/services' as any)}
          style={styles.adminCard}
          activeOpacity={0.82}
        >
          <View style={styles.adminIconWrap}>
            <Ionicons name="build-outline" size={18} color={Verandah.textTertiary} />
          </View>
          <View style={styles.adminContent}>
            <Text style={styles.adminTitle}>Service reminders</Text>
            {dueSoonCount > 0 ? (
              <Text style={[styles.adminCopy, { color: Verandah.caution }]}>{dueSoonCount} due this week</Text>
            ) : (
              <Text style={styles.adminCopy}>Track appliances &amp; maintenance</Text>
            )}
          </View>
          {dueSoonCount > 0 ? (
            <View style={[styles.pendingBadge, { backgroundColor: Verandah.caution }]}>
              <Text style={styles.pendingBadgeText}>{dueSoonCount}</Text>
            </View>
          ) : (
            <Ionicons name="chevron-forward" size={18} color={Verandah.textMuted} />
          )}
        </TouchableOpacity>



        <TouchableOpacity
          onPress={() => router.push('/network/my-posts' as any)}
          style={styles.adminCard}
          activeOpacity={0.82}
        >
          <View style={styles.adminIconWrap}>
            <Ionicons name="storefront-outline" size={18} color={Verandah.textTertiary} />
          </View>
          <View style={styles.adminContent}>
            <Text style={styles.adminTitle}>My community posts</Text>
            <Text style={styles.adminCopy}>Manage your business and borrow listings</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Verandah.textMuted} />
        </TouchableOpacity>



        {blocksEnabled && communityId ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="cube-outline" size={18} color={Verandah.textTertiary} />
              <Text style={styles.sectionTitle}>Your {blockLabelLower}</Text>
            </View>
            <View style={styles.blockRow}>
              <Text style={styles.blockValue}>Your {blockLabelLower}: {blockName}</Text>
              <TouchableOpacity style={styles.blockAction} onPress={() => setBlockPickerVisible(true)}>
                <Text style={styles.blockActionText}>{myBlockId ? 'Change' : 'Set'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
        >
          <Ionicons name="log-out-outline" size={18} color={Verandah.danger} />
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>Society Service Hub v1.0.0</Text>
      </ScrollView>

      <Modal visible={blockPickerVisible} transparent animationType="slide" onRequestClose={() => setBlockPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: Verandah.card }]}>
            <Text style={styles.modalTitle}>Set your {blockLabelLower}</Text>
            {communityId ? <BlockPicker value={nextBlockId} onChange={setNextBlockId} communityId={communityId} label={blockLabel} hideAllResidents={true} /> : null}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalSecondary} onPress={() => setBlockPickerVisible(false)}>
                <Text style={styles.modalSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalPrimary} onPress={saveMyBlock}>
                <Text style={styles.modalPrimaryText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  headerWrapper: {
    backgroundColor: Verandah.surface,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: VerandahLayout.screenPaddingTop,
    paddingBottom: 6,
  },
  headerTitle: {
    ...VerandahType.display,
    color: Verandah.textPrimary,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  card: {
    padding: 10,
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Verandah.borderStrong,
    backgroundColor: Verandah.card,
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
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 1,
    color: Verandah.textPrimary,
  },
  email: {
    fontSize: 13,
    fontWeight: '400',
    color: Verandah.textSecondary,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Verandah.accentSoft,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: Verandah.accent,
  },
  section: {
    padding: 10,
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Verandah.borderStrong,
    backgroundColor: Verandah.card,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: Verandah.textPrimary,
  },
  infoRow: {
    marginVertical: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 1,
    marginBottom: 4,
    color: Verandah.textTertiary,
  },
  value: {
    fontSize: 16,
    fontWeight: '400',
    color: Verandah.textPrimary,
  },
  codeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  divider: {
    height: 1,
    marginVertical: 8,
    backgroundColor: Verandah.border,
  },
  hint: {
    fontSize: 12,
    marginTop: 8,
    lineHeight: 16,
    color: Verandah.textTertiary,
  },
  adminCard: {
    borderWidth: 1,
    borderColor: Verandah.borderStrong,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Verandah.card,
  },
  adminIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
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
    fontSize: 15,
    fontWeight: '500',
    color: Verandah.textPrimary,
  },
  adminCopy: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
    color: Verandah.textSecondary,
  },
  pendingBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  pendingBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '500',
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
    borderTopColor: Verandah.border,
    gap: 8,
  },
  recentRowMain: {
    flex: 1,
  },
  recentServiceName: {
    fontSize: 14,
    fontWeight: '500',
    color: Verandah.textPrimary,
  },
  recentServiceMeta: {
    fontSize: 12,
    marginTop: 2,
    color: Verandah.textSecondary,
  },
  spacer: {
    flex: 1,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    gap: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Verandah.dangerSoft,
    backgroundColor: Verandah.dangerSoft,
  },
  signOutIcon: {
    fontSize: 18,
    lineHeight: 20,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '500',
    color: Verandah.danger,
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
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderColor: Verandah.borderStrong,
  },
  blockActionText: {
    fontSize: 12,
    fontWeight: '500',
    color: Verandah.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    gap: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '500',
    color: Verandah.textPrimary,
  },
  modalActions: {
    marginTop: 6,
    flexDirection: 'row',
    gap: 10,
  },
  modalSecondary: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
    borderColor: Verandah.borderStrong,
  },
  modalSecondaryText: {
    fontSize: 14,
    fontWeight: '500',
    color: Verandah.textPrimary,
  },
  modalPrimary: {
    flex: 1,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: Verandah.primary,
  },
  modalPrimaryText: {
    color: Verandah.primaryFg,
    fontSize: 14,
    fontWeight: '500',
  },
});
