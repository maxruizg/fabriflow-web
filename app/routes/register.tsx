import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/cloudflare";

// Type for action response
type ActionData = {
  errors?: {
    [K in keyof RegisterFormData]?: string[];
  };
  values?: Record<string, string>;
  success?: string;
  error?: string;
};
import {
  Link,
  redirect,
  useFetcher,
  useNavigate,
  useLoaderData,
} from "@remix-run/react";
import { json } from "@remix-run/cloudflare";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterFormData } from "~/lib/validations/auth";
import { registerCompany } from "~/lib/auth.server";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Icon } from "~/components/ui/icon";
import { ThemeToggle } from "~/components/ui/theme-toggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { CSFUploader } from "~/components/csf-uploader";
import type { CSFData } from "~/lib/csf-reader";
import { cn } from "~/lib/utils";

export const meta: MetaFunction = () => {
  return [
    { title: "Registrarse — FabriFlow" },
    {
      name: "description",
      content: "Crear cuenta en la plataforma de gestión industrial",
    },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { getUserFromSession } = await import("~/lib/session.server");
  const user = await getUserFromSession(request);
  if (user) {
    throw redirect("/dashboard");
  }

  const { fetchCompanies } = await import("~/lib/api.server");
  try {
    const companies = await fetchCompanies();
    return json({ companies, serverError: null });
  } catch (error) {
    console.error("Failed to fetch companies:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "No se pudo conectar al servidor. Por favor intente más tarde.";
    return json({ companies: [], serverError: errorMessage });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const data = Object.fromEntries(formData);

  const validationResult = registerSchema.safeParse(data);

  if (!validationResult.success) {
    return json({
      errors: validationResult.error.flatten().fieldErrors,
      values: data,
    });
  }

  try {
    const {
      companyType,
      providerType,
      company,
      providerCompany,
      vendorLegalName,
      companyEmail,
      name,
      lastname,
      email,
      rfc,
      phone,
      password,
    } = validationResult.data;

    if (companyType === "provider") {
      const { registerVendor } = await import("~/lib/auth.server");

      const vendorData = {
        company: company,
        email: email,
        password: password,
        vendor_rfc: rfc,
        vendor_company_type: providerType as "legal" | "personal",
        vendor_legal_name:
          providerType === "legal"
            ? vendorLegalName || ""
            : providerCompany || "",
        contact_name: providerType === "legal" ? name : undefined,
        contact_lastname: providerType === "legal" ? lastname : undefined,
        clients: [company],
      };

      const vendorResult = await registerVendor(vendorData);

      if (!vendorResult.success) {
        return json({
          error: vendorResult.message || "Error al registrar proveedor",
        });
      }
    } else {
      const companyData = {
        company: company,
        rfc: rfc,
        phone: phone,
        name: name ?? "",
        lastname: lastname ?? "",
        email: email,
        companyEmail: companyEmail,
        password: password,
      };

      const companyResult = await registerCompany(companyData);

      if (!companyResult.success) {
        return json({
          error: companyResult.message || "Error al registrar empresa",
        });
      }
    }

    let companyName = company;
    if (companyType === "provider") {
      try {
        const { fetchCompanies } = await import("~/lib/api.server");
        const companies = await fetchCompanies();
        const selectedCompany = companies.find(
          (c: { id: string; name: string }) => c.id === company,
        );
        if (selectedCompany) {
          companyName = selectedCompany.name;
        }
      } catch {
        // Use ID if we can't fetch the name
      }
    }

    const successMessage =
      companyType === "provider"
        ? `Registro de ${
            providerType === "personal"
              ? "proveedor individual"
              : "empresa proveedora"
          } exitoso. Tu solicitud será enviada a ${companyName} para aprobación.`
        : "¡Registro exitoso! Tu cuenta está pendiente de autorización. En breve recibirás un correo con la confirmación.";

    return json({
      success: successMessage,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Error del servidor. Por favor intente más tarde.";
    return json({
      error: errorMessage,
    });
  }
}

export default function Register() {
  const loaderData = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [countdown, setCountdown] = useState(10);
  const [autoFillApplied, setAutoFillApplied] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isValidating] = useState(false);
  const [csfExtracted, setCsfExtracted] = useState(false);
  const [stepValidationAttempted, setStepValidationAttempted] = useState<
    Record<number, boolean>
  >({});
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const companies = loaderData?.companies || [];

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    trigger,
    setValue,
    setError,
    clearErrors,
    getValues,
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    mode: "onChange",
    defaultValues: fetcher.data?.values || { companyType: "company" },
    shouldUnregister: false,
  });

  const currentCompanyType = watch("companyType") || "company";
  const currentProviderType = watch("providerType");
  const providerCompanyName = watch("providerCompany");
  const watchedRfc = watch("rfc");
  const watchedCompanyEmail = watch("companyEmail");
  const watchedCompany = watch("company");

  const isSubmitting = fetcher.state === "submitting";

  const totalSteps = 2;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.error) {
      setServerError(fetcher.data.error);
    }
  }, [fetcher.state, fetcher.data]);

  useEffect(() => {
    if (serverError) {
      setServerError(null);
    }
    if (validationErrors.length > 0) {
      setValidationErrors([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedRfc, watchedCompanyEmail, watchedCompany]);

  useEffect(() => {
    if (fetcher.data?.success) {
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            navigate("/login");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [fetcher.data?.success, navigate]);

  useEffect(() => {
    if (
      currentCompanyType === "provider" &&
      currentProviderType === "personal" &&
      providerCompanyName &&
      !autoFillApplied
    ) {
      const nameParts = providerCompanyName.trim().split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      setValue("name", firstName, { shouldValidate: true });
      setValue("lastname", lastName, { shouldValidate: true });

      setAutoFillApplied(true);
    }

    if (
      currentCompanyType !== "provider" ||
      currentProviderType !== "personal"
    ) {
      setAutoFillApplied(false);
    }
  }, [
    currentCompanyType,
    currentProviderType,
    providerCompanyName,
    setValue,
    autoFillApplied,
  ]);

  const handleCSFDataExtracted = (data: CSFData) => {
    console.log("📄 CSF Data extracted:", data);
    if (data.rfc) {
      setValue("rfc", data.rfc.toUpperCase(), { shouldValidate: true, shouldDirty: true, shouldTouch: true });
      console.log("✅ RFC set to:", data.rfc.toUpperCase());
    }

    if (data.nombre) {
      if (currentProviderType === "personal") {
        setValue("providerCompany", data.nombre, { shouldValidate: true, shouldDirty: true, shouldTouch: true });
        console.log("✅ Provider name set to:", data.nombre);
      } else if (currentProviderType === "legal") {
        setValue("vendorLegalName", data.nombre, { shouldValidate: true, shouldDirty: true, shouldTouch: true });
        console.log("✅ Vendor legal name set to:", data.nombre);
      }
    }

    setCsfExtracted(true);
    console.log("📋 Form values after CSF:", getValues());
  };

  const validateCurrentStep = async () => {
    let fieldsToValidate: (keyof RegisterFormData)[] = [];

    switch (currentStep) {
      case 1:
        if (currentCompanyType === "provider") {
          if (!currentProviderType) {
            setError("providerType", {
              type: "manual",
              message: "Por favor selecciona si eres empresa o persona física",
            });
            return false;
          }

          if (currentProviderType === "personal") {
            fieldsToValidate = [
              "companyType",
              "providerType",
              "email",
              "password",
              "confirmPassword",
            ];
          } else {
            fieldsToValidate = [
              "companyType",
              "providerType",
              "name",
              "lastname",
              "email",
              "password",
              "confirmPassword",
            ];
          }
        } else {
          fieldsToValidate = [
            "companyType",
            "name",
            "lastname",
            "email",
            "password",
            "confirmPassword",
          ];
        }
        break;
      case 2:
        if (currentCompanyType === "provider") {
          if (currentProviderType === "legal") {
            fieldsToValidate = [
              "providerCompany",
              "vendorLegalName",
              "company",
              "rfc",
              "phone",
            ];
          } else {
            fieldsToValidate = ["providerCompany", "company", "rfc", "phone"];
          }
        } else {
          fieldsToValidate = ["company", "companyEmail", "rfc", "phone"];
        }
        break;
      case 3:
        fieldsToValidate = ["password", "confirmPassword"];
        break;
    }

    const result = await trigger(fieldsToValidate);
    return result;
  };

  const nextStep = async () => {
    setStepValidationAttempted((prev) => ({ ...prev, [currentStep]: true }));

    const isStepValid = await validateCurrentStep();
    if (isStepValid) {
      clearErrors();
      setValidationErrors([]);
      const newStep = Math.min(currentStep + 1, totalSteps);
      console.log(`➡️ Moving to step ${newStep}`);
      console.log("📋 Form values before step change:", getValues());
      setCurrentStep(newStep);
    }
  };

  const prevStep = () => {
    clearErrors();
    setValidationErrors([]);
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const onSubmit = (data: RegisterFormData) => {
    console.log("✅ Form submitted with data:", data);
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      formData.append(key, value);
    });

    fetcher.submit(formData, { method: "post" });
  };

  const onError = (errs: unknown) => {
    console.log("Form validation errors:", errs);
    console.log("📝 Current form values:", watch());

    const errorMessages: string[] = [];
    Object.entries(errs as Record<string, { message?: string }>).forEach(
      ([field, error]) => {
        console.log(`❌ Field "${field}":`, error?.message || error);
        if (error?.message) {
          errorMessages.push(`${field}: ${error.message}`);
        }
      },
    );
    console.log("📋 Total validation errors:", errorMessages);
    setValidationErrors(errorMessages);

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const getFieldStep = (field: keyof RegisterFormData): number => {
    const step1Fields: (keyof RegisterFormData)[] = [
      "companyType",
      "providerType",
      "name",
      "lastname",
      "email",
      "password",
      "confirmPassword",
    ];
    const step2Fields: (keyof RegisterFormData)[] = [
      "company",
      "providerCompany",
      "vendorLegalName",
      "companyEmail",
      "rfc",
      "phone",
    ];

    if (step1Fields.includes(field)) return 1;
    if (step2Fields.includes(field)) return 2;
    return 3;
  };

  const getFieldError = (field: keyof RegisterFormData) => {
    const fieldStep = getFieldStep(field);
    if (!stepValidationAttempted[fieldStep] && currentStep !== 3) {
      return undefined;
    }
    return errors[field]?.message || fetcher.data?.errors?.[field]?.[0];
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-background">
      {/* Hero panel — desktop only */}
      <aside className="hidden lg:flex relative flex-col justify-between bg-paper-2 border-r border-line p-12 overflow-hidden">
        <BrandMark />
        <HeroCopy />
        <DotPattern />
      </aside>

      {/* Form column */}
      <main className="relative flex min-h-screen items-start justify-center p-6 lg:p-12 overflow-y-auto">
        <div className="absolute top-4 right-4 z-10">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-[480px] pt-8 pb-12">
          {/* Mobile-only brand */}
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <span className="relative grid h-10 w-10 place-items-center rounded-lg bg-ink text-paper font-display text-[20px] font-semibold italic">
              F
              <span
                aria-hidden="true"
                className="absolute inset-1 rounded-[5px] border border-clay"
              />
            </span>
            <span className="font-display text-[22px] font-semibold tracking-tight">
              Fabri<em className="not-italic font-medium text-clay">Flow</em>
            </span>
          </div>

          <h1 className="ff-page-title">
            Crea tu <em>operación</em>
          </h1>
          <p className="ff-page-sub mb-6">
            Regístrate como empresa o proveedor. El proceso toma menos de 2
            minutos.
          </p>

          {/* Step indicator — horizontal pill row */}
          <StepIndicator
            currentStep={currentStep}
            totalSteps={totalSteps}
            companyType={currentCompanyType}
            providerType={currentProviderType}
          />

          {/* Server connection error */}
          {loaderData?.serverError && (
            <Alert className="bg-wine-soft border-wine/20 mb-5">
              <Icon name="warn" size={14} className="text-wine" />
              <AlertDescription className="text-[12px] text-wine">
                {loaderData.serverError}
              </AlertDescription>
            </Alert>
          )}

          {/* Success state */}
          {fetcher.data?.success ? (
            <div className="space-y-5 mt-6">
              <Alert className="bg-moss-soft border-moss/20">
                <Icon name="check" size={14} className="text-moss-deep" />
                <AlertDescription className="text-[12px] text-moss-deep">
                  {fetcher.data.success}
                </AlertDescription>
              </Alert>
              <p className="text-center text-[13px] text-ink-3">
                Serás redirigido al inicio de sesión en{" "}
                <strong className="text-ink">{countdown}</strong> segundos…
              </p>
              <Link to="/login">
                <Button variant="clay" className="w-full h-11">
                  Ir al inicio de sesión ahora
                </Button>
              </Link>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit(onSubmit, onError)}
              className="mt-6 space-y-5"
            >
              {/* ── STEP 1: Account / access data ── */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  {/* Info callout */}
                  <div className="flex gap-2.5 rounded-lg border border-line bg-paper-2 p-3.5">
                    <Icon
                      name="vendors"
                      size={14}
                      className="mt-0.5 flex-shrink-0 text-clay"
                    />
                    <p className="text-[12px] text-ink-2 leading-relaxed">
                      {currentCompanyType === "provider" ? (
                        <>
                          Esta información será tu cuenta de acceso.{" "}
                          <strong>Iniciarás sesión con tu RFC y contraseña.</strong>
                        </>
                      ) : (
                        <>
                          El correo electrónico será tu usuario para iniciar
                          sesión.
                        </>
                      )}
                    </p>
                  </div>

                  {/* Registration type selector */}
                  <div className="space-y-1.5">
                    <Label className="text-[12px] font-medium uppercase tracking-wider text-ink-3">
                      Tipo de registro *
                    </Label>
                    <div
                      role="radiogroup"
                      aria-label="Tipo de registro"
                      className="grid grid-cols-2 gap-1.5 rounded-lg border border-line p-1 bg-paper"
                    >
                      <TypeTab
                        active={currentCompanyType === "company"}
                        onClick={() => {
                          setValue("companyType", "company", {
                            shouldValidate: true,
                          });
                          setValue("company", "");
                          setValue("providerCompany", "");
                          setValue("companyEmail", "");
                          setValue("rfc", "");
                          setCsfExtracted(false);
                        }}
                        icon="vendors"
                        label="Empresa"
                        hint="Comprador"
                      />
                      <TypeTab
                        active={currentCompanyType === "provider"}
                        onClick={() => {
                          setValue("companyType", "provider", {
                            shouldValidate: true,
                          });
                          setValue("company", "");
                          setValue("providerCompany", "");
                          setValue("companyEmail", "");
                          setValue("rfc", "");
                          setCsfExtracted(false);
                        }}
                        icon="orders"
                        label="Proveedor"
                        hint="Vendedor"
                      />
                    </div>
                    {getFieldError("companyType") && (
                      <p className="text-[11px] text-wine">
                        {getFieldError("companyType")}
                      </p>
                    )}
                  </div>

                  {/* Provider sub-type */}
                  {currentCompanyType === "provider" && (
                    <div className="space-y-1.5">
                      <Label className="text-[12px] font-medium uppercase tracking-wider text-ink-3">
                        Tipo de proveedor *
                      </Label>
                      <div
                        role="radiogroup"
                        aria-label="Tipo de proveedor"
                        className="grid grid-cols-2 gap-1.5 rounded-lg border border-line p-1 bg-paper"
                      >
                        <TypeTab
                          active={currentProviderType === "legal"}
                          onClick={() => {
                            setValue("providerType", "legal", {
                              shouldValidate: true,
                            });
                            setValue("providerCompany", "");
                            setValue("vendorLegalName", "");
                            setValue("rfc", "");
                            setAutoFillApplied(false);
                            setCsfExtracted(false);
                          }}
                          icon="docs"
                          label="Empresa"
                          hint="Persona moral"
                        />
                        <TypeTab
                          active={currentProviderType === "personal"}
                          onClick={() => {
                            setValue("providerType", "personal", {
                              shouldValidate: true,
                            });
                            setValue("providerCompany", "");
                            setValue("rfc", "");
                            setAutoFillApplied(false);
                            setCsfExtracted(false);
                          }}
                          icon="vendors"
                          label="Persona"
                          hint="Física"
                        />
                      </div>
                      {getFieldError("providerType") && (
                        <p className="text-[11px] text-wine">
                          {getFieldError("providerType")}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Name + Last name — company or legal provider */}
                  {(currentCompanyType === "company" ||
                    (currentCompanyType === "provider" &&
                      currentProviderType === "legal")) && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="name"
                          className="text-[12px] font-medium uppercase tracking-wider text-ink-3"
                        >
                          Nombre *
                        </Label>
                        <Input
                          id="name"
                          {...register("name")}
                          type="text"
                          placeholder="Tu nombre"
                          className="h-10 text-sm"
                        />
                        {getFieldError("name") && (
                          <p className="text-[11px] text-wine">
                            {getFieldError("name")}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="lastname"
                          className="text-[12px] font-medium uppercase tracking-wider text-ink-3"
                        >
                          Apellido *
                        </Label>
                        <Input
                          id="lastname"
                          {...register("lastname")}
                          type="text"
                          placeholder="Tu apellido"
                          className="h-10 text-sm"
                        />
                        {getFieldError("lastname") && (
                          <p className="text-[11px] text-wine">
                            {getFieldError("lastname")}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Email */}
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="email"
                      className="text-[12px] font-medium uppercase tracking-wider text-ink-3"
                    >
                      Correo electrónico *{" "}
                      {currentCompanyType === "company" && (
                        <span className="normal-case text-ink-3 font-normal">
                          (será tu usuario)
                        </span>
                      )}
                    </Label>
                    <Input
                      id="email"
                      {...register("email")}
                      type="email"
                      placeholder="tu@correo.com"
                      className="h-10 text-sm"
                    />
                    {getFieldError("email") && (
                      <p className="text-[11px] text-wine">
                        {getFieldError("email")}
                      </p>
                    )}
                  </div>

                  {/* Password row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="password"
                        className="text-[12px] font-medium uppercase tracking-wider text-ink-3"
                      >
                        Contraseña *
                      </Label>
                      <div className="relative">
                        <Input
                          id="password"
                          {...register("password")}
                          type={showPassword ? "text" : "password"}
                          placeholder="Mín. 8 chars"
                          className="h-10 text-sm pr-9"
                        />
                        <button
                          type="button"
                          aria-label={
                            showPassword
                              ? "Ocultar contraseña"
                              : "Mostrar contraseña"
                          }
                          className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-ink-3 hover:text-ink"
                          onClick={() => setShowPassword((s) => !s)}
                        >
                          <Icon name="eye" size={14} />
                        </button>
                      </div>
                      {getFieldError("password") && (
                        <p className="text-[11px] text-wine">
                          {getFieldError("password")}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="confirmPassword"
                        className="text-[12px] font-medium uppercase tracking-wider text-ink-3"
                      >
                        Confirmar *
                      </Label>
                      <div className="relative">
                        <Input
                          id="confirmPassword"
                          {...register("confirmPassword")}
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder="Repite"
                          className="h-10 text-sm pr-9"
                        />
                        <button
                          type="button"
                          aria-label={
                            showConfirmPassword
                              ? "Ocultar contraseña"
                              : "Mostrar contraseña"
                          }
                          className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-ink-3 hover:text-ink"
                          onClick={() => setShowConfirmPassword((s) => !s)}
                        >
                          <Icon name="eye" size={14} />
                        </button>
                      </div>
                      {getFieldError("confirmPassword") && (
                        <p className="text-[11px] text-wine">
                          {getFieldError("confirmPassword")}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── STEP 2: Company / fiscal data ── */}
              {currentStep === 2 && (
                <div className="space-y-4">
                  {/* CSF uploader for providers */}
                  {currentCompanyType === "provider" && (
                    <div className="space-y-3">
                      <p className="text-[12px] text-ink-3">
                        Sube tu Constancia de Situación Fiscal para llenar
                        automáticamente tus datos fiscales.
                      </p>
                      <CSFUploader
                        onDataExtracted={handleCSFDataExtracted}
                        onError={(error) =>
                          console.error("CSF Error:", error)
                        }
                      />
                      <div className="relative my-1">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t border-line" />
                        </div>
                        <div className="relative flex justify-center">
                          <span className="bg-background px-2 text-[11px] font-mono uppercase tracking-wider text-ink-3">
                            O llena manualmente
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Personal provider name */}
                  {currentCompanyType === "provider" &&
                    currentProviderType === "personal" && (
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="providerCompany"
                          className="text-[12px] font-medium uppercase tracking-wider text-ink-3"
                        >
                          Tu nombre completo (como en CSF) *
                        </Label>
                        <Input
                          id="providerCompany"
                          {...register("providerCompany", {
                            onChange: (e) => {
                              console.log("👤 Provider name input changed:", e.target.value);
                              console.log("📋 Form values after name input:", getValues());
                            }
                          })}
                          type="text"
                          placeholder="Nombre completo como aparece en tu Constancia"
                          className="h-10 text-sm"
                        />
                        {getFieldError("providerCompany") && (
                          <p className="text-[11px] text-wine">
                            {getFieldError("providerCompany")}
                          </p>
                        )}
                      </div>
                    )}

                  {/* Legal provider fields */}
                  {currentCompanyType === "provider" &&
                    currentProviderType === "legal" && (
                      <>
                        <div className="space-y-1.5">
                          <Label
                            htmlFor="providerCompany"
                            className="text-[12px] font-medium uppercase tracking-wider text-ink-3"
                          >
                            Nombre de tu empresa *
                          </Label>
                          <Input
                            id="providerCompany"
                            {...register("providerCompany")}
                            type="text"
                            placeholder="Nombre de tu empresa proveedora"
                            className="h-10 text-sm"
                          />
                          {getFieldError("providerCompany") && (
                            <p className="text-[11px] text-wine">
                              {getFieldError("providerCompany")}
                            </p>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <Label
                            htmlFor="vendorLegalName"
                            className="text-[12px] font-medium uppercase tracking-wider text-ink-3"
                          >
                            Razón social *
                          </Label>
                          <Input
                            id="vendorLegalName"
                            {...register("vendorLegalName")}
                            type="text"
                            placeholder="Razón social completa"
                            className="h-10 text-sm"
                          />
                          {getFieldError("vendorLegalName") && (
                            <p className="text-[11px] text-wine">
                              {getFieldError("vendorLegalName")}
                            </p>
                          )}
                        </div>
                      </>
                    )}

                  {/* Client company selector for providers */}
                  {currentCompanyType === "provider" && (
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="company-select"
                        className="text-[12px] font-medium uppercase tracking-wider text-ink-3"
                      >
                        Empresa cliente *
                      </Label>
                      <Select
                        onValueChange={(value) => {
                          console.log("🏢 Company selected:", value);
                          setValue("company", value, { shouldValidate: true, shouldDirty: true, shouldTouch: true });
                          console.log("📋 Form values after company select:", getValues());
                        }}
                        value={watch("company") || ""}
                      >
                        <SelectTrigger id="company-select" className="h-10 text-sm">
                          <SelectValue placeholder="Selecciona la empresa cliente" />
                        </SelectTrigger>
                        <SelectContent>
                          {companies.length > 0 ? (
                            companies.filter((co): co is NonNullable<typeof co> => co !== null).map(
                              (co) => (
                                <SelectItem
                                  key={co.id}
                                  value={co.id}
                                >
                                  {co.name}
                                </SelectItem>
                              ),
                            )
                          ) : (
                            <div className="p-2 text-[12px] text-ink-3">
                              No hay empresas cliente disponibles
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                      {getFieldError("company") && (
                        <p className="text-[11px] text-wine">
                          {getFieldError("company")}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Company-type-only fields */}
                  {currentCompanyType === "company" && (
                    <>
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="company"
                          className="text-[12px] font-medium uppercase tracking-wider text-ink-3"
                        >
                          Nombre de la empresa *
                        </Label>
                        <Input
                          id="company"
                          {...register("company")}
                          type="text"
                          placeholder="Nombre de su empresa"
                          className="h-10 text-sm"
                        />
                        {getFieldError("company") && (
                          <p className="text-[11px] text-wine">
                            {getFieldError("company")}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="companyEmail"
                          className="text-[12px] font-medium uppercase tracking-wider text-ink-3"
                        >
                          Correo de la empresa *{" "}
                          <span className="normal-case font-normal text-ink-3">
                            (para contacto)
                          </span>
                        </Label>
                        <Input
                          id="companyEmail"
                          {...register("companyEmail")}
                          type="email"
                          placeholder="contacto@empresa.com"
                          className="h-10 text-sm"
                        />
                        {getFieldError("companyEmail") && (
                          <p className="text-[11px] text-wine">
                            {getFieldError("companyEmail")}
                          </p>
                        )}
                      </div>
                    </>
                  )}

                  {/* RFC + Phone */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="rfc"
                        className="text-[12px] font-medium uppercase tracking-wider text-ink-3"
                      >
                        RFC *{" "}
                        {csfExtracted && (
                          <span className="normal-case font-normal text-moss-deep">
                            (de CSF)
                          </span>
                        )}
                      </Label>
                      <Input
                        id="rfc"
                        {...register("rfc", {
                          onChange: (e) => {
                            console.log("🆔 RFC input changed:", e.target.value);
                            console.log("📋 Form values after RFC input:", getValues());
                          }
                        })}
                        type="text"
                        placeholder="ABC123456XYZ"
                        className={cn(
                          "h-10 text-sm font-mono uppercase",
                          csfExtracted && "bg-paper-2 cursor-not-allowed",
                        )}
                        maxLength={13}
                        style={{ textTransform: "uppercase" }}
                        readOnly={csfExtracted}
                      />
                      {getFieldError("rfc") && (
                        <p className="text-[11px] text-wine">
                          {getFieldError("rfc")}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="phone"
                        className="text-[12px] font-medium uppercase tracking-wider text-ink-3"
                      >
                        Teléfono *
                      </Label>
                      <Input
                        id="phone"
                        {...register("phone", {
                          onChange: (e) => {
                            console.log("📞 Phone input changed:", e.target.value);
                            console.log("📋 Form values after phone input:", getValues());
                          }
                        })}
                        type="tel"
                        placeholder="5512345678"
                        className="h-10 text-sm"
                      />
                      {getFieldError("phone") && (
                        <p className="text-[11px] text-wine">
                          {getFieldError("phone")}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Errors */}
              {serverError && (
                <Alert className="bg-wine-soft border-wine/20">
                  <Icon name="warn" size={14} className="text-wine" />
                  <AlertDescription className="text-[12px] text-wine">
                    {serverError}
                  </AlertDescription>
                </Alert>
              )}

              {validationErrors.length > 0 && (
                  <Alert className="bg-wine-soft border-wine/20">
                    <Icon name="warn" size={14} className="text-wine" />
                    <AlertDescription className="text-[12px] text-wine">
                      <p className="font-medium mb-1">
                        Por favor corrige los siguientes errores:
                      </p>
                      <ul className="list-disc list-inside space-y-0.5">
                        {validationErrors.map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

              {/* Navigation buttons */}
              <div className="flex justify-between gap-3 pt-2">
                {currentStep > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={prevStep}
                    disabled={isSubmitting}
                    className="h-11"
                  >
                    <Icon name="chevl" size={14} className="mr-1" />
                    Anterior
                  </Button>
                )}

                <div className={cn("flex-1", currentStep === 1 && "ml-auto")}>
                  {currentStep < totalSteps ? (
                    <Button
                      type="button"
                      variant="clay"
                      className="w-full h-11"
                      onClick={nextStep}
                      disabled={isValidating}
                    >
                      {isValidating ? (
                        <>
                          <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          Validando…
                        </>
                      ) : (
                        <>
                          Siguiente
                          <Icon name="chev" size={14} className="ml-1" />
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      variant="clay"
                      className="w-full h-11"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          Creando cuenta…
                        </>
                      ) : (
                        "Crear cuenta"
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </form>
          )}

          <p className="mt-8 text-center text-[13px] text-ink-3">
            ¿Ya tienes una cuenta?{" "}
            <Link to="/login" className="font-medium text-clay hover:underline">
              Iniciar sesión
            </Link>
          </p>

          <p className="mt-8 text-center text-[11px] font-mono text-ink-4">
            © 2026 FabriFlow · Todos los derechos reservados
          </p>
        </div>
      </main>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  companyType: string;
  providerType?: string;
}

function StepIndicator({
  currentStep,
  totalSteps,
  companyType,
  providerType,
}: StepIndicatorProps) {
  const stepLabels = ["Tu cuenta", "Tu empresa"];

  // Compute display step for personal providers (step 1 → 1, step 3 → 2 in old logic — now just 2 steps)
  const displayStep =
    companyType === "provider" &&
    providerType === "personal" &&
    currentStep === 3
      ? 2
      : currentStep;

  return (
    <div className="flex items-center gap-2 mb-6" role="list" aria-label="Progreso del registro">
      {Array.from({ length: totalSteps }, (_, i) => {
        const step = i + 1;
        const isActive =
          companyType === "provider" && providerType === "personal"
            ? (currentStep === 1 && step === 1) ||
              (currentStep === 3 && step === 2) ||
              step < displayStep
            : step <= currentStep;
        const isCurrent =
          companyType === "provider" && providerType === "personal"
            ? (currentStep === 1 && step === 1) ||
              (currentStep === 3 && step === 2)
            : step === currentStep;

        return (
          <div key={step} className="flex items-center gap-2 flex-1" role="listitem">
            <div
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider transition-all duration-200 flex-1 justify-center",
                isCurrent
                  ? "bg-clay text-paper font-semibold"
                  : isActive
                    ? "bg-clay-soft text-clay-deep"
                    : "bg-paper-2 text-ink-3",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full flex-shrink-0",
                  isCurrent
                    ? "bg-paper"
                    : isActive
                      ? "bg-clay"
                      : "bg-ink-3",
                )}
              />
              {stepLabels[i]}
            </div>
            {step < totalSteps && (
              <Icon
                name="chev"
                size={12}
                className={cn(
                  "flex-shrink-0",
                  isActive ? "text-clay" : "text-ink-3",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface TypeTabProps {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentProps<typeof Icon>["name"];
  label: string;
  hint: string;
}

function TypeTab({ active, onClick, icon, label, hint }: TypeTabProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-1 rounded-md px-3 py-2.5 transition-colors text-left",
        active ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-2",
      )}
    >
      <span className="flex items-center gap-2 text-[13px] font-medium">
        <Icon name={icon} size={14} />
        {label}
      </span>
      <span
        className={cn(
          "text-[10.5px] font-mono uppercase tracking-wider",
          active ? "text-paper/70" : "text-ink-3",
        )}
      >
        ↳ {hint}
      </span>
    </button>
  );
}

function BrandMark() {
  return (
    <div className="relative flex items-center gap-3 z-10">
      <span className="relative grid h-12 w-12 place-items-center rounded-lg bg-ink text-paper font-display text-[24px] font-semibold italic">
        F
        <span
          aria-hidden="true"
          className="absolute inset-1.5 rounded-[6px] border border-clay"
        />
      </span>
      <span className="font-display text-[28px] font-semibold tracking-tight">
        Fabri<em className="not-italic font-medium text-clay">Flow</em>
      </span>
    </div>
  );
}

function HeroCopy() {
  return (
    <div className="relative z-10 max-w-[480px]">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3 mb-4">
        Operaciones · Facturas · Pagos
      </p>
      <h2 className="font-display text-[44px] leading-[1.05] font-medium tracking-tight">
        Crea tu
        <br />
        <em className="text-clay">operación.</em>
      </h2>
      <p className="mt-5 text-[14px] text-ink-2 leading-relaxed">
        Conecta tu empresa o regístrate como proveedor. Sigue cada orden de
        compra, concilia pagos y genera reportes listos para contabilidad.
      </p>
      <div className="mt-8 flex flex-wrap gap-2">
        {[
          { tone: "moss", text: "OTIF en tiempo real" },
          { tone: "clay", text: "FX automático" },
          { tone: "rust", text: "CFDI validado" },
          { tone: "ink", text: "AP aging" },
        ].map((c) => (
          <span
            key={c.text}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider",
              c.tone === "moss" && "bg-moss-soft text-moss-deep",
              c.tone === "clay" && "bg-clay-soft text-clay-deep",
              c.tone === "rust" && "bg-rust-soft text-rust-deep",
              c.tone === "ink" && "bg-paper-3 text-ink-2",
            )}
          >
            <span className="h-1 w-1 rounded-full bg-current" />
            {c.text}
          </span>
        ))}
      </div>
    </div>
  );
}

function DotPattern() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 opacity-[0.55]"
      style={{
        backgroundImage:
          "radial-gradient(oklch(0.88 0.012 70 / 0.6) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
        backgroundPosition: "-10px -10px",
        maskImage:
          "radial-gradient(ellipse at 75% 60%, transparent 30%, black 80%)",
        WebkitMaskImage:
          "radial-gradient(ellipse at 75% 60%, transparent 30%, black 80%)",
      }}
    />
  );
}
