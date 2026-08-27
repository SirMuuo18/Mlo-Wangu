// The existing MLO WANGU icon mark, reused exactly as OnboardingFlow.tsx
// (src/components/onboarding/OnboardingFlow.tsx) already presents it on
// web: a rounded square card with the icon inset. No redesign — same
// asset, same treatment.
import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { colors } from '../constants/theme';

interface LogoProps {
  size?: number;
}

export const Logo: React.FC<LogoProps> = ({ size = 88 }) => (
  <View style={[styles.frame, { width: size, height: size, borderRadius: size * 0.32 }]}>
    <Image
      source={require('../assets/icon.png')}
      style={{ width: size * 0.78, height: size * 0.78, borderRadius: size * 0.2 }}
      resizeMode="contain"
    />
  </View>
);

const styles = StyleSheet.create({
  frame: {
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    borderWidth: 1,
    borderColor: colors.line,
  },
});
