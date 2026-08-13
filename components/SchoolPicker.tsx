import { Check } from '@untitledui/icons/Check';
import { ChevronDown } from '@untitledui/icons/ChevronDown';
import { SearchLg } from '@untitledui/icons/SearchLg';
import { XClose } from '@untitledui/icons/XClose';
import React, { useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';
import { WestHyderabadSchool, WEST_HYDERABAD_SCHOOLS } from '../data/westHyderabadSchools';

interface SchoolPickerProps {
  /** Catalog id of the selected school, or null if none/"Other" was picked. */
  value: string | null;
  /** Current display name — the catalog school's name, or the free-text "Other" value. */
  displayName: string;
  /** Restrict the list to these levels, e.g. ['pre_school'] for the Pre-School institution type. */
  levelFilter?: WestHyderabadSchool['level'][];
  onSelect: (school: WestHyderabadSchool) => void;
  onSelectOther: () => void;
  disabled?: boolean;
}

export function SchoolPicker({ value, displayName, levelFilter, onSelect, onSelectOther, disabled }: SchoolPickerProps) {
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState('');

  const eligibleSchools = useMemo(() => {
    if (!levelFilter || levelFilter.length === 0) return WEST_HYDERABAD_SCHOOLS;
    return WEST_HYDERABAD_SCHOOLS.filter((s) => levelFilter.includes(s.level));
  }, [levelFilter]);

  const filteredSchools = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return eligibleSchools;
    return eligibleSchools.filter(
      (s) => s.name.toLowerCase().includes(q) || s.area_locality.toLowerCase().includes(q)
    );
  }, [eligibleSchools, search]);

  const groupedByLocality = useMemo(() => {
    const groups = new Map<string, WestHyderabadSchool[]>();
    filteredSchools.forEach((s) => {
      const key = s.area_locality || 'Other areas';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredSchools]);

  const close = () => {
    setVisible(false);
    setSearch('');
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.trigger, disabled && styles.triggerDisabled]}
        onPress={() => !disabled && setVisible(true)}
        activeOpacity={0.8}
        disabled={disabled}
      >
        <Text style={[styles.triggerText, !displayName && styles.triggerPlaceholder]} numberOfLines={1}>
          {displayName || 'Select a school'}
        </Text>
        <ChevronDown size={16} color={Verandah.textTertiary} aria-hidden={true} />
      </TouchableOpacity>

      <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select school</Text>
              <TouchableOpacity onPress={close} hitSlop={10}>
                <XClose size={20} color={Verandah.textSecondary} aria-hidden={true} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchWrap}>
              <SearchLg size={16} color={Verandah.textTertiary} aria-hidden={true} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search by school name or area..."
                placeholderTextColor={Verandah.textTertiary}
                autoFocus
              />
            </View>

            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {groupedByLocality.length === 0 ? (
                <Text style={styles.noMatch}>No schools match your search.</Text>
              ) : (
                groupedByLocality.map(([locality, schools]) => (
                  <View key={locality} style={styles.localityGroup}>
                    <Text style={styles.localityTitle}>{locality}</Text>
                    {schools.map((school) => {
                      const isSelected = value === school.id;
                      return (
                        <TouchableOpacity
                          key={school.id}
                          style={styles.schoolRow}
                          onPress={() => {
                            onSelect(school);
                            close();
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.schoolName}>{school.name}</Text>
                            <Text style={styles.schoolMeta}>{school.syllabus}</Text>
                          </View>
                          {isSelected && <Check size={16} color={Verandah.accent} aria-hidden={true} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))
              )}

              <TouchableOpacity
                style={styles.otherRow}
                onPress={() => {
                  onSelectOther();
                  close();
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.otherRowText}>
                  Other — my school isn't listed
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    height: 40,
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
    borderColor: Verandah.border,
    backgroundColor: Verandah.card,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  triggerDisabled: {
    opacity: 0.6,
  },
  triggerText: {
    ...VerandahType.body,
    fontSize: 13,
    color: Verandah.textPrimary,
    flex: 1,
  },
  triggerPlaceholder: {
    color: Verandah.textTertiary,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Verandah.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
    maxHeight: '80%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: {
    ...VerandahType.title,
    fontSize: 17,
    color: Verandah.textPrimary,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
    borderColor: Verandah.border,
    backgroundColor: Verandah.surface,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: Verandah.textPrimary,
  },
  list: {
    marginTop: 4,
  },
  noMatch: {
    ...VerandahType.body,
    fontSize: 13,
    color: Verandah.textSecondary,
    textAlign: 'center',
    paddingVertical: 24,
  },
  localityGroup: {
    marginBottom: VerandahSpace.sm,
  },
  localityTitle: {
    ...VerandahType.sectionLabel,
    marginBottom: 4,
  },
  schoolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: Verandah.borderHair,
  },
  schoolName: {
    ...VerandahType.bodyBold,
    fontSize: 13,
    color: Verandah.textPrimary,
  },
  schoolMeta: {
    ...VerandahType.caption,
    fontSize: 11,
    color: Verandah.textTertiary,
    marginTop: 1,
  },
  otherRow: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: VerandahRadius.md,
    backgroundColor: Verandah.cardMuted,
  },
  otherRowText: {
    ...VerandahType.bodyBold,
    fontSize: 13,
    color: Verandah.accent,
  },
});
