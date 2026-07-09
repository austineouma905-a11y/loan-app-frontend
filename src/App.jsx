import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import './App.css';

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const DEFAULT_API_BASE_URL = 'https://loan-app-backend-vg4d.onrender.com';
const isLocalBrowserHost = () => {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1'].includes(window.location.hostname);
};
const getApiBaseUrl = () => {
  const configuredUrl = String(process.env?.REACT_APP_API_BASE_URL || '').trim().replace(/\/$/, '');
  const isPublicHost = typeof window !== 'undefined' && window.location.hostname && !isLocalBrowserHost();
  const pointsToLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configuredUrl);

  if (!configuredUrl || (isPublicHost && pointsToLocalhost)) {
    return DEFAULT_API_BASE_URL;
  }

  return configuredUrl;
};
const API_BASE_URL = getApiBaseUrl();
const SIGNUP_NOTIFICATIONS_KEY = 'loan-app-pending-signups';
const LOCAL_USERS_KEY = 'loan-app-local-users';
const LOCAL_RESET_CODES_KEY = 'loan-app-local-reset-codes';
const USER_READ_NOTIFICATIONS_KEY = 'loan-app-read-user-notifications';
const AUTH_SESSION_KEY = 'loan-app-auth-session';
const ALLOW_LOCAL_AUTH_FALLBACK = isLocalBrowserHost()
  && String(process.env?.REACT_APP_ALLOW_LOCAL_AUTH_FALLBACK || '').toLowerCase() === 'true';
const ADMIN_EMAILS = String(process.env?.REACT_APP_ADMIN_EMAILS || process.env?.REACT_APP_ADMIN_EMAIL || 'austineouma905@gmail.com')
  .split(',')
  .map((email) => normalizeEmail(email))
  .filter(Boolean);
const isAdminEmail = (email) => ADMIN_EMAILS.includes(normalizeEmail(email));

const readStoredAuthSession = () => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const session = JSON.parse(window.localStorage.getItem(AUTH_SESSION_KEY) || 'null');
    return session && session.userProfile?.id ? session : null;
  } catch {
    return null;
  }
};

const writeStoredAuthSession = (session) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  } catch {}
};

const clearStoredAuthSession = () => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(AUTH_SESSION_KEY);
  } catch {}
};

const getPasswordStrength = (value = '') => {
  let score = 0;
  if (value.length >= 8) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;

  if (!value) return { label: '', level: 'empty', score: 0 };
  if (score <= 1) return { label: 'Weak', level: 'weak', score };
  if (score <= 3) return { label: 'Medium', level: 'medium', score };
  return { label: 'Strong', level: 'strong', score };
};

function LoadingSpinner({ label = 'Loading' }) {
  return (
    <span className="button-loading-content">
      <span className="button-spinner" aria-hidden="true"></span>
      <span>{label}</span>
    </span>
  );
}

function PasswordStrengthMeter({ value }) {
  const strength = getPasswordStrength(value);
  if (!value) return null;

  return (
    <div className="password-strength-wrap">
      <div className="password-strength-track">
        <span className={`password-strength-fill strength-${strength.level}`}></span>
      </div>
      <span className={`password-strength-label strength-${strength.level}`}>
        {strength.label}
      </span>
    </div>
  );
}

const parseRate = (rateValue) => parseFloat(String(rateValue || '').replace(/[^\d.]/g, '')) || 0;

const addMonthsToDate = (months) => {
  const date = new Date();
  date.setMonth(date.getMonth() + Number(months || 1));
  return date;
};

const formatDateLong = (date) => (
  date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
);

const getLoanQuote = (amount, rateValue, durationMonths) => {
  const principal = Number(amount);
  const months = Math.max(parseInt(durationMonths, 10) || 1, 1);
  const annualRate = parseRate(rateValue);
  const safePrincipal = Number.isFinite(principal) && principal > 0 ? principal : 0;
  const interest = safePrincipal * (annualRate / 100) * (months / 12);
  const repaymentTotal = safePrincipal + interest;
  const dueDate = addMonthsToDate(months);

  return {
    principal: safePrincipal,
    annualRate,
    months,
    interest,
    repaymentTotal,
    dueDate,
    dueDateIso: dueDate.toISOString().slice(0, 10),
    dueDateLabel: formatDateLong(dueDate)
  };
};

const getLoanAmountBounds = (loan) => {
  const amounts = Array.isArray(loan?.amounts) && loan.amounts.length > 0 ? loan.amounts : [1000, 5000];
  return {
    min: Math.min(...amounts),
    max: Math.max(...amounts),
    step: 500
  };
};


function AuthView({ 
  authMode, setAuthMode, email, setEmail, phone, setPhone, 
  firstName, setFirstName, lastName, setLastName,
  password, setPassword, confirmPassword, setConfirmPassword, 
  handleLoginSubmit, handleSignUpSubmit, handleForgotPasswordSubmit,
  handleVerifyOtpSubmit, handleResetPasswordSubmit,
  signupLoading = false,
  loginLoading = false
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // --- Dynamic Forgot Password Sub-Steps States ---
  const [forgotStep, setForgotStep] = useState(1); // 1: Email Request, 2: 4-Digit OTP, 3: Password Reset Entry
  const [otpArray, setOtpArray] = useState(['', '', '', '']);
  const [timer, setTimer] = useState(60);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const inputRefs = [useRef(), useRef(), useRef(), useRef()];
  useEffect(() => {
    if (authMode === 'forgot' && forgotStep === 2 && timer > 0) {
      const countdown = setTimeout(() => setTimer(timer - 1), 1000);
      return () => clearTimeout(countdown);
    }
  }, [timer, forgotStep, authMode]);
  const handleOtpChange = (val, index) => {
    const numericVal = val.replace(/[^0-9]/g, '');

    const updatedOtp = [...otpArray];
    updatedOtp[index] = numericVal.substring(numericVal.length - 1);
    setOtpArray(updatedOtp);

    if (numericVal && index < 3) {
      inputRefs[index + 1].current.focus();
    }
  };

  const handleOtpKeyDown = (e, index) => {
    if (e.key === 'Backspace' && !otpArray[index] && index > 0) {
      inputRefs[index - 1].current.focus();
    }
  };

  // Step 1 Send Email Verification Trace
  const onEmailSubmit = async (e) => {
    e.preventDefault();
    const cleanEmail = normalizeEmail(email);
    setEmail(cleanEmail);
    setIsSubmitting(true);
    const success = await handleForgotPasswordSubmit(cleanEmail);
    setIsSubmitting(false);
    if (success) {
      setForgotStep(2);
      setTimer(60);
    }
  };

  // Step 2 Verify 4 Digits Over Backend Bridge
  const onOtpSubmit = async (e) => {
    e.preventDefault();
    const fullOtp = otpArray.join('');
    if (fullOtp.length < 4) return;

    setIsSubmitting(true);
    try {
      const cleanEmail = normalizeEmail(email);
      const success = await handleVerifyOtpSubmit(cleanEmail, fullOtp);
      if (success) {
        setForgotStep(3);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 3  Commit New Hashed Password to MySQL
  const onNewPasswordSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 8) {
      alert("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      alert("Passwords do not match!");
      return;
    }

    setIsSubmitting(true);
    try {
      const cleanEmail = normalizeEmail(email);
      const success = await handleResetPasswordSubmit(cleanEmail, password, otpArray.join(''));
      if (success) {
        setForgotStep(1);
        setOtpArray(['', '', '', '']);
        setPassword('');
        setConfirmPassword('');
        setAuthMode('login');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // RENDER INTERNALS
  if (authMode === 'forgot') {
    return (
      <div className="auth-view">
        <h2>Reset Password</h2>
        
        {forgotStep === 1 && (
          <>
            <p className="auth-subtitle">Enter your registered email address to receive password reset code.</p>
            <form onSubmit={onEmailSubmit} className="auth-form">
              <div className="input-group">
                <label>Email Address:</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="enter your email" required />
              </div>
              <button type="submit" className="auth-submit-btn" disabled={isSubmitting}>
                {isSubmitting ? 'Sending...' : 'Reset Password'}
              </button>
            </form>
          </>
        )}

        {forgotStep === 2 && (
          <>
            <p className="auth-subtitle">Enter the 4-digit code sent to your email.</p>
            <form onSubmit={onOtpSubmit} className="auth-form">
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', margin: '20px 0' }}>
                {otpArray.map((digit, index) => (
                  <input
                    key={index}
                    type="text"
                    maxLength="1"
                    value={digit}
                    ref={inputRefs[index]}
                    onChange={(e) => handleOtpChange(e.target.value, index)}
                    onKeyDown={(e) => handleOtpKeyDown(e, index)}
                    style={{
                      width: '45px',
                      height: '45px',
                      textAlign: 'center',
                      fontSize: '20px',
                      borderRadius: '6px',
                      border: '1px solid #ccc',
                      background: '#102a45',
                      color: '#fff'
                    }}
                    required
                  />
                ))}
              </div>
              
              <div style={{ textAlign: 'center', marginBottom: '15px', fontSize: '14px', color: 'whitesmoke' }}>
                {timer > 0 ? (
                  <span>Time Count {timer} seconds</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setTimer(60); handleForgotPasswordSubmit(normalizeEmail(email)); }}
                    style={{ color: '#f49e2f', cursor: 'pointer', textDecoration: 'underline', background: 'none', border: 0, padding: 0 }}
                  >
                    Resend Code?
                  </button>
                )}
              </div>

              <button type="submit" className="auth-submit-btn" disabled={isSubmitting}>
                {isSubmitting ? 'Verifying...' : 'Verify Code'}
              </button>
            </form>
          </>
        )}

        {forgotStep === 3 && (
          <>
            <p className="auth-subtitle">Create your new profile credentials password layout.</p>
            <form onSubmit={onNewPasswordSubmit} className="auth-form">
              <div className="input-group">
                <label>New Password (minimum 8 characters)</label>
                <div className="password-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    placeholder="Minimum 8 characters" 
                    style={{ width: '100%', paddingRight: '40px' }}
                    required 
                  />
                  <span 
                    className="password-toggle-eye" 
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: '12px', cursor: 'pointer', userSelect: 'none', fontSize: '20px', color: '#f49e2f', display: 'flex', alignItems: 'center' }}
                  >
                    {showPassword ? <ion-icon name="eye-off-outline"></ion-icon> : <ion-icon name="eye-outline"></ion-icon>}
                  </span>
                </div>
              </div>
              <div className="input-group">
                <label>Confirm New Password</label>
                <div className="password-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input 
                    type={showConfirmPassword ? "text" : "password"} 
                    value={confirmPassword} 
                    onChange={(e) => setConfirmPassword(e.target.value)} 
                    placeholder="Confirm password" 
                    style={{ width: '100%', paddingRight: '40px' }}
                    required 
                  />
                  <span 
                    className="password-toggle-eye" 
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={{ position: 'absolute', right: '12px', cursor: 'pointer', userSelect: 'none', fontSize: '20px', color: '#f49e2f', display: 'flex', alignItems: 'center' }}
                  >
                    {showConfirmPassword ? <ion-icon name="eye-off-outline"></ion-icon> : <ion-icon name="eye-outline"></ion-icon>}
                  </span>
                </div>
              </div>
              <button type="submit" className="auth-submit-btn" disabled={isSubmitting}>
                Confirm new Password
              </button>
            </form>
          </>
        )}

        <p className="auth-toggle-text">
          <span onClick={() => { setForgotStep(1); setAuthMode('login'); }} className="auth-link">Back to Login</span>
        </p>
      </div>
    );
  }

  if (authMode === 'login') {
    return (
      <div className="auth-view">
        <h2>Account Login</h2>
        <p className="auth-subtitle">Welcome To Our Loan App</p>
        <form onSubmit={(e) => { e.preventDefault(); handleLoginSubmit(); }} className="auth-form" autoComplete="off">
          <div className="input-group">
            <label>Email: </label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="enter your email" required disabled={loginLoading} autoComplete="new-email" name="login-email" />
          </div>
          
          <div className="input-group">
            <label>Password</label>
            <div className="password-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input 
                type={showPassword ? "text" : "password"} 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder="enter password" 
                style={{ width: '100%', paddingRight: '40px' }}
                disabled={loginLoading}
                autoComplete="new-password"
                name="login-password"
                required 
              />
              <span 
                className="password-toggle-eye" 
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '12px', cursor: 'pointer', userSelect: 'none', fontSize: '20px', color: '#f49e2f', display: 'flex', alignItems: 'center' }}
              >
                {showPassword ? (
                  <ion-icon name="eye-off-outline"></ion-icon>
                ) : (
                  <ion-icon name="eye-outline"></ion-icon>
                )}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', color: 'whitesmoke', margin: 0, userSelect: 'none' }}>
                <input 
                  type="checkbox" 
                  checked={rememberMe} 
                  onChange={(e) => setRememberMe(e.target.checked)} 
                  style={{ cursor: 'pointer', margin: 0 }}
                />
                Remember me
              </label>
              
              <button
                type="button"
                onClick={() => {
                  setForgotStep(1);
                  setOtpArray(['', '', '', '']);
                  setAuthMode('forgot');
                }}
                className="auth-link"
                style={{ fontSize: '13px', cursor: 'pointer', marginLeft: 'auto', background: 'none', border: 0, padding: 0 }}
              >
                Forgot Password?
              </button>
            </div>
          </div>
          
          <button type="submit" className="auth-submit-btn" disabled={loginLoading}>
            {loginLoading ? <LoadingSpinner label="Logging in..." /> : 'Login'}
          </button>
        </form>
        <p className="auth-toggle-text">
          Don't have an account? <span onClick={() => setAuthMode('signup')} className="auth-link">Sign Up</span>
        </p>
      </div>
    );
  }

  return (
    <div className="auth-view">
      <h2>Create Profile</h2>
      <p className="auth-subtitle">Register to access Our Loan Services.</p>
      <form onSubmit={(e) => { e.preventDefault(); handleSignUpSubmit(); }} className="auth-form">
        <div className="input-group">
          <label>First Name</label>
          <input type="text" value={firstName} onChange={(e) => setFirstName(sanitizeNameInput(e.target.value))} placeholder="First name" required pattern="[A-Za-z]+(?:[ '-][A-Za-z]+)*" title="Use letters only. Spaces, hyphens, and apostrophes are allowed." maxLength="40" />
        </div>
        <div className="input-group">
          <label>Last Name</label>
          <input type="text" value={lastName} onChange={(e) => setLastName(sanitizeNameInput(e.target.value))} placeholder="Last name" required pattern="[A-Za-z]+(?:[ '-][A-Za-z]+)*" title="Use letters only. Spaces, hyphens, and apostrophes are allowed." maxLength="40" />
        </div>
        <div className="input-group">
          <label>Email Address</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="enter your email" required />
        </div>
        <div className="input-group">
          <label>Phone Number</label>
          <input type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(digitsOnly(e.target.value))} placeholder="enter phone number" required />
        </div>
        
        <div className="input-group">
          <label>Password</label>
          <div className="password-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input 
              type={showPassword ? "text" : "password"} 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              placeholder="password" 
              style={{ width: '100%', paddingRight: '40px' }}
              required 
            />
            <span 
              className="password-toggle-eye" 
              onClick={() => setShowPassword(!showPassword)}
              style={{ position: 'absolute', right: '12px', cursor: 'pointer', userSelect: 'none', fontSize: '20px', color: '#f49e2f', display: 'flex', alignItems: 'center' }}
            >
              {showPassword ? (
                <ion-icon name="eye-off-outline"></ion-icon>
              ) : (
                <ion-icon name="eye-outline"></ion-icon>
              )}
            </span>
          </div>
          <PasswordStrengthMeter value={password} />
        </div>
        
        <div className="input-group">
          <label>Confirm Password</label>
          <div className="password-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input 
              type={showConfirmPassword ? "text" : "password"} 
              value={confirmPassword} 
              onChange={(e) => setConfirmPassword(e.target.value)} 
              placeholder="confirm password" 
              style={{ width: '100%', paddingRight: '40px' }}
              required 
            />
            <span 
              className="password-toggle-eye" 
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              style={{ position: 'absolute', right: '12px', cursor: 'pointer', userSelect: 'none', fontSize: '20px', color: '#f49e2f', display: 'flex', alignItems: 'center' }}
            >
              {showConfirmPassword ? (
                <ion-icon name="eye-off-outline"></ion-icon>
              ) : (
                <ion-icon name="eye-outline"></ion-icon>
              )}
            </span>
          </div>
        </div>
        
        <button type="submit" className="auth-submit-btn" disabled={signupLoading}>
          {signupLoading ? <LoadingSpinner label="Creating..." /> : 'Sign-Up'}
        </button>
      </form>
      <p className="auth-toggle-text">
        Already have an account? <span onClick={() => setAuthMode('login')} className="auth-link">Login</span>
      </p>
    </div>
  );
}

