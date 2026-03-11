import { useState } from "react";
import { useLogin, useRegister } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Globe, MapPin, Plane, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useI18n } from "@/lib/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What city were you born in?",
  "What is your mother's maiden name?",
  "What was the name of your first school?",
  "What is your favorite travel destination?",
  "What was the make of your first car?",
];

type AuthView = "login" | "register" | "forgot-username" | "forgot-answer" | "forgot-reset";

export default function AuthPage() {
  const { t, language, setLanguage, languageOptions } = useI18n();
  const [view, setView] = useState<AuthView>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");

  const [forgotUsername, setForgotUsername] = useState("");
  const [forgotQuestion, setForgotQuestion] = useState("");
  const [forgotAnswer, setForgotAnswer] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const loginMutation = useLogin();
  const registerMutation = useRegister();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (view === "login") {
      loginMutation.mutate(
        { username, password },
        {
          onError: (error: any) => {
            toast({
              title: "Login failed",
              description: parseError(error),
              variant: "destructive",
            });
          },
        }
      );
    } else if (view === "register") {
      if (!securityQuestion || !securityAnswer.trim()) {
        toast({
          title: "Missing fields",
          description: "Please select a security question and provide an answer",
          variant: "destructive",
        });
        return;
      }
      registerMutation.mutate(
        { username, password, securityQuestion, securityAnswer: securityAnswer.trim() },
        {
          onError: (error: any) => {
            toast({
              title: "Registration failed",
              description: parseError(error),
              variant: "destructive",
            });
          },
        }
      );
    }
  };

  const handleForgotSubmitUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    try {
      const res = await apiRequest("POST", "/api/forgot-password/question", { username: forgotUsername });
      const data = await res.json();
      setForgotQuestion(data.securityQuestion);
      setView("forgot-answer");
    } catch (error: any) {
      toast({
        title: "Not found",
        description: parseError(error),
        variant: "destructive",
      });
    } finally {
      setForgotLoading(false);
    }
  };

  const handleForgotReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    try {
      await apiRequest("POST", "/api/forgot-password/reset", {
        username: forgotUsername,
        securityAnswer: forgotAnswer.trim(),
        newPassword,
      });
      toast({ title: "Password reset", description: "You can now sign in with your new password." });
      resetForgotState();
      setView("login");
    } catch (error: any) {
      toast({
        title: "Reset failed",
        description: parseError(error),
        variant: "destructive",
      });
    } finally {
      setForgotLoading(false);
    }
  };

  const resetForgotState = () => {
    setForgotUsername("");
    setForgotQuestion("");
    setForgotAnswer("");
    setNewPassword("");
    setShowNewPassword(false);
  };

  const switchView = (newView: AuthView) => {
    setUsername("");
    setPassword("");
    setShowPassword(false);
    setSecurityQuestion("");
    setSecurityAnswer("");
    resetForgotState();
    setView(newView);
  };

  const isPending = loginMutation.isPending || registerMutation.isPending;

  const renderPasswordInput = (
    value: string,
    onChange: (val: string) => void,
    show: boolean,
    onToggle: () => void,
    placeholder: string,
    testId: string,
    autoComplete: string
  ) => (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-xl h-12 pr-12"
        autoComplete={autoComplete}
        data-testid={testId}
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        tabIndex={-1}
        data-testid={`${testId}-toggle`}
      >
        {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="w-full max-w-md p-8 rounded-3xl shadow-xl border border-border/50">
          <div className="mb-6">
            <Select value={language} onValueChange={(value) => setLanguage(value as typeof language)}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languageOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-primary/10 rounded-2xl">
              <Globe className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground" data-testid="text-auth-title">
                {view === "login" && t("auth.welcome")}
                {view === "register" && t("auth.create")}
                {(view === "forgot-username" || view === "forgot-answer" || view === "forgot-reset") && t("auth.reset")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {view === "login" && t("auth.signInBody")}
                {view === "register" && t("auth.createBody")}
                {view === "forgot-username" && "Enter your username to begin"}
                {view === "forgot-answer" && "Answer your security question"}
                {view === "forgot-reset" && "Choose a new password"}
              </p>
            </div>
          </div>

          {(view === "login" || view === "register") && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">{t("auth.username")}</label>
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
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">{t("auth.password")}</label>
                {renderPasswordInput(
                  password,
                  setPassword,
                  showPassword,
                  () => setShowPassword(!showPassword),
                  "Enter password",
                  "input-password",
                  view === "login" ? "current-password" : "new-password"
                )}
              </div>

              {view === "register" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">{t("auth.securityQuestion")}</label>
                    <Select value={securityQuestion} onValueChange={setSecurityQuestion}>
                      <SelectTrigger className="rounded-xl h-12" data-testid="select-security-question">
                        <SelectValue placeholder="Choose a security question" />
                      </SelectTrigger>
                      <SelectContent>
                        {SECURITY_QUESTIONS.map((q) => (
                          <SelectItem key={q} value={q}>{q}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">{t("auth.securityAnswer")}</label>
                    <Input
                      value={securityAnswer}
                      onChange={(e) => setSecurityAnswer(e.target.value)}
                      placeholder="Your answer"
                      className="rounded-xl h-12"
                      data-testid="input-security-answer"
                    />
                  </div>
                </>
              )}

              <Button
                type="submit"
                disabled={isPending || !username || !password}
                className="w-full h-12 rounded-xl text-base font-semibold"
                data-testid="button-submit-auth"
              >
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {view === "login" ? t("auth.signIn") : t("auth.createAccount")}
              </Button>
            </form>
          )}

          {view === "forgot-username" && (
            <form onSubmit={handleForgotSubmitUsername} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">Username</label>
                <Input
                  value={forgotUsername}
                  onChange={(e) => setForgotUsername(e.target.value)}
                  placeholder="Enter your username"
                  className="rounded-xl h-12"
                  data-testid="input-forgot-username"
                />
              </div>
              <Button
                type="submit"
                disabled={forgotLoading || !forgotUsername}
                className="w-full h-12 rounded-xl text-base font-semibold"
                data-testid="button-forgot-next"
              >
                {forgotLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Continue
              </Button>
            </form>
          )}

          {(view === "forgot-answer" || view === "forgot-reset") && (
            <form onSubmit={view === "forgot-answer" ? (e) => { e.preventDefault(); setView("forgot-reset"); } : handleForgotReset} className="space-y-4">
              {view === "forgot-answer" && (
                <>
                  <div className="p-3 bg-muted rounded-xl">
                    <p className="text-sm font-medium text-foreground">{forgotQuestion}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">Your Answer</label>
                    <Input
                      value={forgotAnswer}
                      onChange={(e) => setForgotAnswer(e.target.value)}
                      placeholder="Enter your answer"
                      className="rounded-xl h-12"
                      data-testid="input-forgot-answer"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={!forgotAnswer.trim()}
                    className="w-full h-12 rounded-xl text-base font-semibold"
                    data-testid="button-forgot-verify"
                  >
                    Continue
                  </Button>
                </>
              )}
              {view === "forgot-reset" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">New Password</label>
                    {renderPasswordInput(
                      newPassword,
                      setNewPassword,
                      showNewPassword,
                      () => setShowNewPassword(!showNewPassword),
                      "Enter new password",
                      "input-new-password",
                      "new-password"
                    )}
                  </div>
                  <Button
                    type="submit"
                    disabled={forgotLoading || !newPassword || newPassword.length < 6}
                    className="w-full h-12 rounded-xl text-base font-semibold"
                    data-testid="button-reset-password"
                  >
                    {forgotLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Reset Password
                  </Button>
                </>
              )}
            </form>
          )}

          <div className="mt-6 text-center space-y-2">
            {view === "login" && (
              <>
                <button
                  type="button"
                  onClick={() => switchView("forgot-username")}
                  className="block w-full text-sm text-muted-foreground hover:text-primary transition-colors"
                  data-testid="button-forgot-password"
                >
                  Forgot password?
                </button>
                <button
                  type="button"
                  onClick={() => switchView("register")}
                  className="text-sm text-primary font-medium"
                  data-testid="button-toggle-auth"
                >
                  Don't have an account? Sign up
                </button>
              </>
            )}
            {view === "register" && (
              <button
                type="button"
                onClick={() => switchView("login")}
                className="text-sm text-primary font-medium"
                data-testid="button-toggle-auth"
              >
                Already have an account? Sign in
              </button>
            )}
            {(view === "forgot-username" || view === "forgot-answer" || view === "forgot-reset") && (
              <button
                type="button"
                onClick={() => switchView("login")}
                className="inline-flex items-center gap-1 text-sm text-primary font-medium"
                data-testid="button-back-to-login"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to sign in
              </button>
            )}
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

function parseError(error: any): string {
  const msg = error.message?.includes(":")
    ? error.message.split(":").slice(1).join(":").trim()
    : error.message;
  try {
    return JSON.parse(msg)?.message || msg;
  } catch {
    return msg;
  }
}
