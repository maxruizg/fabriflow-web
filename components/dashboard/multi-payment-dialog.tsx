import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { CreditCard, Upload, FileText, AlertCircle, Search } from "lucide-react";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { getStatusBadge, cn } from "~/lib/utils";
import type { Invoice } from "~/types";

interface MultiPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoices: Invoice[];
}

export const MultiPaymentDialog = ({
  open,
  onOpenChange,
  invoices,
}: MultiPaymentDialogProps) => {
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [paymentReference, setPaymentReference] = useState<string>("");
  const [paymentFile, setPaymentFile] = useState<File | null>(null);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Filter only pending invoices
  const pendingInvoices = invoices.filter(
    (invoice) => invoice.status === "pending" || invoice.status === "pendiente"
  );

  // Filter invoices based on search term
  const filteredInvoices = pendingInvoices.filter((invoice) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      invoice.folio.toLowerCase().includes(searchLower) ||
      invoice.company.toLowerCase().includes(searchLower) ||
      invoice.issuerName.toLowerCase().includes(searchLower)
    );
  });

  // Sort invoices to show selected ones first
  const sortedInvoices = [...filteredInvoices].sort((a, b) => {
    const aSelected = selectedInvoices.includes(a.uuid);
    const bSelected = selectedInvoices.includes(b.uuid);
    if (aSelected && !bSelected) return -1;
    if (!aSelected && bSelected) return 1;
    return 0;
  });

  // Calculate total of selected invoices
  const selectedTotal = selectedInvoices.reduce((sum, invoiceId) => {
    const invoice = pendingInvoices.find(
      (inv: Invoice) => inv.uuid === invoiceId
    );
    return sum + (invoice ? parseFloat(invoice.total) : 0);
  }, 0);

  // Calculate remianing amount to allocate
  const totalAllocated = Object.values(allocations).reduce(
    (sum, amount) => sum + amount,
    0
  );
  const remainingAmount = parseFloat(paymentAmount || "0") - totalAllocated;

  // Auto-allocate payment amount across selected invoices
  const autoAllocate = () => {
    if (!paymentAmount || selectedInvoices.length === 0) return;

    const amount = parseFloat(paymentAmount);
    let remaining = amount;
    const newAllocations: Record<string, number> = {};

    selectedInvoices.forEach((invoiceId) => {
      const invoice = pendingInvoices.find((inv) => inv.uuid === invoiceId);
      if (invoice) {
        const invoiceTotal = parseFloat(invoice.total);
        const allocation = Math.min(remaining, invoiceTotal);
        newAllocations[invoiceId] = allocation;
        remaining -= allocation;
      }
    });

    setAllocations(newAllocations);
  };

  // Handle invoice selection
  const toggleInvoiceSelection = (invoiceId: string) => {
    setSelectedInvoices((prev) => {
      if (prev.includes(invoiceId)) {
        // Remove allocation when deselecting
        const newAllocations = { ...allocations };
        delete newAllocations[invoiceId];
        setAllocations(newAllocations);
        return prev.filter((id) => id !== invoiceId);
      }
      return [...prev, invoiceId];
    });
  };

  // Handle allocations change for individual invoice
  const updateAllocation = (invoiceId: string, value: string) => {
    const amount = parseFloat(value || "0");
    setAllocations((prev) => ({
      ...prev,
      [invoiceId]: amount,
    }));
  };

  // Handle file Upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setPaymentFile(e.target.files[0]);
    }
  };

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedInvoices([]);
      setPaymentAmount("");
      setPaymentMethod("");
      setPaymentReference("");
      setPaymentFile(null);
      setAllocations({});
      setSearchTerm("");
    }
  }, [open]);

  const handleSubmit = () => {
    console.log({
      selectedInvoices,
      paymentAmount,
      paymentMethod,
      paymentReference,
      paymentFile,
      allocations,
    });
    onOpenChange(false);
  };

  const isValid =
    selectedInvoices.length > 0 &&
    paymentAmount &&
    parseFloat(paymentAmount) > 0 &&
    paymentMethod &&
    paymentReference &&
    Math.abs(remainingAmount) < 0.01;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Multipago de Facturas
          </DialogTitle>
          <DialogDescription>
            Selecciona las facturas que deseas pagar y distribuye el monto del
            pago
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1">
          <div className="space-y-6">
            {/* Payment Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Información del Pago</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="payment-amount">Monto Total del Pago</Label>
                  <Input
                    id="payment-amount"
                    type="number"
                    placeholder="0.00"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    step="0.01"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment-method">Método de Pago</Label>
                  <Select
                    value={paymentMethod}
                    onValueChange={setPaymentMethod}
                  >
                    <SelectTrigger id="payment-method">
                      <SelectValue placeholder="Selecciona método" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="transfer">Transferencia</SelectItem>
                      <SelectItem value="check">Cheque</SelectItem>
                      <SelectItem value="cash">Efectivo</SelectItem>
                      <SelectItem value="card">Tarjeta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="payment-reference">Referencia de Pago</Label>
                  <Input
                    id="payment-reference"
                    placeholder="Número de referencia"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment-file">Comprobante de Pago</Label>
                  <div className="flex gap-2">
                    <Input
                      id="payment-file"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={handleFileChange}
                      className="flex-1"
                    />
                    {paymentFile && (
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Invoice Selection and Allocation */}
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Facturas Pendientes</h3>
                  {selectedInvoices.length > 0 && paymentAmount && (
                    <Button variant="outline" size="sm" onClick={autoAllocate}>
                      Distribuir Automáticamente
                    </Button>
                  )}
                </div>
                
                {/* Search bar */}
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por folio, empresa o emisor..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              {pendingInvoices.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No hay facturas pendientes de pago
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            id="select-all-invoices"
                            checked={
                              filteredInvoices.length > 0 &&
                              selectedInvoices.length === filteredInvoices.length
                            }
                            onCheckedChange={(checked: boolean) => {
                              if (checked) {
                                setSelectedInvoices(
                                  filteredInvoices.map((inv) => inv.uuid)
                                );
                              } else {
                                setSelectedInvoices([]);
                                setAllocations({});
                              }
                            }}
                          />
                        </TableHead>
                        <TableHead>Folio</TableHead>
                        <TableHead>Empresa</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Asignado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedInvoices.map((invoice) => {
                        const isSelected = selectedInvoices.includes(
                          invoice.uuid
                        );
                        return (
                          <TableRow 
                            key={invoice.uuid}
                            className={cn(
                              isSelected && "bg-muted/50 border-l-2 border-l-primary"
                            )}
                          >
                            <TableCell>
                              <Checkbox
                                id={`invoice-${invoice.uuid}`}
                                checked={isSelected}
                                onCheckedChange={() =>
                                  toggleInvoiceSelection(invoice.uuid)
                                }
                              />
                            </TableCell>
                            <TableCell className="font-medium">
                              {invoice.folio}
                            </TableCell>

                            <TableCell>{invoice.company}</TableCell>
                            <TableCell>
                              {new Date(
                                invoice.invoiceDate
                              ).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              ${parseFloat(invoice.total).toLocaleString()}
                              {invoice.currency}
                            </TableCell>
                            <TableCell className="text-right">
                              {isSelected && (
                                <Input
                                  type="number"
                                  className="w-32 ml-auto"
                                  placeholder="0.00"
                                  value={allocations[invoice.uuid] || ""}
                                  onChange={(e) =>
                                    updateAllocation(
                                      invoice.uuid,
                                      e.target.value
                                    )
                                  }
                                  step="0.01"
                                  max={invoice.total}
                                />
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {sortedInvoices.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            {searchTerm 
                              ? "No se encontraron facturas que coincidan con la búsqueda"
                              : "No hay facturas pendientes disponibles"
                            }
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Summary */}
            {selectedInvoices.length > 0 && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Total de Facturas Seleccionadas:</span>
                  <span className="font-medium">
                    ${selectedTotal.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Monto del Pago:</span>
                  <span className="font-medium">
                    ${parseFloat(paymentAmount || "0").toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Monto Asignado:</span>
                  <span className="font-medium">
                    ${totalAllocated.toLocaleString()}
                  </span>
                </div>
                <div className="border-t pt-2 mt-2">
                  <div className="flex justify-between">
                    <span className="font-medium">Por Asignar:</span>
                    <span
                      className={`font-medium ${
                        Math.abs(remainingAmount) < 0.01
                          ? "text-green-600"
                          : "text-orange-600"
                      }`}
                    >
                      ${remainingAmount.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid}>
            <Upload className="h-4 w-4 mr-2" />
            Registrar Pago
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
