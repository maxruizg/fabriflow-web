import { useEffect, useMemo, useState } from "react";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useFetcher, useLoaderData } from "@remix-run/react";

import { requireUser, getFullSession } from "~/lib/session.server";
import {
  changeUserRole,
  fetchRoles,
  fetchUserOverrides,
  updateUserOverrides,
  type PermissionOverride,
  type RoleBackend,
} from "~/lib/procurement-api.server";
import { apiRequest } from "~/lib/api.server";
import { PERMISSION_GROUPS } from "~/lib/permission-catalog";

import { AuthLayout } from "~/components/layout/auth-layout";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Icon } from "~/components/ui/icon";
import { cn } from "~/lib/utils";

export const meta: MetaFunction = () => [{ title: "Usuario — FabriFlow" }];

export const handle = {
  crumb: ["Configuración", "Usuarios", "Detalle"],
  cta: null,
};

interface MemberRow {
  id: string;
  email: string;
  name?: string;
  roleId?: string;
  roleName?: string;
}

interface LoaderData {
  member: MemberRow | null;
  roles: RoleBackend[];
  overrides: PermissionOverride[];
  error: string | null;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireUser(request);
  const session = await getFullSession(request);
  if (!session?.accessToken || !session.user.company) {
    throw redirect("/login");
  }
  const id = params.id;
  if (!id) throw redirect("/settings/roles");

  const token = session.accessToken;
  const companyId = session.user.company;

