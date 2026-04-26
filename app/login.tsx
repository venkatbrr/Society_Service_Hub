import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { LinearGradient } from 'expo-linear-gradient';
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
import { Colors } from '../constants/Colors';
import { APP_EMOJIS } from '../constants/emojis';
import { getAuthErrorMessage, signInWithEmail, signUpWithEmail } from '../lib/auth';
import { supabase } from '../lib/supabase';

type AuthMode = 'signIn' | 'signUp';

export default function LoginScreen() {
  const router = useRouter();
  const colors = Colors.light;

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
      Toast.show({ type: 'error', text1: 'Auth Error', text2: getAuthErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    setGoogleLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
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
        console.error('Google Sign-In Error:', error);
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
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      {/* Subtle gradient overlay at top */}
      <LinearGradient
        colors={[colors.gradientStart + '12', colors.gradientEnd + '08', 'transparent']}
        style={styles.gradientOverlay}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            style={styles.logoContainer}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.logoEmoji}>{APP_EMOJIS.community}</Text>
          </LinearGradient>
          <Text style={[styles.title, { color: colors.text }]}>Society Service Hub</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {mode === 'signIn' ? 'Welcome back! Sign in to continue.' : 'Join your community marketplace.'}
          </Text>
        </View>

        {/* Tab toggle */}
        <View style={[styles.tabContainer, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
          <TouchableOpacity
            style={[styles.tabButton]}
            onPress={() => { setMode('signIn'); setPassword(''); setConfirmPassword(''); }}
            activeOpacity={0.7}
          >
            {mode === 'signIn' ? (
              <LinearGradient
                colors={[colors.gradientStart, colors.gradientEnd]}
                style={styles.tabGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.tabActiveText}>Sign In</Text>
              </LinearGradient>
            ) : (
              <View style={styles.tabInactive}>
                <Text style={[styles.tabInactiveText, { color: colors.textMuted }]}>Sign In</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton]}
            onPress={() => { setMode('signUp'); setPassword(''); setConfirmPassword(''); }}
            activeOpacity={0.7}
          >
            {mode === 'signUp' ? (
              <LinearGradient
                colors={[colors.gradientStart, colors.gradientEnd]}
                style={styles.tabGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.tabActiveText}>Sign Up</Text>
              </LinearGradient>
            ) : (
              <View style={styles.tabInactive}>
                <Text style={[styles.tabInactiveText, { color: colors.textMuted }]}>Sign Up</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          {mode === 'signUp' && (
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>FULL NAME</Text>
              <View style={[styles.inputContainer, { backgroundColor: colors.glass, borderColor: colors.border }]}>
                <Text style={styles.inputEmoji}>{APP_EMOJIS.profile}</Text>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="John Doe"
                  placeholderTextColor={colors.textMuted}
                  value={fullName}
                  onChangeText={setFullName}
                />
              </View>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>EMAIL ADDRESS</Text>
            <View style={[styles.inputContainer, { backgroundColor: colors.glass, borderColor: colors.border }]}>
              <Text style={styles.inputEmoji}>{APP_EMOJIS.mail}</Text>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="your@email.com"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>PASSWORD</Text>
            <View style={[styles.inputContainer, { backgroundColor: colors.glass, borderColor: colors.border }]}>
              <Text style={styles.inputEmoji}>{APP_EMOJIS.lock}</Text>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Password"
                placeholderTextColor={colors.textMuted}
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
              <Text style={[styles.label, { color: colors.text }]}>CONFIRM PASSWORD</Text>
              <View style={[styles.inputContainer, { backgroundColor: colors.glass, borderColor: colors.border }]}>
                <Text style={styles.inputEmoji}>{APP_EMOJIS.admin}</Text>
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Confirm Password"
                  placeholderTextColor={colors.textMuted}
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
              <Text style={[styles.forgotPasswordText, { color: colors.primary }]}>Forgot Password?</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={handleEmailAuth}
            disabled={loading || googleLoading}
            activeOpacity={0.8}
            style={styles.authButtonWrapper}
          >
            <LinearGradient
              colors={[colors.gradientStart, colors.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.authButton}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.authButtonText}>
                  {mode === 'signIn' ? 'Sign In' : 'Create Account'}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.dividerContainer}>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.textMuted, backgroundColor: colors.background }]}>OR</Text>
          </View>

          <TouchableOpacity
            style={[styles.googleButton, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}
            onPress={signInWithGoogle}
            disabled={loading || googleLoading}
          >
            {googleLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Text style={styles.googleEmoji}>{APP_EMOJIS.google}</Text>
                <Text style={[styles.googleButtonText, { color: colors.text }]}>
                  Continue with Google
                </Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.toggleModeContainer}>
            <Text style={[styles.toggleModeText, { color: colors.textMuted }]}>
              {mode === 'signIn' ? "Don't have an account? " : "Already have an account? "}
            </Text>
            <TouchableOpacity onPress={toggleMode}>
              <Text style={[styles.toggleModeLink, { color: colors.primary }]}>
                {mode === 'signIn' ? 'Sign Up' : 'Sign In'}
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
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
    zIndex: 0,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 0,
  },
  logoEmoji: {
    fontSize: 36,
    lineHeight: 40,
    color: '#FFF',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  tabContainer: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: 4,
    marginBottom: 28,
    borderWidth: 1,
  },
  tabButton: {
    flex: 1,
  },
  tabGradient: {
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
  },
  tabActiveText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  tabInactive: {
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
  },
  tabInactiveText: {
    fontSize: 15,
    fontWeight: '500',
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 16,
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
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginTop: -8,
  },
  forgotPasswordText: {
    fontSize: 14,
    fontWeight: '600',
  },
  authButtonWrapper: {
    marginTop: 10,
  },
  authButton: {
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 0,
  },
  authButtonText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700',
  },
  dividerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  divider: {
    width: '100%',
    height: 1,
  },
  dividerText: {
    position: 'absolute',
    paddingHorizontal: 16,
    fontSize: 12,
    fontWeight: '700',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
    gap: 12,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 0,
  },
  googleEmoji: {
    fontSize: 20,
    lineHeight: 24,
    color: '#16A34A',
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  toggleModeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
  },
  toggleModeText: {
    fontSize: 15,
  },
  toggleModeLink: {
    fontSize: 15,
    fontWeight: '700',
  },
});
