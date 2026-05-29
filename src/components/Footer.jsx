import React from 'react';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="social-links">
        {/* Facebook */}
        <a href="https://facebook.com" target="_blank" rel="noreferrer" className="social-icon facebook">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c4.56-.93 8-4.96 8-9.8z"/>
          </svg>
        </a>

        {/* X / Twitter */}
        <a href="https://twitter.com" target="_blank" rel="noreferrer" className="social-icon twitter">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
        </a>

        {/* WhatsApp */}
        <a href="https://wa.me/" target="_blank" rel="noreferrer" className="social-icon whatsapp">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.717-1.456L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.623-1.023-5.086-2.885-6.948C16.528 2.015 14.074 1 11.457 1 6.023 1 1.6 5.371 1.597 10.8c-.001 1.702.453 3.361 1.311 4.815L1.916 21.1l5.85-1.514z"/>
          </svg>
        </a>
      </div>
    </footer>
  );
}