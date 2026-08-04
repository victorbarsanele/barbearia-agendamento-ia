import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { apiFetch } from '../services/api';

type UserRole = 'admin' | 'barber';

interface AuthUser {
    username: string;
    role: UserRole;
}

interface AuthContextValue {
    user: AuthUser | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (username: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
    children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const refreshSession = useCallback(async (): Promise<void> => {
        const response = await apiFetch('/api/auth/me');

        if (!response.ok) {
            throw new Error('UNAUTHORIZED');
        }

        const data = (await response.json()) as AuthUser;
        setUser(data);
    }, []);

    const login = useCallback(
        async (username: string, password: string) => {
            const response = await apiFetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username,
                    password,
                }),
            });

            if (!response.ok) {
                throw new Error('INVALID_CREDENTIALS');
            }

            await refreshSession();
        },
        [refreshSession],
    );

    const logout = useCallback(async () => {
        try {
            await apiFetch('/api/auth/logout', {
                method: 'POST',
            });
        } finally {
            setUser(null);
            window.location.assign('/login');
        }
    }, []);

    useEffect(() => {
        let isMounted = true;

        const initializeSession = async () => {
            try {
                await refreshSession();
            } catch {
                if (isMounted) {
                    setUser(null);
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        void initializeSession();

        return () => {
            isMounted = false;
        };
    }, [refreshSession]);

    const contextValue = useMemo<AuthContextValue>(
        () => ({
            user,
            isAuthenticated: Boolean(user),
            isLoading,
            login,
            logout,
        }),
        [isLoading, login, logout, user],
    );

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextValue {
    const contextValue = useContext(AuthContext);

    if (!contextValue) {
        throw new Error('useAuth deve ser usado dentro de AuthProvider.');
    }

    return contextValue;
}
