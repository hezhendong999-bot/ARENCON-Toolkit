/**
 * ARENCON FRT v2 — Authentication
 * ════════════════════════════════
 * 
 * Supabase email/password auth (@arencon.com only).
 * 
 * Phase 1 will implement:
 *   - restoreSession() → session | null
 *   - signIn(email, password) → session
 *   - signOut()
 *   - getToken() → JWT (auto-refreshed)
 *   - isAdmin() → boolean
 *   - onAuthChange(callback)
 *   - Token auto-refresh before expiry (fixes P1: silent R2 failures)
 */

const SUPABASE_URL = 'https://xsemvinxsyphjiaqgywv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhzZW12aW54c3lwaGppYXFneXd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkzOTY2MDcsImV4cCI6MjA1NDk3MjYwN30.wrVnZMOQlDL93-eomsKXG-JMYnrOzmm7RNNiDdfJl-Y';

let _session = null;

export const Auth = {

  /**
   * Attempt to restore a saved session from localStorage.
   * Returns session object or null.
   */
  async restoreSession() {
    // TODO Phase 1: restore from localStorage, refresh if expired
    console.log('[Auth] restoreSession() — stub');
    return null;
  },

  /**
   * Sign in with email and password.
   */
  async signIn(email, password) {
    // TODO Phase 1
    console.log('[Auth] signIn() — stub');
    return null;
  },

  /**
   * Sign out and clear session.
   */
  async signOut() {
    // TODO Phase 1
    _session = null;
    console.log('[Auth] signOut() — stub');
  },

  /**
   * Get current auth token (JWT).
   * Auto-refreshes if within 5 minutes of expiry.
   */
  async getToken() {
    // TODO Phase 1
    if (_session && _session.access_token) return _session.access_token;
    return null;
  },

  /**
   * Check if current user has admin role.
   */
  isAdmin() {
    // TODO Phase 1: check profiles table role
    return false;
  },

  /**
   * Get current session.
   */
  getSession() {
    return _session;
  }
};
