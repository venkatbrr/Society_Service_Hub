import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Linking,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Verandah } from '../constants/Colors';
import { APP_EMOJIS } from '../constants/emojis';
import { VerandahType } from '../constants/Verandah';
import { useAuth } from '../context/AuthContext';
import { Tables } from '../lib/database.types';
import { replaceTracked } from '../lib/navigation';
import { goToLanding } from '../lib/siteUrl';
import { shareOrCopy } from '../lib/share';
import { supabase } from '../lib/supabase';

type RequestDetail = Pick<
  Tables<'community_requests'>,
  'name' | 'city' | 'status' | 'created_at' | 'rejection_reason' | 'resulting_community_id'
>;

export default function CommunityRequestSubmittedScreen() {
  const router = useRouter();
  const { user, signOut, refreshSession } = useAuth();

  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [communityCode, setCommunityCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [entering, setEntering] = useState(false);

  const loadRequest = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('community_requests')
        .select('name, city, status, created_at, rejection_reason, resulting_community_id')
        .eq('requested_by', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      setRequest(data);

      if (data?.status === 'approved') {
        const { data: requestedComm } = await supabase.rpc('get_my_requested_community');
        const commInfo = requestedComm?.[0];
        if (commInfo?.code) {
          setCommunityCode(commInfo.code);
        }
      }
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to load request', text2: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequest();
  }, [user?.id]);

  const handleShareCode = async (code: string) => {
    await shareOrCopy({
      title: 'Community Join Code',
      message: `Join my community on Wooru! Use code: ${code}`,
    });
  };

  const handleShareWhatsApp = (code: string) => {
    const message = encodeURIComponent(`Join my community on Wooru! Use code: ${code}`);
    Linking.openURL(`whatsapp://send?text=${message}`).catch(() => {
      Toast.show({ type: 'error', text1: 'WhatsApp not installed' });
    });
  };

  const handleEnterCommunity = async () => {
    setEntering(true);
    try {
      await refreshSession();

      // Check if the approved community has blocks enabled.
      // If so, route to block/tower selection before entering the app —
      // same as the join-via-code flow in community-select.tsx.
      if (request?.resulting_community_id) {
        const { data: requestedComm } = await supabase.rpc('get_my_requested_community');
        const community = requestedComm?.[0];

        if (community?.blocks_enabled) {
          const blockLabel = community.block_label ?? 'Block';
          replaceTracked(router, {
            pathname: '/community-join-block',
            params: { communityId: request.resulting_community_id, blockLabel },
          } as any);
          return;
        }
      }

      // No block selection needed — root layout will redirect to /(tabs)
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to enter community', text2: error.message });
    } finally {
      setEntering(false);
    }
  };

  const handleRefresh = () => {
    setLoading(true);
    setCommunityCode(null);
    loadRequest();
  };

  // ─── Approved state ────────────────────────────────────────────────────────
  if (!loading && request?.status === 'approved') {
    return (
      <View style={[styles.container, { backgroundColor: Verandah.surface }]}>
        <View style={[styles.card, { backgroundColor: Verandah.card, borderColor: Verandah.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: Verandah.accentSoft }]}>
            <Text style={styles.iconEmoji}>{APP_EMOJIS.success}</Text>
          </View>
          <Text style={styles.title}>Community approved!</Text>
          <Text style={[styles.copy, { color: Verandah.textSecondary }]}>
            <Text style={{ fontWeight: '500', color: Verandah.textPrimary }}>{request.name}</Text>
            {' '}is live. Share the code below so your neighbors can join.
          </Text>

          {communityCode ? (
            <View style={[styles.codeBox, { backgroundColor: Verandah.cardMuted, borderColor: Verandah.border }]}>
              <Text style={[styles.codeLabel, { color: Verandah.textSecondary }]}>Community code</Text>
              <Text style={[styles.codeValue, { color: Verandah.primary }]}>{communityCode}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            onPress={() => communityCode && handleShareCode(communityCode)}
            style={[styles.secondaryButton, { borderColor: Verandah.border }]}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonIcon}>{APP_EMOJIS.share}</Text>
            <Text style={[styles.secondaryButtonText, { color: Verandah.textPrimary }]}>Share code</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => communityCode && handleShareWhatsApp(communityCode)}
            style={[styles.secondaryButton, { borderColor: Verandah.border, marginTop: 10 }]}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonIcon}>{APP_EMOJIS.whatsapp}</Text>
            <Text style={[styles.secondaryButtonText, { color: Verandah.textPrimary }]}>Share via WhatsApp</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleEnterCommunity}
            disabled={entering}
            activeOpacity={0.8}
            style={[styles.primaryButton, { marginTop: 18 }]}
          >
            {entering ? (
              <ActivityIndicator color={Verandah.primaryFg} />
            ) : (
              <Text style={styles.primaryButtonText}>Enter my community</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Rejected state ────────────────────────────────────────────────────────
  if (!loading && request?.status === 'rejected') {
    return (
      <View style={[styles.container, { backgroundColor: Verandah.surface }]}>
        <View style={[styles.card, { backgroundColor: Verandah.card, borderColor: Verandah.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: Verandah.dangerSoft }]}>
            <Text style={styles.iconEmoji}>{APP_EMOJIS.error}</Text>
          </View>
          <Text style={styles.title}>Request not approved</Text>
          <Text style={[styles.copy, { color: Verandah.textSecondary }]}>
            Your request for{' '}
            <Text style={{ fontWeight: '500', color: Verandah.textPrimary }}>{request.name}</Text>
            {' '}was not approved.
          </Text>

          {request.rejection_reason ? (
            <View style={[styles.reasonBox, { backgroundColor: Verandah.dangerSoft, borderColor: Verandah.danger + '30' }]}>
              <Text style={[styles.reasonLabel, { color: Verandah.danger }]}>Reason</Text>
              <Text style={[styles.reasonText, { color: Verandah.textPrimary }]}>{request.rejection_reason}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            onPress={() => replaceTracked(router, '/community-request')}
            activeOpacity={0.8}
            style={[styles.primaryButton, { marginTop: 22 }]}
          >
            <Text style={styles.primaryButtonText}>Request again</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => replaceTracked(router, '/community-select')}
            style={[styles.secondaryButton, { borderColor: Verandah.border, marginTop: 12 }]}
            activeOpacity={0.8}
          >
            <Text style={[styles.secondaryButtonText, { color: Verandah.textPrimary }]}>Join existing community</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={async () => { await signOut(); if (!goToLanding()) replaceTracked(router, '/login'); }}
            style={styles.textButton}
            activeOpacity={0.75}
          >
            <Text style={[styles.textButtonLabel, { color: Verandah.primary }]}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Pending / loading state ───────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: Verandah.surface }]}>
      <View style={[styles.card, { backgroundColor: Verandah.card, borderColor: Verandah.border }]}>
        <View style={[styles.iconWrap, { backgroundColor: Verandah.accentSoft }]}>
          <Text style={styles.iconEmoji}>{APP_EMOJIS.mail}</Text>
        </View>
        <Text style={styles.title}>Request received</Text>
        <Text style={[styles.copy, { color: Verandah.textSecondary }]}>
          Your community request is under review. We will verify the details and follow up within about 24 hours.
        </Text>

        {loading ? <ActivityIndicator color={Verandah.accent} style={styles.loader} /> : null}

        {!loading && request ? (
          <View style={[styles.summary, { borderColor: Verandah.border, backgroundColor: Verandah.card }]}>
            <Text style={[styles.summaryTitle, { color: Verandah.textPrimary }]}>{request.name}</Text>
            <Text style={[styles.summaryMeta, { color: Verandah.textSecondary }]}>{request.city}</Text>
            <Text style={[styles.summaryMeta, { color: Verandah.textSecondary }]}>
              Submitted on {new Date(request.created_at).toLocaleDateString('en-IN')}
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          onPress={handleRefresh}
          style={[styles.secondaryButton, { borderColor: Verandah.border }]}
          activeOpacity={0.8}
        >
          <Text style={[styles.secondaryButtonText, { color: Verandah.textPrimary }]}>Refresh status</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={async () => { await signOut(); if (!goToLanding()) replaceTracked(router, '/login'); }}
          style={styles.textButton}
          activeOpacity={0.75}
        >
          <Text style={[styles.textButtonLabel, { color: Verandah.primary }]}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    elevation: 0,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  iconEmoji: {
    fontSize: 28,
    lineHeight: 32,
  },
  title: {
    ...VerandahType.display,
    color: Verandah.textPrimary,
    textAlign: 'center',
  },
  copy: {
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    marginTop: 10,
  },
  loader: {
    marginTop: 18,
  },
  summary: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginTop: 20,
  },
  summaryTitle: {
    fontSize: 17,
    fontWeight: '500',
  },
  summaryMeta: {
    fontSize: 13,
    marginTop: 6,
  },
  codeBox: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    marginTop: 22,
    alignItems: 'center',
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 1,
    marginBottom: 8,
  },
  codeValue: {
    fontSize: 36,
    fontWeight: '500',
    letterSpacing: 6,
  },
  reasonBox: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginTop: 18,
  },
  reasonLabel: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  reasonText: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
  },
  primaryButton: {
    width: '100%',
    height: 50,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Verandah.primary,
    elevation: 0,
  },
  primaryButtonText: {
    color: Verandah.primaryFg,
    fontSize: 14,
    fontWeight: '500',
  },
  secondaryButton: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
  buttonIcon: {
    fontSize: 16,
    lineHeight: 18,
  },
  textButton: {
    marginTop: 16,
  },
  textButtonLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
});
