import { Button, Callout, Field, Input, LogoMark } from "@citeverify/ui";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { BackendStatusNotice } from "../components/system/backend-status.tsx";
import { API_CONFIGURED, ApiError, errorMessage } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-navy-950 text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
          aria-hidden="true"
        />
        <div className="relative flex items-center gap-3">
          <LogoMark size={34} />
          <span className="font-display font-semibold text-[20px]">
            CiteVerify
          </span>
        </div>
        <div className="relative max-w-md">
          <p className="font-display text-[34px] leading-[1.15] tracking-[-0.01em]">
            Does the evidence say what the citation claims?
          </p>
          <p className="mt-4 text-[15px] text-navy-200 leading-relaxed">
            CiteVerify extracts the claims in a manuscript, maps each citation
            to its source publication, reads the available abstract or
            open-access full text, and produces an evidence-linked, automated
            assessment for human review.
          </p>
          <ol className="mt-8 space-y-2.5 text-[13.5px] text-navy-100">
            {[
              "Claims identified in your text",
              "Citations mapped to publications",
              "Evidence passages extracted",
              "Verdicts with explanations & limitations",
            ].map((s, i) => (
              <li key={s} className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 font-mono text-[11px] text-electric-400">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
        </div>
        <div className="relative text-[12px] text-navy-400">
          Automated assessments support — never replace — expert review.
        </div>
      </aside>
      <main className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <LogoMark size={30} />
            <span className="font-display font-semibold text-[19px] text-navy-950">
              CiteVerify
            </span>
          </div>
          <h1 className="font-display font-semibold text-[28px] text-navy-950 tracking-[-0.01em]">
            {title}
          </h1>
          <p className="mt-1.5 text-[14px] text-muted">{subtitle}</p>
          <div className="mt-7">{children}</div>
        </div>
      </main>
    </div>
  );
}

export function LoginPage() {
  useEffect(() => {
    document.title = "Sign in · CiteVerify";
  }, []);
  const { login, status, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === "authenticated") return <Navigate to={from} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!EMAIL_RE.test(email.trim()))
      next.email = "Enter a valid email address.";
    if (!password) next.password = "Enter your password.";
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "VALIDATION_ERROR")
        setErrors(err.fieldErrors);
      setFormError(
        err instanceof ApiError && err.code === "INVALID_CREDENTIALS"
          ? "The email or password is incorrect."
          : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle={
        <>
          New to CiteVerify?{" "}
          <Link
            to="/register"
            className="font-medium text-primary-600 hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <BackendStatusNotice />
        {sessionExpired ? (
          <Callout tone="warning" title="Your session has ended">
            Please sign in again to continue.
          </Callout>
        ) : null}
        {formError ? <Callout tone="danger">{formError}</Callout> : null}
        <Field label="Email" error={errors.email}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              placeholder="you@university.edu"
            />
          )}
        </Field>
        <Field label="Password" error={errors.password}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={busy}
          disabled={!API_CONFIGURED}
        >
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}

export function RegisterPage() {
  useEffect(() => {
    document.title = "Create account · CiteVerify";
  }, []);
  const { register, status } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === "authenticated") return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Enter your name.";
    else if (name.trim().length > 100)
      next.name = "Use at most 100 characters.";
    if (!EMAIL_RE.test(email.trim()))
      next.email = "Enter a valid email address.";
    if (password.length < 8) next.password = "Use at least 8 characters.";
    else if (password.length > 128)
      next.password = "Use at most 128 characters.";
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await register(name.trim(), email.trim(), password);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "VALIDATION_ERROR")
        setErrors(err.fieldErrors);
      setFormError(
        err instanceof ApiError && err.code === "CONFLICT"
          ? "An account with this email already exists. Sign in instead."
          : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle={
        <>
          Already registered?{" "}
          <Link
            to="/login"
            className="font-medium text-primary-600 hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <BackendStatusNotice />
        {formError ? <Callout tone="danger">{formError}</Callout> : null}
        <Field label="Full name" error={errors.name}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>
        <Field label="Email" error={errors.email}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>
        <Field
          label="Password"
          hint="At least 8 characters."
          error={errors.password}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={busy}
          disabled={!API_CONFIGURED}
        >
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
