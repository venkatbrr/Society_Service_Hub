import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { goBackSmart } from '../../../lib/navigation';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Linking,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Toast from 'react-native-toast-message';
import { BaseCard } from '../../../components/BaseCard';
import { Verandah } from '../../../constants/Colors';
import { VerandahRadius, VerandahType } from '../../../constants/Verandah';
import { useAuth } from '../../../context/AuthContext';
import { Tables } from '../../../lib/database.types';
import { buildMcnHeaderOptions } from '../../../lib/mcnHeader';
import { supabase } from '../../../lib/supabase';

type Carpool = Tables<'mcn_carpools'> & {
  creator_profile?: {
    full_name: string | null;
    flat_number: string | null;
    phone_number: string | null;
  } | null;
};

type CarpoolRequest = Tables<'mcn_carpool_requests'>;

export default function CarpoolDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile, communityId, isCommunityLead } = useAuth();
  const colors = Verandah;

  const [carpool, setCarpool] = useState<Carpool | null>(null);
  const [requests, setRequests] = useState<CarpoolRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Join Modal State
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [riderName, setRiderName] = useState(profile?.full_name || '');
  const [riderPhone, setRiderPhone] = useState(profile?.phone_number || '');
  const [flatNumber, setFlatNumber] = useState(profile?.flat_number || '');
  const [seatsRequested, setSeatsRequested] = useState(1);
  const [riderNote, setRiderNote] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  const isOwner = carpool?.created_by === user?.id;
  const myExistingRequest = requests.find((r) => r.rider_id === user?.id && r.status !== 'cancelled');

  const fetchDetails = useCallback(
    async (isRefresh = false) => {
      if (!id) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const { data: carpoolData, error: carpoolErr } = await supabase
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
          .single();

        if (carpoolErr) throw carpoolErr;
        setCarpool(carpoolData as Carpool);

        // Fetch join requests for this carpool
        const { data: reqData, error: reqErr } = await supabase
          .from('mcn_carpool_requests')
          .select('*')
          .eq('carpool_id', id)
          .order('created_at', { ascending: false });

        if (!reqErr) {
          setRequests((reqData as CarpoolRequest[]) || []);
        }
      } catch (err) {
        console.error('Error loading carpool details:', err);
        Toast.show({ type: 'error', text1: 'Failed to load carpool details' });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id]
  );

  useFocusEffect(
    useCallback(() => {
      fetchDetails();
    }, [fetchDetails])
  );

  const handleUpdateStatus = async (newStatus: 'active' | 'paused' | 'cancelled') => {
    if (!carpool) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('mcn_carpools')
        .update({ status: newStatus })
        .eq('id', carpool.id);

      if (error) throw error;

      let msg = 'Carpool status updated';
      if (newStatus === 'paused') msg = 'Carpool paused successfully';
      if (newStatus === 'active') msg = 'Carpool resumed!';
      if (newStatus === 'cancelled') msg = 'Carpool cancelled';

      Toast.show({ type: 'success', text1: msg });
      fetchDetails();
    } catch (err: any) {
      console.error(err);
      Toast.show({ type: 'error', text1: 'Failed to update status' });
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
        Toast.show({ type: 'success', text1: 'Carpool deleted' });
        router.replace('/network/carpools' as any);
      } catch (err: any) {
        console.error('Delete error:', err);
        Toast.show({ type: 'error', text1: 'Failed to delete carpool', text2: err.message });
      } finally {
        setActionLoading(false);
      }
    };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Delete Carpool?\nThis action cannot be undone.')) {
        performDelete();
      }
    } else {
      Alert.alert('Delete Carpool?', 'This action cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: performDelete },
      ]);
    }
  };

  const handleSendRequest = async () => {
    if (!user || !communityId || !carpool) return;
    if (!riderName.trim() || !riderPhone.trim() || !flatNumber.trim()) {
      Toast.show({ type: 'error', text1: 'Missing Details', text2: 'Please fill name, phone and flat number.' });
      return;
    }

    setSubmittingRequest(true);
    try {
      const { error } = await supabase.from('mcn_carpool_requests').insert({
        carpool_id: carpool.id,
        community_id: communityId,
        rider_id: user.id,
        rider_name: riderName.trim(),
        rider_phone: riderPhone.trim(),
        flat_number: flatNumber.trim(),
        seats_requested: seatsRequested,
        note: riderNote.trim() || null,
        status: 'pending',
      });

      if (error) throw error;

      Toast.show({
        type: 'success',
        text1: 'Request Sent!',
        text2: 'The host has been notified of your carpool request.',
      });
      setShowJoinModal(false);
      fetchDetails();
    } catch (err: any) {
      console.error(err);
      Toast.show({ type: 'error', text1: 'Failed to send request', text2: err.message });
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleUpdateRequestStatus = async (requestId: string, newStatus: 'accepted' | 'rejected' | 'cancelled') => {
    try {
      const targetReq = requests.find((r) => r.id === requestId);
      const prevStatus = targetReq?.status;

      const { error } = await supabase
        .from('mcn_carpool_requests')
        .update({ status: newStatus })
        .eq('id', requestId);

      if (error) throw error;

      if (carpool) {
        let seatAdjustment = 0;
        if (newStatus === 'accepted' && prevStatus !== 'accepted') {
          seatAdjustment = -Math.abs(targetReq?.seats_requested || 1);
        } else if (prevStatus === 'accepted' && newStatus !== 'accepted') {
          seatAdjustment = Math.abs(targetReq?.seats_requested || 1);
        }

        if (seatAdjustment !== 0) {
          const newSeats = Math.max(0, carpool.available_seats + seatAdjustment);
          await supabase
            .from('mcn_carpools')
            .update({ available_seats: newSeats })
            .eq('id', carpool.id);
        }
      }

      Toast.show({ type: 'success', text1: `Request ${newStatus}` });
      fetchDetails();
    } catch (err) {
      console.error(err);
      Toast.show({ type: 'error', text1: 'Failed to update request' });
    }
  };

  const handleCallHost = (phone?: string | null) => {
    if (!phone) {
      Toast.show({ type: 'error', text1: 'No phone number available' });
      return;
    }
    Linking.openURL(`tel:${phone}`);
  };

  const handleWhatsAppHost = (phone?: string | null) => {
    if (!phone) {
      Toast.show({ type: 'error', text1: 'No phone number available' });
      return;
    }
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const msg = encodeURIComponent(`Hi, I saw your carpool route "${carpool?.title || 'Ride'}" on Society Hub.`);
    Linking.openURL(`https://wa.me/${formattedPhone}?text=${msg}`);
  };

  const handleBack = () => {
    goBackSmart(router, '/network/carpools/' + String(id || ''));
  };

  if (loading || !carpool) {
    return (
      <View style={[styles.center, { backgroundColor: colors.surface }]}>
        <Stack.Screen options={{ title: 'Carpool Details' }} />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Stack.Screen
        options={buildMcnHeaderOptions({
          title: carpool.title,
          onBack: handleBack,
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
                { backgroundColor: carpool.role_type === 'offering' ? colors.primary + '18' : '#DBEAFE' },
              ]}
            >
              <Ionicons
                name={carpool.role_type === 'offering' ? 'car-outline' : 'person-outline'}
                size={14}
                color={carpool.role_type === 'offering' ? colors.primary : '#1D4ED8'}
              />
              <Text
                style={[
                  styles.roleBadgeText,
                  { color: carpool.role_type === 'offering' ? colors.primary : '#1D4ED8' },
                ]}
              >
                {carpool.role_type === 'offering' ? 'Offering Ride' : 'Seeking Ride'}
              </Text>
            </View>

            <View style={[styles.statusBadge, {
              backgroundColor: carpool.status === 'active' ? '#D1FAE5' : carpool.status === 'paused' ? '#FEF3C7' : '#FEE2E2'
            }]}>
              <Text style={[styles.statusText, {
                color: carpool.status === 'active' ? '#059669' : carpool.status === 'paused' ? '#D97706' : '#DC2626'
              }]}>
                {carpool.status.toUpperCase()}
              </Text>
            </View>
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]}>{carpool.title}</Text>

          {/* Route Box */}
          <View style={styles.routeContainer}>
            <View style={styles.routePointRow}>
              <View style={[styles.dotCircle, { backgroundColor: '#10B981' }]} />
              <Text style={[styles.routeLabel, { color: colors.textTertiary }]}>Pickup / Start:</Text>
              <Text style={[styles.routeValue, { color: colors.textPrimary }]}>{carpool.start_point}</Text>
            </View>

            <View style={styles.routeLine} />

            <View style={styles.routePointRow}>
              <View style={[styles.dotCircle, { backgroundColor: '#EF4444' }]} />
              <Text style={[styles.routeLabel, { color: colors.textTertiary }]}>Destination / End:</Text>
              <Text style={[styles.routeValue, { color: colors.textPrimary }]}>{carpool.end_point}</Text>
            </View>
          </View>

          {/* Timings & Seats */}
          <View style={[styles.infoGrid, { borderColor: colors.border }]}>
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
                  <Text style={[styles.gridLabel, { color: colors.textTertiary }]}>Return Time</Text>
                  <Text style={[styles.gridValue, { color: colors.textPrimary }]}>{carpool.return_time}</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.gridItem}>
              <Ionicons name="people-outline" size={18} color={colors.textSecondary} />
              <View>
                <Text style={[styles.gridLabel, { color: colors.textTertiary }]}>Capacity</Text>
                <Text style={[styles.gridValue, { color: colors.textPrimary }]}>
                  {carpool.available_seats} {carpool.available_seats === 1 ? 'seat' : 'seats'}
                </Text>
              </View>
            </View>

            <View style={styles.gridItem}>
              <Ionicons name="cash-outline" size={18} color={(carpool as any).pricing_type === 'paid' ? colors.accent : '#059669'} />
              <View>
                <Text style={[styles.gridLabel, { color: colors.textTertiary }]}>Ride Cost</Text>
                <Text style={[styles.gridValue, { color: (carpool as any).pricing_type === 'paid' ? colors.accent : '#059669' }]}>
                  {(carpool as any).pricing_type === 'paid' ? ((carpool as any).price_per_seat || 'Paid') : 'Free Ride'}
                </Text>
              </View>
            </View>

            {carpool.vehicle_info ? (
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
          {carpool.recurring_days && carpool.recurring_days.length > 0 && (
            <View style={styles.sectionBlock}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>RECURRING DAYS</Text>
              <View style={styles.daysRow}>
                {carpool.recurring_days.map((day) => (
                  <View key={day} style={[styles.dayBadge, { backgroundColor: colors.primary + '18' }]}>
                    <Text style={[styles.dayBadgeText, { color: colors.primary }]}>{day}</Text>
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
          {carpool && (
            <View style={[styles.hostCard, { backgroundColor: colors.cardMuted, borderColor: colors.border }]}>
              <Ionicons name="person-circle-outline" size={38} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.hostName, { color: colors.textPrimary }]}>
                  {carpool.creator_profile?.full_name || 'Resident Host'}
                </Text>
                <Text style={[styles.hostFlat, { color: colors.textSecondary }]}>
                  Flat: {carpool.creator_profile?.flat_number || 'N/A'}
                  {((carpool as any).contact_phone || carpool.creator_profile?.phone_number)
                    ? ` · 📞 ${(carpool as any).contact_phone || carpool.creator_profile?.phone_number}`
                    : ''}
                </Text>
              </View>

              {(carpool.role_type === 'seeking' || !isOwner) && ((carpool as any).contact_phone || carpool.creator_profile?.phone_number) && (
                <View style={styles.contactRow}>
                  <TouchableOpacity
                    style={[styles.iconBtn, { backgroundColor: '#D1FAE5' }]}
                    onPress={() => handleCallHost((carpool as any).contact_phone || carpool.creator_profile?.phone_number)}
                  >
                    <Ionicons name="call-outline" size={18} color="#059669" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.iconBtn, { backgroundColor: '#DCFCE7' }]}
                    onPress={() => handleWhatsAppHost((carpool as any).contact_phone || carpool.creator_profile?.phone_number)}
                  >
                    <Ionicons name="logo-whatsapp" size={18} color="#16A34A" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </BaseCard>

        {/* Public Confirmed Co-Passengers Section */}
        {carpool.role_type === 'offering' && (() => {
          const acceptedRequests = requests.filter((r) => r.status === 'accepted');
          if (acceptedRequests.length === 0) return null;
          return (
            <BaseCard padding={12} style={styles.card}>
              <Text style={[styles.controlHeader, { color: colors.textPrimary, marginBottom: 8 }]}>
                Confirmed Co-Passengers ({acceptedRequests.length})
              </Text>
              {acceptedRequests.map((req) => (
                <View key={req.id} style={[styles.reqCard, { borderColor: colors.border, marginBottom: 6 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>
                      {req.rider_name} (Flat {req.flat_number})
                    </Text>
                    <View style={{ backgroundColor: '#D1FAE5', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#059669' }}>
                        {req.seats_requested} {req.seats_requested === 1 ? 'SEAT' : 'SEATS'}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </BaseCard>
          );
        })()}

        {/* Host Control Panel - Only for offering rides */}
        {carpool.role_type === 'offering' && (isOwner || isCommunityLead) && (
          <BaseCard padding={12} style={styles.card}>
            <Text style={[styles.controlHeader, { color: colors.textPrimary }]}>Host Controls</Text>
            <View style={styles.hostActionsRow}>
              {carpool.status === 'active' ? (
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: '#FEF3C7' }]}
                  onPress={() => handleUpdateStatus('paused')}
                  disabled={actionLoading}
                >
                  <Ionicons name="pause-circle-outline" size={18} color="#D97706" />
                  <Text style={[styles.actionButtonText, { color: '#D97706' }]}>Pause Trip</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: '#D1FAE5' }]}
                  onPress={() => handleUpdateStatus('active')}
                  disabled={actionLoading}
                >
                  <Ionicons name="play-circle-outline" size={18} color="#059669" />
                  <Text style={[styles.actionButtonText, { color: '#059669' }]}>Resume Trip</Text>
                </TouchableOpacity>
              )}

              {carpool.status !== 'cancelled' && (
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: '#FEE2E2' }]}
                  onPress={() => handleUpdateStatus('cancelled')}
                  disabled={actionLoading}
                >
                  <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
                  <Text style={[styles.actionButtonText, { color: '#DC2626' }]}>Cancel Trip</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.borderStrong }]}
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
        {isOwner && (() => {
          const hostRequests = requests.filter((r) => r.status !== 'cancelled');
          return (
            <BaseCard padding={12} style={styles.card}>
              <View style={styles.headerBetween}>
                <Text style={[styles.controlHeader, { color: colors.textPrimary }]}>
                  Join Requests ({hostRequests.length})
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
                      {req.rider_name} ({req.flat_number})
                    </Text>
                    <View style={[styles.reqStatusBadge, {
                      backgroundColor: req.status === 'accepted' ? '#D1FAE5' : req.status === 'pending' ? '#FEF3C7' : '#FEE2E2'
                    }]}>
                      <Text style={{ fontSize: 10, fontWeight: '700', textTransform: 'uppercase', color: req.status === 'accepted' ? '#059669' : req.status === 'pending' ? '#D97706' : '#DC2626' }}>
                        {req.status}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.reqDetail, { color: colors.textSecondary }]}>
                    Seats Requested: {req.seats_requested} · Phone: {req.rider_phone}
                  </Text>
                  {req.note ? (
                    <Text style={[styles.reqNote, { color: colors.textTertiary }]}>"{req.note}"</Text>
                  ) : null}

                  {req.status === 'pending' && (
                    <View style={styles.reqActions}>
                      <TouchableOpacity
                        style={[styles.smallBtn, { backgroundColor: colors.primary }]}
                        onPress={() => handleUpdateRequestStatus(req.id, 'accepted')}
                      >
                        <Text style={[styles.smallBtnText, { color: colors.primaryFg }]}>Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.smallBtn, { backgroundColor: colors.dangerSoft }]}
                        onPress={() => handleUpdateRequestStatus(req.id, 'rejected')}
                      >
                        <Text style={[styles.smallBtnText, { color: colors.danger }]}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))
            )}
          </BaseCard>
        ); })()}

        {/* Rider Booking Card (Non-Owner View) */}
        {!isOwner && carpool.status === 'active' && carpool.role_type === 'offering' && (
          <BaseCard padding={12} style={styles.card}>
            {myExistingRequest ? (
              <View style={{ gap: 8 }}>
                <View style={styles.headerBetween}>
                  <Text style={[styles.controlHeader, { color: colors.textPrimary }]}>Your Booking Status</Text>
                  <View style={[styles.reqStatusBadge, {
                    backgroundColor: myExistingRequest.status === 'accepted' ? '#D1FAE5' : myExistingRequest.status === 'pending' ? '#FEF3C7' : '#FEE2E2'
                  }]}>
                    <Text style={{ fontSize: 11, fontWeight: '700', textTransform: 'uppercase', color: myExistingRequest.status === 'accepted' ? '#059669' : myExistingRequest.status === 'pending' ? '#D97706' : '#DC2626' }}>
                      {myExistingRequest.status}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.reqDetail, { color: colors.textSecondary }]}>
                  Requested {myExistingRequest.seats_requested} seat(s) on this route.
                </Text>

                <TouchableOpacity
                  style={[styles.cancelReqBtn, { borderColor: colors.danger }]}
                  onPress={() => handleUpdateRequestStatus(myExistingRequest.id, 'cancelled')}
                >
                  <Text style={[styles.cancelReqText, { color: colors.danger }]}>Cancel My Request</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                <TouchableOpacity
                  style={[styles.joinBtn, { backgroundColor: colors.primary }]}
                  onPress={() => setShowJoinModal(true)}
                >
                  <Ionicons name="car-sport" size={20} color={colors.primaryFg} />
                  <Text style={[styles.joinBtnText, { color: colors.primaryFg }]}>
                    Request to Join Carpool (App Booking)
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </BaseCard>
        )}
      </ScrollView>

      {/* Join Request Modal */}
      <Modal visible={showJoinModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Request Carpool Seat</Text>
              <TouchableOpacity onPress={() => setShowJoinModal(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: 14 }}>
              <View style={styles.modalInputGroup}>
                <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Your Full Name</Text>
                <TextInput
                  style={[styles.modalInput, { color: colors.textPrimary, borderColor: colors.borderStrong }]}
                  value={riderName}
                  onChangeText={setRiderName}
                  placeholder="Enter name"
                />
              </View>

              <View style={styles.modalInputGroup}>
                <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Flat / Unit Number</Text>
                <TextInput
                  style={[styles.modalInput, { color: colors.textPrimary, borderColor: colors.borderStrong }]}
                  value={flatNumber}
                  onChangeText={setFlatNumber}
                  placeholder="e.g. Tower 2 - 402"
                />
              </View>

              <View style={styles.modalInputGroup}>
                <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Phone Number</Text>
                <TextInput
                  style={[styles.modalInput, { color: colors.textPrimary, borderColor: colors.borderStrong }]}
                  value={riderPhone}
                  onChangeText={setRiderPhone}
                  keyboardType="phone-pad"
                  placeholder="Enter phone"
                />
              </View>

              <View style={styles.modalInputGroup}>
                <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Seats Requested</Text>
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
                    onPress={() => setSeatsRequested(Math.min(carpool.available_seats, seatsRequested + 1))}
                  >
                    <Ionicons name="add" size={18} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.modalInputGroup}>
                <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Note for Host (Optional)</Text>
                <TextInput
                  style={[styles.modalInput, { color: colors.textPrimary, borderColor: colors.borderStrong }]}
                  value={riderNote}
                  onChangeText={setRiderNote}
                  placeholder="e.g. Need pickup at Main Gate around 8:25 AM"
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
                  <Text style={[styles.submitReqText, { color: colors.primaryFg }]}>Send Request</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 12,
  },
  backBtn: {
    padding: 4,
    borderRadius: VerandahRadius.pill,
  },
  headerTitle: {
    ...VerandahType.title,
    fontSize: 18,
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
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: VerandahRadius.pill,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
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
    fontWeight: '600',
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
    fontWeight: '600',
  },
  sectionBlock: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
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
    fontWeight: '600',
  },
  notesText: {
    fontSize: 14,
    lineHeight: 20,
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
    fontWeight: '600',
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
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  hostActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: VerandahRadius.md,
    gap: 4,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  headerBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  emptyReqText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  reqCard: {
    padding: 12,
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
    fontSize: 14,
    fontWeight: '600',
  },
  reqStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  reqDetail: {
    fontSize: 13,
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
    paddingVertical: 6,
    borderRadius: VerandahRadius.sm,
  },
  smallBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    borderRadius: VerandahRadius.lg,
    gap: 8,
  },
  joinBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  cancelReqBtn: {
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: VerandahRadius.md,
    alignItems: 'center',
  },
  cancelReqText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalInputGroup: {
    gap: 6,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  modalInput: {
    height: 46,
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
    fontSize: 16,
    fontWeight: '600',
  },
  submitReqBtn: {
    height: 50,
    borderRadius: VerandahRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  submitReqText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
