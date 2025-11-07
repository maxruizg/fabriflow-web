import { z } from "zod";

// RFC validation regex (Mexican tax ID)
const rfcRegex = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

// Phone validation regex (Mexican format)
const phoneRegex = /^[\d\s()-]+$/;

const baseRegisterSchema = z.object({
  companyType: z
    .enum(["company", "provider"], {
      errorMap: () => ({ message: "Por favor selecciona un tipo de registro" }),
    }),
  
  providerType: z
    .enum(["legal", "personal"], {
      errorMap: () => ({ message: "Por favor selecciona el tipo de proveedor" }),
    })
    .optional(),
  
  company: z
    .string()
    .min(3, "El nombre de la empresa debe tener al menos 3 caracteres")
    .max(100, "El nombre de la empresa no puede exceder 100 caracteres"),
  
  providerCompany: z
    .string()
    .optional()
    .refine((val) => !val || val.length >= 3, {
      message: "El nombre de tu empresa debe tener al menos 3 caracteres",
    })
    .refine((val) => !val || val.length <= 100, {
      message: "El nombre de tu empresa no puede exceder 100 caracteres",
    }),
  
  vendorLegalName: z
    .string()
    .optional()
    .refine((val) => !val || val.length >= 3, {
      message: "El nombre legal debe tener al menos 3 caracteres",
    })
    .refine((val) => !val || val.length <= 100, {
      message: "El nombre legal no puede exceder 100 caracteres",
    }),
  
  
  rfc: z
    .string()
    .min(12, "El RFC debe tener al menos 12 caracteres")
    .max(13, "El RFC no puede exceder 13 caracteres")
    .regex(rfcRegex, "Formato de RFC inválido (ej: ABC123456XYZ)"),
  
  phone: z
    .string()
    .min(10, "El teléfono debe tener al menos 10 dígitos")
    .regex(phoneRegex, "Formato de teléfono inválido"),
  
  name: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(50, "El nombre no puede exceder 50 caracteres"),
  
  lastname: z
    .string()
    .min(2, "El apellido debe tener al menos 2 caracteres")
    .max(50, "El apellido no puede exceder 50 caracteres"),
  
  email: z
    .string()
    .email("Correo electrónico inválido")
    .max(100, "El correo no puede exceder 100 caracteres"),
  
  companyEmail: z
    .string()
    .optional()
    .refine((val) => !val || val.includes("@"), {
      message: "Correo electrónico de la empresa inválido",
    })
    .refine((val) => !val || val.length <= 100, {
      message: "El correo de la empresa no puede exceder 100 caracteres",
    }),
  
  password: z
    .string()
    .min(6, "La contraseña debe tener al menos 6 caracteres")
    .max(100, "La contraseña no puede exceder 100 caracteres")
    .regex(
      /[A-Z]/,
      "La contraseña debe contener al menos una letra mayúscula"
    )
    .regex(
      /[a-z]/,
      "La contraseña debe contener al menos una letra minúscula"
    )
    .regex(
      /[0-9]/,
      "La contraseña debe contener al menos un número"
    ),
  
  confirmPassword: z
    .string()
    .min(6, "La contraseña debe tener al menos 6 caracteres"),
});

export const registerSchema = baseRegisterSchema
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  })
  .refine((data) => {
    if (data.companyType === "provider") {
      return data.providerType && (data.providerType === "legal" || data.providerType === "personal");
    }
    return true;
  }, {
    message: "Por favor selecciona si eres empresa o persona física",
    path: ["providerType"],
  })
  .refine((data) => {
    if (data.companyType === "provider") {
      // providerCompany is required for all providers (it becomes vendor_legal_name)
      return data.providerCompany && data.providerCompany.length >= 3;
    }
    return true;
  }, {
    message: "El nombre es requerido para proveedores",
    path: ["providerCompany"],
  })
  .refine((data) => {
    if (data.companyType === "provider" && data.providerType === "legal") {
      // vendorLegalName is required for legal providers
      return data.vendorLegalName && data.vendorLegalName.length >= 3;
    }
    return true;
  }, {
    message: "El nombre legal es requerido para empresas proveedoras",
    path: ["vendorLegalName"],
  })
  .refine((data) => {
    if (data.companyType === "company") {
      return data.companyEmail && data.companyEmail.includes("@");
    }
    return true;
  }, {
    message: "El correo electrónico de la empresa es requerido",
    path: ["companyEmail"],
  });

export const loginSchema = z.object({
  company: z
    .string()
    .min(1, "Por favor selecciona una empresa"),
  
  email: z
    .string()
    .min(1, "RFC o Email es requerido"),
  
  password: z
    .string()
    .min(1, "La contraseña es requerida"),
});

export type RegisterFormData = z.infer<typeof baseRegisterSchema>;
export type LoginFormData = z.infer<typeof loginSchema>;