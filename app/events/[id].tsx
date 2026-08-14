import { Expand01 } from '@untitledui/icons/Expand01';
import { MarkerPin01 } from '@untitledui/icons/MarkerPin01';
import { MessageChatCircle } from '@untitledui/icons/MessageChatCircle';
import { PhoneCall01 } from '@untitledui/icons/PhoneCall01';
import { Share07 } from '@untitledui/icons/Share07';
import { Ticket01 } from '@untitledui/icons/Ticket01';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { BaseCard } from '../../components/BaseCard';
import { HeaderBackButton } from '../../components/HeaderBackButton';
import { ImageViewer } from '../../components/ImageViewer';
import { Verandah } from '../../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { cloudinaryUrl } from '../../lib/cloudinary';
import { confirmAction } from '../../lib/confirm';
import { eventCategoryMeta, formatEventTime, formatEventWhen, isRegistrationOpen } from '../../lib/events';
import { goBackSmart } from '../../lib/navigation';
import { buildWhatsAppUrl, normalizeIndianMobile } from '../../lib/phone';
import { shareOrCopy } from '../../lib/share';
import { supabase } from '../../lib/supabase';

interface EventContact {
  id: string;
  name: string;
  phone: string;
  role_label: string | null;
}

interface EventDetail {
  id: string;
  community_id: string;
  created_by: string;
  title: string;
  category: string;
  description: string | null;
  image_url: string | null;
  venue: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  registration_last_date: string | null;
  entry_fee: number | null;
  registration_link: string | null;
  status: 'published' | 'cancelled';
  cancellation_note: string | null;
}

