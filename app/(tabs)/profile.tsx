import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { BlockPicker } from '../../components/BlockPicker';
import { Colors } from '../../constants/Colors';
import { APP_EMOJIS } from '../../constants/emojis';
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

  const colors = Colors.light;
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.background, colors.surface2, colors.background]}
        locations={[0, 0.5, 1]}
        style={styles.headerGradient}
      >
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        </View>
      </LinearGradient>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <View style={styles.profileHeader}>
            {user?.user_metadata?.avatar_url ? (
              <Image
                source={{ uri: user.user_metadata.avatar_url }}
                style={styles.avatar}
              />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary + '12' }]}>
                <Text style={styles.avatarEmoji}>{APP_EMOJIS.profile}</Text>
              </View>
            )}
            <View style={styles.profileInfo}>
              <Text style={[styles.name, { color: colors.text }]}>
                {user?.user_metadata?.full_name || 'User'}
              </Text>
              <Text style={[styles.email, { color: colors.textMuted }]}>
                {user?.email}
              </Text>
              <View style={[styles.roleBadge, { backgroundColor: colors.glass, borderColor: colors.glassBorder, borderWidth: 1 }]}>
                <Text style={[styles.roleBadgeText, { color: colors.primary }]}>
                  You are: {roleLabel}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => router.push('/services' as any)}
          style={[styles.adminCard, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
          activeOpacity={0.82}
        >
          <View style={[styles.adminIconWrap, { backgroundColor: `${colors.primary}12` }]}>
            <Text style={styles.adminIcon}>🔧</Text>
          </View>
          <View style={styles.adminContent}>
            <Text style={[styles.adminTitle, { color: colors.text }]}>My Service Reminders</Text>
            {dueSoonCount > 0 ? (
              <Text style={[styles.adminCopy, { color: '#B45309' }]}>{dueSoonCount} due this week</Text>
            ) : (
              <Text style={[styles.adminCopy, { color: colors.textMuted }]}>Track appliances & maintenance</Text>
            )}
          </View>
          {dueSoonCount > 0 ? (
            <View style={[styles.pendingBadge, { backgroundColor: '#F59E0B' }]}>
              <Text style={styles.pendingBadgeText}>{dueSoonCount}</Text>
            </View>
          ) : (
            <Text style={styles.chevronIcon}>{APP_EMOJIS.chevronRight}</Text>
          )}
        </TouchableOpacity>

        {recentServices.length > 0 ? (
          <View style={[styles.section, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.adminIcon}>🧾</Text>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent home services</Text>
            </View>

            {recentServices.map((entry) => (
              <TouchableOpacity
                key={entry.id}
                style={styles.recentRow}
                onPress={() => router.push({ pathname: '/services/[id]', params: { id: entry.service_id } } as any)}
                activeOpacity={0.82}
              >
                <View style={styles.recentRowMain}>
                  <Text style={[styles.recentServiceName, { color: colors.text }]} numberOfLines={1}>{entry.service_name}</Text>
                  <Text style={[styles.recentServiceMeta, { color: colors.textMuted }]} numberOfLines={1}>
                    {new Date(entry.serviced_on).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {entry.provider_name ? ` · ${entry.provider_name}` : ''}
                  </Text>
                </View>
                {entry.cost_paid != null ? (
                  <Text style={[styles.recentCost, { color: colors.text }]}>₹{Number(entry.cost_paid).toFixed(0)}</Text>
                ) : (
                  <Text style={styles.chevronIcon}>{APP_EMOJIS.chevronRight}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {fundsEnabled && blocksEnabled && communityId ? (
          <View style={[styles.section, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.adminIcon}>🏷️</Text>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Your block</Text>
            </View>
            <View style={styles.blockRow}>
              <Text style={[styles.blockValue, { color: colors.text }]}>Your block: {blockName}</Text>
              <TouchableOpacity style={[styles.blockAction, { borderColor: colors.border }]} onPress={() => setBlockPickerVisible(true)}>
                <Text style={[styles.blockActionText, { color: colors.primary }]}>{myBlockId ? 'Change' : 'Set'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.signOutButton, { backgroundColor: colors.accent + '10' }]}
          onPress={handleSignOut}
        >
          <Text style={styles.signOutIcon}>{APP_EMOJIS.close}</Text>
          <Text style={[styles.signOutText, { color: colors.accent }]}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={[styles.version, { color: colors.textMuted }]}>Society Service Hub v1.0.0</Text>
      </ScrollView>

      <Modal visible={blockPickerVisible} transparent animationType="slide" onRequestClose={() => setBlockPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Set your block</Text>
            {communityId ? <BlockPicker value={nextBlockId} onChange={setNextBlockId} communityId={communityId} /> : null}
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalSecondary, { borderColor: colors.border }]} onPress={() => setBlockPickerVisible(false)}>
                <Text style={[styles.modalSecondaryText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalPrimary, { backgroundColor: colors.primary }]} onPress={saveMyBlock}>
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
  },
  headerGradient: {
    paddingHorizontal: 0,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  card: {
    padding: 20,
    borderRadius: 24,
    marginBottom: 14,
    borderWidth: 1,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 0,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarEmoji: {
    fontSize: 32,
    lineHeight: 36,
  },
  profileInfo: {
    flex: 1,
  },
  name: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 2,
  },
  email: {
    fontSize: 14,
    fontWeight: '500',
  },
  roleBadge: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  section: {
    padding: 20,
    borderRadius: 24,
    marginBottom: 14,
    borderWidth: 1,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  infoRow: {
    marginVertical: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
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
  },
  hint: {
    fontSize: 12,
    marginTop: 12,
    lineHeight: 18,
  },
  adminCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 0,
  },
  adminIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontWeight: '800',
  },
  adminCopy: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
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
    fontWeight: '800',
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
    borderTopColor: '#DDEFE1',
    gap: 8,
  },
  recentRowMain: {
    flex: 1,
  },
  recentServiceName: {
    fontSize: 14,
    fontWeight: '700',
  },
  recentServiceMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  recentCost: {
    fontSize: 13,
    fontWeight: '700',
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
  },
  signOutIcon: {
    fontSize: 20,
    lineHeight: 22,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '700',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  codeValue: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 3,
  },
  shareBtn: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  shareBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  version: {
    textAlign: 'center',
    marginBottom: 40,
    fontSize: 12,
    fontWeight: '500',
  },
  blockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  blockValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  blockAction: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  blockActionText: {
    fontSize: 12,
    fontWeight: '800',
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
    fontWeight: '800',
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
  },
  modalSecondaryText: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalPrimary: {
    flex: 1,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  modalPrimaryText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
