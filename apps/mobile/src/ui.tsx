import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { AlertTriangle, Check, ChevronDown, Search, X, type LucideIcon } from 'lucide-react-native';
import { colors, fontSize, radius, semantic } from '@pg/design-tokens';
import { errorMessage } from '@pg/api-client';
import { useBackend } from '@pg/api-client/react';

export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------
type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption' | 'overline';
const variants: Record<Variant, TextStyle> = {
  display: { fontFamily: font.semibold, fontSize: 28, lineHeight: 34, letterSpacing: -0.4, color: semantic.text },
  title: { fontFamily: font.semibold, fontSize: 22, lineHeight: 28, letterSpacing: -0.3, color: semantic.text },
  heading: { fontFamily: font.semibold, fontSize: fontSize.md, lineHeight: 22, color: semantic.text },
  body: { fontFamily: font.regular, fontSize: fontSize.base, lineHeight: 20, color: colors.gray[700] },
  label: { fontFamily: font.medium, fontSize: fontSize.sm, lineHeight: 18, color: colors.gray[700] },
  caption: { fontFamily: font.regular, fontSize: fontSize.xs, lineHeight: 16, color: semantic.textSecondary },
  overline: { fontFamily: font.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.gray[400] },
};

export function Txt({ variant = 'body', style, tabular, numberOfLines, children, color }: { variant?: Variant; style?: StyleProp<TextStyle>; tabular?: boolean; numberOfLines?: number; children: ReactNode; color?: string }) {
  return (
    <Text numberOfLines={numberOfLines} style={[variants[variant], tabular && { fontVariant: ['tabular-nums'] }, color ? { color } : null, style]}>
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
export function Screen({
  children,
  title,
  subtitle,
  right,
  refreshing,
  onRefresh,
  scroll = true,
  footer,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  footer?: ReactNode;
}) {
  const header = title ? (
    <View style={s.screenHeader}>
      <View style={{ flex: 1 }}>
        <Txt variant="title">{title}</Txt>
        {subtitle ? <Txt variant="caption" style={{ marginTop: 2 }}>{subtitle}</Txt> : null}
      </View>
      {right}
    </View>
  ) : null;
  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      <DemoStrip />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={s.scrollContent}
            keyboardShouldPersistTaps="handled"
            refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.accent[600]} colors={[colors.accent[600]]} /> : undefined}
          >
            {header}
            {children}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>
            {header && <View style={{ paddingHorizontal: 16 }}>{header}</View>}
            {children}
          </View>
        )}
        {footer ? <StickyFooter>{footer}</StickyFooter> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function StickyFooter({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>{children}</View>;
}

export function DemoStrip() {
  const { mode, demo } = useBackend();
  if (mode === 'supabase' || !demo) return null;
  return (
    <View style={s.demo} accessibilityRole="text">
      <Txt variant="caption" color={colors.white} style={{ fontFamily: font.medium }}>
        {demo.description}
      </Txt>
    </View>
  );
}

export function Card({ children, style, delay = 0, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; delay?: number; padded?: boolean }) {
  return (
    <Animated.View entering={FadeInDown.duration(260).delay(delay)} style={[s.card, padded && { padding: 16 }, style]}>
      {children}
    </Animated.View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={s.sectionHeader}>
      <Txt variant="heading">{title}</Txt>
      {action}
    </View>
  );
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: semantic.border }} />;
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
export function Button({
  title,
  onPress,
  variant = 'primary',
  icon: Icon,
  loading,
  disabled,
  compact,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = { primary: colors.navy[900], accent: colors.accent[600], secondary: colors.white, ghost: 'transparent', danger: colors.danger[600] }[variant];
  const fg = variant === 'secondary' || variant === 'ghost' ? colors.gray[800] : colors.white;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        onPress?.();
      }}
      style={({ pressed }) => [
        s.button,
        compact && { minHeight: 40, paddingHorizontal: 12 },
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'secondary' && { borderWidth: 1, borderColor: semantic.border },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} size="small" /> : Icon ? <Icon size={18} color={fg} strokeWidth={2} /> : null}
      <Text style={[s.buttonText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({ icon: Icon, onPress, label }: { icon: LucideIcon; onPress: () => void; label: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={({ pressed }) => [s.iconButton, pressed && { backgroundColor: colors.gray[100] }]}>
      <Icon size={20} color={colors.gray[700]} />
    </Pressable>
  );
}

export function Field({ label, error, hint, children, required }: { label: string; error?: string; hint?: string; children: ReactNode; required?: boolean }) {
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="label">
        {label}
        {required ? <Text style={{ color: colors.danger[600] }}> *</Text> : null}
      </Txt>
      {children}
      {error ? (
        <Txt variant="caption" color={colors.danger[600]}>
          {error}
        </Txt>
      ) : hint ? (
        <Txt variant="caption">{hint}</Txt>
      ) : null}
    </View>
  );
}

export function Input({ invalid, prefix, style, ...props }: TextInputProps & { invalid?: boolean; prefix?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[s.input, focused && s.inputFocused, invalid && { borderColor: colors.danger[600] }]}>
      {prefix ? <Text style={s.prefix}>{prefix}</Text> : null}
      <TextInput
        placeholderTextColor={colors.gray[400]}
        style={[s.inputText, style]}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        {...props}
      />
    </View>
  );
}

export function MoneyInput(props: TextInputProps & { invalid?: boolean }) {
  return <Input prefix="₹" keyboardType="decimal-pad" style={{ fontVariant: ['tabular-nums'] }} {...props} />;
}

export interface Option<T extends string> {
  value: T;
  label: string;
  description?: string;
}

/** Bottom-sheet style picker; touch-friendly alternative to a dropdown. */
export function Picker<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  title,
  searchable,
  invalid,
}: {
  value: T | '';
  onChange: (v: T) => void;
  options: Option<T>[];
  placeholder: string;
  title: string;
  searchable?: boolean;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const insets = useSafeAreaInsets();
  const selected = options.find((o) => o.value === value);
  const filtered = q ? options.filter((o) => `${o.label} ${o.description ?? ''}`.toLowerCase().includes(q.toLowerCase())) : options;
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={() => setOpen(true)} style={[s.input, { justifyContent: 'space-between' }, invalid && { borderColor: colors.danger[600] }]}>
        <Text numberOfLines={1} style={[s.inputText, { flex: 1 }, !selected && { color: colors.gray[400] }]}>
          {selected?.label ?? placeholder}
        </Text>
        <ChevronDown size={18} color={colors.gray[400]} />
      </Pressable>
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 8 }]}>
          <View style={s.sheetHeader}>
            <Txt variant="heading">{title}</Txt>
            <IconButton icon={X} label="Close" onPress={() => setOpen(false)} />
          </View>
          {searchable ? (
            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              <Input value={q} onChangeText={setQ} placeholder="Search" autoFocus />
            </View>
          ) : null}
          <FlatList
            data={filtered}
            keyExtractor={(o) => o.value}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Txt variant="caption" style={{ padding: 16 }}>Nothing to choose from</Txt>}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onChange(item.value);
                  setOpen(false);
                  setQ('');
                }}
                style={({ pressed }) => [s.option, pressed && { backgroundColor: colors.gray[50] }]}
              >
                <View style={{ flex: 1 }}>
                  <Txt variant="label" style={{ color: semantic.text }}>{item.label}</Txt>
                  {item.description ? <Txt variant="caption">{item.description}</Txt> : null}
                </View>
                {item.value === value ? <Check size={18} color={colors.accent[600]} /> : null}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => onChange(o.value)} style={[s.chip, active && s.chipActive]}>
            <Text style={[s.chipText, active && { color: colors.white }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <View style={[s.input, { gap: 8 }]}>
      <Search size={18} color={colors.gray[400]} />
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.gray[400]} style={[s.inputText, { flex: 1 }]} returnKeyType="search" accessibilityLabel={placeholder} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------
type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
const toneColors: Record<Tone, [string, string]> = {
  neutral: [colors.gray[100], colors.gray[700]],
  success: [colors.success[50], colors.success[700]],
  warning: [colors.warning[50], colors.warning[700]],
  danger: [colors.danger[50], colors.danger[700]],
  accent: [colors.accent[50], colors.accent[700]],
};
export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const [bg, fg] = toneColors[tone];
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Text style={[s.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const parts = name.trim().split(/\s+/);
  const initials = ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accent[50], alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: font.semibold, fontSize: size * 0.36, color: colors.accent[700] }}>{initials || '?'}</Text>
    </View>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'danger' | 'success' }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Txt variant="caption">{label}</Txt>
      <Txt variant="heading" tabular style={{ fontSize: 19, lineHeight: 24 }} color={tone === 'danger' ? colors.danger[600] : tone === 'success' ? colors.success[700] : undefined}>
        {value}
      </Txt>
      {hint ? <Txt variant="caption" numberOfLines={1}>{hint}</Txt> : null}
    </View>
  );
}

