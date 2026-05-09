import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Verandah } from '../constants/Colors';
import { Avatar } from './Avatar';

interface JoinerListItemProps {
  userName: string;
  flatNumber?: string;
  avatarUrl?: string;
  note?: string;
  joinedAt?: string;
  isHost: boolean;
}

export const JoinerListItem = React.memo(({ userName, flatNumber, avatarUrl, note, joinedAt, isHost }: JoinerListItemProps) => {
  const colors = Verandah;

  return (
    <View style={styles.container}>
      <Avatar name={userName} size={36} />
      
      <View style={styles.content}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: colors.textPrimary }]}>{userName}</Text>
          {isHost && (
            <View style={[styles.hostBadge, { backgroundColor: colors.accentSoft }]}>
              <Text style={[styles.hostBadgeText, { color: colors.accent }]}>Hosting</Text>
            </View>
          )}
        </View>
        <Text style={[styles.flat, { color: colors.textMuted }]}>{flatNumber || 'Neighbor'}</Text>
        {note && <Text style={[styles.note, { color: colors.textMuted }]}>"{note}"</Text>}
      </View>

      {joinedAt && !isHost && (
        <Text style={[styles.time, { color: colors.textMuted }]}>
          {new Date(joinedAt).toLocaleDateString()}
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingVertical: 12,
    alignItems: 'center',
  },
  content: {
    flex: 1,
    marginLeft: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontSize: 15,
    fontWeight: '500',
  },
  hostBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  hostBadgeText: {
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  flat: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 1,
  },
  note: {
    fontSize: 12,
    marginTop: 4,
    fontStyle: 'italic',
  },
  time: {
    fontSize: 11,
    fontWeight: '500',
  },
});
