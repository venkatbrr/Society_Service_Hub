import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { Colors } from '../../constants/Colors';
import { CATEGORIES } from '../../constants/categories';
import { getServiceCategoryEmoji } from '../../constants/emojis';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function AddProviderScreen() {
  const { user, communityId } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

      Toast.show({ type: 'success', text1: 'Provider added successfully' });
      router.back();
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Share Contact</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Help your neighbors find trusted local service providers</Text>
        </View>

        <View style={[styles.form, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>NAME</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="e.g. Ramesh - Electrician"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>PHONE NUMBER</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="e.g. +91 98765 43210"
              placeholderTextColor={colors.textMuted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>CATEGORY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {CATEGORIES.map(cat => (
                category === cat ? (
                  <LinearGradient
                    key={cat}
                    colors={[colors.gradientStart, colors.gradientEnd]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.categoryChipGradient}
                  >
                    <TouchableOpacity onPress={() => setCategory(cat)}>
                      <Text style={[styles.categoryText, { color: '#FFF' }]}>{cat}</Text>
                    </TouchableOpacity>
                  </LinearGradient>
                ) : (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.categoryChip, { backgroundColor: colors.glass, borderColor: colors.border }]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.categoryText, { color: colors.text }]}>{`${getServiceCategoryEmoji(cat)} ${cat}`}</Text>
                  </TouchableOpacity>
                )
              ))}
            </ScrollView>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>FLAT / BLOCK (OPTIONAL)</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="e.g. Often works in Block A"
              placeholderTextColor={colors.textMuted}
              value={flatBlock}
              onChangeText={setFlatBlock}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>DESCRIPTION</Text>
            <TextInput
              style={[styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="e.g. Very reliable, fair pricing..."
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 24), backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
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
            {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveButtonText}>Add Provider</Text>}
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
    elevation: 0,
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
  categoryScroll: {
    flexDirection: 'row',
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    marginRight: 8,
    borderWidth: 1,
  },
  categoryChipGradient: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    marginRight: 8,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  textArea: {
    height: 120,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    fontSize: 16,
  },
  footer: {
    padding: 24,
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
