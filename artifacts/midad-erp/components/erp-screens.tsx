import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  Image,
  StyleSheet,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import {
  APP_FONTS,
  AppText,
  BodyText,
  Card,
  CurrencyPicker,
  EmptyState,
  formatMoney,
  IconButton,
  Page,
  SectionHeading,
  Title,
  toEnglishDigits,
} from './erp-ui';
import {
  Account,
  Contact,
  Currency,
  Employee,
  Entry,
  Invoice,
  JournalEntry,
  Product,
  DEFAULT_ACCOUNTS,
  getAccountBalances,
  useERP,
} from './erp-store';
import { CompanySettings } from './company-settings';
import {
  countUndatedJournalEntries,
  formatAccountingDate,
  getGeneralLedgerRows,
  getJournalEntriesInDateRange,
  getJournalEntriesThroughDate,
  getTrialBalanceTotals,
  isValidIsoDate,
} from './accounting-utils';

const Text = AppText;

export type FormType = 'invoice' | 'product' | 'income' | 'expense' | 'employee' | 'customer' | 'supplier' | 'journal' | 'account';

function todayLocalIsoDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const typeLabels: Record<FormType, string> = {
  invoice: 'فاتورة مبيعات',
  product: 'منتج جديد',
  income: 'إيراد جديد',
  expense: 'مصروف جديد',
  employee: 'موظف جديد',
  customer: 'عميل جديد',
  supplier: 'مورد جديد',
  journal: 'قيد يومية جديد',
  account: 'حساب جديد',
};

