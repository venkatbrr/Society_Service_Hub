import { Plus } from '@untitledui/icons/Plus';
import { Trash01 } from '@untitledui/icons/Trash01';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { ChipRowSlider } from '../../components/ChipRowSlider';
import { DateField, formatLocalDateForDb } from '../../components/DateField';
import { HeaderBackButton } from '../../components/HeaderBackButton';
import { ImageUploader } from '../../components/ImageUploader';
import { Verandah } from '../../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahType } from '../../constants/Verandah';
import { EVENT_CATEGORIES, EVENT_TIME_OPTIONS, EventCategory, eventCategoryMeta, formatEventTime } from '../../lib/events';
import { goBackSmart } from '../../lib/navigation';
import { isValidIndianMobile } from '../../lib/phone';
import { supabase } from '../../lib/supabase';

interface ContactForm {
  id: string;
  name: string;
  phone: string;
  role_label: string;
}

const emptyContact = (): ContactForm => ({ id: String(Date.now() + Math.random()), name: '', phone: '', role_label: '' });

/**
 * Plain toggleable chips, deliberately not ChipRowSlider — that component
 * always renders its animated pill on some chip (defaulting to the first),
 * which reads as "selected" even for a null value. Start/end time are
 * optional and must be able to show nothing selected.
 */