function TransactionHistory({ userId }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const BASE_URL = API_BASE_URL;

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setError('');
    fetch(`${BASE_URL}/api/transactions/${userId}`)
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setError(data.message || 'Unable to load transactions.');
          setTransactions([]);
          return;
        }
        setTransactions(data.transactions || []);
      })
      .catch(() => setError('Cannot connect to transaction records.'))
      .finally(() => setLoading(false));
  }, [userId, BASE_URL]);

  return (
    <div className="view-fade-in transaction-history-view">
      <h2>Transaction History</h2>
      {loading ? (
        <TableSkeleton rows={6} columns={6} />
      ) : error ? (
        <div className="loan-status-error">{error}</div>
      ) : transactions.length === 0 ? (
        <p className="loan-status-empty-text">No transactions found.</p>
      ) : (
        <div className="responsive-table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Transaction Type</th>
                <th>Amount</th>
                <th>Status</th>
                <th>M-Pesa Receipt</th>
                <th>Mode</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => {
                const type = t.transaction_type || (Number(t.amount) < 0 ? 'Repayment' : 'Loan Disbursement');
                const displayStatus = t.display_status || (t.status === 'Disbursed' ? 'Completed' : t.status);
                const receipt = t.receipt_number || (
                  type === 'Repayment' && displayStatus === 'Pending'
                    ? 'Awaiting callback'
                    : t.account_number || '-'
                );

                return (
                  <tr key={t.transaction_id || t.id}>
                    <td>{formatLoanDate(t.completed_at || t.date_applied)}</td>
                    <td>{type}</td>
                    <td className={Number(t.amount) < 0 ? 'amount-credit' : 'amount-debit'}>
                      {Number(t.amount) < 0 ? '-' : '+'} {formatKes(Math.abs(Number(t.amount)))}
                    </td>
                    <td>
                      <span className={`table-status status-${String(displayStatus).toLowerCase()}`}>
                        {displayStatus}
                      </span>
                    </td>
                    <td>{receipt}</td>
                    <td>{t.payment_mode || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// const thStyle = { padding: '10px', textAlign: 'left', color: '#f49e2f' };
// const tdStyle = { padding: '10px' };



// const th = { padding: '10px', textAlign: 'left', color: '#f49e2f' };
// const td = { padding: '10px' };

const getLoanValue = (loan, keys, fallback = '') => {
  if (!loan) return fallback;

  for (const key of keys) {
    const value = loan[key];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return fallback;
};

const USER_STATUS_KEYS = ['account_status', 'accountStatus', 'verification_status', 'verificationStatus', 'status'];
const USER_VERIFICATION_KEYS = ['is_verified', 'isVerified', 'verified', 'approved', 'is_approved', 'isApproved'];
const LOAN_STATUS_KEYS = ['status', 'loan_status', 'loanStatus', 'approval_status', 'approvalStatus'];

const titleCaseStatus = (value) => (
  String(value || '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
);

const normalizeStatusText = (value) => String(value || '').trim().toLowerCase();

const statusIncludesAny = (value, words) => {
  const normalized = normalizeStatusText(value);
  return words.some((word) => normalized.includes(word));
};

const isAffirmativeValue = (value) => {
  if (value === undefined || value === null || value === '') return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;

  return ['true', '1', 'yes', 'verified', 'approved', 'active'].includes(normalizeStatusText(value));
};

const isNegativeValue = (value) => {
  if (value === undefined || value === null || value === '') return false;
  if (typeof value === 'boolean') return !value;
  if (typeof value === 'number') return value === 0;

  return ['false', '0', 'no', 'pending', 'unverified', 'rejected', 'declined'].includes(normalizeStatusText(value));
};

const getUserStatusText = (user) => getLoanValue(user, USER_STATUS_KEYS, '');

const getUserRecordId = (user) => getLoanValue(user, ['id', 'userId', 'user_id'], '');

const getUserRecordEmail = (user) => normalizeEmail(getLoanValue(user, ['email'], ''));
const getUserPhoneDisplay = (user) => getLoanValue(user, ['phone', 'phoneNumber', 'phone_number'], '-') || '-';

const recordsReferToSameUser = (first, second) => {
  const firstId = String(getUserRecordId(first) || '');
  const secondId = String(getUserRecordId(second) || '');
  const firstEmail = getUserRecordEmail(first);
  const secondEmail = getUserRecordEmail(second);

  return Boolean((firstId && secondId && firstId === secondId) || (firstEmail && secondEmail && firstEmail === secondEmail));
};

const recordMatchesEmail = (record, email) => {
  const cleanEmail = normalizeEmail(email);
  return Boolean(cleanEmail && getUserRecordEmail(record) === cleanEmail);
};

const removeUserFromPendingRecords = (records, userOrEmail) => {
  const cleanEmail = typeof userOrEmail === 'string' ? normalizeEmail(userOrEmail) : getUserRecordEmail(userOrEmail);
  return records.filter((record) => {
    if (recordMatchesEmail(record, cleanEmail)) return false;
    if (typeof userOrEmail !== 'string' && recordsReferToSameUser(record, userOrEmail)) return false;
    return true;
  });
};

const getUserDisplayName = (user) => {
  const directName = String(getLoanValue(user, ['name', 'full_name', 'fullName'], '') || '').trim();
  if (directName) return directName;

  const joinedName = `${getLoanValue(user, ['first_name', 'firstName'], '')} ${getLoanValue(user, ['last_name', 'lastName'], '')}`.trim();
  if (joinedName) return joinedName;

  return 'User';
};

const isUserPendingVerification = (user) => {
  if (!user) return false;
  if (user.pendingVerification === true) return true;

  const explicitVerification = getLoanValue(user, USER_VERIFICATION_KEYS, null);
  if (isNegativeValue(explicitVerification)) return true;
  if (isAffirmativeValue(explicitVerification)) return false;
  if (user.pendingVerification === false) return false;
  if (user.source === 'local-signup') {
    return !statusIncludesAny(getUserStatusText(user), ['verified', 'approved', 'active']);
  }

  return statusIncludesAny(getUserStatusText(user), ['pending', 'review', 'processing', 'progress', 'unverified', 'waiting', 'new']);
};

const getUserVerificationLabel = (user) => {
  if (isUserPendingVerification(user)) return 'Pending Verification';

  const statusText = getUserStatusText(user);
  if (statusText) return titleCaseStatus(statusText);

  return 'Verified';
};

const getLoanStatusText = (loanOrStatus) => (
  typeof loanOrStatus === 'object'
    ? getLoanValue(loanOrStatus, LOAN_STATUS_KEYS, '')
    : loanOrStatus
);

const isPendingLoanStatus = (loanOrStatus) => (
  statusIncludesAny(getLoanStatusText(loanOrStatus), ['pending', 'review', 'processing', 'progress', 'request'])
);

const isRepaymentRecord = (record) => (
  Number(getLoanValue(record, ['amount'], 0)) < 0
  || normalizeStatusText(getLoanValue(record, ['transaction_type', 'transactionType', 'loan_type', 'loanType'], '')).includes('repayment')
);

const isApprovedLoanStatus = (loanOrStatus) => (
  statusIncludesAny(getLoanStatusText(loanOrStatus), ['approved', 'disbursed', 'active'])
);

const isRejectedLoanStatus = (loanOrStatus) => (
  statusIncludesAny(getLoanStatusText(loanOrStatus), ['reject', 'declined', 'failed', 'denied'])
);

const getTableStatusClass = (status) => {
  if (isApprovedLoanStatus(status) || statusIncludesAny(status, ['verified', 'paid', 'complete', 'completed'])) {
    return 'status-completed';
  }

  if (isRejectedLoanStatus(status) || statusIncludesAny(status, ['unverified'])) {
    return 'status-failed';
  }

  return 'status-pending';
};

const readStoredArray = (key) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const stored = JSON.parse(window.localStorage.getItem(key) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
};

const writeStoredArray = (key, records) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, JSON.stringify(records));
  } catch {}
};

const readStoredObject = (key) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return {};
    const stored = JSON.parse(window.localStorage.getItem(key) || '{}');
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  } catch {
    return {};
  }
};

const writeStoredObject = (key, record) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, JSON.stringify(record));
  } catch {}
};

const readStoredSignupNotifications = () => readStoredArray(SIGNUP_NOTIFICATIONS_KEY);

const writeStoredSignupNotifications = (notifications) => {
  writeStoredArray(SIGNUP_NOTIFICATIONS_KEY, notifications);
};

const readStoredLocalUsers = () => readStoredArray(LOCAL_USERS_KEY);

const writeStoredLocalUsers = (users) => {
  writeStoredArray(LOCAL_USERS_KEY, users);
};

const upsertLocalUser = (currentUsers, user) => {
  const withoutDuplicate = currentUsers.filter((item) => !recordsReferToSameUser(item, user));
  return [user, ...withoutDuplicate];
};

const readStoredResetCodes = () => readStoredArray(LOCAL_RESET_CODES_KEY);

const writeStoredResetCodes = (codes) => {
  writeStoredArray(LOCAL_RESET_CODES_KEY, codes);
};

const getNotificationReadAccountKey = (userId, email) => (
  String(userId || normalizeEmail(email) || 'guest')
);

const readStoredUserNotificationKeys = (userId, email) => {
  const storage = readStoredObject(USER_READ_NOTIFICATIONS_KEY);
  const keys = storage[getNotificationReadAccountKey(userId, email)];
  return Array.isArray(keys) ? keys : [];
};

const writeStoredUserNotificationKeys = (userId, email, keys) => {
  const storage = readStoredObject(USER_READ_NOTIFICATIONS_KEY);
  storage[getNotificationReadAccountKey(userId, email)] = Array.from(new Set(keys)).slice(-100);
  writeStoredObject(USER_READ_NOTIFICATIONS_KEY, storage);
};

const createLocalUserId = () => `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createLocalLoanId = () => `LNX-${String(Date.now()).slice(-6)}`;

const createLocalResetCode = () => String(Math.floor(1000 + Math.random() * 9000));

const getValidLocalResetCode = (email, otp) => {
  const cleanEmail = normalizeEmail(email);
  const code = String(otp || '');
  return readStoredResetCodes().find((record) => (
    normalizeEmail(record.email) === cleanEmail &&
    String(record.code) === code &&
    Number(record.expiresAt || 0) > Date.now()
  ));
};

const clearLocalResetCode = (email) => {
  const cleanEmail = normalizeEmail(email);
  writeStoredResetCodes(readStoredResetCodes().filter((record) => normalizeEmail(record.email) !== cleanEmail));
};

const parseResponseBody = async (response) => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const formatKes = (amount) => {
    const numericAmount = Number(amount);
    const safeAmount = Number.isFinite(numericAmount) ? numericAmount : 0;
    return `KES ${safeAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const digitsOnly = (value = '') => String(value || '').replace(/\D/g, '');
const isDigitsOnly = (value = '') => /^\d+$/.test(String(value || ''));
const sanitizeNameInput = (value = '') => String(value || '').replace(/[^A-Za-z '-]/g, '').replace(/\s{2,}/g, ' ');
const isValidPersonName = (value = '') => {
  const cleanValue = String(value || '').trim();
  const letterCount = (cleanValue.match(/[A-Za-z]/g) || []).length;
  return letterCount >= 2 && /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/.test(cleanValue);
};
const isValidKenyanNationalId = (value = '') => /^\d{8,9}$/.test(String(value || ''));
const parseCurrencyInput = (value = '') => {
  const numericValue = Number(digitsOnly(value));
  return Number.isFinite(numericValue) ? numericValue : 0;
};
const formatCurrencyInput = (value = '') => {
  const cleanValue = digitsOnly(value);
  return cleanValue ? Number(cleanValue).toLocaleString() : '';
};

function TableSkeleton({ rows = 5, columns = 4 }) {
  return (
    <div className="responsive-table-shell skeleton-table-shell" aria-label="Loading records">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="skeleton-table-row" style={{ gridTemplateColumns: `repeat(${columns}, minmax(92px, 1fr))` }}>
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <span key={columnIndex} className="skeleton-line"></span>
          ))}
        </div>
      ))}
    </div>
  );
}

const formatLoanDate = (dateValue) => {
  if (!dateValue) return 'Not available';

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 'Not available';

  return date.toLocaleDateString();
};

const buildUserNotifications = (records = [], loanBalance = 0) => {
  const items = [];
  const seenKeys = new Set();

  const pushItem = (item) => {
    if (!item || seenKeys.has(item.key)) return;
    seenKeys.add(item.key);
    items.push(item);
  };

  records.forEach((record) => {
    if (!record) return;

    const loanId = String(getLoanValue(record, ['id', 'loanId', 'loan_id'], '') || '');
    const loanType = getLoanValue(record, ['loan_type', 'loanType'], 'Loan');
    const status = normalizeStatusText(getLoanStatusText(record) || getLoanValue(record, ['display_status'], ''));
    const amount = Number(getLoanValue(record, ['amount', 'loan_amount'], 0)) || 0;
    const dateValue = getLoanValue(record, ['completed_at', 'date_applied', 'createdAt', 'created_at', 'date'], '');
    const failureReason = getLoanValue(record, ['failure_reason'], '');
    const keySeed = loanId || `${loanType}-${amount}-${dateValue}`;

    if (statusIncludesAny(status, ['approved', 'disbursed', 'active'])) {
      pushItem({
        key: `approved-${keySeed}`,
        title: `${loanType} approved`,
        message: amount > 0
          ? `Your loan request for ${formatKes(amount)} has been approved.`
          : 'Your loan request has been approved.',
        tone: 'success',
        kind: 'loan-decision',
        date: dateValue,
        amount
      });
      return;
    }

    if (statusIncludesAny(status, ['rejected', 'declined', 'failed', 'denied'])) {
      pushItem({
        key: `rejected-${keySeed}`,
        title: `${loanType} rejected`,
        message: failureReason || 'Your loan request was not approved.',
        tone: 'danger',
        kind: 'loan-decision',
        date: dateValue,
        amount
      });
      return;
    }

    if (amount < 0) {
      pushItem({
        key: `repayment-${keySeed}`,
        title: 'Repayment recorded',
        message: `A repayment of ${formatKes(Math.abs(amount))} was posted to your account.`,
        tone: 'info',
        kind: 'account-activity',
        date: dateValue,
        amount
      });
    }
  });

  return items.sort((first, second) => {
    const firstTime = new Date(first.date || 0).getTime() || 0;
    const secondTime = new Date(second.date || 0).getTime() || 0;

    if (secondTime !== firstTime) return secondTime - firstTime;

    return String(second.key).localeCompare(String(first.key));
  });
};

const getLatestLoanRecord = (records = []) => {
  if (!Array.isArray(records)) return null;

  return records
    .filter((record) => record && (
      getLoanValue(record, ['loan_type', 'loanType']) ||
      getLoanValue(record, ['status']) ||
      getLoanValue(record, ['amount'])
    ))
    .sort((first, second) => {
      const firstDate = new Date(getLoanValue(first, ['date_applied', 'createdAt', 'created_at', 'date'])).getTime() || 0;
      const secondDate = new Date(getLoanValue(second, ['date_applied', 'createdAt', 'created_at', 'date'])).getTime() || 0;

      if (secondDate !== firstDate) return secondDate - firstDate;

      return Number(getLoanValue(second, ['id'], 0)) - Number(getLoanValue(first, ['id'], 0));
    })[0] || null;
};

const getLoanRecordId = (loan) => String(getLoanValue(loan, ['id', 'loanId', 'loan_id'], '') || '');
const getLoanRepaymentTotal = (loan) => Math.abs(Number(getLoanValue(loan, ['repayment_amount', 'amount'], 0)) || 0);

const getUserLoanRecordsFromTransactions = (records = []) => records
  .filter((record) => !isRepaymentRecord(record))
  .filter((record) => Number(getLoanValue(record, ['amount', 'repayment_amount'], 0)) >= 0)
  .sort((first, second) => {
    const firstDate = new Date(getLoanValue(first, ['date_applied', 'createdAt', 'created_at', 'date'])).getTime() || 0;
    const secondDate = new Date(getLoanValue(second, ['date_applied', 'createdAt', 'created_at', 'date'])).getTime() || 0;
    if (secondDate !== firstDate) return secondDate - firstDate;
    return Number(getLoanRecordId(second) || 0) - Number(getLoanRecordId(first) || 0);
  });

const buildLoanBalances = (records = []) => {
  const loans = getUserLoanRecordsFromTransactions(records);
  const repayments = records.filter(isRepaymentRecord);
  const balances = {};

  loans.forEach((loan) => {
    const loanId = getLoanRecordId(loan);
    const loanTotal = getLoanRepaymentTotal(loan);
    const matchingRepayments = repayments.filter((repayment) => (
      String(getLoanValue(repayment, ['loan_id', 'loanId'], '') || '') === loanId
    ));
    const completedRepaid = matchingRepayments.reduce((sum, repayment) => {
      const status = normalizeStatusText(getLoanStatusText(repayment) || getLoanValue(repayment, ['display_status'], ''));
      return statusIncludesAny(status, ['completed', 'paid'])
        ? sum + Math.abs(Number(getLoanValue(repayment, ['amount'], 0)) || 0)
        : sum;
    }, 0);

    if (loanId) {
      balances[loanId] = Math.max(loanTotal - completedRepaid, 0);
    }

  });

  return balances;
};
const getLoanStatusMeta = (status, hasLoanInfo, loanBalance) => {
  if (!hasLoanInfo) {
    return {
      tone: 'info',
      label: 'No Loan',
      message: 'No loan application has been recorded for this account.'
    };
  }

  const rawStatus = String(status || '').trim();
  const normalizedStatus = rawStatus.toLowerCase();
  const label = rawStatus || (Number(loanBalance) > 0 ? 'Active' : 'Status Pending');

  if (
    Number(loanBalance) <= 0 &&
    ['approved', 'disbursed', 'active'].some((statusKey) => normalizedStatus.includes(statusKey))
  ) {
    return {
      tone: 'paid',
      label: 'Paid',
      message: 'This loan has been fully settled.'
    };
  }

  if (['paid', 'complete', 'completed', 'cleared', 'settled'].some((statusKey) => normalizedStatus.includes(statusKey))) {
    return {
      tone: 'paid',
      label,
      message: 'This loan has been fully settled.'
    };
  }

  if (['reject', 'declined', 'failed', 'overdue', 'default'].some((statusKey) => normalizedStatus.includes(statusKey))) {
    return {
      tone: 'danger',
      label,
      message: 'This loan needs attention. Please review the status details.'
    };
  }

  if (['pending', 'review', 'processing', 'progress'].some((statusKey) => normalizedStatus.includes(statusKey))) {
    return {
      tone: 'pending',
      label,
      message: 'Your loan request is being reviewed.'
    };
  }

  if (['approved', 'disbursed', 'active'].some((statusKey) => normalizedStatus.includes(statusKey))) {
    return {
      tone: 'success',
      label,
      message: 'Your loan has been approved.'
    };
  }

  return {
    tone: 'info',
    label,
    message: 'Your loan record is available.'
  };
};

