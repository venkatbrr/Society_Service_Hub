import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
import { Colors } from '../constants/Colors';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const COMMUNITY_TYPES = ['apartment', 'gated villas', 'housing society', 'township'] as const;
const APPROXIMATE_UNITS = ['<25', '25-100', '100-500', '500+'] as const;

export default function CommunityRequestScreen() {
  const router = useRouter();
  const { refreshSession } = useAuth();
  const colors = Colors.light;

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
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={[`${colors.warning}22`, `${colors.gradientEnd}10`, 'transparent']} style={styles.gradientOverlay} />

      <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.75}>
        <Ionicons name="chevron-back" size={18} color={colors.primary} />
        <Text style={[styles.backButtonText, { color: colors.primary }]}>Back</Text>
      </TouchableOpacity>

      <Text style={[styles.title, { color: colors.text }]}>Request a new community</Text>
      <View style={[styles.banner, { backgroundColor: `${colors.warning}18`, borderColor: `${colors.warning}40` }]}>
        <Ionicons name="time-outline" size={20} color={colors.warning} />
        <Text style={[styles.bannerText, { color: colors.text }]}>
          Requests are reviewed — we verify each community. You'll hear back in ~24 hours.
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
        <Text style={[styles.label, { color: colors.text }]}>COMMUNITY NAME *</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
          value={name}
          onChangeText={setName}
          placeholder="Maple Grove Residency"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={[styles.label, { color: colors.text }]}>TYPE</Text>
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
                    borderColor: active ? colors.primary : colors.glassBorder,
                    backgroundColor: active ? `${colors.primary}14` : colors.surface,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: active ? colors.primary : colors.text }]}>{option}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { color: colors.text }]}>FULL ADDRESS</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
          value={address}
          onChangeText={setAddress}
          placeholder="42, MG Road, Koramangala"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={[styles.label, { color: colors.text }]}>CITY *</Text>
        <TouchableOpacity
          style={[styles.input, { justifyContent: 'center', borderColor: colors.border, backgroundColor: colors.surface2 }]}
          onPress={() => setShowCityPicker(true)}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: colors.text, fontSize: 16 }}>{city}</Text>
            <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
          </View>
        </TouchableOpacity>

        <Modal visible={showCityPicker} transparent animationType="fade">
          <Pressable style={styles.modalOverlay} onPress={() => setShowCityPicker(false)}>
            <View style={[styles.modalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select City</Text>
              {CITIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.modalOption, city === c && { backgroundColor: `${colors.primary}14` }]}
                  onPress={() => {
                    setCity(c);
                    setShowCityPicker(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, { color: city === c ? colors.primary : colors.text }]}>{c}</Text>
                  {city === c && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Modal>

        <Text style={[styles.label, { color: colors.text }]}>PINCODE *</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
          value={pincode}
          onChangeText={(value) => setPincode(value.replace(/\D/g, ''))}
          placeholder="560001"
          placeholderTextColor={colors.textMuted}
          maxLength={6}
          keyboardType="number-pad"
        />

        <Text style={[styles.label, { color: colors.text }]}>AREA / NEIGHBOURHOOD</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
          value={area}
          onChangeText={setArea}
          placeholder="Koramangala"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={[styles.label, { color: colors.text }]}>APPROXIMATE UNITS</Text>
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
                    borderColor: active ? colors.primary : colors.glassBorder,
                    backgroundColor: active ? `${colors.primary}14` : colors.surface,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: active ? colors.primary : colors.text }]}>{option}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { color: colors.text }]}>YOUR FLAT / HOUSE NUMBER *</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          placeholder="e.g. A101"
          placeholderTextColor={colors.textMuted}
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
                borderColor: confirmedAccuracy ? colors.primary : colors.border,
                backgroundColor: confirmedAccuracy ? colors.primary : 'transparent',
              },
            ]}
          >
            {confirmedAccuracy ? <Ionicons name="checkmark" size={14} color="#FFF" /> : null}
          </View>
          <Text style={[styles.checkboxText, { color: colors.text }]}>
            I confirm the details provided are accurate to the best of my knowledge.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={submitRequest} disabled={submitting} activeOpacity={0.8}>
          <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={styles.primaryButton}>
            {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryButtonText}>Submit Request</Text>}
          </LinearGradient>
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
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 280,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 18,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.6,
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
    fontWeight: '600',
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
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 18,
    paddingHorizontal: 16,
    height: 54,
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
    fontWeight: '700',
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
    fontWeight: '600',
  },
  primaryButton: {
    height: 54,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
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
    fontWeight: '600',
  },
});
