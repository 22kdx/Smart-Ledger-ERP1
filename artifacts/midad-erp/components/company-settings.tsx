import { Feather } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import {
  APP_FONTS,
  AppText,
  Card,
  CurrencyPicker,
  SectionHeading,
  toEnglishDigits,
} from './erp-ui';
import {
  Currency,
  CurrencyOption,
  ExchangeRate,
  TaxRule,
  useERP,
} from './erp-store';

const Text = AppText;

function parseDecimal(value: string) {
  const normalized = value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٫,]/g, '.')
    .trim();
  return Number(normalized);
}

function localToday() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  maxLength?: number;
}) {
  const colors = useColors();
  const leftAligned =
    keyboardType === 'number-pad' ||
    keyboardType === 'decimal-pad' ||
    autoCapitalize === 'characters' ||
    autoCapitalize === 'none';
  return (
    <View style={settingsStyles.field}>
      <Text style={[settingsStyles.fieldLabel, { color: colors.foreground }]}>{label}</Text>
      <TextInput
        value={toEnglishDigits(value)}
        onChangeText={(text) => onChangeText(toEnglishDigits(text))}
        accessibilityLabel={label}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        maxLength={maxLength}
        style={[
          settingsStyles.input,
          {
            backgroundColor: colors.muted,
            borderColor: colors.border,
            color: colors.foreground,
            textAlign: leftAligned ? 'left' : 'right',
            writingDirection: leftAligned ? 'ltr' : 'rtl',
            fontFamily: leftAligned ? APP_FONTS.latin.regular : APP_FONTS.arabic.regular,
          },
        ]}
      />
    </View>
  );
}

