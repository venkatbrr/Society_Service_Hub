import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Avatar } from './Avatar';
import { BaseCard } from './BaseCard';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahType } from '../constants/Verandah';
import { Tables } from '../lib/database.types';

export type McnPostWithProfile = Tables<'mcn_posts'> & {
  profiles: { full_name: string | null; flat_number: string | null } | null;
};

interface McnPostCardProps {
  post: McnPostWithProfile;
  currentUserId: string;
  isCommunityLead: boolean;
  onMarkUnavailable: (id: string) => void;
  onDelete: (id: string) => void;
}

export function McnPostCard({ post, currentUserId, isCommunityLead, onMarkUnavailable, onDelete }: McnPostCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  const isOwner = post.user_id === currentUserId;
  const canMarkUnavailable = isOwner;
  const canDelete = isOwner || isCommunityLead;
  const showMenuIcon = canMarkUnavailable || canDelete;

  const handleContact = async () => {
    if (!post.contact_hint) {
      Toast.show({ type: 'info', text1: 'No contact info provided.' });
      return;
    }
    
    // Check if it's exactly a 10 digit number after removing non-digits
    const digitsOnly = post.contact_hint.replace(/\D/g, '');
    if (digitsOnly.length === 10) {
      const url = `whatsapp://send?phone=91${digitsOnly}`;
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
        return;
      } else {
        const waWebUrl = `https://wa.me/91${digitsOnly}`;
        await Linking.openURL(waWebUrl);
        return;
      }
    }

    // Otherwise just copy to clipboard
    await Clipboard.setStringAsync(post.contact_hint);
    Toast.show({ type: 'success', text1: 'Contact info copied' });
  };

  return (
    <BaseCard style={styles.card} padding={16}>
      <View style={styles.header}>
        <Avatar name={post.profiles?.full_name || 'Resident'} size={40} />
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: Verandah.textPrimary }]}>{post.title}</Text>
          <Text style={[styles.meta, { color: Verandah.textTertiary }]}>
            {post.profiles?.full_name || 'Resident'}
            {post.profiles?.flat_number ? ` · ${post.profiles.flat_number}` : ''}
          </Text>
        </View>
        {showMenuIcon && (
          <TouchableOpacity onPress={() => setShowMenu(true)} style={styles.menuBtn}>
            <Ionicons name="ellipsis-vertical" size={20} color={Verandah.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {post.description ? (
        <Text style={[styles.description, { color: Verandah.textSecondary }]} numberOfLines={2}>
          {post.description}
        </Text>
      ) : null}

      <View style={styles.footer}>
        <TouchableOpacity style={styles.contactBtn} onPress={handleContact}>
          <Text style={styles.contactBtnText}>Contact</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowMenu(false)}>
          <View style={styles.menuContainer}>
            {canMarkUnavailable && post.is_available && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  onMarkUnavailable(post.id);
                }}
              >
                <Ionicons name="close-circle-outline" size={20} color={Verandah.textPrimary} />
                <Text style={styles.menuText}>Mark as unavailable</Text>
              </TouchableOpacity>
            )}
            {canDelete && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  onDelete(post.id);
                }}
              >
                <Ionicons name="trash-outline" size={20} color={Verandah.danger} />
                <Text style={[styles.menuText, { color: Verandah.danger }]}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Modal>
    </BaseCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Verandah.border,
    shadowColor: 'transparent',
    elevation: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerText: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  title: {
    ...VerandahType.bodyBold,
    marginBottom: 2,
  },
  meta: {
    ...VerandahType.caption,
  },
  menuBtn: {
    padding: 4,
    marginRight: -4,
  },
  description: {
    ...VerandahType.body,
    marginBottom: 16,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  contactBtn: {
    borderWidth: 1,
    borderColor: Verandah.primary,
    borderRadius: VerandahRadius.pill,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  contactBtnText: {
    color: Verandah.primary,
    fontSize: 13,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Verandah.borderStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContainer: {
    backgroundColor: Verandah.surface,
    borderRadius: VerandahRadius.lg,
    width: 250,
    padding: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  menuText: {
    fontSize: 15,
    fontWeight: '500',
    color: Verandah.textPrimary,
  },
});
