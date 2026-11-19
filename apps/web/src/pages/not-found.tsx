import { buttonClass, Card, EmptyState } from "@citeverify/ui";
import { Link } from "react-router";

export function NotFoundPage({
  title = "Page not found",
  description,
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Card>
      <EmptyState
        icon="discovery"
        title={title}
        description={
          description ??
          "The page you are looking for does not exist or you do not have access to it."
        }
        action={
          <Link to="/" className={buttonClass("primary")}>
            Back to overview
          </Link>
        }
      />
    </Card>
  );
}
