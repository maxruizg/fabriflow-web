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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { ThemeToggle } from "../../components/ui/theme-toggle";
import {
  Loader2,
  Eye,
  EyeOff,
  AlertTriangle,
  Factory,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  Building2,
  User,
  Lock,
  Users,
  Truck,
  ServerCrash,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { CSFUploader } from "~/components/csf-uploader";
import type { CSFData } from "~/lib/csf-reader";

export const meta: MetaFunction = () => {
  return [
    { title: "Registrarse - FabriFlow" },
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

  // Fetch companies from API
  const { fetchCompanies } = await import("~/lib/api.server");
  try {
    const companies = await fetchCompanies();
    return json({ companies, serverError: null });
  } catch (error) {
    console.error("Failed to fetch companies:", error);
    const errorMessage = error instanceof Error
      ? error.message
      : "No se pudo conectar al servidor. Por favor intente más tarde.";
    return json({ companies: [], serverError: errorMessage });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const data = Object.fromEntries(formData);

  // Server-side validation using Zod
  const validationResult = registerSchema.safeParse(data);

  if (!validationResult.success) {
    return json({
      errors: validationResult.error.flatten().fieldErrors,
      values: data,
    });
  }

  try {
    // Implement registration logic with different endpoints
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
      // Import the registerVendor function
      const { registerVendor } = await import("~/lib/auth.server");

      // Prepare vendor registration data according to API requirements
      const vendorData = {
        company: company, // Selected client company from dropdown
        email: email, // Email
        password: password, // Password
        vendor_rfc: rfc, // Vendor RFC
        vendor_company_type: providerType as "legal" | "personal",
        vendor_legal_name:
          providerType === "legal"
            ? vendorLegalName || "" // For legal: use the legal name field
            : providerCompany || "", // For personal: use the name from CSF field
        contact_name: providerType === "legal" ? name : undefined, // Only for legal
        contact_lastname: providerType === "legal" ? lastname : undefined, // Only for legal
        clients: [company], // Array with selected client company
      };

      // Call the vendor registration API
      const vendorResult = await registerVendor(vendorData);

      if (!vendorResult.success) {
        return json({
          error: vendorResult.message || "Error al registrar proveedor",
        });
      }
    } else {
      // Map form data to API requirements - send individual fields
      const companyData = {
        company: company, // Company name
        rfc: rfc, // RFC tax ID
        phone: phone, // Phone number
        name: name, // Contact first name
        lastname: lastname, // Contact last name
        email: email, // Contact email
        companyEmail: companyEmail, // Company email (optional)
        password: password, // Password
      };

      // Call the company registration API
      const companyResult = await registerCompany(companyData);

      if (!companyResult.success) {
        return json({
          error: companyResult.message || "Error al registrar empresa",
        });
      }
    }

    // Get company name for success message (for providers)
    let companyName = company;
    if (companyType === "provider") {
      try {
        const { fetchCompanies } = await import("~/lib/api.server");
        const companies = await fetchCompanies();
        const selectedCompany = companies.find((c: { id: string; name: string }) => c.id === company);
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
  const [isValidating, setIsValidating] = useState(false);
  const [csfExtracted, setCsfExtracted] = useState(false);
  const [stepValidationAttempted, setStepValidationAttempted] = useState<Record<number, boolean>>({});
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Use companies from API or fallback to empty array
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
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    mode: "onTouched",
    defaultValues: fetcher.data?.values || { companyType: "company" },
  });

  const currentCompanyType = watch("companyType") || "company";
  const currentProviderType = watch("providerType");
  const providerCompanyName = watch("providerCompany");
  const watchedRfc = watch("rfc");
  const watchedCompanyEmail = watch("companyEmail");
  const watchedCompany = watch("company");

  const isSubmitting = fetcher.state === "submitting";

  // Update server error when fetcher completes with error
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.error) {
      setServerError(fetcher.data.error);
    }
  }, [fetcher.state, fetcher.data]);

  // Clear errors when form values change
  useEffect(() => {
    if (serverError) {
      setServerError(null);
    }
    if (validationErrors.length > 0) {
      setValidationErrors([]);
    }
  }, [watchedRfc, watchedCompanyEmail, watchedCompany]);

  // Ahora todos los flujos tienen 2 pasos
  const totalSteps = 2;

  // Handle success redirect with countdown
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

  // Auto-fill contact info for individual providers
  useEffect(() => {
    if (
      currentCompanyType === "provider" &&
      currentProviderType === "personal" &&
      providerCompanyName &&
      !autoFillApplied
    ) {
      // Split the name into first and last name
      const nameParts = providerCompanyName.trim().split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      setValue("name", firstName, { shouldValidate: true });
      setValue("lastname", lastName, { shouldValidate: true });

      setAutoFillApplied(true);
    }

    // Reset auto-fill flag when switching away from individual provider
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

  // Handler for CSF data extraction
  const handleCSFDataExtracted = (data: CSFData) => {
    // Set RFC
    if (data.rfc) {
      setValue("rfc", data.rfc.toUpperCase(), { shouldValidate: true });
    }

    // Set name based on provider type
    if (data.nombre) {
      if (currentProviderType === "personal") {
        // For personal providers, set providerCompany with full name
        setValue("providerCompany", data.nombre, { shouldValidate: true });
      } else if (currentProviderType === "legal") {
        // For legal providers, set vendorLegalName (razón social)
        setValue("vendorLegalName", data.nombre, { shouldValidate: true });
      }
    }

    setCsfExtracted(true);
  };

  // Validate current step fields
  const validateCurrentStep = async () => {
    let fieldsToValidate: (keyof RegisterFormData)[] = [];

    switch (currentStep) {
      case 1:
        // Paso 1: Datos del usuario (cuenta de acceso)
        if (currentCompanyType === "provider") {
          // Validar que se haya seleccionado tipo de proveedor
          if (!currentProviderType) {
            setError("providerType", {
              type: "manual",
              message: "Por favor selecciona si eres empresa o persona física",
            });
            return false;
          }

          if (currentProviderType === "personal") {
            // Para proveedores personales: solo datos de cuenta
            fieldsToValidate = [
              "companyType",
              "providerType",
              "email",
              "password",
              "confirmPassword",
            ];
          } else {
            // Para proveedores legales: datos de contacto
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
        // Paso 2: Datos de la empresa/proveedor
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
            // Proveedor personal: nombre + empresa cliente + RFC
            fieldsToValidate = [
              "providerCompany",
              "company",
              "rfc",
              "phone",
            ];
          }
        } else {
          fieldsToValidate = [
            "company",
            "companyEmail",
            "rfc",
            "phone",
          ];
        }
        break;
      case 3:
        fieldsToValidate = ["password", "confirmPassword"];
        break;
    }

    const result = await trigger(fieldsToValidate);
    return result;
  };

  // Validate company data against backend (RFC and email uniqueness)
  const validateCompanyOnServer = async (rfc: string, email: string): Promise<{ valid: boolean; error?: string }> => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'}/api/auth/validate-company`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rfc, email }),
      });
      const data = await response.json();
      return { valid: data.valid, error: data.error };
    } catch (error) {
      console.error('Error validating company:', error);
      return { valid: true, error: undefined }; // Allow to continue if server is unreachable
    }
  };

  const nextStep = async () => {
    // Mark this step as attempted for validation display
    setStepValidationAttempted(prev => ({ ...prev, [currentStep]: true }));

    const isStepValid = await validateCurrentStep();
    if (isStepValid) {
      // Clear errors from next step before advancing
      clearErrors();
      setValidationErrors([]);
      setCurrentStep((prev) => Math.min(prev + 1, totalSteps));
    }
  };

  const prevStep = () => {
    // Clear errors when going back
    clearErrors();
    setValidationErrors([]);
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const onSubmit = (data: RegisterFormData) => {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      formData.append(key, value);
    });

    fetcher.submit(formData, { method: "post" });
  };

  const onError = (errors: any) => {
    // Log validation errors for debugging
    console.log("Form validation errors:", errors);

    // Extract error messages to display
    const errorMessages: string[] = [];
    Object.entries(errors).forEach(([field, error]: [string, any]) => {
      if (error?.message) {
        errorMessages.push(`${field}: ${error.message}`);
      }
    });
    setValidationErrors(errorMessages);

    // Scroll to top to show error message
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const stepTitles = {
    1: { icon: User, title: "Tu Cuenta de Acceso" },
    2: { icon: Building2, title: "Datos de la Empresa" },
    3: { icon: Lock, title: "Crear Contraseña" },
  };

  // For personal providers in step 3, show password icon/title
  const getStepInfo = () => {
    if (
      currentCompanyType === "provider" &&
      currentProviderType === "personal" &&
      currentStep === 3
    ) {
      return stepTitles[3];
    }
    return stepTitles[currentStep as keyof typeof stepTitles];
  };

  const currentStepInfo = getStepInfo();
  const StepIcon = currentStepInfo.icon;

  // Determine which step a field belongs to
  const getFieldStep = (field: keyof RegisterFormData): number => {
    const step1Fields: (keyof RegisterFormData)[] = ["companyType", "providerType", "name", "lastname", "email", "password", "confirmPassword"];
    const step2Fields: (keyof RegisterFormData)[] = ["company", "providerCompany", "vendorLegalName", "companyEmail", "rfc", "phone"];

    if (step1Fields.includes(field)) return 1;
    if (step2Fields.includes(field)) return 2;
    return 3;
  };

  // Merge server-side errors with client-side errors (only show if step was attempted)
  const getFieldError = (field: keyof RegisterFormData) => {
    const fieldStep = getFieldStep(field);
    // Only show errors if this step has been attempted OR if we're on the submit step
    if (!stepValidationAttempted[fieldStep] && currentStep !== 3) {
      return undefined;
    }
    return errors[field]?.message || fetcher.data?.errors?.[field]?.[0];
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="mx-auto h-12 w-12 bg-primary rounded-xl flex items-center justify-center mb-4">
            <Factory className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">FabriFlow</h1>
          <p className="text-muted-foreground mt-2">
            Sistema de Gestión Industrial
          </p>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl font-semibold text-center">
              Crear Cuenta
            </CardTitle>
            <CardDescription className="text-center">
              Paso{" "}
              {currentCompanyType === "provider" &&
              currentProviderType === "personal" &&
              currentStep === 3
                ? 2
                : currentStep}{" "}
              de {totalSteps}
            </CardDescription>

            <div className="flex items-center justify-center space-x-1 pt-2">
              {[...Array(totalSteps)].map((_, index) => {
                // For personal providers, adjust the progress bar highlighting
                const isActive =
                  currentCompanyType === "provider" &&
                  currentProviderType === "personal"
                    ? (currentStep === 1 && index === 0) ||
                      (currentStep === 3 && index === 1)
                    : index + 1 <= currentStep;

                return (
                  <div
                    key={index}
                    className={`h-2 transition-all duration-300 ${
                      isActive ? "w-16 bg-primary" : "w-16 bg-muted"
                    } ${index === 0 ? "rounded-l-full" : ""} ${
                      index === totalSteps - 1 ? "rounded-r-full" : ""
                    }`}
                  />
                );
              })}
            </div>
          </CardHeader>
          <CardContent>
            {loaderData?.serverError && (
              <Alert variant="destructive" className="mb-4">
                <ServerCrash className="h-4 w-4" />
                <AlertDescription>
                  {loaderData.serverError}
                </AlertDescription>
              </Alert>
            )}

            {fetcher.data?.success ? (
              <div className="space-y-4">
                <Alert className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
                  <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <AlertDescription className="text-green-800 dark:text-green-200">
                    {fetcher.data.success}
                  </AlertDescription>
                </Alert>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-3">
                    Serás redirigido al login en {countdown} segundos...
                  </p>
                  <Link
                    to="/login"
                    className="font-medium text-primary hover:text-primary/80 transition-colors"
                  >
                    Ir al inicio de sesión ahora
                  </Link>
                </div>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit(onSubmit, onError)}
                className="space-y-4"
              >
                <div className="flex items-center space-x-2 mb-4">
                  <StepIcon className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-medium">
                    {currentStepInfo.title}
                  </h3>
                </div>

                {/* Step 1: Company Information */}
                {/* PASO 1: Datos del Usuario (Cuenta de Acceso) */}
                {currentStep === 1 && (
                  <div className="space-y-4">
                    {/* Mensaje aclaratorio - diferente para empresa vs proveedor */}
                    <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
                      <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <AlertDescription className="text-blue-800 dark:text-blue-200 text-sm">
                        {currentCompanyType === "provider" ? (
                          <>
                            Esta información será tu cuenta de acceso a la plataforma.
                            <strong> Iniciarás sesión con tu RFC y contraseña.</strong>
                          </>
                        ) : (
                          <>
                            Esta información será tu cuenta de acceso a la plataforma.
                            El correo electrónico será tu usuario para iniciar sesión.
                          </>
                        )}
                      </AlertDescription>
                    </Alert>

                    {/* Tipo de Registro */}
                    <div className="space-y-2">
                      <Label className="text-sm">Tipo de Registro *</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setValue("companyType", "company", { shouldValidate: true });
                            setValue("company", "");
                            setValue("providerCompany", "");
                            setValue("companyEmail", "");
                            setValue("rfc", "");
                            setCsfExtracted(false);
                          }}
                          className={`flex flex-col items-center justify-center rounded-md border-2 p-3 transition-colors ${
                            currentCompanyType === "company"
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-muted bg-popover hover:bg-accent"
                          }`}
                        >
                          <Users className="h-5 w-5 mb-1" />
                          <span className="text-xs font-medium">Empresa</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setValue("companyType", "provider", { shouldValidate: true });
                            setValue("company", "");
                            setValue("providerCompany", "");
                            setValue("companyEmail", "");
                            setValue("rfc", "");
                            setCsfExtracted(false);
                          }}
                          className={`flex flex-col items-center justify-center rounded-md border-2 p-3 transition-colors ${
                            currentCompanyType === "provider"
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-muted bg-popover hover:bg-accent"
                          }`}
                        >
                          <Truck className="h-5 w-5 mb-1" />
                          <span className="text-xs font-medium">Proveedor</span>
                        </button>
                      </div>
                      {getFieldError("companyType") && (
                        <p className="text-xs text-destructive">{getFieldError("companyType")}</p>
                      )}
                    </div>

                    {/* Tipo de Proveedor - Solo para proveedores */}
                    {currentCompanyType === "provider" && (
                      <div className="space-y-1.5">
                        <Label className="text-sm">Tipo de Proveedor *</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setValue("providerType", "legal", { shouldValidate: true });
                              setValue("providerCompany", "");
                              setValue("vendorLegalName", "");
                              setValue("rfc", "");
                              setAutoFillApplied(false);
                              setCsfExtracted(false);
                            }}
                            className={`flex items-center justify-center space-x-2 rounded-md border-2 px-3 py-2 transition-colors ${
                              currentProviderType === "legal"
                                ? "border-primary bg-primary/5 text-primary"
                                : "border-muted bg-popover hover:bg-accent"
                            }`}
                          >
                            <Building2 className="h-4 w-4" />
                            <span className="text-xs font-medium">Empresa</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setValue("providerType", "personal", { shouldValidate: true });
                              setValue("providerCompany", "");
                              setValue("rfc", "");
                              setAutoFillApplied(false);
                              setCsfExtracted(false);
                            }}
                            className={`flex items-center justify-center space-x-2 rounded-md border-2 px-3 py-2 transition-colors ${
                              currentProviderType === "personal"
                                ? "border-primary bg-primary/5 text-primary"
                                : "border-muted bg-popover hover:bg-accent"
                            }`}
                          >
                            <User className="h-4 w-4" />
                            <span className="text-xs font-medium">Persona</span>
                          </button>
                        </div>
                        {getFieldError("providerType") && (
                          <p className="text-xs text-destructive">{getFieldError("providerType")}</p>
                        )}
                      </div>
                    )}

                    {/* Nombre y Apellido - Para empresas y proveedores legales */}
                    {(currentCompanyType === "company" || (currentCompanyType === "provider" && currentProviderType === "legal")) && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="name" className="text-sm">Nombre *</Label>
                          <Input
                            id="name"
                            {...register("name")}
                            type="text"
                            placeholder="Tu nombre"
                            className="h-9 text-sm"
                          />
                          {getFieldError("name") && (
                            <p className="text-xs text-destructive">{getFieldError("name")}</p>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="lastname" className="text-sm">Apellido *</Label>
                          <Input
                            id="lastname"
                            {...register("lastname")}
                            type="text"
                            placeholder="Tu apellido"
                            className="h-9 text-sm"
                          />
                          {getFieldError("lastname") && (
                            <p className="text-xs text-destructive">{getFieldError("lastname")}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Email */}
                    <div className="space-y-1.5">
                      <Label htmlFor="email" className="text-sm">
                        Correo Electrónico * {currentCompanyType === "company" && <span className="text-muted-foreground">(será tu usuario)</span>}
                      </Label>
                      <Input
                        id="email"
                        {...register("email")}
                        type="email"
                        placeholder="tu@correo.com"
                        className="h-9 text-sm"
                      />
                      {getFieldError("email") && (
                        <p className="text-xs text-destructive">{getFieldError("email")}</p>
                      )}
                    </div>

                    {/* Contraseña */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="password" className="text-sm">Contraseña *</Label>
                        <div className="relative">
                          <Input
                            id="password"
                            {...register("password")}
                            type={showPassword ? "text" : "password"}
                            placeholder="Mínimo 8 caracteres"
                            className="h-9 text-sm pr-10"
                          />
                          <button
                            type="button"
                            className="absolute inset-y-0 right-0 pr-3 flex items-center"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <Eye className="h-4 w-4 text-muted-foreground" />
                            )}
                          </button>
                        </div>
                        {getFieldError("password") && (
                          <p className="text-xs text-destructive">{getFieldError("password")}</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="confirmPassword" className="text-sm">Confirmar *</Label>
                        <div className="relative">
                          <Input
                            id="confirmPassword"
                            {...register("confirmPassword")}
                            type={showConfirmPassword ? "text" : "password"}
                            placeholder="Repite la contraseña"
                            className="h-9 text-sm pr-10"
                          />
                          <button
                            type="button"
                            className="absolute inset-y-0 right-0 pr-3 flex items-center"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          >
                            {showConfirmPassword ? (
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <Eye className="h-4 w-4 text-muted-foreground" />
                            )}
                          </button>
                        </div>
                        {getFieldError("confirmPassword") && (
                          <p className="text-xs text-destructive">{getFieldError("confirmPassword")}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* PASO 2: Datos de la Empresa */}
                {currentStep === 2 && (
                  <div className="space-y-4">
                    {/* CSF Uploader for providers */}
                    {currentCompanyType === "provider" && (
                      <div className="space-y-3">
                        <div className="text-sm text-muted-foreground">
                          Sube tu Constancia de Situación Fiscal para llenar automáticamente tus datos fiscales.
                        </div>
                        <CSFUploader
                          onDataExtracted={handleCSFDataExtracted}
                          onError={(error) => console.error("CSF Error:", error)}
                        />
                        <div className="relative">
                          <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                          </div>
                          <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-2 text-muted-foreground">
                              O llena manualmente
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Nombre para proveedores personales */}
                    {currentCompanyType === "provider" && currentProviderType === "personal" && (
                      <div className="space-y-1.5">
                        <Label htmlFor="providerCompany" className="text-sm">
                          Tu Nombre Completo (como en CSF) *
                        </Label>
                        <Input
                          id="providerCompany"
                          {...register("providerCompany")}
                          type="text"
                          placeholder="Nombre completo como aparece en tu Constancia"
                          className="h-9 text-sm"
                        />
                        {getFieldError("providerCompany") && (
                          <p className="text-xs text-destructive">{getFieldError("providerCompany")}</p>
                        )}
                      </div>
                    )}

                    {/* Para proveedores legales */}
                    {currentCompanyType === "provider" && currentProviderType === "legal" && (
                      <>
                        <div className="space-y-1.5">
                          <Label htmlFor="providerCompany" className="text-sm">
                            Nombre de tu Empresa *
                          </Label>
                          <Input
                            id="providerCompany"
                            {...register("providerCompany")}
                            type="text"
                            placeholder="Nombre de tu empresa proveedora"
                            className="h-9 text-sm"
                          />
                          {getFieldError("providerCompany") && (
                            <p className="text-xs text-destructive">{getFieldError("providerCompany")}</p>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="vendorLegalName" className="text-sm">
                            Razón Social *
                          </Label>
                          <Input
                            id="vendorLegalName"
                            {...register("vendorLegalName")}
                            type="text"
                            placeholder="Razón social completa"
                            className="h-9 text-sm"
                          />
                          {getFieldError("vendorLegalName") && (
                            <p className="text-xs text-destructive">{getFieldError("vendorLegalName")}</p>
                          )}
                        </div>
                      </>
                    )}

                    {/* Selección de empresa cliente para proveedores */}
                    {currentCompanyType === "provider" && (
                      <div className="space-y-1.5">
                        <Label htmlFor="company" className="text-sm">Empresa Cliente *</Label>
                        <Select
                          onValueChange={(value) => setValue("company", value)}
                          value={watch("company") || ""}
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Selecciona la empresa cliente" />
                          </SelectTrigger>
                          <SelectContent>
                            {companies.length > 0 ? (
                              companies.map((company) => (
                                <SelectItem key={company.id} value={company.id}>
                                  {company.name}
                                </SelectItem>
                              ))
                            ) : (
                              <div className="p-2 text-sm text-muted-foreground">
                                No hay empresas cliente disponibles
                              </div>
                            )}
                          </SelectContent>
                        </Select>
                        {getFieldError("company") && (
                          <p className="text-xs text-destructive">{getFieldError("company")}</p>
                        )}
                      </div>
                    )}

                    {/* Nombre de empresa - Solo para empresas (no proveedores) */}
                    {currentCompanyType === "company" && (
                      <>
                        <div className="space-y-1.5">
                          <Label htmlFor="company" className="text-sm">Nombre de la Empresa *</Label>
                          <Input
                            id="company"
                            {...register("company")}
                            type="text"
                            placeholder="Nombre de su empresa"
                            className="h-9 text-sm"
                          />
                          {getFieldError("company") && (
                            <p className="text-xs text-destructive">{getFieldError("company")}</p>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="companyEmail" className="text-sm">
                            Correo de la Empresa * <span className="text-muted-foreground">(para contacto)</span>
                          </Label>
                          <Input
                            id="companyEmail"
                            {...register("companyEmail")}
                            type="email"
                            placeholder="contacto@empresa.com"
                            className="h-9 text-sm"
                          />
                          {getFieldError("companyEmail") && (
                            <p className="text-xs text-destructive">{getFieldError("companyEmail")}</p>
                          )}
                        </div>
                      </>
                    )}

                    {/* RFC y Teléfono */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="rfc" className="text-sm">
                          RFC * {csfExtracted && <span className="text-green-600 text-xs">(extraído de CSF)</span>}
                        </Label>
                        <Input
                          id="rfc"
                          {...register("rfc")}
                          type="text"
                          placeholder="ABC123456XYZ"
                          className={`h-9 text-sm ${csfExtracted ? "bg-muted cursor-not-allowed" : ""}`}
                          maxLength={13}
                          style={{ textTransform: "uppercase" }}
                          readOnly={csfExtracted}
                        />
                        {getFieldError("rfc") && (
                          <p className="text-xs text-destructive">{getFieldError("rfc")}</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="phone" className="text-sm">Teléfono *</Label>
                        <Input
                          id="phone"
                          {...register("phone")}
                          type="tel"
                          placeholder="5512345678"
                          className="h-9 text-sm"
                        />
                        {getFieldError("phone") && (
                          <p className="text-xs text-destructive">{getFieldError("phone")}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {serverError && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{serverError}</AlertDescription>
                  </Alert>
                )}

                {validationErrors.length > 0 && stepValidationAttempted[currentStep] && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <p className="font-medium mb-1">Por favor corrige los siguientes errores:</p>
                      <ul className="list-disc list-inside text-sm">
                        {validationErrors.map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Navigation buttons */}
                <div className="flex justify-between pt-4">
                  {currentStep > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={prevStep}
                      disabled={isSubmitting}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Anterior
                    </Button>
                  )}

                  <div className={currentStep === 1 ? "ml-auto" : ""}>
                    {currentStep < totalSteps ? (
                      <Button type="button" onClick={nextStep} disabled={isValidating}>
                        {isValidating ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Validando...
                          </>
                        ) : (
                          <>
                            Siguiente
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </>
                        )}
                      </Button>
                    ) : (
                      <Button
                        type="submit"
                        className="min-w-[120px]"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Creando...
                          </>
                        ) : (
                          "Crear Cuenta"
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </form>
            )}

            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                ¿Ya tienes una cuenta?{" "}
                <Link
                  to="/login"
                  className="font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  Iniciar sesión
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground">
            © 2024 FabriFlow. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}
