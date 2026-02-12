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
      await registerVendor(vendorData);
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
      await registerCompany(companyData);
    }

    const successMessage =
      companyType === "provider"
        ? `Registro de ${
            providerType === "personal"
              ? "proveedor individual"
              : "empresa proveedora"
          } exitoso. Tu solicitud será enviada a ${company} para aprobación.`
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

  // Use companies from API or fallback to empty array
  const companies = loaderData?.companies || [];

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    trigger,
    setValue,
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    mode: "onChange",
    defaultValues: fetcher.data?.values || { companyType: "company" },
  });

  const currentCompanyType = watch("companyType") || "company";
  const currentProviderType = watch("providerType");
  const providerCompanyName = watch("providerCompany");

  const isSubmitting = fetcher.state === "submitting";
  // Personal providers skip step 2, so they have only 2 steps
  const totalSteps =
    currentCompanyType === "provider" && currentProviderType === "personal"
      ? 2
      : 3;

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

  // Validate current step fields
  const validateCurrentStep = async () => {
    let fieldsToValidate: (keyof RegisterFormData)[] = [];

    switch (currentStep) {
      case 1:
        if (currentCompanyType === "provider") {
          if (currentProviderType === "legal") {
            fieldsToValidate = [
              "companyType",
              "providerType",
              "providerCompany",
              "vendorLegalName",
              "company",
              "rfc",
              "phone",
            ];
          } else {
            // Personal providers need email in step 1
            fieldsToValidate = [
              "companyType",
              "providerType",
              "providerCompany",
              "email",
              "company",
              "rfc",
              "phone",
            ];
          }
        } else {
          fieldsToValidate = [
            "companyType",
            "company",
            "companyEmail",
            "rfc",
            "phone",
          ];
        }
        break;
      case 2:
        fieldsToValidate = ["name", "lastname", "email"];
        break;
      case 3:
        fieldsToValidate = ["password", "confirmPassword"];
        break;
    }

    const result = await trigger(fieldsToValidate);
    return result;
  };

  const nextStep = async () => {
    const isStepValid = await validateCurrentStep();
    if (isStepValid) {
      // Skip step 2 for personal providers
      if (
        currentStep === 1 &&
        currentCompanyType === "provider" &&
        currentProviderType === "personal"
      ) {
        setCurrentStep(3); // Jump directly to password step
      } else {
        setCurrentStep((prev) => Math.min(prev + 1, totalSteps));
      }
    }
  };

  const prevStep = () => {
    // Skip step 2 for personal providers when going back
    if (
      currentStep === 3 &&
      currentCompanyType === "provider" &&
      currentProviderType === "personal"
    ) {
      setCurrentStep(1); // Jump back to step 1
    } else {
      setCurrentStep((prev) => Math.max(prev - 1, 1));
    }
  };

  const onSubmit = (data: RegisterFormData) => {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      formData.append(key, value);
    });

    fetcher.submit(formData, { method: "post" });
  };

  const onError = (errors: any) => {
    // Scroll to top to show error message
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const stepTitles = {
    1: { icon: Building2, title: "Información de la Empresa" },
    2: { icon: User, title: "Información del Contacto" },
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

  // Merge server-side errors with client-side errors
  const getFieldError = (field: keyof RegisterFormData) => {
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
                {currentStep === 1 && (
                  <div className="space-y-3">
                    {/* Compact Role Selection - Collapsible */}
                    {!currentCompanyType ||
                    currentCompanyType === "company" ||
                    !currentProviderType ? (
                      <div className="space-y-2">
                        <Label className="text-sm">Tipo de Registro *</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setValue("companyType", "company", {
                                shouldValidate: true,
                              });
                              setValue("company", ""); // Reset company when changing type
                              setValue("providerCompany", ""); // Reset provider company
                              setValue("companyEmail", ""); // Reset company email
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
                              setValue("companyType", "provider", {
                                shouldValidate: true,
                              });
                              setValue("company", ""); // Reset company when changing type
                              setValue("providerCompany", ""); // Reset provider company
                              setValue("companyEmail", ""); // Reset company email
                            }}
                            className={`flex flex-col items-center justify-center rounded-md border-2 p-3 transition-colors ${
                              currentCompanyType === "provider"
                                ? "border-primary bg-primary/5 text-primary"
                                : "border-muted bg-popover hover:bg-accent"
                            }`}
                          >
                            <Truck className="h-5 w-5 mb-1" />
                            <span className="text-xs font-medium">
                              Proveedor
                            </span>
                          </button>
                        </div>
                        {getFieldError("companyType") && (
                          <p className="text-xs text-destructive">
                            {getFieldError("companyType")}
                          </p>
                        )}
                      </div>
                    ) : (
                      // Collapsed view - shows selected type with change button
                      <div className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-2">
                        <div className="flex items-center space-x-2">
                          <Truck className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">
                            Proveedor -{" "}
                            {currentProviderType === "legal"
                              ? "Empresa"
                              : "Persona"}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setValue("companyType", undefined as any);
                            setValue("providerType", undefined);
                            setValue("providerCompany", "");
                            setAutoFillApplied(false);
                          }}
                          className="text-xs text-muted-foreground hover:text-primary transition-colors"
                        >
                          Cambiar
                        </button>
                      </div>
                    )}

                    {/* Provider Type Selection - Only for providers, more compact */}
                    {currentCompanyType === "provider" &&
                      !currentProviderType && (
                        <div className="space-y-1.5">
                          <Label className="text-sm">Tipo de Proveedor *</Label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setValue("providerType", "legal", {
                                  shouldValidate: true,
                                });
                                setValue("providerCompany", "");
                                setValue("vendorLegalName", "");
                                setAutoFillApplied(false);
                              }}
                              className={`flex items-center justify-center space-x-2 rounded-md border-2 px-3 py-2 transition-colors ${
                                currentProviderType === "legal"
                                  ? "border-primary bg-primary/5 text-primary"
                                  : "border-muted bg-popover hover:bg-accent"
                              }`}
                            >
                              <Building2 className="h-4 w-4" />
                              <span className="text-xs font-medium">
                                Empresa
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setValue("providerType", "personal", {
                                  shouldValidate: true,
                                });
                                setValue("providerCompany", "");
                                setAutoFillApplied(false);
                              }}
                              className={`flex items-center justify-center space-x-2 rounded-md border-2 px-3 py-2 transition-colors ${
                                currentProviderType === "personal"
                                  ? "border-primary bg-primary/5 text-primary"
                                  : "border-muted bg-popover hover:bg-accent"
                              }`}
                            >
                              <User className="h-4 w-4" />
                              <span className="text-xs font-medium">
                                Persona
                              </span>
                            </button>
                          </div>
                          {getFieldError("providerType") && (
                            <p className="text-xs text-destructive">
                              {getFieldError("providerType")}
                            </p>
                          )}
                        </div>
                      )}

                    {/* Provider Name - Only for providers */}
                    {currentCompanyType === "provider" &&
                      currentProviderType && (
                        <>
                          <div className="space-y-1.5">
                            <Label
                              htmlFor="providerCompany"
                              className="text-sm"
                            >
                              {currentProviderType === "legal"
                                ? "Nombre de tu Empresa *"
                                : "Tu Nombre Completo *"}
                            </Label>
                            <Input
                              id="providerCompany"
                              {...register("providerCompany")}
                              type="text"
                              placeholder={
                                currentProviderType === "legal"
                                  ? "Nombre de tu empresa proveedora"
                                  : "Nombre completo como en la CSF"
                              }
                              className="h-9 text-sm"
                            />
                            {getFieldError("providerCompany") && (
                              <p className="text-xs text-destructive">
                                {getFieldError("providerCompany")}
                              </p>
                            )}
                          </div>

                          {/* Legal vendor fields - Only for legal vendors */}
                          {currentProviderType === "legal" && (
                            <div className="space-y-1.5">
                              <Label
                                htmlFor="vendorLegalName"
                                className="text-sm"
                              >
                                Nombre Legal de la Empresa *
                              </Label>
                              <Input
                                id="vendorLegalName"
                                {...register("vendorLegalName")}
                                type="text"
                                placeholder="Razón social completa"
                                className="h-9 text-sm"
                              />
                              {getFieldError("vendorLegalName") && (
                                <p className="text-xs text-destructive">
                                  {getFieldError("vendorLegalName")}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Email field for personal providers only */}
                          {currentProviderType === "personal" && (
                            <div className="space-y-1.5">
                              <Label htmlFor="email" className="text-sm">
                                Correo Electrónico *
                              </Label>
                              <Input
                                id="email"
                                {...register("email")}
                                type="email"
                                placeholder="tu@correo.com"
                                className="h-9 text-sm"
                              />
                              {getFieldError("email") && (
                                <p className="text-xs text-destructive">
                                  {getFieldError("email")}
                                </p>
                              )}
                            </div>
                          )}
                        </>
                      )}

                    {/* Company Selection */}
                    <div className="space-y-1.5">
                      <Label htmlFor="company" className="text-sm">
                        {currentCompanyType === "provider"
                          ? "Empresa Cliente *"
                          : "Nombre de Empresa *"}
                      </Label>

                      {currentCompanyType === "provider" ? (
                        <Select
                          onValueChange={(value) => {
                            setValue("company", value);
                          }}
                          value={watch("company") || ""}
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Selecciona la empresa cliente" />
                          </SelectTrigger>
                          <SelectContent>
                            {companies.length > 0 ? (
                              companies.map((company) => (
                                <SelectItem key={company} value={company}>
                                  {company}
                                </SelectItem>
                              ))
                            ) : (
                              <div className="p-2 text-sm text-muted-foreground">
                                No hay empresas cliente disponibles
                              </div>
                            )}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id="company"
                          {...register("company")}
                          type="text"
                          placeholder="Nombre de su empresa"
                          className="h-9 text-sm"
                        />
                      )}

                      {getFieldError("company") && (
                        <p className="text-xs text-destructive">
                          {getFieldError("company")}
                        </p>
                      )}
                    </div>

                    {/* Company Email - Only for companies */}
                    {currentCompanyType === "company" && (
                      <div className="space-y-1.5">
                        <Label htmlFor="companyEmail" className="text-sm">
                          Correo de la Empresa *
                        </Label>
                        <Input
                          id="companyEmail"
                          {...register("companyEmail")}
                          type="email"
                          placeholder="contacto@empresa.com"
                          className="h-9 text-sm"
                        />
                        {getFieldError("companyEmail") && (
                          <p className="text-xs text-destructive">
                            {getFieldError("companyEmail")}
                          </p>
                        )}
                      </div>
                    )}

                    {/* RFC and Phone in same row */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="rfc" className="text-sm">
                          RFC *
                        </Label>
                        <Input
                          id="rfc"
                          {...register("rfc")}
                          type="text"
                          placeholder="ABC123456XYZ"
                          className="h-9 text-sm"
                          maxLength={13}
                          style={{ textTransform: "uppercase" }}
                        />
                        {getFieldError("rfc") && (
                          <p className="text-xs text-destructive">
                            {getFieldError("rfc")}
                          </p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="phone" className="text-sm">
                          Teléfono *
                        </Label>
                        <Input
                          id="phone"
                          {...register("phone")}
                          type="tel"
                          placeholder="5512345678"
                          className="h-9 text-sm"
                        />
                        {getFieldError("phone") && (
                          <p className="text-xs text-destructive">
                            {getFieldError("phone")}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 2: Contact Information */}
                {currentStep === 2 && (
                  <div className="space-y-4">
                    {/* Auto-fill notification for individual providers */}
                    {currentCompanyType === "provider" &&
                      currentProviderType === "personal" &&
                      autoFillApplied && (
                        <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
                          <CheckCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          <AlertDescription className="text-blue-800 dark:text-blue-200 text-sm">
                            Se ha completado automáticamente tu información de
                            contacto. Puedes modificarla si es necesario.
                          </AlertDescription>
                        </Alert>
                      )}

                    {/* Contact info note for legal vendors */}
                    {currentCompanyType === "provider" &&
                      currentProviderType === "legal" && (
                        <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
                          <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          <AlertDescription className="text-blue-800 dark:text-blue-200 text-sm">
                            Información de contacto para la cuenta de acceso del
                            proveedor.
                          </AlertDescription>
                        </Alert>
                      )}
                    <div className="space-y-2">
                      <Label htmlFor="name">Nombre *</Label>
                      <Input
                        id="name"
                        {...register("name")}
                        type="text"
                        placeholder="Nombre del responsable"
                        className="h-11"
                      />
                      {getFieldError("name") && (
                        <p className="text-sm text-destructive">
                          {getFieldError("name")}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="lastname">Apellido *</Label>
                      <Input
                        id="lastname"
                        {...register("lastname")}
                        type="text"
                        placeholder="Apellido del responsable"
                        className="h-11"
                      />
                      {getFieldError("lastname") && (
                        <p className="text-sm text-destructive">
                          {getFieldError("lastname")}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Correo Electrónico *</Label>
                      <Input
                        id="email"
                        {...register("email")}
                        type="email"
                        placeholder="correo@empresa.com"
                        className="h-11"
                      />
                      {getFieldError("email") && (
                        <p className="text-sm text-destructive">
                          {getFieldError("email")}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Step 3: Password */}
                {currentStep === 3 && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="password">Contraseña *</Label>
                      <div className="relative">
                        <Input
                          id="password"
                          {...register("password")}
                          type={showPassword ? "text" : "password"}
                          placeholder="Mínimo 6 caracteres"
                          className="h-11 pr-10"
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
                        <p className="text-sm text-destructive">
                          {getFieldError("password")}
                        </p>
                      )}
                      <ul className="text-xs text-muted-foreground space-y-1">
                        <li>• Al menos 6 caracteres</li>
                        <li>• Una letra mayúscula</li>
                        <li>• Una letra minúscula</li>
                        <li>• Un número</li>
                      </ul>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">
                        Confirmar Contraseña *
                      </Label>
                      <div className="relative">
                        <Input
                          id="confirmPassword"
                          {...register("confirmPassword")}
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder="Repite la contraseña"
                          className="h-11 pr-10"
                        />
                        <button
                          type="button"
                          className="absolute inset-y-0 right-0 pr-3 flex items-center"
                          onClick={() =>
                            setShowConfirmPassword(!showConfirmPassword)
                          }
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                      {getFieldError("confirmPassword") && (
                        <p className="text-sm text-destructive">
                          {getFieldError("confirmPassword")}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {fetcher.data?.error && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{fetcher.data.error}</AlertDescription>
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
                      <Button type="button" onClick={nextStep}>
                        Siguiente
                        <ChevronRight className="h-4 w-4 ml-1" />
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
