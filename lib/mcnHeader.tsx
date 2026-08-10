import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import React from 'react';
import { HeaderBackButton } from '../components/HeaderBackButton';
import { Verandah } from '../constants/Colors';
import { VerandahRadius, VerandahType } from '../constants/Verandah';

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
  headerShown: true,
  headerTitle: title,
  headerTitleStyle: {
    fontFamily: VerandahType.serifFamily,
    fontWeight: '400',
    fontSize: 22,
    color: Verandah.textPrimary,
  },
  headerStyle: {
    backgroundColor: Verandah.surface,
  },
  headerShadowVisible: false,
  headerLeft: () => (
    <HeaderBackButton
      onPress={onBack}
      color={Verandah.textPrimary}
      style={{
        marginLeft: 10,
        marginRight: 12,
        width: 36,
        height: 36,
        borderRadius: VerandahRadius.pill,
        borderWidth: 0.5,
        borderColor: Verandah.borderHair,
        backgroundColor: Verandah.card,
      }}
    />
  ),
  ...(headerRight ? { headerRight } : {}),
});
