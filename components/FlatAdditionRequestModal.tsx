import { Plus } from '@untitledui/icons/Plus';
import { XClose } from '@untitledui/icons/XClose';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';
import { supabase } from '../lib/supabase';

type FlatAdditionRequestModalProps = {
  visible: boolean;
  onClose: () => void;
  communityId: string;
  blocks: { id: string; name: string }[];
  selectedBlockId: string | null;
  onFlatAdded?: (flatId: string) => void;
  blockLabel?: string;
};

export function FlatAdditionRequestModal({
  visible,
  onClose,
  communityId,
  blocks,
  selectedBlockId: initialBlockId,
  onFlatAdded,
  blockLabel = 'Block',
}: FlatAdditionRequestModalProps) {
  const [blockId, setBlockId] = useState<string | null>(initialBlockId ?? (blocks[0]?.id || null));
  const [flatNumber, setFlatNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Sync block selection when modal opens
  React.useEffect(() => {
    if (initialBlockId) {
      setBlockId(initialBlockId);
    } else if (blocks.length > 0 && !blockId) {
      setBlockId(blocks[0].id);
    }
  }, [initialBlockId, blocks]);

  const handleSubmit = async () => {
    const cleanFlat = flatNumber.toUpperCase().replace(/[\s-]/g, '').trim();

    if (!blockId) {
      Toast.show({ type: 'error', text1: `Please select a ${blockLabel.toLowerCase()}` });
      return;
    }

    if (!cleanFlat) {
      Toast.show({ type: 'error', text1: 'Flat number is required' });
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('request_flat_addition', {
        p_block_id: blockId,
        p_flat_number: cleanFlat,
      });

      if (error) throw error;

      const res = data as any;
      if (res?.status === 'already_exists') {
        Toast.show({ type: 'success', text1: 'Flat already available!', text2: 'Selected flat automatically.' });
        if (onFlatAdded && res.flat_id) {
          onFlatAdded(res.flat_id);
        }
        onClose();
      } else if (res?.status === 'pending_exists') {
        Toast.show({ type: 'info', text1: 'Request pending', text2: res.message });
        onClose();
      } else {
        Toast.show({
          type: 'success',
          text1: 'Request submitted',
          text2: 'Your community lead will review and add this flat shortly.',
        });
        setFlatNumber('');
        onClose();
      }
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Unable to submit request', text2: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Can't find your flat?</Text>
              <Text style={styles.subtitle}>
                Request your community lead to add your flat to the verified list.
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <XClose size={20} color={Verandah.textSecondary} aria-hidden={true} />
            </TouchableOpacity>
          </View>

          {/* Block Selector */}
          {blocks.length > 0 && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Select {blockLabel}</Text>
              <View style={styles.blockRow}>
                {blocks.map((b) => {
                  const isSelected = blockId === b.id;
                  return (
                    <TouchableOpacity
                      key={b.id}
                      onPress={() => setBlockId(b.id)}
                      style={[
                        styles.blockChip,
                        isSelected ? styles.blockChipSelected : styles.blockChipDefault,
                      ]}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.blockChipText,
                          isSelected ? styles.blockChipTextSelected : styles.blockChipTextDefault,
                        ]}
                      >
                        {b.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Flat Number Input */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Flat / Unit Number</Text>
            <TextInput
              style={styles.input}
              value={flatNumber}
              onChangeText={setFlatNumber}
              placeholder="e.g. 412, G04"
              placeholderTextColor={Verandah.textTertiary}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={10}
            />
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              activeOpacity={0.8}
              disabled={submitting}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleSubmit}
              activeOpacity={0.85}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={Verandah.primaryFg} size="small" />
              ) : (
                <Text style={styles.submitText}>Submit Request</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 55, 50, 0.45)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: Verandah.card,
    borderTopLeftRadius: VerandahRadius.xl,
    borderTopRightRadius: VerandahRadius.xl,
    padding: VerandahSpace.lg,
    paddingBottom: Platform.OS === 'ios' ? 36 : VerandahSpace.lg,
    gap: VerandahSpace.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    ...VerandahType.title,
    color: Verandah.textPrimary,
  },
  subtitle: {
    ...VerandahType.caption,
    color: Verandah.textSecondary,
    marginTop: 4,
    maxWidth: 280,
  },
  closeBtn: {
    padding: 4,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    ...VerandahType.captionBold,
    color: Verandah.textPrimary,
  },
  blockRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  blockChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: VerandahRadius.pill,
    borderWidth: 1,
  },
  blockChipDefault: {
    borderColor: Verandah.borderStrong,
    backgroundColor: Verandah.cardMuted,
  },
  blockChipSelected: {
    borderColor: Verandah.primary,
    backgroundColor: Verandah.primary,
  },
  blockChipText: {
    ...VerandahType.captionBold,
  },
  blockChipTextDefault: {
    color: Verandah.textPrimary,
  },
  blockChipTextSelected: {
    color: Verandah.primaryFg,
  },
  input: {
    borderWidth: 1,
    borderColor: Verandah.borderStrong,
    borderRadius: VerandahRadius.md,
    backgroundColor: Verandah.paper,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Verandah.textPrimary,
    ...VerandahType.body,
    height: 46,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Verandah.borderStrong,
    borderRadius: VerandahRadius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Verandah.card,
  },
  cancelText: {
    ...VerandahType.captionBold,
    color: Verandah.textPrimary,
  },
  submitBtn: {
    flex: 2,
    borderRadius: VerandahRadius.md,
    backgroundColor: Verandah.primary,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    ...VerandahType.captionBold,
    color: Verandah.primaryFg,
  },
});
