import { Check } from '@untitledui/icons/Check';
import { Eye } from '@untitledui/icons/Eye';
import { EyeOff } from '@untitledui/icons/EyeOff';
import { Lock01 } from '@untitledui/icons/Lock01';
import { Mail01 } from '@untitledui/icons/Mail01';
import { Phone } from '@untitledui/icons/Phone';
import { User01 } from '@untitledui/icons/User01';
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
import { VerandahLayout, VerandahRadius, VerandahSpace, VerandahType } from '../constants/Verandah';
import { getAuthErrorMessage, signInWithEmail, signUpWithEmail } from '../lib/auth';
import { goToLanding } from '../lib/siteUrl';
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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTc, setAgreeTc] = useState(false);

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
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Image
              source={require('../assets/images/icon.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.title}>Wooru</Text>
          <Text style={styles.subtitle}>
            {!EMAIL_AUTH_UI_ENABLED
              ? 'Your neighbourhood,\nall in one calm place.'
              : mode === 'signIn'
                ? 'Welcome back! Sign in to continue.'
                : 'Join your community marketplace.'}
          </Text>
        </View>

        {EMAIL_AUTH_UI_ENABLED && (
        <View style={styles.tabContainer}>
          <TouchableOpacity style={styles.tabButton} onPress={() => { setMode('signIn'); setPassword(''); setConfirmPassword(''); }} activeOpacity={0.7}>
            {mode === 'signIn' ? (
              <View style={styles.tabActive}><Text style={styles.tabActiveText}>Sign in</Text></View>
            ) : (
              <View style={styles.tabInactive}><Text style={styles.tabInactiveText}>Sign in</Text></View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabButton} onPress={() => { setMode('signUp'); setPassword(''); setConfirmPassword(''); }} activeOpacity={0.7}>
            {mode === 'signUp' ? (
              <View style={styles.tabActive}><Text style={styles.tabActiveText}>Sign up</Text></View>
            ) : (
              <View style={styles.tabInactive}><Text style={styles.tabInactiveText}>Sign up</Text></View>
            )}
          </TouchableOpacity>
        </View>
        )}

        <View style={styles.form}>
          {EMAIL_AUTH_UI_ENABLED && (
          <>
          {mode === 'signUp' && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full name</Text>
              <View style={styles.inputContainer}>
                <User01 size={18} color="rgba(240, 237, 227, 0.6)" style={{ marginRight: 8 }} aria-hidden={true} />
                <TextInput style={styles.input} placeholder="Aarav Sharma" placeholderTextColor="rgba(240, 237, 227, 0.4)" value={fullName} onChangeText={setFullName} />
              </View>
            </View>
          )}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email address</Text>
            <View style={styles.inputContainer}>
              <Mail01 size={18} color="rgba(240, 237, 227, 0.6)" style={{ marginRight: 8 }} aria-hidden={true} />
              <TextInput style={styles.input} placeholder="your@email.com" placeholderTextColor="rgba(240, 237, 227, 0.4)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputContainer}>
              <Lock01 size={18} color="rgba(240, 237, 227, 0.6)" style={{ marginRight: 8 }} aria-hidden={true} />
              <TextInput style={styles.input} placeholder="Password" placeholderTextColor="rgba(240, 237, 227, 0.4)" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff size={18} color="rgba(240, 237, 227, 0.6)" /> : <Eye size={18} color="rgba(240, 237, 227, 0.6)" />}
              </TouchableOpacity>
            </View>
          </View>
          {mode === 'signUp' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Confirm password</Text>
                <View style={styles.inputContainer}>
                  <Lock01 size={18} color="rgba(240, 237, 227, 0.6)" style={{ marginRight: 8 }} aria-hidden={true} />
                  <TextInput style={styles.input} placeholder="Confirm password" placeholderTextColor="rgba(240, 237, 227, 0.4)" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry={!showPassword} />
                </View>
              </View>
              <TouchableOpacity onPress={() => setAgreeTc(!agreeTc)} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 16 }} activeOpacity={0.8}>
                <View style={[styles.checkbox, agreeTc && styles.checkboxActive]}>
                  {agreeTc ? <Check size={14} color="#0F3732" /> : null}
                </View>
                <Text style={{ marginLeft: 8, fontSize: 13, color: 'rgba(240, 237, 227, 0.8)' }}>
                  I agree to the{' '}
                  <Text style={{ color: Verandah.gold, textDecorationLine: 'underline' }} onPress={(e) => { e.stopPropagation(); router.push('/legal?returnTo=login' as any); }}>Terms &amp; Privacy Policy</Text>
                </Text>
              </TouchableOpacity>
            </>
          )}
          {mode === 'signIn' && (
            <TouchableOpacity onPress={() => router.push('/forgot-password')} style={styles.forgotPassword}>
              <Text style={styles.forgotPasswordText}>Forgot password?</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleEmailAuth} disabled={loading || googleLoading} activeOpacity={0.8} style={styles.authButton}>
            {loading ? <ActivityIndicator color={Verandah.teal900} /> : <Text style={styles.authButtonText}>{mode === 'signIn' ? 'Sign in' : 'Create account'}</Text>}
          </TouchableOpacity>
          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or</Text>
          </View>
          </>
          )}
          <TouchableOpacity
            style={styles.phoneButton}
            onPress={() => router.push('/login-phone')}
            disabled={loading || googleLoading}
            activeOpacity={0.88}
          >
            <Phone size={20} color={Verandah.teal900} style={{ marginRight: 10 }} />
            <Text style={styles.phoneButtonText}>Continue with phone</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.googleButton} onPress={signInWithGoogle} disabled={loading || googleLoading} activeOpacity={0.88}>
            {googleLoading ? (
              <ActivityIndicator color={Verandah.cream} />
            ) : (
              <>
                <Text style={styles.googleG}>G</Text>
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>
          {EMAIL_AUTH_UI_ENABLED ? (
            <View style={styles.toggleModeContainer}>
              <Text style={styles.toggleModeText}>{mode === 'signIn' ? "Don't have an account? " : "Already have an account? "}</Text>
              <TouchableOpacity onPress={() => { setMode(mode === 'signIn' ? 'signUp' : 'signIn'); setPassword(''); setConfirmPassword(''); }}><Text style={styles.toggleModeLink}>{mode === 'signIn' ? 'Sign up' : 'Sign in'}</Text></TouchableOpacity>
            </View>
          ) : (
            <View style={styles.toggleModeContainer}>
              <Text style={styles.toggleModeText}>By continuing you agree to our </Text>
              <TouchableOpacity onPress={() => router.push('/legal?returnTo=login' as any)}><Text style={styles.toggleModeLink}>Terms &amp; Privacy Policy</Text></TouchableOpacity>
            </View>
          )}
          {Platform.OS === 'web' && (
            <TouchableOpacity onPress={() => goToLanding()} style={styles.homeButton} activeOpacity={0.85}>
              <Text style={styles.homeButtonText}>Back to home</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Verandah.teal900 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: VerandahLayout.screenPaddingTop,
    paddingBottom: 28,
  },
  homeButton: {
    marginTop: 18,
    height: 46,
    borderRadius: VerandahRadius.button,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  homeButtonText: { fontSize: 14, fontWeight: '600', color: Verandah.cream, fontFamily: VerandahType.sansFamily },
  header: { alignItems: 'center', marginBottom: 24 },
  logoContainer: { width: 78, height: 78, borderRadius: 22, backgroundColor: 'rgba(255, 255, 255, 0.08)', borderWidth: 1, borderColor: 'rgba(221, 169, 74, 0.3)', justifyContent: 'center', alignItems: 'center', marginBottom: 12, overflow: 'hidden' },
  logoImage: { width: '100%', height: '100%' },
  title: { fontFamily: VerandahType.serifFamily, fontSize: 42, fontWeight: '400', color: Verandah.cream, marginTop: 16, marginBottom: 8, textAlign: 'center', letterSpacing: -0.5 },
  subtitle: { fontFamily: VerandahType.sansFamily, fontSize: 14.5, color: 'rgba(240, 237, 227, 0.75)', textAlign: 'center', lineHeight: 21, maxWidth: 290 },
  tabContainer: { flexDirection: 'row', borderRadius: VerandahRadius.pill, padding: 3, marginBottom: 24, backgroundColor: 'rgba(0, 0, 0, 0.2)', borderWidth: 0.5, borderColor: 'rgba(255, 255, 255, 0.1)' },
  tabButton: { flex: 1 },
  tabActive: { paddingVertical: 9, borderRadius: VerandahRadius.pill, alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.15)' },
  tabActiveText: { color: Verandah.cream, fontSize: 14, fontWeight: '600', fontFamily: VerandahType.sansFamily },
  tabInactive: { paddingVertical: 9, borderRadius: VerandahRadius.pill, alignItems: 'center' },
  tabInactiveText: { fontSize: 14, fontWeight: '400', color: 'rgba(240, 237, 227, 0.5)', fontFamily: VerandahType.sansFamily },
  form: { gap: 16 },
  inputGroup: { gap: 6 },
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: 'rgba(240, 237, 227, 0.65)', marginLeft: 4, fontFamily: VerandahType.sansFamily },
  inputContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 0.5, borderColor: 'rgba(255, 255, 255, 0.12)', borderRadius: VerandahRadius.search, backgroundColor: 'rgba(255, 255, 255, 0.06)', paddingHorizontal: 14, height: 48 },
  input: { flex: 1, fontSize: 14, color: Verandah.cream, fontFamily: VerandahType.sansFamily },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.3)', backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: Verandah.gold, borderColor: Verandah.gold },
  forgotPassword: { alignSelf: 'flex-end', marginTop: -6 },
  forgotPasswordText: { fontSize: 13, fontWeight: '500', color: Verandah.gold, fontFamily: VerandahType.sansFamily },
  authButton: { marginTop: 8, height: 48, borderRadius: VerandahRadius.button, backgroundColor: Verandah.cream, justifyContent: 'center', alignItems: 'center' },
  authButtonText: { color: Verandah.teal900, fontSize: 15, fontWeight: '600', fontFamily: VerandahType.sansFamily },
  dividerContainer: { alignItems: 'center', justifyContent: 'center', marginVertical: 8 },
  divider: { width: '100%', height: 1, backgroundColor: 'rgba(255, 255, 255, 0.1)' },
  dividerText: { position: 'absolute', paddingHorizontal: 12, fontSize: 11, fontWeight: '500', color: 'rgba(240, 237, 227, 0.5)', backgroundColor: Verandah.teal900 },
  phoneButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 52, borderRadius: VerandahRadius.button, backgroundColor: Verandah.cream, marginTop: EMAIL_AUTH_UI_ENABLED ? 16 : 28, ...Verandah.shadowCard },
  phoneButtonText: { fontSize: 15, fontWeight: '700', color: Verandah.teal900, fontFamily: VerandahType.sansFamily, letterSpacing: -0.1 },
  googleButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 50, borderRadius: VerandahRadius.button, backgroundColor: 'rgba(255, 255, 255, 0.08)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.16)', marginTop: 10 },
  googleButtonText: { fontSize: 15, fontWeight: '600', color: Verandah.cream, fontFamily: VerandahType.sansFamily, letterSpacing: -0.1 },
  googleG: { fontSize: 17, fontWeight: '700', color: '#EA4335', fontFamily: VerandahType.sansFamily, marginRight: 10 },
  toggleModeContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 14, flexWrap: 'wrap' },
  toggleModeText: { fontSize: 12, color: 'rgba(240, 237, 227, 0.65)', fontFamily: VerandahType.sansFamily },
  toggleModeLink: { fontSize: 12, fontWeight: '600', color: Verandah.gold, fontFamily: VerandahType.sansFamily },
});
