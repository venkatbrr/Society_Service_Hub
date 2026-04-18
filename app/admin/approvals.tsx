import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../context/AuthContext';
import { Tables } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';

type PendingProfile = Pick<
  Tables<'profiles'>,
  'id' | 'full_name' | 'flat_number' | 'phone_number' | 'join_note' | 'requested_at'
>;

const relativeTime = (dateValue: string | null) => {
  if (!dateValue) {
    return 'Requested recently';
  }

  const diffMs = Date.now() - new Date(dateValue).getTime();
  const minutes = Math.max(1, Math.floor(diffMs / 60000));

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export default function AdminApprovalsScreen() {
  const router = useRouter();
  const { appRole, communityId } = useAuth();
  const colors = Colors.light;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [requests, setRequests] = useState<PendingProfile[]>([]);

  const loadRequests = useCallback(async (showRefreshing = false) => {
    if (!communityId || appRole !== 'admin') {
      setRequests([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (showRefreshing) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, flat_number, phone_number, join_note, requested_at')
        .eq('community_id', communityId)
        .eq('approval_status', 'pending')
        .order('requested_at', { ascending: true });

      if (error) {
        throw error;
      }

      setRequests(data ?? []);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to load requests', text2: error.message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [appRole, communityId]);

  useFocusEffect(
    useCallback(() => {
      loadRequests();
    }, [loadRequests])
  );

  const handleDecision = async (profileId: string, action: 'approve' | 'reject') => {
    setProcessingId(profileId);
    try {
      const { error } = await supabase.rpc(
        action === 'approve' ? 'approve_profile_membership' : 'reject_profile_membership',
        { p_profile_id: profileId }
      );

      if (error) {
        throw error;
      }

      Toast.show({
        type: 'success',
        text1: action === 'approve' ? 'Member approved' : 'Member rejected',
        text2: action === 'approve' ? 'The resident can now access the community.' : 'The resident has been notified.',
      });

      await loadRequests();
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Action failed', text2: error.message });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.75}>
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.text }]}>Approval queue</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Review residents waiting to join your community.</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadRequests(true)} />}
          contentContainerStyle={requests.length ? styles.listContent : styles.emptyContent}
          ListEmptyComponent={
            <View style={[styles.emptyState, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
              <Ionicons name="checkmark-done-circle-outline" size={28} color={colors.secondary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No pending approvals</Text>
              <Text style={[styles.emptyCopy, { color: colors.textMuted }]}>New join requests will appear here automatically.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const busy = processingId === item.id;

            return (
              <View style={[styles.requestCard, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
                <View style={styles.requestHeader}>
                  <Text style={[styles.requestName, { color: colors.text }]}>{item.full_name || 'Resident'}</Text>
                  <Text style={[styles.requestedAt, { color: colors.textMuted }]}>{relativeTime(item.requested_at)}</Text>
                </View>

                <Text style={[styles.requestMeta, { color: colors.textMuted }]}>Flat / House: {item.flat_number || 'Not provided'}</Text>
                <Text style={[styles.requestMeta, { color: colors.textMuted }]}>Phone: {item.phone_number || 'Not provided'}</Text>
                {item.join_note ? <Text style={[styles.requestNote, { color: colors.text }]}>{item.join_note}</Text> : null}

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    onPress={() => handleDecision(item.id, 'reject')}
                    disabled={busy}
                    style={[styles.secondaryAction, { borderColor: colors.border }]}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.secondaryActionText, { color: colors.text }]}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDecision(item.id, 'approve')}
                    disabled={busy}
                    style={[styles.primaryAction, { backgroundColor: colors.primary }]}
                    activeOpacity={0.8}
                  >
                    {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryActionText}>Approve</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(108, 99, 255, 0.08)',
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 4,
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingBottom: 32,
    gap: 14,
  },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 12,
  },
  emptyCopy: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 6,
  },
  requestCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  requestName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
  },
  requestedAt: {
    fontSize: 12,
    fontWeight: '700',
  },
  requestMeta: {
    fontSize: 13,
    marginTop: 4,
  },
  requestNote: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  secondaryAction: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  primaryAction: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryActionText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
});