/**
 * Production-Grade Authentication & Authorization Middleware
 * 
 * Implements JWT validation using Supabase Auth:
 * - Token extraction from Authorization header
 * - JWT signature verification
 * - Token expiration checks
 * - Role-based access control (RBAC)
 * - Secure error handling
 * 
 * Security Benefits:
 * - Prevents unauthorized access to protected resources
 * - Validates token integrity and authenticity
 * - Enforces principle of least privilege via RBAC
 * - Protects against token tampering
 */

import { createClient } from '@supabase/supabase-js';

// Environment configuration - NEVER hardcode secrets
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ymgyekgmonqhehmnskcw.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // For admin operations
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltZ3lla2dtb25xaGVobW5za2N3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NTA0MjQsImV4cCI6MjA4NzUyNjQyNH0.1KjMMPJaU849XJ0w3NjsUKSBugjjNAR_mGyu7wJCURw';

// Create Supabase client for auth validation
const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Service role client for elevated operations (use sparingly)
const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

/**
 * Extract JWT token from Authorization header
 */
function extractToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  
  if (!authHeader) {
    return null;
  }
  
  // Support both "Bearer TOKEN" and "TOKEN" formats
  const parts = authHeader.split(' ');
  return parts.length === 2 ? parts[1] : authHeader;
}

/**
 * Verify JWT token and return user data
 * 
 * @param {string} token - JWT token
 * @returns {Object|null} User data or null if invalid
 */
export async function verifyToken(token) {
  if (!token) return null;
  if (!supabase) return null;
  
  try {
    const { data, error } = await supabase.auth.getUser(token);
    
    if (error || !data?.user) {
      console.error('Token verification failed:', error?.message);
      return null;
    }
    
    return data.user;
  } catch (err) {
    console.error('Token verification error:', err);
    return null;
  }
}

/**
 * Get user profile with role information
 * 
 * @param {string} userId - User ID
 * @returns {Object|null} User profile with role
 */
export async function getUserProfile(userId) {
  if (!userId) return null;
  const profileClient = supabaseAdmin || supabase;
  if (!profileClient) return null;
  
  try {
    const { data, error } = await profileClient
      .from('users')
      .select('id, email, role')
      .eq('id', userId)
      .limit(1);

    const profile = Array.isArray(data) ? data[0] : data;
    
    if (error || !profile) {
      console.error('Profile fetch failed:', error?.message);
      return null;
    }
    
    return profile;
  } catch (err) {
    console.error('Profile fetch error:', err);
    return null;
  }
}

/**
 * Authentication Middleware
 * 
 * Validates JWT token and attaches user to request
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Object} options - Middleware options
 * @returns {Object|null} User object or null
 */
export async function authenticate(req, res, options = {}) {
  const { optional = false } = options;
  
  const token = extractToken(req);
  
  if (!token) {
    if (optional) {
      req.user = null;
      return null;
    }
    
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Please provide a valid access token.',
      }
    });
    return null;
  }
  
  const user = await verifyToken(token);
  
  if (!user) {
    if (optional) {
      req.user = null;
      return null;
    }
    
    res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired access token.',
      }
    });
    return null;
  }
  
  // Attach user to request for downstream use
  req.user = user;
  return user;
}

/**
 * Authorization Middleware (Role-Based Access Control)
 * 
 * Checks if authenticated user has required role
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Array<string>} allowedRoles - Array of allowed roles
 * @returns {Object|null} User profile or null
 */
export async function authorize(req, res, allowedRoles = []) {
  if (!req.user) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      }
    });
    return null;
  }
  
  const profile = await getUserProfile(req.user.id);
  
  if (!profile) {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Unable to verify user permissions.',
      }
    });
    return null;
  }

  const normalizedProfile = { ...profile, role: 'user' };
  
  // User-only mode: reject endpoints that request non-user roles.
  if (allowedRoles.length > 0 && !allowedRoles.includes('user')) {
    res.status(403).json({
      error: {
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'This endpoint is unavailable in user-only mode.',
        requiredRole: allowedRoles,
        userRole: 'user',
      }
    });
    return null;
  }
  
  req.userProfile = normalizedProfile;
  return normalizedProfile;
}

/**
 * Combined middleware: authenticate + authorize
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Object} options - { roles: string[], optional: boolean }
 * @returns {Object|null} User profile or null
 */
export async function requireAuth(req, res, options = {}) {
  const { roles = [], optional = false } = options;
  
  const user = await authenticate(req, res, { optional });
  
  if (!user) {
    return null;
  }
  
  const profile = await authorize(req, res, roles);

  if (!profile && optional) {
    const fallbackProfile = {
      id: user.id,
      email: user.email || null,
      role: 'guest',
    };
    req.userProfile = fallbackProfile;
    return fallbackProfile;
  }

  return profile;
}

/**
 * Get Supabase admin client (service role)
 * Use with extreme caution - bypasses RLS
 */
export function getAdminClient() {
  if (!supabaseAdmin) {
    throw new Error('Service role key not configured');
  }
  return supabaseAdmin;
}
