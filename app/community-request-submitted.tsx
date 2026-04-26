import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Linking,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Colors } from '../constants/Colors';
import { APP_EMOJIS } from '../constants/emojis';
import { useAuth } from '../context/AuthContext';
import { Tables } from '../lib/database.types';
import { supabase } from '../lib/supabase';

type RequestDetail = Pick<
  Tables<'community_requests'>,
  'name' | 'city' | 'status' | 'created_at' | 'rejection_reason' | 'resulting_community_id'
>;

export default function CommunityRequestSubmittedScreen() {
  const router = useRouter();
  const { user, signOut, refreshSession } = useAuth();
  const colors = Colors.light;

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

      if (data?.status === 'approved' && data.resulting_community_id) {
        const { data: community, error: cErr } = await supabase
          .from('communities')
          .select('code')
          .eq('id', data.resulting_community_id)
          .maybeSingle();
        if (!cErr && community?.code) {
          setCommunityCode(community.code);
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
    try {
      await Share.share({
        message: `Join my community on Society Service Hub! Use code: ${code}`,
        title: 'Community Join Code',
      });
    } catch {
      // User dismissed
    }
  };

  const handleShareWhatsApp = (code: string) => {
    const message = encodeURIComponent(`Join my community on Society Service Hub! Use code: ${code}`);
    Linking.openURL(`whatsapp://send?text=${message}`).catch(() => {
      Toast.show({ type: 'error', text1: 'WhatsApp not installed' });
    });
  };

  const handleEnterCommunity = async () => {
    setEntering(true);
    try {
      await refreshSession();
    } finally {
      setEntering(false);
    }
    // _layout.tsx will redirect to /(tabs) once communityId is set
  };

  const handleRefresh = () => {
    setLoading(true);
    setCommunityCode(null);
    loadRequest();
  };

  // ─── Approved state ────────────────────────────────────────────────────────
  if (!loading && request?.status === 'approved') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <LinearGradient
          colors={[`${colors.primary}18`, `${colors.gradientEnd}10`, 'transparent']}
          style={styles.gradientOverlay}
        />
        <View style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}14` }]}>
            <Text style={styles.iconEmoji}>{APP_EMOJIS.success}</Text>
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Community approved!</Text>
          <Text style={[styles.copy, { color: colors.textMuted }]}>
            <Text style={{ fontWeight: '800', color: colors.text }}>{request.name}</Text>
            {' '}is live. Share the code below so your neighbors can join.
          </Text>

          {communityCode ? (
            <View style={[styles.codeBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
              <Text style={[styles.codeLabel, { color: colors.textMuted }]}>COMMUNITY CODE</Text>
              <Text style={[styles.codeValue, { color: colors.primary }]}>{communityCode}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            onPress={() => communityCode && handleShareCode(communityCode)}
            style={[styles.secondaryButton, { borderColor: colors.border }]}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonIcon}>{APP_EMOJIS.share}</Text>
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Share code</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => communityCode && handleShareWhatsApp(communityCode)}
            style={[styles.secondaryButton, { borderColor: colors.border, marginTop: 10 }]}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonIcon}>{APP_EMOJIS.whatsapp}</Text>
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Share via WhatsApp</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleEnterCommunity} disabled={entering} activeOpacity={0.8}>
            <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={[styles.primaryButton, { marginTop: 18 }]}>
              {entering ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Enter my community</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Rejected state ────────────────────────────────────────────────────────
  if (!loading && request?.status === 'rejected') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <LinearGradient
          colors={[`${colors.accent}18`, `${colors.gradientEnd}10`, 'transparent']}
          style={styles.gradientOverlay}
        />
        <View style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <View style={[styles.iconWrap, { backgroundColor: `${colors.accent}12` }]}>
            <Text style={styles.iconEmoji}>{APP_EMOJIS.error}</Text>
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Request not approved</Text>
          <Text style={[styles.copy, { color: colors.textMuted }]}>
            Your request for{' '}
            <Text style={{ fontWeight: '800', color: colors.text }}>{request.name}</Text>
            {' '}was not approved.
          </Text>

          {request.rejection_reason ? (
            <View style={[styles.reasonBox, { backgroundColor: `${colors.accent}0C`, borderColor: `${colors.accent}30` }]}>
              <Text style={[styles.reasonLabel, { color: colors.accent }]}>REASON</Text>
              <Text style={[styles.reasonText, { color: colors.text }]}>{request.rejection_reason}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            onPress={() => router.replace('/community-request')}
            activeOpacity={0.8}
          >
            <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={[styles.primaryButton, { marginTop: 22 }]}>
              <Text style={styles.primaryButtonText}>Request again</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.replace('/community-select')}
            style={[styles.secondaryButton, { borderColor: colors.border, marginTop: 12 }]}
            activeOpacity={0.8}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Join existing community</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={async () => { await signOut(); router.replace('/login'); }}
            style={styles.textButton}
            activeOpacity={0.75}
          >
            <Text style={[styles.textButtonLabel, { color: colors.primary }]}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Pending / loading state ───────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={[`${colors.secondary}18`, `${colors.gradientEnd}10`, 'transparent']} style={styles.gradientOverlay} />

      <View style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
        <View style={[styles.iconWrap, { backgroundColor: `${colors.secondary}16` }]}>
          <Text style={styles.iconEmoji}>{APP_EMOJIS.mail}</Text>
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Request received</Text>
        <Text style={[styles.copy, { color: colors.textMuted }]}>
          Your community request is under review. We will verify the details and follow up within about 24 hours.
        </Text>

        {loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}

        {!loading && request ? (
          <View style={[styles.summary, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.summaryTitle, { color: colors.text }]}>{request.name}</Text>
            <Text style={[styles.summaryMeta, { color: colors.textMuted }]}>{request.city}</Text>
            <Text style={[styles.summaryMeta, { color: colors.textMuted }]}>
              Submitted on {new Date(request.created_at).toLocaleDateString('en-IN')}
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          onPress={handleRefresh}
          style={[styles.secondaryButton, { borderColor: colors.border }]}
          activeOpacity={0.8}
        >
          <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Refresh status</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={async () => { await signOut(); router.replace('/login'); }}
          style={styles.textButton}
          activeOpacity={0.75}
        >
          <Text style={[styles.textButtonLabel, { color: colors.primary }]}>Sign out</Text>
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
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
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
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
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
    fontWeight: '800',
  },
  summaryMeta: {
    fontSize: 13,
    marginTop: 6,
  },
  codeBox: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 20,
    marginTop: 22,
    alignItems: 'center',
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  codeValue: {
    fontSize: 36,
    fontWeight: '900',
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
    fontWeight: '700',
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
    height: 54,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 5,
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
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
    fontWeight: '700',
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
    fontWeight: '700',
  },
});
