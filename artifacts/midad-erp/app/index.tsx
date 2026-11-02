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
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
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
  const insets = useSafeAreaInsets();
  const { hydrated } = useERP();
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [formType, setFormType] = useState<FormType | null>(null);
  const topInset = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : Math.max(insets.bottom, 5);

  const openForm = (type: FormType) => setFormType(type);
  const notify = () => {
    Alert.alert('الإشعارات', 'لا توجد إشعارات جديدة حالياً.');
  };

  if (!hydrated) {
    return (
      <View style={[appStyles.loading, { backgroundColor: colors.background, paddingTop: topInset }]}>
        <StatusBar style="dark" />
        <View style={[appStyles.loadingMark, { backgroundColor: colors.primary }]}>
          <Feather name="pie-chart" size={23} color={colors.primaryForeground} />
        </View>
        <ActivityIndicator color={colors.primary} />
        <Text style={[appStyles.loadingText, { color: colors.mutedForeground }]}>جارٍ تجهيز مساحة مدار</Text>
      </View>
    );
  }

  return (
    <View style={[appStyles.root, { backgroundColor: colors.background, paddingTop: topInset }]}>
      <StatusBar style={colors.background === '#101b18' ? 'light' : 'dark'} />
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
              <Text style={[appStyles.tabLabel, { color: active ? colors.primary : colors.mutedForeground, fontWeight: active ? '700' : '500' }]}>
                {tab.label}
              </Text>
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
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 7,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabIcon: { width: 38, height: 29, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { fontSize: 9, textAlign: 'center', writingDirection: 'rtl' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 13 },
  loadingMark: { width: 56, height: 56, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 12, textAlign: 'center', writingDirection: 'rtl' },
});
