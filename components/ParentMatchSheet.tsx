import { CheckCircle } from '@untitledui/icons/CheckCircle';
import { Circle } from '@untitledui/icons/Circle';
import { XClose } from '@untitledui/icons/XClose';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Verandah } from '../constants/Colors';
import { VerandahBorder, VerandahRadius, VerandahType } from '../constants/Verandah';
import {
  findParentMatches,
  gradeLevelLabel,
  INTENT_LABELS,
  notifyParentMatches,
  ParentCornerEntryLike,
  ParentMatch,
} from '../lib/parentCorner';
import { useWebBackToClose } from '../lib/useWebBackToClose';

export interface ParentMatchSheetProps {
  entry: ParentCornerEntryLike | null;
  communityId: string;
  onClose: () => void;
}

/**
 * Shows the parents who declared the same intent, right after an entry is saved
 * (and on demand from your own card in the directory).
 *
 * The point is to remove the first move. Both sides have already said in public
 * that they want a study group or a carpool, so a nudge from here is not a cold
 * call — it is two people who asked for the same thing being told about each
 * other. Contact details deliberately stay out of this sheet: the neighbour
 * gets a notification and decides for themselves whether to reply.
 */
export function ParentMatchSheet({ entry, communityId, onClose }: ParentMatchSheetProps) {
  const open = !!entry;
  const [loading, setLoading] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [matches, setMatches] = useState<ParentMatch[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // A hand-rolled full-screen Modal has to claim its own history entry, or
  // browser-back closes the whole screen behind it (docs/CLAUDE.md §9).
  useWebBackToClose(open, onClose);

  const load = useCallback(async () => {
    if (!entry) return;
    setLoading(true);
    try {
      const found = await findParentMatches(entry, communityId);
      setMatches(found);
      // Pre-selected: the common case is "yes, tell all of them".
      setSelected(new Set(found.map((m) => m.id)));
    } catch (err: any) {
      console.error('Parent Corner match lookup failed:', err);
      Toast.show({ type: 'error', text1: 'Could not look for matches', text2: err?.message });
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [entry, communityId]);

  useEffect(() => {
    if (open) {
      load();
    } else {
      setMatches([]);
      setSelected(new Set());
    }
  }, [open, load]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleNotify = async () => {
    if (!entry || selected.size === 0) return;
    setNotifying(true);
    try {
      const sent = await notifyParentMatches(entry.id, Array.from(selected));
      if (sent === 0) {
        // Every candidate was muted or already nudged this month — worth saying
        // plainly, otherwise the tap looks like it did nothing.
        Toast.show({
          type: 'info',
          text1: 'No new nudges sent',
          text2: 'These parents were already told about this entry recently.',
        });
      } else {
        Toast.show({
          type: 'success',
          text1: sent === 1 ? '1 parent notified' : `${sent} parents notified`,
          text2: 'They can reach you from Parent Corner.',
        });
      }
      onClose();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Could not notify', text2: err?.message });
    } finally {
      setNotifying(false);
    }
  };

  const renderMatch = (match: ParentMatch) => {
    const isSelected = selected.has(match.id);
    const gradeLabel = gradeLevelLabel(match.grade_level) || match.grade_class;

    return (
      <TouchableOpacity
        key={match.id}
        style={[styles.matchRow, isSelected && styles.matchRowSelected]}
        onPress={() => toggle(match.id)}
        activeOpacity={0.7}
      >
        {isSelected ? (
          <CheckCircle size={20} color={Verandah.accent} aria-hidden={true} />
        ) : (
          <Circle size={20} color={Verandah.textMuted} aria-hidden={true} />
        )}

        <View style={styles.matchBody}>
          <Text style={styles.matchName} numberOfLines={1}>
            {match.student_name}
            <Text style={styles.matchMeta}>{`  ·  ${gradeLabel}`}</Text>
          </Text>

          <Text style={styles.matchMeta} numberOfLines={1}>
            {match.school_name}
            {match.sameSchool ? ' · same school' : ''}
            {` · Flat ${match.flat_number}`}
          </Text>

          <View style={styles.intentRow}>
            {match.sharedIntents.map((id) => (
              <View key={id} style={styles.intentBadge}>
                <Text style={styles.intentBadgeText}>{INTENT_LABELS[id] || id}</Text>
              </View>
            ))}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const count = selected.size;

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Parents looking for the same thing</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <XClose size={20} color={Verandah.textSecondary} aria-hidden={true} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={Verandah.primary} />
            </View>
          ) : matches.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No matches yet</Text>
              <Text style={styles.emptyBody}>
                Nobody else has asked for the same thing so far. Your child stays listed, so
                check back here as more neighbours add theirs.
              </Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={onClose} activeOpacity={0.85}>
                <Text style={styles.primaryBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.lead}>
                {matches.length === 1
                  ? '1 parent asked for the same thing.'
                  : `${matches.length} parents asked for the same thing.`}{' '}
                Send them a nudge — they will see your entry and can reach you.
              </Text>

              <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 12 }}>
                {matches.map(renderMatch)}
              </ScrollView>

              <View style={styles.footer}>
                <TouchableOpacity
                  style={[styles.primaryBtn, (count === 0 || notifying) && styles.primaryBtnDisabled]}
                  onPress={handleNotify}
                  disabled={count === 0 || notifying}
                  activeOpacity={0.85}
                >
                  {notifying ? (
                    <ActivityIndicator color={Verandah.primaryFg} />
                  ) : (
                    <Text style={styles.primaryBtnText}>
                      {count === 0
                        ? 'Select someone to notify'
                        : count === 1
                          ? 'Notify 1 parent'
                          : `Notify ${count} parents`}
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.skipLink} onPress={onClose} activeOpacity={0.7}>
                  <Text style={styles.skipLinkText}>Not now</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Verandah.paper,
    borderTopLeftRadius: VerandahRadius.lg,
    borderTopRightRadius: VerandahRadius.lg,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: VerandahBorder.control,
    borderBottomColor: Verandah.borderHair,
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: Verandah.textPrimary,
    fontFamily: VerandahType.sansFamily,
  },
  lead: {
    paddingHorizontal: 16,
    paddingTop: 12,
    fontSize: 13,
    lineHeight: 19,
    color: Verandah.textSecondary,
    fontFamily: VerandahType.sansFamily,
  },
  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyWrap: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 24,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: Verandah.textPrimary,
    marginBottom: 6,
    fontFamily: VerandahType.sansFamily,
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 19,
    color: Verandah.textSecondary,
    marginBottom: 18,
    fontFamily: VerandahType.sansFamily,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 10,
    marginBottom: 8,
    borderRadius: VerandahRadius.md,
    borderWidth: VerandahBorder.control,
    borderColor: Verandah.borderHair,
    backgroundColor: Verandah.card,
  },
  matchRowSelected: {
    borderColor: Verandah.accent,
    backgroundColor: Verandah.accentSoft,
  },
  matchBody: {
    flex: 1,
  },
  matchName: {
    fontSize: 14,
    fontWeight: '500',
    color: Verandah.textPrimary,
    fontFamily: VerandahType.sansFamily,
  },
  matchMeta: {
    fontSize: 12,
    fontWeight: '400',
    color: Verandah.textSecondary,
    fontFamily: VerandahType.sansFamily,
  },
  intentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  intentBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: VerandahRadius.sm,
    backgroundColor: Verandah.cardMuted,
  },
  intentBadgeText: {
    fontSize: 11,
    color: Verandah.accent,
    fontFamily: VerandahType.sansFamily,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
    borderTopWidth: VerandahBorder.control,
    borderTopColor: Verandah.borderHair,
  },
  primaryBtn: {
    height: 48,
    borderRadius: VerandahRadius.md,
    backgroundColor: Verandah.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.5,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '500',
    color: Verandah.primaryFg,
    fontFamily: VerandahType.sansFamily,
  },
  skipLink: {
    alignSelf: 'center',
    paddingTop: 10,
  },
  skipLinkText: {
    fontSize: 13,
    fontWeight: '500',
    color: Verandah.primary,
    fontFamily: VerandahType.sansFamily,
  },
});

export default ParentMatchSheet;
