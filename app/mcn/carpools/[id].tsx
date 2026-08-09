import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { BaseCard } from '../../../components/BaseCard';
import { EmptyState } from '../../../components/EmptyState';
import { Rupees } from '../../../components/Rupees';
import { Verandah } from '../../../constants/Colors';
import { VerandahRadius, VerandahType } from '../../../constants/Verandah';
import { useAuth } from '../../../context/AuthContext';
import { Tables } from '../../../lib/database.types';
import { buildMcnHeaderOptions } from '../../../lib/mcnHeader';
import { goBackSmart } from '../../../lib/navigation';
import { isValidIndianMobile, normalizeIndianMobile } from '../../../lib/phone';
import { supabase } from '../../../lib/supabase';

type Carpool = Tables<'mcn_carpools'> & {
  creator_profile?: {
    full_name: string | null;
    flat_number: string | null;
    phone_number: string | null;
  } | null;
};

type CarpoolRequest = Tables<'mcn_carpool_requests'>;

type Passenger = {
  passenger_name: string;
  passenger_flat: string;
  seats: number;
};

type SeatAvailability = {
  total_seats: number;
  booked_seats: number;
  remaining_seats: number;
};

export default function CarpoolDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile, communityId, isCommunityLead } = useAuth();
  const colors = Verandah;

  const [carpool, setCarpool] = useState<Carpool | null>(null);
  const [requests, setRequests] = useState<CarpoolRequest[]>([]);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [seats, setSeats] = useState<SeatAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);

  // Join Modal State
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [riderName, setRiderName] = useState(profile?.full_name || '');
  const [riderPhone, setRiderPhone] = useState(profile?.phone_number || '');
  const [flatNumber, setFlatNumber] = useState(profile?.flat_number || '');
  const [seatsRequested, setSeatsRequested] = useState(1);
  const [riderNote, setRiderNote] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  // Profile prefill backfill when profile resolves asynchronously
  useEffect(() => {
    if (profile) {
      if (!riderName && profile.full_name) setRiderName(profile.full_name);
      if (!riderPhone && profile.phone_number) setRiderPhone(profile.phone_number);
      if (!flatNumber && profile.flat_number) setFlatNumber(profile.flat_number);
    }
  }, [profile]);

  const isOwner = carpool?.created_by === user?.id;

  const myOpenRequest = requests.find(
    (r) => r.rider_id === user?.id && (r.status === 'pending' || r.status === 'accepted')
  );
  const myLastDeclined = requests.find((r) => r.rider_id === user?.id && r.status === 'rejected');

  const fetchDetails = useCallback(
    async (isRefresh = false) => {
      if (!id || !communityId) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const [carpoolRes, reqRes, seatRes, passRes] = await Promise.all([
          supabase
            .from('mcn_carpools')
            .select(`
              *,
              creator_profile:profiles!mcn_carpools_created_by_fkey (
                full_name,
                flat_number,
                phone_number
              )
            `)
            .eq('id', id)
            .eq('community_id', communityId)
            .maybeSingle(),
          supabase
            .from('mcn_carpool_requests')
            .select('*')
            .eq('carpool_id', id)
            .order('created_at', { ascending: false }),
          supabase.rpc('get_mcn_carpool_seats', { p_carpool_id: id }),
          supabase.rpc('get_mcn_carpool_passengers', { p_carpool_id: id }),
        ]);

        if (carpoolRes.error) throw carpoolRes.error;
        if (!carpoolRes.data) {
          setNotFound(true);
          return;
        }

        setCarpool(carpoolRes.data as Carpool);
        setNotFound(false);

        if (reqRes.error) {
          console.error('Error fetching carpool requests:', reqRes.error);
          Toast.show({ type: 'error', text1: 'Could not load join requests' });
        } else {
          setRequests((reqRes.data as CarpoolRequest[]) || []);
        }

        if (seatRes.data && (seatRes.data as any[]).length > 0) {
          const s = (seatRes.data as any[])[0];
          setSeats({
            total_seats: s.total_seats ?? carpoolRes.data.available_seats,
            booked_seats: s.booked_seats ?? 0,
            remaining_seats: s.remaining_seats ?? carpoolRes.data.available_seats,
          });
        }

        if (passRes.data) {
          setPassengers(passRes.data as Passenger[]);
        }
      } catch (err: any) {
        console.error('Error loading carpool details:', err);
        Toast.show({ type: 'error', text1: 'Failed to load carpool details' });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id, communityId]
  );

  useFocusEffect(
    useCallback(() => {
      fetchDetails();
    }, [fetchDetails])
  );

  const handleUpdateStatus = async (newStatus: 'active' | 'paused' | 'cancelled' | 'completed') => {
    if (!carpool) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('mcn_carpools')
        .update({ status: newStatus })
        .eq('id', carpool.id);

      if (error) throw error;

      let msg = 'Ride status updated';
      if (newStatus === 'paused') msg = 'Ride paused';
      if (newStatus === 'active') msg = 'Ride resumed';
      if (newStatus === 'cancelled') msg = 'Ride cancelled';
      if (newStatus === 'completed') msg = 'Trip marked as completed';

      Toast.show({ type: 'success', text1: msg });
      await fetchDetails();
    } catch (err: any) {
      console.error(err);
      Toast.show({
        type: 'error',
        text1: 'Failed to update status',
        text2: err?.message || undefined,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteCarpool = () => {
    if (!carpool) return;

    const performDelete = async () => {
      setActionLoading(true);
      try {
        const { error } = await supabase.from('mcn_carpools').delete().eq('id', carpool.id);
        if (error) throw error;
        Toast.show({ type: 'success', text1: 'Ride deleted' });
        router.replace('/mcn/carpools' as any);
      } catch (err: any) {
        console.error('Delete error:', err);
        Toast.show({ type: 'error', text1: 'Failed to delete ride', text2: err.message });
      } finally {
        setActionLoading(false);
      }
    };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Delete this ride post?\nThis action cannot be undone.')) {
        performDelete();
      }
    } else {
      Alert.alert('Delete ride post?', 'This action cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: performDelete },
      ]);
    }
  };

  const handleSendRequest = async () => {
    if (!user || !communityId || !carpool) return;

    const cleanName = riderName.trim();
    const cleanPhone = normalizeIndianMobile(riderPhone);
    const cleanFlat = flatNumber.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

    if (!cleanName) {
      Toast.show({ type: 'error', text1: 'Missing details', text2: 'Please enter your full name.' });
      return;
    }
    if (!cleanPhone || !isValidIndianMobile(cleanPhone)) {
      Toast.show({
        type: 'error',
        text1: 'Invalid phone number',
        text2: 'Please enter a valid 10-digit Indian mobile number.',
      });
      return;
    }
    if (!cleanFlat) {
      Toast.show({ type: 'error', text1: 'Missing details', text2: 'Please enter your flat number (e.g. A101).' });
      return;
    }

    setSubmittingRequest(true);
    try {
      const { error } = await supabase.from('mcn_carpool_requests').insert({
        carpool_id: carpool.id,
        community_id: communityId,
        rider_id: user.id,
        rider_name: cleanName,
        rider_phone: cleanPhone,
        flat_number: cleanFlat,
        seats_requested: seatsRequested,
        note: riderNote.trim() || null,
        status: 'pending',
      });

      if (error) throw error;

      Toast.show({
        type: 'success',
        text1: 'Request sent',
        text2: 'The host has been notified of your request.',
      });
      setShowJoinModal(false);
      setRiderNote('');
      await fetchDetails();
    } catch (err: any) {
      console.error(err);
      Toast.show({ type: 'error', text1: 'Failed to send request', text2: err?.message });
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleUpdateRequestStatus = async (
    requestId: string,
    newStatus: 'accepted' | 'rejected' | 'cancelled'
  ) => {
    if (pendingRequestId) return;
    setPendingRequestId(requestId);

    try {
      const { error } = await supabase
        .from('mcn_carpool_requests')
        .update({ status: newStatus })
        .eq('id', requestId);

      if (error) throw error;

      Toast.show({
        type: 'success',
        text1:
          newStatus === 'accepted'
            ? 'Request accepted'
            : newStatus === 'rejected'
            ? 'Request declined'
            : 'Request cancelled',
      });
      await fetchDetails();
    } catch (err: any) {
      console.error(err);
      Toast.show({
        type: 'error',
        text1: 'Could not update request',
        text2: err?.message || undefined,
      });
    } finally {
      setPendingRequestId(null);
    }
  };

  const handleCallHost = (phone?: string | null) => {
    if (!phone) {
      Toast.show({ type: 'error', text1: 'No phone number available' });
      return;
    }
    const clean = normalizeIndianMobile(phone) || phone.replace(/\D/g, '');
    Linking.openURL(`tel:${clean}`);
  };

  const handleWhatsAppHost = (phone?: string | null) => {
    if (!phone) {
      Toast.show({ type: 'error', text1: 'No phone number available' });
      return;
    }
    const clean = normalizeIndianMobile(phone) || phone.replace(/\D/g, '');
    const formatted = clean.length === 10 ? `91${clean}` : clean;
    const msg = encodeURIComponent(`Hi, I saw your ride post "${carpool?.title || 'Ride'}" on Wooru.`);
    Linking.openURL(`https://wa.me/${formatted}?text=${msg}`);
  };

  const handleBack = () => {
    goBackSmart(router, `/mcn/carpools/${id}`);
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.surface }]}>
        <Stack.Screen options={buildMcnHeaderOptions({ title: 'Ride details', onBack: handleBack })} />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (notFound || !carpool) {
    return (
      <View style={[styles.center, { backgroundColor: colors.surface }]}>
        <Stack.Screen options={buildMcnHeaderOptions({ title: 'Ride not found', onBack: handleBack })} />
        <EmptyState
          icon="car-sport-outline"
          title="Ride not found"
          message="This ride may have been removed by the host, or it belongs to another community."
          actionLabel="Back to all rides"
          onAction={() => router.replace('/mcn/carpools' as any)}
        />
      </View>
    );
  }

  const effectiveRemaining = seats?.remaining_seats ?? carpool.available_seats;
  const effectiveTotal = seats?.total_seats ?? carpool.available_seats;
  const isFull = effectiveRemaining === 0;

  const unitPrice =
    carpool.pricing_type === 'paid'
      ? (carpool.price_per_seat_amount ?? (parseFloat(carpool.price_per_seat?.replace(/[^0-9.]/g, '') || '0') || 0))
      : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Stack.Screen
        options={buildMcnHeaderOptions({
          title: carpool.title,
          onBack: handleBack,
          headerRight:
            isOwner || isCommunityLead
              ? () => (
                  <TouchableOpacity
                    onPress={() => router.push(`/mcn/carpools/add?id=${carpool.id}` as any)}
                    style={styles.headerEditBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="pencil-outline" size={20} color={colors.primary} />
                  </TouchableOpacity>
                )
              : undefined,
        })}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchDetails(true)} colors={[colors.primary]} />
        }
      >
        {/* Main Card Header */}
        <BaseCard padding={12} style={styles.card}>
          <View style={styles.headerTopRow}>
            <View
              style={[
                styles.roleBadge,
                {
                  backgroundColor:
                    carpool.role_type === 'offering' ? colors.accentSoft : colors.cardMuted,
                },
              ]}
            >
              <Ionicons
                name={carpool.role_type === 'offering' ? 'car-outline' : 'person-outline'}
                size={14}
                color={carpool.role_type === 'offering' ? colors.accent : colors.textPrimary}
              />
              <Text
                style={[
                  styles.roleBadgeText,
                  { color: carpool.role_type === 'offering' ? colors.accent : colors.textPrimary },
                ]}
              >
                {carpool.role_type === 'offering' ? 'Offering ride' : 'Seeking ride'}
              </Text>
            </View>

            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor:
                    carpool.status === 'active'
                      ? colors.accentSoft
                      : carpool.status === 'paused'
                      ? colors.cautionSoft
                      : carpool.status === 'completed'
                      ? colors.cardMuted
                      : colors.dangerSoft,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  {
                    color:
                      carpool.status === 'active'
                        ? colors.accent
                        : carpool.status === 'paused'
                        ? colors.caution
                        : carpool.status === 'completed'
                        ? colors.textSecondary
                        : colors.danger,
                  },
                ]}
              >
                {carpool.status === 'active'
                  ? 'Active'
                  : carpool.status === 'paused'
                  ? 'Paused'
                  : carpool.status === 'completed'
                  ? 'Completed'
                  : 'Cancelled'}
              </Text>
            </View>
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]}>{carpool.title}</Text>

          {/* Route Box */}
          <View style={styles.routeContainer}>
            <View style={styles.routePointRow}>
              <View style={[styles.dotCircle, { backgroundColor: colors.accent }]} />
              <Text style={[styles.routeLabel, { color: colors.textTertiary }]}>Pickup / Start:</Text>
              <Text style={[styles.routeValue, { color: colors.textPrimary }]}>{carpool.start_point}</Text>
            </View>

            <View style={styles.routeLine} />

            <View style={styles.routePointRow}>
              <View style={[styles.dotCircle, { backgroundColor: colors.danger }]} />
              <Text style={[styles.routeLabel, { color: colors.textTertiary }]}>Destination:</Text>
              <Text style={[styles.routeValue, { color: colors.textPrimary }]}>{carpool.end_point}</Text>
            </View>
          </View>

          {/* Timings & Seats */}
          <View style={[styles.infoGrid, { borderColor: colors.border }]}>
            {/* Trip Date or Recurring indicator */}
            {carpool.trip_date ? (
              <View style={styles.gridItem}>
                <Ionicons name="calendar-outline" size={18} color={colors.accent} />
                <View>
                  <Text style={[styles.gridLabel, { color: colors.textTertiary }]}>Date</Text>
                  <Text style={[styles.gridValue, { color: colors.textPrimary }]}>
                    {new Date(carpool.trip_date + 'T00:00:00').toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={styles.gridItem}>
              <Ionicons name="time-outline" size={18} color={colors.primary} />
              <View>
                <Text style={[styles.gridLabel, { color: colors.textTertiary }]}>Departure</Text>
                <Text style={[styles.gridValue, { color: colors.textPrimary }]}>{carpool.departure_time}</Text>
              </View>
            </View>

            {carpool.return_time ? (
              <View style={styles.gridItem}>
                <Ionicons name="swap-horizontal-outline" size={18} color={colors.accent} />
                <View>
                  <Text style={[styles.gridLabel, { color: colors.textTertiary }]}>Return time</Text>
                  <Text style={[styles.gridValue, { color: colors.textPrimary }]}>{carpool.return_time}</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.gridItem}>
              <Ionicons name="people-outline" size={18} color={colors.textSecondary} />
              <View>
                <Text style={[styles.gridLabel, { color: colors.textTertiary }]}>
                  {carpool.role_type === 'offering' ? 'Capacity' : 'Seats needed'}
                </Text>
                <Text
                  style={[
                    styles.gridValue,
                    {
                      color:
                        carpool.role_type === 'offering' && isFull
                          ? colors.danger
                          : colors.textPrimary,
                    },
                  ]}
                >
                  {carpool.role_type === 'offering'
                    ? isFull
                      ? 'Ride full'
                      : `${effectiveRemaining} of ${effectiveTotal} seats left`
                    : `${carpool.available_seats} ${carpool.available_seats === 1 ? 'seat' : 'seats'}`}
                </Text>
              </View>
            </View>

            {/* Cost row - Only shown for offering rides */}
            {carpool.role_type === 'offering' && (
              <View style={styles.gridItem}>
                <Ionicons
                  name="cash-outline"
                  size={18}
                  color={carpool.pricing_type === 'paid' ? colors.accent : colors.accent}
                />
                <View>
                  <Text style={[styles.gridLabel, { color: colors.textTertiary }]}>Ride cost</Text>
                  {carpool.pricing_type === 'paid' ? (
                    unitPrice > 0 ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Rupees amount={unitPrice} size="sm" tone="in" />
                        <Text style={[styles.gridValue, { color: colors.textPrimary, marginLeft: 2 }]}>
                          / seat
                        </Text>
                      </View>
                    ) : (
                      <Text style={[styles.gridValue, { color: colors.accent }]}>Paid</Text>
                    )
                  ) : (
                    <Text style={[styles.gridValue, { color: colors.accent }]}>Free ride</Text>
                  )}
                </View>
              </View>
            )}

            {carpool.role_type === 'offering' && carpool.vehicle_info ? (
              <View style={styles.gridItem}>
                <Ionicons name="car-sport-outline" size={18} color={colors.textSecondary} />
                <View>
                  <Text style={[styles.gridLabel, { color: colors.textTertiary }]}>Vehicle</Text>
                  <Text style={[styles.gridValue, { color: colors.textPrimary }]}>{carpool.vehicle_info}</Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* Recurring Schedule */}
          {!carpool.trip_date && carpool.recurring_days && carpool.recurring_days.length > 0 && (
            <View style={styles.sectionBlock}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>RECURRING DAYS</Text>
              <View style={styles.daysRow}>
                {carpool.recurring_days.map((day) => (
                  <View key={day} style={[styles.dayBadge, { backgroundColor: colors.accentSoft }]}>
                    <Text style={[styles.dayBadgeText, { color: colors.accent }]}>{day}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Notes */}
          {carpool.notes ? (
            <View style={styles.sectionBlock}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>RIDE NOTES & PREFERENCES</Text>
              <Text style={[styles.notesText, { color: colors.textPrimary }]}>{carpool.notes}</Text>
            </View>
          ) : null}

          {/* Creator Profile & Contact Card */}
          <View style={[styles.hostCard, { backgroundColor: colors.cardMuted, borderColor: colors.border }]}>
            <Ionicons name="person-circle-outline" size={38} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.hostName, { color: colors.textPrimary }]}>
                {carpool.creator_profile?.full_name || 'Resident'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                <Text style={[styles.hostFlat, { color: colors.textSecondary }]}>
                  Flat {carpool.creator_profile?.flat_number || 'N/A'}
                </Text>
                {(carpool.contact_phone || carpool.creator_profile?.phone_number) ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <Text style={[styles.hostFlat, { color: colors.textTertiary }]}>·</Text>
                    <Ionicons name="call-outline" size={12} color={colors.textTertiary} />
                    <Text style={[styles.hostFlat, { color: colors.textSecondary }]}>
                      {carpool.contact_phone || carpool.creator_profile?.phone_number}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {(carpool.contact_phone || carpool.creator_profile?.phone_number) ? (
              <View style={styles.contactRow}>
                <TouchableOpacity
                  style={[styles.iconBtn, { backgroundColor: colors.accentSoft }]}
                  onPress={() => handleCallHost(carpool.contact_phone || carpool.creator_profile?.phone_number)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="call-outline" size={18} color={colors.accent} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.iconBtn, { backgroundColor: colors.accentSoft }]}
                  onPress={() => handleWhatsAppHost(carpool.contact_phone || carpool.creator_profile?.phone_number)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="logo-whatsapp" size={18} color={colors.accent} />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </BaseCard>

        {/* Public Confirmed Co-Passengers Section */}
        {carpool.role_type === 'offering' && passengers.length > 0 && (
          <BaseCard padding={12} style={styles.card}>
            <Text style={[styles.controlHeader, { color: colors.textPrimary, marginBottom: 8 }]}>
              Confirmed co-passengers ({passengers.length})
            </Text>
            {passengers.map((p, idx) => (
              <View key={idx} style={[styles.reqCard, { borderColor: colors.border, marginBottom: 6 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textPrimary }}>
                    {p.passenger_name} (Flat {p.passenger_flat})
                  </Text>
                  <View style={{ backgroundColor: colors.accentSoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '500', color: colors.accent }}>
                      {p.seats} {p.seats === 1 ? 'seat' : 'seats'}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </BaseCard>
        )}

        {/* Host Controls - Available to owner and community leads for ALL rides (offering and seeking) */}
        {(isOwner || isCommunityLead) && (
          <BaseCard padding={12} style={styles.card}>
            <Text style={[styles.controlHeader, { color: colors.textPrimary }]}>Host controls</Text>
            <View style={styles.hostActionsRow}>
              {carpool.status === 'active' ? (
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: colors.cautionSoft }]}
                  onPress={() => handleUpdateStatus('paused')}
                  disabled={actionLoading}
                >
                  <Ionicons name="pause-circle-outline" size={18} color={colors.caution} />
                  <Text style={[styles.actionButtonText, { color: colors.caution }]}>Pause</Text>
                </TouchableOpacity>
              ) : carpool.status === 'paused' ? (
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: colors.accentSoft }]}
                  onPress={() => handleUpdateStatus('active')}
                  disabled={actionLoading}
                >
                  <Ionicons name="play-circle-outline" size={18} color={colors.accent} />
                  <Text style={[styles.actionButtonText, { color: colors.accent }]}>Resume</Text>
                </TouchableOpacity>
              ) : null}

              {carpool.status !== 'cancelled' && carpool.status !== 'completed' && (
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: colors.dangerSoft }]}
                  onPress={() => handleUpdateStatus('cancelled')}
                  disabled={actionLoading}
                >
                  <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
                  <Text style={[styles.actionButtonText, { color: colors.danger }]}>Cancel</Text>
                </TouchableOpacity>
              )}

              {carpool.status === 'active' && (
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: colors.cardMuted }]}
                  onPress={() => handleUpdateStatus('completed')}
                  disabled={actionLoading}
                >
                  <Ionicons name="checkmark-done-circle-outline" size={18} color={colors.textPrimary} />
                  <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Complete</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.dangerSoft }]}
                onPress={handleDeleteCarpool}
                disabled={actionLoading}
              >
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
                <Text style={[styles.actionButtonText, { color: colors.danger }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </BaseCard>
        )}

        {/* Requests Section for Host */}
        {isOwner && carpool.role_type === 'offering' && (() => {
          const hostRequests = requests.filter((r) => r.status !== 'cancelled');
          return (
            <BaseCard padding={12} style={styles.card}>
              <View style={styles.headerBetween}>
                <Text style={[styles.controlHeader, { color: colors.textPrimary }]}>
                  Join requests ({hostRequests.length})
                </Text>
              </View>

              {hostRequests.length === 0 ? (
                <Text style={[styles.emptyReqText, { color: colors.textMuted }]}>
                  No join requests from residents yet.
                </Text>
              ) : (
                hostRequests.map((req) => (
                  <View key={req.id} style={[styles.reqCard, { borderColor: colors.border }]}>
                    <View style={styles.reqHeader}>
                      <Text style={[styles.reqName, { color: colors.textPrimary }]}>
                        {req.rider_name} (Flat {req.flat_number})
                      </Text>
                      <View
                        style={[
                          styles.reqStatusBadge,
                          {
                            backgroundColor:
                              req.status === 'accepted'
                                ? colors.accentSoft
                                : req.status === 'pending'
                                ? colors.cautionSoft
                                : colors.dangerSoft,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '500',
                            color:
                              req.status === 'accepted'
                                ? colors.accent
                                : req.status === 'pending'
                                ? colors.caution
                                : colors.danger,
                          }}
                        >
                          {req.status === 'accepted'
                            ? 'Accepted'
                            : req.status === 'pending'
                            ? 'Pending'
                            : 'Declined'}
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.reqDetail, { color: colors.textSecondary }]}>
                      Seats: {req.seats_requested} · Phone: {req.rider_phone}
                    </Text>
                    {req.note ? (
                      <Text style={[styles.reqNote, { color: colors.textTertiary }]}>"{req.note}"</Text>
                    ) : null}

                    {req.status === 'pending' && (
                      <View style={styles.reqActions}>
                        <TouchableOpacity
                          style={[
                            styles.smallBtn,
                            { backgroundColor: colors.primary },
                            pendingRequestId !== null && { opacity: 0.6 },
                          ]}
                          onPress={() => handleUpdateRequestStatus(req.id, 'accepted')}
                          disabled={pendingRequestId !== null}
                        >
                          <Text style={[styles.smallBtnText, { color: colors.primaryFg }]}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.smallBtn,
                            { backgroundColor: colors.dangerSoft },
                            pendingRequestId !== null && { opacity: 0.6 },
                          ]}
                          onPress={() => handleUpdateRequestStatus(req.id, 'rejected')}
                          disabled={pendingRequestId !== null}
                        >
                          <Text style={[styles.smallBtnText, { color: colors.danger }]}>Decline</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))
              )}
            </BaseCard>
          );
        })()}

        {/* Rider Booking Card (Non-Owner & Non-Lead View) */}
        {!isOwner && !isCommunityLead && carpool.status === 'active' && carpool.role_type === 'offering' && (
          <BaseCard padding={12} style={styles.card}>
            {myOpenRequest ? (
              <View style={{ gap: 8 }}>
                <View style={styles.headerBetween}>
                  <Text style={[styles.controlHeader, { color: colors.textPrimary }]}>Your booking status</Text>
                  <View
                    style={[
                      styles.reqStatusBadge,
                      {
                        backgroundColor:
                          myOpenRequest.status === 'accepted' ? colors.accentSoft : colors.cautionSoft,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '500',
                        color:
                          myOpenRequest.status === 'accepted' ? colors.accent : colors.caution,
                      }}
                    >
                      {myOpenRequest.status === 'accepted' ? 'Confirmed' : 'Pending host review'}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.reqDetail, { color: colors.textSecondary }]}>
                  Requested {myOpenRequest.seats_requested} {myOpenRequest.seats_requested === 1 ? 'seat' : 'seats'} on this route.
                </Text>

                <TouchableOpacity
                  style={[
                    styles.cancelReqBtn,
                    { borderColor: colors.danger },
                    pendingRequestId !== null && { opacity: 0.6 },
                  ]}
                  onPress={() => handleUpdateRequestStatus(myOpenRequest.id, 'cancelled')}
                  disabled={pendingRequestId !== null}
                >
                  <Text style={[styles.cancelReqText, { color: colors.danger }]}>Cancel my request</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {myLastDeclined && (
                  <Text style={[styles.declinedNotice, { color: colors.textTertiary }]}>
                    The host was unable to accept an earlier request. You may apply again if plans changed.
                  </Text>
                )}

                <TouchableOpacity
                  style={[
                    styles.joinBtn,
                    { backgroundColor: isFull ? colors.cardMuted : colors.primary },
                  ]}
                  onPress={() => setShowJoinModal(true)}
                  disabled={isFull}
                >
                  <Ionicons
                    name="car-sport"
                    size={20}
                    color={isFull ? colors.textMuted : colors.primaryFg}
                  />
                  <Text
                    style={[
                      styles.joinBtnText,
                      { color: isFull ? colors.textMuted : colors.primaryFg },
                    ]}
                  >
                    {isFull ? 'Ride is full' : 'Request to join ride'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </BaseCard>
        )}
      </ScrollView>

      {/* Join Request Modal */}
      <Modal
        visible={showJoinModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowJoinModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowJoinModal(false)}>
          <Pressable style={[styles.modalContent, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Request carpool seat</Text>
              <TouchableOpacity onPress={() => setShowJoinModal(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: 14 }}>
              <View style={styles.modalInputGroup}>
                <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Your full name *</Text>
                <TextInput
                  style={[styles.modalInput, { color: colors.textPrimary, borderColor: colors.borderStrong }]}
                  value={riderName}
                  onChangeText={setRiderName}
                  placeholder="Enter name"
                  placeholderTextColor={colors.textTertiary}
                />
              </View>

              <View style={styles.modalInputGroup}>
                <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Flat / Unit number *</Text>
                <TextInput
                  style={[styles.modalInput, { color: colors.textPrimary, borderColor: colors.borderStrong }]}
                  value={flatNumber}
                  onChangeText={setFlatNumber}
                  onBlur={() => setFlatNumber((prev) => prev.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase())}
                  placeholder="e.g. A101"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="characters"
                />
              </View>

              <View style={styles.modalInputGroup}>
                <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Phone number (for host to coordinate) *</Text>
                <TextInput
                  style={[styles.modalInput, { color: colors.textPrimary, borderColor: colors.borderStrong }]}
                  value={riderPhone}
                  onChangeText={setRiderPhone}
                  keyboardType="phone-pad"
                  placeholder="e.g. 9876543210"
                  placeholderTextColor={colors.textTertiary}
                  maxLength={10}
                />
              </View>

              <View style={styles.modalInputGroup}>
                <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Seats requested</Text>
                <View style={styles.counterRow}>
                  <TouchableOpacity
                    style={[styles.modalCounterBtn, { borderColor: colors.borderStrong }]}
                    onPress={() => setSeatsRequested(Math.max(1, seatsRequested - 1))}
                  >
                    <Ionicons name="remove" size={18} color={colors.textPrimary} />
                  </TouchableOpacity>
                  <Text style={[styles.modalCounterText, { color: colors.textPrimary }]}>{seatsRequested}</Text>
                  <TouchableOpacity
                    style={[styles.modalCounterBtn, { borderColor: colors.borderStrong }]}
                    onPress={() => setSeatsRequested(Math.min(Math.max(1, effectiveRemaining), seatsRequested + 1))}
                    disabled={seatsRequested >= effectiveRemaining}
                  >
                    <Ionicons
                      name="add"
                      size={18}
                      color={seatsRequested >= effectiveRemaining ? colors.textMuted : colors.textPrimary}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Estimated Total Calculation */}
              {carpool.pricing_type === 'paid' && unitPrice > 0 && (
                <View style={[styles.costPreview, { backgroundColor: colors.cardMuted }]}>
                  <Text style={[styles.costPreviewLabel, { color: colors.textSecondary }]}>Total ride contribution:</Text>
                  <Rupees amount={unitPrice * seatsRequested} size="md" tone="in" />
                </View>
              )}

              <View style={styles.modalInputGroup}>
                <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Note for host (optional)</Text>
                <TextInput
                  style={[styles.modalInput, { color: colors.textPrimary, borderColor: colors.borderStrong }]}
                  value={riderNote}
                  onChangeText={setRiderNote}
                  placeholder="e.g. Need pickup at Main Gate around 8:25 AM"
                  placeholderTextColor={colors.textTertiary}
                />
              </View>

              <TouchableOpacity
                style={[styles.submitReqBtn, { backgroundColor: colors.primary }]}
                onPress={handleSendRequest}
                disabled={submittingRequest}
              >
                {submittingRequest ? (
                  <ActivityIndicator color={colors.primaryFg} />
                ) : (
                  <Text style={[styles.submitReqText, { color: colors.primaryFg }]}>Send request</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerEditBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 8,
  },
  card: {
    marginBottom: 0,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: VerandahRadius.sm,
    gap: 4,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: VerandahRadius.pill,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
  },
  title: {
    ...VerandahType.display,
    fontSize: 18,
    marginBottom: 6,
  },
  routeContainer: {
    backgroundColor: Verandah.cardMuted,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 8,
  },
  routePointRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dotCircle: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  routeLine: {
    width: 1,
    height: 8,
    backgroundColor: Verandah.borderStrong,
    marginLeft: 3,
    marginVertical: 1,
  },
  routeLabel: {
    fontSize: 11,
    fontWeight: '500',
    width: 100,
  },
  routeValue: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    marginBottom: 8,
  },
  gridItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: '45%',
  },
  gridLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  gridValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  sectionBlock: {
    marginBottom: 12,
  },
  sectionTitle: {
    ...VerandahType.sectionLabel,
    marginBottom: 6,
  },
  daysRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  dayBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: VerandahRadius.sm,
  },
  dayBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  notesText: {
    fontSize: 13,
    lineHeight: 18,
  },
  hostCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: VerandahRadius.md,
    borderWidth: 0.5,
    gap: 10,
    marginTop: 4,
  },
  hostName: {
    fontSize: 14,
    fontWeight: '500',
  },
  hostFlat: {
    fontSize: 12,
  },
  contactRow: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlHeader: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 8,
  },
  hostActionsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionButton: {
    flex: 1,
    minWidth: '28%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: VerandahRadius.md,
    gap: 4,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  headerBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyReqText: {
    fontSize: 13,
  },
  reqCard: {
    padding: 10,
    borderWidth: 0.5,
    borderRadius: VerandahRadius.md,
    marginBottom: 8,
  },
  reqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  reqName: {
    fontSize: 13,
    fontWeight: '500',
  },
  reqStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  reqDetail: {
    fontSize: 12,
  },
  reqNote: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
  },
  reqActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: VerandahRadius.sm,
  },
  smallBtnText: {
    fontSize: 12,
    fontWeight: '500',
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: VerandahRadius.lg,
    gap: 8,
  },
  joinBtnText: {
    fontSize: 15,
    fontWeight: '500',
  },
  declinedNotice: {
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 4,
  },
  cancelReqBtn: {
    borderWidth: 1,
    paddingVertical: 8,
    borderRadius: VerandahRadius.md,
    alignItems: 'center',
  },
  cancelReqText: {
    fontSize: 13,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '500',
  },
  modalInputGroup: {
    gap: 4,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  modalInput: {
    height: 44,
    borderWidth: 0.5,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalCounterBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 0.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCounterText: {
    fontSize: 15,
    fontWeight: '500',
  },
  costPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: VerandahRadius.md,
  },
  costPreviewLabel: {
    fontSize: 13,
  },
  submitReqBtn: {
    height: 48,
    borderRadius: VerandahRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  submitReqText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