export function Row({ title, subtitle, left, right, onPress }: { title: string; subtitle?: string; left?: ReactNode; right?: ReactNode; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress} onPress={onPress} style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.gray[50] }]}>
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" numberOfLines={1} style={{ color: semantic.text }}>
          {title}
        </Txt>
        {subtitle ? <Txt variant="caption" numberOfLines={1}>{subtitle}</Txt> : null}
      </View>
      {right}
    </Pressable>
  );
}

export function ProgressBar({ value, color = colors.accent[600] }: { value: number; color?: string }) {
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.gray[100], overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: '100%', borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 16, gap: 8 }}>
      <View style={s.emptyIcon}>
        <Icon size={22} color={colors.gray[500]} />
      </View>
      <Txt variant="heading">{title}</Txt>
      {description ? <Txt variant="caption" style={{ textAlign: 'center', maxWidth: 280 }}>{description}</Txt> : null}
      {action ? <View style={{ marginTop: 8 }}>{action}</View> : null}
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <View style={{ alignItems: 'center', padding: 24, gap: 8 }} accessibilityRole="alert">
      <View style={[s.emptyIcon, { backgroundColor: colors.danger[50] }]}>
        <AlertTriangle size={22} color={colors.danger[600]} />
      </View>
      <Txt variant="heading">Couldn’t load this</Txt>
      <Txt variant="caption" style={{ textAlign: 'center' }}>{errorMessage(error)}</Txt>
      {onRetry ? <Button title="Try again" variant="secondary" compact onPress={onRetry} /> : null}
    </View>
  );
}

