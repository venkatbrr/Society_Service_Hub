import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Colors } from '../constants/Colors';
import { useAuth } from '../context/AuthContext';
import { Tables } from '../lib/database.types';
import { supabase } from '../lib/supabase';

type CommunityRequestSummary = Pick<Tables<'community_requests'>, 'name' | 'city' | 'status' | 'created_at'>;

export default function CommunityRequestSubmittedScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const colors = Colors.light;
  const [request, setRequest] = useState<CommunityRequestSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRequest = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('community_requests')
        .select('name, city, status, created_at')
        .eq('requested_by', user.id)
        .in('status', ['pending', 'needs_info'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw error;
      }

      setRequest(data);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Unable to load request', text2: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequest();
  }, [user?.id]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={[`${colors.secondary}18`, `${colors.gradientEnd}10`, 'transparent']} style={styles.gradientOverlay} />

      <View style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
        <View style={[styles.iconWrap, { backgroundColor: `${colors.secondary}16` }]}>
          <Ionicons name="mail-open-outline" size={28} color={colors.secondary} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Request received</Text>
        <Text style={[styles.copy, { color: colors.textMuted }]}>Your community request is in review. We will verify the details and follow up within about 24 hours.</Text>

        {loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}

        {request ? (
          <View style={[styles.summary, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.summaryTitle, { color: colors.text }]}>{request.name}</Text>
            <Text style={[styles.summaryMeta, { color: colors.textMuted }]}>{request.city}</Text>
            <Text style={[styles.summaryMeta, { color: colors.textMuted }]}>Submitted on {new Date(request.created_at).toLocaleDateString('en-IN')}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          onPress={() => {
            setLoading(true);
            loadRequest();
          }}
          style={[styles.secondaryButton, { borderColor: colors.border }]}
          activeOpacity={0.8}
        >
          <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Refresh status</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={async () => {
            await signOut();
            router.replace('/login');
          }}
          style={styles.textButton}
          activeOpacity={0.75}
        >
          <Text style={[styles.textButtonLabel, { color: colors.primary }]}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  copy: {
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    marginTop: 10,
  },
  loader: {
    marginTop: 18,
  },
  summary: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginTop: 20,
  },
  summaryTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  summaryMeta: {
    fontSize: 13,
    marginTop: 6,
  },
  secondaryButton: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  textButton: {
    marginTop: 16,
  },
  textButtonLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
});