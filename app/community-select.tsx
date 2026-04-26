import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Colors } from '../constants/Colors';
import { APP_EMOJIS } from '../constants/emojis';
import { useAuth } from '../context/AuthContext';
import { Database } from '../lib/database.types';
import { supabase } from '../lib/supabase';
import { getMissingOnboardingSchemaMessage, isMissingOnboardingSchemaError } from '../lib/supabaseErrors';

type CommunitySearchResult = Database['public']['Functions']['get_all_communities']['Returns'][number];

const COUNTRY_CODES = [
  { label: 'India', value: '+91' },
  { label: 'United States', value: '+1' },
  { label: 'United Kingdom', value: '+44' },
];

const COMMUNITY_TYPE_COLORS: Record<string, string> = {
  apartment: '#16A34A',
  'gated villas': '#10B981',
  'housing society': '#FF6B6B',
  township: '#F59E0B',
};

export default function CommunitySelectScreen() {
  const router = useRouter();
  const { profile, session, refreshSession } = useAuth();
  const colors = Colors.light;

  const [step, setStep] = useState<1 | 2>(1);
  const [search, setSearch] = useState('');
  const [communities, setCommunities] = useState<CommunitySearchResult[]>([]);
  const [selectedCommunity, setSelectedCommunity] = useState<CommunitySearchResult | null>(null);
  const [flatNumber, setFlatNumber] = useState(profile?.flat_number ?? '');
  const [phoneNumber, setPhoneNumber] = useState(profile?.phone_number?.replace(/^\+\d+\s*/, '') ?? '');
  const [countryCode, setCountryCode] = useState('+91');
  const [joinNote, setJoinNote] = useState(profile?.join_note ?? '');
  const [loadingCommunities, setLoadingCommunities] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showCountryOptions, setShowCountryOptions] = useState(false);

  const fullName = profile?.full_name || session?.user.user_metadata?.full_name || 'Resident';
  const email = session?.user.email || '';

  const fetchCommunities = useCallback(async (searchTerm?: string) => {
    setLoadingCommunities(true);
    try {
      const { data, error } = await supabase.rpc('get_all_communities', {
        p_search: searchTerm?.trim() || null,
      });

      if (error) {
        if (isMissingOnboardingSchemaError(error)) {
          Toast.show({
            type: 'error',
            text1: 'Onboarding unavailable',
            text2: getMissingOnboardingSchemaMessage(),
          });
          return;
        }
        throw error;
      }

      setCommunities(data ?? []);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to load communities', text2: error.message });
    } finally {
      setLoadingCommunities(false);
    }
  }, []);

  // Load all communities on mount
  useEffect(() => {
    fetchCommunities();
  }, [fetchCommunities]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCommunities(search);
    }, 400);
    return () => clearTimeout(timer);
  }, [search, fetchCommunities]);

  const submitJoinRequest = async () => {
    if (!selectedCommunity) {
      Toast.show({ type: 'error', text1: 'Select a community', text2: 'Choose a community before continuing.' });
      return;
    }

    if (!flatNumber.trim()) {
      Toast.show({ type: 'error', text1: 'Missing flat number', text2: 'Enter your flat or house number.' });
      return;
    }

    if (!phoneNumber.trim()) {
      Toast.show({ type: 'error', text1: 'Missing phone number', text2: 'Enter a phone number for approval follow-up.' });
      return;
    }

    setSubmitting(true);
    try {
      const nextPhoneNumber = `${countryCode} ${phoneNumber.trim()}`;
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          community_id: selectedCommunity.id,
          flat_number: flatNumber.trim(),
          phone_number: nextPhoneNumber,
          join_note: joinNote.trim() ? joinNote.trim() : null,
          approval_status: 'pending',
          requested_at: new Date().toISOString(),
        })
        .eq('id', session?.user.id as string);

      if (profileError) {
        if (isMissingOnboardingSchemaError(profileError)) {
          Toast.show({
            type: 'error',
            text1: 'Onboarding unavailable',
            text2: getMissingOnboardingSchemaMessage(),
          });
          return;
        }

        throw profileError;
      }

      const { error: authError } = await supabase.auth.updateUser({
        data: { community_id: selectedCommunity.id },
      });

      if (authError) {
        throw authError;
      }

      await refreshSession();
      Toast.show({
        type: 'success',
        text1: 'Request submitted',
        text2: `We sent your join request to ${selectedCommunity.name}.`,
      });
      router.replace('/pending');
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Request failed', text2: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  const renderCommunityCard = (community: CommunitySearchResult) => {
    const isSelected = selectedCommunity?.id === community.id;
    const normalizedType = (community.community_type || 'apartment').toLowerCase();
    const avatarColor = COMMUNITY_TYPE_COLORS[normalizedType] || colors.primary;
    const initials = community.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'CO';

    return (
      <Pressable
        key={community.id}
        onPress={() => setSelectedCommunity(community)}
        style={[
          styles.communityCard,
          {
            backgroundColor: colors.glass,
            borderColor: isSelected ? colors.primary : colors.glassBorder,
          },
        ]}
      >
        <View style={[styles.communityAvatar, { backgroundColor: `${avatarColor}18` }]}>
          <Text style={[styles.communityAvatarText, { color: avatarColor }]}>{initials}</Text>
        </View>
        <View style={styles.communityBody}>
          <Text style={[styles.communityName, { color: colors.text }]}>{community.name}</Text>
          <Text style={[styles.communityMeta, { color: colors.textMuted }]}>{community.resident_count} {community.resident_count === 1 ? 'member' : 'members'}</Text>
          <Text style={[styles.communityArea, { color: colors.textMuted }]}>{[community.area || community.city, community.pincode].filter(Boolean).join(' · ') || 'Location not listed'}</Text>
        </View>
        {isSelected ? <Text style={styles.selectedIcon}>{APP_EMOJIS.success}</Text> : null}
      </Pressable>
    );
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={[`${colors.gradientStart}14`, `${colors.gradientEnd}10`, 'transparent']} style={styles.gradientOverlay} />

      <Text style={[styles.title, { color: colors.text }]}>Find your community</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>Requests are reviewed before access is granted.</Text>

      <View style={[styles.stepPillRow, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
        <View style={[styles.stepPill, step === 1 ? { backgroundColor: colors.primary } : null]}>
          <Text style={[styles.stepPillText, { color: step === 1 ? '#FFF' : colors.textMuted }]}>1. Find</Text>
        </View>
        <View style={[styles.stepPill, step === 2 ? { backgroundColor: colors.primary } : null]}>
          <Text style={[styles.stepPillText, { color: step === 2 ? '#FFF' : colors.textMuted }]}>2. Details</Text>
        </View>
      </View>

      {step === 1 ? (
        <View style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Join a community</Text>
          <Text style={[styles.sectionCopy, { color: colors.textMuted }]}>Search by name, city, area or pincode. Select your community to continue.</Text>

          <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={styles.searchIcon}>{APP_EMOJIS.search}</Text>
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search communities..."
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
            />
            {search.length > 0 ? (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.clearIcon}>{APP_EMOJIS.close}</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {loadingCommunities ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : communities.length > 0 ? (
            <View style={styles.communityList}>{communities.map(renderCommunityCard)}</View>
          ) : (
            <Text style={[styles.emptyHint, { color: colors.textMuted }]}>
              {search.trim() ? 'No communities match your search.' : 'No communities available yet.'}
            </Text>
          )}

          <TouchableOpacity
            onPress={() => router.push('/community-request')}
            style={[styles.requestRow, { borderColor: colors.primary, backgroundColor: `${colors.primary}08` }]}
            activeOpacity={0.85}
          >
            <Text style={styles.requestIcon}>{APP_EMOJIS.add}</Text>
            <Text style={[styles.requestRowText, { color: colors.primary }]}>Can't find your community? Request a new one</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setStep(2)} disabled={!selectedCommunity} activeOpacity={0.8} style={!selectedCommunity ? styles.disabledButtonWrap : undefined}>
            <LinearGradient colors={selectedCommunity ? [colors.gradientStart, colors.gradientEnd] : [colors.border, colors.border]} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Continue</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <TouchableOpacity onPress={() => setStep(1)} style={styles.backLink} activeOpacity={0.7}>
            <Text style={styles.backIcon}>{APP_EMOJIS.back}</Text>
            <Text style={[styles.backLinkText, { color: colors.primary }]}>Back to community list</Text>
          </TouchableOpacity>

          <Text style={[styles.sectionTitle, { color: colors.text }]}>Step 2 — Your details</Text>
          <View style={[styles.communityPill, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}30` }]}>
            <Text style={styles.communityPillIcon}>{APP_EMOJIS.community}</Text>
            <Text style={[styles.communityPillText, { color: colors.primary }]}>{selectedCommunity?.name}</Text>
          </View>

          <Text style={[styles.label, { color: colors.text }]}>FULL NAME</Text>
          <View style={[styles.readOnlyInput, { borderColor: colors.border, backgroundColor: colors.surface2 }]}>
            <Text style={[styles.readOnlyText, { color: colors.text }]}>{fullName}</Text>
          </View>

          <Text style={[styles.label, { color: colors.text }]}>EMAIL</Text>
          <View style={[styles.readOnlyInput, { borderColor: colors.border, backgroundColor: colors.surface2 }]}>
            <Text style={[styles.readOnlyText, { color: colors.text }]}>{email}</Text>
          </View>

          <Text style={[styles.label, { color: colors.text }]}>FLAT / HOUSE NUMBER</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
            placeholder="A-402"
            placeholderTextColor={colors.textMuted}
            value={flatNumber}
            onChangeText={setFlatNumber}
          />

          <Text style={[styles.label, { color: colors.text }]}>PHONE NUMBER</Text>
          <View style={styles.phoneRow}>
            <View style={styles.countryWrap}>
              <TouchableOpacity activeOpacity={0.75} onPress={() => setShowCountryOptions((prev) => !prev)} style={[styles.countrySelect, { borderColor: colors.border, backgroundColor: colors.surface2 }]}>
                <Text style={[styles.countryValue, { color: colors.text }]}>{countryCode}</Text>
                <Text style={styles.countryChevron}>{showCountryOptions ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {showCountryOptions ? (
                <View style={[styles.countryDropdown, { backgroundColor: colors.surface, borderColor: colors.glassBorder }]}>
                  {COUNTRY_CODES.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      onPress={() => {
                        setCountryCode(option.value);
                        setShowCountryOptions(false);
                      }}
                      style={styles.countryOption}
                    >
                      <Text style={[styles.countryOptionText, { color: colors.text }]}>{option.label}</Text>
                      <Text style={[styles.countryOptionCode, { color: colors.textMuted }]}>{option.value}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>

            <TextInput
              style={[styles.phoneInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
              placeholder="9876543210"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
            />
          </View>

          <View style={styles.noteHeader}>
            <Text style={[styles.label, { color: colors.text }]}>JOIN NOTE</Text>
            <Text style={[styles.noteCount, { color: colors.textMuted }]}>{joinNote.length}/280</Text>
          </View>
          <TextInput
            style={[styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
            placeholder="Anything the admin should know before approving?"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={280}
            value={joinNote}
            onChangeText={setJoinNote}
            textAlignVertical="top"
          />

          <TouchableOpacity onPress={submitJoinRequest} disabled={submitting} activeOpacity={0.8}>
            <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={styles.primaryButton}>
              {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryButtonText}>Submit for Approval</Text>}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 72,
    paddingBottom: 40,
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 280,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 24,
  },
  stepPillRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 6,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 20,
  },
  stepPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
  },
  stepPillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  sectionCopy: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 18,
    paddingHorizontal: 16,
    height: 54,
    fontSize: 16,
    marginBottom: 18,
  },
  primaryButton: {
    height: 54,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 5,
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  searchLabel: {
    marginTop: 18,
  },
  searchIcon: {
    fontSize: 18,
    lineHeight: 20,
    marginRight: 10,
  },
  clearIcon: {
    fontSize: 18,
    lineHeight: 20,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 18,
    paddingHorizontal: 16,
    height: 52,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  communityList: {
    gap: 12,
  },
  communityCard: {
    borderWidth: 1.5,
    borderRadius: 22,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  communityAvatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  communityAvatarText: {
    fontSize: 18,
    fontWeight: '800',
  },
  communityBody: {
    flex: 1,
  },
  selectedIcon: {
    fontSize: 24,
    lineHeight: 28,
  },
  communityName: {
    fontSize: 16,
    fontWeight: '700',
  },
  communityMeta: {
    fontSize: 13,
    marginTop: 4,
  },
  communityArea: {
    fontSize: 13,
    marginTop: 2,
  },
  emptyHint: {
    fontSize: 13,
    lineHeight: 19,
    marginVertical: 14,
    textAlign: 'center',
  },
  loaderWrap: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 20,
    padding: 16,
    marginTop: 18,
    marginBottom: 18,
  },
  requestRowText: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  requestIcon: {
    fontSize: 20,
    lineHeight: 22,
  },
  disabledButtonWrap: {
    opacity: 0.55,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  backIcon: {
    fontSize: 18,
    lineHeight: 20,
  },
  backLinkText: {
    fontSize: 14,
    fontWeight: '700',
  },
  communityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 18,
  },
  communityPillText: {
    fontSize: 13,
    fontWeight: '800',
  },
  communityPillIcon: {
    fontSize: 16,
    lineHeight: 18,
  },
  readOnlyInput: {
    borderWidth: 1.5,
    borderRadius: 18,
    paddingHorizontal: 16,
    justifyContent: 'center',
    minHeight: 54,
    marginBottom: 18,
  },
  readOnlyText: {
    fontSize: 15,
    fontWeight: '600',
  },
  phoneRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
    alignItems: 'flex-start',
  },
  countryWrap: {
    width: 112,
    zIndex: 10,
  },
  countrySelect: {
    height: 54,
    borderRadius: 18,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countryValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  countryChevron: {
    fontSize: 12,
    lineHeight: 14,
  },
  countryDropdown: {
    position: 'absolute',
    top: 58,
    left: 0,
    right: 0,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 6,
  },
  countryOption: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  countryOptionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  countryOptionCode: {
    fontSize: 12,
    marginTop: 2,
  },
  phoneInput: {
    flex: 1,
    height: 54,
    borderWidth: 1.5,
    borderRadius: 18,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noteCount: {
    fontSize: 12,
    fontWeight: '600',
  },
  textArea: {
    minHeight: 116,
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 18,
  },
});
