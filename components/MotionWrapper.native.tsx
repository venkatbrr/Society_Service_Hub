import React from 'react';
import { View, ViewProps } from 'react-native';

export interface MotionWrapperProps extends ViewProps {
  children: React.ReactNode;
  enableHoverEffect?: boolean;
  enableTapEffect?: boolean;
  [key: string]: any;
}

export const MotionWrapper: React.FC<MotionWrapperProps> = ({
  children,
  style,
  ...props
}) => {
  return (
    <View style={style} {...props}>
      {children}
    </View>
  );
};

export default MotionWrapper;
