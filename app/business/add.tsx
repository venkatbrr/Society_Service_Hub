import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

const CATEGORIES = ['Food', 'Baked Goods', 'Crafts', 'Beauty', 'Tailoring', 'Tutoring', 'Other'];

export default function AddBusinessScreen() {
  const { user, profile, communityId } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = Colors.light;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [operatingHours, setOperatingHours] = useState('');
  const [orderCutoff, setOrderCutoff] = useState(new Date());
  const [useCutoff, setUseCutoff] = useState(false);
  
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [image, setImage] = useState<string | null>(null);
  
  const [isUploading, setIsUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    checkExistingBusiness();
  }, [communityId, user?.id]);

  const checkExistingBusiness = async () => {
    if (!communityId || !user?.id) return;
    try {
      const { data, error } = await supabase
        .from('resident_businesses')
        .select('id')
        .eq('owner_id', user.id)
        .eq('community_id', communityId)
        .maybeSingle();
      
      if (data) {
        router.replace('/business/manage');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const onTimeChange = (event: DateTimePickerEvent, selectedTime?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selectedTime) {
      setOrderCutoff(selectedTime);
      setUseCutoff(true);
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const handleCreate = async () => {
    if (!name.trim() || !category || !description.trim() || !whatsappNumber.trim()) {
      Toast.show({ type: 'error', text1: 'Missing Fields', text2: 'Name, Category, Description, and WhatsApp are required' });
      return;
    }

    setIsUploading(true);
    try {
      let coverPhotoUrl = null;

      if (image) {
        const fileName = `${user?.id}_${Date.now()}.jpg`;
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
        
        coverPhotoUrl = publicUrl;
      }

      await supabase
        .from('resident_businesses')
        .insert({
          community_id: communityId as string,
          owner_id: user?.id as string,
          name: name.trim(),
          description: description.trim(),
          category,
          cover_photo_url: coverPhotoUrl,
          whatsapp_number: whatsappNumber.trim(),
          phone_number: phoneNumber.trim() || null,
          operating_hours: operatingHours.trim() || null,
          order_cutoff: useCutoff ? formatTime(orderCutoff) : null,
        })
        .select()
        .single();

      Toast.show({ type: 'success', text1: 'Business Created!', text2: 'Now add some offerings to your catalog' });
      router.replace('/business/manage');
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>List your business</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Share what you make with your community</Text>
        </View>

        <TouchableOpacity 
          style={[styles.photoPicker, { backgroundColor: colors.surface2, borderColor: colors.border }]} 
          onPress={pickImage}
        >
          {image ? (
            <Image source={{ uri: image }} style={styles.previewImage} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="camera-outline" size={32} color={colors.primary} />
              <Text style={[styles.photoText, { color: colors.primary }]}>Add Cover Photo</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>BUSINESS NAME *</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              placeholder="e.g. Grandma's Kitchen"
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>CATEGORY *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryChip,
                    category === cat ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.surface, borderColor: colors.border }
                  ]}
                  onPress={() => setCategory(cat)}
                >
                  <Text style={[styles.categoryText, { color: category === cat ? 'white' : colors.text }]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>DESCRIPTION *</Text>
            <TextInput
              style={[styles.textArea, { color: colors.text, borderColor: colors.border }]}
              placeholder="Tell your neighbors about what you offer..."
              multiline
              numberOfLines={4}
              value={description}
              onChangeText={setDescription}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.text }]}>WHATSAPP NUMBER *</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                placeholder="e.g. 9876543210"
                keyboardType="phone-pad"
                value={whatsappNumber}
                onChangeText={setWhatsappNumber}
              />
            </View>
            <View style={{ width: 12 }} />
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.text }]}>PHONE (OPTIONAL)</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                placeholder="e.g. 9876543210"
                keyboardType="phone-pad"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.text }]}>HOURS (e.g. Mon–Sat)</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                placeholder="e.g. 9 AM - 6 PM"
                value={operatingHours}
                onChangeText={setOperatingHours}
              />
            </View>
            <View style={{ width: 12 }} />
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={[styles.label, { color: colors.text }]}>ORDER CUTOFF</Text>
              <TouchableOpacity
                style={[styles.input, { borderColor: colors.border, justifyContent: 'center' }]}
                onPress={() => setShowTimePicker(true)}
              >
                <Text style={{ fontSize: 16, color: useCutoff ? colors.text : colors.textMuted }}>
                  {useCutoff ? formatTime(orderCutoff) : 'Set time'}
                </Text>
              </TouchableOpacity>
              {showTimePicker && (
                <DateTimePicker
                  value={orderCutoff}
                  mode="time"
                  display="default"
                  onChange={onTimeChange}
                />
              )}
            </View>
          </View>

          <View style={[styles.infoCard, { backgroundColor: colors.primary + '10' }]}>
            <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
            <Text style={[styles.infoText, { color: colors.primary }]}>
              You can add your products and prices after creating your business page.
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <TouchableOpacity 
          style={[styles.submitBtn, { backgroundColor: colors.primary }]} 
          onPress={handleCreate}
          disabled={isUploading}
        >
          {isUploading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>Create Business Page</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 24, paddingTop: 60 },
  header: { marginBottom: 32 },
  backButton: { marginBottom: 16 },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  subtitle: { fontSize: 16, marginTop: 4, lineHeight: 22 },
  photoPicker: { height: 180, borderRadius: 24, borderWidth: 1, borderStyle: 'dashed', overflow: 'hidden', marginBottom: 32 },
  previewImage: { width: '100%', height: '100%' },
  photoPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  photoText: { fontSize: 14, fontWeight: '700' },
  form: { gap: 20 },
  inputGroup: { marginBottom: 4 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8, marginLeft: 4 },
  input: { height: 56, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, fontSize: 16 },
  textArea: { height: 120, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingTop: 16, fontSize: 16 },
  row: { flexDirection: 'row' },
  categoryScroll: { flexDirection: 'row', marginBottom: 10 },
  categoryChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, marginRight: 8, borderWidth: 1 },
  categoryText: { fontSize: 14, fontWeight: '600' },
  infoCard: { flexDirection: 'row', padding: 16, borderRadius: 16, gap: 12, alignItems: 'center' },
  infoText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  footer: { padding: 24 },
  submitBtn: { height: 58, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  submitBtnText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
});
