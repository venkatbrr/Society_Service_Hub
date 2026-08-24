import { XClose } from '@untitledui/icons/XClose';
import { Image } from 'expo-image';
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
  countOpenDropsForHost,
  DropDraft,
  DropDraftError,
  loadDraftFromDrop,
  MAX_OPEN_DROPS_PER_HOST,
  publishDropFromDraft,
} from '../lib/dropDraft';
import { formatDateStr, todayDateStr, validateDropSchedule } from '../lib/dropSchedule';
import { useWebBackToClose } from '../lib/useWebBackToClose';
import { cloudinaryUrl } from '../lib/cloudinary';
import { DropDateTimeRow } from './DropDateTimeRow';
import { PLACEHOLDER_COVER } from './PreorderDropCard';
import { Rupees } from './Rupees';

export interface RepublishDropSheetProps {
  dropId: string | null;
  communityId: string;
  userId: string;
  onClose: () => void;
  onPublished: (newDropId: string) => void;
  /** Escape to the full publish form, pre-filled from the same menu. */
  onEditFull: (dropId: string) => void;
}

/**
 * Run a past menu again, changing only when it closes and when it is delivered.
 *
 * The host sees the menu **read-only** with its prices before publishing: a
 * menu rerun weeks later can carry stale prices, and this is the last moment
 * before the whole community is notified. Everything else — title, photo, items
 * — is carried over untouched; "Edit full menu" escapes to the publish form for
 * the run where something actually differs.
 */
