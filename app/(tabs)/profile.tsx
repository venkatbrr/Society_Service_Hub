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
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.profileHeader}>
          {user?.user_metadata?.avatar_url ? (
            <Image 
              source={{ uri: user.user_metadata.avatar_url }} 
              style={styles.avatar} 
            />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name="person" size={40} color={colors.primary} />
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

      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>My Community</Text>
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Name</Text>
          <Text style={[styles.value, { color: colors.text }]}>{communityDetails?.name || 'Loading...'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Invite Code</Text>
          <Text style={[styles.codeValue, { color: colors.primary, backgroundColor: colors.primary + '10' }]}>
            {communityDetails?.code || '---'}
          </Text>
        </View>
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Share this code with your neighbors so they can join!
        </Text>
      </View>

      <TouchableOpacity 
        style={[styles.signOutButton, { borderColor: colors.accent }]} 
        onPress={handleSignOut}
      >
        <Ionicons name="log-out-outline" size={20} color={colors.accent} />
        <Text style={[styles.signOutText, { color: colors.accent }]}>Sign Out</Text>
      </TouchableOpacity>
      
      <Text style={[styles.version, { color: colors.textMuted }]}>Version 1.0.0</Text>
    </View>
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
    marginBottom: 24,
    borderWidth: 1,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  name: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
  },
  section: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
  },
  value: {
    fontSize: 16,
    fontWeight: '500',
  },
  codeValue: {
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 2,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    overflow: 'hidden',
  },
  hint: {
    fontSize: 12,
    marginTop: 8,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
  },
  version: {
    textAlign: 'center',
    marginTop: 24,
    fontSize: 12,
  },
});
