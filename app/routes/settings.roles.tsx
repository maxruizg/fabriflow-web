import { useEffect, useMemo, useState } from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData } from "@remix-run/react";

import { requireUser, getFullSession } from "~/lib/session.server";
import {
  createRole,
  deleteRole,
  fetchRoles,
  updateRole,
  type RoleBackend,
} from "~/lib/procurement-api.server";
import { PERMISSION_GROUPS } from "~/lib/permission-catalog";

import { AuthLayout } from "~/components/layout/auth-layout";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Icon } from "~/components/ui/icon";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";

export const meta: MetaFunction = () => [{ title: "Roles — FabriFlow" }];

export const handle = {
  crumb: ["Configuración", "Roles"],
  cta: null,
};

interface LoaderData {
  roles: RoleBackend[];
  error: string | null;
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const session = await getFullSession(request);
  if (!session?.accessToken || !session.user.company) {
    throw redirect("/login");
  }
  try {
    const roles = await fetchRoles(session.accessToken, session.user.company);
    return json<LoaderData>({ roles, error: null });
  } catch (e) {
    return json<LoaderData>({
      roles: [],
      error: e instanceof Error ? e.message : "No se pudieron cargar los roles",
    });
  }
}

interface ActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const session = await getFullSession(request);
  if (!session?.accessToken || !session.user.company) {
    return json<ActionResult>({ ok: false, error: "Sesión inválida" }, { status: 401 });
  }
  const token = session.accessToken;
  const companyId = session.user.company;

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  try {
    if (intent === "create") {
      const name = String(fd.get("name") ?? "").trim();
      const color = String(fd.get("color") ?? "").trim() || undefined;
      const permissions = String(fd.get("permissions") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!name) return json<ActionResult>({ ok: false, error: "Nombre obligatorio" }, { status: 400 });
      await createRole(token, companyId, { name, color, permissions });
      return json<ActionResult>({ ok: true, message: "Rol creado" });
    }
    if (intent === "update") {
      const id = String(fd.get("id") ?? "");
      const name = String(fd.get("name") ?? "").trim();
      const color = String(fd.get("color") ?? "").trim() || undefined;
      const permissions = String(fd.get("permissions") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!id) return json<ActionResult>({ ok: false, error: "Id obligatorio" }, { status: 400 });
      await updateRole(token, companyId, id, {
        name: name || undefined,
        color,
        permissions,
      });
      return json<ActionResult>({ ok: true, message: "Rol actualizado" });
    }
    if (intent === "delete") {
      const id = String(fd.get("id") ?? "");
      if (!id) return json<ActionResult>({ ok: false, error: "Id obligatorio" }, { status: 400 });
      await deleteRole(token, companyId, id);
      return json<ActionResult>({ ok: true, message: "Rol eliminado" });
    }
    return json<ActionResult>({ ok: false, error: "Intent no reconocido" }, { status: 400 });
  } catch (e) {
    return json<ActionResult>(
      { ok: false, error: e instanceof Error ? e.message : "Error inesperado" },
      { status: 400 },
    );
  }
}

