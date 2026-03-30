"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  MENU_SECTIONS,
  type MenuSection,
  type SubMenuItem,
} from "./menuConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentLocale, withLocaleQuery } from "@/i18n/useLocale";
import { Footer } from "./Footer";

type AppShellProps = {
  children: ReactNode;
};

type TabItem = {
  path: string;
  label: string;
  sectionId: string;
};

const deriveSectionId = (
  pathname: string | null,
  accessibleSections: MenuSection[],
): string => {
  if (!pathname) {
    return accessibleSections[0]?.id ?? "";
  }
  const found = accessibleSections.find((section) =>
    pathname.startsWith(`/${section.id}`),
  );
  return found?.id ?? accessibleSections[0]?.id ?? "";
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { locale, dictionary, t } = useCurrentLocale();
  const {
    user,
    logout,
    isAuthenticated,
    isLoading,
    getAccessibleServices,
    hasPermission,
  } = useAuth();

  const [permittedItems, setPermittedItems] = useState<Set<string>>(new Set());

  // Filter menu sections based on user's service access and permissions
  const accessibleSections = useMemo(() => {
    if (!isAuthenticated || !user) {
      return [];
    }

    const accessibleServiceIds = getAccessibleServices();
    return MENU_SECTIONS.filter((section) =>
      accessibleServiceIds.includes(section.id),
    )
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (item) => !item.requiredPermission || permittedItems.has(item.id),
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [isAuthenticated, user, getAccessibleServices, permittedItems]);

  useEffect(() => {
    const runPermissionChecks = async () => {
      if (!isAuthenticated || !user) {
        setPermittedItems(new Set());
        return;
      }

      // Root user sees all items
      if (user.username === "root") {
        const allItemIds = new Set(
          MENU_SECTIONS.flatMap((section) =>
            section.items.map((item) => item.id),
          ),
        );
        setPermittedItems(allItemIds);
        return;
      }

      const permissionsToCheck: Record<string, { permission: string; service: string }> = {};
      MENU_SECTIONS.forEach((section) => {
        section.items.forEach((item) => {
          if (item.requiredPermission) {
            permissionsToCheck[item.id] = {
              permission: item.requiredPermission,
              service: section.id, // Pass the service context (e.g., "call-service", "marketing-service")
            };
          }
        });
      });

      const entries = Object.entries(permissionsToCheck);
      const results = await Promise.all(
        entries.map(async ([itemId, { permission, service }]) => {
          const allowed = await hasPermission(permission, service);
          return allowed ? itemId : null;
        }),
      );

      setPermittedItems(
        new Set(results.filter((id): id is string => Boolean(id))),
      );
    };

    runPermissionChecks();
  }, [isAuthenticated, user]);

  const resolvedItems = useMemo(
    () =>
      accessibleSections.flatMap((section) =>
        section.items.map((item) => ({
          ...item,
          sectionId: section.id,
        })),
      ),
    [accessibleSections],
  );
  const [activeSectionId, setActiveSectionId] = useState(() =>
    deriveSectionId(pathname, accessibleSections),
  );
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [tabs, setTabs] = useState<TabItem[]>([]);
  const [activeTabPath, setActiveTabPath] = useState(pathname ?? "");
  const [pendingNavigationPath, setPendingNavigationPath] = useState<
    string | null
  >(null);
  const [navigationDirection, setNavigationDirection] = useState<'left' | 'right'>('right');

  const handleTabNavigation = (newPath: string) => {
    const currentIndex = tabs.findIndex(tab => tab.path === activeTabPath);
    const newIndex = tabs.findIndex(tab => tab.path === newPath);
    setNavigationDirection(newIndex > currentIndex ? 'right' : 'left');
    setActiveTabPath(newPath);
    router.push(withLocaleQuery(newPath, locale));
  };

  const findItemByPath = useCallback(
    (path: string | null) => {
      if (!path) return undefined;
      return resolvedItems.find((item) => path.startsWith(item.path));
    },
    [resolvedItems],
  );

  const upsertTabForPath = useCallback(
    (path: string | null) => {
      const match = findItemByPath(path);
      if (!match) {
        return;
      }
      setTabs((prev) => {
        if (prev.some((tab) => tab.path === match.path)) {
          return prev;
        }
        return [
          ...prev,
          { path: match.path, label: match.label, sectionId: match.sectionId },
        ];
      });
    },
    [findItemByPath],
  );

  useEffect(() => {
    setActiveSectionId(deriveSectionId(pathname, accessibleSections));
    setMobileSidebarOpen(false);
    setActiveTabPath(pathname ?? "");
    upsertTabForPath(pathname ?? null);
  }, [pathname, accessibleSections, upsertTabForPath]);

  // Handle pending navigation after tab close
  useEffect(() => {
    if (pendingNavigationPath) {
      router.push(withLocaleQuery(pendingNavigationPath, locale));
      setPendingNavigationPath(null);
    }
  }, [pendingNavigationPath, router, locale]);

  const activeSection: MenuSection | undefined = useMemo(
    () => accessibleSections.find((section) => section.id === activeSectionId),
    [activeSectionId, accessibleSections],
  );

  const publicAuthPaths = useMemo(() => ["/auth/login", "/auth/register"], []);

  useEffect(() => {
    if (
      !isLoading &&
      (!isAuthenticated || !user) &&
      !publicAuthPaths.includes(pathname ?? "")
    ) {
      router.replace("/auth/login");
    }
  }, [isLoading, isAuthenticated, user, pathname, router, publicAuthPaths]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-linear-to-br from-blue-50 via-orange-50 to-blue-100 text-slate-800 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full border-4 border-orange-500"></div>
          <span className="text-sm text-slate-600 font-medium">
            Loading session…
          </span>
        </div>
      </main>
    );
  }

  if (!isAuthenticated || !user) {
    if (!publicAuthPaths.includes(pathname ?? "")) {
      return null;
    }

    return (
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-linear-to-br from-slate-800 via-slate-400 to-slate-700 text-slate-100 relative">
      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity duration-300 ease-in-out"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-80 lg:hidden transform transition-transform duration-300 ease-in-out ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        <Sidebar
          sections={accessibleSections}
          activeSectionId={activeSectionId}
          activePathname={pathname ?? ""}
          onSelectSection={setActiveSectionId}
          onOpenItem={(item, sectionId) => {
            setActiveTabPath(item.path);
            setTabs((prev) => {
              if (prev.some((tab) => tab.path === item.path)) {
                return prev;
              }
              return [...prev, { path: item.path, label: item.label, sectionId }];
            });
            router.push(withLocaleQuery(item.path, locale));
            setMobileSidebarOpen(false);
          }}
          onClose={() => setMobileSidebarOpen(false)}
          isMobile={true}
          user={user}
          isAuthenticated={isAuthenticated}
          logout={logout}
        />
      </div>

      {/* Desktop Sidebar */}
      <div
        className={`hidden lg:block fixed left-0 top-0 h-full z-30 transition-transform duration-300 ease-in-out ${sidebarCollapsed ? '-translate-x-full' : 'translate-x-0'
          }`}
      >
        <Sidebar
          sections={accessibleSections}
          activeSectionId={activeSectionId}
          activePathname={pathname ?? ""}
          onSelectSection={setActiveSectionId}
          onOpenItem={(item, sectionId) => {
            setActiveTabPath(item.path);
            setTabs((prev) => {
              if (prev.some((tab) => tab.path === item.path)) {
                return prev;
              }
              return [...prev, { path: item.path, label: item.label, sectionId }];
            });
            router.push(withLocaleQuery(item.path, locale));
          }}
          isMobile={false}
          user={user}
          isAuthenticated={isAuthenticated}
          logout={logout}
        />
      </div>

      {/* Sidebar Toggle Button */}
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className={`hidden lg:flex fixed top-4 z-50 h-10 w-10 items-center justify-center rounded-r-xl bg-slate-800/80 backdrop-blur-md border border-slate-700/50 text-slate-300 hover:bg-orange-500 hover:text-white hover:border-orange-600 transition-all duration-300 ease-in-out shadow-lg ${sidebarCollapsed ? 'left-0' : 'left-80'
          }`}
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {sidebarCollapsed ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
      </button>

      {/* Main Content */}
      <main
        className={`flex-1 overflow-y-auto scrollbar-hide transition-all duration-300 ease-in-out relative z-10 ${sidebarCollapsed ? 'lg:pl-12' : 'lg:pl-84'
          }`}
      >
        <div className="w-full min-h-full lg:px-10 lg:pr-18">
          {/* Combined Header with Tabs */}
          <div className="rounded-b-lg mb-5 bg-slate-900/70 backdrop-blur-xl border border-slate-700/50 shadow-xl overflow-hidden">
            {/* Header Section - Just the menu button */}
            <div>
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800/60 backdrop-blur-md border border-slate-700/50 text-slate-300 transition-all duration-200 hover:bg-orange-500 hover:text-white hover:border-orange-600 active:scale-95 lg:hidden shadow"
                aria-label="Open navigation"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>

            {/* Tabs Section - Fixed at the top */}
            {tabs.length > 0 && (
              <div className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-700/50">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 w-8 bg-linear-to-r from-slate-900 to-transparent z-10 pointer-events-none"></div>
                  <div className="absolute inset-y-0 right-0 w-8 bg-linear-to-l from-slate-900 to-transparent z-10 pointer-events-none"></div>
                  <nav className="flex items-center gap-2 px-4 py-3 overflow-x-auto scrollbar-hide whitespace-nowrap">
                    {tabs.map((tab) => {
                      const isActive = activeTabPath.startsWith(tab.path);
                      return (
                        <div
                          key={tab.path}
                          className={`flex items-center gap-2 rounded-xl px-3 py-2 cursor-pointer ${isActive
                            ? "bg-linear-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/50"
                            : "bg-slate-700/50 text-slate-300 hover:bg-slate-700 border border-slate-600/50"
                            }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleTabNavigation(tab.path)}
                            className="text-sm font-semibold transition-colors cursor-pointer"
                          >
                            {tab.label}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTabs((prev) => {
                                const filtered = prev.filter(
                                  (existing) => existing.path !== tab.path,
                                );
                                if (filtered.length === prev.length) {
                                  return prev;
                                }
                                if (activeTabPath === tab.path) {
                                  const fallbackPath =
                                    filtered.at(-1)?.path ||
                                    resolvedItems[0]?.path ||
                                    "/";
                                  setPendingNavigationPath(fallbackPath);
                                }
                                return filtered;
                              });
                            }}
                            aria-label={`Close ${tab.label}`}
                            className={`rounded-full p-1 cursor-pointer ${isActive
                              ? "hover:bg-white/20 text-white"
                              : "hover:bg-slate-600 text-slate-400"
                              }`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      );
                    })}
                  </nav>
                </div>
              </div>
            )}
          </div>

          {/* Content Area - Simple without animations */}
          <div className="w-full">
            <section className="rounded-2xl bg-slate-900 backdrop-blur-xl border border-slate-700/50 p-6 shadow-2xl shadow-blue-900/10">
              <div className="relative z-10">
                {children}
              </div>
              <div className="absolute inset-0 rounded-2xl bg-linear-to-br from-orange-500/10 via-blue-500/10 to-purple-500/10 opacity-50 -z-10"></div>
            </section>
          </div>

          {/* Footer */}
          <Footer />
        </div>
      </main>
    </div>
  );
}

interface SidebarProps {
  sections: MenuSection[];
  activeSectionId: string;
  activePathname: string;
  onSelectSection: (id: string) => void;
  onOpenItem: (item: SubMenuItem, sectionId: string) => void;
  onClose?: () => void;
  isMobile?: boolean;
  user: any; // Consider creating a proper User type
  isAuthenticated: boolean;
  logout: () => Promise<void>;
}

function Sidebar({
  sections,
  activeSectionId,
  onSelectSection,
  activePathname,
  onOpenItem,
  onClose,
  isMobile = false,
  user,
  isAuthenticated,
  logout,
}: SidebarProps) {
  const activeSection = sections.find(
    (section) => section.id === activeSectionId,
  );

  return (
    <aside className="w-80 h-full bg-slate-900/90 backdrop-blur-xl border-r border-slate-700/50 shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-center p-2 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <img
            src="/Logo.png"
            alt="VET Report Logo"
            className="w-15 h-15 object-contain"
          />
          <div className="text-xl font-bold text-white">
            <div>
              <h1 className="bg-gradient-to-r from-slate-400 via-orange-400 to-slate-400 bg-clip-text text-transparent">
                VET Report
              </h1>
              <span className="text-xs text-slate-400 block mt-1">
                Reporting & Analytics
              </span>
            </div>
          </div>
        </div>
        {isMobile && onClose && (
          <button
            onClick={onClose}
            className="absolute right-4 p-2 rounded-lg hover:bg-slate-800/50 transition-all duration-200 active:scale-95"
            aria-label="Close menu"
          >
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 display overflow-y-auto p-6 space-y-8 scrollbar-hide">
        {/* Services Section */}
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-orange-500 mb-4">
            Services
          </p>
          <div className="overflow-hidden rounded-xl border border-slate-700/50 divide-y divide-slate-700/50">
            {sections.map((section, index) => (
              <button
                key={section.id}
                type="button"
                onClick={() => onSelectSection(section.id)}
                className={`w-full px-4 py-3 text-left transition-all duration-200 cursor-pointer ${section.id === activeSectionId
                  ? "bg-linear-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/50 scale-[1.02]"
                  : "bg-slate-800/50 backdrop-blur-sm text-slate-300 hover:bg-slate-800 hover:scale-[1.01]"
                  } ${index === 0 ? 'rounded-t-xl' : ''} ${index === sections.length - 1 ? 'rounded-b-xl' : 'border-b border-slate-700/50'}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold">{section.label}</p>
                    <p className={`text-xs mt-0.5 ${section.id === activeSectionId ? 'text-orange-100' : 'text-slate-400'}`}>
                      {section.description}
                    </p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${section.id === activeSectionId
                    ? 'bg-white/20 text-white'
                    : 'bg-orange-500/20 text-orange-400'
                    }`}>
                    {section.items.length}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Modules Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs uppercase tracking-[0.3em] text-blue-400 font-bold">
              {activeSection?.label ?? "Modules"}
            </p>
          </div>
          <div className="divide-y divide-slate-700/50 rounded-xl border border-slate-700/50">
            {activeSection ? (
              activeSection.items.map((item, index) => (
                <div key={item.id} className="hover:bg-slate-800/50 transition-colors duration-200">
                  <SidebarItem
                    key={item.id}
                    item={item}
                    active={activePathname.startsWith(item.path)}
                    onOpen={() => onOpenItem(item, activeSectionId)}
                    isFirst={index === 0}
                    isLast={index === activeSection.items.length - 1}
                  />
                </div>
              ))
            ) : (
              <div className="rounded-xl border-2 border-dashed border-slate-700 bg-slate-800/30 backdrop-blur-sm px-4 py-8 text-center">
                <svg className="w-12 h-12 mx-auto mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm text-slate-400 font-medium">
                  Select a service to view modules
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Account Section */}
      <div className="p-4 border-t border-slate-700/50 bg-slate-900/70">
        <AccountQuickAccess
          name={user?.fullName ?? user?.username ?? "Operator"}
          isAuthenticated={isAuthenticated}
          onLogout={logout}
        />
      </div>
    </aside>
  );
}

type SidebarItemProps = {
  item: SubMenuItem;
  active: boolean;
  onOpen: () => void;
  isFirst?: boolean;
  isLast?: boolean;
};

function SidebarItem({ item, active, onOpen, isFirst = false, isLast = false }: SidebarItemProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group flex w-full items-center gap-3 px-4 py-3 text-left transition-all duration-200 cursor-pointer ${active
        ? "bg-linear-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-500/50 scale-[1.02]"
        : "bg-slate-800/50 backdrop-blur-sm text-slate-300 hover:bg-slate-800/70"
        } ${isFirst ? 'rounded-t-xl' : ''} ${isLast ? 'rounded-b-xl' : ''}`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-all duration-200 ${active
        ? "bg-white/20 text-white"
        : "bg-blue-500/20 text-blue-400 group-hover:bg-blue-500/30"
        }`}>
        {item.menuNumber || item.label.slice(0, 2).toUpperCase()}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">{item.label}</p>
        <p className={`text-xs truncate ${active ? 'text-blue-100' : 'text-slate-400'}`}>
          {item.description}
        </p>
      </div>
    </button>
  );
}

type AccountQuickAccessProps = {
  name: string;
  isAuthenticated: boolean;
  onLogout: () => Promise<void>;
};

function AccountQuickAccess({
  name,
  isAuthenticated,
  onLogout,
}: AccountQuickAccessProps) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    try {
      await onLogout();
      router.push("/auth/login");
    } catch (error) {
      console.error("Logout error:", error);
      router.push("/auth/login");
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <Link
        href="/auth/login"
        className="flex items-center gap-3 rounded-xl bg-slate-800/60 backdrop-blur-md border border-slate-700/50 px-4 py-2 text-sm text-slate-300 transition-all duration-200 hover:bg-blue-600 hover:text-white hover:border-blue-700 hover:scale-105 active:scale-95 shadow-lg"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-linear-to-br from-blue-500 to-blue-700 shadow-lg">
          <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
          </svg>
        </div>
        <div className="flex flex-col text-left">
          <span className="text-xs uppercase tracking-wider text-blue-400 font-bold">
            Login
          </span>
          <span className="font-bold">Sign In</span>
        </div>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl bg-slate-800/60 backdrop-blur-md border border-slate-700/50 px-3 py-2 text-sm text-slate-300 shadow-xl">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-linear-to-br from-orange-500 to-orange-700 text-base font-bold text-white shadow-lg">
        {name.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex flex-col text-left">
        <span className="text-xs uppercase tracking-wider text-orange-400 font-bold">
          Account
        </span>
        <span className="font-bold truncate max-w-30 text-white">{name}</span>
      </div>
      <div className="ml-auto">
        <Link
          href="/account"
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition-all duration-200 hover:bg-blue-700 hover:scale-105 active:scale-95 shadow-md whitespace-nowrap"
        >
          Center
        </Link>
      </div>
    </div>
  );
}