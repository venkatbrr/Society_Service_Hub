import { LogIn01 } from '@untitledui/icons/LogIn01';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { VerandahLayout } from '../constants/Verandah';
import { supabase } from '../lib/supabase';
import { Rupees } from './Rupees';

type Summary = {
  fund_title: string;
  community_name: string;
  is_closed: boolean;
  collected: number;
  spent: number;
  balance: number;
  contributor_count: number;
};

type BlockRow = {
  block_name: string;
  total_flats: number;
  paid_flats: number;
  collected: number;
};

/**
 * What a signed-out visitor sees after tapping a fund link forwarded into the
 * society WhatsApp group.
 *
 * Both RPCs are aggregates-only and granted to `anon` — see
 * 20260921000000 / 20260921000100. Nothing here names a resident, a flat, or a
 * single transaction; that is the whole reason a forwarded link is safe to
 * open. The contribution and expense lists live behind sign-in.
 */
export function FundPublicSummary({ eventId }: { eventId: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [summaryResult, blocksResult] = await Promise.all([
        supabase.rpc('get_fund_public_summary', { p_event_id: eventId }),
        supabase.rpc('get_fund_public_blocks', { p_event_id: eventId }),
      ]);
      if (cancelled) return;
      const row = (summaryResult.data ?? [])[0] as Summary | undefined;
      if (summaryResult.error || !row) {
        setFailed(true);
      } else {
        setSummary(row);
        setBlocks((blocksResult.data ?? []) as BlockRow[]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [eventId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Verandah.primary} />
      </View>
    );
  }

  if (failed || !summary) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Fund not available</Text>
        <Text style={styles.emptyText}>This link may have expired, or the fund is no longer open.</Text>
        <TouchableOpacity style={styles.loginButton} onPress={() => router.push('/login')}>
          <Text style={styles.loginButtonText}>Sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const totalFlats = blocks.reduce((sum, b) => sum + b.total_flats, 0);
  const paidFlats = blocks.reduce((sum, b) => sum + b.paid_flats, 0);

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.fundTitle}>{summary.fund_title}</Text>
          <Text style={styles.headerLabel}>{summary.community_name} · Fund Transparency</Text>

          {summary.is_closed ? (
            <View style={styles.closedBanner}>
              <Text style={styles.closedText}>This fund is closed.</Text>
            </View>
          ) : null}

          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Text style={styles.sumLabel}>Collected</Text>
              <Rupees amount={Number(summary.collected)} size="sm" tone="in" />
            </View>
            <View style={styles.sumDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.sumLabel}>Spent</Text>
              <Rupees amount={Number(summary.spent)} size="sm" />
            </View>
            <View style={styles.sumDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.sumLabel}>Balance</Text>
              <Rupees amount={Number(summary.balance)} size="sm" tone={Number(summary.balance) >= 0 ? 'in' : 'out'} />
            </View>
          </View>
        </View>

        {blocks.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Block-wise Collection</Text>
              <Text style={styles.sectionBadge}>{paidFlats} of {totalFlats} flats</Text>
            </View>
            <View style={styles.card}>
              {blocks.map((row, index) => (
                <View key={row.block_name} style={[styles.blockRow, index > 0 ? styles.blockDivider : null]}>
                  <Text style={styles.blockName}>Block {row.block_name}</Text>
                  <Text style={styles.blockMeta}>{row.paid_flats}/{row.total_flats} flats</Text>
                  <Rupees amount={Number(row.collected)} size="sm" tone={Number(row.collected) > 0 ? 'in' : 'neutral'} />
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.gateCard}>
            <Text style={styles.gateTitle}>Sign in to see the details</Text>
            <Text style={styles.gateText}>
              {summary.contributor_count} {summary.contributor_count === 1 ? 'contribution has' : 'contributions have'} been
              recorded. Residents of {summary.community_name} can sign in to see who has paid, every expense, and the receipts.
            </Text>
            <TouchableOpacity style={styles.loginButton} onPress={() => router.push('/login')} accessibilityRole="button">
              <LogIn01 size={16} color={Verandah.primaryFg} aria-hidden={true} />
              <Text style={styles.loginButtonText}>Sign in to Wooru</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Verandah.surface },
  center: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: Verandah.surface, padding: 24, gap: 8,
  },
  header: { paddingTop: VerandahLayout.screenPaddingTop, paddingBottom: 16, paddingHorizontal: 16 },
  fundTitle: { fontSize: 20, fontWeight: '600', color: Verandah.textPrimary, lineHeight: 24 },
  headerLabel: {
    color: Verandah.textSecondary, fontSize: 11, fontWeight: '500',
    textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 1, marginBottom: 12,
  },
  closedBanner: {
    backgroundColor: Verandah.cautionSoft, padding: 12, borderRadius: 12, marginBottom: 12,
  },
  closedText: { color: Verandah.caution, fontSize: 14, fontWeight: '500' },
  summaryGrid: {
    flexDirection: 'row', backgroundColor: Verandah.card, borderRadius: 14,
    padding: 10, borderWidth: 1, borderColor: Verandah.border,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  sumLabel: {
    color: Verandah.textSecondary, fontSize: 10, fontWeight: '500',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2,
  },
  sumDivider: { width: 1, height: '100%', backgroundColor: Verandah.border },
  section: { paddingHorizontal: 16, marginTop: 12 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: '600', letterSpacing: -0.3, color: Verandah.textPrimary },
  sectionBadge: {
    fontSize: 11, fontWeight: '500', textTransform: 'uppercase',
    letterSpacing: 0.8, color: Verandah.textSecondary,
  },
  card: {
    backgroundColor: Verandah.card, borderRadius: 12, borderWidth: 1,
    borderColor: Verandah.border, paddingHorizontal: 10,
  },
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  blockDivider: { borderTopWidth: 1, borderTopColor: Verandah.border },
  blockName: { flex: 1, fontSize: 14, fontWeight: '600', color: Verandah.textPrimary },
  blockMeta: { fontSize: 11, color: Verandah.textSecondary },
  gateCard: {
    backgroundColor: Verandah.card, borderRadius: 14, borderWidth: 1,
    borderColor: Verandah.border, padding: 14, gap: 8,
  },
  gateTitle: { fontSize: 15, fontWeight: '600', color: Verandah.textPrimary },
  gateText: { fontSize: 13, lineHeight: 18, color: Verandah.textSecondary },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: Verandah.textPrimary },
  emptyText: { fontSize: 13, color: Verandah.textSecondary, textAlign: 'center' },
  loginButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Verandah.primary, borderRadius: 12, minHeight: 44, height: 44,
    paddingHorizontal: 16, marginTop: 4,
  },
  loginButtonText: { color: Verandah.primaryFg, fontSize: 14, fontWeight: '600' },
});
