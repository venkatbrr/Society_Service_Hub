import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/Colors';
import Toast from 'react-native-toast-message';

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
      <Text style={[styles.title, { color: colors.text }]}>Welcome 👋</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>
        Join your society to find trusted service providers.
      </Text>

      <View style={[styles.tabs, { backgroundColor: colors.surface2 }]}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'join' && { backgroundColor: colors.background, shadowColor: '#000', elevation: 2 }]} 
          onPress={() => setActiveTab('join')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'join' ? colors.text : colors.textMuted, fontWeight: activeTab === 'join' ? '600' : '400' }]}>
            Join Existing
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'create' && { backgroundColor: colors.background, shadowColor: '#000', elevation: 2 }]} 
          onPress={() => setActiveTab('create')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'create' ? colors.text : colors.textMuted, fontWeight: activeTab === 'create' ? '600' : '400' }]}>
            Create New
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {activeTab === 'join' ? (
          <View>
            <Text style={[styles.label, { color: colors.text }]}>Invite Code</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="e.g. WOOD1234"
              placeholderTextColor={colors.textMuted}
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
            />
            <TouchableOpacity 
              style={[styles.button, { backgroundColor: colors.primary }]} 
              onPress={handleJoin}
              disabled={isLoading}
            >
              {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Join Community</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Text style={[styles.label, { color: colors.text }]}>Community Name</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="e.g. Woodland Apartments"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
            />
            <TouchableOpacity 
              style={[styles.button, { backgroundColor: colors.primary }]} 
              onPress={handleCreate}
              disabled={isLoading}
            >
              {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Create Community</Text>}
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
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 32,
    lineHeight: 24,
  },
  tabs: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabText: {
    fontSize: 16,
  },
  formCard: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 24,
  },
  button: {
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
