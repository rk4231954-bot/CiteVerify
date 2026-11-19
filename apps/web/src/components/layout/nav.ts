import type { IconName } from "@citeverify/ui";

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
  description: string;
}

export const NAV_MAIN: NavItem[] = [
  {
    to: "/",
    label: "Overview",
    icon: "overview",
    end: true,
    description: "Workspace dashboard",
  },
  {
    to: "/documents",
    label: "My Documents",
    icon: "documents",
    description: "Uploaded papers and their processing",
  },
  {
    to: "/upload",
    label: "Upload Document",
    icon: "upload",
    description: "Add a PDF or DOCX",
  },
  {
    to: "/claims",
    label: "Claims & Citations",
    icon: "claims",
    description: "Data grids across documents",
  },
  {
    to: "/verification",
    label: "Verification Results",
    icon: "verification",
    description: "Automated verdicts",
  },
  {
    to: "/discovery",
    label: "Research Discovery",
    icon: "discovery",
    description: "Retrieved publications",
  },
  {
    to: "/reports",
    label: "Reports",
    icon: "reports",
    description: "Verification reports",
  },
];

export const NAV_FOOTER: NavItem[] = [
  {
    to: "/settings",
    label: "Settings",
    icon: "settings",
    description: "Account and system capabilities",
  },
];

const byPath = (to: string): NavItem => {
  const item = [...NAV_MAIN, ...NAV_FOOTER].find((n) => n.to === to);
  if (!item) throw new Error(`Unknown nav item ${to}`);
  return item;
};

/** Grouping used by the right-hand navigation rail. */
export const NAV_SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Workspace",
    items: ["/", "/documents", "/upload"].map(byPath),
  },
  {
    title: "Analysis",
    items: ["/claims", "/verification", "/discovery", "/reports"].map(byPath),
  },
  { title: "Account", items: ["/settings"].map(byPath) },
];
