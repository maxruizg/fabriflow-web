import { createContext, useContext, ReactNode } from "react";
import type { User } from "./session.server";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
  user: User | null;
}

export function AuthProvider({ children, user }: AuthProviderProps) {
  const value = {
    user,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function useUser() {
  const { user, isAuthenticated } = useAuth();
  return { user, isAuthenticated };
}