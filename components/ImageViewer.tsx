import { XClose } from '@untitledui/icons/XClose';
import { Image } from 'expo-image';
import React from 'react';
import { Modal, Pressable, StyleSheet, TouchableOpacity } from 'react-native';
import { Verandah } from '../constants/Colors';
import { cloudinaryUrl } from '../lib/cloudinary';
import { useWebBackToClose } from '../lib/useWebBackToClose';

interface ImageViewerProps {
  /** Cloudinary public id or absolute URL. `null` keeps the viewer closed. */
  uri: string | null;
  onClose: () => void;
}

/**
 * Full-screen tap-to-dismiss photo viewer. Any card or detail screen that shows
 * a cropped cover image should pair it with this so residents can open the
 * photo and read what is actually in it.
 *
 * Browser back closes the photo rather than leaving the screen — see
 * `useWebBackToClose`. Any hand-rolled full-screen image modal must call that
 * hook too, or back will skip a screen on web.
 */
export function ImageViewer({ uri, onClose }: ImageViewerProps) {
  useWebBackToClose(!!uri, onClose);

  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={(e) => {
            e.stopPropagation();
            onClose();
          }}
          hitSlop={8}
        >
          <XClose size={22} color={Verandah.surface} aria-hidden={true} />
        </TouchableOpacity>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.imageWrap}>
          <Image
            source={{ uri: cloudinaryUrl(uri || '') }}
            style={styles.image}
            contentFit="contain"
            transition={200}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  imageWrap: {
    width: '100%',
    height: '100%',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  closeBtn: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 2,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
});
