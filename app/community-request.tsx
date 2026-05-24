import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahType } from '../constants/Verandah';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const COMMUNITY_TYPES = ['apartment', 'gated villas', 'housing society', 'township'] as const;
const APPROXIMATE_UNITS = ['<25', '25-100', '100-500', '500+'] as const;

export default function CommunityRequestScreen() {
  const router = useRouter();
  const { refreshSession } = useAuth();

  const [name, setName] = useState('');
  const [communityType, setCommunityType] = useState<(typeof COMMUNITY_TYPES)[number]>('apartment');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Hyderabad');
  const [showCityPicker, setShowCityPicker] = useState(false);
  const CITIES = ['Hyderabad'];
  const [pincode, setPincode] = useState('');
  const [area, setArea] = useState('');
  const [approximateUnits, setApproximateUnits] = useState<string>('');
  const [requesterFlatNumber, setRequesterFlatNumber] = useState('');
  const [confirmedAccuracy, setConfirmedAccuracy] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submitRequest = async () => {
    if (!name.trim() || !city.trim() || !/^\d{6}$/.test(pincode.trim())) {
      Toast.show({
        type: 'error',
        text1: 'Missing required fields',
        text2: 'Fill community name, city, and a valid 6-digit pincode.',
      });
      return;
    }

    if (!requesterFlatNumber.trim()) {
      Toast.show({ type: 'error', text1: 'Missing flat number', text2: 'Enter your flat or house number.' });
      return;
    }

    if (!confirmedAccuracy) {
      Toast.show({ type: 'error', text1: 'Confirmation needed', text2: 'Please confirm the details are accurate.' });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('submit_community_request', {
        p_name: name.trim(),
        p_city: city.trim(),
        p_pincode: pincode.trim(),
        p_address: address.trim() || undefined,
        p_area: area.trim() || undefined,
        p_community_type: communityType,
        p_approximate_units: approximateUnits || undefined,
        p_requester_flat_number: requesterFlatNumber.trim() || undefined,
      });

      if (error) throw error;

      Toast.show({
        type: 'success',
        text1: 'Request submitted',
        text2: 'We will review your request within about 24 hours.',
      });
      await refreshSession();
      router.replace('/community-request-submitted');
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Request failed', text2: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: Verandah.surface }]}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.75}>
        <Ionicons name="chevron-back" size={18} color={Verandah.primary} />
        <Text style={[styles.backButtonText, { color: Verandah.primary }]}>Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Request a new community</Text>
      <View style={[styles.banner, { backgroundColor: Verandah.cautionSoft, borderColor: Verandah.caution + '40' }]}>
        <Ionicons name="time-outline" size={20} color={Verandah.caution} />
        <Text style={[styles.bannerText, { color: Verandah.textPrimary }]}>
          Requests are reviewed — we verify each community. You'll hear back in ~24 hours.
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: Verandah.card, borderColor: Verandah.border }]}>
        <Text style={[styles.label, { color: Verandah.textPrimary }]}>Community name *</Text>
        <TextInput
          style={[styles.input, { color: Verandah.textPrimary, borderColor: Verandah.borderStrong, backgroundColor: Verandah.cardMuted }]}
          value={name}
          onChangeText={setName}
          placeholder="Maple Grove Residency"
          placeholderTextColor={Verandah.textSecondary}
        />

        <Text style={[styles.label, { color: Verandah.textPrimary }]}>Type</Text>
        <View style={styles.chipRow}>
          {COMMUNITY_TYPES.map((option) => {
            const active = option === communityType;
            return (
              <Pressable
                key={option}
                onPress={() => setCommunityType(option)}
                style={[
                  styles.chip,
                  {
                    borderColor: active ? Verandah.primary : Verandah.border,
                    backgroundColor: active ? Verandah.primary + '14' : Verandah.card,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: active ? Verandah.primary : Verandah.textPrimary }]}>{option}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { color: Verandah.textPrimary }]}>Full address</Text>
        <TextInput
          style={[styles.input, { color: Verandah.textPrimary, borderColor: Verandah.borderStrong, backgroundColor: Verandah.cardMuted }]}
          value={address}
          onChangeText={setAddress}
          placeholder="42, MG Road, Koramangala"
          placeholderTextColor={Verandah.textSecondary}
        />

        <Text style={[styles.label, { color: Verandah.textPrimary }]}>City *</Text>
        <TouchableOpacity
          style={[styles.input, { justifyContent: 'center', borderColor: Verandah.borderStrong, backgroundColor: Verandah.cardMuted }]}
          onPress={() => setShowCityPicker(true)}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: Verandah.textPrimary, fontSize: 16 }}>{city}</Text>
            <Ionicons name="chevron-down" size={20} color={Verandah.textSecondary} />
          </View>
        </TouchableOpacity>

        <Modal visible={showCityPicker} transparent animationType="fade">
          <Pressable style={styles.modalOverlay} onPress={() => setShowCityPicker(false)}>
            <View style={[styles.modalContent, { backgroundColor: Verandah.card, borderColor: Verandah.border }]}>
              <Text style={[styles.modalTitle, { color: Verandah.textPrimary }]}>Select City</Text>
              {CITIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.modalOption, city === c && { backgroundColor: Verandah.primary + '14' }]}
                  onPress={() => {
                    setCity(c);
                    setShowCityPicker(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, { color: city === c ? Verandah.primary : Verandah.textPrimary }]}>{c}</Text>
                  {city === c && <Ionicons name="checkmark" size={20} color={Verandah.primary} />}
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Modal>

        <Text style={[styles.label, { color: Verandah.textPrimary }]}>Pincode *</Text>
        <TextInput
          style={[styles.input, { color: Verandah.textPrimary, borderColor: Verandah.borderStrong, backgroundColor: Verandah.cardMuted }]}
          value={pincode}
          onChangeText={(value) => setPincode(value.replace(/\D/g, ''))}
          placeholder="560001"
          placeholderTextColor={Verandah.textSecondary}
          maxLength={6}
          keyboardType="number-pad"
        />

        <Text style={[styles.label, { color: Verandah.textPrimary }]}>Area / neighbourhood</Text>
        <TextInput
          style={[styles.input, { color: Verandah.textPrimary, borderColor: Verandah.borderStrong, backgroundColor: Verandah.cardMuted }]}
          value={area}
          onChangeText={setArea}
          placeholder="Koramangala"
          placeholderTextColor={Verandah.textSecondary}
        />

        <Text style={[styles.label, { color: Verandah.textPrimary }]}>Approximate units</Text>
        <View style={styles.chipRow}>
          {APPROXIMATE_UNITS.map((option) => {
            const active = option === approximateUnits;
            return (
              <Pressable
                key={option}
                onPress={() => setApproximateUnits(option)}
                style={[
                  styles.chip,
                  {
                    borderColor: active ? Verandah.primary : Verandah.border,
                    backgroundColor: active ? Verandah.primary + '14' : Verandah.card,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: active ? Verandah.primary : Verandah.textPrimary }]}>{option}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { color: Verandah.textPrimary }]}>Your flat / house number *</Text>
        <TextInput
          style={[styles.input, { color: Verandah.textPrimary, borderColor: Verandah.borderStrong, backgroundColor: Verandah.card }]}
          placeholder="e.g. A101"
          placeholderTextColor={Verandah.textSecondary}
          value={requesterFlatNumber}
          onChangeText={setRequesterFlatNumber}
          onBlur={() => setRequesterFlatNumber(prev => prev.toUpperCase().replace(/[\s-]/g, ''))}
          autoCapitalize="characters"
        />

        <TouchableOpacity
          onPress={() => setConfirmedAccuracy((prev) => !prev)}
          style={styles.checkboxRow}
          activeOpacity={0.75}
        >
          <View
            style={[
              styles.checkbox,
              {
                borderColor: confirmedAccuracy ? Verandah.primary : Verandah.border,
                backgroundColor: confirmedAccuracy ? Verandah.primary : 'transparent',
              },
            ]}
          >
            {confirmedAccuracy ? <Ionicons name="checkmark" size={14} color={Verandah.primaryFg} /> : null}
          </View>
          <Text style={[styles.checkboxText, { color: Verandah.textPrimary }]}>
            I confirm the details provided are accurate to the best of my knowledge.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={submitRequest}
          disabled={submitting}
          activeOpacity={0.8}
          style={styles.primaryButton}
        >
          {submitting ? <ActivityIndicator color={Verandah.primaryFg} /> : <Text style={styles.primaryButtonText}>Submit Request</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 68,
    paddingBottom: 40,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 18,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  title: {
    ...VerandahType.display,
    color: Verandah.textPrimary,
    marginBottom: 16,
  },
  banner: {
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    marginBottom: 18,
  },
  bannerText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    elevation: 0,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  input: {
    borderWidth: 0.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 50,
    fontSize: 16,
    marginBottom: 18,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 18,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 22,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  primaryButton: {
    height: 50,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Verandah.primary,
    elevation: 0,
  },
  primaryButtonText: {
    color: Verandah.primaryFg,
    fontSize: 14,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    elevation: 0,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 16,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  modalOptionText: {
    fontSize: 16,
    fontWeight: '500',
  },
});
