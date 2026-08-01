import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { SchoolAspectIcon } from '../../../components/SchoolAspectIcon';
import { AspectScores, SchoolRadarChart } from '../../../components/SchoolRadarChart';
import { SchoolReviewCard, SchoolReviewItem } from '../../../components/SchoolReviewCard';
import { ScoreSentimentIcon } from '../../../components/ScoreSentimentIcon';
import { Verandah } from '../../../constants/Colors';
import { VerandahRadius, VerandahType } from '../../../constants/Verandah';
import { SCHOOL_ASPECTS } from '../../../constants/schoolReviewAspects';
import { useAuth } from '../../../context/AuthContext';
import { WEST_HYDERABAD_SCHOOLS } from '../../../data/westHyderabadSchools';
import { buildMcnHeaderOptions } from '../../../lib/mcnHeader';
import { supabase } from '../../../lib/supabase';

interface School extends AspectScores {
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
  review_count?: number;
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
  const [reviews, setReviews] = useState<SchoolReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllReviews, setShowAllReviews] = useState(false);

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
      let currentSchool: School | null = null;

      if (schoolId.startsWith('wh_school_')) {
        const found = WEST_HYDERABAD_SCHOOLS.find((s) => s.id === schoolId);
        if (found) {
          currentSchool = found as unknown as School;
        }
      }

      if (!currentSchool) {
        const { data, error } = await supabase
          .from('schools')
          .select('*')
          .eq('id', schoolId)
          .maybeSingle();

        if (error) throw error;
        currentSchool = data as School;
      }

      setSchool(currentSchool);

      // Load school reviews with profile details
      const { data: reviewsData, error: reviewsErr } = await supabase
        .from('school_reviews')
        .select('*, profiles(full_name, flat_number)')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false });

      if (reviewsErr) {
        console.error('Error fetching reviews:', reviewsErr);
      } else if (reviewsData) {
        const fetchedReviews = reviewsData as SchoolReviewItem[];
        setReviews(fetchedReviews);

        // If static school, calculate average aspect scores dynamically from reviews
        if (schoolId.startsWith('wh_school_') && currentSchool && fetchedReviews.length > 0) {
          let acad = 0, teach = 0, infra = 0, sports = 0, safe = 0, trans = 0, val = 0, hap = 0;
          fetchedReviews.forEach((r) => {
            acad += r.academics_score;
            teach += r.teachers_score;
            infra += r.infrastructure_score;
            sports += r.sports_activities_score;
            safe += r.safety_score;
            trans += r.transport_score;
            val += r.value_score;
            hap += r.happiness_score;
          });
          const n = fetchedReviews.length;
          setSchool({
            ...currentSchool,
            review_count: n,
            avg_academics: parseFloat((acad / n).toFixed(1)),
            avg_teachers: parseFloat((teach / n).toFixed(1)),
            avg_infrastructure: parseFloat((infra / n).toFixed(1)),
            avg_sports_activities: parseFloat((sports / n).toFixed(1)),
            avg_safety: parseFloat((safe / n).toFixed(1)),
            avg_transport: parseFloat((trans / n).toFixed(1)),
            avg_value: parseFloat((val / n).toFixed(1)),
            avg_happiness: parseFloat((hap / n).toFixed(1)),
          });
        }
      }
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
  const ownReview = reviews.find((r) => r.user_id === user?.id);
  const displayedReviews = showAllReviews ? reviews : reviews.slice(0, 3);

  // Overall average across the 7 aspects
  const aspectScores: AspectScores = {
    avg_academics: school.avg_academics || 0,
    avg_teachers: school.avg_teachers || 0,
    avg_infrastructure: school.avg_infrastructure || 0,
    avg_sports_activities: school.avg_sports_activities || 0,
    avg_safety: school.avg_safety || 0,
    avg_transport: school.avg_transport || 0,
    avg_value: school.avg_value || 0,
    avg_happiness: school.avg_happiness || 0,
  };

  const totalAspectAvg =
    (aspectScores.avg_academics +
      aspectScores.avg_teachers +
      aspectScores.avg_infrastructure +
      aspectScores.avg_sports_activities +
      aspectScores.avg_safety +
      aspectScores.avg_transport +
      aspectScores.avg_value +
      aspectScores.avg_happiness) / SCHOOL_ASPECTS.length;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Stack.Screen
        options={buildMcnHeaderOptions({
          title: 'School details',
          onBack: handleGoBack,
          headerRight: () => canDelete ? (
            <TouchableOpacity onPress={handleDelete} style={styles.headerDeleteBtn}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </TouchableOpacity>
          ) : null,
        })}
      />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.schoolName, { color: colors.textPrimary }]}>{school.name}</Text>
        <Text style={[styles.schoolMeta, { color: colors.textSecondary }]}>
          {LEVEL_MAP[school.level]} · {school.syllabus}
        </Text>

        {/* Quick info row */}
        <View style={[styles.quickInfoCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={styles.infoCol}>
            <Ionicons name="location-outline" size={18} color={colors.accent} />
            <Text style={[styles.infoVal, { color: colors.textPrimary }]} numberOfLines={1}>{school.area_locality || 'Nearby'}</Text>
            <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>Locality</Text>
          </View>
          <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />
          <View style={styles.infoCol}>
            <Ionicons name="cash-outline" size={18} color={colors.accent} />
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
                  <Ionicons name="call" size={16} color={colors.accent} />
                  <Text style={[styles.contactCardVal, { color: colors.textSecondary }]}>{school.contact_phone}</Text>
                  <Text style={[styles.contactCardLabel, { color: colors.textTertiary }]}>Call School</Text>
                </TouchableOpacity>
              ) : null}

              {school.website ? (
                <TouchableOpacity
                  onPress={handleWebsite}
                  style={[styles.contactCard, { borderColor: colors.border, backgroundColor: colors.card }]}
                >
                  <Ionicons name="globe" size={16} color={colors.accent} />
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
                  <Ionicons name="navigate" size={16} color={colors.accent} />
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

        {/* --- PARENT REPORT CARD SECTION --- */}
        <View style={styles.section}>
          <View style={styles.reportHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Parent Report Card
            </Text>
            {school.review_count ? (
              <Text style={styles.reviewCountBadge}>
                {school.review_count} {school.review_count === 1 ? 'review' : 'reviews'}
              </Text>
            ) : null}
          </View>

          {/* Spider/Radar Chart (when reviews >= 1) */}
          {reviews.length > 0 ? (
            <View style={styles.chartBox}>
              <Text style={styles.chartSubtitle}>Community Score Breakdown ({SCHOOL_ASPECTS.length} Dimensions)</Text>
              <SchoolRadarChart scores={aspectScores} size={250} />

              {/* Aspect Breakdown List */}
              <View style={styles.aspectListWrap}>
                {SCHOOL_ASPECTS.map((aspect) => {
                  const key = `avg_${aspect.key}` as keyof AspectScores;
                  const val = aspectScores[key] || 0;
                  return (
                    <View key={aspect.key} style={styles.aspectListRow}>
                      <View style={styles.aspectListLabelWrap}>
                        <SchoolAspectIcon aspectKey={aspect.key} size={14} />
                        <Text style={styles.aspectListLabel}>{aspect.label}</Text>
                      </View>
                      <View style={styles.aspectListValWrap}>
                        <ScoreSentimentIcon score={val} size={14} />
                        <Text style={styles.aspectListScore}>{val > 0 ? val.toFixed(1) : '-'}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={styles.noReviewsBox}>
              <Text style={styles.noReviewsTitle}>No parent report cards yet</Text>
              <Text style={styles.noReviewsText}>
                Be the first parent from your society to grade this school across {SCHOOL_ASPECTS.length} key dimensions!
              </Text>

              <View style={styles.whyGradeBox}>
                <Text style={styles.whyGradeHeader}>How Your Report Card Helps Neighbor Families:</Text>

                <View style={styles.whyGradeBulletRow}>
                  <Text style={styles.whyGradeBullet}>•</Text>
                  <Text style={styles.whyGradeBulletText}>
                    <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Real Parent Feedback:</Text> Gives neighboring families authentic 360° ratings on academics, teacher quality, & safety beyond school marketing.
                  </Text>
                </View>

                <View style={styles.whyGradeBulletRow}>
                  <Text style={styles.whyGradeBullet}>•</Text>
                  <Text style={styles.whyGradeBulletText}>
                    <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Transport & Logistics:</Text> Shares real experiences about school bus safety, route timings, & commute from your society.
                  </Text>
                </View>

                <View style={styles.whyGradeBulletRow}>
                  <Text style={styles.whyGradeBullet}>•</Text>
                  <Text style={styles.whyGradeBulletText}>
                    <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Confident Admission Choice:</Text> Empowers parents to pick the best school for their child backed by verified neighborhood ratings.
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Write / Edit Review CTA */}
          <TouchableOpacity
            style={styles.reviewCtaBtn}
            onPress={() => router.push(`/network/schools/review?schoolId=${school.id}` as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="clipboard-outline" size={18} color="#FFFFFF" />
            <Text style={styles.reviewCtaText}>
              {ownReview ? 'Edit Your Parent Report Card' : 'Grade This School (Parent Report Card)'}
            </Text>
          </TouchableOpacity>

          {/* Parent Reviews List */}
          {reviews.length > 0 ? (
            <View style={{ marginTop: 24 }}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 12 }]}>
                Community Parent Reviews ({reviews.length})
              </Text>
              {displayedReviews.map((item) => (
                <SchoolReviewCard
                  key={item.id}
                  review={item}
                  isOwnReview={item.user_id === user?.id}
                  onEdit={() => router.push(`/network/schools/review?schoolId=${school.id}` as any)}
                />
              ))}

              {reviews.length > 3 ? (
                <TouchableOpacity
                  style={styles.toggleReviewsBtn}
                  onPress={() => setShowAllReviews(!showAllReviews)}
                >
                  <Text style={styles.toggleReviewsText}>
                    {showAllReviews ? 'Show fewer reviews' : `View all ${reviews.length} parent reviews`}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
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
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 36,
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
    marginBottom: 4,
  },
  schoolMeta: {
    ...VerandahType.body,
    marginBottom: 14,
  },
  quickInfoCard: {
    flexDirection: 'row',
    borderWidth: 0.5,
    borderRadius: VerandahRadius.lg,
    paddingVertical: 8,
    marginBottom: 16,
  },
  infoCol: {
    flex: 1,
    alignItems: 'center',
  },
  infoVal: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 2,
  },
  infoLabel: {
    ...VerandahType.micro,
    marginTop: 0,
  },
  infoDivider: {
    width: 0.5,
    height: '100%',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    ...VerandahType.title,
    fontSize: 16,
    marginBottom: 8,
  },
  descriptionText: {
    ...VerandahType.body,
    lineHeight: 20,
  },
  contactRow: {
    flexDirection: 'row',
    gap: 10,
  },
  contactCard: {
    flex: 1,
    borderWidth: 0.5,
    borderRadius: VerandahRadius.lg,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  contactCardVal: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 6,
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
    gap: 8,
  },
  facilityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: '48%',
    marginBottom: 2,
  },
  facilityText: {
    fontSize: 13,
    fontWeight: '400',
  },
  emptyFacilitiesText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  reportHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  reviewCountBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: Verandah.accent,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  chartBox: {
    backgroundColor: Verandah.card,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.lg,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  chartSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: Verandah.textSecondary,
    marginBottom: 8,
  },
  aspectListWrap: {
    width: '100%',
    marginTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: Verandah.border,
    paddingTop: 10,
    gap: 6,
  },
  aspectListRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  aspectListLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aspectListLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: Verandah.textSecondary,
  },
  aspectListValWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  aspectListScore: {
    fontSize: 12,
    fontWeight: '700',
    color: Verandah.textPrimary,
  },
  noReviewsBox: {
    backgroundColor: '#F9FAFB',
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.lg,
    padding: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  noReviewsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Verandah.textPrimary,
    marginBottom: 4,
  },
  noReviewsText: {
    fontSize: 12,
    color: Verandah.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 10,
  },
  whyGradeBox: {
    width: '100%',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: VerandahRadius.md,
    padding: 12,
    gap: 8,
  },
  whyGradeHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E40AF',
    marginBottom: 2,
  },
  whyGradeBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  whyGradeBullet: {
    fontSize: 14,
    marginTop: 1,
  },
  whyGradeBulletText: {
    flex: 1,
    fontSize: 11.5,
    color: '#1E3A8A',
    lineHeight: 16,
  },
  reviewCtaBtn: {
    flexDirection: 'row',
    backgroundColor: Verandah.accent,
    paddingVertical: 10,
    borderRadius: VerandahRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  reviewCtaText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  toggleReviewsBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  toggleReviewsText: {
    fontSize: 13,
    fontWeight: '600',
    color: Verandah.accent,
  },
});
