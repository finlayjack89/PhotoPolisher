import { createContext, useContext, useEffect, useState } from 'react';
import { DEMO_USER_ID } from '@/lib/constants';

interface User {
  id: string;
  email: string;
}

interface Session {
  user: User;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Stub auth: create a demo user for development
    const demoUser = {
      id: DEMO_USER_ID,
      email: 'demo@luxsnap.com'
    };
    setUser(demoUser);
    setSession({ user: demoUser });
    setLoading(false);
  }, []);

  const signOut = async () => {
    setUser(null);
    setSession(null);
  };

  const value = {
    user,
    session,
    loading,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
