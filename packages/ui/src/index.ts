// Shared React UI components for CiteVerify (styled with Tailwind; tokens live in apps/web/src/index.css).
export { Badge, type BadgeTone } from "./components/badge.tsx";
export {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  buttonClass,
} from "./components/button.tsx";
export { Card, CardBody, CardHeader } from "./components/card.tsx";
export {
  Avatar,
  BigNumber,
  HeroStat,
  IconTile,
  InlineNotice,
  InsetBox,
  ListItem,
  ListItemContent,
  listItemClass,
  MetaLine,
  MeterRow,
  MiniBars,
  Panel,
  RailHeading,
  StatList,
  StatRow,
  StatusChip,
  type TileTone,
  Timeline,
  TimelineItem,
} from "./components/dashboard.tsx";
export { ConfirmDialog, Dialog, Drawer } from "./components/dialog.tsx";
export {
  Callout,
  type CalloutTone,
  EmptyState,
  Kbd,
  ProgressBar,
  Skeleton,
} from "./components/feedback.tsx";
export { Field, Input, Select, Textarea } from "./components/form.tsx";
export { Icon, type IconName, LogoMark } from "./components/icon.tsx";
export {
  CountUp,
  LiveDot,
  Reveal,
  trackSpotlight,
  usePrefersReducedMotion,
} from "./components/motion.tsx";
export { Pagination } from "./components/pagination.tsx";
export { Spinner } from "./components/spinner.tsx";
export { Segmented, type TabItem, TabPanel, Tabs } from "./components/tabs.tsx";
export {
  type ToastInput,
  ToastProvider,
  type ToastTone,
  useToast,
} from "./components/toast.tsx";
export { cn } from "./lib/cn.ts";
