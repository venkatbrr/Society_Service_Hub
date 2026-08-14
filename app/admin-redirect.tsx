import { LinkExternal02 } from '@untitledui/icons/LinkExternal02';
import { LogOut01 } from '@untitledui/icons/LogOut01';
import { Shield01 } from '@untitledui/icons/Shield01';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Verandah } from '../constants/Colors';
import { VerandahBorder, VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';
import { useAuth } from '../context/AuthContext';
import { replaceTracked } from '../lib/navigation';
import { goToLanding, siteUrl } from '../lib/siteUrl';

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
      if (!goToLanding()) replaceTracked(router, '/login');
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
          <Shield01 size={48} color={Verandah.primary} aria-hidden={true} />
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
          <LinkExternal02 size={18} color={Verandah.primaryFg} aria-hidden={true} />
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
              <LogOut01 size={18} color={Verandah.textSecondary} aria-hidden={true} />
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
    backgroundColor: Verandah.paper,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: Verandah.card,
    borderRadius: VerandahRadius.card,
    borderWidth: VerandahBorder.tile,
    borderColor: Verandah.borderHair,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    ...Verandah.shadowCard,
  },
  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: Verandah.cardMuted,
    borderWidth: 0.5,
    borderColor: Verandah.borderHair,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '400',
    color: Verandah.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: Verandah.textSecondary,
    textAlign: 'center',
    marginBottom: 28,
    fontFamily: VerandahType.sansFamily,
  },
  primaryButton: {
    backgroundColor: Verandah.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 14,
    borderRadius: VerandahRadius.button,
    marginBottom: 12,
  },
  primaryButtonText: {
    color: Verandah.primaryFg,
    fontSize: 15,
    fontWeight: '600',
    fontFamily: VerandahType.sansFamily,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 12,
    borderRadius: VerandahRadius.button,
  },
  secondaryButtonText: {
    color: Verandah.textSecondary,
    ...VerandahType.bodyBold,
  },
});
