import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { useLoaderData, Form, useActionData, useNavigation } from "@remix-run/react";
import { json } from "@remix-run/cloudflare";
import { Loader2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import { Icon } from "~/components/ui/icon";
import { requireUser, getFullSession } from "~/lib/session.server";
import { rejectVendor } from "~/lib/api.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Rechazar Proveedor — FabriFlow" },
    { name: "description", content: "Rechazar solicitud de proveedor" },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const url = new URL(request.url);

  const userId = url.searchParams.get("user");
  const companyId = url.searchParams.get("company");

  if (!userId || !companyId) {
    return json({
      error: "Parametros invalidos. Se requiere user y company.",
      user,
      userId: null,
      companyId: null,
    });
  }

  // Extract just the ID without the prefix
  const cleanUserId = userId.includes(":") ? userId.split(":")[1] : userId;
  const cleanCompanyId = companyId.includes(":") ? companyId.split(":")[1] : companyId;

  return json({
    error: null,
    user,
    userId: cleanUserId,
    companyId: cleanCompanyId,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const session = await getFullSession(request);

  if (!session?.accessToken) {
    return json({
      success: false,
      error: "Sesion invalida. Por favor inicia sesion primero.",
    });
  }

  const formData = await request.formData();
  const userId = formData.get("userId") as string;
  const companyId = formData.get("companyId") as string;
  const reason = formData.get("reason") as string | null;

  if (!userId || !companyId) {
    return json({ success: false, error: "Datos incompletos" });
  }

  try {
    const result = await rejectVendor(
      session.accessToken,
      companyId,
      userId,
      reason || undefined
    );

    return json({ success: true, message: result.message, error: null });
  } catch (error) {
    console.error("Error rejecting vendor:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Error al rechazar proveedor",
    });
  }
}

// ---------- shared shell ----------

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        backgroundImage:
          "radial-gradient(oklch(0.88 0.012 70 / 0.55) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
        backgroundColor: "var(--paper-2)",
      }}
    >
      {/* Subtle brand watermark */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 opacity-60">
        <span className="relative grid h-7 w-7 place-items-center rounded-md bg-ink text-paper font-display text-[15px] font-semibold italic">
          F
          <span
            aria-hidden="true"
            className="absolute inset-[3px] rounded-[3px] border border-clay"
          />
        </span>
        <span className="font-display text-[16px] font-semibold tracking-tight text-ink">
          Fabri<em className="not-italic font-medium text-clay">Flow</em>
        </span>
      </div>

      <Card className="max-w-md w-full shadow-xl border-line">
        <CardContent className="p-8">
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- state screens ----------

function ErrorScreen({ message }: { message: string }) {
  return (
    <PageShell>
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-wine-soft grid place-items-center mx-auto mb-5">
          <Icon name="x" size={24} className="text-wine" />
        </div>
        <h1 className="font-display text-[22px] font-semibold text-ink mb-2">
          Error de parámetros
        </h1>
        <p className="text-[13px] text-ink-3 mb-6 leading-relaxed">{message}</p>
        <Button variant="outline" onClick={() => window.close()}>
          Cerrar
        </Button>
      </div>
    </PageShell>
  );
}

function SuccessScreen({ message }: { message?: string }) {
  return (
    <PageShell>
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-paper-3 grid place-items-center mx-auto mb-5">
          <Icon name="check" size={24} className="text-ink-2" />
        </div>
        <h1 className="font-display text-[22px] font-semibold text-ink mb-2">
          Solicitud rechazada
        </h1>
        <p className="text-[13px] text-ink-3 mb-6 leading-relaxed">
          {message || "La solicitud del proveedor ha sido rechazada."}
        </p>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => window.close()}>
            Cerrar
          </Button>
          <Button variant="clay" onClick={() => (window.location.href = "/users")}>
            Ver Usuarios
          </Button>
        </div>
      </div>
    </PageShell>
  );
}

function ActionErrorScreen({
  message,
  userId,
  companyId,
}: {
  message: string;
  userId: string | null;
  companyId: string | null;
}) {
  return (
    <PageShell>
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-wine-soft grid place-items-center mx-auto mb-5">
          <Icon name="x" size={24} className="text-wine" />
        </div>
        <h1 className="font-display text-[22px] font-semibold text-ink mb-2">
          Error al rechazar
        </h1>
        <p className="text-[13px] text-ink-3 mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => window.close()}>
            Cerrar
          </Button>
          <Form method="post">
            <input type="hidden" name="userId" value={userId || ""} />
            <input type="hidden" name="companyId" value={companyId || ""} />
            <Button type="submit" variant="clay">Reintentar</Button>
          </Form>
        </div>
      </div>
    </PageShell>
  );
}

// ---------- main ----------

export default function RejectVendor() {
  const { error, userId, companyId } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  if (error) return <ErrorScreen message={error} />;
  if (actionData?.success) return <SuccessScreen message={"message" in actionData ? (actionData.message ?? undefined) : undefined} />;
  if (actionData?.error) {
    return (
      <ActionErrorScreen
        message={actionData.error}
        userId={userId}
        companyId={companyId}
      />
    );
  }

  // Confirmation + reason form
  return (
    <PageShell>
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-full bg-wine-soft grid place-items-center mx-auto mb-5">
          <Icon name="x" size={22} className="text-wine" />
        </div>
        <h1 className="font-display text-[22px] font-semibold text-ink mb-2">
          Rechazar proveedor
        </h1>
        <p className="text-[13px] text-ink-2 mb-1 leading-relaxed">
          Estás a punto de rechazar la solicitud de este proveedor.
        </p>
        <p className="text-[12px] text-ink-3 leading-relaxed">
          El proveedor recibirá un correo informándole de esta decisión.
        </p>
      </div>

      {/* Metadata strip */}
      <div className="rounded-lg border border-line bg-paper-2 px-4 py-3 mb-5 space-y-1.5">
        <div className="flex justify-between text-[12px]">
          <span className="text-ink-3 font-mono">ID de usuario</span>
          <span className="font-mono text-ink-2 truncate max-w-[180px]">{userId}</span>
        </div>
        <div className="flex justify-between text-[12px]">
          <span className="text-ink-3 font-mono">Compañía</span>
          <span className="font-mono text-ink-2 truncate max-w-[180px]">{companyId}</span>
        </div>
      </div>

      <Form method="post" className="space-y-4">
        <input type="hidden" name="userId" value={userId || ""} />
        <input type="hidden" name="companyId" value={companyId || ""} />

        <div className="space-y-1.5">
          <Label
            htmlFor="reason"
            className="text-[12px] font-medium uppercase tracking-wider text-ink-3"
          >
            Motivo del rechazo
            <span className="ml-1 normal-case tracking-normal text-ink-4">(opcional)</span>
          </Label>
          <textarea
            id="reason"
            name="reason"
            placeholder="Explica el motivo del rechazo..."
            className="flex min-h-[100px] w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-[13px] text-ink placeholder:text-ink-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-clay/50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors resize-none"
          />
          <p className="text-[11px] text-ink-3">
            El motivo se incluirá en el correo enviado al proveedor.
          </p>
        </div>

        <div className="flex gap-3 justify-center pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => window.close()}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="destructive"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Rechazando...
              </>
            ) : (
              <>
                <Icon name="x" size={14} className="mr-2" />
                Rechazar proveedor
              </>
            )}
          </Button>
        </div>
      </Form>
    </PageShell>
  );
}
