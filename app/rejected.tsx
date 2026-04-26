import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Colors } from '../constants/Colors';
import { useAuth } from '../context/AuthContext';

export default function RejectedScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const colors = Colors.light;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={[`${colors.accent}18`, `${colors.gradientEnd}12`, 'transparent']} style={styles.gradientOverlay} />

      <View style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
        <View style={[styles.iconWrap, { backgroundColor: `${colors.accent}14` }]}>
          <Ionicons name="close-circle-outline" size={30} color={colors.accent} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Request not approved</Text>
        <Text style={[styles.copy, { color: colors.textMuted }]}>The community could not approve your join request. You can request a different community or sign out.</Text>

        <TouchableOpacity onPress={() => router.push('/community-request')} activeOpacity={0.8}>
          <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Request a community</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={async () => {
            try {
              await signOut();
              router.replace('/login');
            } catch (error) {
              Toast.show({ type: 'error', text1: 'Sign out failed', text2: 'Please try again.' });
            }
          }}
          style={[styles.secondaryButton, { borderColor: colors.border }]}
          activeOpacity={0.8}
        >
          <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  iconWrap: {
    width: 68,
    height: 68,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  copy: {
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 22,
  },
  primaryButton: {
    minWidth: 240,
    height: 54,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 5,
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    minWidth: 240,
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 14,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
});