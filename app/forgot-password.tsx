import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { HeaderBackButton } from '../components/HeaderBackButton';
import { Verandah } from '../constants/Colors';
import { VerandahLayout, VerandahType } from '../constants/Verandah';
import { getAuthErrorMessage, resetPassword } from '../lib/auth';

export default function ForgotPasswordScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!email.trim() || !email.includes('@')) {
      return Toast.show({ type: 'error', text1: 'Invalid Email', text2: 'Please enter a valid email address.' });
    }

    setLoading(true);
    try {
      const { error } = await resetPassword(email.trim());
      if (error) throw error;

      Toast.show({
        type: 'success',
        text1: 'Email Sent',
        text2: 'Check your inbox for password reset instructions.',
        visibilityTime: 6000
      });
      router.back();
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Reset Failed',
        text2: getAuthErrorMessage(error)
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: Verandah.surface }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <HeaderBackButton
          style={[styles.backButton, { backgroundColor: Verandah.card, borderColor: Verandah.border }]}
          onPress={() => router.back()}
          color={Verandah.textPrimary}
        />

        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: Verandah.primary }]}>
            <Ionicons name="key-outline" size={36} color={Verandah.primaryFg} />
          </View>
          <Text style={styles.title}>Reset password</Text>
          <Text style={[styles.subtitle, { color: Verandah.textSecondary }]}>
            Enter your email address and we'll send you instructions to reset your password.
          </Text>
        </View>

        <View style={[styles.formCard, { backgroundColor: Verandah.card, borderColor: Verandah.border }]}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Verandah.textPrimary }]}>Email address</Text>
            <View style={[styles.inputContainer, { backgroundColor: Verandah.cardMuted, borderColor: Verandah.borderStrong }]}>
               <Ionicons name="mail-outline" size={20} color={Verandah.textSecondary} style={styles.inputIcon} />
               <TextInput
                 style={[styles.input, { color: Verandah.textPrimary }]}
                 placeholder="your@email.com"
                 placeholderTextColor={Verandah.textSecondary}
                 value={email}
                 onChangeText={setEmail}
                 keyboardType="email-address"
                 autoCapitalize="none"
               />
            </View>
          </View>

          <TouchableOpacity
            onPress={handleReset}
            disabled={loading}
            activeOpacity={0.8}
            style={styles.resetButton}
          >
            {loading ? (
              <ActivityIndicator color={Verandah.primaryFg} />
            ) : (
              <Text style={styles.resetButtonText}>Send Reset Link</Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backLink}
        >
          <Text style={[styles.backLinkText, { color: Verandah.primary }]}>Back to Sign In</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 32,
    paddingTop: VerandahLayout.screenPaddingTop,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
    borderWidth: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    elevation: 0,
  },
  title: {
    ...VerandahType.display,
    color: Verandah.textPrimary,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  formCard: {
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    elevation: 0,
    gap: 24,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 1,
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 50,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
  },
  resetButton: {
    height: 50,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: Verandah.primary,
    elevation: 0,
  },
  resetButtonText: {
    color: Verandah.primaryFg,
    fontSize: 14,
    fontWeight: '500',
  },
  backLink: {
    alignItems: 'center',
    marginTop: 24,
  },
  backLinkText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
