import { Check } from '@untitledui/icons/Check';
import { ChevronDown } from '@untitledui/icons/ChevronDown';
import { InfoCircle } from '@untitledui/icons/InfoCircle';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { HeaderBackButton } from '../components/HeaderBackButton';
import { Verandah } from '../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';
import { useAuth } from '../context/AuthContext';
import { replaceTracked } from '../lib/navigation';
import { supabase } from '../lib/supabase';

const COMMUNITY_TYPES = ['apartment', 'gated villas', 'housing society', 'township'] as const;
const APPROXIMATE_UNITS = ['<25', '25-100', '100-500', '500+'] as const;
const BLOCK_LABELS = ['Block', 'Tower'] as const;

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
  const [blockLabel, setBlockLabel] = useState<(typeof BLOCK_LABELS)[number]>('Block');
  const [blocksInput, setBlocksInput] = useState('');
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

    // Build block details JSON if blocks entered
    const parsedBlocks = blocksInput
      .split(/[\n,]/)
      .map((b) => b.trim().toUpperCase())
      .filter((b) => b.length > 0);

    const blockDetailsPayload =
      parsedBlocks.length > 0
        ? parsedBlocks.map((bName) => ({
            block: bName,
            flats: [],
          }))
        : null;

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
        p_block_label: blockLabel,
        p_block_details: blockDetailsPayload ?? undefined,
      });

      if (error) throw error;

      Toast.show({
        type: 'success',
        text1: 'Request submitted',
        text2: 'We will review your request within about 24 hours.',
      });
      await refreshSession();
      replaceTracked(router, '/community-request-submitted');
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Request failed', text2: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: Verandah.paper }]} keyboardShouldPersistTaps="handled">
      <HeaderBackButton onPress={() => router.back()} style={styles.backButton} />

      <Text style={styles.title}>Request a new community</Text>
      <View style={[styles.banner, { backgroundColor: Verandah.cautionSoft, borderColor: Verandah.caution + '40' }]}>
        <InfoCircle size={20} color={Verandah.caution} aria-hidden={true} />
        <Text style={[styles.bannerText, { color: Verandah.textPrimary }]}>
          Requests are reviewed — we verify each community. You'll hear back in ~24 hours.
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: Verandah.card, borderColor: Verandah.borderHair }]}>
        <Text style={[styles.label, { color: Verandah.textPrimary }]}>Community name *</Text>
        <TextInput
          style={[styles.input, { color: Verandah.textPrimary, borderColor: Verandah.borderHair, backgroundColor: Verandah.cardMuted }]}
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
                    borderColor: active ? Verandah.primary : Verandah.borderHair,
                    backgroundColor: active ? Verandah.primary : Verandah.cardMuted,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: active ? Verandah.primaryFg : Verandah.textPrimary }]}>{option}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { color: Verandah.textPrimary }]}>Full address</Text>
        <TextInput
          style={[styles.input, { color: Verandah.textPrimary, borderColor: Verandah.borderHair, backgroundColor: Verandah.cardMuted }]}
          value={address}
          onChangeText={setAddress}
          placeholder="42, MG Road, Koramangala"
          placeholderTextColor={Verandah.textSecondary}
        />

        <Text style={[styles.label, { color: Verandah.textPrimary }]}>City *</Text>
        <TouchableOpacity
          style={[styles.input, { justifyContent: 'center', borderColor: Verandah.borderHair, backgroundColor: Verandah.cardMuted }]}
          onPress={() => setShowCityPicker(true)}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: Verandah.textPrimary, fontSize: 15 }}>{city}</Text>
            <ChevronDown size={18} color={Verandah.textSecondary} aria-hidden={true} />
          </View>
        </TouchableOpacity>

        <Modal visible={showCityPicker} transparent animationType="fade">
          <Pressable style={styles.modalOverlay} onPress={() => setShowCityPicker(false)}>
            <View style={[styles.modalContent, { backgroundColor: Verandah.card, borderColor: Verandah.borderHair }]}>
              <Text style={[styles.modalTitle, { color: Verandah.textPrimary }]}>Select City</Text>
              {CITIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.modalOption, city === c && { backgroundColor: Verandah.cardMuted }]}
                  onPress={() => {
                    setCity(c);
                    setShowCityPicker(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, { color: city === c ? Verandah.primary : Verandah.textPrimary }]}>{c}</Text>
                  {city === c && <Check size={18} color={Verandah.primary} aria-hidden={true} />}
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Modal>

        <Text style={[styles.label, { color: Verandah.textPrimary }]}>Pincode *</Text>
        <TextInput
          style={[styles.input, { color: Verandah.textPrimary, borderColor: Verandah.borderHair, backgroundColor: Verandah.cardMuted }]}
          value={pincode}
          onChangeText={(value) => setPincode(value.replace(/\D/g, ''))}
          placeholder="560001"
          placeholderTextColor={Verandah.textSecondary}
          maxLength={6}
          keyboardType="number-pad"
        />

        <Text style={[styles.label, { color: Verandah.textPrimary }]}>Area / neighbourhood</Text>
        <TextInput
          style={[styles.input, { color: Verandah.textPrimary, borderColor: Verandah.borderHair, backgroundColor: Verandah.cardMuted }]}
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
                    borderColor: active ? Verandah.primary : Verandah.borderHair,
                    backgroundColor: active ? Verandah.primary : Verandah.cardMuted,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: active ? Verandah.primaryFg : Verandah.textPrimary }]}>{option}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { color: Verandah.textPrimary }]}>Block or Tower Structure</Text>
        <View style={styles.chipRow}>
          {BLOCK_LABELS.map((option) => {
            const active = option === blockLabel;
            return (
              <Pressable
                key={option}
                onPress={() => setBlockLabel(option)}
                style={[
                  styles.chip,
                  {
                    borderColor: active ? Verandah.primary : Verandah.borderHair,
                    backgroundColor: active ? Verandah.primary : Verandah.cardMuted,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: active ? Verandah.primaryFg : Verandah.textPrimary }]}>{option}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { color: Verandah.textPrimary }]}>{blockLabel} Names (Optional)</Text>
        <TextInput
          style={[styles.input, { color: Verandah.textPrimary, borderColor: Verandah.borderHair, backgroundColor: Verandah.cardMuted }]}
          placeholder="e.g. A, B, C, D, E"
          placeholderTextColor={Verandah.textSecondary}
          value={blocksInput}
          onChangeText={setBlocksInput}
          autoCapitalize="characters"
        />

        <Text style={[styles.label, { color: Verandah.textPrimary }]}>Your flat / house number *</Text>
        <TextInput
          style={[styles.input, { color: Verandah.textPrimary, borderColor: Verandah.borderHair, backgroundColor: Verandah.cardMuted }]}
          placeholder="e.g. A101"
          placeholderTextColor={Verandah.textSecondary}
          value={requesterFlatNumber}
          onChangeText={setRequesterFlatNumber}
          onBlur={() => setRequesterFlatNumber((prev) => prev.toUpperCase().replace(/[\s-]/g, ''))}
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
                borderColor: confirmedAccuracy ? Verandah.primary : Verandah.borderHair,
                backgroundColor: confirmedAccuracy ? Verandah.primary : 'transparent',
              },
            ]}
          >
            {confirmedAccuracy ? <Check size={12} color={Verandah.primaryFg} aria-hidden={true} /> : null}
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
    paddingTop: Platform.select({ web: 24, default: 68 }),
    paddingBottom: 40,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 18,
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
    gap: 8,
    marginBottom: 18,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
    marginBottom: 20,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  primaryButton: {
    backgroundColor: Verandah.primary,
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: Verandah.primaryFg,
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  modalOptionText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
