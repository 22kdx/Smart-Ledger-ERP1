import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import {
  BodyText,
  Card,
  CurrencyPicker,
  EmptyState,
  formatMoney,
  IconButton,
  Page,
  SectionHeading,
  Title,
} from './erp-ui';
import {
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

export type FormType = 'invoice' | 'product' | 'income' | 'expense' | 'employee' | 'customer' | 'supplier' | 'journal';

const typeLabels: Record<FormType, string> = {
  invoice: 'فاتورة مبيعات',
  product: 'منتج جديد',
  income: 'إيراد جديد',
  expense: 'مصروف جديد',
  employee: 'موظف جديد',
  customer: 'عميل جديد',
  supplier: 'مورد جديد',
  journal: 'قيد يومية جديد',
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
  return (
    <View style={screenStyles.header}>
      <View style={screenStyles.headerCopy}>
        <Text style={[screenStyles.eyebrow, { color: colors.primary }]}>{eyebrow}</Text>
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
  const balances = getAccountBalances(data.journalEntries, currency);
  const totals = useMemo(() => {
    const income = DEFAULT_ACCOUNTS
      .filter((account) => account.type === 'revenue')
      .reduce((sum, account) => sum + balances[account.id].balance, 0);
    const expense = DEFAULT_ACCOUNTS
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
        title="مرحباً بك في مدار"
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
          <CurrencyPicker value={currency} onChange={updateBaseCurrency} compact />
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
  const { data, updateBaseCurrency } = useERP();
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [view, setView] = useState<'overview' | 'accounts' | 'journal' | 'reports'>('overview');
  const balances = getAccountBalances(data.journalEntries, data.baseCurrency);
  const income = DEFAULT_ACCOUNTS
    .filter((account) => account.type === 'revenue')
    .reduce((sum, account) => sum + balances[account.id].balance, 0);
  const expense = DEFAULT_ACCOUNTS
    .filter((account) => account.type === 'expense')
    .reduce((sum, account) => sum + balances[account.id].balance, 0);
  const assets = DEFAULT_ACCOUNTS
    .filter((account) => account.type === 'asset')
    .reduce((sum, account) => sum + balances[account.id].balance, 0);
  const liabilities = DEFAULT_ACCOUNTS
    .filter((account) => account.type === 'liability')
    .reduce((sum, account) => sum + balances[account.id].balance, 0);
  const equity = DEFAULT_ACCOUNTS
    .filter((account) => account.type === 'equity')
    .reduce((sum, account) => sum + balances[account.id].balance, 0);
  const currentProfit = income - expense;
  const totalDebit = DEFAULT_ACCOUNTS.reduce((sum, account) => sum + balances[account.id].debit, 0);
  const totalCredit = DEFAULT_ACCOUNTS.reduce((sum, account) => sum + balances[account.id].credit, 0);
  const max = Math.max(income, expense, 1);
  const visibleEntries = data.entries.filter(
    (entry) =>
      entry.currency === data.baseCurrency && (filter === 'all' || entry.type === filter),
  );

  return (
    <Page>
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
        <CurrencyPicker value={data.baseCurrency} onChange={updateBaseCurrency} />
      </Card>
      <View style={screenStyles.metricsGrid}>
        <Metric label="الإيرادات" amount={income} currency={data.baseCurrency} icon="trending-up" positive />
        <Metric label="المصروفات" amount={expense} currency={data.baseCurrency} icon="trending-down" />
      </View>
      <Card>
        <SectionHeading title="مقارنة الحركة المالية" />
        <View style={screenStyles.chartRow}>
          <ChartColumn label="إيرادات" amount={income} max={max} currency={data.baseCurrency} positive />
          <ChartColumn label="مصروفات" amount={expense} max={max} currency={data.baseCurrency} />
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
          <SectionHeading title="دليل الحسابات" action={`${DEFAULT_ACCOUNTS.length} حسابات`} />
          <Card style={screenStyles.listCard}>
            {DEFAULT_ACCOUNTS.map((account, index) => (
              <AccountBalanceRow
                key={account.id}
                account={account}
                balance={balances[account.id].balance}
                currency={data.baseCurrency}
                last={index === DEFAULT_ACCOUNTS.length - 1}
              />
            ))}
          </Card>
          <Text style={[screenStyles.currencyCardHint, { color: colors.mutedForeground }]}>
            الأرصدة معروضة بعملة القيد، ولا يتم تحويل العملات تلقائياً.
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
                  currency={data.baseCurrency}
                  last={index === data.journalEntries.length - 1}
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
              <Text style={[screenStyles.currencyCardHint, { color: colors.mutedForeground }]}>من بداية السجلات</Text>
            </View>
            <CurrencyPicker value={data.baseCurrency} onChange={updateBaseCurrency} />
          </Card>
          <Card style={screenStyles.reportCard}>
            <SectionHeading title="قائمة الدخل" />
            <ReportRow label="الإيرادات" amount={income} currency={data.baseCurrency} />
            <ReportRow label="المصروفات" amount={expense} currency={data.baseCurrency} />
            <ReportRow label="صافي الربح" amount={currentProfit} currency={data.baseCurrency} strong />
          </Card>
          <Card style={screenStyles.reportCard}>
            <SectionHeading title="الميزانية" />
            <ReportRow label="الأصول" amount={assets} currency={data.baseCurrency} />
            <ReportRow label="الالتزامات" amount={liabilities} currency={data.baseCurrency} />
            <ReportRow label="حقوق الملكية" amount={equity + currentProfit} currency={data.baseCurrency} strong />
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
            {DEFAULT_ACCOUNTS.map((account) => (
              <View key={account.id} style={screenStyles.trialBalanceRow}>
                <Text style={[screenStyles.trialAccountName, { color: colors.foreground }]}>
                  {account.code} · {account.name}
                </Text>
                <View style={screenStyles.trialAmounts}>
                  <Text style={[screenStyles.trialAmount, { color: colors.mutedForeground }]}>
                    {formatMoney(balances[account.id].debit, data.baseCurrency)}
                  </Text>
                  <Text style={[screenStyles.trialAmount, { color: colors.mutedForeground }]}>
                    {formatMoney(balances[account.id].credit, data.baseCurrency)}
                  </Text>
                </View>
              </View>
            ))}
            <View style={[screenStyles.trialBalanceRow, screenStyles.trialTotals, { borderTopColor: colors.border }]}>
              <Text style={[screenStyles.trialAccountName, { color: colors.foreground }]}>الإجمالي</Text>
              <View style={screenStyles.trialAmounts}>
                <Text style={[screenStyles.trialAmount, { color: colors.foreground, fontWeight: '800' }]}>{formatMoney(totalDebit, data.baseCurrency)}</Text>
                <Text style={[screenStyles.trialAmount, { color: colors.foreground, fontWeight: '800' }]}>{formatMoney(totalCredit, data.baseCurrency)}</Text>
              </View>
            </View>
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
}: {
  account: (typeof DEFAULT_ACCOUNTS)[number];
  balance: number;
  currency: Currency;
  last: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[screenStyles.listRow, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={[screenStyles.rowIcon, { backgroundColor: colors.secondary }]}>
        <Feather name="book" size={16} color={colors.primary} />
      </View>
      <View style={screenStyles.rowMain}>
        <Text style={[screenStyles.rowTitle, { color: colors.foreground }]}>{account.name}</Text>
        <Text style={[screenStyles.rowSub, { color: colors.mutedForeground }]}>{account.code} · {accountTypeLabel(account.type)}</Text>
      </View>
      <Text style={[screenStyles.rowAmount, { color: colors.foreground }]}>{formatMoney(balance, currency)}</Text>
    </View>
  );
}

function JournalEntryRow({
  journal,
  currency,
  last,
}: {
  journal: JournalEntry;
  currency: Currency;
  last: boolean;
}) {
  const colors = useColors();
  const debit = journal.lines.find((line) => line.debit > 0);
  const credit = journal.lines.find((line) => line.credit > 0);
  const amount = debit?.debit ?? credit?.credit ?? 0;
  const journalCurrency = debit?.currency ?? credit?.currency ?? currency;
  const debitAccount = DEFAULT_ACCOUNTS.find((account) => account.id === debit?.accountId);
  const creditAccount = DEFAULT_ACCOUNTS.find((account) => account.id === credit?.accountId);
  return (
    <View style={[screenStyles.journalRow, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={screenStyles.journalCopy}>
        <Text style={[screenStyles.rowTitle, { color: colors.foreground }]}>{journal.description}</Text>
        <Text style={[screenStyles.rowSub, { color: colors.mutedForeground }]}>مدين: {debitAccount?.name ?? '—'}</Text>
        <Text style={[screenStyles.rowSub, { color: colors.mutedForeground }]}>دائن: {creditAccount?.name ?? '—'}</Text>
      </View>
      <View style={screenStyles.journalAmount}>
        <Text style={[screenStyles.rowAmount, { color: colors.primary }]}>{formatMoney(amount, journalCurrency)}</Text>
        <Text style={[screenStyles.rowSub, { color: colors.mutedForeground }]}>{journal.date}</Text>
      </View>
    </View>
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
  const { data, updateBaseCurrency, updateTaxRate, updateCompanyName } = useERP();
  const customers = data.contacts.filter((contact) => contact.kind === 'customer');
  const suppliers = data.contacts.filter((contact) => contact.kind === 'supplier');
  const [companyNameInput, setCompanyNameInput] = useState(data.companyName);
  const [taxInput, setTaxInput] = useState(String(data.taxRate));

  return (
    <Page>
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
      <View style={screenStyles.sectionBlock}>
        <SectionHeading title="إعدادات المنشأة" />
        <Card style={screenStyles.settingsCard}>
          <Text style={[screenStyles.currencyCardTitle, { color: colors.foreground }]}>اسم المنشأة</Text>
          <TextInput
            value={companyNameInput}
            onChangeText={setCompanyNameInput}
            accessibilityLabel="اسم المنشأة"
            placeholder="أدخل اسم المنشأة"
            placeholderTextColor={colors.mutedForeground}
            style={[
              screenStyles.companyNameInput,
              { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground },
            ]}
            textAlign="right"
          />
          <Pressable
            accessibilityRole="button"
            testID="save-company-name"
            onPress={() => {
              const name = companyNameInput.trim();
              if (name) updateCompanyName(name);
              else setCompanyNameInput(data.companyName);
            }}
            style={({ pressed }) => [
              screenStyles.saveSetting,
              { backgroundColor: colors.secondary, opacity: pressed ? 0.65 : 1 },
            ]}
          >
            <Feather name="check" size={15} color={colors.primary} />
            <Text style={[screenStyles.saveSettingText, { color: colors.primary }]}>حفظ الاسم</Text>
          </Pressable>
          <View style={[screenStyles.settingDivider, { backgroundColor: colors.border }]} />
          <Text style={[screenStyles.currencyCardTitle, { color: colors.foreground }]}>العملة الأساسية</Text>
          <CurrencyPicker value={data.baseCurrency} onChange={updateBaseCurrency} />
          <View style={[screenStyles.settingDivider, { backgroundColor: colors.border }]} />
          <View style={screenStyles.taxHeader}>
            <View>
              <Text style={[screenStyles.currencyCardTitle, { color: colors.foreground }]}>ضريبة القيمة المضافة</Text>
              <Text style={[screenStyles.currencyCardHint, { color: colors.mutedForeground }]}>تُخصّص حسب متطلبات نشاطك</Text>
            </View>
            <View style={[screenStyles.taxInputWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <TextInput
                value={taxInput}
                onChangeText={setTaxInput}
                keyboardType="decimal-pad"
                accessibilityLabel="نسبة الضريبة"
                style={[screenStyles.taxInput, { color: colors.foreground }]}
                textAlign="center"
              />
              <Text style={[screenStyles.taxSign, { color: colors.mutedForeground }]}>%</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              const parsed = Number(taxInput);
              if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) updateTaxRate(parsed);
              else setTaxInput(String(data.taxRate));
            }}
            style={({ pressed }) => [
              screenStyles.saveSetting,
              { backgroundColor: colors.secondary, opacity: pressed ? 0.65 : 1 },
            ]}
          >
            <Feather name="check" size={15} color={colors.primary} />
            <Text style={[screenStyles.saveSettingText, { color: colors.primary }]}>حفظ النسبة</Text>
          </Pressable>
        </Card>
      </View>
      <View style={[screenStyles.localNote, { backgroundColor: colors.infoSoft }]}>
        <Feather name="smartphone" size={16} color={colors.info} />
        <Text style={[screenStyles.localNoteText, { color: colors.info }]}>
          تحفظ هذه النسخة البيانات على هذا الجهاز فقط.
        </Text>
      </View>
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
        value={value}
        onChangeText={onChangeText}
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
        <Text style={[screenStyles.rowSub, { color: colors.mutedForeground }]}>{entry.category} · {entry.date}</Text>
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
        <Text style={[screenStyles.rowSub, { color: colors.mutedForeground }]}>{invoice.number} · {invoice.date}</Text>
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
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    marginBottom: 2,
  },
  headerCopy: { flex: 1, gap: 5, alignItems: 'flex-start' },
  eyebrow: { fontSize: 12, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  brandMark: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  balanceCard: { borderRadius: 24, padding: 21, gap: 24 },
  balanceTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  balanceEyebrow: { color: 'rgba(255,255,255,0.72)', fontSize: 13, textAlign: 'right', writingDirection: 'rtl' },
  balanceAmount: { color: '#ffffff', fontSize: 27, fontWeight: '800', marginTop: 8, textAlign: 'right', writingDirection: 'rtl' },
  balanceFooter: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  balanceTrend: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  balanceTrendText: { color: '#ffffff', fontSize: 11, writingDirection: 'rtl' },
  balanceFootText: { color: 'rgba(255,255,255,0.67)', fontSize: 11, textAlign: 'right', writingDirection: 'rtl' },
  metricsGrid: { flexDirection: 'row-reverse', gap: 11 },
  metricCard: { flex: 1, minWidth: 0, padding: 14, gap: 13 },
  metricTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  metricIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  metricLabel: { flex: 1, fontSize: 12, textAlign: 'right', writingDirection: 'rtl' },
  metricValue: { fontSize: 15, fontWeight: '800', textAlign: 'right', writingDirection: 'rtl' },
  actionCard: { gap: 16 },
  actionsRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', gap: 8 },
  quickAction: { flex: 1, alignItems: 'center', gap: 8, paddingVertical: 2 },
  quickIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center', writingDirection: 'rtl' },
  summaryCard: { gap: 17 },
  summaryHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  summaryTitle: { fontSize: 15, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  summaryDetail: { fontSize: 11, marginTop: 4, textAlign: 'right', writingDirection: 'rtl' },
  summaryBadge: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  summaryNumbers: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  summaryNumber: { flex: 1, alignItems: 'center', gap: 5 },
  summaryValue: { fontSize: 18, fontWeight: '800' },
  summaryLabel: { fontSize: 11, textAlign: 'center', writingDirection: 'rtl' },
  verticalDivider: { width: StyleSheet.hairlineWidth, height: 30 },
  sectionBlock: { gap: 12 },
  listCard: { paddingVertical: 2, gap: 0 },
  listRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 11, paddingVertical: 14 },
  rowIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rowMain: { flex: 1, minWidth: 0, alignItems: 'flex-start', gap: 4 },
  rowTitle: { fontSize: 13, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  rowSub: { fontSize: 10, textAlign: 'right', writingDirection: 'rtl' },
  rowAmount: { fontSize: 12, fontWeight: '700', textAlign: 'left', writingDirection: 'rtl' },
  salesBanner: { borderRadius: 22, padding: 20, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  bannerLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12, textAlign: 'right', writingDirection: 'rtl' },
  bannerValue: { color: '#ffffff', fontSize: 22, fontWeight: '800', marginTop: 8, textAlign: 'right', writingDirection: 'rtl' },
  bannerIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  primaryButton: { borderRadius: 15, minHeight: 51, flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center', gap: 8 },
  primaryButtonText: { fontSize: 14, fontWeight: '700', textAlign: 'center', writingDirection: 'rtl' },
  searchBox: { minHeight: 48, borderRadius: 15, borderWidth: 1, flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 14, gap: 10 },
  searchInput: { flex: 1, minHeight: 46, fontSize: 12, textAlign: 'right', writingDirection: 'rtl' },
  filterRow: { flexDirection: 'row-reverse', gap: 8 },
  filterChip: { borderWidth: 1, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 12 },
  filterText: { fontSize: 11, fontWeight: '600', textAlign: 'center', writingDirection: 'rtl' },
  statusPill: { flexDirection: 'row-reverse', alignItems: 'center', alignSelf: 'flex-start', gap: 5, borderRadius: 9, paddingVertical: 4, paddingHorizontal: 7, marginTop: 3 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 9, fontWeight: '700', writingDirection: 'rtl' },
  notice: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 11, gap: 9, borderRadius: 13 },
  noticeText: { flex: 1, fontSize: 12, fontWeight: '600', textAlign: 'right', writingDirection: 'rtl' },
  productRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 9, paddingVertical: 13 },
  productMain: { flex: 1, minWidth: 0, alignItems: 'flex-start', gap: 4 },
  productPrice: { fontSize: 11, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  stockControl: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7 },
  stockButton: { width: 27, height: 27, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  stockCount: { minWidth: 20, textAlign: 'center', fontSize: 12, fontWeight: '800' },
  currencyCard: { gap: 12 },
  currencyCardHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  currencyCardTitle: { fontSize: 14, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  currencyCardHint: { fontSize: 10, textAlign: 'right', writingDirection: 'rtl' },
  chartRow: { height: 180, flexDirection: 'row-reverse', gap: 30, paddingHorizontal: 14, paddingTop: 12 },
  chartColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 9 },
  chartAmount: { fontSize: 11, fontWeight: '700', textAlign: 'center', writingDirection: 'rtl' },
  chartTrack: { flex: 1, width: 44, maxHeight: 112, borderRadius: 14, justifyContent: 'flex-end', overflow: 'hidden' },
  chartFill: { width: '100%', borderRadius: 14 },
  chartLabel: { fontSize: 11, textAlign: 'center', writingDirection: 'rtl' },
  financeAction: { flex: 1, minHeight: 45, borderRadius: 13, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7 },
  financeActionText: { fontSize: 12, fontWeight: '700', textAlign: 'center', writingDirection: 'rtl' },
  financeViews: { flexDirection: 'row-reverse', gap: 6 },
  financeView: { flex: 1, minHeight: 39, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  financeViewText: { fontSize: 10, fontWeight: '700', textAlign: 'center', writingDirection: 'rtl' },
  journalRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 13 },
  journalCopy: { flex: 1, minWidth: 0, alignItems: 'flex-start', gap: 5 },
  journalAmount: { alignItems: 'flex-start', gap: 5 },
  reportCard: { gap: 12 },
  reportRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  reportLabel: { fontSize: 12, textAlign: 'right', writingDirection: 'rtl' },
  reportAmount: { fontSize: 12, textAlign: 'left', writingDirection: 'rtl' },
  trialBalanceRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingVertical: 5 },
  trialHeader: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 9 },
  trialAccountName: { flex: 1, fontSize: 9, textAlign: 'right', writingDirection: 'rtl' },
  trialAmounts: { width: 168, flexDirection: 'row-reverse', justifyContent: 'space-between', gap: 4 },
  trialAmount: { flex: 1, fontSize: 8, textAlign: 'center', writingDirection: 'rtl' },
  trialTotals: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 5, paddingTop: 10 },
  companyCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: 13 },
  companyMark: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  companyCopy: { flex: 1, alignItems: 'flex-start', gap: 5 },
  companyName: { fontSize: 15, fontWeight: '800', textAlign: 'right', writingDirection: 'rtl' },
  companyCaption: { fontSize: 11, textAlign: 'right', writingDirection: 'rtl' },
  companyNameInput: { minHeight: 46, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, fontSize: 13, writingDirection: 'rtl' },
  directoryCard: { flex: 1, borderWidth: 1, borderRadius: 18, padding: 14, gap: 8 },
  directoryTitle: { fontSize: 13, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  directoryCount: { fontSize: 11, textAlign: 'right', writingDirection: 'rtl' },
  avatar: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '800' },
  addRowButton: { borderTopWidth: StyleSheet.hairlineWidth, minHeight: 48, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8 },
  addRowText: { fontSize: 12, fontWeight: '700', writingDirection: 'rtl' },
  settingsCard: { gap: 14 },
  settingDivider: { height: StyleSheet.hairlineWidth },
  taxHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  taxInputWrap: { minWidth: 74, height: 39, borderWidth: 1, borderRadius: 12, flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 7 },
  taxInput: { width: 40, fontSize: 14, fontWeight: '700', paddingVertical: 5 },
  taxSign: { fontSize: 12, fontWeight: '600' },
  saveSetting: { minHeight: 40, borderRadius: 12, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7 },
  saveSettingText: { fontSize: 12, fontWeight: '700', writingDirection: 'rtl' },
  localNote: { flexDirection: 'row-reverse', alignItems: 'center', padding: 13, gap: 9, borderRadius: 13 },
  localNoteText: { flex: 1, fontSize: 11, textAlign: 'right', writingDirection: 'rtl' },
});
