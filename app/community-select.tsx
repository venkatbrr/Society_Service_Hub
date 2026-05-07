import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Colors } from '../constants/Colors';
import { APP_EMOJIS } from '../constants/emojis';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function CommunitySelectScreen() {
  const router = useRouter();
  const { refreshSession } = useAuth();
  const colors = Colors.light;

  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);

  const handleJoinByCode = async () => {
    const trimmedCode = code.trim().toUpperCase();

    if (trimmedCode.length !== 6) {
      Toast.show({ type: 'error', text1: 'Invalid code', text2: 'Community codes are 6 characters long.' });
      return;
    }

    setJoining(true);
    try {
      const { data, error } = await supabase.rpc('join_community_by_code', {
        p_code: trimmedCode,
      });

      if (error) throw error;

      const joinedCommunityId = (data as any)?.community_id as string | undefined;
      let shouldPickBlock = false;

      if (joinedCommunityId) {
        const { data: joinedCommunity } = await supabase
          .from('communities')
          .select('blocks_enabled, funds_enabled')
          .eq('id', joinedCommunityId)
          .maybeSingle();

        shouldPickBlock = Boolean(joinedCommunity?.funds_enabled && joinedCommunity?.blocks_enabled);
      }

      await refreshSession();
      Toast.show({
        type: 'success',
        text1: 'Welcome!',
        text2: `You joined ${(data as any)?.community_name ?? 'the community'}.`,
      });
      if (shouldPickBlock && joinedCommunityId) {
        router.replace({ pathname: '/community-join-block', params: { communityId: joinedCommunityId } } as any);
      } else {
        router.replace('/(tabs)');
      }
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Join failed', text2: error.message });
    } finally {
      setJoining(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient
          colors={[`${colors.gradientStart}14`, `${colors.gradientEnd}10`, 'transparent']}
          style={styles.gradientOverlay}
        />

        <Text style={[styles.title, { color: colors.text }]}>Join your community</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Enter the 6-character code shared by your community lead, or request a new community.
        </Text>

        {/* Join by code section */}
        <View style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardIcon}>{APP_EMOJIS.community}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Join existing community</Text>
              <Text style={[styles.cardCopy, { color: colors.textMuted }]}>
                Ask your neighbor or community lead for the 6-character code.
              </Text>
            </View>
          </View>

          <Text style={[styles.label, { color: colors.text }]}>COMMUNITY CODE</Text>
          <TextInput
            style={[styles.codeInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
            placeholder="A7X9KQ"
            placeholderTextColor={colors.textMuted}
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
          />

          <TouchableOpacity
            onPress={handleJoinByCode}
            disabled={joining || code.trim().length === 0}
            activeOpacity={0.8}
            style={code.trim().length === 0 ? styles.disabledButtonWrap : undefined}
          >
            <LinearGradient
              colors={code.trim().length > 0 ? [colors.gradientStart, colors.gradientEnd] : [colors.border, colors.border]}
              style={styles.primaryButton}
            >
              {joining ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Join Community</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <Text style={[styles.dividerText, { color: colors.textMuted }]}>OR</Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        {/* Request new community section */}
        <TouchableOpacity
          onPress={() => router.push('/community-request')}
          style={[styles.requestCard, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
          activeOpacity={0.85}
        >
          <View style={styles.requestCardInner}>
            <View style={[styles.requestIconWrap, { backgroundColor: `${colors.secondary}12` }]}>
              <Text style={styles.requestIcon}>{APP_EMOJIS.add}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.requestTitle, { color: colors.text }]}>Request a new community</Text>
              <Text style={[styles.requestCopy, { color: colors.textMuted }]}>
                Don't have a code? Submit a request and a platform admin will review it.
              </Text>
            </View>
            <Text style={[styles.chevron, { color: colors.textMuted }]}>{APP_EMOJIS.chevronRight}</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 80,
    paddingBottom: 48,
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 280,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 28,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 0,
    marginBottom: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 20,
  },
  cardIcon: {
    fontSize: 28,
    lineHeight: 32,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  cardCopy: {
    fontSize: 13,
    lineHeight: 19,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  codeInput: {
    borderWidth: 1.5,
    borderRadius: 18,
    paddingHorizontal: 18,
    height: 56,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 4,
    textAlign: 'center',
    marginBottom: 18,
  },
  primaryButton: {
    height: 54,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 0,
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  disabledButtonWrap: {
    opacity: 0.5,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  requestCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 0,
  },
  requestCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  requestIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestIcon: {
    fontSize: 22,
    lineHeight: 24,
  },
  requestTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  requestCopy: {
    fontSize: 13,
    lineHeight: 19,
  },
  chevron: {
    fontSize: 18,
    lineHeight: 20,
  },
});
