import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AgendamentosPage } from './pages/AgendamentosPage';
import { LoginPage } from './pages/LoginPage';
import { BloqueiosPage } from './pages/BloqueiosPage';

const NovoAgendamentoPage = lazy(() =>
    import('./pages/NovoAgendamentoPage').then((module) => ({
        default: module.NovoAgendamentoPage,
    })),
);

const EditarAgendamentoPage = lazy(() =>
    import('./pages/EditarAgendamentoPage').then((module) => ({
        default: module.EditarAgendamentoPage,
    })),
);

const ClientesPage = lazy(() =>
    import('./pages/ClientesPage').then((module) => ({
        default: module.ClientesPage,
    })),
);

const NovoClientePage = lazy(() =>
    import('./pages/NovoClientePage').then((module) => ({
        default: module.NovoClientePage,
    })),
);

const EditarClientePage = lazy(() =>
    import('./pages/EditarClientePage').then((module) => ({
        default: module.EditarClientePage,
    })),
);

const ServicosPage = lazy(() =>
    import('./pages/ServicosPage').then((module) => ({
        default: module.ServicosPage,
    })),
);

const NovoServicoPage = lazy(() =>
    import('./pages/NovoServicoPage').then((module) => ({
        default: module.NovoServicoPage,
    })),
);

const EditarServicoPage = lazy(() =>
    import('./pages/EditarServicoPage').then((module) => ({
        default: module.EditarServicoPage,
    })),
);

const PacotesPage = lazy(() =>
    import('./pages/PacotesPage').then((module) => ({
        default: module.PacotesPage,
    })),
);

const NovoPacotePage = lazy(() =>
    import('./pages/NovoPacotePage').then((module) => ({
        default: module.NovoPacotePage,
    })),
);

const EditarPacotePage = lazy(() =>
    import('./pages/EditarPacotePage').then((module) => ({
        default: module.EditarPacotePage,
    })),
);

function MainRouteLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            {children}
            <BottomNav />
        </>
    );
}

function App() {
    return (
        <Suspense
            fallback={
                <main className="mx-auto min-h-screen w-full max-w-3xl p-4 sm:p-6">
                    <div className="rounded-md border border-stone-300 bg-white p-4 text-sm text-stone-700">
                        Carregando página...
                    </div>
                </main>
            }
        >
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route
                    path="/"
                    element={
                        <ProtectedRoute>
                            <MainRouteLayout>
                                <AgendamentosPage />
                            </MainRouteLayout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/novo"
                    element={
                        <ProtectedRoute>
                            <NovoAgendamentoPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/editar/:id"
                    element={
                        <ProtectedRoute>
                            <EditarAgendamentoPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/bloqueios"
                    element={
                        <ProtectedRoute>
                            <BloqueiosPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/clientes"
                    element={
                        <ProtectedRoute>
                            <MainRouteLayout>
                                <ClientesPage />
                            </MainRouteLayout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/clientes/novo"
                    element={
                        <ProtectedRoute>
                            <NovoClientePage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/clientes/editar/:id"
                    element={
                        <ProtectedRoute>
                            <EditarClientePage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/servicos"
                    element={
                        <ProtectedRoute>
                            <MainRouteLayout>
                                <ServicosPage />
                            </MainRouteLayout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/servicos/novo"
                    element={
                        <ProtectedRoute>
                            <NovoServicoPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/servicos/editar/:id"
                    element={
                        <ProtectedRoute>
                            <EditarServicoPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/pacotes"
                    element={
                        <ProtectedRoute>
                            <MainRouteLayout>
                                <PacotesPage />
                            </MainRouteLayout>
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/pacotes/novo"
                    element={
                        <ProtectedRoute>
                            <NovoPacotePage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/pacotes/editar/:id"
                    element={
                        <ProtectedRoute>
                            <EditarPacotePage />
                        </ProtectedRoute>
                    }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Suspense>
    );
}

export default App;
