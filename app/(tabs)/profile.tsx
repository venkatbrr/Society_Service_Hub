import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/Colors';
import Toast from 'react-native-toast-message';

export default function ProfileScreen() {
  const { user, signOut, communityId } = useAuth();
  const [communityDetails, setCommunityDetails] = useState<{name: string, code: string} | null>(null);

  const colors = Colors.light;

  useEffect(() => {
    async function fetchCommunity() {
      if (communityId) {
        const { data } = await supabase
          .from('communities')
          .select('name, code')
          .eq('id', communityId)
          .single();
        
        if (data) {
          setCommunityDetails(data);
        }
      }
    }
    fetchCommunity();
  }, [communityId]);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error signing out' });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.profileHeader}>
          {user?.user_metadata?.avatar_url ? (
            <Image 
              source={{ uri: user.user_metadata.avatar_url }} 
              style={styles.avatar} 
            />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary + '10' }]}>
              <Ionicons name="person" size={32} color={colors.primary} />
            </View>
          )}
          <View style={styles.profileInfo}>
            <Text style={[styles.name, { color: colors.text }]}>
              {user?.user_metadata?.full_name || 'User'}
            </Text>
            <Text style={[styles.email, { color: colors.textMuted }]}>
              {user?.email}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.sectionHeader}>
          <Ionicons name="business" size={20} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>My Community</Text>
        </View>
        
        <View style={styles.infoRow}>
          <Text style={[styles.label, { color: colors.textMuted }]}>NAME</Text>
          <Text style={[styles.value, { color: colors.text }]}>{communityDetails?.name || '---'}</Text>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <View style={styles.infoRow}>
          <Text style={[styles.label, { color: colors.textMuted }]}>INVITE CODE</Text>
          <View style={[styles.codeBadge, { backgroundColor: colors.surface2 }]}>
            <Text style={[styles.codeValue, { color: colors.primary }]}>
              {communityDetails?.code || '---'}
            </Text>
          </View>
        </View>
        
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Share this code with your neighbors so they can join!
        </Text>
      </View>

      <View style={styles.spacer} />

      <TouchableOpacity 
        style={[styles.signOutButton, { backgroundColor: colors.accent + '10' }]} 
        onPress={handleSignOut}
      >
        <Ionicons name="log-out-outline" size={20} color={colors.accent} />
        <Text style={[styles.signOutText, { color: colors.accent }]}>Sign Out</Text>
      </TouchableOpacity>
      
      <Text style={[styles.version, { color: colors.textMuted }]}>Society Service Hub v1.0.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 60,
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  card: {
    padding: 20,
    borderRadius: 24,
    marginBottom: 24,
    borderWidth: 1,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  name: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 2,
  },
  email: {
    fontSize: 14,
    fontWeight: '500',
  },
  section: {
    padding: 20,
    borderRadius: 24,
    marginBottom: 24,
    borderWidth: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  infoRow: {
    marginVertical: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
  },
  codeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  codeValue: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 2,
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },
  hint: {
    fontSize: 12,
    marginTop: 12,
    lineHeight: 18,
  },
  spacer: {
    flex: 1,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 18,
    gap: 8,
    marginBottom: 16,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '700',
  },
  version: {
    textAlign: 'center',
    marginBottom: 40,
    fontSize: 12,
    fontWeight: '500',
  },
});
