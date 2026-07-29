import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PasswordStrengthMeter } from '@/components/strength-meter';

interface AuthFormProps {
  mode: 'login' | 'register';
  onSubmit: (e: React.FormEvent) => void;
  onRegisterSubmit?: (formData: FormData, password: string) => void;
  onModeChange: (mode: 'login' | 'register') => void;
  onForgotPassword: () => void;
  message?: string | null;
  isLoading?: boolean;
}

export function AuthForm({
  mode,
  onSubmit,
  onRegisterSubmit,
  onModeChange,
  onForgotPassword,
  message,
  isLoading = false,
}: AuthFormProps) {
  const isLogin = mode === 'login';
  const [password, setPassword] = useState('');
  const isSuccessMessage = !!message && /success/i.test(message);

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-md border border-border bg-background">
            <span className="text-sm font-semibold">F</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-base font-semibold tracking-tight text-foreground">Flipper</h1>
            <p className="text-xs text-muted-foreground">Enterprise portal</p>
          </div>
        </div>
        <div className="flex flex-col gap-1 pt-2">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            {isLogin ? 'Sign in' : 'Create account'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isLogin ? 'Welcome back to your dashboard.' : 'Register with your invite code.'}
          </p>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {message && (
          <Alert variant={isSuccessMessage ? 'success' : 'destructive'}>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!isLogin && onRegisterSubmit) {
              const formData = new FormData(e.currentTarget);
              onRegisterSubmit(formData, password);
            } else {
              onSubmit(e);
            }
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={isLogin ? 'loginUsername' : 'regUsername'} className="text-xs font-medium text-muted-foreground">
              Username
            </Label>
            <Input
              id={isLogin ? 'loginUsername' : 'regUsername'}
              name="username"
              required
              autoComplete="username"
              placeholder={isLogin ? 'Enter your username' : 'Choose a username'}
              disabled={isLoading}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={isLogin ? 'loginPassword' : 'regPassword'} className="text-xs font-medium text-muted-foreground">
              Password
            </Label>
            {isLogin ? (
              <Input
                id="loginPassword"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                disabled={isLoading}
              />
            ) : (
              <PasswordStrengthMeter
                value={password}
                onValueChange={setPassword}
                placeholder="Create a password"
                showText={true}
                showRequirements={false}
                showRequirementsCount={false}
                showPasswordToggle={true}
                enableAutoGenerate={true}
                autoGenerateLength={12}
                strengthLabels={{
                  empty: 'Empty',
                  weak: 'Weak',
                  fair: 'Medium',
                  good: 'Medium',
                  strong: 'Strong',
                }}
                className="w-full"
              />
            )}
            {!isLogin && <input type="hidden" name="password" value={password} />}
          </div>

          {!isLogin && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inviteCode" className="text-xs font-medium text-muted-foreground">
                Invite code
              </Label>
              <Input
                id="inviteCode"
                name="inviteCode"
                required
                placeholder="Enter your invite code"
                disabled={isLoading}
              />
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Processing…' : isLogin ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <div className="flex flex-col gap-3 border-t border-border pt-4">
          {isLogin && (
            <button
              onClick={onForgotPassword}
              className="self-start text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              disabled={isLoading}
            >
              Forgot password?
            </button>
          )}

          <p className="text-xs text-muted-foreground">
            {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              onClick={() => onModeChange(isLogin ? 'register' : 'login')}
              className="font-medium text-foreground underline-offset-4 hover:underline"
              disabled={isLoading}
            >
              {isLogin ? 'Register' : 'Sign in'}
            </button>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
