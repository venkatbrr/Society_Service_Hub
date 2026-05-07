import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Colors } from '../constants/Colors';
import { supabase } from '../lib/supabase';
import { ProviderSelector } from './ProviderSelector';

type HistoryRow = {
  id: string;
  service_id: string;
  serviced_on: string;
  provider_id: string | null;
  provider_name_snapshot: string | null;
  provider_name: string | null;
  cost_paid: number | null;
  note: string | null;
  created_at: string;
};

type ProviderOption = {
  id: string;
  name: string;
  phone?: string | null;
  whatsapp?: string | null;
};

type Props = {
  serviceId: string;
  communityId: string | null;
  refreshToken?: number;
};

export function ServiceHistoryList({ serviceId, communityId, refreshToken = 0 }: Props) {
  const colors = Colors.light;
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [editing, setEditing] = useState<HistoryRow | null>(null);
  const [editDate, setEditDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [editProvider, setEditProvider] = useState<ProviderOption | null>(null);
  const [editCost, setEditCost] = useState('');
  const [editNote, setEditNote] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchProviders = useCallback(async () => {
    try {
      let query = supabase.from('service_providers').select('id, name, phone').order('name', { ascending: true });
      if (communityId) {
        query = query.eq('community_id', communityId);
      }
      const { data, error } = await query;
      if (error) throw error;
      setProviders((data ?? []) as ProviderOption[]);
    } catch {
      setProviders([]);
    }
  }, [communityId]);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_service_history', { p_service_id: serviceId });
      if (error) throw error;
      setHistory((data ?? []) as HistoryRow[]);
    } catch {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to load service history' });
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory, refreshToken]);

  useEffect(() => {
    if (!editing) return;

    setEditDate(new Date(editing.serviced_on));
    setEditCost(editing.cost_paid == null ? '' : String(editing.cost_paid));
    setEditNote(editing.note ?? '');

    const matched = providers.find((provider) => provider.id === editing.provider_id) ?? null;
    if (matched) {
      setEditProvider(matched);
    } else if (editing.provider_id && editing.provider_name_snapshot) {
      setEditProvider({
        id: editing.provider_id,
        name: editing.provider_name_snapshot,
      });
    } else {
      setEditProvider(null);
    }
  }, [editing, providers]);

  const formattedRows = useMemo(
    () =>
      history.map((row) => ({
        ...row,
        dateLabel: new Date(row.serviced_on).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
      })),
    [history]
  );

  const closeEditor = () => {
    setEditing(null);
    setShowDatePicker(false);
  };

  const handleSave = async () => {
    if (!editing) return;

    const trimmedNote = editNote.trim();
    const noteValue = trimmedNote.length ? trimmedNote.slice(0, 280) : null;

    const normalizedCost = editCost.trim();
    const costValue = normalizedCost.length ? Number(normalizedCost) : null;
    if (normalizedCost.length && (costValue === null || Number.isNaN(costValue) || costValue < 0)) {
      Toast.show({ type: 'error', text1: 'Invalid cost', text2: 'Enter a valid non-negative amount.' });
      return;
    }

    const servicedOnValue = editDate.toISOString().split('T')[0];
    const previous = history;
    const optimisticProviderName = editProvider?.name ?? null;

    setSaving(true);
    setHistory((current) =>
      current.map((item) =>
        item.id === editing.id
          ? {
              ...item,
              serviced_on: servicedOnValue,
              provider_id: editProvider?.id ?? null,
              provider_name_snapshot: optimisticProviderName,
              provider_name: optimisticProviderName,
              cost_paid: costValue,
              note: noteValue,
            }
          : item
      )
    );

    try {
      const { error } = await supabase
        .from('user_service_history')
        .update({
          serviced_on: servicedOnValue,
          provider_id: editProvider?.id ?? null,
          provider_name_snapshot: optimisticProviderName,
          cost_paid: costValue,
          note: noteValue,
        })
        .eq('id', editing.id);

      if (error) throw error;
      closeEditor();
    } catch {
      setHistory(previous);
      Toast.show({ type: 'error', text1: 'Update failed', text2: 'Could not save history changes.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;

    const previous = history;
    setSaving(true);
    setHistory((current) => current.filter((item) => item.id !== editing.id));

    try {
      const { error } = await supabase.from('user_service_history').delete().eq('id', editing.id);
      if (error) throw error;
      closeEditor();
    } catch {
      setHistory(previous);
      Toast.show({ type: 'error', text1: 'Delete failed', text2: 'Could not delete history entry.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.section, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}> 
      <Text style={[styles.sectionTitle, { color: colors.text }]}>History</Text>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : formattedRows.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>No service history yet - your first 'Mark done' will start the log.</Text>
      ) : (
        <View style={styles.rowsWrap}>
          {formattedRows.map((row, index) => (
            <TouchableOpacity
              key={row.id}
              onPress={() => setEditing(row)}
              activeOpacity={0.82}
              style={[
                styles.row,
                {
                  borderBottomColor: colors.border,
                  borderBottomWidth: index === formattedRows.length - 1 ? 0 : StyleSheet.hairlineWidth,
                },
              ]}
            >
              <View style={styles.rowMain}>
                <Text style={[styles.rowDate, { color: colors.text }]}>{row.dateLabel}</Text>
                <Text style={[styles.rowProvider, { color: colors.textMuted }]}> 
                  {row.provider_name || 'Self / cash visit'}
                </Text>
                {row.note ? <Text style={[styles.rowNote, { color: colors.textMuted }]}>{row.note}</Text> : null}
              </View>
              <View style={styles.rowRight}>
                {row.cost_paid != null ? <Text style={[styles.rowCost, { color: colors.text }]}>₹{Number(row.cost_paid).toFixed(0)}</Text> : null}
                <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={closeEditor}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.border }]}> 
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Edit history entry</Text>
              <TouchableOpacity onPress={closeEditor}>
                <Text style={[styles.closeIcon, { color: colors.textMuted }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalBody}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>SERVICED ON</Text>
              <TouchableOpacity
                style={[styles.input, styles.dateInput, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.82}
              >
                <Text style={{ color: colors.text, fontSize: 14 }}>
                  {editDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </Text>
                <Text style={{ color: colors.textMuted }}>📅</Text>
              </TouchableOpacity>

              {showDatePicker ? (
                <DateTimePicker
                  value={editDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  maximumDate={new Date()}
                  onChange={(_, date) => {
                    setShowDatePicker(Platform.OS === 'ios');
                    if (date) setEditDate(date);
                  }}
                />
              ) : null}

              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>PROVIDER (OPTIONAL)</Text>
              <ProviderSelector
                communityId={communityId ?? ''}
                mode="existing"
                onModeChange={() => undefined}
                selectedProviderId={editProvider?.id}
                onSelectProvider={setEditProvider}
                manualProviderName=""
                onManualNameChange={() => undefined}
                manualProviderPhone=""
                onManualPhoneChange={() => undefined}
                manualProviderWhatsapp=""
                onManualWhatsappChange={() => undefined}
                allowNewProvider={false}
              />

              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>COST PAID (OPTIONAL)</Text>
              <TextInput
                value={editCost}
                onChangeText={(value) => setEditCost(value.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                placeholder="₹"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
              />

              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>NOTE (OPTIONAL)</Text>
              <TextInput
                value={editNote}
                onChangeText={(value) => setEditNote(value.slice(0, 280))}
                placeholder="One-line note"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, styles.noteInput, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }]}
                multiline
                maxLength={280}
              />

              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }, saving && styles.disabledBtn]} onPress={handleSave} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save changes'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.deleteBtn, { borderColor: colors.accent }]} onPress={handleDelete} disabled={saving}>
                <Text style={[styles.deleteBtnText, { color: colors.accent }]}>Delete entry</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  loadingWrap: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 20,
  },
  rowsWrap: {
    marginTop: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 12,
    gap: 12,
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  rowDate: {
    fontSize: 14,
    fontWeight: '700',
  },
  rowProvider: {
    fontSize: 12,
  },
  rowNote: {
    fontSize: 12,
    marginTop: 1,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  rowCost: {
    fontSize: 13,
    fontWeight: '700',
  },
  chevron: {
    fontSize: 20,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  modalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    maxHeight: '86%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DADCE0',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  closeIcon: {
    fontSize: 18,
  },
  modalBody: {
    padding: 16,
    paddingBottom: 24,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  dateInput: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  noteInput: {
    minHeight: 76,
    textAlignVertical: 'top',
  },
  saveBtn: {
    marginTop: 18,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
  deleteBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  deleteBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  disabledBtn: {
    opacity: 0.7,
  },
});
