import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
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
import { DateField, formatLocalDateForDb } from '../../../components/DateField';
import { Verandah } from '../../../constants/Colors';
import { VerandahRadius, VerandahType } from '../../../constants/Verandah';
import { useAuth } from '../../../context/AuthContext';
import { buildMcnHeaderOptions } from '../../../lib/mcnHeader';
import { goBackSmart } from '../../../lib/navigation';
import { isValidIndianMobile, normalizeIndianMobile } from '../../../lib/phone';
import { supabase } from '../../../lib/supabase';

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS_12 = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const MINUTES_12 = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

function parseTimeString(timeStr?: string | null): { hour: string; minute: string; ampm: 'AM' | 'PM' } | null {
  if (!timeStr) return null;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase() as 'AM' | 'PM';
  if (h < 1 || h > 12 || m < 0 || m > 59) return null;
  return {
    hour: String(h).padStart(2, '0'),
    minute: String(m).padStart(2, '0'),
    ampm,
  };
}

export default function AddCarpoolScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = Boolean(id);

  const { user, profile, communityId } = useAuth();
  const colors = Verandah;

  const [roleType, setRoleType] = useState<'offering' | 'seeking'>('offering');
  const [scheduleType, setScheduleType] = useState<'recurring' | 'one_off'>('recurring');
  const [tripDate, setTripDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  });

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
  const [loadingInitial, setLoadingInitial] = useState(isEditing);
  const [submitting, setSubmitting] = useState(false);

  // Profile prefill backfill when profile resolves in phase 2
  useEffect(() => {
    if (profile?.phone_number && !contactPhone) {
      setContactPhone(profile.phone_number);
    }
  }, [profile]);

  // Load existing carpool if editing
  useEffect(() => {
    if (!id || !communityId) return;

    let mounted = true;
    const loadCarpool = async () => {
      try {
        const { data, error } = await supabase
          .from('mcn_carpools')
          .select('*')
          .eq('id', id)
          .eq('community_id', communityId)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          Toast.show({ type: 'error', text1: 'Ride not found' });
          router.replace('/mcn/carpools' as any);
          return;
        }

        if (mounted) {
          setRoleType(data.role_type as 'offering' | 'seeking');
          setTitle(data.title);
          setContactPhone(data.contact_phone || '');
          setStartPoint(data.start_point);
          setEndPoint(data.end_point);
          setAvailableSeats(data.available_seats);
          setVehicleInfo(data.vehicle_info || '');
          setNotes(data.notes || '');
          setPricingType(data.pricing_type as 'free' | 'paid');

          if (data.price_per_seat_amount) {
            setPricePerSeat(String(data.price_per_seat_amount));
          } else if (data.price_per_seat) {
            setPricePerSeat(data.price_per_seat.replace(/[^0-9.]/g, ''));
          }

          if (data.trip_date) {
            setScheduleType('one_off');
            const [y, m, d] = data.trip_date.split('-').map(Number);
            if (y && m && d) {
              setTripDate(new Date(y, m - 1, d));
            }
          } else {
            setScheduleType('recurring');
            if (data.recurring_days && data.recurring_days.length > 0) {
              setSelectedDays(data.recurring_days);
            }
          }

          const parsedDep = parseTimeString(data.departure_time);
          if (parsedDep) {
            setDepHour(parsedDep.hour);
            setDepMinute(parsedDep.minute);
            setDepAmpm(parsedDep.ampm);
          }

          if (data.return_time) {
            setHasReturnTime(true);
            const parsedRet = parseTimeString(data.return_time);
            if (parsedRet) {
              setRetHour(parsedRet.hour);
              setRetMinute(parsedRet.minute);
              setRetAmpm(parsedRet.ampm);
            }
          }
        }
      } catch (err: any) {
        console.error('Error fetching carpool for edit:', err);
        Toast.show({ type: 'error', text1: 'Failed to load ride details' });
      } finally {
        if (mounted) setLoadingInitial(false);
      }
    };

    loadCarpool();
    return () => {
      mounted = false;
    };
  }, [id, communityId]);

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
      Toast.show({ type: 'error', text1: 'Missing title', text2: 'Please enter a summary title for your route.' });
      return false;
    }
    if (!startPoint.trim()) {
      Toast.show({ type: 'error', text1: 'Missing start point', text2: 'Please enter a pickup location.' });
      return false;
    }
    if (!endPoint.trim()) {
      Toast.show({ type: 'error', text1: 'Missing destination', text2: 'Please enter a destination.' });
      return false;
    }

    const cleanPhone = normalizeIndianMobile(contactPhone);
    if (!cleanPhone || !isValidIndianMobile(cleanPhone)) {
      Toast.show({
        type: 'error',
        text1: 'Invalid phone number',
        text2: 'Please enter a valid 10-digit Indian phone number.',
      });
      return false;
    }

    if (scheduleType === 'recurring' && selectedDays.length === 0) {
      Toast.show({
        type: 'error',
        text1: 'No recurring days selected',
        text2: 'Please select at least one day or switch to one-off trip.',
      });
      return false;
    }

    if (roleType === 'offering' && pricingType === 'paid') {
      const priceNum = parseFloat(pricePerSeat.replace(/[^0-9.]/g, ''));
      if (isNaN(priceNum) || priceNum <= 0) {
        Toast.show({
          type: 'error',
          text1: 'Invalid price per seat',
          text2: 'Please enter a positive numeric contribution amount.',
        });
        return false;
      }
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
      const cleanPhone = normalizeIndianMobile(contactPhone) || contactPhone.trim();
      const depTimeFormatted = `${depHour}:${depMinute} ${depAmpm}`;
      const retTimeFormatted = hasReturnTime ? `${retHour}:${retMinute} ${retAmpm}` : null;
      const tripDateFormatted = scheduleType === 'one_off' ? formatLocalDateForDb(tripDate) : null;
      const recurringDaysFormatted = scheduleType === 'recurring' ? selectedDays : [];

      const numericPrice =
        roleType === 'offering' && pricingType === 'paid'
          ? parseFloat(pricePerSeat.replace(/[^0-9.]/g, '')) || null
          : null;
      const priceString =
        roleType === 'offering'
          ? pricingType === 'paid'
            ? numericPrice
              ? `₹${numericPrice}`
              : 'Paid'
            : 'Free'
          : 'Free';

      const payload = {
        community_id: communityId,
        role_type: roleType,
        title: title.trim(),
        contact_phone: cleanPhone,
        start_point: startPoint.trim(),
        end_point: endPoint.trim(),
        departure_time: depTimeFormatted,
        return_time: retTimeFormatted,
        trip_date: tripDateFormatted,
        recurring_days: recurringDaysFormatted,
        available_seats: availableSeats,
        pricing_type: roleType === 'offering' ? pricingType : 'free',
        price_per_seat: priceString,
        price_per_seat_amount: numericPrice,
        vehicle_info: roleType === 'offering' ? vehicleInfo.trim() || null : null,
        notes: notes.trim() || null,
        status: 'active',
      };

      if (isEditing && id) {
        const { error } = await supabase.from('mcn_carpools').update(payload).eq('id', id);
        if (error) throw error;

        Toast.show({
          type: 'success',
          text1: 'Ride updated',
          text2: 'Your route updates are now live.',
        });
        router.replace(`/mcn/carpools/${id}` as any);
      } else {
        const { error } = await supabase.from('mcn_carpools').insert({
          ...payload,
          created_by: user.id,
        });
        if (error) throw error;

        Toast.show({
          type: 'success',
          text1: roleType === 'offering' ? 'Ride offered' : 'Ride request posted',
          text2: 'Your route is now visible to society residents.',
        });
        router.replace('/mcn/carpools' as any);
      }
    } catch (err: any) {
      console.error('Error saving carpool:', err);
      Toast.show({
        type: 'error',
        text1: isEditing ? 'Update failed' : 'Publish failed',
        text2: err.message || 'Failed to save carpool listing.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (isEditing && id) {
      goBackSmart(router, `/mcn/carpools/${id}`);
    } else {
      goBackSmart(router, '/mcn/carpools');
    }
  };

  if (loadingInitial) {
    return (
      <View style={[styles.center, { backgroundColor: colors.surface }]}>
        <Stack.Screen options={buildMcnHeaderOptions({ title: 'Loading...', onBack: handleBack })} />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const pageTitle = isEditing
    ? 'Edit ride'
    : roleType === 'offering'
    ? 'Offer a ride'
    : 'Request a ride';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: colors.surface }]}
    >
      <Stack.Screen options={buildMcnHeaderOptions({ title: pageTitle, onBack: handleBack })} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Toggle Mode Segment (Only for create mode) */}
        {!isEditing && (
          <View style={styles.roleToggleContainer}>
            <TouchableOpacity
              style={[
                styles.roleBtn,
                roleType === 'offering' && { backgroundColor: colors.card, borderColor: colors.borderStrong },
              ]}
              onPress={() => setRoleType('offering')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="car-outline"
                size={18}
                color={roleType === 'offering' ? colors.primary : colors.textMuted}
              />
              <Text
                style={[
                  styles.roleBtnText,
                  { color: roleType === 'offering' ? colors.primary : colors.textSecondary },
                ]}
              >
                Offering seats
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.roleBtn,
                roleType === 'seeking' && { backgroundColor: colors.card, borderColor: colors.borderStrong },
              ]}
              onPress={() => setRoleType('seeking')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="person-outline"
                size={18}
                color={roleType === 'seeking' ? colors.accent : colors.textMuted}
              />
              <Text
                style={[
                  styles.roleBtnText,
                  { color: roleType === 'seeking' ? colors.accent : colors.textSecondary },
                ]}
              >
                Need a ride
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Title */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Route title / summary *</Text>
          <TextInput
            style={[
              styles.input,
              { color: colors.textPrimary, borderColor: colors.borderStrong, backgroundColor: colors.card },
            ]}
            placeholder={
              roleType === 'offering'
                ? 'e.g. Daily ride to Mindspace / Weekend trip to Vijayawada'
                : 'e.g. Need ride to Mindspace / Outstation to Bengaluru'
            }
            placeholderTextColor={colors.textTertiary}
            value={title}
            onChangeText={setTitle}
          />
        </View>

        {/* Contact Phone Number */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Contact phone number (for WhatsApp & calls) *
          </Text>
          <TextInput
            style={[
              styles.input,
              { color: colors.textPrimary, borderColor: colors.borderStrong, backgroundColor: colors.card },
            ]}
            placeholder="e.g. 9876543210"
            placeholderTextColor={colors.textTertiary}
            value={contactPhone}
            onChangeText={setContactPhone}
            keyboardType="phone-pad"
            maxLength={10}
          />
        </View>

        {/* Start & End Points */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Start point / pickup location *</Text>
          <TextInput
            style={[
              styles.input,
              { color: colors.textPrimary, borderColor: colors.borderStrong, backgroundColor: colors.card },
            ]}
            placeholder="e.g. Tower 4 / Main Gate / Block B"
            placeholderTextColor={colors.textTertiary}
            value={startPoint}
            onChangeText={setStartPoint}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Destination / drop point *</Text>
          <TextInput
            style={[
              styles.input,
              { color: colors.textPrimary, borderColor: colors.borderStrong, backgroundColor: colors.card },
            ]}
            placeholder="e.g. Mindspace / Vijayawada / Bengaluru / Gachibowli"
            placeholderTextColor={colors.textTertiary}
            value={endPoint}
            onChangeText={setEndPoint}
          />
        </View>

        {/* Schedule Type (Recurring vs One-off) */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Trip schedule *</Text>
          <View style={styles.roleToggleContainer}>
            <TouchableOpacity
              style={[
                styles.roleBtn,
                scheduleType === 'recurring' && { backgroundColor: colors.card, borderColor: colors.borderStrong },
              ]}
              onPress={() => setScheduleType('recurring')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="repeat-outline"
                size={16}
                color={scheduleType === 'recurring' ? colors.primary : colors.textMuted}
              />
              <Text
                style={[
                  styles.roleBtnText,
                  { color: scheduleType === 'recurring' ? colors.primary : colors.textSecondary },
                ]}
              >
                Recurring commute
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.roleBtn,
                scheduleType === 'one_off' && { backgroundColor: colors.card, borderColor: colors.borderStrong },
              ]}
              onPress={() => setScheduleType('one_off')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="calendar-outline"
                size={16}
                color={scheduleType === 'one_off' ? colors.accent : colors.textMuted}
              />
              <Text
                style={[
                  styles.roleBtnText,
                  { color: scheduleType === 'one_off' ? colors.accent : colors.textSecondary },
                ]}
              >
                One-off / outstation
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* One-off Date Picker */}
        {scheduleType === 'one_off' ? (
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Trip date *</Text>
            <DateField
              value={tripDate}
              onChange={setTripDate}
              minimumDate={new Date()}
            />
          </View>
        ) : (
          /* Recurring Days */
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Recurring days *</Text>
              <View style={styles.presetRow}>
                <TouchableOpacity onPress={() => selectPreset('weekdays')}>
                  <Text style={[styles.presetLink, { color: colors.accent }]}>Weekdays</Text>
                </TouchableOpacity>
                <Text style={{ color: colors.textTertiary }}>·</Text>
                <TouchableOpacity onPress={() => selectPreset('daily')}>
                  <Text style={[styles.presetLink, { color: colors.accent }]}>Daily</Text>
                </TouchableOpacity>
                <Text style={{ color: colors.textTertiary }}>·</Text>
                <TouchableOpacity onPress={() => selectPreset('clear')}>
                  <Text style={[styles.presetLink, { color: colors.danger }]}>Clear</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.daysRow}>
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
        )}

        {/* Departure Time */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Departure time *</Text>
          <View style={styles.timeRow}>
            {/* Hour */}
            <View style={styles.timeSegment}>
              {Platform.OS === 'web' ? (
                <select
                  value={depHour}
                  onChange={(e) => setDepHour(e.target.value)}
                  style={{
                    height: 44,
                    borderRadius: VerandahRadius.md,
                    border: `0.5px solid ${colors.borderStrong}`,
                    backgroundColor: colors.card,
                    color: colors.textPrimary,
                    padding: '0 8px',
                    fontSize: 14,
                    fontWeight: '500',
                  }}
                >
                  {HOURS_12.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              ) : (
                <TextInput
                  style={[
                    styles.timeInput,
                    { color: colors.textPrimary, borderColor: colors.borderStrong, backgroundColor: colors.card },
                  ]}
                  value={depHour}
                  onChangeText={(val) => {
                    const clean = val.replace(/\D/g, '').slice(0, 2);
                    setDepHour(clean);
                  }}
                  onBlur={() => {
                    const num = parseInt(depHour || '8', 10);
                    const clamped = Math.max(1, Math.min(12, isNaN(num) ? 8 : num));
                    setDepHour(String(clamped).padStart(2, '0'));
                  }}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              )}
              <Text style={[styles.timeUnitLabel, { color: colors.textTertiary }]}>Hour</Text>
            </View>

            <Text style={[styles.timeColon, { color: colors.textPrimary }]}>:</Text>

            {/* Minute */}
            <View style={styles.timeSegment}>
              {Platform.OS === 'web' ? (
                <select
                  value={depMinute}
                  onChange={(e) => setDepMinute(e.target.value)}
                  style={{
                    height: 44,
                    borderRadius: VerandahRadius.md,
                    border: `0.5px solid ${colors.borderStrong}`,
                    backgroundColor: colors.card,
                    color: colors.textPrimary,
                    padding: '0 8px',
                    fontSize: 14,
                    fontWeight: '500',
                  }}
                >
                  {MINUTES_12.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <TextInput
                  style={[
                    styles.timeInput,
                    { color: colors.textPrimary, borderColor: colors.borderStrong, backgroundColor: colors.card },
                  ]}
                  value={depMinute}
                  onChangeText={(val) => {
                    const clean = val.replace(/\D/g, '').slice(0, 2);
                    setDepMinute(clean);
                  }}
                  onBlur={() => {
                    const num = parseInt(depMinute || '0', 10);
                    const clamped = Math.max(0, Math.min(59, isNaN(num) ? 0 : num));
                    setDepMinute(String(clamped).padStart(2, '0'));
                  }}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              )}
              <Text style={[styles.timeUnitLabel, { color: colors.textTertiary }]}>Minute</Text>
            </View>

            {/* AM/PM */}
            <View style={styles.ampmToggle}>
              <TouchableOpacity
                style={[
                  styles.ampmBtn,
                  depAmpm === 'AM' && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setDepAmpm('AM')}
              >
                <Text
                  style={[
                    styles.ampmText,
                    { color: depAmpm === 'AM' ? colors.primaryFg : colors.textSecondary },
                  ]}
                >
                  AM
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.ampmBtn,
                  depAmpm === 'PM' && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setDepAmpm('PM')}
              >
                <Text
                  style={[
                    styles.ampmText,
                    { color: depAmpm === 'PM' ? colors.primaryFg : colors.textSecondary },
                  ]}
                >
                  PM
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Return Time (Optional) */}
        <View style={styles.inputGroup}>
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setHasReturnTime(!hasReturnTime)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={hasReturnTime ? 'checkbox' : 'square-outline'}
              size={20}
              color={hasReturnTime ? colors.primary : colors.textTertiary}
            />
            <Text style={[styles.checkboxLabel, { color: colors.textPrimary }]}>Specify return time (round trip)</Text>
          </TouchableOpacity>

          {hasReturnTime && (
            <View style={[styles.timeRow, { marginTop: 8 }]}>
              {/* Return Hour */}
              <View style={styles.timeSegment}>
                {Platform.OS === 'web' ? (
                  <select
                    value={retHour}
                    onChange={(e) => setRetHour(e.target.value)}
                    style={{
                      height: 44,
                      borderRadius: VerandahRadius.md,
                      border: `0.5px solid ${colors.borderStrong}`,
                      backgroundColor: colors.card,
                      color: colors.textPrimary,
                      padding: '0 8px',
                      fontSize: 14,
                      fontWeight: '500',
                    }}
                  >
                    {HOURS_12.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                ) : (
                  <TextInput
                    style={[
                      styles.timeInput,
                      { color: colors.textPrimary, borderColor: colors.borderStrong, backgroundColor: colors.card },
                    ]}
                    value={retHour}
                    onChangeText={(val) => {
                      const clean = val.replace(/\D/g, '').slice(0, 2);
                      setRetHour(clean);
                    }}
                    onBlur={() => {
                      const num = parseInt(retHour || '6', 10);
                      const clamped = Math.max(1, Math.min(12, isNaN(num) ? 6 : num));
                      setRetHour(String(clamped).padStart(2, '0'));
                    }}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                )}
                <Text style={[styles.timeUnitLabel, { color: colors.textTertiary }]}>Hour</Text>
              </View>

              <Text style={[styles.timeColon, { color: colors.textPrimary }]}>:</Text>

              {/* Return Minute */}
              <View style={styles.timeSegment}>
                {Platform.OS === 'web' ? (
                  <select
                    value={retMinute}
                    onChange={(e) => setRetMinute(e.target.value)}
                    style={{
                      height: 44,
                      borderRadius: VerandahRadius.md,
                      border: `0.5px solid ${colors.borderStrong}`,
                      backgroundColor: colors.card,
                      color: colors.textPrimary,
                      padding: '0 8px',
                      fontSize: 14,
                      fontWeight: '500',
                    }}
                  >
                    {MINUTES_12.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <TextInput
                    style={[
                      styles.timeInput,
                      { color: colors.textPrimary, borderColor: colors.borderStrong, backgroundColor: colors.card },
                    ]}
                    value={retMinute}
                    onChangeText={(val) => {
                      const clean = val.replace(/\D/g, '').slice(0, 2);
                      setRetMinute(clean);
                    }}
                    onBlur={() => {
                      const num = parseInt(retMinute || '0', 10);
                      const clamped = Math.max(0, Math.min(59, isNaN(num) ? 0 : num));
                      setRetMinute(String(clamped).padStart(2, '0'));
                    }}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                )}
                <Text style={[styles.timeUnitLabel, { color: colors.textTertiary }]}>Minute</Text>
              </View>

              {/* Return AM/PM */}
              <View style={styles.ampmToggle}>
                <TouchableOpacity
                  style={[
                    styles.ampmBtn,
                    retAmpm === 'AM' && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => setRetAmpm('AM')}
                >
                  <Text
                    style={[
                      styles.ampmText,
                      { color: retAmpm === 'AM' ? colors.primaryFg : colors.textSecondary },
                    ]}
                  >
                    AM
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.ampmBtn,
                    retAmpm === 'PM' && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => setRetAmpm('PM')}
                >
                  <Text
                    style={[
                      styles.ampmText,
                      { color: retAmpm === 'PM' ? colors.primaryFg : colors.textSecondary },
                    ]}
                  >
                    PM
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Seats (Capacity for Offering, Seats Needed for Seeking) */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {roleType === 'offering' ? 'Vehicle capacity (seats available) *' : 'Seats needed *'}
          </Text>
          <View style={styles.seatCounterRow}>
            {[1, 2, 3, 4, 5, 6].map((num) => {
              const isSelected = availableSeats === num;
              return (
                <TouchableOpacity
                  key={num}
                  style={[
                    styles.seatChip,
                    {
                      backgroundColor: isSelected ? colors.primary : colors.card,
                      borderColor: isSelected ? colors.primary : colors.borderStrong,
                    },
                  ]}
                  onPress={() => setAvailableSeats(num)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.seatChipText,
                      { color: isSelected ? colors.primaryFg : colors.textPrimary },
                    ]}
                  >
                    {num}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Pricing / Cost Sharing (ONLY for Offering) */}
        {roleType === 'offering' && (
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Pricing & cost sharing *</Text>
            <View style={styles.roleToggleContainer}>
              <TouchableOpacity
                style={[
                  styles.roleBtn,
                  pricingType === 'free' && { backgroundColor: colors.card, borderColor: colors.borderStrong },
                ]}
                onPress={() => {
                  setPricingType('free');
                  setPricePerSeat('');
                }}
              >
                <Ionicons
                  name="gift-outline"
                  size={16}
                  color={pricingType === 'free' ? colors.accent : colors.textMuted}
                />
                <Text
                  style={[
                    styles.roleBtnText,
                    { color: pricingType === 'free' ? colors.accent : colors.textSecondary },
                  ]}
                >
                  Free ride
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.roleBtn,
                  pricingType === 'paid' && { backgroundColor: colors.card, borderColor: colors.borderStrong },
                ]}
                onPress={() => setPricingType('paid')}
              >
                <Ionicons
                  name="cash-outline"
                  size={16}
                  color={pricingType === 'paid' ? colors.primary : colors.textMuted}
                />
                <Text
                  style={[
                    styles.roleBtnText,
                    { color: pricingType === 'paid' ? colors.primary : colors.textSecondary },
                  ]}
                >
                  Share cost
                </Text>
              </TouchableOpacity>
            </View>

            {pricingType === 'paid' && (
              <View style={[styles.priceInputRow, { marginTop: 8 }]}>
                <Text style={[styles.rupeeSymbol, { color: colors.textPrimary }]}>₹</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      flex: 1,
                      color: colors.textPrimary,
                      borderColor: colors.borderStrong,
                      backgroundColor: colors.card,
                    },
                  ]}
                  placeholder="e.g. 50"
                  placeholderTextColor={colors.textTertiary}
                  value={pricePerSeat}
                  onChangeText={(val) => setPricePerSeat(val.replace(/[^0-9.]/g, ''))}
                  keyboardType="numeric"
                />
                <Text style={[styles.perSeatLabel, { color: colors.textSecondary }]}>per seat</Text>
              </View>
            )}
          </View>
        )}

        {/* Vehicle Info (ONLY for Offering) */}
        {roleType === 'offering' && (
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Vehicle details (optional)</Text>
            <TextInput
              style={[
                styles.input,
                { color: colors.textPrimary, borderColor: colors.borderStrong, backgroundColor: colors.card },
              ]}
              placeholder="e.g. White Honda City / TS09 EX 1234"
              placeholderTextColor={colors.textTertiary}
              value={vehicleInfo}
              onChangeText={setVehicleInfo}
            />
          </View>
        )}

        {/* Additional Notes */}
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Notes & preferences (optional)</Text>
          <TextInput
            style={[
              styles.inputArea,
              { color: colors.textPrimary, borderColor: colors.borderStrong, backgroundColor: colors.card },
            ]}
            placeholder="e.g. Non-smoking ride, AC on, luggage space available, flexible return time..."
            placeholderTextColor={colors.textTertiary}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Submit CTA */}
        <TouchableOpacity
          style={[
            styles.submitBtn,
            { backgroundColor: colors.primary },
            submitting && { opacity: 0.7 },
          ]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color={colors.primaryFg} />
          ) : (
            <Text style={[styles.submitBtnText, { color: colors.primaryFg }]}>
              {isEditing
                ? 'Save changes'
                : roleType === 'offering'
                ? 'Publish ride offer'
                : 'Post ride request'}
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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 60,
    gap: 12,
  },
  roleToggleContainer: {
    flexDirection: 'row',
    backgroundColor: Verandah.cardMuted,
    borderRadius: VerandahRadius.md,
    padding: 2,
    gap: 2,
  },
  roleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: VerandahRadius.sm,
    gap: 6,
    borderWidth: 0.5,
    borderColor: 'transparent',
  },
  roleBtnText: {
    fontSize: 13,
    fontWeight: '500',
  },
  inputGroup: {
    gap: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  presetLink: {
    fontSize: 12,
    fontWeight: '500',
  },
  input: {
    height: 44,
    borderWidth: 0.5,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  inputArea: {
    minHeight: 70,
    borderWidth: 0.5,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  daysRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  dayChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: VerandahRadius.sm,
    borderWidth: 0.5,
  },
  dayChipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeSegment: {
    alignItems: 'center',
    width: 60,
  },
  timeInput: {
    width: 60,
    height: 44,
    borderWidth: 0.5,
    borderRadius: VerandahRadius.md,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '500',
  },
  timeUnitLabel: {
    fontSize: 10,
    marginTop: 2,
  },
  timeColon: {
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 12,
  },
  ampmToggle: {
    flexDirection: 'row',
    backgroundColor: Verandah.cardMuted,
    borderRadius: VerandahRadius.sm,
    padding: 2,
    marginLeft: 8,
    marginBottom: 12,
  },
  ampmBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: VerandahRadius.sm,
    borderWidth: 0.5,
    borderColor: 'transparent',
  },
  ampmText: {
    fontSize: 12,
    fontWeight: '500',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  checkboxLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  seatCounterRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  seatChip: {
    flex: 1,
    height: 40,
    borderWidth: 0.5,
    borderRadius: VerandahRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  seatChipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rupeeSymbol: {
    fontSize: 18,
    fontWeight: '500',
  },
  perSeatLabel: {
    fontSize: 13,
  },
  submitBtn: {
    height: 48,
    borderRadius: VerandahRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
