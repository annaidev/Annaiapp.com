import { useState } from "react";
import { useLogin, useRegister } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Globe, MapPin, Plane } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const loginMutation = useLogin();
  const registerMutation = useRegister();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const mutation = isLogin ? loginMutation : registerMutation;
    mutation.mutate(
      { username, password },
      {
        onError: (error: any) => {
          const msg = error.message?.includes(":")
            ? error.message.split(":").slice(1).join(":").trim()
            : error.message;
          let parsed = msg;
          try {
            parsed = JSON.parse(msg)?.message || msg;
          } catch {}
          toast({
            title: isLogin ? "Login failed" : "Registration failed",
            description: parsed,
            variant: "destructive",
          });
        },
      }
    );
  };

  const isPending = loginMutation.isPending || registerMutation.isPending;

  return (
    <div className="min-h-screen bg-background flex">
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="w-full max-w-md p-8 rounded-3xl shadow-xl border border-border/50">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-primary/10 rounded-2xl">
              <Globe className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Welcome to Annai</h1>
              <p className="text-sm text-muted-foreground">
                {isLogin ? "Sign in to your travel companion" : "Create your travel account"}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">Username</label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="rounded-xl h-12"
                autoComplete="username"
                data-testid="input-username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="rounded-xl h-12"
                autoComplete={isLogin ? "current-password" : "new-password"}
                data-testid="input-password"
              />
            </div>
            <Button
              type="submit"
              disabled={isPending || !username || !password}
              className="w-full h-12 rounded-xl text-base font-semibold"
              data-testid="button-submit-auth"
            >
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isLogin ? "Sign In" : "Create Account"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setUsername("");
                setPassword("");
              }}
              className="text-sm text-primary font-medium"
              data-testid="button-toggle-auth"
            >
              {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </Card>
      </div>

      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/10 items-center justify-center p-12">
        <div className="max-w-lg text-center space-y-8">
          <div className="flex justify-center gap-4">
            <div className="p-4 bg-primary/20 rounded-2xl">
              <Plane className="h-10 w-10 text-primary" />
            </div>
            <div className="p-4 bg-secondary/20 rounded-2xl">
              <MapPin className="h-10 w-10 text-secondary" />
            </div>
            <div className="p-4 bg-accent/20 rounded-2xl">
              <Globe className="h-10 w-10 text-accent" />
            </div>
          </div>
          <h2 className="text-4xl font-bold text-foreground">Your Travel Companion</h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Plan trips, track budgets, store documents, get AI-powered safety tips,
            local phrases, and weather forecasts — all in one place.
          </p>
        </div>
      </div>
    </div>
  );
}
