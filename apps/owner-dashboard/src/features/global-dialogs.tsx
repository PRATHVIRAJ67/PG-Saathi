import { useDialogs } from '@/app/stores';
import { RecordPaymentDialog } from './payments/record-payment-dialog';
import { AssignBedDialog, ResidentFormDialog } from './residents/resident-dialogs';
import { ExpenseDialog } from './expenses/expense-dialog';
import { PropertyFormDialog } from './properties/property-form-dialog';
import { AddRoomsDialog } from './rooms/room-dialogs';
import { CreateInvoiceDialog, GenerateRentDialog } from './rent/rent-dialogs';

/** Dialogs reachable from quick actions anywhere in the app. */
export function GlobalDialogs() {
  const dialog = useDialogs((s) => s.dialog);
  const close = useDialogs((s) => s.close);
  const onOpenChange = (open: boolean) => !open && close();
  return (
    <>
      <RecordPaymentDialog open={dialog?.kind === 'record-payment'} onOpenChange={onOpenChange} residentId={dialog?.kind === 'record-payment' ? dialog.residentId : undefined} />
      <ResidentFormDialog open={dialog?.kind === 'add-resident'} onOpenChange={onOpenChange} />
      <AssignBedDialog
        open={dialog?.kind === 'assign-bed'}
        onOpenChange={onOpenChange}
        residentId={dialog?.kind === 'assign-bed' ? dialog.residentId : undefined}
        bedId={dialog?.kind === 'assign-bed' ? dialog.bedId : undefined}
      />
      <ExpenseDialog open={dialog?.kind === 'add-expense'} onOpenChange={onOpenChange} />
      <PropertyFormDialog open={dialog?.kind === 'add-property'} onOpenChange={onOpenChange} />
      <AddRoomsDialog open={dialog?.kind === 'add-rooms'} onOpenChange={onOpenChange} propertyId={dialog?.kind === 'add-rooms' ? dialog.propertyId : undefined} />
      <GenerateRentDialog open={dialog?.kind === 'generate-rent'} onOpenChange={onOpenChange} />
      <CreateInvoiceDialog open={dialog?.kind === 'create-invoice'} onOpenChange={onOpenChange} residentId={dialog?.kind === 'create-invoice' ? dialog.residentId : undefined} />
    </>
  );
}
