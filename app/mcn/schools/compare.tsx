import { CheckCircle } from '@untitledui/icons/CheckCircle';
import { XCircle } from '@untitledui/icons/XCircle';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { goBackSmart } from '../../../lib/navigation';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Verandah } from '../../../constants/Colors';
import { FACILITY_OPTIONS } from '../../../constants/schoolCatalog';
import { VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../../../constants/Verandah';
import { buildMcnHeaderOptions } from '../../../lib/mcnHeader';
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
  area_locality?: string;
  google_rating?: string;
  google_maps_link?: string;
}

const LEVEL_MAP = {
  pre_school: 'Pre-school',
  primary: 'Primary (1-5)',
  high_school: 'High (1-10/12)',
  all_in_one: 'All-in-one (K-12)',
};

// Shared with the add-school form so a facility a resident ticks always has a
// row to show it in. See constants/schoolCatalog.ts.
const COMPARE_FACILITIES = FACILITY_OPTIONS;

export default function CompareSchoolsScreen() {
  const { ids: idsParam } = useLocalSearchParams<{ ids: string }>();
  const router = useRouter();
  const colors = Verandah;

  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSchools = useCallback(async () => {
    if (!idsParam) {
      // Nothing to compare — but returning before setLoading(false) left a bare
      // /mcn/schools/compare URL spinning forever instead of saying so.
      setLoading(false);
      return;
    }
    const ids = idsParam.split(',').map((id) => id.trim()).filter(Boolean);
    try {
      const staticMatches = WEST_HYDERABAD_SCHOOLS.filter((s) => ids.includes(s.id));
      const dbIds = ids.filter((id) => !id.startsWith('wh_school_'));

      let dbMatches: School[] = [];
      if (dbIds.length > 0) {
        const { data, error } = await supabase
          .from('schools')
          .select('*')
          .in('id', dbIds);

        if (error) throw error;
        dbMatches = (data || []) as School[];
      }

      // Order the columns the way the resident ticked them rather than catalog
      // first, community-added second — otherwise the two schools they were
      // actually weighing up can end up at opposite ends of the table.
      const byId = new Map<string, School>();
      (staticMatches as unknown as School[]).forEach((s) => byId.set(s.id, s));
      dbMatches.forEach((s) => byId.set(s.id, s));
      setSchools(ids.map((id) => byId.get(id)).filter((s): s is School => !!s));
    } catch (error) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Failed to fetch comparison data' });
    } finally {
      setLoading(false);
    }
  }, [idsParam]);

  useEffect(() => {
    fetchSchools();
  }, [fetchSchools]);

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (schools.length === 0) {
    return (
      <View style={styles.loaderWrap}>
        {/* Header included so a resident who lands here by URL still has a way
            back to the catalog. */}
        <Stack.Screen
          options={buildMcnHeaderOptions({
            title: 'Compare schools',
            onBack: () => goBackSmart(router, '/mcn/schools/compare'),
          })}
        />
        <Text style={{ color: colors.textSecondary }}>No schools selected for comparison.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.paper }]}>
      <Stack.Screen
        options={buildMcnHeaderOptions({
          title: 'Compare schools',
          onBack: () => goBackSmart(router, '/mcn/schools/compare'),
        })}
      />

      <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }} showsHorizontalScrollIndicator={false}>
        <ScrollView style={styles.verticalScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.grid}>
            {/* Header Row: School Names */}
            <View style={[styles.row, styles.headerRow, { borderBottomColor: colors.borderHair }]}>
              <View style={[styles.labelCell, { backgroundColor: colors.card }]} />
              {schools.map((school) => (
                <View key={school.id} style={[styles.valueCell, styles.headerCell, { backgroundColor: colors.card }]}>
                  <Text style={[styles.schoolNameText, { color: colors.textPrimary }]} numberOfLines={2}>
                    {school.name}
                  </Text>
                  <Text style={[styles.schoolSubText, { color: colors.textSecondary }]}>
                    {LEVEL_MAP[school.level]}
                  </Text>
                </View>
              ))}
            </View>

            {/* Syllabus Row */}
            <View style={[styles.row, { borderBottomColor: colors.borderHair }]}>
              <View style={styles.labelCell}>
                <Text style={[styles.labelText, { color: colors.textSecondary }]}>Syllabus</Text>
              </View>
              {schools.map((school) => (
                <View key={school.id} style={styles.valueCell}>
                  <Text style={[styles.valueText, { color: colors.textPrimary }]}>{school.syllabus}</Text>
                </View>
              ))}
            </View>

            {/* Fee Range Row */}
            <View style={[styles.row, { borderBottomColor: colors.borderHair }]}>
              <View style={styles.labelCell}>
                <Text style={[styles.labelText, { color: colors.textSecondary }]}>Annual Fees</Text>
              </View>
              {schools.map((school) => (
                <View key={school.id} style={styles.valueCell}>
                  <Text style={[styles.valueText, { color: colors.textPrimary }]}>{school.fee_range}</Text>
                </View>
              ))}
            </View>

            {/* Facilities Section Header */}
            <View style={[styles.row, styles.sectionHeaderRow, { backgroundColor: colors.cardMuted, borderBottomColor: colors.borderHair }]}>
              <View style={styles.labelCell}>
                <Text style={[styles.sectionTitleText, { color: colors.textPrimary }]}>FACILITIES</Text>
              </View>
              {schools.map((school) => (
                <View key={school.id} style={styles.valueCell} />
              ))}
            </View>

            {/* Facilities comparison rows */}
            {COMPARE_FACILITIES.map((facility) => (
              <View key={facility} style={[styles.row, { borderBottomColor: colors.borderHair }]}>
                <View style={styles.labelCell}>
                  <Text style={[styles.labelText, { color: colors.textSecondary }]} numberOfLines={1}>
                    {facility.replace(/\s*\/.*$/, '')} {/* Shorten name for space */}
                  </Text>
                </View>
                {schools.map((school) => {
                  const hasFacility = school.facilities.some(f =>
                    f.toLowerCase().includes(facility.toLowerCase().split(' ')[0])
                  );
                  return (
                    <View key={school.id} style={styles.valueCell}>
                      {hasFacility ? (
                        <CheckCircle size={20} color={Verandah.secondary} aria-hidden={true} />
                      ) : (
                        <XCircle size={20} color={colors.textDisabled} aria-hidden={true} />
                      )}
                    </View>
                  );
                })}
              </View>
            ))}

            {/* Description / Summary Row */}
            <View style={[styles.row, { borderBottomColor: colors.borderHair }]}>
              <View style={styles.labelCell}>
                <Text style={[styles.labelText, { color: colors.textSecondary }]}>About Summary</Text>
              </View>
              {schools.map((school) => (
                <View key={school.id} style={styles.valueCell}>
                  <Text style={[styles.valueText, styles.summaryText, { color: colors.textSecondary }]} numberOfLines={3}>
                    {school.description || 'No summary shared'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
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
  verticalScroll: {
    flex: 1,
  },
  grid: {
    flexDirection: 'column',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    minHeight: 48,
  },
  headerRow: {
    minHeight: 80,
  },
  sectionHeaderRow: {
    minHeight: 36,
  },
  labelCell: {
    width: 120,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  valueCell: {
    width: 130,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCell: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  labelText: {
    fontSize: 12,
    fontWeight: '600',
  },
  schoolNameText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  schoolSubText: {
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
  },
  valueText: {
    fontSize: 13,
    fontWeight: '400',
    textAlign: 'center',
  },
  highlightText: {
    fontWeight: '600',
  },
  sectionTitleText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  summaryText: {
    fontSize: 11,
    lineHeight: 15,
  },
});
