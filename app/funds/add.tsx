import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Colors } from '../../constants/Colors';
import { APP_EMOJIS } from '../../constants/emojis';
import { useAuth } from '../../context/AuthContext';
import { Tables } from '../../lib/database.types';
import { MAX_TREASURERS } from '../../lib/fundRoles';
import { supabase } from '../../lib/supabase';
import { getMissingFundSchemaMessage, isMissingFundSchemaError } from '../../lib/supabaseErrors';

type CommunityMember = Pick<Tables<'profiles'>, 'id' | 'full_name' | 'app_role'>;

export default function AddFundScreen() {
  const { user, communityId, appRole } = useAuth();
  const router = useRouter();
  const colors = Colors.light;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [selectedTreasurers, setSelectedTreasurers] = useState<string[]>([]);
  const [isFetchingMembers, setIsFetchingMembers] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const isAdmin = appRole === 'community_admin';

  useEffect(() => {
    if (!isAdmin) {
      Toast.show({ type: 'error', text1: 'Access denied', text2: 'Only the admin can create a fund.' });
      router.replace('/(tabs)/funds');
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
          .select('id, full_name, app_role')
          .eq('community_id', communityId)
          .order('full_name', { ascending: true });

        if (error) throw error;

        const assignableMembers = (data ?? []).filter((member) => member.app_role !== 'community_admin');
        setMembers(assignableMembers);
      } catch (error: any) {
        Toast.show({ type: 'error', text1: 'Error', text2: error.message });
      } finally {
        setIsFetchingMembers(false);
      }
    };

    loadMembers();
  }, [communityId, isAdmin, router]);

  const selectedNames = useMemo(
    () =>
      selectedTreasurers
        .map((id) => members.find((member) => member.id === id)?.full_name?.trim() || 'Resident')
        .join(', '),
    [members, selectedTreasurers]
  );

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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Create Fund</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Define the fund first, then assign 1 or 2 treasurers who will manage collections and expenses.
          </Text>
        </View>

        <View style={[styles.form, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>FUND TITLE</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="e.g. Holi Celebration 2024"
              placeholderTextColor={colors.textMuted}
              value={title}
              onChangeText={setTitle}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>DESCRIPTION</Text>
            <TextInput
              style={[styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Optional details about why this fund exists"
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.label, { color: colors.text }]}>ASSIGN TREASURERS</Text>
              <Text style={[styles.counter, { color: colors.textMuted }]}>
                {selectedTreasurers.length}/{MAX_TREASURERS}
              </Text>
            </View>
            <Text style={[styles.helperText, { color: colors.textMuted }]}>
              Treasurers can manage expenses and assign collectors.
            </Text>

            {isFetchingMembers ? (
              <ActivityIndicator color={colors.primary} style={styles.memberLoader} />
            ) : members.length === 0 ? (
              <View style={[styles.emptyState, { backgroundColor: colors.glass, borderColor: colors.border }]}>
                <Text style={[styles.emptyStateText, { color: colors.textMuted }]}>
                  No community members are available to assign yet.
                </Text>
              </View>
            ) : (
              members.map((member) => {
                const isSelected = selectedTreasurers.includes(member.id);
                const memberName = member.full_name?.trim() || 'Resident';

                return (
                  <TouchableOpacity
                    key={member.id}
                    style={[
                      styles.memberRow,
                      {
                        backgroundColor: isSelected ? colors.primary + '08' : colors.glass,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => toggleTreasurer(member.id)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.memberInfo}>
                      <Text style={[styles.memberName, { color: colors.text }]}>{memberName}</Text>
                      <Text style={[styles.memberMeta, { color: colors.textMuted }]}>Resident</Text>
                    </View>
                    {isSelected ? (
                      <LinearGradient
                        colors={[colors.gradientStart, colors.gradientEnd]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.selector}
                      >
                        <Text style={styles.selectorEmoji}>{APP_EMOJIS.success}</Text>
                      </LinearGradient>
                    ) : (
                      <View
                        style={[
                          styles.selector,
                          {
                            backgroundColor: 'transparent',
                            borderColor: colors.border,
                          },
                        ]}
                      />
                    )}
                  </TouchableOpacity>
                );
              })
            )}

            <Text style={[styles.selectionSummary, { color: colors.textMuted }]}>
              {selectedNames ? `Selected: ${selectedNames}` : 'Select 1 or 2 treasurers before creating the fund.'}
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.glass }]}>
        <TouchableOpacity
          onPress={handleSave}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.saveButton}
          >
            {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveButtonText}>Create Fund</Text>}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 60,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    marginTop: 4,
    lineHeight: 22,
  },
  form: {
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    height: 54,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  textArea: {
    height: 120,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    fontSize: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  counter: {
    fontSize: 12,
    fontWeight: '700',
  },
  helperText: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  memberLoader: {
    marginVertical: 20,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '700',
  },
  memberMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '500',
  },
  selector: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  selectorEmoji: {
    fontSize: 16,
    lineHeight: 18,
    color: '#FFF',
  },
  selectionSummary: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  emptyStateText: {
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    padding: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
  },
  saveButton: {
    height: 58,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
});
