import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Avatar } from '../../components/Avatar';
import { BlockPicker } from '../../components/BlockPicker';
import { Rupees } from '../../components/Rupees';
import { Verandah } from '../../constants/Colors';
import { APP_EMOJIS } from '../../constants/emojis';
import { VerandahRadius, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut, appRole, communityId, fundsEnabled, blocksEnabled, myBlockId, refreshSession } = useAuth();
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

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error signing out' });
    }
  };

  const saveMyBlock = async () => {
    try {
      const { error } = await supabase.rpc('set_my_block', { p_block_id: nextBlockId });
      if (error) throw error;
      await refreshSession();
      setBlockPickerVisible(false);
      Toast.show({ type: 'success', text1: 'Block updated' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to update block', text2: error.message });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerWrapper}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.profileHeader}>
            <Avatar name={String(user?.user_metadata?.full_name || 'User')} size={64} />
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

        {recentServices.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="document-text-outline" size={18} color={Verandah.textTertiary} />
              <Text style={styles.sectionTitle}>Recent home services</Text>
            </View>

            {recentServices.map((entry) => (
              <TouchableOpacity
                key={entry.id}
                style={styles.recentRow}
                onPress={() => router.push({ pathname: '/services/[id]', params: { id: entry.service_id } } as any)}
                activeOpacity={0.82}
              >
                <View style={styles.recentRowMain}>
                  <Text style={styles.recentServiceName} numberOfLines={1}>{entry.service_name}</Text>
                  <Text style={styles.recentServiceMeta} numberOfLines={1}>
                    {new Date(entry.serviced_on).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {entry.provider_name ? ` · ${entry.provider_name}` : ''}
                  </Text>
                </View>
                {entry.cost_paid != null ? (
                  <Rupees amount={Number(entry.cost_paid)} size="sm" />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={Verandah.textMuted} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {fundsEnabled && blocksEnabled && communityId ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="cube-outline" size={18} color={Verandah.textTertiary} />
              <Text style={styles.sectionTitle}>Your block</Text>
            </View>
            <View style={styles.blockRow}>
              <Text style={styles.blockValue}>Your block: {blockName}</Text>
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
            <Text style={styles.modalTitle}>Set your block</Text>
            {communityId ? <BlockPicker value={nextBlockId} onChange={setNextBlockId} communityId={communityId} /> : null}
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
  },
  headerWrapper: {
    backgroundColor: Verandah.surface,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
  },
  headerTitle: {
    ...VerandahType.display,
    color: Verandah.textPrimary,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  card: {
    padding: 20,
    borderRadius: VerandahRadius.lg,
    marginBottom: 14,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    backgroundColor: Verandah.card,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  profileInfo: {
    flex: 1,
  },
  name: {
    fontSize: 20,
    fontWeight: '500',
    marginBottom: 2,
    color: Verandah.textPrimary,
  },
  email: {
    fontSize: 14,
    fontWeight: '400',
    color: Verandah.textSecondary,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Verandah.accentSoft,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: Verandah.accent,
  },
  section: {
    padding: 20,
    borderRadius: VerandahRadius.lg,
    marginBottom: 14,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    backgroundColor: Verandah.card,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
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
    marginVertical: 12,
    backgroundColor: Verandah.border,
  },
  hint: {
    fontSize: 12,
    marginTop: 12,
    lineHeight: 18,
    color: Verandah.textTertiary,
  },
  adminCard: {
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.lg,
    padding: 18,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Verandah.card,
  },
  adminIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Verandah.accentSoft,
  },
  adminIcon: {
    fontSize: 22,
    lineHeight: 24,
  },
  adminContent: {
    flex: 1,
  },
  adminTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: Verandah.textPrimary,
  },
  adminCopy: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    color: Verandah.textSecondary,
  },
  pendingBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  pendingBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '500',
  },
  chevronIcon: {
    fontSize: 18,
    lineHeight: 20,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
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
    padding: 16,
    borderRadius: 18,
    gap: 8,
    marginBottom: 16,
    backgroundColor: Verandah.dangerSoft,
  },
  signOutIcon: {
    fontSize: 20,
    lineHeight: 22,
  },
  signOutText: {
    fontSize: 16,
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
