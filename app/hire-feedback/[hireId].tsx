import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Verandah } from '../../constants/Colors';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

type FeedbackSignal = 'positive' | 'negative' | 'skipped';

export default function HireFeedbackScreen() {
  const { hireId, provider_id } = useLocalSearchParams<{ hireId: string; provider_id?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const colors = {
    background: Verandah.surface,
    text: Verandah.textPrimary,
    textMuted: Verandah.textSecondary,
    primary: Verandah.primary,
    secondary: Verandah.accent,
    accent: Verandah.danger,
    card: Verandah.card,
    border: Verandah.border,
    surface: Verandah.cardMuted,
  };

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [providerId, setProviderId] = useState<string | null>(provider_id ?? null);
  const [providerName, setProviderName] = useState<string>('Provider');
  const [hireDate, setHireDate] = useState<string>('');

  const [selectedSignal, setSelectedSignal] = useState<FeedbackSignal | null>(null);
  const [note, setNote] = useState('');

  const [showPublicPrompt, setShowPublicPrompt] = useState(false);

  const showNoteInput = selectedSignal === 'positive' || selectedSignal === 'negative';

  useEffect(() => {
    async function loadHire() {
      if (!hireId || !user) {
        setLoading(false);
        return;
      }

      try {
        const { data: hireRow, error: hireError } = await supabase
          .from('provider_hires')
          .select('id, provider_id, created_at')
          .eq('id', hireId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (hireError) throw hireError;
        if (!hireRow) {
          Toast.show({ type: 'error', text1: 'Hire not found' });
          router.back();
          return;
        }

        setProviderId(hireRow.provider_id);
        setHireDate(hireRow.created_at);

        const { data: providerRow, error: providerError } = await supabase
          .from('service_providers')
          .select('name')
          .eq('id', hireRow.provider_id)
          .maybeSingle();

        if (!providerError && providerRow?.name) {
          setProviderName(providerRow.name);
        }

        const { data: existingFeedback } = await supabase
          .from('hire_feedback')
          .select('signal, note')
          .eq('hire_id', hireId)
          .maybeSingle();

        if (existingFeedback?.signal) {
          setSelectedSignal(existingFeedback.signal as FeedbackSignal);
          setNote(existingFeedback.note ?? '');
        }
      } catch (err: any) {
        Toast.show({ type: 'error', text1: 'Error', text2: err.message ?? 'Could not load hire details.' });
      } finally {
        setLoading(false);
      }
    }

    void loadHire();
  }, [hireId, router, user]);

  const formattedHireDate = useMemo(() => {
    if (!hireDate) return '';
    return new Date(hireDate).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }, [hireDate]);

  const handleSubmit = async () => {
    if (!hireId || !selectedSignal) {
      Toast.show({ type: 'error', text1: 'Select feedback first' });
      return;
    }

    setSubmitting(true);
    try {
      const payloadNote = showNoteInput ? note.trim().slice(0, 280) || null : null;
      const { error } = await supabase.rpc('record_hire_feedback', {
        p_hire_id: hireId,
        p_signal: selectedSignal,
        p_note: payloadNote,
      });
      if (error) throw error;

      if (selectedSignal === 'positive') {
        if (!providerId) {
          Toast.show({ type: 'success', text1: 'Saved.' });
          router.back();
          return;
        }

        const { data: shouldShow, error: shouldShowError } = await supabase.rpc('should_show_public_rating_nudge', {
          p_provider_id: providerId,
        });
        if (shouldShowError) throw shouldShowError;

        if (shouldShow) {
          setShowPublicPrompt(true);
        } else {
          Toast.show({ type: 'success', text1: 'Saved.' });
          router.back();
        }
      } else {
        Toast.show({ type: 'success', text1: 'Saved.' });
        router.back();
      }
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: err.message ?? 'Could not save feedback.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRateNow = async () => {
    if (!providerId) {
      router.back();
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('mark_public_rating_nudge', {
        p_provider_id: providerId,
        p_outcome: 'rated',
      });
      if (error) throw error;

      router.replace({ pathname: '/provider/[id]', params: { id: providerId } } as any);
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: err.message ?? 'Could not continue to rating.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleNotNow = async () => {
    if (!providerId) {
      router.back();
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('mark_public_rating_nudge', {
        p_provider_id: providerId,
        p_outcome: 'dismissed',
      });
      if (error) throw error;

      Toast.show({ type: 'success', text1: 'Saved.' });
      router.back();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: err.message ?? 'Could not save choice.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          activeOpacity={0.75}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Visit feedback</Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
        <Text style={[styles.providerName, { color: colors.text }]}>{providerName}</Text>
        {formattedHireDate ? (
          <Text style={[styles.hireDate, { color: colors.textMuted }]}>Visit logged on {formattedHireDate}</Text>
        ) : null}

        <View style={styles.signalGrid}>
          <TouchableOpacity
            style={[
              styles.signalButton,
              { borderColor: colors.border, backgroundColor: colors.surface },
              selectedSignal === 'positive' && { borderColor: colors.secondary, backgroundColor: colors.secondary + '18' },
            ]}
            onPress={() => setSelectedSignal('positive')}
            activeOpacity={0.82}
          >
            <Text style={styles.signalEmoji}>👍</Text>
            <Text style={[styles.signalLabel, { color: colors.text }]}>Good</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.signalButton,
              { borderColor: colors.border, backgroundColor: colors.surface },
              selectedSignal === 'negative' && { borderColor: colors.accent, backgroundColor: colors.accent + '15' },
            ]}
            onPress={() => setSelectedSignal('negative')}
            activeOpacity={0.82}
          >
            <Text style={styles.signalEmoji}>👎</Text>
            <Text style={[styles.signalLabel, { color: colors.text }]}>Not great</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.signalButton,
              { borderColor: colors.border, backgroundColor: colors.surface },
              selectedSignal === 'skipped' && { borderColor: colors.primary, backgroundColor: colors.primary + '14' },
            ]}
            onPress={() => {
              setSelectedSignal('skipped');
              setNote('');
            }}
            activeOpacity={0.82}
          >
            <Text style={styles.signalEmoji}>⏭</Text>
            <Text style={[styles.signalLabel, { color: colors.text }]}>Skip</Text>
          </TouchableOpacity>
        </View>

        {showNoteInput ? (
          <>
            <Text style={[styles.noteLabel, { color: colors.textMuted }]}>Note (optional)</Text>
            <TextInput
              style={[styles.noteInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
              value={note}
              onChangeText={(value) => setNote(value.slice(0, 280))}
              maxLength={280}
              placeholder="Just for your own record."
              placeholderTextColor={colors.textMuted}
              multiline
            />
          </>
        ) : null}

        {showPublicPrompt ? (
          <View style={[styles.promptCard, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
            <Text style={[styles.promptTitle, { color: colors.text }]}>Glad it went well - leave a public rating for other residents?</Text>
            <View style={styles.promptActions}>
              <TouchableOpacity
                style={[styles.promptPrimary, { backgroundColor: colors.primary }]}
                onPress={handleRateNow}
                disabled={submitting}
                activeOpacity={0.85}
              >
                <Text style={styles.promptPrimaryText}>Rate now</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleNotNow} disabled={submitting} activeOpacity={0.82}>
                <Text style={[styles.promptSecondaryText, { color: colors.primary }]}>Not now</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.primary }, submitting && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            <Text style={styles.saveBtnText}>{submitting ? 'Saving...' : 'Save'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  backIcon: { fontSize: 18, fontWeight: '500' },
  headerTitle: { fontSize: 20, fontWeight: '500', letterSpacing: -0.3 },
  card: {
    marginTop: 8,
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    gap: 14,
  },
  providerName: { fontSize: 22, fontWeight: '500' },
  hireDate: { fontSize: 13, fontWeight: '500' },
  signalGrid: {
    gap: 10,
  },
  signalButton: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  signalEmoji: { fontSize: 22, lineHeight: 24 },
  signalLabel: { fontSize: 16, fontWeight: '500' },
  noteLabel: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 1,
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 78,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  saveBtn: {
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 14,
  },
  saveBtnText: {
    color: Verandah.primaryFg,
    fontSize: 15,
    fontWeight: '500',
  },
  promptCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 12,
  },
  promptTitle: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  promptActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  promptPrimary: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  promptPrimaryText: {
    color: Verandah.primaryFg,
    fontSize: 13,
    fontWeight: '500',
  },
  promptSecondaryText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
