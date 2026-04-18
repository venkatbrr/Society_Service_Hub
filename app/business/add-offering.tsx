import { Ionicons } from '@expo/vector-icons';
import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function AddOfferingScreen() {
  const { businessId, offeringId } = useLocalSearchParams<{ businessId: string, offeringId?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const colors = Colors.light;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [priceUnit, setPriceUnit] = useState('per item');
  const [category, setCategory] = useState('');
  const [availability, setAvailability] = useState('Always available');
  const [image, setImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [loading, setLoading] = useState(!!offeringId);
  const [existingCategories, setExistingCategories] = useState<string[]>([]);

  useEffect(() => {
    fetchInitialData();
  }, [offeringId, businessId]);

  const fetchInitialData = async () => {
    if (!businessId) return;

    try {
      // Fetch existing categories to help user
      const { data: catData } = await supabase
        .from('business_offerings')
        .select('category')
        .eq('business_id', businessId);
      
      const cats = Array.from(new Set(catData?.map(c => c.category).filter(Boolean))) as string[];
      setExistingCategories(cats);

      if (offeringId) {
        const { data, error } = await supabase
          .from('business_offerings')
          .select()
          .eq('id', offeringId)
          .single();
        
        if (error) throw error;

        setName(data.name);
        setDescription(data.description || '');
        setPrice(data.price.toString());
        setPriceUnit(data.price_unit);
        setCategory(data.category || '');
        setAvailability(data.availability);
        setImage(data.photo_url);
      }
    } catch (e) {
      console.error(e);
      Toast.show({ type: 'error', text1: 'Error loading offering' });
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !price.trim()) {
      Toast.show({ type: 'error', text1: 'Missing Fields', text2: 'Name and Price are required' });
      return;
    }

    setIsUploading(true);
    try {
      let photoUrl = image;

      if (image && (image.startsWith('content://') || image.startsWith('file://'))) {
        const fileName = `${businessId}_offering_${Date.now()}.jpg`;
        const response = await fetch(image);
        const blob = await response.blob();
        
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(blob);
        });

        const { error: uploadError } = await supabase.storage
          .from('business-photos')
          .upload(fileName, decode(base64), {
            contentType: 'image/jpeg'
          });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('business-photos')
          .getPublicUrl(fileName);
        
        photoUrl = publicUrl;
      }

      const payload = {
        business_id: businessId as string,
        name: name.trim(),
        description: description.trim() || null,
        price: parseFloat(price),
        price_unit: priceUnit.trim(),
        category: category.trim() || null,
        availability,
        photo_url: photoUrl,
      };

      if (offeringId) {
        const { error } = await supabase
          .from('business_offerings')
          .update(payload)
          .eq('id', offeringId);
        if (error) throw error;
        Toast.show({ type: 'success', text1: 'Offering updated' });
      } else {
        const { error } = await supabase
          .from('business_offerings')
          .insert(payload);
        if (error) throw error;
        Toast.show({ type: 'success', text1: 'Offering added to catalog' });
      }

      router.back();
    } catch (error: any) {
      console.error(error);
      Toast.show({ type: 'error', text1: 'Error', text2: error.message });
    } finally {
      setIsUploading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const AVAILABILITY_OPTIONS = ['Always available', 'Weekends only', 'Pre-order', 'Seasonal'];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>
            {offeringId ? 'Edit Offering' : 'Add an Offering'}
          </Text>
        </View>

        <TouchableOpacity 
          style={[styles.photoPicker, { backgroundColor: colors.surface2, borderColor: colors.border }]} 
          onPress={pickImage}
        >
          {image ? (
            <Image source={{ uri: image }} style={styles.previewImage} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="image-outline" size={32} color={colors.primary} />
              <Text style={[styles.photoText, { color: colors.primary }]}>Add Item Photo</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>ITEM NAME *</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              placeholder="e.g. Artisanal Sourdough"
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 2 }]}>
              <Text style={[styles.label, { color: colors.text }]}>PRICE *</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                placeholder="0.00"
                keyboardType="numeric"
                value={price}
                onChangeText={setPrice}
              />
            </View>
            <View style={{ width: 12 }} />
            <View style={[styles.inputGroup, { flex: 3 }]}>
              <Text style={[styles.label, { color: colors.text }]}>UNIT (e.g. per box)</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                placeholder="per item"
                value={priceUnit}
                onChangeText={setPriceUnit}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>CATEGORY WITHIN BUSINESS</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              placeholder="e.g. Breads, Desserts..."
              value={category}
              onChangeText={setCategory}
            />
            {existingCategories.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestScroll}>
                {existingCategories.map(cat => (
                  <TouchableOpacity 
                    key={cat} 
                    onPress={() => setCategory(cat)}
                    style={[styles.suggestChip, { backgroundColor: colors.surface2 }]}
                  >
                    <Text style={{ fontSize: 12 }}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>AVAILABILITY</Text>
            <View style={styles.availGrid}>
              {AVAILABILITY_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={[
                    styles.availChip,
                    availability === opt ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.surface, borderColor: colors.border }
                  ]}
                  onPress={() => setAvailability(opt)}
                >
                  <Text style={[styles.availText, { color: availability === opt ? 'white' : colors.text }]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>DESCRIPTION (OPTIONAL)</Text>
            <TextInput
              style={[styles.textArea, { color: colors.text, borderColor: colors.border }]}
              placeholder="What makes this item special?"
              multiline
              numberOfLines={3}
              value={description}
              onChangeText={setDescription}
              textAlignVertical="top"
            />
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.submitBtn, { backgroundColor: colors.primary }]} 
          onPress={handleSave}
          disabled={isUploading}
        >
          {isUploading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>{offeringId ? 'Save Changes' : 'Add to Catalog'}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 24, paddingTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 32 },
  backButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800' },
  photoPicker: { height: 200, borderRadius: 24, borderWidth: 1, borderStyle: 'dashed', overflow: 'hidden', marginBottom: 32 },
  previewImage: { width: '100%', height: '100%' },
  photoPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  photoText: { fontSize: 14, fontWeight: '700' },
  form: { gap: 20 },
  inputGroup: { marginBottom: 4 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8, marginLeft: 4 },
  input: { height: 56, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, fontSize: 16 },
  textArea: { height: 100, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingTop: 16, fontSize: 16 },
  row: { flexDirection: 'row' },
  suggestScroll: { flexDirection: 'row', marginTop: 8 },
  suggestChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginRight: 8 },
  availGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  availChip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  availText: { fontSize: 12, fontWeight: '600' },
  footer: { padding: 24, paddingBottom: 40 },
  submitBtn: { height: 58, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  submitBtnText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
});