export function RepublishDropSheet({
  dropId,
  communityId,
  userId,
  onClose,
  onPublished,
  onEditFull,
}: RepublishDropSheetProps) {
  const open = !!dropId;
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [draft, setDraft] = useState<DropDraft | null>(null);
  const [openDrops, setOpenDrops] = useState<number>(0);

  const [fulfillmentDate, setFulfillmentDate] = useState('');
  const [fulfillmentTime, setFulfillmentTime] = useState('13:00');
  const [cutoffDate, setCutoffDate] = useState('');
  const [cutoffTime, setCutoffTime] = useState('21:00');
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: boolean }>({});

  // A hand-rolled full-screen Modal has to claim its own history entry, or
  // browser-back closes the whole screen behind it (docs/CLAUDE.md §9).
  useWebBackToClose(open, onClose);

  const load = useCallback(async () => {
    if (!dropId) return;
    setLoading(true);
    setFieldErrors({});
    try {
      const [loaded, count] = await Promise.all([
        loadDraftFromDrop(dropId),
        countOpenDropsForHost(userId),
      ]);
      setDraft(loaded);
      setOpenDrops(count);

      // Same seeding as a fresh publish: cut-off today, delivery tomorrow. The
      // times of day come from the menu being rerun, since that rhythm is
      // usually what the host repeats.
      const now = new Date();
      setCutoffDate(formatDateStr(now));
      setFulfillmentDate(formatDateStr(new Date(now.getTime() + 24 * 60 * 60 * 1000)));
      if (loaded.defaultCutoffTime) setCutoffTime(loaded.defaultCutoffTime);
      if (loaded.defaultFulfillmentTime) setFulfillmentTime(loaded.defaultFulfillmentTime);
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: 'Could not open that menu',
        text2: err instanceof DropDraftError ? err.message : err?.message,
      });
      onClose();
    } finally {
      setLoading(false);
    }
  }, [dropId, userId, onClose]);

  useEffect(() => {
    if (open) load();
    else setDraft(null);
  }, [open, load]);

  const atCap = openDrops >= MAX_OPEN_DROPS_PER_HOST;

  const handlePublish = async () => {
    if (!draft) return;

    // `loadedSchedule: null` — this is a brand new drop, so both timestamps are
    // checked against now(), never exempted the way an edit's unchanged values
    // are.
    const schedule = validateDropSchedule({
      cutoffDate,
      cutoffTime,
      fulfillmentDate,
      fulfillmentTime,
      loadedSchedule: null,
    });

    if (!schedule.ok) {
      setFieldErrors(schedule.fieldErrors);
      Toast.show({ type: 'error', text1: schedule.text1, text2: schedule.text2 });
      return;
    }

    setPublishing(true);
    try {
      const newId = await publishDropFromDraft({
        draft,
        communityId,
        userId,
        cutoffAt: schedule.cutoffAt,
        fulfillmentDate,
        fulfillmentTime,
      });
      Toast.show({
        type: 'success',
        text1: 'Menu published!',
        text2: 'Neighbors can now place pre-orders before it closes.',
      });
      onPublished(newId);
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Failed to publish menu', text2: err.message });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Republish menu</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <XClose size={20} color={Verandah.textSecondary} aria-hidden={true} />
            </TouchableOpacity>
          </View>

          {loading || !draft ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={Verandah.primary} />
            </View>
          ) : (
            <>
              <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 12 }}>
                {/* The cover carries over untouched — it lives on Cloudinary and
                    the new drop reuses the same URL, so there is no re-upload.
                    Showing it matters: without it the host cannot tell the photo
                    came along, and the read-only block is meant to be a complete
                    picture of what is about to be published. Photo-less menus
                    get the same bundled illustration the catalog tile uses, so
                    the preview matches what neighbours will actually see. */}
                <Image
                  source={draft.imageUrl ? { uri: cloudinaryUrl(draft.imageUrl) } : PLACEHOLDER_COVER}
                  style={styles.cover}
                  contentFit="cover"
                  contentPosition={draft.imageUrl ? 'top' : 'center'}
                  transition={120}
                />

                <Text style={styles.menuTitle}>{draft.title}</Text>

                {/* Read-only, on purpose: a menu rerun weeks later can carry
                    stale prices, and this is the last look before the whole
                    community is notified. */}
                <View style={styles.itemsBox}>
                  {draft.items.map((item) => (
                    <View key={item.id} style={styles.itemRow}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {/* Rupees renders its own view, so it cannot be nested
                          inside a Text node — pair it in a row instead. */}
                      <View style={styles.itemPriceWrap}>
                        <Rupees amount={parseFloat(item.price) || 0} size="sm" />
                        <Text style={styles.itemPrice}>/ {item.unit}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                {atCap ? (
                  <View style={styles.capWarn}>
                    <Text style={styles.capWarnText}>
                      You already have {openDrops} menus open. Close one, or wait for it to
                      reach its closing time, before publishing another.
                    </Text>
                  </View>
                ) : null}

                <Text style={styles.groupLabel}>Pre-order closing time</Text>
                <DropDateTimeRow
                  dateLabel="Closing date *"
                  timeLabel="Closing time *"
                  dateValue={cutoffDate}
                  timeValue={cutoffTime}
                  minDate={todayDateStr()}
                  dateError={fieldErrors.cutoffDate}
                  timeError={fieldErrors.cutoffTime}
                  onDateChange={(v) => {
                    setCutoffDate(v);
                    setFieldErrors((p) => ({ ...p, cutoffDate: false }));
                  }}
                  onTimeChange={(v) => {
                    setCutoffTime(v);
                    setFieldErrors((p) => ({ ...p, cutoffTime: false }));
                  }}
                />

                <DropDateTimeRow
                  dateLabel="Delivery date *"
                  timeLabel="Delivery time *"
                  dateValue={fulfillmentDate}
                  timeValue={fulfillmentTime}
                  minDate={cutoffDate && cutoffDate > todayDateStr() ? cutoffDate : todayDateStr()}
                  dateError={fieldErrors.fulfillmentDate}
                  timeError={fieldErrors.fulfillmentTime}
                  onDateChange={(v) => {
                    setFulfillmentDate(v);
                    setFieldErrors((p) => ({ ...p, fulfillmentDate: false }));
                  }}
                  onTimeChange={(v) => {
                    setFulfillmentTime(v);
                    setFieldErrors((p) => ({ ...p, fulfillmentTime: false }));
                  }}
                />
              </ScrollView>

              <View style={styles.footer}>
                <TouchableOpacity
                  style={[styles.publishBtn, (publishing || atCap) && { opacity: 0.5 }]}
                  onPress={handlePublish}
                  disabled={publishing || atCap}
                  activeOpacity={0.85}
                >
                  <Text style={styles.publishBtnText}>
                    {publishing ? 'Publishing…' : 'Publish menu'}
                  </Text>
                </TouchableOpacity>

                {/* The escape hatch for the run where something else changed —
                    a price, an item, the photo. Same duplicate path, just with
                    the whole form instead of the two fields. */}
                <TouchableOpacity
                  style={styles.editLink}
                  onPress={() => onEditFull(dropId!)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.editLinkText}>Edit full menu instead</Text>
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
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Verandah.textPrimary,
    fontFamily: VerandahType.sansFamily,
  },
  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  cover: {
    width: '100%',
    height: 120,
    borderRadius: VerandahRadius.md,
    marginBottom: 10,
    backgroundColor: Verandah.cardMuted,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Verandah.textPrimary,
    marginBottom: 8,
    fontFamily: VerandahType.sansFamily,
  },
  itemsBox: {
    backgroundColor: Verandah.card,
    borderRadius: VerandahRadius.md,
    borderWidth: VerandahBorder.control,
    borderColor: Verandah.borderHair,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
    gap: 10,
  },
  itemName: {
    fontSize: 13,
    color: Verandah.textPrimary,
    flex: 1,
    fontFamily: VerandahType.sansFamily,
  },
  itemPriceWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  itemPrice: {
    fontSize: 12,
    color: Verandah.textSecondary,
    fontFamily: VerandahType.sansFamily,
  },
  capWarn: {
    backgroundColor: '#FEF3C7',
    borderRadius: VerandahRadius.md,
    padding: 10,
    marginBottom: 12,
  },
  capWarnText: {
    fontSize: 12,
    color: '#92400E',
    lineHeight: 17,
    fontFamily: VerandahType.sansFamily,
  },
  groupLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Verandah.textPrimary,
    marginBottom: 6,
    marginTop: 4,
    fontFamily: VerandahType.sansFamily,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
    borderTopWidth: VerandahBorder.control,
    borderTopColor: Verandah.borderHair,
  },
  publishBtn: {
    height: 50,
    borderRadius: VerandahRadius.md,
    backgroundColor: Verandah.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editLink: {
    alignSelf: 'center',
    paddingTop: 10,
  },
  editLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: Verandah.primary,
    fontFamily: VerandahType.sansFamily,
  },
  publishBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: Verandah.primaryFg,
    fontFamily: VerandahType.sansFamily,
  },
});

export default RepublishDropSheet;
