import { Lock01 } from '@untitledui/icons/Lock01';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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
import { FlatPicker } from '../../components/FlatPicker';
import { HeaderBackButton } from '../../components/HeaderBackButton';
import { Verandah } from '../../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { isValidIndianMobile, normalizeIndianMobile } from '../../lib/phone';
import { supabase } from '../../lib/supabase';

export default function EditProfileScreen() {
  const router = useRouter();
  const { user, profile, communityId, blockLabel, refreshSession } = useAuth();

  const [fullName, setFullName] = useState(profile?.full_name || user?.user_metadata?.full_name || '');
  const [selectedFlatId, setSelectedFlatId] = useState<string | null>((profile as any)?.flat_id || null);
  // Captured once on load — this is what decides whether the flat picker is
  // still open, not the (possibly just-picked) selectedFlatId above. A
  // resident who arrives with no flat set must still be able to pick one.
  const [isFlatLocked, setIsFlatLocked] = useState(!!(profile as any)?.flat_id);
  // No UI writes this anymore (profile photos were removed, see item 5), but
  // the existing value — often a Google OAuth avatar — is still round-tripped
  // on save so it isn't silently wiped.
  const [avatarUrl] = useState<string | null>(profile?.avatar_url || user?.user_metadata?.avatar_url || null);
  const [email, setEmail] = useState(user?.email || '');
  // A saved contact number, nothing more — unverified, and deliberately not
  // wired to phone login in either direction (sign-in resolves the account from
  // the synthetic phone_91…@auth.wooru.in address, never from this column).
  // Captured the first time a resident types it into a food-drop order, then
  // reused to prefill every later order. This is the one place it can change.
  const [phoneNumber, setPhoneNumber] = useState(profile?.phone_number || '');
  const [loading, setLoading] = useState(false);

  const colors = Verandah;

  const [lockedFlatDisplay, setLockedFlatDisplay] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      if (profile.full_name) setFullName(profile.full_name);
      if (profile.phone_number) setPhoneNumber((prev) => prev || profile.phone_number || '');
      if ((profile as any).flat_id) {
        setSelectedFlatId((profile as any).flat_id);
        setIsFlatLocked(true);
      }
    }
  }, [profile]);

  useEffect(() => {
    const flatId = (profile as any)?.flat_id;
    if (!isFlatLocked || !communityId || !flatId) return;

    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('list_community_flats', {
        p_community_id: communityId,
        p_block_id: (profile as any)?.block_id ?? null,
      });
      if (cancelled) return;
      const match = ((data ?? []) as any[]).find((f) => f.id === flatId);
      if (match) {
        setLockedFlatDisplay(match.block_name ? `${match.block_name}-${match.flat_number}` : match.flat_number);
      } else if (profile?.flat_number) {
        setLockedFlatDisplay(profile.flat_number);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isFlatLocked, communityId, profile]);

  const handleSave = async () => {
    if (!fullName.trim()) {
      Toast.show({ type: 'error', text1: 'Name is required' });
      return;
    }

    const trimmedPhone = phoneNumber.trim();
    if (trimmedPhone && !isValidIndianMobile(trimmedPhone)) {
      Toast.show({
        type: 'error',
        text1: 'Invalid mobile number',
        text2: 'Enter a valid 10-digit Indian mobile number.',
      });
      return;
    }

    setLoading(true);
    try {
      const metadataUpdates: any = {
        full_name: fullName.trim(),
        avatar_url: avatarUrl,
      };

      const authUpdates: any = {
        data: metadataUpdates,
      };

      if (email.trim() && email.trim() !== user?.email) {
        authUpdates.email = email.trim();
      }

      const { error: authError } = await supabase.auth.updateUser(authUpdates);
      if (authError) throw authError;

      // Update profiles table
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          avatar_url: avatarUrl,
          phone_number: trimmedPhone ? normalizeIndianMobile(trimmedPhone) : null,
        })
        .eq('id', user?.id as string);

      if (profileError) throw profileError;

      // Save flat if changed. Locked once set — see isFlatLocked above — so
      // this only ever fires for a resident picking a flat for the first time.
      if (!isFlatLocked && selectedFlatId !== ((profile as any)?.flat_id || null)) {
        const { error: flatError } = await supabase.rpc('set_my_flat', {
          p_flat_id: selectedFlatId,
        });
        if (flatError) throw flatError;
      }

      await refreshSession();

      if (authUpdates.email) {
        Toast.show({ type: 'success', text1: 'Check your new email to confirm the change', text2: 'Profile updated' });
      } else {
        Toast.show({ type: 'success', text1: 'Profile updated' });
      }

      router.back();
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Update failed', text2: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.paper }}
    >
      <View style={styles.header}>
        <HeaderBackButton onPress={() => router.back()} />
        <Text style={styles.title}>Edit Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your full name"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Mobile Number</Text>
          <TextInput
            style={styles.input}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="10-digit mobile number"
            placeholderTextColor={colors.textTertiary}
            keyboardType="phone-pad"
            maxLength={10}
          />
          <Text style={styles.helpText}>
            Used to prefill your contact number when you order from a food drop.
          </Text>
        </View>

        {communityId && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{blockLabel} / Flat Number</Text>
            {isFlatLocked ? (
              <>
                <View style={styles.lockedFlatRow}>
                  <Text style={styles.lockedFlatText}>{lockedFlatDisplay ?? profile?.flat_number ?? '—'}</Text>
                  <Lock01 size={16} color={colors.textTertiary} aria-hidden={true} />
                </View>
                <Text style={styles.helpText}>
                  To change your {blockLabel.toLowerCase()} or flat, ask your president to update it.
                </Text>
              </>
            ) : (
              <FlatPicker
                communityId={communityId}
                value={selectedFlatId}
                onChange={(flatId) => setSelectedFlatId(flatId)}
                blockLabel={blockLabel}
                allowClear={true}
                required={false}
                disabled={loading}
              />
            )}
          </View>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Your email address"
            placeholderTextColor={colors.textTertiary}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Text style={styles.helpText}>
            If you change your email, you will need to verify the new address before the change takes effect.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading} activeOpacity={0.85}>
          {loading ? (
            <ActivityIndicator color={Verandah.primaryFg} size="small" />
          ) : (
            <Text style={styles.saveBtnText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: VerandahLayout.screenPaddingTop,
    paddingBottom: 14,
    backgroundColor: Verandah.paper,
  },
  title: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '400',
    color: Verandah.textPrimary,
  },
  content: {
    padding: 20,
    gap: 16,
    paddingBottom: 40,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: Verandah.textTertiary,
    fontFamily: VerandahType.sansFamily,
  },
  input: {
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
    borderRadius: VerandahRadius.search,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: VerandahType.sansFamily,
    color: Verandah.textPrimary,
    backgroundColor: Verandah.card,
    ...Verandah.shadowCard,
  },
  helpText: {
    fontSize: 12,
    color: Verandah.textTertiary,
    lineHeight: 16,
    fontFamily: VerandahType.sansFamily,
  },
  lockedFlatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
    borderRadius: VerandahRadius.search,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: Verandah.cardMuted,
  },
  lockedFlatText: {
    fontSize: 15,
    fontFamily: VerandahType.sansFamily,
    color: Verandah.textSecondary,
  },
  footer: {
    padding: 20,
    borderTopWidth: 0.5,
    borderTopColor: Verandah.borderHair,
    backgroundColor: Verandah.paper,
  },
  saveBtn: {
    backgroundColor: Verandah.primary,
    paddingVertical: 14,
    borderRadius: VerandahRadius.button,
    alignItems: 'center',
  },
  saveBtnText: {
    color: Verandah.primaryFg,
    fontSize: 15,
    fontWeight: '600',
    fontFamily: VerandahType.sansFamily,
  },
});