  // Fetch the user record (admin endpoint), the company's roles, and the
  // user's existing overrides — three independent calls.
  const [memberRaw, roles, overrides] = await Promise.all([
    apiRequest<MemberRow>(`/api/users/${encodeURIComponent(id)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Company-Id": companyId,
      },
    }, token).catch((e: unknown) => {
      console.warn("[settings/users/:id] fetch user failed:", e);
      return null;
    }),
    fetchRoles(token, companyId).catch((e: unknown) => {
      console.warn("[settings/users/:id] fetchRoles failed:", e);
      return [] as RoleBackend[];
    }),
    fetchUserOverrides(token, companyId, id).catch((e: unknown) => {
      console.warn("[settings/users/:id] fetchUserOverrides failed:", e);
      return [] as PermissionOverride[];
    }),
  ]);

  return json<LoaderData>({
    member: memberRaw,
    roles,
    overrides,
    error: memberRaw ? null : "No se pudo cargar el usuario",
  });
}

interface ActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

export async function action({ request, params }: ActionFunctionArgs) {
  await requireUser(request);
  const session = await getFullSession(request);
  if (!session?.accessToken || !session.user.company) {
    return json<ActionResult>({ ok: false, error: "Sesión inválida" }, { status: 401 });
  }
  const userId = params.id;
  if (!userId) return json<ActionResult>({ ok: false, error: "Id obligatorio" }, { status: 400 });

  const token = session.accessToken;
  const companyId = session.user.company;
  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  try {
    if (intent === "change-role") {
      const roleId = String(fd.get("roleId") ?? "");
      if (!roleId) return json<ActionResult>({ ok: false, error: "Rol obligatorio" }, { status: 400 });
      await changeUserRole(token, companyId, userId, roleId);
      return json<ActionResult>({ ok: true, message: "Rol actualizado" });
    }
    if (intent === "save-overrides") {
      const raw = String(fd.get("overrides") ?? "[]");
      const parsed = JSON.parse(raw) as { permission: string; granted: boolean }[];
      await updateUserOverrides(token, companyId, userId, { overrides: parsed });
      return json<ActionResult>({ ok: true, message: "Overrides guardados" });
    }
    return json<ActionResult>({ ok: false, error: "Intent no reconocido" }, { status: 400 });
  } catch (e) {
    return json<ActionResult>(
      { ok: false, error: e instanceof Error ? e.message : "Error inesperado" },
      { status: 400 },
    );
  }
}

type OverrideState = "inherit" | "allow" | "deny";

export default function UserPermissionsPage() {
  const { member, roles, overrides, error } = useLoaderData<typeof loader>();
  const roleFetcher = useFetcher<ActionResult>();
  const overrideFetcher = useFetcher<ActionResult>();

  const [roleId, setRoleId] = useState(member?.roleId ?? "");
  useEffect(() => {
    setRoleId(member?.roleId ?? "");
  }, [member?.roleId]);

  const overrideMap = useMemo(() => {
    const m = new Map<string, OverrideState>();
    for (const o of overrides) {
      m.set(o.permission, o.granted ? "allow" : "deny");
    }
    return m;
  }, [overrides]);

  const [state, setState] = useState<Map<string, OverrideState>>(overrideMap);
  useEffect(() => setState(overrideMap), [overrideMap]);

  const setOverride = (key: string, next: OverrideState) => {
    setState((prev) => {
      const m = new Map(prev);
      if (next === "inherit") m.delete(key);
      else m.set(key, next);
      return m;
    });
  };

  const saveRole = () => {
    const fd = new FormData();
    fd.set("intent", "change-role");
    fd.set("roleId", roleId);
    roleFetcher.submit(fd, { method: "post" });
  };

  const saveOverrides = () => {
    const payload = Array.from(state.entries()).map(([permission, s]) => ({
      permission,
      granted: s === "allow",
    }));
    const fd = new FormData();
    fd.set("intent", "save-overrides");
    fd.set("overrides", JSON.stringify(payload));
    overrideFetcher.submit(fd, { method: "post" });
  };

  if (!member) {
    return (
      <AuthLayout>
        <div className="rounded-md border border-line bg-paper-2 p-4 text-[13px]">
          {error ?? "Usuario no encontrado"}
        </div>
      </AuthLayout>
    );
  }

  const selectedRole = roles.find((r) => r.id === roleId);
  const canAssignRoles = roles.filter((r) => !r.isSystemRole);

  return (
    <AuthLayout>
      <div className="space-y-5 max-w-[960px]">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="ff-page-title">{member.name || member.email}</h1>
            <p className="ff-page-sub font-mono text-[12px]">{member.email}</p>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/settings/roles">
              <Icon name="chevl" size={13} />
              Volver a roles
            </Link>
          </Button>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-[13px] uppercase tracking-wider text-ink-3 font-mono">
              Rol asignado
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="h-9 rounded-md border border-line bg-paper px-3 text-[13px] min-w-[240px]"
            >
              {canAssignRoles.length === 0 ? (
                <option value="" disabled>
                  No hay roles personalizados
                </option>
              ) : null}
              {canAssignRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <Button
              variant="clay"
              size="sm"
              onClick={saveRole}
              disabled={!roleId || roleId === member.roleId || roleFetcher.state !== "idle"}
            >
              <Icon name="check" size={13} />
              Guardar rol
            </Button>
            {selectedRole ? (
              <span className="text-[11px] text-ink-3 font-mono">
                {selectedRole.permissions.length} permisos heredados del rol
              </span>
            ) : null}
            {roleFetcher.data?.message ? (
              <span className="text-[12px] text-moss-deep">{roleFetcher.data.message}</span>
            ) : null}
            {roleFetcher.data?.error ? (
              <span className="text-[12px] text-wine">{roleFetcher.data.error}</span>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-[13px] uppercase tracking-wider text-ink-3 font-mono">
                Permisos individuales
              </CardTitle>
              <p className="text-[11px] text-ink-3 mt-1">
                Sobreescriben el rol para este usuario en particular. Inherit = hereda
                del rol; Permitir/Denegar fija el resultado independientemente del rol.
              </p>
            </div>
            <Button
              variant="clay"
              size="sm"
              onClick={saveOverrides}
              disabled={overrideFetcher.state !== "idle"}
            >
              <Icon name="check" size={13} />
              Guardar
            </Button>
          </CardHeader>
          <CardContent>
            {overrideFetcher.data?.message ? (
              <div className="mb-4 rounded-md border border-line bg-paper-2 p-2.5 text-[12px] text-moss-deep">
                {overrideFetcher.data.message}
              </div>
            ) : null}
            {overrideFetcher.data?.error ? (
              <div className="mb-4 rounded-md border border-line bg-paper-2 p-2.5 text-[12px] text-wine">
                {overrideFetcher.data.error}
              </div>
            ) : null}

            <div className="grid gap-5 md:grid-cols-2">
              {PERMISSION_GROUPS.map((group) => (
                <div key={group.key} className="rounded-md border border-line bg-paper-2 p-3">
                  <div className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3 mb-2">
                    {group.label}
                  </div>
                  <ul className="flex flex-col gap-2">
                    {group.permissions.map((p) => {
                      const inheritedFromRole =
                        selectedRole?.permissions.includes(p.key) ?? false;
                      const cur = state.get(p.key) ?? "inherit";
                      return (
                        <li key={p.key} className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] text-ink">{p.label}</div>
                            <div className="text-[11px] text-ink-3 font-mono">
                              {inheritedFromRole ? "rol: ✓" : "rol: ✗"}
                              {cur !== "inherit" ? ` · override: ${cur}` : ""}
                            </div>
                          </div>
                          <TriToggle
                            value={cur}
                            onChange={(next) => setOverride(p.key, next)}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AuthLayout>
  );
}

function TriToggle({
  value,
  onChange,
}: {
  value: OverrideState;
  onChange: (next: OverrideState) => void;
}) {
  const opts: { v: OverrideState; label: string; tone: string }[] = [
    { v: "deny", label: "Denegar", tone: "wine" },
    { v: "inherit", label: "Heredar", tone: "ink" },
    { v: "allow", label: "Permitir", tone: "moss" },
  ];
  return (
    <div className="inline-flex rounded-md border border-line bg-paper overflow-hidden text-[11px] font-medium">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={cn(
            "px-2.5 py-1 transition-colors",
            value === o.v
              ? o.v === "allow"
                ? "bg-moss-soft text-moss-deep"
                : o.v === "deny"
                  ? "bg-wine-soft text-wine-deep"
                  : "bg-paper-3 text-ink"
              : "text-ink-3 hover:bg-paper-2",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
