import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/Colors';
import { APP_EMOJIS } from '../constants/emojis';

type ActiveFundTeaserProps = {
  title: string;
  collected: number;
  goal: number;
  onPress: () => void;
};

export const ActiveFundTeaser = ({ title, collected, goal, onPress }: ActiveFundTeaserProps) => {
  const colors = Colors.light;
  const progress = goal > 0 ? Math.min(collected / goal, 1) : 0;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      style={styles.wrapper}
    >
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.container}
      >
        <View style={styles.header}>
          <View style={styles.titleArea}>
            <Text style={styles.label}>Active Fund</Text>
            <Text style={styles.title}>{title}</Text>
          </View>
          <View style={styles.iconContainer}>
            <Text style={styles.iconText}>{APP_EMOJIS.fundActive}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <Text style={styles.amount}>{collected.toLocaleString()}</Text>
          <Text style={styles.goal}>of {goal.toLocaleString()}</Text>
        </View>

        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 20,
    borderRadius: 24,
    elevation: 0,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
  },
  container: {
    padding: 20,
    borderRadius: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  titleArea: {
    flex: 1,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.24)',
  },
  iconText: {
    fontSize: 20,
    lineHeight: 24,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 12,
  },
  amount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFF',
  },
  goal: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  progressBg: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#FFF',
  },
});
