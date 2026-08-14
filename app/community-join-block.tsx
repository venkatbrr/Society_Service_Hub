import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { FlatPicker } from '../components/FlatPicker';
import { HeaderBackButton } from '../components/HeaderBackButton';
import { Verandah } from '../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';
import { useAuth } from '../context/AuthContext';
import { POST_AUTH_LANDING_ROUTE, replaceTracked } from '../lib/navigation';
import { supabase } from '../lib/supabase';

export default function CommunityJoinBlockScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { communityId: routeCommunityId, blockLabel: routeBlockLabel } =
    useLocalSearchParams<{ communityId: string; blockLabel?: string }>();
  
  const { communityId: authCommunityId, profile, blockLabel: authBlockLabel, refreshSession } = useAuth();
  const effectiveCommunityId = routeCommunityId || authCommunityId || profile?.community_id || '';
  const label = routeBlockLabel || authBlockLabel || 'Block';

  const [selectedFlatId, setSelectedFlatId] = useState<string | null>(
    (profile as any)?.flat_id || null
  );
  const [saving, setSaving] = useState(false);

  const handleContinue = async () => {
    if (!selectedFlatId) {
      Toast.show({ type: 'error', text1: 'Please select your flat number' });
      return;
    }

    try {
      setSaving(true);
      const { error } = await supabase.rpc('set_my_flat', {
        p_flat_id: selectedFlatId,
      });

      if (error) throw error;

      await refreshSession();
      Toast.show({ type: 'success', text1: 'Flat assigned successfully' });
      replaceTracked(router, POST_AUTH_LANDING_ROUTE as any);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to save flat', text2: error.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <HeaderBackButton onPress={() => router.back()} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Select your flat</Text>
        <Text style={styles.subtitle}>
          Choose your {label.toLowerCase()} and flat number from the verified community list.
        </Text>

        <FlatPicker
          communityId={effectiveCommunityId}
          value={selectedFlatId}
          onChange={(flatId) => setSelectedFlatId(flatId)}
          blockLabel={label}
          disabled={saving}
          required={true}
        />
      </ScrollView>

      {/* Fixed Bottom Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={[styles.primaryBtn, (!selectedFlatId || saving) && styles.primaryBtnDisabled]}
          onPress={handleContinue}
          disabled={!selectedFlatId || saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color={Verandah.primaryFg} size="small" />
          ) : (
            <Text style={styles.primaryBtnText}>Confirm & Continue</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Verandah.paper,
    paddingTop: Platform.select({ web: 16, default: VerandahLayout.screenPaddingTop }),
  },
  header: {
    paddingHorizontal: VerandahSpace.lg,
    paddingBottom: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: VerandahSpace.lg,
    paddingBottom: 24,
    gap: VerandahSpace.md,
  },
  title: {
    ...VerandahType.display,
    color: Verandah.textPrimary,
    marginTop: 4,
  },
  subtitle: {
    ...VerandahType.body,
    color: Verandah.textSecondary,
    marginBottom: 8,
  },
  footer: {
    paddingHorizontal: VerandahSpace.lg,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: Verandah.borderHair,
    backgroundColor: Verandah.paper,
  },
  primaryBtn: {
    borderRadius: VerandahRadius.button,
    backgroundColor: Verandah.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  primaryBtnDisabled: {
    opacity: 0.5,
  },
  primaryBtnText: {
    color: Verandah.primaryFg,
    ...VerandahType.bodyBold,
  },
});
