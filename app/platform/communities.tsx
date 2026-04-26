import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Colors } from '../../constants/Colors';
import { APP_EMOJIS } from '../../constants/emojis';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

type CommunityRow = {
  id: string;
  name: string;
  city: string | null;
  community_type: string | null;
  created_at: string | null;
  member_count: number;
  lead_count: number;
};

const relativeTime = (dateValue: string | null) => {
  if (!dateValue) return 'Unknown';
  const diffMs = Date.now() - new Date(dateValue).getTime();
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

export default function PlatformCommunitiesScreen() {
  const colors = Colors.light;
  const router = useRouter();
  const { isPlatformAdmin, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [communities, setCommunities] = useState<CommunityRow[]>([]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return communities;
    return communities.filter((row) => row.name.toLowerCase().includes(term) || (row.city || '').toLowerCase().includes(term));
  }, [communities, search]);

  const loadCommunities = useCallback(async (showRefreshing = false) => {
    if (!isPlatformAdmin) {
      setCommunities([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (showRefreshing) setRefreshing(true);
    else setLoading(true);

    try {
      const { data, error } = await supabase
        .from('communities')
        .select('id, name, city, community_type, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = data ?? [];
      if (!rows.length) {
        setCommunities([]);
        return;
      }

      const communityIds = rows.map((row) => row.id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('community_id, app_role, removed_at')
        .in('community_id', communityIds);

      if (profilesError) throw profilesError;

      const grouped = new Map<string, { members: number; leads: number }>();
      rows.forEach((row) => grouped.set(row.id, { members: 0, leads: 0 }));

      (profiles ?? []).forEach((profile) => {
        if (!profile.community_id || profile.removed_at) return;
        const entry = grouped.get(profile.community_id);
        if (!entry) return;
        entry.members += 1;
        if (profile.app_role === 'community_lead') entry.leads += 1;
      });

      setCommunities(
        rows.map((row) => ({
          ...row,
          member_count: grouped.get(row.id)?.members ?? 0,
          lead_count: grouped.get(row.id)?.leads ?? 0,
        }))
      );
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to load communities', text2: error.message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isPlatformAdmin]);

  useFocusEffect(
    useCallback(() => {
      loadCommunities();
    }, [loadCommunities])
  );

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace('/login');
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Sign out failed', text2: error.message ?? 'Please try again.' });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={[`${colors.warning}18`, `${colors.gradientEnd}10`, 'transparent']} style={styles.gradientOverlay} />
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={[styles.title, { color: colors.text }]}>Communities</Text>
          <TouchableOpacity style={[styles.signOutBtn, { borderColor: colors.border }]} onPress={handleSignOut}>
            <Text style={styles.signOutIcon}>{APP_EMOJIS.close}</Text>
            <Text style={[styles.signOutText, { color: colors.text }]}>Logout</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Search and inspect communities with resident stats.</Text>
      </View>

      <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Text style={styles.searchIcon}>{APP_EMOJIS.search}</Text>
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search by community or city"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <View style={styles.loaderWrap}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadCommunities(true)} />}
          contentContainerStyle={filtered.length ? styles.listContent : styles.emptyContent}
          ListEmptyComponent={
            <View style={[styles.emptyState, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
              <Text style={styles.emptyIcon}>{APP_EMOJIS.community}</Text>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No communities found</Text>
              <Text style={[styles.emptyCopy, { color: colors.textMuted }]}>Try a different search term.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
              onPress={() => router.push(`/platform/community/${item.id}` as any)}
              activeOpacity={0.85}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderText}>
                  <Text style={[styles.communityName, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.communityMeta, { color: colors.textMuted }]}>
                    {item.city || 'City unavailable'}{item.community_type ? ` • ${item.community_type}` : ''}
                  </Text>
                </View>
                {item.lead_count > 0 ? (
                  <View style={[styles.leadBadge, { backgroundColor: `${colors.primary}14` }]}>
                    <Text style={[styles.leadBadgeText, { color: colors.primary }]}>{item.lead_count} lead{item.lead_count !== 1 ? 's' : ''}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.countRow}>
                <Text style={[styles.countText, { color: colors.textMuted }]}>Members: {item.member_count}</Text>
                <Text style={[styles.countText, { color: colors.textMuted }]}>Created: {relativeTime(item.created_at)}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 56 },
  gradientOverlay: { position: 'absolute', top: 0, left: 0, right: 0, height: 280 },
  header: { marginBottom: 14 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { marginTop: 4, fontSize: 14, lineHeight: 20 },
  signOutBtn: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  signOutIcon: { fontSize: 14, lineHeight: 16 },
  signOutText: { fontSize: 12, fontWeight: '700' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 18, paddingHorizontal: 14, height: 50, marginBottom: 14 },
  searchIcon: { fontSize: 16, lineHeight: 18 },
  searchInput: { flex: 1, fontSize: 14 },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingBottom: 32, gap: 12 },
  emptyContent: { flexGrow: 1, justifyContent: 'center' },
  emptyState: { borderWidth: 1, borderRadius: 24, padding: 24, alignItems: 'center' },
  emptyIcon: { fontSize: 28, lineHeight: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '800', marginTop: 12 },
  emptyCopy: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 6 },
  card: { borderWidth: 1, borderRadius: 22, padding: 16 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  cardHeaderText: { flex: 1 },
  communityName: { fontSize: 17, fontWeight: '800' },
  communityMeta: { fontSize: 13, marginTop: 4 },
  leadBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  leadBadgeText: { fontSize: 12, fontWeight: '700' },
  countRow: { marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  countText: { fontSize: 12, fontWeight: '600' },
});
