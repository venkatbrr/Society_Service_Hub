import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Verandah } from '../../../constants/Colors';
import { VerandahRadius, VerandahType } from '../../../constants/Verandah';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabase';

import { WEST_HYDERABAD_SCHOOLS } from '../../../data/westHyderabadSchools';

interface School {
  id: string;
  name: string;
  level: 'pre_school' | 'primary' | 'high_school' | 'all_in_one';
  syllabus: string;
  distance: number;
  fee_range: string;
  facilities: string[];
  description: string | null;
  contact_phone: string | null;
  website: string | null;
  created_by?: string;
  area_locality?: string;
  address?: string;
  google_rating?: string;
  google_maps_link?: string;
}

const LEVEL_MAP = {
  pre_school: 'Pre-school / Nursery',
  primary: 'Primary School (Grades 1-5)',
  high_school: 'High School (Grades 1-10/12)',
  all_in_one: 'All-in-one (K-12)',
};

export default function SchoolDetailScreen() {
  const { id: schoolId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, isCommunityLead } = useAuth();
  const colors = Verandah;

  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/network/schools' as any);
  };

  const fetchSchoolDetails = useCallback(async () => {
    if (!schoolId) return;
    try {
      if (schoolId.startsWith('wh_school_')) {
        const found = WEST_HYDERABAD_SCHOOLS.find((s) => s.id === schoolId);
        if (found) {
          setSchool(found as unknown as School);
          setLoading(false);
          return;
        }
      }

      const { data, error } = await supabase
        .from('schools')
        .select('*')
        .eq('id', schoolId)
        .maybeSingle();

      if (error) throw error;
      setSchool(data as School);
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to load school details' });
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    fetchSchoolDetails();
  }, [fetchSchoolDetails]);

  const handleCall = () => {
    if (!school?.contact_phone) return;
    Linking.openURL(`tel:${school.contact_phone}`);
  };

  const handleWebsite = () => {
    if (!school?.website) return;
    let url = school.website.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    Linking.openURL(url).catch(() => {
      Toast.show({ type: 'error', text1: 'Could not open website' });
    });
  };

  const getMapsUrl = (value: School) => {
    if (value.google_maps_link?.trim()) {
      return value.google_maps_link.trim();
    }
    if (value.address?.trim()) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value.address.trim())}`;
    }
    return null;
  };

  const handleMaps = () => {
    if (!school) return;
    const mapsUrl = getMapsUrl(school);
    if (!mapsUrl) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(mapsUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    Linking.openURL(mapsUrl).catch(() => {
      Toast.show({ type: 'error', text1: 'Could not open maps' });
    });
  };

  const handleDelete = () => {
    if (!school) return;
    Alert.alert(
      'Delete school listing',
      'Are you sure you want to remove this school listing from the community directory?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('schools')
                .delete()
                .eq('id', school.id);

              if (error) throw error;
              Toast.show({ type: 'success', text1: 'School listing deleted' });
              router.back();
            } catch (error) {
              console.error(error);
              Toast.show({ type: 'error', text1: 'Failed to delete school' });
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!school) {
    return (
      <View style={styles.loaderWrap}>
        <Text style={{ color: colors.textSecondary }}>School not found.</Text>
      </View>
    );
  }

  const isOwner = school.created_by === user?.id;
  const canDelete = isOwner || isCommunityLead;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Stack.Screen
        options={{
          title: 'School details',
          headerBackVisible: false,
          headerLeft: () => (
            <TouchableOpacity onPress={handleGoBack} style={styles.headerBackBtn} hitSlop={8}>
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          ),
          headerRight: () => canDelete ? (
            <TouchableOpacity onPress={handleDelete} style={styles.headerDeleteBtn}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </TouchableOpacity>
          ) : null,
        }}
      />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.schoolName, { color: colors.textPrimary }]}>{school.name}</Text>
        <Text style={[styles.schoolMeta, { color: colors.textSecondary }]}>
          {LEVEL_MAP[school.level]} · {school.syllabus}
        </Text>

        {/* Quick info row */}
        <View style={[styles.quickInfoCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={styles.infoCol}>
            <Ionicons name="location-outline" size={20} color={colors.accent} />
            <Text style={[styles.infoVal, { color: colors.textPrimary }]} numberOfLines={1}>{school.area_locality || 'Nearby'}</Text>
            <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Locality</Text>
          </View>
          <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />
          <View style={styles.infoCol}>
            <Ionicons name="cash-outline" size={20} color={colors.accent} />
            <Text style={[styles.infoVal, { color: colors.textPrimary }]} numberOfLines={1}>{school.fee_range}</Text>
            <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Annual Fees</Text>
          </View>
        </View>

        {/* Description */}
        {school.description ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>About the school</Text>
            <Text style={[styles.descriptionText, { color: colors.textSecondary }]}>{school.description}</Text>
          </View>
        ) : null}

        {/* Contact info */}
        {(school.contact_phone || school.website || getMapsUrl(school)) ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Contact details</Text>
            <View style={styles.contactRow}>
              {school.contact_phone ? (
                <TouchableOpacity
                  onPress={handleCall}
                  style={[styles.contactCard, { borderColor: colors.border, backgroundColor: colors.card }]}
                >
                  <Ionicons name="call" size={18} color={colors.accent} />
                  <Text style={[styles.contactCardVal, { color: colors.textSecondary }]}>{school.contact_phone}</Text>
                  <Text style={[styles.contactCardLabel, { color: colors.textTertiary }]}>Call School</Text>
                </TouchableOpacity>
              ) : null}

              {school.website ? (
                <TouchableOpacity
                  onPress={handleWebsite}
                  style={[styles.contactCard, { borderColor: colors.border, backgroundColor: colors.card }]}
                >
                  <Ionicons name="globe" size={18} color={colors.accent} />
                  <Text style={[styles.contactCardVal, { color: colors.textSecondary }]} numberOfLines={1}>
                    {school.website}
                  </Text>
                  <Text style={[styles.contactCardLabel, { color: colors.textTertiary }]}>Visit Website</Text>
                </TouchableOpacity>
              ) : null}

              {getMapsUrl(school) ? (
                <TouchableOpacity
                  onPress={handleMaps}
                  style={[styles.contactCard, { borderColor: colors.border, backgroundColor: colors.card }]}
                >
                  <Ionicons name="navigate" size={18} color={colors.accent} />
                  <Text style={[styles.contactCardVal, { color: colors.textSecondary }]} numberOfLines={1}>
                    Open location
                  </Text>
                  <Text style={[styles.contactCardLabel, { color: colors.textTertiary }]}>Google Maps</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Facilities list */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Facilities available</Text>
          {school.facilities.length === 0 ? (
            <Text style={[styles.emptyFacilitiesText, { color: colors.textMuted }]}>
              No specific facilities documented.
            </Text>
          ) : (
            <View style={styles.facilitiesList}>
              {school.facilities.map((item) => (
                <View key={item} style={styles.facilityItem}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
                  <Text style={[styles.facilityText, { color: colors.textSecondary }]}>{item}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 60,
  },
  headerDeleteBtn: {
    padding: 8,
  },
  headerBackBtn: {
    marginLeft: 2,
    padding: 6,
  },
  schoolName: {
    ...VerandahType.display,
    marginBottom: 6,
  },
  schoolMeta: {
    ...VerandahType.body,
    marginBottom: 24,
  },
  quickInfoCard: {
    flexDirection: 'row',
    borderWidth: 0.5,
    borderRadius: VerandahRadius.lg,
    paddingVertical: 12,
    marginBottom: 28,
  },
  infoCol: {
    flex: 1,
    alignItems: 'center',
  },
  infoVal: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 4,
  },
  infoLabel: {
    ...VerandahType.micro,
    marginTop: 1,
  },
  infoDivider: {
    width: 0.5,
    height: '100%',
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    ...VerandahType.title,
    fontSize: 16,
    marginBottom: 12,
  },
  descriptionText: {
    ...VerandahType.body,
    lineHeight: 22,
  },
  contactRow: {
    flexDirection: 'row',
    gap: 12,
  },
  contactCard: {
    flex: 1,
    borderWidth: 0.5,
    borderRadius: VerandahRadius.lg,
    padding: 16,
    alignItems: 'center',
  },
  contactCardVal: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'center',
  },
  contactCardLabel: {
    fontSize: 10,
    fontWeight: '400',
    marginTop: 2,
  },
  facilitiesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  facilityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: '48%',
    marginBottom: 4,
  },
  facilityText: {
    fontSize: 13,
    fontWeight: '400',
  },
  emptyFacilitiesText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
});
