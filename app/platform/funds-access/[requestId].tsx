import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Colors } from '../../../constants/Colors';
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
  const colors = Colors.light;

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
      <View style={[styles.center, { backgroundColor: colors.background }]}> 
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}> 
      <Text style={[styles.title, { color: colors.text }]}>Funds request detail</Text>
      <Text style={[styles.meta, { color: colors.textMuted }]}>Community: {detail.communities?.name ?? '-'}</Text>
      <Text style={[styles.meta, { color: colors.textMuted }]}>Code: {detail.communities?.code ?? '-'}</Text>
      <Text style={[styles.meta, { color: colors.textMuted }]}>Address: {detail.communities?.address ?? '-'}</Text>
      <Text style={[styles.meta, { color: colors.textMuted }]}>Requester: {detail.profiles?.full_name ?? '-'}</Text>
      <Text style={[styles.meta, { color: colors.textMuted }]}>Contact: {detail.contact_name} - {detail.contact_phone}</Text>
      {detail.purpose ? <Text style={[styles.meta, { color: colors.textMuted }]}>Purpose: {detail.purpose}</Text> : null}

      <Text style={[styles.label, { color: colors.text }]}>Designated community lead</Text>
      <View style={[styles.picker, { borderColor: colors.border, backgroundColor: colors.surface2 }]}> 
        <Text style={[styles.selectedLead, { color: colors.text }]}>{leadName}</Text>
      </View>
      <View style={styles.residentList}>
        {residents.map((resident) => (
          <TouchableOpacity
            key={resident.id}
            style={[styles.residentRow, { borderColor: colors.border, backgroundColor: leadUserId === resident.id ? colors.primary + '14' : colors.glass }]}
            onPress={() => setLeadUserId(resident.id)}
          >
            <Text style={[styles.residentText, { color: leadUserId === resident.id ? colors.primary : colors.text }]}>{resident.full_name ?? 'Resident'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={approve} disabled={submitting}>
        <Text style={styles.primaryBtnText}>{submitting ? 'Saving...' : 'Approve'}</Text>
      </TouchableOpacity>

      <Text style={[styles.label, { color: colors.text, marginTop: 12 }]}>Reject reason (max 280)</Text>
      <TextInput
        value={rejectReason}
        onChangeText={(value) => setRejectReason(value.slice(0, 280))}
        style={[styles.reasonInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface2 }]}
        multiline
        numberOfLines={4}
      />
      <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.border }]} onPress={reject} disabled={submitting}>
        <Text style={[styles.secondaryBtnText, { color: colors.accent }]}>Reject</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingTop: 64, paddingHorizontal: 20, paddingBottom: 26 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 10 },
  meta: { fontSize: 13, marginBottom: 4 },
  label: { fontSize: 12, fontWeight: '700', marginTop: 10, marginBottom: 7 },
  picker: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  selectedLead: { fontSize: 14, fontWeight: '700' },
  residentList: { gap: 8, marginTop: 10 },
  residentRow: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  residentText: { fontSize: 13, fontWeight: '700' },
  primaryBtn: { marginTop: 14, borderRadius: 12, alignItems: 'center', paddingVertical: 12 },
  primaryBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  reasonInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, minHeight: 90 },
  secondaryBtn: { marginTop: 10, borderWidth: 1, borderRadius: 12, alignItems: 'center', paddingVertical: 12 },
  secondaryBtnText: { fontSize: 14, fontWeight: '800' },
});
