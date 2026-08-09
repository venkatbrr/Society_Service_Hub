import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { BaseCard } from '../../components/BaseCard';
import { HeaderBackButton } from '../../components/HeaderBackButton';
import { Verandah } from '../../constants/Colors';
import { BLOOD_GROUPS } from '../../constants/sos';
import { VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { normalizeIndianMobile, toLast10Digits } from '../../lib/phone';
import { replaceTracked } from '../../lib/navigation';
import { supabase } from '../../lib/supabase';

const MAX_NOTE_LENGTH = 140;

export default function DonorFormScreen() {
  const router = useRouter();
  const { user, communityId } = useAuth();

  const [existingId, setExistingId] = useState<string | null>(null);
  const [bloodGroup, setBloodGroup] = useState<(typeof BLOOD_GROUPS)[number]>('O+');
  const [contactPhone, setContactPhone] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [note, setNote] = useState('');

  const [loading, setLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!communityId || !user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [{ data: donorRow, error: donorError }, { data: profileRow, error: profileError }] = await Promise.all([
        supabase
          .from('blood_donors')
          .select('id, blood_group, contact_phone, is_available, note')
          .eq('community_id', communityId)
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('phone_number')
          .eq('id', user.id)
          .maybeSingle(),
      ]);

      if (donorError) throw donorError;
      if (profileError) throw profileError;

      if (donorRow) {
        setExistingId(donorRow.id);
        setBloodGroup(donorRow.blood_group as (typeof BLOOD_GROUPS)[number]);
        setContactPhone(donorRow.contact_phone ?? '');
        setIsAvailable(Boolean(donorRow.is_available));
        setNote(donorRow.note ?? '');
      } else {
        setExistingId(null);
        setContactPhone(profileRow?.phone_number ?? '');
        setIsAvailable(true);
        setNote('');
      }
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to load donor profile', text2: error.message });
    } finally {
      setLoading(false);
    }
  }, [communityId, user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const normalizePhoneOnBlur = () => {
    const normalized = normalizeIndianMobile(contactPhone);
    if (normalized) {
      setContactPhone(normalized);
      return;
    }

    const compact = toLast10Digits(contactPhone);
    setContactPhone(compact);
  };

  const handleSave = async () => {
    if (!communityId || !user?.id) {
      Toast.show({ type: 'error', text1: 'Missing community details' });
      return;
    }

    const normalizedPhone = normalizeIndianMobile(contactPhone);
    if (!normalizedPhone) {
      Toast.show({ type: 'error', text1: 'Invalid phone number', text2: 'Enter a valid 10-digit Indian mobile number.' });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('blood_donors')
        .upsert(
          {
            user_id: user.id,
            community_id: communityId,
            blood_group: bloodGroup,
            contact_phone: normalizedPhone,
            is_available: isAvailable,
            note: note.trim() || null,
          },
          { onConflict: 'user_id,community_id' }
        );

      if (error) throw error;

      Toast.show({ type: 'success', text1: existingId ? 'Donor profile updated' : 'Registered as donor' });
      replaceTracked(router, '/sos' as any);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to save donor profile', text2: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = () => {
    if (!existingId || !user?.id) return;

    const executeRemove = async () => {
      setIsLoading(true);
      try {
        const { error } = await supabase
          .from('blood_donors')
          .delete()
          .eq('id', existingId)
          .eq('user_id', user.id);

        if (error) throw error;

        Toast.show({ type: 'success', text1: 'Donor registration removed' });
        replaceTracked(router, '/sos' as any);
      } catch (error: any) {
        Toast.show({ type: 'error', text1: 'Unable to remove donor profile', text2: error.message });
      } finally {
        setIsLoading(false);
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const confirmed = window.confirm('Remove donor registration? You can register again at any time.');
      if (confirmed) {
        executeRemove();
      }
      return;
    }

    Alert.alert('Remove donor registration?', 'You can register again at any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: executeRemove },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator color={Verandah.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <HeaderBackButton onPress={() => router.back()} color={Verandah.primary} style={styles.backButton} />
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{existingId ? 'Edit donor profile' : 'Register as donor'}</Text>
          <Text style={styles.subtitle}>Only your community members can view this number.</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <BaseCard padding={14}>
          <Text style={styles.label}>Blood group</Text>
          <View style={styles.chipGrid}>
            {BLOOD_GROUPS.map((group) => {
              const active = bloodGroup === group;
              return (
                <TouchableOpacity
                  key={group}
                  style={[styles.groupChip, active && styles.groupChipActive]}
                  onPress={() => setBloodGroup(group)}
                >
                  <Text style={[styles.groupChipText, active && styles.groupChipTextActive]}>{group}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </BaseCard>

        <BaseCard padding={14}>
          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Contact phone</Text>
            <TextInput
              style={styles.input}
              value={contactPhone}
              onChangeText={setContactPhone}
              onBlur={normalizePhoneOnBlur}
              placeholder="e.g. 9876543210"
              placeholderTextColor={Verandah.textMuted}
              keyboardType="phone-pad"
              maxLength={20}
            />
            <Text style={styles.helper}>Used by residents to call you for donation requests.</Text>
          </View>
        </BaseCard>

        <BaseCard padding={14}>
          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <Text style={styles.label}>Available to donate</Text>
              <Text style={styles.helper}>{isAvailable ? 'Visible in default donor results' : 'Shown only when people enable unavailable donors'}</Text>
            </View>
            <Switch value={isAvailable} onValueChange={setIsAvailable} />
          </View>
        </BaseCard>

        <BaseCard padding={14}>
          <View style={styles.fieldBlock}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Note (optional)</Text>
              <Text style={styles.counterText}>{note.length}/{MAX_NOTE_LENGTH}</Text>
            </View>
            <TextInput
              style={styles.textArea}
              value={note}
              onChangeText={(value) => setNote(value.slice(0, MAX_NOTE_LENGTH))}
              placeholder="e.g. Prefer evenings"
              placeholderTextColor={Verandah.textMuted}
              multiline
              maxLength={MAX_NOTE_LENGTH}
            />
          </View>
        </BaseCard>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={isLoading}>
          {isLoading ? <ActivityIndicator color={Verandah.primaryFg} /> : <Text style={styles.saveButtonText}>Save donor profile</Text>}
        </TouchableOpacity>

        {existingId ? (
          <TouchableOpacity style={styles.removeButton} onPress={handleRemove} disabled={isLoading}>
            <Text style={styles.removeButtonText}>Remove my registration</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Verandah.surface,
    paddingHorizontal: VerandahSpace.lg,
    paddingTop: VerandahLayout.screenPaddingTop,
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Verandah.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: VerandahSpace.md,
    marginBottom: VerandahSpace.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
    borderColor: Verandah.border,
    backgroundColor: Verandah.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    ...VerandahType.title,
    color: Verandah.textPrimary,
  },
  subtitle: {
    ...VerandahType.caption,
    color: Verandah.textSecondary,
  },
  scrollContent: {
    paddingBottom: 24,
    gap: 6,
  },
  label: {
    ...VerandahType.bodyBold,
    color: Verandah.textPrimary,
    marginBottom: 4,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  groupChip: {
    borderWidth: 1,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.pill,
    backgroundColor: Verandah.card,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  groupChipActive: {
    backgroundColor: Verandah.primary,
    borderColor: Verandah.primary,
  },
  groupChipText: {
    ...VerandahType.caption,
    color: Verandah.textSecondary,
  },
  groupChipTextActive: {
    color: Verandah.primaryFg,
  },
  fieldBlock: {
    width: '100%',
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  counterText: {
    ...VerandahType.caption,
    color: Verandah.textSecondary,
  },
  input: {
    width: '100%',
    marginTop: 4,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: Verandah.borderStrong,
    borderRadius: VerandahRadius.md,
    backgroundColor: Verandah.card,
    color: Verandah.textPrimary,
    height: 40,
    paddingHorizontal: 12,
    ...VerandahType.body,
  },
  helper: {
    ...VerandahType.caption,
    color: Verandah.textSecondary,
    marginTop: 2,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  switchCopy: {
    flex: 1,
  },
  textArea: {
    width: '100%',
    marginTop: 4,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: Verandah.borderStrong,
    borderRadius: VerandahRadius.md,
    backgroundColor: Verandah.card,
    color: Verandah.textPrimary,
    minHeight: 60,
    paddingHorizontal: 12,
    paddingVertical: 6,
    textAlignVertical: 'top',
    ...VerandahType.body,
  },
  saveButton: {
    marginTop: 6,
    borderRadius: VerandahRadius.md,
    backgroundColor: Verandah.primary,
    paddingVertical: 10,
    alignItems: 'center',
  },
  saveButtonText: {
    ...VerandahType.bodyBold,
    color: Verandah.primaryFg,
  },
  removeButton: {
    borderWidth: 1,
    borderColor: Verandah.danger,
    borderRadius: VerandahRadius.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  removeButtonText: {
    ...VerandahType.bodyBold,
    color: Verandah.danger,
  },
});
