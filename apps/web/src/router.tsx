import { Button, EmptyState, Spinner } from "@citeverify/ui";
import { lazy, type ReactNode } from "react";
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  useLocation,
} from "react-router";
import { AppShell } from "./components/layout/app-shell.tsx";
import {
  type CrumbHandle,
  DocumentCrumb,
  PublicationCrumb,
} from "./components/layout/breadcrumbs.tsx";
import { API_BASE, API_CONFIGURED, API_URL_ERROR } from "./lib/api.ts";
import { useAuth } from "./lib/auth.tsx";
import { LoginPage, RegisterPage } from "./pages/auth.tsx";
import { NotFoundPage } from "./pages/not-found.tsx";

/** Route-level code splitting: each page chunk loads on first visit (Suspense lives in AppShell). */
const ClaimsCitationsPage = lazy(() =>
  import("./pages/claims.tsx").then((m) => ({
    default: m.ClaimsCitationsPage,
  })),
);
const DiscoveryPage = lazy(() =>
  import("./pages/discovery.tsx").then((m) => ({ default: m.DiscoveryPage })),
);
const NetworkPage = lazy(() =>
  import("./pages/network.tsx").then((m) => ({ default: m.NetworkPage })),
);
const DocumentPage = lazy(() =>
  import("./pages/document.tsx").then((m) => ({ default: m.DocumentPage })),
);
const DocumentsPage = lazy(() =>
  import("./pages/documents.tsx").then((m) => ({ default: m.DocumentsPage })),
);
const OverviewPage = lazy(() =>
  import("./pages/overview.tsx").then((m) => ({ default: m.OverviewPage })),
);
const PublicationPage = lazy(() =>
  import("./pages/publication.tsx").then((m) => ({
    default: m.PublicationPage,
  })),
);
const ReportPage = lazy(() =>
  import("./pages/reports.tsx").then((m) => ({ default: m.ReportPage })),
);
const ReportsPage = lazy(() =>
  import("./pages/reports.tsx").then((m) => ({ default: m.ReportsPage })),
);
const SettingsPage = lazy(() =>
  import("./pages/settings.tsx").then((m) => ({ default: m.SettingsPage })),
);
const UploadPage = lazy(() =>
  import("./pages/upload.tsx").then((m) => ({ default: m.UploadPage })),
);
const VerificationPage = lazy(() =>
  import("./pages/verification.tsx").then((m) => ({
    default: m.VerificationPage,
  })),
);
const WorkspacePage = lazy(() =>
  import("./pages/workspace.tsx").then((m) => ({ default: m.WorkspacePage })),
);

function FullScreen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper p-6">
      {children}
    </div>
  );
}

function RequireAuth() {
  const { status, retry, logout } = useAuth();
  const location = useLocation();
  if (status === "checking")
    return (
      <FullScreen>
        <Spinner size={24} className="text-primary-500" />
        <span className="sr-only">Checking your session…</span>
      </FullScreen>
    );
  if (status === "unreachable")
    return (
      <FullScreen>
        <EmptyState
          icon="alert"
          title={
            API_CONFIGURED
              ? "The CiteVerify API is unreachable"
              : "No API is configured for this deployment"
          }
          description={
            API_CONFIGURED
              ? `Your session is saved, but ${API_BASE} could not be contacted. Check that the API is running and try again.`
              : API_URL_ERROR
                ? `This build has an invalid API URL (${API_URL_ERROR}), so it cannot sign you in or load data. Fix VITE_API_BASE_URL in the hosting environment and redeploy.`
                : "This build was made without VITE_API_BASE_URL, so it cannot sign you in or load data. Set the variable in the hosting environment and redeploy."
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {API_CONFIGURED ? (
                <Button icon="refresh" onClick={retry}>
                  Try again
                </Button>
              ) : null}
              <Button variant="secondary" icon="logout" onClick={logout}>
                Sign out
              </Button>
            </div>
          }
        />
      </FullScreen>
    );
  if (status === "anonymous")
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  return <Outlet />;
}

const crumb = (label: string): CrumbHandle => ({ crumb: () => label });

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        handle: crumb("CiteVerify"),
        children: [
          { index: true, element: <OverviewPage />, handle: crumb("Overview") },
          {
            path: "documents",
            handle: crumb("My Documents"),
            children: [
              { index: true, element: <DocumentsPage /> },
              {
                path: ":id",
                handle: {
                  crumb: (p) => <DocumentCrumb id={p.id} />,
                } satisfies CrumbHandle,
                children: [
                  { index: true, element: <DocumentPage /> },
                  {
                    path: "workspace",
                    element: <WorkspacePage />,
                    handle: crumb("Evidence workspace"),
                  },
                ],
              },
            ],
          },
          { path: "upload", element: <UploadPage />, handle: crumb("Upload") },
          {
            path: "claims",
            element: <ClaimsCitationsPage />,
            handle: crumb("Claims & Citations"),
          },
          {
            path: "verification",
            element: <VerificationPage />,
            handle: crumb("Verification Results"),
          },
          {
            path: "network",
            element: <NetworkPage />,
            handle: crumb("Citation Network"),
          },
          {
            path: "discovery",
            element: <DiscoveryPage />,
            handle: crumb("Research Discovery"),
          },
          {
            path: "publications/:id",
            element: <PublicationPage />,
            handle: {
              crumb: (p) => <PublicationCrumb id={p.id} />,
            } satisfies CrumbHandle,
          },
          {
            path: "reports",
            handle: crumb("Reports"),
            children: [
              { index: true, element: <ReportsPage /> },
              {
                path: ":id",
                element: <ReportPage />,
                handle: {
                  crumb: (p) => <DocumentCrumb id={p.id} />,
                } satisfies CrumbHandle,
              },
            ],
          },
          {
            path: "settings",
            element: <SettingsPage />,
            handle: crumb("Settings"),
          },
          { path: "*", element: <NotFoundPage />, handle: crumb("Not found") },
        ],
      },
    ],
  },
]);
