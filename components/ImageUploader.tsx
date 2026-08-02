import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahType } from '../constants/Verandah';
import { uploadToCloudinary } from '../lib/cloudinary';

interface ImageUploaderProps {
  /** Current image URL (from Cloudinary or null) */
  currentImageUrl: string | null;
  /** Called with the Cloudinary URL after successful upload */
  onImageUploaded: (url: string) => void;
  /** Called when user removes the image */
  onImageRemoved?: () => void;
  /** Cloudinary subfolder (e.g. "listings", "products") */
  subfolder?: string;
  /** Aspect ratio for the preview (default 16/9 for cover, 1 for product) */
  aspectRatio?: number;
  /** Placeholder text when no image */
  placeholder?: string;
  /** Compact mode for product thumbnails */
  compact?: boolean;
}

export function ImageUploader({
  currentImageUrl,
  onImageUploaded,
  onImageRemoved,
  subfolder,
  aspectRatio = 16 / 9,
  placeholder = 'Add photo',
  compact = false,
}: ImageUploaderProps) {
  const colors = Verandah;
  const [uploading, setUploading] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const displayUrl = localPreview || currentImageUrl;

  const pickImage = async () => {
    try {
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera roll access to upload photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: compact ? [1, 1] : [16, 9],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      setLocalPreview(asset.uri);
      setUploading(true);

      const url = await uploadToCloudinary(
        {
          uri: asset.uri,
          fileName: (asset as any).fileName || null,
          mimeType: (asset as any).mimeType || null,
          file: (asset as any).file || null,
        },
        subfolder,
      );
      onImageUploaded(url);
      setLocalPreview(null); // Clear local preview, use Cloudinary URL now

      Toast.show({ type: 'success', text1: 'Photo uploaded' });
    } catch (error: any) {
      console.error('Image upload error:', error);
      setLocalPreview(null);
      Toast.show({
        type: 'error',
        text1: 'Upload failed',
        text2: error?.message || 'Please try again',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    const doRemove = () => {
      setLocalPreview(null);
      onImageRemoved?.();
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const confirmed = window.confirm('Are you sure you want to remove this photo?');
      if (confirmed) {
        doRemove();
      }
      return;
    }

    Alert.alert('Remove photo', 'Are you sure you want to remove this photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: doRemove,
      },
    ]);
  };

  // --- Compact mode (product thumbnail) ---
  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <TouchableOpacity
          onPress={pickImage}
          disabled={uploading}
          activeOpacity={0.7}
          style={[
            styles.compactBox,
            { borderColor: colors.border, backgroundColor: colors.cardMuted },
          ]}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : displayUrl ? (
            <Image
              source={{ uri: displayUrl }}
              style={styles.compactImage}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <Ionicons name="camera-outline" size={22} color={colors.textMuted} />
          )}
        </TouchableOpacity>
        {displayUrl && !uploading && onImageRemoved ? (
          <TouchableOpacity
            onPress={handleRemove}
            style={styles.compactRemoveBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={20} color={colors.danger} />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  // --- Full mode (cover photo) ---
  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={pickImage}
        disabled={uploading}
        activeOpacity={0.7}
        style={[
          styles.imageBox,
          { borderColor: colors.border, backgroundColor: colors.cardMuted, aspectRatio },
        ]}
      >
        {uploading ? (
          <View style={styles.uploadingOverlay}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={[styles.uploadingText, { color: colors.textSecondary }]}>Uploading…</Text>
          </View>
        ) : displayUrl ? (
          <Image
            source={{ uri: displayUrl }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            transition={300}
          />
        ) : (
          <View style={styles.placeholderContent}>
            <Ionicons name="camera-outline" size={32} color={colors.textMuted} />
            <Text style={[styles.placeholderText, { color: colors.textMuted }]}>{placeholder}</Text>
          </View>
        )}
      </TouchableOpacity>

      {displayUrl && !uploading ? (
        <View style={styles.actions}>
          <TouchableOpacity onPress={pickImage} style={styles.actionBtn}>
            <Ionicons name="swap-horizontal-outline" size={16} color={colors.accent} />
            <Text style={[styles.actionText, { color: colors.accent }]}>Change</Text>
          </TouchableOpacity>
          {onImageRemoved ? (
            <TouchableOpacity onPress={handleRemove} style={styles.actionBtn}>
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
              <Text style={[styles.actionText, { color: colors.danger }]}>Remove</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  imageBox: {
    borderWidth: 1,
    borderRadius: VerandahRadius.lg,
    borderStyle: 'dashed',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderContent: {
    alignItems: 'center',
    gap: 8,
  },
  placeholderText: {
    ...VerandahType.caption,
  },
  uploadingOverlay: {
    alignItems: 'center',
    gap: 8,
  },
  uploadingText: {
    ...VerandahType.caption,
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  actionText: {
    ...VerandahType.captionBold,
  },

  // Compact (product thumbnail)
  compactContainer: {
    position: 'relative',
    marginRight: 10,
  },
  compactBox: {
    width: 56,
    height: 56,
    borderRadius: VerandahRadius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactImage: {
    width: '100%',
    height: '100%',
  },
  compactRemoveBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: Verandah.surface,
    borderRadius: 10,
    zIndex: 10,
  },
});
