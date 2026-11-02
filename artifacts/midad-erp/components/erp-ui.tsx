import { Feather } from '@expo/vector-icons';
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { Currency } from './erp-store';

export const CURRENCIES: Currency[] = ['SAR', 'YER', 'USD'];

export function currencyLabel(currency: Currency) {
  if (currency === 'SAR') return 'ر.س';
  if (currency === 'YER') return 'ر.ي';
  return 'دولار';
}

export function formatMoney(amount: number, currency: Currency) {
  const value = new Intl.NumberFormat('ar-SA-u-nu-arab', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(amount);
  return `${value} ${currencyLabel(currency)}`;
}

export function Page({
  children,
  contentStyle,
}: {
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.pageContent, contentStyle]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Title({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  const colors = useColors();
  return <Text style={[styles.title, { color: colors.foreground }, style]}>{children}</Text>;
}

export function BodyText({
  children,
  muted = false,
  style,
}: {
  children: React.ReactNode;
  muted?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const colors = useColors();
  return (
    <Text
      style={[
        styles.body,
        { color: muted ? colors.mutedForeground : colors.foreground },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionHeading({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.sectionHeading}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
        >
          <Text style={[styles.actionText, { color: colors.primary }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function CurrencyPicker({
  value,
  onChange,
  compact = false,
}: {
  value: Currency;
  onChange: (currency: Currency) => void;
  compact?: boolean;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.currencyPicker,
        compact && styles.currencyPickerCompact,
        { backgroundColor: compact ? 'rgba(255,255,255,0.12)' : colors.muted },
      ]}
    >
      {CURRENCIES.map((currency) => {
        const active = value === currency;
        return (
          <Pressable
            key={currency}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(currency)}
            style={[
              styles.currencyOption,
              compact && styles.currencyOptionCompact,
              active && {
                backgroundColor: compact ? 'rgba(255,255,255,0.2)' : colors.card,
              },
            ]}
          >
            <Text
              style={[
                styles.currencyText,
                { color: compact ? '#ffffff' : colors.mutedForeground },
                active && { color: compact ? '#ffffff' : colors.primary, fontWeight: '700' },
              ]}
            >
              {currency}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  color,
}: {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  label: string;
  color?: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={`icon-${label}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: colors.secondary, opacity: pressed ? 0.65 : 1 },
      ]}
    >
      <Feather name={icon} size={18} color={color ?? colors.primary} />
    </Pressable>
  );
}

export function EmptyState({
  title,
  detail,
  icon = 'inbox',
}: {
  title: string;
  detail: string;
  icon?: keyof typeof Feather.glyphMap;
}) {
  const colors = useColors();
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
        <Feather name={icon} size={21} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.emptyDetail, { color: colors.mutedForeground }]}>{detail}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  pageContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 20,
  },
  title: {
    fontSize: 25,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
    letterSpacing: -0.4,
  },
  body: {
    fontSize: 14,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 17,
    gap: 13,
  },
  sectionHeading: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  actionText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  currencyPicker: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    borderRadius: 14,
    padding: 3,
    gap: 3,
  },
  currencyPickerCompact: {
    alignSelf: 'flex-start',
  },
  currencyOption: {
    minWidth: 48,
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderRadius: 11,
  },
  currencyOptionCompact: {
    minWidth: 42,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  currencyText: {
    fontSize: 11,
    fontWeight: '600',
    writingDirection: 'rtl',
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 26,
    gap: 8,
  },
  emptyIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  emptyDetail: {
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});
