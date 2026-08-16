import { ArrowLeft } from '@untitledui/icons/ArrowLeft';
import { Edit01 } from '@untitledui/icons/Edit01';
import { Phone } from '@untitledui/icons/Phone';
import { ShieldTick } from '@untitledui/icons/ShieldTick';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { Verandah } from '../constants/Colors';
import { VerandahLayout, VerandahRadius, VerandahType } from '../constants/Verandah';
import { getAuthErrorMessage, signInWithPhoneAccessToken } from '../lib/auth';
import { goBackSmart } from '../lib/navigation';
import { isValidIndianMobile, toLast10Digits } from '../lib/phone';

// MSG91 Widget configuration read from public env vars
const MSG91_WIDGET_ID =
  process.env.EXPO_PUBLIC_MSG91_WIDGET_ID ||
  process.env.EXPO_PUBLIC_MSG91_WIDGETID ||
  'SecureOTPWidgetYXQ4';

const MSG91_TOKEN_AUTH =
  process.env.EXPO_PUBLIC_MSG91_TOKEN_AUTH ||
  process.env.EXPO_PUBLIC_MSG91_AUTH_TOKEN ||
  process.env.EXPO_PUBLIC_MSG91_TOKEN ||
  process.env.EXPO_PUBLIC_MSG91_TOKENAUTH ||
  '';

declare global {
  interface Window {
    initSendOTP?: (config: any) => void;
    sendOtp?: (identifier: string, success?: any, failure?: any) => void;
    sendOTP?: (identifier: any, callback?: any) => void;
    verifyOtp?: (otp: string, success?: any, failure?: any) => void;
    verifyOTP?: (data: any, callback?: any) => void;
    retryOtp?: (data: any, callback?: any) => void;
    retryOTP?: (data: any, callback?: any) => void;
    [key: string]: any;
  }
}

