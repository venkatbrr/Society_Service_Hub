import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut, communityId, appRole } = useAuth();
  const [communityDetails, setCommunityDetails] = useState<{ name: string; city: string | null; area: string | null; community_type: string | null } | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const colors = Colors.light;
  const roleLabel = (appRole ?? 'resident').charAt(0).toUpperCase() + (appRole ?? 'resident').slice(1);

  useEffect(() => {
    async function fetchCommunity() {
      if (communityId) {
        const { data, error } = await supabase
          .from('communities')
          .select('name, city, area, community_type')
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

    async function fetchPendingCount() {
      if (appRole !== 'admin' || !communityId) {
        setPendingCount(0);
        return;
      }

      const { count, error } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('community_id', communityId)
          .eq('approval_status', 'pending');

      if (error) {
        console.error('Error loading pending approvals:', error);
        return;
      }

      setPendingCount(count ?? 0);
    }

    fetchCommunity();
    fetchPendingCount();
  }, [appRole, communityId]);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error signing out' });
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

      <View style={styles.scrollContent}>
        <View style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <View style={styles.profileHeader}>
            {user?.user_metadata?.avatar_url ? (
              <Image
                source={{ uri: user.user_metadata.avatar_url }}
                style={styles.avatar}
              />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary + '12' }]}>
                <Ionicons name="person" size={32} color={colors.primary} />
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
                  App Role: {roleLabel}
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
        </View>

        {appRole === 'admin' ? (
          <TouchableOpacity
            onPress={() => router.push('/admin/approvals')}
            style={[styles.adminCard, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
            activeOpacity={0.82}
          >
            <View style={[styles.adminIconWrap, { backgroundColor: `${colors.primary}12` }]}>
              <Ionicons name="shield-checkmark-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.adminContent}>
              <Text style={[styles.adminTitle, { color: colors.text }]}>Member approvals</Text>
              <Text style={[styles.adminCopy, { color: colors.textMuted }]}>{pendingCount > 0 ? `${pendingCount} requests waiting for review` : 'No pending requests right now'}</Text>
            </View>
            {pendingCount > 0 ? (
              <View style={[styles.pendingBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.pendingBadgeText}>{pendingCount}</Text>
              </View>
            ) : null}
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}

        <View style={styles.spacer} />

        <TouchableOpacity
          style={[styles.signOutButton, { backgroundColor: colors.accent + '10' }]}
          onPress={handleSignOut}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.accent} />
          <Text style={[styles.signOutText, { color: colors.accent }]}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={[styles.version, { color: colors.textMuted }]}>Society Service Hub v1.0.0</Text>
      </View>
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
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  card: {
    padding: 20,
    borderRadius: 24,
    marginBottom: 24,
    borderWidth: 1,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 2,
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
    marginBottom: 24,
    borderWidth: 1,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 2,
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
    marginVertical: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
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
  codeValue: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 2,
  },
  divider: {
    height: 1,
    marginVertical: 16,
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
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 2,
  },
  adminIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
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
  signOutText: {
    fontSize: 16,
    fontWeight: '700',
  },
  version: {
    textAlign: 'center',
    marginBottom: 40,
    fontSize: 12,
    fontWeight: '500',
  },
});