export default function CommunityEventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, isCommunityLead, isPlatformAdmin } = useAuth();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [contacts, setContacts] = useState<EventContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  const loadEvent = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [eventResult, contactsResult] = await Promise.all([
        supabase.from('community_events').select('*').eq('id', id).maybeSingle(),
        supabase.from('community_event_contacts').select('id, name, phone, role_label').eq('event_id', id).order('sort_order', { ascending: true }),
      ]);

      if (eventResult.error) throw eventResult.error;
      if (contactsResult.error) throw contactsResult.error;

      setEvent(eventResult.data as EventDetail | null);
      setContacts((contactsResult.data ?? []) as EventContact[]);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to load event', text2: error.message });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadEvent();
    }, [loadEvent])
  );

  const handleBack = () => goBackSmart(router, `/events/${id}`);

  const canManage = !!event && (event.created_by === user?.id || isCommunityLead || isPlatformAdmin);

  const handleCall = (contact: EventContact) => {
    confirmAction({
      title: `Call ${contact.name}?`,
      message: contact.phone,
      confirmLabel: 'Call',
      destructive: false,
      onConfirm: () => {
        Linking.openURL(`tel:${normalizeIndianMobile(contact.phone) || contact.phone}`).catch(() => {
          Toast.show({ type: 'error', text1: 'Could not open dialer' });
        });
      },
    });
  };

  const handleWhatsApp = (contact: EventContact) => {
    const message = `Hi ${contact.name}, I'd like to know more about "${event?.title}" on ${event ? formatEventWhen(event.event_date, event.start_time) : ''}.`;
    const url = buildWhatsAppUrl(contact.phone, message);
    if (!url) {
      Toast.show({ type: 'error', text1: 'Invalid phone number' });
      return;
    }
    Linking.openURL(url).catch(() => {
      Toast.show({ type: 'error', text1: 'Could not open WhatsApp' });
    });
  };

  const handleShare = async () => {
    if (!event) return;
    const message = [
      `*${event.title}*`,
      formatEventWhen(event.event_date, event.start_time),
      event.venue ? `Venue: ${event.venue}` : null,
    ].filter(Boolean).join('\n');
    await shareOrCopy({ title: event.title, message });
  };

  const handleCancel = () => {
    if (!event) return;
    confirmAction({
      title: 'Cancel this event?',
      message: 'Residents will still see it, marked as cancelled.',
      confirmLabel: 'Cancel event',
      onConfirm: async () => {
        setBusy(true);
        try {
          const { error } = await supabase.from('community_events').update({ status: 'cancelled' }).eq('id', event.id);
          if (error) throw error;
          Toast.show({ type: 'success', text1: 'Event cancelled' });
          await loadEvent();
        } catch (error: any) {
          Toast.show({ type: 'error', text1: 'Could not cancel event', text2: error.message });
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const handleDelete = () => {
    if (!event) return;
    confirmAction({
      title: 'Delete this event?',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        setBusy(true);
        try {
          const { error } = await supabase.from('community_events').delete().eq('id', event.id);
          if (error) throw error;
          Toast.show({ type: 'success', text1: 'Event deleted' });
          router.back();
        } catch (error: any) {
          Toast.show({ type: 'error', text1: 'Could not delete event', text2: error.message });
          setBusy(false);
        }
      },
    });
  };

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator color={Verandah.accent} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <HeaderBackButton onPress={handleBack} />
          <Text style={styles.title}>Event not found</Text>
        </View>
      </View>
    );
  }

  const meta = eventCategoryMeta(event.category);
  const regOpen = isRegistrationOpen(event.registration_last_date);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <HeaderBackButton onPress={handleBack} />
        <View style={styles.headerCopy} />
        <TouchableOpacity onPress={handleShare} style={styles.shareBtn} hitSlop={8}>
          <Share07 size={18} color={Verandah.primary} aria-hidden={true} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {event.image_url ? (
          <TouchableOpacity
            style={styles.imageWrap}
            onPress={() => setViewerUri(event.image_url)}
            activeOpacity={0.92}
            accessibilityRole="imagebutton"
            accessibilityLabel={`Open photo for ${event.title}`}
          >
            <Image source={{ uri: cloudinaryUrl(event.image_url) }} style={styles.image} contentFit="cover" transition={200} />
            <View style={styles.expandHint}>
              <Expand01 size={13} color={Verandah.surface} aria-hidden={true} />
              <Text style={styles.expandHintText}>Tap to view</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.imageWrap}>
            <View style={[styles.placeholder, { backgroundColor: meta.tintSoft }]}>
              <meta.Icon size={40} color={meta.tint} aria-hidden={true} />
            </View>
          </View>
        )}

        <View style={styles.topRow}>
          <View style={[styles.categoryChip, { backgroundColor: meta.tintSoft }]}>
            <meta.Icon size={12} color={meta.tint} aria-hidden={true} />
            <Text style={[styles.categoryChipText, { color: meta.tint }]}>{meta.label}</Text>
          </View>
          {event.status === 'cancelled' ? (
            <View style={styles.cancelledChip}>
              <Text style={styles.cancelledChipText}>Cancelled</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.eventTitle}>{event.title}</Text>
        <Text style={styles.eventWhen}>{formatEventWhen(event.event_date, event.start_time)}{event.end_time ? ` – ${formatEventTime(event.end_time)}` : ''}</Text>

        {event.venue ? (
          <View style={styles.metaRow}>
            <MarkerPin01 size={14} color={Verandah.textSecondary} aria-hidden={true} />
            <Text style={styles.metaText}>{event.venue}</Text>
          </View>
        ) : null}

        {event.entry_fee != null ? (
          <View style={styles.metaRow}>
            <Ticket01 size={14} color={Verandah.textSecondary} aria-hidden={true} />
            <Text style={styles.metaText}>{event.entry_fee > 0 ? `Entry fee ₹${event.entry_fee}` : 'Free entry'}</Text>
          </View>
        ) : null}

        {event.registration_last_date ? (
          <View style={styles.regBanner}>
            <Text style={styles.regBannerText}>
              {regOpen ? `Registration closes ${event.registration_last_date}` : 'Registration closed'}
            </Text>
            {event.registration_link && regOpen ? (
              <TouchableOpacity onPress={() => Linking.openURL(event.registration_link!)}>
                <Text style={styles.regLink}>Register</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {event.cancellation_note ? (
          <Text style={styles.cancellationNote}>{event.cancellation_note}</Text>
        ) : null}

        {event.description ? (
          <Text style={styles.description}>{event.description}</Text>
        ) : null}

        {contacts.length > 0 ? (
          <BaseCard padding={14} style={styles.contactsCard}>
            <Text style={styles.contactsTitle}>Contact</Text>
            {contacts.map((contact) => (
              <View key={contact.id} style={styles.contactRow}>
                <View style={styles.contactInfo}>
                  <Text style={styles.contactName}>{contact.name}</Text>
                  {contact.role_label ? <Text style={styles.contactRole}>{contact.role_label}</Text> : null}
                </View>
                <View style={styles.contactActions}>
                  <TouchableOpacity style={styles.contactBtn} onPress={() => handleCall(contact)} activeOpacity={0.85}>
                    <PhoneCall01 size={15} color={Verandah.primary} aria-hidden={true} />
                    <Text style={styles.contactBtnText}>Call</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.contactBtn} onPress={() => handleWhatsApp(contact)} activeOpacity={0.85}>
                    <MessageChatCircle size={15} color={Verandah.primary} aria-hidden={true} />
                    <Text style={styles.contactBtnText}>WhatsApp</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </BaseCard>
        ) : null}

        <Text style={styles.footnote}>Contact the organizers above for details — this event does not take RSVPs in the app.</Text>

        {canManage ? (
          <View style={styles.manageRow}>
            <TouchableOpacity
              style={styles.manageBtn}
              onPress={() => router.push(`/events/add?id=${event.id}` as any)}
              disabled={busy}
            >
              <Text style={styles.manageBtnText}>Edit</Text>
            </TouchableOpacity>
            {event.status === 'published' ? (
              <TouchableOpacity style={styles.manageBtn} onPress={handleCancel} disabled={busy}>
                <Text style={styles.manageBtnText}>Cancel event</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={[styles.manageBtn, styles.deleteBtn]} onPress={handleDelete} disabled={busy}>
              <Text style={styles.deleteBtnText}>Delete</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>

      <ImageViewer uri={viewerUri} onClose={() => setViewerUri(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Verandah.paper,
    paddingHorizontal: 20,
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
    marginBottom: 10,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 22,
    color: Verandah.textPrimary,
    marginLeft: 12,
  },
  shareBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Verandah.cardMuted,
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  imageWrap: {
    width: '100%',
    height: 240,
    borderRadius: VerandahRadius.card,
    overflow: 'hidden',
    backgroundColor: Verandah.cream,
    marginBottom: 12,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  expandHint: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  expandHintText: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 11,
    fontWeight: '600',
    color: Verandah.surface,
  },
  placeholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  categoryChipText: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 11,
    fontWeight: '600',
  },
  cancelledChip: {
    backgroundColor: Verandah.dangerSoft,
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  cancelledChipText: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 11,
    fontWeight: '700',
    color: Verandah.danger,
  },
  eventTitle: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 24,
    lineHeight: 28,
    color: Verandah.textPrimary,
    marginBottom: 4,
  },
  eventWhen: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 14,
    fontWeight: '600',
    color: Verandah.accent,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  metaText: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 13,
    color: Verandah.textSecondary,
  },
  regBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Verandah.sand,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 6,
    marginBottom: 6,
  },
  regBannerText: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 12.5,
    fontWeight: '600',
    color: Verandah.goldInk,
    flex: 1,
  },
  regLink: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 12.5,
    fontWeight: '700',
    color: Verandah.accent,
  },
  cancellationNote: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 12.5,
    color: Verandah.danger,
    marginTop: 4,
    marginBottom: 4,
  },
  description: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 13.5,
    lineHeight: 19,
    color: Verandah.textPrimary,
    marginTop: 8,
    marginBottom: 4,
  },
  contactsCard: {
    marginTop: 14,
  },
  contactsTitle: {
    ...VerandahType.sectionLabel,
    color: Verandah.textTertiary,
    marginBottom: 8,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Verandah.borderHair,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 13.5,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  contactRole: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 11.5,
    color: Verandah.textSecondary,
    marginTop: 1,
  },
  contactActions: {
    flexDirection: 'row',
    gap: 8,
  },
  contactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Verandah.accentSoft,
  },
  contactBtnText: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 11.5,
    fontWeight: '600',
    color: Verandah.primary,
  },
  footnote: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 11,
    color: Verandah.textTertiary,
    marginTop: 12,
    lineHeight: 15,
  },
  manageRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
  },
  manageBtn: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
    borderRadius: VerandahRadius.button,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: Verandah.card,
  },
  manageBtnText: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 13,
    fontWeight: '600',
    color: Verandah.textPrimary,
  },
  deleteBtn: {
    backgroundColor: Verandah.dangerSoft,
    borderColor: Verandah.dangerSoft,
  },
  deleteBtnText: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 13,
    fontWeight: '600',
    color: Verandah.danger,
  },
});