function ScreenHeader({
  eyebrow,
  title,
  detail,
  onBell,
}: {
  eyebrow: string;
  title: string;
  detail?: string;
  onBell?: () => void;
}) {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const logoSource =
    colorScheme === 'dark'
      ? require('../assets/images/tamm-logo-dark.png')
      : require('../assets/images/tamm-logo-light.png');
  return (
    <View style={screenStyles.header}>
      <View style={screenStyles.headerCopy}>
        <View style={screenStyles.brandEyebrow}>
          <Image
            source={logoSource}
            style={screenStyles.brandLogo}
            resizeMode="contain"
            accessibilityLabel="شعار TAMM ERP"
          />
          <Text style={[screenStyles.eyebrow, { color: colors.primary }]}>{eyebrow}</Text>
        </View>
        <Title>{title}</Title>
        {detail ? <BodyText muted>{detail}</BodyText> : null}
      </View>
      {onBell ? (
        <IconButton icon="bell" label="الإشعارات" onPress={onBell} />
      ) : (
        <View style={[screenStyles.brandMark, { backgroundColor: colors.primary }]}>
          <Feather name="pie-chart" size={18} color={colors.primaryForeground} />
        </View>
      )}
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
  accent,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  accent?: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [screenStyles.quickAction, { opacity: pressed ? 0.65 : 1 }]}
    >
      <View style={[screenStyles.quickIcon, { backgroundColor: accent ?? colors.secondary }]}>
        <Feather name={icon} size={17} color={colors.primary} />
      </View>
      <Text style={[screenStyles.quickLabel, { color: colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

function Metric({
  label,
  amount,
  currency,
  icon,
  positive,
}: {
  label: string;
  amount: number;
  currency: Currency;
  icon: keyof typeof Feather.glyphMap;
  positive?: boolean;
}) {
  const colors = useColors();
  return (
    <Card style={screenStyles.metricCard}>
      <View style={screenStyles.metricTop}>
        <View style={[screenStyles.metricIcon, { backgroundColor: positive ? colors.successSoft : colors.warningSoft }]}>
          <Feather name={icon} size={16} color={positive ? colors.success : colors.warning} />
        </View>
        <Text style={[screenStyles.metricLabel, { color: colors.mutedForeground }]}>{label}</Text>
      </View>
      <Text style={[screenStyles.metricValue, { color: colors.foreground }]}>{formatMoney(amount, currency)}</Text>
    </Card>
  );
}

export function DashboardScreen({
  onAdd,
  onNotify,
}: {
  onAdd: (type: FormType) => void;
  onNotify: () => void;
}) {
  const colors = useColors();
  const { data, updateBaseCurrency } = useERP();
  const currency = data.baseCurrency;
  const balances = getAccountBalances(data.journalEntries, currency, data.accounts);
  const totals = useMemo(() => {
    const income = data.accounts
      .filter((account) => account.type === 'revenue')
      .reduce((sum, account) => sum + balances[account.id].balance, 0);
    const expense = data.accounts
      .filter((account) => account.type === 'expense')
      .reduce((sum, account) => sum + balances[account.id].balance, 0);
    const sales = data.invoices.filter((invoice) => invoice.currency === currency).reduce((sum, invoice) => sum + invoice.amount, 0);
    return { income, expense, balance: balances['1000'].balance, sales };
  }, [balances, currency, data.invoices]);
  const latest = data.entries.slice(0, 3);
  const lowStock = data.products.filter((product) => product.quantity <= 6).length;

  return (
    <Page>
      <ScreenHeader
        eyebrow="مساحة عملك المالية"
        title="TAMM ERP"
        detail={data.companyName}
        onBell={onNotify}
      />

      <LinearGradient
        colors={[colors.primary, colors.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={screenStyles.balanceCard}
      >
        <View style={screenStyles.balanceTop}>
          <View>
            <Text style={screenStyles.balanceEyebrow}>الرصيد النقدي</Text>
            <Text style={screenStyles.balanceAmount}>{formatMoney(totals.balance, currency)}</Text>
          </View>
          <CurrencyPicker
            value={currency}
            onChange={updateBaseCurrency}
            currencies={data.currencies.filter((option) => option.isActive)}
            compact
          />
        </View>
        <View style={screenStyles.balanceFooter}>
          <View style={screenStyles.balanceTrend}>
            <Feather name="trending-up" size={15} color={colors.gold} />
            <Text style={screenStyles.balanceTrendText}>ملخص حسب العملة المختارة</Text>
          </View>
          <Text style={screenStyles.balanceFootText}>من {data.entries.length} حركة مالية</Text>
        </View>
      </LinearGradient>

      <View style={screenStyles.metricsGrid}>
        <Metric label="المبيعات" amount={totals.sales} currency={currency} icon="arrow-up-left" positive />
        <Metric label="المصروفات" amount={totals.expense} currency={currency} icon="arrow-down-right" />
      </View>

      <Card style={screenStyles.actionCard}>
        <SectionHeading title="إجراءات سريعة" />
        <View style={screenStyles.actionsRow}>
          <QuickAction icon="file-plus" label="فاتورة" onPress={() => onAdd('invoice')} />
          <QuickAction icon="arrow-down-left" label="إيراد" onPress={() => onAdd('income')} />
          <QuickAction icon="shopping-bag" label="مصروف" onPress={() => onAdd('expense')} />
          <QuickAction icon="package" label="منتج" onPress={() => onAdd('product')} />
        </View>
      </Card>

      <Card style={screenStyles.summaryCard}>
        <View style={screenStyles.summaryHeader}>
          <View>
            <Text style={[screenStyles.summaryTitle, { color: colors.foreground }]}>ملخص اليوم</Text>
            <Text style={[screenStyles.summaryDetail, { color: colors.mutedForeground }]}>نظرة سريعة على نشاطك</Text>
          </View>
          <View style={[screenStyles.summaryBadge, { backgroundColor: colors.successSoft }]}>
            <Feather name="activity" size={15} color={colors.success} />
          </View>
        </View>
        <View style={screenStyles.summaryNumbers}>
          <SummaryNumber label="الفواتير" value={String(data.invoices.length)} />
          <View style={[screenStyles.verticalDivider, { backgroundColor: colors.border }]} />
          <SummaryNumber label="الأصناف" value={String(data.products.length)} />
          <View style={[screenStyles.verticalDivider, { backgroundColor: colors.border }]} />
          <SummaryNumber label="تنبيه مخزون" value={String(lowStock)} alert={lowStock > 0} />
        </View>
      </Card>

      <View style={screenStyles.sectionBlock}>
        <SectionHeading title="أحدث الحركات" action="عرض الكل" />
        <Card style={screenStyles.listCard}>
          {latest.length === 0 ? (
            <EmptyState title="لا توجد حركات بعد" detail="أضف أول إيراد أو مصروف لبدء متابعة الحسابات." />
          ) : (
            latest.map((entry, index) => (
              <TransactionRow
                key={entry.id}
                entry={entry}
                last={index === latest.length - 1}
              />
            ))
          )}
        </Card>
      </View>
    </Page>
  );
}

function SummaryNumber({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  const colors = useColors();
  return (
    <View style={screenStyles.summaryNumber}>
      <Text style={[screenStyles.summaryValue, { color: alert ? colors.warning : colors.foreground }]}>{value}</Text>
      <Text style={[screenStyles.summaryLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

export function SalesScreen({ onAdd }: { onAdd: (type: FormType) => void }) {
  const colors = useColors();
  const { data, toggleInvoiceStatus } = useERP();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'paid'>('all');
  const filtered = useMemo(
    () =>
      data.invoices.filter((invoice) => {
        const matchesText = `${invoice.customer} ${invoice.number}`.toLowerCase().includes(query.toLowerCase());
        return matchesText && (filter === 'all' || invoice.status === filter);
      }),
    [data.invoices, filter, query],
  );
  const total = data.invoices
    .filter((invoice) => invoice.currency === data.baseCurrency)
    .reduce((sum, invoice) => sum + invoice.amount, 0);

  return (
    <Page>
      <ScreenHeader eyebrow="إدارة المبيعات" title="الفواتير" detail={`${data.invoices.length} فاتورة مسجلة`} />
      <LinearGradient colors={[colors.primary, colors.primaryDark]} style={screenStyles.salesBanner}>
        <View>
          <Text style={screenStyles.bannerLabel}>إجمالي الفواتير بعملة العرض</Text>
          <Text style={screenStyles.bannerValue}>{formatMoney(total, data.baseCurrency)}</Text>
        </View>
        <View style={screenStyles.bannerIcon}>
          <Feather name="file-text" size={21} color={colors.primaryForeground} />
        </View>
      </LinearGradient>
      <Pressable
        accessibilityRole="button"
        testID="add-invoice"
        onPress={() => onAdd('invoice')}
        style={({ pressed }) => [screenStyles.primaryButton, { backgroundColor: colors.primary, opacity: pressed ? 0.78 : 1 }]}
      >
        <Feather name="plus" size={18} color={colors.primaryForeground} />
        <Text style={[screenStyles.primaryButtonText, { color: colors.primaryForeground }]}>إنشاء فاتورة جديدة</Text>
      </Pressable>
      <SearchBox value={query} onChangeText={setQuery} placeholder="ابحث باسم العميل أو رقم الفاتورة" />
      <View style={screenStyles.filterRow}>
        {([
          ['all', 'الكل'],
          ['pending', 'مستحقة'],
          ['paid', 'مدفوعة'],
        ] as const).map(([key, label]) => {
          const active = filter === key;
          return (
            <Pressable
              key={key}
              onPress={() => setFilter(key)}
              style={[
                screenStyles.filterChip,
                { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border },
              ]}
            >
              <Text style={[screenStyles.filterText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={screenStyles.sectionBlock}>
        <SectionHeading title="سجل الفواتير" />
        {filtered.length === 0 ? (
          <Card><EmptyState title="لا توجد فواتير مطابقة" detail="غيّر عبارة البحث أو أنشئ فاتورة جديدة." /></Card>
        ) : (
          <Card style={screenStyles.listCard}>
            {filtered.map((invoice, index) => (
              <InvoiceRow
                key={invoice.id}
                invoice={invoice}
                last={index === filtered.length - 1}
                onToggle={() => toggleInvoiceStatus(invoice.id)}
              />
            ))}
          </Card>
        )}
      </View>
    </Page>
  );
}

export function InventoryScreen({ onAdd }: { onAdd: (type: FormType) => void }) {
  const colors = useColors();
  const { data, adjustProductStock } = useERP();
  const [query, setQuery] = useState('');
  const filtered = data.products.filter((product) =>
    `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(query.toLowerCase()),
  );
  const lowStock = data.products.filter((product) => product.quantity <= 6);
  const stockValue = data.products
    .filter((product) => product.currency === data.baseCurrency)
    .reduce((sum, product) => sum + product.quantity * product.price, 0);

  return (
    <Page>
      <ScreenHeader eyebrow="المستودع" title="المخزون" detail={`${data.products.length} صنف في سجلك`} />
      <View style={screenStyles.metricsGrid}>
        <Metric label="قيمة المخزون" amount={stockValue} currency={data.baseCurrency} icon="layers" positive />
        <Card style={screenStyles.metricCard}>
          <View style={screenStyles.metricTop}>
            <View style={[screenStyles.metricIcon, { backgroundColor: colors.warningSoft }]}>
              <Feather name="alert-triangle" size={16} color={colors.warning} />
            </View>
            <Text style={[screenStyles.metricLabel, { color: colors.mutedForeground }]}>مخزون منخفض</Text>
          </View>
          <Text style={[screenStyles.metricValue, { color: colors.foreground }]}>{lowStock.length} أصناف</Text>
        </Card>
      </View>
      <Pressable
        accessibilityRole="button"
        testID="add-product"
        onPress={() => onAdd('product')}
        style={({ pressed }) => [screenStyles.primaryButton, { backgroundColor: colors.primary, opacity: pressed ? 0.78 : 1 }]}
      >
        <Feather name="plus" size={18} color={colors.primaryForeground} />
        <Text style={[screenStyles.primaryButtonText, { color: colors.primaryForeground }]}>إضافة صنف للمخزون</Text>
      </Pressable>
      <SearchBox value={query} onChangeText={setQuery} placeholder="ابحث عن اسم الصنف أو رمزه" />
      {lowStock.length > 0 ? (
        <View style={[screenStyles.notice, { backgroundColor: colors.warningSoft }]}>
          <Feather name="alert-circle" size={17} color={colors.warning} />
          <Text style={[screenStyles.noticeText, { color: colors.warning }]}>
            لديك {lowStock.length} أصناف تحتاج إلى إعادة طلب
          </Text>
        </View>
      ) : null}
      <View style={screenStyles.sectionBlock}>
        <SectionHeading title="كل الأصناف" />
        {filtered.length === 0 ? (
          <Card><EmptyState title="لا توجد أصناف مطابقة" detail="أضف منتجاتك لتنظيم الكميات والأسعار." icon="package" /></Card>
        ) : (
          <Card style={screenStyles.listCard}>
            {filtered.map((product, index) => (
              <ProductRow
                key={product.id}
                product={product}
                last={index === filtered.length - 1}
                onAdjust={(amount) => adjustProductStock(product.id, amount)}
              />
            ))}
          </Card>
        )}
      </View>
    </Page>
  );
}

export function FinanceScreen({ onAdd }: { onAdd: (type: FormType) => void }) {
  const colors = useColors();
  const {
    data,
    postJournalEntry,
    deleteJournalDraft,
    reverseJournalEntry,
    setAccountActive,
  } = useERP();
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [view, setView] = useState<'overview' | 'accounts' | 'journal' | 'reports'>('overview');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState(data.baseCurrency);
  const [reportStartDraft, setReportStartDraft] = useState('');
  const [reportEndDraft, setReportEndDraft] = useState('');
  const [reportPeriod, setReportPeriod] = useState<{ fromDate?: string; toDate?: string }>({});
  const [reportError, setReportError] = useState('');
  useEffect(() => {
    setDisplayCurrency(data.baseCurrency);
  }, [data.baseCurrency]);
  const balances = getAccountBalances(data.journalEntries, displayCurrency, data.accounts);
  const selectedAccount = data.accounts.find((account) => account.id === selectedAccountId) ?? null;
  const ledgerRows = selectedAccount
    ? getGeneralLedgerRows(
        data.journalEntries,
        selectedAccount.id,
        displayCurrency,
        selectedAccount,
      )
    : [];
  const income = data.accounts
    .filter((account) => account.type === 'revenue')
    .reduce((sum, account) => sum + balances[account.id].balance, 0);
  const expense = data.accounts
    .filter((account) => account.type === 'expense')
    .reduce((sum, account) => sum + balances[account.id].balance, 0);
  const periodEntries = getJournalEntriesInDateRange(
    data.journalEntries,
    reportPeriod.fromDate,
    reportPeriod.toDate,
  );
  const endingEntries = getJournalEntriesThroughDate(
    data.journalEntries,
    reportPeriod.toDate,
  );
  const periodBalances = getAccountBalances(periodEntries, displayCurrency, data.accounts);
  const endingBalances = getAccountBalances(endingEntries, displayCurrency, data.accounts);
  const periodIncome = data.accounts
    .filter((account) => account.type === 'revenue')
    .reduce((sum, account) => sum + (periodBalances[account.id]?.balance ?? 0), 0);
  const periodExpense = data.accounts
    .filter((account) => account.type === 'expense')
    .reduce((sum, account) => sum + (periodBalances[account.id]?.balance ?? 0), 0);
  const periodProfit = periodIncome - periodExpense;
  const endingIncome = data.accounts
    .filter((account) => account.type === 'revenue')
    .reduce((sum, account) => sum + (endingBalances[account.id]?.balance ?? 0), 0);
  const endingExpense = data.accounts
    .filter((account) => account.type === 'expense')
    .reduce((sum, account) => sum + (endingBalances[account.id]?.balance ?? 0), 0);
  const endingAssets = data.accounts
    .filter((account) => account.type === 'asset')
    .reduce((sum, account) => sum + (endingBalances[account.id]?.balance ?? 0), 0);
  const endingLiabilities = data.accounts
    .filter((account) => account.type === 'liability')
    .reduce((sum, account) => sum + (endingBalances[account.id]?.balance ?? 0), 0);
  const endingEquity = data.accounts
    .filter((account) => account.type === 'equity')
    .reduce((sum, account) => sum + (endingBalances[account.id]?.balance ?? 0), 0);
  const retainedProfit = endingIncome - endingExpense;
  const trialTotals = getTrialBalanceTotals(endingBalances);
  const totalDebit = trialTotals.debit;
  const totalCredit = trialTotals.credit;
  const max = Math.max(income, expense, 1);
  const visibleEntries = data.entries.filter(
    (entry) =>
      entry.currency === displayCurrency && (filter === 'all' || entry.type === filter),
  );
  const hasReportPeriod = Boolean(reportPeriod.fromDate && reportPeriod.toDate);
  const undatedEntriesInReport = hasReportPeriod
    ? countUndatedJournalEntries(data.journalEntries)
    : 0;
  const applyReportPeriod = () => {
    const fromDate = toEnglishDigits(reportStartDraft).trim();
    const toDate = toEnglishDigits(reportEndDraft).trim();
    if (!fromDate && !toDate) {
      setReportPeriod({});
      setReportError('');
      return;
    }
    if (!isValidIsoDate(fromDate) || !isValidIsoDate(toDate)) {
      setReportError('أدخل تاريخي البداية والنهاية بالصيغة YYYY-MM-DD، أو اترك الحقلين فارغين.');
      return;
    }
    if (fromDate > toDate) {
      setReportError('تاريخ البداية يجب أن يسبق تاريخ النهاية أو يساويه.');
      return;
    }
    setReportPeriod({ fromDate, toDate });
    setReportError('');
  };
  const clearReportPeriod = () => {
    setReportStartDraft('');
    setReportEndDraft('');
    setReportPeriod({});
    setReportError('');
  };
  const requestReverse = (journal: JournalEntry) => {
    Alert.alert(
      'عكس القيد',
      `سيُنشأ قيد عكسي مرقّم بتاريخ اليوم للقيد ${journal.entryNumber ?? ''}. لن تُحذف الحركة الأصلية.`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'إنشاء العكس',
          style: 'destructive',
          onPress: () => reverseJournalEntry(journal.id, todayLocalIsoDate()),
        },
      ],
    );
  };

  return (
    <Page keyboardAware={view === 'reports'}>
      <ScreenHeader eyebrow="الحسابات" title="المالية" detail="متابعة الإيرادات والمصروفات" />
      <View style={screenStyles.financeViews}>
        {([
          ['overview', 'ملخص'],
          ['accounts', 'الحسابات'],
          ['journal', 'اليومية'],
          ['reports', 'التقارير'],
        ] as const).map(([key, label]) => {
          const active = view === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setView(key)}
              style={[
                screenStyles.financeView,
                { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border },
              ]}
            >
              <Text style={[screenStyles.financeViewText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {view === 'overview' ? (
        <>
      <Card style={screenStyles.currencyCard}>
        <View style={screenStyles.currencyCardHeader}>
          <Text style={[screenStyles.currencyCardTitle, { color: colors.foreground }]}>عملة العرض</Text>
          <Text style={[screenStyles.currencyCardHint, { color: colors.mutedForeground }]}>الأرقام لا تجمع بين عملات مختلفة</Text>
        </View>
        <CurrencyPicker
            value={displayCurrency}
            onChange={setDisplayCurrency}
          currencies={data.currencies.filter((option) => option.isActive)}
        />
      </Card>
      <View style={screenStyles.metricsGrid}>
        <Metric label="الإيرادات" amount={income} currency={displayCurrency} icon="trending-up" positive />
        <Metric label="المصروفات" amount={expense} currency={displayCurrency} icon="trending-down" />
      </View>
      <Card>
        <SectionHeading title="مقارنة الحركة المالية" />
        <View style={screenStyles.chartRow}>
          <ChartColumn label="إيرادات" amount={income} max={max} currency={displayCurrency} positive />
          <ChartColumn label="مصروفات" amount={expense} max={max} currency={displayCurrency} />
        </View>
      </Card>
      <View style={screenStyles.actionsRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => onAdd('income')}
          style={({ pressed }) => [screenStyles.financeAction, { backgroundColor: colors.successSoft, opacity: pressed ? 0.7 : 1 }]}
        >
          <Feather name="plus-circle" size={17} color={colors.success} />
          <Text style={[screenStyles.financeActionText, { color: colors.success }]}>تسجيل إيراد</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => onAdd('expense')}
          style={({ pressed }) => [screenStyles.financeAction, { backgroundColor: colors.warningSoft, opacity: pressed ? 0.7 : 1 }]}
        >
          <Feather name="minus-circle" size={17} color={colors.warning} />
          <Text style={[screenStyles.financeActionText, { color: colors.warning }]}>تسجيل مصروف</Text>
        </Pressable>
      </View>
      <View style={screenStyles.sectionBlock}>
        <SectionHeading title="سجل الحركات" />
        <View style={screenStyles.filterRow}>
          {([
            ['all', 'الكل'],
            ['income', 'إيرادات'],
            ['expense', 'مصروفات'],
          ] as const).map(([key, label]) => {
            const active = filter === key;
            return (
              <Pressable
                key={key}
                onPress={() => setFilter(key)}
                style={[
                  screenStyles.filterChip,
                  { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border },
                ]}
              >
                <Text style={[screenStyles.filterText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        {visibleEntries.length === 0 ? (
          <Card><EmptyState title="لا توجد حركات لهذه العملة" detail="سجّل إيراداً أو مصروفاً لعرضه هنا." icon="credit-card" /></Card>
        ) : (
          <Card style={screenStyles.listCard}>
            {visibleEntries.map((entry, index) => (
              <TransactionRow key={entry.id} entry={entry} last={index === visibleEntries.length - 1} />
            ))}
          </Card>
        )}
      </View>
        </>
      ) : null}
      {view === 'accounts' ? (
        <View style={screenStyles.sectionBlock}>
          {selectedAccount ? (
            <>
              <Pressable
                accessibilityRole="button"
                testID="account-ledger-back"
                onPress={() => setSelectedAccountId(null)}
                style={screenStyles.backButton}
              >
                <Feather name="arrow-right" size={16} color={colors.primary} />
                <Text style={[screenStyles.backButtonText, { color: colors.primary }]}>العودة إلى دليل الحسابات</Text>
              </Pressable>
              <SectionHeading title={`كشف حساب ${selectedAccount.name}`} />
              <Card style={screenStyles.listCard}>
                {ledgerRows.length === 0 ? (
                  <EmptyState title="لا توجد حركات مرحّلة" detail="ستظهر هنا القيود المرحلة على هذا الحساب وبعملة التقرير." icon="book-open" />
                ) : (
                  ledgerRows.map((row, index) => (
                    <View
                      key={`${row.entryId}-${index}`}
                      style={[
                        screenStyles.ledgerRow,
                        index < ledgerRows.length - 1 && {
                          borderBottomColor: colors.border,
                          borderBottomWidth: StyleSheet.hairlineWidth,
                        },
                      ]}
                    >
                      <View style={screenStyles.ledgerHeading}>
                        <Text style={[screenStyles.rowTitle, { color: colors.foreground }]}>{row.description}</Text>
                        <Text style={[screenStyles.rowSub, { color: colors.mutedForeground }]}>{row.entryNumber} · {row.date}</Text>
                      </View>
                      <View style={screenStyles.ledgerAmounts}>
                        <Text style={[screenStyles.ledgerAmount, { color: colors.foreground }]}>مدين {formatMoney(row.debit, displayCurrency)}</Text>
                        <Text style={[screenStyles.ledgerAmount, { color: colors.foreground }]}>دائن {formatMoney(row.credit, displayCurrency)}</Text>
                        <Text style={[screenStyles.ledgerBalance, { color: colors.primary }]}>الرصيد {formatMoney(row.runningBalance, displayCurrency)}</Text>
                      </View>
                    </View>
                  ))
                )}
              </Card>
            </>
          ) : (
            <>
              <SectionHeading title="دليل الحسابات" action={`${data.accounts.length} حساب`} />
              <Pressable
                accessibilityRole="button"
                testID="add-account"
                onPress={() => onAdd('account')}
                style={({ pressed }) => [
                  screenStyles.primaryButton,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.78 : 1 },
                ]}
              >
                <Feather name="plus" size={18} color={colors.primaryForeground} />
                <Text style={[screenStyles.primaryButtonText, { color: colors.primaryForeground }]}>إضافة حساب</Text>
              </Pressable>
              <Card style={screenStyles.listCard}>
                {data.accounts.map((account, index) => (
                  <AccountBalanceRow
                    key={account.id}
                    account={account}
                    balance={balances[account.id]?.balance ?? 0}
                    currency={displayCurrency}
                    last={index === data.accounts.length - 1}
                    onSelect={() => setSelectedAccountId(account.id)}
                    onToggleActive={() =>
                      setAccountActive(account.id, account.isActive === false)
                    }
                  />
                ))}
              </Card>
            </>
          )}
          <Text style={[screenStyles.currencyCardHint, { color: colors.mutedForeground }]}>
            الأرصدة لا تُحوّل بين العملات. كشف الحساب يعرض القيود المرحلة فقط.
          </Text>
        </View>
      ) : null}
      {view === 'journal' ? (
        <View style={screenStyles.sectionBlock}>
          <Pressable
            accessibilityRole="button"
            testID="add-journal-entry"
            onPress={() => onAdd('journal')}
            style={({ pressed }) => [
              screenStyles.primaryButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.78 : 1 },
            ]}
          >
            <Feather name="plus" size={18} color={colors.primaryForeground} />
            <Text style={[screenStyles.primaryButtonText, { color: colors.primaryForeground }]}>إضافة قيد يومية</Text>
          </Pressable>
          <SectionHeading title="دفتر اليومية" action={`${data.journalEntries.length} قيد`} />
          {data.journalEntries.length === 0 ? (
            <Card><EmptyState title="دفتر اليومية فارغ" detail="أضف قيداً متوازناً لبدء تسجيل العمليات المحاسبية." icon="book-open" /></Card>
          ) : (
            <Card style={screenStyles.listCard}>
              {data.journalEntries.map((journal, index) => (
                <JournalEntryRow
                  key={journal.id}
                  journal={journal}
                  currency={displayCurrency}
                  accounts={data.accounts}
                  last={index === data.journalEntries.length - 1}
                  onPost={() => postJournalEntry(journal.id)}
                  onDeleteDraft={() =>
                    Alert.alert(
                      'حذف المسودة',
                      'سيُحذف القيد غير المرحّل فقط.',
                      [
                        { text: 'إلغاء', style: 'cancel' },
                        {
                          text: 'حذف',
                          style: 'destructive',
                          onPress: () => deleteJournalDraft(journal.id),
                        },
                      ],
                    )
                  }
                  onReverse={() => requestReverse(journal)}
                />
              ))}
            </Card>
          )}
        </View>
      ) : null}
      {view === 'reports' ? (
        <View style={screenStyles.sectionBlock}>
          <Card style={screenStyles.currencyCard}>
            <View style={screenStyles.currencyCardHeader}>
              <Text style={[screenStyles.currencyCardTitle, { color: colors.foreground }]}>عملة التقرير</Text>
              <Text style={[screenStyles.currencyCardHint, { color: colors.mutedForeground }]}>عرض فقط، بلا تحويل</Text>
            </View>
            <CurrencyPicker
              value={displayCurrency}
              onChange={setDisplayCurrency}
              currencies={data.currencies.filter((option) => option.isActive)}
            />
          </Card>
          <Card style={screenStyles.reportCard}>
            <SectionHeading title="فترة التقرير" />
            <Text style={[screenStyles.currencyCardHint, { color: colors.mutedForeground }]}>
              اترك التاريخين فارغين لعرض كل السجلات.
            </Text>
            <View style={screenStyles.reportDateRow}>
              <View style={screenStyles.reportDateField}>
                <Text style={[screenStyles.reportDateLabel, { color: colors.mutedForeground }]}>من تاريخ</Text>
                <TextInput
                  accessibilityLabel="بداية فترة التقرير"
                  testID="report-start-date"
                  value={reportStartDraft}
                  onChangeText={(value) => {
                    setReportStartDraft(toEnglishDigits(value).replace(/[^\d-]/g, '').slice(0, 10));
                    setReportError('');
                  }}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                  style={[
                    screenStyles.reportDateInput,
                    { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background },
                  ]}
                />
              </View>
              <View style={screenStyles.reportDateField}>
                <Text style={[screenStyles.reportDateLabel, { color: colors.mutedForeground }]}>إلى تاريخ</Text>
                <TextInput
                  accessibilityLabel="نهاية فترة التقرير"
                  testID="report-end-date"
                  value={reportEndDraft}
                  onChangeText={(value) => {
                    setReportEndDraft(toEnglishDigits(value).replace(/[^\d-]/g, '').slice(0, 10));
                    setReportError('');
                  }}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                  style={[
                    screenStyles.reportDateInput,
                    { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background },
                  ]}
                />
              </View>
            </View>
            {reportError ? (
              <Text accessibilityRole="alert" style={[screenStyles.reportDateError, { color: colors.warning }]}>
                {reportError}
              </Text>
            ) : null}
            <View style={screenStyles.reportPeriodActions}>
              <Pressable
                accessibilityRole="button"
                testID="apply-report-period"
                onPress={applyReportPeriod}
                style={({ pressed }) => [
                  screenStyles.reportPeriodButton,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 },
                ]}
              >
                <Text style={[screenStyles.primaryButtonText, { color: colors.primaryForeground }]}>تطبيق الفترة</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                testID="clear-report-period"
                onPress={clearReportPeriod}
                style={({ pressed }) => [
                  screenStyles.reportPeriodButton,
                  { backgroundColor: colors.secondary, opacity: pressed ? 0.75 : 1 },
                ]}
              >
                <Text style={[screenStyles.primaryButtonText, { color: colors.foreground }]}>مسح</Text>
              </Pressable>
            </View>
            {hasReportPeriod ? (
              <Text style={[screenStyles.currencyCardHint, { color: colors.primary }]}>
                من {formatAccountingDate(reportPeriod.fromDate!)} إلى {formatAccountingDate(reportPeriod.toDate!)}
              </Text>
            ) : null}
            {undatedEntriesInReport > 0 ? (
              <Text style={[screenStyles.reportDateWarning, { color: colors.warning }]}>
                استُبعد {undatedEntriesInReport} قيداً قديماً لأن تاريخه ليس بصيغة YYYY-MM-DD.
              </Text>
            ) : null}
          </Card>
          <Card style={screenStyles.reportCard}>
            <SectionHeading title="قائمة الدخل" />
            <ReportRow label="إيرادات الفترة" amount={periodIncome} currency={displayCurrency} />
            <ReportRow label="مصروفات الفترة" amount={periodExpense} currency={displayCurrency} />
            <ReportRow label="صافي ربح الفترة" amount={periodProfit} currency={displayCurrency} strong />
          </Card>
          <Card style={screenStyles.reportCard}>
            <SectionHeading title="الميزانية حتى تاريخ التقرير" />
            <ReportRow label="الأصول" amount={endingAssets} currency={displayCurrency} />
            <ReportRow label="الالتزامات" amount={endingLiabilities} currency={displayCurrency} />
            <ReportRow label="حقوق الملكية والأرباح المتراكمة" amount={endingEquity + retainedProfit} currency={displayCurrency} strong />
          </Card>
          <Card style={screenStyles.reportCard}>
            <SectionHeading title="ميزان المراجعة" />
            <View style={[screenStyles.trialBalanceRow, screenStyles.trialHeader, { borderBottomColor: colors.border }]}>
              <Text style={[screenStyles.trialAccountName, { color: colors.mutedForeground, fontWeight: '800' }]}>الحساب</Text>
              <View style={screenStyles.trialAmounts}>
                <Text style={[screenStyles.trialAmount, { color: colors.mutedForeground, fontWeight: '800' }]}>مدين</Text>
                <Text style={[screenStyles.trialAmount, { color: colors.mutedForeground, fontWeight: '800' }]}>دائن</Text>
              </View>
            </View>
            {data.accounts.map((account) => (
              <View key={account.id} style={screenStyles.trialBalanceRow}>
                <Text style={[screenStyles.trialAccountName, { color: colors.foreground }]}>
                  {account.code} · {account.name}
                </Text>
                <View style={screenStyles.trialAmounts}>
                  <Text style={[screenStyles.trialAmount, { color: colors.mutedForeground }]}>
              {formatMoney(endingBalances[account.id]?.debit ?? 0, displayCurrency)}
                  </Text>
                  <Text style={[screenStyles.trialAmount, { color: colors.mutedForeground }]}>
              {formatMoney(endingBalances[account.id]?.credit ?? 0, displayCurrency)}
                  </Text>
                </View>
              </View>
            ))}
            <View style={[screenStyles.trialBalanceRow, screenStyles.trialTotals, { borderTopColor: colors.border }]}>
            <Text style={[screenStyles.trialAccountName, { color: colors.foreground }]}>الإجمالي حتى تاريخ التقرير</Text>
              <View style={screenStyles.trialAmounts}>
              <Text style={[screenStyles.trialAmount, { color: colors.foreground, fontWeight: '800' }]}>{formatMoney(totalDebit, displayCurrency)}</Text>
              <Text style={[screenStyles.trialAmount, { color: colors.foreground, fontWeight: '800' }]}>{formatMoney(totalCredit, displayCurrency)}</Text>
              </View>
            </View>
              <Text style={[
                screenStyles.currencyCardHint,
                { color: trialTotals.isBalanced ? colors.success : colors.warning },
              ]}>
                {trialTotals.isBalanced ? 'الميزان متوازن' : 'يوجد فرق في ميزان المراجعة'}
              </Text>
          </Card>
        </View>
      ) : null}
    </Page>
  );
}

function AccountBalanceRow({
  account,
  balance,
  currency,
  last,
  onSelect,
  onToggleActive,
}: {
  account: Account;
  balance: number;
  currency: Currency;
  last: boolean;
  onSelect: () => void;
  onToggleActive: () => void;
}) {
  const colors = useColors();
  return (
    <View style={[
      screenStyles.listRow,
      !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
    ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`كشف حساب ${account.name}`}
        onPress={onSelect}
        style={({ pressed }) => [screenStyles.accountRowMain, pressed && { opacity: 0.65 }]}
      >
        <View style={[screenStyles.rowIcon, { backgroundColor: colors.secondary }]}>
          <Feather name="book" size={16} color={colors.primary} />
        </View>
        <View style={screenStyles.rowMain}>
          <Text style={[screenStyles.rowTitle, { color: colors.foreground }]}>{account.name}</Text>
          <Text style={[screenStyles.rowSub, { color: colors.mutedForeground }]}>
            {account.code} · {accountTypeLabel(account.type)}{account.isActive === false ? ' · موقوف' : ''}
          </Text>
        </View>
        <Text style={[screenStyles.rowAmount, { color: colors.foreground }]}>{formatMoney(balance, currency)}</Text>
        <Feather name="chevron-left" size={16} color={colors.mutedForeground} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={account.isActive === false ? `تفعيل ${account.name}` : `إيقاف ${account.name}`}
        onPress={onToggleActive}
        style={({ pressed }) => [
          screenStyles.accountToggle,
          { backgroundColor: colors.muted, opacity: pressed ? 0.65 : 1 },
        ]}
      >
        <Text style={[screenStyles.accountToggleText, { color: colors.mutedForeground }]}>
          {account.isActive === false ? 'تفعيل' : 'إيقاف'}
        </Text>
      </Pressable>
    </View>
  );
}

function JournalEntryRow({
  journal,
  currency,
  accounts,
  last,
  onPost,
  onDeleteDraft,
  onReverse,
}: {
  journal: JournalEntry;
  currency: Currency;
  accounts: Account[];
  last: boolean;
  onPost: () => void;
  onDeleteDraft: () => void;
  onReverse: () => void;
}) {
  const colors = useColors();
  const amount = journal.lines.reduce((sum, line) => sum + line.debit, 0);
  const journalCurrency = journal.lines[0]?.currency ?? currency;
  const status = journal.status ?? 'posted';
  const statusText = status === 'draft' ? 'مسودة' : status === 'reversed' ? 'معكوس' : 'مرحّل';
  const statusColor =
    status === 'draft' ? colors.warning : status === 'reversed' ? colors.mutedForeground : colors.success;
  return (
    <View style={[screenStyles.journalCardRow, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={screenStyles.journalRow}>
        <View style={screenStyles.journalCopy}>
          <Text style={[screenStyles.rowTitle, { color: colors.foreground }]}>{journal.description}</Text>
          <Text style={[screenStyles.rowSub, { color: colors.mutedForeground }]}>
            {journal.entryNumber ?? '—'} · {formatAccountingDate(journal.date)} · {journal.lines.length} سطر
          </Text>
          {journal.lines.slice(0, 3).map((line, index) => {
            const account = accounts.find((item) => item.id === line.accountId);
            const side = line.debit > 0 ? 'مدين' : 'دائن';
            const lineAmount = line.debit > 0 ? line.debit : line.credit;
            return (
              <Text key={`${journal.id}-${index}`} style={[screenStyles.journalLineText, { color: colors.mutedForeground }]}>
                {side}: {account?.name ?? 'حساب غير معروف'} · {formatMoney(lineAmount, line.currency)}
              </Text>
            );
          })}
          {journal.lines.length > 3 ? (
            <Text style={[screenStyles.rowSub, { color: colors.mutedForeground }]}>و{journal.lines.length - 3} أسطر أخرى</Text>
          ) : null}
        </View>
        <View style={screenStyles.journalAmount}>
          <Text style={[screenStyles.rowAmount, { color: colors.primary }]}>{formatMoney(amount, journalCurrency)}</Text>
          <Text style={[screenStyles.journalStatus, { color: statusColor }]}>{statusText}</Text>
        </View>
      </View>
      {status === 'draft' ? (
        <View style={screenStyles.journalActions}>
          <JournalAction label="ترحيل" icon="check" onPress={onPost} primary />
          <JournalAction label="حذف المسودة" icon="trash-2" onPress={onDeleteDraft} destructive />
        </View>
      ) : status === 'posted' ? (
        <View style={screenStyles.journalActions}>
          <JournalAction label="عكس القيد" icon="corner-up-left" onPress={onReverse} />
        </View>
      ) : null}
    </View>
  );
}

function JournalAction({
  label,
  icon,
  onPress,
  primary = false,
  destructive = false,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  primary?: boolean;
  destructive?: boolean;
}) {
  const colors = useColors();
  const color = destructive ? colors.warning : primary ? colors.primary : colors.mutedForeground;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        screenStyles.journalActionButton,
        { backgroundColor: primary ? colors.secondary : colors.muted, opacity: pressed ? 0.65 : 1 },
      ]}
    >
      <Feather name={icon} size={13} color={color} />
      <Text style={[screenStyles.journalActionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

function ReportRow({
  label,
  amount,
  currency,
  strong = false,
}: {
  label: string;
  amount: number;
  currency: Currency;
  strong?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[screenStyles.reportRow, strong && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 }]}>
      <Text style={[screenStyles.reportLabel, { color: colors.foreground, fontWeight: strong ? '800' : '500' }]}>{label}</Text>
      <Text style={[screenStyles.reportAmount, { color: colors.foreground, fontWeight: strong ? '800' : '600' }]}>{formatMoney(amount, currency)}</Text>
    </View>
  );
}

function accountTypeLabel(type: (typeof DEFAULT_ACCOUNTS)[number]['type']) {
  if (type === 'asset') return 'أصل';
  if (type === 'liability') return 'التزام';
  if (type === 'equity') return 'حقوق ملكية';
  if (type === 'revenue') return 'إيراد';
  return 'مصروف';
}

export function MoreScreen({ onAdd }: { onAdd: (type: FormType) => void }) {
  const colors = useColors();
  const { data } = useERP();
  const customers = data.contacts.filter((contact) => contact.kind === 'customer');
  const suppliers = data.contacts.filter((contact) => contact.kind === 'supplier');

  return (
    <Page keyboardAware>
      <ScreenHeader eyebrow="إدارة المنشأة" title="المزيد" detail="الأشخاص والموظفون وإعدادات الشركة" />
      <Card style={screenStyles.companyCard}>
        <View style={[screenStyles.companyMark, { backgroundColor: colors.primary }]}>
          <Feather name="briefcase" size={21} color={colors.primaryForeground} />
        </View>
        <View style={screenStyles.companyCopy}>
          <Text style={[screenStyles.companyName, { color: colors.foreground }]}>{data.companyName}</Text>
          <Text style={[screenStyles.companyCaption, { color: colors.mutedForeground }]}>إدارة الحسابات اليومية في مكان واحد</Text>
        </View>
      </Card>
      <View style={screenStyles.sectionBlock}>
        <SectionHeading title="دليل الأعمال" />
        <View style={screenStyles.metricsGrid}>
          <DirectoryCard
            title="العملاء"
            count={customers.length}
            icon="users"
            onAdd={() => onAdd('customer')}
          />
          <DirectoryCard
            title="الموردون"
            count={suppliers.length}
            icon="truck"
            onAdd={() => onAdd('supplier')}
          />
        </View>
        <Card style={screenStyles.listCard}>
          {data.contacts.length === 0 ? (
            <EmptyState title="دليل الأعمال فارغ" detail="أضف عميلاً أو مورداً لتبدأ تنظيم علاقاتك." icon="users" />
          ) : (
            data.contacts.map((contact, index) => (
              <ContactRow key={contact.id} contact={contact} last={index === data.contacts.length - 1} />
            ))
          )}
        </Card>
      </View>
      <View style={screenStyles.sectionBlock}>
        <SectionHeading title="فريق العمل" action={`${data.employees.length} موظفين`} />
        <Card style={screenStyles.listCard}>
          {data.employees.map((employee, index) => (
            <EmployeeRow
              key={employee.id}
              employee={employee}
              last={index === data.employees.length - 1}
            />
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => onAdd('employee')}
            style={({ pressed }) => [
              screenStyles.addRowButton,
              { borderColor: colors.border, opacity: pressed ? 0.65 : 1 },
            ]}
          >
            <Feather name="user-plus" size={16} color={colors.primary} />
            <Text style={[screenStyles.addRowText, { color: colors.primary }]}>إضافة موظف</Text>
          </Pressable>
        </Card>
      </View>
      <CompanySettings />
    </Page>
  );
}

function DirectoryCard({
  title,
  count,
  icon,
  onAdd,
}: {
  title: string;
  count: number;
  icon: keyof typeof Feather.glyphMap;
  onAdd: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onAdd}
      style={({ pressed }) => [
        screenStyles.directoryCard,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.68 : 1 },
      ]}
    >
      <View style={[screenStyles.metricIcon, { backgroundColor: colors.secondary }]}>
        <Feather name={icon} size={16} color={colors.primary} />
      </View>
      <Text style={[screenStyles.directoryTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[screenStyles.directoryCount, { color: colors.mutedForeground }]}>{count} سجل</Text>
    </Pressable>
  );
}

function SearchBox({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  const colors = useColors();
  return (
    <View style={[screenStyles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Feather name="search" size={17} color={colors.mutedForeground} />
      <TextInput
        value={toEnglishDigits(value)}
        onChangeText={(text) => onChangeText(toEnglishDigits(text))}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        style={[screenStyles.searchInput, { color: colors.foreground }]}
        textAlign="right"
        returnKeyType="search"
        accessibilityLabel={placeholder}
      />
    </View>
  );
}

function TransactionRow({ entry, last }: { entry: Entry; last: boolean }) {
  const colors = useColors();
  const income = entry.type === 'income';
  return (
    <View style={[screenStyles.listRow, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={[screenStyles.rowIcon, { backgroundColor: income ? colors.successSoft : colors.warningSoft }]}>
        <Feather name={income ? 'arrow-down-left' : 'arrow-up-left'} size={16} color={income ? colors.success : colors.warning} />
      </View>
      <View style={screenStyles.rowMain}>
        <Text style={[screenStyles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{entry.title}</Text>
        <Text style={[screenStyles.rowSub, { color: colors.mutedForeground }]}>{entry.category} · {formatAccountingDate(entry.date)}</Text>
      </View>
      <Text style={[screenStyles.rowAmount, { color: income ? colors.success : colors.foreground }]}>
        {income ? '+' : '−'} {formatMoney(entry.amount, entry.currency)}
      </Text>
    </View>
  );
}

function InvoiceRow({
  invoice,
  last,
  onToggle,
}: {
  invoice: Invoice;
  last: boolean;
  onToggle: () => void;
}) {
  const colors = useColors();
  const paid = invoice.status === 'paid';
  return (
    <View style={[screenStyles.listRow, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={[screenStyles.rowIcon, { backgroundColor: colors.secondary }]}>
        <Feather name="file-text" size={16} color={colors.primary} />
      </View>
      <View style={screenStyles.rowMain}>
        <Text style={[screenStyles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{invoice.customer}</Text>
        <Text style={[screenStyles.rowSub, { color: colors.mutedForeground }]}>{invoice.number} · {formatAccountingDate(invoice.date)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={paid ? 'تغيير الحالة إلى مستحقة' : 'تغيير الحالة إلى مدفوعة'}
          onPress={onToggle}
          style={[
            screenStyles.statusPill,
            { backgroundColor: paid ? colors.successSoft : colors.warningSoft },
          ]}
        >
          <View style={[screenStyles.statusDot, { backgroundColor: paid ? colors.success : colors.warning }]} />
          <Text style={[screenStyles.statusText, { color: paid ? colors.success : colors.warning }]}>
            {paid ? 'مدفوعة' : 'مستحقة'}
          </Text>
        </Pressable>
      </View>
      <Text style={[screenStyles.rowAmount, { color: colors.foreground }]}>{formatMoney(invoice.amount, invoice.currency)}</Text>
    </View>
  );
}

function ProductRow({
  product,
  last,
  onAdjust,
}: {
  product: Product;
  last: boolean;
  onAdjust: (amount: number) => void;
}) {
  const colors = useColors();
  const low = product.quantity <= 6;
  return (
    <View style={[screenStyles.productRow, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={[screenStyles.rowIcon, { backgroundColor: colors.secondary }]}>
        <Feather name="package" size={16} color={colors.primary} />
      </View>
      <View style={screenStyles.productMain}>
        <Text style={[screenStyles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{product.name}</Text>
        <Text style={[screenStyles.rowSub, { color: colors.mutedForeground }]}>{product.sku} · {product.category}</Text>
        <Text style={[screenStyles.productPrice, { color: colors.primary }]}>{formatMoney(product.price, product.currency)}</Text>
      </View>
      <View style={screenStyles.stockControl}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`تقليل مخزون ${product.name}`}
          onPress={() => onAdjust(-1)}
          style={[screenStyles.stockButton, { backgroundColor: colors.muted }]}
        >
          <Feather name="minus" size={13} color={colors.foreground} />
        </Pressable>
        <Text style={[screenStyles.stockCount, { color: low ? colors.warning : colors.foreground }]}>{product.quantity}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`زيادة مخزون ${product.name}`}
          onPress={() => onAdjust(1)}
          style={[screenStyles.stockButton, { backgroundColor: colors.muted }]}
        >
          <Feather name="plus" size={13} color={colors.foreground} />
        </Pressable>
      </View>
    </View>
  );
}

function ChartColumn({
  label,
  amount,
  max,
  currency,
  positive,
}: {
  label: string;
  amount: number;
  max: number;
  currency: Currency;
  positive?: boolean;
}) {
  const colors = useColors();
  const fill = Math.max(5, (amount / max) * 100);
  return (
    <View style={screenStyles.chartColumn}>
      <Text style={[screenStyles.chartAmount, { color: colors.foreground }]}>{formatMoney(amount, currency)}</Text>
      <View style={[screenStyles.chartTrack, { backgroundColor: colors.muted }]}>
        <View
          style={[
            screenStyles.chartFill,
            { height: `${fill}%`, backgroundColor: positive ? colors.success : colors.warning },
          ]}
        />
      </View>
      <Text style={[screenStyles.chartLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function ContactRow({ contact, last }: { contact: Contact; last: boolean }) {
  const colors = useColors();
  const customer = contact.kind === 'customer';
  return (
    <View style={[screenStyles.listRow, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={[screenStyles.avatar, { backgroundColor: customer ? colors.infoSoft : colors.warningSoft }]}>
        <Text style={[screenStyles.avatarText, { color: customer ? colors.info : colors.warning }]}>
          {contact.name.slice(0, 1)}
        </Text>
      </View>
      <View style={screenStyles.rowMain}>
        <Text style={[screenStyles.rowTitle, { color: colors.foreground }]}>{contact.name}</Text>
        <Text style={[screenStyles.rowSub, { color: colors.mutedForeground }]}>{customer ? 'عميل' : 'مورد'} · {contact.phone || 'لا يوجد رقم'}</Text>
      </View>
      <Feather name={customer ? 'user' : 'truck'} size={16} color={colors.mutedForeground} />
    </View>
  );
}

function EmployeeRow({ employee, last }: { employee: Employee; last: boolean }) {
  const colors = useColors();
  return (
    <View style={[screenStyles.listRow, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={[screenStyles.avatar, { backgroundColor: colors.secondary }]}>
        <Text style={[screenStyles.avatarText, { color: colors.primary }]}>{employee.name.slice(0, 1)}</Text>
      </View>
      <View style={screenStyles.rowMain}>
        <Text style={[screenStyles.rowTitle, { color: colors.foreground }]}>{employee.name}</Text>
        <Text style={[screenStyles.rowSub, { color: colors.mutedForeground }]}>{employee.role}</Text>
      </View>
      <Text style={[screenStyles.rowAmount, { color: colors.foreground }]}>{formatMoney(employee.salary, employee.currency)}</Text>
    </View>
  );
}

export function formTitle(type: FormType) {
  return typeLabels[type];
}

const screenStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    marginBottom: 2,
  },
  headerCopy: { flex: 1, gap: 5, alignItems: 'flex-start' },
  brandEyebrow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 30 },
  brandLogo: { width: 34, height: 30 },
  eyebrow: { fontSize: 12, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  brandMark: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  balanceCard: { borderRadius: 24, padding: 21, gap: 24 },
  balanceTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  balanceEyebrow: { color: 'rgba(255,255,255,0.72)', fontSize: 13, textAlign: 'right', writingDirection: 'rtl' },
  balanceAmount: { color: '#ffffff', fontSize: 27, fontWeight: '800', marginTop: 8, textAlign: 'right', writingDirection: 'rtl' },
  balanceFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  balanceTrend: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  balanceTrendText: { color: '#ffffff', fontSize: 11, writingDirection: 'rtl' },
  balanceFootText: { color: 'rgba(255,255,255,0.67)', fontSize: 11, textAlign: 'right', writingDirection: 'rtl' },
  metricsGrid: { flexDirection: 'row', gap: 11 },
  metricCard: { flex: 1, minWidth: 0, padding: 14, gap: 13 },
  metricTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metricIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  metricLabel: { flex: 1, fontSize: 12, textAlign: 'right', writingDirection: 'rtl' },
  metricValue: { fontSize: 15, fontWeight: '800', textAlign: 'right', writingDirection: 'rtl' },
  actionCard: { gap: 16 },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  quickAction: { flex: 1, alignItems: 'center', gap: 8, paddingVertical: 2 },
  quickIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center', writingDirection: 'rtl' },
  summaryCard: { gap: 17 },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryTitle: { fontSize: 15, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  summaryDetail: { fontSize: 11, marginTop: 4, textAlign: 'right', writingDirection: 'rtl' },
  summaryBadge: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  summaryNumbers: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryNumber: { flex: 1, alignItems: 'center', gap: 5 },
  summaryValue: { fontSize: 18, fontWeight: '800' },
  summaryLabel: { fontSize: 11, textAlign: 'center', writingDirection: 'rtl' },
  verticalDivider: { width: StyleSheet.hairlineWidth, height: 30 },
  sectionBlock: { gap: 12 },
  listCard: { paddingVertical: 2, gap: 0 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 14 },
  rowIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rowMain: { flex: 1, minWidth: 0, alignItems: 'flex-start', gap: 4 },
  rowTitle: { fontSize: 13, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  rowSub: { fontSize: 11, textAlign: 'right', writingDirection: 'rtl' },
  rowAmount: { fontSize: 12, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  salesBanner: { borderRadius: 22, padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bannerLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12, textAlign: 'right', writingDirection: 'rtl' },
  bannerValue: { color: '#ffffff', fontSize: 22, fontWeight: '800', marginTop: 8, textAlign: 'right', writingDirection: 'rtl' },
  bannerIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  primaryButton: { borderRadius: 15, minHeight: 51, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  primaryButtonText: { fontSize: 14, fontWeight: '700', textAlign: 'center', writingDirection: 'rtl' },
  searchBox: { minHeight: 48, borderRadius: 15, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 },
  searchInput: { flex: 1, minHeight: 46, fontSize: 14, fontFamily: APP_FONTS.arabic.regular, textAlign: 'right', writingDirection: 'rtl' },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterChip: { borderWidth: 1, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 12 },
  filterText: { fontSize: 11, fontWeight: '600', textAlign: 'center', writingDirection: 'rtl' },
  statusPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, borderRadius: 9, paddingVertical: 4, paddingHorizontal: 7, marginTop: 3 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '700', writingDirection: 'rtl' },
  notice: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 11, gap: 9, borderRadius: 13 },
  noticeText: { flex: 1, fontSize: 12, fontWeight: '600', textAlign: 'right', writingDirection: 'rtl' },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 13 },
  productMain: { flex: 1, minWidth: 0, alignItems: 'flex-start', gap: 4 },
  productPrice: { fontSize: 11, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  stockControl: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  stockButton: { width: 27, height: 27, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  stockCount: { minWidth: 20, textAlign: 'center', fontSize: 12, fontWeight: '800' },
  currencyCard: { gap: 12 },
  currencyCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  currencyCardTitle: { fontSize: 14, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  currencyCardHint: { fontSize: 10, textAlign: 'right', writingDirection: 'rtl' },
  chartRow: { height: 180, flexDirection: 'row', gap: 30, paddingHorizontal: 14, paddingTop: 12 },
  chartColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 9 },
  chartAmount: { fontSize: 11, fontWeight: '700', textAlign: 'center', writingDirection: 'rtl' },
  chartTrack: { flex: 1, width: 44, maxHeight: 112, borderRadius: 14, justifyContent: 'flex-end', overflow: 'hidden' },
  chartFill: { width: '100%', borderRadius: 14 },
  chartLabel: { fontSize: 11, textAlign: 'center', writingDirection: 'rtl' },
  financeAction: { flex: 1, minHeight: 45, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  financeActionText: { fontSize: 12, fontWeight: '700', textAlign: 'center', writingDirection: 'rtl' },
  financeViews: { flexDirection: 'row', gap: 6 },
  financeView: { flex: 1, minHeight: 39, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  financeViewText: { fontSize: 10, fontWeight: '700', textAlign: 'center', writingDirection: 'rtl' },
  backButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, minHeight: 38 },
  backButtonText: { fontSize: 12, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  ledgerRow: { paddingVertical: 12, gap: 8 },
  ledgerHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  ledgerAmounts: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6 },
  ledgerAmount: { fontSize: 10, textAlign: 'right', writingDirection: 'rtl' },
  ledgerBalance: { fontSize: 10, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  accountRowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 7 },
  accountToggle: { minWidth: 48, minHeight: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  accountToggleText: { fontSize: 9, fontWeight: '700', textAlign: 'center', writingDirection: 'rtl' },
  journalCardRow: { paddingVertical: 12, gap: 9 },
  journalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 },
  journalCopy: { flex: 1, minWidth: 0, alignItems: 'flex-start', gap: 5 },
  journalLineText: { fontSize: 10, textAlign: 'right', writingDirection: 'rtl' },
  journalAmount: { alignItems: 'flex-start', gap: 5 },
  journalStatus: { fontSize: 10, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  journalActions: { flexDirection: 'row', justifyContent: 'flex-start', gap: 7 },
  journalActionButton: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 10 },
  journalActionText: { fontSize: 10, fontWeight: '700', textAlign: 'center', writingDirection: 'rtl' },
  reportCard: { gap: 12 },
  reportDateRow: { flexDirection: 'row', gap: 10 },
  reportDateField: { flex: 1, gap: 6 },
  reportDateLabel: { fontSize: 11, fontWeight: '600', textAlign: 'right', writingDirection: 'rtl' },
  reportDateInput: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    fontSize: 13,
    fontFamily: APP_FONTS.latin.regular,
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  reportDateError: { fontSize: 11, fontWeight: '600', textAlign: 'right', writingDirection: 'rtl' },
  reportDateWarning: { fontSize: 11, textAlign: 'right', writingDirection: 'rtl' },
  reportPeriodActions: { flexDirection: 'row', gap: 8 },
  reportPeriodButton: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  reportRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  reportLabel: { fontSize: 12, textAlign: 'right', writingDirection: 'rtl' },
  reportAmount: { fontSize: 12, textAlign: 'right', writingDirection: 'rtl' },
  trialBalanceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5 },
  trialHeader: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 9 },
  trialAccountName: { flex: 1, fontSize: 10, textAlign: 'right', writingDirection: 'rtl' },
  trialAmounts: { width: 168, flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  trialAmount: { flex: 1, fontSize: 9, textAlign: 'center', writingDirection: 'rtl' },
  trialTotals: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 5, paddingTop: 10 },
  companyCard: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  companyMark: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  companyCopy: { flex: 1, alignItems: 'flex-start', gap: 5 },
  companyName: { fontSize: 15, fontWeight: '800', textAlign: 'right', writingDirection: 'rtl' },
  companyCaption: { fontSize: 11, textAlign: 'right', writingDirection: 'rtl' },
  companyNameInput: { minHeight: 46, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, fontSize: 14, fontFamily: APP_FONTS.arabic.regular, textAlign: 'right', writingDirection: 'rtl' },
  directoryCard: { flex: 1, borderWidth: 1, borderRadius: 18, padding: 14, gap: 8 },
  directoryTitle: { fontSize: 13, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  directoryCount: { fontSize: 11, textAlign: 'right', writingDirection: 'rtl' },
  avatar: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '800' },
  addRowButton: { borderTopWidth: StyleSheet.hairlineWidth, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  addRowText: { fontSize: 12, fontWeight: '700', writingDirection: 'rtl' },
  settingsCard: { gap: 14 },
  settingDivider: { height: StyleSheet.hairlineWidth },
  taxHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  taxInputWrap: { minWidth: 74, height: 39, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7 },
  taxInput: { width: 40, fontSize: 14, fontFamily: APP_FONTS.latin.bold, fontWeight: '700', paddingVertical: 5, textAlign: 'center', writingDirection: 'ltr' },
  taxSign: { fontSize: 12, fontWeight: '600' },
  saveSetting: { minHeight: 40, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  saveSettingText: { fontSize: 12, fontWeight: '700', writingDirection: 'rtl' },
  localNote: { flexDirection: 'row', alignItems: 'center', padding: 13, gap: 9, borderRadius: 13 },
  localNoteText: { flex: 1, fontSize: 11, textAlign: 'right', writingDirection: 'rtl' },
});
