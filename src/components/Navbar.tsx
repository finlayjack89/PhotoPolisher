import { Sparkles, FolderOpen, Settings, LogOut, Home, LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="nav-glass sticky top-0 z-50" data-testid="navbar">
      <div className="container mx-auto px-6 py-3 flex items-center justify-between">
        <div 
          className="flex items-center space-x-3 cursor-pointer group"
          onClick={() => navigate("/")}
          data-testid="link-home-logo"
        >
          <div className="w-9 h-9 bg-gradient-electric rounded-xl flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">LuxSnap</h1>
        </div>
        
        <nav className="flex items-center space-x-1">
          {user && (
            <>
              <Button 
                variant="ghost"
                size="sm" 
                onClick={() => navigate("/")}
                className={cn(
                  "rounded-xl px-4 transition-all duration-200",
                  isActive("/") 
                    ? "bg-primary/10 text-primary font-medium" 
                    : "hover:bg-accent/80"
                )}
                data-testid="link-home"
              >
                <Home className="h-4 w-4 mr-2" />
                Home
              </Button>
              <Button 
                variant="ghost"
                size="sm" 
                onClick={() => navigate("/library")}
                className={cn(
                  "rounded-xl px-4 transition-all duration-200",
                  isActive("/library") 
                    ? "bg-primary/10 text-primary font-medium" 
                    : "hover:bg-accent/80"
                )}
                data-testid="link-library"
              >
                <FolderOpen className="h-4 w-4 mr-2" />
                Library
              </Button>
              <Button 
                variant="ghost"
                size="sm" 
                onClick={() => navigate("/settings")}
                className={cn(
                  "rounded-xl px-4 transition-all duration-200",
                  isActive("/settings") 
                    ? "bg-primary/10 text-primary font-medium" 
                    : "hover:bg-accent/80"
                )}
                data-testid="link-settings"
              >
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </>
          )}
          
          <div className="h-6 w-px bg-border/30 mx-3" />
          
          {user ? (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={signOut}
              className="rounded-xl px-4 hover:bg-destructive/10 hover:text-destructive transition-all duration-200"
              data-testid="button-signout"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => navigate("/auth")}
                className="rounded-xl px-4 hover:bg-accent/80 transition-all duration-200"
                data-testid="button-signin"
              >
                <LogIn className="h-4 w-4 mr-2" />
                Sign In
              </Button>
              <Button 
                size="sm"
                className="btn-gradient rounded-xl shadow-md"
                onClick={() => navigate("/auth")}
                data-testid="button-signup"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Get Started
              </Button>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
};
