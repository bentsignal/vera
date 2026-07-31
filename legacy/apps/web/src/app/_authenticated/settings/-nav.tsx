import { Fragment, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { LogOut, MoveLeft } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@acme/ui/select";
import { Separator } from "@acme/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@acme/ui/sidebar";

import { useSignOut } from "~/features/auth/hooks/use-sign-out";
import { QuickLink } from "~/features/quick-link/quick-link";
import { cn } from "~/lib/utils";
import { settingsTabs } from "./-tabs";

const SIGN_OUT_VALUE = "__sign_out__";

export function SettingsNavMobile() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const signOut = useSignOut();

  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState(pathname);

  return (
    <div className="mb-4 flex flex-col items-center justify-center gap-4 md:hidden">
      <Select
        onValueChange={(next) => {
          setIsOpen(false);
          if (next === SIGN_OUT_VALUE) {
            void signOut();
            return;
          }
          setValue(next);
          void navigate({ to: next });
        }}
        value={value}
        open={isOpen}
        onOpenChange={setIsOpen}
      >
        <SelectTrigger className="w-full max-w-[300px]">
          <SelectValue placeholder="General" />
        </SelectTrigger>
        <SelectContent>
          {settingsTabs.map((group, groupIndex) => (
            <Fragment key={groupIndex}>
              {group.map((tab) => (
                <SelectItem key={tab.label} value={tab.href}>
                  <div className="flex items-center gap-2">
                    <tab.icon className="h-4 w-4" />
                    <span>{tab.label}</span>
                  </div>
                </SelectItem>
              ))}
              {groupIndex !== settingsTabs.length - 1 && <SelectSeparator />}
            </Fragment>
          ))}
          <SelectItem value={SIGN_OUT_VALUE}>
            <span className="flex items-center gap-2 text-sm">
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
      <QuickLink to="/home" className="text-muted-foreground text-sm">
        <div className="flex items-center gap-2">
          <MoveLeft className="h-4 w-4" />
          <span>Back to chat</span>
        </div>
      </QuickLink>
    </div>
  );
}

export function SettingsNavDesktop() {
  const { pathname } = useLocation();
  const signOut = useSignOut();

  return (
    <Sidebar collapsible="none" variant="floating" className="hidden md:flex">
      <SidebarContent>
        <SidebarMenu className="">
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="text-muted-foreground hover:text-primary active:bg-transparent"
            >
              <QuickLink to="/home" preload="render">
                <div className="flex items-center gap-2">
                  <MoveLeft className="h-4 w-4" />
                  <span>Back</span>
                </div>
              </QuickLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <Separator className="my-1" />
          {settingsTabs.map((group, index) => (
            <Fragment key={index}>
              {group.map((tab) => (
                <SidebarMenuItem key={tab.label} className="rounded-md">
                  <SidebarMenuButton
                    asChild
                    className={cn(
                      "active:bg-transparent",
                      pathname === tab.href && "bg-card/50",
                    )}
                  >
                    <QuickLink
                      to={tab.href}
                      preload="render"
                      className={cn(
                        "text-muted-foreground",
                        pathname === tab.href && "text-primary font-bold",
                      )}
                    >
                      <tab.icon className="h-4 w-4" />
                      <span>{tab.label}</span>
                    </QuickLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </Fragment>
          ))}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => void signOut()}
              className="text-muted-foreground hover:cursor-pointer active:bg-transparent"
            >
              <LogOut />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  );
}
