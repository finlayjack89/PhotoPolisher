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
    <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50" data-testid="navbar">
      <div className="container mx-auto px-6 py-4 flex items-center justify-between">
        <div 
          className="flex items-center space-x-3 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => navigate("/")}
          data-testid="link-home-logo"
        >
          <div className="w-8 h-8 bg-gradient-electric rounded-lg flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-electric-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground">LuxSnap</h1>
        </div>
        
        <nav className="flex items-center space-x-2">
          {user && (
            <>
              <Button 
                variant={isActive("/") ? "secondary" : "ghost"}
                size="sm" 
                onClick={() => navigate("/")}
                className={cn(
                  "transition-colors",
                  isActive("/") && "bg-secondary"
                )}
                data-testid="link-home"
              >
                <Home className="h-4 w-4 mr-2" />
                Home
              </Button>
              <Button 
                variant={isActive("/library") ? "secondary" : "ghost"}
                size="sm" 
                onClick={() => navigate("/library")}
                className={cn(
                  "transition-colors",
                  isActive("/library") && "bg-secondary"
                )}
                data-testid="link-library"
              >
                <FolderOpen className="h-4 w-4 mr-2" />
                Library
              </Button>
              <Button 
                variant={isActive("/settings") ? "secondary" : "ghost"}
                size="sm" 
                onClick={() => navigate("/settings")}
                className={cn(
                  "transition-colors",
                  isActive("/settings") && "bg-secondary"
                )}
                data-testid="link-settings"
              >
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </>
          )}
          
          <div className="h-6 w-px bg-border/50 mx-2" />
          
          {user ? (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={signOut}
              data-testid="button-signout"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          ) : (
            <>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => navigate("/auth")}
                data-testid="button-signin"
              >
                <LogIn className="h-4 w-4 mr-2" />
                Sign In
              </Button>
              <Button 
                size="sm"
                className="bg-gradient-electric text-electric-foreground hover:opacity-90"
                onClick={() => navigate("/auth")}
                data-testid="button-signup"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Sign Up
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
};
