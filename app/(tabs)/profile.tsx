import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Colors } from '../../constants/Colors';
import { APP_EMOJIS } from '../../constants/emojis';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut, communityId, appRole, isCommunityLead } = useAuth();
  const [communityDetails, setCommunityDetails] = useState<{ name: string; city: string | null; area: string | null; community_type: string | null; code: string | null } | null>(null);
  const [dueSoonCount, setDueSoonCount] = useState<number>(0);
  const [recentServices, setRecentServices] = useState<Array<{
    id: string;
    service_id: string;
    service_name: string;
    serviced_on: string;
    provider_name: string | null;
    cost_paid: number | null;
  }>>([]);

  const colors = Colors.light;
  const roleLabel = (appRole ?? 'resident').charAt(0).toUpperCase() + (appRole ?? 'resident').slice(1);

  useEffect(() => {
    async function fetchCommunity() {
      if (communityId) {
        const { data, error } = await supabase
          .from('communities')
          .select('name, city, area, community_type, code')
          .eq('id', communityId)
          .maybeSingle();

        if (error) {
          console.error('Error loading community details:', error);
          return;
        }

        if (data) {
          setCommunityDetails(data);
        }
      }
    }

    fetchCommunity();
  }, [communityId]);

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

  const handleInviteNeighbors = async () => {
    if (!communityDetails?.code) {
      Toast.show({ type: 'error', text1: 'Invite code unavailable', text2: 'Community code is not ready yet.' });
      return;
    }

    try {
      await Share.share({
        message: `Join my community on Society Service Hub!${communityDetails.name ? `\nCommunity: ${communityDetails.name}` : ''}\nCode: ${communityDetails.code}`,
      });
    } catch {
      Toast.show({ type: 'error', text1: 'Share failed', text2: 'Could not open share options.' });
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

        <View style={[styles.section, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: colors.textMuted }]}>NAME</Text>
            <Text style={[styles.value, { color: colors.text }]}>{communityDetails?.name || '---'}</Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: colors.textMuted }]}>LOCATION</Text>
            <Text style={[styles.value, { color: colors.text }]}>{communityDetails?.area || communityDetails?.city || '---'}</Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: colors.textMuted }]}>TYPE</Text>
            <Text style={[styles.value, { color: colors.text, textTransform: 'capitalize' }]}>{communityDetails?.community_type || '---'}</Text>
          </View>

          {isCommunityLead && communityDetails?.code ? (
            <>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.infoRow}>
                <Text style={[styles.label, { color: colors.textMuted }]}>JOIN CODE</Text>
                <View style={styles.codeRow}>
                  <Text style={[styles.codeValue, { color: colors.primary }]}>{communityDetails.code}</Text>
                  <TouchableOpacity
                    onPress={handleInviteNeighbors}
                    style={[styles.shareBtn, { backgroundColor: `${colors.primary}10` }]}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.shareBtnText, { color: colors.primary }]}>{APP_EMOJIS.share} Share</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          ) : null}
        </View>

        <TouchableOpacity
          onPress={handleInviteNeighbors}
          style={[styles.adminCard, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
          activeOpacity={0.82}
        >
          <View style={[styles.adminIconWrap, { backgroundColor: `${colors.secondary}12` }]}>
            <Text style={styles.adminIcon}>{APP_EMOJIS.share}</Text>
          </View>
          <View style={styles.adminContent}>
            <Text style={[styles.adminTitle, { color: colors.text }]}>Invite neighbours</Text>
            <Text style={[styles.adminCopy, { color: colors.textMuted }]}>Share your community code so others can join</Text>
          </View>
          <Text style={styles.chevronIcon}>{APP_EMOJIS.chevronRight}</Text>
        </TouchableOpacity>

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

        <TouchableOpacity
          onPress={() => router.push({ pathname: '/residents', params: { returnTo: 'profile' } } as any)}
          style={[styles.adminCard, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
          activeOpacity={0.82}
        >
          <View style={[styles.adminIconWrap, { backgroundColor: `${colors.secondary}12` }]}>
            <Text style={styles.adminIcon}>{APP_EMOJIS.members}</Text>
          </View>
          <View style={styles.adminContent}>
            <Text style={[styles.adminTitle, { color: colors.text }]}>Community directory</Text>
            <Text style={[styles.adminCopy, { color: colors.textMuted }]}>Browse residents in your community</Text>
          </View>
          <Text style={styles.chevronIcon}>{APP_EMOJIS.chevronRight}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.signOutButton, { backgroundColor: colors.accent + '10' }]}
          onPress={handleSignOut}
        >
          <Text style={styles.signOutIcon}>{APP_EMOJIS.close}</Text>
          <Text style={[styles.signOutText, { color: colors.accent }]}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={[styles.version, { color: colors.textMuted }]}>Society Service Hub v1.0.0</Text>
      </ScrollView>
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
});
