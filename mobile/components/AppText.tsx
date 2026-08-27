// Typography primitives over the theme's type scale — kept to exactly the
// variants screens in this phase actually use (Title/Heading/Body/Caption/
// Label), not a speculative full scale.
import React from 'react';
import { Text, TextProps, TextStyle } from 'react-native';
import { colors, typography } from '../constants/theme';

type Variant = keyof typeof typography;

interface AppTextProps extends TextProps {
  variant?: Variant;
  color?: string;
  style?: TextStyle | TextStyle[];
}

export const AppText: React.FC<AppTextProps> = ({ variant = 'body', color, style, children, ...rest }) => (
  <Text style={[typography[variant], { color: color ?? colors.ink }, style]} {...rest}>
    {children}
  </Text>
);
