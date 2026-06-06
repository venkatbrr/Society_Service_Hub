import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';
import { supabase } from '../lib/supabase';

interface ProviderSelectorProps {
  communityId: string;
  mode: 'existing' | 'new';
  onModeChange: (mode: 'existing' | 'new') => void;
  selectedProviderId?: string;
  onSelectProvider: (provider: { id: string; name: string; phone?: string | null; whatsapp?: string | null }) => void;
  manualProviderName: string;
  onManualNameChange: (name: string) => void;
  manualProviderPhone: string;
  onManualPhoneChange: (phone: string) => void;
  manualProviderWhatsapp: string;
  onManualWhatsappChange: (whatsapp: string) => void;
  allowNewProvider?: boolean;
}

export const ProviderSelector = ({
  communityId,
  mode,
  onModeChange,
  selectedProviderId,
  onSelectProvider,
  manualProviderName,
  onManualNameChange,
  manualProviderPhone,
  onManualPhoneChange,
  manualProviderWhatsapp,
  onManualWhatsappChange,
  allowNewProvider = true,
}: ProviderSelectorProps) => {
  const [providers, setProviders] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const effectiveMode: 'existing' | 'new' = allowNewProvider ? mode : 'existing';

  useEffect(() => {
    if (!allowNewProvider && mode !== 'existing') {
      onModeChange('existing');
    }
  }, [allowNewProvider, mode, onModeChange]);

  useEffect(() => {
    if (effectiveMode === 'existing') {
      fetchProviders();
    }
  }, [communityId, effectiveMode]);

  const fetchProviders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('service_providers')
        .select('id, name, phone')
        .eq('community_id', communityId)
        .order('name', { ascending: true });

      if (error) throw error;
      setProviders(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const filteredProviders = providers.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedProviderName = providers.find(p => p.id === selectedProviderId)?.name || 'Select a provider...';

  return (
    <View style={styles.container}>
      {allowNewProvider ? (
        <View style={styles.segmentContainer}>
          <TouchableOpacity
            style={[styles.segment, effectiveMode === 'existing' && styles.segmentActive]}
            onPress={() => onModeChange('existing')}
          >
            <Text style={[styles.segmentText, effectiveMode === 'existing' ? styles.segmentTextActive : styles.segmentTextInactive]}>Select existing provider</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segment, effectiveMode === 'new' && styles.segmentActive]}
            onPress={() => onModeChange('new')}
          >
            <Text style={[styles.segmentText, effectiveMode === 'new' ? styles.segmentTextActive : styles.segmentTextInactive]}>New provider</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {effectiveMode === 'existing' ? (
        <View style={styles.existingContainer}>
          <TouchableOpacity 
            style={styles.selector} 
            onPress={() => setDropdownOpen(!dropdownOpen)}
          >
            <Text style={[styles.selectorText, { color: selectedProviderId ? Verandah.textPrimary : Verandah.textTertiary }]}>
              {selectedProviderName}
            </Text>
            <Ionicons name={dropdownOpen ? "chevron-up" : "chevron-down"} size={20} color={Verandah.textTertiary} />
          </TouchableOpacity>

          {dropdownOpen && (
            <View style={styles.dropdown}>
              <View style={styles.searchContainer}>
                <Ionicons name="search" size={18} color={Verandah.textTertiary} />
                <TextInput 
                  style={styles.searchInput} 
                  placeholder="Search providers..." 
                  placeholderTextColor={Verandah.textTertiary}
                  value={search}
                  onChangeText={setSearch}
                />
              </View>
              <ScrollView style={styles.dropdownScroll} nestedScrollEnabled={true}>
                {loading ? (
                    <ActivityIndicator style={{ padding: 20 }} color={Verandah.accent} />
                ) : filteredProviders.length > 0 ? (
                  filteredProviders.map(p => (
                    <TouchableOpacity 
                      key={p.id} 
                      style={[styles.item, selectedProviderId === p.id && styles.itemSelected]} 
                      onPress={() => {
                        onSelectProvider(p);
                        setDropdownOpen(false);
                        setSearch('');
                      }}
                    >
                      <Text style={styles.itemText}>{p.name}</Text>
                      {selectedProviderId === p.id && <Ionicons name="checkmark" size={18} color={Verandah.accent} />}
                    </TouchableOpacity>
                  ))
                ) : (
                  <Text style={styles.emptyText}>No providers found.</Text>
                )}
              </ScrollView>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.manualContainer}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Provider name *</Text>
            <TextInput 
              style={styles.input} 
              placeholder="e.g. Rahul Plumber" 
              placeholderTextColor={Verandah.textTertiary}
              value={manualProviderName}
              onChangeText={onManualNameChange}
            />
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Phone (optional)</Text>
              <TextInput 
                style={styles.input} 
                placeholder="e.g. 98765..." 
                placeholderTextColor={Verandah.textTertiary}
                keyboardType="phone-pad"
                value={manualProviderPhone}
                onChangeText={onManualPhoneChange}
              />
            </View>
            <View style={{ width: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>WhatsApp (optional)</Text>
              <TextInput 
                style={styles.input} 
                placeholder="e.g. 98765..." 
                placeholderTextColor={Verandah.textTertiary}
                keyboardType="phone-pad"
                value={manualProviderWhatsapp}
                onChangeText={onManualWhatsappChange}
              />
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: VerandahSpace.xl,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: Verandah.cardMuted,
    borderRadius: VerandahRadius.md,
    padding: VerandahSpace.xs,
    marginBottom: VerandahSpace.xl,
  },
  segment: {
    flex: 1,
    paddingVertical: VerandahSpace.sm + 2,
    alignItems: 'center',
    borderRadius: VerandahRadius.sm + 1,
  },
  segmentActive: {
    backgroundColor: Verandah.card,
  },
  segmentText: {
    ...VerandahType.bodyBold,
  },
  segmentTextActive: {
    color: Verandah.textPrimary,
  },
  segmentTextInactive: {
    color: Verandah.textTertiary,
  },
  existingContainer: {
    zIndex: 100,
  },
  selector: {
    height: 48,
    borderWidth: 0.5,
    borderColor: Verandah.borderStrong,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: VerandahSpace.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Verandah.card,
  },
  selectorText: {
    ...VerandahType.body,
  },
  dropdown: {
    marginTop: VerandahSpace.sm,
    borderWidth: 0.5,
    borderColor: Verandah.borderStrong,
    borderRadius: VerandahRadius.md,
    maxHeight: 250,
    overflow: 'hidden',
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: Verandah.card,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: VerandahSpace.lg,
    height: 44,
    borderBottomWidth: 0.5,
    borderBottomColor: Verandah.border,
  },
  searchInput: {
    flex: 1,
    marginLeft: VerandahSpace.sm,
    ...VerandahType.body,
    color: Verandah.textPrimary,
  },
  dropdownScroll: {
    padding: VerandahSpace.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: VerandahSpace.md,
    borderRadius: VerandahRadius.sm,
    marginBottom: VerandahSpace.xs,
  },
  itemSelected: {
    backgroundColor: Verandah.cardMuted,
  },
  itemText: {
    ...VerandahType.body,
    fontWeight: '500',
    color: Verandah.textPrimary,
  },
  emptyText: {
    padding: VerandahSpace.xl,
    textAlign: 'center',
    ...VerandahType.body,
    color: Verandah.textTertiary,
  },
  manualContainer: {
    gap: VerandahSpace.lg,
  },
  inputGroup: {
    marginBottom: VerandahSpace.xs,
  },
  label: {
    ...VerandahType.captionBold,
    color: Verandah.textTertiary,
    marginBottom: VerandahSpace.sm,
    marginLeft: VerandahSpace.xs,
  },
  input: {
    height: 48,
    borderWidth: 0.5,
    borderColor: Verandah.borderStrong,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: VerandahSpace.lg,
    ...VerandahType.body,
    color: Verandah.textPrimary,
    backgroundColor: Verandah.card,
  },
  row: {
    flexDirection: 'row',
  },
});
