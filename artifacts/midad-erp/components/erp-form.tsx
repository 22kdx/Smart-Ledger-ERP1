import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import {
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { APP_FONTS, AppText, CurrencyPicker } from './erp-ui';
import {
  ContactKind,
  Currency,
  DEFAULT_ACCOUNTS,
  EntryType,
  useERP,
} from './erp-store';
import { FormType, formTitle } from './erp-screens';

const Text = AppText;

const emptyFields: Record<string, string> = {
  name: '',
  amount: '',
  salary: '',
  quantity: '',
  price: '',
  sku: '',
  category: '',
  role: '',
  phone: '',
  title: '',
};

export function ERPFormSheet({
  type,
  visible,
  onClose,
}: {
  type: FormType | null;
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const {
    addInvoice,
    addProduct,
    addEntry,
    addEmployee,
    addContact,
    addJournalEntry,
    data,
  } = useERP();
  const currencies = data.currencies.filter((option) => option.isActive);
  const [fields, setFields] = useState<Record<string, string>>(emptyFields);
  const [currency, setCurrency] = useState<Currency>(data.baseCurrency);
  const [invoicePaid, setInvoicePaid] = useState(false);
  const [debitAccountId, setDebitAccountId] = useState('1000');
  const [creditAccountId, setCreditAccountId] = useState('4000');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (visible) {
      setFields(emptyFields);
      setCurrency(
        currencies.some((option) => option.code === data.baseCurrency)
          ? data.baseCurrency
          : currencies[0]?.code ?? data.baseCurrency,
      );
      setInvoicePaid(false);
      setDebitAccountId('1000');
      setCreditAccountId('4000');
      setMessage('');
    }
  }, [data.baseCurrency, data.currencies, type, visible]);

  if (!type) return null;

  const setField = (key: string, value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
    setMessage('');
  };

  const handleSubmit = () => {
    const numeric = (value: string) => Number(value.replaceAll(',', '').trim());
    if (type === 'journal') {
      const amount = numeric(fields.amount);
      if (!fields.name.trim() || !Number.isFinite(amount) || amount <= 0) {
        setMessage('أدخل وصف القيد ومبلغاً صحيحاً أكبر من صفر.');
        return;
      }
      if (debitAccountId === creditAccountId) {
        setMessage('اختر حسابين مختلفين للقيد المدين والدائن.');
        return;
      }
      addJournalEntry({
        description: fields.name.trim(),
        debitAccountId,
        creditAccountId,
        amount,
        currency,
      });
    } else if (type === 'invoice') {
      const amount = numeric(fields.amount);
      if (!fields.name.trim() || !Number.isFinite(amount) || amount <= 0) {
        setMessage('أدخل اسم العميل ومبلغاً صحيحاً أكبر من صفر.');
        return;
      }
      addInvoice({
        customer: fields.name.trim(),
        amount,
        currency,
        status: invoicePaid ? 'paid' : 'pending',
      });
    } else if (type === 'product') {
      const price = numeric(fields.price);
      const quantity = numeric(fields.quantity);
      if (!fields.name.trim() || !Number.isFinite(price) || price < 0 || !Number.isFinite(quantity) || quantity < 0) {
        setMessage('أدخل اسم الصنف وسعراً وكمية صحيحة.');
        return;
      }
      addProduct({
        name: fields.name.trim(),
        sku: fields.sku.trim() || `SKU-${String(Date.now()).slice(-4)}`,
        category: fields.category.trim() || 'عام',
        quantity,
        price,
        currency,
      });
    } else if (type === 'income' || type === 'expense') {
      const amount = numeric(fields.amount);
      if (!fields.name.trim() || !Number.isFinite(amount) || amount <= 0) {
        setMessage('أدخل وصف الحركة ومبلغاً صحيحاً أكبر من صفر.');
        return;
      }
      const entryType: EntryType = type === 'income' ? 'income' : 'expense';
      addEntry({
        title: fields.name.trim(),
        category: fields.category.trim() || (entryType === 'income' ? 'إيرادات أخرى' : 'مصروفات أخرى'),
        amount,
        currency,
        type: entryType,
      });
    } else if (type === 'employee') {
      const salary = numeric(fields.salary);
      if (!fields.name.trim() || !fields.role.trim() || !Number.isFinite(salary) || salary < 0) {
        setMessage('أدخل اسم الموظف والمسمى والراتب بشكل صحيح.');
        return;
      }
      addEmployee({ name: fields.name.trim(), role: fields.role.trim(), salary, currency });
    } else {
      if (!fields.name.trim()) {
        setMessage('أدخل اسم جهة الاتصال.');
        return;
      }
      const kind: ContactKind = type === 'customer' ? 'customer' : 'supplier';
      addContact({
        name: fields.name.trim(),
        kind,
        phone: fields.phone.trim(),
        currency,
      });
    }
    Keyboard.dismiss();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    onClose();
  };

  const needsMoney = ['invoice', 'income', 'expense', 'product', 'employee', 'journal'].includes(type);
  const primaryLabel =
    type === 'journal'
      ? 'ترحيل القيد'
      : type === 'invoice'
        ? 'حفظ الفاتورة'
        : type === 'product'
          ? 'إضافة الصنف'
          : type === 'employee'
            ? 'حفظ بيانات الموظف'
            : type === 'customer' || type === 'supplier'
              ? 'حفظ جهة الاتصال'
              : 'حفظ الحركة';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[formStyles.overlay, { backgroundColor: 'rgba(11,14,20,0.56)' }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="إغلاق النافذة" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={[formStyles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={[formStyles.handle, { backgroundColor: colors.border }]} />
          <View style={formStyles.sheetHeader}>
            <View style={formStyles.sheetTitleWrap}>
              <Text style={[formStyles.sheetTitle, { color: colors.foreground }]}>{formTitle(type)}</Text>
              <Text style={[formStyles.sheetSubtitle, { color: colors.mutedForeground }]}>أدخل البيانات لإضافتها إلى سجلك</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="إغلاق"
              onPress={onClose}
              style={[formStyles.closeButton, { backgroundColor: colors.secondary }]}
            >
              <Feather name="x" size={18} color={colors.foreground} />
            </Pressable>
          </View>
          <KeyboardAwareScrollViewCompat
            style={formStyles.scroll}
            contentContainerStyle={formStyles.formContent}
            bottomOffset={80}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {type === 'invoice' ? (
              <>
                <Field label="اسم العميل" value={fields.name} onChangeText={(value) => setField('name', value)} placeholder="مثال: شركة الأفق" colors={colors} />
                <Field label="مبلغ الفاتورة" value={fields.amount} onChangeText={(value) => setField('amount', value)} placeholder="0.00" keyboardType="decimal-pad" colors={colors} />
                <CurrencyPicker value={currency} onChange={setCurrency} currencies={currencies} />
                <ChoiceRow
                  label="حالة الفاتورة"
                  options={[['pending', 'مستحقة'], ['paid', 'مدفوعة']]}
                  value={invoicePaid ? 'paid' : 'pending'}
                  onChange={(value) => setInvoicePaid(value === 'paid')}
                />
              </>
            ) : null}
            {type === 'product' ? (
              <>
                <Field label="اسم الصنف" value={fields.name} onChangeText={(value) => setField('name', value)} placeholder="مثال: ورق طباعة A4" colors={colors} />
                <View style={formStyles.fieldRow}>
                  <View style={formStyles.fieldHalf}>
                    <Field label="رمز الصنف" value={fields.sku} onChangeText={(value) => setField('sku', value)} placeholder="اختياري" colors={colors} />
                  </View>
                  <View style={formStyles.fieldHalf}>
                    <Field label="التصنيف" value={fields.category} onChangeText={(value) => setField('category', value)} placeholder="عام" colors={colors} />
                  </View>
                </View>
                <View style={formStyles.fieldRow}>
                  <View style={formStyles.fieldHalf}>
                    <Field label="الكمية" value={fields.quantity} onChangeText={(value) => setField('quantity', value)} placeholder="0" keyboardType="number-pad" colors={colors} />
                  </View>
                  <View style={formStyles.fieldHalf}>
                    <Field label="سعر الوحدة" value={fields.price} onChangeText={(value) => setField('price', value)} placeholder="0.00" keyboardType="decimal-pad" colors={colors} />
                  </View>
                </View>
                <CurrencyPicker value={currency} onChange={setCurrency} currencies={currencies} />
              </>
            ) : null}
            {type === 'income' || type === 'expense' ? (
              <>
                <Field label="وصف الحركة" value={fields.name} onChangeText={(value) => setField('name', value)} placeholder={type === 'income' ? 'مثال: تحصيل من عميل' : 'مثال: شراء مستلزمات'} colors={colors} />
                <Field label="التصنيف" value={fields.category} onChangeText={(value) => setField('category', value)} placeholder={type === 'income' ? 'إيرادات أخرى' : 'مصروفات تشغيلية'} colors={colors} />
                <Field label="المبلغ" value={fields.amount} onChangeText={(value) => setField('amount', value)} placeholder="0.00" keyboardType="decimal-pad" colors={colors} />
                <CurrencyPicker value={currency} onChange={setCurrency} currencies={currencies} />
              </>
            ) : null}
            {type === 'journal' ? (
              <>
                <Field label="وصف القيد" value={fields.name} onChangeText={(value) => setField('name', value)} placeholder="مثال: إيداع رأس المال" colors={colors} />
                <Field label="المبلغ" value={fields.amount} onChangeText={(value) => setField('amount', value)} placeholder="0.00" keyboardType="decimal-pad" colors={colors} />
                <AccountPicker
                  label="الحساب المدين"
                  value={debitAccountId}
                  onChange={setDebitAccountId}
                  colors={colors}
                />
                <AccountPicker
                  label="الحساب الدائن"
                  value={creditAccountId}
                  onChange={setCreditAccountId}
                  colors={colors}
                />
                <CurrencyPicker value={currency} onChange={setCurrency} currencies={currencies} />
              </>
            ) : null}
            {type === 'employee' ? (
              <>
                <Field label="اسم الموظف" value={fields.name} onChangeText={(value) => setField('name', value)} placeholder="الاسم الكامل" colors={colors} />
                <Field label="المسمى الوظيفي" value={fields.role} onChangeText={(value) => setField('role', value)} placeholder="مثال: محاسب" colors={colors} />
                <Field label="الراتب الشهري" value={fields.salary} onChangeText={(value) => setField('salary', value)} placeholder="0.00" keyboardType="decimal-pad" colors={colors} />
                <CurrencyPicker value={currency} onChange={setCurrency} currencies={currencies} />
              </>
            ) : null}
            {type === 'customer' || type === 'supplier' ? (
              <>
                <Field label={type === 'customer' ? 'اسم العميل' : 'اسم المورد'} value={fields.name} onChangeText={(value) => setField('name', value)} placeholder="الاسم أو اسم المنشأة" colors={colors} />
                <Field label="رقم الهاتف" value={fields.phone} onChangeText={(value) => setField('phone', value)} placeholder="اختياري" keyboardType="phone-pad" colors={colors} />
                <CurrencyPicker value={currency} onChange={setCurrency} currencies={currencies} />
              </>
            ) : null}
            {needsMoney ? (
              <Text style={[formStyles.currencyHint, { color: colors.mutedForeground }]}>
                {type === 'journal'
                  ? 'يُسجل المبلغ مديناً ودائناً بالقيمة والعملة نفسيهما.'
                  : 'المبالغ تُحفظ بالعملة المحددة ولا تُحوّل تلقائياً.'}
              </Text>
            ) : null}
            {message ? (
              <View style={[formStyles.errorBox, { backgroundColor: colors.warningSoft }]}>
                <Feather name="alert-circle" size={15} color={colors.warning} />
                <Text style={[formStyles.errorText, { color: colors.warning }]}>{message}</Text>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              testID="form-submit"
              onPress={handleSubmit}
              style={({ pressed }) => [
                formStyles.submitButton,
                { backgroundColor: colors.primary, opacity: pressed ? 0.78 : 1 },
              ]}
            >
              <Feather name="check" size={17} color={colors.primaryForeground} />
              <Text style={[formStyles.submitText, { color: colors.primaryForeground }]}>{primaryLabel}</Text>
            </Pressable>
          </KeyboardAwareScrollViewCompat>
        </View>
      </View>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  colors,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad' | 'phone-pad';
  colors: ReturnType<typeof useColors>;
}) {
  const leftAligned = keyboardType !== undefined && keyboardType !== 'default';
  return (
    <View style={formStyles.field}>
      <Text style={[formStyles.fieldLabel, { color: colors.foreground }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={keyboardType ?? 'default'}
        style={[
          formStyles.input,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            color: colors.foreground,
            textAlign: leftAligned ? 'left' : 'right',
            writingDirection: leftAligned ? 'ltr' : 'rtl',
            fontFamily: leftAligned ? APP_FONTS.latin.regular : APP_FONTS.arabic.regular,
          },
        ]}
        autoCapitalize="sentences"
      />
    </View>
  );
}

function ChoiceRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: [string, string][];
  value: string;
  onChange: (value: string) => void;
}) {
  const colors = useColors();
  return (
    <View style={formStyles.field}>
      <Text style={[formStyles.fieldLabel, { color: colors.foreground }]}>{label}</Text>
      <View style={formStyles.choices}>
        {options.map(([key, title]) => {
          const selected = value === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(key)}
              style={[
                formStyles.choice,
                { backgroundColor: selected ? colors.primary : colors.card, borderColor: selected ? colors.primary : colors.border },
              ]}
            >
              <Text style={[formStyles.choiceText, { color: selected ? colors.primaryForeground : colors.mutedForeground }]}>{title}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function AccountPicker({
  label,
  value,
  onChange,
  colors,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={formStyles.field}>
      <Text style={[formStyles.fieldLabel, { color: colors.foreground }]}>{label}</Text>
      <View style={formStyles.accountOptions}>
        {DEFAULT_ACCOUNTS.map((account) => {
          const selected = value === account.id;
          return (
            <Pressable
              key={account.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(account.id)}
              style={[
                formStyles.accountOption,
                {
                  backgroundColor: selected ? colors.secondary : colors.card,
                  borderColor: selected ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  formStyles.accountOptionText,
                  { color: selected ? colors.primary : colors.mutedForeground },
                ]}
              >
                {account.code} · {account.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const formStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '90%', minHeight: '58%', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, paddingTop: 9, overflow: 'hidden' },
  handle: { width: 38, height: 4, borderRadius: 3, alignSelf: 'center', marginBottom: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14 },
  sheetTitleWrap: { flex: 1, alignItems: 'flex-start', gap: 4 },
  sheetTitle: { fontSize: 18, fontWeight: '800', textAlign: 'right', writingDirection: 'rtl' },
  sheetSubtitle: { fontSize: 11, textAlign: 'right', writingDirection: 'rtl' },
  closeButton: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 0 },
  formContent: { paddingHorizontal: 20, paddingBottom: 28, gap: 14 },
  field: { gap: 7 },
  fieldLabel: { fontSize: 12, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, fontSize: 14, fontFamily: APP_FONTS.arabic.regular, textAlign: 'right', writingDirection: 'rtl' },
  fieldRow: { flexDirection: 'row', gap: 10 },
  fieldHalf: { flex: 1 },
  choices: { flexDirection: 'row', gap: 8 },
  choice: { flex: 1, minHeight: 42, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  choiceText: { fontSize: 12, fontWeight: '700', textAlign: 'center', writingDirection: 'rtl' },
  accountOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  accountOption: { flexBasis: '48%', minHeight: 40, borderWidth: 1, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 9 },
  accountOptionText: { fontSize: 10, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  currencyHint: { fontSize: 10, textAlign: 'right', writingDirection: 'rtl' },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 11, borderRadius: 12 },
  errorText: { flex: 1, fontSize: 11, textAlign: 'right', writingDirection: 'rtl' },
  submitButton: { minHeight: 50, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 2 },
  submitText: { fontSize: 14, fontWeight: '700', textAlign: 'center', writingDirection: 'rtl' },
});
