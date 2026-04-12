import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/Colors';
import { CATEGORIES } from '../../constants/categories';
import Toast from 'react-native-toast-message';

export default function AddProviderScreen() {
  const { user, communityId } = useAuth();
  const router = useRouter();
  const colors = Colors.light;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [flatBlock, setFlatBlock] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !phone.trim() || !category) {
      Toast.show({ type: 'error', text1: 'Validation Error', text2: 'Name, phone, and category are required' });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.from('service_providers').insert({
        community_id: communityId as string,
        created_by: user?.id as string,
        name: name.trim(),
        phone: phone.trim(),
        category,
        description: description.trim() || null,
        flat_block: flatBlock.trim() || null,
      });

      if (error) throw error;

      Toast.show({ type: 'success', text1: 'Provider Added successfully' });
      router.back();
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.text }]}>Name *</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          placeholder="e.g. John Doe"
          placeholderTextColor={colors.textMuted}
          value={name}
          onChangeText={setName}
        />

        <Text style={[styles.label, { color: colors.text }]}>Phone Number *</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          placeholder="e.g. +91 98765 43210"
          placeholderTextColor={colors.textMuted}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />

        <Text style={[styles.label, { color: colors.text }]}>Category *</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.categoryChip,
                category === cat ? { backgroundColor: colors.primary } : { backgroundColor: colors.background, borderColor: colors.border }
              ]}
              onPress={() => setCategory(cat)}
            >
              <Text style={{ color: category === cat ? '#FFF' : colors.text }}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={[styles.label, { color: colors.text }]}>Flat / Block (Optional)</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          placeholder="e.g. A-402 (or usually works at)"
          placeholderTextColor={colors.textMuted}
          value={flatBlock}
          onChangeText={setFlatBlock}
        />

        <Text style={[styles.label, { color: colors.text }]}>Description / Notes (Optional)</Text>
        <TextInput
          style={[styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
          placeholder="e.g. Comes on time, does good work, etc."
          placeholderTextColor={colors.textMuted}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>

      <TouchableOpacity 
        style={[styles.saveButton, { backgroundColor: colors.primary }]} 
        onPress={handleSave}
        disabled={isLoading}
      >
        {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveButtonText}>Save Provider</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 16,
  },
  textArea: {
    height: 100,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  categoryScroll: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
  },
  saveButton: {
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
});
