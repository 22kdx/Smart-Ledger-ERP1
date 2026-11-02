import { Feather } from '@expo/vector-icons';
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text as NativeText,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import type { Currency, CurrencyOption } from './erp-store';

export const APP_FONTS = {
  arabic: {
    regular: 'IBMPlexSansArabic_400Regular',
    medium: 'IBMPlexSansArabic_500Medium',
    semibold: 'IBMPlexSansArabic_600SemiBold',
    bold: 'IBMPlexSansArabic_700Bold',
  },
  latin: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
  },
} as const;

function containsArabic(node: React.ReactNode): boolean {
  if (typeof node === 'string') return /[\u0600-\u06ff]/.test(node);
  if (Array.isArray(node)) return node.some(containsArabic);
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return containsArabic(node.props.children);
  }
  return false;
}

function fontForText(node: React.ReactNode, style: TextProps['style']) {
  const weight = String(StyleSheet.flatten(style)?.fontWeight ?? '400');
  const family = containsArabic(node) ? APP_FONTS.arabic : APP_FONTS.latin;
  if (weight === 'bold' || Number(weight) >= 700) return family.bold;
  if (Number(weight) >= 600) return family.semibold;
  if (Number(weight) >= 500) return family.medium;
  return family.regular;
}

export function AppText({ children, style, ...props }: TextProps) {
  return (
    <NativeText {...props} style={[style, { fontFamily: fontForText(children, style) }]}>
      {children}
    </NativeText>
  );
}

export function currencyLabel(currency: Currency) {
  if (currency === 'SAR') return 'ر.س';
  if (currency === 'YER') return 'ر.ي';
  if (currency === 'USD') return 'دولار';
  return currency;
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
  keyboardAware = false,
}: {
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  keyboardAware?: boolean;
}) {
  const colors = useColors();
  if (keyboardAware) {
    return (
      <KeyboardAwareScrollViewCompat
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={[styles.pageContent, contentStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bottomOffset={80}
      >
        {children}
      </KeyboardAwareScrollViewCompat>
    );
  }
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
  return <AppText style={[styles.title, { color: colors.foreground }, style]}>{children}</AppText>;
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
    <AppText
      style={[
        styles.body,
        { color: muted ? colors.mutedForeground : colors.foreground },
        style,
      ]}
    >
      {children}
    </AppText>
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
        { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius },
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
      <AppText style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</AppText>
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
        >
            <AppText style={[styles.actionText, { color: colors.primary }]}>{action}</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function CurrencyPicker({
  value,
  onChange,
  currencies,
  compact = false,
}: {
  value: Currency;
  onChange: (currency: Currency) => void;
  currencies: CurrencyOption[];
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.currencyOptions}
        keyboardShouldPersistTaps="handled"
      >
        {currencies.map((currency) => {
          const active = value === currency.code;
          return (
            <Pressable
              key={currency.code}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`اختيار ${currency.name} ${currency.code}`}
              onPress={() => onChange(currency.code)}
              style={[
                styles.currencyOption,
                compact && styles.currencyOptionCompact,
                active && {
                  backgroundColor: compact ? 'rgba(255,255,255,0.2)' : colors.card,
                },
              ]}
            >
              <AppText
                style={[
                  styles.currencyText,
                  { color: compact ? colors.primaryForeground : colors.mutedForeground },
                  active && { color: compact ? colors.primaryForeground : colors.primary, fontWeight: '700' },
                ]}
              >
                {currency.code}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
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
      <AppText style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</AppText>
      <AppText style={[styles.emptyDetail, { color: colors.mutedForeground }]}>{detail}</AppText>
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
    maxWidth: '100%',
  },
  currencyOptions: { flexDirection: 'row-reverse', gap: 3 },
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
