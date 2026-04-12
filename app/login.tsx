import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

export default function LoginScreen() {
  const [isSigningIn, setIsSigningIn] = useState(false);

  // We are forcing light mode as requested by the user
  const colors = Colors.light;

  const signIn = async () => {
    setIsSigningIn(true);
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      
      if (userInfo.data?.idToken) {
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: userInfo.data.idToken,
        });
        
        if (error) {
          throw error;
        }
      } else {
        throw new Error('no ID token present!');
      }
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        // user cancelled the login flow
      } else if (error.code === statusCodes.IN_PROGRESS) {
        // operation (e.g. sign in) is in progress already
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        // play services not available or outdated
        Toast.show({ type: 'error', text1: 'Error', text2: 'Play services not available' });
      } else {
        // some other error happened
        console.error('Google Sign-In Error:', error);
        
        // Better error message for debugging
        const errorMsg = error.message || error.code || 'Failed to sign in';
        Toast.show({ type: 'error', text1: 'Google Auth Error', text2: errorMsg, visibilityTime: 5000 });
        
        // For development/testing only - bypass if configured
        if (process.env.NODE_ENV === 'development') {
           Toast.show({ type: 'info', text1: 'Dev Mode', text2: 'Please create dummy user in Supabase to test', visibilityTime: 4000 });
        }
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Ionicons name="home" size={48} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Society Service Hub</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Trusted service providers for your community
        </Text>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.googleButton, { backgroundColor: colors.surface }]}
          onPress={signIn}
          disabled={isSigningIn}
        >
          <Ionicons name="logo-google" size={24} color={colors.primary} />
          <Text style={[styles.googleButtonText, { color: colors.text }]}>
            {isSigningIn ? 'Signing in...' : 'Sign in with Google'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    flex: 2,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  logoContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#6C63FF20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'flex-start',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3.84,
    elevation: 2,
    gap: 12,
  },
  googleButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
});
