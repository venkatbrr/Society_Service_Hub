import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import React from 'react';
import { HeaderBackButton } from '../components/HeaderBackButton';
import { Verandah } from '../constants/Colors';

type BuildMcnHeaderOptionsParams = {
  title: string;
  onBack: () => void;
  headerRight?: () => React.ReactNode;
};

export const buildMcnHeaderOptions = ({
  title,
  onBack,
  headerRight,
}: BuildMcnHeaderOptionsParams): NativeStackNavigationOptions => ({
  headerTitle: title,
  headerTitleStyle: {
    fontWeight: '500',
    fontSize: 17,
    color: Verandah.textPrimary,
  },
  headerLeft: () => (
    <HeaderBackButton
      onPress={onBack}
      color={Verandah.textPrimary}
      style={{ marginLeft: 10, marginRight: 12 }}
    />
  ),
  ...(headerRight ? { headerRight } : {}),
});
