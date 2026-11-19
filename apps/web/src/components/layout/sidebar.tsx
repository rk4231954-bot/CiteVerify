import {
  cn,
  Icon,
  IconTile,
  ListItemContent,
  listItemClass,
  RailHeading,
} from "@citeverify/ui";
import { NavLink } from "react-router";
import { NAV_SECTIONS, type NavItem } from "./nav.ts";

function RailItem({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        collapsed
          ? cn(
              "group flex justify-center rounded-[10px] p-1 transition-colors",
              isActive ? "bg-white/[0.07]" : "hover:bg-white/[0.04]",
            )
          : listItemClass(
              cn(
                "relative py-2 before:absolute before:top-2.5 before:bottom-2.5 before:-left-px before:w-[2px] before:rounded-full before:bg-[#8aa9ff] before:opacity-0 before:shadow-[0_0_10px_rgb(138_169_255/0.9)] before:transition-opacity before:duration-200",
                isActive && "before:opacity-100",
                isActive &&
                  "border-white/[0.16] bg-[#1d1d21] shadow-raised hover:border-white/[0.2] hover:bg-[#1f1f23]",
              ),
            )
      }
    >
      {({ isActive }) =>
        collapsed ? (
          <>
            <IconTile
              icon={item.icon}
              tone={isActive ? "primary" : "neutral"}
              className={cn(isActive && "border-white/[0.18]")}
            />
            <span className="sr-only">{item.label}</span>
          </>
        ) : (
          <ListItemContent
            leading={
              <IconTile
                icon={item.icon}
                tone={isActive ? "primary" : "neutral"}
              />
            }
            title={
              item.badge ? (
                <span className="flex items-center gap-1.5">
                  <span className="truncate">{item.label}</span>
                  <span className="shrink-0 rounded-[4px] border border-[#8b6cff]/30 bg-[#8b6cff]/[0.12] px-1 py-px font-mono text-[9.5px] text-[#c4b5ff] uppercase tracking-[0.04em]">
                    {item.badge}
                  </span>
                </span>
              ) : (
                item.label
              )
            }
            subtitle={item.description}
            trailing={
              isActive ? (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[#8aa9ff] shadow-[0_0_8px_rgb(138_169_255/0.8)]"
                  aria-hidden="true"
                />
              ) : (
                <Icon
                  name="chevronRight"
                  size={14}
                  className="text-subtle opacity-0 transition-opacity group-hover:opacity-100"
                />
              )
            }
          />
        )
      }
    </NavLink>
  );
}

/**
 * Left-hand navigation rail. Expanded it shows each destination as a card
 * (icon tile, title, description); collapsed it shrinks to an icon column.
 */
export function Sidebar({
  collapsed,
  onToggle,
  onNavigate,
  onClose,
}: {
  collapsed: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
  /** Mobile drawer: show a close button instead of the collapse toggle. */
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "flex items-start gap-2 pt-5 pb-4",
          collapsed ? "justify-center px-2" : "justify-between px-4",
        )}
      >
        {collapsed ? null : (
          <div className="min-w-0">
            <div className="font-semibold text-[15px] text-ink tracking-[-0.01em]">
              Navigate
            </div>
            <div className="mt-0.5 text-[12.5px] text-muted">
              Documents, analysis and reports.
            </div>
          </div>
        )}
        {onClose || onToggle ? (
          <button
            type="button"
            onClick={onClose ?? onToggle}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border border-white/[0.08] bg-white/[0.04] text-muted transition-colors hover:bg-white/[0.08] hover:text-ink"
            aria-label={
              onClose
                ? "Close navigation"
                : collapsed
                  ? "Expand navigation"
                  : "Collapse navigation"
            }
            aria-expanded={onClose ? undefined : !collapsed}
          >
            <Icon
              name={
                onClose ? "close" : collapsed ? "chevronRight" : "chevronLeft"
              }
              size={15}
            />
          </button>
        ) : null}
      </div>
      {collapsed ? null : <div className="mx-4 border-line border-t" />}
      <nav
        aria-label="Primary"
        className={cn(
          "scrollbar-thin flex-1 overflow-y-auto pt-4 pb-6",
          collapsed ? "px-2" : "px-4",
        )}
      >
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-5 last:mb-0">
            {collapsed ? (
              <div className="mx-auto mb-2 h-px w-6 bg-white/[0.08]" />
            ) : (
              <RailHeading>{section.title}</RailHeading>
            )}
            <div className={collapsed ? "space-y-1" : "space-y-2"}>
              {section.items.map((item) => (
                <RailItem
                  key={item.to}
                  item={item}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}