function SaveButton({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        settingsStyles.actionButton,
        { backgroundColor: colors.secondary, opacity: pressed ? 0.68 : 1 },
      ]}
    >
      <Feather name="check" size={15} color={colors.primary} />
      <Text style={[settingsStyles.actionButtonText, { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

function SettingsGroup({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={settingsStyles.group}>
      <View style={settingsStyles.groupHeading}>
        <Text style={[settingsStyles.groupTitle, { color: colors.foreground }]}>{title}</Text>
        {detail ? (
          <Text style={[settingsStyles.helper, { color: colors.mutedForeground }]}>{detail}</Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function CurrencyRow({
  currency,
  isBase,
  onChange,
}: {
  currency: CurrencyOption;
  isBase: boolean;
  onChange: (enabled: boolean) => void;
}) {
  const colors = useColors();
  return (
    <View style={[settingsStyles.listRow, { borderTopColor: colors.border }]}>
      <View style={settingsStyles.listCopy}>
        <Text style={[settingsStyles.listTitle, { color: colors.foreground }]}>
          {currency.name} · {currency.code}
        </Text>
        <Text style={[settingsStyles.helper, { color: colors.mutedForeground }]}>
          {isBase ? 'العملة الأساسية' : currency.isActive ? 'متاحة للسجلات الجديدة' : 'موقوفة للسجلات الجديدة'}
        </Text>
      </View>
      <Switch
        accessibilityLabel={`تفعيل عملة ${currency.code}`}
        accessibilityState={{ checked: currency.isActive, disabled: isBase }}
        value={currency.isActive}
        disabled={isBase}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.secondary }}
        thumbColor={currency.isActive ? colors.primary : colors.mutedForeground}
      />
    </View>
  );
}

function TaxRuleRow({
  rule,
  onToggle,
  onSaveRate,
}: {
  rule: TaxRule;
  onToggle: (enabled: boolean) => void;
  onSaveRate: (rate: number) => boolean;
}) {
  const colors = useColors();
  const [rateInput, setRateInput] = useState(String(rule.rate));
  const [error, setError] = useState('');

  const saveRate = () => {
    const rate = parseDecimal(rateInput);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setError('أدخل نسبة بين 0 و100.');
      return;
    }
    if (onSaveRate(rate)) setError('');
  };

  return (
    <View style={[settingsStyles.ruleRow, { borderTopColor: colors.border }]}>
      <View style={settingsStyles.ruleHeader}>
        <View style={settingsStyles.listCopy}>
          <Text style={[settingsStyles.listTitle, { color: colors.foreground }]}>{rule.name}</Text>
          <Text style={[settingsStyles.helper, { color: colors.mutedForeground }]}>
            {rule.countryCode ? `بلد المنشأة: ${rule.countryCode}` : 'قاعدة عامة'}
          </Text>
        </View>
        <Switch
          accessibilityLabel={`تفعيل قاعدة ${rule.name}`}
          accessibilityState={{ checked: rule.isActive }}
          value={rule.isActive}
          onValueChange={onToggle}
          trackColor={{ false: colors.border, true: colors.secondary }}
          thumbColor={rule.isActive ? colors.primary : colors.mutedForeground}
        />
      </View>
      <View style={settingsStyles.rateEditRow}>
        <View style={settingsStyles.rateInputWrap}>
          <TextInput
            value={toEnglishDigits(rateInput)}
            onChangeText={(text) => setRateInput(toEnglishDigits(text))}
            accessibilityLabel={`نسبة ${rule.name}`}
            keyboardType="decimal-pad"
            style={[
              settingsStyles.rateInput,
              {
                color: colors.foreground,
                backgroundColor: colors.muted,
                borderColor: colors.border,
              },
            ]}
          />
          <Text style={[settingsStyles.percentSign, { color: colors.mutedForeground }]}>%</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`حفظ نسبة ${rule.name}`}
          onPress={saveRate}
          style={({ pressed }) => [
            settingsStyles.smallAction,
            { backgroundColor: colors.secondary, opacity: pressed ? 0.68 : 1 },
          ]}
        >
          <Text style={[settingsStyles.smallActionText, { color: colors.primary }]}>حفظ النسبة</Text>
        </Pressable>
      </View>
      {error ? <Text style={[settingsStyles.error, { color: colors.warning }]}>{error}</Text> : null}
    </View>
  );
}

function ExchangeRateRow({
  rate,
  currencyName,
  onRemove,
}: {
  rate: ExchangeRate;
  currencyName: (code: Currency) => string;
  onRemove: () => void;
}) {
  const colors = useColors();
  return (
    <View style={[settingsStyles.listRow, { borderTopColor: colors.border }]}>
      <View style={settingsStyles.listCopy}>
        <Text style={[settingsStyles.listTitle, { color: colors.foreground }]}>
          1 {rate.fromCurrency} = {rate.rate} {rate.toCurrency}
        </Text>
        <Text style={[settingsStyles.helper, { color: colors.mutedForeground }]}>
          {rate.effectiveDate} · {rate.source || 'إدخال يدوي'}
        </Text>
        <Text style={[settingsStyles.helper, { color: colors.mutedForeground }]}>
          {currencyName(rate.fromCurrency)} إلى {currencyName(rate.toCurrency)}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`حذف سعر ${rate.fromCurrency} إلى ${rate.toCurrency} بتاريخ ${rate.effectiveDate}`}
        onPress={onRemove}
        hitSlop={6}
        style={({ pressed }) => [
          settingsStyles.removeButton,
          { backgroundColor: colors.warningSoft, opacity: pressed ? 0.65 : 1 },
        ]}
      >
        <Feather name="trash-2" size={15} color={colors.warning} />
      </Pressable>
    </View>
  );
}

export function CompanySettings() {
  const colors = useColors();
  const {
    data,
    updateBaseCurrency,
    updateCompanyProfile,
    addCurrency,
    setCurrencyActive,
    addTaxRule,
    setTaxRuleActive,
    updateTaxRuleRate,
    addExchangeRate,
    removeExchangeRate,
  } = useERP();
  const activeCurrencies = useMemo(
    () => data.currencies.filter((currency) => currency.isActive),
    [data.currencies],
  );
  const [companyName, setCompanyName] = useState(data.companyName);
  const [countryInput, setCountryInput] = useState(data.countryCode ?? '');
  const [fiscalMonth, setFiscalMonth] = useState(
    data.fiscalYearStartMonth ? String(data.fiscalYearStartMonth) : '',
  );
  const [fiscalDay, setFiscalDay] = useState(
    data.fiscalYearStartDay ? String(data.fiscalYearStartDay) : '',
  );
  const [currencyCode, setCurrencyCode] = useState('');
  const [currencyName, setCurrencyName] = useState('');
  const [taxName, setTaxName] = useState('');
  const [taxRateInput, setTaxRateInput] = useState('');
  const [fromCurrency, setFromCurrency] = useState(data.baseCurrency);
  const [toCurrency, setToCurrency] = useState(
    activeCurrencies.find((currency) => currency.code !== data.baseCurrency)?.code ?? '',
  );
  const [exchangeRateInput, setExchangeRateInput] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(localToday());
  const [rateSource, setRateSource] = useState('');
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);
  const selectedFromCurrency = activeCurrencies.some((currency) => currency.code === fromCurrency)
    ? fromCurrency
    : activeCurrencies[0]?.code ?? '';
  const selectedToCurrency = activeCurrencies.some(
    (currency) => currency.code === toCurrency && currency.code !== selectedFromCurrency,
  )
    ? toCurrency
    : activeCurrencies.find((currency) => currency.code !== selectedFromCurrency)?.code ?? '';

  const reportMessage = (text: string, isError = false) => {
    setMessage(text);
    setMessageIsError(isError);
  };

  const saveProfile = () => {
    const normalizedCountry = countryInput.trim().toUpperCase();
    const month = fiscalMonth.trim() ? parseDecimal(fiscalMonth) : null;
    const day = fiscalDay.trim() ? parseDecimal(fiscalDay) : null;
    if (!companyName.trim()) {
      reportMessage('أدخل اسم المنشأة.', true);
      return;
    }
    if (normalizedCountry && !/^[A-Z]{2}$/.test(normalizedCountry)) {
      reportMessage('استخدم رمز بلد من حرفين، مثل SA أو YE.', true);
      return;
    }
    if ((month === null) !== (day === null)) {
      reportMessage('أدخل شهر ويوم البداية معًا، أو اتركهما دون تحديد.', true);
      return;
    }
    if (month !== null && (!Number.isInteger(month) || month < 1 || month > 12)) {
      reportMessage('اختر شهرًا من 1 إلى 12 لبداية السنة المالية.', true);
      return;
    }
    if (
      month !== null &&
      day !== null &&
      (!Number.isInteger(day) || day < 1 || day > new Date(2020, month, 0).getDate())
    ) {
      reportMessage('اليوم غير صالح لهذا الشهر.', true);
      return;
    }
    updateCompanyProfile(companyName.trim(), normalizedCountry || null, month, day);
    setCountryInput(normalizedCountry);
    reportMessage('تم حفظ إعدادات المنشأة.');
  };

  const addCurrencyOption = () => {
    const code = currencyCode.trim().toUpperCase();
    const name = currencyName.trim();
    if (!/^[A-Z]{3}$/.test(code)) {
      reportMessage('أدخل رمز عملة من ثلاثة أحرف، مثل YER.', true);
      return;
    }
    if (!name) {
      reportMessage('أدخل اسم العملة.', true);
      return;
    }
    if (data.currencies.some((currency) => currency.code === code)) {
      reportMessage('هذا الرمز موجود بالفعل.', true);
      return;
    }
    addCurrency({ code, name });
    setCurrencyCode('');
    setCurrencyName('');
    reportMessage(`أُضيفت العملة ${code}.`);
  };

  const addTax = () => {
    const name = taxName.trim();
    const rate = parseDecimal(taxRateInput);
    if (!name) {
      reportMessage('أدخل اسم قاعدة الضريبة.', true);
      return;
    }
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      reportMessage('أدخل نسبة بين 0 و100.', true);
      return;
    }
    addTaxRule({
      name,
      rate,
      countryCode: countryInput.trim().toUpperCase() || null,
      isActive: true,
    });
    setTaxName('');
    setTaxRateInput('');
    reportMessage('أُضيفت قاعدة الضريبة. لا تُطبق تلقائيًا على الفواتير الحالية.');
  };

  const addRate = () => {
    const rate = parseDecimal(exchangeRateInput);
    if (
      !selectedFromCurrency ||
      !selectedToCurrency ||
      selectedFromCurrency === selectedToCurrency
    ) {
      reportMessage('اختر عملتين مختلفتين.', true);
      return;
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      reportMessage('أدخل سعر صرف أكبر من صفر.', true);
      return;
    }
    if (!isCalendarDate(effectiveDate)) {
      reportMessage('أدخل تاريخًا صحيحًا بصيغة YYYY-MM-DD.', true);
      return;
    }
    if (
      data.exchangeRates.some(
        (item) =>
          item.fromCurrency === selectedFromCurrency &&
          item.toCurrency === selectedToCurrency &&
          item.effectiveDate === effectiveDate,
      )
    ) {
      reportMessage('يوجد سعر لهذا الزوج في التاريخ نفسه.', true);
      return;
    }
    addExchangeRate({
      fromCurrency: selectedFromCurrency,
      toCurrency: selectedToCurrency,
      rate,
      effectiveDate,
      source: rateSource.trim(),
    });
    setExchangeRateInput('');
    setRateSource('');
    reportMessage('تم حفظ سعر الصرف؛ لن يغيّر سجلات سابقة.');
  };

  const activeRates = useMemo(
    () => [...data.exchangeRates].sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate)),
    [data.exchangeRates],
  );
  const getCurrencyName = (code: Currency) =>
    data.currencies.find((currency) => currency.code === code)?.name ?? code;

  return (
    <View style={settingsStyles.section}>
      <SectionHeading title="إعدادات المنشأة" />
      <Card style={settingsStyles.card}>
        <SettingsGroup
          title="بيانات المنشأة"
          detail="تُحفظ القيم لهذه المنشأة ولا تُستنتج من البلد أو العملة."
        >
          <Field
            label="اسم المنشأة"
            value={companyName}
            onChangeText={setCompanyName}
            placeholder="أدخل اسم المنشأة"
          />
          <Field
            label="رمز البلد"
            value={countryInput}
            onChangeText={setCountryInput}
            placeholder="رمز ISO مثل SA أو YE"
            autoCapitalize="characters"
            maxLength={2}
          />
          <Text style={[settingsStyles.fieldLabel, { color: colors.foreground }]}>
            بداية السنة المالية
          </Text>
          <View style={settingsStyles.monthGrid}>
            {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => {
              const selected = Number(fiscalMonth) === month;
              const label = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { month: 'short' }).format(
                new Date(2020, month - 1, 1),
              );
              return (
                <Pressable
                  key={month}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`شهر ${label}`}
                  onPress={() => setFiscalMonth(String(month))}
                  style={({ pressed }) => [
                    settingsStyles.monthOption,
                    {
                      backgroundColor: selected ? colors.primary : colors.muted,
                      borderColor: selected ? colors.primary : colors.border,
                      opacity: pressed ? 0.72 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      settingsStyles.monthText,
                      { color: selected ? colors.primaryForeground : colors.foreground },
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[settingsStyles.helper, { color: colors.mutedForeground }]}>
            اختر اليوم والشهر، أو اتركهما دون تحديد حتى اعتماد بداية السنة.
          </Text>
          <Field
            label="يوم بداية السنة المالية"
            value={fiscalDay}
            onChangeText={setFiscalDay}
            placeholder="1–31"
            keyboardType="number-pad"
            maxLength={2}
          />
          {(fiscalMonth || fiscalDay) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="مسح تاريخ بداية السنة المالية"
              onPress={() => {
                setFiscalMonth('');
                setFiscalDay('');
              }}
              style={({ pressed }) => [
                settingsStyles.clearButton,
                { borderColor: colors.border, opacity: pressed ? 0.65 : 1 },
              ]}
            >
              <Text style={[settingsStyles.smallActionText, { color: colors.mutedForeground }]}>
                مسح تاريخ البداية
              </Text>
            </Pressable>
          ) : null}
          <SaveButton label="حفظ بيانات المنشأة" testID="save-company-profile" onPress={saveProfile} />
        </SettingsGroup>

        <View style={[settingsStyles.divider, { backgroundColor: colors.border }]} />

        <SettingsGroup
          title="العملة الوظيفية"
          detail="يمكن اختيارها بشكل مستقل عن البلد. تغييرها لا يحوّل الأرصدة السابقة."
        >
          <CurrencyPicker
            value={data.baseCurrency}
            onChange={updateBaseCurrency}
            currencies={activeCurrencies}
          />
        </SettingsGroup>

        <View style={[settingsStyles.divider, { backgroundColor: colors.border }]} />

        <SettingsGroup
          title="العملات المتاحة"
          detail="أضف رموز العملات أو أوقف استخدامها في السجلات الجديدة. لا تُحذف السجلات السابقة."
        >
          <View style={settingsStyles.twoFields}>
            <View style={settingsStyles.codeField}>
              <Field
                label="الرمز"
                value={currencyCode}
                onChangeText={setCurrencyCode}
                placeholder="AED"
                autoCapitalize="characters"
                maxLength={3}
              />
            </View>
            <View style={settingsStyles.nameField}>
              <Field
                label="اسم العملة"
                value={currencyName}
                onChangeText={setCurrencyName}
                placeholder="درهم إماراتي"
              />
            </View>
          </View>
          <SaveButton label="إضافة عملة" onPress={addCurrencyOption} />
          {data.currencies.map((currency) => (
            <CurrencyRow
              key={currency.code}
              currency={currency}
              isBase={currency.code === data.baseCurrency}
              onChange={(enabled) => setCurrencyActive(currency.code, enabled)}
            />
          ))}
        </SettingsGroup>

        <View style={[settingsStyles.divider, { backgroundColor: colors.border }]} />

        <SettingsGroup
          title="قواعد الضرائب"
          detail="أدخل النسب المعتمدة لمنشأتك. هذه الإعدادات لا تُطبّق تلقائيًا على الفواتير."
        >
          <Field
            label="اسم القاعدة"
            value={taxName}
            onChangeText={setTaxName}
            placeholder="مثال: ضريبة قيمة مضافة"
          />
          <Field
            label="النسبة المئوية"
            value={taxRateInput}
            onChangeText={setTaxRateInput}
            placeholder="0"
            keyboardType="decimal-pad"
          />
          <SaveButton label="إضافة قاعدة ضريبية" onPress={addTax} />
          {data.taxRules.length === 0 ? (
            <Text style={[settingsStyles.emptyText, { color: colors.mutedForeground }]}>
              لم تُضف قواعد ضريبية بعد.
            </Text>
          ) : (
            data.taxRules.map((rule) => (
              <TaxRuleRow
                key={rule.id}
                rule={rule}
                onToggle={(enabled) => setTaxRuleActive(rule.id, enabled)}
                onSaveRate={(rate) => {
                  updateTaxRuleRate(rule.id, rate);
                  reportMessage(`تم تحديث نسبة ${rule.name}.`);
                  return true;
                }}
              />
            ))
          )}
        </SettingsGroup>

        <View style={[settingsStyles.divider, { backgroundColor: colors.border }]} />

        <SettingsGroup
          title="أسعار الصرف"
          detail="أدخل السعر وتاريخ سريانه ومصدره. لا يوجد سعر افتراضي ولا تحويل تلقائي."
        >
          <Text style={[settingsStyles.fieldLabel, { color: colors.foreground }]}>من العملة</Text>
          <CurrencyPicker
            value={selectedFromCurrency}
            onChange={setFromCurrency}
            currencies={activeCurrencies}
          />
          <Text style={[settingsStyles.fieldLabel, { color: colors.foreground }]}>إلى العملة</Text>
          <CurrencyPicker
            value={selectedToCurrency}
            onChange={setToCurrency}
            currencies={activeCurrencies}
          />
          <Field
            label="قيمة 1 من العملة الأولى"
            value={exchangeRateInput}
            onChangeText={setExchangeRateInput}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />
          <Field
            label="تاريخ السريان"
            value={effectiveDate}
            onChangeText={setEffectiveDate}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            maxLength={10}
          />
          <Field
            label="مصدر السعر"
            value={rateSource}
            onChangeText={setRateSource}
            placeholder="اختياري"
          />
          <SaveButton
            label={activeCurrencies.length < 2 ? 'أضف عملة ثانية أولًا' : 'حفظ سعر الصرف'}
            onPress={addRate}
          />
          {activeRates.length === 0 ? (
            <Text style={[settingsStyles.emptyText, { color: colors.mutedForeground }]}>
              لا توجد أسعار صرف مسجلة.
            </Text>
          ) : (
            activeRates.map((rate) => (
              <ExchangeRateRow
                key={rate.id}
                rate={rate}
                currencyName={getCurrencyName}
                onRemove={() => {
                  Alert.alert(
                    'حذف سعر الصرف',
                    toEnglishDigits(`هل تريد حذف سعر ${rate.fromCurrency} إلى ${rate.toCurrency} بتاريخ ${rate.effectiveDate}؟`),
                    [
                      { text: 'إلغاء', style: 'cancel' },
                      {
                        text: 'حذف السعر',
                        style: 'destructive',
                        onPress: () => {
                          removeExchangeRate(rate.id);
                          reportMessage('تم حذف سجل سعر الصرف.');
                        },
                      },
                    ],
                  );
                }}
              />
            ))
          )}
        </SettingsGroup>

        {message ? (
          <View
            accessibilityRole={messageIsError ? 'alert' : 'text'}
            style={[
              settingsStyles.feedback,
              { backgroundColor: messageIsError ? colors.warningSoft : colors.infoSoft },
            ]}
          >
            <Text style={[settingsStyles.feedbackText, { color: messageIsError ? colors.warning : colors.info }]}>
              {message}
            </Text>
          </View>
        ) : null}
      </Card>
      <View style={[settingsStyles.localNote, { backgroundColor: colors.infoSoft }]}>
        <Feather name="smartphone" size={16} color={colors.info} />
        <Text style={[settingsStyles.helper, { color: colors.info }]}>
          الإعدادات تُحفظ على هذا الجهاز فقط في النسخة الحالية.
        </Text>
      </View>
    </View>
  );
}

const settingsStyles = StyleSheet.create({
  section: { gap: 12 },
  card: { gap: 18, padding: 16 },
  group: { gap: 11 },
  groupHeading: { gap: 4 },
  groupTitle: { fontSize: 14, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  helper: { fontSize: 11, lineHeight: 17, textAlign: 'right', writingDirection: 'rtl' },
  field: { flex: 1, minWidth: 0, gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '600', textAlign: 'right', writingDirection: 'rtl' },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 12,
    fontSize: 13,
    fontFamily: APP_FONTS.arabic.regular,
  },
  twoFields: { flexDirection: 'row', gap: 9 },
  codeField: { width: 88 },
  nameField: { flex: 1, minWidth: 0 },
  actionButton: {
    minHeight: 46,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 12,
  },
  actionButtonText: { fontSize: 12, fontWeight: '700', textAlign: 'center', writingDirection: 'rtl' },
  clearButton: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: { height: StyleSheet.hairlineWidth },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  monthOption: {
    width: '23%',
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthText: { fontSize: 11, fontWeight: '700', textAlign: 'center', writingDirection: 'rtl' },
  listRow: {
    minHeight: 58,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  listCopy: { flex: 1, minWidth: 0, gap: 3, alignItems: 'flex-start' },
  listTitle: { fontSize: 12, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  ruleRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 8 },
  ruleHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rateEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rateInputWrap: {
    minHeight: 42,
    minWidth: 105,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  rateInput: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 8,
    textAlign: 'center',
    writingDirection: 'ltr',
    fontFamily: APP_FONTS.latin.regular,
  },
  percentSign: { paddingHorizontal: 5, fontSize: 12, fontWeight: '600' },
  smallAction: {
    minHeight: 44,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  smallActionText: { fontSize: 11, fontWeight: '700', textAlign: 'center', writingDirection: 'rtl' },
  removeButton: { minWidth: 44, minHeight: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  emptyText: { paddingVertical: 6, fontSize: 11, textAlign: 'right', writingDirection: 'rtl' },
  error: { fontSize: 11, textAlign: 'right', writingDirection: 'rtl' },
  feedback: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  feedbackText: { fontSize: 12, fontWeight: '600', textAlign: 'right', writingDirection: 'rtl' },
  localNote: { flexDirection: 'row', alignItems: 'center', padding: 13, gap: 9, borderRadius: 13 },
});
