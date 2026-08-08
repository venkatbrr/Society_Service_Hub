import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahType } from '../constants/Verandah';
import { useAuth } from '../context/AuthContext';
import { siteUrl } from '../lib/siteUrl';

export default function AdminRedirectScreen() {
  const router = useRouter();
  const { signOut, user } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleOpenAdmin = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = '/admin/index.html';
    } else {
      Linking.openURL(siteUrl('/admin/index.html')).catch(() => {
        Toast.show({ type: 'error', text1: 'Could not open Admin Dashboard' });
      });
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut();
      router.replace('/login');
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Sign out failed',
        text2: error.message ?? 'Please try again.',
      });
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons name="desktop-outline" size={48} color={Verandah.primary} />
        </View>
        
        <Text style={styles.title}>Platform Admin Console</Text>
        
        <Text style={styles.description}>
          You are signed in as Platform Admin{user?.email ? ` (${user.email})` : ''}. Click below to open the Admin Console to manage community approvals, society settings, and fund access.
        </Text>

        <TouchableOpacity 
          style={styles.primaryButton} 
          onPress={handleOpenAdmin}
          activeOpacity={0.8}
        >
          <Ionicons name="open-outline" size={20} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>Open Admin Dashboard</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.secondaryButton} 
          onPress={handleLogout} 
          disabled={loggingOut}
          activeOpacity={0.8}
        >
          {loggingOut ? (
            <ActivityIndicator color={Verandah.primary} />
          ) : (
            <>
              <Ionicons name="log-out-outline" size={18} color={Verandah.textSecondary} />
              <Text style={styles.secondaryButtonText}>Sign Out</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Verandah.surface,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: Verandah.card,
    borderRadius: VerandahRadius.lg,
    borderWidth: 1,
    borderColor: Verandah.border,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: Verandah.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Verandah.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    ...VerandahType.display,
    color: Verandah.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    ...VerandahType.body,
    color: Verandah.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Verandah.primary,
    borderRadius: VerandahRadius.md,
    width: '100%',
    paddingVertical: 14,
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    ...VerandahType.bodyBold,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.md,
    width: '100%',
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: Verandah.textSecondary,
    ...VerandahType.bodyBold,
  },
});
