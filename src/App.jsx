import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

function AuthView({ 
  authMode, setAuthMode, email, setEmail, phone, setPhone, 
  firstName, setFirstName, lastName, setLastName,
  password, setPassword, confirmPassword, setConfirmPassword, 
  handleLoginSubmit, handleSignUpSubmit, handleForgotPasswordSubmit 
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
      const BASE_URL = process.env?.REACT_APP_API_BASE_URL || 'https://loan-app-backend-vg4d.onrender.com';
      const response = await axios.post(`${BASE_URL}/api/verify-otp`, { email: cleanEmail, otp: fullOtp });
      if (response.status === 200) {
        setForgotStep(3);
      }
    } catch (error) {
      alert(error.response?.data?.message || 'Invalid or expired OTP code.');
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
      const BASE_URL = process.env?.REACT_APP_API_BASE_URL || 'https://loan-app-backend-vg4d.onrender.com';
      const response = await axios.post(`${BASE_URL}/api/reset-password`, { email: cleanEmail, newPassword: password });
      if (response.status === 200) {
        alert("Password updated successfully!");
        setForgotStep(1);
        setOtpArray(['', '', '', '']);
        setPassword('');
        setConfirmPassword('');
        setAuthMode('login');
      }
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to sync new credentials.');
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
            <p className="auth-subtitle">4 OTP code sent to email then page...</p>
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
                  <span 
                    onClick={() => { setTimer(60); handleForgotPasswordSubmit(normalizeEmail(email)); }} 
                    style={{ color: '#f49e2f', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Resend Code?
                  </span>
                )}
              </div>

              <button type="submit" className="auth-submit-btn" disabled={isSubmitting}>
                {isSubmitting ? 'Verifying...' : 'Successful'}
              </button>
            </form>
          </>
        )}

        {forgotStep === 3 && (
          <>
            <p className="auth-subtitle">Create your new profile credentials password layout.</p>
            <form onSubmit={onNewPasswordSubmit} className="auth-form">
              <div className="input-group">
                <label>New Password (-8 characters)</label>
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
        <form onSubmit={(e) => { e.preventDefault(); handleLoginSubmit(); }} className="auth-form">
          <div className="input-group">
            <label>Email: </label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="enter your email" required />
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
              
              <span onClick={() => setAuthMode('forgot')} className="auth-link" style={{ fontSize: '13px', cursor: 'pointer', marginLeft: 'auto' }}>
                Forgot Password?
              </span>
            </div>
          </div>
          
          <button type="submit" className="auth-submit-btn">Login</button>
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
          <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" required />
        </div>
        <div className="input-group">
          <label>Last Name</label>
          <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" required />
        </div>
        <div className="input-group">
          <label>Email Address</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="enter your email" required />
        </div>
        <div className="input-group">
          <label>Phone Number</label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="enter phone number" required />
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
        
        <button type="submit" className="auth-submit-btn">Sign-Up</button>
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
  const BASE_URL = process.env?.REACT_APP_API_BASE_URL || 'https://loan-app-backend-vg4d.onrender.com';

  useEffect(() => {
    if (!userId) return;
    fetch(`${BASE_URL}/api/transactions/${userId}`)
      .then(res => res.json())
      .then(data => { setTransactions(data.transactions || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId, BASE_URL]);

  return (
    <div className="view-fade-in">
      <h2>Transaction History</h2>
      {loading ? (
        <p style={{ color: 'whitesmoke' }}>Loading...</p>
      ) : transactions.length === 0 ? (
        <p style={{ color: 'whitesmoke' }}>No transactions found.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', color: 'white', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#1a3a5c' }}>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Amount (KES)</th>
                <th style={thStyle}>Mode</th>
                <th style={thStyle}>Receipt/Account</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid #1e3a55' }}>
                  <td style={tdStyle}>{new Date(t.date_applied).toLocaleDateString()}</td>
                  <td style={tdStyle}>{t.loan_type}</td>
                  <td style={{ ...tdStyle, color: t.amount < 0 ? '#2ecc71' : '#e74c3c' }}>
                    {t.amount < 0 ? '-' : '+'} KES {Math.abs(Number(t.amount)).toLocaleString()}
                  </td>
                  <td style={tdStyle}>{t.payment_mode}</td>
                  <td style={tdStyle}>{t.account_number || '-'}</td>
                  <td style={tdStyle}>
                    <span style={{ 
                      padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold',
                      background: t.status === 'Disbursed' ? '#1a5c2a' : '#5c1a1a',
                      color: t.status === 'Disbursed' ? '#2ecc71' : '#e74c3c'
                    }}>{t.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thStyle = { padding: '10px', textAlign: 'left', color: '#f49e2f' };
const tdStyle = { padding: '10px' };



const th = { padding: '10px', textAlign: 'left', color: '#f49e2f' };
const td = { padding: '10px' };

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

const formatKes = (amount) => {
  const numericAmount = Number(amount);
  const safeAmount = Number.isFinite(numericAmount) ? numericAmount : 0;
  return `KES ${safeAmount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

const formatLoanDate = (dateValue) => {
  if (!dateValue) return 'Not available';

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 'Not available';

  return date.toLocaleDateString();
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

function AdminView() {
  const [secret, setSecret] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [users, setUsers] = useState([]);
  const [loans, setLoans] = useState([]);
  const [activeTab, setActiveTab] = useState('users');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const BASE_URL = process.env?.REACT_APP_API_BASE_URL || 'https://loan-app-backend-vg4d.onrender.com';

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BASE_URL}/api/admin/users`, { headers: { 'x-admin-secret': secret } });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
        setIsAuthenticated(true);
        const loansRes = await fetch(`${BASE_URL}/api/admin/loans`, { headers: { 'x-admin-secret': secret } });
        const loansData = await loansRes.json();
        setLoans(loansData.loans);
      } else {
        setError('Wrong admin password!');
      }
    } catch { setError('Cannot connect to server.'); }
    finally { setLoading(false); }
  };

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
        <button type="submit" className="auth-submit-btn" disabled={loading}>{loading ? 'Verifying...' : 'Enter'}</button>
      </form>
    </div>
  );

  return (
    <div style={{ padding: '20px' }}>
      <h2 style={{ color: '#f49e2f' }}>Admin Dashboard</h2>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button className={`auth-submit-btn ${activeTab === 'users' ? '' : 'cancel-btn'}`} onClick={() => setActiveTab('users')}>Users ({users.length})</button>
        <button className={`auth-submit-btn ${activeTab === 'loans' ? '' : 'cancel-btn'}`} onClick={() => setActiveTab('loans')}>Loans ({loans.length})</button>
      </div>
      {activeTab === 'users' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', color: 'white', fontSize: '13px' }}>
            <thead><tr style={{ background: '#1a3a5c' }}>
              <th style={th}>ID</th><th style={th}>Name</th><th style={th}>Email</th><th style={th}>Phone</th><th style={th}>Joined</th>
            </tr></thead>
            <tbody>{users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid #1e3a55' }}>
                <td style={td}>{u.id}</td>
                <td style={td}>{u.first_name} {u.last_name}</td>
                <td style={td}>{u.email}</td>
                <td style={td}>{u.phone}</td>
                <td style={td}>{new Date(u.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {activeTab === 'loans' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', color: 'white', fontSize: '13px' }}>
            <thead><tr style={{ background: '#1a3a5c' }}>
              <th style={th}>ID</th><th style={th}>User</th><th style={th}>Email</th><th style={th}>Type</th><th style={th}>Amount</th><th style={th}>Status</th><th style={th}>Date</th>
            </tr></thead>
            <tbody>{loans.map(l => (
              <tr key={l.id} style={{ borderBottom: '1px solid #1e3a55' }}>
                <td style={td}>{l.id}</td>
                <td style={td}>{l.first_name} {l.last_name}</td>
                <td style={td}>{l.email}</td>
                <td style={td}>{l.loan_type}</td>
                <td style={td}>KES {Number(l.amount).toLocaleString()}</td>
                <td style={td}>{l.status}</td>
                <td style={td}>{new Date(l.date_applied).toLocaleDateString()}</td>
              </tr>
            ))}</tbody>
          </table>
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
  
  // Settings sub-view states and toggles
  const [settingsMode, setSettingsMode] = useState('home'); // home, password, profile
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [repayDropdown, setRepayDropdown] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [appliedAmount, setAppliedAmount] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('Mobile'); 
  const [disbursementAccount, setDisbursementAccount] = useState('');
  const [loanBalance, setLoanBalance] = useState(0);
  const [latestLoan, setLatestLoan] = useState(null);
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

  const loanTypes = [
    { id: 1, name: 'Personal Loan', desc: 'Funding for personal expenses and medical needs.', rate: '5.5% p.a.', amounts: [5000, 10000, 15000] },
    { id: 2, name: 'Business Loan', desc: 'Loan for boosting stock and scaling up standard market operations.', rate: '10% p.a.', amounts: [50000, 100000, 150000] },
    { id: 3, name: 'Emergency Loan', desc: 'Instant short-term cash Loans for immediate bill settlement', rate: '4.2% p.a.', amounts: [2500, 5000, 10000] }
  ];

  const triggerAlert = (message, type) => {
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
    }

    setNotification({ message, type });
    notificationTimerRef.current = setTimeout(() => {
      setNotification({ message: '', type: '' });
      notificationTimerRef.current = null;
    }, 4500);
  };

  const refreshLatestLoanStatus = async (userId = userProfile.id) => {
    if (!userId) return;

    setLoanStatusLoading(true);
    setLoanStatusError('');

    try {
      const BASE_URL = process.env?.REACT_APP_API_BASE_URL || 'https://loan-app-backend-vg4d.onrender.com';
      const response = await fetch(`${BASE_URL}/api/transactions/${userId}`);
      const data = await response.json();

      if (response.ok) {
        const records = data.transactions || data.loans || data.loanRecords || [];
        const latestRecord = getLatestLoanRecord(records);
        setLatestLoan((currentLoan) => latestRecord || currentLoan);
      } else {
        setLoanStatusError(data.message || 'Unable to load loan status right now.');
      }
    } catch (error) {
      setLoanStatusError('Cannot connect to loan status records.');
    } finally {
      setLoanStatusLoading(false);
    }
  };

  const handleMpesaPaymentSubmit = async (e, variant = 'full') => {
    e.preventDefault();
    const paymentAmount = variant === 'partial' ? parseFloat(customAmount) : parseFloat(loanBalance);

    if (!mpesaPhone || mpesaPhone.trim() === '') {
      triggerAlert('Please enter a valid M-Pesa phone number.', 'error-red');
      return;
    }

    if (loanBalance <= 0) {
      triggerAlert('You do not have anoutstanding balance to repay.', 'error-red');
      return;
    }
    if (variant === 'partial' && (!paymentAmount || paymentAmount <= 0 || paymentAmount > loanBalance)) {
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
      const BASE_URL = process.env?.REACT_APP_API_BASE_URL || 'https://loan-app-backend-vg4d.onrender.com';
      const response = await axios.post(`${BASE_URL}/api/mpesa/stkpush`, {
        phoneNumber: formattedPhone, 
        amount: paymentAmount,
        accountReference: `LoanRepayment-${userProfile.loanId}`,
        transactionDesc: `Repayment of KES ${paymentAmount.toLocaleString()} for Loan ID ${userProfile.loanId}`
      });
      if (response.status === 200) {
        setPaymentStatus('Check your phone and enter your M-Pesa PIN.');
        setPaymentError(false);
        triggerAlert('STK prompt sent to your phone!', 'success');

        // Poll balance every 5 seconds for 60 seconds
        let attempts = 0;
        const poll = setInterval(async () => {
          attempts++;
          try {
            const BASE_URL = process.env?.REACT_APP_API_BASE_URL || 'https://loan-app-backend-vg4d.onrender.com';
            const balRes = await fetch(`${BASE_URL}/api/balance/${userProfile.id}`);
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
      setPaymentStatus(`❌ ${serverErrorMessage}`);
      triggerAlert('STK Push submission collapsed.', 'logout');
    } finally {
      setPaymentLoading(false);
    }
  };

  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    if (password.length < 8) {
      triggerAlert("Password must be at least 8 characters long.", "error-red");
      return;
    }
    if (password !== confirmPassword) {
      triggerAlert("Passwords do not match!", "error-red");
      return;
    }
    try {
      const BASE_URL = process.env?.REACT_APP_API_BASE_URL || 'https://loan-app-backend-vg4d.onrender.com';
      const response = await axios.post(`${BASE_URL}/api/reset-password`, { email: userProfile.email, newPassword: password });
      if (response.status === 200) {
        triggerAlert("Password updated successfully!", "success");
        setSettingsMode('home');
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
      const cleanEmail = normalizeEmail(email);
      const BASE_URL = process.env?.REACT_APP_API_BASE_URL || 'https://loan-app-backend-vg4d.onrender.com';
      const response = await axios.post(`${BASE_URL}/api/update-profile`, {
        userId: userProfile.id,
        firstName,
        lastName,
        email: cleanEmail,
        phone
      });
      if (response.status === 200) {
        setUserProfile({
          ...userProfile,
          name: `${firstName} ${lastName}`.trim(),
          email: cleanEmail,
          phone: phone
        });
        setEmail(cleanEmail);
        triggerAlert("Profile updated successfully!", "success");
        setSettingsMode('home');
      }
    } catch (error) {
      console.error("Profile Update Error:", error);
      triggerAlert(error.response?.data?.message || "Cannot connect to server.", "error-red"); 
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentView('dashboard_home');
    setAuthMode('login');
    setSettingsMode('home');
    setLoanBalance(0);
    setLatestLoan(null);
    setLoanStatusError('');
    setLoanStatusLoading(false);
    setUserProfile({ id: null, name: "Guest User", email: "", phone: "", loanId: "LNX-PENDING" });
    setIsMenuOpen(false);
    setPaymentStatus('');
    setPaymentError(false);
    triggerAlert('Logged out successfully.', 'logout');
  };

  const handleSignUpSubmit = async () => {
    if (password.length < 8) {
    triggerAlert('Password must be at least 8 characters long!', 'logout');
    return;
  }

  if (password !== confirmPassword) {
    triggerAlert('Passwords do not match!', 'logout');
    return;
  }
    try {
      const cleanEmail = normalizeEmail(email);
      const BASE_URL = process.env?.REACT_APP_API_BASE_URL || 'https://loan-app-backend-vg4d.onrender.com';
      const response = await fetch(`${BASE_URL}/api/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, email: cleanEmail, phone, password })
      });
      const data = await response.json();
      if (response.ok) {
        setIsLoggedIn(true);
        setCurrentView('dashboard_home');
        setLoanBalance(0);
        setLatestLoan(null);
        setLoanStatusError('');
        setUserProfile({
          id: data.userId,
          name: `${firstName} ${lastName}`.trim(),
          email: cleanEmail,
          phone: phone,
          loanId: data.loanId
        });
        triggerAlert('Account synchronized to MySQL!', 'success');
        setFirstName(''); setLastName(''); setEmail(''); setPhone(''); setPassword(''); setConfirmPassword('');
      } else {
        triggerAlert(data.message || 'Signup validation error', 'logout');
      }
    } catch (error) {
      triggerAlert('Cannot bridge connection to backend.', 'logout');
    }
  };

  const handleLoginSubmit = async () => {
    try {
      const cleanEmail = normalizeEmail(email);
      const BASE_URL = process.env?.REACT_APP_API_BASE_URL || 'https://loan-app-backend-vg4d.onrender.com';
      const response = await fetch(`${BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password })
      });
      const data = await response.json();
      if (response.ok) {
        const loginLoan = data.latestLoan || data.loan || (data.loanStatus ? {
          status: data.loanStatus,
          amount: data.loanAmount || data.loanBalance || 0,
          loan_type: data.loanType || 'Loan Account',
          date_applied: data.dateApplied || data.loanDate,
          payment_mode: data.paymentMode,
          account_number: data.accountNumber
        } : null);

        setIsLoggedIn(true);
        setCurrentView('dashboard_home');
        setLoanBalance(data.loanBalance || 0);
        setLatestLoan(loginLoan);
        setLoanStatusError('');
        setUserProfile({
          id: data.userId,
          name: data.name,
          email: data.email,
          phone: data.phone,
          loanId: data.loanId
        });
        refreshLatestLoanStatus(data.userId);
        triggerAlert('Successfully logged in!', 'success');
        setEmail(''); setPassword('');
      } else {
        triggerAlert(data.message || 'Invalid username or password!', 'error-red');
      }
    } catch (error) {
      triggerAlert('Cannot bridge connection to backend.', 'logout');
    }
  };
  const handleForgotPasswordSubmit = async (emailValue = email) => {
    try {
      const cleanEmail = normalizeEmail(emailValue);
      setEmail(cleanEmail);
      const BASE_URL = process.env?.REACT_APP_API_BASE_URL || 'https://loan-app-backend-vg4d.onrender.com';
      const response = await fetch(`${BASE_URL}/api/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail })
      });
      const data = await response.json();
      if (response.ok) {
        triggerAlert(data.message || 'Recovery code generated!', 'success');
        return true;
      } else {
        triggerAlert(data.message || 'Email trace not found in records.', 'error-red');
        return false;
      }
    } catch (error) {
      triggerAlert('Cannot bridge connection to backend.', 'logout');
      return false;
    }
  };

  const handleApplyClick = (loan) => {
    setSelectedLoan(loan);
    setAppliedAmount('');
    setCustomAmount('');
    setDisbursementAccount('');
    setCurrentView('apply_loan_form');
    if (window.innerWidth <= 768) setIsMenuOpen(false);
  };

  const handleMobileNavClick = (viewName) => {
    setCurrentView(viewName);
    if (viewName !== 'settings') setSettingsMode('home');
    if (viewName === 'loan_status') refreshLatestLoanStatus();
    if (window.innerWidth <= 768) setIsMenuOpen(false);
  };

  const handleLoanRequestSubmit = async (e) => {
    e.preventDefault();
    const finalAmount = appliedAmount === 'custom' ? customAmount : appliedAmount;

    if (!finalAmount || finalAmount <= 0) {
      triggerAlert('Please select or enter a valid loan amount.', 'logout');
      return;
    }

    try {
      const BASE_URL = process.env?.REACT_APP_API_BASE_URL || 'https://loan-app-backend-vg4d.onrender.com';
      const response = await fetch(`${BASE_URL}/api/loans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userProfile.id,
          loanType: selectedLoan.name,
          amount: parseFloat(finalAmount),
          paymentMode: paymentMode,
          accountNumber: disbursementAccount
        })
      });

      const data = await response.json();

      if (response.ok) {
        const requestedLoan = data.loan || data.latestLoan || {
          id: data.loanId || data.id || `local-${Date.now()}`,
          loan_type: selectedLoan.name,
          amount: parseFloat(finalAmount),
          status: data.status || data.loanStatus || 'Disbursed',
          date_applied: data.date_applied || data.dateApplied || new Date().toISOString(),
          payment_mode: paymentMode,
          account_number: disbursementAccount
        };

        setLoanBalance(data.newTotalBalance); 
        setLatestLoan(requestedLoan);
        setLoanStatusError('');
        triggerAlert(`Loan request of KES ${Number(finalAmount).toLocaleString()} processed securely!`, 'success');
        setCurrentView('dashboard_home'); 
      } else {
        triggerAlert(data.message || 'Error processing loan request on backend server.', 'logout');
      }
    } catch (error) {
      triggerAlert('Cannot bridge connection to backend.', 'logout');
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
              <button className="header-logout-btn" onClick={handleLogout}>Log Out</button>
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
            />
          </div>
        ) : (
          <div className="portal-frame-container">
            {isMenuOpen && <div className="sidebar-mobile-overlay" onClick={() => setIsMenuOpen(false)}></div>}
            
            <aside className={`sidebar ${isMenuOpen ? 'open' : 'closed'}`}>
              <nav className="nav-links">
                <button className={`nav-item ${currentView === 'dashboard_home' ? 'active' : ''}`} onClick={() => handleMobileNavClick('dashboard_home')}>Dashboard</button>
                <button className={`nav-item ${currentView === 'profile' ? 'active' : ''}`} onClick={() => handleMobileNavClick('profile')}>My Profile</button>
                <button className={`nav-item ${currentView === 'loans' || currentView === 'apply_loan_form' ? 'active' : ''}`} onClick={() => handleMobileNavClick('loans')}>Loans</button>
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
                <button className={`nav-item ${currentView === 'admin' ? 'active' : ''}`} onClick={() => handleMobileNavClick('admin')}>🛡 Admin</button>
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
                    <button className="pay-now-action-btn" onClick={() => { setRepayDropdown(true); setCurrentView('repay_fully'); }}>Pay Now</button>
                  </div>
                </div>
              )}

              {currentView === 'repay_fully' && (
                <div className="view-fade-in action-panel-card">
                  <h2>Full Settlement Portal</h2>
                  <p className="discount" style={{color: 'white', margin: '0 0 15px 0'}}>Clear outstanding loan balances on time to receive account standing discounts.</p>
                  <div className="repay-box-container" style={{ background: '#32bcde', padding: '24px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', display: 'flex', flexDirection: 'column', gap: '16px', boxSizing: 'border-box', width: '100%' }}>
                    <p style={{ color: '#fff', fontSize: '16px', margin: 0, fontWeight: '500' }}>
                      Current Loan Balance Total: <strong>KES {Number(loanBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
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
                        {paymentLoading ? 'PROCESSING PUSH...' : 'PAY VIA M-PESA'}
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
                  <h2>Types of Loans We Offer</h2>
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
                <div className="view-fade-in action-panel-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
                  <h2>Apply for {selectedLoan.name}</h2>
                  <p className="rate" style={{color: '#f3ebec',}}>Interest Rate: <strong>{selectedLoan.rate}</strong></p>
                  
                  <form onSubmit={handleLoanRequestSubmit} className="auth-form">
                    <div className="input-group">
                      <label>Select Loan Amount (KES)</label>
                      <div className="loan-amount-button-group">
                        {selectedLoan.amounts.map((amt) => (
                          <button
                            type="button" key={amt} className="amount-selection-btn"
                            onClick={() => { setAppliedAmount(amt); setCustomAmount(''); }}
                            style={{
                              backgroundColor: appliedAmount === amt ? '#d47a14' : '#0870a3',
                              color: appliedAmount === amt ? '#fff' : '#333'
                            }}
                          >
                            {amt.toLocaleString()}
                          </button>
                        ))}
                        <button
                          type="button" className="amount-selection-btn" onClick={() => setAppliedAmount('custom')}
                          style={{
                            backgroundColor: appliedAmount === 'custom' ? '#dc6606' : '#0e7ab0',
                            color: appliedAmount === 'custom' ? '#ffffff' : '#5d3904', fontWeight: appliedAmount === 'custom' ? '750' : '800'
                          }}
                        >Custom</button>
                      </div>
                    </div>

                    {appliedAmount === 'custom' && (
                      <div className="input-group view-fade-in">
                        <label>Enter Preferable Amount (KES)</label>
                        <input type="number" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} placeholder="Enter custom amount" required />
                      </div>
                    )}

                    <div className="input-group">
                      <label>Mode of Payment</label>
                      <select 
                        value={paymentMode} 
                        onChange={(e) => { setPaymentMode(e.target.value); setDisbursementAccount(''); }}
                        style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', background: '#094a87' }}
                      >
                        <option value="Mobile">Mobile Money</option>
                        <option value="Bank">Bank</option>
                      </select>
                    </div>

                    <div className="input-group">
                      <label>
                        {paymentMode === 'Mobile' ? 'Mobile Number to Receive Funds' : 'Bank Account Number'}
                      </label>
                      <input 
                        type="text" 
                        className="disbursement-account-input" style={{ color: 'white' }}
                        value={disbursementAccount} 
                        onChange={(e) => setDisbursementAccount(e.target.value)} 
                        placeholder={paymentMode === 'Mobile' ? 'enter mobile number' : 'enter account number'} 
                        required 
                      />
                    </div>

                    <div className="form-action-buttons">
                      <button type="button" className="auth-submit-btn cancel-btn" onClick={() => setCurrentView('loans')}>Cancel</button>
                      <button type="submit" className="auth-submit-btn">Request Loan</button>
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

              {currentView === 'repay_partially' && (
                <div className="view-fade-in action-panel-card">
                  <h2>Partial loan Repayment Option</h2>
                  <p className="repay-text" style={{color: 'whitesmoke'}}>Repay your Loan with any amount available, we offer flexible Loan Repayment!</p>
                  <div className="repay-box" style={{ background: '#22aeac', padding: '20px', borderRadius: '8px', border: '1px solid #e1e8ed', marginTop: '15px' }}>
                    <p style={{color: 'white', marginBottom: '10px'}}>Total Due: <strong>KES {Number(loanBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></p>
                    <div className="input-group" style={{ marginBottom: '15px' }}>
                      <label>Enter Amount To Pay (KES)</label>
                      <input 
                        type="number" 
                        placeholder="Enter Amount" 
                        value={customAmount} 
                        onChange={(e) => setCustomAmount(e.target.value)} 
                      />
                    </div>
                    <button 
                      className="pay-now-action-btn" 
                      style={{ width: '100%', backgroundColor: '#eba22d' }} 
                      onClick={(e) => handleMpesaPaymentSubmit(e, 'partial')}
                      disabled={paymentLoading}
                    >
                      {paymentLoading ? 'PROCESSING...' : 'PAY'}
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
                      <button className="auth-submit-btn" onClick={() => { setPassword(''); setConfirmPassword(''); setSettingsMode('password'); }}>
                        Change Password
                      </button>
                      <button className="auth-submit-btn" onClick={() => {
                        const names = userProfile.name.split(' ');
                        setFirstName(names[0] || '');
                        setLastName(names.slice(1).join(' ') || '');
                        setEmail(userProfile.email);
                        setPhone(userProfile.phone);
                        setSettingsMode('profile');
                      }}>
                        Update Profile
                      </button>
                    </div>
                  )}

                  {settingsMode === 'password' && (
                    <form onSubmit={handlePasswordUpdate} className="auth-form">
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
                        <button type="button" className="auth-submit-btn cancel-btn" onClick={() => setSettingsMode('home')}>Cancel</button>
                        <button type="submit" className="auth-submit-btn">Update Password</button>
                      </div>
                    </form>
                  )}

                  {settingsMode === 'profile' && (
                    <form onSubmit={handleProfileUpdate} className="auth-form">
                      <div className="input-group">
                        <label>First Name</label>
                        <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                      </div>
                      <div className="input-group">
                        <label>Last Name</label>
                        <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                      </div>
                      <div className="input-group">
                        <label>Email</label>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                      </div>
                      <div className="input-group">
                        <label>Phone Number</label>
                        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                      </div>
                      <div className="form-action-buttons">
                        <button type="button" className="auth-submit-btn cancel-btn" onClick={() => setSettingsMode('home')}>Cancel</button>
                        <button type="submit" className="auth-submit-btn">Save Changes</button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {currentView === 'admin' && <AdminView />}
            </main>
          </div>
        )}
      </div>
      <footer className="app-footer"><p>&copy; 2026 Loan Institution. All rights reserved.</p></footer>
    </div>
  );
}
