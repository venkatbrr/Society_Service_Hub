import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Avatar } from '../../components/Avatar';
import { Verandah } from '../../constants/Colors';
import { VerandahRadius, VerandahSpace, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { Tables } from '../../lib/database.types';
import { MAX_TREASURERS } from '../../lib/fundRoles';
import { supabase } from '../../lib/supabase';
import { getMissingFundSchemaMessage, isMissingFundSchemaError } from '../../lib/supabaseErrors';

type CommunityMember = Pick<Tables<'profiles'>, 'id' | 'full_name' | 'app_role' | 'email' | 'flat_number'>;

export default function AddFundScreen() {
  const { user, communityId, appRole, fundsEnabled } = useAuth();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTreasurers, setSelectedTreasurers] = useState<string[]>([]);
  const [isFetchingMembers, setIsFetchingMembers] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const isAdmin = appRole === 'community_lead' || appRole === 'admin';

  useEffect(() => {
    if (!fundsEnabled) {
      Toast.show({ type: 'error', text1: 'Funds inactive', text2: 'Funds are not active in this community.' });
      router.replace('/(tabs)/community');
      return;
    }

    if (!isAdmin) {
      Toast.show({ type: 'error', text1: 'Access denied', text2: 'Only the admin can create a fund.' });
      router.replace('/(tabs)/community');
      return;
    }

    if (!communityId) {
      setIsFetchingMembers(false);
      return;
    }

    const loadMembers = async () => {
      try {
        setIsFetchingMembers(true);
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, app_role, email, flat_number')
          .eq('community_id', communityId)
          .order('full_name', { ascending: true });

        if (error) throw error;

        const assignableMembers = (data ?? []).filter((member) => member.app_role !== 'admin');
        setMembers(assignableMembers);
      } catch (error: any) {
        Toast.show({ type: 'error', text1: 'Error', text2: error.message });
      } finally {
        setIsFetchingMembers(false);
      }
    };

    loadMembers();
  }, [communityId, fundsEnabled, isAdmin, router]);

  const selectedNames = useMemo(
    () =>
      selectedTreasurers
        .map((id) => members.find((member) => member.id === id)?.full_name?.trim() || 'Resident')
        .join(', '),
    [members, selectedTreasurers]
  );

  const filteredMembers = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return members;
    return members.filter(
      (member) =>
        (member.full_name || '').toLowerCase().includes(term) ||
        (member.email || '').toLowerCase().includes(term) ||
        (member.flat_number || '').toLowerCase().includes(term)
    );
  }, [members, searchQuery]);

  const toggleTreasurer = (memberId: string) => {
    setSelectedTreasurers((current) => {
      if (current.includes(memberId)) {
        return current.filter((id) => id !== memberId);
      }

      if (current.length >= MAX_TREASURERS) {
        Toast.show({
          type: 'error',
          text1: 'Treasurer limit reached',
          text2: `You can assign up to ${MAX_TREASURERS} treasurers per fund.`,
        });
        return current;
      }

      return [...current, memberId];
    });
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Toast.show({ type: 'error', text1: 'Validation Error', text2: 'Fund title is required' });
      return;
    }

    if (selectedTreasurers.length === 0) {
      Toast.show({ type: 'error', text1: 'Validation Error', text2: 'Assign at least 1 treasurer.' });
      return;
    }

    setIsLoading(true);
    try {
      const { data: fund, error: fundError } = await supabase
        .from('events')
        .insert({
          community_id: communityId as string,
          created_by: user?.id as string,
          title: title.trim(),
          description: description.trim() || null,
          goal_amount: 0,
          event_date: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (fundError) throw fundError;

      const { error: rolesError } = await supabase.from('fund_roles').insert(
        selectedTreasurers.map((memberId) => ({
          event_id: fund.id,
          user_id: memberId,
          role: 'treasurer',
          assigned_by: user?.id as string,
        }))
      );

      if (rolesError) {
        await supabase.from('events').delete().eq('id', fund.id);
        throw rolesError;
      }

      Toast.show({ type: 'success', text1: 'Fund created successfully' });
      router.replace(`/funds/${fund.id}`);
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: isMissingFundSchemaError(error) ? getMissingFundSchemaMessage() : error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Create fund</Text>
          <Text style={styles.subtitle}>
            Define the fund first, then assign 1 or 2 treasurers who will manage collections and expenses.
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Fund title</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Holi Celebration 2024"
              placeholderTextColor={Verandah.textTertiary}
              value={title}
              onChangeText={setTitle}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={styles.textArea}
              placeholder="Optional details about why this fund exists"
              placeholderTextColor={Verandah.textTertiary}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.sectionHeader}>
              <Text style={styles.label}>Assign treasurers</Text>
              <Text style={styles.counter}>
                {selectedTreasurers.length}/{MAX_TREASURERS}
              </Text>
            </View>
            <Text style={styles.helperText}>
              Treasurers can manage expenses and assign collectors.
            </Text>

            {isFetchingMembers ? (
              <ActivityIndicator color={Verandah.accent} style={styles.memberLoader} />
            ) : members.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  No community members are available to assign yet.
                </Text>
              </View>
            ) : (
              <>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by name, email, or flat..."
                  placeholderTextColor={Verandah.textMuted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {filteredMembers.map((member) => {
                  const isSelected = selectedTreasurers.includes(member.id);
                  const memberName = member.full_name?.trim() || 'Resident';

                  return (
                    <TouchableOpacity
                      key={member.id}
                      style={[
                        styles.memberRow,
                        isSelected ? styles.memberRowSelected : null,
                      ]}
                      onPress={() => toggleTreasurer(member.id)}
                      activeOpacity={0.85}
                    >
                      <Avatar name={memberName} size={36} />
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberName}>{memberName}</Text>
                        <View style={styles.memberMetaRow}>
                          <Text style={styles.memberMeta}>{member.email || 'No email'}</Text>
                          {member.flat_number ? (
                            <Text style={styles.memberMeta}> • Flat: {member.flat_number}</Text>
                          ) : null}
                        </View>
                      </View>
                      <View style={[styles.selector, isSelected ? styles.selectorSelected : null]} />
                    </TouchableOpacity>
                  );
                })}
                {filteredMembers.length === 0 && searchQuery.trim() ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>
                      No members match your search.
                    </Text>
                  </View>
                ) : null}
              </>
            )}

            <Text style={styles.selectionSummary}>
              {selectedNames ? `Selected: ${selectedNames}` : 'Select 1 or 2 treasurers before creating the fund.'}
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={handleSave}
          disabled={isLoading}
          activeOpacity={0.85}
          style={styles.saveButton}
        >
          {isLoading ? <ActivityIndicator color={Verandah.primaryFg} /> : <Text style={styles.saveButtonText}>Create fund</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Verandah.surface,
  },
  scrollContent: {
    padding: VerandahSpace.xl,
    paddingTop: 60,
    paddingBottom: 120,
  },
  header: {
    marginBottom: VerandahSpace.xl,
  },
  title: {
    ...VerandahType.display,
    color: Verandah.textPrimary,
  },
  subtitle: {
    ...VerandahType.body,
    color: Verandah.textSecondary,
    marginTop: 4,
  },
  form: {
    padding: VerandahSpace.lg,
    borderRadius: VerandahRadius.lg,
    borderWidth: 0.5,
    borderColor: Verandah.border,
    backgroundColor: Verandah.card,
  },
  inputGroup: {
    marginBottom: VerandahSpace.lg,
  },
  label: {
    ...VerandahType.captionBold,
    color: Verandah.textTertiary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    ...VerandahType.body,
    color: Verandah.textPrimary,
    height: 48,
    borderWidth: 0.5,
    borderRadius: VerandahRadius.md,
    borderColor: Verandah.borderStrong,
    backgroundColor: Verandah.card,
    paddingHorizontal: 14,
  },
  textArea: {
    ...VerandahType.body,
    color: Verandah.textPrimary,
    height: 120,
    borderWidth: 0.5,
    borderRadius: VerandahRadius.md,
    borderColor: Verandah.borderStrong,
    backgroundColor: Verandah.card,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  counter: {
    ...VerandahType.caption,
    color: Verandah.textTertiary,
  },
  helperText: {
    ...VerandahType.caption,
    color: Verandah.textSecondary,
    marginBottom: 14,
  },
  memberLoader: {
    marginVertical: 20,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.lg,
    backgroundColor: Verandah.card,
    padding: 12,
    marginBottom: 10,
    gap: 12,
  },
  memberRowSelected: {
    borderColor: Verandah.accent,
    backgroundColor: Verandah.accentSoft,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    ...VerandahType.bodyBold,
    color: Verandah.textPrimary,
  },
  memberMeta: {
    ...VerandahType.caption,
    color: Verandah.textSecondary,
  },
  memberMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  searchInput: {
    ...VerandahType.body,
    color: Verandah.textPrimary,
    height: 44,
    borderWidth: 0.5,
    borderRadius: VerandahRadius.md,
    borderColor: Verandah.borderStrong,
    backgroundColor: Verandah.card,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  selector: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: Verandah.borderStrong,
    backgroundColor: Verandah.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectorSelected: {
    borderColor: Verandah.accent,
    backgroundColor: Verandah.accent,
  },
  selectionSummary: {
    marginTop: 8,
    ...VerandahType.caption,
    color: Verandah.textSecondary,
  },
  emptyState: {
    borderWidth: 0.5,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.md,
    backgroundColor: Verandah.cardMuted,
    padding: 16,
  },
  emptyStateText: {
    ...VerandahType.caption,
    color: Verandah.textSecondary,
  },
  footer: {
    paddingHorizontal: VerandahSpace.xl,
    paddingVertical: VerandahSpace.md,
    borderTopWidth: 0.5,
    borderTopColor: Verandah.border,
    backgroundColor: Verandah.surface,
  },
  saveButton: {
    height: 50,
    borderRadius: 14,
    backgroundColor: Verandah.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: {
    ...VerandahType.bodyBold,
    color: Verandah.primaryFg,
  },
});
