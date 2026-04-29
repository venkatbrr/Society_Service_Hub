import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/Colors';
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
}: ProviderSelectorProps) => {
  const colors = Colors.light;
  const [providers, setProviders] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    if (mode === 'existing') {
      fetchProviders();
    }
  }, [communityId, mode]);

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
      <View style={styles.segmentContainer}>
        <TouchableOpacity 
          style={[styles.segment, mode === 'existing' ? { backgroundColor: colors.primary } : { borderBottomWidth: 0 }]} 
          onPress={() => onModeChange('existing')}
        >
          <Text style={[styles.segmentText, mode === 'existing' ? { color: '#FFF' } : { color: colors.textMuted }]}>From my providers</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.segment, mode === 'new' ? { backgroundColor: colors.primary } : { borderBottomWidth: 0 }]} 
          onPress={() => onModeChange('new')}
        >
          <Text style={[styles.segmentText, mode === 'new' ? { color: '#FFF' } : { color: colors.textMuted }]}>New provider</Text>
        </TouchableOpacity>
      </View>

      {mode === 'existing' ? (
        <View style={styles.existingContainer}>
          <TouchableOpacity 
            style={[styles.selector, { borderColor: colors.border }]} 
            onPress={() => setDropdownOpen(!dropdownOpen)}
          >
            <Text style={[styles.selectorText, { color: selectedProviderId ? colors.text : colors.textMuted }]}>
              {selectedProviderName}
            </Text>
            <Ionicons name={dropdownOpen ? "chevron-up" : "chevron-down"} size={20} color={colors.icon} />
          </TouchableOpacity>

          {dropdownOpen && (
            <View style={[styles.dropdown, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <View style={[styles.searchContainer, { borderBottomColor: colors.border }]}>
                <Ionicons name="search" size={18} color={colors.icon} />
                <TextInput 
                  style={styles.searchInput} 
                  placeholder="Search providers..." 
                  value={search}
                  onChangeText={setSearch}
                />
              </View>
              <ScrollView style={styles.dropdownScroll} nestedScrollEnabled={true}>
                {loading ? (
                    <ActivityIndicator style={{ padding: 20 }} color={colors.primary} />
                ) : filteredProviders.length > 0 ? (
                  filteredProviders.map(p => (
                    <TouchableOpacity 
                      key={p.id} 
                      style={[styles.item, selectedProviderId === p.id && { backgroundColor: colors.surface2 }]} 
                      onPress={() => {
                        onSelectProvider(p);
                        setDropdownOpen(false);
                        setSearch('');
                      }}
                    >
                      <Text style={[styles.itemText, { color: colors.text }]}>{p.name}</Text>
                      {selectedProviderId === p.id && <Ionicons name="checkmark" size={18} color={colors.primary} />}
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
            <Text style={[styles.label, { color: colors.text }]}>PROVIDER NAME *</Text>
            <TextInput 
              style={[styles.input, { borderColor: colors.border }]} 
              placeholder="e.g. Rahul Plumber" 
              value={manualProviderName}
              onChangeText={onManualNameChange}
            />
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.text }]}>PHONE (OPTIONAL)</Text>
              <TextInput 
                style={[styles.input, { borderColor: colors.border }]} 
                placeholder="e.g. 98765..." 
                keyboardType="phone-pad"
                value={manualProviderPhone}
                onChangeText={onManualPhoneChange}
              />
            </View>
            <View style={{ width: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.text }]}>WHATSAPP (OPTIONAL)</Text>
              <TextInput 
                style={[styles.input, { borderColor: colors.border }]} 
                placeholder="e.g. 98765..." 
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
    marginBottom: 20,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
  },
  existingContainer: {
    zIndex: 100,
  },
  selector: {
    height: 56,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectorText: {
    fontSize: 16,
  },
  dropdown: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 16,
    maxHeight: 250,
    overflow: 'hidden',
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 48,
    borderBottomWidth: 1,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
  },
  dropdownScroll: {
    padding: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  itemText: {
    fontSize: 15,
    fontWeight: '500',
  },
  emptyText: {
    padding: 20,
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 14,
  },
  manualContainer: {
    gap: 16,
  },
  inputGroup: {
    marginBottom: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    height: 56,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
  },
});
