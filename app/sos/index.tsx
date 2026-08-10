import { ArrowLeft } from '@untitledui/icons/ArrowLeft';
import { ChevronRight } from '@untitledui/icons/ChevronRight';
import { Drop } from '@untitledui/icons/Drop';
import { MessageCircle01 } from '@untitledui/icons/MessageCircle01';
import { Phone01 } from '@untitledui/icons/Phone01';
import { Settings01 } from '@untitledui/icons/Settings01';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Linking,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Avatar } from '../../components/Avatar';
import { BaseCard } from '../../components/BaseCard';
import { EmptyState } from '../../components/EmptyState';
import { useWebPullToRefresh } from '../../components/useWebPullToRefresh';
import { WebPullIndicator } from '../../components/WebPullIndicator';
import { Verandah } from '../../constants/Colors';
import { BLOOD_GROUP_FILTERS, EMERGENCY_CATEGORY_META, EMERGENCY_CATEGORY_ORDER, EmergencyCategory } from '../../constants/sos';
import { VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

type Segment = 'emergency' | 'donors';

type DonorRow = {
  id: string;
  user_id: string;
  blood_group: string;
  contact_phone: string;
  is_available: boolean;
  note: string | null;
};

type EmergencyContactRow = {
  id: string;
  community_id: string | null;
  category: EmergencyCategory;
  name: string;
  phone: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

const DONOR_PAGE_SIZE = 30;
const CONTACT_PAGE_SIZE = 60;

export default function SosScreen() {
  const router = useRouter();
  const { user, communityId, isCommunityLead, isPlatformAdmin } = useAuth();

  const [activeSegment, setActiveSegment] = useState<Segment>('emergency');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [myDonorRow, setMyDonorRow] = useState<DonorRow | null>(null);
  const [updatingAvailability, setUpdatingAvailability] = useState(false);

  const [selectedBloodGroup, setSelectedBloodGroup] = useState<(typeof BLOOD_GROUP_FILTERS)[number]>('All');
  const [showAllDonors, setShowAllDonors] = useState(false);
  const [donors, setDonors] = useState<Array<DonorRow & { full_name: string }>>([]);
  const [donorPage, setDonorPage] = useState(0);
  const [hasMoreDonors, setHasMoreDonors] = useState(false);
  const [donorsLoadingMore, setDonorsLoadingMore] = useState(false);

  const [contacts, setContacts] = useState<EmergencyContactRow[]>([]);
  const [contactPage, setContactPage] = useState(0);
  const [hasMoreContacts, setHasMoreContacts] = useState(false);
  const [contactsLoadingMore, setContactsLoadingMore] = useState(false);

  const canManageContacts = isCommunityLead || isPlatformAdmin;

  const loadMyDonorRow = useCallback(async () => {
    if (!user?.id || !communityId) {
      setMyDonorRow(null);
      return;
    }

    const { data, error } = await supabase
      .from('blood_donors')
      .select('id, user_id, blood_group, contact_phone, is_available, note')
      .eq('community_id', communityId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;
    setMyDonorRow(data as DonorRow | null);
  }, [communityId, user?.id]);

  const loadDonors = useCallback(async (page: number, replace: boolean) => {
    if (!communityId) {
      setDonors([]);
      setHasMoreDonors(false);
      return;
    }

    const from = page * DONOR_PAGE_SIZE;
    const to = from + DONOR_PAGE_SIZE - 1;

    let query = supabase
      .from('blood_donors')
      .select('id, user_id, blood_group, contact_phone, is_available, note')
      .eq('community_id', communityId)
      .order('is_available', { ascending: false })
      .order('updated_at', { ascending: false })
      .range(from, to);

    if (!showAllDonors) {
      query = query.eq('is_available', true);
    }

    if (selectedBloodGroup !== 'All') {
      query = query.eq('blood_group', selectedBloodGroup);
    }

    const { data, error } = await query;
    if (error) throw error;

    const donorRows = (data ?? []) as DonorRow[];
    const userIds = Array.from(new Set(donorRows.map((row) => row.user_id))).filter(Boolean);

    let nameMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);

      if (profileError) throw profileError;

      nameMap = new Map((profiles ?? []).map((row: any) => [row.id, row.full_name || 'Resident']));
    }

    const mergedRows = donorRows.map((row) => ({
      ...row,
      full_name: nameMap.get(row.user_id) ?? 'Resident',
    }));

    setDonors((prev) => (replace ? mergedRows : [...prev, ...mergedRows]));
    setDonorPage(page);
    setHasMoreDonors(donorRows.length === DONOR_PAGE_SIZE);
  }, [communityId, selectedBloodGroup, showAllDonors]);

  const loadContacts = useCallback(async (page: number, replace: boolean) => {
    if (!communityId) {
      setContacts([]);
      setHasMoreContacts(false);
      return;
    }

    const from = page * CONTACT_PAGE_SIZE;
    const to = from + CONTACT_PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from('emergency_contacts')
      .select('id, community_id, category, name, phone, description, sort_order, is_active')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
      .range(from, to);

    if (error) throw error;

    const rows = (data ?? []) as EmergencyContactRow[];
    setContacts((prev) => (replace ? rows : [...prev, ...rows]));
    setContactPage(page);
    setHasMoreContacts(rows.length === CONTACT_PAGE_SIZE);
  }, [communityId]);

  const loadAll = useCallback(async (showRefreshing = false) => {
    if (!communityId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (showRefreshing) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      await Promise.all([
        loadMyDonorRow(),
        loadDonors(0, true),
        loadContacts(0, true),
      ]);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to load SOS data', text2: error.message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [communityId, loadContacts, loadDonors, loadMyDonorRow]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  const pullToRefresh = useWebPullToRefresh(() => loadAll(true), refreshing);

  useEffect(() => {
    if (loading) return;

    loadDonors(0, true).catch((error: any) => {
      Toast.show({ type: 'error', text1: 'Unable to refresh donors', text2: error.message });
    });
  }, [loading, selectedBloodGroup, showAllDonors, loadDonors]);

  const groupedContacts = useMemo(() => {
    const grouped = new Map<EmergencyCategory, EmergencyContactRow[]>();
    contacts.forEach((row) => {
      if (!grouped.has(row.category)) {
        grouped.set(row.category, []);
      }
      grouped.get(row.category)?.push(row);
    });

    return EMERGENCY_CATEGORY_ORDER
      .map((category) => ({
        category,
        rows: grouped.get(category) ?? [],
      }))
      .filter((entry) => entry.rows.length > 0);
  }, [contacts]);

  const handleCall = useCallback(async (name: string, phone: string) => {
    const performCall = async () => {
      try {
        const cleanPhone = phone.replace(/\s+/g, '');
        const url = `tel:${cleanPhone}`;
        const supported = await Linking.canOpenURL(url);
        if (!supported) {
          Toast.show({ type: 'error', text1: 'Dialing unavailable', text2: 'This device cannot place calls.' });
          return;
        }
        await Linking.openURL(url);
      } catch (error: any) {
        Toast.show({ type: 'error', text1: 'Call failed', text2: error.message });
      }
    };

    Alert.alert(`Call ${name}?`, phone, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Call', onPress: performCall },
    ]);
  }, []);

  const handleWhatsApp = useCallback((name: string, phone: string) => {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const target = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const message = encodeURIComponent(`Hi ${name}, I got your contact from Wooru regarding blood donation.`);
    const url = `https://wa.me/${target}?text=${message}`;
    Linking.openURL(url).catch(() => {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Could not open WhatsApp' });
    });
  }, []);

  const handleToggleMyAvailability = async (value: boolean) => {
    if (!myDonorRow) return;

    setUpdatingAvailability(true);
    try {
      const { error } = await supabase
        .from('blood_donors')
        .update({ is_available: value })
        .eq('id', myDonorRow.id)
        .eq('user_id', user?.id as string);

      if (error) throw error;
      setMyDonorRow((prev) => (prev ? { ...prev, is_available: value } : prev));
      await loadDonors(0, true);
      Toast.show({ type: 'success', text1: value ? 'Marked available' : 'Marked unavailable' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to update status', text2: error.message });
    } finally {
      setUpdatingAvailability(false);
    }
  };

  const handleRemoveMyDonor = () => {
    if (!myDonorRow) return;

    const executeRemove = async () => {
      try {
        const { error } = await supabase
          .from('blood_donors')
          .delete()
          .eq('id', myDonorRow.id)
          .eq('user_id', user?.id as string);

        if (error) throw error;
        setMyDonorRow(null);
        await loadDonors(0, true);
        Toast.show({ type: 'success', text1: 'Donor registration removed' });
      } catch (error: any) {
        Toast.show({ type: 'error', text1: 'Unable to remove registration', text2: error.message });
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const confirmed = window.confirm('Remove donor registration? You will no longer appear in blood donor results.');
      if (confirmed) {
        executeRemove();
      }
      return;
    }

    Alert.alert('Remove donor registration?', 'You will no longer appear in blood donor results.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: executeRemove },
    ]);
  };

  const loadMoreDonors = async () => {
    if (donorsLoadingMore || !hasMoreDonors) return;
    setDonorsLoadingMore(true);
    try {
      await loadDonors(donorPage + 1, false);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to load more donors', text2: error.message });
    } finally {
      setDonorsLoadingMore(false);
    }
  };

  const loadMoreContacts = async () => {
    if (contactsLoadingMore || !hasMoreContacts) return;
    setContactsLoadingMore(true);
    try {
      await loadContacts(contactPage + 1, false);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to load more contacts', text2: error.message });
    } finally {
      setContactsLoadingMore(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator color={Verandah.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.85}
        >
          <ArrowLeft size={18} color={Verandah.primary} aria-hidden={true} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Emergency & Blood Donors</Text>
          <Text style={styles.subtitle}>Fast access to urgent numbers and blood donors</Text>
        </View>
      </View>

      <View style={styles.segmentedWrap}>
        <TouchableOpacity
          style={[styles.segmentButton, activeSegment === 'emergency' && styles.segmentButtonActive]}
          onPress={() => setActiveSegment('emergency')}
        >
          <Text style={[styles.segmentText, activeSegment === 'emergency' && styles.segmentTextActive]}>Emergency numbers</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentButton, activeSegment === 'donors' && styles.segmentButtonActive]}
          onPress={() => setActiveSegment('donors')}
        >
          <Text style={[styles.segmentText, activeSegment === 'donors' && styles.segmentTextActive]}>Blood donors</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        {...pullToRefresh.pullProps}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAll(true)} tintColor={Verandah.accent} />}
        showsVerticalScrollIndicator={false}
      >
        <WebPullIndicator pullDistance={pullToRefresh.pullDistance} refreshing={refreshing} isPulling={pullToRefresh.isPulling} />
        {activeSegment === 'emergency' ? (
          <>
            {canManageContacts ? (
              <BaseCard padding={14}>
                <TouchableOpacity
                  style={styles.manageRow}
                  onPress={() => router.push('/sos/manage-contacts' as any)}
                  activeOpacity={0.85}
                >
                  <View style={styles.manageIconWrap}>
                    <Settings01 size={18} color={Verandah.primary} aria-hidden={true} />
                  </View>
                  <View style={styles.manageTextWrap}>
                    <Text style={styles.cardTitle}>Manage emergency numbers</Text>
                    <Text style={styles.cardCopy}>Add or update local hospitals, security, and helplines.</Text>
                  </View>
                  <ChevronRight size={18} color={Verandah.textMuted} aria-hidden={true} />
                </TouchableOpacity>
              </BaseCard>
            ) : null}

            {groupedContacts.length === 0 ? (
              <EmptyState
                IconComponent={Phone01}
                title="No emergency numbers found"
                message="Ask your community lead to add local emergency contacts."
                isLightMode={true}
              />
            ) : (
              groupedContacts.map((group) => {
                const meta = EMERGENCY_CATEGORY_META[group.category];
                const IconComponent = meta.IconComponent;
                return (
                  <BaseCard key={group.category} padding={14}>
                    <View style={styles.groupHeader}>
                      <IconComponent size={16} color={Verandah.primary} aria-hidden={true} />
                      <Text style={styles.groupTitle}>{meta.label}</Text>
                    </View>

                    {group.rows.map((row, index) => (
                      <View
                        key={row.id}
                        style={[styles.contactRow, index !== group.rows.length - 1 && styles.contactRowDivider]}
                      >
                        <View style={styles.contactCopy}>
                          <Text style={styles.contactName}>{row.name}</Text>
                          <Text style={styles.contactMeta}>{row.phone}</Text>
                          {row.description ? <Text style={styles.contactMeta}>{row.description}</Text> : null}
                        </View>
                        <TouchableOpacity
                          style={styles.callButton}
                          onPress={() => handleCall(row.name, row.phone)}
                          activeOpacity={0.85}
                        >
                          <Phone01 size={15} color={Verandah.primaryFg} aria-hidden={true} />
                          <Text style={styles.callButtonText}>Call</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </BaseCard>
                );
              })
            )}

            {hasMoreContacts ? (
              <TouchableOpacity style={styles.loadMoreButton} onPress={loadMoreContacts} disabled={contactsLoadingMore}>
                {contactsLoadingMore ? <ActivityIndicator color={Verandah.primary} /> : <Text style={styles.loadMoreText}>Load more numbers</Text>}
              </TouchableOpacity>
            ) : null}
          </>
        ) : (
          <>
            <BaseCard padding={14}>
              {myDonorRow ? (
                <>
                  <View style={styles.myStatusRow}>
                    <Text style={styles.cardTitle}>Your donor status</Text>
                    <TouchableOpacity onPress={() => router.push('/sos/donor' as any)}>
                      <Text style={styles.inlineLink}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.cardCopy}>Blood group: {myDonorRow.blood_group}</Text>
                  <View style={styles.availabilityRow}>
                    <Text style={styles.cardCopy}>{myDonorRow.is_available ? 'Available to donate now' : 'Currently unavailable'}</Text>
                    <Switch
                      value={myDonorRow.is_available}
                      onValueChange={handleToggleMyAvailability}
                      disabled={updatingAvailability}
                    />
                  </View>
                  <TouchableOpacity onPress={handleRemoveMyDonor} style={styles.removeButton}>
                    <Text style={styles.removeButtonText}>Remove me</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.cardTitle}>Join blood donor registry</Text>
                  <Text style={styles.cardCopy}>Register once to help neighbors reach you quickly during emergencies.</Text>
                  <TouchableOpacity style={styles.ctaButton} onPress={() => router.push('/sos/donor' as any)}>
                    <Text style={styles.ctaButtonText}>Register as donor</Text>
                  </TouchableOpacity>
                </>
              )}
            </BaseCard>

            <BaseCard padding={14}>
              <Text style={styles.cardTitle}>Donor filters</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {BLOOD_GROUP_FILTERS.map((group) => {
                  const active = selectedBloodGroup === group;
                  return (
                    <TouchableOpacity
                      key={group}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setSelectedBloodGroup(group)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{group}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.availabilityFilterRow}>
                <Text style={styles.cardCopy}>Show unavailable donors</Text>
                <Switch
                  value={showAllDonors}
                  onValueChange={setShowAllDonors}
                />
              </View>
            </BaseCard>

            {donors.length === 0 ? (
              <EmptyState
                IconComponent={Drop}
                title="No donors found"
                message="No matching blood donors are visible right now."
                isLightMode={true}
              />
            ) : (
              donors.map((row) => (
                <BaseCard key={row.id} padding={14}>
                  <View style={styles.donorRow}>
                    <Avatar name={row.full_name} size={38} />
                    <View style={styles.donorCopy}>
                      <Text style={styles.donorName}>{row.full_name}</Text>
                      <View style={styles.metaRow}>
                        <View style={styles.bloodBadge}>
                          <Text style={styles.bloodBadgeText}>{row.blood_group}</Text>
                        </View>
                        {!row.is_available ? <Text style={styles.unavailableText}>Unavailable</Text> : null}
                      </View>
                      {row.note ? <Text style={styles.contactMeta}>{row.note}</Text> : null}
                    </View>
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={styles.whatsappBtn}
                        onPress={() => handleWhatsApp(row.full_name, row.contact_phone)}
                        activeOpacity={0.82}
                      >
                        <MessageCircle01 size={16} color="#FFFFFF" aria-hidden={true} />
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.callButton} onPress={() => handleCall(row.full_name, row.contact_phone)}>
                        <Phone01 size={15} color={Verandah.primaryFg} aria-hidden={true} />
                        <Text style={styles.callButtonText}>Call</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </BaseCard>
              ))
            )}

            {hasMoreDonors ? (
              <TouchableOpacity style={styles.loadMoreButton} onPress={loadMoreDonors} disabled={donorsLoadingMore}>
                {donorsLoadingMore ? <ActivityIndicator color={Verandah.primary} /> : <Text style={styles.loadMoreText}>Load more donors</Text>}
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Verandah.paper,
    paddingHorizontal: 16,
    paddingTop: VerandahLayout.screenPaddingTop,
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Verandah.paper,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: VerandahSpace.sm,
    marginBottom: 10,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: VerandahRadius.md,
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
    backgroundColor: Verandah.cardMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '400',
    color: Verandah.textPrimary,
  },
  subtitle: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 12.5,
    color: Verandah.textSecondary,
    marginTop: 2,
  },
  segmentedWrap: {
    flexDirection: 'row',
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
    borderRadius: VerandahRadius.segmented,
    backgroundColor: Verandah.cardMuted,
    padding: 3,
    marginBottom: 12,
  },
  segmentButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: VerandahRadius.segmented,
    paddingVertical: 7,
  },
  segmentButtonActive: {
    backgroundColor: Verandah.card,
    ...Verandah.shadowCard,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: VerandahType.sansFamily,
    color: Verandah.textMuted,
  },
  segmentTextActive: {
    color: Verandah.primary,
    fontWeight: '700',
  },
  scrollContent: {
    paddingBottom: 40,
    gap: 10,
  },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: VerandahSpace.md,
  },
  manageIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
    backgroundColor: Verandah.cardMuted,
  },
  manageTextWrap: {
    flex: 1,
  },
  cardTitle: {
    ...VerandahType.bodyBold,
    color: Verandah.textPrimary,
  },
  cardCopy: {
    ...VerandahType.caption,
    color: Verandah.textSecondary,
    marginTop: 2,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: VerandahSpace.sm,
    marginBottom: VerandahSpace.sm,
  },
  groupTitle: {
    ...VerandahType.captionBold,
    color: Verandah.primary,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: VerandahSpace.md,
    paddingVertical: VerandahSpace.sm,
  },
  contactRowDivider: {
    borderBottomWidth: 0.5,
    borderBottomColor: Verandah.border,
  },
  contactCopy: {
    flex: 1,
  },
  contactName: {
    ...VerandahType.bodyBold,
    color: Verandah.textPrimary,
  },
  contactMeta: {
    ...VerandahType.caption,
    color: Verandah.textSecondary,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  whatsappBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callButton: {
    borderRadius: VerandahRadius.md,
    backgroundColor: Verandah.primary,
    paddingHorizontal: VerandahSpace.md,
    paddingVertical: VerandahSpace.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  callButtonText: {
    ...VerandahType.captionBold,
    color: Verandah.primaryFg,
  },
  loadMoreButton: {
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
    borderColor: Verandah.borderStrong,
    backgroundColor: Verandah.card,
    paddingVertical: VerandahSpace.md,
    alignItems: 'center',
  },
  loadMoreText: {
    ...VerandahType.body,
    color: Verandah.primary,
  },
  myStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inlineLink: {
    ...VerandahType.captionBold,
    color: Verandah.accent,
  },
  availabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: VerandahSpace.sm,
  },
  availabilityFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: VerandahSpace.sm,
  },
  removeButton: {
    marginTop: VerandahSpace.sm,
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
    borderColor: Verandah.danger,
    paddingVertical: VerandahSpace.sm,
    alignItems: 'center',
  },
  removeButtonText: {
    ...VerandahType.captionBold,
    color: Verandah.danger,
  },
  ctaButton: {
    marginTop: VerandahSpace.md,
    borderRadius: VerandahRadius.md,
    backgroundColor: Verandah.primary,
    paddingVertical: VerandahSpace.md,
    alignItems: 'center',
  },
  ctaButtonText: {
    ...VerandahType.bodyBold,
    color: Verandah.primaryFg,
  },
  chipRow: {
    gap: VerandahSpace.sm,
    paddingVertical: 2,
  },
  chip: {
    borderRadius: VerandahRadius.pill,
    borderWidth: 1,
    borderColor: Verandah.border,
    backgroundColor: Verandah.card,
    paddingHorizontal: VerandahSpace.md,
    paddingVertical: VerandahSpace.sm,
  },
  chipActive: {
    borderColor: Verandah.primary,
    backgroundColor: Verandah.primary,
  },
  chipText: {
    ...VerandahType.caption,
    color: Verandah.textSecondary,
  },
  chipTextActive: {
    color: Verandah.primaryFg,
  },
  donorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: VerandahSpace.md,
  },
  donorCopy: {
    flex: 1,
  },
  donorName: {
    ...VerandahType.bodyBold,
    color: Verandah.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: VerandahSpace.sm,
    marginTop: 4,
    marginBottom: 2,
  },
  bloodBadge: {
    borderRadius: VerandahRadius.pill,
    borderWidth: 1,
    borderColor: Verandah.borderStrong,
    backgroundColor: Verandah.cardMuted,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  bloodBadgeText: {
    ...VerandahType.captionBold,
    color: Verandah.primary,
  },
  unavailableText: {
    ...VerandahType.caption,
    color: Verandah.caution,
  },
});
