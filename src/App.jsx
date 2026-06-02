import React, { useState } from 'react';
import './App.css';

function AuthView({ 
  authMode, setAuthMode, email, setEmail, phone, setPhone, 
  firstName, setFirstName, lastName, setLastName,
  password, setPassword, confirmPassword, setConfirmPassword, 
  handleLoginSubmit, handleSignUpSubmit 
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
                style={{ position: 'absolute', right: '12px', cursor: 'pointer', userSelect: 'none', fontSize: '18px' }}
              >
                {showPassword ? '👽' : '👁️'}
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
              style={{ position: 'absolute', right: '12px', cursor: 'pointer', userSelect: 'none', fontSize: '18px' }}
            >
              {showPassword ? '👽' : '👁️'}
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
              style={{ position: 'absolute', right: '12px', cursor: 'pointer', userSelect: 'none', fontSize: '18px' }}
            >
              {showConfirmPassword ? '👽' : '👁️'}
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

export default function App() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [notification, setNotification] = useState({ message: '', type: '' });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard_home');
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

  const [userProfile, setUserProfile] = useState({
    id: null,
    name: "Guest User",
    email: "",
    phone: "",
    loanId: "LNX-PENDING"
  });

  const loanTypes = [
    { id: 1, name: 'Personal Loan', desc: 'Funding for personal expenses and medical needs.', rate: '5.5% p.a.', amounts: [5000, 10000, 25000] },
    { id: 2, name: 'Business Loan', desc: 'Loan for boosting stock and scaling up standard market operations.', rate: '10% p.a.', amounts: [50000, 100000, 250000] },
    { id: 3, name: 'Emergency Loan', desc: 'Instant access short-term cash for immediate settlement matrices.', rate: '4.2% p.a.', amounts: [2000, 5000, 12000] }
  ];

  const triggerAlert = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification({ message: '', type: '' }), 3500);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentView('dashboard_home');
    setAuthMode('login');
    setLoanBalance(0);
    setUserProfile({ id: null, name: "Guest User", email: "", phone: "", loanId: "LNX-PENDING" });
    setIsMenuOpen(false);
    triggerAlert('Logged out successfully.', 'logout');
  };

  const handleSignUpSubmit = async () => {
    if (password !== confirmPassword) {
      triggerAlert('Passwords do not match!', 'logout');
      return;
    }
    try {
      const BASE_URL = process.env?.REACT_APP_API_BASE_URL || 'https://loan-app-backend-vg4d.onrender.com';
      const response = await fetch(`${BASE_URL}/api/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, email, phone, password })
      });
      const data = await response.json();
      if (response.ok) {
        setIsLoggedIn(true);
        setCurrentView('dashboard_home');
        setLoanBalance(0);
        setUserProfile({
          id: data.userId,
          name: `${firstName} ${lastName}`.trim(),
          email: email,
          phone: phone,
          loanId: data.loanId
        });
        triggerAlert('Account synchronized to MySQL!', 'success');
        setFirstName(''); setLastName(''); setEmail(''); setPhone(''); setPassword(''); setConfirmPassword('');
      } else {
        triggerAlert(data.message || 'Signup validation error', 'logout');
      }
    } catch (error) {
      triggerAlert('Cannot bridge connection to Node.js backend.', 'logout');
    }
  };

  const handleLoginSubmit = async () => {
    try {
      const BASE_URL = process.env?.REACT_APP_API_BASE_URL || 'https://loan-app-backend-vg4d.onrender.com';
      const response = await fetch(`${BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      if (response.ok) {
        setIsLoggedIn(true);
        setCurrentView('dashboard_home');
        setLoanBalance(data.loanBalance || 0);
        setUserProfile({
          id: data.userId,
          name: data.name,
          email: data.email,
          phone: data.phone,
          loanId: data.loanId
        });
        triggerAlert('Login authorized via MySQL!', 'success');
        setEmail(''); setPassword('');
      } else {
        triggerAlert(data.message || 'Invalid username or password!', 'error-red');
      }
    } catch (error) {
      triggerAlert('Cannot bridge connection to Node.js backend.', 'logout');
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
        setLoanBalance(data.newTotalBalance); 
        triggerAlert(`Loan request of KES ${Number(finalAmount).toLocaleString()} processed securely!`, 'success');
        setCurrentView('dashboard_home'); 
      } else {
        triggerAlert(data.message || 'Error processing loan request on backend server.', 'logout');
      }
    } catch (error) {
      triggerAlert('Cannot bridge connection to database pipeline engines.', 'logout');
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
          <h1><span className="text-blue">BUSINESS</span> & <span className="text-red">LOAN</span></h1>
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
                <button className={`nav-item ${currentView === 'settings' ? 'active' : ''}`} onClick={() => handleMobileNavClick('settings')}>⚙ Settings</button>
                <button className="nav-item sidebar-logout-btn" onClick={handleLogout}>Logout</button>
              </nav>
            </aside>

            <main className="main-content-window">
              {currentView === 'dashboard_home' && (
                <div className="view-fade-in">
                  <h2 className="welcome-banner" style={{color: '#f49e2f'}}>Welcome Back, <span className="user-highlight">{userProfile.name}</span></h2>
                  <p className="welcome-subtitle">We are delighted to have you back to our better services.</p>
                  
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
                              backgroundColor: appliedAmount === amt ? '#b63e8c' : '#f4f6f7',
                              color: appliedAmount === amt ? '#fff' : '#333'
                            }}
                          >
                            {amt.toLocaleString()}
                          </button>
                        ))}
                        <button
                          type="button" className="amount-selection-btn" onClick={() => setAppliedAmount('custom')}
                          style={{
                            backgroundColor: appliedAmount === 'custom' ? '#3498db' : '#f4f6f7',
                            color: appliedAmount === 'custom' ? '#fff' : '#333'
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
                        style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', background: '#fff' }}
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
                <div className="view-fade-in">
                  <h2>Current Loan Application Status</h2>
                  <div className="status-tracker-card-layout">
                    <div className="status-badge indicator disbursement_in_progress">Disbursed</div>
                    <p style={{ marginTop: '15px', fontWeight: '500', color: '#2c3e50' }}>
                      Status text: <span className="status-highlight-text" style={{ color: '#e67e22', fontWeight: 'bold' }}>Disbursement In Progress</span>
                    </p>
                    <p>Your application verification credentials matched successfully. Settlement engines are active.</p>
                  </div>
                </div>
              )}

              {currentView === 'repay_fully' && (
                <div className="view-fade-in action-panel-card">
                  <h2>Full Settlement Portal</h2>
                  <p className="discount" style={{color: 'white'}}>Clear outstanding loan balance balances on Time so that your loan rates gets Discount.</p>
                  <div className="repay-box" style={{ background: '#32bcde', padding: '20px', borderRadius: '8px', border: '1px solid #edcdcc', marginTop: '15px' }}>
                    <p>Current Loan Balance Total: <strong>KES {Number(loanBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></p>
                    <button className="pay-now-action-btn" style={{ width: '100%' }} onClick={() => triggerAlert(loanBalance > 0 ? 'Processing complete settlement engine connection...' : 'No active balance to settle.', loanBalance > 0 ? 'success' : 'logout')}>PAY</button>
                  </div>
                </div>
              )}

              {currentView === 'repay_partially' && (
                <div className="view-fade-in action-panel-card">
                  <h2>Partial loan Repayment Option</h2>
                  <p className="repay-text" style={{color: 'whitesmoke'}}>Repay your Loan with any amount available, we offer flexible Loan Repayment!</p>
                  <div className="repay-box" style={{ background: '#22aeac', padding: '20px', borderRadius: '8px', border: '1px solid #e1e8ed', marginTop: '15px' }}>
                    <p style={{color: 'white', marginBottom: '10px'}}>Total Due: <strong>KES {Number(loanBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></p>
                    <div className="input-group" style={{ marginBottom: '15px' }}>
                      <label>Enter Amount To Pay (KES)</label>
                      <input type="number" placeholder="Enter Amount" />
                    </div>
                    <button className="pay-now-action-btn" style={{ width: '100%', backgroundColor: '#eba22d' }} onClick={() => triggerAlert('Processing...', 'success')}>PAY</button>
                  </div>
                </div>
              )}

              {currentView === 'settings' && (
                <div className="view-fade-in">
                  <h2>Preferences ⚙</h2>
                  <p>Database Connector State: <strong>MySQL Connection (Port 3307)</strong></p>
                  <button>Change Password</button>
                  <button>Update Profile</button>
                </div>
              )}
            </main>
          </div>
        )}
      </div>
      <footer className="app-footer"><p>&copy; 2026 Loan Institution. All rights reserved.</p></footer>
    </div>
  );
}