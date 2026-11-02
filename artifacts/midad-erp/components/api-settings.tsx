import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { AppText, Card } from './erp-ui';
import {
  ApiClientState,
  checkApiHealth,
  getApiClientState,
  importApiConfigFile,
} from './api-client';

export function ApiSettings() {
  const colors = useColors();
  const [apiState, setApiState] = useState<ApiClientState>({
    API_BASE_URL: null,
    error: null,
  });
  const [message, setMessage] = useState('لم يُستورد ملف إعداد الخادم بعد.');
  const [isError, setIsError] = useState(false);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    let mounted = true;
    void getApiClientState().then((nextState) => {
      if (!mounted) return;
      setApiState(nextState);
      if (nextState.error) {
        setMessage(nextState.error);
        setIsError(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const importConfig = async () => {
    setIsWorking(true);
    setMessage('');
    setIsError(false);
    try {
      const nextState = await importApiConfigFile();
      if (!nextState) return;
      setApiState(nextState);
      setMessage('تم استيراد الإعداد وحفظه على هذا الجهاز.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر استيراد الملف.');
      setIsError(true);
    } finally {
      setIsWorking(false);
    }
  };

  const testConnection = async () => {
    setIsWorking(true);
    setMessage('');
    setIsError(false);
    try {
      const health = await checkApiHealth();
      setMessage(`استجاب الخادم: ${health.status}`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `تعذر الاتصال: ${error.message}`
          : 'تعذر الاتصال بالخادم.',
      );
      setIsError(true);
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.heading}>
        <Feather name="server" size={18} color={colors.primary} />
        <AppText style={[styles.title, { color: colors.foreground }]}>اتصال الخادم</AppText>
      </View>

      <AppText style={[styles.label, { color: colors.mutedForeground }]}>
        API_BASE_URL
      </AppText>
      <AppText
        accessibilityLabel={`عنوان API: ${apiState.API_BASE_URL ?? 'غير مضبوط'}`}
        style={[
          styles.address,
          { color: apiState.API_BASE_URL ? colors.foreground : colors.mutedForeground },
        ]}
      >
        {apiState.API_BASE_URL ?? 'غير مضبوط'}
      </AppText>
      <AppText style={[styles.helper, { color: colors.mutedForeground }]}>
        استورد ملف JSON يحتوي على API_BASE_URL وينتهي مساره بـ /api. الإعداد محلي لهذا الجهاز ولا يحتوي بيانات المنشأة.
      </AppText>

      <View style={styles.actions}>
        <ActionButton
          title="استيراد ملف الإعداد"
          icon="upload"
          disabled={isWorking}
          onPress={importConfig}
        />
        <ActionButton
          title="اختبار الاتصال"
          icon="wifi"
          disabled={isWorking || !apiState.API_BASE_URL}
          onPress={testConnection}
        />
      </View>

      {message ? (
        <AppText
          accessibilityRole={isError ? 'alert' : 'text'}
          style={[styles.message, { color: isError ? colors.warning : colors.info }]}
        >
          {isWorking ? 'جارٍ العمل…' : message}
        </AppText>
      ) : isWorking ? (
        <AppText style={[styles.message, { color: colors.mutedForeground }]}>
          جارٍ العمل…
        </AppText>
      ) : null}
    </Card>
  );
}

function ActionButton({
  title,
  icon,
  disabled,
  onPress,
}: {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  disabled: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: disabled ? colors.muted : colors.secondary,
          opacity: pressed && !disabled ? 0.7 : 1,
        },
      ]}
    >
      <Feather
        name={icon}
        size={15}
        color={disabled ? colors.mutedForeground : colors.primary}
      />
      <AppText
        style={[
          styles.buttonText,
          { color: disabled ? colors.mutedForeground : colors.primary },
        ]}
      >
        {title}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, padding: 16 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '700' },
  label: { fontSize: 12, textAlign: 'left', writingDirection: 'ltr' },
  address: { fontSize: 12, textAlign: 'left', writingDirection: 'ltr' },
  helper: { fontSize: 12, lineHeight: 18, textAlign: 'right', writingDirection: 'rtl' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  buttonText: { fontSize: 12, fontWeight: '700' },
  message: { fontSize: 12, lineHeight: 18, textAlign: 'right', writingDirection: 'rtl' },
});
