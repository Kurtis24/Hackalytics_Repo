/**
 * Supabase client for direct database access from the frontend.
 * This allows the frontend to query the arbitrage_executions table directly
 * without going through the backend API.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables!');
  console.error('Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Fetch arbitrage executions directly from Supabase.
 * @param {number} limit - Maximum number of records to fetch (default 1000)
 * @returns {Promise<Array>} Array of arbitrage execution records
 */
export async function fetchArbitrageExecutions(limit = 1000) {
  try {
    console.log('[Supabase] Fetching arbitrage executions from database...');

    const { data, error } = await supabase
      .from('arbitrage_executions')
      .select('*')
      .limit(limit);

    if (error) {
      console.error('[Supabase] Error fetching data:', error);
      throw new Error(`Supabase error: ${error.message}`);
    }

    console.log('[Supabase] Successfully fetched', data?.length || 0, 'records');
    return data || [];
  } catch (err) {
    console.error('[Supabase] Fetch failed:', err);
    throw err;
  }
}

/**
 * Transform Supabase records into frontend Node format.
 * Converts the flat database structure into the nested format expected by the frontend.
 * @param {Array} records - Supabase records from arbitrage_executions table
 * @returns {Array} Array of nodes in frontend format
 */
export function transformSupabaseRecordsToNodes(records) {
  if (!records || records.length === 0) {
    return [];
  }

  return records.map(record => {
    // Build sportsbooks array from flat structure
    const sportsbooks = [];
    if (record.bookmaker_1 && record.odds_1) {
      sportsbooks.push({
        name: record.bookmaker_1,
        odds: record.odds_1
      });
    }
    if (record.bookmaker_2 && record.odds_2) {
      sportsbooks.push({
        name: record.bookmaker_2,
        odds: record.odds_2
      });
    }

    return {
      category: record.category || '',
      home_team: record.home_team || '',
      away_team: record.away_team || '',
      profit_score: record.profit_score || 0.0,
      risk_score: record.risk_score || 0.0,
      confidence: record.confidence || 0.0,
      volume: record.volume || 0,
      date: record.game_date || '',
      market_type: record.market_type || '',
      sportsbooks: sportsbooks
    };
  });
}
