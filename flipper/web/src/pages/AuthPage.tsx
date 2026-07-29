import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { postJson, getJson } from '../utils/api';
import { AuthForm } from '../components/auth/AuthForm';
import { TotpForm } from '../components/auth/TotpForm';
import { ForgotPasswordDialog } from '../components/auth/ForgotPasswordDialog';
import { toast } from 'sonner';
// Removed top-level Alert usage to avoid duplicate messaging; AuthForm handles inline message display

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState<1 | 2 | 3>(1);
  const [fpTelegramUsername, setFpTelegramUsername] = useState('');
  const [fpCode, setFpCode] = useState('');
  const [fpNewPassword, setFpNewPassword] = useState('');
  const [fpConfirmPassword, setFpConfirmPassword] = useState('');
  const [forgotMsg, setForgotMsg] = useState<{
    text: string;
    type: 'info' | 'error' | 'success';
  } | null>(null);

  // 2FA state
  const [requires2FA, setRequires2FA] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [backupCodesAvailable, setBackupCodesAvailable] = useState(0);
  const [loginCredentials, setLoginCredentials] = useState<{
    username: string;
    password: string;
  } | null>(null);
  // Remember the last username typed in the login form so the password-reset
  // flow can use it without scraping the DOM.
  const [lastLoginUsername, setLastLoginUsername] = useState('');

  const navigate = useNavigate();

  async function handleTotpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!loginCredentials) return;

    setMessage(null);
    setIsLoading(true);

    const payload: any = {
      username: loginCredentials.username,
      password: loginCredentials.password,
    };

    // Send either TOTP code or backup code, not both
    if (totpCode) {
      payload.totpCode = totpCode;
    } else if (backupCode) {
      payload.backupCode = backupCode;
    }

    try {
      const res = await postJson('/auth/login', payload);

      // Login successful
      setMessage('Login successful. Checking subscription...');
      setRequires2FA(false);
      setLoginCredentials(null);
      setTotpCode('');
      setBackupCode('');
      setBackupCodesAvailable(0);

      const needsLink = res.user?.needs_telegram_link ?? res.user?.needsTelegramLink;
      if (needsLink) {
        return navigate('/auth/link-telegram');
      }

      try {
        const subRes = await fetch('/subscription/status', { credentials: 'include' });
        if (subRes.ok) {
          const subData = await subRes.json();
          if (!(subData.has_active_subscription ?? subData.hasActiveSubscription)) {
            setMessage('No active subscription. Redirecting...');
            return navigate('/subscriptions');
          }
        }
      } catch (_) {
        // ignore network error – fallback to dashboard
      }
      navigate('/dashboard');
    } catch (err: any) {
      const rawMsg = err?.message || '';
      if (/invalid authentication code/i.test(rawMsg) || /invalid.*totp/i.test(rawMsg)) {
        setMessage(
          'Invalid authentication code. Please check your authenticator app and try again.',
        );
      } else if (/invalid backup code/i.test(rawMsg)) {
        setMessage('Invalid backup code. Please check the code and try again.');
      } else if (/backup code.*used/i.test(rawMsg)) {
        setMessage('This backup code has already been used. Please try a different one.');
      } else if (/no backup codes/i.test(rawMsg)) {
        setMessage('No backup codes available. Please use your authenticator app.');
      } else {
        setMessage('Login failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setIsLoading(true);
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    const username = fd.get('username') as string;
    const password = fd.get('password') as string;
    setLastLoginUsername(username || '');
    const payload: any = { username, password };

    // Add TOTP code if in 2FA mode
    if (requires2FA && totpCode) {
      payload.totpCode = totpCode;
    }

    try {
      const res = await postJson('/auth/login', payload);

      // Check if 2FA is required
      if (res.requireTotp) {
        setRequires2FA(true);
        setLoginCredentials({ username, password });
        setBackupCodesAvailable(res.backupCodesAvailable || 0);
        const backupText =
          res.backupCodesAvailable > 0
            ? ` You can also use one of your ${res.backupCodesAvailable} backup codes.`
            : '';
        setMessage(
          res.message ||
            `Two-factor authentication is enabled for this account. Please enter your 6-digit authentication code.${backupText}`,
        );
        setIsLoading(false); // Reset loading state when showing 2FA form
        return;
      }

      // Login successful
      setMessage('Login successful. Checking subscription...');
      setRequires2FA(false);
      setLoginCredentials(null);
      setTotpCode('');

      const needsLink = res.user?.needs_telegram_link ?? res.user?.needsTelegramLink;
      if (needsLink) {
        return navigate('/auth/link-telegram');
      }

      try {
        const subRes = await fetch('/subscription/status', { credentials: 'include' });
        if (subRes.ok) {
          const subData = await subRes.json();
          if (!(subData.has_active_subscription ?? subData.hasActiveSubscription)) {
            setMessage('No active subscription. Redirecting...');
            return navigate('/subscriptions');
          }
        }
      } catch (_) {
        // ignore network error – fallback to dashboard
      }
      navigate('/dashboard');
    } catch (err: any) {
      const rawMsg = err?.message || '';
      if (/invalid credentials/i.test(rawMsg)) {
        setMessage('Invalid username or password. Please check your credentials and try again.');
      } else if (/invalid authentication code/i.test(rawMsg) || /invalid.*totp/i.test(rawMsg)) {
        setMessage('Invalid authentication code. Please check your authenticator app.');
      } else if (/authentication.*required/i.test(rawMsg) || /totp.*enabled/i.test(rawMsg)) {
        setMessage('Two-factor authentication is required for this account.');
      } else {
        setMessage('Login failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setIsLoading(true);
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    const payload = {
      username: fd.get('username'),
      password: fd.get('password'),
      inviteCode: fd.get('inviteCode'),
    };
    try {
      const res = await postJson('/auth/register', payload);
      setMessage('Registration successful! Redirecting to Telegram verification...');
      setTimeout(() => navigate('/auth/link-telegram'), 600);
    } catch (err: any) {
      const rawMsg = err?.message || '';
      if (/invalid invite code/i.test(rawMsg)) {
        setMessage('Invalid invite code');
      } else if (/invalid credentials/i.test(rawMsg)) {
        setMessage('Invalid credentials');
      } else {
        setMessage('Registration failed');
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRegisterSubmit(formData: FormData, password: string) {
    setMessage(null);
    setIsLoading(true);
    const payload = {
      username: formData.get('username'),
      password: password, // Use the password from the strength meter
      inviteCode: formData.get('inviteCode'),
    };
    try {
      const res = await postJson('/auth/register', payload);
      setMessage('Registration successful! Redirecting to Telegram verification...');
      setTimeout(() => navigate('/auth/link-telegram'), 600);
    } catch (err: any) {
      const rawMsg = err?.message || '';
      if (/invalid invite code/i.test(rawMsg)) {
        setMessage('Invalid invite code');
      } else if (/invalid credentials/i.test(rawMsg)) {
        setMessage('Invalid credentials');
      } else {
        setMessage('Registration failed');
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function fpRequest() {
    if (!fpTelegramUsername.trim()) {
      setForgotMsg({ text: 'Enter telegram username', type: 'error' });
      return;
    }
    setForgotMsg({ text: 'Sending...', type: 'info' });
    try {
      const tg = fpTelegramUsername.trim().replace(/^@/, '');
      const r = await postJson('/auth/password/request-telegram', { telegramUsername: tg });
      setForgotMsg({ text: r.message || 'If linked, a reset was sent.', type: 'success' });
      setForgotStep(2); // show OTP input
    } catch (e: any) {
      setForgotMsg({ text: e?.message || 'Network issue', type: 'error' });
    }
  }

  async function fpReset() {
    if (!fpCode || !fpNewPassword || !fpConfirmPassword) {
      setForgotMsg({ text: 'All fields required', type: 'error' });
      return;
    }
    if (fpNewPassword !== fpConfirmPassword) {
      setForgotMsg({ text: 'Passwords do not match', type: 'error' });
      return;
    }
    if (fpNewPassword.length < 8) {
      setForgotMsg({ text: 'Password too short', type: 'error' });
      return;
    }
    setForgotMsg({ text: 'Resetting...', type: 'info' });
    try {
      const payload: any = { code: fpCode, newPassword: fpNewPassword };
      if (lastLoginUsername) payload.username = lastLoginUsername;
      await postJson('/auth/password/reset', payload);
      setForgotMsg({ text: 'Password reset successful. You can login now.', type: 'success' });
    } catch (e: any) {
      setForgotMsg({ text: e?.message || 'Reset failed', type: 'error' });
    }
  }

  async function fpVerifyCode() {
    if (!fpCode || fpCode.trim().length !== 6) {
      setForgotMsg({ text: 'Enter the 6-digit code', type: 'error' });
      return;
    }
    // Verify the code server-side before letting the user pick a new password.
    // If the backend exposes a dedicated verify endpoint use it; otherwise the
    // /auth/password/reset call in fpReset is still the source of truth.
    setForgotMsg({ text: 'Verifying code...', type: 'info' });
    try {
      const r: any = await postJson('/auth/password/verify-code', { code: fpCode.trim() });
      if (r && r.valid === false) {
        setForgotMsg({ text: r.message || 'Invalid or expired code', type: 'error' });
        return;
      }
      setForgotMsg({ text: 'Code accepted. Enter your new password.', type: 'success' });
      setForgotStep(3);
    } catch (e: any) {
      const msg = e?.message || '';
      // If the verify endpoint isn't implemented (404/Not Found), fall back to
      // the prior behavior: accept the 6-digit code locally and let the final
      // /auth/password/reset request be the authoritative check.
      if (/404|not found|cannot (post|get)/i.test(msg)) {
        setForgotMsg({ text: 'Code accepted. Enter your new password.', type: 'success' });
        setForgotStep(3);
        return;
      }
      setForgotMsg({ text: msg || 'Invalid code', type: 'error' });
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="flex flex-col gap-4 w-full max-w-md">
        {requires2FA ? (
          <TotpForm
            totpCode={totpCode}
            onTotpChange={setTotpCode}
            backupCode={backupCode}
            onBackupCodeChange={setBackupCode}
            onSubmit={handleTotpSubmit}
            onBack={() => {
              setRequires2FA(false);
              setLoginCredentials(null);
              setTotpCode('');
              setBackupCode('');
              setBackupCodesAvailable(0);
              setMessage(null);
            }}
            message={message}
            isLoading={isLoading}
            backupCodesAvailable={backupCodesAvailable}
          />
        ) : (
          <AuthForm
            mode={mode}
            onSubmit={mode === 'login' ? handleLogin : handleRegister}
            onRegisterSubmit={handleRegisterSubmit}
            onModeChange={setMode}
            onForgotPassword={() => {
              setForgotOpen(true);
              setForgotStep(1);
              setForgotMsg(null);
            }}
            message={message}
            isLoading={isLoading}
          />
        )}
      </div>

      <ForgotPasswordDialog
        open={forgotOpen}
        onOpenChange={setForgotOpen}
        step={forgotStep}
        telegramUsername={fpTelegramUsername}
        onTelegramUsernameChange={setFpTelegramUsername}
        code={fpCode}
        onCodeChange={setFpCode}
        newPassword={fpNewPassword}
        onNewPasswordChange={setFpNewPassword}
        confirmPassword={fpConfirmPassword}
        onConfirmPasswordChange={setFpConfirmPassword}
        onRequestCode={fpRequest}
        onVerifyCode={fpVerifyCode}
        onResetPassword={fpReset}
        onBackToStep1={() => {
          setForgotStep(1);
          setForgotMsg(null);
        }}
        message={forgotMsg}
      />
    </div>
  );
}
