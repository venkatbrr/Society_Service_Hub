import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../context/AuthContext';
import {
    SERVICE_CATEGORIES,
    SERVICE_CATEGORY_DEFAULT_FREQUENCY,
    SERVICE_CATEGORY_EMOJI,
    SERVICE_CATEGORY_LABELS,
    ServiceCategory,
} from '../../lib/serviceCategories';
import { supabase } from '../../lib/supabase';

export default function AddServiceScreen() {
  const router = useRouter();
  const { user, communityId } = useAuth();
  const colors = Colors.light;

  const [serviceName, setServiceName] = useState('');
  const [category, setCategory] = useState<ServiceCategory | null>(null);
  const [lastServicedOn, setLastServicedOn] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [frequencyMonths, setFrequencyMonths] = useState('6');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCategorySelect = (cat: ServiceCategory) => {
    setCategory(cat);
    setFrequencyMonths(String(SERVICE_CATEGORY_DEFAULT_FREQUENCY[cat]));
  };

  const handleSubmit = async () => {
    if (!serviceName.trim()) {
      Toast.show({ type: 'error', text1: 'Service name is required' });
      return;
    }
    if (!category) {
      Toast.show({ type: 'error', text1: 'Please select a category' });
      return;
    }
    const freq = parseInt(frequencyMonths, 10);
    if (isNaN(freq) || freq < 1 || freq > 60) {
      Toast.show({ type: 'error', text1: 'Frequency must be between 1 and 60 months' });
      return;
    }
    if (lastServicedOn > new Date()) {
      Toast.show({ type: 'error', text1: 'Last serviced date cannot be in the future' });
      return;
    }
    if (!user) return;

    setLoading(true);
    try {
      // Format date as YYYY-MM-DD
      const dateStr = lastServicedOn.toISOString().split('T')[0];
      // next_due_on is auto-computed by DB trigger
      const nextDueOn = dateStr; // placeholder; trigger overwrites this

      const { error } = await supabase.from('user_services').insert({
        user_id: user.id,
        community_id: communityId ?? null,
        service_name: serviceName.trim(),
        category,
        last_serviced_on: dateStr,
        frequency_months: freq,
        next_due_on: nextDueOn, // DB trigger will overwrite
        notes: notes.trim() || null,
      });

      if (error) throw error;

      Toast.show({ type: 'success', text1: 'Service reminder added' });
      router.back();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: err.message ?? 'Failed to save' });
    } finally {
      setLoading(false);
    }
  };

  const formattedDate = lastServicedOn.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient
        colors={[colors.gradientStart + '10', colors.gradientEnd + '06', 'transparent']}
        style={styles.headerGradient}
      />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
          activeOpacity={0.75}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Add Service Reminder</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Service Name */}
        <Text style={[styles.label, { color: colors.textMuted }]}>SERVICE NAME *</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.glass, borderColor: colors.glassBorder, color: colors.text }]}
          placeholder="e.g., Living Room AC"
          placeholderTextColor={colors.textMuted}
          value={serviceName}
          onChangeText={setServiceName}
          maxLength={100}
          returnKeyType="next"
        />

        {/* Category */}
        <Text style={[styles.label, { color: colors.textMuted }]}>CATEGORY *</Text>
        <View style={styles.categoryGrid}>
          {SERVICE_CATEGORIES.map((cat) => {
            const selected = category === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryChip,
                  {
                    backgroundColor: selected ? colors.primary + '18' : colors.glass,
                    borderColor: selected ? colors.primary : colors.glassBorder,
                  },
                ]}
                onPress={() => handleCategorySelect(cat)}
                activeOpacity={0.8}
              >
                <Text style={styles.catEmoji}>{SERVICE_CATEGORY_EMOJI[cat]}</Text>
                <Text
                  style={[styles.catLabel, { color: selected ? colors.primary : colors.textMuted }]}
                  numberOfLines={2}
                >
                  {SERVICE_CATEGORY_LABELS[cat]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Last Serviced On */}
        <Text style={[styles.label, { color: colors.textMuted }]}>LAST SERVICED ON *</Text>
        <TouchableOpacity
          style={[styles.input, styles.dateInput, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
          onPress={() => setShowDatePicker(true)}
          activeOpacity={0.8}
        >
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '500' }}>{formattedDate}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 16 }}>📅</Text>
        </TouchableOpacity>

        {showDatePicker && (
          <DateTimePicker
            value={lastServicedOn}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            maximumDate={new Date()}
            onChange={(_, date) => {
              setShowDatePicker(Platform.OS === 'ios');
              if (date) setLastServicedOn(date);
            }}
          />
        )}

        {/* Frequency */}
        <Text style={[styles.label, { color: colors.textMuted }]}>FREQUENCY (MONTHS) *</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.glass, borderColor: colors.glassBorder, color: colors.text }]}
          placeholder="e.g., 6"
          placeholderTextColor={colors.textMuted}
          value={frequencyMonths}
          onChangeText={(v) => setFrequencyMonths(v.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          maxLength={2}
          returnKeyType="next"
        />

        {/* Notes */}
        <Text style={[styles.label, { color: colors.textMuted }]}>NOTES (OPTIONAL)</Text>
        <TextInput
          style={[
            styles.input,
            styles.notesInput,
            { backgroundColor: colors.glass, borderColor: colors.glassBorder, color: colors.text },
          ]}
          placeholder="Any extra details..."
          placeholderTextColor={colors.textMuted}
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={500}
          textAlignVertical="top"
          returnKeyType="done"
        />

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitButton, loading && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.submitGradient}
          >
            <Text style={styles.submitText}>{loading ? 'Saving…' : 'Add Reminder'}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  headerGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 160 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 14,
    gap: 10,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  backIcon: { fontSize: 18, fontWeight: '600' },
  headerTitle: { flex: 1, fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 60 },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 20,
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '500',
  },
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notesInput: {
    height: 90,
    paddingTop: 12,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    minWidth: '46%',
    flexShrink: 1,
  },
  catEmoji: { fontSize: 16 },
  catLabel: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  submitButton: { marginTop: 32, borderRadius: 16, overflow: 'hidden' },
  submitGradient: { paddingVertical: 16, alignItems: 'center', borderRadius: 16 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
});
