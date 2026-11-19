import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  IconTile,
  InlineNotice,
  ListItem,
  Skeleton,
} from "@citeverify/ui";
import { ErrorState, KeyValue, PageHeader } from "../components/common.tsx";
import { BackendStatusNotice } from "../components/system/backend-status.tsx";
import { API_BASE } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { formatBytes, formatDate } from "../lib/format.ts";
import { useConfig } from "../lib/hooks.ts";

function Capability({
  on,
  label,
  detail,
}: {
  on: boolean;
  label: string;
  detail: string;
}) {
  return (
    <li>
      <ListItem
        leading={
          <IconTile
            icon={on ? "check" : "minus"}
            tone={on ? "success" : "neutral"}
          />
        }
        title={label}
        subtitle={
          <span className="whitespace-normal leading-relaxed">{detail}</span>
        }
        trailing={
          <Badge tone={on ? "success" : "neutral"}>
            {on ? "Available" : "Not available"}
          </Badge>
        }
      />
    </li>
  );
}

export function SettingsPage() {
  const { user, logout } = useAuth();
  const config = useConfig();
  const f = config.data?.features;

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Account & system"
        description="Your account and the capabilities this CiteVerify server reports."
      />
      <BackendStatusNotice showWhenOnline className="mb-5" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader title="Account" />
          <CardBody>
            {user ? (
              <KeyValue
                items={[
                  { label: "Name", value: user.name },
                  { label: "Email", value: user.email },
                  { label: "Member since", value: formatDate(user.createdAt) },
                  {
                    label: "User ID",
                    value: (
                      <span className="font-mono text-[12px]">{user.id}</span>
                    ),
                  },
                ]}
              />
            ) : null}
            <p className="mt-5 text-[12.5px] text-muted">
              Profile editing and password changes are not offered by the API
              yet.
            </p>
            <div className="mt-4">
              <Button variant="secondary" icon="logout" onClick={logout}>
                Sign out
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Server capabilities"
            description={
              <span className="font-mono text-[12px]">{API_BASE}/config</span>
            }
          />
          <CardBody>
            {config.error ? (
              <ErrorState
                compact
                error={config.error}
                onRetry={config.refetch}
              />
            ) : !f || !config.data ? (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <>
                <ul className="space-y-2">
                  <Capability
                    on
                    label="Rule-based pipeline"
                    detail="Deterministic claim extraction, citation mapping, evidence extraction and verification. Always available."
                  />
                  <Capability
                    on={f.aiClaimExtraction}
                    label="AI claim extraction"
                    detail="Needs an AI provider implemented on the server (apps/api/src/services/ai-provider.ts). None is configured by default."
                  />
                  <Capability
                    on={f.aiEvidenceExtraction}
                    label="AI evidence extraction"
                    detail="Needs an AI provider implemented on the server. None is configured by default."
                  />
                  <Capability
                    on={f.aiVerification}
                    label="AI verification strategy"
                    detail="Needs an AI provider implemented on the server. None is configured by default."
                  />
                  <Capability
                    on={f.openAccessFullText}
                    label="Open-access full text"
                    detail="Legally accessible PDFs are downloaded for evidence extraction. Paywalled content is never fetched."
                  />
                  <Capability
                    on={f.reportExport}
                    label="Server-side report export"
                    detail="Not implemented in the API. The Reports page assembles reports in the browser (Markdown/JSON download and print-to-PDF)."
                  />
                </ul>
                <InlineNotice className="mt-4">
                  Uploads: {config.data.upload.extensions.join(", ")} up to{" "}
                  {formatBytes(config.data.upload.maxBytes)}.
                </InlineNotice>
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
