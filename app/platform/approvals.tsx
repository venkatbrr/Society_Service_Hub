import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

type PendingRequest = {
  id: string;
  name: string;
  community_type: string;
  city: string;
  pincode: string;
  area: string | null;
  approximate_units: string | null;
  requester_role: string;
  nominated_admin_name: string | null;
  nominated_admin_contact: string | null;
  requested_by: string;
  created_at: string;
  requester_name: string | null;
  requester_phone: string | null;
};

const relativeTime = (dateValue: string) => {
  const diffMs = Date.now() - new Date(dateValue).getTime();
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

export default function PlatformApprovalsScreen() {
  const colors = Colors.light;
  const router = useRouter();
  const { isPlatformAdmin, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [requests, setRequests] = useState<PendingRequest[]>([]);

  const loadRequests = useCallback(async (showRefreshing = false) => {
    if (!isPlatformAdmin) {
      setRequests([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (showRefreshing) setRefreshing(true);
    else setLoading(true);

    try {
      const { data, error } = await supabase
        .from('community_requests')
        .select('id, name, community_type, city, pincode, area, approximate_units, requester_role, nominated_admin_name, nominated_admin_contact, requested_by, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const requestRows = data ?? [];
      if (!requestRows.length) {
        setRequests([]);
        return;
      }

      const requesterIds = [...new Set(requestRows.map((row) => row.requested_by))];
      const { data: requesterProfiles, error: requesterError } = await supabase
        .from('profiles')
        .select('id, full_name, phone_number')
        .in('id', requesterIds);

      if (requesterError) throw requesterError;

      const profileMap = new Map((requesterProfiles ?? []).map((row) => [row.id, row]));

      setRequests(
        requestRows.map((row) => ({
          ...row,
          requester_name: profileMap.get(row.requested_by)?.full_name ?? null,
          requester_phone: profileMap.get(row.requested_by)?.phone_number ?? null,
        }))
      );
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to load requests', text2: error.message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isPlatformAdmin]);

  useFocusEffect(
    useCallback(() => {
      loadRequests();
    }, [loadRequests])
  );

  const handleApprove = async (requestId: string) => {
    Alert.alert('Approve community request?', 'This will create the community and promote the requester to community admin.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve',
        onPress: async () => {
          setProcessingId(requestId);
          try {
            await supabase.rpc('set_audit_actor', { p_actor_id: (await supabase.auth.getUser()).data.user?.id });
            const { error } = await supabase.rpc('platform_approve_community_request', { p_request_id: requestId });
            if (error) throw error;

            Toast.show({ type: 'success', text1: 'Community approved' });
            await loadRequests();
          } catch (error: any) {
            Toast.show({ type: 'error', text1: 'Approval failed', text2: error.message });
          } finally {
            setProcessingId(null);
          }
        },
      },
    ]);
  };

  const handleReject = async (requestId: string) => {
    setProcessingId(requestId);
    try {
      await supabase.rpc('set_audit_actor', { p_actor_id: (await supabase.auth.getUser()).data.user?.id });
      const { error } = await supabase.rpc('platform_reject_community_request', {
        p_request_id: requestId,
        p_rejection_reason: rejectionReason.trim() || null,
      });
      if (error) throw error;

      setRejectingId(null);
      setRejectionReason('');
      Toast.show({ type: 'success', text1: 'Request rejected' });
      await loadRequests();
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Rejection failed', text2: error.message });
    } finally {
      setProcessingId(null);
    }
  };

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
      <LinearGradient colors={[`${colors.primary}18`, `${colors.gradientEnd}10`, 'transparent']} style={styles.gradientOverlay} />
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={[styles.title, { color: colors.text }]}>Community approvals</Text>
          <TouchableOpacity style={[styles.signOutBtn, { borderColor: colors.border }]} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={16} color={colors.text} />
            <Text style={[styles.signOutText, { color: colors.text }]}>Logout</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Review and approve new community creation requests.</Text>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadRequests(true)} />}
          contentContainerStyle={requests.length ? styles.listContent : styles.emptyContent}
          ListEmptyComponent={
            <View style={[styles.emptyState, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}> 
              <Ionicons name="checkmark-done-circle-outline" size={28} color={colors.secondary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No pending requests</Text>
              <Text style={[styles.emptyCopy, { color: colors.textMuted }]}>New community requests will show up here.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const busy = processingId === item.id;
            const rejecting = rejectingId === item.id;

            return (
              <View style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}> 
                <View style={styles.cardHeader}>
                  <Text style={[styles.communityName, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.time, { color: colors.textMuted }]}>{relativeTime(item.created_at)}</Text>
                </View>
                <Text style={[styles.meta, { color: colors.textMuted }]}>Type: {item.community_type}</Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>Location: {item.city} {item.area ? `• ${item.area}` : ''}</Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>Pincode: {item.pincode}</Text>
                {item.approximate_units ? <Text style={[styles.meta, { color: colors.textMuted }]}>Approx units: {item.approximate_units}</Text> : null}
                <Text style={[styles.metaStrong, { color: colors.text }]}>Requester: {item.requester_name || 'Resident'} ({item.requester_role})</Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>Phone: {item.requester_phone || 'Not provided'}</Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>Email: Unavailable in current profile schema</Text>
                {item.nominated_admin_name ? <Text style={[styles.meta, { color: colors.textMuted }]}>Nominated admin: {item.nominated_admin_name}</Text> : null}
                {item.nominated_admin_contact ? <Text style={[styles.meta, { color: colors.textMuted }]}>Admin contact: {item.nominated_admin_contact}</Text> : null}

                {rejecting ? (
                  <View style={[styles.rejectWrap, { borderColor: colors.border }]}> 
                    <TextInput
                      value={rejectionReason}
                      onChangeText={setRejectionReason}
                      placeholder="Optional rejection reason"
                      placeholderTextColor={colors.textMuted}
                      style={[styles.rejectInput, { color: colors.text }]}
                      multiline
                    />
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[styles.secondaryAction, { borderColor: colors.border }]}
                        onPress={() => {
                          setRejectingId(null);
                          setRejectionReason('');
                        }}
                      >
                        <Text style={[styles.secondaryActionText, { color: colors.text }]}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.primaryAction, { backgroundColor: colors.accent }]} onPress={() => handleReject(item.id)} disabled={busy}>
                        {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryActionText}>Confirm Reject</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.actionRow}>
                    <TouchableOpacity style={[styles.secondaryAction, { borderColor: colors.border }]} onPress={() => setRejectingId(item.id)} disabled={busy}>
                      <Text style={[styles.secondaryActionText, { color: colors.text }]}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.primaryAction, { backgroundColor: colors.primary }]} onPress={() => handleApprove(item.id)} disabled={busy}>
                      {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryActionText}>Approve</Text>}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 56 },
  gradientOverlay: { position: 'absolute', top: 0, left: 0, right: 0, height: 280 },
  header: { marginBottom: 16 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { marginTop: 4, fontSize: 14, lineHeight: 20 },
  signOutBtn: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  signOutText: { fontSize: 12, fontWeight: '700' },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingBottom: 32, gap: 14 },
  emptyContent: { flexGrow: 1, justifyContent: 'center' },
  emptyState: { borderWidth: 1, borderRadius: 24, padding: 24, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '800', marginTop: 12 },
  emptyCopy: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 6 },
  card: { borderWidth: 1, borderRadius: 24, padding: 18 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 },
  communityName: { flex: 1, fontSize: 18, fontWeight: '800' },
  time: { fontSize: 12, fontWeight: '700' },
  meta: { fontSize: 13, marginTop: 3 },
  metaStrong: { fontSize: 14, fontWeight: '700', marginTop: 10 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  secondaryAction: { flex: 1, borderWidth: 1, borderRadius: 18, paddingVertical: 14, alignItems: 'center' },
  secondaryActionText: { fontSize: 14, fontWeight: '700' },
  primaryAction: { flex: 1, borderRadius: 18, paddingVertical: 14, alignItems: 'center' },
  primaryActionText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  rejectWrap: { borderTopWidth: 1, marginTop: 14, paddingTop: 12 },
  rejectInput: { minHeight: 78, borderWidth: 1, borderColor: '#E8E5F5', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
});