export function InlineError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <View style={s.inlineError} accessibilityRole="alert">
      <AlertTriangle size={16} color={colors.danger[700]} />
      <Txt variant="caption" color={colors.danger[700]} style={{ flex: 1 }}>
        {errorMessage(error)}
      </Txt>
    </View>
  );
}

export function Skeleton({ height = 16, width = '100%', style }: { height?: number; width?: number | `${number}%`; style?: StyleProp<ViewStyle> }) {
  const opacity = useSharedValue(0.5);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[{ height, width, borderRadius: 8, backgroundColor: colors.gray[100] }, animated, style]} />;
}

export function LoadingList({ rows = 4 }: { rows?: number }) {
  return (
    <View style={{ gap: 12 }} accessibilityLabel="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={56} style={{ borderRadius: radius.lg }} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: semantic.background },
  scrollContent: { padding: 16, paddingBottom: 40, gap: 16 },
  screenHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 4, paddingBottom: 4 },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.white, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: semantic.border },
  demo: { backgroundColor: colors.navy[900], paddingVertical: 6, paddingHorizontal: 16, alignItems: 'center' },
  card: { backgroundColor: colors.white, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: semantic.border },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  button: { minHeight: 48, borderRadius: radius.lg, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { fontFamily: font.semibold, fontSize: 15 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 48, borderRadius: radius.lg, borderWidth: 1, borderColor: semantic.border, backgroundColor: colors.white, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  inputFocused: { borderColor: colors.accent[600] },
  inputText: { flex: 1, fontFamily: font.regular, fontSize: 15, color: semantic.text, paddingVertical: 10 },
  prefix: { fontFamily: font.medium, fontSize: 15, color: colors.gray[500], marginRight: 6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,19,38,0.4)' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 6, paddingVertical: 6 },
  option: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12, minHeight: 52 },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: 18, borderWidth: 1, borderColor: semantic.border, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: colors.navy[900], borderColor: colors.navy[900] },
  chipText: { fontFamily: font.medium, fontSize: 13, color: colors.gray[700] },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontFamily: font.medium, fontSize: 11 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 56 },
  emptyIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  inlineError: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: colors.danger[50], borderRadius: radius.md, padding: 10 },
});