export default function SettingsRolesPage() {
  const { roles, error } = useLoaderData<typeof loader>();
  const [selectedId, setSelectedId] = useState<string | null>(
    roles.find((r) => !r.isSystemRole)?.id ?? roles[0]?.id ?? null,
  );

  const selected = useMemo(
    () => roles.find((r) => r.id === selectedId) ?? null,
    [roles, selectedId],
  );

  return (
    <AuthLayout>
      <div className="space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="ff-page-title">
              Roles y <em>permisos</em>
            </h1>
            <p className="ff-page-sub">
              Crea roles personalizados y controla qué puede hacer cada miembro de tu empresa.
            </p>
          </div>
          <NewRoleButton />
        </header>

        {error ? (
          <div className="rounded-md border border-line bg-paper-2 p-3 text-[12px] text-wine">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-[13px] uppercase tracking-wider text-ink-3 font-mono">
                Roles ({roles.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <ul className="flex flex-col gap-1">
                {roles.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-md flex items-center gap-2.5",
                        "hover:bg-paper-2 transition-colors",
                        r.id === selectedId && "bg-paper-3",
                      )}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-line"
                        style={{ backgroundColor: r.color || "var(--ink-4)" }}
                        aria-hidden="true"
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-medium text-ink truncate">
                          {r.name}
                        </span>
                        <span className="block text-[11px] text-ink-3 font-mono truncate">
                          {r.isSystemRole
                            ? "sistema"
                            : `${r.permissions.length} permisos`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {selected ? (
            <RoleEditor key={selected.id} role={selected} />
          ) : (
            <Card>
              <CardContent className="p-10 text-center">
                <Icon name="settings" size={28} className="mx-auto text-ink-4 mb-3" />
                <div className="text-[13px] font-medium text-ink-2">
                  Selecciona un rol
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AuthLayout>
  );
}

function NewRoleButton() {
  const fetcher = useFetcher<ActionResult>();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#7C8A6E");

  useEffect(() => {
    if (fetcher.data?.ok) {
      setOpen(false);
      setName("");
    }
  }, [fetcher.data?.ok]);

  if (!open) {
    return (
      <Button variant="clay" size="sm" onClick={() => setOpen(true)}>
        <Icon name="plus" size={13} />
        Nuevo rol
      </Button>
    );
  }

  return (
    <fetcher.Form method="post" className="flex items-center gap-2">
      <input type="hidden" name="intent" value="create" />
      <input type="hidden" name="permissions" value="" />
      <Input
        name="name"
        placeholder="Nombre del rol"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-9 w-[180px]"
      />
      <input
        name="color"
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        className="h-9 w-9 rounded border border-line bg-paper p-0.5"
        aria-label="Color"
      />
      <Button
        type="submit"
        variant="clay"
        size="sm"
        disabled={fetcher.state !== "idle" || !name.trim()}
      >
        Crear
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(false)}
      >
        Cancelar
      </Button>
    </fetcher.Form>
  );
}

function RoleEditor({ role }: { role: RoleBackend }) {
  const fetcher = useFetcher<ActionResult>();
  const deleteFetcher = useFetcher<ActionResult>();
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color || "#7C8A6E");
  const [perms, setPerms] = useState<Set<string>>(new Set(role.permissions));

  useEffect(() => {
    setName(role.name);
    setColor(role.color || "#7C8A6E");
    setPerms(new Set(role.permissions));
  }, [role.id, role.name, role.color, role.permissions]);

  const readOnly = role.isSystemRole;

  const toggle = (key: string) => {
    if (readOnly) return;
    setPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const save = () => {
    if (readOnly) return;
    const fd = new FormData();
    fd.set("intent", "update");
    fd.set("id", role.id);
    fd.set("name", name);
    fd.set("color", color);
    fd.set("permissions", Array.from(perms).join(","));
    fetcher.submit(fd, { method: "post" });
  };

  const remove = () => {
    if (readOnly || !role.isDeletable) return;
    if (!confirm(`¿Eliminar el rol "${role.name}"? Los miembros deberán ser reasignados antes.`)) {
      return;
    }
    const fd = new FormData();
    fd.set("intent", "delete");
    fd.set("id", role.id);
    deleteFetcher.submit(fd, { method: "post" });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              disabled={readOnly}
              className="h-7 w-7 rounded border border-line bg-paper p-0.5"
              aria-label="Color del rol"
            />
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={readOnly}
              className="h-9 max-w-[280px] text-[15px] font-medium"
            />
          </div>
          <div className="text-[11px] text-ink-3 font-mono">
            {readOnly
              ? "Rol del sistema · no editable"
              : `${perms.size} de ${PERMISSION_GROUPS.reduce(
                  (acc, g) => acc + g.permissions.length,
                  0,
                )} permisos asignados`}
          </div>
        </div>
        <div className="flex gap-2">
          {!readOnly && role.isDeletable ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={remove}
              disabled={deleteFetcher.state !== "idle"}
            >
              <Icon name="x" size={13} />
              Eliminar
            </Button>
          ) : null}
          <Button
            variant="clay"
            size="sm"
            onClick={save}
            disabled={readOnly || fetcher.state !== "idle"}
          >
            <Icon name="check" size={13} />
            Guardar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {fetcher.data?.error ? (
          <div className="mb-4 rounded-md border border-line bg-paper-2 p-2.5 text-[12px] text-wine">
            {fetcher.data.error}
          </div>
        ) : null}
        {fetcher.data?.ok && fetcher.state === "idle" ? (
          <div className="mb-4 rounded-md border border-line bg-paper-2 p-2.5 text-[12px] text-moss-deep">
            {fetcher.data.message ?? "Guardado"}
          </div>
        ) : null}

        <div className="grid gap-5 md:grid-cols-2">
          {PERMISSION_GROUPS.map((group) => (
            <div key={group.key} className="rounded-md border border-line bg-paper-2 p-3">
              <div className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3 mb-2">
                {group.label}
              </div>
              <ul className="flex flex-col gap-1.5">
                {group.permissions.map((p) => {
                  const on = perms.has(p.key);
                  return (
                    <li key={p.key}>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(p.key)}
                          disabled={readOnly}
                          className="mt-0.5"
                        />
                        <span className="flex-1 min-w-0">
                          <span className="block text-[13px] text-ink">
                            {p.label}
                          </span>
                          {p.hint ? (
                            <span className="block text-[11px] text-ink-3">
                              {p.hint}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
