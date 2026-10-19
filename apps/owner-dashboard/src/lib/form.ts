import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type FieldValues, type UseFormProps } from 'react-hook-form';
import type { z } from 'zod';

/**
 * react-hook-form bound to a zod schema, typed with the schema's input and
 * output types (coerced numbers, rupee strings, etc.).
 */
export function useZodForm<S extends z.ZodType<FieldValues, FieldValues>>(schema: S, options: Omit<UseFormProps<z.input<S>, unknown, z.output<S>>, 'resolver'> = {}) {
  return useForm<z.input<S>, unknown, z.output<S>>({
    mode: 'onTouched',
    ...options,
    // The resolver's generic signature is stricter than needed for z.ZodType.
    resolver: zodResolver(schema as never) as never,
  });
}
