import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Colors } from '../constants/Colors';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

type CommunityPreview = {
  name: string;
  area: string | null;
  city: string | null;
  community_type: string | null;
};

export default function PendingScreen() {
  const { communityId } = useAuth();
  const colors = Colors.light;
  const [community, setCommunity] = useState<CommunityPreview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCommunity() {
      if (!communityId) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('communities')
          .select('name, area, city, community_type')
          .eq('id', communityId)
          .maybeSingle();

        if (error) {
          throw error;
        }

        setCommunity(data);
      } catch (error: any) {
        Toast.show({ type: 'error', text1: 'Unable to load community', text2: error.message });
      } finally {
        setLoading(false);
      }
    }

    loadCommunity();
  }, [communityId]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient colors={[`${colors.primary}18`, `${colors.gradientEnd}12`, 'transparent']} style={styles.gradientOverlay} />

      <View style={[styles.card, { backgroundColor: colors.glass, borderColor: colors.glassBorder }]}>
        <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}14` }]}>
          <Ionicons name="hourglass-outline" size={30} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Approval pending</Text>
        <Text style={[styles.copy, { color: colors.textMuted }]}>We’ve shared your request with the community admin. You’ll get access after they review it.</Text>

        {loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}

        {community ? (
          <View style={[styles.communityCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.communityName, { color: colors.text }]}>Waiting to join {community.name}</Text>
            <Text style={[styles.communityMeta, { color: colors.textMuted }]}>{community.area || community.city || 'Community details pending'}</Text>
            {community.community_type ? <Text style={[styles.communityMeta, { color: colors.textMuted }]}>{community.community_type}</Text> : null}
          </View>
        ) : null}

        <Text style={[styles.note, { color: colors.textMuted }]}>Providers, visits, funds, and notifications will appear only after approval.</Text>
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
    width: 68,
    height: 68,
    borderRadius: 24,
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
  communityCard: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginTop: 20,
  },
  communityName: {
    fontSize: 17,
    fontWeight: '800',
  },
  communityMeta: {
    fontSize: 13,
    marginTop: 6,
  },
  note: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 18,
  },
});