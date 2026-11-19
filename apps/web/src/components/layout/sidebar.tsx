import { cn, Icon, LogoMark } from "@citeverify/ui";
import { NavLink } from "react-router";
import { NAV_FOOTER, NAV_MAIN, type NavItem } from "./nav.ts";

function Item({
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
        cn(
          "group relative flex h-9 items-center gap-3 rounded-md px-2.5 text-[13.5px] transition-colors duration-150",
          collapsed && "justify-center px-0",
          isActive
            ? "bg-white/[0.08] font-medium text-white"
            : "text-navy-200 hover:bg-white/[0.05] hover:text-white",
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              "absolute top-1.5 bottom-1.5 -left-3 w-[3px] rounded-r-full bg-electric-400 transition-opacity",
              isActive ? "opacity-100" : "opacity-0",
            )}
            aria-hidden="true"
          />
          <Icon
            name={item.icon}
            size={18}
            className={cn(
              "shrink-0",
              isActive
                ? "text-electric-400"
                : "text-navy-300 group-hover:text-navy-100",
            )}
          />
          {collapsed ? (
            <span className="sr-only">{item.label}</span>
          ) : (
            <span className="truncate">{item.label}</span>
          )}
        </>
      )}
    </NavLink>
  );
}

export function Sidebar({
  collapsed,
  onToggle,
  onNavigate,
  mobile = false,
}: {
  collapsed: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  return (
    <div className="flex h-full flex-col bg-navy-950 text-white">
      <div
        className={cn(
          "flex h-14 items-center gap-2.5 px-4",
          collapsed && "justify-center px-0",
        )}
      >
        <LogoMark size={28} />
        {collapsed ? null : (
          <div className="min-w-0 leading-tight">
            <div className="font-display font-semibold text-[16.5px] tracking-[-0.01em]">
              CiteVerify
            </div>
            <div className="text-[10.5px] text-navy-300 uppercase tracking-[0.12em]">
              Citation integrity
            </div>
          </div>
        )}
      </div>
      <nav
        aria-label="Primary"
        className="scrollbar-thin flex-1 overflow-y-auto px-3 pt-3"
      >
        {collapsed ? null : (
          <div className="mb-2 px-2.5 font-medium text-[10.5px] text-navy-400 uppercase tracking-[0.12em]">
            Workspace
          </div>
        )}
        <div className="space-y-0.5">
          {NAV_MAIN.map((item) => (
            <Item
              key={item.to}
              item={item}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </nav>
      <div className="space-y-0.5 border-white/[0.06] border-t px-3 py-3">
        {NAV_FOOTER.map((item) => (
          <Item
            key={item.to}
            item={item}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
        {mobile || !onToggle ? null : (
          <button
            type="button"
            onClick={onToggle}
            className={cn(
              "flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-[13px] text-navy-300 transition-colors hover:bg-white/[0.05] hover:text-white",
              collapsed && "justify-center px-0",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
          >
            <Icon name={collapsed ? "chevronRight" : "chevronLeft"} size={17} />
            {collapsed ? null : <span>Collapse</span>}
          </button>
        )}
      </div>
    </div>
  );
}