export default function LoginPhoneScreen() {
  const router = useRouter();

  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [widgetReady, setWidgetReady] = useState(false);

  const otpInputRef = useRef<TextInput>(null);
  const timerRef = useRef<any>(null);

  // Load the MSG91 widget script once on mount and initialize it a single
  // time. The widget must NOT be re-initialized on every send — doing so
  // previously raced the mount-time init against a second init on every
  // "Get OTP" click, which is what caused the intermittent "Token is
  // missing!" / AuthenticationFailure errors. Sending is done later purely
  // via the exposed window.sendOtp()/verifyOtp() methods.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }

    if (!MSG91_TOKEN_AUTH) {
      console.error('EXPO_PUBLIC_MSG91_TOKEN_AUTH is empty. Check .env and restart Expo (npx expo start -c --web).');
      return;
    }

    // Config shape matches MSG91's own "Client Side Integration" snippet exactly —
    // no extra alias keys, they are not part of the documented API and only
    // risk confusing the SDK's own validation before it reaches the network.
    const configuration = {
      widgetId: MSG91_WIDGET_ID,
      tokenAuth: MSG91_TOKEN_AUTH,
      exposeMethods: true,
      success: async (data: any) => {
        const token =
          data?.['access-token'] ||
          data?.accessToken ||
          data?.jwt ||
          (typeof data === 'string' ? data : null);
        if (token) {
          await completeSignInWithToken(token);
        }
      },
      failure: (err: any) => {
        console.warn('MSG91 widget failure callback:', err);
        setLoading(false);
        Toast.show({
          type: 'error',
          text1: 'OTP Delivery Failed',
          text2: err?.message || (typeof err === 'string' ? err : 'MSG91 could not send OTP to this number.'),
        });
      },
    };

    const markReadyWhenExposed = (attempt = 0) => {
      if (typeof window.sendOtp === 'function' || typeof window.sendOTP === 'function') {
        setWidgetReady(true);
        return;
      }
      if (attempt >= 15) {
        console.warn('MSG91 widget did not expose sendOtp after init — check widgetId/tokenAuth.');
        return;
      }
      setTimeout(() => markReadyWhenExposed(attempt + 1), 200);
    };

    const initScript = () => {
      if (typeof window.initSendOTP !== 'function') return;
      try {
        window.initSendOTP(configuration);
        markReadyWhenExposed();
      } catch (e) {
        console.warn('Error in initSendOTP:', e);
      }
    };

    const existingScript = document.getElementById('msg91-otp-script');
    if (!existingScript) {
      const script = document.createElement('script');
      script.id = 'msg91-otp-script';
      script.src = 'https://verify.msg91.com/otp-provider.js';
      script.async = true;
      script.onload = initScript;
      script.onerror = (e) => {
        console.warn('Failed to load primary MSG91 script from verify.msg91.com, trying fallback...', e);
        const fallback = document.createElement('script');
        fallback.id = 'msg91-otp-script-fallback';
        fallback.src = 'https://control.msg91.com/app/assets/otp-provider/otp-provider.js';
        fallback.async = true;
        fallback.onload = initScript;
        document.body.appendChild(fallback);
      };
      document.body.appendChild(script);
    } else {
      initScript();
    }
  }, []);

  // Resend timer countdown
  useEffect(() => {
    if (resendCountdown > 0) {
      timerRef.current = setTimeout(() => {
        setResendCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resendCountdown]);

  const cleanDigits = toLast10Digits(phone);
  const isPhoneValid = isValidIndianMobile(cleanDigits);

  const startResendTimer = () => {
    setResendCountdown(30);
  };

  const handleSendOtp = async () => {
    if (!isPhoneValid) {
      Toast.show({
        type: 'error',
        text1: 'Invalid Phone Number',
        text2: 'Please enter a valid 10-digit Indian mobile number.',
      });
      return;
    }

    if (!MSG91_TOKEN_AUTH) {
      Toast.show({
        type: 'error',
        text1: 'Token not loaded',
        text2: 'Expo dev server needs a restart with cache cleared: npx expo start -c --web',
        visibilityTime: 7000,
      });
      return;
    }

    if (Platform.OS === 'web' && !widgetReady) {
      Toast.show({
        type: 'error',
        text1: 'Still loading',
        text2: 'The OTP service is still initializing — try again in a moment.',
      });
      return;
    }

    setLoading(true);

    const fullIdentifier = `91${cleanDigits}`;
    const sendFn = Platform.OS === 'web' && typeof window !== 'undefined' ? (window.sendOtp || window.sendOTP) : null;

    if (!sendFn) {
      setLoading(false);
      Toast.show({ type: 'error', text1: 'OTP service unavailable', text2: 'Please reload the page and try again.' });
      return;
    }

    sendFn(
      fullIdentifier,
      () => {
        setLoading(false);
        setStep('otp');
        startResendTimer();
        setTimeout(() => otpInputRef.current?.focus(), 300);
        Toast.show({
          type: 'success',
          text1: 'OTP sent',
          text2: `Verification code sent to +91 ${cleanDigits}`,
        });
      },
      (err: any) => {
        setLoading(false);
        Toast.show({
          type: 'error',
          text1: 'Could not send OTP',
          text2: err?.message || (typeof err === 'string' ? err : 'MSG91 could not send OTP to this number.'),
        });
      }
    );
  };

  const completeSignInWithToken = async (accessToken: string) => {
    setLoading(true);
    try {
      console.log('Sending access_token to verify-phone-otp Edge Function...');
      await signInWithPhoneAccessToken(cleanDigits, accessToken);
      Toast.show({
        type: 'success',
        text1: 'Welcome!',
        text2: 'Signed in successfully with phone.',
      });
      // Auth gate in app/_layout.tsx will react to the session and navigate
    } catch (err: any) {
      console.error('Phone sign-in session error:', err);
      Toast.show({
        type: 'error',
        text1: 'Sign-in Failed',
        text2: err?.message || getAuthErrorMessage(err),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const cleanOtp = otp.trim();
    if (cleanOtp.length < 4) {
      Toast.show({
        type: 'error',
        text1: 'Invalid Code',
        text2: 'Please enter the verification code sent to your phone.',
      });
      return;
    }

    setLoading(true);

    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const verifyFn = window.verifyOtp || window.verifyOTP;
        if (typeof verifyFn === 'function') {
          verifyFn(
            cleanOtp,
            async (res: any) => {
              console.log('MSG91 verifyOtp success:', res);
              const token =
                res?.['access-token'] ||
                res?.accessToken ||
                res?.jwt ||
                (res?.type === 'success' && res?.message) ||
                (typeof res === 'string' ? res : null);

              if (token) {
                await completeSignInWithToken(token);
              } else {
                setLoading(false);
                Toast.show({
                  type: 'error',
                  text1: 'Verification Incomplete',
                  text2: 'No access token received from OTP provider.',
                });
              }
            },
            (err: any) => {
              console.warn('MSG91 verifyOtp error:', err);
              setLoading(false);
              Toast.show({
                type: 'error',
                text1: 'Incorrect OTP',
                text2: err?.message || 'The OTP entered is invalid or expired.',
              });
            }
          );
          return;
        }
      }

      // Direct fallback verification if token is passed directly:
      await completeSignInWithToken(cleanOtp);
    } catch (err: any) {
      setLoading(false);
      Toast.show({
        type: 'error',
        text1: 'Verification Failed',
        text2: err?.message || getAuthErrorMessage(err),
      });
    }
  };

  const handleResend = () => {
    if (resendCountdown > 0 || loading) return;
    setOtp('');
    handleSendOtp();
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
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => (step === 'otp' ? setStep('phone') : goBackSmart(router, '/login-phone'))}
          activeOpacity={0.8}
        >
          <ArrowLeft size={20} color={Verandah.cream} />
        </TouchableOpacity>

        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Image
              source={require('../assets/images/icon.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.title}>
            {step === 'phone' ? 'Sign in with phone' : 'Enter passcode'}
          </Text>
          <Text style={styles.subtitle}>
            {step === 'phone'
              ? 'We will send a one-time verification code to your mobile number.'
              : `We sent a 6-digit code to +91 ${cleanDigits}`}
          </Text>
        </View>

        {step === 'phone' ? (
          <View style={styles.formCard}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Mobile number</Text>
              <View style={styles.phoneInputRow}>
                <View style={styles.countryCodeBadge}>
                  <Text style={styles.flagEmoji}>🇮🇳</Text>
                  <Text style={styles.countryCodeText}>+91</Text>
                </View>
                <View style={styles.phoneInputContainer}>
                  <Phone size={18} color="rgba(240, 237, 227, 0.6)" style={{ marginRight: 8 }} aria-hidden={true} />
                  <TextInput
                    style={styles.input}
                    placeholder="98765 43210"
                    placeholderTextColor="rgba(240, 237, 227, 0.4)"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    maxLength={14}
                    autoFocus={true}
                  />
                </View>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleSendOtp}
              disabled={!isPhoneValid || loading}
              activeOpacity={0.88}
              style={[styles.primaryButton, (!isPhoneValid || loading) && styles.buttonDisabled]}
            >
              {loading ? (
                <ActivityIndicator color={Verandah.teal900} />
              ) : (
                <Text style={styles.primaryButtonText}>Get OTP</Text>
              )}
            </TouchableOpacity>

            <View style={styles.legalNotice}>
              <Text style={styles.legalText}>
                By signing in you agree to our{' '}
                <Text
                  style={styles.legalLink}
                  onPress={() => router.push('/legal?returnTo=login-phone' as any)}
                >
                  Terms &amp; Privacy Policy
                </Text>
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.formCard}>
            <View style={styles.phoneSummaryRow}>
              <View style={styles.phoneSummaryBadge}>
                <Phone size={14} color={Verandah.cream} style={{ marginRight: 6 }} />
                <Text style={styles.phoneSummaryText}>+91 {cleanDigits}</Text>
              </View>
              <TouchableOpacity
                style={styles.editPhoneButton}
                onPress={() => setStep('phone')}
                activeOpacity={0.7}
              >
                <Edit01 size={14} color={Verandah.gold} style={{ marginRight: 4 }} />
                <Text style={styles.editPhoneText}>Change</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>One-time passcode</Text>
              <View style={styles.otpInputContainer}>
                <ShieldTick size={20} color={Verandah.gold} style={{ marginRight: 10 }} aria-hidden={true} />
                <TextInput
                  ref={otpInputRef}
                  style={styles.otpInput}
                  placeholder="• • • • • •"
                  placeholderTextColor="rgba(240, 237, 227, 0.35)"
                  value={otp}
                  onChangeText={setOtp}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus={true}
                />
              </View>
            </View>

            <TouchableOpacity
              onPress={handleVerifyOtp}
              disabled={otp.trim().length === 0 || loading}
              activeOpacity={0.88}
              style={[styles.primaryButton, (otp.trim().length === 0 || loading) && styles.buttonDisabled]}
            >
              {loading ? (
                <ActivityIndicator color={Verandah.teal900} />
              ) : (
                <Text style={styles.primaryButtonText}>Verify &amp; Sign in</Text>
              )}
            </TouchableOpacity>

            <View style={styles.resendRow}>
              {resendCountdown > 0 ? (
                <Text style={styles.countdownText}>
                  Resend code in <Text style={styles.countdownNumber}>{resendCountdown}s</Text>
                </Text>
              ) : (
                <TouchableOpacity onPress={handleResend} disabled={loading} activeOpacity={0.7}>
                  <Text style={styles.resendLinkText}>Didn't get code? Resend OTP</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Verandah.teal900,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: VerandahLayout.screenPaddingTop,
    paddingBottom: 32,
  },
  backButton: {
    position: 'absolute',
    top: VerandahLayout.screenPaddingTop,
    left: 24,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoContainer: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(221, 169, 74, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontFamily: VerandahType.serifFamily,
    fontSize: 34,
    fontWeight: '400',
    color: Verandah.cream,
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontFamily: VerandahType.sansFamily,
    fontSize: 14,
    color: 'rgba(240, 237, 227, 0.75)',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
  },
  formCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 24,
    padding: 22,
    gap: 18,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: 'rgba(240, 237, 227, 0.65)',
    marginLeft: 4,
    fontFamily: VerandahType.sansFamily,
  },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countryCodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 12,
    borderRadius: VerandahRadius.search,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  flagEmoji: {
    fontSize: 16,
    marginRight: 6,
  },
  countryCodeText: {
    fontSize: 14,
    fontWeight: '600',
    color: Verandah.cream,
    fontFamily: VerandahType.sansFamily,
  },
  phoneInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: VerandahRadius.search,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 14,
    height: 48,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: Verandah.cream,
    fontFamily: VerandahType.sansFamily,
  },
  primaryButton: {
    height: 50,
    borderRadius: VerandahRadius.button,
    backgroundColor: Verandah.cream,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },
  primaryButtonText: {
    color: Verandah.teal900,
    fontSize: 15,
    fontWeight: '700',
    fontFamily: VerandahType.sansFamily,
    letterSpacing: -0.1,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  legalNotice: {
    alignItems: 'center',
    marginTop: 4,
  },
  legalText: {
    fontSize: 12,
    color: 'rgba(240, 237, 227, 0.6)',
    fontFamily: VerandahType.sansFamily,
    textAlign: 'center',
  },
  legalLink: {
    color: Verandah.gold,
    fontWeight: '600',
  },
  phoneSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: VerandahRadius.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  phoneSummaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  phoneSummaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: Verandah.cream,
    fontFamily: VerandahType.sansFamily,
  },
  editPhoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  editPhoneText: {
    fontSize: 13,
    fontWeight: '600',
    color: Verandah.gold,
    fontFamily: VerandahType.sansFamily,
  },
  otpInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(221, 169, 74, 0.4)',
    borderRadius: VerandahRadius.search,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 16,
    height: 54,
  },
  otpInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: 8,
    color: Verandah.cream,
    fontFamily: VerandahType.sansFamily,
    textAlign: 'center',
  },
  resendRow: {
    alignItems: 'center',
    marginTop: 4,
  },
  countdownText: {
    fontSize: 13,
    color: 'rgba(240, 237, 227, 0.5)',
    fontFamily: VerandahType.sansFamily,
  },
  countdownNumber: {
    fontWeight: '600',
    color: Verandah.gold,
  },
  resendLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: Verandah.gold,
    fontFamily: VerandahType.sansFamily,
  },
});
