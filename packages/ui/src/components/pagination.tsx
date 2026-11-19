import { Button } from "./button.tsx";

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  noun = "items",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  noun?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 px-1 text-[13px] text-muted"
    >
      <span className="tabular">
        {from}–{to} of {total} {noun}
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          icon="chevronLeft"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          Prev
        </Button>
        <span className="tabular px-2">
          {page} / {pages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          iconRight="chevronRight"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
