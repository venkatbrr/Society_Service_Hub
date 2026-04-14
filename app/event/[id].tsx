import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  ActivityIndicator, 
  FlatList,
  RefreshControl 
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/Colors';
import { Tables } from '../../lib/database.types';
import { TransactionItem } from '../../components/TransactionItem';
import { useAuth } from '../../context/AuthContext';

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const colors = Colors.light;

  const [event, setEvent] = useState<Tables<'events'> | null>(null);
  const [transactions, setTransactions] = useState<Tables<'event_transactions'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Validate UUID to prevent errors with static routes like 'add'
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id as string)) {
        setLoading(false);
        return;
      }

      // Fetch event details
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .single();

      if (eventError) throw eventError;
      setEvent(eventData);

      // Fetch transactions
      const { data: transData, error: transError } = await supabase
        .from('event_transactions')
        .select('*')
        .eq('event_id', id)
        .order('created_at', { ascending: false });

      if (transError) throw transError;
      setTransactions(transData || []);

    } catch (error) {
      console.error('Error fetching event details:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const totals = transactions.reduce(
    (acc, t) => {
      if (t.type === 'income') acc.income += Number(t.amount);
      else acc.expense += Number(t.amount);
      acc.balance = acc.income - acc.expense;
      return acc;
    },
    { income: 0, expense: 0, balance: 0 }
  );

  if (loading && !refreshing) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textMuted }}>Event not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TransactionItem transaction={item} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <>
            <View style={styles.eventInfo}>
              <Text style={[styles.eventTitle, { color: colors.text }]}>{event.title}</Text>
              <View style={styles.dateRow}>
                <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.dateText, { color: colors.textMuted }]}>
                  {new Date(event.event_date).toLocaleDateString('en-IN', { 
                    day: 'numeric', month: 'long', year: 'numeric' 
                  })}
                </Text>
              </View>
              {event.description && (
                <Text style={[styles.description, { color: colors.textMuted }]}>
                  {event.description}
                </Text>
              )}
            </View>

            <View style={[styles.dashboard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.dashboardItem}>
                <Text style={[styles.dashboardLabel, { color: colors.textMuted }]}>Income (+)</Text>
                <Text style={[styles.dashboardValue, { color: colors.secondary }]}>
                  ₹{(totals?.income || 0).toLocaleString()}
                </Text>
              </View>
              <View style={[styles.dashboardDivider, { backgroundColor: colors.border }]} />
              <View style={styles.dashboardItem}>
                <Text style={[styles.dashboardLabel, { color: colors.textMuted }]}>Expense (-)</Text>
                <Text style={[styles.dashboardValue, { color: colors.accent }]}>
                  ₹{(totals?.expense || 0).toLocaleString()}
                </Text>
              </View>
              <View style={[styles.dashboardDivider, { backgroundColor: colors.border }]} />
              <View style={styles.dashboardItem}>
                <Text style={[styles.dashboardLabel, { color: colors.textMuted }]}>Balance</Text>
                <Text style={[styles.dashboardValue, { color: colors.primary }]}>
                  ₹{(totals?.balance || 0).toLocaleString()}
                </Text>
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Transaction History</Text>
              <TouchableOpacity onPress={() => router.push(`/event/add-transaction?eventId=${id}`)}>
                <Text style={[styles.addText, { color: colors.primary }]}>+ Add Entry</Text>
              </TouchableOpacity>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={48} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No transactions yet.
            </Text>
          </View>
        }
      />

      <TouchableOpacity 
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => router.push(`/event/add-transaction?eventId=${id}`)}
      >
        <Ionicons name="add" size={30} color="white" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  eventInfo: {
    marginBottom: 24,
  },
  eventTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  dateText: {
    fontSize: 16,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
  },
  dashboard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 32,
  },
  dashboardItem: {
    flex: 1,
    alignItems: 'center',
  },
  dashboardLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  dashboardValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  dashboardDivider: {
    width: 1,
    height: '70%',
    alignSelf: 'center',
    marginHorizontal: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  addText: {
    fontSize: 14,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  emptyContainer: {
    marginTop: 40,
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 12,
  },
});
