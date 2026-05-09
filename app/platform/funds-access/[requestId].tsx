import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Verandah } from '../../../constants/Colors';
import { VerandahRadius, VerandahType } from '../../../constants/Verandah';
import { supabase } from '../../../lib/supabase';

type DetailRow = {
  id: string;
  community_id: string;
  requested_by: string;
  contact_name: string;
  contact_phone: string;
  purpose: string | null;
  status: string;
  created_at: string;
  communities: { name: string | null; code: string | null; address: string | null } | null;
  profiles: { full_name: string | null } | null;
};

type ResidentOption = { id: string; full_name: string | null };

export default function PlatformFundsAccessRequestDetailScreen() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<DetailRow | null>(null);
  const [residents, setResidents] = useState<ResidentOption[]>([]);
  const [leadUserId, setLeadUserId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('funds_access_requests')
        .select('id, community_id, requested_by, contact_name, contact_phone, purpose, status, created_at, communities(name, code, address), profiles!funds_access_requests_requested_by_fkey(full_name)')
        .eq('id', requestId)
        .maybeSingle();

      if (error || !data) {
        Toast.show({ type: 'error', text1: 'Unable to load request', text2: error?.message ?? 'Request not found' });
        router.back();
        return;
      }

      setDetail(data as unknown as DetailRow);

      const { data: residentRows, error: residentError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('community_id', data.community_id)
        .eq('app_role', 'resident')
        .is('removed_at', null)
        .order('full_name', { ascending: true });

      if (residentError) {
        Toast.show({ type: 'error', text1: 'Unable to load residents', text2: residentError.message });
      } else {
        const residentList = (residentRows ?? []) as ResidentOption[];
        setResidents(residentList);
        setLeadUserId(
          residentList.find((resident) => resident.id === data.requested_by)?.id ?? residentList[0]?.id ?? null
        );
      }

      setLoading(false);
    };

    if (requestId) {
      load();
    }
  }, [requestId, router]);

  const leadName = useMemo(
    () => residents.find((resident) => resident.id === leadUserId)?.full_name ?? 'Select resident',
    [leadUserId, residents]
  );

  const approve = async () => {
    if (!detail || !leadUserId) {
      Toast.show({ type: 'error', text1: 'Select a resident to designate as community lead' });
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.rpc('platform_approve_funds_access_request', {
      p_request_id: detail.id,
      p_lead_user_id: leadUserId,
    });
    setSubmitting(false);

    if (error) {
      Toast.show({ type: 'error', text1: 'Approval failed', text2: error.message });
    } else {
      Toast.show({ type: 'success', text1: 'Funds support approved' });
      router.replace('/platform/funds-requests');
    }
  };

  const reject = async () => {
    if (!detail) return;

    setSubmitting(true);
    const { error } = await supabase.rpc('platform_reject_funds_access_request', {
      p_request_id: detail.id,
      p_rejection_reason: rejectReason.trim(),
    });
    setSubmitting(false);

    if (error) {
      Toast.show({ type: 'error', text1: 'Rejection failed', text2: error.message });
    } else {
      Toast.show({ type: 'success', text1: 'Funds support rejected' });
      router.replace('/platform/funds-requests');
    }
  };

  if (loading || !detail) {
    return (
      <View style={styles.center}> 
        <ActivityIndicator color={Verandah.accent} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}> 
      <Text style={styles.title}>Funds request detail</Text>
      <Text style={styles.meta}>Community: {detail.communities?.name ?? '-'}</Text>
      <Text style={styles.meta}>Code: {detail.communities?.code ?? '-'}</Text>
      <Text style={styles.meta}>Address: {detail.communities?.address ?? '-'}</Text>
      <Text style={styles.meta}>Requester: {detail.profiles?.full_name ?? '-'}</Text>
      <Text style={styles.meta}>Contact: {detail.contact_name} · {detail.contact_phone}</Text>
      {detail.purpose ? <Text style={styles.meta}>Purpose: {detail.purpose}</Text> : null}

      <Text style={styles.label}>Designated community lead</Text>
      <View style={styles.picker}> 
        <Text style={styles.selectedLead}>{leadName}</Text>
      </View>
      <View style={styles.residentList}>
        {residents.map((resident) => (
          <TouchableOpacity
            key={resident.id}
            style={[styles.residentRow, leadUserId === resident.id ? styles.residentRowSelected : styles.residentRowDefault]}
            onPress={() => setLeadUserId(resident.id)}
          >
            <Text style={[styles.residentText, { color: leadUserId === resident.id ? Verandah.accent : Verandah.textPrimary }]}>{resident.full_name ?? 'Resident'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={approve} disabled={submitting}>
        <Text style={styles.primaryBtnText}>{submitting ? 'Saving...' : 'Approve'}</Text>
      </TouchableOpacity>

      <Text style={[styles.label, { marginTop: 12 }]}>Reject reason (max 280)</Text>
      <TextInput
        value={rejectReason}
        onChangeText={(value) => setRejectReason(value.slice(0, 280))}
        style={styles.reasonInput}
        multiline
        numberOfLines={4}
        placeholderTextColor={Verandah.textTertiary}
      />
      <TouchableOpacity style={styles.secondaryBtn} onPress={reject} disabled={submitting}>
        <Text style={styles.secondaryBtnText}>Reject</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: Verandah.surface, paddingTop: 64, paddingHorizontal: 20, paddingBottom: 26 },
  center: { flex: 1, backgroundColor: Verandah.surface, alignItems: 'center', justifyContent: 'center' },
  title: { ...VerandahType.display, color: Verandah.textPrimary, marginBottom: 10 },
  meta: { ...VerandahType.caption, color: Verandah.textSecondary, marginBottom: 4 },
  label: { ...VerandahType.captionBold, color: Verandah.textTertiary, marginTop: 10, marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.4 },
  picker: { borderWidth: 0.5, borderColor: Verandah.borderStrong, backgroundColor: Verandah.card, borderRadius: VerandahRadius.md, paddingHorizontal: 12, paddingVertical: 10 },
  selectedLead: { ...VerandahType.bodyBold, color: Verandah.textPrimary },
  residentList: { gap: 8, marginTop: 10 },
  residentRow: { borderWidth: 0.5, borderRadius: VerandahRadius.sm + 2, paddingHorizontal: 12, paddingVertical: 9 },
  residentRowDefault: { borderColor: Verandah.border, backgroundColor: Verandah.card },
  residentRowSelected: { borderColor: Verandah.accent, backgroundColor: Verandah.accentSoft },
  residentText: { ...VerandahType.captionBold },
  primaryBtn: { marginTop: 14, borderRadius: VerandahRadius.md, backgroundColor: Verandah.primary, alignItems: 'center', paddingVertical: 12 },
  primaryBtnText: { color: Verandah.primaryFg, ...VerandahType.bodyBold },
  reasonInput: { borderWidth: 0.5, borderColor: Verandah.borderStrong, color: Verandah.textPrimary, backgroundColor: Verandah.card, borderRadius: VerandahRadius.md, paddingHorizontal: 12, paddingVertical: 10, minHeight: 90, ...VerandahType.body },
  secondaryBtn: { marginTop: 10, borderWidth: 0.5, borderColor: Verandah.danger, borderRadius: VerandahRadius.md, alignItems: 'center', paddingVertical: 12, backgroundColor: Verandah.dangerSoft },
  secondaryBtnText: { color: Verandah.danger, ...VerandahType.bodyBold },
});
