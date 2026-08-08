import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import Toast from 'react-native-toast-message';
import { EMAIL_AUTH_UI_ENABLED } from '../constants/authFlags';
import { Verandah } from '../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahType } from '../constants/Verandah';
import { getAuthErrorMessage, signInWithEmail, signUpWithEmail } from '../lib/auth';
import { siteUrl } from '../lib/siteUrl';
import { supabase } from '../lib/supabase';

// Google Sign-In native module — only available on Android/iOS.
let GoogleSignin: any = null;
let statusCodes: any = {};
if (Platform.OS !== 'web') {
  const gsi = require('@react-native-google-signin/google-signin');
  GoogleSignin = gsi.GoogleSignin;
  statusCodes = gsi.statusCodes;
}

type AuthMode = 'signIn' | 'signUp';

export default function LoginScreen() {
  const router = useRouter();

  const [mode, setMode] = useState<AuthMode>('signIn');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const errorDesc = params.get('error_description') || params.get('error');
      if (errorDesc) {
        Toast.show({
          type: 'error',
          text1: 'Google Sign-In Error',
          text2: errorDesc.replace(/\+/g, ' '),
          visibilityTime: 6000,
        });
      }
    }
  }, []);

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTc, setAgreeTc] = useState(false);

  const toggleMode = () => {
    setMode(mode === 'signIn' ? 'signUp' : 'signIn');
    // Clear passwords on toggle
    setPassword('');
    setConfirmPassword('');
  };

  const validateForm = () => {
    if (!email.trim() || !email.includes('@')) {
      Toast.show({ type: 'error', text1: 'Invalid Email', text2: 'Please enter a valid email address.' });
      return false;
    }
    if (mode === 'signUp') {
      if (!fullName.trim()) {
        Toast.show({ type: 'error', text1: 'Missing Name', text2: 'Please enter your full name.' });
        return false;
      }
      if (password !== confirmPassword) {
        Toast.show({ type: 'error', text1: 'Mismatch', text2: 'Passwords do not match.' });
        return false;
      }
      if (!agreeTc) {
        Toast.show({
          type: 'error',
          text1: 'Terms & Conditions',
          text2: 'You must agree to the Terms & Conditions to sign up.',
        });
        return false;
      }
    }
    return true;
  };

  const handleEmailAuth = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      if (mode === 'signUp') {
        const { data, error } = await signUpWithEmail(email.trim(), password, fullName.trim());
        if (error) throw error;

        if (data.session) {
          Toast.show({
            type: 'success',
            text1: 'Welcome!',
            text2: 'Account created and signed in successfully.',
            visibilityTime: 4000
          });
        } else {
          // No session means Supabase is holding the account until the email is
          // confirmed ("Confirm email" is ON). Signing in will fail until then,
          // so send them to their inbox rather than back to the sign-in form.
          Toast.show({
            type: 'success',
            text1: 'Check your email',
            text2: `We sent a confirmation link to ${email.trim()}. Click it, then sign in.`,
            visibilityTime: 10000
          });
          // After a short delay, switch to sign-in mode for them
          setTimeout(() => setMode('signIn'), 2500);
        }
      } else {
        const { error } = await signInWithEmail(email.trim(), password);
        if (error) throw error;
      }
    } catch (error: any) {
      const isAlreadyRegistered = mode === 'signUp' && error?.message === 'User already registered';

      if (isAlreadyRegistered) {
        setMode('signIn');
        setConfirmPassword('');
        Toast.show({
          type: 'error',
          text1: 'Email already registered',
          text2: 'This email already has an account. Please sign in or use Forgot password.',
          visibilityTime: 6000,
        });
      } else {
        Toast.show({ type: 'error', text1: 'Auth Error', text2: getAuthErrorMessage(error) });
      }
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    setGoogleLoading(true);
    try {
      if (Platform.OS === 'web') {
        // Web: use Supabase OAuth redirect flow
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const redirectUrl = origin ? `${origin}/login` : undefined;

        try {
          const pending = window.sessionStorage.getItem('wooru.pendingRoute');
          if (pending) window.sessionStorage.setItem('wooru.pendingRoute', pending);
        } catch { /* private mode */ }

        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUrl,
            queryParams: {
              prompt: 'select_account',
            },
          },
        });
        if (error) throw error;
        // The browser will redirect — no further code runs here.
        return;
      }

      // Native: use Google Sign-In native module + ID token
      await GoogleSignin.hasPlayServices();

      // Force account picker instead of silently reusing the last Google account.
      try {
        await GoogleSignin.signOut();
      } catch {
        // Ignore: no active cached Google session is a valid state.
      }

      const userInfo = await GoogleSignin.signIn();

      if (userInfo.data?.idToken) {
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: userInfo.data.idToken,
        });

        if (error) throw error;
      } else {
        throw new Error('No ID token present!');
      }
    } catch (error: any) {
      const isNativeCancel =
        Platform.OS !== 'web' && error?.code === statusCodes.SIGN_IN_CANCELLED;

      if (!isNativeCancel) {
        console.warn('Google Sign-In Error:', error);
        Toast.show({
          type: 'error',
          text1: 'Could not sign in with Google',
          text2: error?.message || 'Please check your connection and try again.',
          visibilityTime: 6000,
        });
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Image
              source={require('../assets/images/icon.png')}
              style={styles.logoImage}
              resizeMode="cover"
            />
          </View>
          <Text style={styles.title}>Wooru</Text>
          <Text style={styles.subtitle}>
            {!EMAIL_AUTH_UI_ENABLED
              ? 'Sign in with Google to continue.'
              : mode === 'signIn'
                ? 'Welcome back! Sign in to continue.'
                : 'Join your community marketplace.'}
          </Text>
        </View>

        {/* Tab toggle */}
        {EMAIL_AUTH_UI_ENABLED && (
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={styles.tabButton}
            onPress={() => { setMode('signIn'); setPassword(''); setConfirmPassword(''); }}
            activeOpacity={0.7}
          >
            {mode === 'signIn' ? (
              <View style={styles.tabActive}>
                <Text style={styles.tabActiveText}>Sign in</Text>
              </View>
            ) : (
              <View style={styles.tabInactive}>
                <Text style={[styles.tabInactiveText, { color: Verandah.textMuted }]}>Sign in</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tabButton}
            onPress={() => { setMode('signUp'); setPassword(''); setConfirmPassword(''); }}
            activeOpacity={0.7}
          >
            {mode === 'signUp' ? (
              <View style={styles.tabActive}>
                <Text style={styles.tabActiveText}>Sign up</Text>
              </View>
            ) : (
              <View style={styles.tabInactive}>
                <Text style={[styles.tabInactiveText, { color: Verandah.textMuted }]}>Sign up</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
        )}

        <View style={styles.form}>
          {EMAIL_AUTH_UI_ENABLED && (
          <>
          {mode === 'signUp' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Full name</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="person-outline" size={18} color={Verandah.textTertiary} style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.input}
                    placeholder="Aarav Sharma"
                    placeholderTextColor={Verandah.textTertiary}
                    value={fullName}
                    onChangeText={setFullName}
                  />
                </View>
              </View>
            </>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email address</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={18} color={Verandah.textTertiary} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.input}
                placeholder="your@email.com"
                placeholderTextColor={Verandah.textTertiary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={18} color={Verandah.textTertiary} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={Verandah.textTertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={Verandah.textTertiary} />
              </TouchableOpacity>
            </View>
          </View>

          {mode === 'signUp' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Confirm password</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={Verandah.textTertiary} style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm password"
                    placeholderTextColor={Verandah.textTertiary}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                  />
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setAgreeTc(!agreeTc)}
                style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 16 }}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={agreeTc ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={agreeTc ? Verandah.accent : Verandah.textMuted}
                />
                <Text style={{ marginLeft: 8, fontSize: 13, color: Verandah.textSecondary }}>
                  I agree to the{' '}
                  <Text
                    style={{ color: Verandah.accent, textDecorationLine: 'underline' }}
                    onPress={(e) => {
                      e.stopPropagation();
                      Linking.openURL(siteUrl('/terms'));
                    }}
                  >
                    Terms & Conditions
                  </Text>
                </Text>
              </TouchableOpacity>
            </>
          )}

          {mode === 'signIn' && (
            <TouchableOpacity
              onPress={() => router.push('/forgot-password')}
              style={styles.forgotPassword}
            >
              <Text style={styles.forgotPasswordText}>Forgot password?</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={handleEmailAuth}
            disabled={loading || googleLoading}
            activeOpacity={0.8}
            style={styles.authButton}
          >
            {loading ? (
              <ActivityIndicator color={Verandah.primaryFg} />
            ) : (
              <Text style={styles.authButtonText}>
                {mode === 'signIn' ? 'Sign in' : 'Create account'}
              </Text>
            )}
          </TouchableOpacity>

          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or</Text>
          </View>
          </>
          )}

          <TouchableOpacity
            style={styles.googleButton}
            onPress={signInWithGoogle}
            disabled={loading || googleLoading}
          >
            {googleLoading ? (
              <ActivityIndicator color={Verandah.primary} />
            ) : (
              <>
                <Ionicons name="logo-google" size={18} color={Verandah.primary} style={{ marginRight: 8 }} />
                <Text style={styles.googleButtonText}>
                  Continue with Google
                </Text>
              </>
            )}
          </TouchableOpacity>

          {EMAIL_AUTH_UI_ENABLED ? (
            <View style={styles.toggleModeContainer}>
              <Text style={styles.toggleModeText}>
                {mode === 'signIn' ? "Don't have an account? " : "Already have an account? "}
              </Text>
              <TouchableOpacity onPress={toggleMode}>
                <Text style={styles.toggleModeLink}>
                  {mode === 'signIn' ? 'Sign up' : 'Sign in'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            // Google is the only path now, so the sign-up form's terms checkbox
            // is never shown. This keeps the consent moment visible.
            <View style={styles.toggleModeContainer}>
              <Text style={styles.toggleModeText}>By continuing you agree to our </Text>
              <TouchableOpacity onPress={() => Linking.openURL(siteUrl('/terms'))}>
                <Text style={styles.toggleModeLink}>Terms</Text>
              </TouchableOpacity>
              <Text style={styles.toggleModeText}> and </Text>
              <TouchableOpacity onPress={() => Linking.openURL(siteUrl('/privacy'))}>
                <Text style={styles.toggleModeLink}>Privacy Policy</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Verandah.surface,
  },
  scrollContent: {
    padding: 24,
    paddingTop: VerandahLayout.screenPaddingTop,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: VerandahRadius.xl,
    backgroundColor: Verandah.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoEmoji: {
    fontSize: 36,
    lineHeight: 40,
  },
  title: {
    ...VerandahType.display,
    color: Verandah.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: Verandah.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  tabContainer: {
    flexDirection: 'row',
    borderRadius: VerandahRadius.xl,
    padding: 4,
    marginBottom: 28,
    backgroundColor: Verandah.cardMuted,
  },
  tabButton: {
    flex: 1,
  },
  tabActive: {
    paddingVertical: 12,
    borderRadius: VerandahRadius.xl,
    alignItems: 'center',
    backgroundColor: Verandah.card,
  },
  tabActiveText: {
    color: Verandah.primary,
    fontSize: 15,
    fontWeight: '500',
  },
  tabInactive: {
    paddingVertical: 12,
    borderRadius: VerandahRadius.xl,
    alignItems: 'center',
  },
  tabInactiveText: {
    fontSize: 15,
    fontWeight: '400',
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: Verandah.textTertiary,
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: Verandah.borderStrong,
    borderRadius: VerandahRadius.md,
    backgroundColor: Verandah.card,
    paddingHorizontal: 16,
    height: 54,
  },
  inputEmoji: {
    fontSize: 20,
    lineHeight: 24,
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: Verandah.textPrimary,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginTop: -8,
  },
  forgotPasswordText: {
    fontSize: 14,
    fontWeight: '500',
    color: Verandah.accent,
  },
  authButton: {
    marginTop: 10,
    height: 54,
    borderRadius: VerandahRadius.xl,
    backgroundColor: Verandah.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authButtonText: {
    color: Verandah.primaryFg,
    fontSize: 17,
    fontWeight: '500',
  },
  dividerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: Verandah.border,
  },
  dividerText: {
    position: 'absolute',
    paddingHorizontal: 16,
    fontSize: 12,
    fontWeight: '500',
    color: Verandah.textMuted,
    backgroundColor: Verandah.surface,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    borderRadius: VerandahRadius.lg,
    borderWidth: 0.5,
    borderColor: Verandah.borderStrong,
    backgroundColor: 'transparent',
    gap: 12,
  },
  googleEmoji: {
    fontSize: 20,
    lineHeight: 24,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: Verandah.primary,
  },
  toggleModeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
  },
  toggleModeText: {
    fontSize: 15,
    color: Verandah.textMuted,
  },
  toggleModeLink: {
    fontSize: 15,
    fontWeight: '500',
    color: Verandah.accent,
  },
});
