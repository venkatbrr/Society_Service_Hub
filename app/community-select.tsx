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
import { Verandah } from '../constants/Colors';
import { APP_EMOJIS } from '../constants/emojis';
import { VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';
import { useAuth } from '../context/AuthContext';
import { replaceTracked } from '../lib/navigation';
import { supabase } from '../lib/supabase';

export default function CommunitySelectScreen() {
  const router = useRouter();
  const { refreshSession } = useAuth();

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
      let blockLabel = 'Block';

      if (joinedCommunityId) {
        const { data: joinedCommunity } = await supabase
          .from('communities')
          .select('blocks_enabled, funds_enabled, block_label')
          .eq('id', joinedCommunityId)
          .maybeSingle();

        shouldPickBlock = Boolean(joinedCommunity?.blocks_enabled);
        blockLabel = (joinedCommunity as any)?.block_label ?? 'Block';
      }

      await refreshSession();
      Toast.show({
        type: 'success',
        text1: 'Welcome!',
        text2: `You joined ${(data as any)?.community_name ?? 'the community'}.`,
      });
      if (shouldPickBlock && joinedCommunityId) {
        replaceTracked(router, { pathname: '/community-join-block', params: { communityId: joinedCommunityId, blockLabel } } as any);
      } else {
        replaceTracked(router, '/(tabs)');
      }
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Join failed', text2: error.message });
    } finally {
      setJoining(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Join your community</Text>
        <Text style={styles.subtitle}>
          Enter the 6-character code shared by your community lead, or request a new community.
        </Text>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardIcon}>{APP_EMOJIS.community}</Text>
            <View style={styles.cardCopyWrap}>
              <Text style={styles.cardTitle}>Join with code</Text>
              <Text style={styles.cardCopy}>Use your community code to join instantly.</Text>
            </View>
          </View>

          <Text style={styles.label}>Community code</Text>
          <TextInput
            style={styles.codeInput}
            placeholder="A7X9KQ"
            placeholderTextColor={Verandah.textTertiary}
            value={code}
            onChangeText={(value) => setCode(value.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
          />

          <TouchableOpacity
            onPress={handleJoinByCode}
            disabled={joining || code.trim().length === 0}
            activeOpacity={0.85}
            style={[
              styles.primaryButton,
              code.trim().length === 0 && styles.primaryButtonDisabled,
            ]}
          >
            {joining ? <ActivityIndicator color={Verandah.primaryFg} /> : <Text style={styles.primaryButtonText}>Join community</Text>}
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => router.push('/community-request')} style={styles.card} activeOpacity={0.85}>
          <View style={styles.requestCardInner}>
            <View style={styles.requestIconWrap}>
              <Text style={styles.requestIcon}>{APP_EMOJIS.add}</Text>
            </View>
            <View style={styles.cardCopyWrap}>
              <Text style={styles.cardTitle}>Request a new community</Text>
              <Text style={styles.cardCopy}>Don’t have a code yet? Send a request for platform review.</Text>
            </View>
            <Text style={styles.chevron}>{APP_EMOJIS.chevronRight}</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Verandah.surface,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: VerandahSpace.xl,
    paddingTop: Platform.select({ web: 24, default: 76 }),
    paddingBottom: 40,
  },
  title: {
    ...VerandahType.display,
    color: Verandah.textPrimary,
  },
  subtitle: {
    ...VerandahType.body,
    color: Verandah.textSecondary,
    marginTop: VerandahSpace.sm,
    marginBottom: VerandahSpace.xl,
  },
  card: {
    borderRadius: VerandahRadius.lg,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    backgroundColor: Verandah.card,
    padding: VerandahSpace.lg,
    marginBottom: VerandahSpace.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: VerandahSpace.md,
    marginBottom: VerandahSpace.md,
  },
  cardIcon: {
    fontSize: 26,
    lineHeight: 30,
  },
  cardCopyWrap: {
    flex: 1,
  },
  cardTitle: {
    ...VerandahType.bodyBold,
    color: Verandah.textPrimary,
    marginBottom: 2,
  },
  cardCopy: {
    ...VerandahType.caption,
    color: Verandah.textSecondary,
  },
  label: {
    ...VerandahType.caption,
    fontWeight: '500',
    color: Verandah.textTertiary,
    marginBottom: VerandahSpace.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  codeInput: {
    borderWidth: 0.5,
    borderColor: Verandah.borderStrong,
    borderRadius: VerandahRadius.md,
    backgroundColor: Verandah.cardMuted,
    paddingHorizontal: VerandahSpace.lg,
    height: 50,
    ...VerandahType.bodyBold,
    color: Verandah.textPrimary,
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: VerandahSpace.md,
  },
  primaryButton: {
    height: 50,
    borderRadius: 14,
    backgroundColor: Verandah.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    ...VerandahType.bodyBold,
    color: Verandah.primaryFg,
  },
  requestCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: VerandahSpace.md,
  },
  requestIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Verandah.accentSoft,
  },
  requestIcon: {
    fontSize: 20,
    lineHeight: 22,
  },
  chevron: {
    color: Verandah.textTertiary,
    fontSize: 18,
    lineHeight: 20,
  },
});