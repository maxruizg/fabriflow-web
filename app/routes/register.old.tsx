import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/cloudflare";
import { Form, Link, useActionData, useNavigation, redirect } from "@remix-run/react";
import { json } from "@remix-run/cloudflare";
import { useState } from "react";
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
  // Redirect to dashboard if already authenticated
  const { getUserFromSession } = await import("~/lib/session.server");
  const user = await getUserFromSession(request);
  if (user) {
    throw redirect("/dashboard");
  }
  return json({});
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const company = formData.get("company")?.toString();
  const rfc = formData.get("rfc")?.toString();
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();
  const confirmPassword = formData.get("confirmPassword")?.toString();
  const contactName = formData.get("contactName")?.toString();
  const phone = formData.get("phone")?.toString();

  // Basic validation
  if (
    !company ||
    !rfc ||
    !email ||
    !password ||
    !confirmPassword ||
    !contactName ||
    !phone
  ) {
    return json({
      error: "Todos los campos obligatorios deben ser completados",
    });
  }

  if (password !== confirmPassword) {
    return json({
      error: "Las contraseñas no coinciden",
    });
  }

  if (password.length < 6) {
    return json({
      error: "La contraseña debe tener al menos 6 caracteres",
    });
  }

  try {
    // TODO: Implement actual registration logic

    // Simulate success for development
    return json({
      success:
        "Registro exitoso. Tu cuenta está pendiente de aprobación por el administrador.",
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

type ActionData = { error: string } | { success: string } | undefined;

export default function Signup() {
  const actionData = useActionData<typeof action>() as ActionData;
  const navigation = useNavigation();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    company: "",
    rfc: "",
    phone: "",
    contactName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const isSubmitting = navigation.state === "submitting";


  const totalSteps = 3;

  const updateFormData = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const nextStep = () => {
    if (validateCurrentStep()) {
      setCurrentStep((prev) => Math.min(prev + 1, totalSteps));
    }
  };

  const prevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const validateCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return formData.company && formData.rfc && formData.phone;
      case 2:
        return formData.contactName && formData.email;
      case 3:
        return (
          formData.password &&
          formData.confirmPassword &&
          formData.password === formData.confirmPassword &&
          formData.password.length >= 6
        );
      default:
        return true;
    }
  };

  const stepTitles = {
    1: { icon: Building2, title: "Información de la Empresa" },
    2: { icon: User, title: "Información del Contacto" },
    3: { icon: Lock, title: "Crear Contraseña" },
  };

  const StepIcon = stepTitles[currentStep as keyof typeof stepTitles].icon;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative">
      {/* Theme toggle positioned on the right side */}
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
              Paso {currentStep} de {totalSteps}
            </CardDescription>

            {/* Progress bar */}
            <div className="flex items-center justify-center space-x-1 pt-2">
              {[...Array(totalSteps)].map((_, index) => (
                <div
                  key={index}
                  className={`h-2 transition-all duration-300 ${
                    index + 1 <= currentStep
                      ? "w-16 bg-primary"
                      : "w-16 bg-muted"
                  } ${index === 0 ? "rounded-l-full" : ""} ${
                    index === totalSteps - 1 ? "rounded-r-full" : ""
                  }`}
                />
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {actionData && 'success' in actionData ? (
              <div className="space-y-4">
                <Alert className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
                  <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <AlertDescription className="text-green-800 dark:text-green-200">
                    {actionData.success}
                  </AlertDescription>
                </Alert>
                <div className="text-center">
                  <Link
                    to="/login"
                    className="font-medium text-primary hover:text-primary/80 transition-colors"
                  >
                    Volver al inicio de sesión
                  </Link>
                </div>
              </div>
            ) : (
              <Form method="post" className="space-y-4">
                {/* Step header */}
                <div className="flex items-center space-x-2 mb-4">
                  <StepIcon className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-medium">
                    {stepTitles[currentStep as keyof typeof stepTitles].title}
                  </h3>
                </div>

                {/* Step 1: Company Information */}
                {currentStep === 1 && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="company">Nombre de la Empresa *</Label>
                      <Input
                        id="company"
                        name="company"
                        type="text"
                        placeholder="Ej: Textiles del Norte S.A. de C.V."
                        required
                        className="h-11"
                        value={formData.company}
                        onChange={(e) =>
                          updateFormData("company", e.target.value)
                        }
                      />
                    </div>


                    <div className="space-y-2">
                      <Label htmlFor="rfc">RFC *</Label>
                      <Input
                        id="rfc"
                        name="rfc"
                        type="text"
                        placeholder="RFC con homoclave"
                        required
                        className="h-11"
                        maxLength={13}
                        value={formData.rfc}
                        onChange={(e) => updateFormData("rfc", e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">Teléfono *</Label>
                      <Input
                        id="phone"
                        name="phone"
                        type="tel"
                        placeholder="(55) 1234-5678"
                        required
                        className="h-11"
                        value={formData.phone}
                        onChange={(e) =>
                          updateFormData("phone", e.target.value)
                        }
                      />
                    </div>
                  </div>
                )}

                {/* Step 2: Contact Information */}
                {currentStep === 2 && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="contactName">Nombre del Contacto *</Label>
                      <Input
                        id="contactName"
                        name="contactName"
                        type="text"
                        placeholder="Nombre completo del responsable"
                        required
                        className="h-11"
                        value={formData.contactName}
                        onChange={(e) =>
                          updateFormData("contactName", e.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Correo Electrónico *</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        placeholder="correo@empresa.com"
                        required
                        className="h-11"
                        value={formData.email}
                        onChange={(e) =>
                          updateFormData("email", e.target.value)
                        }
                      />
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
                          name="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Mínimo 6 caracteres"
                          required
                          className="h-11 pr-10"
                          minLength={6}
                          value={formData.password}
                          onChange={(e) =>
                            updateFormData("password", e.target.value)
                          }
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
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">
                        Confirmar Contraseña *
                      </Label>
                      <div className="relative">
                        <Input
                          id="confirmPassword"
                          name="confirmPassword"
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder="Repite la contraseña"
                          required
                          className="h-11 pr-10"
                          minLength={6}
                          value={formData.confirmPassword}
                          onChange={(e) =>
                            updateFormData("confirmPassword", e.target.value)
                          }
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
                    </div>

                    {formData.password &&
                      formData.confirmPassword &&
                      formData.password !== formData.confirmPassword && (
                        <p className="text-sm text-destructive">
                          Las contraseñas no coinciden
                        </p>
                      )}
                  </div>
                )}

                {/* Hidden fields to submit all data */}
                {currentStep === 3 && (
                  <>
                    <input
                      type="hidden"
                      name="company"
                      value={formData.company}
                    />
                    <input type="hidden" name="rfc" value={formData.rfc} />
                    <input type="hidden" name="phone" value={formData.phone} />
                    <input
                      type="hidden"
                      name="contactName"
                      value={formData.contactName}
                    />
                    <input type="hidden" name="email" value={formData.email} />
                  </>
                )}

                {actionData && 'error' in actionData && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{actionData.error}</AlertDescription>
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
                      <Button
                        type="button"
                        onClick={nextStep}
                        disabled={!validateCurrentStep()}
                      >
                        Siguiente
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    ) : (
                      <Button
                        type="submit"
                        className="min-w-[120px]"
                        disabled={isSubmitting || !validateCurrentStep()}
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
              </Form>
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
