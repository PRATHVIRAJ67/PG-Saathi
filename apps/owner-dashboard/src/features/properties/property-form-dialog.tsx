import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useBackend, useTenantMutation, useWorkspace } from '@pg/api-client/react';
import { GENDER_POLICY_LABELS, PROPERTY_TYPES, PROPERTY_TYPE_LABELS, type PropertyDetail } from '@pg/shared';
import { blankToNull, propertySchema, type PropertyValues } from '@pg/validation';
import { Button } from '@pg/ui-web/ui/button';
import { Input, Select, Textarea } from '@pg/ui-web/ui/form-controls';
import { Dialog, DialogContent } from '@pg/ui-web/ui/overlays';
import { Field, InlineError } from '@pg/ui-web/common';
import { FacilityChips } from '@/features/onboarding/onboarding-page';
import { useCurrentWorkspace } from '@/app/workspace';
import { useZodForm } from '@/lib/form';

export function PropertyFormDialog({ open, onOpenChange, property }: { open: boolean; onOpenChange: (o: boolean) => void; property?: PropertyDetail }) {
  const { tenantId } = useCurrentWorkspace();
  const { data } = useBackend();
  const navigate = useNavigate();
  const workspace = useWorkspace(tenantId);
  const empty: PropertyValues = {
    name: '',
    property_type: 'pg',
    gender_policy: 'any',
    address_line1: '',
    address_line2: '',
    locality: '',
    city: '',
    state: '',
    postal_code: '',
    contact_phone: '',
    description: '',
    facilities: [],
  };
  const form = useZodForm(propertySchema, { defaultValues: empty });
  const { register, handleSubmit, formState, reset, watch, setValue } = form;

  useEffect(() => {
    if (!open) return;
    reset(
      property
        ? {
            name: property.name,
            property_type: property.property_type,
            gender_policy: property.gender_policy,
            address_line1: property.address_line1 ?? '',
            address_line2: property.address_line2 ?? '',
            locality: property.locality ?? '',
            city: property.city ?? '',
            state: property.state ?? '',
            postal_code: property.postal_code ?? '',
            contact_phone: property.contact_phone ?? '',
            description: property.description ?? '',
            facilities: property.facilities,
          }
        : empty,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, property]);

  const mutation = useTenantMutation(tenantId, async (v: PropertyValues) => {
    const payload = {
      name: v.name.trim(),
      property_type: v.property_type as never,
      gender_policy: v.gender_policy,
      address_line1: blankToNull(v.address_line1),
      address_line2: blankToNull(v.address_line2),
      locality: blankToNull(v.locality),
      city: blankToNull(v.city),
      state: blankToNull(v.state),
      postal_code: blankToNull(v.postal_code),
      contact_phone: blankToNull(v.contact_phone),
      description: blankToNull(v.description),
      facilities: v.facilities,
    };
    return property ? data.updateProperty(property.id, payload) : data.createProperty(tenantId, payload);
  });

  const onSubmit = handleSubmit((v) =>
    mutation.mutate(v as PropertyValues, {
      onSuccess: (id) => {
        toast.success(property ? 'Property updated' : 'Property added');
        onOpenChange(false);
        if (!property) navigate(`/app/properties/${id}`);
      },
    }),
  );
  const e = formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        title={property ? 'Edit property' : 'Add a property'}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={onSubmit} loading={mutation.isPending}>
              {property ? 'Save changes' : 'Add property'}
            </Button>
          </>
        }
      >
        <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
          <Field label="Property name" required htmlFor="pf-name" error={e.name?.message} className="sm:col-span-2">
            <Input id="pf-name" autoFocus aria-invalid={!!e.name} {...register('name')} />
          </Field>
          <Field label="Type" htmlFor="pf-type">
            <Select id="pf-type" {...register('property_type')}>
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PROPERTY_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Who can stay" htmlFor="pf-gender">
            <Select id="pf-gender" {...register('gender_policy')}>
              {Object.entries(GENDER_POLICY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Address" htmlFor="pf-a1" className="sm:col-span-2">
            <Input id="pf-a1" {...register('address_line1')} />
          </Field>
          <Field label="Locality" htmlFor="pf-loc">
            <Input id="pf-loc" {...register('locality')} />
          </Field>
          <Field label="City" htmlFor="pf-city">
            <Input id="pf-city" {...register('city')} />
          </Field>
          <Field label="State" htmlFor="pf-state">
            <Input id="pf-state" {...register('state')} />
          </Field>
          <Field label="PIN code" htmlFor="pf-pin" error={e.postal_code?.message}>
            <Input id="pf-pin" inputMode="numeric" {...register('postal_code')} />
          </Field>
          <Field label="Property phone" htmlFor="pf-phone" error={e.contact_phone?.message}>
            <Input id="pf-phone" type="tel" {...register('contact_phone')} />
          </Field>
          <Field label="Facilities" className="sm:col-span-2">
            <FacilityChips options={workspace.data?.settings.facility_options ?? []} value={watch('facilities')} onChange={(v) => setValue('facilities', v, { shouldDirty: true })} />
          </Field>
          <Field label="Description" htmlFor="pf-desc" className="sm:col-span-2">
            <Textarea id="pf-desc" rows={3} {...register('description')} />
          </Field>
          <div className="sm:col-span-2">
            <InlineError error={mutation.error} />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
