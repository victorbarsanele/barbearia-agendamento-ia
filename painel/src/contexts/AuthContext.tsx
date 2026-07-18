import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useMemo,
    useState,
} from 'react';

interface AuthContextValue {
    token: string | null;
    isAuthenticated: boolean;
    login: (nextToken: string) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
    children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
    const [token, setToken] = useState<string | null>(() =>
        localStorage.getItem('token'),
    );

    const login = useCallback((nextToken: string) => {
        localStorage.setItem('token', nextToken);
        setToken(nextToken);
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem('token');
        setToken(null);
        window.location.assign('/login');
    }, []);

    const contextValue = useMemo<AuthContextValue>(
        () => ({
            token,
            isAuthenticated: Boolean(token),
            login,
            logout,
        }),
        [login, logout, token],
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
