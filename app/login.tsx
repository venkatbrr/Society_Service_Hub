import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
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
import { Verandah } from '../constants/Colors';
import { APP_EMOJIS } from '../constants/emojis';
import { VerandahRadius, VerandahType , VerandahLayout } from '../constants/Verandah';
import { getAuthErrorMessage, signInWithEmail, signUpWithEmail } from '../lib/auth';
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

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

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
          Toast.show({
            type: 'success',
            text1: 'Account Created',
            text2: 'Sign up successful! You can now try to sign in with your email.',
            visibilityTime: 8000
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
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin,
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
      if (error.code !== statusCodes.SIGN_IN_CANCELLED) {
        console.warn('Google Sign-In Error:', error);
        Toast.show({
          type: 'error',
          text1: 'Google Auth Error',
          text2: error.message || 'Failed to sign in with Google'
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
            <Ionicons name="business" size={48} color={Verandah.primaryFg} />
          </View>
          <Text style={styles.title}>Society Service Hub</Text>
          <Text style={styles.subtitle}>
            {mode === 'signIn' ? 'Welcome back! Sign in to continue.' : 'Join your community marketplace.'}
          </Text>
        </View>

        {/* Tab toggle */}
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

        <View style={styles.form}>
          {mode === 'signUp' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Full name</Text>
                <View style={styles.inputContainer}>
                  <Text style={styles.inputEmoji}>{APP_EMOJIS.profile}</Text>
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
              <Text style={styles.inputEmoji}>{APP_EMOJIS.mail}</Text>
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
              <Text style={styles.inputEmoji}>{APP_EMOJIS.lock}</Text>
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={Verandah.textTertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Text style={styles.inputEmoji}>{showPassword ? APP_EMOJIS.hidden : APP_EMOJIS.visible}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {mode === 'signUp' && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm password</Text>
              <View style={styles.inputContainer}>
                <Text style={styles.inputEmoji}>{APP_EMOJIS.admin}</Text>
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

          <TouchableOpacity
            style={styles.googleButton}
            onPress={signInWithGoogle}
            disabled={loading || googleLoading}
          >
            {googleLoading ? (
              <ActivityIndicator color={Verandah.primary} />
            ) : (
              <>
                <Text style={styles.googleEmoji}>{APP_EMOJIS.google}</Text>
                <Text style={styles.googleButtonText}>
                  Continue with Google
                </Text>
              </>
            )}
          </TouchableOpacity>

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
