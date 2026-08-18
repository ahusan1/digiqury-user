/**
 * EXAMPLE: Public API Endpoint with Basic Security
 * 
 * This demonstrates a public endpoint that:
 * - Allows anonymous access
 * - Still enforces rate limiting (IP-based)
 * - Implements CORS for public routes
 * 
 * Use for public-facing APIs like product listings, search, etc.
 */

const { publicCorsMiddleware } = require('../_middleware/cors.js');
const { rateLimiterMiddleware } = require('../_middleware/rateLimiter.js');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

module.exports = async function handler(req, res) {
  try {
    /**
     * STEP 1: CORS Protection
     */
    const corsAllowed = publicCorsMiddleware(req, res);
    if (!corsAllowed) {
      return;
    }

    /**
     * STEP 2: Rate Limiting (IP-based)
     */
    const rateLimitPassed = await rateLimiterMiddleware(req, res);
    if (!rateLimitPassed) {
      return;
    }

    /**
     * STEP 3: Business Logic
     * Example: Fetch public products
     */
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_enabled', true)
      .limit(20);

    if (error) {
      return res.status(500).json({
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to fetch products.',
        }
      });
    }

    res.status(200).json({
      success: true,
      data: data,
    });

  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An error occurred while processing your request.',
      }
    });
  }
};
