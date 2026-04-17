import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Colors } from '../constants/Colors';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function CommunitySelectScreen() {
  const { session, refreshSession } = useAuth();
  const [activeTab, setActiveTab] = useState<'join' | 'create'>('join');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const colors = Colors.light;

  const handleJoin = async () => {
    if (!code.trim()) {
      Toast.show({ type: 'error', text1: 'Validation Error', text2: 'Please enter a community code' });
      return;
    }

    setIsLoading(true);
    try {
      // 1. Find the community
      const { data: community, error: fetchError } = await supabase
        .from('communities')
        .select('id')
        .eq('code', code.trim())
        .single();

      if (fetchError || !community) {
        throw new Error('Community not found. Please check the code.');
      }

      // 2. Update user's app_metadata (Server-side update theoretically needed for security,
      // but for this MVP we'll update the profile, and assume a backend function syncs it,
      // or we just update auth.users if we had service_role key, which we dont on client.
      // Supabase workaround: we'll store community_id in profile.)

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ community_id: community.id })
        .eq('id', session?.user.id as string);

      if (profileError) throw profileError;

      // To update app_metadata from client isn't allowed safely without edge function.
      // For this pure frontend app, we will rely on profile.community_id or update standard meta.
      await supabase.auth.updateUser({
        data: { community_id: community.id } // Updates user_metadata, not app_metadata!
      });

      Toast.show({ type: 'success', text1: 'Joined Community!' });
      await refreshSession();

    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Toast.show({ type: 'error', text1: 'Validation Error', text2: 'Please enter a community name' });
      return;
    }

    setIsLoading(true);
    try {
      const generatedCode = name.substring(0, 4).toUpperCase().replace(/\s/g, '') + Math.floor(1000 + Math.random() * 9000);

      // 1. Create Community
      const { data: community, error: createError } = await supabase
        .from('communities')
        .insert({ name: name.trim(), code: generatedCode })
        .select('id')
        .single();

      if (createError) throw createError;

      // 2. Update Profile & User Meta
      await supabase.from('profiles').update({ community_id: community.id }).eq('id', session?.user.id as string);
      await supabase.auth.updateUser({ data: { community_id: community.id } });

      Toast.show({ type: 'success', text1: 'Community Created!' });
      await refreshSession();

    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
      {/* Subtle gradient overlay at top */}
      <LinearGradient
        colors={[colors.gradientStart + '12', colors.gradientEnd + '08', 'transparent']}
        style={styles.gradientOverlay}
      />

      <Text style={[styles.title, { color: colors.text }]}>Welcome</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>
        Join your society to find trusted service providers.
      </Text>

      {/* Tab toggle with glass background and gradient active pill */}
      <View style={[styles.tabs, { backgroundColor: colors.glass, borderColor: colors.glassBorder, borderWidth: 1 }]}>
        <TouchableOpacity
          style={[styles.tab]}
          onPress={() => setActiveTab('join')}
          activeOpacity={0.7}
        >
          {activeTab === 'join' ? (
            <LinearGradient
              colors={[colors.gradientStart, colors.gradientEnd]}
              style={styles.tabGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.tabActiveText}>Join Existing</Text>
            </LinearGradient>
          ) : (
            <View style={styles.tabInactive}>
              <Text style={[styles.tabInactiveText, { color: colors.textMuted }]}>Join Existing</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab]}
          onPress={() => setActiveTab('create')}
          activeOpacity={0.7}
        >
          {activeTab === 'create' ? (
            <LinearGradient
              colors={[colors.gradientStart, colors.gradientEnd]}
              style={styles.tabGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.tabActiveText}>Create New</Text>
            </LinearGradient>
          ) : (
            <View style={styles.tabInactive}>
              <Text style={[styles.tabInactiveText, { color: colors.textMuted }]}>Create New</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Form card with glass effect */}
      <View style={[styles.formCard, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
        {activeTab === 'join' ? (
          <View>
            <Text style={[styles.label, { color: colors.text }]}>Invite Code</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
              placeholder="e.g. WOOD1234"
              placeholderTextColor={colors.textMuted}
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
            />
            <TouchableOpacity
              onPress={handleJoin}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[colors.gradientStart, colors.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.button}
              >
                {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Join Community</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Text style={[styles.label, { color: colors.text }]}>Community Name</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
              placeholder="e.g. Woodland Apartments"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
            />
            <TouchableOpacity
              onPress={handleCreate}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[colors.gradientStart, colors.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.button}
              >
                {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Create Community</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 80,
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 250,
    zIndex: 0,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 32,
    lineHeight: 24,
  },
  tabs: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
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
  formCard: {
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  input: {
    height: 52,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 24,
  },
  button: {
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
