import { AlertTriangle } from '@untitledui/icons/AlertTriangle';
import { Trash01 } from '@untitledui/icons/Trash01';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahBorder, VerandahRadius, VerandahType } from '../constants/Verandah';
import { confirmAction } from '../lib/confirm';

/**
 * The last line of the confirmation, shared by every destructive host action.
 *
 * A host deleting their own post is usually legitimate, so this is a caution
 * rather than a block — but posting and deleting on a loop is how a listing
 * gets pushed back to the top of the feed, and the people it costs are the
 * neighbours who ordered. Naming that out loud at the moment of deletion is
 * cheaper than moderating it afterwards.
 */
export const SPAM_CAUTION =
  'Posting and deleting repeatedly looks like spam to your neighbours, and your society president can see it.';

interface DangerZoneProps {
  /** Heading, e.g. "Delete this menu". */
  title: string;
  /** What is actually lost. Be specific — name the item and the order count. */
  consequence: string;
  /** Button and confirm-dialog action label, e.g. "Delete menu". */
  actionLabel: string;
  onDelete: () => void;
}

/**
 * Bottom-of-screen destructive action block.
 *
 * Deliberately at the **bottom**, not in the header action row: delete used to
 * sit inline beside "Edit drop" and "Mark completed", one mis-tap away from
 * routine work, and it is the only action on these screens that cannot be
 * undone. Putting it past everything else means a host reaches it on purpose.
 *
 * The confirmation is the caution — see `SPAM_CAUTION`. `confirmAction` handles
 * the web/native split, since `Alert.alert` is a no-op on web.
 */
export function DangerZone({ title, consequence, actionLabel, onDelete }: DangerZoneProps) {
  const handlePress = () => {
    confirmAction({
      title,
      message: `${consequence}\n\n${SPAM_CAUTION}`,
      confirmLabel: actionLabel,
      destructive: true,
      onConfirm: onDelete,
    });
  };

  return (
    <View style={styles.zone}>
      <View style={styles.headingRow}>
        <AlertTriangle size={15} color={Verandah.danger} aria-hidden={true} />
        <Text style={styles.heading}>{title}</Text>
      </View>
      <Text style={styles.consequence}>{consequence}</Text>
      <Text style={styles.caution}>{SPAM_CAUTION}</Text>

      <TouchableOpacity style={styles.button} onPress={handlePress} activeOpacity={0.8}>
        <Trash01 size={16} color={Verandah.danger} aria-hidden={true} />
        <Text style={styles.buttonText}>{actionLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  zone: {
    marginTop: 18,
    padding: 12,
    borderRadius: VerandahRadius.md,
    borderWidth: VerandahBorder.tile,
    borderColor: Verandah.danger,
    backgroundColor: Verandah.dangerSoft,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  heading: {
    ...VerandahType.title,
    fontSize: 15,
    color: Verandah.danger,
  },
  consequence: {
    ...VerandahType.body,
    fontSize: 13,
    color: Verandah.textPrimary,
    marginBottom: 6,
  },
  caution: {
    ...VerandahType.caption,
    fontSize: 12,
    lineHeight: 16,
    color: Verandah.textSecondary,
    marginBottom: 10,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: VerandahRadius.button,
    borderWidth: VerandahBorder.tile,
    borderColor: Verandah.danger,
    backgroundColor: Verandah.card,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Verandah.danger,
  },
});
