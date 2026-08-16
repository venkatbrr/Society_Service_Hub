import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Verandah } from '../../constants/Colors';
import { VerandahRadius, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { replaceTracked } from '../../lib/navigation';
import { supabase } from '../../lib/supabase';

export default function FundsAccessRequestScreen() {
  const router = useRouter();
  const colors = Verandah;
  const { profile, user, communityHasLead, refreshSession } = useAuth();

  const [contactName, setContactName] = useState(profile?.full_name ?? '');
  const [contactPhone, setContactPhone] = useState((profile as any)?.phone_number ?? user?.phone ?? '');
  const [purpose, setPurpose] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!contactName.trim() || !contactPhone.trim()) {
      Toast.show({ type: 'error', text1: 'Missing details', text2: 'Contact name and phone are required.' });
      return;
    }

    try {
      setSaving(true);
      const { error } = await supabase.rpc('submit_funds_access_request', {
        p_contact_name: contactName.trim(),
        p_contact_phone: contactPhone.trim(),
        p_purpose: purpose.trim() || null,
      });

      if (error) throw error;

      await refreshSession();
      Toast.show({ type: 'success', text1: "Request submitted. We'll be in touch." });
      replaceTracked(router, '/(tabs)/community');
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to submit request', text2: error.message });
    } finally {
      setSaving(false);
    }
  };

  // The community-tab CTA is already hidden without a lead, but this route is
  // deep-linkable and reachable from a stale notification, so it guards itself
  // rather than trusting its entry point.
  if (!communityHasLead) {
    return (
      <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.surface }]}>
        <Text style={styles.title}>Funds aren't active</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Funds aren't active in this community yet. They'll switch on once a president or vice president is appointed.
        </Text>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          onPress={() => replaceTracked(router, '/(tabs)/community')}
        >
          <Text style={styles.primaryButtonText}>Back to community</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.surface }]}>
      <Text style={styles.title}>Request funds support</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Tell us who to contact to activate funds in your community.</Text>

      <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.textPrimary }]}>Contact name</Text>
        <TextInput
          value={contactName}
          onChangeText={setContactName}
          style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.cardMuted }]}
          placeholder="Contact person"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={[styles.label, { color: colors.textPrimary }]}>Contact phone</Text>
        <TextInput
          value={contactPhone}
          onChangeText={setContactPhone}
          style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.cardMuted }]}
          placeholder="Phone number"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={[styles.label, { color: colors.textPrimary }]}>Purpose (optional)</Text>
        <TextInput
          value={purpose}
          onChangeText={(text) => setPurpose(text.slice(0, 280))}
          style={[styles.textArea, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.cardMuted }]}
          placeholder="Briefly tell us what you'd like to use funds for. Optional."
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
        <Text style={[styles.helper, { color: colors.textSecondary }]}>{purpose.length}/280</Text>

        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={submit} disabled={saving}>
          <Text style={styles.primaryButtonText}>{saving ? 'Submitting...' : 'Submit request'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.cancelText, { color: colors.textMuted }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.select({ web: 24, default: 76 }),
    paddingBottom: 32,
  },
  title: {
    ...VerandahType.display,
    color: Verandah.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 18,
  },
  formCard: {
    borderRadius: VerandahRadius.lg,
    borderWidth: 1,
    padding: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 7,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: VerandahRadius.md,
    height: 48,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: VerandahRadius.md,
    minHeight: 96,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  helper: {
    marginTop: 6,
    fontSize: 12,
  },
  primaryButton: {
    marginTop: 16,
    borderRadius: VerandahRadius.md,
    alignItems: 'center',
    paddingVertical: 13,
  },
  primaryButtonText: {
    color: Verandah.primaryFg,
    fontSize: 15,
    fontWeight: '500',
  },
  cancelText: {
    textAlign: 'center',
    marginTop: 14,
    fontSize: 13,
    fontWeight: '500',
  },
});