function TimeChipRow({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeChipRow}>
      {EVENT_TIME_OPTIONS.map((t) => {
        const selected = value === t;
        return (
          <TouchableOpacity
            key={t}
            style={[styles.timeChip, selected && styles.timeChipSelected]}
            onPress={() => onChange(selected ? null : t)}
            activeOpacity={0.85}
          >
            <Text style={[styles.timeChipText, selected && styles.timeChipTextSelected]}>{formatEventTime(t)}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export default function AddOrEditCommunityEventScreen() {
  const { id: eventId } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const isEditMode = !!eventId;

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<EventCategory>('cultural');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [venue, setVenue] = useState('');
  const [eventDate, setEventDate] = useState(new Date());
  const [startTime, setStartTime] = useState<string | null>(null);
  const [endTime, setEndTime] = useState<string | null>(null);
  const [requiresRegistration, setRequiresRegistration] = useState(false);
  const [registrationLastDate, setRegistrationLastDate] = useState(new Date());
  const [entryFee, setEntryFee] = useState('');
  const [registrationLink, setRegistrationLink] = useState('');
  const [contacts, setContacts] = useState<ContactForm[]>([emptyContact()]);

  const [loadingEvent, setLoadingEvent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    setLoadingEvent(true);
    (async () => {
      try {
        const [eventResult, contactsResult] = await Promise.all([
          supabase.from('community_events').select('*').eq('id', eventId).maybeSingle(),
          supabase.from('community_event_contacts').select('id, name, phone, role_label').eq('event_id', eventId).order('sort_order', { ascending: true }),
        ]);

        if (eventResult.error) throw eventResult.error;
        if (contactsResult.error) throw contactsResult.error;

        const data = eventResult.data;
        if (data) {
          setTitle(data.title);
          setCategory((data.category as EventCategory) || 'cultural');
          setDescription(data.description || '');
          setImageUrl(data.image_url || null);
          setVenue(data.venue || '');
          setEventDate(new Date(`${data.event_date}T00:00:00`));
          setStartTime(data.start_time ? data.start_time.slice(0, 5) : null);
          setEndTime(data.end_time ? data.end_time.slice(0, 5) : null);
          if (data.registration_last_date) {
            setRequiresRegistration(true);
            setRegistrationLastDate(new Date(`${data.registration_last_date}T00:00:00`));
          }
          setEntryFee(data.entry_fee != null ? String(data.entry_fee) : '');
          setRegistrationLink(data.registration_link || '');
        }

        const loadedContacts = (contactsResult.data ?? []) as any[];
        if (loadedContacts.length > 0) {
          setContacts(loadedContacts.map((c) => ({ id: c.id, name: c.name, phone: c.phone, role_label: c.role_label || '' })));
        }
      } catch (error: any) {
        Toast.show({ type: 'error', text1: 'Failed to load event', text2: error.message });
      } finally {
        setLoadingEvent(false);
      }
    })();
  }, [eventId]);

  const handleAddContact = () => {
    if (contacts.length >= 3) return;
    setContacts((prev) => [...prev, emptyContact()]);
  };

  const handleRemoveContact = (id: string) => {
    if (contacts.length <= 1) return;
    setContacts((prev) => prev.filter((c) => c.id !== id));
  };

  const handleContactChange = (id: string, field: keyof ContactForm, value: string) => {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Toast.show({ type: 'error', text1: 'Title is required' });
      return;
    }

    const validContacts = contacts.filter((c) => c.name.trim() || c.phone.trim());
    if (validContacts.length === 0) {
      Toast.show({ type: 'error', text1: 'Add at least one contact' });
      return;
    }

    for (const c of validContacts) {
      if (!c.name.trim()) {
        Toast.show({ type: 'error', text1: 'Every contact needs a name' });
        return;
      }
      if (!isValidIndianMobile(c.phone)) {
        Toast.show({ type: 'error', text1: `Invalid phone number for "${c.name}"`, text2: 'Enter a valid 10-digit mobile number.' });
        return;
      }
    }

    const feeTrimmed = entryFee.trim();
    let feeValue: number | null = null;
    if (feeTrimmed) {
      const parsed = Number(feeTrimmed);
      if (isNaN(parsed) || parsed < 0) {
        Toast.show({ type: 'error', text1: 'Entry fee must be a positive number' });
        return;
      }
      feeValue = parsed;
    }

    const regDateStr = requiresRegistration ? formatLocalDateForDb(registrationLastDate) : null;
    const eventDateStr = formatLocalDateForDb(eventDate);
    if (regDateStr && regDateStr > eventDateStr) {
      Toast.show({ type: 'error', text1: 'Registration must close on or before the event date' });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('upsert_community_event', {
        p_event_id: eventId ?? null,
        p_title: title.trim(),
        p_category: category,
        p_description: description.trim() || null,
        p_image_url: imageUrl,
        p_venue: venue.trim() || null,
        p_event_date: eventDateStr,
        p_start_time: startTime,
        p_end_time: endTime,
        p_registration_last_date: regDateStr,
        p_entry_fee: feeValue,
        p_registration_link: registrationLink.trim() || null,
        p_contacts: validContacts.map((c) => ({ name: c.name.trim(), phone: c.phone.trim(), role_label: c.role_label.trim() || null })),
      });

      if (error) throw error;

      Toast.show({ type: 'success', text1: isEditMode ? 'Event updated' : 'Event posted' });
      router.back();
    } catch (error: any) {
      Toast.show({ type: 'error', text1: isEditMode ? 'Could not update event' : 'Could not post event', text2: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => goBackSmart(router, eventId ? `/events/add?id=${eventId}` : '/events/add');

  if (loadingEvent) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator color={Verandah.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <HeaderBackButton onPress={handleBack} />
        <Text style={styles.headerTitle}>{isEditMode ? 'Edit event' : 'Post an event'}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.label}>Cover photo</Text>
          <ImageUploader
            currentImageUrl={imageUrl}
            onImageUploaded={setImageUrl}
            onImageRemoved={() => setImageUrl(null)}
            subfolder="events"
            aspectRatio={16 / 9}
            placeholder="Add event photo"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Category</Text>
          <ChipRowSlider<EventCategory>
            value={category}
            onChange={setCategory}
            chips={EVENT_CATEGORIES.map((c) => ({ key: c, label: eventCategoryMeta(c).label }))}
            activeColor={Verandah.primaryFg}
            inactiveColor={Verandah.textPrimary}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Ganesh Chaturthi celebrations"
            placeholderTextColor={Verandah.textMuted}
            value={title}
            onChangeText={setTitle}
            maxLength={80}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Details</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="What's happening, who can join, what to bring..."
            placeholderTextColor={Verandah.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Venue</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Clubhouse lawn"
            placeholderTextColor={Verandah.textMuted}
            value={venue}
            onChangeText={setVenue}
            maxLength={120}
          />
        </View>

        <View style={styles.row}>
          <View style={styles.flex1}>
            <Text style={styles.label}>Event date *</Text>
            <DateField value={eventDate} onChange={setEventDate} minimumDate={new Date()} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Start time (optional)</Text>
          <TimeChipRow value={startTime} onChange={setStartTime} />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>End time (optional)</Text>
          <TimeChipRow value={endTime} onChange={setEndTime} />
        </View>

        <View style={styles.cardSection}>
          <View style={styles.switchRow}>
            <Text style={styles.label}>Requires registration</Text>
            <Switch value={requiresRegistration} onValueChange={setRequiresRegistration} trackColor={{ true: Verandah.accent }} />
          </View>
          {requiresRegistration ? (
            <View style={{ marginTop: 8 }}>
              <Text style={styles.subLabel}>Last date to register</Text>
              <DateField value={registrationLastDate} onChange={setRegistrationLastDate} minimumDate={new Date()} maximumDate={eventDate} />
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Entry fee (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Leave blank if free"
            placeholderTextColor={Verandah.textMuted}
            value={entryFee}
            onChangeText={setEntryFee}
            keyboardType="numeric"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Registration link (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. a Google Form link"
            placeholderTextColor={Verandah.textMuted}
            value={registrationLink}
            onChangeText={setRegistrationLink}
            autoCapitalize="none"
            keyboardType="url"
          />
        </View>

        <View style={styles.cardSection}>
          <View style={styles.contactsHeader}>
            <Text style={styles.label}>Contacts * (1–3)</Text>
            {contacts.length < 3 ? (
              <TouchableOpacity style={styles.addContactBtn} onPress={handleAddContact}>
                <Plus size={14} color={Verandah.primary} aria-hidden={true} />
                <Text style={styles.addContactBtnText}>Add contact</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {contacts.map((contact, idx) => (
            <View key={contact.id} style={styles.contactBox}>
              <View style={styles.contactBoxHeader}>
                <Text style={styles.contactBoxTitle}>Contact {idx + 1}</Text>
                {contacts.length > 1 ? (
                  <TouchableOpacity onPress={() => handleRemoveContact(contact.id)} hitSlop={8}>
                    <Trash01 size={16} color={Verandah.danger} aria-hidden={true} />
                  </TouchableOpacity>
                ) : null}
              </View>
              <TextInput
                style={styles.input}
                placeholder="Name"
                placeholderTextColor={Verandah.textMuted}
                value={contact.name}
                onChangeText={(v) => handleContactChange(contact.id, 'name', v)}
                maxLength={60}
              />
              <View style={[styles.row, { marginTop: 6 }]}>
                <TextInput
                  style={[styles.input, styles.flex1]}
                  placeholder="Phone number"
                  placeholderTextColor={Verandah.textMuted}
                  value={contact.phone}
                  onChangeText={(v) => handleContactChange(contact.id, 'phone', v)}
                  keyboardType="phone-pad"
                  maxLength={15}
                />
                <TextInput
                  style={[styles.input, styles.flex1]}
                  placeholder="Role (optional)"
                  placeholderTextColor={Verandah.textMuted}
                  value={contact.role_label}
                  onChangeText={(v) => handleContactChange(contact.id, 'role_label', v)}
                  maxLength={40}
                />
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color={Verandah.primaryFg} />
          ) : (
            <Text style={styles.submitBtnText}>{isEditMode ? 'Save changes' : 'Post event'}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
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
    gap: 12,
    marginBottom: 10,
  },
  headerTitle: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 22,
    color: Verandah.textPrimary,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  section: {
    marginBottom: 14,
  },
  cardSection: {
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
    borderRadius: VerandahRadius.md,
    padding: 12,
    marginBottom: 14,
  },
  label: {
    ...VerandahType.bodyBold,
    fontSize: 12.5,
    color: Verandah.textPrimary,
    marginBottom: 6,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: Verandah.textSecondary,
    marginBottom: 4,
  },
  input: {
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
    borderRadius: VerandahRadius.search,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13.5,
    color: Verandah.textPrimary,
    fontFamily: VerandahType.sansFamily,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  flex1: {
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeChipRow: {
    flexDirection: 'row',
    gap: 6,
  },
  timeChip: {
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
    backgroundColor: Verandah.card,
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  timeChipSelected: {
    backgroundColor: Verandah.primary,
    borderColor: Verandah.primary,
  },
  timeChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: Verandah.textPrimary,
    fontFamily: VerandahType.sansFamily,
  },
  timeChipTextSelected: {
    fontWeight: '700',
    color: Verandah.primaryFg,
  },
  contactsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  addContactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: Verandah.accentSoft,
  },
  addContactBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: Verandah.primary,
    fontFamily: VerandahType.sansFamily,
  },
  contactBox: {
    backgroundColor: Verandah.cardMuted,
    borderRadius: VerandahRadius.md,
    padding: 10,
    marginBottom: 8,
    gap: 6,
  },
  contactBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  contactBoxTitle: {
    fontSize: 11.5,
    fontWeight: '600',
    color: Verandah.textSecondary,
    fontFamily: VerandahType.sansFamily,
  },
  submitBtn: {
    backgroundColor: Verandah.primary,
    borderRadius: VerandahRadius.button,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 15,
    fontWeight: '700',
    color: Verandah.primaryFg,
  },
});
