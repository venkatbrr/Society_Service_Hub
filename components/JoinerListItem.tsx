import { Image, StyleSheet, Text, View } from 'react-native';
import React from 'react';
import { Colors } from '../constants/Colors';

interface JoinerListItemProps {
  userName: string;
  flatNumber?: string;
  avatarUrl?: string;
  note?: string;
  joinedAt?: string;
  isHost: boolean;
}

export const JoinerListItem = React.memo(({ userName, flatNumber, avatarUrl, note, joinedAt, isHost }: JoinerListItemProps) => {
  const colors = Colors.light;

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  };

  return (
    <View style={styles.container}>
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary + '15' }]}>
          <Text style={[styles.initials, { color: colors.primary }]}>{getInitials(userName)}</Text>
        </View>
      )}
      
      <View style={styles.content}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: colors.text }]}>{userName}</Text>
          {isHost && (
            <View style={[styles.hostBadge, { backgroundColor: '#10B98115' }]}>
              <Text style={styles.hostBadgeText}>Hosting</Text>
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
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: {
    fontSize: 14,
    fontWeight: '700',
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
    fontWeight: '700',
  },
  hostBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  hostBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10B981',
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
