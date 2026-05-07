import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Colors } from '../../constants/Colors';
import { supabase } from '../../lib/supabase';

type FundsRequestRow = {
  id: string;
  community_id: string;
  requested_by: string;
  contact_name: string;
  contact_phone: string;
  purpose: string | null;
  status: string;
  created_at: string;
  communities: { name: string | null; code: string | null; address: string | null } | null;
  profiles: { full_name: string | null } | null;
};

export default function PlatformFundsRequestsScreen() {
  const router = useRouter();
  const colors = Colors.light;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requests, setRequests] = useState<FundsRequestRow[]>([]);

  const load = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    else setLoading(true);

    const { data, error } = await supabase
      .from('funds_access_requests')
      .select('id, community_id, requested_by, contact_name, contact_phone, purpose, status, created_at, communities(name, code, address), profiles!funds_access_requests_requested_by_fkey(full_name)')
      .order('created_at', { ascending: false });

    if (error) {
      Toast.show({ type: 'error', text1: 'Unable to load funds requests', text2: error.message });
    } else {
      setRequests((data ?? []) as unknown as FundsRequestRow[]);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}> 
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      <Text style={[styles.title, { color: colors.text }]}>Funds access requests</Text>
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        contentContainerStyle={{ paddingBottom: 28 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, { borderColor: colors.border, backgroundColor: colors.glass }]}
            onPress={() => router.push({ pathname: '/platform/funds-access/[requestId]', params: { requestId: item.id } } as any)}
          >
            <Text style={[styles.community, { color: colors.text }]}>{item.communities?.name ?? 'Community'}</Text>
            <Text style={[styles.meta, { color: colors.textMuted }]}>Requester: {item.profiles?.full_name ?? 'Resident'}</Text>
            <Text style={[styles.meta, { color: colors.textMuted }]}>Contact: {item.contact_name} - {item.contact_phone}</Text>
            {item.purpose ? <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={2}>{item.purpose}</Text> : null}
            <Text style={[styles.status, { color: item.status === 'pending' ? '#B45309' : colors.textMuted }]}>{item.status}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 58, paddingHorizontal: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 12 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10 },
  community: { fontSize: 16, fontWeight: '800' },
  meta: { marginTop: 3, fontSize: 13 },
  status: { marginTop: 8, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
});
