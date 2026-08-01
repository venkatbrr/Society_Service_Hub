import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
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
import { Verandah } from '../../../constants/Colors';
import { VerandahRadius } from '../../../constants/Verandah';
import { useAuth } from '../../../context/AuthContext';
import { buildMcnHeaderOptions } from '../../../lib/mcnHeader';
import { supabase } from '../../../lib/supabase';

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const HOURS_12 = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const MINUTES_12 = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

export default function AddCarpoolScreen() {
  const router = useRouter();
  const { user, profile, communityId } = useAuth();
  const colors = Verandah;

  const [roleType, setRoleType] = useState<'offering' | 'seeking'>('offering');
  const [title, setTitle] = useState('');
  const [contactPhone, setContactPhone] = useState(profile?.phone_number || '');
  const [startPoint, setStartPoint] = useState('');
  const [endPoint, setEndPoint] = useState('');
  
  // 12-Hour AM/PM Time States
  const [depHour, setDepHour] = useState('08');
  const [depMinute, setDepMinute] = useState('30');
  const [depAmpm, setDepAmpm] = useState<'AM' | 'PM'>('AM');

  const [retHour, setRetHour] = useState('06');
  const [retMinute, setRetMinute] = useState('00');
  const [retAmpm, setRetAmpm] = useState<'AM' | 'PM'>('PM');
  const [hasReturnTime, setHasReturnTime] = useState(false);
  const [selectedDays, setSelectedDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [availableSeats, setAvailableSeats] = useState(2);
  const [pricingType, setPricingType] = useState<'free' | 'paid'>('free');
  const [pricePerSeat, setPricePerSeat] = useState('');
  const [vehicleInfo, setVehicleInfo] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const toggleDay = (day: string) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter((d) => d !== day));
    } else {
      setSelectedDays([...selectedDays, day]);
    }
  };

  const selectPreset = (preset: 'weekdays' | 'daily' | 'clear') => {
    if (preset === 'weekdays') {
      setSelectedDays(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    } else if (preset === 'daily') {
      setSelectedDays(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    } else {
      setSelectedDays([]);
    }
  };

  const validateForm = () => {
    if (!title.trim()) {
      Toast.show({ type: 'error', text1: 'Missing Title', text2: 'Please enter a title for your carpool route.' });
      return false;
    }
    if (!startPoint.trim()) {
      Toast.show({ type: 'error', text1: 'Missing Start Point', text2: 'Please enter a pickup location / start point.' });
      return false;
    }
    if (!endPoint.trim()) {
      Toast.show({ type: 'error', text1: 'Missing End Point', text2: 'Please enter a destination / end point.' });
      return false;
    }
    if (!contactPhone.trim() || contactPhone.trim().replace(/[^0-9]/g, '').length < 10) {
      Toast.show({
        type: 'error',
        text1: 'Invalid Phone Number',
        text2: 'Please enter a valid 10-digit phone number for WhatsApp & calls.',
      });
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!user || !communityId) {
      Toast.show({ type: 'error', text1: 'Not logged in' });
      return;
    }
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from('mcn_carpools').insert({
        community_id: communityId,
        created_by: user.id,
        role_type: roleType,
        title: title.trim(),
        contact_phone: contactPhone.trim(),
        start_point: startPoint.trim(),
        end_point: endPoint.trim(),
        departure_time: `${depHour}:${depMinute} ${depAmpm}`,
        return_time: hasReturnTime ? `${retHour}:${retMinute} ${retAmpm}` : null,
        recurring_days: selectedDays,
        available_seats: availableSeats,
        pricing_type: pricingType,
        price_per_seat: pricingType === 'paid' ? (pricePerSeat.trim() ? (pricePerSeat.trim().startsWith('₹') ? pricePerSeat.trim() : `₹${pricePerSeat.trim()}`) : 'Paid') : 'Free',
        vehicle_info: vehicleInfo.trim() || null,
        notes: notes.trim() || null,
        status: 'active',
      });

      if (error) throw error;

      Toast.show({
        type: 'success',
        text1: roleType === 'offering' ? 'Carpool Offered!' : 'Carpool Request Posted!',
        text2: 'Your route is now visible to society residents.',
      });

      router.replace('/network/carpools' as any);
    } catch (err: any) {
      console.error('Error creating carpool:', err);
      Toast.show({
        type: 'error',
        text1: 'Post Failed',
        text2: err.message || 'Failed to publish carpool listing.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/network/carpools' as any);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: colors.surface }]}
    >
      <Stack.Screen
        options={buildMcnHeaderOptions({
          title: roleType === 'offering' ? 'Offer a Carpool Ride' : 'Request a Carpool Ride',
          onBack: handleBack,
        })}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Toggle Mode Segment */}
        <View style={styles.roleToggleContainer}>
          <TouchableOpacity
            style={[styles.roleBtn, roleType === 'offering' && styles.roleBtnActive]}
            onPress={() => setRoleType('offering')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="car-outline"
              size={18}
              color={roleType === 'offering' ? colors.primary : colors.textMuted}
            />
            <Text style={[styles.roleBtnText, roleType === 'offering' && styles.roleBtnTextActive]}>
              I'm Offering Seats
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleBtn, roleType === 'seeking' && styles.roleBtnActive]}
            onPress={() => setRoleType('seeking')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="person-outline"
              size={18}
              color={roleType === 'seeking' ? colors.accent : colors.textMuted}
            />
            <Text style={[styles.roleBtnText, roleType === 'seeking' && styles.roleBtnTextActive]}>
              I Need a Ride
            </Text>
          </TouchableOpacity>
        </View>

        {/* Title */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Route Title / Summary *</Text>
          <TextInput
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderStrong, backgroundColor: colors.card }]}
            placeholder={
              roleType === 'offering'
                ? 'e.g. Daily Ride to Mindspace / Weekend Trip to Vijayawada'
                : 'e.g. Need Ride to Mindspace / Outstation to Bengaluru'
            }
            placeholderTextColor={colors.textTertiary}
            value={title}
            onChangeText={setTitle}
          />
        </View>

        {/* Contact Phone Number */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Contact Phone Number (For WhatsApp & Calls) *
          </Text>
          <TextInput
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderStrong, backgroundColor: colors.card }]}
            placeholder="e.g. 9876543210"
            placeholderTextColor={colors.textTertiary}
            value={contactPhone}
            onChangeText={setContactPhone}
            keyboardType="phone-pad"
          />
        </View>

        {/* Start & End Points */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Start Point / Pickup Location *</Text>
          <TextInput
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderStrong, backgroundColor: colors.card }]}
            placeholder="e.g. Tower 4 / Main Gate / Block B"
            placeholderTextColor={colors.textTertiary}
            value={startPoint}
            onChangeText={setStartPoint}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>End Point / Destination *</Text>
          <TextInput
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderStrong, backgroundColor: colors.card }]}
            placeholder="e.g. Mindspace / Vijayawada / Bengaluru / Gachibowli"
            placeholderTextColor={colors.textTertiary}
            value={endPoint}
            onChangeText={setEndPoint}
          />
        </View>

        {/* Timings */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Departure & Return Timings (12-Hour AM/PM) *</Text>

          <View style={styles.rowInputs}>
            {/* Departure Time */}
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={{ fontSize: 11, fontWeight: '500', color: colors.textMuted, marginBottom: 4 }}>
                Departure Time *
              </Text>
              
              <View style={styles.time12PickerRow}>
                {Platform.OS === 'web' ? (
                  <select
                    value={depHour}
                    onChange={(e) => setDepHour(e.target.value)}
                    style={{
                      height: 44,
                      borderRadius: 8,
                      border: `0.5px solid ${colors.borderStrong}`,
                      backgroundColor: colors.card,
                      color: colors.textPrimary,
                      padding: '0 6px',
                      fontSize: 14,
                      fontWeight: '600',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {HOURS_12.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                ) : (
                  <TextInput
                    style={[styles.input12, { color: colors.textPrimary, borderColor: colors.borderStrong, backgroundColor: colors.card }]}
                    value={depHour}
                    onChangeText={(val) => setDepHour(val.slice(0, 2))}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                )}

                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>:</Text>

                {Platform.OS === 'web' ? (
                  <select
                    value={depMinute}
                    onChange={(e) => setDepMinute(e.target.value)}
                    style={{
                      height: 44,
                      borderRadius: 8,
                      border: `0.5px solid ${colors.borderStrong}`,
                      backgroundColor: colors.card,
                      color: colors.textPrimary,
                      padding: '0 6px',
                      fontSize: 14,
                      fontWeight: '600',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {MINUTES_12.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <TextInput
                    style={[styles.input12, { color: colors.textPrimary, borderColor: colors.borderStrong, backgroundColor: colors.card }]}
                    value={depMinute}
                    onChangeText={(val) => setDepMinute(val.slice(0, 2))}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                )}

                {/* AM / PM Segment Toggle */}
                <View style={styles.ampmToggleWrap}>
                  <TouchableOpacity
                    style={[styles.ampmSegment, depAmpm === 'AM' && styles.ampmSegmentActive]}
                    onPress={() => setDepAmpm('AM')}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.ampmText, depAmpm === 'AM' && styles.ampmTextActive]}>AM</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.ampmSegment, depAmpm === 'PM' && styles.ampmSegmentActive]}
                    onPress={() => setDepAmpm('PM')}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.ampmText, depAmpm === 'PM' && styles.ampmTextActive]}>PM</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Return Time (Optional) */}
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '500', color: colors.textMuted }}>
                  Return Time (Optional)
                </Text>
                <TouchableOpacity onPress={() => setHasReturnTime(!hasReturnTime)}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: hasReturnTime ? colors.accent : colors.textMuted }}>
                    {hasReturnTime ? 'Remove' : '+ Add'}
                  </Text>
                </TouchableOpacity>
              </View>

              {hasReturnTime ? (
                <View style={styles.time12PickerRow}>
                  {Platform.OS === 'web' ? (
                    <select
                      value={retHour}
                      onChange={(e) => setRetHour(e.target.value)}
                      style={{
                        height: 44,
                        borderRadius: 8,
                        border: `0.5px solid ${colors.borderStrong}`,
                        backgroundColor: colors.card,
                        color: colors.textPrimary,
                        padding: '0 6px',
                        fontSize: 14,
                        fontWeight: '600',
                        outline: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {HOURS_12.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  ) : (
                    <TextInput
                      style={[styles.input12, { color: colors.textPrimary, borderColor: colors.borderStrong, backgroundColor: colors.card }]}
                      value={retHour}
                      onChangeText={(val) => setRetHour(val.slice(0, 2))}
                      keyboardType="number-pad"
                      maxLength={2}
                    />
                  )}

                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }}>:</Text>

                  {Platform.OS === 'web' ? (
                    <select
                      value={retMinute}
                      onChange={(e) => setRetMinute(e.target.value)}
                      style={{
                        height: 44,
                        borderRadius: 8,
                        border: `0.5px solid ${colors.borderStrong}`,
                        backgroundColor: colors.card,
                        color: colors.textPrimary,
                        padding: '0 6px',
                        fontSize: 14,
                        fontWeight: '600',
                        outline: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {MINUTES_12.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  ) : (
                    <TextInput
                      style={[styles.input12, { color: colors.textPrimary, borderColor: colors.borderStrong, backgroundColor: colors.card }]}
                      value={retMinute}
                      onChangeText={(val) => setRetMinute(val.slice(0, 2))}
                      keyboardType="number-pad"
                      maxLength={2}
                    />
                  )}

                  {/* AM / PM Segment Toggle */}
                  <View style={styles.ampmToggleWrap}>
                    <TouchableOpacity
                      style={[styles.ampmSegment, retAmpm === 'AM' && styles.ampmSegmentActive]}
                      onPress={() => setRetAmpm('AM')}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.ampmText, retAmpm === 'AM' && styles.ampmTextActive]}>AM</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.ampmSegment, retAmpm === 'PM' && styles.ampmSegmentActive]}
                      onPress={() => setRetAmpm('PM')}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.ampmText, retAmpm === 'PM' && styles.ampmTextActive]}>PM</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.input, { justifyContent: 'center', backgroundColor: colors.cardMuted, borderColor: colors.border, height: 44 }]}
                  onPress={() => setHasReturnTime(true)}
                >
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>+ Add return time</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Recurring Days */}
        <View style={styles.inputGroup}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Recurring Days</Text>
            <View style={styles.presetLinks}>
              <TouchableOpacity onPress={() => selectPreset('weekdays')}>
                <Text style={[styles.presetText, { color: colors.accent }]}>Weekdays</Text>
              </TouchableOpacity>
              <Text style={{ color: colors.textMuted }}>·</Text>
              <TouchableOpacity onPress={() => selectPreset('daily')}>
                <Text style={[styles.presetText, { color: colors.accent }]}>Daily</Text>
              </TouchableOpacity>
              <Text style={{ color: colors.textMuted }}>·</Text>
              <TouchableOpacity onPress={() => selectPreset('clear')}>
                <Text style={[styles.presetText, { color: colors.danger }]}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.daysContainer}>
            {ALL_DAYS.map((day) => {
              const isSelected = selectedDays.includes(day);
              return (
                <TouchableOpacity
                  key={day}
                  style={[
                    styles.dayChip,
                    {
                      backgroundColor: isSelected ? colors.primary : colors.cardMuted,
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => toggleDay(day)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.dayChipText,
                      { color: isSelected ? colors.primaryFg : colors.textSecondary },
                    ]}
                  >
                    {day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Seats Counter */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {roleType === 'offering' ? 'Seats Available' : 'Seats Needed'}
          </Text>
          <View style={styles.seatsRow}>
            <TouchableOpacity
              style={[styles.counterBtn, { borderColor: colors.borderStrong, backgroundColor: colors.card }]}
              onPress={() => setAvailableSeats(Math.max(1, availableSeats - 1))}
            >
              <Ionicons name="remove" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.seatCountText, { color: colors.textPrimary }]}>
              {availableSeats}
            </Text>
            <TouchableOpacity
              style={[styles.counterBtn, { borderColor: colors.borderStrong, backgroundColor: colors.card }]}
              onPress={() => setAvailableSeats(Math.min(6, availableSeats + 1))}
            >
              <Ionicons name="add" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Pricing Options */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Ride Pricing / Cost Option</Text>
          <View style={styles.pricingToggleRow}>
            <TouchableOpacity
              style={[
                styles.pricingBtn,
                pricingType === 'free' && styles.pricingBtnActiveFree,
              ]}
              onPress={() => {
                setPricingType('free');
                setPricePerSeat('');
              }}
              activeOpacity={0.8}
            >
              <Ionicons
                name="gift-outline"
                size={16}
                color={pricingType === 'free' ? '#059669' : colors.textMuted}
              />
              <Text
                style={[
                  styles.pricingBtnText,
                  pricingType === 'free' && { color: '#059669', fontWeight: '700' },
                ]}
              >
                Free Ride (No Charge)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.pricingBtn,
                pricingType === 'paid' && styles.pricingBtnActivePaid,
              ]}
              onPress={() => setPricingType('paid')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="cash-outline"
                size={16}
                color={pricingType === 'paid' ? colors.accent : colors.textMuted}
              />
              <Text
                style={[
                  styles.pricingBtnText,
                  pricingType === 'paid' && { color: colors.accent, fontWeight: '700' },
                ]}
              >
                Paid / Cost Sharing
              </Text>
            </TouchableOpacity>
          </View>

          {pricingType === 'paid' && (
            <View style={{ marginTop: 8 }}>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderStrong, backgroundColor: colors.card }]}
                placeholder="e.g. 50 / seat or 100 / day"
                placeholderTextColor={colors.textTertiary}
                value={pricePerSeat}
                onChangeText={setPricePerSeat}
                keyboardType="numeric"
              />
            </View>
          )}
        </View>

        {/* Vehicle Info (Only for offering) */}
        {roleType === 'offering' && (
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Vehicle Details (Optional)</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderStrong, backgroundColor: colors.card }]}
              placeholder="e.g. White Honda City (TS 09 AB 1234) or EV Bike"
              placeholderTextColor={colors.textTertiary}
              value={vehicleInfo}
              onChangeText={setVehicleInfo}
            />
          </View>
        )}

        {/* Notes / Rules */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Notes / Ride Preferences (Optional)</Text>
          <TextInput
            style={[
              styles.input,
              styles.textArea,
              { color: colors.textPrimary, borderColor: colors.borderStrong, backgroundColor: colors.card },
            ]}
            placeholder="e.g. AC ride, non-smoking, split fuel charges ~ ₹50/day"
            placeholderTextColor={colors.textTertiary}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: colors.primary }]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color={colors.primaryFg} />
          ) : (
            <Text style={[styles.submitBtnText, { color: colors.primaryFg }]}>
              {roleType === 'offering' ? 'Publish Ride Offer' : 'Publish Ride Request'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 16,
  },
  roleToggleContainer: {
    flexDirection: 'row',
    backgroundColor: Verandah.cardMuted,
    borderRadius: VerandahRadius.xl,
    padding: 4,
    marginBottom: 8,
  },
  roleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: VerandahRadius.lg,
    gap: 6,
  },
  roleBtnActive: {
    backgroundColor: Verandah.card,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  roleBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: Verandah.textMuted,
  },
  roleBtnTextActive: {
    color: Verandah.textPrimary,
    fontWeight: '600',
  },
  inputGroup: {
    gap: 6,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 12,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 2,
  },
  presetLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  presetText: {
    fontSize: 12,
    fontWeight: '500',
  },
  input: {
    height: 50,
    borderWidth: 0.5,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  textArea: {
    height: 80,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  daysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  dayChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: VerandahRadius.pill,
    borderWidth: 0.5,
  },
  dayChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  seatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 4,
  },
  counterBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 0.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  seatCountText: {
    fontSize: 20,
    fontWeight: '700',
    minWidth: 24,
    textAlign: 'center',
  },
  pricingToggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  pricingBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: VerandahRadius.md,
    borderWidth: 0.5,
    borderColor: Verandah.borderStrong,
    backgroundColor: Verandah.card,
    gap: 6,
  },
  pricingBtnActiveFree: {
    backgroundColor: '#D1FAE5',
    borderColor: '#059669',
  },
  pricingBtnActivePaid: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D97706',
  },
  pricingBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: Verandah.textSecondary,
  },
  timeBtn: {
    height: 50,
    borderWidth: 0.5,
    borderRadius: VerandahRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
  },
  timeBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  time12PickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  input12: {
    height: 44,
    width: 44,
    borderWidth: 0.5,
    borderRadius: VerandahRadius.sm,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
  },
  ampmToggleWrap: {
    flexDirection: 'row',
    backgroundColor: Verandah.cardMuted,
    borderRadius: VerandahRadius.md,
    padding: 2,
    marginLeft: 4,
  },
  ampmSegment: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: VerandahRadius.sm,
  },
  ampmSegmentActive: {
    backgroundColor: Verandah.primary,
  },
  ampmText: {
    fontSize: 11,
    fontWeight: '600',
    color: Verandah.textMuted,
  },
  ampmTextActive: {
    color: Verandah.primaryFg,
  },
  submitBtn: {
    height: 54,
    borderRadius: VerandahRadius.xl,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

