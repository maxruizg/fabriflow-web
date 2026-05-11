import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useLoaderData, useRevalidator, useFetcher, useSearchParams } from "@remix-run/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { AuthLayout } from "~/components/layout/auth-layout";
import { Card } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Icon } from "~/components/ui/icon";
import { DataLoadError } from "~/components/ui/error-state";
import { cn } from "~/lib/utils";
import { requireUser, getFullSession } from "~/lib/session.server";
import { listCreditNotes } from "~/lib/credit-notes-api.server";
import type { CreditNote } from "~/types";

export const meta: MetaFunction = () => {
  return [
    { title: "Notas de crédito - FabriFlow" },
    {
      name: "description",
      content: "Consulta y administra notas de crédito vinculadas a facturas.",
    },
  ];
};

const LIMIT = 50;

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const session = await getFullSession(request);

  if (!session?.accessToken || !user.company) {
    return json({
      creditNotes: [] as CreditNote[],
      nextCursor: null,
      hasMore: false,
      error: "Sesión inválida",
      user,
    });
  }

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") || undefined;

  try {
    const page = await listCreditNotes(session.accessToken, user.company, {
      cursor,
      limit: LIMIT,
    });

    return json({
      creditNotes: page.data,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      error: null,
      user,
    });
  } catch (error) {
    console.error("Credit notes loader error:", error);
    return json({
      creditNotes: [] as CreditNote[],
      nextCursor: null,
      hasMore: false,
      error: "Error al cargar notas de crédito. Por favor intenta de nuevo más tarde.",
      user,
    });
  }
}

export default function CreditNotesIndex() {
  const { creditNotes, nextCursor, hasMore, error } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const fetcher = useFetcher<typeof loader>();
  const [searchParams] = useSearchParams();

  const [allNotes, setAllNotes] = useState<CreditNote[]>(creditNotes || []);
  const [currentCursor, setCurrentCursor] = useState<string | null>(nextCursor);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Reset when loader data changes (e.g., initial load or revalidation).
  useEffect(() => {
    setAllNotes(creditNotes || []);
    setCurrentCursor(nextCursor);
  }, [creditNotes, nextCursor]);

  // Load the next page via fetcher (infinite scroll).
  const loadMore = useCallback(() => {
    if (!currentCursor || isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    const params = new URLSearchParams(searchParams);
    params.set("cursor", currentCursor);
    fetcher.load(`/credit-notes?${params.toString()}`);
  }, [currentCursor, isLoadingMore, hasMore, searchParams, fetcher]);

  // Append fetched page when it arrives.
  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      const data = fetcher.data;
      if (data.creditNotes && data.creditNotes.length > 0) {
        setAllNotes((prev) => [...prev, ...data.creditNotes]);
        setCurrentCursor(data.nextCursor);
      }
      setIsLoadingMore(false);
    }
  }, [fetcher.data, fetcher.state]);

  // Intersection observer to trigger infinite scroll.
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 },
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [hasMore, isLoadingMore, loadMore]);

  if (error) {
    return (
      <AuthLayout>
        <DataLoadError
          resource="Notas de crédito"
          onRetry={() => revalidator.revalidate()}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="space-y-5">
        {/* Page header */}
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="ff-page-title">Notas de crédito</h1>
            <p className="ff-page-sub">
              Notas de crédito CFDI vinculadas a facturas de tus proveedores.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => revalidator.revalidate()}
              disabled={revalidator.state === "loading"}
              aria-label="Actualizar"
              className="inline-flex items-center justify-center rounded-md h-9 w-9 text-ink-2 hover:bg-paper-3 hover:text-ink transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  revalidator.state === "loading" && "animate-spin",
                )}
              />
            </button>
          </div>
        </header>

        {/* Table */}
        <Card>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Emisor</TableHead>
                  <TableHead className="w-[120px]">Folio</TableHead>
                  <TableHead className="w-[160px]">UUID</TableHead>
                  <TableHead className="w-[160px]">Factura origen</TableHead>
                  <TableHead className="w-[100px]">Fecha</TableHead>
                  <TableHead className="w-[140px] text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allNotes.map((cn) => (
                  <TableRow key={cn.id} className="hover:bg-ink-5/50 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-clay-soft text-clay-deep font-display text-[12px] font-semibold flex-shrink-0">
                          {cn.nombreEmisor.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-[13px] truncate max-w-[220px]">
                            {cn.nombreEmisor}
                          </p>
                          <p className="font-mono text-[11px] text-ink-3">{cn.rfcEmisor}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/invoice/${cn.invoice}`}
                        className="font-mono text-[12px] text-clay hover:underline"
                      >
                        {cn.folio}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span
                        className="font-mono text-[11px] text-ink-3"
                        title={cn.uuid}
                      >
                        {cn.uuid.slice(0, 8)}…{cn.uuid.slice(-4)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/invoice/${cn.invoice}`}
                        className="font-mono text-[11px] text-clay hover:underline"
                        title={cn.relatedInvoiceUuid}
                      >
                        {cn.relatedInvoiceUuid.slice(0, 8)}…{cn.relatedInvoiceUuid.slice(-4)}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-[12px] text-ink-3">
                      {new Date(cn.fechaEmision).toLocaleDateString("es-MX", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono font-medium text-[13px]">
                        ${cn.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                      </span>
                      <span className="ml-1 font-mono text-[10px] text-ink-3">
                        {cn.moneda}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {allNotes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-14">
                      <Icon name="file" size={32} className="mx-auto mb-3 text-ink-4" />
                      <p className="font-medium text-[13px] text-ink-2">
                        No se encontraron notas de crédito
                      </p>
                      <p className="text-[11px] text-ink-3 mt-1">
                        Las notas de crédito aparecerán aquí una vez que sean subidas
                      </p>
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>

            {hasMore ? (
              <div ref={loadMoreRef} className="py-3 text-center">
                {isLoadingMore ? (
                  <div className="flex items-center justify-center gap-2 text-[12px] text-ink-3">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Cargando más…
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </AuthLayout>
  );
}