function LoanStatusView({ latestLoan, loanBalance, loading, error, onRefresh }) {
  const hasLoanInfo = Boolean(latestLoan) || Number(loanBalance) > 0;
  const rawStatus = getLoanValue(latestLoan, ['status'], Number(loanBalance) > 0 ? 'Active' : '');
  const statusMeta = getLoanStatusMeta(rawStatus, hasLoanInfo, loanBalance);
  const loanType = getLoanValue(latestLoan, ['loan_type', 'loanType'], 'Loan Account');
  const loanAmount = getLoanValue(latestLoan, ['amount', 'loan_amount'], loanBalance);
  const dateApplied = getLoanValue(latestLoan, ['date_applied', 'createdAt', 'created_at', 'date']);
  const nationalIdNumber = getLoanValue(latestLoan, ['national_id_number', 'nationalIdNumber'], 'Not available');
  const paymentMode = getLoanValue(latestLoan, ['payment_mode', 'paymentMode'], 'Not available');
  const accountNumber = getLoanValue(latestLoan, ['account_number', 'accountNumber'], 'Not available');

  return (
    <div className="view-fade-in loan-status-view">
      <div className="loan-status-header-row">
        <div>
          <h2>Current Loan Application Status</h2>
          <p className="loan-status-summary">{statusMeta.message}</p>
        </div>
        <button type="button" className="loan-status-refresh-btn" onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="status-tracker-card-layout">
        {error && <div className="loan-status-error">{error}</div>}

        {loading && !hasLoanInfo ? (
          <p className="loan-status-empty-text">Loading loan status...</p>
        ) : (
          <>
            <div className={`loan-status-badge status-${statusMeta.tone}`}>
              {statusMeta.label}
            </div>

            {hasLoanInfo ? (
              <div className="loan-status-detail-grid">
                <div className="loan-status-detail">
                  <span>Loan Type</span>
                  <strong>{loanType}</strong>
                </div>
                <div className="loan-status-detail">
                  <span>Requested Amount</span>
                  <strong>{formatKes(loanAmount)}</strong>
                </div>
                <div className="loan-status-detail">
                  <span>Outstanding Balance</span>
                  <strong>{formatKes(loanBalance)}</strong>
                </div>
                <div className="loan-status-detail">
                  <span>Date Applied</span>
                  <strong>{formatLoanDate(dateApplied)}</strong>
                </div>
                <div className="loan-status-detail">
                  <span>ID Number</span>
                  <strong>{nationalIdNumber}</strong>
                </div>
                <div className="loan-status-detail">
                  <span>Payment Mode</span>
                  <strong>{paymentMode}</strong>
                </div>
                <div className="loan-status-detail">
                  <span>Receiving Account</span>
                  <strong>{accountNumber}</strong>
                </div>
              </div>
            ) : (
              <p className="loan-status-empty-text">No active loan application found.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function LoanListView({ loans = [], loanBalances = {}, loading, error, onRefresh, onPayFull, onPayPartial }) {
  const visibleLoans = loans.filter((loan) => !isRepaymentRecord(loan));
  const totalOutstanding = visibleLoans.reduce((sum, loan) => {
    const loanId = getLoanRecordId(loan);
    return sum + Math.max(Number(loanBalances[loanId] ?? getLoanRepaymentTotal(loan)), 0);
  }, 0);

  return (
    <div className="view-fade-in loan-list-view">
      <div className="loan-status-header-row">
        <div>
          <h2>Loan Lists</h2>
          <p className="loan-status-summary">Your loan products are listed separately so each payment goes to the right product.</p>
        </div>
        <button type="button" className="loan-status-refresh-btn" onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && <div className="loan-status-error">{error}</div>}

      {loading && visibleLoans.length === 0 ? (
        <TableSkeleton rows={4} columns={6} />
      ) : visibleLoans.length === 0 ? (
        <p className="loan-status-empty-text">No loan products taken yet.</p>
      ) : (
        <div className="responsive-table-shell">
          <table className="data-table loan-list-table">
            <thead>
              <tr>
                <th>Loan Product</th>
                <th>Principal</th>
                <th>Balance</th>
                <th>Status</th>
                <th>Due Date</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              {visibleLoans.map((loan) => {
                const loanId = getLoanRecordId(loan);
                const balance = Math.max(Number(loanBalances[loanId] ?? getLoanRepaymentTotal(loan)), 0);
                const statusLabel = titleCaseStatus(getLoanStatusText(loan) || getLoanValue(loan, ['display_status'], 'Pending'));
                const canPay = balance > 0 && isApprovedLoanStatus(loan);

                return (
                  <tr key={loanId || `${getLoanValue(loan, ['loan_type'], 'loan')}-${getLoanValue(loan, ['date_applied'], '')}`}>
                    <td><strong>{getLoanValue(loan, ['loan_type', 'loanType'], 'Loan Product')}</strong></td>
                    <td>{formatKes(getLoanValue(loan, ['principal_amount', 'amount'], 0))}</td>
                    <td>{formatKes(balance)}</td>
                    <td><span className={`table-status ${getTableStatusClass(statusLabel)}`}>{statusLabel}</span></td>
                    <td>{formatLoanDate(getLoanValue(loan, ['due_date', 'dueDate'], ''))}</td>
                    <td>
                      <div className="loan-list-actions">
                        <button type="button" className="admin-action-btn approve" onClick={() => onPayFull(loan)} disabled={!canPay}>Full</button>
                        <button type="button" className="admin-action-btn" onClick={() => onPayPartial(loan)} disabled={!canPay}>Partial</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="loan-list-total-row">
                <td colSpan="2">Total Outstanding</td>
                <td>{formatKes(totalOutstanding)}</td>
                <td colSpan="3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
function NotificationsView({
  isAdmin = false,
  userNotifications = [],
  pendingSignups = [],
  pendingCounts = {},
  onOpenAdmin
}) {
  if (!isAdmin) {
    const loanDecisionNotifications = userNotifications.filter((item) => item.kind === 'loan-decision').slice(0, 8);
    const accountActivityNotifications = userNotifications.filter((item) => item.kind !== 'loan-decision').slice(0, 6);
    const totalCount = loanDecisionNotifications.length + accountActivityNotifications.length;

    return (
      <div className="view-fade-in notifications-view">
        <div className="notifications-header-row">
          <div>
            <h2>Notifications</h2>
            <p className="loan-status-summary">
              {totalCount > 0 ? `${totalCount} account notification${totalCount === 1 ? '' : 's'}.` : 'No account notifications yet.'}
            </p>
          </div>
          <span className={`notification-total-pill ${totalCount > 0 ? 'active' : ''}`}>{totalCount}</span>
        </div>

        <div className="notification-card-grid">
          <section className="notification-card">
            <div className="notification-card-top">
              <ion-icon name="cash-outline"></ion-icon>
              <span>{loanDecisionNotifications.length}</span>
            </div>
            <h3>Loan Decisions</h3>
            {loanDecisionNotifications.length === 0 ? (
              <p>No loan approvals or rejections yet.</p>
            ) : (
              <div className="notification-list">
                {loanDecisionNotifications.map((item) => (
                  <div className={`notification-list-item tone-${item.tone}`} key={item.key}>
                    <strong>{item.title}</strong>
                    <span>{item.message}</span>
                    <span>{formatLoanDate(item.date)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="notification-card">
            <div className="notification-card-top">
              <ion-icon name="receipt-outline"></ion-icon>
              <span>{accountActivityNotifications.length}</span>
            </div>
            <h3>Account Activity</h3>
            {accountActivityNotifications.length === 0 ? (
              <p>No repayment updates yet.</p>
            ) : (
              <div className="notification-list">
                {accountActivityNotifications.map((item) => (
                  <div className={`notification-list-item tone-${item.tone}`} key={item.key}>
                    <strong>{item.title}</strong>
                    <span>{item.message}</span>
                    <span>{formatLoanDate(item.date)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  const signupCount = Math.max(pendingSignups.length, pendingCounts.users || 0);
  const loanCount = pendingCounts.loans || 0;
  const totalCount = signupCount + loanCount;
  const recentSignups = pendingSignups.slice(0, 4);

  return (
    <div className="view-fade-in notifications-view">
      <div className="notifications-header-row">
        <div>
          <h2>Admin Notifications</h2>
          <p className="loan-status-summary">
            {totalCount > 0 ? `${totalCount} admin action${totalCount === 1 ? '' : 's'} waiting.` : 'No new admin notifications.'}
          </p>
        </div>
        <span className={`notification-total-pill ${totalCount > 0 ? 'active' : ''}`}>{totalCount}</span>
      </div>

      <div className="notification-card-grid">
        <section className="notification-card">
          <div className="notification-card-top">
            <ion-icon name="person-add-outline"></ion-icon>
            <span>{signupCount}</span>
          </div>
          <h3>New User Verification</h3>
          {recentSignups.length === 0 ? (
            <p>No local signup notifications.</p>
          ) : (
            <div className="notification-list">
              {recentSignups.map((signup) => (
                <div className="notification-list-item" key={getUserRecordId(signup) || getUserRecordEmail(signup)}>
                  <strong>{getUserDisplayName(signup)}</strong>
                  <span>{getUserRecordEmail(signup)}</span>
                </div>
              ))}
            </div>
          )}
          <button type="button" className="auth-submit-btn" onClick={() => onOpenAdmin('users')}>
            Review Users
          </button>
        </section>

        <section className="notification-card">
          <div className="notification-card-top">
            <ion-icon name="cash-outline"></ion-icon>
            <span>{loanCount}</span>
          </div>
          <h3>Loan Approval Queue</h3>
          <p>{loanCount > 0 ? 'Loan requests need an admin decision.' : 'No loan requests waiting for review.'}</p>
          <button type="button" className="auth-submit-btn" onClick={() => onOpenAdmin('overview')}>
            Review Loans
          </button>
        </section>
      </div>
    </div>
  );
}

function AdminView({
  onUserVerified = () => {},
  onLoanReviewed = () => {},
  onAdminCountsChange = () => {},
  localUsers = [],
  initialTab = 'overview'
}) {
  const [secret, setSecret] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [users, setUsers] = useState([]);
  const [loans, setLoans] = useState([]);
  const [repayments, setRepayments] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [activeTab, setActiveTab] = useState(initialTab || 'overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [adminFeedback, setAdminFeedback] = useState({ message: '', type: '' });
  const [actionLoadingKey, setActionLoadingKey] = useState('');
  const [recentlyReviewedLoans, setRecentlyReviewedLoans] = useState({});
  const [adminSearchTerm, setAdminSearchTerm] = useState('');
  const [loanStatusFilter, setLoanStatusFilter] = useState('all');
  const [detailModalRecord, setDetailModalRecord] = useState(null);
  const recentlyReviewedLoanTimersRef = useRef({});
  const adminFeedbackTimerRef = useRef(null);
  const BASE_URL = API_BASE_URL;

  useEffect(() => {
    setActiveTab(initialTab || 'overview');
  }, [initialTab]);

  const allUsers = [
    ...users,
    ...localUsers.filter((localUser) => !users.some((user) => recordsReferToSameUser(user, localUser)))
  ];
  const pendingVerificationUsers = allUsers.filter(isUserPendingVerification);
  const analyticsPendingLoans = Array.isArray(analytics?.pendingLoanRequests) ? analytics.pendingLoanRequests : [];
  const pendingLoansFromTable = loans.filter(isPendingLoanStatus);
  const pendingLoanRequests = [
    ...analyticsPendingLoans,
    ...pendingLoansFromTable.filter((loan) => {
      const loanId = String(getLoanValue(loan, ['id', 'loanId', 'loan_id'], ''));
      return !analyticsPendingLoans.some((pendingLoan) => String(getLoanValue(pendingLoan, ['id', 'loanId', 'loan_id'], '')) === loanId);
    })
  ];
  const visiblePendingLoanRequests = [
    ...pendingLoanRequests,
    ...Object.values(recentlyReviewedLoans)
      .map((reviewedLoan) => reviewedLoan.loan)
      .filter((reviewedLoan) => {
        const reviewedLoanId = String(getLoanValue(reviewedLoan, ['id', 'loanId', 'loan_id'], ''));
        return !pendingLoanRequests.some((pendingLoan) => (
          String(getLoanValue(pendingLoan, ['id', 'loanId', 'loan_id'], '')) === reviewedLoanId
        ));
      })
  ];
  const normalizedAdminSearch = normalizeStatusText(adminSearchTerm);
  const getAdminSearchNameParts = (record) => {
    const displayName = getUserDisplayName(record);
    const firstName = getLoanValue(record, ['first_name', 'firstName'], '');
    const lastName = getLoanValue(record, ['last_name', 'lastName'], '');
    return [
      displayName,
      `${firstName} ${lastName}`.trim(),
      firstName,
      lastName
    ]
      .map(normalizeStatusText)
      .filter((value, index, values) => value && values.indexOf(value) === index);
  };
  const nameStartsWithSearch = (name, searchValue) => {
    if (!name || !searchValue) return false;
    if (name.startsWith(searchValue)) return true;

    const nameWords = name.split(/\s+/).filter(Boolean);
    const searchWords = searchValue.split(/\s+/).filter(Boolean);
    if (searchWords.length > 1) {
      return searchWords.every((word, index) => nameWords[index]?.startsWith(word));
    }

    return nameWords.some((word) => word.startsWith(searchValue));
  };
  const getAdminSearchRank = (record) => {
    if (!normalizedAdminSearch) return 0;

    const names = getAdminSearchNameParts(record);
    if (names.some((name) => name === normalizedAdminSearch)) return 0;
    if (names.some((name) => nameStartsWithSearch(name, normalizedAdminSearch))) return 1;
    if (names.some((name) => name.includes(normalizedAdminSearch))) return 2;

    const secondaryValues = [
      getUserRecordEmail(record),
      getUserRecordId(record),
      getLoanValue(record, ['user_id', 'userId'], ''),
      getLoanValue(record, ['national_id_number', 'nationalIdNumber', 'id_number', 'idNumber'], '')
    ].map(normalizeStatusText).filter(Boolean);

    if (secondaryValues.some((value) => value.startsWith(normalizedAdminSearch))) return 3;
    if (secondaryValues.some((value) => value.includes(normalizedAdminSearch))) return 4;
    return Number.POSITIVE_INFINITY;
  };
  const recordMatchesAdminSearch = (record) => getAdminSearchRank(record) !== Number.POSITIVE_INFINITY;
  const matchesLoanStatusFilter = (loan) => {
    if (loanStatusFilter === 'all') return true;
    if (loanStatusFilter === 'pending') return isPendingLoanStatus(loan);
    if (loanStatusFilter === 'disbursed') return isApprovedLoanStatus(loan);
    if (loanStatusFilter === 'rejected') return isRejectedLoanStatus(loan);
    return true;
  };
  const compareByAdminSearchRank = (first, second) => {
    if (!normalizedAdminSearch) return 0;

    return getAdminSearchRank(first) - getAdminSearchRank(second);
  };
  const sortByNumericUserId = (records) => [...records].sort((first, second) => {
    const searchRankOrder = compareByAdminSearchRank(first, second);
    if (searchRankOrder !== 0) return searchRankOrder;

    const firstId = Number(getUserRecordId(first));
    const secondId = Number(getUserRecordId(second));
    const firstIsNumeric = Number.isFinite(firstId);
    const secondIsNumeric = Number.isFinite(secondId);

    if (firstIsNumeric && secondIsNumeric) return firstId - secondId;
    if (firstIsNumeric) return -1;
    if (secondIsNumeric) return 1;
    return getUserDisplayName(first).localeCompare(getUserDisplayName(second));
  });
  const sortByNumericLoanId = (records) => [...records].sort((first, second) => {
    const searchRankOrder = compareByAdminSearchRank(first, second);
    if (searchRankOrder !== 0) return searchRankOrder;

    const firstId = Number(getLoanValue(first, ['id', 'loanId', 'loan_id'], ''));
    const secondId = Number(getLoanValue(second, ['id', 'loanId', 'loan_id'], ''));
    const firstIsNumeric = Number.isFinite(firstId);
    const secondIsNumeric = Number.isFinite(secondId);

    if (firstIsNumeric && secondIsNumeric) return firstId - secondId;
    if (firstIsNumeric) return -1;
    if (secondIsNumeric) return 1;
    return formatLoanDate(getLoanValue(first, ['date_applied', 'dateApplied'], '')).localeCompare(
      formatLoanDate(getLoanValue(second, ['date_applied', 'dateApplied'], ''))
    );
  });
  const filteredUsers = sortByNumericUserId(allUsers.filter(recordMatchesAdminSearch));
  const adminSearchUserSuggestions = normalizedAdminSearch
    ? filteredUsers.slice(0, 6)
    : [];
  const filteredPendingVerificationUsers = sortByNumericUserId(pendingVerificationUsers.filter(recordMatchesAdminSearch));
  const filteredPendingLoanRequests = sortByNumericLoanId(
    visiblePendingLoanRequests
      .filter(recordMatchesAdminSearch)
      .filter(matchesLoanStatusFilter)
  );
  const filteredLoans = sortByNumericLoanId(
    loans
      .filter(recordMatchesAdminSearch)
      .filter(matchesLoanStatusFilter)
  );
  const filteredRepayments = repayments.filter(recordMatchesAdminSearch);

  useEffect(() => () => {
    Object.values(recentlyReviewedLoanTimersRef.current).forEach(clearTimeout);
    clearTimeout(adminFeedbackTimerRef.current);
  }, []);

  const clearAdminFeedback = () => {
    clearTimeout(adminFeedbackTimerRef.current);
    adminFeedbackTimerRef.current = null;
    setAdminFeedback({ message: '', type: '' });
  };

  const showAdminFeedback = (feedback, autoDismissMs = 3000) => {
    clearTimeout(adminFeedbackTimerRef.current);
    setAdminFeedback(feedback);

    if (autoDismissMs) {
      adminFeedbackTimerRef.current = setTimeout(() => {
        setAdminFeedback({ message: '', type: '' });
        adminFeedbackTimerRef.current = null;
      }, autoDismissMs);
    }
  };

  const retryDelay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const fetchAdminResource = async (path, label, options = {}) => {
    const cleanSecret = String(secret || '').trim();
    const request = () => fetch(`${BASE_URL}${path}`, { headers: { 'x-admin-secret': cleanSecret } });
    let response;

    try {
      response = await request();
    } catch (fetchError) {
      await retryDelay(1200);
      try {
        response = await request();
      } catch {
        throw new Error(`${label} could not be reached. Check the backend URL or try again after Render wakes up.`);
      }
    }

    const payload = await parseAdminResponse(response);
    if (!response.ok) {
      throw new Error(
        response.status === 401
          ? (payload.message || 'Wrong admin password.')
          : (payload.message || `${label} failed to load (${response.status}).`)
      );
    }

    return payload || options.fallback || {};
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    onAdminCountsChange({
      users: pendingVerificationUsers.length,
      loans: pendingLoanRequests.length
    });
  }, [isAuthenticated, pendingVerificationUsers.length, pendingLoanRequests.length, onAdminCountsChange]);

  const loadAdminData = async () => {
    setLoading(true);
    setError('');
    try {
      const [usersData, loansData, repaymentsResult, analyticsResult] = await Promise.all([
        fetchAdminResource('/api/admin/users', 'Admin users'),
        fetchAdminResource('/api/admin/loans', 'Admin loans'),
        fetchAdminResource('/api/admin/repayments', 'Admin repayments').then(
          (payload) => ({ ok: true, payload }),
          (error) => ({ ok: false, error })
        ),
        fetchAdminResource('/api/admin/analytics', 'Admin analytics').then(
          (payload) => ({ ok: true, payload }),
          (error) => ({ ok: false, error })
        )
      ]);
      const receivedLoans = loansData.loans || [];
      const fallbackRepayments = receivedLoans
        .filter(isRepaymentRecord)
        .map((repayment) => ({
          ...repayment,
          amount: Math.abs(Number(repayment.amount || 0)),
          created_at: repayment.created_at || repayment.date_applied,
          transaction_type: repayment.transaction_type || 'Legacy Repayment'
        }));
      const repaymentsPayload = repaymentsResult.ok ? repaymentsResult.payload : { repayments: null };
      const receivedRepayments = Array.isArray(repaymentsPayload.repayments)
        ? repaymentsPayload.repayments
        : fallbackRepayments;
      const separatedLoans = Array.isArray(repaymentsPayload.repayments)
        ? receivedLoans
        : receivedLoans.filter((loan) => !isRepaymentRecord(loan));

      setUsers(usersData.users || []);
      setLoans(separatedLoans);
      setRepayments(receivedRepayments);
      setAnalytics(analyticsResult.ok ? analyticsResult.payload : null);

      const optionalFailures = [repaymentsResult, analyticsResult]
        .filter((result) => !result.ok)
        .map((result) => result.error.message);
      if (optionalFailures.length > 0) {
        showAdminFeedback({ message: optionalFailures.join(' '), type: 'error' }, 5000);
      }
    } catch (adminError) {
      setError(adminError.message || 'Cannot connect to server.');
      throw adminError;
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    try {
      await loadAdminData();
      setIsAuthenticated(true);
    } catch {
      setIsAuthenticated(false);
    }
  };

  const parseAdminResponse = async (response) => {
    try {
      return await response.json();
    } catch {
      return {};
    }
  };

  const runAdminMutation = async (path, body, actionLabel) => {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': secret
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const payload = await parseAdminResponse(response);

    if (!response.ok) {
      throw new Error(payload.message || payload.error || `${actionLabel} failed.`);
    }

    return payload;
  };

  const handleVerifyUser = async (user) => {
    const userId = getUserRecordId(user);
    const userEmail = getUserRecordEmail(user);
    const actionKey = `user-${userId || userEmail}`;

    if (!userId || String(userId).startsWith('local-')) {
      const verifiedUser = {
        ...user,
        status: 'Verified',
        is_verified: true,
        verified: true,
        pendingVerification: false
      };

      onUserVerified(verifiedUser);
      showAdminFeedback({ message: 'Local user verified successfully.', type: 'success' });
      return;
    }

    setActionLoadingKey(actionKey);
    clearAdminFeedback();

    try {
      const payload = await runAdminMutation(
        `/api/admin/users/${userId}/verify`,
        { email: userEmail },
        'User verification'
      );

      const verifiedUser = {
        ...user,
        ...(payload.user || {}),
        status: 'Verified',
        is_verified: true,
        verified: true,
        pendingVerification: false
      };

      setUsers((currentUsers) => currentUsers.map((existingUser) => (
        recordsReferToSameUser(existingUser, verifiedUser) ? { ...existingUser, ...verifiedUser } : existingUser
      )));
      onUserVerified(verifiedUser);
      showAdminFeedback({ message: 'User verified successfully.', type: 'success' });
      await loadAdminData().catch(() => null);
    } catch (mutationError) {
      showAdminFeedback({ message: mutationError.message || 'Could not verify user.', type: 'error' }, 5000);
    } finally {
      setActionLoadingKey('');
    }
  };

  const handleLoanReview = async (loan, decision) => {
    const loanId = getLoanValue(loan, ['id', 'loanId', 'loan_id'], '');
    const fallbackStatus = decision === 'approve' ? 'Disbursed' : 'Rejected';
    const displayStatus = decision === 'approve' ? 'Approved' : 'Rejected';
    const actionKey = `loan-${decision}-${loanId}`;

    if (!loanId) {
      showAdminFeedback({ message: 'Loan record is missing an ID.', type: 'error' }, 5000);
      return;
    }

    setActionLoadingKey(actionKey);
    clearAdminFeedback();

    try {
      const payload = await runAdminMutation(
        `/api/admin/loans/${loanId}/decision`,
        { decision },
        `${fallbackStatus} loan`
      );

      const updatedLoan = { ...loan, ...(payload.loan || {}), status: payload.loan?.status || fallbackStatus };
      const reviewedLoan = { ...updatedLoan, status: displayStatus };
      setLoans((currentLoans) => currentLoans.map((existingLoan) => (
        String(getLoanValue(existingLoan, ['id', 'loanId', 'loan_id'], '')) === String(loanId)
          ? { ...existingLoan, ...updatedLoan }
          : existingLoan
      )));
      setAnalytics((currentAnalytics) => currentAnalytics ? {
        ...currentAnalytics,
        pendingLoanRequests: (currentAnalytics.pendingLoanRequests || []).filter((pendingLoan) => (
          String(getLoanValue(pendingLoan, ['id', 'loanId', 'loan_id'], '')) !== String(loanId)
        ))
      } : currentAnalytics);
      onLoanReviewed(updatedLoan, payload);
      setRecentlyReviewedLoans((currentLoans) => ({
        ...currentLoans,
        [loanId]: {
          loan: reviewedLoan,
          label: displayStatus,
          type: decision === 'approve' ? 'success' : 'error'
        }
      }));
      clearTimeout(recentlyReviewedLoanTimersRef.current[loanId]);
      recentlyReviewedLoanTimersRef.current[loanId] = setTimeout(() => {
        setRecentlyReviewedLoans((currentLoans) => {
          const nextLoans = { ...currentLoans };
          delete nextLoans[loanId];
          return nextLoans;
        });
        delete recentlyReviewedLoanTimersRef.current[loanId];
      }, 3000);
      showAdminFeedback({ message: payload.message || `Loan ${displayStatus.toLowerCase()} successfully.`, type: 'success' });
      loadAdminData().catch(() => null);
    } catch (mutationError) {
      showAdminFeedback({ message: mutationError.message || `Could not ${decision} loan.`, type: 'error' }, 5000);
    } finally {
      setActionLoadingKey('');
    }
  };

  const getRecordUserId = (record) => String(getLoanValue(record, ['user_id', 'userId'], getUserRecordId(record)) || '');
  const getHistoryForRecord = (record) => {
    const recordUserId = getRecordUserId(record);
    const recordEmail = getUserRecordEmail(record);
    const sameUser = (item) => {
      const itemUserId = getRecordUserId(item);
      return Boolean(
        (recordUserId && itemUserId && recordUserId === itemUserId) ||
        (recordEmail && getUserRecordEmail(item) === recordEmail)
      );
    };
    const userLoans = loans.filter(sameUser);
    const userRepayments = repayments.filter(sameUser);
    const disbursedTotal = userLoans.reduce((sum, loan) => (
      isApprovedLoanStatus(loan) ? sum + Math.abs(Number(loan.repayment_amount || loan.amount || 0)) : sum
    ), 0);
    const repaidTotal = userRepayments.reduce((sum, repayment) => (
      statusIncludesAny(repayment.status, ['completed', 'paid'])
        ? sum + Math.abs(Number(repayment.amount || 0))
        : sum
    ), 0);
    const completedRepayments = userRepayments.filter((repayment) => statusIncludesAny(repayment.status, ['completed', 'paid'])).length;
    const repaymentSuccessRate = userRepayments.length
      ? Math.round((completedRepayments / userRepayments.length) * 100)
      : 0;

    return {
      userLoans,
      userRepayments,
      totalLoansTaken: userLoans.filter(isApprovedLoanStatus).length,
      repaymentSuccessRate,
      activeBalance: Math.max(disbursedTotal - repaidTotal, 0)
    };
  };

  const openDetailModal = (record, type) => {
    setDetailModalRecord({ record, type });
  };

  const closeDetailModal = () => {
    setDetailModalRecord(null);
  };

  const modalRecord = detailModalRecord?.record;
  const modalHistory = modalRecord ? getHistoryForRecord(modalRecord) : null;
  const modalLoanId = modalRecord ? getLoanValue(modalRecord, ['id', 'loanId', 'loan_id'], '') : '';
  const modalReviewNotice = modalLoanId ? recentlyReviewedLoans[modalLoanId] : null;

  if (!isAuthenticated) return (
    <div style={{ maxWidth: '400px', margin: '100px auto', padding: '30px', background: '#0d2137', borderRadius: '12px' }}>
      <h2 style={{ color: '#f49e2f', textAlign: 'center' }}>Admin Access</h2>
      <form onSubmit={handleAdminLogin} className="auth-form">
        <div className="input-group">
          <label>Admin Password</label>
          <div className="password-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input 
              type={showPassword ? "text" : "password"} 
              value={secret} 
              onChange={(e) => setSecret(e.target.value)} 
              placeholder="Enter password" 
              style={{ width: '100%', paddingRight: '40px' }}
              required 
            />
            <span 
              className="password-toggle-eye" 
              onClick={() => setShowPassword(!showPassword)}
              style={{ position: 'absolute', right: '12px', cursor: 'pointer', userSelect: 'none', fontSize: '20px', color: '#f49e2f', display: 'flex', alignItems: 'center' }}
            >
              {showPassword ? <ion-icon name="eye-off-outline"></ion-icon> : <ion-icon name="eye-outline"></ion-icon>}
            </span>
          </div>
        </div>
        {error && <p style={{ color: 'red', fontSize: '13px' }}>{error}</p>}
        <button type="submit" className="auth-submit-btn" disabled={loading}>
          {loading ? <LoadingSpinner label="Verifying..." /> : 'Enter'}
        </button>
      </form>
    </div>
  );

  return (
    <div className="admin-dashboard-view">
      <div className="admin-header-row">
        <h2>Admin Dashboard</h2>
        <button type="button" className="loan-status-refresh-btn" onClick={loadAdminData} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="admin-overview-grid">
        <div className="admin-stat-card">
          <span>Total Active Users</span>
          <strong>{analytics?.totalActiveUsers ?? allUsers.length}</strong>
        </div>
        <div className="admin-stat-card">
          <span>Pending Signups</span>
          <strong>{pendingVerificationUsers.length}</strong>
        </div>
        <div className="admin-stat-card">
          <span>Pending Loans</span>
          <strong>{pendingLoanRequests.length}</strong>
        </div>
        <div className="admin-stat-card">
          <span>Total Disbursed</span>
          <strong>{formatKes(analytics?.totalDisbursed || 0)}</strong>
        </div>
        <div className="admin-stat-card">
          <span>Outstanding Balance</span>
          <strong>{formatKes(analytics?.outstandingBalance || 0)}</strong>
        </div>
        <div className="admin-stat-card">
          <span>Pending Repayments</span>
          <strong>{analytics?.pendingRepayments || 0}</strong>
        </div>
      </div>

      {adminFeedback.message && (
        <div className={`admin-feedback ${adminFeedback.type}`}>
          {adminFeedback.message}
        </div>
      )}

      <div className="admin-tab-row">
        <button className={`auth-submit-btn ${activeTab === 'overview' ? '' : 'cancel-btn'}`} onClick={() => setActiveTab('overview')}>Overview</button>
        <button className={`auth-submit-btn ${activeTab === 'users' ? '' : 'cancel-btn'}`} onClick={() => setActiveTab('users')}>Users ({filteredUsers.length})</button>
        <button className={`auth-submit-btn ${activeTab === 'loans' ? '' : 'cancel-btn'}`} onClick={() => setActiveTab('loans')}>Loans ({filteredLoans.length})</button>
        <button className={`auth-submit-btn ${activeTab === 'repayments' ? '' : 'cancel-btn'}`} onClick={() => setActiveTab('repayments')}>Repayments ({filteredRepayments.length})</button>
      </div>

      <div className="admin-filter-bar">
        <div className="input-group admin-search-input">
          <label>Search Records</label>
          <input
            type="search"
            value={adminSearchTerm}
            onChange={(e) => setAdminSearchTerm(e.target.value)}
            placeholder="Name, email, or ID number"
          />
          {adminSearchUserSuggestions.length > 0 && (
            <div className="admin-search-results">
              {adminSearchUserSuggestions.map((user) => {
                const userKey = getUserRecordId(user) || getUserRecordEmail(user) || getUserDisplayName(user);
                return (
                  <button
                    key={`search-user-${userKey}`}
                    type="button"
                    className="admin-search-result"
                    onClick={() => openDetailModal(user, 'user')}
                  >
                    <span>{getUserDisplayName(user)}</span>
                    <small>{getUserRecordEmail(user) || getUserPhoneDisplay(user)}</small>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="input-group admin-status-filter">
          <label>Loan Status</label>
          <select value={loanStatusFilter} onChange={(e) => setLoanStatusFilter(e.target.value)}>
            <option value="all">All loans</option>
            <option value="pending">Pending</option>
            <option value="disbursed">Disbursed</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="admin-panel-stack">
          <div className="admin-panel-block">
            <h3>Pending User Verifications</h3>
            {loading ? (
              <TableSkeleton rows={4} columns={6} />
            ) : filteredPendingVerificationUsers.length === 0 ? (
              <p className="loan-status-empty-text">No pending user verifications.</p>
            ) : (
              <div className="responsive-table-shell">
                <table className="data-table">
                  <thead><tr>
                    <th>User</th><th>Email</th><th>Phone</th><th>Joined</th><th>Status</th><th>Action</th>
                  </tr></thead>
                  <tbody>{filteredPendingVerificationUsers.map((user) => {
                    const userKey = getUserRecordId(user) || getUserRecordEmail(user);
                    const actionKey = `user-${userKey}`;
                    return (
                      <tr key={userKey} className="clickable-table-row" onClick={() => openDetailModal(user, 'user')}>
                        <td>{getUserDisplayName(user)}</td>
                        <td>{getUserRecordEmail(user) || '-'}</td>
                        <td>{getUserPhoneDisplay(user)}</td>
                        <td>{formatLoanDate(getLoanValue(user, ['createdAt', 'created_at', 'dateJoined', 'date_joined']))}</td>
                        <td><span className={`table-status ${getTableStatusClass(getUserVerificationLabel(user))}`}>{getUserVerificationLabel(user)}</span></td>
                        <td>
                          <button
                            type="button"
                            className="admin-action-btn approve"
                            onClick={(event) => { event.stopPropagation(); handleVerifyUser(user); }}
                            disabled={actionLoadingKey === actionKey}
                          >
                            {actionLoadingKey === actionKey ? 'Verifying...' : 'Verify'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
          </div>

          <div className="admin-panel-block">
            <h3>Pending Loan Requests</h3>
            {loading ? (
              <TableSkeleton rows={5} columns={8} />
            ) : filteredPendingLoanRequests.length === 0 ? (
              <p className="loan-status-empty-text">No pending loan requests.</p>
            ) : (
              <div className="responsive-table-shell">
                <table className="data-table">
                  <thead><tr>
                    <th>User</th><th>ID No.</th><th>Type</th><th>Principal</th><th>Repayment</th><th>Due Date</th><th>Status</th><th>Action</th>
                  </tr></thead>
                  <tbody>{filteredPendingLoanRequests.map((loan) => {
                    const loanId = getLoanValue(loan, ['id', 'loanId', 'loan_id'], '');
                    const reviewNotice = recentlyReviewedLoans[loanId];
                    const statusLabel = reviewNotice?.label || titleCaseStatus(getLoanStatusText(loan) || 'Pending');
                    return (
                      <tr key={loanId || `${getUserDisplayName(loan)}-${getLoanValue(loan, ['loan_type', 'loanType'], '')}`} className="clickable-table-row" onClick={() => openDetailModal(loan, 'loan')}>
                        <td>{getUserDisplayName(loan)}</td>
                        <td>{getLoanValue(loan, ['national_id_number', 'nationalIdNumber'], '-')}</td>
                        <td>{getLoanValue(loan, ['loan_type', 'loanType', 'transaction_type'], '-')}</td>
                        <td>{formatKes(loan.principal_amount || loan.amount)}</td>
                        <td>{formatKes(loan.repayment_amount || loan.amount)}</td>
                        <td>{formatLoanDate(loan.due_date)}</td>
                    <td><span className={`table-status ${getTableStatusClass(statusLabel)}`}>{statusLabel}</span></td>
                        <td>
                          {reviewNotice ? (
                            <span className={`admin-review-result ${reviewNotice.type}`}>{reviewNotice.label}</span>
                          ) : (
                            <div className="admin-action-row">
                              <button
                                type="button"
                                className="admin-action-btn approve"
                                onClick={(event) => { event.stopPropagation(); handleLoanReview(loan, 'approve'); }}
                                disabled={actionLoadingKey === `loan-approve-${loanId}` || actionLoadingKey === `loan-reject-${loanId}`}
                              >
                                {actionLoadingKey === `loan-approve-${loanId}` ? 'Approving...' : 'Approve'}
                              </button>
                              <button
                                type="button"
                                className="admin-action-btn reject"
                                onClick={(event) => { event.stopPropagation(); handleLoanReview(loan, 'reject'); }}
                                disabled={actionLoadingKey === `loan-approve-${loanId}` || actionLoadingKey === `loan-reject-${loanId}`}
                              >
                                {actionLoadingKey === `loan-reject-${loanId}` ? 'Rejecting...' : 'Reject'}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        loading ? (
          <TableSkeleton rows={6} columns={7} />
        ) : (
          <div className="responsive-table-shell">
            <table className="data-table">
              <thead><tr>
                <th>ID</th><th>Name</th><th>Email</th><th>Phone</th><th>Joined</th><th>Status</th><th>Action</th>
              </tr></thead>
              <tbody>{filteredUsers.map(u => (
                <tr key={getUserRecordId(u) || getUserRecordEmail(u)} className="clickable-table-row" onClick={() => openDetailModal(u, 'user')}>
                  <td>{getUserRecordId(u) || '-'}</td>
                  <td>{getUserDisplayName(u)}</td>
                  <td>{getUserRecordEmail(u) || '-'}</td>
                  <td>{getUserPhoneDisplay(u)}</td>
                  <td>{formatLoanDate(getLoanValue(u, ['createdAt', 'created_at', 'dateJoined', 'date_joined']))}</td>
                  <td><span className={`table-status ${getTableStatusClass(getUserVerificationLabel(u))}`}>{getUserVerificationLabel(u)}</span></td>
                  <td>
                    {isUserPendingVerification(u) ? (
                      <button
                        type="button"
                        className="admin-action-btn approve"
                        onClick={(event) => { event.stopPropagation(); handleVerifyUser(u); }}
                        disabled={actionLoadingKey === `user-${getUserRecordId(u) || getUserRecordEmail(u)}`}
                      >
                        {actionLoadingKey === `user-${getUserRecordId(u) || getUserRecordEmail(u)}` ? 'Verifying...' : 'Verify'}
                      </button>
                    ) : (
                      <span className="admin-muted-text">Verified</span>
                    )}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )
      )}

      {activeTab === 'loans' && (
        loading ? (
          <TableSkeleton rows={7} columns={10} />
        ) : (
        <div className="responsive-table-shell">
          <table className="data-table">
            <thead><tr>
              <th>ID</th><th>User</th><th>ID No.</th><th>Type</th><th>Principal</th><th>Repayment</th><th>Receipt</th><th>Status</th><th>Date</th><th>Action</th>
            </tr></thead>
            <tbody>{filteredLoans.map(l => {
              const reviewNotice = recentlyReviewedLoans[l.id];
              const statusLabel = reviewNotice?.label || titleCaseStatus(getLoanStatusText(l) || 'Pending');
              return (
                <tr key={l.id} className="clickable-table-row" onClick={() => openDetailModal(l, 'loan')}>
                  <td>{l.id}</td>
                  <td>{getUserDisplayName(l)}</td>
                  <td>{l.national_id_number || '-'}</td>
                  <td>{l.transaction_type || l.loan_type}</td>
                  <td>{formatKes(Math.abs(Number(l.principal_amount || l.amount)))}</td>
                  <td>{formatKes(Math.abs(Number(l.repayment_amount || l.amount)))}</td>
                  <td>{l.receipt_number || l.account_number || '-'}</td>
                    <td><span className={`table-status ${getTableStatusClass(statusLabel)}`}>{statusLabel}</span></td>
                  <td>{formatLoanDate(l.completed_at || l.date_applied)}</td>
                  <td>
                    {reviewNotice ? (
                      <span className={`admin-review-result ${reviewNotice.type}`}>{reviewNotice.label}</span>
                    ) : isPendingLoanStatus(l) ? (
                      <div className="admin-action-row">
                        <button
                          type="button"
                          className="admin-action-btn approve"
                          onClick={(event) => { event.stopPropagation(); handleLoanReview(l, 'approve'); }}
                          disabled={actionLoadingKey === `loan-approve-${l.id}` || actionLoadingKey === `loan-reject-${l.id}`}
                        >
                          {actionLoadingKey === `loan-approve-${l.id}` ? 'Approving...' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          className="admin-action-btn reject"
                          onClick={(event) => { event.stopPropagation(); handleLoanReview(l, 'reject'); }}
                          disabled={actionLoadingKey === `loan-approve-${l.id}` || actionLoadingKey === `loan-reject-${l.id}`}
                        >
                          {actionLoadingKey === `loan-reject-${l.id}` ? 'Rejecting...' : 'Reject'}
                        </button>
                      </div>
                    ) : (
                      <span className="admin-muted-text">Closed</span>
                    )}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        )
      )}

      {activeTab === 'repayments' && (
        loading ? (
          <TableSkeleton rows={7} columns={8} />
        ) : (
        <div className="responsive-table-shell">
          <table className="data-table">
            <thead><tr>
              <th>ID</th><th>User</th><th>Amount</th><th>Mode</th><th>Receipt</th><th>Provider Ref</th><th>Status</th><th>Date</th>
            </tr></thead>
            <tbody>{filteredRepayments.map((repayment) => {
              const statusLabel = titleCaseStatus(repayment.status || 'Pending');
              return (
                <tr key={`${repayment.transaction_type || 'repayment'}-${repayment.id}`} className="clickable-table-row" onClick={() => openDetailModal(repayment, 'repayment')}>
                  <td>{repayment.id}</td>
                  <td>{getUserDisplayName(repayment)}</td>
                  <td className="amount-credit">{formatKes(Math.abs(Number(repayment.amount || 0)))}</td>
                  <td>{repayment.payment_mode || '-'}</td>
                  <td>{repayment.receipt_number || repayment.account_number || '-'}</td>
                  <td>{repayment.checkout_request_id || repayment.provider_request_id || '-'}</td>
                    <td><span className={`table-status ${getTableStatusClass(statusLabel)}`}>{statusLabel}</span></td>
                  <td>{formatLoanDate(repayment.completed_at || repayment.created_at)}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        )
      )}

      {modalRecord && modalHistory && (
        <div className="admin-modal-backdrop" role="presentation" onClick={closeDetailModal}>
          <div className="admin-detail-modal" role="dialog" aria-modal="true" aria-labelledby="admin-detail-title" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <h3 id="admin-detail-title">{getUserDisplayName(modalRecord)}</h3>
                <p>{getUserRecordEmail(modalRecord) || 'No email on record'}</p>
              </div>
              <button type="button" className="admin-modal-close" onClick={closeDetailModal} aria-label="Close details">x</button>
            </div>

            <div className="admin-detail-grid">
              <div><span>User ID</span><strong>{getRecordUserId(modalRecord) || '-'}</strong></div>
              <div><span>ID Number</span><strong>{getLoanValue(modalRecord, ['national_id_number', 'nationalIdNumber', 'id_number', 'idNumber'], '-')}</strong></div>
              <div><span>Total Loans Taken</span><strong>{modalHistory.totalLoansTaken}</strong></div>
              <div><span>Repayment Success</span><strong>{modalHistory.repaymentSuccessRate}%</strong></div>
              <div><span>Active Balance</span><strong>{formatKes(modalHistory.activeBalance)}</strong></div>
              <div><span>Phone</span><strong>{getUserPhoneDisplay(modalRecord)}</strong></div>
            </div>

            {detailModalRecord.type === 'loan' && (
              <div className="admin-modal-loan-card">
                <span>Selected loan</span>
                <strong>{getLoanValue(modalRecord, ['loan_type', 'loanType', 'transaction_type'], 'Loan')}</strong>
                <p>{formatKes(getLoanValue(modalRecord, ['repayment_amount', 'amount'], 0))} &middot; {titleCaseStatus(getLoanStatusText(modalRecord) || 'Pending')}</p>
                {isPendingLoanStatus(modalRecord) && !modalReviewNotice && (
                  <div className="admin-action-row">
                    <button
                      type="button"
                      className="admin-action-btn approve"
                      onClick={() => handleLoanReview(modalRecord, 'approve')}
                      disabled={actionLoadingKey === `loan-approve-${modalLoanId}` || actionLoadingKey === `loan-reject-${modalLoanId}`}
                    >
                      {actionLoadingKey === `loan-approve-${modalLoanId}` ? 'Approving...' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      className="admin-action-btn reject"
                      onClick={() => handleLoanReview(modalRecord, 'reject')}
                      disabled={actionLoadingKey === `loan-approve-${modalLoanId}` || actionLoadingKey === `loan-reject-${modalLoanId}`}
                    >
                      {actionLoadingKey === `loan-reject-${modalLoanId}` ? 'Rejecting...' : 'Reject'}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="admin-history-columns">
              <div className="admin-history-panel">
                <h4>Loan History</h4>
                {modalHistory.userLoans.length === 0 ? (
                  <p className="admin-muted-text">No loan history.</p>
                ) : modalHistory.userLoans.slice(0, 5).map((loan) => (
                  <div key={`modal-loan-${loan.id}`} className="admin-history-item">
                    <strong>{getLoanValue(loan, ['loan_type', 'transaction_type'], 'Loan')}</strong>
                    <span>{formatKes(getLoanValue(loan, ['repayment_amount', 'amount'], 0))} &middot; {titleCaseStatus(getLoanStatusText(loan) || 'Pending')}</span>
                  </div>
                ))}
              </div>
              <div className="admin-history-panel">
                <h4>Repayment History</h4>
                {modalHistory.userRepayments.length === 0 ? (
                  <p className="admin-muted-text">No repayment history.</p>
                ) : modalHistory.userRepayments.slice(0, 5).map((repayment) => (
                  <div key={`modal-repayment-${repayment.transaction_type || 'repayment'}-${repayment.id}`} className="admin-history-item">
                    <strong>{formatKes(Math.abs(Number(repayment.amount || 0)))}</strong>
                    <span>{titleCaseStatus(repayment.status || 'Pending')} &middot; {formatLoanDate(repayment.completed_at || repayment.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [notification, setNotification] = useState({ message: '', type: '' });
  const notificationTimerRef = useRef(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard_home');
  const [signupNotifications, setSignupNotifications] = useState(() => (ALLOW_LOCAL_AUTH_FALLBACK ? readStoredSignupNotifications() : []));
  const [localUsers, setLocalUsers] = useState(() => (ALLOW_LOCAL_AUTH_FALLBACK ? readStoredLocalUsers() : []));
  const [adminPendingCounts, setAdminPendingCounts] = useState({ users: 0, loans: 0 });
  const [adminInitialTab, setAdminInitialTab] = useState('overview');
  const [notificationPanelMode, setNotificationPanelMode] = useState('user');
  const [navigationHistory, setNavigationHistory] = useState([]);
  
  // Settings sub-view states and toggles
  const [settingsMode, setSettingsMode] = useState('home'); // home, password, profile
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [repayDropdown, setRepayDropdown] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [appliedAmount, setAppliedAmount] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [repaymentAmount, setRepaymentAmount] = useState('');
  const [loanDurationMonths, setLoanDurationMonths] = useState(1);
  const [nationalIdNumber, setNationalIdNumber] = useState('');
  const [loanRequestLoading, setLoanRequestLoading] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [paymentMode, setPaymentMode] = useState('Mobile'); 
  const [disbursementAccount, setDisbursementAccount] = useState('');
  const [loanBalance, setLoanBalance] = useState(0);
  const [latestLoan, setLatestLoan] = useState(null);
  const [userLoanRecords, setUserLoanRecords] = useState([]);
  const [loanBalancesById, setLoanBalancesById] = useState({});
  const [selectedRepaymentLoanId, setSelectedRepaymentLoanId] = useState('');
  const [userNotifications, setUserNotifications] = useState([]);
  const [readUserNotificationKeys, setReadUserNotificationKeys] = useState([]);
  const [loanStatusLoading, setLoanStatusLoading] = useState(false);
  const [loanStatusError, setLoanStatusError] = useState('');

  const [userProfile, setUserProfile] = useState({
    id: null,
    name: "Guest User",
    email: "",
    phone: "",
    loanId: "LNX-PENDING"
  });

  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState('');
  const [paymentError, setPaymentError] = useState(false);
  const [mpesaPhone, setMpesaPhone] = useState('');

  useEffect(() => {
    if (userProfile.phone) {
      setMpesaPhone(userProfile.phone);
    }
  }, [userProfile.phone]);

  useEffect(() => {
    const session = readStoredAuthSession();
    if (!session) return;

    const sessionEmail = normalizeEmail(session.userProfile?.email);
    if (session.isAdminUser || isAdminEmail(sessionEmail)) {
      clearStoredAuthSession();
      return;
    }

    setIsLoggedIn(true);
    setIsAdminUser(false);
    setCurrentView(session.currentView || 'dashboard_home');
    setSettingsMode(session.settingsMode || 'home');
    setLoanBalance(Number(session.loanBalance || 0));
    setLatestLoan(session.latestLoan || null);
    setUserLoanRecords(Array.isArray(session.userLoanRecords) ? session.userLoanRecords : []);
    setLoanBalancesById(session.loanBalancesById || {});
    setSelectedRepaymentLoanId(session.selectedRepaymentLoanId || '');
    setReadUserNotificationKeys(Array.isArray(session.readUserNotificationKeys) ? session.readUserNotificationKeys : []);
    setUserProfile(session.userProfile);
  }, []);

  useEffect(() => {
    if (!isLoggedIn || !userProfile.id) return;
    if (isAdminUser || isAdminEmail(userProfile.email)) {
      clearStoredAuthSession();
      return;
    }

    writeStoredAuthSession({
      isAdminUser,
      currentView,
      settingsMode,
      loanBalance,
      latestLoan,
      userLoanRecords,
      loanBalancesById,
      selectedRepaymentLoanId,
      readUserNotificationKeys,
      userProfile
    });
  }, [isLoggedIn, isAdminUser, currentView, settingsMode, loanBalance, latestLoan, userLoanRecords, loanBalancesById, selectedRepaymentLoanId, readUserNotificationKeys, userProfile]);

  useEffect(() => {
    if (ALLOW_LOCAL_AUTH_FALLBACK || typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(SIGNUP_NOTIFICATIONS_KEY);
    window.localStorage.removeItem(LOCAL_USERS_KEY);
    window.localStorage.removeItem(LOCAL_RESET_CODES_KEY);
  }, []);

  const loanTypes = [
    { id: 1, name: 'Personal Loan', desc: 'Funding for personal expenses and medical needs.', rate: '70% p.a.', amounts: [5000, 10000, 15000] },
    { id: 2, name: 'Business Loan', desc: 'Loan for boosting stock and scaling up standard market operations.', rate: '75% p.a.', amounts: [50000, 100000, 150000] },
    { id: 3, name: 'Emergency Loan', desc: 'Instant short-term cash Loans for immediate bill settlement', rate: '60% p.a.', amounts: [2500, 5000, 10000] }
  ];

  const loanAmountBounds = getLoanAmountBounds(selectedLoan);
  const selectedLoanAmountValue = selectedLoan
    ? (appliedAmount === 'custom'
      ? parseCurrencyInput(customAmount)
      : parseFloat(appliedAmount || selectedLoan.amounts?.[0] || loanAmountBounds.min))
    : 0;
  const loanQuote = getLoanQuote(selectedLoanAmountValue, selectedLoan?.rate, loanDurationMonths);
  const partialPaymentValue = parseCurrencyInput(repaymentAmount);
  const payableLoanRecords = userLoanRecords.filter((loan) => Math.max(Number(loanBalancesById[getLoanRecordId(loan)] ?? getLoanRepaymentTotal(loan)), 0) > 0);
  const selectedRepaymentLoan = userLoanRecords.find((loan) => getLoanRecordId(loan) === selectedRepaymentLoanId) || payableLoanRecords[0] || latestLoan;
  const selectedRepaymentLoanBalance = selectedRepaymentLoan
    ? Math.max(Number(loanBalancesById[getLoanRecordId(selectedRepaymentLoan)] ?? getLoanRepaymentTotal(selectedRepaymentLoan)), 0)
    : Number(loanBalance) || 0;
  const currentLoanBalance = selectedRepaymentLoanBalance;
  const isPartialPaymentValid = Number.isFinite(partialPaymentValue) && partialPaymentValue > 0 && partialPaymentValue <= currentLoanBalance;
  const remainingAfterPartial = isPartialPaymentValid ? Math.max(currentLoanBalance - partialPaymentValue, 0) : currentLoanBalance;
  const hasNationalIdInput = nationalIdNumber.length > 0;
  const isNationalIdReady = isValidKenyanNationalId(nationalIdNumber);
  const pendingSignupNotifications = signupNotifications.filter(isUserPendingVerification);
  const pendingSignupCount = Math.max(pendingSignupNotifications.length, adminPendingCounts.users || 0);
  const adminNotificationCount = pendingSignupCount + (adminPendingCounts.loans || 0);
  const readUserNotificationKeySet = new Set(readUserNotificationKeys);
  const userNotificationCount = userNotifications.filter((item) => !readUserNotificationKeySet.has(item.key)).length;
  const notificationIconMode = isAdminUser && currentView === 'admin' ? 'admin' : 'user';
  const pendingNotificationCount = notificationIconMode === 'admin' ? adminNotificationCount : userNotificationCount;

  const pushNavigationState = useCallback((snapshot) => {
    const nextSnapshot = snapshot || {
      view: currentView,
      settingsMode,
      adminInitialTab
    };

    setNavigationHistory((currentHistory) => {
      const last = currentHistory[currentHistory.length - 1];
      if (
        last &&
        last.view === nextSnapshot.view &&
        last.settingsMode === nextSnapshot.settingsMode &&
        last.adminInitialTab === nextSnapshot.adminInitialTab
      ) {
        return currentHistory;
      }

      return [...currentHistory, nextSnapshot].slice(-20);
    });
  }, [currentView, settingsMode, adminInitialTab]);

  const restoreNavigationState = useCallback((snapshot) => {
    if (!snapshot) return;

    setCurrentView(snapshot.view || 'dashboard_home');
    setSettingsMode(snapshot.settingsMode || 'home');
    setAdminInitialTab(snapshot.adminInitialTab || 'overview');
  }, []);

  const navigateToView = useCallback((viewName, options = {}) => {
    const nextView = viewName || 'dashboard_home';
    const nextSettingsMode = Object.prototype.hasOwnProperty.call(options, 'settingsMode')
      ? options.settingsMode
      : 'home';
    const nextAdminTab = Object.prototype.hasOwnProperty.call(options, 'adminInitialTab')
      ? options.adminInitialTab
      : adminInitialTab;

    pushNavigationState();
    setCurrentView(nextView);

    if (nextView === 'settings' || Object.prototype.hasOwnProperty.call(options, 'settingsMode')) {
      setSettingsMode(nextSettingsMode || 'home');
    } else if (nextView !== 'settings') {
      setSettingsMode('home');
    }

    if (nextView === 'admin' || Object.prototype.hasOwnProperty.call(options, 'adminInitialTab')) {
      setAdminInitialTab(nextAdminTab || 'overview');
    }
  }, [adminInitialTab, pushNavigationState]);

  const goBackOneStep = useCallback(() => {
    setNavigationHistory((currentHistory) => {
      if (currentHistory.length === 0) return currentHistory;

      const previous = currentHistory[currentHistory.length - 1];
      restoreNavigationState(previous);
      return currentHistory.slice(0, -1);
    });
  }, [restoreNavigationState]);

  const triggerAlert = useCallback((message, type) => {
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
    }

    setNotification({ message, type });
    notificationTimerRef.current = setTimeout(() => {
      setNotification({ message: '', type: '' });
      notificationTimerRef.current = null;
    }, 4500);
  }, []);

  const saveLocalUsers = useCallback((updater) => {
    if (!ALLOW_LOCAL_AUTH_FALLBACK) return;
    setLocalUsers((currentUsers) => {
      const nextUsers = typeof updater === 'function' ? updater(currentUsers) : updater;
      writeStoredLocalUsers(nextUsers);
      return nextUsers;
    });
  }, []);

  const findLocalUserByEmail = useCallback((emailValue) => {
    if (!ALLOW_LOCAL_AUTH_FALLBACK) return null;
    const cleanEmail = normalizeEmail(emailValue);
    return localUsers.find((user) => getUserRecordEmail(user) === cleanEmail);
  }, [localUsers]);

  const saveLocalUser = useCallback((user) => {
    saveLocalUsers((currentUsers) => upsertLocalUser(currentUsers, user));
  }, [saveLocalUsers]);

  const clearSignupNotificationForUser = useCallback((userOrEmail) => {
    setSignupNotifications((currentNotifications) => {
      const nextNotifications = removeUserFromPendingRecords(currentNotifications, userOrEmail);
      writeStoredSignupNotifications(nextNotifications);
      setAdminPendingCounts((currentCounts) => ({
        ...currentCounts,
        users: nextNotifications.filter(isUserPendingVerification).length
      }));
      return nextNotifications;
    });
  }, []);

  const markLocalUserVerified = useCallback((userOrEmail) => {
    if (!ALLOW_LOCAL_AUTH_FALLBACK) return;
    const cleanEmail = typeof userOrEmail === 'string' ? normalizeEmail(userOrEmail) : getUserRecordEmail(userOrEmail);

    saveLocalUsers((currentUsers) => currentUsers.map((user) => {
      const sameUser = typeof userOrEmail === 'string'
        ? recordMatchesEmail(user, cleanEmail)
        : recordsReferToSameUser(user, userOrEmail);

      return sameUser
        ? { ...user, status: 'Verified', verified: true, is_verified: true, isVerified: true, pendingVerification: false }
        : user;
    }));
  }, [saveLocalUsers]);

  const updateLocalUserRecord = useCallback((emailValue, updater) => {
    if (!ALLOW_LOCAL_AUTH_FALLBACK) return null;
    const cleanEmail = normalizeEmail(emailValue);
    let updatedUser = null;

    saveLocalUsers((currentUsers) => currentUsers.map((user) => {
      if (getUserRecordEmail(user) !== cleanEmail) return user;
      updatedUser = typeof updater === 'function' ? updater(user) : { ...user, ...updater };
      return updatedUser;
    }));

    return updatedUser;
  }, [saveLocalUsers]);

  const issueLocalResetCode = useCallback((emailValue) => {
    if (!ALLOW_LOCAL_AUTH_FALLBACK) return null;
    const cleanEmail = normalizeEmail(emailValue);
    const code = createLocalResetCode();
    const nextCodes = [
      { email: cleanEmail, code, expiresAt: Date.now() + (10 * 60 * 1000) },
      ...readStoredResetCodes().filter((record) => normalizeEmail(record.email) !== cleanEmail)
    ];

    writeStoredResetCodes(nextCodes);
    return code;
  }, []);

  const handleAdminCountsChange = useCallback((counts) => {
    setAdminPendingCounts((currentCounts) => {
      const nextCounts = {
        users: counts.users || 0,
        loans: counts.loans || 0
      };

      if (currentCounts.users === nextCounts.users && currentCounts.loans === nextCounts.loans) {
        return currentCounts;
      }

      return nextCounts;
    });
  }, []);

  const handleUserVerified = useCallback((verifiedUser) => {
    clearSignupNotificationForUser(verifiedUser);
    markLocalUserVerified(verifiedUser);
  }, [clearSignupNotificationForUser, markLocalUserVerified]);

  const handleLoanReviewed = useCallback((updatedLoan, payload = {}) => {
    setAdminPendingCounts((currentCounts) => ({
      ...currentCounts,
      loans: Math.max((currentCounts.loans || 0) - 1, 0)
    }));

    const reviewedUserId = getLoanValue(updatedLoan, ['user_id', 'userId', 'user_id'], '');
    if (String(reviewedUserId) !== String(userProfile.id || '')) return;

    if (Object.prototype.hasOwnProperty.call(payload, 'loanBalance')) {
      setLoanBalance(Number(payload.loanBalance || 0));
    }
    setLatestLoan((currentLoan) => currentLoan ? { ...currentLoan, ...updatedLoan } : updatedLoan);
  }, [userProfile.id]);

  const handleOpenAdmin = useCallback((tab = 'overview') => {
    if (!isAdminUser) return;
    navigateToView('admin', { adminInitialTab: tab });
    if (window.innerWidth <= 768) setIsMenuOpen(false);
  }, [isAdminUser, navigateToView]);

  const openRepaymentForLoan = useCallback((loan, viewName) => {
    const loanId = getLoanRecordId(loan);
    if (loanId) setSelectedRepaymentLoanId(loanId);
    setLatestLoan((currentLoan) => loan || currentLoan);
    setPaymentStatus('');
    setPaymentError(false);
    setRepaymentAmount('');
    setRepayDropdown(true);
    navigateToView(viewName);
    if (window.innerWidth <= 768) setIsMenuOpen(false);
  }, [navigateToView]);
  const refreshLatestLoanStatus = useCallback(async (userId = userProfile.id) => {
    if (!userId) return;

    setLoanStatusLoading(true);
    setLoanStatusError('');

    try {
      const [transactionsResponse, balanceResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/transactions/${userId}`),
        fetch(`${API_BASE_URL}/api/balance/${userId}`)
      ]);
      const [transactionsData, balanceData] = await Promise.all([
        parseResponseBody(transactionsResponse),
        parseResponseBody(balanceResponse)
      ]);
      let records = [];
      let resolvedBalance = 0;

      if (transactionsResponse.ok) {
        records = transactionsData.transactions || transactionsData.loans || transactionsData.loanRecords || [];
        const latestRecord = getLatestLoanRecord(records);
        const nextLoanRecords = getUserLoanRecordsFromTransactions(records);
        setLatestLoan((currentLoan) => latestRecord || currentLoan);
        setUserLoanRecords(nextLoanRecords);
      } else {
        setLoanStatusError(transactionsData.message || 'Unable to load loan status right now.');
      }

      if (balanceResponse.ok) {
        resolvedBalance = Number(balanceData.loanBalance || 0);
        setLoanBalance(resolvedBalance);
        setLoanBalancesById(buildLoanBalances(records));
      } else if (transactionsResponse.ok) {
        resolvedBalance = records.reduce((total, record) => {
          const status = String(record.status || record.display_status || '').toLowerCase();
          const isPosted = ['disbursed', 'completed', 'paid', 'approved', 'active'].some((statusKey) => status.includes(statusKey));
          return isPosted ? total + (Number(record.amount) || 0) : total;
        }, 0);
        setLoanBalance(resolvedBalance);
        setLoanBalancesById(buildLoanBalances(records));
      }

      if (transactionsResponse.ok) {
        const nextNotifications = buildUserNotifications(records, resolvedBalance);
        setUserNotifications(nextNotifications);
      } else {
        setUserNotifications([]);
      }
    } catch (error) {
      setLoanStatusError('Cannot connect to loan status records.');
    } finally {
      setLoanStatusLoading(false);
    }
  }, [userProfile.id]);

  useEffect(() => {
    if (!isLoggedIn || !userProfile.id) return;
    if (!['dashboard_home', 'loan_status', 'loan_lists', 'repay_fully', 'repay_partially', 'notifications'].includes(currentView)) return;

    refreshLatestLoanStatus(userProfile.id);
  }, [isLoggedIn, userProfile.id, currentView, refreshLatestLoanStatus]);

  useEffect(() => {
    if (!isLoggedIn || !userProfile.id) return;
    if (!['dashboard_home', 'loan_status', 'loan_lists', 'repay_fully', 'repay_partially', 'notifications'].includes(currentView)) return;

    const refreshTimer = setInterval(() => {
      refreshLatestLoanStatus(userProfile.id);
    }, 10000);

    return () => clearInterval(refreshTimer);
  }, [isLoggedIn, userProfile.id, currentView, refreshLatestLoanStatus]);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (isAdminUser) return;
    if (currentView === 'admin') {
      setCurrentView('dashboard_home');
    }
  }, [isLoggedIn, isAdminUser, currentView]);

  const markUserNotificationsRead = useCallback((notifications = userNotifications) => {
    const notificationKeys = notifications
      .map((item) => item?.key)
      .filter(Boolean);

    if (notificationKeys.length === 0) return;

    setReadUserNotificationKeys((currentKeys) => {
      const nextKeys = Array.from(new Set([...currentKeys, ...notificationKeys]));
      if (nextKeys.length === currentKeys.length) return currentKeys;

      writeStoredUserNotificationKeys(userProfile.id, userProfile.email, nextKeys);
      return nextKeys;
    });
  }, [userNotifications, userProfile.email, userProfile.id]);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (currentView !== 'notifications' || notificationPanelMode !== 'user') return;

    markUserNotificationsRead();
  }, [currentView, isLoggedIn, markUserNotificationsRead, notificationPanelMode]);

  const handleMpesaPaymentSubmit = async (e, variant = 'full') => {
    e.preventDefault();
    if (paymentLoading) return;
    const selectedLoanId = getLoanRecordId(selectedRepaymentLoan);
    const paymentAmount = variant === 'partial' ? parseCurrencyInput(repaymentAmount) : parseFloat(currentLoanBalance);

    if (!mpesaPhone || mpesaPhone.trim() === '') {
      triggerAlert('Please enter a valid M-Pesa phone number.', 'error-red');
      return;
    }

    if (currentLoanBalance <= 0) {
      triggerAlert('You do not have an outstanding balance to repay for this loan product.', 'error-red');
      return;
    }
    if (variant === 'partial' && (!paymentAmount || paymentAmount <= 0 || paymentAmount > currentLoanBalance)) {
      triggerAlert('Please enter a valid partial payment amount.', 'error-red');
      return;
    }

    setPaymentLoading(true);
    setPaymentError(false);
    setPaymentStatus('Initiating Payment...');
    let formattedPhone = mpesaPhone.trim();
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '254' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('+254')) {
      formattedPhone = formattedPhone.replace('+', '');
    } else if (!formattedPhone.startsWith('254')) {
      setPaymentLoading(false);
      setPaymentError(true);
      setPaymentStatus(' Invalid phone format. Use: 254XXXXXXXXX or 07XXXXXXXX');
      triggerAlert('Invalid phone number format!', 'error-red');
      return;
    }
    if (formattedPhone.length !== 12 || isNaN(formattedPhone)) {
      setPaymentLoading(false);
      setPaymentError(true);
      setPaymentStatus(' Phone must be 12 digits (254XXXXXXXXX)');
      triggerAlert('Phone must be 12 digits!', 'error-red');
      return;
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/api/mpesa/stkpush`, {
        phoneNumber: formattedPhone, 
        amount: paymentAmount,
        userId: userProfile.id,
        loanId: selectedLoanId || undefined,
        accountReference: `Loan-${selectedLoanId || userProfile.loanId}`,
        transactionDesc: `${getLoanValue(selectedRepaymentLoan, ['loan_type', 'loanType'], 'Loan')} repayment`
      });
      if (response.status === 200) {
        setPaymentStatus(response.data?.message || 'Check your phone and enter your M-Pesa PIN.');
        setPaymentError(false);
        triggerAlert('STK prompt sent to your phone!', 'success');

        // Poll balance every 5 seconds for 60 seconds
        let attempts = 0;
        const poll = setInterval(async () => {
          attempts++;
          try {
            const balRes = await fetch(`${API_BASE_URL}/api/balance/${userProfile.id}`);
            const balData = await balRes.json();
            if (balData.loanBalance !== loanBalance) {
              const updatedBalance = Number(balData.loanBalance || 0);
              setLoanBalance(updatedBalance);
              if (updatedBalance <= 0) {
                setLatestLoan((currentLoan) => currentLoan ? { ...currentLoan, status: 'Paid' } : currentLoan);
              } else {
                refreshLatestLoanStatus(userProfile.id);
              }
              setPaymentStatus('Payment received! Check Your Loan balance.');
              setRepaymentAmount('');
              clearInterval(poll);
            }
          } catch {}
          if (attempts >= 12) clearInterval(poll);
        }, 5000);
      }
    } catch (error) {
      console.error("M-Pesa error trace:", error);
      setPaymentError(true);
      const serverErrorMessage = error.response?.data?.error || 'Failed to initiate STK push. Try again.';
      setPaymentStatus(` ${serverErrorMessage}`);
      triggerAlert('STK Push submission Failed.', 'logout');
    } finally {
      setPaymentLoading(false);
    }
  };

  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    if (!currentPassword) {
      triggerAlert("Please enter your current password.", "error-red");
      return;
    }
    if (password.length < 8) {
      triggerAlert("Password must be at least 8 characters long.", "error-red");
      return;
    }
    if (password !== confirmPassword) {
      triggerAlert("Passwords do not match!", "error-red");
      return;
    }
    try {
      const response = await axios.post(`${API_BASE_URL}/api/change-password`, {
        userId: userProfile.id,
        currentPassword,
        newPassword: password
      });
      if (response.status === 200) {
        triggerAlert("Password updated successfully!", "success");
        setSettingsMode('home');
        setCurrentPassword('');
        setPassword(''); 
        setConfirmPassword('');
      }
    } catch (error) {
      console.error("Password Update Error:", error);
      triggerAlert(error.response?.data?.message || "Cannot connect to server.", "error-red"); 
    }
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    try {
      const cleanFirstName = firstName.trim();
      const cleanLastName = lastName.trim();
      const cleanEmail = normalizeEmail(email);
      const cleanPhone = digitsOnly(phone);

      if (!cleanFirstName || !cleanLastName || !cleanEmail || !cleanPhone) {
        triggerAlert("All profile fields are required.", "error-red");
        return;
      }

      if (!isValidPersonName(cleanFirstName) || !isValidPersonName(cleanLastName)) {
        triggerAlert("First and last name must contain valid name letters only.", "error-red");
        return;
      }

      if (!isDigitsOnly(cleanPhone)) {
        triggerAlert("Phone number must contain numbers only.", "error-red");
        return;
      }

      const response = await axios.post(`${API_BASE_URL}/api/update-profile`, {
        userId: userProfile.id,
        firstName: cleanFirstName,
        lastName: cleanLastName,
        email: cleanEmail,
        phone: cleanPhone
      });
      if (response.status === 200) {
        setUserProfile({
          ...userProfile,
          name: `${cleanFirstName} ${cleanLastName}`.trim(),
          email: cleanEmail,
          phone: cleanPhone
        });
        setEmail(cleanEmail);
        setFirstName(cleanFirstName);
        setLastName(cleanLastName);
        setPhone(cleanPhone);
        triggerAlert("Profile updated successfully!", "success");
        setSettingsMode('home');
      }
    } catch (error) {
      console.error("Profile Update Error:", error);
      triggerAlert(error.response?.data?.message || "Cannot connect to server.", "error-red"); 
    }
  };

  const handleLogout = () => {
    setNavigationHistory([]);
    setIsLoggedIn(false);
    setIsAdminUser(false);
    setCurrentView('dashboard_home');
    setAuthMode('login');
    setSettingsMode('home');
    setLoanBalance(0);
    setLatestLoan(null);
    setUserLoanRecords([]);
    setLoanBalancesById({});
    setSelectedRepaymentLoanId('');
    setUserNotifications([]);
    setReadUserNotificationKeys([]);
    setLoanStatusError('');
    setLoanStatusLoading(false);
    setUserProfile({ id: null, name: "Guest User", email: "", phone: "", loanId: "LNX-PENDING" });
    setIsMenuOpen(false);
    setPaymentStatus('');
    setPaymentError(false);
    setCurrentPassword('');
    setPassword('');
    setConfirmPassword('');
    setRepaymentAmount('');
    setNationalIdNumber('');
    setLoanRequestLoading(false);
    clearStoredAuthSession();
    triggerAlert('Logged out successfully.', 'logout');
  };

  const resetSignupForm = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setPassword('');
    setConfirmPassword('');
  };

  const createLocalSignupUser = (cleanEmail) => {
    if (!ALLOW_LOCAL_AUTH_FALLBACK) return null;
    const localId = createLocalUserId();
    const name = `${firstName.trim()} ${lastName.trim()}`.trim();
    const cleanPhone = digitsOnly(phone);
    const localUser = {
      id: localId,
      userId: localId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      name,
      email: cleanEmail,
      phone: cleanPhone,
      password,
      loanId: createLocalLoanId(),
      status: 'Verified',
      is_verified: true,
      verified: true,
      pendingVerification: false,
      source: 'local-signup',
      localOnly: true,
      createdAt: new Date().toISOString()
    };

    saveLocalUser(localUser);
    return localUser;
  };

  const completeLogin = (data, { cleanEmail, isLocal = false } = {}) => {
    const profileId = data.userId || data.id || data.user_id;
    const profileEmail = normalizeEmail(data.email || cleanEmail);
    const profileName = getUserDisplayName({ ...data, email: profileEmail });
    const loginLoan = data.latestLoan || data.loan || (data.loanStatus ? {
      status: data.loanStatus,
      amount: data.loanAmount || data.loanBalance || 0,
      loan_type: data.loanType || 'Loan Account',
      date_applied: data.dateApplied || data.loanDate,
      payment_mode: data.paymentMode,
      account_number: data.accountNumber
    } : null);

    setNavigationHistory([]);
    setIsLoggedIn(true);
    setIsAdminUser(Boolean(data.isAdmin || data.role === 'admin' || isAdminEmail(data.email || cleanEmail)));
    const loginLoanRecords = Array.isArray(data.borrowedLoansList)
      ? data.borrowedLoansList
      : (loginLoan ? [loginLoan] : []);

    setCurrentView('dashboard_home');
    setLoanBalance(data.loanBalance || 0);
    setLatestLoan(loginLoan);
    setUserLoanRecords(loginLoanRecords);
    setLoanBalancesById(loginLoan ? { [getLoanRecordId(loginLoan)]: Number(data.loanBalance || getLoanRepaymentTotal(loginLoan)) } : {});
    setSelectedRepaymentLoanId(loginLoan ? getLoanRecordId(loginLoan) : '');
    setUserNotifications([]);
    setReadUserNotificationKeys(readStoredUserNotificationKeys(profileId, data.email || cleanEmail));
    setLoanStatusError('');
    setUserProfile({
      id: profileId,
      name: profileName,
      email: profileEmail,
      phone: data.phone || '',
      loanId: data.loanId || data.loan_id || createLocalLoanId()
    });

    if (cleanEmail) {
      clearSignupNotificationForUser(cleanEmail);
      markLocalUserVerified(cleanEmail);
    }

    triggerAlert('Successfully logged in!', 'success');
    setEmail('');
    setPassword('');
  };

  const tryLocalLogin = (cleanEmail) => {
    if (!ALLOW_LOCAL_AUTH_FALLBACK) return false;
    const localUser = findLocalUserByEmail(cleanEmail);
    if (!localUser) return false;

    if (localUser.password !== password) {
      triggerAlert('Invalid username or password!', 'error-red');
      return true;
    }

    if (isUserPendingVerification(localUser)) {
      const verifiedLocalUser = {
        ...localUser,
        status: 'Verified',
        is_verified: true,
        verified: true,
        pendingVerification: false
      };
      saveLocalUser(verifiedLocalUser);
      completeLogin(verifiedLocalUser, { cleanEmail, isLocal: true });
      return true;
    }

    completeLogin(localUser, { cleanEmail, isLocal: true });
    return true;
  };

  const handleSignUpSubmit = async () => {
    if (signupLoading) return;
    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    const cleanPhone = digitsOnly(phone);

    if (!cleanFirstName || !cleanLastName || !cleanPhone) {
      triggerAlert('Please enter your first name, last name, and phone number.', 'logout');
      return;
    }

    if (!isValidPersonName(cleanFirstName) || !isValidPersonName(cleanLastName)) {
      triggerAlert('First and last name must contain valid name letters only.', 'logout');
      return;
    }

    if (!isDigitsOnly(cleanPhone)) {
      triggerAlert('Phone number must contain numbers only.', 'logout');
      return;
    }

    if (password.length < 8) {
      triggerAlert('Password must be at least 8 characters long!', 'logout');
      return;
    }

    if (password !== confirmPassword) {
      triggerAlert('Passwords do not match!', 'logout');
      return;
    }

    setSignupLoading(true);
    const cleanEmail = normalizeEmail(email);
    setEmail(cleanEmail);
    setPhone(cleanPhone);

    if (findLocalUserByEmail(cleanEmail)) {
      triggerAlert('An account with this email already exists. Please log in or reset your password.', 'error-red');
      setSignupLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: cleanFirstName,
          lastName: cleanLastName,
          name: `${cleanFirstName} ${cleanLastName}`.trim(),
          email: cleanEmail,
          phone: cleanPhone,
          password,
          status: 'Verified'
        })
      });
      const data = await parseResponseBody(response);
      if (response.ok) {
        clearSignupNotificationForUser(cleanEmail);
        setAuthMode('login');
        triggerAlert(data.message || 'Account created successfully. You can log in now.', 'success');
        resetSignupForm();
      } else {
        if (ALLOW_LOCAL_AUTH_FALLBACK && response.status >= 500) {
          createLocalSignupUser(cleanEmail);
          setAuthMode('login');
          resetSignupForm();
          triggerAlert('Backend database is unavailable, so the account was saved locally. You can log in now.', 'success');
          return;
        }

        triggerAlert(data.message || 'Signup validation error', 'logout');
      }
    } catch (error) {
      if (ALLOW_LOCAL_AUTH_FALLBACK) {
        createLocalSignupUser(cleanEmail);
        setAuthMode('login');
        resetSignupForm();
        triggerAlert('Cannot reach backend, so the account was saved locally. You can log in now.', 'success');
        return;
      }

      triggerAlert('Cannot reach backend. Signup was not saved.', 'logout');
    } finally {
      setSignupLoading(false);
    }
  };

  const handleLoginSubmit = async () => {
    if (loginLoading) return;

    const cleanEmail = normalizeEmail(email);
    setEmail(cleanEmail);
    setLoginLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password })
      });
      const data = await parseResponseBody(response);
      if (response.ok) {
        completeLogin({
          ...data,
          status: data.status || 'Verified',
          is_verified: true,
          pendingVerification: false
        }, { cleanEmail });
      } else {
        if (ALLOW_LOCAL_AUTH_FALLBACK && tryLocalLogin(cleanEmail)) return;
        triggerAlert(data.message || 'Invalid username or password!', 'error-red');
      }
    } catch (error) {
      if (ALLOW_LOCAL_AUTH_FALLBACK && tryLocalLogin(cleanEmail)) return;
      triggerAlert('Cannot bridge connection to backend.', 'logout');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (emailValue = email) => {
    const cleanEmail = normalizeEmail(emailValue);
    setEmail(cleanEmail);

    try {
      const response = await fetch(`${API_BASE_URL}/api/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail })
      });
      const data = await parseResponseBody(response);
      if (response.ok) {
        triggerAlert(data.message || 'Recovery code generated!', 'success');
        return true;
      }

      if (ALLOW_LOCAL_AUTH_FALLBACK) {
        const localUser = findLocalUserByEmail(cleanEmail);
        if (localUser) {
          const code = issueLocalResetCode(cleanEmail);
          window.alert(`Your local recovery code is ${code}.`);
          triggerAlert('Local recovery code generated.', 'success');
          return true;
        }
      }

      triggerAlert([data.message || 'Email trace not found in records.', data.hint].filter(Boolean).join(' '), 'error-red');
      return false;
    } catch (error) {
      if (ALLOW_LOCAL_AUTH_FALLBACK) {
        const localUser = findLocalUserByEmail(cleanEmail);
        if (localUser) {
          const code = issueLocalResetCode(cleanEmail);
          window.alert(`Your local recovery code is ${code}.`);
          triggerAlert('Local recovery code generated.', 'success');
          return true;
        }
      }

      triggerAlert('Cannot bridge connection to backend.', 'logout');
      return false;
    }
  };

  const handleVerifyOtpSubmit = async (emailValue, otp) => {
    const cleanEmail = normalizeEmail(emailValue);

    try {
      const response = await fetch(`${API_BASE_URL}/api/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, otp, code: otp })
      });
      const data = await parseResponseBody(response);
      if (response.ok) return true;

      if (ALLOW_LOCAL_AUTH_FALLBACK && getValidLocalResetCode(cleanEmail, otp)) return true;

      triggerAlert(data.message || 'Invalid or expired OTP code.', 'error-red');
      return false;
    } catch (error) {
      if (ALLOW_LOCAL_AUTH_FALLBACK && getValidLocalResetCode(cleanEmail, otp)) return true;
      triggerAlert('Cannot verify the recovery code right now.', 'logout');
      return false;
    }
  };

  const handleResetPasswordSubmit = async (emailValue, newPassword, otp) => {
    const cleanEmail = normalizeEmail(emailValue);

    try {
      const response = await fetch(`${API_BASE_URL}/api/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, newPassword, password: newPassword, otp, code: otp })
      });
      const data = await parseResponseBody(response);
      if (response.ok) {
        clearLocalResetCode(cleanEmail);
        triggerAlert(data.message || 'Password updated successfully!', 'success');
        return true;
      }

      if (ALLOW_LOCAL_AUTH_FALLBACK && getValidLocalResetCode(cleanEmail, otp)) {
        updateLocalUserRecord(cleanEmail, (user) => ({ ...user, password: newPassword }));
        clearLocalResetCode(cleanEmail);
        triggerAlert('Password updated successfully!', 'success');
        return true;
      }

      triggerAlert(data.message || 'Failed to sync new credentials.', 'error-red');
      return false;
    } catch (error) {
      if (ALLOW_LOCAL_AUTH_FALLBACK && getValidLocalResetCode(cleanEmail, otp)) {
        updateLocalUserRecord(cleanEmail, (user) => ({ ...user, password: newPassword }));
        clearLocalResetCode(cleanEmail);
        triggerAlert('Password updated successfully!', 'success');
        return true;
      }

      triggerAlert('Cannot bridge connection to backend.', 'logout');
      return false;
    }
  };

  const handleApplyClick = (loan) => {
    const defaultAmount = loan.amounts?.[0] || '';
    setSelectedLoan(loan);
    setAppliedAmount(defaultAmount);
    setCustomAmount(String(defaultAmount));
    setLoanDurationMonths(1);
    setNationalIdNumber('');
    setPaymentMode('Mobile');
    setDisbursementAccount(digitsOnly(userProfile.phone));
    navigateToView('apply_loan_form');
    if (window.innerWidth <= 768) setIsMenuOpen(false);
  };

  const handleMobileNavClick = (viewName) => {
    if (viewName === 'admin' && !isAdminUser) return;
    if (viewName === 'admin') {
      setNotificationPanelMode('admin');
      navigateToView('admin', { adminInitialTab: 'overview' });
    } else if (viewName === 'settings') {
      navigateToView('settings', { settingsMode: 'home' });
    } else if (viewName === 'notifications') {
      setNotificationPanelMode(notificationIconMode);
      if (notificationIconMode === 'user') {
        markUserNotificationsRead();
      }
      navigateToView(viewName);
    } else {
      setNotificationPanelMode('user');
      navigateToView(viewName);
    }
    if (['dashboard_home', 'loan_status', 'loan_lists', 'repay_fully', 'repay_partially', 'notifications'].includes(viewName)) {
      refreshLatestLoanStatus();
    }
    if (window.innerWidth <= 768) setIsMenuOpen(false);
  };

  const handleLoanRequestSubmit = async (e) => {
    e.preventDefault();
    if (loanRequestLoading) return;

    const finalAmount = loanQuote.principal;
    const cleanNationalIdNumber = digitsOnly(nationalIdNumber).slice(0, 9);
    const cleanDisbursementAccount = paymentMode === 'Mobile'
      ? digitsOnly(disbursementAccount)
      : disbursementAccount.trim();
    const profileId = userProfile.id;

    if (!profileId) {
      triggerAlert('Please log in again before requesting a loan.', 'logout');
      return;
    }

    if (!finalAmount || finalAmount <= 0) {
      triggerAlert('Please select or enter a valid loan amount.', 'logout');
      return;
    }

    if (finalAmount < loanAmountBounds.min || finalAmount > loanAmountBounds.max) {
      triggerAlert(`Loan amount must be between KES ${loanAmountBounds.min.toLocaleString()} and KES ${loanAmountBounds.max.toLocaleString()}.`, 'logout');
      return;
    }

    if (!isValidKenyanNationalId(cleanNationalIdNumber)) {
      triggerAlert('ID number must contain exactly 8 or 9 digits.', 'logout');
      return;
    }

    if (!cleanDisbursementAccount) {
      triggerAlert('Please enter the account that should receive funds.', 'logout');
      return;
    }

    if (paymentMode === 'Mobile' && !isDigitsOnly(cleanDisbursementAccount)) {
      triggerAlert('Mobile number must contain numbers only.', 'logout');
      return;
    }

    setLoanRequestLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/loans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: profileId,
          loanType: selectedLoan.name,
          amount: finalAmount,
          durationMonths: loanQuote.months,
          interestRate: loanQuote.annualRate,
          repaymentAmount: loanQuote.repaymentTotal,
          dueDate: loanQuote.dueDateIso,
          nationalIdNumber: cleanNationalIdNumber,
          paymentMode: paymentMode,
          accountNumber: cleanDisbursementAccount,
          status: 'Pending Approval'
        })
      });

      const data = await parseResponseBody(response);

      if (response.ok) {
        const requestedLoan = data.loan || data.latestLoan || {
          id: data.loanId || data.id || `local-${Date.now()}`,
          loan_type: selectedLoan.name,
          amount: data.repaymentAmount || loanQuote.repaymentTotal,
          principal_amount: data.principalAmount || finalAmount,
          repayment_amount: data.repaymentAmount || loanQuote.repaymentTotal,
          duration_months: loanQuote.months,
          interest_rate: loanQuote.annualRate,
          due_date: data.dueDate || loanQuote.dueDateIso,
          national_id_number: data.nationalIdNumber || cleanNationalIdNumber,
          status: data.status || data.loanStatus || 'Pending Approval',
          date_applied: data.date_applied || data.dateApplied || new Date().toISOString(),
          payment_mode: paymentMode,
          account_number: cleanDisbursementAccount
        };

        if (isApprovedLoanStatus(requestedLoan)) {
          setLoanBalance(data.newTotalBalance || data.loanBalance || loanBalance);
        }
        setLatestLoan(requestedLoan);
        setUserLoanRecords((currentRecords) => [requestedLoan, ...currentRecords.filter((loan) => getLoanRecordId(loan) !== getLoanRecordId(requestedLoan))]);
        if (getLoanRecordId(requestedLoan)) {
          setSelectedRepaymentLoanId(getLoanRecordId(requestedLoan));
        }
        setLoanStatusError('');
        setAdminPendingCounts((currentCounts) => ({
          ...currentCounts,
          loans: (currentCounts.loans || 0) + 1
        }));
        triggerAlert(`Loan request of KES ${Number(finalAmount).toLocaleString()} sent for admin review.`, 'success');
        setNationalIdNumber('');
        navigateToView('loan_status');
      } else {
        triggerAlert(data.message || 'Error processing loan request on backend server.', 'logout');
      }
    } catch (error) {
      triggerAlert('Cannot bridge connection to backend.', 'logout');
    } finally {
      setLoanRequestLoading(false);
    }
  };

  return (
    <div className="app-container">
      {notification.message && <div className={`alert-banner ${notification.type}`}>{notification.message}</div>}

      <header className="header">
        <div className="header-left-group">
          {isLoggedIn && (
            <button className="menu-toggle" onClick={() => setIsMenuOpen(!isMenuOpen)}>
              {isMenuOpen ? '✕' : '☰'}
            </button>
          )}
          {isLoggedIn && navigationHistory.length > 0 && (
            <button
              type="button"
              onClick={goBackOneStep}
              aria-label="Go back"
              title="Go back"
              style={{
                background: 'none',
                border: 0,
                color: '#f49e2f',
                padding: '6px 8px',
                marginLeft: '4px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <ion-icon name="arrow-back-outline" style={{ fontSize: '26px' }}></ion-icon>
            </button>
          )}
          <h1>
            <span className="text-blue">AUSTINE'S</span>
            {" "}
            <span className="text-red">LOAN BUSINESS</span>
          </h1>
        </div>
        {isLoggedIn && (
          <div className="header-right-nav">
            <div className="signed-in-block">
              <div className="user-profile-avatar" onClick={() => handleMobileNavClick('profile')}>{userProfile.name.charAt(0)}</div>
              {/* <button className="header-logout-btn" onClick={handleLogout}>Log Out</button> */}
              <button
                type="button"
                className={`notification-icon-button ${pendingNotificationCount > 0 ? 'has-notifications' : ''}`}
                onClick={() => handleMobileNavClick('notifications')}
                aria-label={`Notifications${pendingNotificationCount > 0 ? `, ${pendingNotificationCount} pending` : ''}`}
              >
                <ion-icon name={pendingNotificationCount > 0 ? 'notifications' : 'notifications-outline'}></ion-icon>
                {pendingNotificationCount > 0 && (
                  <span className="notification-count-badge">{pendingNotificationCount > 99 ? '99+' : pendingNotificationCount}</span>
                )}
              </button>
            </div>
          </div>
        )}
      </header>

      <div className="main-layout-wrapper">
        {!isLoggedIn ? (
          <div className="fullscreen-gate">
            <AuthView 
              authMode={authMode} setAuthMode={setAuthMode}
              email={email} setEmail={setEmail} phone={phone} setPhone={setPhone}
              firstName={firstName} setFirstName={setFirstName} lastName={lastName} setLastName={setLastName} 
              password={password} setPassword={setPassword} confirmPassword={confirmPassword} setConfirmPassword={setConfirmPassword}
              handleLoginSubmit={handleLoginSubmit} handleSignUpSubmit={handleSignUpSubmit}
              handleForgotPasswordSubmit={handleForgotPasswordSubmit}
              handleVerifyOtpSubmit={handleVerifyOtpSubmit}
              handleResetPasswordSubmit={handleResetPasswordSubmit}
              signupLoading={signupLoading}
              loginLoading={loginLoading}
            />
          </div>
        ) : (
          <div className="portal-frame-container">
            {isMenuOpen && <div className="sidebar-mobile-overlay" onClick={() => setIsMenuOpen(false)}></div>}
            
            <aside className={`sidebar ${isMenuOpen ? 'open' : 'closed'}`}>
              <nav className="nav-links">
                <button className={`nav-item ${currentView === 'dashboard_home' ? 'active' : ''}`} onClick={() => handleMobileNavClick('dashboard_home')}>Dashboard</button>
                <button className={`nav-item ${currentView === 'profile' ? 'active' : ''}`} onClick={() => handleMobileNavClick('profile')}>My Profile</button>
                <button className={`nav-item ${currentView === 'loans' || currentView === 'apply_loan_form' ? 'active' : ''}`} onClick={() => handleMobileNavClick('loans')}>Loan Products</button>
                <button className={`nav-item ${currentView === 'loan_lists' ? 'active' : ''}`} onClick={() => handleMobileNavClick('loan_lists')}>Loan Lists</button>
                <button className={`nav-item ${currentView === 'loan_status' ? 'active' : ''}`} onClick={() => handleMobileNavClick('loan_status')}>Loan Status</button>
                
                <div className="collapsible-nav-group">
                  <button className="nav-item sub-toggle" onClick={() => setRepayDropdown(!repayDropdown)}>
                    Repay Loan <span className="arrow-indicator">{repayDropdown ? '▼' : '►'}</span>
                  </button>
                  {repayDropdown && (
                    <div className="sub-menu-dropdown">
                      <button className={`sub-nav-item ${currentView === 'repay_fully' ? 'active' : ''}`} onClick={() => handleMobileNavClick('repay_fully')}>Fully Repay</button>
                      <button className={`sub-nav-item ${currentView === 'repay_partially' ? 'active' : ''}`} onClick={() => handleMobileNavClick('repay_partially')}>Partially Repay</button>
                    </div>
                  )}
                </div>
                <button className={`nav-item ${currentView === 'transactions' ? 'active' : ''}`} onClick={() => handleMobileNavClick('transactions')}>📋 Transactions</button>
                <button className={`nav-item ${currentView === 'settings' ? 'active' : ''}`} onClick={() => handleMobileNavClick('settings')}>⚙ Settings</button>
                {isAdminUser && (
                  <button className={`nav-item ${currentView === 'admin' ? 'active' : ''}`} onClick={() => handleMobileNavClick('admin')}>🛡 Admin</button>
                )}
                <button className="nav-item sidebar-logout-btn" onClick={handleLogout}>Logout</button>
              </nav>
            </aside>

            <main className="main-content-window">
              {currentView === 'dashboard_home' && (
                <div className="view-fade-in">
                  <h2 className="welcome-banner" style={{color: '#f49e2f'}}>Welcome Back, <span className="user-highlight">{userProfile.name}</span></h2>
                  <p className="welcome-subtitle">We are delighted to have you back to our better Loan services.</p>
                  
                  <div className="loan-balance-card-container">
                    <div className="balance-circle-graphic">
                      <div className="inner-coin-slot">💰</div>
                    </div>
                    <h3>Loan Balance</h3>
                    <div className="monetary-amount-display">
                      KES {Number(loanBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <button className="pay-now-action-btn" onClick={() => { setRepayDropdown(true); navigateToView('loan_lists'); }}>Pay Now</button>
                  </div>
                </div>
              )}

              {currentView === 'repay_fully' && (
                <div className="view-fade-in action-panel-card">
                  <h2>Full Settlement Portal</h2>
                  <p className="discount" style={{color: 'white', margin: '0 0 15px 0'}}>Clear outstanding loan balances on time to receive account standing discounts.</p>
                  <div className="repay-box-container" style={{ background: '#32bcde', padding: '24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', display: 'flex', flexDirection: 'column', gap: '16px', boxSizing: 'border-box', width: '100%' }}>
                    <p style={{ color: '#fff', fontSize: '16px', margin: 0, fontWeight: '500' }}>
                      Selected Loan: <strong>{getLoanValue(selectedRepaymentLoan, ['loan_type', 'loanType'], 'Loan Product')}</strong><br />
                      Balance Due: <strong>KES {Number(currentLoanBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                    </p>
                    
                    <form onSubmit={(e) => handleMpesaPaymentSubmit(e, 'full')} style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', alignItems: 'flex-start' }}>
                        <label style={{ color: '#fff', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>M-PESA Phone Number</label>
                        <input 
                          type="tel"
                          value={mpesaPhone}
                          onChange={(e) => setMpesaPhone(e.target.value)}
                          placeholder="e.g. 254712345678"
                          required
                          style={{ width: '100%', padding: '12px', borderRadius: '6px', border: 'none', fontSize: '15px', color: '#333', background: '#fff', boxSizing: 'border-box' }}
                        />
                      </div>
                      
                      <button 
                        type="submit" 
                        className="pay-now-action-btn" 
                        style={{ width: '100%', padding: '14px', borderRadius: '6px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', margin: 0 }} 
                        disabled={paymentLoading}
                      >
                        {paymentLoading ? <LoadingSpinner label="Processing push..." /> : 'PAY VIA M-PESA'}
                      </button>
                    </form>

                    {paymentStatus && (
                      <div style={{ 
                        marginTop: '5px', 
                        fontSize: '14px', 
                        color: paymentError ? '#721c24' : '#155724', 
                        fontWeight: '600', 
                        backgroundColor: paymentError ? '#f8d7da' : '#d4edda', 
                        border: paymentError ? '1px solid #f5c6cb' : '1px solid #c3e6cb',
                        padding: '12px', 
                        borderRadius: '6px',
                        wordBreak: 'break-word',
                        boxSizing: 'border-box',
                        width: '100%'
                      }}>
                        {paymentStatus}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {currentView === 'profile' && (
                <div className="view-fade-in">
                  <h2>Personal Information</h2>
                  <div className="profile-details-table-grid">
                    <div className="detail-row"><span className="label">Name:</span> <span className="val">{userProfile.name}</span></div>
                    <div className="detail-row"><span className="label">Phone Number:</span> <span className="val">{userProfile.phone}</span></div>
                    <div className="detail-row"><span className="label">Email:</span> <span className="val">{userProfile.email}</span></div>
                    <div className="detail-row"><span className="label">Account ID:</span> <span className="val code-font">{userProfile.loanId}</span></div>
                  </div>
                </div>
              )}

              {currentView === 'loans' && (
                <div className="view-fade-in loans-view-container">
                  <h2>Loan Products</h2>
                  <div className="loan-grid">
                    {loanTypes.map((loan) => (
                      <div key={loan.id} className="loan-card">
                        <h3>{loan.name}</h3>
                        <p>{loan.desc}</p>
                        <div className="loan-card-footer">
                          <span className="loan-rate">Rate: <strong>{loan.rate}</strong></span>
                          <button className="loan-apply-btn" onClick={() => handleApplyClick(loan)}>Apply Now</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {currentView === 'apply_loan_form' && selectedLoan && (
                <div className="view-fade-in action-panel-card loan-application-panel" style={{ maxWidth: '720px', margin: '0 auto' }}>
                  <div className="loan-status-header-row" style={{ marginBottom: '18px' }}>
                    <div>
                      <h2>Apply for {selectedLoan.name}</h2>
                      <p className="loan-status-summary">Review the loan details, then continue with your application.</p>
                    </div>
                  </div>
                  <p className="rate" style={{color: '#f3ebec',}}>Interest Rate: <strong>{selectedLoan.rate}</strong></p>
                  
                  <form onSubmit={handleLoanRequestSubmit} className="auth-form">
                    <div className="loan-calculator-panel">
                      <div className="input-group">
                        <label>Select Loan Amount (KES)</label>
                        <div className="loan-amount-button-group">
                          {selectedLoan.amounts.map((amt) => (
                            <button
                              type="button" key={amt} className="amount-selection-btn"
                              onClick={() => { setAppliedAmount(amt); setCustomAmount(String(amt)); }}
                              style={{
                                backgroundColor: Number(selectedLoanAmountValue) === amt ? '#d47a14' : '#0870a3',
                                color: Number(selectedLoanAmountValue) === amt ? '#fff' : '#f3f7fb'
                              }}
                            >
                              {amt.toLocaleString()}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="calculator-control-grid">
                        <div className="input-group">
                          <label>Amount Slider</label>
                          <input
                            type="range"
                            min={loanAmountBounds.min}
                            max={loanAmountBounds.max}
                            step={loanAmountBounds.step}
                            value={loanQuote.principal || loanAmountBounds.min}
                            onChange={(e) => { setAppliedAmount('custom'); setCustomAmount(e.target.value); }}
                            className="loan-range-input"
                          />
                        </div>
                        <div className="input-group">
                          <label>Custom Amount</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={formatCurrencyInput(customAmount)}
                            onChange={(e) => { setAppliedAmount('custom'); setCustomAmount(digitsOnly(e.target.value)); }}
                            placeholder="Enter amount"
                            required
                          />
                        </div>
                      </div>

                      <div className="calculator-control-grid">
                        <div className="input-group">
                          <label>Duration ({loanQuote.months} month{loanQuote.months === 1 ? '' : 's'})</label>
                          <input
                            type="range"
                            min="1"
                            max="6"
                            step="1"
                            value={loanDurationMonths}
                            onChange={(e) => setLoanDurationMonths(e.target.value)}
                            className="loan-range-input"
                          />
                        </div>
                        <div className="duration-chip-row">
                          {[1, 3, 6].map((months) => (
                            <button
                              type="button"
                              key={months}
                              className={`duration-chip ${Number(loanDurationMonths) === months ? 'active' : ''}`}
                              onClick={() => setLoanDurationMonths(months)}
                            >
                              {months}m
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="loan-quote-grid">
                        <div><span>Principal</span><strong>{formatKes(loanQuote.principal)}</strong></div>
                        <div><span>Interest</span><strong>{formatKes(loanQuote.interest)}</strong></div>
                        <div><span>Total Repayment</span><strong>{formatKes(loanQuote.repaymentTotal)}</strong></div>
                        <div><span>Due Date</span><strong>{loanQuote.dueDateLabel}</strong></div>
                      </div>
                    </div>

                    <div className="input-group">
                      <label>Mode of Payment</label>
                      <select 
                        value={paymentMode} 
                        onChange={(e) => {
                          const nextMode = e.target.value;
                          setPaymentMode(nextMode);
                          setDisbursementAccount(nextMode === 'Mobile' ? digitsOnly(userProfile.phone) : '');
                        }}
                        style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', background: '#094a87', color: '#fff' }}
                      >
                        <option value="Mobile">Mobile Money</option>
                        <option value="Bank">Bank</option>
                      </select>
                    </div>

                    <div className="input-group">
                      <label>ID Number for Verification</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={nationalIdNumber}
                        onChange={(e) => setNationalIdNumber(digitsOnly(e.target.value).slice(0, 9))}
                        placeholder="enter your national ID number"
                        maxLength="9"
                        className={hasNationalIdInput && !isNationalIdReady ? 'input-invalid' : ''}
                        aria-invalid={hasNationalIdInput && !isNationalIdReady}
                        required
                      />
                      {hasNationalIdInput && !isNationalIdReady && (
                        <span className="field-helper error">National ID must be exactly 8 or 9 digits.</span>
                      )}
                    </div>

                    <div className="input-group">
                      <label>
                        {paymentMode === 'Mobile' ? 'Mobile Number to Receive Funds' : 'Bank Account Number'}
                      </label>
                      <input 
                        type="text" 
                        inputMode={paymentMode === 'Mobile' ? 'numeric' : undefined}
                        className="disbursement-account-input" style={{ color: 'white' }}
                        value={disbursementAccount} 
                        onChange={(e) => setDisbursementAccount(paymentMode === 'Mobile' ? digitsOnly(e.target.value) : e.target.value)} 
                        placeholder={paymentMode === 'Mobile' ? 'enter mobile number' : 'enter account number'} 
                        required 
                      />
                    </div>

                    <div className="form-action-buttons">
                      <button type="button" className="auth-submit-btn cancel-btn" onClick={goBackOneStep} disabled={loanRequestLoading}>Cancel</button>
                      <button type="submit" className="auth-submit-btn" disabled={loanRequestLoading}>
                        {loanRequestLoading ? <LoadingSpinner label="Requesting..." /> : 'Request Loan'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {currentView === 'loan_status' && (
                <LoanStatusView
                  latestLoan={latestLoan}
                  loanBalance={loanBalance}
                  loading={loanStatusLoading}
                  error={loanStatusError}
                  onRefresh={() => refreshLatestLoanStatus()}
                />
              )}

              {currentView === 'loan_lists' && (
                <LoanListView
                  loans={userLoanRecords}
                  loanBalances={loanBalancesById}
                  loading={loanStatusLoading}
                  error={loanStatusError}
                  onRefresh={() => refreshLatestLoanStatus()}
                  onPayFull={(loan) => openRepaymentForLoan(loan, 'repay_fully')}
                  onPayPartial={(loan) => openRepaymentForLoan(loan, 'repay_partially')}
                />
              )}
              {currentView === 'notifications' && (
                <NotificationsView
                  isAdmin={isAdminUser && notificationPanelMode === 'admin'}
                  userNotifications={userNotifications}
                  pendingSignups={pendingSignupNotifications}
                  pendingCounts={adminPendingCounts}
                  onOpenAdmin={handleOpenAdmin}
                />
              )}

              {currentView === 'repay_partially' && (
                <div className="view-fade-in action-panel-card">
                  <h2 style={{color: '#ec7411'}}>Partial loan Repayment Option</h2>
                  <p className="repay-text" style={{color: 'whitesmoke'}}>Repay your Loan with any amount available, we offer flexible Loan Repayment!</p>
                  <div className="repay-box" style={{ background: '#22aeac', padding: '20px', borderRadius: '8px', border: '1px solid #e1e8ed', marginTop: '15px' }}>
                    <p style={{color: 'white', marginBottom: '10px'}}>Selected Loan: <strong>{getLoanValue(selectedRepaymentLoan, ['loan_type', 'loanType'], 'Loan Product')}</strong><br />Total Due: <strong>{formatKes(currentLoanBalance)}</strong></p>
                    <div className="input-group" style={{ marginBottom: '15px' }}>
                      <label>Enter Amount To Pay (KES)</label>
                      <input 
                        type="text"
                        inputMode="numeric"
                        placeholder="Enter Amount" 
                        value={formatCurrencyInput(repaymentAmount)}
                        onChange={(e) => setRepaymentAmount(digitsOnly(e.target.value))}
                      />
                    </div>
                    <div className="repayment-impact-panel">
                      <div>
                        <span>Payment Amount</span>
                        <strong>{formatKes(Number.isFinite(partialPaymentValue) ? partialPaymentValue : 0)}</strong>
                      </div>
                      <div>
                        <span>Remaining Balance</span>
                        <strong>{formatKes(remainingAfterPartial)}</strong>
                      </div>
                    </div>
                    {!isPartialPaymentValid && repaymentAmount && (
                      <div className="loan-status-error">Enter an amount above KES 0 and not more than your outstanding balance.</div>
                    )}
                    <button 
                      className="pay-now-action-btn" 
                      style={{ width: '100%', backgroundColor: '#eba22d' }} 
                      onClick={(e) => handleMpesaPaymentSubmit(e, 'partial')}
                      disabled={paymentLoading || !isPartialPaymentValid}
                    >
                      {paymentLoading ? <LoadingSpinner label="Processing..." /> : 'PAY'}
                    </button>
                  </div>
                </div>
              )}

              {currentView === 'transactions' && (
                <TransactionHistory userId={userProfile.id} />
              )}

              {currentView === 'settings' && (
                <div className="view-fade-in action-panel-card" style={{ maxWidth: '500px', margin: '0 auto' }}>
                  <h2>Preferences ⚙</h2>
                  <p><strong>Change Password if needed and also Update your profile information from here </strong></p>

                  {settingsMode === 'home' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
                      <button className="auth-submit-btn" onClick={() => { setCurrentPassword(''); setPassword(''); setConfirmPassword(''); navigateToView('settings', { settingsMode: 'password' }); }}>
                        Change Password
                      </button>
                      <button className="auth-submit-btn" onClick={() => {
                        const names = userProfile.name.split(' ');
                        setFirstName(names[0] || '');
                        setLastName(names.slice(1).join(' ') || '');
                        setEmail(userProfile.email);
                        setPhone(userProfile.phone);
                        navigateToView('settings', { settingsMode: 'profile' });
                      }}>
                        Update Profile
                      </button>
                    </div>
                  )}

                  {settingsMode === 'password' && (
                    <form onSubmit={handlePasswordUpdate} className="auth-form">
                      <div className="input-group">
                        <label>Current Password</label>
                        <div className="password-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <input
                            type={showCurrentPassword ? "text" : "password"}
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            placeholder="Enter current password"
                            style={{ width: '100%', paddingRight: '40px' }}
                            required
                          />
                          <span
                            className="password-toggle-eye"
                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                            style={{ position: 'absolute', right: '12px', cursor: 'pointer', userSelect: 'none', fontSize: '20px', color: '#f49e2f', display: 'flex', alignItems: 'center' }}
                          >
                            {showCurrentPassword ? <ion-icon name="eye-off-outline"></ion-icon> : <ion-icon name="eye-outline"></ion-icon>}
                          </span>
                        </div>
                      </div>
                      <div className="input-group">
                        <label>New Password</label>
                        <div className="password-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <input 
                            type={showPassword ? "text" : "password"} 
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)} 
                            placeholder="Minimum 8 characters" 
                            style={{ width: '100%', paddingRight: '40px' }}
                            required 
                          />
                          <span 
                            className="password-toggle-eye" 
                            onClick={() => setShowPassword(!showPassword)}
                            style={{ position: 'absolute', right: '12px', cursor: 'pointer', userSelect: 'none', fontSize: '20px', color: '#f49e2f', display: 'flex', alignItems: 'center' }}
                          >
                            {showPassword ? <ion-icon name="eye-off-outline"></ion-icon> : <ion-icon name="eye-outline"></ion-icon>}
                          </span>
                        </div>
                      </div>
                      <div className="input-group">
                        <label>Confirm New Password</label>
                        <div className="password-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <input 
                            type={showConfirmPassword ? "text" : "password"} 
                            value={confirmPassword} 
                            onChange={(e) => setConfirmPassword(e.target.value)} 
                            placeholder="Confirm password" 
                            style={{ width: '100%', paddingRight: '40px' }}
                            required 
                          />
                          <span 
                            className="password-toggle-eye" 
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            style={{ position: 'absolute', right: '12px', cursor: 'pointer', userSelect: 'none', fontSize: '20px', color: '#f49e2f', display: 'flex', alignItems: 'center' }}
                          >
                            {showConfirmPassword ? <ion-icon name="eye-off-outline"></ion-icon> : <ion-icon name="eye-outline"></ion-icon>}
                          </span>
                        </div>
                      </div>
                      <div className="form-action-buttons">
                        <button type="button" className="auth-submit-btn cancel-btn" onClick={goBackOneStep}>Cancel</button>
                        <button type="submit" className="auth-submit-btn">Update Password</button>
                      </div>
                    </form>
                  )}

                  {settingsMode === 'profile' && (
                    <form onSubmit={handleProfileUpdate} className="auth-form">
                      <div className="input-group">
                        <label>First Name</label>
                        <input type="text" value={firstName} onChange={(e) => setFirstName(sanitizeNameInput(e.target.value))} required pattern="[A-Za-z]+(?:[ '-][A-Za-z]+)*" title="Use letters only. Spaces, hyphens, and apostrophes are allowed." maxLength="40" />
                      </div>
                      <div className="input-group">
                        <label>Last Name</label>
                        <input type="text" value={lastName} onChange={(e) => setLastName(sanitizeNameInput(e.target.value))} required pattern="[A-Za-z]+(?:[ '-][A-Za-z]+)*" title="Use letters only. Spaces, hyphens, and apostrophes are allowed." maxLength="40" />
                      </div>
                      <div className="input-group">
                        <label>Email</label>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                      </div>
                      <div className="input-group">
                        <label>Phone Number</label>
                        <input type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(digitsOnly(e.target.value))} required />
                      </div>
                      <div className="form-action-buttons">
                        <button type="button" className="auth-submit-btn cancel-btn" onClick={goBackOneStep}>Cancel</button>
                        <button type="submit" className="auth-submit-btn">Save Changes</button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {currentView === 'admin' && isAdminUser && (
                <AdminView
                  onUserVerified={handleUserVerified}
                  onLoanReviewed={handleLoanReviewed}
                  onAdminCountsChange={handleAdminCountsChange}
                  localUsers={localUsers}
                  initialTab={adminInitialTab}
                />
              )}
            </main>
          </div>
        )}
      </div>
      <footer className="app-footer"><p>&copy; 2026 Loan Institution. All rights reserved.</p></footer>
    </div>
  );
}






