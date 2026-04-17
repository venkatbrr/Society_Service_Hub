import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Image, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/Colors';
import { ProviderSelector } from '../../components/ProviderSelector';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const CATEGORIES = ['Cleaning', 'Repair', 'Pest Control', 'Electrician', 'Plumber', 'AC Service', 'Painting', 'Carpentry', 'Appliance Service', 'Other'];

export default function AddVisitScreen() {
  const router = useRouter();
  const { user, communityId } = useAuth();
  const insets = useSafeAreaInsets();
  const colors = Colors.light;

  const [providerMode, setProviderMode] = useState<'existing' | 'new'>('existing');
  const [selectedProvider, setSelectedProvider] = useState<any>(null);
  const [manualProviderName, setManualProviderName] = useState('');
  const [manualProviderPhone, setManualProviderPhone] = useState('');
  const [manualProviderWhatsapp, setManualProviderWhatsapp] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  
  // Date and Time state
  const [visitDate, setVisitDate] = useState(new Date());
  const [startTime, setStartTime] = useState(new Date());
  const [endTime, setEndTime] = useState(new Date(new Date().setHours(new Date().getHours() + 1)));

  const [estimatedCost, setEstimatedCost] = useState('');
  const [maxJoiners, setMaxJoiners] = useState('');

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) setVisitDate(selectedDate);
  };

  const onStartTimeChange = (event: DateTimePickerEvent, selectedTime?: Date) => {
    setShowStartTimePicker(Platform.OS === 'ios');
    if (selectedTime) setStartTime(selectedTime);
  };

  const onEndTimeChange = (event: DateTimePickerEvent, selectedTime?: Date) => {
    setShowEndTimePicker(Platform.OS === 'ios');
    if (selectedTime) setEndTime(selectedTime);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const handleSave = async () => {
    if (!title.trim()) return Toast.show({ type: 'error', text1: 'Missing Title' });
    if (!category) return Toast.show({ type: 'error', text1: 'Select a Category' });

    const pName = providerMode === 'existing' ? selectedProvider?.name : manualProviderName;
    if (!pName) return Toast.show({ type: 'error', text1: 'Provider name is required' });

    const timeSlot = `${formatTime(startTime)} - ${formatTime(endTime)}`;

    setSubmitting(true);
    try {
      const { error } = await supabase.from('service_visits').insert({
        community_id: communityId as string,
        created_by: user?.id as string,
        provider_id: providerMode === 'existing' ? selectedProvider.id : null,
        provider_name: pName,
        provider_phone: providerMode === 'existing' ? selectedProvider.phone : manualProviderPhone || null,
        provider_whatsapp: providerMode === 'existing' ? selectedProvider.whatsapp : manualProviderWhatsapp || null,
        title: title.trim(),
        description: description.trim() || null,
        category,
        visit_date: visitDate.toISOString().split('T')[0],
        visit_time_slot: timeSlot,
        estimated_cost: estimatedCost.trim() || null,
        max_joiners: maxJoiners ? parseInt(maxJoiners) : null,
        status: 'upcoming'
      });

      if (error) throw error;

      Toast.show({ type: 'success', text1: 'Visit shared!' });
      router.back();
    } catch (e: any) {
      console.error(e);
      Toast.show({ type: 'error', text1: 'Error', text2: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.text }]}>Share a provider visit</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>Let neighbors know a provider is coming</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>1. WHICH PROVIDER IS VISITING?</Text>
          <ProviderSelector 
            communityId={communityId as string}
            mode={providerMode}
            onModeChange={setProviderMode}
            selectedProviderId={selectedProvider?.id}
            onSelectProvider={setSelectedProvider}
            manualProviderName={manualProviderName}
            onManualNameChange={setManualProviderName}
            manualProviderPhone={manualProviderPhone}
            onManualPhoneChange={setManualProviderPhone}
            manualProviderWhatsapp={manualProviderWhatsapp}
            onManualWhatsappChange={setManualProviderWhatsapp}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>2. VISIT DETAILS</Text>
          
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>VISIT TITLE *</Text>
            <TextInput 
              style={[styles.input, { borderColor: colors.border }]} 
              placeholder="e.g. AC deep cleaning, pest control" 
              value={title}
              onChangeText={setTitle}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>CATEGORY *</Text>
            <View style={categoryGridStyle.categoryGrid}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity 
                  key={cat} 
                  style={[
                    categoryGridStyle.catChip, 
                    { borderColor: colors.border },
                    category === cat && { backgroundColor: colors.primary, borderColor: colors.primary }
                  ]}
                  onPress={() => setCategory(cat)}
                >
                  <Text style={[categoryGridStyle.catText, { color: category === cat ? '#FFF' : colors.text }]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>VISIT DATE *</Text>
            <TouchableOpacity 
              style={[styles.input, { borderColor: colors.border, justifyContent: 'center' }]} 
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={{ fontSize: 16, color: colors.text }}>
                {visitDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={visitDate}
                mode="date"
                display="default"
                onChange={onDateChange}
                minimumDate={new Date()}
              />
            )}
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.text }]}>START TIME *</Text>
              <TouchableOpacity 
                style={[styles.input, { borderColor: colors.border, justifyContent: 'center' }]} 
                onPress={() => setShowStartTimePicker(true)}
              >
                <Text style={{ fontSize: 16, color: colors.text }}>{formatTime(startTime)}</Text>
              </TouchableOpacity>
              {showStartTimePicker && (
                <DateTimePicker
                  value={startTime}
                  mode="time"
                  display="default"
                  onChange={onStartTimeChange}
                />
              )}
            </View>
            <View style={{ width: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.text }]}>END TIME *</Text>
              <TouchableOpacity 
                style={[styles.input, { borderColor: colors.border, justifyContent: 'center' }]} 
                onPress={() => setShowEndTimePicker(true)}
              >
                <Text style={{ fontSize: 16, color: colors.text }}>{formatTime(endTime)}</Text>
              </TouchableOpacity>
              {showEndTimePicker && (
                <DateTimePicker
                  value={endTime}
                  mode="time"
                  display="default"
                  onChange={onEndTimeChange}
                />
              )}
            </View>
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.text }]}>EST. COST (OPTIONAL)</Text>
              <TextInput 
                style={[styles.input, { borderColor: colors.border }]} 
                placeholder="e.g. ₹400 / unit" 
                value={estimatedCost}
                onChangeText={setEstimatedCost}
              />
            </View>
            <View style={{ width: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.text }]}>MAX JOINERS</Text>
              <TextInput 
                style={[styles.input, { borderColor: colors.border }]} 
                placeholder="Empty for unlimited" 
                keyboardType="numeric"
                value={maxJoiners}
                onChangeText={setMaxJoiners}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>DESCRIPTION (OPTIONAL)</Text>
            <TextInput 
              style={[styles.textArea, { borderColor: colors.border }]} 
              placeholder="Any details neighbors should know..." 
              multiline
              numberOfLines={4}
              value={description}
              onChangeText={setDescription}
              textAlignVertical="top"
            />
          </View>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.primary + '10' }]}>
            <Ionicons name="bulb-outline" size={20} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.primary }]}>
                Share visits to coordinate with neighbors. Providers often charge less for multiple jobs in one trip!
            </Text>
        </View>

        <TouchableOpacity 
          style={[styles.submitBtn, { backgroundColor: colors.primary, marginBottom: Math.max(insets.bottom, 40) }]} 
          onPress={handleSave}
          disabled={submitting}
        >
          {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>Share Visit</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const categoryGridStyle = StyleSheet.create({
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  catText: {
    fontSize: 13,
    fontWeight: '600',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    marginBottom: 32,
    alignItems: 'flex-start',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    marginTop: 4,
    lineHeight: 20,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 20,
    opacity: 0.6,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    height: 56,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  textArea: {
    height: 100,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  infoCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 16,
    gap: 12,
    marginBottom: 32,
    alignItems: 'center',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  submitBtn: {
    height: 58,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
});
