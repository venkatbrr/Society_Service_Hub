import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Verandah } from '../../constants/Colors';
import { VerandahRadius, VerandahType } from '../../constants/Verandah';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function EditProfileScreen() {
  const router = useRouter();
  const { user, refreshSession } = useAuth();
  
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [loading, setLoading] = useState(false);

  const colors = Verandah;

  const handleSave = async () => {
    if (!fullName.trim()) {
      Toast.show({ type: 'error', text1: 'Name is required' });
      return;
    }

    setLoading(true);
    try {
      const updates: any = {};
      let needsAuthUpdate = false;

      if (fullName !== user?.user_metadata?.full_name) {
        updates.data = { full_name: fullName.trim() };
        needsAuthUpdate = true;
      }
      
      if (email.trim() && email.trim() !== user?.email) {
        updates.email = email.trim();
        needsAuthUpdate = true;
      }

      if (needsAuthUpdate) {
        const { error: authError } = await supabase.auth.updateUser(updates);
        if (authError) throw authError;

        // Also update profiles table explicitly just in case
        if (updates.data?.full_name) {
          const { error: profileError } = await supabase
            .from('profiles')
            .update({ full_name: fullName.trim() })
            .eq('id', user?.id as string);
            
          if (profileError) throw profileError;
        }

        await refreshSession();

        if (updates.email) {
          Toast.show({ type: 'success', text1: 'Check your new email to confirm the change', text2: 'Name updated successfully' });
        } else {
          Toast.show({ type: 'success', text1: 'Profile updated' });
        }
        
        router.back();
      } else {
        router.back();
      }
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Update failed', text2: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>Edit Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your full name"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Your email address"
            placeholderTextColor={colors.textTertiary}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Text style={styles.helpText}>If you change your email, you will need to verify the new address before the change takes effect.</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
          {loading ? <ActivityIndicator color={Verandah.primaryFg} /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: Verandah.surface,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Verandah.cardMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...VerandahType.bodyBold,
    fontSize: 18,
    color: Verandah.textPrimary,
  },
  content: {
    padding: 24,
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    ...VerandahType.captionBold,
    color: Verandah.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: Verandah.border,
    borderRadius: VerandahRadius.md,
    paddingHorizontal: 16,
    height: 50,
    color: Verandah.textPrimary,
    backgroundColor: Verandah.card,
    fontSize: 16,
  },
  helpText: {
    ...VerandahType.micro,
    color: Verandah.textTertiary,
    marginTop: 4,
    lineHeight: 16,
  },
  footer: {
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    backgroundColor: Verandah.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Verandah.border,
  },
  saveBtn: {
    backgroundColor: Verandah.primary,
    borderRadius: VerandahRadius.md,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    ...VerandahType.bodyBold,
    color: Verandah.primaryFg,
  },
});
