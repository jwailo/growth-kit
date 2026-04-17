"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LayoutGrid, LogOut, Image, Camera } from "lucide-react";

const navItems = [
  {
    label: "Tile Engine",
    href: "/tile-engine",
    icon: LayoutGrid,
    children: [
      { label: "Assets", href: "/tile-engine/assets", icon: Image },
    ],
  },
  {
    label: "Headshot Finder",
    href: "/headshot-finder",
    icon: Camera,
  },
];

export function Sidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-screen w-60 flex-col bg-[#1C1E26] text-white">
      <div className="border-b border-white/10 px-5 py-5">
        <h1 className="text-lg font-bold tracking-tight">Growth Kit</h1>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <div key={item.href}>
              <Link
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[#EE0B4F] text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
              {isActive && "children" in item && item.children && (
                <div className="ml-4 mt-1 space-y-1 border-l border-white/10 pl-3">
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        pathname === child.href
                          ? "text-white"
                          : "text-white/50 hover:text-white/80"
                      }`}
                    >
                      <child.icon className="size-3.5" />
                      {child.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <p className="mb-2 truncate text-xs text-white/50">{userEmail}</p>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut className="size-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
