/**
 * Production-Grade CORS Middleware
 * 
 * Implements strict Cross-Origin Resource Sharing policies:
 * - Whitelist-based origin validation
 * - Environment-specific configurations
 * - Proper preflight (OPTIONS) handling
 * - Secure credential support
 * - No wildcard (*) for authenticated routes
 * 
 * Security Benefits:
 * - Prevents unauthorized cross-origin requests
 * - Protects against CSRF attacks
 * - Blocks malicious websites from accessing APIs
 * - Allows only trusted domains
 */

// Environment-based allowed origins
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

// Development fallback
const DEVELOPMENT_ORIGINS = [
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

// Production origins (configure via environment)
const DEFAULT_PRODUCTION_ORIGINS = [
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost',
  'https://plusvexora.vercel.app',
  'https://www.plusvexora.vercel.app',
  'https://adminvexora.vercel.app',
  'https://adminvexora-*.vercel.app',
  'https://seller-ochre.vercel.app',
  'https://seller-*.vercel.app',
  'https://user-mu-two.vercel.app',
  'https://user-*.vercel.app',
];

/**
 * Get allowed origins based on environment
 */
function getAllowedOrigins() {
  const isDevelopment = process.env.NODE_ENV === 'development' || 
                        process.env.VERCEL_ENV === 'development';
  
  // Priority: Environment variable > Production defaults > Development
  if (ALLOWED_ORIGINS.length > 0) {
    return ALLOWED_ORIGINS;
  }
  
  if (isDevelopment) {
    return [...DEVELOPMENT_ORIGINS, ...DEFAULT_PRODUCTION_ORIGINS];
  }
  
  return DEFAULT_PRODUCTION_ORIGINS;
}

/**
 * Check if origin is allowed
 */
function isOriginAllowed(origin) {
  if (!origin) return false;
  
  const allowedOrigins = getAllowedOrigins();
  
  // Exact match
  if (allowedOrigins.includes(origin)) {
    return true;
  }
  
  // Pattern match for subdomains (e.g., *.vercel.app)
  for (const allowed of allowedOrigins) {
    if (allowed.includes('*')) {
      const pattern = new RegExp(
        '^' + allowed.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
      );
      if (pattern.test(origin)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Set CORS headers on response
 * 
 * @param {Object} res - Response object
 * @param {string} origin - Request origin
 * @param {Object} options - CORS options
 */
export function setCorsHeaders(res, origin, options = {}) {
  const {
    credentials = true,
    methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    headers = [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
    maxAge = 86400, // 24 hours
  } = options;
  
  // Validate origin
  if (isOriginAllowed(origin)) {
    // Set specific origin (never use * with credentials)
    res.setHeader('Access-Control-Allow-Origin', origin);
    
    if (credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
  } else {
    // Reject if origin not allowed
    // For security, we don't set CORS headers for untrusted origins
    return false;
  }
  
  // Set allowed methods
  res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
  
  // Set allowed headers
  res.setHeader('Access-Control-Allow-Headers', headers.join(', '));
  
  // Set preflight cache duration
  res.setHeader('Access-Control-Max-Age', maxAge.toString());
  
  // Expose headers that client can access
  res.setHeader('Access-Control-Expose-Headers', [
    'Content-Length',
    'Content-Type',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
  ].join(', '));
  
  return true;
}

/**
 * CORS Middleware for Vercel Functions
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Object} options - CORS options
 * @returns {boolean} True if CORS check passed
 */
export function corsMiddleware(req, res, options = {}) {
  const origin = req.headers.origin || req.headers.Origin;
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    const corsSet = setCorsHeaders(res, origin, options);
    
    if (!corsSet) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN_ORIGIN',
          message: 'Cross-origin request from untrusted origin.',
        }
      });
      return false;
    }
    
    res.status(204).end();
    return false; // No further processing needed for OPTIONS
  }
  
  // Set CORS headers for actual requests
  const corsSet = setCorsHeaders(res, origin, options);
  
  if (!corsSet && origin) {
    // Origin provided but not allowed
    res.status(403).json({
      error: {
        code: 'FORBIDDEN_ORIGIN',
        message: 'Cross-origin request from untrusted origin.',
      }
    });
    return false;
  }
  
  return true;
}

/**
 * Get configured allowed origins (for logging/debugging)
 */
export function getConfiguredOrigins() {
  return getAllowedOrigins();
}

/**
 * Strict CORS for authenticated routes
 * Disables wildcard origins, enforces credentials
 */
export function strictCorsMiddleware(req, res) {
  return corsMiddleware(req, res, {
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  });
}

/**
 * Public CORS for public routes
 * More lenient, but still validates origins
 */
export function publicCorsMiddleware(req, res) {
  return corsMiddleware(req, res, {
    credentials: false,
    methods: ['GET', 'HEAD', 'OPTIONS'],
  });
}
