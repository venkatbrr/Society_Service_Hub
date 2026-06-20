import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahType } from '../constants/Verandah';
import { useAuth } from '../context/AuthContext';

export default function AdminRedirectScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

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
        
        <Text style={styles.title}>Admin Portal has moved</Text>
        
        <Text style={styles.description}>
          The admin panel is now a standalone web application. Open the admin dashboard in your web browser to manage approvals, communities, and funds access.
        </Text>

        <TouchableOpacity 
          style={styles.button} 
          onPress={handleLogout} 
          disabled={loggingOut}
        >
          {loggingOut ? (
            <ActivityIndicator color={Verandah.primaryFg} />
          ) : (
            <>
              <Ionicons name="log-out-outline" size={20} color={Verandah.primaryFg} />
              <Text style={styles.buttonText}>Log Out & Return</Text>
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
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Verandah.primary,
    borderRadius: VerandahRadius.md,
    width: '100%',
    paddingVertical: 14,
    cursor: 'pointer',
  },
  buttonText: {
    color: Verandah.primaryFg,
    ...VerandahType.bodyBold,
  },
});
