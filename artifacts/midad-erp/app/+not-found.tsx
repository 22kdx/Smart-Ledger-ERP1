import { Link, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { AppText } from '../components/erp-ui';

export default function NotFoundScreen() {
  const colors = useColors();

  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <AppText style={[styles.title, { color: colors.foreground }]}>
          هذه الصفحة غير موجودة.
        </AppText>

        <Link href="/" style={styles.link}>
          <AppText style={[styles.linkText, { color: colors.primary }]}>
            العودة إلى الصفحة الرئيسية
          </AppText>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 14,
  },
});
