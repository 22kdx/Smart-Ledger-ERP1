import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { AppText, toEnglishDigits } from '../components/erp-ui';
import { ERPFormSheet } from '../components/erp-form';
import {
  DashboardScreen,
  FinanceScreen,
  FormType,
  InventoryScreen,
  MoreScreen,
  SalesScreen,
} from '../components/erp-screens';
import { ERPProvider, useERP } from '../components/erp-store';

type TabKey = 'home' | 'sales' | 'inventory' | 'finance' | 'more';

const tabs: { key: TabKey; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: 'home', label: 'الرئيسية', icon: 'home' },
  { key: 'sales', label: 'المبيعات', icon: 'file-text' },
  { key: 'inventory', label: 'المخزون', icon: 'package' },
  { key: 'finance', label: 'المالية', icon: 'pie-chart' },
  { key: 'more', label: 'المزيد', icon: 'grid' },
];

function ERPApp() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { data, hydrated } = useERP();
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [formType, setFormType] = useState<FormType | null>(null);
  const topInset = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 5);

  const openForm = (type: FormType) => setFormType(type);
  const notify = () => {
    const lowStock = data.products.filter((product) => product.quantity <= 6);
    const pendingInvoices = data.invoices.filter((invoice) => invoice.status === 'pending');
    const notices = [
      ...lowStock.slice(0, 4).map((product) => `مخزون منخفض: ${product.name} — المتبقي ${product.quantity}`),
      ...pendingInvoices.slice(0, 4).map((invoice) => `فاتورة مستحقة: ${invoice.number} — ${invoice.customer}`),
    ];
    Alert.alert('تنبيهات مدار', toEnglishDigits(notices.join('\n') || 'لا توجد تنبيهات جديدة حالياً.'));
  };

  if (!hydrated) {
    return (
      <View style={[appStyles.loading, { backgroundColor: colors.background, paddingTop: topInset }]}>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        <View style={[appStyles.loadingMark, { backgroundColor: colors.primary }]}>
          <Feather name="pie-chart" size={23} color={colors.primaryForeground} />
        </View>
        <ActivityIndicator color={colors.primary} />
          <AppText style={[appStyles.loadingText, { color: colors.mutedForeground }]}>جارٍ تجهيز مساحة مدار</AppText>
      </View>
    );
  }

  return (
    <View style={[appStyles.root, { backgroundColor: colors.background, paddingTop: topInset }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <View style={appStyles.screen}>
        {activeTab === 'home' ? <DashboardScreen onAdd={openForm} onNotify={notify} /> : null}
        {activeTab === 'sales' ? <SalesScreen onAdd={openForm} /> : null}
        {activeTab === 'inventory' ? <InventoryScreen onAdd={openForm} /> : null}
        {activeTab === 'finance' ? <FinanceScreen onAdd={openForm} /> : null}
        {activeTab === 'more' ? <MoreScreen onAdd={openForm} /> : null}
      </View>
      <View
        style={[
          appStyles.tabBar,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            paddingBottom: bottomInset,
            minHeight: 63 + bottomInset,
          },
        ]}
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={tab.label}
              testID={`tab-${tab.key}`}
              onPress={() => {
                setActiveTab(tab.key);
                Haptics.selectionAsync().catch(() => undefined);
              }}
              style={({ pressed }) => [appStyles.tab, { opacity: pressed ? 0.62 : 1 }]}
            >
              <View style={[appStyles.tabIcon, active && { backgroundColor: colors.secondary }]}>
                <Feather name={tab.icon} size={18} color={active ? colors.primary : colors.mutedForeground} />
              </View>
              <AppText style={[appStyles.tabLabel, { color: active ? colors.primary : colors.mutedForeground, fontWeight: active ? '700' : '500' }]}>
                {tab.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <ERPFormSheet
        type={formType}
        visible={formType !== null}
        onClose={() => setFormType(null)}
      />
    </View>
  );
}

export default function Index() {
  return (
    <ERPProvider>
      <ERPApp />
    </ERPProvider>
  );
}

const appStyles = StyleSheet.create({
  root: { flex: 1 },
  screen: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 7,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabIcon: { width: 38, height: 29, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { fontSize: 10, textAlign: 'center', writingDirection: 'rtl' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 13 },
  loadingMark: { width: 56, height: 56, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 12, textAlign: 'center', writingDirection: 'rtl' },
});
