import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/Colors';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';

const TRANSACTION_CATEGORIES = [
  'Donation',
  'Activity Fee',
  'Catering',
  'Decoration',
  'Equipment Rental',
  'Prize/Gift',
  'Marketing',
  'Other'
];

export default function AddTransactionScreen() {
  const { eventId } = useLocalSearchParams();
  const { user } = useAuth();
  const router = useRouter();
  const colors = Colors.light;

  const [type, setType] = useState<'income' | 'expense'>('income');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(TRANSACTION_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    if (!amount.trim() || isNaN(Number(amount)) || Number(amount) <= 0) {
      Toast.show({ type: 'error', text1: 'Validation Error', text2: 'Please enter a valid amount' });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.from('event_transactions').insert({
        event_id: eventId as string,
        created_by: user?.id as string,
        amount: Number(amount),
        type,
        category,
        description: description.trim() || null,
      });

      if (error) throw error;

      Toast.show({ type: 'success', text1: 'Entry added successfully' });
      router.back();
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Error', text2: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Add Funds</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>Record income or expenses for this event</Text>
        </View>

        <View style={[styles.form, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.text }]}>TRANSACTION TYPE</Text>
          <View style={[styles.tabContainer, { backgroundColor: colors.surface2 }]}>
            <TouchableOpacity 
              style={[
                styles.tab, 
                type === 'income' ? { backgroundColor: colors.card, shadowColor: '#000', elevation: 2 } : {}
              ]}
              onPress={() => setType('income')}
            >
              <Text style={[styles.tabText, { color: type === 'income' ? colors.secondary : colors.textMuted }]}>Income (+)</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[
                styles.tab, 
                type === 'expense' ? { backgroundColor: colors.card, shadowColor: '#000', elevation: 2 } : {}
              ]}
              onPress={() => setType('expense')}
            >
              <Text style={[styles.tabText, { color: type === 'expense' ? colors.accent : colors.textMuted }]}>Expense (-)</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>AMOUNT (₹)</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>CATEGORY</Text>
            <View style={styles.categoryContainer}>
              {TRANSACTION_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryChip,
                    category === cat ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.background, borderColor: colors.border }
                  ]}
                  onPress={() => setCategory(cat)}
                >
                  <Text style={[styles.categoryText, { color: category === cat ? 'white' : colors.text }]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>NOTES</Text>
            <TextInput
              style={[styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Add some details about this transaction..."
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <TouchableOpacity 
          style={[styles.saveButton, { backgroundColor: colors.primary }]} 
          onPress={handleSave}
          disabled={isLoading}
        >
          {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveButtonText}>Add Entry</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 60,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    marginTop: 4,
  },
  form: {
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 12,
    marginLeft: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabText: {
    fontWeight: '700',
    fontSize: 14,
  },
  input: {
    height: 54,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 18,
    fontWeight: '700',
  },
  categoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '600',
  },
  textArea: {
    height: 100,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    fontSize: 16,
  },
  footer: {
    padding: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    backgroundColor: 'white',
  },
  saveButton: {
    height: 58,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
});
