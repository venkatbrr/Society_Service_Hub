import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { BaseCard } from '../../components/BaseCard';
import { EmptyState } from '../../components/EmptyState';
import { Verandah } from '../../constants/Colors';
import { EMERGENCY_CATEGORY_META, EMERGENCY_CATEGORY_ORDER, EmergencyCategory } from '../../constants/sos';
import { VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

type ScopeMode = 'community' | 'global';

type EmergencyContactRow = {
  id: string;
  community_id: string | null;
  category: EmergencyCategory;
  name: string;
  phone: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

const PAGE_SIZE = 40;

const EMPTY_FORM = {
  id: null as string | null,
  category: 'hospital' as EmergencyCategory,
  name: '',
  phone: '',
  description: '',
  sort_order: '0',
  is_active: true,
};

export default function ManageEmergencyContactsScreen() {
  const router = useRouter();
  const { user, communityId, isCommunityLead, isPlatformAdmin } = useAuth();

  const [loading, setLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [contacts, setContacts] = useState<EmergencyContactRow[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [scopeMode, setScopeMode] = useState<ScopeMode>('community');
  const [form, setForm] = useState(EMPTY_FORM);

  const canManage = isCommunityLead || isPlatformAdmin;

  const effectiveScopeMode = useMemo<ScopeMode>(() => {
    if (isPlatformAdmin) {
      return scopeMode;
    }
    return 'community';
  }, [isPlatformAdmin, scopeMode]);

  const scopedTitle = effectiveScopeMode === 'global' ? 'Global emergency numbers' : 'Community emergency numbers';

  const loadContacts = useCallback(async (nextPage: number, replace: boolean) => {
    if (!communityId && effectiveScopeMode === 'community') {
      setContacts([]);
      setHasMore(false);
      return;
    }

    const from = nextPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from('emergency_contacts')
      .select('id, community_id, category, name, phone, description, sort_order, is_active')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
      .range(from, to);

    if (effectiveScopeMode === 'global') {
      query = query.is('community_id', null);
    } else {
      query = query.eq('community_id', communityId as string);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as EmergencyContactRow[];
    setContacts((prev) => (replace ? rows : [...prev, ...rows]));
    setPage(nextPage);
    setHasMore(rows.length === PAGE_SIZE);
  }, [communityId, effectiveScopeMode]);

  const load = useCallback(async () => {
    if (!canManage) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      await loadContacts(0, true);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to load emergency contacts', text2: error.message });
    } finally {
      setLoading(false);
    }
  }, [canManage, loadContacts]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (!canManage || loading) return;

    loadContacts(0, true).catch((error: any) => {
      Toast.show({ type: 'error', text1: 'Unable to refresh emergency contacts', text2: error.message });
    });
  }, [canManage, loading, effectiveScopeMode, loadContacts]);

  useEffect(() => {
    if (canManage) return;

    Toast.show({ type: 'error', text1: 'Access denied', text2: 'Only community leads or platform admins can manage emergency contacts.' });
    router.replace('/(tabs)/community' as any);
  }, [canManage, router]);

  if (!canManage) return null;

  const resetForm = () => setForm(EMPTY_FORM);

  const onSave = async () => {
    if (!user?.id) {
      Toast.show({ type: 'error', text1: 'Session not ready' });
      return;
    }

    if (!form.name.trim() || !form.phone.trim()) {
      Toast.show({ type: 'error', text1: 'Name and phone are required' });
      return;
    }

    const parsedSortOrder = Number(form.sort_order || 0);
    if (Number.isNaN(parsedSortOrder)) {
      Toast.show({ type: 'error', text1: 'Sort order must be a number' });
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        category: form.category,
        name: form.name.trim(),
        phone: form.phone.trim(),
        description: form.description.trim() || null,
        sort_order: parsedSortOrder,
        is_active: form.is_active,
        created_by: user.id,
        community_id: effectiveScopeMode === 'global' ? null : communityId,
      };

      let error = null as any;
      if (form.id) {
        ({ error } = await supabase.from('emergency_contacts').update(payload).eq('id', form.id));
      } else {
        ({ error } = await supabase.from('emergency_contacts').insert(payload));
      }

      if (error) throw error;

      Toast.show({ type: 'success', text1: form.id ? 'Emergency contact updated' : 'Emergency contact added' });
      resetForm();
      await loadContacts(0, true);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to save emergency contact', text2: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const onEdit = (row: EmergencyContactRow) => {
    setForm({
      id: row.id,
      category: row.category,
      name: row.name,
      phone: row.phone,
      description: row.description ?? '',
      sort_order: String(row.sort_order),
      is_active: row.is_active,
    });

    if (isPlatformAdmin) {
      setScopeMode(row.community_id ? 'community' : 'global');
    }
  };

  const onDelete = (row: EmergencyContactRow) => {
    Alert.alert('Delete emergency contact?', `${row.name} will be removed from SOS listings.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('emergency_contacts').delete().eq('id', row.id);
            if (error) throw error;
            Toast.show({ type: 'success', text1: 'Emergency contact deleted' });
            await loadContacts(0, true);
          } catch (error: any) {
            Toast.show({ type: 'error', text1: 'Unable to delete contact', text2: error.message });
          }
        },
      },
    ]);
  };

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      await loadContacts(page + 1, false);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to load more contacts', text2: error.message });
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator color={Verandah.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={Verandah.primary} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Manage emergency numbers</Text>
          <Text style={styles.subtitle}>Only leads and admins can edit this directory.</Text>
        </View>
      </View>

      {isPlatformAdmin ? (
        <View style={styles.scopeSwitchWrap}>
          <TouchableOpacity
            style={[styles.scopeButton, effectiveScopeMode === 'community' && styles.scopeButtonActive]}
            onPress={() => setScopeMode('community')}
          >
            <Text style={[styles.scopeButtonText, effectiveScopeMode === 'community' && styles.scopeButtonTextActive]}>Community</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.scopeButton, effectiveScopeMode === 'global' && styles.scopeButtonActive]}
            onPress={() => setScopeMode('global')}
          >
            <Text style={[styles.scopeButtonText, effectiveScopeMode === 'global' && styles.scopeButtonTextActive]}>Global</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <BaseCard padding={14}>
          <Text style={styles.formTitle}>{form.id ? 'Edit emergency contact' : `Add to ${scopedTitle.toLowerCase()}`}</Text>

          <Text style={styles.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {EMERGENCY_CATEGORY_ORDER.map((category) => {
              const active = form.category === category;
              return (
                <TouchableOpacity
                  key={category}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setForm((prev) => ({ ...prev, category }))}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{EMERGENCY_CATEGORY_META[category].label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={form.name}
            onChangeText={(value) => setForm((prev) => ({ ...prev, name: value }))}
            placeholder="e.g. Main Gate Security"
            placeholderTextColor={Verandah.textMuted}
          />

          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={form.phone}
            onChangeText={(value) => setForm((prev) => ({ ...prev, phone: value }))}
            placeholder="e.g. 100 / 108 / 9876543210"
            placeholderTextColor={Verandah.textMuted}
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>Description (optional)</Text>
          <TextInput
            style={styles.input}
            value={form.description}
            onChangeText={(value) => setForm((prev) => ({ ...prev, description: value }))}
            placeholder="e.g. 24x7, Gate 1"
            placeholderTextColor={Verandah.textMuted}
          />

          <Text style={styles.label}>Sort order</Text>
          <TextInput
            style={styles.input}
            value={form.sort_order}
            onChangeText={(value) => setForm((prev) => ({ ...prev, sort_order: value }))}
            placeholder="0"
            placeholderTextColor={Verandah.textMuted}
            keyboardType="numeric"
          />

          <View style={styles.switchRow}>
            <Text style={styles.label}>Active</Text>
            <Switch
              value={form.is_active}
              onValueChange={(value) => setForm((prev) => ({ ...prev, is_active: value }))}
            />
          </View>

          <View style={styles.formButtonsRow}>
            {form.id ? (
              <TouchableOpacity style={styles.secondaryButton} onPress={resetForm}>
                <Text style={styles.secondaryButtonText}>Cancel edit</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.primaryButton} onPress={onSave} disabled={isLoading}>
              {isLoading ? <ActivityIndicator color={Verandah.primaryFg} /> : <Text style={styles.primaryButtonText}>{form.id ? 'Update' : 'Add contact'}</Text>}
            </TouchableOpacity>
          </View>
        </BaseCard>

        <Text style={styles.sectionTitle}>{scopedTitle}</Text>
        {contacts.length === 0 ? (
          <EmptyState icon="call-outline" ionicon="call-outline" message="No emergency contacts found for this scope yet." />
        ) : (
          contacts.map((row) => (
            <BaseCard key={row.id} padding={14}>
              <View style={styles.contactRow}>
                <View style={styles.contactTextWrap}>
                  <View style={styles.contactHeadRow}>
                    <Ionicons name={EMERGENCY_CATEGORY_META[row.category].icon} size={16} color={Verandah.primary} />
                    <Text style={styles.contactName}>{row.name}</Text>
                    {!row.is_active ? <Text style={styles.inactiveBadge}>Inactive</Text> : null}
                  </View>
                  <Text style={styles.contactMeta}>{row.phone}</Text>
                  {row.description ? <Text style={styles.contactMeta}>{row.description}</Text> : null}
                  <Text style={styles.contactMeta}>Sort: {row.sort_order}</Text>
                </View>

                <View style={styles.rowActions}>
                  <TouchableOpacity style={styles.rowActionBtn} onPress={() => onEdit(row)}>
                    <Ionicons name="create-outline" size={15} color={Verandah.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.rowActionBtn} onPress={() => onDelete(row)}>
                    <Ionicons name="trash-outline" size={15} color={Verandah.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            </BaseCard>
          ))
        )}

        {hasMore ? (
          <TouchableOpacity style={styles.loadMoreButton} onPress={loadMore} disabled={loadingMore}>
            {loadingMore ? <ActivityIndicator color={Verandah.primary} /> : <Text style={styles.loadMoreText}>Load more contacts</Text>}
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Verandah.surface,
    paddingHorizontal: VerandahSpace.lg,
    paddingTop: VerandahLayout.screenPaddingTop,
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Verandah.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: VerandahSpace.md,
    marginBottom: VerandahSpace.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
    borderColor: Verandah.border,
    backgroundColor: Verandah.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    ...VerandahType.title,
    color: Verandah.textPrimary,
  },
  subtitle: {
    ...VerandahType.caption,
    color: Verandah.textSecondary,
  },
  scopeSwitchWrap: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.lg,
    backgroundColor: Verandah.card,
    padding: 4,
    marginBottom: VerandahSpace.sm,
  },
  scopeButton: {
    flex: 1,
    alignItems: 'center',
    borderRadius: VerandahRadius.md,
    paddingVertical: VerandahSpace.sm,
  },
  scopeButtonActive: {
    backgroundColor: Verandah.cardMuted,
  },
  scopeButtonText: {
    ...VerandahType.captionBold,
    color: Verandah.textSecondary,
  },
  scopeButtonTextActive: {
    color: Verandah.primary,
  },
  scrollContent: {
    paddingBottom: VerandahSpace.xxxl,
    gap: VerandahSpace.sm,
  },
  formTitle: {
    ...VerandahType.bodyBold,
    color: Verandah.textPrimary,
    marginBottom: VerandahSpace.sm,
  },
  label: {
    ...VerandahType.captionBold,
    color: Verandah.textPrimary,
    marginTop: VerandahSpace.sm,
    marginBottom: VerandahSpace.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: Verandah.borderStrong,
    borderRadius: VerandahRadius.md,
    backgroundColor: Verandah.card,
    color: Verandah.textPrimary,
    height: 44,
    paddingHorizontal: VerandahSpace.md,
    ...VerandahType.body,
  },
  chipRow: {
    gap: VerandahSpace.sm,
    paddingVertical: 2,
  },
  chip: {
    borderWidth: 1,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.pill,
    backgroundColor: Verandah.card,
    paddingHorizontal: VerandahSpace.md,
    paddingVertical: VerandahSpace.sm,
  },
  chipActive: {
    borderColor: Verandah.primary,
    backgroundColor: Verandah.primary,
  },
  chipText: {
    ...VerandahType.caption,
    color: Verandah.textSecondary,
  },
  chipTextActive: {
    color: Verandah.primaryFg,
  },
  switchRow: {
    marginTop: VerandahSpace.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  formButtonsRow: {
    marginTop: VerandahSpace.md,
    flexDirection: 'row',
    gap: VerandahSpace.sm,
  },
  primaryButton: {
    flex: 1,
    borderRadius: VerandahRadius.md,
    backgroundColor: Verandah.primary,
    paddingVertical: VerandahSpace.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    ...VerandahType.bodyBold,
    color: Verandah.primaryFg,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: Verandah.borderStrong,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: VerandahSpace.md,
    justifyContent: 'center',
  },
  secondaryButtonText: {
    ...VerandahType.captionBold,
    color: Verandah.textPrimary,
  },
  sectionTitle: {
    ...VerandahType.bodyBold,
    color: Verandah.textPrimary,
    marginTop: VerandahSpace.sm,
    marginBottom: VerandahSpace.xs,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: VerandahSpace.md,
  },
  contactTextWrap: {
    flex: 1,
  },
  contactHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: VerandahSpace.sm,
  },
  contactName: {
    ...VerandahType.bodyBold,
    color: Verandah.textPrimary,
  },
  contactMeta: {
    ...VerandahType.caption,
    color: Verandah.textSecondary,
    marginTop: 2,
  },
  inactiveBadge: {
    ...VerandahType.micro,
    color: Verandah.caution,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: VerandahSpace.sm,
  },
  rowActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Verandah.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Verandah.card,
  },
  loadMoreButton: {
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
    borderColor: Verandah.borderStrong,
    backgroundColor: Verandah.card,
    paddingVertical: VerandahSpace.md,
    alignItems: 'center',
  },
  loadMoreText: {
    ...VerandahType.body,
    color: Verandah.primary,
  },
});
